/* ============================================
   RUN MAD MAPS — Map Module (Stage 1)
   GL JS Foundation, 3D Terrain, Fog, Token Delivery
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
        width: { z10: 0.2, z13: 0.4, z16: 0.8 },
        opacity: { z10: 0.3, z13: 0.5, z16: 0.7 },
        minzoom: null
    }
};

// Peak layer styling — centralised for future admin/style_config control
var PEAK_STYLES = {
    textColor: '#171A14',
    textHaloColor: '#FFF1D4',
    textHaloWidth: 2,
    t1: {
        minzoom: 8,
        maxzoom: 13,
        iconSize: { z8: 0.04, z11: 0.06, z13: 0.075 }
    },
    t2: {
        minzoom: 13,
        iconSize: { z13: 0.04, z15: 0.06, z18: 0.08 },
        textSize: { z13: 10, z16: 13 },
        textOffset: [0, 1.0]
    }
};

// Contour layer styling — centralised for future admin/style_config control
var CONTOUR_STYLES = {
    majorColor: '#a89b70',
    minorColor: '#c4b990',
    majorWidth:   { z12: 0.6, z13: 0.8, z16: 1.2 },
    minorWidth:   { z12: 0,   z13: 0.3, z16: 0.5 },
    majorOpacity: { z12: 0.4, z13: 0.5, z16: 0.6 },
    minorOpacity: { z12: 0,   z13: 0.25, z16: 0.4 },
    minzoom: 12
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

        // Build a key→value map
        var config = {};
        rows.forEach(function(row) {
            config[row.key] = row.value;
        });

        // Apply camera overrides
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

        // Apply terrain exaggeration override
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

    // Trail + peak sources
    if (config.trailsTilesetId) {
        map.addSource('rmm-trails', {
            type: 'vector',
            url: 'mapbox://' + config.trailsTilesetId
        });
    }

    map.addSource('rmm-peaks', {
        type: 'geojson',
        data: '/public/data/peaks.geojson'
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

    // Peak markers — T1 (icon only, lower zooms)
    if (map.hasImage('peak-s1')) {
        map.addLayer({
            id: 'rmm-peaks-t1',
            type: 'symbol',
            source: 'rmm-peaks',
            minzoom: PEAK_STYLES.t1.minzoom,
            maxzoom: PEAK_STYLES.t1.maxzoom,
            layout: {
                'icon-image': 'peak-s1',
                'icon-size': [
                    'interpolate', ['linear'], ['zoom'],
                    8,  PEAK_STYLES.t1.iconSize.z8,
                    11, PEAK_STYLES.t1.iconSize.z11,
                    13, PEAK_STYLES.t1.iconSize.z13
                ],
                'icon-allow-overlap': true,
                'icon-ignore-placement': false,
                'symbol-sort-key': [
                    'case', ['has', 'ele'], ['-', ['get', 'ele']], 0
                ]
            }
        });
    }

    // Peak markers — T2 (icon + name + elevation, higher zooms)
    if (map.hasImage('peak-s2')) {
        map.addLayer({
            id: 'rmm-peaks-t2',
            type: 'symbol',
            source: 'rmm-peaks',
            minzoom: PEAK_STYLES.t2.minzoom,
            layout: {
                'icon-image': 'peak-s2',
                'icon-size': [
                    'interpolate', ['linear'], ['zoom'],
                    13, PEAK_STYLES.t2.iconSize.z13,
                    15, PEAK_STYLES.t2.iconSize.z15,
                    18, PEAK_STYLES.t2.iconSize.z18
                ],
                'icon-allow-overlap': true,
                'icon-ignore-placement': false,
                'text-field': [
                    'case',
                    ['has', 'ele'],
                    ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'ele']], 'm'],
                    ['get', 'name']
                ],
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                'text-size': [
                    'interpolate', ['linear'], ['zoom'],
                    13, PEAK_STYLES.t2.textSize.z13,
                    16, PEAK_STYLES.t2.textSize.z16
                ],
                'text-offset': PEAK_STYLES.t2.textOffset,
                'text-anchor': 'top',
                'text-max-width': 8,
                'text-optional': true,
                'symbol-sort-key': [
                    'case', ['has', 'ele'], ['-', ['get', 'ele']], 0
                ]
            },
            paint: {
                'text-color': PEAK_STYLES.textColor,
                'text-halo-color': PEAK_STYLES.textHaloColor,
                'text-halo-width': PEAK_STYLES.textHaloWidth
            }
        });
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

            // Load handler — fog, data layers, style_config
            // Note: mapbox-dem source and terrain are defined in the Mapbox Studio style JSON
            map.on('load', function() {
                // 1. Fog
                map.setFog({
                    range: [2, 12],
                    color: '#171A14',
                    'horizon-blend': 0.08,
                    'high-color': '#1e2419',
                    'space-color': '#0d0f0b',
                    'star-intensity': 0.15
                });

                // 2. Load peak icons in parallel, then add all data layers
                var iconsToLoad = [
                    { id: 'peak-s1', url: '/public/icons/peaks/peak-generic-s1.png' },
                    { id: 'peak-s2', url: '/public/icons/peaks/peak-generic-s2.png' }
                ];
                var iconsLoaded = 0;
                var totalIcons = iconsToLoad.length;

                function onIconAttemptComplete() {
                    iconsLoaded++;
                    if (iconsLoaded === totalIcons) {
                        addDataLayers(config);
                    }
                }

                iconsToLoad.forEach(function(icon) {
                    map.loadImage(icon.url, function(error, image) {
                        if (error) {
                            console.warn('RMM: Failed to load icon ' + icon.id);
                        } else {
                            map.addImage(icon.id, image);
                        }
                        onIconAttemptComplete();
                    });
                });

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
    }
});
