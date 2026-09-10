"""Build one reusable 30 m city flood-statistics override."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

from build_city_impact_stats import LEVEL_STEP, flood_curve, iter_points
from build_national_flood_textures import MAX_LEVEL, calculate_thresholds, external_ocean_mask, rasterize_land
from prepare_national_dem import MANIFEST_PATH, RAW_DIR, inspect_plan


ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT / "data" / "terrain" / "highResolutionCities.json"
OUTPUT_DIR = ROOT / "data" / "dem" / "high-resolution-city-stats"
PIXELS_PER_DEGREE = 3600
BUFFER_DEGREES = 0.05


def aligned_bounds(boundary_data: dict) -> dict[str, float]:
    points = [
        point
        for feature in boundary_data["features"]
        for point in iter_points(feature["geometry"]["coordinates"])
    ]
    west = math.floor((min(point[0] for point in points) - BUFFER_DEGREES) * PIXELS_PER_DEGREE)
    south = math.floor((min(point[1] for point in points) - BUFFER_DEGREES) * PIXELS_PER_DEGREE)
    east = math.ceil((max(point[0] for point in points) + BUFFER_DEGREES) * PIXELS_PER_DEGREE)
    north = math.ceil((max(point[1] for point in points) + BUFFER_DEGREES) * PIXELS_PER_DEGREE)
    return {
        "west": west / PIXELS_PER_DEGREE,
        "south": south / PIXELS_PER_DEGREE,
        "east": east / PIXELS_PER_DEGREE,
        "north": north / PIXELS_PER_DEGREE,
    }


def overlaps(first: dict, second: dict) -> bool:
    return not (
        first["east"] <= second["west"]
        or first["west"] >= second["east"]
        or first["north"] <= second["south"]
        or first["south"] >= second["north"]
    )


def source_catalog() -> list[dict]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    report = inspect_plan(manifest)
    catalog = {}
    for tile in report["tiles"]:
        if not tile["ready"]:
            continue
        for source in tile["sources"]:
            catalog[source["file"]] = source
    return list(catalog.values())


def load_dem(bounds: dict, catalog: list[dict]) -> tuple[np.ndarray, list[str]]:
    width = round((bounds["east"] - bounds["west"]) * PIXELS_PER_DEGREE)
    height = round((bounds["north"] - bounds["south"]) * PIXELS_PER_DEGREE)
    mosaic = np.full((height, width), np.nan, dtype=np.float32)
    used_sources = []

    Image.MAX_IMAGE_PIXELS = None
    for source in catalog:
        source_bounds = source["bounds"]
        if not overlaps(bounds, source_bounds):
            continue

        west = max(bounds["west"], source_bounds["west"])
        south = max(bounds["south"], source_bounds["south"])
        east = min(bounds["east"], source_bounds["east"])
        north = min(bounds["north"], source_bounds["north"])
        path = RAW_DIR / source["file"]
        with Image.open(path) as image:
            source_ppd_x = image.width / (source_bounds["east"] - source_bounds["west"])
            source_ppd_y = image.height / (source_bounds["north"] - source_bounds["south"])
            sx0 = round((west - source_bounds["west"]) * source_ppd_x)
            sx1 = round((east - source_bounds["west"]) * source_ppd_x)
            sy0 = round((source_bounds["north"] - north) * source_ppd_y)
            sy1 = round((source_bounds["north"] - south) * source_ppd_y)
            crop = np.asarray(image.crop((sx0, sy0, sx1, sy1)), dtype=np.float32)

        tx0 = round((west - bounds["west"]) * PIXELS_PER_DEGREE)
        tx1 = round((east - bounds["west"]) * PIXELS_PER_DEGREE)
        ty0 = round((bounds["north"] - north) * PIXELS_PER_DEGREE)
        ty1 = round((bounds["north"] - south) * PIXELS_PER_DEGREE)
        target = mosaic[ty0:ty1, tx0:tx1]
        if crop.shape != target.shape:
            crop = np.asarray(
                Image.fromarray(crop).resize((target.shape[1], target.shape[0]), Image.Resampling.BILINEAR),
                dtype=np.float32,
            )
        available = np.isfinite(crop) & ~np.isfinite(target)
        target[available] = crop[available]
        used_sources.append(source["file"])

    if not np.isfinite(mosaic).any():
        raise RuntimeError("No downloaded DEM source overlaps this city")
    return mosaic, used_sources


def build_record(config: dict, catalog: list[dict]) -> dict:
    boundary_path = ROOT / config["boundary"]
    boundary_data = json.loads(boundary_path.read_text(encoding="utf-8"))
    bounds = aligned_bounds(boundary_data)
    dem, sources = load_dem(bounds, catalog)
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
    if model_area <= 0:
        raise RuntimeError("Detailed boundary produced no valid land pixels")

    levels = np.round(np.arange(0.0, MAX_LEVEL + LEVEL_STEP / 2, LEVEL_STEP), 2)
    flooded_model_area, _ = flood_curve(thresholds, land, area_weights, levels)
    official_area = float(config["officialAreaKm2"])
    flooded_areas = flooded_model_area / model_area * official_area
    return {
        "id": config["id"],
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
        "boundarySource": str(Path(config["boundary"]).name),
        "demSources": sources,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a 30 m city flood-statistics override.")
    parser.add_argument("--city", required=True, help="City administrative code from the config file")
    args = parser.parse_args()

    config_data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    config = next((city for city in config_data["cities"] if city["id"] == args.city), None)
    if config is None:
        raise SystemExit(f"Unknown high-resolution city: {args.city}")

    print(f"Building {config['name']} ({config['id']})", flush=True)
    record = build_record(config, source_catalog())
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = OUTPUT_DIR / f"{config['id']}.json"
    output.write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"Wrote {output.relative_to(ROOT)}: model {record['modelLandAreaKm2']:.2f} km2, "
        f"official {record['totalAreaKm2']:.2f} km2",
        flush=True,
    )


if __name__ == "__main__":
    main()
