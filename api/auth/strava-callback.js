/**
 * GET /api/auth/strava-callback
 *
 * Handles Strava OAuth callback after user authorizes (or denies).
 *
 * Flow:
 *   1. Strava redirects here with ?code=XXX&scope=YYY&state=ZZZ
 *   2. Exchange code for access_token + refresh_token via Strava token endpoint
 *   3. Upsert athlete record in Supabase (profile + tokens)
 *   4. Generate session token, store in Supabase, set httpOnly cookie
 *   5. Redirect to returnTo page (from state param, default /dashboard)
 *
 * On denial: Strava redirects with ?error=access_denied — redirect to home with message.
 */

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Check for denial ---
  if (req.query.error) {
    return res.writeHead(302, { Location: '/map?auth=denied' }).end();
  }

  // --- Validate required params ---
  const { code, scope } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const returnTo = req.query.state ? decodeURIComponent(req.query.state) : '/dashboard';

  // --- Exchange code for tokens ---
  const clientId = process.env.strava_oauth_client_id;
  const clientSecret = process.env.strava_oauth_client_secret;

  if (!clientId || !clientSecret) {
    console.error('RMM: Strava OAuth credentials not configured');
    return res.status(500).json({ error: 'OAuth not configured' });
  }

  let tokenData;
  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('RMM: Strava token exchange failed:', tokenRes.status, errBody);
      return res.writeHead(302, { Location: '/map?auth=error' }).end();
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error('RMM: Strava token exchange error:', err);
    return res.writeHead(302, { Location: '/map?auth=error' }).end();
  }

  // --- Extract athlete data from Strava response ---
  const athlete = tokenData.athlete || {};
  const now = new Date().toISOString();
  const sessionToken = crypto.randomUUID();

  const athleteRecord = {
    strava_id: athlete.id,
    first_name: athlete.firstname || null,
    last_name: athlete.lastname || null,
    profile_pic: athlete.profile || null,
    city: athlete.city || null,
    country: athlete.country || null,
    sex: athlete.sex || null,
    strava_access_token: tokenData.access_token,
    strava_refresh_token: tokenData.refresh_token,
    strava_token_expires_at: tokenData.expires_at,
    strava_scope: scope || 'read,activity:read',
    session_token: sessionToken,
    last_login: now,
    updated_at: now
  };

  // --- Upsert athlete in Supabase ---
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('RMM: Supabase credentials not configured');
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Upsert: insert if new, update if existing (on strava_id conflict)
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/athletes?on_conflict=strava_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(athleteRecord)
      }
    );

    if (!upsertRes.ok) {
      const errBody = await upsertRes.text();
      console.error('RMM CALLBACK: Supabase upsert HTTP ' + upsertRes.status);
      console.error('RMM CALLBACK: ' + errBody);
      console.error('RMM CALLBACK: URL was ' + supabaseUrl + '/rest/v1/athletes');
      return res.writeHead(302, { Location: '/map?auth=db_error&status=' + upsertRes.status }).end();
    }
  } catch (err) {
    console.error('RMM CALLBACK: Supabase upsert exception: ' + (err.message || err));
    return res.writeHead(302, { Location: '/map?auth=db_error' }).end();
  }

  // --- Set session cookie and redirect ---
  const isProduction = (req.headers['x-forwarded-host'] || req.headers.host || '').includes('runmadmaps.com');
  const cookieFlags = [
    `rmm_session=${sessionToken}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}` // 30 days
  ];

  if (isProduction) {
    cookieFlags.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieFlags.join('; '));
  res.writeHead(302, { Location: returnTo });
  res.end();
};
