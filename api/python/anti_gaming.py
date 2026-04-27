"""
RMM Production — Anti-Gaming Validation
Nine validation flags run on activity ingest.
"""
import math
from datetime import datetime
from typing import Optional

from config import Config
from gps_processor import haversine


class AntiGamingValidator:
    """Runs all validation flags on an activity."""

    def validate(self, activity: dict, all_activities: list = None) -> list:
        """
        Run all applicable validation flags on an activity.

        Args:
            activity: GPS processor output for the activity
            all_activities: All stored activities (for cross-activity checks)

        Returns:
            List of flag dicts with flag_id, description, severity.
        """
        flags = []
        all_activities = all_activities or []

        # F1 — Activity Type vs GPS Mismatch
        f1 = self._check_f1(activity)
        if f1:
            flags.append(f1)

        # F2 — Impossible Location Jump
        f2_flags = self._check_f2(activity, all_activities)
        flags.extend(f2_flags)

        # F3 — Split Activity Detection
        f3_flags = self._check_f3(activity, all_activities)
        flags.extend(f3_flags)

        # F4 — Linear GPS Trace
        f4 = self._check_f4(activity)
        if f4:
            flags.append(f4)

        # F5 — Speed Anomaly
        f5 = self._check_f5(activity)
        if f5:
            flags.append(f5)

        # F8 — Fabricated GPS Detection (requires timestamp data)
        # F10 — Short Activity Validation (requires timestamp data)
        if not activity.get("has_timestamps", True):
            flags.append({
                "flag": "INFO",
                "name": "Timestamp-Dependent Checks Skipped",
                "description": "F8 and F10 require per-point timestamp data which is absent in this GPX file.",
                "severity": "info",
            })
        else:
            f8 = self._check_f8(activity)
            if f8:
                flags.append(f8)

            tier = activity.get("pace_consistency_tier", 1)
            if tier >= 2:
                f10 = self._check_f10(activity)
                if f10:
                    flags.append(f10)

        # F9 — Elevation Yo-Yo Detection (coordinate-only, no timestamps needed)
        f9 = self._check_f9(activity)
        if f9:
            flags.append(f9)

        return flags

    def _check_f1(self, activity: dict) -> Optional[dict]:
        """F1: Activity type vs GPS mismatch."""
        a_type = activity.get("activity_type", "trail")
        density = activity.get("elevation_density", 0)

        if a_type == "trail" and density < Config.AG["f1_min_elev_density"]:
            return {
                "flag": "F1",
                "name": "Activity Type vs GPS Mismatch",
                "description": f"Trail run declared but elevation density is only {density:.1f} m/km (threshold: {Config.AG['f1_min_elev_density']} m/km)",
                "severity": "review",
            }
        return None

    def _check_f2(self, activity: dict, all_activities: list) -> list:
        """F2: Impossible location jump."""
        flags = []
        start_lat = activity.get("start_lat")
        start_lon = activity.get("start_lon")
        start_time = activity.get("start_time")
        if not all([start_lat, start_lon, start_time]):
            return flags

        for other in all_activities:
            other_lat = other.get("start_lat")
            other_lon = other.get("start_lon")
            other_time = other.get("start_time")
            if not all([other_lat, other_lon, other_time]):
                continue
            if other.get("id") == activity.get("id"):
                continue

            dist_km = haversine(start_lat, start_lon, other_lat, other_lon) / 1000
            t1 = start_time if isinstance(start_time, datetime) else datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            t2 = other_time if isinstance(other_time, datetime) else datetime.fromisoformat(other_time.replace("Z", "+00:00"))
            time_diff_min = abs((t1 - t2).total_seconds()) / 60

            if (dist_km > Config.AG["f2_max_distance_km"]
                and time_diff_min < Config.AG["f2_max_time_minutes"]):
                flags.append({
                    "flag": "F2",
                    "name": "Impossible Location Jump",
                    "description": f"Activity starts {dist_km:.1f} km from another activity that started {time_diff_min:.0f} min apart",
                    "severity": "suppress",
                })
        return flags

    def _check_f3(self, activity: dict, all_activities: list) -> list:
        """F3: Split activity detection."""
        flags = []
        start_lat = activity.get("start_lat")
        start_lon = activity.get("start_lon")
        start_time = activity.get("start_time")
        distance_km = activity.get("total_distance_km", 0)

        if not all([start_lat, start_lon, start_time]):
            return flags

        # Exception: activities < 2km excluded
        if distance_km < Config.AG["f3_min_distance_km"]:
            return flags

        for other in all_activities:
            if other.get("id") == activity.get("id"):
                continue
            other_lat = other.get("start_lat")
            other_lon = other.get("start_lon")
            other_time = other.get("start_time")
            if not all([other_lat, other_lon, other_time]):
                continue

            dist_m = haversine(start_lat, start_lon, other_lat, other_lon)
            t1 = start_time if isinstance(start_time, datetime) else datetime.fromisoformat(start_time.replace("Z", "+00:00"))
            t2 = other_time if isinstance(other_time, datetime) else datetime.fromisoformat(other_time.replace("Z", "+00:00"))
            time_diff_h = abs((t1 - t2).total_seconds()) / 3600

            if (dist_m < Config.AG["f3_max_distance_m"]
                and time_diff_h < Config.AG["f3_max_time_hours"]):
                # Exception: >30% pace difference = warm-up/workout
                my_pace = activity.get("rmm_avg_pace_sec_per_km", 0)
                other_pace = other.get("rmm_avg_pace_sec_per_km", 0)
                if my_pace > 0 and other_pace > 0:
                    pace_diff = abs(my_pace - other_pace) / max(my_pace, other_pace)
                    if pace_diff > Config.AG["f3_pace_diff_pct"]:
                        continue  # Warm-up/workout split — not flagged

                flags.append({
                    "flag": "F3",
                    "name": "Split Activity Detection",
                    "description": f"Activity starts {dist_m:.0f}m from another, {time_diff_h:.1f}h apart. Potential split to inflate frequency.",
                    "severity": "merge",
                })
        return flags

    def _check_f4(self, activity: dict) -> Optional[dict]:
        """F4: Linear/stationary GPS trace."""
        profile = activity.get("elevation_profile", [])
        if len(profile) < 10:
            return None

        # Check if GPS coords form a very straight line
        lats = [p.get("elevation", 0) for p in profile]  # Using as proxy
        # Real implementation would check lat/lon variance
        return None  # Placeholder — needs full GPS coord access

    def _check_f5(self, activity: dict) -> Optional[dict]:
        """F5: Speed anomaly vs activity type."""
        a_type = activity.get("activity_type", "trail")
        speed = activity.get("rmm_avg_speed_kmh", 0)

        thresholds = {
            "hike": Config.AG["f5_hike_max_speed"],
            "trail": Config.AG["f5_trail_max_speed"],
        }
        max_speed = thresholds.get(a_type)
        if max_speed and speed > max_speed:
            return {
                "flag": "F5",
                "name": "Speed Anomaly",
                "description": f"{a_type.title()} at {speed:.1f} km/h exceeds maximum expected {max_speed} km/h",
                "severity": "review",
            }
        return None

    def _check_f8(self, activity: dict) -> Optional[dict]:
        """F8: Fabricated GPS detection via timestamp/speed regularity."""
        splits = activity.get("km_splits", [])
        distance = activity.get("total_distance_km", 0)

        if distance < Config.AG["f8_min_distance_km"] or len(splits) < 3:
            return None

        # Check coefficient of variation of split times
        times = [s["time_seconds"] for s in splits if not s.get("partial")]
        if len(times) < 3:
            return None

        mean_t = sum(times) / len(times)
        if mean_t == 0:
            return None
        std_t = math.sqrt(sum((t - mean_t) ** 2 for t in times) / len(times))
        cv = std_t / mean_t

        if cv < Config.AG["f8_timestamp_cv"]:
            return {
                "flag": "F8",
                "name": "Fabricated GPS Detection",
                "description": f"Split time CV of {cv:.4f} is suspiciously regular (threshold: {Config.AG['f8_timestamp_cv']})",
                "severity": "suppress",
            }
        return None

    def _check_f9(self, activity: dict) -> Optional[dict]:
        """F9: Elevation yo-yo detection."""
        density = activity.get("elevation_density", 0)
        revisit_pct = activity.get("coordinate_revisit_pct", 0)

        if (density > Config.AG["f9_elev_density"]
            and revisit_pct > Config.AG["f9_revisit_pct"]):
            return {
                "flag": "F9",
                "name": "Elevation Yo-Yo Detection",
                "description": f"Elevation density {density:.0f} m/km with {revisit_pct:.0%} coordinate revisiting. Elevation capped at unique route.",
                "severity": "cap_elevation",
            }
        return None

    def _check_f10(self, activity: dict) -> Optional[dict]:
        """F10: Short Activity Validation Failure.

        Runs on Tier 2/3 activities only (< PACE_CONSISTENCY_MIN_SPLITS_FULL km splits).
        Checks GPS continuity, movement ratio, and elapsed-to-distance ratio.
        """
        a_type     = activity.get("activity_type", "trail")
        distance   = activity.get("total_distance_km", 0)
        elapsed    = activity.get("elapsed_time_seconds", 0)
        speed      = activity.get("rmm_avg_speed_kmh", 0)
        km_splits  = activity.get("km_splits", [])

        # Teleport speed limits (km/h) per activity type
        if a_type == "hike":
            teleport_limit = Config.AG["f10_teleport_speed_hike_kmh"]
        else:
            teleport_limit = Config.AG["f10_teleport_speed_run_kmh"]

        # Check 1 — GPS continuity via km split implied speeds
        for s in km_splits:
            pace = s.get("pace_sec_per_km", 0)
            if pace > 0:
                split_speed_kmh = 3600 / pace
                if split_speed_kmh > teleport_limit:
                    return {
                        "flag": "F10",
                        "name": "Short Activity Validation Failure",
                        "description": (
                            f"Split implied speed {split_speed_kmh:.1f} km/h exceeds "
                            f"teleport threshold {teleport_limit} km/h for {a_type}"
                        ),
                        "severity": "review",
                    }

        # Check 2 — Elapsed-to-distance ratio
        if elapsed > 0 and distance > 0:
            elapsed_avg_speed = distance / (elapsed / 3600)
            movement_threshold_kmh = Config.MOVING_THRESHOLDS.get(a_type, 1.0)
            if elapsed_avg_speed < movement_threshold_kmh:
                return {
                    "flag": "F10",
                    "name": "Short Activity Validation Failure",
                    "description": (
                        f"Elapsed-to-distance average speed {elapsed_avg_speed:.2f} km/h "
                        f"is below {a_type} movement threshold {movement_threshold_kmh} km/h"
                    ),
                    "severity": "review",
                }

        # Check 3 — Movement ratio (moving time / elapsed time)
        if elapsed > 0:
            moving_time = activity.get("rmm_moving_time_seconds", 0)
            movement_ratio = moving_time / elapsed
            min_ratio = Config.AG["f10_min_movement_ratio"]
            if movement_ratio < min_ratio:
                return {
                    "flag": "F10",
                    "name": "Short Activity Validation Failure",
                    "description": (
                        f"Movement ratio {movement_ratio:.0%} is below minimum {min_ratio:.0%}. "
                        f"Activity was stationary for {(1 - movement_ratio):.0%} of elapsed time."
                    ),
                    "severity": "review",
                }

        return None
