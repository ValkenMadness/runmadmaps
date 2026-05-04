"""
RMM Production — POST /api/python/calculate-rps
Loads athlete activities from Supabase, runs RPSEngine, upserts scores.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from http.server import BaseHTTPRequestHandler
import json
import uuid
from datetime import datetime, timezone

import supabase
from rps_engine import RPSEngine
from config import Config

ALLOWED_ORIGINS = ["https://runmadmaps.com", "http://localhost:3000"]

_STRIP_KEYS = {"ceiling", "weight", "contribution", "exponent", "decay"}


def _sanitize(obj):
    """Recursively strip formula values (Secrecy Rule)."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items() if k not in _STRIP_KEYS}
    if isinstance(obj, list):
        return [_sanitize(item) for item in obj]
    return obj


def _sanitize_rps(result: dict) -> dict:
    cleaned = _sanitize(result)
    if "layer3_overall" in cleaned:
        cleaned["layer3_overall"].pop("cross_discipline_bonus", None)
    return cleaned


def _merge_activity(row: dict) -> dict:
    """Prepare a Supabase activity row for RPSEngine consumption."""
    merged = {
        "id": row.get("id"),
        "activity_type": row.get("activity_type", "trail"),
        "date": row.get("date"),
        "total_distance_km": row.get("total_distance_km", 0),
        "total_elevation_gain": row.get("total_elevation_gain", 0),
        "rmm_moving_time_seconds": row.get("rmm_moving_time_seconds", 0),
        "km_splits": row.get("km_splits") or [],
        "pace_consistency_score": row.get("pace_consistency_score"),
        "pace_consistency_tier": row.get("pace_consistency_tier"),
        "terrain_difficulty_score": row.get("terrain_difficulty_score"),
        "rmm_avg_pace_sec_per_km": row.get("rmm_avg_pace_sec_per_km", 0),
        "rmm_avg_speed_kmh": row.get("rmm_avg_speed_kmh", 0),
    }
    # start_time as date fallback
    raw = row.get("raw_data") or {}
    if not merged["date"] and raw.get("start_time"):
        merged["date"] = raw["start_time"]
    return merged


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _cors_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0])
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
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

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body_raw = self.rfile.read(content_length)
            try:
                body = json.loads(body_raw)
            except Exception:
                return self._send_json(400, {"error": "Invalid JSON body"})

            athlete_id = body.get("athlete_id", "").strip()
            if not athlete_id:
                return self._send_json(400, {"error": "Missing 'athlete_id'"})

            activity_type = body.get("activity_type", "").strip() or None
            reference_date_str = body.get("reference_date", "").strip() or None

            reference_date = None
            if reference_date_str:
                try:
                    reference_date = datetime.fromisoformat(
                        reference_date_str.replace("Z", "+00:00")
                    )
                except ValueError:
                    return self._send_json(400, {"error": "Invalid 'reference_date' format"})
            else:
                reference_date = datetime.now(timezone.utc)

            # --- Load activities from Supabase ---
            filters = [
                f"athlete_id=eq.{athlete_id}",
                "include_in_scoring=eq.true",
                "purpose=eq.training",
            ]
            if activity_type:
                filters.append(f"activity_type=eq.{activity_type}")

            try:
                rows = supabase.query(
                    "activities",
                    select="id,activity_type,date,total_distance_km,total_elevation_gain,"
                           "rmm_moving_time_seconds,km_splits,pace_consistency_score,"
                           "pace_consistency_tier,terrain_difficulty_score,"
                           "rmm_avg_pace_sec_per_km,rmm_avg_speed_kmh,raw_data",
                    filters=filters,
                ) or []
            except Exception as e:
                return self._send_json(500, {"error": f"Failed to load activities: {str(e)}"})

            activities = [_merge_activity(r) for r in rows]

            # --- Run RPS Engine ---
            engine = RPSEngine()
            now_str = reference_date.strftime("%Y-%m-%dT%H:%M:%SZ")

            if activity_type:
                rps_result = engine.calculate_rps(activities, activity_type, reference_date)
                scores_to_upsert = {activity_type: rps_result}
                layer3 = None
            else:
                all_layers = engine.calculate_all_layers(activities, reference_date)
                scores_to_upsert = {
                    atype: all_layers["layer1"][atype]
                    for atype in ("road", "trail", "hike")
                }
                layer3 = all_layers.get("layer3_overall")
                if layer3:
                    scores_to_upsert["overall"] = layer3

            # --- Upsert rps_scores + insert rps_history ---
            for atype, score in scores_to_upsert.items():
                rps_val = score.get("rps", 0)
                level = score.get("level") or Config.get_level(rps_val)
                level_name = level.get("name", "") if isinstance(level, dict) else ""
                activity_count = score.get("activity_count", 0)

                score_row = {
                    "athlete_id": athlete_id,
                    "activity_type": atype,
                    "rps": rps_val,
                    "level_name": level_name,
                    "level": level,
                    "activity_count": activity_count,
                    "reference_date": now_str,
                    "updated_at": now_str,
                    "rps_data": _sanitize(score),
                }
                try:
                    supabase.upsert("rps_scores", score_row, "athlete_id,activity_type")
                except Exception:
                    pass  # Non-fatal — score calculated, storage failed

                history_row = {
                    "id": str(uuid.uuid4()),
                    "athlete_id": athlete_id,
                    "activity_type": atype,
                    "rps": rps_val,
                    "level_name": level_name,
                    "reference_date": now_str,
                    "created_at": now_str,
                }
                try:
                    supabase.insert("rps_history", history_row)
                except Exception:
                    pass  # Non-fatal

            # --- Build response ---
            if activity_type:
                response = {
                    "athlete_id": athlete_id,
                    "activity_type": activity_type,
                    "reference_date": now_str,
                    "result": _sanitize_rps(scores_to_upsert[activity_type]),
                }
            else:
                response = {
                    "athlete_id": athlete_id,
                    "reference_date": now_str,
                    "layer1": {
                        atype: _sanitize_rps(all_layers["layer1"][atype])
                        for atype in ("road", "trail", "hike")
                    },
                    "layer3_overall": _sanitize_rps(all_layers["layer3_overall"]) if layer3 else None,
                }

            self._send_json(200, response)

        except Exception as e:
            self._send_json(500, {"error": str(e)})
