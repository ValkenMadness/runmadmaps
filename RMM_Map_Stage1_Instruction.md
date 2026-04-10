# RMM MAP — STAGE 1 INSTRUCTION DOCUMENT
# Foundation: GL JS Initialisation, 3D Terrain, Fog, Camera, Token Delivery

**For:** Claude Code
**Date:** 10 April 2026
**Repo:** runmadmaps (github.com/ValkenMadness/runmadmaps)
**Local working directory:** E:\14 - RMM Official\02 - The Website Build\03 - THE OFFICIAL BUILD
**Dev environment:** Windows. PowerShell only. Never Unix/bash syntax.

---

## WHAT THIS STAGE BUILDS

Map Stage 1 establishes the foundation that every subsequent map stage builds on. At the end of this stage, the map page at `/map` will:

- Load a full-viewport Mapbox GL JS map
- Use the RMM custom Mapbox Studio base style
- Display 3D terrain with hillshade and fog
- Open over the Cape Peninsula at the correct starting position and camera pitch
- Fetch the Mapbox token securely via a serverless function — never hardcoded
- Load a style_config object from Supabase with graceful degradation if Supabase is unreachable
- Work in two contexts: full-page (`/map`) and as an embedded panel (for future dashboard use)
- Be fully mobile responsive

Nothing else. No data layers. No markers. No route lines. No popups. Those are Stage 2 and beyond. Stage 1 is the locked foundation.

---

## ARCHITECTURE RULES — READ BEFORE WRITING ANY CODE

These are locked decisions. Do not deviate.

- **Vanilla JavaScript, HTML, CSS only.** No React. No build tools. No npm packages.
- **Mapbox GL JS loaded via CDN.** Not npm. Current version: use `https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js` and the matching CSS.
- **Token delivered via serverless function.** The Mapbox public token is fetched from `/api/config.js` on page load. It is never hardcoded in any HTML, JS, or CSS file.
- **Style URL from environment variable.** `MAPBOX_STYLE_URL` is read server-side in `api/config.js` and returned to the client.
- **3D terrain enabled from initialisation.** Not added later. The `addSource` for `mapbox-dem` and `setTerrain` call happen inside the `map.on('load')` handler immediately.
- **No hardcoded styling in JavaScript.** Camera position, pitch, bearing, fog parameters, and terrain exaggeration all come from the style_config object (Supabase) with hardcoded fallback defaults if Supabase is unreachable.
- **Map is embeddable.** The map module must support being initialised in any container element — full-page div or a dashboard panel div. The container ID is passed as a parameter.
- **Map never imports code from another module.** The map JS file has no imports from other RMM modules.
- **Mapbox token never enters the codebase.** `MAPBOX_PUBLIC_TOKEN` lives in `.env` locally and Vercel environment variables in production. It is returned by the API function — not stored in any file committed to git.
- **Mobile responsive tested.** The map must fill its container correctly on mobile viewports.

---

## ENVIRONMENT VARIABLES

These already exist in `.env` (local) and Vercel (production):

```
MAPBOX_PUBLIC_TOKEN=pk.eyJ1...   (Mapbox public access token)
MAPBOX_STYLE_URL=mapbox://styles/valkenmadness/cmnsvhzns002701qwc1xshumo
SUPABASE_URL=https://lpzppqveekozdvqdduqg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

The map page only needs `MAPBOX_PUBLIC_TOKEN` and `MAPBOX_STYLE_URL` at Stage 1. Supabase vars are already set from the landing page build.

---

## FILES TO CREATE OR MODIFY

### 1. `api/config.js` — NEW FILE
Vercel serverless function. Returns Mapbox token and style URL to the client.

### 2. `pages/map.html` — MODIFY
Currently a placeholder. Replace with the full map page.

### 3. `scripts/map.js` — NEW FILE
All map initialisation logic. No inline scripts in HTML.

### 4. `styles/map.css` — NEW FILE
Map-specific styles. Full-viewport layout, panel embed mode, UI controls.

### 5. `vercel.json` — MODIFY
Confirm `/api/config` route is not blocked. No changes needed if rewrites are already in place, but verify.

---

## DETAILED SPECIFICATION

### `api/config.js`

This serverless function is called by the map on page load. It returns the Mapbox token and style URL. It does not accept any parameters. It does not require authentication at Stage 1 — it returns public configuration only.

```
GET /api/config
Response: {
  "token": "pk.eyJ1...",
  "styleUrl": "mapbox://styles/valkenmadness/cmnsvhzns002701qwc1xshumo"
}
```

Requirements:
- Reads `process.env.MAPBOX_PUBLIC_TOKEN` and `process.env.MAPBOX_STYLE_URL`
- Returns JSON with correct Content-Type header
- Returns 500 with error message if either env var is missing
- CORS header: `Access-Control-Allow-Origin: https://runmadmaps.com` in production. For local dev, also allow `http://localhost:3000`.
- No npm dependencies. Vanilla Node.js only.

### `pages/map.html`

Full map page. Replaces the current placeholder.

Requirements:
- Inherits the site nav and footer from the existing pattern used in other pages
- Has a `<div id="map-container">` that fills the viewport below the nav
- Loads Mapbox GL JS and CSS from CDN
- Loads `map.css` from `/styles/map.css`
- Loads `map.js` from `/scripts/map.js` with `defer`
- No inline JavaScript
- Meta tags: title "Map — Run Mad Maps", description "Explore every named Cape Peninsula peak, trail route, and point of interest on the RMM interactive map."
- Mobile viewport meta tag present

The map container must account for the nav height so it doesn't sit behind the nav. Use CSS to handle this — not JavaScript.

### `scripts/map.js`

All map logic. This is the core file for this stage.

**Step 1 — Fetch config**

On page load, fetch `/api/config`. If the fetch fails or returns an error, show a branded error state in the map container (dark background, RMM logo or text, message: "Map unavailable. Please try again shortly."). Do not expose raw error messages.

**Step 2 — Initialise the map**

Once config is received, initialise `mapboxgl.Map` with:

```javascript
{
  container: 'map-container',  // or passed-in container ID for panel mode
  style: config.styleUrl,
  center: [18.4241, -33.9249],  // Cape Peninsula — Table Mountain
  zoom: 10,
  pitch: 45,
  bearing: 0,
  antialias: true
}
```

The center, zoom, pitch, and bearing values above are the hardcoded fallback defaults. The actual values come from style_config (see Step 4).

**Step 3 — map.on('load') handler**

Inside the load handler, in this exact order:

1. Add the DEM source for 3D terrain:
```javascript
map.addSource('mapbox-dem', {
  type: 'raster-dem',
  url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
  tileSize: 512,
  maxzoom: 14
});
```

2. Set terrain:
```javascript
map.setTerrain({
  source: 'mapbox-dem',
  exaggeration: 1.1  // fallback — overridden by style_config if available
});
```

3. Set fog:
```javascript
map.setFog({
  range: [2, 12],
  color: '#171A14',
  'horizon-blend': 0.08,
  'high-color': '#1e2419',
  'space-color': '#0d0f0b',
  'star-intensity': 0.15
});
```

4. Call the style_config loader (Step 4).

5. Set `window.rmmMapReady = true` — signals to other modules that the map is initialised and ready. This is the only cross-module communication permitted at this stage.

**Step 4 — style_config from Supabase**

After terrain and fog are set, attempt to fetch style configuration from Supabase. This is a public read — no auth required.

Fetch from:
```
GET https://lpzppqveekozdvqdduqg.supabase.co/rest/v1/style_config?select=key,value
Headers:
  apikey: [SUPABASE_ANON_KEY — see note below]
  Content-Type: application/json
```

**Note on Supabase anon key:** The anon key is safe to expose in client-side JS — it is the public key, not the service role key. However, it is not yet in the environment as a client-side variable. For Stage 1, hardcode the Supabase URL in the fetch but use a constant at the top of map.js:

```javascript
const SUPABASE_URL = 'https://lpzppqveekozdvqdduqg.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

V will fill in the anon key value before running. It is found in the Supabase dashboard under Settings → API → `anon` `public` key.

The style_config table does not exist yet in Supabase — it will be created in a later stage. **The fetch must fail gracefully.** If the table doesn't exist or Supabase is unreachable, the map continues with fallback defaults. No errors thrown. No broken state.

Expected style_config keys (for future use — apply if present, ignore if absent):
- `map_center_lng` — override default longitude
- `map_center_lat` — override default latitude
- `map_zoom` — override default zoom
- `map_pitch` — override default pitch
- `map_bearing` — override default bearing
- `terrain_exaggeration` — override 1.1 default

If style_config loads successfully and contains any of these keys, apply them to the map using `map.easeTo()` for camera values and `map.setTerrain()` for exaggeration. Do not snap — ease smoothly.

**Step 5 — Panel embed mode**

The map module must support being embedded in a container other than `map-container`. Expose an initialisation function:

```javascript
window.RMMMap = {
  init: function(containerId) {
    // initialise map in the specified container
    // if containerId is null or undefined, default to 'map-container'
  }
};
```

The map page calls `window.RMMMap.init('map-container')` on load. The dashboard panel will call `window.RMMMap.init('dashboard-map-panel')` when that is built. Same codebase, different container.

**Step 6 — Navigation controls**

Add after map initialises:
```javascript
map.addControl(new mapboxgl.NavigationControl(), 'top-right');
```

Style the control to use brand colours in `map.css` — dark olive background, white icons, sunset orange on active/hover.

**Step 7 — Resize handling**

```javascript
window.addEventListener('resize', function() {
  map.resize();
});
```

Required for panel embed mode to work correctly when the dashboard layout shifts.

### `styles/map.css`

Requirements:

**Full-page mode:**
```css
#map-container {
  position: fixed;
  top: [nav height — measure from existing nav];
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
}
```

The map must fill the full viewport below the nav. No scrollbars. No overflow.

**Panel embed mode:**
```css
.map-panel-embed {
  position: relative;
  width: 100%;
  height: 100%;
}
```

When the map is in a panel, the container handles sizing. The map fills it.

**Mapbox GL controls — brand colours:**
```css
.mapboxgl-ctrl-group {
  background: #171A14;
  border: 1px solid #2a2e24;
}
.mapboxgl-ctrl-group button {
  background: #171A14;
  color: #FFFFFF;
}
.mapboxgl-ctrl-group button:hover {
  background: #1f2219;
}
.mapboxgl-ctrl-zoom-in .mapboxgl-ctrl-icon,
.mapboxgl-ctrl-zoom-out .mapboxgl-ctrl-icon,
.mapboxgl-ctrl-compass .mapboxgl-ctrl-icon {
  filter: invert(1);
}
```

**Error state:**
```css
.map-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: #171A14;
  color: #FFFFFF;
  font-family: 'Space Mono', monospace;
  text-align: center;
  gap: 16px;
}
.map-error-state p {
  color: #6b7560;
  font-size: 14px;
}
```

**Mobile:**
```css
@media (max-width: 768px) {
  #map-container {
    top: [mobile nav height];
  }
  .mapboxgl-ctrl-top-right {
    top: 8px;
    right: 8px;
  }
}
```

---

## SUPABASE — style_config TABLE

This table does not exist yet. Do not create it in this stage. The code must handle its absence gracefully. It will be created in the Supabase setup stage before Stage 3.

---

## WHAT TO TEST BEFORE DECLARING STAGE 1 DONE

1. **Map loads** — navigate to `/map`. Map renders without errors. No console errors.
2. **Token not exposed** — view page source. The Mapbox token (`pk.`) must not appear anywhere in the HTML source. It is only present in the JavaScript runtime after the API call.
3. **3D terrain visible** — hold Ctrl and drag on the map. Table Mountain should lift. The terrain has physical dimension.
4. **Fog renders** — zoom out to zoom 8. The horizon should have the dark atmospheric fog effect.
5. **Correct Peninsula position** — map opens centred on Table Mountain at zoom 10, pitch 45.
6. **style_config failure handled** — temporarily break the Supabase URL in the fetch (change one character). Map must still load and function normally. Restore after test.
7. **Mobile** — open on mobile or use browser dev tools at 375px width. Map fills viewport. Controls are accessible. No overflow.
8. **Panel embed** — temporarily add a `<div id="test-panel" style="width:500px;height:400px;">` to the map page and call `window.RMMMap.init('test-panel')`. Map should initialise inside that div. Remove test div after confirming.
9. **Nav token check** — confirm `/api/config` returns JSON with token and styleUrl. Open it directly in browser at `http://localhost:3000/api/config` (local) or `https://runmadmaps.com/api/config` (production). Should return the config object. Token visible in response is acceptable — it's a public token.
10. **Git commit** — once all tests pass, commit with message: `Map Stage 1 complete — GL JS foundation, 3D terrain, fog, token delivery`

---

## WHAT THIS STAGE DOES NOT INCLUDE

Do not build any of the following — they are future stages:

- GeoJSON sources or data layers (Stage 2)
- Peak markers or route lines (Stage 2)
- Intro animation (Stage 4)
- Popups or hover interactions (Stage 4)
- Any Supabase data reads beyond style_config (Stage 3)
- Admin controls (Stage 7)

---

## NOTES FOR CLAUDE CODE

- Read `CLAUDE.md` in the repo root before starting. It contains the full architecture rules.
- Read `vercel.json` before modifying it — the existing rewrites must be preserved.
- Read `pages/map.html` before modifying — understand what exists before replacing it.
- Read `scripts/main.js` and `styles/main.css` to understand existing patterns before adding new files.
- The nav and footer pattern used in other pages must be replicated exactly in `map.html`.
- Do not install any npm packages. Zero dependencies for the map module.
- The Supabase anon key placeholder `'YOUR_ANON_KEY_HERE'` will be filled in by V. Leave it as a clearly labelled constant at the top of `map.js`.
- PowerShell syntax only for any terminal commands.
