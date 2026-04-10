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

            // Load handler — fog, style_config
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

                // 2. Load style_config from Supabase (fails gracefully)
                loadStyleConfig();

                // 3. Signal map is ready
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
