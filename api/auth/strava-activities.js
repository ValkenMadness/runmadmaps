/**
 * GET /api/auth/strava-activities
 *
 * Fetches the authenticated athlete's recent activities from Strava.
 * Requires valid session cookie. Auto-refreshes Strava token if needed.
 *
 * Query params:
 *   per_page (optional, default 30, max 100)
 *   page (optional, default 1)
 *   after (optional, unix timestamp — only activities after this time)
 *
 * Response (200):
 *   { activities: [...], count: N }
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
      `${supabaseUrl}/rest/v1/athletes?session_token=eq.${sessionToken}&select=strava_id,strava_access_token,strava_refresh_token,strava_token_expires_at`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    if (!lookupRes.ok) {
      return res.status(500).json({ error: 'Session lookup failed' });
    }

    const rows = await lookupRes.json();
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    athlete = rows[0];
  } catch (err) {
    console.error('RMM: strava-activities session lookup error:', err);
    return res.status(500).json({ error: 'Session lookup failed' });
  }

  // --- Refresh Strava token if expired ---
  let accessToken = athlete.strava_access_token;
  const now = Math.floor(Date.now() / 1000);

  if (athlete.strava_token_expires_at && athlete.strava_token_expires_at < now + 300) {
    try {
      const refreshed = await refreshStravaToken(athlete.strava_refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
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
      }
    } catch (err) {
      console.error('RMM: Token refresh failed in strava-activities:', err);
      // Continue with existing token — might still work
    }
  }

  // --- Parse query params ---
  const perPage = Math.min(parseInt(req.query.per_page) || 30, 100);
  const page = parseInt(req.query.page) || 1;
  const after = req.query.after ? parseInt(req.query.after) : null;

  // --- Fetch activities from Strava ---
  let stravaUrl = `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`;
  if (after) {
    stravaUrl += `&after=${after}`;
  }

  try {
    const stravaRes = await fetch(stravaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!stravaRes.ok) {
      const errBody = await stravaRes.text();
      console.error('RMM: Strava activities fetch failed:', stravaRes.status, errBody);

      if (stravaRes.status === 401) {
        return res.status(401).json({ error: 'Strava token expired. Please re-authenticate.' });
      }
      return res.status(502).json({ error: 'Failed to fetch activities from Strava' });
    }

    const activities = await stravaRes.json();

    // Return only the fields the frontend needs (strip sensitive data)
    const cleaned = activities.map(a => ({
      strava_id: a.id,
      name: a.name,
      type: a.type,
      sport_type: a.sport_type,
      start_date: a.start_date,
      start_date_local: a.start_date_local,
      distance: a.distance,               // metres
      moving_time: a.moving_time,          // seconds
      elapsed_time: a.elapsed_time,        // seconds
      total_elevation_gain: a.total_elevation_gain, // metres
      average_speed: a.average_speed,      // m/s
      max_speed: a.max_speed,              // m/s
      average_heartrate: a.average_heartrate || null,
      max_heartrate: a.max_heartrate || null,
      start_latlng: a.start_latlng || null,
      end_latlng: a.end_latlng || null,
      has_heartrate: a.has_heartrate || false,
      map_summary_polyline: a.map ? a.map.summary_polyline : null
    }));

    return res.status(200).json({
      activities: cleaned,
      count: cleaned.length,
      page: page,
      per_page: perPage
    });

  } catch (err) {
    console.error('RMM: Strava activities error:', err);
    return res.status(500).json({ error: 'Failed to fetch activities' });
  }
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
    console.error('RMM: Strava token refresh failed:', res.status);
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
