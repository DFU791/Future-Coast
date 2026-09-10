import argparse
import heapq
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from prepare_national_dem import (
    ANALYSIS_DIR,
    MANIFEST_PATH,
    PIXELS_PER_DEGREE,
    REPORT_PATH,
    build_analysis_mosaic,
    inspect_plan,
)


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "flood" / "national"
META_PATH = ROOT / "src" / "data" / "terrain" / "nationalFloodTiles.json"
WORLD_LAND_PATH = ROOT / "src" / "data" / "world-land.json"
CHINA_PATH = ROOT / "src" / "data" / "china-geo.json"
MAX_LEVEL = 10.0
LOWLAND_THRESHOLD_CUTOFF = 0.12
LOWLAND_REVEAL_START = 0.02
LOWLAND_REVEAL_END = 0.35
LOWLAND_REVEAL_DISTANCE_PIXELS = 80
SOUTH_CHINA_SEA_BOUNDARY_ADCODE = "100000_JD"


def exclude_special_boundaries(collection: dict) -> dict:
    """Exclude cartographic boundary guides that are not physical land."""
    return {
        **collection,
        "features": [
            feature
            for feature in collection["features"]
            if str(feature.get("properties", {}).get("adcode")) != SOUTH_CHINA_SEA_BOUNDARY_ADCODE
        ],
    }


def project(point: list[float], bounds: dict, width: int, height: int) -> tuple[float, float]:
    x = (point[0] - bounds["west"]) / (bounds["east"] - bounds["west"]) * width
    y = (bounds["north"] - point[1]) / (bounds["north"] - bounds["south"]) * height
    return x, y


def draw_polygon(draw: ImageDraw.ImageDraw, polygon: list, bounds: dict, width: int, height: int) -> None:
    if not polygon:
        return
    draw.polygon([project(point, bounds, width, height) for point in polygon[0]], fill=255)
    for hole in polygon[1:]:
        draw.polygon([project(point, bounds, width, height) for point in hole], fill=0)


def rasterize_land(collection: dict, bounds: dict, width: int, height: int) -> np.ndarray:
    image = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(image)
    for feature in collection["features"]:
        geometry = feature.get("geometry")
        if not geometry:
            continue
        if geometry["type"] == "Polygon":
            draw_polygon(draw, geometry["coordinates"], bounds, width, height)
        elif geometry["type"] == "MultiPolygon":
            for polygon in geometry["coordinates"]:
                draw_polygon(draw, polygon, bounds, width, height)
    return np.asarray(image, dtype=bool)


def external_ocean_mask(world_land: np.ndarray) -> np.ndarray:
    water = ~world_land
    edge = np.zeros_like(water, dtype=bool)
    edge[0, :] = water[0, :]
    edge[-1, :] = water[-1, :]
    edge[:, 0] |= water[:, 0]
    edge[:, -1] |= water[:, -1]
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool)
    return ndimage.binary_propagation(edge, structure=structure, mask=water)


def calculate_thresholds(dem: np.ndarray, china_land: np.ndarray, ocean: np.ndarray) -> np.ndarray:
    height, width = dem.shape
    thresholds = np.full(dem.shape, np.inf, dtype=np.float32)
    frontier: list[tuple[float, int]] = []

    eligible_land = china_land & np.isfinite(dem)
    ocean_frontier = ocean & ndimage.binary_dilation(
        eligible_land,
        structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool),
    )
    for index in np.flatnonzero(ocean_frontier):
        thresholds.flat[index] = 0.0
        heapq.heappush(frontier, (0.0, int(index)))

    neighbors = ((-1, 0), (1, 0), (0, -1), (0, 1))
    processed = 0
    while frontier:
        threshold, index = heapq.heappop(frontier)
        if threshold != thresholds.flat[index]:
            continue
        y, x = divmod(index, width)
        processed += 1

        for dy, dx in neighbors:
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= height or nx < 0 or nx >= width or not eligible_land[ny, nx]:
                continue
            elevation = dem[ny, nx]
            candidate = max(threshold, float(elevation), 0.0)
            if candidate < thresholds[ny, nx] and candidate <= MAX_LEVEL:
                thresholds[ny, nx] = candidate
                heapq.heappush(frontier, (candidate, ny * width + nx))

        if processed % 250000 == 0:
            print(f"  processed {processed:,} pixels", flush=True)
    return thresholds


def spread_lowland_thresholds(
    thresholds: np.ndarray,
    china_land: np.ndarray,
    ocean: np.ndarray,
) -> np.ndarray:
    """Spread near-zero connected lowland over a short coastal reveal range."""
    lowland = china_land & np.isfinite(thresholds) & (thresholds <= LOWLAND_THRESHOLD_CUTOFF)
    if not lowland.any():
        return thresholds

    # The DEM contains broad near-zero plateaus. A hard display floor makes all
    # of them appear at once, so use distance from open water to order only that
    # uncertain low-elevation band. Higher terrain keeps its DEM-derived level.
    distance = ndimage.distance_transform_cdt(~ocean, metric="taxicab").astype(np.float32)
    progress = np.clip(distance[lowland] / LOWLAND_REVEAL_DISTANCE_PIXELS, 0.0, 1.0)
    progress = progress * progress * (3.0 - 2.0 * progress)
    reveal_levels = LOWLAND_REVEAL_START + progress * (LOWLAND_REVEAL_END - LOWLAND_REVEAL_START)
    thresholds[lowland] = np.maximum(thresholds[lowland], reveal_levels)
    return thresholds


def core_window(tile_report: dict, width: int, height: int) -> tuple[slice, slice]:
    analysis = tile_report["analysisBounds"]
    west, south, east, north = tile_report["coreBounds"]
    x0 = round((west - analysis["west"]) / (analysis["east"] - analysis["west"]) * width)
    x1 = round((east - analysis["west"]) / (analysis["east"] - analysis["west"]) * width)
    y0 = round((analysis["north"] - north) / (analysis["north"] - analysis["south"]) * height)
    y1 = round((analysis["north"] - south) / (analysis["north"] - analysis["south"]) * height)
    return slice(y0, y1), slice(x0, x1)


def encode_texture(dem: np.ndarray, thresholds: np.ndarray, china_land: np.ndarray) -> Image.Image:
    valid = china_land & np.isfinite(dem) & (thresholds <= MAX_LEVEL)
    packed = np.zeros(dem.shape, dtype=np.uint16)
    packed[valid] = np.rint(thresholds[valid] / MAX_LEVEL * 65535.0).astype(np.uint16)
    elevations = np.zeros(dem.shape, dtype=np.uint8)
    elevations[valid] = np.rint(np.clip(dem[valid], 0.0, MAX_LEVEL) / MAX_LEVEL * 255.0).astype(np.uint8)

    rgba = np.zeros((*dem.shape, 4), dtype=np.uint8)
    rgba[:, :, 0] = (packed >> 8).astype(np.uint8)
    rgba[:, :, 1] = (packed & 255).astype(np.uint8)
    rgba[:, :, 2] = elevations
    rgba[:, :, 3] = np.where(valid, 255, 0).astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")


def load_analysis(tile_report: dict) -> tuple[np.ndarray, dict]:
    output = ANALYSIS_DIR / f"{tile_report['id']}.npz"
    if not output.exists():
        output = build_analysis_mosaic(tile_report)
        print(f"  prepared {output.relative_to(ROOT)}", flush=True)

    with np.load(output) as data:
        dem = data["dem"].astype(np.float32, copy=False)
        west, south, east, north = data["bounds"].tolist()
    return dem, {"west": west, "south": south, "east": east, "north": north}


def grid_window(bounds: dict, grid_bounds: dict, width: int, height: int) -> tuple[int, int, int, int]:
    x0 = round((bounds["west"] - grid_bounds["west"]) / (grid_bounds["east"] - grid_bounds["west"]) * width)
    x1 = round((bounds["east"] - grid_bounds["west"]) / (grid_bounds["east"] - grid_bounds["west"]) * width)
    y0 = round((grid_bounds["north"] - bounds["north"]) / (grid_bounds["north"] - grid_bounds["south"]) * height)
    y1 = round((grid_bounds["north"] - bounds["south"]) / (grid_bounds["north"] - grid_bounds["south"]) * height)
    return x0, y0, x1, y1


def shared_bounds(tile_reports: list[dict]) -> dict:
    return {
        "west": min(tile["analysisBounds"]["west"] for tile in tile_reports),
        "south": min(tile["analysisBounds"]["south"] for tile in tile_reports),
        "east": max(tile["analysisBounds"]["east"] for tile in tile_reports),
        "north": max(tile["analysisBounds"]["north"] for tile in tile_reports),
    }


def build_shared_grid(
    tile_reports: list[dict],
    world_land_data: dict,
    china_data: dict,
    *,
    apply_visual_spread: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict]:
    bounds = shared_bounds(tile_reports)
    width = round((bounds["east"] - bounds["west"]) * PIXELS_PER_DEGREE)
    height = round((bounds["north"] - bounds["south"]) * PIXELS_PER_DEGREE)
    dem = np.full((height, width), np.nan, dtype=np.float32)

    for tile_report in tile_reports:
        tile_dem, tile_bounds = load_analysis(tile_report)
        x0, y0, x1, y1 = grid_window(tile_bounds, bounds, width, height)
        target = dem[y0:y1, x0:x1]
        usable = np.isfinite(tile_dem) & ~np.isfinite(target)
        target[usable] = tile_dem[usable]
        print(f"  joined {tile_report['id']}", flush=True)

    world_land = rasterize_land(world_land_data, bounds, width, height)
    china_land = rasterize_land(china_data, bounds, width, height)
    external_ocean = external_ocean_mask(world_land)
    # Natural Earth and the Chinese administrative boundary have slightly
    # different coastlines. Never allow a China-land pixel to become an ocean
    # seed, otherwise it receives a false zero-metre flood threshold.
    ocean = external_ocean & np.isfinite(dem) & ~china_land
    thresholds = calculate_thresholds(dem, china_land, ocean)
    if apply_visual_spread:
        thresholds = spread_lowland_thresholds(thresholds, china_land, ocean)
    return dem, thresholds, china_land, bounds


def build_connected_tiles(tile_reports: list[dict], world_land_data: dict, china_data: dict) -> list[dict]:
    print("Building shared national connectivity grid", flush=True)
    dem, thresholds, china_land, bounds = build_shared_grid(tile_reports, world_land_data, china_data)
    height, width = dem.shape
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    built = []

    for tile_report in tile_reports:
        core = {
            "west": tile_report["coreBounds"][0],
            "south": tile_report["coreBounds"][1],
            "east": tile_report["coreBounds"][2],
            "north": tile_report["coreBounds"][3],
        }
        x0, y0, x1, y1 = grid_window(core, bounds, width, height)
        filename = f"{tile_report['id']}-threshold-data.png"
        encode_texture(
            dem[y0:y1, x0:x1],
            thresholds[y0:y1, x0:x1],
            china_land[y0:y1, x0:x1],
        ).save(OUT_DIR / filename, optimize=True)
        built.append({
            "id": tile_report["id"],
            "region": tile_report["region"],
            "coreBounds": tile_report["coreBounds"],
            "analysisBounds": tile_report["analysisBounds"],
            "textureUrl": f"/flood/national/{filename}",
            "maxLevel": MAX_LEVEL,
            "textureSize": [x1 - x0, y1 - y0],
            "sourceCount": len(tile_report["sources"]),
        })
        print(f"  wrote {filename}", flush=True)

    return built


def build_tile(tile_report: dict, world_land_data: dict, china_data: dict) -> dict:
    print(f"Building {tile_report['id']}", flush=True)
    dem, bounds = load_analysis(tile_report)
    height, width = dem.shape
    world_land = rasterize_land(world_land_data, bounds, width, height)
    china_land = rasterize_land(china_data, bounds, width, height)
    ocean = external_ocean_mask(world_land) & ~china_land
    thresholds = calculate_thresholds(dem, china_land, ocean)
    thresholds = spread_lowland_thresholds(thresholds, china_land, ocean)

    row_slice, col_slice = core_window(tile_report, width, height)
    core_dem = dem[row_slice, col_slice]
    core_thresholds = thresholds[row_slice, col_slice]
    core_china_land = china_land[row_slice, col_slice]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{tile_report['id']}-threshold-data.png"
    encode_texture(core_dem, core_thresholds, core_china_land).save(OUT_DIR / filename, optimize=True)
    return {
        "id": tile_report["id"],
        "region": tile_report["region"],
        "coreBounds": tile_report["coreBounds"],
        "analysisBounds": tile_report["analysisBounds"],
        "textureUrl": f"/flood/national/{filename}",
        "maxLevel": MAX_LEVEL,
        "textureSize": [core_dem.shape[1], core_dem.shape[0]],
        "sourceCount": len(tile_report["sources"]),
    }


def metadata_from_existing_texture(tile_report: dict) -> dict | None:
    filename = f"{tile_report['id']}-threshold-data.png"
    path = OUT_DIR / filename
    if not path.exists():
        return None
    with Image.open(path) as image:
        texture_size = [image.size[0], image.size[1]]
    return {
        "id": tile_report["id"],
        "region": tile_report["region"],
        "coreBounds": tile_report["coreBounds"],
        "analysisBounds": tile_report["analysisBounds"],
        "textureUrl": f"/flood/national/{filename}",
        "maxLevel": MAX_LEVEL,
        "textureSize": texture_size,
        "sourceCount": len(tile_report["sources"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build national ocean-connected flood threshold textures.")
    parser.add_argument("--tile", action="append", help="Tile id to build. Repeat to select multiple tiles.")
    parser.add_argument("--all", action="store_true", help="Build all ready nationwide tiles.")
    parser.add_argument("--shared-grid", action="store_true", help="Compute all selected textures from one shared national connectivity grid.")
    parser.add_argument("--register-existing", action="store_true", help="Register already-built textures without rebuilding them.")
    args = parser.parse_args()
    if not args.all and not args.tile and not args.register_existing:
        parser.error("Choose --all, --tile, or --register-existing")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    report = inspect_plan(manifest)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    ready = [tile for tile in report["tiles"] if tile["ready"]]
    selected = set(args.tile or [])
    if selected:
        known = {tile["id"] for tile in ready}
        missing = selected - known
        if missing:
            raise SystemExit(f"Unknown or incomplete tiles: {', '.join(sorted(missing))}")
        ready = [tile for tile in ready if tile["id"] in selected]

    if args.register_existing:
        built = [item for tile in ready if (item := metadata_from_existing_texture(tile))]
    else:
        world_land_data = json.loads(WORLD_LAND_PATH.read_text(encoding="utf-8"))
        china_data = exclude_special_boundaries(json.loads(CHINA_PATH.read_text(encoding="utf-8")))
        if args.shared_grid:
            if not args.all:
                parser.error("--shared-grid requires --all so every seam uses the same connectivity calculation")
            built = build_connected_tiles(ready, world_land_data, china_data)
        else:
            built = []
            for tile in ready:
                built.append(build_tile(tile, world_land_data, china_data))

    existing = {}
    if META_PATH.exists():
        document = json.loads(META_PATH.read_text(encoding="utf-8"))
        existing = {tile["id"]: tile for tile in document.get("tiles", [])}
    existing.update({tile["id"]: tile for tile in built})

    ordered_tiles = []
    for tile in report["tiles"]:
        item = existing.get(tile["id"])
        if item:
            ordered_tiles.append(item)

    META_PATH.parent.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(json.dumps({"version": 1, "tiles": ordered_tiles}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {META_PATH.relative_to(ROOT)}", flush=True)


if __name__ == "__main__":
    main()
