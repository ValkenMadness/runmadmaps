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
        iconSwitch: 13,   // zoom where T1 → T2 icon
        filter: null,
        layerId: 'peaks',
        hoverLayerId: 'peaks-t3-hover'
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
        iconSwitch: 13,
        filter: ['has', 'name'],
        layerId: 'caves',
        hoverLayerId: 'caves-t3-hover'
    }
};

// RMM Graded Routes — individual files, combined at runtime into one source
// To add a route: place the GeoJSON in /public/data/routes/ and add the path here.
// To remove a route: delete the file and remove the path from this array.
var RMM_ROUTES = [
    '/public/data/routes/Elsies-Peak-Route-1.geojson',
    '/public/data/routes/Elsies-Peak-Route-2.geojson',
    '/public/data/routes/Elsies-Peak-Route-3.geojson',
    '/public/data/routes/Silvermine-Lower-Route-1.geojson',
    '/public/data/routes/Silvermine-Lower-Route-2.geojson',
    '/public/data/routes/Silvermine-Lower-Route-3.geojson',
    '/public/data/routes/Silvermine-Lower-Route-4.geojson',
    '/public/data/routes/Silvermine-Lower-Route-5.geojson',
];

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

// --- SVG icon loader — fetch → blob URL → canvas → ImageData ---
// Blob URL approach avoids CORS issues that can occur with direct SVG src-to-canvas rendering.
async function loadSVGAsMapIcon(url, iconId, size) {
    var response = await fetch(url);
    if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + url);
    var svgText = await response.text();
    var blob = new Blob([svgText], { type: 'image/svg+xml' });
    var dataUrl = URL.createObjectURL(blob);

    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            if (!map.hasImage(iconId)) {
                map.addImage(iconId, ctx.getImageData(0, 0, size, size));
            }
            URL.revokeObjectURL(dataUrl);
            console.log('RMM: icon loaded —', iconId);
            resolve();
        };
        img.onerror = function(e) {
            console.error('RMM: Failed to load icon', iconId, 'from', url, e);
            URL.revokeObjectURL(dataUrl);
            reject(e);
        };
        img.src = dataUrl;
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

// --- Build match expression for T3 hover layer icon-image ---
// Returns a GL match expression: named bespoke features → their T3 mapId, fallback → '' (no icon).
// Adding a bespoke marker only requires a MARKER_STYLES.bespoke config entry — no layer code changes.
function buildBespokeMatchExpr(category) {
    var bespoke = MARKER_STYLES[category].bespoke;
    var names = Object.keys(bespoke).filter(function(n) { return bespoke[n].t3; });
    if (names.length === 0) return '';
    var expr = ['match', ['get', 'name']];
    names.forEach(function(n) { expr.push(n, bespoke[n].t3.mapId); });
    expr.push('');  // fallback: empty string = no icon rendered
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

// --- Peak marker layers — single layer (full zoom coverage) + T3 hover layer ---
function addPeakLayers() {
    var cat = MARKER_STYLES.peaks;

    // Base layer — always visible from zoom 8, no maxzoom, no gaps
    map.addLayer({
        id: cat.layerId,
        type: 'symbol',
        source: cat.source,
        minzoom: 8,
        layout: {
            'icon-image': [
                'step', ['zoom'],
                cat.icons.t1.mapId,
                cat.iconSwitch, cat.icons.t2.mapId
            ],
            'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                8,  0.5,
                10, 0.6,
                12, 0.7,
                13, 0.6,
                15, 0.7,
                18, 0.5
            ],
            'icon-allow-overlap': [
                'step', ['zoom'],
                false,
                13, true
            ],
            'text-field': [
                'step', ['zoom'],
                '',
                13, ['get', 'name']
            ],
            'text-offset': [0, 1.2],
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                13, 10,
                15, 12
            ],
            'text-anchor': 'top',
            'text-font': ['Space Mono Regular', 'DIN Pro Regular', 'Arial Unicode MS Regular'],
            'text-optional': true
        },
        paint: {
            'text-color': '#171A14',
            'text-halo-color': '#F5ECD7',
            'text-halo-width': 2
        }
    });

    // T3 hover layer — hidden by default (filter matches nothing), shown on mouseenter
    map.addLayer({
        id: cat.hoverLayerId,
        type: 'symbol',
        source: cat.source,
        layout: {
            'icon-image': buildBespokeMatchExpr('peaks'),
            'icon-size': 1.0,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.8],
            'text-size': 13,
            'text-anchor': 'top',
            'text-font': ['Space Mono Regular', 'DIN Pro Regular', 'Arial Unicode MS Regular'],
            'text-optional': true
        },
        paint: {
            'text-color': '#171A14',
            'text-halo-color': '#F5ECD7',
            'text-halo-width': 2
        },
        filter: ['==', ['get', 'name'], '']  // matches nothing — hidden until hover
    });
}

// --- Cave marker layers — single layer (full zoom coverage) + T3 hover layer ---
function addCaveLayers() {
    var cat = MARKER_STYLES.caves;

    // Base layer — always visible from zoom 8, no maxzoom, no gaps
    map.addLayer({
        id: cat.layerId,
        type: 'symbol',
        source: cat.source,
        minzoom: 8,
        filter: cat.filter,
        layout: {
            'icon-image': [
                'step', ['zoom'],
                cat.icons.t1.mapId,
                cat.iconSwitch, cat.icons.t2.mapId
            ],
            'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                8,  0.5,
                10, 0.6,
                12, 0.7,
                13, 0.6,
                15, 0.7,
                18, 0.5
            ],
            'icon-allow-overlap': [
                'step', ['zoom'],
                false,
                13, true
            ],
            'text-field': [
                'step', ['zoom'],
                '',
                13, ['get', 'name']
            ],
            'text-offset': [0, 1.2],
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                13, 10,
                15, 12
            ],
            'text-anchor': 'top',
            'text-font': ['Space Mono Regular', 'DIN Pro Regular', 'Arial Unicode MS Regular'],
            'text-optional': true
        },
        paint: {
            'text-color': '#171A14',
            'text-halo-color': '#F5ECD7',
            'text-halo-width': 2
        }
    });

    // T3 hover layer — hidden by default, shown on mouseenter
    map.addLayer({
        id: cat.hoverLayerId,
        type: 'symbol',
        source: cat.source,
        layout: {
            'icon-image': buildBespokeMatchExpr('caves'),
            'icon-size': 1.0,
            'icon-allow-overlap': true,
            'text-field': ['get', 'name'],
            'text-offset': [0, 1.8],
            'text-size': 13,
            'text-anchor': 'top',
            'text-font': ['Space Mono Regular', 'DIN Pro Regular', 'Arial Unicode MS Regular'],
            'text-optional': true
        },
        paint: {
            'text-color': '#171A14',
            'text-halo-color': '#F5ECD7',
            'text-halo-width': 2
        },
        filter: ['==', ['get', 'name'], '']  // matches nothing — hidden until hover
    });
}

// --- T3 hover interactions ---
// Swaps base layer icon → bespoke T3 icon on mouseenter/click for bespoke-named features.
// Reverts on mouseleave or (mobile) after 3 seconds.
function setupHoverInteractions() {
    Object.keys(MARKER_STYLES).forEach(function(category) {
        var cat = MARKER_STYLES[category];
        var baseId = cat.layerId;
        var hoverId = cat.hoverLayerId;
        var originalFilter = cat.filter;

        // Collect bespoke names for this category
        var bespokeNames = Object.keys(cat.bespoke).filter(function(n) {
            return cat.bespoke[n].t3;
        });
        if (bespokeNames.length === 0) return;

        // Desktop — mouseenter: show T3, hide from base
        map.on('mouseenter', baseId, function(e) {
            var name = e.features[0].properties.name;
            if (bespokeNames.indexOf(name) !== -1) {
                map.getCanvas().style.cursor = 'pointer';
                map.setFilter(hoverId, ['==', ['get', 'name'], name]);
                var baseFilter = originalFilter
                    ? ['all', originalFilter, ['!=', ['get', 'name'], name]]
                    : ['!=', ['get', 'name'], name];
                map.setFilter(baseId, baseFilter);
            }
        });

        // Desktop — mouseleave from base layer: revert
        map.on('mouseleave', baseId, function() {
            map.getCanvas().style.cursor = '';
            map.setFilter(hoverId, ['==', ['get', 'name'], '']);
            map.setFilter(baseId, originalFilter);
        });

        // Desktop — mouseenter on hover layer: keep pointer cursor (prevents flicker)
        map.on('mouseenter', hoverId, function() {
            map.getCanvas().style.cursor = 'pointer';
        });

        // Desktop — mouseleave from hover layer: revert (mouse moved off hover layer)
        map.on('mouseleave', hoverId, function() {
            map.getCanvas().style.cursor = '';
            map.setFilter(hoverId, ['==', ['get', 'name'], '']);
            map.setFilter(baseId, originalFilter);
        });

        // Mobile — tap on base layer: show T3, revert after 3 seconds
        map.on('click', baseId, function(e) {
            var name = e.features[0].properties.name;
            if (bespokeNames.indexOf(name) !== -1) {
                map.setFilter(hoverId, ['==', ['get', 'name'], name]);
                var baseFilter = originalFilter
                    ? ['all', originalFilter, ['!=', ['get', 'name'], name]]
                    : ['!=', ['get', 'name'], name];
                map.setFilter(baseId, baseFilter);
                setTimeout(function() {
                    map.setFilter(hoverId, ['==', ['get', 'name'], '']);
                    map.setFilter(baseId, originalFilter);
                }, 3000);
            }
        });
    });
}

// --- Pulse animation state ---
var pulseAnimation = null;
var pulseMarker = null;

function startRoutePulse(coords) {
    stopRoutePulse();
    if (!coords || coords.length < 2) return;

    var el = document.createElement('div');
    el.className = 'rmm-pulse-dot';
    pulseMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([coords[0][0], coords[0][1]])
        .addTo(map);

    var index = 0;
    var total = coords.length;
    var speed = Math.max(20, Math.floor(3000 / total));

    function step() {
        if (index >= total) { index = 0; }
        var c = coords[index];
        pulseMarker.setLngLat([c[0], c[1]]);
        index++;
        pulseAnimation = setTimeout(step, speed);
    }
    step();
}

function stopRoutePulse() {
    if (pulseAnimation) { clearTimeout(pulseAnimation); pulseAnimation = null; }
    if (pulseMarker) { pulseMarker.remove(); pulseMarker = null; }
}

// --- RMM graded route loader ---
// Fetches individual GeoJSON files from RMM_ROUTES, merges into one FeatureCollection,
// then adds layers and wires all interactions. One source regardless of route count.
async function loadRMMRoutes() {
    var features = [];

    for (var i = 0; i < RMM_ROUTES.length; i++) {
        var url = RMM_ROUTES[i];
        try {
            var response = await fetch(url);
            if (!response.ok) {
                console.error('Failed to load route: ' + url + ' (' + response.status + ')');
                continue;
            }
            var data = await response.json();
            if (data.type === 'FeatureCollection' && data.features) {
                features = features.concat(data.features);
            } else if (data.type === 'Feature') {
                features.push(data);
            }
        } catch (e) {
            console.error('Error loading route ' + url + ':', e);
        }
    }

    if (features.length === 0) {
        console.warn('RMM: No routes loaded');
        return;
    }

    console.log('RMM: Loaded ' + features.length + ' routes');

    // Store full coordinate arrays keyed by name — used by pulse animation
    // (querySourceFeatures returns tile-clipped coords; these are always complete)
    var rmmRouteCoords = {};
    features.forEach(function(f) {
        if (f.properties && f.properties.name) {
            rmmRouteCoords[f.properties.name] = f.geometry.coordinates;
        }
    });
    window._rmmRouteCoords = rmmRouteCoords;

    // Build start-point FeatureCollection from first coordinate of each route
    var startFeatures = [];
    features.forEach(function(f) {
        var coords = f.geometry && f.geometry.coordinates;
        if (!coords || coords.length === 0) return;
        startFeatures.push({
            type: 'Feature',
            properties: Object.assign({}, f.properties),
            geometry: { type: 'Point', coordinates: [coords[0][0], coords[0][1]] }
        });
    });

    // Sources
    map.addSource('rmm-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: features }
    });
    map.addSource('rmm-route-starts', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: startFeatures }
    });

    // Layer 1 — base route lines (50% opacity by default)
    map.addLayer({
        id: 'rmm-routes',
        type: 'line',
        source: 'rmm-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#FF4E50',
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                8, 1.5, 10, 2, 12, 3, 14, 4, 16, 5
            ],
            'line-opacity': 0.5,
            'line-emissive-strength': 0.5
        }
    });

    // Layer 2 — highlight (full opacity, slightly wider — hidden until hover)
    map.addLayer({
        id: 'rmm-routes-highlight',
        type: 'line',
        source: 'rmm-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#FF4E50',
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                8, 2, 10, 2.5, 12, 3.5, 14, 5, 16, 6
            ],
            'line-opacity': 1.0,
            'line-emissive-strength': 0.5
        },
        filter: ['==', ['get', 'name'], '']
    });

    // Layer 3 — route name labels (50% opacity by default)
    map.addLayer({
        id: 'rmm-route-labels',
        type: 'symbol',
        source: 'rmm-routes',
        minzoom: 12,
        layout: {
            'symbol-placement': 'line-center',
            'text-field': ['get', 'name'],
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                12, 10, 14, 12, 16, 14
            ],
            'text-font': ['Space Mono Regular', 'DIN Pro Regular', 'Arial Unicode MS Regular'],
            'text-anchor': 'center',
            'text-offset': [0, -1],
            'text-allow-overlap': false,
            'text-optional': true
        },
        paint: {
            'text-color': '#FF4E50',
            'text-halo-color': '#171A14',
            'text-halo-width': 2,
            'text-opacity': 0.5
        }
    });

    // Layer 4 — start-point dots (above route lines, below markers)
    map.addLayer({
        id: 'rmm-route-starts',
        type: 'circle',
        source: 'rmm-route-starts',
        paint: {
            'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                8, 3, 12, 5, 15, 7
            ],
            'circle-color': '#FF4E50',
            'circle-opacity': 0.7,
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
            'circle-stroke-opacity': 0.9
        }
    });

    // Popup — created once, reused for each hover
    var routePopup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'rmm-route-popup',
        maxWidth: '280px',
        offset: 15
    });

    // Helper — show highlight + label for a named route
    function highlightRoute(name) {
        map.setFilter('rmm-routes-highlight', ['==', ['get', 'name'], name]);
        map.setPaintProperty('rmm-route-labels', 'text-opacity',
            ['case', ['==', ['get', 'name'], name], 1.0, 0.5]
        );
    }

    // Helper — clear highlight + label back to defaults
    function clearHighlight() {
        map.setFilter('rmm-routes-highlight', ['==', ['get', 'name'], '']);
        map.setPaintProperty('rmm-route-labels', 'text-opacity', 0.5);
    }

    // Line hover — opacity + pulse (no popup)
    map.on('mouseenter', 'rmm-routes', function(e) {
        if (!e.features || !e.features.length) return;
        var name = e.features[0].properties.name;
        map.getCanvas().style.cursor = 'pointer';
        highlightRoute(name);
        var coords = window._rmmRouteCoords[name];
        if (coords) startRoutePulse(coords);
    });

    map.on('mouseleave', 'rmm-routes', function() {
        map.getCanvas().style.cursor = '';
        clearHighlight();
        stopRoutePulse();
    });

    // Start-dot hover — popup + opacity + pulse
    map.on('mouseenter', 'rmm-route-starts', function(e) {
        if (!e.features || !e.features.length) return;
        map.getCanvas().style.cursor = 'pointer';
        var props = e.features[0].properties;
        var lngLat = e.features[0].geometry.coordinates.slice();

        var html = '<div class="rmm-route-card">' +
            '<div class="rmm-route-card-grade">' + (props.grade_display || '') + '</div>' +
            '<div class="rmm-route-card-name">' + (props.name || '') + '</div>' +
            '<div class="rmm-route-card-stats">' +
                '<span>' + (props.distance_km || '') + ' km</span>' +
                '<span>' + (props.elevation_gain_m || '') + 'm gain</span>' +
                '<span>' + (props.elevation_density || '') + ' m/km</span>' +
            '</div>' +
            '<div class="rmm-route-card-action">Route details coming soon</div>' +
            '</div>';

        routePopup.setLngLat(lngLat).setHTML(html).addTo(map);
        highlightRoute(props.name);
        var coords = window._rmmRouteCoords[props.name];
        if (coords) startRoutePulse(coords);
    });

    map.on('mouseleave', 'rmm-route-starts', function() {
        map.getCanvas().style.cursor = '';
        routePopup.remove();
        clearHighlight();
        stopRoutePulse();
    });
}

// --- Data layers (Stage 2) ---
async function addDataLayers(config) {
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

    // RMM graded route lines — above trails, below markers
    await loadRMMRoutes();

    // Marker layers — peaks then caves (render above routes)
    addPeakLayers();
    addCaveLayers();
    setupHoverInteractions();
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
                await addDataLayers(config);

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
