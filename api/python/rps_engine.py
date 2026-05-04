"""
RMM Production — Runner Performance Score Engine
Full RPS calculation with exponential decay, consistency modifier,
and three-layer scoring.
"""
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from config import Config


def _gradient_adjustment(
    gradient: float,
    climb_impact: float,
    climb_sat: float,
    descent_impact: float,
    descent_sat: float,
    ramp_ceiling: float = 0.0,
    ramp_power: float = 1.0,
) -> float:
    if gradient == 0.0:
        return 0.0
    is_climb = gradient > 0
    impact = climb_impact if is_climb else descent_impact
    sat = climb_sat if is_climb else descent_sat
    abs_g = abs(gradient)
    adj = impact * abs_g * (1.0 / (1.0 + sat * abs_g))

    if ramp_ceiling > 0.0 and abs_g < ramp_ceiling:
        adj *= (abs_g / ramp_ceiling) ** ramp_power

    return adj if is_climb else -adj


def _compute_gradient_pc(
    km_splits: list,
    min_partial: int,
    min_full: int,
    trim_pct: float,
    climb_impact: float,
    climb_sat: float,
    descent_impact: float,
    descent_sat: float,
    ramp_ceiling: float = 0.0,
    ramp_power: float = 1.0,
) -> Optional[float]:
    full_splits = [s for s in km_splits if not s.get("partial")]
    n = len(full_splits)

    if n < min_partial:
        return None

    paces = [s["pace_sec_per_km"] for s in full_splits]
    gradients = [s.get("gradient", 0.0) for s in full_splits]

    if n >= min_full:
        trim_count = max(1, int(n * trim_pct))
        indexed = list(range(n))
        indexed.sort(key=lambda i: paces[i])
        keep = indexed[trim_count: n - trim_count]
        keep.sort()
        trimmed_paces = [paces[i] for i in keep]
        trimmed_gradients = [gradients[i] for i in keep]
        if len(trimmed_paces) < 2:
            trimmed_paces = paces
            trimmed_gradients = gradients
    else:
        trimmed_paces = paces
        trimmed_gradients = gradients

    if len(trimmed_paces) < 2:
        return None

    mean_pace = sum(trimmed_paces) / len(trimmed_paces)
    if mean_pace == 0:
        return None

    residuals = []
    for pace, gradient in zip(trimmed_paces, trimmed_gradients):
        adj = _gradient_adjustment(gradient, climb_impact, climb_sat, descent_impact, descent_sat, ramp_ceiling, ramp_power)
        expected_pace = mean_pace * (1.0 + adj)
        residuals.append(pace - expected_pace)

    n_res = len(residuals)
    if n_res < 2:
        return None

    mean_res = sum(residuals) / n_res
    var = sum((r - mean_res) ** 2 for r in residuals) / n_res
    std_dev = var ** 0.5
    cv = std_dev / mean_pace

    return max(0.0, min(1.0, 1.0 - cv))


class RPSEngine:
    """Calculates Runner Performance Score from activity data."""

    def __init__(self, config_override: dict = None):
        self._config = config_override or {}

    def _cfg(self, key, default=None):
        if key in self._config:
            return self._config[key]
        return default

    def calculate_rps(
        self,
        activities: list,
        activity_type: str = "trail",
        reference_date: Optional[datetime] = None,
    ) -> dict:
        if reference_date is None:
            reference_date = datetime.now(timezone.utc)

        window_days = self._cfg("rps_window_days", Config.RPS_WINDOW_DAYS)
        half_life = self._cfg("decay_half_life", Config.DECAY_HALF_LIFE)
        decay_lambda = math.log(2) / half_life

        window_start = reference_date - timedelta(days=window_days)
        window_activities = []
        for a in activities:
            a_type = a.get("activity_type", "trail")
            if a_type != activity_type:
                continue
            a_date = a.get("date")
            if isinstance(a_date, str):
                try:
                    a_date = datetime.fromisoformat(a_date.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if a_date and a_date >= window_start:
                days_ago = (reference_date - a_date).total_seconds() / 86400
                decay_weight = math.exp(-decay_lambda * days_ago)
                window_activities.append({
                    **a,
                    "days_ago": round(days_ago, 1),
                    "decay_weight": round(decay_weight, 4),
                })

        if not window_activities:
            return self._empty_rps(activity_type)

        ceilings = Config.CEILINGS.get(activity_type, Config.CEILINGS["trail"])
        weights = self._cfg("rps_weights", Config.RPS_WEIGHTS)

        pc_climb_impact   = self._cfg("pc_climb_impact",          Config.PC_CLIMB_IMPACT)
        pc_climb_sat      = self._cfg("pc_climb_saturation",      Config.PC_CLIMB_SATURATION)
        pc_descent_impact = self._cfg("pc_descent_impact",        Config.PC_DESCENT_IMPACT)
        pc_descent_sat    = self._cfg("pc_descent_saturation",    Config.PC_DESCENT_SATURATION)
        tds_bonus_rate    = self._cfg("tds_bonus_rate",           Config.TDS_BONUS_RATE)
        ramp_ceiling      = self._cfg("pc_gradient_ramp_ceiling", Config.PC_GRADIENT_RAMP_CEILING)
        ramp_power        = self._cfg("pc_gradient_ramp_power",   Config.PC_GRADIENT_RAMP_POWER)
        min_full    = Config.PACE_CONSISTENCY_MIN_SPLITS_FULL
        min_partial = Config.PACE_CONSISTENCY_MIN_SPLITS_PARTIAL
        trim_pct    = Config.PACE_CONSISTENCY_TRIM_PCT

        for a in window_activities:
            km_splits = a.get("km_splits", [])
            a["_pc_normalised"] = _compute_gradient_pc(
                km_splits, min_partial, min_full, trim_pct,
                pc_climb_impact, pc_climb_sat, pc_descent_impact, pc_descent_sat,
                ramp_ceiling, ramp_power,
            )
            dist = a.get("total_distance_km", 0)
            time_h = (a.get("rmm_moving_time_seconds", 0) or 0) / 3600
            tds = a.get("terrain_difficulty_score") or 0
            if dist > 0 and time_h > 0:
                raw_se = dist / time_h
                adj_se = raw_se * (1.0 + tds_bonus_rate * tds)
                a["_adjusted_se"] = min(adj_se, ceilings["speed_efficiency_kmh"])
                a["_raw_se"] = raw_se
            else:
                a["_adjusted_se"] = 0.0
                a["_raw_se"] = 0.0

        distance_raw = sum(a["total_distance_km"] * a["decay_weight"] for a in window_activities)
        distance_score = min(100, (distance_raw / ceilings["distance_km"]) * 100)

        total_adj_se_weighted = sum(a["_adjusted_se"] * a["decay_weight"] for a in window_activities)
        total_se_weight = sum(a["decay_weight"] for a in window_activities)
        speed_efficiency = total_adj_se_weighted / total_se_weight if total_se_weight > 0 else 0
        speed_eff_score = min(100, (speed_efficiency / ceilings["speed_efficiency_kmh"]) * 100)

        elevation_raw = sum(a.get("total_elevation_gain", 0) * a["decay_weight"] for a in window_activities)
        elevation_score = min(100, (elevation_raw / ceilings["elevation_m"]) * 100)

        pc_default = self._cfg("pace_consistency_default", Config.PACE_CONSISTENCY_DEFAULT)

        real_pc = []
        for a in window_activities:
            pc_val = a["_pc_normalised"]
            if pc_val is None:
                pc_val = a.get("pace_consistency_score")
            if pc_val is not None:
                real_pc.append((pc_val, a["decay_weight"]))

        if real_pc:
            total_real_weight = sum(w for _, w in real_pc)
            tier12_avg = (
                sum(v * w for v, w in real_pc) / total_real_weight
                if total_real_weight > 0
                else pc_default
            )
        else:
            tier12_avg = pc_default

        total_pc_weight = sum(a["decay_weight"] for a in window_activities)
        pace_consistency_avg = (
            sum(
                (
                    (a["_pc_normalised"] if a["_pc_normalised"] is not None
                     else a.get("pace_consistency_score"))
                    if (a["_pc_normalised"] is not None or a.get("pace_consistency_score") is not None)
                    else tier12_avg
                )
                * a["decay_weight"]
                for a in window_activities
            ) / total_pc_weight
            if total_pc_weight > 0
            else pc_default
        )
        pace_consistency_score = min(100, pace_consistency_avg * 100)

        frequency_raw = sum(a["decay_weight"] for a in window_activities)
        frequency_score = min(100, (frequency_raw / ceilings["frequency"]) * 100)

        consistency_exponent = self._cfg("consistency_exponent", Config.CONSISTENCY_EXPONENT)
        expected_rate = ceilings["frequency"] / window_days
        expected_decay_sum = 0.0
        for day in range(window_days):
            expected_decay_sum += expected_rate * math.exp(-decay_lambda * day)

        actual_decay_sum = sum(a["decay_weight"] for a in window_activities)
        raw_consistency = actual_decay_sum / expected_decay_sum if expected_decay_sum > 0 else 0
        consistency_modifier = min(1.0, raw_consistency ** consistency_exponent)

        distance_score_modified = distance_score * consistency_modifier
        elevation_score_modified = elevation_score * consistency_modifier

        rps = (
            distance_score_modified  * weights["distance"]
            + speed_eff_score        * weights["speed_efficiency"]
            + elevation_score_modified * weights["elevation"]
            + pace_consistency_score * weights["pace_consistency"]
            + frequency_score        * weights["frequency"]
        )
        rps = round(min(100, rps), 2)

        level = Config.get_level(rps)

        return {
            "rps": rps,
            "activity_type": activity_type,
            "level": level,
            "window_days": window_days,
            "activity_count": len(window_activities),
            "reference_date": reference_date.isoformat(),
            "components": {
                "distance": {
                    "raw_value": round(distance_raw, 2),
                    "ceiling": ceilings["distance_km"],
                    "score": round(distance_score, 2),
                    "score_modified": round(distance_score_modified, 2),
                    "weight": weights["distance"],
                    "contribution": round(distance_score_modified * weights["distance"], 2),
                    "unit": "km",
                },
                "speed_efficiency": {
                    "raw_value": round(speed_efficiency, 2),
                    "ceiling": ceilings["speed_efficiency_kmh"],
                    "score": round(speed_eff_score, 2),
                    "weight": weights["speed_efficiency"],
                    "contribution": round(speed_eff_score * weights["speed_efficiency"], 2),
                    "unit": "km/h",
                },
                "elevation": {
                    "raw_value": round(elevation_raw, 1),
                    "ceiling": ceilings["elevation_m"],
                    "score": round(elevation_score, 2),
                    "score_modified": round(elevation_score_modified, 2),
                    "weight": weights["elevation"],
                    "contribution": round(elevation_score_modified * weights["elevation"], 2),
                    "unit": "m",
                },
                "pace_consistency": {
                    "raw_value": round(pace_consistency_avg, 4),
                    "score": round(pace_consistency_score, 2),
                    "weight": weights["pace_consistency"],
                    "contribution": round(pace_consistency_score * weights["pace_consistency"], 2),
                },
                "frequency": {
                    "raw_value": round(frequency_raw, 2),
                    "ceiling": ceilings["frequency"],
                    "score": round(frequency_score, 2),
                    "weight": weights["frequency"],
                    "contribution": round(frequency_score * weights["frequency"], 2),
                    "unit": "activities (decay-weighted)",
                },
            },
            "consistency": {
                "raw": round(raw_consistency, 4),
                "modifier": round(consistency_modifier, 4),
                "exponent": consistency_exponent,
            },
            "decay": {
                "half_life_days": half_life,
                "lambda": round(decay_lambda, 6),
            },
            "activities": [
                {
                    "date": a.get("date"),
                    "days_ago": a["days_ago"],
                    "decay_weight": a["decay_weight"],
                    "distance_km": a["total_distance_km"],
                    "elevation_gain": a.get("total_elevation_gain", 0),
                    "pace_sec_per_km": a.get("rmm_avg_pace_sec_per_km", 0),
                    "speed_kmh": a.get("rmm_avg_speed_kmh", 0),
                    "pace_consistency_raw": a.get("pace_consistency_score", 0),
                    "pace_consistency_normalised": a.get("_pc_normalised"),
                    "raw_se_kmh": round(a["_raw_se"], 2),
                    "adjusted_se_kmh": round(a["_adjusted_se"], 2),
                    "tds_used": a.get("terrain_difficulty_score") or 0,
                }
                for a in sorted(window_activities, key=lambda x: x["days_ago"])
            ],
        }

    def calculate_all_layers(self, activities: list, reference_date: Optional[datetime] = None) -> dict:
        if reference_date is None:
            reference_date = datetime.now(timezone.utc)

        layer1 = {}
        for atype in ["road", "trail", "hike"]:
            layer1[atype] = self.calculate_rps(activities, atype, reference_date)

        active_disciplines = [d for d in ["road", "trail", "hike"] if layer1[d]["activity_count"] > 0]

        if not active_disciplines:
            return {"layer1": layer1, "layer3_overall": self._empty_layer3()}

        window_days  = self._cfg("rps_window_days", Config.RPS_WINDOW_DAYS)
        half_life    = self._cfg("decay_half_life",  Config.DECAY_HALF_LIFE)
        decay_lambda = math.log(2) / half_life
        window_start = reference_date - timedelta(days=window_days)

        decay_sums = {}
        for atype in active_disciplines:
            total = 0.0
            for a in activities:
                if a.get("activity_type") != atype:
                    continue
                a_date = a.get("date")
                if isinstance(a_date, str):
                    try:
                        a_date = datetime.fromisoformat(a_date.replace("Z", "+00:00"))
                    except ValueError:
                        continue
                if a_date and a_date >= window_start:
                    days_ago = (reference_date - a_date).total_seconds() / 86400
                    total += math.exp(-decay_lambda * days_ago)
            decay_sums[atype] = total

        total_decay = sum(decay_sums[d] for d in active_disciplines)
        if total_decay > 0:
            weighted_avg = sum(layer1[d]["rps"] * decay_sums[d] for d in active_disciplines) / total_decay
        else:
            weighted_avg = max(layer1[d]["rps"] for d in active_disciplines)

        bonus_pct = self._cfg("cross_discipline_bonus_pct", Config.CROSS_DISCIPLINE_BONUS_PCT)
        bonus = weighted_avg * bonus_pct if len(active_disciplines) >= 2 else 0.0

        best_l1_discipline = max(active_disciplines, key=lambda d: layer1[d]["rps"])
        best_l1_rps        = layer1[best_l1_discipline]["rps"]
        raw_overall        = weighted_avg + bonus
        floored            = raw_overall < best_l1_rps
        overall_rps        = round(min(100.0, max(best_l1_rps, raw_overall)), 2)

        level = Config.get_level(overall_rps)

        discipline_weights = {
            d: {
                "decay_sum": round(decay_sums[d], 4),
                "l1_rps": layer1[d]["rps"],
                "contribution_pct": round(decay_sums[d] / total_decay * 100, 1) if total_decay > 0 else 0.0,
            }
            for d in active_disciplines
        }

        layer3 = {
            "rps": overall_rps,
            "level": level,
            "activity_count": sum(layer1[d]["activity_count"] for d in active_disciplines),
            "primary_discipline": best_l1_discipline,
            "best_l1_discipline": best_l1_discipline,
            "best_l1_rps": best_l1_rps,
            "weighted_average": round(weighted_avg, 2),
            "cross_discipline_bonus": round(bonus, 2),
            "active_disciplines": active_disciplines,
            "discipline_weights": discipline_weights,
            "floored": floored,
        }

        return {"layer1": layer1, "layer3_overall": layer3}

    def _empty_layer3(self) -> dict:
        return {
            "rps": 0,
            "level": Config.get_level(0),
            "activity_count": 0,
            "primary_discipline": None,
            "best_l1_discipline": None,
            "best_l1_rps": 0,
            "weighted_average": 0,
            "cross_discipline_bonus": 0,
            "active_disciplines": [],
            "discipline_weights": {},
            "floored": False,
        }

    def _empty_rps(self, activity_type: str) -> dict:
        return {
            "rps": 0,
            "activity_type": activity_type,
            "level": Config.get_level(0),
            "activity_count": 0,
            "components": {
                name: {"raw_value": 0, "score": 0, "weight": w, "contribution": 0}
                for name, w in Config.RPS_WEIGHTS.items()
            },
            "consistency": {"raw": 0, "modifier": 0},
            "decay": {"half_life_days": Config.DECAY_HALF_LIFE},
            "activities": [],
        }
