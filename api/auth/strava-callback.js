/**
 * GET /api/auth/strava-callback
 *
 * Handles Strava OAuth callback after user authorizes (or denies).
 */

var crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.query.error) {
    return res.writeHead(302, { Location: '/map?auth=denied' }).end();
  }

  var code = req.query.code;
  var scope = req.query.scope;
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  var returnTo = req.query.state ? decodeURIComponent(req.query.state) : '/dashboard';

  var clientId = process.env.strava_oauth_client_id;
  var clientSecret = process.env.strava_oauth_client_secret;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'OAuth not configured' });
  }

  var tokenData;
  try {
    var tokenRes = await fetch('https://www.strava.com/oauth/token', {
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
      return res.writeHead(302, { Location: '/map?auth=error' }).end();
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    return res.writeHead(302, { Location: '/map?auth=error' }).end();
  }

  var athlete = tokenData.athlete || {};
  var now = new Date().toISOString();
  var sessionToken = crypto.randomUUID();

  var athleteRecord = {
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

  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    var upsertRes = await fetch(
      supabaseUrl + '/rest/v1/athletes?on_conflict=strava_id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + supabaseKey,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(athleteRecord)
      }
    );

    if (!upsertRes.ok) {
      var errBody = await upsertRes.text();
      return res.status(200).json({
        debug: true,
        error: 'Supabase upsert failed',
        http_status: upsertRes.status,
        supabase_error: errBody,
        hint: upsertRes.status === 404
          ? 'The athletes table does not exist. Run supabase_athletes_migration.sql in Supabase SQL Editor.'
          : 'Check the supabase_error field for details.'
      });
    }
  } catch (err) {
    return res.status(200).json({
      debug: true,
      error: 'Supabase upsert exception',
      message: err.message || String(err)
    });
  }

  var isProduction = (req.headers['x-forwarded-host'] || req.headers.host || '').includes('runmadmaps.com');
  var cookieParts = [];
  cookieParts.push('rmm_session=' + sessionToken);
  cookieParts.push('Path=/');
  cookieParts.push('HttpOnly');
  cookieParts.push('SameSite=Lax');
  cookieParts.push('Max-Age=2592000');
  if (isProduction) {
    cookieParts.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
  res.writeHead(302, { Location: returnTo });
  res.end();
};
