# RMM INSTRUCTION DOCUMENT — Repository Foundation + Landing Page

**For: Claude Code**
**Produced by: RMM Build Project**
**Date: 07 April 2026**
**Author: V (via Claude.ai)**

---

## OVERVIEW

This document specifies the complete foundation for the Run Mad Maps (RMM) platform repository, plus the first deployable page — a minimal branded landing page with email capture.

This is a fresh start. New repo. Clean structure. Every directory, config file, and convention established here carries forward through the entire platform build.

**What gets built:**
1. New GitHub repository with full directory structure
2. CLAUDE.md with architecture rules (clears Gate G7)
3. .gitignore, .env.example, vercel.json
4. Asset directory structure (clears Gate G6)
5. Landing page (index.html) — logo, tagline, email capture
6. Vercel serverless function for email subscription (/api/subscribe.js)
7. Supabase subscribers table setup instructions
8. Domain connection guide

**Tech constraints:**
- Vanilla JavaScript, HTML, CSS. NOT React.
- Windows environment. PowerShell only. Never Unix/bash.
- VS Code editor.
- Vercel hosting with serverless functions.
- Supabase (PostgreSQL) for data.

---

## PART 1 — REPOSITORY SETUP

### 1.1 Create New Repository

Create a new GitHub repository named `runmadmaps`. Public or private — V's choice. No template. No README auto-generate. We create everything.

### 1.2 Directory Structure

Create this exact structure. Empty directories get a `.gitkeep` file.

```
runmadmaps/
├── api/
│   └── subscribe.js              ← Vercel serverless function
├── public/
│   ├── icons/
│   │   ├── peaks/                ← Peak marker icons (T1–T4)
│   │   ├── caves/
│   │   ├── events/
│   │   ├── pois/
│   │   └── zones/
│   ├── overlays/                 ← GPS-pinned illustrations
│   ├── animations/               ← Sprite sheets
│   ├── data/                     ← GeoJSON files
│   │   └── .gitkeep
│   ├── images/                   ← Site images (logo, OG, etc.)
│   │   └── logo.svg              ← V provides this file
│   └── favicon.ico               ← Generated from logo
├── styles/
│   └── main.css                  ← Global styles
├── scripts/
│   └── main.js                   ← Global JS (minimal for now)
├── pages/                        ← Future pages (about, map, etc.)
│   └── .gitkeep
├── modules/                      ← Future modules (fitness, routes, etc.)
│   └── .gitkeep
├── index.html                    ← Landing page
├── CLAUDE.md                     ← Architecture rules for Claude Code
├── .gitignore
├── .env.example                  ← Variable names only, no values
├── vercel.json                   ← Vercel configuration
├── package.json                  ← Minimal — metadata only for now
└── README.md                     ← Brief project description
```

### 1.3 .gitignore

```gitignore
# Environment
.env
.env.local
.env.production

# Dependencies
node_modules/

# OS
.DS_Store
Thumbs.db
desktop.ini

# IDE
.vscode/
*.swp
*.swo

# Vercel
.vercel/

# Build
dist/
build/
```

### 1.4 .env.example

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Mapbox (not needed yet — future)
MAPBOX_ACCESS_TOKEN=

# Formula values (not needed yet — future)
# All formula weights, benchmark ceilings, and thresholds go here.
# Never in code. Never in comments. Never in variable names.
```

### 1.5 vercel.json

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```

### 1.6 package.json

```json
{
  "name": "runmadmaps",
  "version": "0.1.0",
  "description": "Run Mad Maps — Trail intelligence for the Cape Peninsula",
  "private": true,
  "author": "Valken de Villiers",
  "license": "UNLICENSED"
}
```

### 1.7 README.md

```markdown
# Run Mad Maps

Trail intelligence for the Cape Peninsula.

**Status:** Pre-launch. Landing page live at [runmadmaps.com](https://runmadmaps.com).

Built by Valken de Villiers.
```

---

## PART 2 — CLAUDE.md (Gate G7)

Create `CLAUDE.md` in the repo root with this exact content:

```markdown
# CLAUDE.md — Run Mad Maps Architecture Rules

This file is the in-repo technical reference for any AI or developer working on this codebase.
It must stay in sync with the RMM Master Document.

## Tech Stack

- Frontend: Vanilla JavaScript, HTML, CSS. NOT React.
- Map Engine: Mapbox GL JS (loaded via CDN, custom Mapbox Studio style)
- Backend: Vercel serverless functions (api/ directory)
- Database: Supabase (PostgreSQL)
- Static Data: GeoJSON files in /public/data/
- Hosting: Vercel (auto-deploys on push to main)
- Dev Environment: Windows, PowerShell, VS Code

## Architecture Rules [LOCKED]

1. No React. The live website is vanilla JS. The Formula Lab (separate, local-only) uses React.
2. 3D terrain enabled from Stage 1. Never retrofitted.
3. No hardcoded styling in JavaScript. Styling in CSS, Mapbox expressions, or style_config.
4. GeoJSON = geographic truth. Supabase = operational truth.
5. All state that changes without a code deploy lives in Supabase.
6. Map is embeddable — full-page and panel are config states, one codebase.
7. Map never imports code from another module (Modular Isolation Principle).
8. All cross-module communication through Supabase or defined event callbacks.

## Security Rules [LOCKED]

- NO tokens, keys, or secrets EVER enter the codebase.
- Mapbox token: .env locally, Vercel env vars in production.
- Supabase keys: .env locally, Vercel env vars in production.
- Formula weights and benchmark ceilings: environment variables only.
- .gitignore excludes .env and node_modules at all times.
- Pre-integration security checklist before any new API or payment.

## Icon Naming Convention

[category]-[slug]-s[state].[ext]

Examples: peak-table-mountain-s1.png, peak-lions-head-s3.svg

## Directory Structure

- /api/ — Vercel serverless functions
- /public/icons/ — Marker icons by category
- /public/data/ — GeoJSON files (canonical geographic data)
- /public/images/ — Site images, logo, OG
- /styles/ — CSS files
- /scripts/ — JavaScript files
- /pages/ — HTML pages (about, map, etc.)
- /modules/ — Future platform modules (fitness, routes, readiness, admin)

## Deployment

VS Code → git commit → push to main → Vercel auto-deploys.
Feature branches for risky changes → Vercel preview URL → test → merge.

## Map Build Stages

Stage 1: Foundation (GL JS, 3D terrain, hillshade, fog, camera, style_config)
Stage 2: Static Data Layers (GeoJSON, route lines, T1 markers, zones)
Stage 3: Expression-Driven Styling (T1–T3, tier icons, grade colours, fire zones)
Stage 4: Interaction, Popups, Intro Animation
Stage 5: Animation System
Stage 6: Overlay Illustrations
Stage 7: Admin Interface (separate deployment)

## Engine Build Sequence [Non-Negotiable]

Phase 1: GPS Stream Processor → Phase 2: Route Grading → Phase 3: RPS → Phase 4: Race Readiness
Each system feeds the next. Do not skip phases.
```

---

## PART 3 — SUPABASE SETUP

V will perform these steps manually in the Supabase dashboard before deployment.

### 3.1 Create Supabase Project

1. Go to https://supabase.com and create a new project.
2. Project name: `runmadmaps`
3. Region: Choose closest to Cape Town (eu-west or similar).
4. Note down:
   - Project URL (e.g., https://xxxxx.supabase.co)
   - anon (public) key
   - service_role key (keep secret — never in frontend code)

### 3.2 Create subscribers Table

Run this SQL in the Supabase SQL Editor:

```sql
CREATE TABLE subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  consent BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'landing_page',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- Policy: Only the service role can insert (via serverless function)
-- No public read/write access
CREATE POLICY "Service role can insert subscribers"
  ON subscribers
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can read subscribers"
  ON subscribers
  FOR SELECT
  TO service_role
  USING (true);

-- Index on email for fast duplicate checking
CREATE INDEX idx_subscribers_email ON subscribers (email);
```

### 3.3 Environment Variables

After creating the Supabase project, V adds these to Vercel environment variables:

- `SUPABASE_URL` → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` → Service role key (NOT the anon key — we need insert rights)

And to the local `.env` file (which is gitignored):

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

---

## PART 4 — LANDING PAGE

### 4.1 index.html

The full landing page. V will replace the logo placeholder with the actual logo file.

Brand palette:
- Dark Olive: #171A14
- Papaya Whip: #FFF1D4
- Sunset Orange: #FF4E50
- Terracotta: #C8553D

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Run Mad Maps — Trail Intelligence for the Cape Peninsula</title>
  <meta name="description" content="Trail intelligence for the Cape Peninsula, South Africa. Route grading, fitness scoring, and race readiness — built for these mountains.">

  <!-- Open Graph -->
  <meta property="og:title" content="Run Mad Maps">
  <meta property="og:description" content="Trail intelligence for the Cape Peninsula. Something is coming.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://runmadmaps.com">
  <meta property="og:image" content="https://runmadmaps.com/public/images/og-image.png">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Run Mad Maps">
  <meta name="twitter:description" content="Trail intelligence for the Cape Peninsula. Something is coming.">
  <meta name="twitter:image" content="https://runmadmaps.com/public/images/og-image.png">

  <!-- Favicon -->
  <link rel="icon" type="image/x-icon" href="/public/favicon.ico">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="/styles/main.css">
</head>
<body>
  <main class="landing">
    <div class="content">
      <div class="logo-area">
        <!-- V: Replace this with your actual logo -->
        <!-- If SVG: paste the <svg> markup directly here -->
        <!-- If PNG: use <img src="/public/images/logo.png" alt="Run Mad Maps" class="logo-img"> -->
        <img src="/public/images/logo.svg" alt="Run Mad Maps" class="logo-img">
        <h1 class="brand-name">Run Mad Maps</h1>
      </div>

      <p class="tagline">Trail intelligence for the Cape Peninsula.<br>Something is coming.</p>

      <div class="form-area" id="formArea">
        <div class="form-row" id="formRow">
          <input
            type="email"
            id="emailInput"
            placeholder="your email"
            autocomplete="email"
            aria-label="Email address"
          >
          <button type="button" id="submitBtn">Join</button>
        </div>
        <div class="consent" id="consentRow">
          <input type="checkbox" id="consentCheckbox">
          <label for="consentCheckbox">I agree to receive emails from Run Mad Maps. Unsubscribe anytime. POPIA compliant.</label>
        </div>
        <p class="error-msg" id="errorMsg"></p>
        <p class="success-msg" id="successMsg">You're in. Watch this space.</p>
      </div>
    </div>

    <footer class="footer-line">
      Cape Town, South Africa &middot; 2026
    </footer>
  </main>

  <script src="/scripts/main.js"></script>
</body>
</html>
```

### 4.2 styles/main.css

```css
/* ==========================================================================
   RUN MAD MAPS — Global Styles
   ========================================================================== */

/* --- Palette --- */
:root {
  --dark-olive: #171A14;
  --papaya: #FFF1D4;
  --sunset: #FF4E50;
  --terracotta: #C8553D;
  --muted-olive: #6B6B5E;
  --warm-grey: #2A2D26;
}

/* --- Reset --- */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* --- Base --- */
html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: 'Space Mono', monospace;
  background: var(--papaya);
  color: var(--dark-olive);
  min-height: 100vh;
}

/* ==========================================================================
   Landing Page
   ========================================================================== */

.landing {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  position: relative;
  border: 6px solid var(--dark-olive);
}

.landing::before {
  content: '';
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(23, 26, 20, 0.12);
  pointer-events: none;
}

/* --- Content --- */
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 420px;
  width: 100%;
}

/* --- Logo --- */
.logo-area {
  margin-bottom: 2.5rem;
  text-align: center;
  opacity: 0;
  animation: fadeIn 0.6s 0.2s forwards;
}

.logo-img {
  width: 80px;
  height: 80px;
  margin: 0 auto 1rem;
  display: block;
  object-fit: contain;
}

.brand-name {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--dark-olive);
}

/* --- Tagline --- */
.tagline {
  font-size: 12px;
  color: var(--muted-olive);
  letter-spacing: 1.5px;
  text-align: center;
  margin-bottom: 3rem;
  line-height: 1.6;
  opacity: 0;
  animation: fadeIn 0.6s 0.5s forwards;
}

/* --- Form --- */
.form-area {
  width: 100%;
  opacity: 0;
  animation: fadeIn 0.6s 0.8s forwards;
}

.form-row {
  display: flex;
  width: 100%;
  margin-bottom: 0.75rem;
}

.form-row input[type="email"] {
  flex: 1;
  background: rgba(23, 26, 20, 0.04);
  border: 1.5px solid var(--dark-olive);
  border-right: none;
  border-radius: 3px 0 0 3px;
  padding: 13px 14px;
  color: var(--dark-olive);
  font-family: 'Space Mono', monospace;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.form-row input[type="email"]:focus {
  border-color: var(--sunset);
}

.form-row input[type="email"]::placeholder {
  color: var(--muted-olive);
  opacity: 0.6;
}

.form-row button {
  background: var(--dark-olive);
  color: var(--papaya);
  border: 1.5px solid var(--dark-olive);
  border-radius: 0 3px 3px 0;
  padding: 13px 22px;
  font-family: 'Space Mono', monospace;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  white-space: nowrap;
}

.form-row button:hover {
  background: var(--sunset);
  border-color: var(--sunset);
}

.form-row button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* --- Consent --- */
.consent {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 0.25rem;
}

.consent input[type="checkbox"] {
  margin-top: 2px;
  accent-color: var(--dark-olive);
  flex-shrink: 0;
}

.consent label {
  font-size: 10px;
  color: var(--muted-olive);
  line-height: 1.5;
  letter-spacing: 0.3px;
}

/* --- Messages --- */
.error-msg {
  display: none;
  font-size: 12px;
  color: var(--sunset);
  margin-top: 0.75rem;
  text-align: center;
}

.error-msg.visible {
  display: block;
}

.success-msg {
  display: none;
  font-size: 13px;
  color: var(--dark-olive);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-align: center;
}

.success-msg.visible {
  display: block;
}

/* --- Footer --- */
.footer-line {
  position: absolute;
  bottom: 1.5rem;
  font-size: 10px;
  color: var(--muted-olive);
  letter-spacing: 1px;
  opacity: 0;
  animation: fadeIn 0.6s 1.1s forwards;
}

/* --- Animation --- */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ==========================================================================
   Responsive
   ========================================================================== */

@media (max-width: 480px) {
  .landing {
    padding: 1.5rem 1rem;
    border-width: 4px;
  }

  .brand-name {
    font-size: 18px;
    letter-spacing: 2px;
  }

  .form-row button {
    padding: 13px 16px;
    font-size: 11px;
  }
}
```

### 4.3 scripts/main.js

```javascript
/* ==========================================================================
   RUN MAD MAPS — Main Script
   ========================================================================== */

(function () {
  'use strict';

  // --- DOM ---
  var emailInput = document.getElementById('emailInput');
  var submitBtn = document.getElementById('submitBtn');
  var consentCheckbox = document.getElementById('consentCheckbox');
  var formRow = document.getElementById('formRow');
  var consentRow = document.getElementById('consentRow');
  var errorMsg = document.getElementById('errorMsg');
  var successMsg = document.getElementById('successMsg');

  // --- Email validation ---
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // --- Show error ---
  function showError(message) {
    errorMsg.textContent = message;
    errorMsg.classList.add('visible');
    setTimeout(function () {
      errorMsg.classList.remove('visible');
    }, 4000);
  }

  // --- Show success ---
  function showSuccess() {
    formRow.style.display = 'none';
    consentRow.style.display = 'none';
    errorMsg.classList.remove('visible');
    successMsg.classList.add('visible');
  }

  // --- Submit handler ---
  async function handleSubmit() {
    var email = emailInput.value.trim();
    var consent = consentCheckbox.checked;

    // Validate
    if (!email) {
      emailInput.focus();
      showError('Enter your email.');
      return;
    }

    if (!isValidEmail(email)) {
      emailInput.focus();
      showError('That doesn\'t look like an email.');
      return;
    }

    if (!consent) {
      showError('Please tick the consent box.');
      return;
    }

    // Disable button
    submitBtn.textContent = '...';
    submitBtn.disabled = true;

    try {
      var response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, consent: consent })
      });

      var data = await response.json();

      if (response.ok) {
        showSuccess();
      } else if (response.status === 409) {
        showSuccess(); // Already subscribed — don't reveal this to user, just show success
      } else {
        showError(data.error || 'Something went wrong. Try again.');
        submitBtn.textContent = 'Join';
        submitBtn.disabled = false;
      }
    } catch (err) {
      showError('Connection failed. Try again.');
      submitBtn.textContent = 'Join';
      submitBtn.disabled = false;
    }
  }

  // --- Event listeners ---
  submitBtn.addEventListener('click', handleSubmit);

  emailInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  });
})();
```

### 4.4 api/subscribe.js (Vercel Serverless Function)

```javascript
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
  if (!body || !body.email || !body.consent) {
    return res.status(400).json({ error: 'Email and consent required.' });
  }

  var email = body.email.trim().toLowerCase();

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  // Consent must be true
  if (body.consent !== true) {
    return res.status(400).json({ error: 'Consent required.' });
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
        consent: true,
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
```

---

## PART 5 — DOMAIN CONNECTION

### 5.1 Vercel Project Setup

1. In Vercel dashboard, import the `runmadmaps` GitHub repository.
2. Framework Preset: "Other" (not Next.js, not anything else).
3. Root Directory: `./` (repo root).
4. Build Command: leave empty (no build step — vanilla HTML/CSS/JS).
5. Output Directory: leave empty (Vercel serves from root).

### 5.2 Environment Variables in Vercel

In Vercel project → Settings → Environment Variables, add:

| Name | Value | Environment |
|------|-------|-------------|
| SUPABASE_URL | (from Supabase dashboard) | Production, Preview |
| SUPABASE_SERVICE_ROLE_KEY | (from Supabase dashboard) | Production, Preview |

### 5.3 Connect runmadmaps.com

In Vercel project → Settings → Domains:

1. Add `runmadmaps.com`
2. Add `www.runmadmaps.com` (redirect to apex)

At domain registrar DNS settings:
- A record: `@` → `76.76.21.21`
- CNAME record: `www` → `cname.vercel-dns.com`

### 5.4 Connect runmadmaps.co.za (redirect)

In Vercel project → Settings → Domains:

1. Add `runmadmaps.co.za`
2. Configure as redirect to `runmadmaps.com`

At domain registrar DNS settings:
- A record: `@` → `76.76.21.21`
- CNAME record: `www` → `cname.vercel-dns.com`

### 5.5 SSL

Vercel provisions SSL certificates automatically. No action needed.

---

## PART 6 — DEPLOYMENT CHECKLIST

Before first deploy, confirm:

- [ ] GitHub repo created with all directories and files
- [ ] .env is in .gitignore (verify — check twice)
- [ ] CLAUDE.md is in repo root
- [ ] Logo file placed at /public/images/logo.svg (or .png)
- [ ] Supabase project created
- [ ] subscribers table created with RLS policies
- [ ] Vercel project imported from GitHub
- [ ] Environment variables set in Vercel (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- [ ] Domain DNS configured for runmadmaps.com
- [ ] Domain DNS configured for runmadmaps.co.za

Deploy:
1. `git add .`
2. `git commit -m "Foundation: repo structure, landing page, email capture"`
3. `git push origin main`
4. Vercel auto-deploys.
5. Check https://runmadmaps.com — page should load.
6. Test email capture — enter email, check Supabase table.

---

## PART 7 — WHAT'S NOT IN THIS DOCUMENT

This document does NOT include:
- OG image creation (V will create this from brand assets)
- Favicon generation (V generates from logo — use https://favicon.io or similar)
- The ValkenMadness font (mentioned in brand guide — V handles font files)
- Any map functionality (Stage 1+)
- Any formula logic (separate project)

---

## PART 8 — GATES CLEARED

After this build:
- **G6 — Asset directory structure: DONE**
- **G7 — CLAUDE.md created: DONE**
- **G4 — Supabase project created: PARTIAL** (project created, subscribers table built; full schema with features/athletes/etc. is a future task)

---

## NOTES FOR CLAUDE CODE

- This is a Windows environment. Use PowerShell syntax if suggesting any terminal commands.
- The serverless function uses the Supabase REST API directly — no Supabase JS SDK installed. This keeps dependencies at zero.
- The CORS header on the API function is set to runmadmaps.com. During development on localhost, you may need to temporarily adjust this or use the Vercel preview URL.
- All CSS is in one file for now (main.css). As pages are added, we may split into page-specific files but the global palette and reset always come from main.css.
- Do NOT install any npm packages unless explicitly instructed. Zero dependencies is the target for the landing page.
