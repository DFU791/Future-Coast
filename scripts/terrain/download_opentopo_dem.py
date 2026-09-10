import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "data" / "dem" / "raw" / "copernicus_glo30"
DEFAULT_NATIONAL_OUT = DEFAULT_OUT / "national"
DEFAULT_MANIFEST = ROOT / "data" / "terrain" / "coastTiles.json"
LOCAL_API_KEY_FILE = ROOT / "data" / "terrain" / ".opentopo-api-key"

DATASET = "COP30"
API_URL = "https://portal.opentopography.org/API/globaldem"


REGIONS = {
    "yangtze": {
        "west": 118.05,
        "south": 28.70,
        "east": 123.35,
        "north": 33.65,
        "step": 5.0,
    },
    "coast": {
        "west": 105.0,
        "south": 18.0,
        "east": 128.0,
        "north": 43.0,
        "step": 5.0,
    },
    "china": {
        "west": 73.0,
        "south": 18.0,
        "east": 135.0,
        "north": 54.0,
        "step": 5.0,
    },
}


def frange(start: float, stop: float, step: float):
    value = start
    while value < stop:
        next_value = min(value + step, stop)
        yield value, next_value
        value = next_value


def label(value: float, axis: str) -> str:
    hemi = "E" if axis == "lon" and value >= 0 else "W" if axis == "lon" else "N" if value >= 0 else "S"
    return f"{hemi}{abs(value):05.2f}".replace(".", "p")


def build_chunks(region: dict):
    chunks = []
    for south, north in frange(region["south"], region["north"], region["step"]):
        for west, east in frange(region["west"], region["east"], region["step"]):
            chunks.append({
                "west": west,
                "south": south,
                "east": east,
                "north": north,
            })
    return chunks


def filename_for(chunk: dict, dataset: str) -> str:
    return (
        f"{dataset.lower()}_"
        f"{label(chunk['west'], 'lon')}_{label(chunk['east'], 'lon')}_"
        f"{label(chunk['south'], 'lat')}_{label(chunk['north'], 'lat')}.tif"
    )


def read_local_api_key() -> str:
    if not LOCAL_API_KEY_FILE.exists():
        return ""
    return LOCAL_API_KEY_FILE.read_text(encoding="utf-8").strip()


def load_plan(path: Path, selected_tiles: list[str] | None) -> list[dict]:
    document = json.loads(path.read_text(encoding="utf-8"))
    buffer_degrees = float(document.get("bufferDegrees", 0.5))
    tiles = document.get("tiles", [])
    selected = set(selected_tiles or [])
    known_ids = {tile["id"] for tile in tiles}
    unknown_ids = selected - known_ids
    if unknown_ids:
        raise ValueError(f"Unknown tile ids: {', '.join(sorted(unknown_ids))}")

    chunks = []
    for tile in tiles:
        if tile.get("optional", False) and not selected:
            continue
        if selected and tile["id"] not in selected:
            continue

        west, south, east, north = tile["coreBounds"]
        parent_chunk = {
            "id": tile["id"],
            "region": tile["region"],
            "west": west - buffer_degrees,
            "south": south - buffer_degrees,
            "east": east + buffer_degrees,
            "north": north + buffer_degrees,
            "coreBounds": tile["coreBounds"],
        }
        subdivisions = int(tile.get("downloadSubdivisions", 1))
        chunks.extend(subdivide_chunk(parent_chunk, subdivisions))
    return chunks


def subdivide_chunk(chunk: dict, subdivisions: int) -> list[dict]:
    if subdivisions <= 1:
        return [chunk]

    width = (chunk["east"] - chunk["west"]) / subdivisions
    height = (chunk["north"] - chunk["south"]) / subdivisions
    children = []
    for row in range(subdivisions):
        for column in range(subdivisions):
            children.append({
                **chunk,
                "id": f"{chunk['id']}--r{row}c{column}",
                "parentId": chunk["id"],
                "west": chunk["west"] + column * width,
                "east": chunk["west"] + (column + 1) * width,
                "south": chunk["south"] + row * height,
                "north": chunk["south"] + (row + 1) * height,
            })
    return children


def download_chunk(chunk: dict, out_path: Path, api_key: str, dataset: str) -> None:
    params = {
        "demtype": dataset,
        "south": chunk["south"],
        "north": chunk["north"],
        "west": chunk["west"],
        "east": chunk["east"],
        "outputFormat": "GTiff",
        "API_Key": api_key,
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    tmp_path = out_path.with_suffix(".download")

    request = urllib.request.Request(url, headers={"User-Agent": "FutureCoast/0.1"})
    with urllib.request.urlopen(request, timeout=180) as response:
        content_type = response.headers.get("Content-Type", "")
        header = response.read(4)
        if header not in (b"II*\x00", b"MM\x00*"):
            message = (header + response.read(496)).decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Response is not a GeoTIFF. Content-Type={content_type}. Body starts with: {message}"
            )

        with tmp_path.open("wb") as output:
            output.write(header)
            while True:
                block = response.read(8 * 1024 * 1024)
                if not block:
                    break
                output.write(block)
    tmp_path.replace(out_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download OpenTopography DEM chunks for Future Coast.")
    parser.add_argument("--region", choices=REGIONS.keys(), default="yangtze")
    parser.add_argument("--plan", action="store_true", help="Download standardized nationwide coastal tiles.")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--tile", action="append", help="A tile id from the nationwide plan. Repeat to select multiple tiles.")
    parser.add_argument("--custom-id", help="Download one custom retry chunk with a stable output id.")
    parser.add_argument("--west", type=float)
    parser.add_argument("--south", type=float)
    parser.add_argument("--east", type=float)
    parser.add_argument("--north", type=float)
    parser.add_argument("--dataset", default=DATASET, help="OpenTopography demtype, e.g. COP30 or SRTMGL1")
    parser.add_argument("--out")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--retries", type=int, default=2, help="Retries for a failed GeoTIFF request.")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("OPENTOPO_API_KEY", "") or read_local_api_key()
    if not api_key and not args.dry_run:
        raise SystemExit(
            "Missing API key. Create data/terrain/.opentopo-api-key, "
            "or pass --api-key, or set OPENTOPO_API_KEY."
        )

    manifest_path = Path(args.manifest)
    if args.custom_id:
        custom_bounds = (args.west, args.south, args.east, args.north)
        if any(value is None for value in custom_bounds):
            raise SystemExit("Custom chunks require --west --south --east --north.")
        chunks = [{
            "id": args.custom_id,
            "region": "custom-retry",
            "west": args.west,
            "south": args.south,
            "east": args.east,
            "north": args.north,
        }]
        region_name = "custom-retry"
        out_dir = Path(args.out) if args.out else DEFAULT_NATIONAL_OUT
    elif args.plan:
        if not manifest_path.exists():
            raise SystemExit(f"Missing tile manifest: {manifest_path}")
        chunks = load_plan(manifest_path, args.tile)
        region_name = "nationwide-coast"
        out_dir = Path(args.out) if args.out else DEFAULT_NATIONAL_OUT
    else:
        chunks = build_chunks(REGIONS[args.region])
        region_name = args.region
        out_dir = Path(args.out) if args.out else DEFAULT_OUT
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Region: {region_name}")
    print(f"Dataset: {args.dataset}")
    print(f"Chunks: {len(chunks)}")
    print(f"Output: {out_dir}")

    for index, chunk in enumerate(chunks, start=1):
        filename = f"{chunk['id']}.tif" if "id" in chunk else filename_for(chunk, args.dataset)
        out_path = out_dir / filename
        bounds = f"W{chunk['west']} S{chunk['south']} E{chunk['east']} N{chunk['north']}"
        if args.dry_run:
            print(f"[{index:03d}/{len(chunks):03d}] {out_path.name} {bounds}")
            continue

        if out_path.exists() and out_path.stat().st_size > 1024:
            print(f"[{index:03d}/{len(chunks):03d}] skip {out_path.name}")
            continue

        print(f"[{index:03d}/{len(chunks):03d}] download {out_path.name} {bounds}", flush=True)
        for attempt in range(args.retries + 1):
            try:
                download_chunk(chunk, out_path, api_key, args.dataset)
                print(f"  complete: {out_path.name}", flush=True)
                break
            except Exception as exc:
                if attempt >= args.retries:
                    print(f"  failed: {exc}", flush=True)
                    break
                delay = 3 * (attempt + 1)
                print(f"  retry {attempt + 1}/{args.retries} after {delay}s: {exc}", flush=True)
                time.sleep(delay)
        time.sleep(args.sleep)


if __name__ == "__main__":
    main()
