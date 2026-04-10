/* ==========================================================================
   /api/subscribe — Email capture endpoint
   Writes to Supabase subscribers table.
   ========================================================================== */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', 'https://runmadmaps.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var body = req.body;

  // Validate input
  if (!body || !body.name || !body.name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  if (!body.email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  var name = body.name.trim();
  var email = body.email.trim().toLowerCase();

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  // Environment variables
  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    return res.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    // Insert into Supabase via REST API (no SDK dependency needed)
    var response = await fetch(supabaseUrl + '/rest/v1/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        email: email,
        first_name: name,
        consent_given: true,
        source: 'landing_page'
      })
    });

    if (response.ok) {
      return res.status(200).json({ success: true });
    }

    // Handle duplicate email (Supabase returns 409 for unique constraint)
    if (response.status === 409) {
      return res.status(409).json({ error: 'Already subscribed.' });
    }

    // Other Supabase errors
    var errorText = await response.text();
    console.error('Supabase error:', response.status, errorText);
    return res.status(500).json({ error: 'Failed to subscribe. Try again.' });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Server error. Try again.' });
  }
}
