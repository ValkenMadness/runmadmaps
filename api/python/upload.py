"""
RMM Production — POST /api/python/upload
Accepts a GPX file via multipart/form-data.
Runs GPS processing, anti-gaming, route grading, and stores to Supabase.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from http.server import BaseHTTPRequestHandler
import json
import uuid
import re
from datetime import datetime, timezone, timedelta

import supabase
from gps_processor import GPSStreamProcessor
from route_grader import RouteGrader
from anti_gaming import AntiGamingValidator

ALLOWED_ORIGIN = "https://runmadmaps.com"


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


def _utc_z() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _utc_offset_hours(hours: float) -> str:
    dt = datetime.now(timezone.utc) - timedelta(hours=hours)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _cors_headers(self, methods="POST, OPTIONS"):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
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
            body = self.rfile.read(content_length)
            content_type = self.headers.get("Content-Type", "")

            if "multipart/form-data" not in content_type:
                return self._send_json(400, {"error": "Expected multipart/form-data"})

            fields, filenames = _parse_multipart(body, content_type)

            if "file" not in fields:
                return self._send_json(400, {"error": "Missing 'file' field"})

            gpx_content = fields["file"].decode("utf-8", errors="replace")
            activity_type = fields.get("activity_type", b"trail").decode("utf-8").strip()
            purpose = fields.get("purpose", b"training").decode("utf-8").strip()
            athlete_id = fields.get("athlete_id", b"").decode("utf-8").strip()
            filename = filenames.get("file", "upload.gpx")

            if not athlete_id:
                return self._send_json(400, {"error": "Missing 'athlete_id' field"})

            if activity_type not in ("road", "trail", "hike"):
                activity_type = "trail"
            if purpose not in ("training", "route"):
                purpose = "training"

            # --- Parse GPX ---
            processor = GPSStreamProcessor()
            try:
                gps_data = processor.parse_gpx(gpx_content)
            except Exception as e:
                return self._send_json(400, {"error": f"GPX parse failed: {str(e)}"})

            # Inject user metadata for anti-gaming F1 check
            gps_data["activity_type"] = activity_type

            # --- Load recent activities for anti-gaming cross-checks (F2/F3) ---
            cutoff_24h = _utc_offset_hours(24)
            try:
                recent_raw = supabase.query(
                    "activities",
                    select="id,start_lat,start_lon,start_time,total_distance_km,rmm_avg_pace_sec_per_km",
                    filters=[
                        f"athlete_id=eq.{athlete_id}",
                        f"date=gte.{cutoff_24h}",
                    ],
                )
            except Exception:
                recent_raw = []

            recent_activities = [
                {
                    "id": r.get("id"),
                    "start_lat": r.get("start_lat"),
                    "start_lon": r.get("start_lon"),
                    "start_time": r.get("start_time"),
                    "total_distance_km": r.get("total_distance_km"),
                    "rmm_avg_pace_sec_per_km": r.get("rmm_avg_pace_sec_per_km"),
                }
                for r in (recent_raw or [])
            ]

            # --- Anti-gaming ---
            validator = AntiGamingValidator()
            flags = validator.validate(gps_data, recent_activities)
            include_in_scoring = not any(f.get("severity") == "suppress" for f in flags)

            # --- Save activity ---
            activity_id = str(uuid.uuid4())
            now = _utc_z()

            activity_row = {
                "id": activity_id,
                "athlete_id": athlete_id,
                "filename": filename,
                "activity_type": activity_type,
                "purpose": purpose,
                "date": gps_data.get("start_time") or now,
                "display_name": filename,
                "created_at": now,
                "raw_data": gps_data,
                "raw_gpx": gpx_content,
                "flags": flags,
                "include_in_scoring": include_in_scoring,
                # Denormalised for queries
                "total_distance_km": gps_data.get("total_distance_km", 0),
                "total_elevation_gain": gps_data.get("total_elevation_gain", 0),
                "elapsed_time_seconds": gps_data.get("elapsed_time_seconds", 0),
                "rmm_moving_time_seconds": gps_data.get("rmm_moving_time_seconds", 0),
                "elevation_density": gps_data.get("elevation_density", 0),
                "start_lat": gps_data.get("start_lat"),
                "start_lon": gps_data.get("start_lon"),
                "start_time": gps_data.get("start_time"),
                "rmm_avg_pace_sec_per_km": gps_data.get("rmm_avg_pace_sec_per_km", 0),
                "rmm_avg_speed_kmh": gps_data.get("rmm_avg_speed_kmh", 0),
                "terrain_difficulty_score": gps_data.get("terrain_difficulty_score"),
                "km_splits": gps_data.get("km_splits", []),
                "pace_consistency_score": gps_data.get("pace_consistency_score"),
                "pace_consistency_tier": gps_data.get("pace_consistency_tier"),
            }

            try:
                supabase.insert("activities", activity_row)
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to save activity: {str(e)}"})

            # --- Grade route ---
            grader = RouteGrader()
            try:
                grade = grader.grade_route(gps_data)
            except Exception as e:
                return self._send_json(500, {"error": f"Route grading failed: {str(e)}"})

            grade_id = str(uuid.uuid4())
            try:
                supabase.insert("route_analyses", {
                    "id": grade_id,
                    "activity_id": activity_id,
                    "created_at": now,
                    "grade_data": grade,
                })
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to save grade: {str(e)}"})

            # --- Response (no formula values) ---
            self._send_json(200, {
                "activity_id": activity_id,
                "flags": flags,
                "flag_count": len(flags),
                "include_in_scoring": include_in_scoring,
                "grade": {
                    "difficulty_class": grade["difficulty_class"],
                    "terrain_difficulty_score": grade["terrain_difficulty_score"],
                    "effort_descriptor": grade["effort_descriptor"],
                    "route_type_tag": grade["route_type_tag"],
                    "grade_display": grade["grade_display"],
                },
                "activity": {
                    "total_distance_km": round(gps_data.get("total_distance_km") or 0, 2),
                    "total_elevation_gain": round(gps_data.get("total_elevation_gain") or 0, 1),
                    "elapsed_time_seconds": gps_data.get("elapsed_time_seconds", 0),
                    "rmm_moving_time_seconds": gps_data.get("rmm_moving_time_seconds", 0),
                    "start_time": gps_data.get("start_time"),
                    "activity_type": activity_type,
                    "purpose": purpose,
                },
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})
