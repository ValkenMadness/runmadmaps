"""
RMM Production — DEM Elevation Lookup
Reads SRTM .hgt tiles for elevation correction.
Falls back to GPS altitude with smoothing if tiles unavailable (always on Vercel).
"""
import struct
import math
from pathlib import Path
from typing import Optional

SRTM_DIR = Path(__file__).parent / "srtm_data"
SRTM_SAMPLES = 3601  # 1-arc-second SRTM3 tiles


class DEMLookup:
    """Looks up elevation from SRTM .hgt tiles."""

    def __init__(self):
        self._cache: dict = {}
        self.available = self._check_availability()

    def _check_availability(self) -> bool:
        return SRTM_DIR.exists() and any(SRTM_DIR.glob("*.hgt"))

    def _tile_name(self, lat: float, lon: float) -> str:
        lat_prefix = "S" if lat < 0 else "N"
        lon_prefix = "W" if lon < 0 else "E"
        lat_int = abs(int(math.floor(lat)))
        lon_int = abs(int(math.floor(lon)))
        return f"{lat_prefix}{lat_int:02d}{lon_prefix}{lon_int:03d}.hgt"

    def _load_tile(self, name: str) -> Optional[bytes]:
        if name in self._cache:
            return self._cache[name]
        path = SRTM_DIR / name
        if path.exists():
            self._cache[name] = path.read_bytes()
        else:
            self._cache[name] = None
        return self._cache[name]

    def get_elevation(self, lat: float, lon: float) -> Optional[float]:
        """
        Get DEM elevation for a coordinate.
        Returns None if tile not available.
        Uses bilinear interpolation for accuracy.
        """
        tile_name = self._tile_name(lat, lon)
        data = self._load_tile(tile_name)
        if data is None:
            return None

        lat_frac = lat - math.floor(lat)
        lon_frac = lon - math.floor(lon)

        row = (1 - lat_frac) * (SRTM_SAMPLES - 1)
        col = lon_frac * (SRTM_SAMPLES - 1)

        row_int = int(row)
        col_int = int(col)
        row_frac = row - row_int
        col_frac = col - col_int

        row_int = min(row_int, SRTM_SAMPLES - 2)
        col_int = min(col_int, SRTM_SAMPLES - 2)

        def read_point(r: int, c: int) -> float:
            offset = (r * SRTM_SAMPLES + c) * 2
            if offset + 2 > len(data):
                return 0.0
            val = struct.unpack(">h", data[offset:offset + 2])[0]
            if val == -32768:
                return 0.0
            return float(val)

        e00 = read_point(row_int, col_int)
        e01 = read_point(row_int, col_int + 1)
        e10 = read_point(row_int + 1, col_int)
        e11 = read_point(row_int + 1, col_int + 1)

        elevation = (
            e00 * (1 - row_frac) * (1 - col_frac)
            + e01 * (1 - row_frac) * col_frac
            + e10 * row_frac * (1 - col_frac)
            + e11 * row_frac * col_frac
        )
        return round(elevation, 1)

    def correct_profile(
        self, coords: list, smoothing_threshold: float = 2.0
    ) -> list:
        """
        Correct an entire GPS coordinate stream with DEM elevations.
        Falls back to GPS altitude per-point if DEM unavailable (always on Vercel).
        Applies smoothing pass.
        """
        elevations = []
        for c in coords:
            dem_ele = self.get_elevation(c["lat"], c["lon"]) if self.available else None
            ele = dem_ele if dem_ele is not None else c.get("ele", 0.0)
            elevations.append(ele)

        if len(elevations) < 2:
            return elevations

        smoothed = [elevations[0]]
        for i in range(1, len(elevations)):
            diff = abs(elevations[i] - smoothed[-1])
            if diff >= smoothing_threshold:
                smoothed.append(elevations[i])
            else:
                smoothed.append(smoothed[-1])

        return smoothed
