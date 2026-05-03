"""
RMM Production — GET /api/python/race-readiness
Assesses athlete readiness for a specific route.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
from datetime import datetime, timezone, timedelta

import supabase
from race_readiness import assess_readiness
from config import Config

ALLOWED_ORIGINS = ["https://runmadmaps.com", "http://localhost:3000"]


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _cors_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0])
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Credentials", "true")

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

    def do_GET(self):
        try:
            # --- Parse query params ---
            path = self.path
            qs = ""
            if "?" in path:
                _, qs = path.split("?", 1)
            params = urllib.parse.parse_qs(qs)

            route_id = (params.get("route_id", [""])[0]).strip()
            athlete_id = (params.get("athlete_id", [""])[0]).strip()

            if not route_id:
                return self._send_json(400, {"error": "Missing 'route_id' query param"})
            if not athlete_id:
                return self._send_json(400, {"error": "Missing 'athlete_id' query param"})

            # --- Load route activity ---
            try:
                route_rows = supabase.query(
                    "activities",
                    select="id,activity_type,date,display_name,filename,"
                           "total_distance_km,total_elevation_gain",
                    filters=[f"id=eq.{route_id}"],
                    limit=1,
                ) or []
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to load route: {str(e)}"})

            if not route_rows:
                return self._send_json(404, {"error": f"Route '{route_id}' not found"})

            route_row = route_rows[0]
            activity_type = route_row.get("activity_type", "trail")

            # --- Load route grade ---
            try:
                grade_rows = supabase.query(
                    "route_analyses",
                    select="grade_data",
                    filters=[f"activity_id=eq.{route_id}"],
                    limit=1,
                ) or []
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to load grade: {str(e)}"})

            grade_data = grade_rows[0]["grade_data"] if grade_rows else {}

            # Build route_data for assess_readiness
            route_data = {
                "id": route_id,
                "display_name": route_row.get("display_name") or route_row.get("filename", ""),
                "filename": route_row.get("filename", ""),
                "activity_type": activity_type,
                "distance_km": route_row.get("total_distance_km", 0),
                "elevation_gain_m": route_row.get("total_elevation_gain", 0),
                "difficulty_class": grade_data.get("difficulty_class", "D"),
                "route_type_tag": grade_data.get("route_type_tag"),
            }

            # --- Load training activities (90-day window) ---
            window_days = Config.RPS_WINDOW_DAYS
            reference_date = datetime.now(timezone.utc)
            cutoff = (reference_date - timedelta(days=window_days)).strftime("%Y-%m-%dT%H:%M:%SZ")

            try:
                training_rows = supabase.query(
                    "activities",
                    select="id,activity_type,date,display_name,filename,"
                           "total_distance_km,total_elevation_gain,"
                           "rmm_moving_time_seconds,elevation_density,"
                           "rmm_avg_pace_sec_per_km",
                    filters=[
                        f"athlete_id=eq.{athlete_id}",
                        "purpose=eq.training",
                        "include_in_scoring=eq.true",
                        f"activity_type=eq.{activity_type}",
                        f"date=gte.{cutoff}",
                    ],
                ) or []
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to load training activities: {str(e)}"})

            # --- Run Race Readiness ---
            result = assess_readiness(route_data, training_rows, reference_date)

            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {"error": str(e)})
