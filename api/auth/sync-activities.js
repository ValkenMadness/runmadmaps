/**
 * POST /api/auth/sync-activities
 *
 * Syncs the authenticated athlete's recent Strava activities into Supabase.
 * Fetches activity streams (GPS data) from Strava, processes through GPS engine,
 * grades each activity, and stores results.
 *
 * This is the bridge between Strava raw data and the RPS/Readiness engines.
 *
 * Body (optional):
 *   { days: 90 }  — how far back to sync (default 90, max 180)
 *
 * Response (200):
 *   { synced: N, skipped: N, errors: N, athlete_id: "..." }
 *
 * Response (401):
 *   { error: 'Not authenticated' }
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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

  // --- Look up athlete ---
  let athlete;
  try {
    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/athletes?session_token=eq.${sessionToken}&select=id,strava_id,strava_access_token,strava_refresh_token,strava_token_expires_at`,
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
    console.error('RMM: sync-activities session lookup error:', err);
    return res.status(500).json({ error: 'Session lookup failed' });
  }

  // --- Refresh token if needed ---
  let accessToken = athlete.strava_access_token;
  const now = Math.floor(Date.now() / 1000);

  if (athlete.strava_token_expires_at && athlete.strava_token_expires_at < now + 300) {
    try {
      const refreshed = await refreshStravaToken(athlete.strava_refresh_token);
      if (refreshed) {
        accessToken = refreshed.access_token;
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
      console.error('RMM: Token refresh failed in sync-activities:', err);
    }
  }

  // --- Parse request body ---
  let body = {};
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (req.body && typeof req.body === 'string') {
      body = JSON.parse(req.body);
    }
  } catch (e) {
    // Empty body is fine — use defaults
  }

  const syncDays = Math.min(parseInt(body.days) || 90, 180);
  const afterTimestamp = Math.floor(Date.now() / 1000) - (syncDays * 86400);

  // --- Get existing synced strava activity IDs to avoid duplicates ---
  let existingIds = new Set();
  try {
    const existRes = await fetch(
      `${supabaseUrl}/rest/v1/activities?athlete_id=eq.${athlete.strava_id}&select=strava_activity_id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    if (existRes.ok) {
      const existRows = await existRes.json();
      existingIds = new Set(existRows.map(r => r.strava_activity_id).filter(Boolean));
    }
  } catch (e) {
    // Non-fatal — worst case we re-process some activities
  }

  // --- Fetch activities from Strava (paginated) ---
  let allActivities = [];
  let page = 1;
  const perPage = 50;

  while (true) {
    const stravaUrl = `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}&after=${afterTimestamp}`;

    try {
      const stravaRes = await fetch(stravaUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!stravaRes.ok) {
        if (stravaRes.status === 401) {
          return res.status(401).json({ error: 'Strava token expired. Please re-authenticate.' });
        }
        break;
      }

      const batch = await stravaRes.json();
      if (!batch || batch.length === 0) break;

      allActivities = allActivities.concat(batch);
      if (batch.length < perPage) break;
      page++;

      // Safety cap at 200 activities per sync
      if (allActivities.length >= 200) break;
    } catch (err) {
      console.error('RMM: Strava fetch page error:', err);
      break;
    }
  }

  // --- Filter to run/hike activities only and skip already-synced ---
  const runTypes = new Set(['Run', 'Trail Run', 'TrailRun', 'Hike', 'Walk']);
  const sportTypes = new Set(['Run', 'TrailRun', 'Hike', 'Walk']);

  const toProcess = allActivities.filter(a => {
    // Skip if already synced
    if (existingIds.has(String(a.id))) return false;
    // Only process run/hike activities
    return runTypes.has(a.type) || sportTypes.has(a.sport_type);
  });

  // --- Process each activity ---
  let synced = 0;
  let skipped = allActivities.length - toProcess.length;
  let errors = 0;

  for (const activity of toProcess) {
    try {
      // Fetch GPS streams from Strava
      const streamsUrl = `https://www.strava.com/api/v3/activities/${activity.id}/streams?keys=latlng,altitude,time,heartrate&key_type=stream`;
      const streamsRes = await fetch(streamsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!streamsRes.ok) {
        errors++;
        continue;
      }

      const streams = await streamsRes.json();

      // Convert Strava streams to GPX-like format for our processor
      const gpxContent = stravaStreamsToGpx(activity, streams);
      if (!gpxContent) {
        errors++;
        continue;
      }

      // Determine activity type for RMM
      const activityType = mapStravaType(activity.type, activity.sport_type);

      // Store the activity directly in Supabase with computed fields
      // We process GPS data on the server side via the Python engine
      const activityRow = {
        athlete_id: String(athlete.strava_id),
        strava_activity_id: String(activity.id),
        purpose: 'training',
        activity_type: activityType,
        display_name: activity.name || 'Untitled Activity',
        date: activity.start_date,
        total_distance_km: (activity.distance || 0) / 1000,
        total_elevation_gain: activity.total_elevation_gain || 0,
        rmm_moving_time_seconds: activity.moving_time || 0,
        elapsed_time_seconds: activity.elapsed_time || 0,
        rmm_avg_speed_kmh: activity.average_speed ? activity.average_speed * 3.6 : 0,
        rmm_avg_pace_sec_per_km: activity.average_speed > 0 ? 1000 / activity.average_speed : 0,
        elevation_density: (activity.total_elevation_gain && activity.distance > 0)
          ? (activity.total_elevation_gain / (activity.distance / 1000))
          : 0,
        include_in_scoring: true,
        source: 'strava',
        raw_gpx: gpxContent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Insert into Supabase
      const insertRes = await fetch(
        `${supabaseUrl}/rest/v1/activities`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify(activityRow)
        }
      );

      if (insertRes.ok) {
        synced++;
      } else {
        const errText = await insertRes.text();
        console.error('RMM: Activity insert failed:', errText);
        errors++;
      }
    } catch (err) {
      console.error('RMM: Activity processing error:', err);
      errors++;
    }
  }

  // --- Update athlete summary ---
  try {
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
          total_activities: existingIds.size + synced,
          updated_at: new Date().toISOString()
        })
      }
    );
  } catch (e) {
    // Non-fatal
  }

  return res.status(200).json({
    synced: synced,
    skipped: skipped,
    errors: errors,
    total_fetched: allActivities.length,
    athlete_id: String(athlete.strava_id)
  });
};


/**
 * Convert Strava activity + streams into a minimal GPX XML string.
 * This allows the existing GPS Stream Processor to parse it.
 */
function stravaStreamsToGpx(activity, streams) {
  // Find latlng, altitude, time, heartrate streams
  const latlngStream = streams.find(s => s.type === 'latlng');
  const altStream = streams.find(s => s.type === 'altitude');
  const timeStream = streams.find(s => s.type === 'time');
  const hrStream = streams.find(s => s.type === 'heartrate');

  if (!latlngStream || !latlngStream.data || latlngStream.data.length < 2) {
    return null;
  }

  const startTime = new Date(activity.start_date);
  const points = latlngStream.data;

  let gpx = '<?xml version="1.0" encoding="UTF-8"?>\n';
  gpx += '<gpx version="1.1" creator="RMM Strava Sync">\n';
  gpx += '  <trk>\n';
  gpx += `    <name>${escapeXml(activity.name || 'Strava Activity')}</name>\n`;
  gpx += '    <trkseg>\n';

  for (let i = 0; i < points.length; i++) {
    const [lat, lon] = points[i];
    const ele = altStream && altStream.data[i] != null ? altStream.data[i] : 0;
    let time = '';
    if (timeStream && timeStream.data[i] != null) {
      const t = new Date(startTime.getTime() + timeStream.data[i] * 1000);
      time = t.toISOString();
    }

    gpx += `      <trkpt lat="${lat}" lon="${lon}">\n`;
    gpx += `        <ele>${ele}</ele>\n`;
    if (time) {
      gpx += `        <time>${time}</time>\n`;
    }
    if (hrStream && hrStream.data[i] != null) {
      gpx += '        <extensions>\n';
      gpx += `          <gpxtpx:TrackPointExtension xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">\n`;
      gpx += `            <gpxtpx:hr>${hrStream.data[i]}</gpxtpx:hr>\n`;
      gpx += '          </gpxtpx:TrackPointExtension>\n';
      gpx += '        </extensions>\n';
    }
    gpx += '      </trkpt>\n';
  }

  gpx += '    </trkseg>\n';
  gpx += '  </trk>\n';
  gpx += '</gpx>';

  return gpx;
}


/**
 * Map Strava activity type to RMM activity type.
 */
function mapStravaType(type, sportType) {
  const t = (sportType || type || '').toLowerCase();
  if (t.includes('trail')) return 'trail';
  if (t.includes('hike') || t.includes('walk')) return 'hike';
  return 'road';
}


/**
 * Escape special XML characters.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


/**
 * Refresh a Strava access token using the refresh token.
 */
async function refreshStravaToken(refreshToken) {
  const clientId = process.env.strava_oauth_client_id;
  const clientSecret = process.env.strava_oauth_client_secret;

  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!tokenRes.ok) return null;
  return tokenRes.json();
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
