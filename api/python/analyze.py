"""
RMM Production — POST /api/python/analyze
Public GPX analysis endpoint (no auth required).
Runs GPS processing + route grading. No Supabase writes, no anti-gaming checks.
Response contains only safe-to-expose fields (no formula config values).
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from http.server import BaseHTTPRequestHandler
import json
import re

from gps_processor import GPSStreamProcessor
from route_grader import RouteGrader

ALLOWED_ORIGINS = ["https://runmadmaps.com", "http://localhost:3000"]
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def _parse_multipart(body: bytes, content_type: str):
    """
    Parse multipart/form-data body.
    Returns (fields: dict[str, bytes], filenames: dict[str, str]).
    """
    m = re.search(r'boundary=([^\s;]+)', content_type)
    if not m:
        return {}, {}
    boundary = m.group(1).strip('"').encode()
    delimiter = b"--" + boundary

    fields = {}
    filenames = {}

    for chunk in body.split(delimiter)[1:]:
        if chunk.startswith(b"--"):
            break

        sep = b"\r\n\r\n"
        if sep not in chunk:
            sep = b"\n\n"
            if sep not in chunk:
                continue

        headers_raw, body_part = chunk.split(sep, 1)
        headers_str = headers_raw.decode("utf-8", errors="replace")

        m_name = re.search(r'name="([^"]+)"', headers_str)
        if not m_name:
            continue
        name = m_name.group(1)

        m_fname = re.search(r'filename="([^"]*)"', headers_str)
        if m_fname:
            filenames[name] = m_fname.group(1)

        if body_part.endswith(b"\r\n"):
            body_part = body_part[:-2]

        fields[name] = body_part

    return fields, filenames


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _get_origin(self):
        return self.headers.get("Origin", "")

    def _cors_headers(self, methods="POST, OPTIONS"):
        origin = self._get_origin()
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", methods)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))

            if content_length > MAX_FILE_SIZE:
                return self._send_json(413, {
                    "error": f"File too large (max {MAX_FILE_SIZE / 1024 / 1024:.0f}MB)"
                })

            body = self.rfile.read(content_length)
            content_type = self.headers.get("Content-Type", "")

            if "multipart/form-data" not in content_type:
                return self._send_json(400, {"error": "Expected multipart/form-data"})

            fields, filenames = _parse_multipart(body, content_type)

            if "file" not in fields:
                return self._send_json(400, {"error": "Missing 'file' field"})

            gpx_content = fields["file"].decode("utf-8", errors="replace")
            activity_type = fields.get("activity_type", b"trail").decode("utf-8").strip()

            if activity_type not in ("road", "trail", "hike"):
                activity_type = "trail"

            # --- Parse GPX ---
            processor = GPSStreamProcessor()
            try:
                gps_data = processor.parse_gpx(gpx_content)
            except Exception as e:
                return self._send_json(400, {"error": f"GPX parse failed: {str(e)}"})

            if "error" in gps_data:
                return self._send_json(400, {"error": gps_data.get("error")})

            gps_data["activity_type"] = activity_type

            # --- Grade route ---
            grader = RouteGrader()
            try:
                grade = grader.grade_route(gps_data)
            except Exception as e:
                return self._send_json(500, {"error": f"Route grading failed: {str(e)}"})

            # Elevation profile already built by GPS processor
            elevation_profile = gps_data.get("elevation_profile", [])

            # --- Response (no formula values) ---
            self._send_json(200, {
                "grade": {
                    "difficulty_class": grade["difficulty_class"],
                    "terrain_difficulty_score": grade["terrain_difficulty_score"],
                    "effort_descriptor": grade["effort_descriptor"],
                    "route_type_tag": grade["route_type_tag"],
                    "grade_display": grade["grade_display"],
                },
                "activity": {
                    "total_distance_km": round(gps_data.get("total_distance_km", 0), 2),
                    "total_elevation_gain": round(gps_data.get("total_elevation_gain", 0), 1),
                    "elevation_density": round(gps_data.get("elevation_density", 0), 1),
                    "min_elevation": round(gps_data.get("min_elevation", 0), 1),
                    "max_elevation": round(gps_data.get("max_elevation", 0), 1),
                    "elapsed_time_seconds": int(gps_data.get("elapsed_time_seconds", 0)),
                    "rmm_moving_time_seconds": int(gps_data.get("rmm_moving_time_seconds", 0)),
                    "climb_count": gps_data.get("climb_count", 0),
                    "climb_structure": gps_data.get("climb_structure", "Even"),
                    "point_count": gps_data.get("point_count", 0),
                },
                "elevation_profile": elevation_profile,
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})
