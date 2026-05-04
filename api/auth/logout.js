/**
 * GET /api/auth/logout
 *
 * Clears the session cookie and (optionally) wipes the session token
 * from Supabase so the token can't be reused.
 * Redirects to /map after logout.
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Parse session cookie ---
  const cookies = parseCookies(req.headers.cookie || '');
  const sessionToken = cookies.rmm_session;

  // --- Invalidate session in Supabase (best-effort) ---
  if (sessionToken) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(
          `${supabaseUrl}/rest/v1/athletes?session_token=eq.${sessionToken}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ session_token: null })
          }
        );
      } catch (err) {
        console.error('RMM: Session invalidation failed:', err);
        // Continue — clearing the cookie is enough for client-side logout
      }
    }
  }

  // --- Clear the cookie and redirect ---
  const isProduction = (req.headers['x-forwarded-host'] || req.headers.host || '').includes('runmadmaps.com');
  const cookieFlags = [
    'rmm_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (isProduction) {
    cookieFlags.push('Secure');
  }

  res.setHeader('Set-Cookie', cookieFlags.join('; '));
  res.writeHead(302, { Location: '/map' });
  res.end();
};


function parseCookies(cookieStr) {
  const cookies = {};
  if (!cookieStr) return cookies;
  cookieStr.split(';').forEach(pair => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  });
  return cookies;
}
