"""
RMM Production — POST /api/python/recalculate-decay
Recalculates RPS for all (or one) athletes with today as reference date.
Intended for cron invocation to keep scores current as activities decay.
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

ALLOWED_ORIGIN = "https://runmadmaps.com"

_STRIP_KEYS = {"ceiling", "weight", "contribution", "exponent", "decay"}


def _sanitize(obj):
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items() if k not in _STRIP_KEYS}
    if isinstance(obj, list):
        return [_sanitize(item) for item in obj]
    return obj


def _merge_activity(row: dict) -> dict:
    raw = row.get("raw_data") or {}
    date = row.get("date")
    if not date and raw.get("start_time"):
        date = raw["start_time"]
    return {
        "id": row.get("id"),
        "activity_type": row.get("activity_type", "trail"),
        "date": date,
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


def _recalculate_for_athlete(athlete_id: str, reference_date: datetime, now_str: str) -> dict:
    """Recalculate all-layers RPS for one athlete. Returns summary dict."""
    try:
        rows = supabase.query(
            "activities",
            select="id,activity_type,date,total_distance_km,total_elevation_gain,"
                   "rmm_moving_time_seconds,km_splits,pace_consistency_score,"
                   "pace_consistency_tier,terrain_difficulty_score,"
                   "rmm_avg_pace_sec_per_km,rmm_avg_speed_kmh,raw_data",
            filters=[
                f"athlete_id=eq.{athlete_id}",
                "include_in_scoring=eq.true",
                "purpose=eq.training",
            ],
        ) or []
    except Exception as e:
        return {"athlete_id": athlete_id, "status": "error", "error": str(e)}

    activities = [_merge_activity(r) for r in rows]
    engine = RPSEngine()
    all_layers = engine.calculate_all_layers(activities, reference_date)

    discipline_results = {}
    for atype in ("road", "trail", "hike"):
        score = all_layers["layer1"][atype]
        rps_val = score.get("rps", 0)
        level = score.get("level") or Config.get_level(rps_val)
        level_name = level.get("name", "") if isinstance(level, dict) else ""

        score_row = {
            "athlete_id": athlete_id,
            "activity_type": atype,
            "rps": rps_val,
            "level_name": level_name,
            "level": level,
            "activity_count": score.get("activity_count", 0),
            "reference_date": now_str,
            "updated_at": now_str,
            "rps_data": _sanitize(score),
        }
        try:
            supabase.upsert("rps_scores", score_row, "athlete_id,activity_type")
        except Exception:
            pass

        try:
            supabase.insert("rps_history", {
                "id": str(uuid.uuid4()),
                "athlete_id": athlete_id,
                "activity_type": atype,
                "rps": rps_val,
                "level_name": level_name,
                "reference_date": now_str,
                "created_at": now_str,
            })
        except Exception:
            pass

        discipline_results[atype] = {"rps": rps_val, "level": level_name}

    # Layer 3 overall
    layer3 = all_layers.get("layer3_overall")
    if layer3:
        rps_val = layer3.get("rps", 0)
        level = layer3.get("level") or Config.get_level(rps_val)
        level_name = level.get("name", "") if isinstance(level, dict) else ""
        try:
            supabase.upsert("rps_scores", {
                "athlete_id": athlete_id,
                "activity_type": "overall",
                "rps": rps_val,
                "level_name": level_name,
                "level": level,
                "activity_count": layer3.get("activity_count", 0),
                "reference_date": now_str,
                "updated_at": now_str,
                "rps_data": _sanitize(layer3),
            }, "athlete_id,activity_type")
        except Exception:
            pass
        try:
            supabase.insert("rps_history", {
                "id": str(uuid.uuid4()),
                "athlete_id": athlete_id,
                "activity_type": "overall",
                "rps": rps_val,
                "level_name": level_name,
                "reference_date": now_str,
                "created_at": now_str,
            })
        except Exception:
            pass
        discipline_results["overall"] = {"rps": rps_val, "level": level_name}

    return {
        "athlete_id": athlete_id,
        "status": "ok",
        "scores": discipline_results,
        "activity_count": len(rows),
    }


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
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
            body_raw = self.rfile.read(content_length)
            body = {}
            if body_raw.strip():
                try:
                    body = json.loads(body_raw)
                except Exception:
                    pass

            specific_athlete = body.get("athlete_id", "").strip() or None

            reference_date = datetime.now(timezone.utc)
            now_str = reference_date.strftime("%Y-%m-%dT%H:%M:%SZ")

            # --- Collect athlete IDs ---
            if specific_athlete:
                athlete_ids = [specific_athlete]
            else:
                try:
                    rows = supabase.query(
                        "activities",
                        select="athlete_id",
                        filters=["purpose=eq.training", "include_in_scoring=eq.true"],
                    ) or []
                    athlete_ids = list({r["athlete_id"] for r in rows if r.get("athlete_id")})
                except Exception as e:
                    return self._send_json(500, {"error": f"Failed to load athletes: {str(e)}"})

            if not athlete_ids:
                return self._send_json(200, {
                    "reference_date": now_str,
                    "athletes_processed": 0,
                    "results": [],
                })

            # --- Recalculate for each athlete ---
            results = []
            for athlete_id in athlete_ids:
                result = _recalculate_for_athlete(athlete_id, reference_date, now_str)
                results.append(result)

                # Log to processing_log
                try:
                    supabase.insert("processing_log", {
                        "id": str(uuid.uuid4()),
                        "event_type": "decay_recalculate",
                        "athlete_id": athlete_id,
                        "message": f"RPS recalculated — status: {result['status']}",
                        "created_at": now_str,
                    })
                except Exception:
                    pass

            succeeded = sum(1 for r in results if r.get("status") == "ok")
            failed = len(results) - succeeded

            self._send_json(200, {
                "reference_date": now_str,
                "athletes_processed": len(results),
                "succeeded": succeeded,
                "failed": failed,
                "results": results,
            })

        except Exception as e:
            self._send_json(500, {"error": str(e)})
