import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "data" / "terrain" / "coastTiles.json"
RAW_DIR = ROOT / "data" / "dem" / "raw" / "copernicus_glo30" / "national"
ANALYSIS_DIR = ROOT / "data" / "dem" / "analysis"
REPORT_PATH = ROOT / "data" / "terrain" / "nationalDemReport.json"
PIXELS_PER_DEGREE = 280


def read_bounds(image: Image.Image) -> dict:
    scale = image.tag_v2.get(33550)
    tiepoint = image.tag_v2.get(33922)
    if not scale or not tiepoint:
        raise ValueError("GeoTIFF is missing geographic bounds tags")

    pixel_width = float(scale[0])
    pixel_height = float(scale[1])
    west = float(tiepoint[3])
    north = float(tiepoint[4])
    width, height = image.size
    return {
        "west": west,
        "east": west + width * pixel_width,
        "north": north,
        "south": north - height * pixel_height,
    }


def analysis_bounds(tile: dict, buffer_degrees: float) -> dict:
    west, south, east, north = tile["coreBounds"]
    return {
        "west": west - buffer_degrees,
        "south": south - buffer_degrees,
        "east": east + buffer_degrees,
        "north": north + buffer_degrees,
    }


def source_paths(tile: dict) -> list[Path]:
    direct = RAW_DIR / f"{tile['id']}.tif"
    children = sorted(RAW_DIR.glob(f"{tile['id']}--*.tif"))
    if int(tile.get("downloadSubdivisions", 1)) > 1:
        return children
    if direct.exists():
        return [direct]
    return children


def inspect_source(path: Path) -> dict:
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(path) as image:
        bounds = read_bounds(image)
        width, height = image.size
        nodata = image.tag_v2.get(42113)

    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "size": [width, height],
        "bounds": bounds,
        "nodata": str(nodata) if nodata is not None else None,
        "valid": True,
    }


def inspect_plan(manifest: dict) -> dict:
    report_tiles = []
    buffer_degrees = float(manifest.get("bufferDegrees", 0.5))
    for tile in manifest["tiles"]:
        if tile.get("optional", False):
            continue

        sources = source_paths(tile)
        inspected = []
        errors = []
        for source in sources:
            try:
                inspected.append(inspect_source(source))
            except Exception as exc:
                errors.append(f"{source.name}: {type(exc).__name__}: {exc}")

        expected_count = int(tile.get("expectedSources", int(tile.get("downloadSubdivisions", 1)) ** 2))
        report_tiles.append({
            "id": tile["id"],
            "region": tile["region"],
            "coreBounds": tile["coreBounds"],
            "analysisBounds": analysis_bounds(tile, buffer_degrees),
            "expectedSources": expected_count,
            "sources": inspected,
            "errors": errors,
            "ready": len(inspected) == expected_count and not errors,
        })

    return {
        "version": 1,
        "pixelsPerDegree": PIXELS_PER_DEGREE,
        "tiles": report_tiles,
    }


def target_window(source: dict, target: dict, width: int, height: int) -> tuple[int, int, int, int]:
    target_width = target["east"] - target["west"]
    target_height = target["north"] - target["south"]
    x0 = round((source["west"] - target["west"]) / target_width * width)
    x1 = round((source["east"] - target["west"]) / target_width * width)
    y0 = round((target["north"] - source["north"]) / target_height * height)
    y1 = round((target["north"] - source["south"]) / target_height * height)
    return x0, y0, x1, y1


def build_analysis_mosaic(tile_report: dict) -> Path:
    target = tile_report["analysisBounds"]
    width = round((target["east"] - target["west"]) * PIXELS_PER_DEGREE)
    height = round((target["north"] - target["south"]) * PIXELS_PER_DEGREE)
    mosaic = np.full((height, width), np.nan, dtype=np.float32)

    for source in tile_report["sources"]:
        path = RAW_DIR / source["file"]
        x0, y0, x1, y1 = target_window(source["bounds"], target, width, height)
        if x1 <= x0 or y1 <= y0:
            raise ValueError(f"{path.name} has no overlap with {tile_report['id']}")

        Image.MAX_IMAGE_PIXELS = None
        with Image.open(path) as image:
            reduced = image.resize((x1 - x0, y1 - y0), Image.Resampling.BILINEAR)
            data = np.asarray(reduced, dtype=np.float32)
        mosaic[y0:y1, x0:x1] = data

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    output = ANALYSIS_DIR / f"{tile_report['id']}.npz"
    np.savez_compressed(
        output,
        dem=mosaic,
        bounds=np.array([target["west"], target["south"], target["east"], target["north"]]),
    )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and prepare nationwide COP30 coastal DEM tiles.")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--mosaic-subtiles", action="store_true")
    parser.add_argument("--tile", help="Only mosaic one ready parent tile by id.")
    args = parser.parse_args()
    if not args.validate and not args.mosaic_subtiles:
        parser.error("Choose --validate, --mosaic-subtiles, or both")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    report = inspect_plan(manifest)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    ready = [tile for tile in report["tiles"] if tile["ready"]]
    print(f"Validated {len(ready)}/{len(report['tiles'])} nationwide tiles")
    print(f"Wrote {REPORT_PATH.relative_to(ROOT)}")

    if args.mosaic_subtiles:
        for tile in ready:
            if args.tile and tile["id"] != args.tile:
                continue
            if len(tile["sources"]) <= 1:
                continue
            output = build_analysis_mosaic(tile)
            print(f"Wrote {output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
