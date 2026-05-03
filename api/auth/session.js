/**
 * GET /api/auth/session
 *
 * Returns the current authenticated athlete, or 401 if not logged in.
 * Reads the rmm_session cookie and looks up the athlete in Supabase.
 *
 * Also handles token refresh: if the Strava access token has expired,
 * refreshes it transparently and updates Supabase.
 *
 * Response (200):
 *   { athlete: { strava_id, first_name, last_name, profile_pic, city, ... } }
 *
 * Response (401):
 *   { error: 'Not authenticated' }
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Parse session cookie ---
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies.rmm_session;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  // --- Look up athlete by session token ---
  let athlete;
  try {
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/athletes?session_token=eq.${sessionToken}&select=strava_id,first_name,last_name,profile_pic,city,country,sex,strava_access_token,strava_refresh_token,strava_token_expires_at,strava_scope,created_at,last_login`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    if (!lookupRes.ok) {
      console.error('RMM: Session lookup failed:', lookupRes.status);
      return res.status(500).json({ error: 'Session lookup failed' });
    }

    const rows = await lookupRes.json();
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    athlete = rows[0];
  } catch (err) {
    console.error('RMM: Session lookup error:', err);
    return res.status(500).json({ error: 'Session lookup failed' });
  }

  // --- Refresh Strava token if expired ---
  const now = Math.floor(Date.now() / 1000);
  if (athlete.strava_token_expires_at && athlete.strava_token_expires_at < now + 300) {
    try {
      const refreshed = await refreshStravaToken(athlete.strava_refresh_token);
      if (refreshed) {
        // Update tokens in Supabase
        await fetch(
          `${supabaseUrl}/rest/v1/athletes?strava_id=eq.${athlete.strava_id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              strava_access_token: refreshed.access_token,
              strava_refresh_token: refreshed.refresh_token,
              strava_token_expires_at: refreshed.expires_at,
              updated_at: new Date().toISOString()
            })
          }
        );
        athlete.strava_access_token = refreshed.access_token;
        athlete.strava_token_expires_at = refreshed.expires_at;
      }
    } catch (err) {
      console.error('RMM: Token refresh failed:', err);
      // Don't fail the session check — the token might still work for a bit
    }
  }

  // --- Return public athlete data (never expose tokens to the client) ---
  return res.status(200).json({
    athlete: {
      strava_id: athlete.strava_id,
      first_name: athlete.first_name,
      last_name: athlete.last_name,
      profile_pic: athlete.profile_pic,
      city: athlete.city,
      country: athlete.country,
      sex: athlete.sex,
      strava_scope: athlete.strava_scope,
      created_at: athlete.created_at,
      last_login: athlete.last_login
    }
  });
};


/**
 * Refresh a Strava access token using the refresh token.
 */
async function refreshStravaToken(refreshToken) {
  const clientId = process.env.strava_oauth_client_id;
  const clientSecret = process.env.strava_oauth_client_secret;

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('RMM: Strava token refresh failed:', res.status, errBody);
    return null;
  }

  return res.json();
}


/**
 * Parse a cookie header string into a key-value object.
 */
function parseCookies(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });
  return cookies;
}
