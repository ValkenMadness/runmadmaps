"""
RMM Production — Race Readiness Engine
Five-check system assessing athlete readiness for a specific route.
Read-only — does not modify any scoring data.
"""
from datetime import datetime, timezone, timedelta

from config import Config

_CLASS_ORDER = {"F": 0, "E": 1, "D": 2, "C": 3, "B": 4, "A": 5}


def _class_gte(activity_class: str, target_class: str) -> bool:
    return _CLASS_ORDER.get(activity_class, 0) >= _CLASS_ORDER.get(target_class, 0)


def _get_base_class(distance_km: float, elevation_density: float) -> str:
    """Derive base difficulty class from distance × elevation density bands,
    using the V3 6-band system and BASE_CLASS_MATRIX from Config."""
    gd = Config.GRADE_DISTANCE
    ge = Config.GRADE_ELEVATION

    if distance_km < gd["short_max"]:
        dist_band = "Short"
    elif distance_km < gd["medium_max"]:
        dist_band = "Medium"
    elif distance_km < gd["long_max"]:
        dist_band = "Long"
    else:
        dist_band = "Ultra"

    if elevation_density < ge["low_max"]:
        elev_band = "Low"
    elif elevation_density < ge["rolling_max"]:
        elev_band = "Rolling"
    elif elevation_density < ge["hilly_max"]:
        elev_band = "Hilly"
    elif elevation_density < ge["steep_max"]:
        elev_band = "Steep"
    elif elevation_density < ge["mountain_max"]:
        elev_band = "Mountain"
    else:
        elev_band = "Extreme"

    key = f"{dist_band}_{elev_band}"
    return Config.BASE_CLASS_MATRIX.get(key, "D")


def _distance_band(distance_km: float) -> str:
    if distance_km < 10:
        return "under_10"
    elif distance_km < 25:
        return "10_25"
    elif distance_km < 50:
        return "25_50"
    elif distance_km < 100:
        return "50_100"
    return "over_100"


def _check_distance_coverage(route_data: dict, activities: list, config: dict) -> dict:
    route_km = route_data["distance_km"] or 0
    band = _distance_band(route_km)
    coverage_pct = config["coverage_pct"][band]
    required_km = round(route_km * coverage_pct, 2)

    best_km = 0.0
    best_name = None
    best_date = None
    for a in activities:
        dist = a.get("total_distance_km") or 0
        if dist > best_km:
            best_km = dist
            best_name = a.get("display_name") or a.get("filename", "")
            best_date = a.get("date") or ""

    best_km = round(best_km, 2)
    status = "PASS" if best_km >= required_km else "FAIL"
    progress_pct = round(min(100.0, best_km / required_km * 100) if required_km > 0 else 100.0, 1)

    return {
        "check": "distance_coverage",
        "status": status,
        "required_km": required_km,
        "best_single_km": best_km,
        "best_activity_name": best_name,
        "best_activity_date": best_date[:10] if best_date else None,
        "progress_pct": progress_pct,
    }


def _check_volume_load(route_data: dict, activities: list, config: dict) -> dict:
    route_km = route_data["distance_km"] or 0
    band = _distance_band(route_km)
    multiplier = config["volume_multiplier"][band]
    required_km = round(route_km * multiplier, 2)

    actual_km = round(sum((a.get("total_distance_km") or 0) for a in activities), 2)
    status = "PASS" if actual_km >= required_km else "FAIL"
    progress_pct = round(min(100.0, actual_km / required_km * 100) if required_km > 0 else 100.0, 1)

    return {
        "check": "volume_load",
        "status": status,
        "required_km": required_km,
        "actual_km": actual_km,
        "progress_pct": progress_pct,
    }


def _check_performance_index(route_data: dict, activities: list, config: dict) -> dict:
    target_class = route_data.get("difficulty_class", "D")
    activity_type = route_data.get("activity_type", "trail")
    required_pi = config["pi_threshold"].get(target_class, 0.85)
    expected_paces = config["expected_pace"].get(activity_type, config["expected_pace"]["trail"])

    all_with_pi = []
    for a in activities:
        dist = a.get("total_distance_km") or 0
        moving_time = a.get("rmm_moving_time_seconds") or 0
        elev_density = a.get("elevation_density") or 0

        if dist <= 0 or moving_time <= 0:
            continue

        base_class = _get_base_class(dist, elev_density)
        expected_pace = expected_paces.get(base_class)
        if not expected_pace:
            continue

        expected_time = expected_pace * dist
        pi = round(expected_time / moving_time, 4)
        qualifies = _class_gte(base_class, target_class) and pi >= required_pi

        all_with_pi.append({
            "activity_name": a.get("display_name") or a.get("filename", ""),
            "date": (a.get("date") or "")[:10],
            "distance_km": round(dist, 2),
            "base_class": base_class,
            "pi": pi,
            "qualifies": qualifies,
        })

    all_with_pi.sort(key=lambda x: x["pi"], reverse=True)
    qualifying = [x for x in all_with_pi if x["qualifies"]]
    right_class = [x for x in all_with_pi if _class_gte(x["base_class"], target_class)]
    best = qualifying[0] if qualifying else None
    best_rc_pi = max((x["pi"] for x in right_class), default=0.0)

    status = "PASS" if best else "FAIL"

    if best:
        progress_pct = 100.0
    elif right_class:
        progress_pct = round(min(99.9, best_rc_pi / required_pi * 100) if required_pi > 0 else 0.0, 1)
    else:
        progress_pct = 0.0

    note = None
    if status == "FAIL":
        if not right_class:
            note = f"No activities found on Class {target_class} or higher routes."
        else:
            note = f"Best PI on a qualifying-class route is {best_rc_pi:.2f} — need {required_pi:.2f} on a Class {target_class} or higher route."

    return {
        "check": "performance_index",
        "status": status,
        "target_class": target_class,
        "required_pi": required_pi,
        "best_qualifying_pi": best["pi"] if best else None,
        "best_qualifying_activity": best["activity_name"] if best else None,
        "best_qualifying_activity_date": best["date"] if best else None,
        "best_qualifying_activity_class": best["base_class"] if best else None,
        "qualifying_activities_count": len(qualifying),
        "all_activities_with_pi": all_with_pi,
        "progress_pct": progress_pct,
        "note": note,
    }


def _check_recency(activities: list, config: dict, reference_date: datetime) -> dict:
    recency_days = config["recency_window_days"]
    min_activities = config["recency_min_activities"]
    window_start = reference_date - timedelta(days=recency_days)

    recent_dates = []
    for a in activities:
        date_str = a.get("date")
        if not date_str:
            continue
        try:
            a_date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if a_date >= window_start:
                recent_dates.append(a_date)
        except ValueError:
            pass

    recent_dates.sort(reverse=True)
    actual = len(recent_dates)
    status = "PASS" if actual >= min_activities else "FAIL"
    progress_pct = round(min(100.0, actual / min_activities * 100) if min_activities > 0 else 100.0, 1)

    most_recent = recent_dates[0] if recent_dates else None
    days_since = round((reference_date - most_recent).total_seconds() / 86400) if most_recent else None

    return {
        "check": "recency",
        "status": status,
        "required_activities": min_activities,
        "actual_activities": actual,
        "recency_window_days": recency_days,
        "most_recent_activity_date": most_recent.date().isoformat() if most_recent else None,
        "days_since_last_activity": days_since,
        "progress_pct": progress_pct,
    }


def _check_elevation_coverage(route_data: dict, activities: list, config: dict) -> dict:
    route_elev = route_data.get("elevation_gain_m") or 0
    auto_pass_threshold = config["elevation_auto_pass_threshold"]
    multiplier = config["elevation_multiplier"]
    actual_m = round(sum((a.get("total_elevation_gain") or 0) for a in activities), 1)

    if route_elev < auto_pass_threshold:
        return {
            "check": "elevation_coverage",
            "status": "AUTO_PASS",
            "required_m": 0,
            "actual_m": actual_m,
            "progress_pct": 100.0,
        }

    required_m = round(route_elev * multiplier, 1)
    status = "PASS" if actual_m >= required_m else "FAIL"
    progress_pct = round(min(100.0, actual_m / required_m * 100) if required_m > 0 else 100.0, 1)

    return {
        "check": "elevation_coverage",
        "status": status,
        "required_m": required_m,
        "actual_m": actual_m,
        "progress_pct": progress_pct,
    }


def _build_summary_message(route_data: dict, checks: list, activity_type: str) -> str:
    passed = [c for c in checks if c["status"] in ("PASS", "AUTO_PASS")]
    failed = [c for c in checks if c["status"] == "FAIL"]
    parts = []

    dc = next((c for c in passed if c["check"] == "distance_coverage"), None)
    if dc:
        parts.append(f"Your longest {activity_type} ({dc['best_single_km']:.1f} km) covers this route comfortably.")
    if any(c["check"] == "elevation_coverage" for c in passed):
        parts.append("Your elevation base is strong.")
    if any(c["check"] == "recency" for c in passed):
        parts.append("Your training is current.")

    for c in failed:
        if c["check"] == "distance_coverage":
            parts.append(
                f"Your longest single effort ({c['best_single_km']:.1f} km) falls short of the {c['required_km']:.1f} km needed."
            )
        elif c["check"] == "volume_load":
            parts.append(
                f"Volume needs work — you've covered {c['actual_km']:.0f} km of the {c['required_km']:.0f} km needed over 90 days."
            )
        elif c["check"] == "performance_index":
            if c.get("best_qualifying_pi"):
                parts.append(f"Best PI on a qualifying route is {c['best_qualifying_pi']:.2f} — need {c['required_pi']:.2f}.")
            else:
                parts.append(f"No qualifying Performance Index on a Class {c['target_class']} or higher route yet.")
        elif c["check"] == "recency":
            word = "activity" if c["actual_activities"] == 1 else "activities"
            parts.append(
                f"Only {c['actual_activities']} {word} in the last {c['recency_window_days']} days — need {c['required_activities']}."
            )
        elif c["check"] == "elevation_coverage":
            parts.append(f"Elevation training is {c['actual_m']:.0f} m of {c['required_m']:.0f} m needed.")

    if not parts:
        name = route_data.get("display_name") or route_data.get("filename", "this route")
        parts.append(f"All five checks pass — ready for {name}.")

    return " ".join(parts)


def assess_readiness(
    route_data: dict,
    training_activities: list,
    reference_date: datetime = None,
) -> dict:
    """
    Assess race readiness for an athlete against a specific route.

    Args:
        route_data: Route with distance_km, elevation_gain_m, difficulty_class,
                    activity_type, display_name (all pre-extracted).
        training_activities: Flat activity dicts (raw_data merged) for the profile,
                             within the 90-day window, matching the route's activity_type.
        reference_date: Reference date (default: now UTC).

    Returns:
        Complete readiness assessment dict.
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)

    activity_type = route_data.get("activity_type", "trail")

    config = {
        "coverage_pct": {
            "under_10": Config.RR_COVERAGE_PCT["under_10"],
            "10_25":    Config.RR_COVERAGE_PCT["10_25"],
            "25_50":    Config.RR_COVERAGE_PCT["25_50"],
            "50_100":   Config.RR_COVERAGE_PCT["50_100"],
            "over_100": Config.RR_COVERAGE_PCT["over_100"],
        },
        "volume_multiplier": {
            "under_10": Config.RR_VOLUME_MULT["under_10"],
            "10_25":    Config.RR_VOLUME_MULT["10_25"],
            "25_50":    Config.RR_VOLUME_MULT["25_50"],
            "50_100":   Config.RR_VOLUME_MULT["50_100"],
            "over_100": Config.RR_VOLUME_MULT["over_100"],
        },
        "expected_pace":      Config.PI_EXPECTED,
        "pi_threshold":       {k: v for k, v in Config.RR_PI_THRESHOLDS.items()},
        "recency_window_days": Config.RR_RECENCY_WINDOW,
        "recency_min_activities": Config.RR_RECENCY_MIN,
        "elevation_multiplier": Config.RR_ELEVATION_MULTIPLIER,
        "elevation_auto_pass_threshold": Config.RR_ELEVATION_AUTO_PASS_THRESHOLD,
    }

    checks = [
        _check_distance_coverage(route_data, training_activities, config),
        _check_volume_load(route_data, training_activities, config),
        _check_performance_index(route_data, training_activities, config),
        _check_recency(training_activities, config, reference_date),
        _check_elevation_coverage(route_data, training_activities, config),
    ]

    checks_passed = sum(1 for c in checks if c["status"] in ("PASS", "AUTO_PASS"))

    if checks_passed == 5:
        verdict = "READY"
    elif checks_passed >= 4:
        verdict = "CLOSE"
    else:
        verdict = "NOT YET"

    return {
        "route": {
            "id": route_data.get("id"),
            "name": route_data.get("display_name") or route_data.get("filename", ""),
            "distance_km": route_data.get("distance_km"),
            "elevation_gain_m": route_data.get("elevation_gain_m"),
            "difficulty_class": route_data.get("difficulty_class"),
            "route_type_tag": route_data.get("route_type_tag"),
            "activity_type": activity_type,
        },
        "verdict": verdict,
        "checks_passed": checks_passed,
        "checks_total": 5,
        "checks": checks,
        "summary_message": _build_summary_message(route_data, checks, activity_type),
    }
