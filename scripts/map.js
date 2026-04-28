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
                8,  0.55,
                10, 0.66,
                12, 0.77,
                13, 0.66,
                15, 0.77,
                18, 0.55
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
            'icon-size': 1.1,
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
                8,  0.375,
                10, 0.45,
                12, 0.525,
                13, 0.45,
                15, 0.525,
                18, 0.375
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
            'icon-size': 0.75,
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

// --- Popup anchor helper ---
// Given a route start lngLat and the full route coordinate array, determines
// which Mapbox GL Popup anchor to use so the popup body appears on the
// opposite side of the marker from the trail. This prevents the popup from
// overlapping the pulse animation running along the route.
function getPopupAnchorAwayFromTrail(startLngLat, coords) {
    if (!coords || coords.length < 2 || !map) return 'bottom'; // safe default

    // Sample a point ~10 coords ahead to get a stable direction vector.
    // Using too few coords can give a misleading angle on switchbacks.
    var sampleIdx = Math.min(10, coords.length - 1);
    var startPx = map.project(startLngLat);
    var aheadPx = map.project([coords[sampleIdx][0], coords[sampleIdx][1]]);

    // Direction the trail heads in screen space (px)
    var dx = aheadPx.x - startPx.x;
    var dy = aheadPx.y - startPx.y;

    // Angle in degrees, 0 = right, 90 = down (screen coords)
    var angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Normalise to 0–360
    if (angle < 0) angle += 360;

    // The anchor names describe where the popup's *tip* attaches to the point.
    // We want the tip on the trail side so the popup body extends away from it.
    //
    //   Trail heads →  right (315-45°)     → anchor 'left'   (tip on left, body extends right... wait)
    //
    // Actually: anchor = where the popup connects to the point.
    //   anchor 'left'  → left edge at point → popup body extends RIGHT
    //   anchor 'right' → right edge at point → popup body extends LEFT
    //   anchor 'top'   → top at point → popup extends DOWN
    //   anchor 'bottom'→ bottom at point → popup extends UP
    //
    // If trail goes RIGHT, we want popup to extend LEFT → anchor 'right'
    // If trail goes LEFT, we want popup to extend RIGHT → anchor 'left'
    // If trail goes DOWN, we want popup to extend UP → anchor 'bottom'
    // If trail goes UP, we want popup to extend DOWN → anchor 'top'

    if (angle >= 315 || angle < 45) {
        // Trail heads right → popup extends left
        return 'right';
    } else if (angle >= 45 && angle < 135) {
        // Trail heads down → popup extends up
        return 'bottom';
    } else if (angle >= 135 && angle < 225) {
        // Trail heads left → popup extends right
        return 'left';
    } else {
        // Trail heads up → popup extends down
        return 'top';
    }
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
    var PX_PER_MS = 0.08; // constant visual speed (~80 px/s at any zoom)

    function step() {
        if (index >= total) { index = 0; }
        var c = coords[index];
        pulseMarker.setLngLat([c[0], c[1]]);

        // Calculate delay from screen-space distance to next point
        var next = (index + 1) % total;
        var nc = coords[next];
        var cp = map.project([c[0], c[1]]);
        var np = map.project([nc[0], nc[1]]);
        var dist = Math.sqrt((np.x - cp.x) * (np.x - cp.x) + (np.y - cp.y) * (np.y - cp.y));
        var delay = Math.max(16, Math.round(dist / PX_PER_MS));

        index++;
        pulseAnimation = setTimeout(step, delay);
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
                // Merge route metadata from crs.properties into each feature's properties.
                // QGIS exports store grade, distance, elevation etc. on the FeatureCollection root
                // rather than on individual features. The popup reads feature.properties, so we
                // push the metadata down so it's available at render time.
                var routeMeta = (data.crs && data.crs.properties) ? data.crs.properties : {};
                data.features.forEach(function(f) {
                    if (routeMeta && f.properties) {
                        // Store the clean display name from crs (e.g. "Elsies Peak - Route 1")
                        // separately so it doesn't clash with the feature's layer-matching name
                        if (routeMeta.name) {
                            f.properties.display_name = routeMeta.name;
                        }
                        // Copy route-level fields without overwriting existing feature fields
                        Object.keys(routeMeta).forEach(function(key) {
                            if (f.properties[key] === undefined || f.properties[key] === null) {
                                f.properties[key] = routeMeta[key];
                            }
                        });
                    }
                });
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

    // Helpers — normalise LineString and MultiLineString into a single flat
    // [[lng,lat,...], ...] array, and pull out the first [lng,lat] of a route.
    function flattenLineCoords(geom) {
        if (!geom || !geom.coordinates) return null;
        if (geom.type === 'LineString') {
            return geom.coordinates;
        }
        if (geom.type === 'MultiLineString') {
            return [].concat.apply([], geom.coordinates);
        }
        return null;
    }
    function getFirstPoint(geom) {
        var flat = flattenLineCoords(geom);
        if (!flat || flat.length === 0) return null;
        var p = flat[0];
        if (!p || p.length < 2) return null;
        return [p[0], p[1]];
    }

    // Store full coordinate arrays keyed by name — used by pulse animation
    // (querySourceFeatures returns tile-clipped coords; these are always complete)
    var rmmRouteCoords = {};
    features.forEach(function(f) {
        if (f.properties && f.properties.name) {
            var flat = flattenLineCoords(f.geometry);
            if (flat) rmmRouteCoords[f.properties.name] = flat;
        }
    });
    window._rmmRouteCoords = rmmRouteCoords;

    // Build start-point features from first coordinate of each route
    var startFeatures = [];
    features.forEach(function(f) {
        var first = getFirstPoint(f.geometry);
        if (!first) return;
        startFeatures.push({
            type: 'Feature',
            properties: Object.assign({}, f.properties),
            geometry: { type: 'Point', coordinates: first }
        });
    });

    // Group by rounded start coordinate (5 dp ≈ 1m precision).
    // Singles go on the GL layer; clusters become mapboxgl.Marker instances.
    var coordGroups = {};
    startFeatures.forEach(function(f) {
        var c = f.geometry.coordinates;
        var key = Math.round(c[0] * 1e5) / 1e5 + ',' + Math.round(c[1] * 1e5) / 1e5;
        if (!coordGroups[key]) coordGroups[key] = [];
        coordGroups[key].push(f);
    });

    var singleFeatures = [];
    var clusterGroups = [];
    Object.keys(coordGroups).forEach(function(key) {
        var group = coordGroups[key];
        if (group.length === 1) {
            singleFeatures.push(group[0]);
        } else {
            clusterGroups.push({ lngLat: group[0].geometry.coordinates, trails: group });
        }
    });

    // Sources
    map.addSource('rmm-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: features }
    });
    // rmm-route-starts only contains single-trail starts; cluster primaries are added below as Markers
    map.addSource('rmm-route-starts', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: singleFeatures }
    });

    // Layer 1 — base route lines (hidden by default; revealed via rmm-routes-highlight on marker hover)
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
            'line-opacity': 0,
            'line-emissive-strength': 0.5
        }
    });

    // Layer 2 — reveal layer (50% opacity, slightly wider — shown on marker hover via filter)
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
            'line-opacity': 0.5,
            'line-emissive-strength': 0.5
        },
        filter: ['==', ['get', 'name'], '']
    });

    // Layer 3 — route name labels (hidden by default; revealed on marker hover)
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
            'text-opacity': 0
        }
    });

    // Layer 4 — single-trail start dots (above route lines, below markers)
    // Trails that share a start coordinate are handled as cluster Markers below.
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

    // Helper — reveal a named route's line and label on marker hover
    function highlightRoute(name) {
        map.setFilter('rmm-routes-highlight', ['==', ['get', 'name'], name]);
        map.setPaintProperty('rmm-route-labels', 'text-opacity',
            ['case', ['==', ['get', 'name'], name], 1.0, 0]
        );
    }

    // Helper — hide route line and label when marker hover ends
    function clearHighlight() {
        map.setFilter('rmm-routes-highlight', ['==', ['get', 'name'], '']);
        map.setPaintProperty('rmm-route-labels', 'text-opacity', 0);
    }

    // --- Cluster interaction ---
    // State shared across all cluster markers within this loadRMMRoutes call.
    var clusterCollapseTimer = null;
    var clusterSecondaries = [];    // mapboxgl.Marker instances
    var clusterBridgeEl = null;     // invisible SVG hit area connecting primary → children
    var clusterPrimaryWrap = null;  // wrap of the currently-expanded primary (carries .is-expanded for the shrink)

    function collapseCluster() {
        clusterCollapseTimer = null;
        clusterSecondaries.forEach(function(m) { m.remove(); });
        clusterSecondaries = [];
        if (clusterBridgeEl) { clusterBridgeEl.remove(); clusterBridgeEl = null; }
        if (clusterPrimaryWrap) {
            clusterPrimaryWrap.classList.remove('is-expanded');
            clusterPrimaryWrap = null;
        }
        // Defensive: strip the class from any other primaries in case state drifted
        var stale = document.querySelectorAll('.rmm-cluster-primary-wrap.is-expanded');
        for (var s = 0; s < stale.length; s++) stale[s].classList.remove('is-expanded');
        routePopup.remove();
        clearHighlight();
        stopRoutePulse();
    }

    function scheduleCollapse() {
        clusterCollapseTimer = setTimeout(collapseCluster, 350);
    }

    function cancelCollapse() {
        if (clusterCollapseTimer) {
            clearTimeout(clusterCollapseTimer);
            clusterCollapseTimer = null;
        }
    }

    // Build an invisible SVG overlay that covers the area between the primary
    // marker and all its children. This lets the mouse travel freely between
    // dots without falling into the gap and triggering collapse.
    function createBridge(centerPx, childPoints) {
        if (clusterBridgeEl) { clusterBridgeEl.remove(); clusterBridgeEl = null; }

        // Compute a bounding box around center + all child points, with generous padding
        var pad = 12;
        var allX = [centerPx.x].concat(childPoints.map(function(p) { return p.x; }));
        var allY = [centerPx.y].concat(childPoints.map(function(p) { return p.y; }));
        var minX = Math.min.apply(null, allX) - pad;
        var minY = Math.min.apply(null, allY) - pad;
        var maxX = Math.max.apply(null, allX) + pad;
        var maxY = Math.max.apply(null, allY) + pad;
        var w = maxX - minX;
        var h = maxY - minY;

        // Build a convex polygon path from centre to each child (fan shape)
        // with padding around each point for comfortable mouse travel
        var cx = centerPx.x - minX;
        var cy = centerPx.y - minY;

        // Sort children by angle from centre for a clean convex hull
        var sorted = childPoints.map(function(p) {
            var dx = p.x - centerPx.x;
            var dy = p.y - centerPx.y;
            return { x: p.x - minX, y: p.y - minY, angle: Math.atan2(dy, dx) };
        }).sort(function(a, b) { return a.angle - b.angle; });

        // Build path: centre → each child with padding offsets
        var points = [];
        sorted.forEach(function(p) {
            var dx = p.x - cx;
            var dy = p.y - cy;
            var len = Math.sqrt(dx * dx + dy * dy) || 1;
            // Perpendicular offsets for width around each arm
            var px = (-dy / len) * pad;
            var py = (dx / len) * pad;
            points.push((p.x + px) + ',' + (p.y + py));
            points.push((p.x - px) + ',' + (p.y - py));
        });
        // Add centre point
        points.push(cx + ',' + cy);

        // Create SVG element positioned absolutely on the map container
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.style.position = 'absolute';
        svg.style.left = minX + 'px';
        svg.style.top = minY + 'px';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '1';

        var polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points.join(' '));
        polygon.setAttribute('fill', 'transparent');
        polygon.style.pointerEvents = 'all';
        svg.appendChild(polygon);

        polygon.addEventListener('mouseenter', function() { cancelCollapse(); });
        polygon.addEventListener('mouseleave', function() { scheduleCollapse(); });

        // Append to the map's canvas container so it sits above the canvas
        var container = map.getCanvasContainer();
        container.appendChild(svg);
        clusterBridgeEl = svg;
    }

    // Radiate secondary markers around a cluster primary at the given lngLat.
    // Secondaries are positioned using a pixel-space radius so spacing is zoom-stable.
    //
    // Brief 1.2 — fan-out geometry:
    //   • Children orbit the parent starting at 9 o'clock (left) and going
    //     clockwise around the parent. A fixed angular gap keeps small clusters
    //     visually tight in the upper-left arc (no "opposite ends" effect).
    //   • For very large clusters (n > FULL_CIRCLE_THRESHOLD) we fall back to
    //     even spacing around the full circle so children don't overshoot.
    //   • The parent gets `.is-expanded` to scale to 70% (CSS-driven) so the
    //     children sit at the original marker size around a smaller hub.
    function expandCluster(lngLat, trails, primaryWrap) {
        cancelCollapse();
        clusterSecondaries.forEach(function(m) { m.remove(); });
        clusterSecondaries = [];
        if (clusterBridgeEl) { clusterBridgeEl.remove(); clusterBridgeEl = null; }
        // Clear shrink state from any previously-expanded primary
        if (clusterPrimaryWrap && clusterPrimaryWrap !== primaryWrap) {
            clusterPrimaryWrap.classList.remove('is-expanded');
        }
        routePopup.remove();
        clearHighlight();
        stopRoutePulse();

        // Tag the primary wrapper — CSS scales the inner circle to 70%
        if (primaryWrap) {
            primaryWrap.classList.add('is-expanded');
            clusterPrimaryWrap = primaryWrap;
        }

        var n = trails.length;
        var radius = 26;                       // px from primary centre
        var FIXED_GAP = 40 * Math.PI / 180;    // 40° per child (chord ≈ 17.8 px @ r=26 → ~3.8 px between 14 px markers)
        var FULL_CIRCLE_THRESHOLD = 9;
        var startAngle = Math.PI;              // 9 o'clock (screen coords: y-down)
        var step = (n > FULL_CIRCLE_THRESHOLD) ? (2 * Math.PI / n) : FIXED_GAP;
        var center = map.project(lngLat);
        var childPixels = [];

        trails.forEach(function(trail, i) {
            // angle increases ⇒ visually clockwise (screen y is flipped)
            var angle = startAngle + i * step;
            var px = center.x + radius * Math.cos(angle);
            var py = center.y + radius * Math.sin(angle);
            childPixels.push({ x: px, y: py });
            var point = map.unproject([px, py]);

            var wrap = document.createElement('div');
            wrap.className = 'rmm-cluster-secondary-wrap';
            var inner = document.createElement('div');
            inner.className = 'rmm-cluster-secondary';
            // Stagger the fan-in so children appear to radiate from the parent
            inner.style.animationDelay = (i * 30) + 'ms';
            wrap.appendChild(inner);

            var marker = new mapboxgl.Marker({ element: wrap, anchor: 'center' })
                .setLngLat([point.lng, point.lat])
                .addTo(map);

            function onSecondaryEnter() {
                cancelCollapse();
                highlightRoute(trail.properties.name);

                var props = trail.properties;
                var routeName = props.display_name || props.name || '';
                var html = '<div class="rmm-route-card">' +
                    '<div class="rmm-route-card-grade">' + (props.grade_display || '') + '</div>' +
                    '<div class="rmm-route-card-name">' + routeName + '</div>' +
                    '<div class="rmm-route-card-stats">' +
                        '<span>' + (props.distance_km || '') + ' km</span>' +
                        '<span>' + (props.elevation_gain_m || '') + 'm gain</span>' +
                        '<span>' + (props.elevation_density || '') + ' m/km</span>' +
                    '</div>' +
                    '<div class="rmm-route-card-action">Route details coming soon</div>' +
                    '</div>';

                var trailCoords = window._rmmRouteCoords[props.name];

                // Brief: on parent-child markers the popup ALWAYS appears below
                // the whole cluster so it never overlaps the trail highlight or
                // the fanned children. We anchor to the PARENT lngLat (not the
                // child), so the popup hangs centrally beneath the device
                // regardless of which child is hovered.
                //
                // Edge fallback: if the parent is near the bottom of the map
                // viewport, flip the anchor so the popup floats above instead
                // of being clipped off-screen.
                var canvas = map.getCanvas();
                var parentPx = map.project(lngLat);
                var pxBelow = canvas.clientHeight - parentPx.y;
                var APPROX_POPUP_HEIGHT = 160; // card + tip + offset margin
                var popupAnchor = (pxBelow < APPROX_POPUP_HEIGHT) ? 'bottom' : 'top';
                routePopup.options.anchor = popupAnchor;
                routePopup.setLngLat(lngLat).setHTML(html).addTo(map);

                if (trailCoords) startRoutePulse(trailCoords);
            }

            function onSecondaryLeave() {
                routePopup.remove();
                clearHighlight();
                stopRoutePulse();
                scheduleCollapse();
            }

            wrap.addEventListener('mouseenter', onSecondaryEnter);
            wrap.addEventListener('mouseleave', onSecondaryLeave);
            // Mobile/touch — mouseenter does not fire on tap. Tapping a child
            // triggers the same select behaviour. (Cluster expansion itself is
            // wired on the primary's click handler below.)
            wrap.addEventListener('click', function(e) {
                e.stopPropagation();
                onSecondaryEnter();
            });

            clusterSecondaries.push(marker);
        });

        // Create invisible bridge between primary and all children
        createBridge(center, childPixels);
    }

    // Create one primary Marker per cluster group.
    // Marker rendering (the wrap + inner circle) is intentionally separate from
    // the hover/reveal logic so the circle can be swapped for custom artwork
    // later. The wrap is what Mapbox positions; the inner is what we visually
    // transform on hover (scale to 70%) without fighting Mapbox's translate.
    clusterGroups.forEach(function(group) {
        var wrap = document.createElement('div');
        wrap.className = 'rmm-cluster-primary-wrap';
        var inner = document.createElement('div');
        inner.className = 'rmm-cluster-primary';
        wrap.appendChild(inner);

        new mapboxgl.Marker({ element: wrap, anchor: 'center' })
            .setLngLat(group.lngLat)
            .addTo(map);

        wrap.addEventListener('mouseenter', function() {
            cancelCollapse();
            expandCluster(group.lngLat, group.trails, wrap);
        });

        wrap.addEventListener('mouseleave', function() {
            scheduleCollapse();
        });

        // Mobile/touch — tap to expand. On desktop, mouseenter has already
        // expanded the cluster, so this becomes a no-op. We don't toggle on
        // re-tap because a tap landing on a child should select it (handled
        // separately on the child wrap).
        wrap.addEventListener('click', function(e) {
            e.stopPropagation();
            cancelCollapse();
            if (!wrap.classList.contains('is-expanded')) {
                expandCluster(group.lngLat, group.trails, wrap);
            }
        });
    });

    // Mobile dismissal — tapping anywhere on the map canvas (i.e. not on a
    // cluster element) collapses any open cluster. Without this the fan stays
    // open forever on touch devices since mouseleave never fires.
    map.on('click', function(e) {
        var target = e.originalEvent && e.originalEvent.target;
        if (!target) return;
        var insideCluster = target.closest && target.closest(
            '.rmm-cluster-primary-wrap, .rmm-cluster-secondary-wrap'
        );
        if (!insideCluster && clusterSecondaries.length) collapseCluster();
    });

    // Collapse on map pan/zoom — the fan is positioned in pixel space, so it
    // becomes visually wrong as soon as the camera moves. Collapsing avoids
    // the children drifting away from the parent during a drag.
    map.on('movestart', function() {
        if (clusterSecondaries.length) collapseCluster();
    });

    // Start-dot hover — popup + reveal line + pulse
    map.on('mouseenter', 'rmm-route-starts', function(e) {
        if (!e.features || !e.features.length) return;
        map.getCanvas().style.cursor = 'pointer';
        var props = e.features[0].properties;
        var lngLat = e.features[0].geometry.coordinates.slice();

        var routeName = props.display_name || props.name || '';
        var html = '<div class="rmm-route-card">' +
            '<div class="rmm-route-card-grade">' + (props.grade_display || '') + '</div>' +
            '<div class="rmm-route-card-name">' + routeName + '</div>' +
            '<div class="rmm-route-card-stats">' +
                '<span>' + (props.distance_km || '') + ' km</span>' +
                '<span>' + (props.elevation_gain_m || '') + 'm gain</span>' +
                '<span>' + (props.elevation_density || '') + ' m/km</span>' +
            '</div>' +
            '<div class="rmm-route-card-action">Route details coming soon</div>' +
            '</div>';

        // Position popup opposite to the trail direction so it doesn't
        // overlap the pulse animation running along the route.
        var coords = window._rmmRouteCoords[props.name];
        var popupAnchor = getPopupAnchorAwayFromTrail(lngLat, coords);
        routePopup.options.anchor = popupAnchor;

        routePopup.setLngLat(lngLat).setHTML(html).addTo(map);
        highlightRoute(props.name);
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

    // RMM graded route lines — above trails, below markers.
    // Wrapped so a route-loading failure can't block peak/cave layers from rendering.
    try {
        await loadRMMRoutes();
    } catch (e) {
        console.error('RMM: loadRMMRoutes failed —', e);
    }

    // Marker layers — peaks then caves (render above routes)
    addPeakLayers();
    addCaveLayers();
    setupHoverInteractions();
}

// --- Filter Sidebar ---
// Configuration for all toggleable layer groups.
// Each entry maps a filter key to the GL layer IDs it controls.
// `dom` flags entries that also need DOM marker toggling (e.g. cluster markers).
// `placeholder` flags entries for future features (toggle disabled).
var FILTER_GROUPS = {
    markers: {
        label: 'Markers',
        items: [
            { key: 'peaks',  label: 'Peaks',  layers: ['peaks', 'peaks-t3-hover'] },
            { key: 'caves',  label: 'Caves',  layers: ['caves', 'caves-t3-hover'] }
        ]
    },
    routes: {
        label: 'Routes',
        items: [
            { key: 'rmm-routes', label: 'RMM Routes', layers: ['rmm-routes', 'rmm-routes-highlight', 'rmm-route-labels', 'rmm-route-starts'], dom: 'clusters' }
        ]
    },
    trails: {
        label: 'Trails',
        items: [
            { key: 'trails-path',    label: 'Paths',    layers: ['rmm-trails-path'] },
            { key: 'trails-track',   label: 'Tracks',   layers: ['rmm-trails-track'] },
            { key: 'trails-footway', label: 'Footways', layers: ['rmm-trails-footway'] },
            { key: 'trails-steps',   label: 'Steps',    layers: ['rmm-trails-steps'] }
        ]
    },
    overlays: {
        label: 'Overlays',
        items: [
            { key: 'contours', label: 'Contour Lines', layers: ['rmm-contours'] }
        ]
    },
    future: {
        label: 'Coming Soon',
        items: [
            { key: 'events', label: 'Events',             layers: [], placeholder: true },
            { key: 'pois',   label: 'Points of Interest', layers: [], placeholder: true },
            { key: 'zones',  label: 'Zones',              layers: [], placeholder: true }
        ]
    }
};

function buildFilterSidebar() {
    // Toggle button (layers icon)
    var btn = document.createElement('button');
    btn.className = 'rmm-filter-toggle';
    btn.setAttribute('aria-label', 'Toggle map filters');
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2 L2 7 L12 12 L22 7 Z"/><path d="M2 17 L12 22 L22 17"/><path d="M2 12 L12 17 L22 12"/></svg>';
    document.body.appendChild(btn);

    // Panel
    var panel = document.createElement('div');
    panel.className = 'rmm-filter-panel';
    panel.id = 'rmm-filter-panel';

    // Header
    var header = document.createElement('div');
    header.className = 'rmm-filter-header';
    header.innerHTML =
        '<span class="rmm-filter-title">Layers</span>' +
        '<button class="rmm-filter-close" aria-label="Close filters">' +
        '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>';
    panel.appendChild(header);

    // Build sections
    var groupKeys = Object.keys(FILTER_GROUPS);
    groupKeys.forEach(function(groupKey, gi) {
        var group = FILTER_GROUPS[groupKey];
        var section = document.createElement('div');
        section.className = 'rmm-filter-section';

        var sectionLabel = document.createElement('div');
        sectionLabel.className = 'rmm-filter-section-label';
        sectionLabel.textContent = group.label;
        section.appendChild(sectionLabel);

        group.items.forEach(function(item) {
            var row = document.createElement('div');
            row.className = 'rmm-filter-row' + (item.placeholder ? ' disabled' : '');

            var label = document.createElement('span');
            label.className = 'rmm-filter-row-label';
            label.textContent = item.label;

            var toggle = document.createElement('label');
            toggle.className = 'rmm-toggle';

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !item.placeholder;
            checkbox.disabled = !!item.placeholder;
            checkbox.dataset.filterKey = item.key;

            var track = document.createElement('span');
            track.className = 'rmm-toggle-track';

            toggle.appendChild(checkbox);
            toggle.appendChild(track);
            row.appendChild(label);
            row.appendChild(toggle);
            section.appendChild(row);

            // Wire up toggle
            if (!item.placeholder) {
                checkbox.addEventListener('change', function() {
                    var visible = this.checked;
                    toggleFilterLayers(item, visible);
                });
            }
        });

        panel.appendChild(section);

        // Divider between sections (not after the last)
        if (gi < groupKeys.length - 1) {
            var divider = document.createElement('div');
            divider.className = 'rmm-filter-divider';
            panel.appendChild(divider);
        }
    });

    document.body.appendChild(panel);

    // Open/close behaviour
    btn.addEventListener('click', function() {
        panel.classList.toggle('open');
    });

    header.querySelector('.rmm-filter-close').addEventListener('click', function() {
        panel.classList.remove('open');
    });

    // Close on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) {
            panel.classList.remove('open');
        }
    });

    // Close when clicking outside the panel (on the map)
    document.getElementById('map-container').addEventListener('click', function() {
        if (panel.classList.contains('open')) {
            panel.classList.remove('open');
        }
    });
}

function toggleFilterLayers(item, visible) {
    var visibility = visible ? 'visible' : 'none';

    item.layers.forEach(function(layerId) {
        if (map && map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, 'visibility', visibility);
        }
    });

    // Handle DOM markers (route clusters)
    if (item.dom === 'clusters') {
        var container = map.getCanvasContainer();
        if (visible) {
            container.closest('#map-container').classList.remove('rmm-clusters-hidden');
        } else {
            container.closest('#map-container').classList.add('rmm-clusters-hidden');
            // Also stop any active pulse and close popups
            stopRoutePulse();
        }
    }
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

                // 3. Build filter sidebar (after layers exist)
                buildFilterSidebar();

                // 4. Load style_config from Supabase (fails gracefully)
                loadStyleConfig();

                // 5. Signal map is ready
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
