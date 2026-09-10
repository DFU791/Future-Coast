"""Remove cartographic boundary guides accidentally encoded as floodable land."""

import json
from pathlib import Path

import numpy as np
from PIL import Image

from build_national_flood_textures import (
    CHINA_PATH,
    META_PATH,
    OUT_DIR,
    SOUTH_CHINA_SEA_BOUNDARY_ADCODE,
    rasterize_land,
)


def main() -> None:
    china = json.loads(CHINA_PATH.read_text(encoding="utf-8"))
    special_boundaries = {
        "type": "FeatureCollection",
        "features": [
            feature
            for feature in china["features"]
            if str(feature.get("properties", {}).get("adcode")) == SOUTH_CHINA_SEA_BOUNDARY_ADCODE
        ],
    }
    metadata = json.loads(META_PATH.read_text(encoding="utf-8"))

    for tile in metadata["tiles"]:
        path = OUT_DIR / Path(tile["textureUrl"]).name
        with Image.open(path) as source:
            rgba = np.asarray(source.convert("RGBA")).copy()

        west, south, east, north = tile["coreBounds"]
        mask = rasterize_land(
            special_boundaries,
            {"west": west, "south": south, "east": east, "north": north},
            rgba.shape[1],
            rgba.shape[0],
        )
        affected = mask & (rgba[:, :, 3] > 0)
        count = int(affected.sum())
        if not count:
            continue

        rgba[mask] = 0
        Image.fromarray(rgba, mode="RGBA").save(path, optimize=True)
        print(f"Repaired {path.name}: removed {count:,} boundary pixels")


if __name__ == "__main__":
    main()
