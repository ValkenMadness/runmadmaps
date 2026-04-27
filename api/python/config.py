"""
RMM Production — Configuration
Reads formula values from os.environ (injected by Vercel) with lazy loading.
Structure is in code. Values are in Vercel environment variables.
Lazy loading prevents import crashes when env vars are missing.
"""
import os
import json
import math


def _float(key: str) -> float:
    val = os.environ.get(key)
    if val is None:
        raise ValueError(f"Missing env var: {key}")
    return float(val)


def _int(key: str) -> int:
    return int(_float(key))


class _LazyDescriptor:
    """Descriptor that defers env var reading until first access."""
    def __init__(self, factory):
        self.factory = factory
        self.attr_name = None
        self._value = None
        self._loaded = False

    def __set_name__(self, owner, name):
        self.attr_name = f'_lazy_{name}'

    def __get__(self, obj, objtype=None):
        if not self._loaded:
            self._value = self.factory()
            self._loaded = True
        return self._value


class Config:
    """All formula values loaded from environment variables (lazy)."""

    # --- ROUTE GRADING: DISTANCE BANDS ---
    GRADE_DISTANCE = _LazyDescriptor(lambda: {
        "short_max": _float("GRADE_DISTANCE_SHORT_MAX"),
        "medium_max": _float("GRADE_DISTANCE_MEDIUM_MAX"),
        "long_max": _float("GRADE_DISTANCE_LONG_MAX"),
    })

    # --- ROUTE GRADING V3: ELEVATION DENSITY BANDS ---
    GRADE_ELEVATION = _LazyDescriptor(lambda: {
        "low_max":      _float("ED_BAND_LOW_MAX"),
        "rolling_max":  _float("ED_BAND_ROLLING_MAX"),
        "hilly_max":    _float("ED_BAND_HILLY_MAX"),
        "steep_max":    _float("ED_BAND_STEEP_MAX"),
        "mountain_max": _float("ED_BAND_MOUNTAIN_MAX"),
    })

    # --- ROUTE GRADING V3: BASE CLASS MATRIX ---
    BASE_CLASS_MATRIX = _LazyDescriptor(lambda: json.loads(os.environ.get("BASE_CLASS_MATRIX", "{}")))

    # --- ROUTE GRADING V3: TBS MODIFIER ---
    TBS_MODIFIER = _LazyDescriptor(lambda: {
        "tier1_threshold": _float("TBS_MODIFIER_TIER1_THRESHOLD"),
        "tier2_threshold": _float("TBS_MODIFIER_TIER2_THRESHOLD"),
    })

    # --- ROUTE GRADING V3: GAIN MODIFIER ---
    GAIN_MODIFIER = _LazyDescriptor(lambda: {
        "tier1_gain": _float("GAIN_MODIFIER_TIER1_GAIN"),
        "tier1_dist": _float("GAIN_MODIFIER_TIER1_DIST"),
        "tier2_gain": _float("GAIN_MODIFIER_TIER2_GAIN"),
        "tier2_dist": _float("GAIN_MODIFIER_TIER2_DIST"),
    })
    MODIFIER_MAX = _LazyDescriptor(lambda: _int("MODIFIER_MAX"))

    # --- ROUTE GRADING V3: TERRAIN DIFFICULTY SCORE ---
    TDS = _LazyDescriptor(lambda: {
        "divisor":             _float("TDS_DIVISOR"),
        "min":                 _int("TDS_MIN"),
        "max":                 _int("TDS_MAX"),
        "gain_floor_t1_gain":  _float("TDS_GAIN_FLOOR_TIER1_GAIN"),
        "gain_floor_t1_dist":  _float("TDS_GAIN_FLOOR_TIER1_DIST"),
        "gain_floor_t1_score": _int("TDS_GAIN_FLOOR_TIER1_SCORE"),
        "gain_floor_t2_gain":  _float("TDS_GAIN_FLOOR_TIER2_GAIN"),
        "gain_floor_t2_dist":  _float("TDS_GAIN_FLOOR_TIER2_DIST"),
        "gain_floor_t2_score": _int("TDS_GAIN_FLOOR_TIER2_SCORE"),
    })

    # --- ROUTE GRADING V3: EFFORT DESCRIPTOR ---
    EFFORT = _LazyDescriptor(lambda: {
        "flat_ed_max":               _float("EFFORT_FLAT_ED_MAX"),
        "undulating_ed_max":         _float("EFFORT_UNDULATING_ED_MAX"),
        "hilly_ed_max":              _float("EFFORT_HILLY_ED_MAX"),
        "steady_rise_ed_max":        _float("EFFORT_STEADY_RISE_ED_MAX"),
        "steady_rise_msg_max":       _float("EFFORT_STEADY_RISE_MSG_MAX"),
        "sustained_ed_max":          _float("EFFORT_SUSTAINED_ED_MAX"),
        "sustained_msg_min":         _float("EFFORT_SUSTAINED_MSG_MIN"),
        "sustained_msg_max":         _float("EFFORT_SUSTAINED_MSG_MAX"),
        "big_push_ed_min":           _float("EFFORT_BIG_PUSH_ED_MIN"),
        "relentless_ed_min":         _float("EFFORT_RELENTLESS_ED_MIN"),
        "relentless_msg_min":        _float("EFFORT_RELENTLESS_MSG_MIN"),
        "relentless_terrain_cc_min": _int("EFFORT_RELENTLESS_TERRAIN_CC_MIN"),
    })

    # --- ROUTE GRADING: PILLAR 3 ---
    PILLAR3 = _LazyDescriptor(lambda: {
        "single_climb_pct":       _float("PILLAR3_SINGLE_CLIMB_PCT"),
        "stacked_half_pct":       _float("PILLAR3_STACKED_HALF_PCT"),
        "even_max_climb_pct":     _float("PILLAR3_EVEN_MAX_CLIMB_PCT"),
        "even_max_gradient":      _float("PILLAR3_EVEN_MAX_GRADIENT"),
        "technical_min_climbs":   _int("PILLAR3_TECHNICAL_MIN_CLIMBS"),
        "technical_descent_ratio": _float("PILLAR3_TECHNICAL_DESCENT_RATIO"),
    })

    # --- CLIMB DETECTION ---
    CLIMB_MIN_GAIN = _LazyDescriptor(lambda: _float("CLIMB_MIN_GAIN_M"))
    CLIMB_END_DESCENT = _LazyDescriptor(lambda: _float("CLIMB_END_DESCENT_M"))

    # --- TERRAIN BRUTALITY SCORE ---
    TBS_WEIGHTS = _LazyDescriptor(lambda: {
        "elevation_density":   _float("TBS_WEIGHT_ELEV_DENSITY"),
        "max_gradient":        _float("TBS_WEIGHT_MAX_GRADIENT"),
        "gradient_variability": _float("TBS_WEIGHT_GRADIENT_VARIABILITY"),
    })

    # --- ROUTE COMPLEXITY SCORE ---
    RCS_WEIGHTS = _LazyDescriptor(lambda: {
        "climb_count":    _float("RCS_WEIGHT_CLIMB_COUNT"),
        "effort_index":   _float("RCS_WEIGHT_EFFORT_INDEX"),
        "split_deviation": _float("RCS_WEIGHT_SPLIT_DEVIATION"),
    })

    # --- GRADIENT ANALYSIS ---
    GRADIENT_SEGMENT_LENGTH = _LazyDescriptor(lambda: _int("GRADIENT_SEGMENT_LENGTH_M"))
    MAX_GRADIENT_WINDOW = _LazyDescriptor(lambda: _int("MAX_GRADIENT_WINDOW_M"))

    # --- MOVING TIME THRESHOLDS ---
    MOVING_THRESHOLDS = _LazyDescriptor(lambda: {
        "road": _float("MOVING_THRESHOLD_ROAD"),
        "trail": _float("MOVING_THRESHOLD_TRAIL"),
        "hike": _float("MOVING_THRESHOLD_HIKE"),
    })

    # --- DEM ---
    DEM_SMOOTHING_THRESHOLD = _LazyDescriptor(lambda: _float("DEM_SMOOTHING_THRESHOLD_M"))

    # --- PERFORMANCE INDEX ---
    PI_EXPECTED = _LazyDescriptor(lambda: {
        "road": {
            "A": _float("PI_EXPECTED_ROAD_A"),
            "B": _float("PI_EXPECTED_ROAD_B"),
            "C": _float("PI_EXPECTED_ROAD_C"),
            "D": _float("PI_EXPECTED_ROAD_D"),
            "E": _float("PI_EXPECTED_ROAD_E"),
            "F": _float("PI_EXPECTED_ROAD_F"),
        },
        "trail": {
            "A": _float("PI_EXPECTED_TRAIL_A"),
            "B": _float("PI_EXPECTED_TRAIL_B"),
            "C": _float("PI_EXPECTED_TRAIL_C"),
            "D": _float("PI_EXPECTED_TRAIL_D"),
            "E": _float("PI_EXPECTED_TRAIL_E"),
            "F": _float("PI_EXPECTED_TRAIL_F"),
        },
        "hike": {
            "A": _float("PI_EXPECTED_HIKE_A"),
            "B": _float("PI_EXPECTED_HIKE_B"),
            "C": _float("PI_EXPECTED_HIKE_C"),
            "D": _float("PI_EXPECTED_HIKE_D"),
            "E": _float("PI_EXPECTED_HIKE_E"),
            "F": _float("PI_EXPECTED_HIKE_F"),
        },
    })

    # --- RPS WEIGHTS (only needed by RPS endpoint) ---
    RPS_WEIGHTS = _LazyDescriptor(lambda: {
        "distance": _float("RPS_WEIGHT_DISTANCE"),
        "speed_efficiency": _float("RPS_WEIGHT_SPEED_EFFICIENCY"),
        "elevation": _float("RPS_WEIGHT_ELEVATION"),
        "pace_consistency": _float("RPS_WEIGHT_PACE_CONSISTENCY"),
        "frequency": _float("RPS_WEIGHT_FREQUENCY"),
    })

    # --- BENCHMARK CEILINGS (only needed by RPS endpoint) ---
    CEILINGS = _LazyDescriptor(lambda: {
        "road": {
            "distance_km": _float("CEILING_ROAD_DISTANCE_KM"),
            "pace_sec_per_km": _float("CEILING_ROAD_PACE_SEC_PER_KM"),
            "speed_efficiency_kmh": _float("CEILING_ROAD_SPEED_EFFICIENCY_KMH"),
            "elevation_m": _float("CEILING_ROAD_ELEVATION_M"),
            "frequency": _int("CEILING_ROAD_FREQUENCY"),
        },
        "trail": {
            "distance_km": _float("CEILING_TRAIL_DISTANCE_KM"),
            "pace_sec_per_km": _float("CEILING_TRAIL_PACE_SEC_PER_KM"),
            "speed_efficiency_kmh": _float("CEILING_TRAIL_SPEED_EFFICIENCY_KMH"),
            "elevation_m": _float("CEILING_TRAIL_ELEVATION_M"),
            "frequency": _int("CEILING_TRAIL_FREQUENCY"),
        },
        "hike": {
            "distance_km": _float("CEILING_HIKE_DISTANCE_KM"),
            "pace_sec_per_km": _float("CEILING_HIKE_PACE_SEC_PER_KM"),
            "speed_efficiency_kmh": _float("CEILING_HIKE_SPEED_EFFICIENCY_KMH"),
            "elevation_m": _float("CEILING_HIKE_ELEVATION_M"),
            "frequency": _int("CEILING_HIKE_FREQUENCY"),
        },
    })

    # --- DECAY (only needed by RPS endpoint) ---
    DECAY_HALF_LIFE = _LazyDescriptor(lambda: _float("DECAY_HALF_LIFE_DAYS"))
    DECAY_LAMBDA = _LazyDescriptor(lambda: math.log(2) / Config.DECAY_HALF_LIFE)
    RPS_WINDOW_DAYS = _LazyDescriptor(lambda: _int("RPS_WINDOW_DAYS"))

    # --- CONSISTENCY (only needed by RPS endpoint) ---
    CONSISTENCY_EXPONENT = _LazyDescriptor(lambda: _float("CONSISTENCY_EXPONENT"))

    # --- CROSS-DISCIPLINE BONUS (only needed by RPS endpoint) ---
    CROSS_DISCIPLINE_BONUS_PCT = _LazyDescriptor(lambda: _float("CROSS_DISCIPLINE_BONUS_PCT"))

    # --- PACE CONSISTENCY (only needed by RPS endpoint) ---
    PACE_CONSISTENCY_TRIM_PCT = _LazyDescriptor(lambda: _float("PACE_CONSISTENCY_TRIM_PCT"))
    PACE_CONSISTENCY_MIN_SPLITS = _LazyDescriptor(lambda: _int("PACE_CONSISTENCY_MIN_SPLITS"))
    PACE_CONSISTENCY_MIN_SPLITS_FULL = _LazyDescriptor(lambda: _int("PACE_CONSISTENCY_MIN_SPLITS_FULL"))
    PACE_CONSISTENCY_MIN_SPLITS_PARTIAL = _LazyDescriptor(lambda: _int("PACE_CONSISTENCY_MIN_SPLITS_PARTIAL"))
    PACE_CONSISTENCY_DEFAULT = _LazyDescriptor(lambda: _float("PACE_CONSISTENCY_DEFAULT"))

    # --- RACE READINESS (only needed by race readiness endpoint) ---
    RR_PI_THRESHOLDS = _LazyDescriptor(lambda: {
        "A": _float("RR_PI_THRESHOLD_A"),
        "B": _float("RR_PI_THRESHOLD_B"),
        "C": _float("RR_PI_THRESHOLD_C"),
        "D": _float("RR_PI_THRESHOLD_D"),
        "E": _float("RR_PI_THRESHOLD_E"),
        "F": _float("RR_PI_THRESHOLD_F"),
    })
    RR_RECENCY_WINDOW = _LazyDescriptor(lambda: _int("RR_RECENCY_WINDOW_DAYS"))
    RR_RECENCY_MIN = _LazyDescriptor(lambda: _int("RR_RECENCY_MIN_ACTIVITIES"))
    RR_ELEVATION_MULTIPLIER = _LazyDescriptor(lambda: _float("RR_ELEVATION_MULTIPLIER"))
    RR_ELEVATION_AUTO_PASS_THRESHOLD = _LazyDescriptor(lambda: _float("RR_ELEVATION_AUTO_PASS_THRESHOLD"))

    RR_COVERAGE_PCT = _LazyDescriptor(lambda: {
        "under_10": _float("RR_COVERAGE_PCT_UNDER_10"),
        "10_25":    _float("RR_COVERAGE_PCT_10_25"),
        "25_50":    _float("RR_COVERAGE_PCT_25_50"),
        "50_100":   _float("RR_COVERAGE_PCT_50_100"),
        "over_100": _float("RR_COVERAGE_PCT_OVER_100"),
    })

    RR_VOLUME_MULT = _LazyDescriptor(lambda: {
        "under_10": _float("RR_VOLUME_MULT_UNDER_10"),
        "10_25":    _float("RR_VOLUME_MULT_10_25"),
        "25_50":    _float("RR_VOLUME_MULT_25_50"),
        "50_100":   _float("RR_VOLUME_MULT_50_100"),
        "over_100": _float("RR_VOLUME_MULT_OVER_100"),
    })

    # --- ANTI-GAMING (only needed by upload/anti-gaming endpoints) ---
    AG = _LazyDescriptor(lambda: {
        "f1_min_elev_density":        _float("AG_F1_MIN_ELEV_DENSITY"),
        "f2_max_distance_km":         _float("AG_F2_MAX_DISTANCE_KM"),
        "f2_max_time_minutes":        _float("AG_F2_MAX_TIME_MINUTES"),
        "f3_max_distance_m":          _float("AG_F3_MAX_DISTANCE_M"),
        "f3_max_time_hours":          _float("AG_F3_MAX_TIME_HOURS"),
        "f3_pace_diff_pct":           _float("AG_F3_PACE_DIFF_PCT"),
        "f3_min_distance_km":         _float("AG_F3_MIN_DISTANCE_KM"),
        "f5_hike_max_speed":          _float("AG_F5_HIKE_MAX_SPEED"),
        "f5_walk_max_speed":          _float("AG_F5_WALK_MAX_SPEED"),
        "f5_trail_max_speed":         _float("AG_F5_TRAIL_MAX_SPEED"),
        "f8_timestamp_cv":            _float("AG_F8_TIMESTAMP_CV"),
        "f8_speed_cv":                _float("AG_F8_SPEED_CV"),
        "f8_min_distance_km":         _float("AG_F8_MIN_DISTANCE_KM"),
        "f9_elev_density":            _float("AG_F9_ELEV_DENSITY"),
        "f9_revisit_pct":             _float("AG_F9_REVISIT_PCT"),
        "f10_teleport_speed_run_kmh":  _float("F10_TELEPORT_SPEED_RUN_KMH"),
        "f10_teleport_speed_hike_kmh": _float("F10_TELEPORT_SPEED_HIKE_KMH"),
        "f10_min_movement_ratio":      _float("F10_MIN_MOVEMENT_RATIO"),
    })

    # --- RPS-8: GRADIENT-NORMALISED PACE CONSISTENCY (only needed by RPS endpoint) ---
    PC_CLIMB_IMPACT = _LazyDescriptor(lambda: _float("PC_CLIMB_IMPACT"))
    PC_CLIMB_SATURATION = _LazyDescriptor(lambda: _float("PC_CLIMB_SATURATION"))
    PC_DESCENT_IMPACT = _LazyDescriptor(lambda: _float("PC_DESCENT_IMPACT"))
    PC_DESCENT_SATURATION = _LazyDescriptor(lambda: _float("PC_DESCENT_SATURATION"))
    PC_GRADIENT_RAMP_CEILING = _LazyDescriptor(lambda: _float("PC_GRADIENT_RAMP_CEILING"))
    PC_GRADIENT_RAMP_POWER = _LazyDescriptor(lambda: _float("PC_GRADIENT_RAMP_POWER"))

    # --- RPS-9: TDS-ADJUSTED SPEED EFFICIENCY (only needed by RPS endpoint) ---
    TDS_BONUS_RATE = _LazyDescriptor(lambda: _float("TDS_BONUS_RATE"))

    # --- ATHLETE LEVELS (only needed by RPS endpoint) ---
    LEVELS = _LazyDescriptor(lambda: [
        {"name": "Foundation", "floor": 0,                                  "ceiling": _int("LEVEL_FOUNDATION_MAX")},
        {"name": "Active",     "floor": _int("LEVEL_FOUNDATION_MAX") + 1,   "ceiling": _int("LEVEL_ACTIVE_MAX")},
        {"name": "Athlete",    "floor": _int("LEVEL_ACTIVE_MAX") + 1,       "ceiling": _int("LEVEL_ATHLETE_MAX")},
        {"name": "Competitor", "floor": _int("LEVEL_ATHLETE_MAX") + 1,      "ceiling": _int("LEVEL_COMPETITOR_MAX")},
        {"name": "Elite",      "floor": _int("LEVEL_COMPETITOR_MAX") + 1,   "ceiling": 100},
    ])

    @classmethod
    def get_level(cls, rps: float) -> dict:
        for level in cls.LEVELS:
            if rps <= level["ceiling"]:
                position = (rps - level["floor"]) / (level["ceiling"] - level["floor"]) * 100
                return {
                    "name": level["name"],
                    "floor": level["floor"],
                    "ceiling": level["ceiling"],
                    "position_pct": round(max(0, min(100, position)), 1),
                }
        return {"name": "Elite", "floor": 86, "ceiling": 100, "position_pct": 100.0}

    @classmethod
    def to_dict(cls) -> dict:
        return {
            "rps_weights": cls.RPS_WEIGHTS,
            "ceilings": cls.CEILINGS,
            "decay_half_life": cls.DECAY_HALF_LIFE,
            "rps_window_days": cls.RPS_WINDOW_DAYS,
            "consistency_exponent": cls.CONSISTENCY_EXPONENT,
            "pace_consistency_trim_pct": cls.PACE_CONSISTENCY_TRIM_PCT,
            "pace_consistency_min_splits": cls.PACE_CONSISTENCY_MIN_SPLITS,
            "pace_consistency_min_splits_full": cls.PACE_CONSISTENCY_MIN_SPLITS_FULL,
            "pace_consistency_min_splits_partial": cls.PACE_CONSISTENCY_MIN_SPLITS_PARTIAL,
            "pace_consistency_default": cls.PACE_CONSISTENCY_DEFAULT,
            "moving_thresholds": cls.MOVING_THRESHOLDS,
            "dem_smoothing_threshold": cls.DEM_SMOOTHING_THRESHOLD,
            "grade_distance": cls.GRADE_DISTANCE,
            "grade_elevation": cls.GRADE_ELEVATION,
            "base_class_matrix": cls.BASE_CLASS_MATRIX,
            "tbs_modifier": cls.TBS_MODIFIER,
            "gain_modifier": cls.GAIN_MODIFIER,
            "modifier_max": cls.MODIFIER_MAX,
            "tds": cls.TDS,
            "effort": cls.EFFORT,
            "pillar3": cls.PILLAR3,
            "climb_min_gain": cls.CLIMB_MIN_GAIN,
            "climb_end_descent": cls.CLIMB_END_DESCENT,
            "tbs_weights": cls.TBS_WEIGHTS,
            "rcs_weights": cls.RCS_WEIGHTS,
            "gradient_segment_length": cls.GRADIENT_SEGMENT_LENGTH,
            "max_gradient_window": cls.MAX_GRADIENT_WINDOW,
            "pi_expected": cls.PI_EXPECTED,
            "rr_pi_thresholds": cls.RR_PI_THRESHOLDS,
            "rr_recency_window": cls.RR_RECENCY_WINDOW,
            "rr_recency_min": cls.RR_RECENCY_MIN,
            "rr_elevation_multiplier": cls.RR_ELEVATION_MULTIPLIER,
            "ag": cls.AG,
            "levels": cls.LEVELS,
            "pc_climb_impact": cls.PC_CLIMB_IMPACT,
            "pc_climb_saturation": cls.PC_CLIMB_SATURATION,
            "pc_descent_impact": cls.PC_DESCENT_IMPACT,
            "pc_descent_saturation": cls.PC_DESCENT_SATURATION,
            "pc_gradient_ramp_ceiling": cls.PC_GRADIENT_RAMP_CEILING,
            "pc_gradient_ramp_power": cls.PC_GRADIENT_RAMP_POWER,
            "tds_bonus_rate": cls.TDS_BONUS_RATE,
        }
