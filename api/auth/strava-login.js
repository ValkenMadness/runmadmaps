/**
 * GET /api/auth/strava-login
 *
 * Initiates the Strava OAuth 2.0 flow.
 * Redirects the user to Strava's authorization page.
 *
 * Scopes requested:
 *   - read          → athlete profile (name, city, photo)
 *   - activity:read → activity data (GPS, distance, time, elevation)
 */

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.strava_oauth_client_id;
  if (!clientId) {
    console.error('RMM: strava_oauth_client_id not set');
    return res.status(500).json({ error: 'OAuth not configured' });
  }

  // Build the callback URL from the request origin
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${protocol}://${host}/api/auth/strava-callback`;

  // Optional: capture where to send the user after auth completes
  const returnTo = req.query.return_to || '/dashboard';

  // Strava OAuth authorize URL
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    approval_prompt: 'auto',
    scope: 'read,activity:read',
    state: encodeURIComponent(returnTo)
  });

  const authorizeUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;

  res.writeHead(302, { Location: authorizeUrl });
  res.end();
};
