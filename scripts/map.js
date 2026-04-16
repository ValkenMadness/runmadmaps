/* ============================================
   RUN MAD MAPS — Map Module
   GL JS Foundation, 3D Terrain, Fog, Token Delivery,
   Trail Layers, Peak + Cave Markers (T1–T3)
   ============================================ */

// Supabase public config (anon key is safe to expose client-side)
const SUPABASE_URL = 'https://lpzppqveekozdvqdduqg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZVySCQwBHfooIiMMQa3Otg_OxPPMDE8'; // Fill in from Supabase → Settings → API → anon public key

// Fallback defaults — used if style_config is unreachable
const DEFAULTS = {
    center: [18.4241, -33.9249],
    zoom: 10,
    pitch: 45,
    bearing: 0,
    terrainExaggeration: 1.5
};

// Trail layer styling — centralised for future admin/style_config control
var TRAIL_STYLES = {
    path: {
        color: '#3a3428',
        dasharray: [4, 3],
        width: { z10: 0.25, z13: 0.5, z16: 1.0 },
        opacity: { z10: 0.5, z13: 0.7, z16: 0.9 },
        minzoom: null
    },
    footway: {
        color: '#8a7e60',
        dasharray: null,
        width: { z13: 0.15, z16: 0.5 },
        opacity: 0.5,
        minzoom: 13
    },
    steps: {
        color: '#8a7e60',
        dasharray: [1, 2],
        width: { z14: 0.15, z17: 0.5 },
        opacity: 0.4,
        minzoom: 14
    },
    track: {
        color: '#5a5240',
        dasharray: null,
        width: { z10: 0.6, z13: 1.2, z16: 2.4 },
        opacity: { z10: 0.3, z13: 0.5, z16: 0.7 },
        minzoom: null
    }
};

// Contour layer styling — centralised for future admin/style_config control
var CONTOUR_STYLES = {
    majorColor: '#a89b70',
    minorColor: '#c4b990',
    majorWidth:   { z12: 0.3, z13: 0.4, z16: 0.6 },
    minorWidth:   { z12: 0,   z13: 0.3, z16: 0.5 },
    majorOpacity: { z12: 0.2, z13: 0.25, z16: 0.3 },
    minorOpacity: { z12: 0,   z13: 0.25, z16: 0.4 },
    minzoom: 12
};

// Marker config — all GeoJSON point feature categories
// To add a new bespoke marker: add an entry to the relevant category's `bespoke` object only.
// No layer code changes required.
var MARKER_STYLES = {
    peaks: {
        source: 'peaks',
        icons: {
            t1: { file: '/public/icons/peaks/t1-peak-generic.svg', size: 24, mapId: 'peak-t1' },
            t2: { file: '/public/icons/peaks/t2-peak-generic.svg', size: 32, mapId: 'peak-t2' }
        },
        bespoke: {
            "Maclear's Beacon": {
                t3: { file: '/public/icons/peaks/t3-peak-maclears-beacon.svg', size: 48, mapId: 'peak-maclears-beacon-t3' }
            }
        },
        zoomBreaks: { t1: [8, 11], t2: [11, 13], t3: [13, 15] },
        filter: null
    },
    caves: {
        source: 'caves',
        icons: {
            t1: { file: '/public/icons/caves/t1-cave-generic.svg', size: 24, mapId: 'cave-t1' },
            t2: { file: '/public/icons/caves/t2-cave-generic.svg', size: 32, mapId: 'cave-t2' }
        },
        bespoke: {
            'Boomslang Cave North Entrance': {
                t3: { file: '/public/icons/caves/t3-cave-boomslang-cave.svg', size: 48, mapId: 'cave-boomslang-cave-t3' }
            },
            'Boomslang Cave South Entrance': {
                t3: { file: '/public/icons/caves/t3-cave-boomslang-cave.svg', size: 48, mapId: 'cave-boomslang-cave-t3' }
            }
        },
        zoomBreaks: { t1: [8, 11], t2: [11, 13], t3: [13, 15] },
        filter: ['has', 'name']
    }
};

var map = null;

// --- Error state ---
function showMapError(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = [
        '<div class="map-error-state">',
        '    <strong>RUN MAD MAPS</strong>',
        '    <p>Map unavailable. Please try again shortly.</p>',
        '</div>'
    ].join('');
}

// --- SVG icon loader — renders SVG to canvas, adds to map as ImageData ---
function loadSVGAsMapIcon(url, iconId, size) {
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            var imageData = ctx.getImageData(0, 0, size, size);
            map.addImage(iconId, imageData);
            resolve();
        };
        img.onerror = reject;
        img.src = url;
    });
}

// --- Load all marker icons from MARKER_STYLES (generic + bespoke, deduplicated) ---
function loadAllMarkerIcons() {
    var promises = [];
    var loaded = {};  // track mapIds already queued — multiple features can share one icon file

    Object.keys(MARKER_STYLES).forEach(function(category) {
        var cat = MARKER_STYLES[category];

        // Generic icons (t1, t2)
        Object.keys(cat.icons).forEach(function(state) {
            var icon = cat.icons[state];
            if (!loaded[icon.mapId]) {
                loaded[icon.mapId] = true;
                promises.push(
                    loadSVGAsMapIcon(icon.file, icon.mapId, icon.size)
                        .catch(function() { console.warn('RMM: Failed to load icon', icon.mapId); })
                );
            }
        });

        // Bespoke icons (t3)
        Object.keys(cat.bespoke).forEach(function(featureName) {
            var states = cat.bespoke[featureName];
            Object.keys(states).forEach(function(state) {
                var icon = states[state];
                if (!loaded[icon.mapId]) {
                    loaded[icon.mapId] = true;
                    promises.push(
                        loadSVGAsMapIcon(icon.file, icon.mapId, icon.size)
                            .catch(function() { console.warn('RMM: Failed to load icon', icon.mapId); })
                    );
                }
            });
        });
    });

    return Promise.all(promises);
}

// --- Build T3 match expression for icon-image from MARKER_STYLES bespoke config ---
// Updating MARKER_STYLES.bespoke is the only change needed to add a new bespoke marker.
function buildT3ImageMatch(category, fallbackId) {
    var bespoke = MARKER_STYLES[category].bespoke;
    var names = Object.keys(bespoke).filter(function(n) { return bespoke[n].t3; });
    if (names.length === 0) return fallbackId;
    var expr = ['match', ['get', 'name']];
    names.forEach(function(n) { expr.push(n, bespoke[n].t3.mapId); });
    expr.push(fallbackId);
    return expr;
}

// --- Build T3 match expression for icon-size from MARKER_STYLES bespoke config ---
function buildT3SizeMatch(category, fallbackSize) {
    var bespoke = MARKER_STYLES[category].bespoke;
    var names = Object.keys(bespoke).filter(function(n) { return bespoke[n].t3; });
    if (names.length === 0) return fallbackSize;
    var expr = ['match', ['get', 'name']];
    names.forEach(function(n) { expr.push(n, 1); });
    expr.push(fallbackSize);
    return expr;
}

// --- style_config loader ---
function loadStyleConfig() {
    if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_ANON_KEY_HERE') {
        return; // No key set — skip gracefully
    }

    fetch(SUPABASE_URL + '/rest/v1/style_config?select=key,value', {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        }
    })
    .then(function(res) {
        if (!res.ok) return null;
        return res.json();
    })
    .then(function(rows) {
        if (!rows || !Array.isArray(rows) || rows.length === 0) return;

        var config = {};
        rows.forEach(function(row) {
            config[row.key] = row.value;
        });

        var cameraUpdate = {};
        var hasCameraUpdate = false;

        if (config.map_center_lng && config.map_center_lat) {
            cameraUpdate.center = [
                parseFloat(config.map_center_lng),
                parseFloat(config.map_center_lat)
            ];
            hasCameraUpdate = true;
        }
        if (config.map_zoom) {
            cameraUpdate.zoom = parseFloat(config.map_zoom);
            hasCameraUpdate = true;
        }
        if (config.map_pitch) {
            cameraUpdate.pitch = parseFloat(config.map_pitch);
            hasCameraUpdate = true;
        }
        if (config.map_bearing) {
            cameraUpdate.bearing = parseFloat(config.map_bearing);
            hasCameraUpdate = true;
        }

        if (hasCameraUpdate) {
            cameraUpdate.duration = 1500;
            cameraUpdate.essential = true;
            map.easeTo(cameraUpdate);
        }

        if (config.terrain_exaggeration) {
            map.setTerrain({
                source: 'mapbox-dem',
                exaggeration: parseFloat(config.terrain_exaggeration)
            });
        }
    })
    .catch(function() {
        // Supabase unreachable — continue with defaults, no error thrown
    });
}

// --- Peak marker layers (T1, T2, T3) ---
function addPeakLayers() {
    var cat = MARKER_STYLES.peaks;

    // T1 — icon only, zoom 8–11
    map.addLayer({
        id: 'rmm-peaks-t1',
        type: 'symbol',
        source: cat.source,
        minzoom: cat.zoomBreaks.t1[0],
        maxzoom: cat.zoomBreaks.t1[1],
        layout: {
            'icon-image': cat.icons.t1.mapId,
            'icon-size': 1,
            'icon-allow-overlap': true,
            'icon-ignore-placement': false,
            'symbol-sort-key': ['case', ['has', 'ele'], ['-', ['get', 'ele']], 0]
        }
    });

    // T2 — icon + label, zoom 11–13
    map.addLayer({
        id: 'rmm-peaks-t2',
        type: 'symbol',
        source: cat.source,
        minzoom: cat.zoomBreaks.t2[0],
        maxzoom: cat.zoomBreaks.t2[1],
        layout: {
            'icon-image': cat.icons.t2.mapId,
            'icon-size': 1,
            'icon-allow-overlap': true,
            'icon-ignore-placement': false,
            'text-field': [
                'case',
                ['has', 'ele'],
                ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'ele']], 'm'],
                ['get', 'name']
            ],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 11,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-max-width': 8,
            'text-optional': true,
            'symbol-sort-key': ['case', ['has', 'ele'], ['-', ['get', 'ele']], 0]
        },
        paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': '#171A14',
            'text-halo-width': 2
        }
    });

    // T3 — bespoke illustrated icons, zoom 13–15
    // Peaks with a bespoke entry show their custom icon; all others fall back to T2 generic
    map.addLayer({
        id: 'peaks-t3',
        type: 'symbol',
        source: cat.source,
        minzoom: cat.zoomBreaks.t3[0],
        maxzoom: cat.zoomBreaks.t3[1],
        layout: {
            'icon-image': buildT3ImageMatch('peaks', cat.icons.t2.mapId),
            'icon-size': buildT3SizeMatch('peaks', 0.75),
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.8],
            'text-size': 12,
            'text-anchor': 'top',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
        },
        paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': '#171A14',
            'text-halo-width': 2
        }
    });
}

// --- Cave marker layers (T1, T2, T3) ---
function addCaveLayers() {
    var cat = MARKER_STYLES.caves;

    // T1 — icon only, zoom 8–11 (named caves only)
    map.addLayer({
        id: 'caves-t1',
        type: 'symbol',
        source: cat.source,
        minzoom: cat.zoomBreaks.t1[0],
        maxzoom: cat.zoomBreaks.t1[1],
        filter: cat.filter,
        layout: {
            'icon-image': cat.icons.t1.mapId,
            'icon-size': 0.75,
            'icon-allow-overlap': false
        }
    });

    // T2 — icon + label, zoom 11–13
    map.addLayer({
        id: 'caves-t2',
        type: 'symbol',
        source: cat.source,
        minzoom: cat.zoomBreaks.t2[0],
        maxzoom: cat.zoomBreaks.t2[1],
        filter: cat.filter,
        layout: {
            'icon-image': cat.icons.t2.mapId,
            'icon-size': 0.85,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.5],
            'text-size': 11,
            'text-anchor': 'top',
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular']
        },
        paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': '#171A14',
            'text-halo-width': 2
        }
    });

    // T3 — bespoke illustrated icons, zoom 13–15
    // Boomslang Cave entrances show bespoke icon; all others fall back to T2 generic
    map.addLayer({
        id: 'caves-t3',
        type: 'symbol',
        source: cat.source,
        minzoom: cat.zoomBreaks.t3[0],
        maxzoom: cat.zoomBreaks.t3[1],
        filter: cat.filter,
        layout: {
            'icon-image': buildT3ImageMatch('caves', cat.icons.t2.mapId),
            'icon-size': buildT3SizeMatch('caves', 0.75),
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.8],
            'text-size': 12,
            'text-anchor': 'top',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
        },
        paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': '#171A14',
            'text-halo-width': 2
        }
    });
}

// --- Data layers (Stage 2) ---
function addDataLayers(config) {
    // Contour source
    if (config.contoursTilesetId) {
        map.addSource('rmm-contours', {
            type: 'vector',
            url: 'mapbox://' + config.contoursTilesetId
        });

        // Single contour layer — data-driven styling for 100m (major) vs 20m (minor)
        map.addLayer({
            id: 'rmm-contours',
            type: 'line',
            source: 'rmm-contours',
            'source-layer': '10m_Contours-57qbiw',
            minzoom: CONTOUR_STYLES.minzoom,
            filter: ['==', ['%', ['get', 'ELEV'], 20], 0],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': [
                    'case',
                    ['==', ['%', ['get', 'ELEV'], 100], 0],
                    CONTOUR_STYLES.majorColor,
                    CONTOUR_STYLES.minorColor
                ],
                'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    12, ['case', ['==', ['%', ['get', 'ELEV'], 100], 0], CONTOUR_STYLES.majorWidth.z12, CONTOUR_STYLES.minorWidth.z12],
                    13, ['case', ['==', ['%', ['get', 'ELEV'], 100], 0], CONTOUR_STYLES.majorWidth.z13, CONTOUR_STYLES.minorWidth.z13],
                    16, ['case', ['==', ['%', ['get', 'ELEV'], 100], 0], CONTOUR_STYLES.majorWidth.z16, CONTOUR_STYLES.minorWidth.z16]
                ],
                'line-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    12, ['case', ['==', ['%', ['get', 'ELEV'], 100], 0], CONTOUR_STYLES.majorOpacity.z12, CONTOUR_STYLES.minorOpacity.z12],
                    13, ['case', ['==', ['%', ['get', 'ELEV'], 100], 0], CONTOUR_STYLES.majorOpacity.z13, CONTOUR_STYLES.minorOpacity.z13],
                    16, ['case', ['==', ['%', ['get', 'ELEV'], 100], 0], CONTOUR_STYLES.majorOpacity.z16, CONTOUR_STYLES.minorOpacity.z16]
                ]
            }
        });
    }

    // Trail tileset source
    if (config.trailsTilesetId) {
        map.addSource('rmm-trails', {
            type: 'vector',
            url: 'mapbox://' + config.trailsTilesetId
        });
    }

    // GeoJSON sources
    map.addSource('peaks', {
        type: 'geojson',
        data: '/public/data/peaks.geojson'
    });
    map.addSource('caves', {
        type: 'geojson',
        data: '/public/data/caves.geojson'
    });

    // Trail layers — ordered bottom to top
    if (config.trailsTilesetId) {
        // Footways
        var footwayPaint = {
            'line-color': TRAIL_STYLES.footway.color,
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                13, TRAIL_STYLES.footway.width.z13,
                16, TRAIL_STYLES.footway.width.z16
            ],
            'line-opacity': TRAIL_STYLES.footway.opacity
        };
        if (TRAIL_STYLES.footway.dasharray) {
            footwayPaint['line-dasharray'] = TRAIL_STYLES.footway.dasharray;
        }
        map.addLayer({
            id: 'rmm-trails-footway',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'footway'],
            minzoom: TRAIL_STYLES.footway.minzoom,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: footwayPaint
        });

        // Steps
        var stepsPaint = {
            'line-color': TRAIL_STYLES.steps.color,
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                14, TRAIL_STYLES.steps.width.z14,
                17, TRAIL_STYLES.steps.width.z17
            ],
            'line-opacity': TRAIL_STYLES.steps.opacity
        };
        if (TRAIL_STYLES.steps.dasharray) {
            stepsPaint['line-dasharray'] = TRAIL_STYLES.steps.dasharray;
        }
        var stepsLayer = {
            id: 'rmm-trails-steps',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'steps'],
            layout: { 'line-join': 'round', 'line-cap': 'butt' },
            paint: stepsPaint
        };
        if (TRAIL_STYLES.steps.minzoom) { stepsLayer.minzoom = TRAIL_STYLES.steps.minzoom; }
        map.addLayer(stepsLayer);

        // Tracks (jeep roads — solid)
        var trackPaint = {
            'line-color': TRAIL_STYLES.track.color,
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                10, TRAIL_STYLES.track.width.z10,
                13, TRAIL_STYLES.track.width.z13,
                16, TRAIL_STYLES.track.width.z16
            ],
            'line-opacity': [
                'interpolate', ['linear'], ['zoom'],
                10, TRAIL_STYLES.track.opacity.z10,
                13, TRAIL_STYLES.track.opacity.z13,
                16, TRAIL_STYLES.track.opacity.z16
            ]
        };
        if (TRAIL_STYLES.track.dasharray) {
            trackPaint['line-dasharray'] = TRAIL_STYLES.track.dasharray;
        }
        map.addLayer({
            id: 'rmm-trails-track',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'track'],
            layout: { 'line-join': 'round', 'line-cap': 'butt' },
            paint: trackPaint
        });

        // Paths (hiking/running — dashed, most prominent)
        var pathPaint = {
            'line-color': TRAIL_STYLES.path.color,
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                10, TRAIL_STYLES.path.width.z10,
                13, TRAIL_STYLES.path.width.z13,
                16, TRAIL_STYLES.path.width.z16
            ],
            'line-opacity': [
                'interpolate', ['linear'], ['zoom'],
                10, TRAIL_STYLES.path.opacity.z10,
                13, TRAIL_STYLES.path.opacity.z13,
                16, TRAIL_STYLES.path.opacity.z16
            ]
        };
        if (TRAIL_STYLES.path.dasharray) {
            pathPaint['line-dasharray'] = TRAIL_STYLES.path.dasharray;
        }
        map.addLayer({
            id: 'rmm-trails-path',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'path'],
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: pathPaint
        });
    }

    // Marker layers — peaks then caves
    addPeakLayers();
    addCaveLayers();
}

// --- Map initialisation ---
function initMap(containerId) {
    var targetId = containerId || 'map-container';

    fetch('/api/config')
        .then(function(res) {
            if (!res.ok) throw new Error('Config fetch failed');
            return res.json();
        })
        .then(function(config) {
            if (!config.token || !config.styleUrl) {
                throw new Error('Invalid config response');
            }

            mapboxgl.accessToken = config.token;

            map = new mapboxgl.Map({
                container: targetId,
                style: config.styleUrl,
                center: DEFAULTS.center,
                zoom: DEFAULTS.zoom,
                pitch: DEFAULTS.pitch,
                bearing: DEFAULTS.bearing,
                antialias: true
            });

            // Navigation controls
            map.addControl(new mapboxgl.NavigationControl(), 'top-right');

            // Resize handler — required for panel embed mode
            window.addEventListener('resize', function() {
                map.resize();
            });

            // Load handler — fog, icons, data layers, style_config
            // Note: mapbox-dem source and terrain are defined in the Mapbox Studio style JSON
            map.on('load', async function() {
                // 1. Fog
                map.setFog({
                    range: [2, 12],
                    color: '#171A14',
                    'horizon-blend': 0.08,
                    'high-color': '#1e2419',
                    'space-color': '#0d0f0b',
                    'star-intensity': 0.15
                });

                // 2. Load all marker icons (SVG → canvas → ImageData), then add all data layers
                await loadAllMarkerIcons();
                addDataLayers(config);

                // 3. Load style_config from Supabase (fails gracefully)
                loadStyleConfig();

                // 4. Signal map is ready
                window.rmmMapReady = true;
            });
        })
        .catch(function() {
            showMapError(targetId);
        });
}

// --- Email Overlay ---

function initEmailOverlay() {
    // Suppress if already subscribed
    if (localStorage.getItem('rmm_subscribed') === 'true') return;

    var backdrop = document.createElement('div');
    backdrop.className = 'rmm-overlay-backdrop';
    backdrop.id = 'rmm-overlay';
    backdrop.innerHTML = [
        '<div class="rmm-overlay-card" role="dialog" aria-modal="true" aria-label="Stay in the loop">',
        '    <p class="rmm-overlay-eyebrow">Early Access</p>',
        '    <h2 class="rmm-overlay-headline">The Peninsula.<br>Every peak. Every trail.</h2>',
        '    <p class="rmm-overlay-body">Get notified when new features drop — route grading, fitness scoring, race readiness. No spam. Unsubscribe any time.</p>',
        '    <div class="rmm-overlay-field">',
        '        <input type="text" id="overlay-name" placeholder="first name" autocomplete="given-name" aria-label="First name">',
        '    </div>',
        '    <div class="rmm-overlay-field">',
        '        <input type="email" id="overlay-email" placeholder="email address" autocomplete="email" aria-label="Email address">',
        '    </div>',
        '    <div class="rmm-overlay-consent">',
        '        <input type="checkbox" id="overlay-consent">',
        '        <label for="overlay-consent">I agree to receive trail updates and news from Run Mad Maps. Read our <a href="/privacy" target="_blank">Privacy Policy</a>.</label>',
        '    </div>',
        '    <p class="rmm-overlay-error" id="overlay-error"></p>',
        '    <button class="rmm-overlay-submit" id="overlay-submit">Join the List</button>',
        '    <button class="rmm-overlay-dismiss" id="overlay-dismiss">No thanks, just the map</button>',
        '</div>'
    ].join('');

    document.body.appendChild(backdrop);

    document.getElementById('overlay-dismiss').addEventListener('click', dismissOverlay);
    document.getElementById('overlay-submit').addEventListener('click', handleOverlaySubmit);

    // Allow Escape key to dismiss
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') {
            dismissOverlay();
            document.removeEventListener('keydown', onEsc);
        }
    });
}

function dismissOverlay() {
    var backdrop = document.getElementById('rmm-overlay');
    if (backdrop) {
        backdrop.classList.add('hidden');
    }
}

function handleOverlaySubmit() {
    var nameInput = document.getElementById('overlay-name');
    var emailInput = document.getElementById('overlay-email');
    var consentInput = document.getElementById('overlay-consent');
    var errorEl = document.getElementById('overlay-error');
    var submitBtn = document.getElementById('overlay-submit');

    var name = nameInput ? nameInput.value.trim() : '';
    var email = emailInput ? emailInput.value.trim() : '';
    var consent = consentInput ? consentInput.checked : false;

    errorEl.textContent = '';

    if (!name) { errorEl.textContent = 'Please enter your first name.'; return; }
    if (!email) { errorEl.textContent = 'Please enter your email.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = 'Invalid email format.'; return; }
    if (!consent) { errorEl.textContent = 'Please tick the box to continue.'; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Joining...';

    fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, source: 'map-overlay' })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            localStorage.setItem('rmm_subscribed', 'true');
            var card = document.querySelector('.rmm-overlay-card');
            if (card) {
                card.innerHTML = '<p class="rmm-overlay-success">You\'re in. Watch this space.</p>';
            }
            setTimeout(dismissOverlay, 2000);
        } else if (data.error === 'Already subscribed.') {
            localStorage.setItem('rmm_subscribed', 'true');
            dismissOverlay();
        } else {
            errorEl.textContent = data.error || 'Something went wrong. Try again.';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Join the List';
        }
    })
    .catch(function() {
        errorEl.textContent = 'Network error. Try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Join the List';
    });
}

// --- Public API ---
window.RMMMap = {
    init: function(containerId) {
        initMap(containerId || 'map-container');
    }
};

// Auto-init on map page
document.addEventListener('DOMContentLoaded', function() {
    var container = document.getElementById('map-container');
    if (container) {
        window.RMMMap.init('map-container');
        initEmailOverlay();
    }
});
