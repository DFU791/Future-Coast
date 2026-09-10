"""Build compact city-level flood curves from the national threshold grid."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterator

import numpy as np
from PIL import Image

from build_national_flood_textures import (
    CHINA_PATH,
    MAX_LEVEL,
    WORLD_LAND_PATH,
    build_shared_grid,
    calculate_thresholds,
    external_ocean_mask,
    rasterize_land,
)
from prepare_national_dem import MANIFEST_PATH, inspect_plan, read_bounds


ROOT = Path(__file__).resolve().parents[2]
CITY_BOUNDARIES_PATH = ROOT / "data" / "boundaries" / "china-prefecture-cities.geojson"
OUTPUT_PATH = ROOT / "src" / "data" / "terrain" / "cityImpactStats.json"
HIGH_RESOLUTION_STATS_DIR = ROOT / "data" / "dem" / "high-resolution-city-stats"
LEVEL_STEP = 0.05
MIN_COVERAGE = 0.9
MIN_POTENTIAL_AREA_KM2 = 1.0
DIRECT_CITY_ADcodes = {120000, 310000, 810000, 820000}
EXCLUDED_CITY_ADcodes = {460300}  # Sansha's administrative polygon is predominantly maritime.
HIGH_RESOLUTION_CITIES = {
    "820000": {
        "boundary": ROOT / "data" / "boundaries" / "macau-datav-full.geojson",
        "dem": ROOT / "data" / "dem" / "raw" / "copernicus_glo30" / "national" / "pearl-east--r0c1.tif",
        "officialAreaKm2": 33.4,
        "areaYear": 2025,
        "areaSource": "Macao Statistics and Census Service",
        "name": "澳门",
        "fullName": "澳门特别行政区",
        "province": "澳门特别行政区",
        "center": [113.56699, 22.15931],
    },
}


def iter_points(coordinates: list) -> Iterator[tuple[float, float]]:
    if coordinates and isinstance(coordinates[0], (int, float)):
        yield float(coordinates[0]), float(coordinates[1])
        return
    for child in coordinates:
        yield from iter_points(child)


def geometry_bounds(feature: dict) -> tuple[float, float, float, float]:
    points = list(iter_points(feature["geometry"]["coordinates"]))
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def grid_window(
    feature: dict,
    bounds: dict,
    width: int,
    height: int,
) -> tuple[int, int, int, int] | None:
    west, south, east, north = geometry_bounds(feature)
    if east <= bounds["west"] or west >= bounds["east"] or north <= bounds["south"] or south >= bounds["north"]:
        return None

    west = max(west, bounds["west"])
    south = max(south, bounds["south"])
    east = min(east, bounds["east"])
    north = min(north, bounds["north"])
    x0 = max(0, math.floor((west - bounds["west"]) / (bounds["east"] - bounds["west"]) * width))
    x1 = min(width, math.ceil((east - bounds["west"]) / (bounds["east"] - bounds["west"]) * width))
    y0 = max(0, math.floor((bounds["north"] - north) / (bounds["north"] - bounds["south"]) * height))
    y1 = min(height, math.ceil((bounds["north"] - south) / (bounds["north"] - bounds["south"]) * height))
    if x0 >= x1 or y0 >= y1:
        return None
    return x0, y0, x1, y1


def local_bounds(window: tuple[int, int, int, int], bounds: dict, width: int, height: int) -> dict:
    x0, y0, x1, y1 = window
    lon_step = (bounds["east"] - bounds["west"]) / width
    lat_step = (bounds["north"] - bounds["south"]) / height
    return {
        "west": bounds["west"] + x0 * lon_step,
        "south": bounds["north"] - y1 * lat_step,
        "east": bounds["west"] + x1 * lon_step,
        "north": bounds["north"] - y0 * lat_step,
    }


def display_name(name: str) -> str:
    if name.endswith("特别行政区"):
        return name.removesuffix("特别行政区")
    if name.endswith("市"):
        return name[:-1]
    return name


def collect_city_features(city_data: dict, china_data: dict) -> list[dict]:
    cities = [
        feature
        for feature in city_data["features"]
        if feature.get("properties", {}).get("level") == "city"
        and feature.get("properties", {}).get("adcode") not in EXCLUDED_CITY_ADcodes
    ]
    cities.extend(
        feature
        for feature in china_data["features"]
        if feature.get("properties", {}).get("adcode") in DIRECT_CITY_ADcodes
    )
    return cities


def flood_curve(
    thresholds: np.ndarray,
    land: np.ndarray,
    area_weights: np.ndarray,
    levels: np.ndarray,
) -> tuple[np.ndarray, float]:
    floodable = land & np.isfinite(thresholds) & (thresholds <= MAX_LEVEL)
    if not floodable.any():
        return np.zeros_like(levels, dtype=np.float64), 0.0

    flood_levels = thresholds[floodable]
    flood_weights = area_weights[floodable]
    order = np.argsort(flood_levels)
    sorted_levels = flood_levels[order]
    cumulative_area = np.cumsum(flood_weights[order])
    indices = np.searchsorted(sorted_levels, levels, side="right") - 1
    flooded_areas = np.where(indices >= 0, cumulative_area[np.maximum(indices, 0)], 0.0)
    flooded_areas[levels <= 0.0] = 0.0
    return flooded_areas, float(cumulative_area[-1])


def high_resolution_city_record(city_id: str, config: dict, levels: np.ndarray) -> dict:
    boundary_data = json.loads(Path(config["boundary"]).read_text(encoding="utf-8"))
    points = [
        point
        for feature in boundary_data["features"]
        for point in iter_points(feature["geometry"]["coordinates"])
    ]
    west = min(point[0] for point in points) - 0.01
    south = min(point[1] for point in points) - 0.01
    east = max(point[0] for point in points) + 0.01
    north = max(point[1] for point in points) + 0.01

    Image.MAX_IMAGE_PIXELS = None
    with Image.open(config["dem"]) as image:
        source_bounds = read_bounds(image)
        pixel_width = (source_bounds["east"] - source_bounds["west"]) / image.width
        pixel_height = (source_bounds["north"] - source_bounds["south"]) / image.height
        x0 = max(0, math.floor((west - source_bounds["west"]) / pixel_width))
        x1 = min(image.width, math.ceil((east - source_bounds["west"]) / pixel_width))
        y0 = max(0, math.floor((source_bounds["north"] - north) / pixel_height))
        y1 = min(image.height, math.ceil((source_bounds["north"] - south) / pixel_height))
        dem = np.asarray(image.crop((x0, y0, x1, y1)), dtype=np.float32)

    bounds = {
        "west": source_bounds["west"] + x0 * pixel_width,
        "south": source_bounds["north"] - y1 * pixel_height,
        "east": source_bounds["west"] + x1 * pixel_width,
        "north": source_bounds["north"] - y0 * pixel_height,
    }
    boundary_mask = rasterize_land(boundary_data, bounds, dem.shape[1], dem.shape[0])
    water = np.isfinite(dem) & np.isclose(dem, 0.0, atol=0.0001)
    ocean = external_ocean_mask(~water)
    land = boundary_mask & np.isfinite(dem) & (dem > 0.0)
    thresholds = calculate_thresholds(dem, land, ocean)

    lat_step = (bounds["north"] - bounds["south"]) / dem.shape[0]
    lon_step = (bounds["east"] - bounds["west"]) / dem.shape[1]
    latitudes = bounds["north"] - (np.arange(dem.shape[0], dtype=np.float64) + 0.5) * lat_step
    row_area_km2 = (111.32 * lat_step) * (111.32 * lon_step * np.cos(np.deg2rad(latitudes)))
    area_weights = np.broadcast_to(row_area_km2[:, None], land.shape)
    model_area = float(np.sum(area_weights[land]))
    flooded_model_area, _ = flood_curve(thresholds, land, area_weights, levels)
    official_area = float(config["officialAreaKm2"])
    flooded_areas = flooded_model_area / model_area * official_area

    return {
        "id": city_id,
        "name": config["name"],
        "fullName": config["fullName"],
        "province": config["province"],
        "center": config["center"],
        "totalAreaKm2": official_area,
        "coverage": 1.0,
        "floodedAreaKm2": [round(float(area), 3) for area in flooded_areas],
        "modelLandAreaKm2": round(model_area, 2),
        "resolutionMeters": 30,
        "areaYear": config["areaYear"],
        "areaSource": config["areaSource"],
    }


def city_record(
    feature: dict,
    dem: np.ndarray,
    thresholds: np.ndarray,
    china_land: np.ndarray,
    bounds: dict,
    levels: np.ndarray,
    province_names: dict[int, str],
) -> dict | None:
    height, width = dem.shape
    window = grid_window(feature, bounds, width, height)
    if window is None:
        return None

    x0, y0, x1, y1 = window
    crop_bounds = local_bounds(window, bounds, width, height)
    mask = rasterize_land(
        {"type": "FeatureCollection", "features": [feature]},
        crop_bounds,
        x1 - x0,
        y1 - y0,
    )
    local_china = china_land[y0:y1, x0:x1]
    administrative_land = mask & local_china
    if not administrative_land.any():
        return None

    local_dem = dem[y0:y1, x0:x1]
    source_covered = administrative_land & np.isfinite(local_dem)
    # COP30 encodes open water as exact zero in these source tiles. Keep those
    # pixels out of physical city statistics even when a generalized boundary
    # polygon extends into the sea.
    covered_land = source_covered & (local_dem > 0.0)
    lat_step = (bounds["north"] - bounds["south"]) / height
    lon_step = (bounds["east"] - bounds["west"]) / width
    latitudes = bounds["north"] - (np.arange(y0, y1, dtype=np.float64) + 0.5) * lat_step
    row_area_km2 = (111.32 * lat_step) * (111.32 * lon_step * np.cos(np.deg2rad(latitudes)))
    area_weights = np.broadcast_to(row_area_km2[:, None], covered_land.shape)
    administrative_area = float(np.sum(np.broadcast_to(row_area_km2[:, None], administrative_land.shape)[administrative_land]))
    source_area = float(np.sum(area_weights[source_covered]))
    covered_area = float(np.sum(area_weights[covered_land]))
    coverage = source_area / administrative_area if administrative_area else 0.0
    if coverage < MIN_COVERAGE or covered_area <= 0:
        return None

    local_thresholds = thresholds[y0:y1, x0:x1]
    flooded_areas, potential_area = flood_curve(local_thresholds, covered_land, area_weights, levels)
    if potential_area < MIN_POTENTIAL_AREA_KM2:
        return None

    properties = feature.get("properties", {})
    adcode = int(properties.get("adcode"))
    parent = properties.get("parent") or {}
    province_adcode = adcode if adcode in DIRECT_CITY_ADcodes else int(parent.get("adcode", 0))
    center = properties.get("centroid") or properties.get("center") or [
        (crop_bounds["west"] + crop_bounds["east"]) / 2,
        (crop_bounds["south"] + crop_bounds["north"]) / 2,
    ]
    name = str(properties.get("name", adcode))
    return {
        "id": str(adcode),
        "name": display_name(name),
        "fullName": name,
        "province": province_names.get(province_adcode, ""),
        "center": [round(float(center[0]), 5), round(float(center[1]), 5)],
        "totalAreaKm2": round(covered_area, 2),
        "coverage": round(coverage, 4),
        "floodedAreaKm2": [round(float(area), 2) for area in flooded_areas],
    }


def main() -> None:
    city_data = json.loads(CITY_BOUNDARIES_PATH.read_text(encoding="utf-8"))
    china_data = json.loads(CHINA_PATH.read_text(encoding="utf-8"))
    world_land_data = json.loads(WORLD_LAND_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    ready = [tile for tile in inspect_plan(manifest)["tiles"] if tile["ready"]]
    dem, thresholds, china_land, bounds = build_shared_grid(
        ready,
        world_land_data,
        china_data,
        apply_visual_spread=False,
    )

    province_names = {
        int(feature["properties"]["adcode"]): str(feature["properties"]["name"])
        for feature in china_data["features"]
        if str(feature.get("properties", {}).get("adcode", "")).isdigit()
    }
    levels = np.round(np.arange(0.0, MAX_LEVEL + LEVEL_STEP / 2, LEVEL_STEP), 2)
    records = []
    for feature in collect_city_features(city_data, china_data):
        record = city_record(feature, dem, thresholds, china_land, bounds, levels, province_names)
        if record:
            records.append(record)
            print(f"  {record['name']}: {record['totalAreaKm2']:.0f} km2", flush=True)

    records_by_id = {record["id"]: record for record in records}
    for city_id, config in HIGH_RESOLUTION_CITIES.items():
        record = high_resolution_city_record(city_id, config, levels)
        records_by_id[city_id] = record
        print(
            f"  {record['name']}: {record['totalAreaKm2']:.1f} km2 "
            f"({record['resolutionMeters']} m override)",
            flush=True,
        )

    if HIGH_RESOLUTION_STATS_DIR.exists():
        for path in sorted(HIGH_RESOLUTION_STATS_DIR.glob("*.json")):
            record = json.loads(path.read_text(encoding="utf-8"))
            records_by_id[record["id"]] = record
            print(
                f"  {record['name']}: {record['totalAreaKm2']:.1f} km2 "
                f"({record['resolutionMeters']} m override)",
                flush=True,
            )
    records = list(records_by_id.values())

    records.sort(key=lambda city: city["name"])
    output = {
        "version": 2,
        "source": {
            "boundaries": "Alibaba Cloud DataV GeoAtlas areas_v3",
            "floodModel": "Future Coast physical ocean-connected threshold grid",
        },
        "maxLevel": MAX_LEVEL,
        "levelStep": LEVEL_STEP,
        "levels": levels.tolist(),
        "cities": records,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH.relative_to(ROOT)} with {len(records)} cities", flush=True)


if __name__ == "__main__":
    main()
