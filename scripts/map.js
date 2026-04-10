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
    // Sources
    if (config.trailsTilesetId) {
        map.addSource('rmm-trails', {
            type: 'vector',
            url: 'mapbox://' + config.trailsTilesetId
        });
    }

    map.addSource('rmm-peaks', {
        type: 'geojson',
        data: '/data/peaks.geojson'
    });

    // Trail layers — ordered bottom to top
    if (config.trailsTilesetId) {
        // Footways
        map.addLayer({
            id: 'rmm-trails-footway',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'footway'],
            minzoom: 13,
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#8B7355',
                'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    13, 0.5,
                    16, 1.5
                ],
                'line-opacity': 0.5,
                'line-z-offset': 1
            }
        });

        // Steps
        map.addLayer({
            id: 'rmm-trails-steps',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'steps'],
            minzoom: 14,
            layout: {
                'line-join': 'round',
                'line-cap': 'butt'
            },
            paint: {
                'line-color': '#8B7355',
                'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    14, 0.5,
                    17, 1.5
                ],
                'line-opacity': 0.4,
                'line-dasharray': [1, 2],
                'line-z-offset': 1
            }
        });

        // Tracks (jeep roads)
        map.addLayer({
            id: 'rmm-trails-track',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'track'],
            layout: {
                'line-join': 'round',
                'line-cap': 'butt'
            },
            paint: {
                'line-color': '#6B6B5E',
                'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 0.6,
                    13, 1.2,
                    16, 2.5
                ],
                'line-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 0.3,
                    13, 0.5,
                    16, 0.7
                ],
                'line-dasharray': [4, 3],
                'line-z-offset': 1
            }
        });

        // Paths (hiking/running — most prominent)
        map.addLayer({
            id: 'rmm-trails-path',
            type: 'line',
            source: 'rmm-trails',
            'source-layer': 'trails-4ee5we',
            filter: ['==', ['get', 'trail_type'], 'path'],
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#C8553D',
                'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 0.8,
                    13, 1.5,
                    16, 3
                ],
                'line-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 0.5,
                    13, 0.7,
                    16, 0.9
                ],
                'line-z-offset': 1
            }
        });
    }

    // Peak markers — T1 (zoom 8–13, icon only)
    map.addLayer({
        id: 'rmm-peaks-t1',
        type: 'symbol',
        source: 'rmm-peaks',
        minzoom: 8,
        maxzoom: 13,
        layout: {
            'icon-image': 'peak-s1',
            'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                8, 0.08,
                11, 0.12,
                13, 0.15
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': false,
            'symbol-sort-key': [
                'case',
                ['has', 'ele'],
                ['-', ['get', 'ele']],
                0
            ]
        }
    });

    // Peak markers — T2 (zoom 13+, icon + name + elevation)
    map.addLayer({
        id: 'rmm-peaks-t2',
        type: 'symbol',
        source: 'rmm-peaks',
        minzoom: 13,
        layout: {
            'icon-image': 'peak-s2',
            'icon-size': [
                'interpolate', ['linear'], ['zoom'],
                13, 0.08,
                15, 0.12,
                18, 0.16
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
                13, 10,
                16, 13
            ],
            'text-offset': [0, 1.8],
            'text-anchor': 'top',
            'text-max-width': 8,
            'text-optional': true,
            'symbol-sort-key': [
                'case',
                ['has', 'ele'],
                ['-', ['get', 'ele']],
                0
            ]
        },
        paint: {
            'text-color': '#F5ECD7',
            'text-halo-color': '#171A14',
            'text-halo-width': 2
        }
    });
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

                // 2. Load peak icons, then add all data layers
                map.loadImage('/icons/peaks/peak-generic-s1.png', function(errT1, imageT1) {
                    if (errT1) {
                        console.warn('RMM: T1 icon failed to load');
                    } else {
                        map.addImage('peak-s1', imageT1);
                    }

                    map.loadImage('/icons/peaks/peak-generic-s2.png', function(errT2, imageT2) {
                        if (errT2) {
                            console.warn('RMM: T2 icon failed to load');
                        } else {
                            map.addImage('peak-s2', imageT2);
                        }

                        addDataLayers(config);
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
