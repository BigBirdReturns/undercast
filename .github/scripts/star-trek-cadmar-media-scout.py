#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
OUT = Path("/tmp/star-trek-cadmar-media-scout")
OUT.mkdir(parents=True, exist_ok=True)

CANDIDATES = [
    {
        "id": "dryden-doohan",
        "title": "File:Star Trek Cast and Crew Visit NASA Dryden in 1967 (Doohan).jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Star_Trek_Cast_and_Crew_Visit_NASA_Dryden_in_1967_%28Doohan%29.jpg/1200px-Star_Trek_Cast_and_Crew_Visit_NASA_Dryden_in_1967_%28Doohan%29.jpg",
        "origin_url": "https://upload.wikimedia.org/wikipedia/commons/b/bb/Star_Trek_Cast_and_Crew_Visit_NASA_Dryden_in_1967_%28Doohan%29.jpg",
        "page": "https://commons.wikimedia.org/wiki/File:Star_Trek_Cast_and_Crew_Visit_NASA_Dryden_in_1967_(Doohan).jpg",
        "author": "NASA",
        "license": "Public domain",
    },
    {
        "id": "doohan-2009",
        "title": "File:James Doohan, Scotty from Star Trek (3543379539).jpg",
        "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/James_Doohan%2C_Scotty_from_Star_Trek_%283543379539%29.jpg/800px-James_Doohan%2C_Scotty_from_Star_Trek_%283543379539%29.jpg",
        "origin_url": "https://upload.wikimedia.org/wikipedia/commons/e/e1/James_Doohan%2C_Scotty_from_Star_Trek_%283543379539%29.jpg",
        "page": "https://commons.wikimedia.org/wiki/File:James_Doohan,_Scotty_from_Star_Trek_(3543379539).jpg",
        "author": "Derek Hatfield",
        "license": "CC BY 2.0",
    },
]

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def download(url: str, path: Path) -> None:
    last = None
    for attempt in range(1, 9):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "undercast-cadmar-media-scout/1.0",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                path.write_bytes(response.read())
            return
        except urllib.error.HTTPError as exc:
            last = exc
            if exc.code != 429:
                raise
            time.sleep(attempt * 5)
    raise RuntimeError(f"download remained rate-limited: {url}: {last}")

remote_main = subprocess.check_output(
    ["git", "ls-remote", "origin", "refs/heads/main"], text=True
).split()[0]
if remote_main != EXPECTED_MAIN:
    raise RuntimeError(f"main moved: expected {EXPECTED_MAIN}, got {remote_main}")

rows = []
for candidate in CANDIDATES:
    target = OUT / f"{candidate['id']}.jpg"
    download(candidate["url"], target)
    with Image.open(target) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.save(target, quality=94)
        width, height = image.size
    rows.append({
        **candidate,
        "file": target.name,
        "width": width,
        "height": height,
        "bytes": target.stat().st_size,
        "sha256": sha(target),
    })

dryden = Image.open(OUT / "dryden-doohan.jpg").convert("RGB")
w, h = dryden.size
crops = {
    "dryden-left": (0, 0, w // 2, h),
    "dryden-right": (w // 2, 0, w, h),
    "dryden-left-60": (0, 0, int(w * 0.6), h),
    "dryden-right-60": (int(w * 0.4), 0, w, h),
}
for name, box in crops.items():
    image = dryden.crop(box)
    target = OUT / f"{name}.jpg"
    image.save(target, quality=94)
    rows.append({
        "id": name,
        "title": "Derived visual-review crop only",
        "url": CANDIDATES[0]["url"],
        "origin_url": CANDIDATES[0]["origin_url"],
        "page": CANDIDATES[0]["page"],
        "author": "NASA",
        "license": "Public domain",
        "file": target.name,
        "width": image.width,
        "height": image.height,
        "bytes": target.stat().st_size,
        "sha256": sha(target),
        "crop_box": box,
    })

tiles = []
for row in rows:
    path = OUT / row["file"]
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        thumb = ImageOps.contain(image, (520, 520))
    tile = Image.new("RGB", (560, 610), "white")
    x = (560 - thumb.width) // 2
    y = 20 + (520 - thumb.height) // 2
    tile.paste(thumb, (x, y))
    draw = ImageDraw.Draw(tile)
    draw.text((20, 550), row["id"], fill="black")
    draw.text((20, 572), f"{row['width']}x{row['height']} · {row['sha256'][:12]}", fill="black")
    tiles.append(tile)

columns = 3
rows_count = (len(tiles) + columns - 1) // columns
sheet = Image.new("RGB", (columns * 560, rows_count * 610), "#dddddd")
for index, tile in enumerate(tiles):
    sheet.paste(tile, ((index % columns) * 560, (index // columns) * 610))
sheet.save(OUT / "contact-sheet.jpg", quality=92)

(OUT / "manifest.json").write_text(json.dumps({
    "version": 2,
    "transaction": "STAR-TREK-CADMAR-MEDIA-SCOUT",
    "canonical_parent": EXPECTED_MAIN,
    "items": rows,
}, indent=2) + "\n")
print(json.dumps(rows, indent=2))
