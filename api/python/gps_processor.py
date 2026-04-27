"""
RMM Production — GPS Stream Processor
Core engine. Every derived metric flows from here.
Parses GPX files and produces all RMM-calculated values.
"""
import math
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional
from collections import defaultdict

from dem_lookup import DEMLookup
from config import Config


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class GPSStreamProcessor:
    """Processes raw GPS data from GPX files into all RMM-derived metrics."""

    def __init__(self, config_override: Optional[dict] = None):
        self.dem = DEMLookup()
        self._config = config_override or {}

    def _cfg(self, key: str, default=None):
        if key in self._config:
            return self._config[key]
        return default

    def parse_gpx(self, gpx_content: str) -> dict:
        root = ET.fromstring(gpx_content)
        ns = self._detect_namespace(root)

        points = self._extract_trackpoints(root, ns)
        if len(points) < 2:
            return {"error": "Insufficient trackpoints", "point_count": len(points)}

        smoothing = self._cfg("dem_smoothing_threshold", Config.DEM_SMOOTHING_THRESHOLD)
        corrected_elevations = self.dem.correct_profile(points, smoothing)

        for i, p in enumerate(points):
            p["ele_corrected"] = corrected_elevations[i]

        has_timestamps = any(p["time"] is not None for p in points)

        segments = self._calculate_segments(points)

        total_distance_m = sum(s["distance"] for s in segments)
        total_distance_km = total_distance_m / 1000.0

        if has_timestamps and points[-1]["time"] is not None and points[0]["time"] is not None:
            elapsed_seconds = (points[-1]["time"] - points[0]["time"]).total_seconds()
        else:
            elapsed_seconds = 0

        activity_type = "trail"

        moving_threshold_kmh = self._cfg(
            "moving_threshold",
            Config.MOVING_THRESHOLDS.get(activity_type, 1.0),
        )
        moving_threshold_ms = moving_threshold_kmh * 1000 / 3600
        moving_time_seconds = self._calculate_moving_time(segments, moving_threshold_ms)

        elevation_metrics = self._calculate_elevation_metrics(
            points, corrected_elevations, total_distance_km
        )

        if moving_time_seconds > 0 and total_distance_km > 0:
            rmm_avg_speed_kmh = total_distance_km / (moving_time_seconds / 3600)
            rmm_avg_pace_sec_per_km = moving_time_seconds / total_distance_km
        else:
            rmm_avg_speed_kmh = 0
            rmm_avg_pace_sec_per_km = 0

        km_splits = self._calculate_km_splits(points, segments) if has_timestamps else []
        pace_consistency = self._calculate_pace_consistency(km_splits)

        gradient_metrics = self._calculate_gradient_metrics(
            points, corrected_elevations, total_distance_m
        )

        climb_data = self._detect_climbs(corrected_elevations, points)

        terrain_brutality = self._calculate_terrain_brutality(
            elevation_metrics["elevation_density"],
            gradient_metrics["max_sustained_gradient"],
            gradient_metrics["gradient_variability"],
        )
        terrain_difficulty_score = self._calculate_tds_score(
            terrain_brutality, elevation_metrics["total_gain"], total_distance_km
        )

        effort_index = (
            moving_time_seconds / (total_distance_km * 300)
            if total_distance_km > 0
            else 0
        )

        route_complexity = self._calculate_route_complexity(
            len(climb_data["climbs"]),
            effort_index,
            pace_consistency.get("split_deviation", 0),
        )

        revisit_pct = self._coordinate_revisit_pct(points)
        hr_data = self._extract_hr(points)

        first_point_time = points[0].get("time")
        timestamp_estimated = first_point_time is None
        start_datetime = (
            first_point_time if first_point_time is not None
            else datetime.now(timezone.utc)
        )

        elevation_profile = [
            {
                "distance_km": p.get("cumulative_distance_km", 0),
                "elevation": p["ele_corrected"],
                "elevation_gps": p.get("ele", 0),
            }
            for p in points[::max(1, len(points) // 500)]
        ]

        _step = max(1, len(points) // 1000)
        coordinate_stream = [[p["lat"], p["lon"]] for p in points[::_step]]
        last = [points[-1]["lat"], points[-1]["lon"]]
        if coordinate_stream[-1] != last:
            coordinate_stream.append(last)

        return {
            "total_distance_km": round(total_distance_km, 2),
            "total_distance_m": round(total_distance_m, 1),
            "elapsed_time_seconds": round(elapsed_seconds, 1),
            "rmm_moving_time_seconds": round(moving_time_seconds, 1),
            "rmm_avg_speed_kmh": round(rmm_avg_speed_kmh, 2),
            "rmm_avg_pace_sec_per_km": round(rmm_avg_pace_sec_per_km, 1),
            "rmm_avg_pace_formatted": self._format_pace(rmm_avg_pace_sec_per_km),
            "total_elevation_gain": round(elevation_metrics["total_gain"], 1),
            "total_elevation_loss": round(elevation_metrics["total_loss"], 1),
            "elevation_density": round(elevation_metrics["elevation_density"], 1),
            "min_elevation": round(elevation_metrics["min_elevation"], 1),
            "max_elevation": round(elevation_metrics["max_elevation"], 1),
            "dem_corrected": self.dem.available,
            "gradient_variability": round(gradient_metrics["gradient_variability"], 2),
            "max_sustained_gradient": round(gradient_metrics["max_sustained_gradient"], 1),
            "gradient_segments": gradient_metrics.get("segments", []),
            "climb_count": len(climb_data["climbs"]),
            "climbs": climb_data["climbs"],
            "climb_structure": climb_data["structure"],
            "km_splits": km_splits,
            "pace_consistency_score": round(pace_consistency["score"], 4) if pace_consistency["score"] is not None else None,
            "pace_consistency_tier": pace_consistency.get("tier", 1),
            "pace_consistency_cv": round(pace_consistency.get("cv", 0), 4),
            "split_deviation": round(pace_consistency.get("split_deviation", 0), 4),
            "terrain_brutality_score": round(terrain_brutality, 2),
            "terrain_difficulty_score": terrain_difficulty_score,
            "effort_index": round(effort_index, 3),
            "route_complexity_score": round(route_complexity, 2),
            "coordinate_revisit_pct": round(revisit_pct, 3),
            "avg_hr": hr_data.get("avg"),
            "max_hr": hr_data.get("max"),
            "start_time": start_datetime.isoformat(),
            "timestamp_estimated": timestamp_estimated,
            "has_timestamps": has_timestamps,
            "start_lat": points[0]["lat"],
            "start_lon": points[0]["lon"],
            "elevation_profile": elevation_profile,
            "coordinate_stream": coordinate_stream,
            "point_count": len(points),
        }

    def _detect_namespace(self, root) -> dict:
        tag = root.tag
        if "{" in tag:
            ns_uri = tag.split("}")[0] + "}"
            return {"gpx": ns_uri[1:-1]}
        return {}

    def _extract_trackpoints(self, root, ns: dict) -> list:
        points = []
        prefix = f"{{{ns['gpx']}}}" if ns else ""
        cumulative_dist = 0.0

        for trk in root.iter(f"{prefix}trk"):
            for seg in trk.iter(f"{prefix}trkseg"):
                for pt in seg.iter(f"{prefix}trkpt"):
                    lat = float(pt.get("lat", 0))
                    lon = float(pt.get("lon", 0))

                    ele_elem = pt.find(f"{prefix}ele")
                    ele = float(ele_elem.text) if ele_elem is not None else 0.0

                    time_elem = pt.find(f"{prefix}time")
                    time = None
                    if time_elem is not None and time_elem.text:
                        try:
                            time = datetime.fromisoformat(
                                time_elem.text.replace("Z", "+00:00")
                            )
                        except ValueError:
                            pass

                    hr = None
                    extensions = pt.find(f"{prefix}extensions")
                    if extensions is not None:
                        for elem in extensions.iter():
                            if "hr" in elem.tag.lower() or "heartrate" in elem.tag.lower():
                                try:
                                    hr = int(float(elem.text))
                                except (ValueError, TypeError):
                                    pass

                    if points:
                        prev = points[-1]
                        d = haversine(prev["lat"], prev["lon"], lat, lon)
                        cumulative_dist += d

                    point = {
                        "lat": lat,
                        "lon": lon,
                        "ele": ele,
                        "time": time,
                        "hr": hr,
                        "cumulative_distance_m": cumulative_dist,
                        "cumulative_distance_km": cumulative_dist / 1000.0,
                    }
                    points.append(point)

        return points

    def _calculate_segments(self, points: list) -> list:
        segments = []
        for i in range(1, len(points)):
            p1, p2 = points[i - 1], points[i]
            dist = haversine(p1["lat"], p1["lon"], p2["lat"], p2["lon"])
            dt = 0.0
            if p1.get("time") and p2.get("time"):
                dt = (p2["time"] - p1["time"]).total_seconds()
            speed_ms = dist / dt if dt > 0 else 0
            segments.append({"distance": dist, "time_seconds": dt, "speed_ms": speed_ms})
        return segments

    def _calculate_moving_time(self, segments: list, threshold_ms: float) -> float:
        return sum(
            s["time_seconds"]
            for s in segments
            if s["speed_ms"] >= threshold_ms and s["time_seconds"] > 0
        )

    def _calculate_elevation_metrics(self, points: list, elevations: list, distance_km: float) -> dict:
        total_gain = 0.0
        total_loss = 0.0
        for i in range(1, len(elevations)):
            diff = elevations[i] - elevations[i - 1]
            if diff > 0:
                total_gain += diff
            else:
                total_loss += abs(diff)

        return {
            "total_gain": total_gain,
            "total_loss": total_loss,
            "elevation_density": total_gain / distance_km if distance_km > 0 else 0,
            "min_elevation": min(elevations) if elevations else 0,
            "max_elevation": max(elevations) if elevations else 0,
        }

    def _calculate_km_splits(self, points: list, segments: list) -> list:
        if not points or not segments:
            return []

        splits = []
        km_marker = 1.0
        split_start_time = 0.0
        cumulative_time = 0.0
        split_start_elevation = points[0].get("ele_corrected", points[0].get("ele", 0))

        for i, seg in enumerate(segments):
            cumulative_time += seg["time_seconds"]
            cumulative_dist_km = points[i + 1]["cumulative_distance_km"]

            if cumulative_dist_km >= km_marker:
                split_time = cumulative_time - split_start_time
                split_end_elevation = points[i + 1].get("ele_corrected", points[i + 1].get("ele", 0))
                gradient = (split_end_elevation - split_start_elevation) / 1000.0
                splits.append({
                    "km": int(km_marker),
                    "time_seconds": round(split_time, 1),
                    "pace_sec_per_km": round(split_time, 1),
                    "pace_formatted": self._format_pace(split_time),
                    "gradient": round(gradient, 4),
                })
                split_start_time = cumulative_time
                split_start_elevation = split_end_elevation
                km_marker += 1.0

        remaining_time = cumulative_time - split_start_time
        remaining_dist = points[-1]["cumulative_distance_km"] - (km_marker - 1)
        if remaining_dist > 0.1 and remaining_time > 0:
            pace_for_partial = remaining_time / remaining_dist
            end_elevation = points[-1].get("ele_corrected", points[-1].get("ele", 0))
            dist_m = remaining_dist * 1000.0
            gradient = (end_elevation - split_start_elevation) / dist_m if dist_m > 0 else 0.0
            splits.append({
                "km": round(km_marker, 1),
                "time_seconds": round(remaining_time, 1),
                "pace_sec_per_km": round(pace_for_partial, 1),
                "pace_formatted": self._format_pace(pace_for_partial),
                "gradient": round(gradient, 4),
                "partial": True,
            })

        return splits

    def _calculate_pace_consistency(self, km_splits: list) -> dict:
        full_splits = [s for s in km_splits if not s.get("partial")]
        n = len(full_splits)

        min_full    = self._cfg("pace_consistency_min_splits_full",    Config.PACE_CONSISTENCY_MIN_SPLITS_FULL)
        min_partial = self._cfg("pace_consistency_min_splits_partial", Config.PACE_CONSISTENCY_MIN_SPLITS_PARTIAL)
        trim_pct    = self._cfg("pace_consistency_trim_pct",           Config.PACE_CONSISTENCY_TRIM_PCT)

        if n < min_partial:
            return {"score": None, "tier": 3, "split_count": n}

        paces = [s["pace_sec_per_km"] for s in full_splits]

        if n >= min_full:
            trim_count = max(1, int(n * trim_pct))
            sorted_paces = sorted(paces)
            trimmed = sorted_paces[trim_count: n - trim_count]
            if len(trimmed) < 2:
                trimmed = sorted_paces
            use_paces = trimmed
            tier = 1
        else:
            use_paces = paces
            tier = 2

        mean_pace = sum(use_paces) / len(use_paces)
        if mean_pace == 0:
            return {"score": 0, "cv": 0, "split_deviation": 0, "tier": tier}

        variance = sum((p - mean_pace) ** 2 for p in use_paces) / len(use_paces)
        std_dev = math.sqrt(variance)
        cv = std_dev / mean_pace

        return {
            "score": round(max(0, 1 - cv), 4),
            "cv": cv,
            "split_deviation": std_dev,
            "mean_pace": mean_pace,
            "total_splits": n,
            "tier": tier,
        }

    def _calculate_gradient_metrics(self, points: list, elevations: list, total_distance_m: float) -> dict:
        segment_length = self._cfg("gradient_segment_length", Config.GRADIENT_SEGMENT_LENGTH)
        window_length  = self._cfg("max_gradient_window",     Config.MAX_GRADIENT_WINDOW)

        gradients = []
        segment_data = []
        i = 0
        cumulative = 0.0

        while i < len(points) - 1:
            seg_start = i
            seg_dist = 0.0
            while i < len(points) - 1 and seg_dist < segment_length:
                d = haversine(
                    points[i]["lat"], points[i]["lon"],
                    points[i + 1]["lat"], points[i + 1]["lon"],
                )
                seg_dist += d
                i += 1

            if seg_dist > 0:
                ele_change = elevations[i] - elevations[seg_start]
                gradient_pct = (ele_change / seg_dist) * 100
                gradients.append(gradient_pct)
                cumulative += seg_dist
                segment_data.append({
                    "distance_m": round(cumulative, 1),
                    "gradient_pct": round(gradient_pct, 1),
                })

        gradient_variability = 0.0
        if len(gradients) >= 2:
            mean_g = sum(gradients) / len(gradients)
            variance = sum((g - mean_g) ** 2 for g in gradients) / len(gradients)
            gradient_variability = math.sqrt(variance)

        max_sustained = 0.0
        segments_per_window = max(1, int(window_length / segment_length))
        for start in range(len(gradients) - segments_per_window + 1):
            window = gradients[start: start + segments_per_window]
            avg = sum(window) / len(window)
            if avg > max_sustained:
                max_sustained = avg

        return {
            "gradient_variability": gradient_variability,
            "max_sustained_gradient": max_sustained,
            "segments": segment_data[:200],
        }

    def _detect_climbs(self, elevations: list, points: list) -> dict:
        min_gain   = self._cfg("climb_min_gain",   Config.CLIMB_MIN_GAIN)
        end_descent = self._cfg("climb_end_descent", Config.CLIMB_END_DESCENT)

        climbs = []
        in_climb = False
        climb_start_idx = 0
        climb_start_ele = 0.0
        local_high = 0.0
        total_gain = sum(max(0, elevations[i] - elevations[i-1]) for i in range(1, len(elevations)))

        for i in range(1, len(elevations)):
            if not in_climb:
                if elevations[i] > elevations[i - 1]:
                    in_climb = True
                    climb_start_idx = i - 1
                    climb_start_ele = elevations[i - 1]
                    local_high = elevations[i]
            else:
                if elevations[i] > local_high:
                    local_high = elevations[i]
                elif local_high - elevations[i] > end_descent:
                    gain = local_high - climb_start_ele
                    if gain >= min_gain:
                        climbs.append({
                            "start_idx": climb_start_idx,
                            "end_idx": i,
                            "start_elevation": round(climb_start_ele, 1),
                            "peak_elevation": round(local_high, 1),
                            "gain": round(gain, 1),
                            "gain_pct_of_total": round(gain / total_gain * 100, 1) if total_gain > 0 else 0,
                            "start_km": round(points[climb_start_idx]["cumulative_distance_km"], 2),
                            "end_km": round(points[i]["cumulative_distance_km"], 2),
                        })
                    in_climb = False

        if in_climb:
            gain = local_high - climb_start_ele
            if gain >= min_gain:
                climbs.append({
                    "start_idx": climb_start_idx,
                    "end_idx": len(elevations) - 1,
                    "start_elevation": round(climb_start_ele, 1),
                    "peak_elevation": round(local_high, 1),
                    "gain": round(gain, 1),
                    "gain_pct_of_total": round(gain / total_gain * 100, 1) if total_gain > 0 else 0,
                    "start_km": round(points[climb_start_idx]["cumulative_distance_km"], 2),
                    "end_km": round(points[-1]["cumulative_distance_km"], 2),
                })

        structure = self._classify_climb_structure(climbs, total_gain, points, elevations)
        return {"climbs": climbs, "structure": structure}

    def _classify_climb_structure(self, climbs: list, total_gain: float, points: list, elevations: list) -> str:
        p3 = Config.PILLAR3
        if not climbs or total_gain == 0:
            return "Even/Rolling"

        if len(climbs) >= p3["technical_min_climbs"]:
            avg_climb_gain = sum(c["gain"] for c in climbs) / len(climbs)
            descents_between = []
            for i in range(len(climbs) - 1):
                end_ele = climbs[i]["peak_elevation"]
                next_start_ele = climbs[i + 1]["start_elevation"]
                descents_between.append(max(0, end_ele - next_start_ele))
            if descents_between:
                avg_descent = sum(descents_between) / len(descents_between)
                if avg_descent < avg_climb_gain * p3["technical_descent_ratio"]:
                    return "Technical"

        max_climb = max(climbs, key=lambda c: c["gain"])
        if max_climb["gain"] / total_gain >= p3["single_climb_pct"] and len(climbs) <= 2:
            return "Single Ascent"

        total_dist = points[-1]["cumulative_distance_km"] if points else 0
        if total_dist > 0:
            midpoint = total_dist / 2
            first_half_gain  = sum(c["gain"] for c in climbs if c["start_km"] < midpoint)
            second_half_gain = sum(c["gain"] for c in climbs if c["start_km"] >= midpoint)
            if (first_half_gain / total_gain >= p3["stacked_half_pct"] or
                    second_half_gain / total_gain >= p3["stacked_half_pct"]):
                return "Stacked"

        max_pct = max(c["gain_pct_of_total"] for c in climbs)
        if max_pct <= p3["even_max_climb_pct"] * 100:
            return "Even/Rolling"

        return "Even/Rolling"

    def _calculate_terrain_brutality(self, elevation_density: float, max_sustained_gradient: float, gradient_variability: float) -> float:
        w = Config.TBS_WEIGHTS
        ed_score  = min(100, (elevation_density / 50) * 100)
        msg_score = min(100, (abs(max_sustained_gradient) / 30) * 100)
        gv_score  = min(100, (gradient_variability / 15) * 100)
        return (
            ed_score  * w["elevation_density"]
            + msg_score * w["max_gradient"]
            + gv_score  * w["gradient_variability"]
        )

    def _calculate_tds_score(self, tbs: float, elevation_gain: float, distance_km: float) -> int:
        t = Config.TDS
        raw = round(tbs / t["divisor"])
        tds = min(max(raw, t["min"]), t["max"])
        if elevation_gain >= t["gain_floor_t2_gain"] and distance_km >= t["gain_floor_t2_dist"]:
            tds = max(tds, t["gain_floor_t2_score"])
        elif elevation_gain >= t["gain_floor_t1_gain"] and distance_km >= t["gain_floor_t1_dist"]:
            tds = max(tds, t["gain_floor_t1_score"])
        return tds

    def _calculate_route_complexity(self, climb_count: int, effort_index: float, split_deviation: float) -> float:
        w = Config.RCS_WEIGHTS
        cc_score = min(100, (climb_count / 10) * 100)
        ei_score = min(100, (effort_index / 3) * 100)
        sd_score = min(100, (split_deviation / 120) * 100)
        return (
            cc_score * w["climb_count"]
            + ei_score * w["effort_index"]
            + sd_score * w["split_deviation"]
        )

    def _coordinate_revisit_pct(self, points: list) -> float:
        if len(points) < 10:
            return 0.0
        visited = set()
        revisits = 0
        grid_size = 0.0002
        for p in points:
            cell = (round(p["lat"] / grid_size), round(p["lon"] / grid_size))
            if cell in visited:
                revisits += 1
            visited.add(cell)
        return revisits / len(points)

    def _extract_hr(self, points: list) -> dict:
        hr_values = [p["hr"] for p in points if p.get("hr")]
        if not hr_values:
            return {}
        return {
            "avg": round(sum(hr_values) / len(hr_values)),
            "max": max(hr_values),
            "min": min(hr_values),
            "count": len(hr_values),
        }

    @staticmethod
    def _format_pace(seconds_per_km: float) -> str:
        if seconds_per_km <= 0:
            return "0:00"
        minutes = int(seconds_per_km // 60)
        seconds = int(seconds_per_km % 60)
        return f"{minutes}:{seconds:02d}"
