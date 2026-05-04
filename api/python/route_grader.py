"""
RMM Production — Route Grading System V3
GPS-derived classification: Base Class from matrix + GPS-only modifiers.
Produces Difficulty Class (A-F), TDS (1-10), Effort Descriptor, Route Type Tag.
"""
from config import Config


CLASS_ORDER = ["F", "E", "D", "C", "B", "A"]


def _class_index(cls: str) -> int:
    try:
        return CLASS_ORDER.index(cls)
    except ValueError:
        return CLASS_ORDER.index("D")


def _class_from_index(idx: int) -> str:
    return CLASS_ORDER[min(max(idx, 0), len(CLASS_ORDER) - 1)]


class RouteGrader:
    """Grades a route based on GPS-derived metrics (V3)."""

    def grade_route(self, gps_data: dict) -> dict:
        distance_km      = gps_data["total_distance_km"]
        elevation_density = gps_data["elevation_density"]
        elevation_gain   = gps_data.get("total_elevation_gain", 0) or 0
        tbs              = gps_data.get("terrain_brutality_score", 0) or 0
        max_gradient     = gps_data.get("max_sustained_gradient", 0) or 0
        climb_count      = gps_data.get("climb_count", 0) or 0

        pillar1 = self._classify_distance(distance_km)
        pillar2 = self._classify_elevation_density(elevation_density)

        climb_structure = gps_data.get("climb_structure", "Even")
        pillar3 = {"classification": climb_structure}

        base_class = self._base_class_from_matrix(pillar1["band"], pillar2["band"])

        modifier, modifier_source = self._apply_modifiers(tbs, elevation_gain, distance_km)

        base_idx = _class_index(base_class)
        final_idx = min(base_idx + modifier, len(CLASS_ORDER) - 1)
        final_class = _class_from_index(final_idx)

        tds = gps_data.get("terrain_difficulty_score")
        if tds is None:
            tds = self._calculate_tds(tbs, elevation_gain, distance_km)

        effort_descriptor = self._classify_effort_descriptor(elevation_density, max_gradient, climb_count)
        route_tag = self._assign_route_tag(distance_km, elevation_density, climb_structure)

        grade_display = (
            f"Class {final_class} · {tds}/10 / {effort_descriptor} · "
            f"{distance_km:.1f} km · {elevation_gain:.0f}m · {elevation_density:.0f} m/km"
        )

        return {
            "difficulty_class": final_class,
            "terrain_difficulty_score": tds,
            "effort_descriptor": effort_descriptor,
            "route_type_tag": route_tag,
            "grade_display": grade_display,
            "pillar1_distance": pillar1,
            "pillar2_elevation": pillar2,
            "pillar3_climb_structure": pillar3,
            "base_class": base_class,
            "modifier": modifier,
            "modifier_source": modifier_source,
        }

    def _classify_distance(self, distance_km: float) -> dict:
        gd = Config.GRADE_DISTANCE
        if distance_km < gd["short_max"]:
            band = "Short"
        elif distance_km < gd["medium_max"]:
            band = "Medium"
        elif distance_km < gd["long_max"]:
            band = "Long"
        else:
            band = "Ultra"
        return {"band": band, "value_km": round(distance_km, 2)}

    def _classify_elevation_density(self, density: float) -> dict:
        ge = Config.GRADE_ELEVATION
        if density < ge["low_max"]:
            band = "Low"
        elif density < ge["rolling_max"]:
            band = "Rolling"
        elif density < ge["hilly_max"]:
            band = "Hilly"
        elif density < ge["steep_max"]:
            band = "Steep"
        elif density < ge["mountain_max"]:
            band = "Mountain"
        else:
            band = "Extreme"
        return {"band": band, "value_m_per_km": round(density, 1)}

    def _base_class_from_matrix(self, distance_band: str, elevation_band: str) -> str:
        key = f"{distance_band}_{elevation_band}"
        return Config.BASE_CLASS_MATRIX.get(key, "D")

    def _apply_modifiers(self, tbs: float, elevation_gain: float, distance_km: float):
        tm = Config.TBS_MODIFIER
        gm = Config.GAIN_MODIFIER

        if tbs >= tm["tier2_threshold"]:
            tbs_mod = 2
        elif tbs >= tm["tier1_threshold"]:
            tbs_mod = 1
        else:
            tbs_mod = 0

        if elevation_gain >= gm["tier2_gain"] and distance_km >= gm["tier2_dist"]:
            gain_mod = 2
        elif elevation_gain >= gm["tier1_gain"] and distance_km >= gm["tier1_dist"]:
            gain_mod = 1
        else:
            gain_mod = 0

        modifier = min(max(tbs_mod, gain_mod), Config.MODIFIER_MAX)

        if modifier == 0:
            source = "none"
        elif tbs_mod > gain_mod:
            source = "tbs"
        elif gain_mod > tbs_mod:
            source = "gain"
        else:
            source = "tbs_gain_tied"

        return modifier, source

    def _calculate_tds(self, tbs: float, elevation_gain: float, distance_km: float) -> int:
        t = Config.TDS
        raw = round(tbs / t["divisor"])
        tds = min(max(raw, t["min"]), t["max"])
        if elevation_gain >= t["gain_floor_t2_gain"] and distance_km >= t["gain_floor_t2_dist"]:
            tds = max(tds, t["gain_floor_t2_score"])
        elif elevation_gain >= t["gain_floor_t1_gain"] and distance_km >= t["gain_floor_t1_dist"]:
            tds = max(tds, t["gain_floor_t1_score"])
        return tds

    def _classify_effort_descriptor(self, elevation_density: float, max_gradient: float, climb_count: int) -> str:
        e = Config.EFFORT

        if elevation_density < e["flat_ed_max"]:
            return "Flat"
        if elevation_density < e["undulating_ed_max"]:
            return "Undulating"
        if elevation_density < e["hilly_ed_max"]:
            return "Hilly"

        if (elevation_density >= e["relentless_ed_min"]
                and (max_gradient >= e["relentless_msg_min"]
                     or climb_count >= e["relentless_terrain_cc_min"])):
            return "Relentless Ascent"

        if (e["sustained_msg_min"] <= max_gradient < e["sustained_msg_max"]
                and elevation_density < e["sustained_ed_max"]):
            return "Sustained Ascent"

        if elevation_density >= e["big_push_ed_min"]:
            return "Big Push"

        if (elevation_density < e["steady_rise_ed_max"]
                and max_gradient < e["steady_rise_msg_max"]):
            return "Steady Rise"

        return "Hilly"

    def _assign_route_tag(self, distance_km: float, elevation_density: float, climb_structure: str) -> str:
        gd = Config.GRADE_DISTANCE
        ge = Config.GRADE_ELEVATION

        if elevation_density >= ge["hilly_max"]:
            return "Strength"
        if distance_km >= gd["long_max"]:
            return "Endurance"
        if distance_km < gd["short_max"] and elevation_density < ge["low_max"]:
            return "Recovery"
        if distance_km < gd["medium_max"] and elevation_density < ge["rolling_max"]:
            return "Tempo"
        if distance_km >= gd["medium_max"] and ge["rolling_max"] <= elevation_density < ge["hilly_max"]:
            return "Mental Grind"
        return "Aerobic"
