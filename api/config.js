module.exports = function handler(req, res) {
    const token = process.env.MAPBOX_PUBLIC_TOKEN;
    const styleUrl = process.env.MAPBOX_STYLE_URL;

    const allowedOrigins = [
        'https://runmadmaps.com',
        'http://localhost:3000'
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (!token || !styleUrl) {
        res.status(500).json({ error: 'Map configuration unavailable.' });
        return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
        token: token,
        styleUrl: styleUrl,
        trailsTilesetId: process.env.TRAILS_TILESET_ID || ''
    });
};
