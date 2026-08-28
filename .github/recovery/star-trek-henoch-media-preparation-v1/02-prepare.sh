#!/usr/bin/env bash
set -Eeuo pipefail
python3 -m pip install \
  --disable-pip-version-check \
  --no-input \
  Pillow==11.3.0

ROOT="$WORK" OUT="$OUT" python3 - <<'PY'
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image

import hashlib
import html
import json
import os
import re

repo = Path(os.environ["ROOT"])
out = Path(os.environ["OUT"])
generated = (
    datetime.now(timezone.utc)
    .replace(microsecond=0)
    .isoformat()
    .replace("+00:00", "Z")
)
ua = "UNDERCAST-Henoch-Media/1.0 (source and attribution audit)"

def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value

def pretty(value):
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def request_bytes(url, referer=None):
    headers = {"User-Agent": ua, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    with urlopen(Request(url, headers=headers), timeout=120) as response:
        return response.read()

def api(base, params):
    return json.loads(
        request_bytes(base + "?" + urlencode(params)).decode("utf-8")
    )

def clean(value):
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()

def decode(data):
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert("RGB"), image.size, image.format or "unknown"

def normalize(data, facet):
    image, original_size, source_format = decode(data)
    if facet == "still":
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    else:
        image.thumbnail((1200, 1500), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    if facet == "still":
        image.save(buffer, format="WEBP", quality=94, method=6)
    else:
        image.save(
            buffer,
            format="JPEG",
            quality=93,
            optimize=True,
            progressive=False,
        )
    return (
        buffer.getvalue(),
        original_size,
        source_format,
        image.size,
    )

def one_image(payload, title):
    pages = payload.get("query", {}).get("pages") or []
    if len(pages) != 1:
        raise SystemExit(
            f"image page cardinality drifted for {title}: {len(pages)}"
        )
    page = pages[0]
    infos = page.get("imageinfo") or []
    if page.get("title") != title or len(infos) != 1:
        raise SystemExit(f"exact image identity drifted for {title}")
    return page, infos[0]

autopilot = json.loads(
    (repo / "data/AUTOPILOT.json").read_text(encoding="utf-8")
)
trek = [
    row for row in autopilot.get("jobs", [])
    if row.get("scope") == "star-trek"
]
task = next(
    (row for row in trek if row.get("id") == os.environ["TASK_ID"]),
    None,
)
active = [
    row
    for row in trek
    if row.get("status") in {"leased", "drafted", "merged"}
]
counts = {
    "total": len(trek),
    "queued": sum(row.get("status") == "queued" for row in trek),
    "resolved": sum(row.get("status") == "resolved" for row in trek),
    "blocked": sum(row.get("status") == "blocked" for row in trek),
    "rejected": sum(row.get("status") == "rejected" for row in trek),
    "in_flight": len(active),
}
expected_counts = {
    "total": 2228,
    "queued": 1794,
    "resolved": 431,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 1,
}
if counts != expected_counts or len(active) != 1:
    raise SystemExit(f"Henoch media queue drifted: {counts}")
if (
    not task
    or active[0].get("id") != os.environ["TASK_ID"]
    or task.get("performer") != os.environ["EXPECTED_PERFORMER"]
    or task.get("character") != os.environ["EXPECTED_CHARACTER"]
    or task.get("source_fingerprint")
       != os.environ["EXPECTED_FINGERPRINT"]
    or task.get("performance_modes") != ["physical-prosthetic"]
    or task.get("status") != "leased"
    or task.get("attempts") != 1
    or task.get("lease", {}).get("id") != os.environ["EXPECTED_LEASE"]
):
    raise SystemExit(f"Henoch media task custody drifted: {task}")

canonical_text = "\n".join(
    [
        (repo / "data/MEDIA-AUDIT.json").read_text(encoding="utf-8"),
        (repo / "data/SOURCES.json").read_text(encoding="utf-8"),
    ]
)
if (
    os.environ["PORTRAIT_TITLE"] in canonical_text
    or os.environ["PORTRAIT_SOURCE_PAGE"] in canonical_text
):
    raise SystemExit(
        "Leonard Nimoy portrait source is already canonical"
    )
if (
    os.environ["STILL_TITLE"] in canonical_text
    or os.environ["STILL_SOURCE_PAGE"] in canonical_text
):
    raise SystemExit("Henoch still source is already canonical")

memory_api = "https://memory-alpha.fandom.com/api.php"
still_api = api(
    memory_api,
    {
        "action": "query",
        "prop": "imageinfo",
        "titles": os.environ["STILL_TITLE"],
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "format": "json",
        "formatversion": "2",
    },
)
still_page, still_info = one_image(
    still_api,
    os.environ["STILL_TITLE"],
)
still_url = still_info.get("url")
if not still_url:
    raise SystemExit("Henoch source image URL is absent")
still_raw = request_bytes(still_url, os.environ["STILL_SOURCE_PAGE"])
still_image, still_source_size, still_source_format = decode(still_raw)
del still_image
still_bytes, _, _, still_output_size = normalize(still_raw, "still")
still_source_sha = digest(still_raw)
still_sha = digest(still_bytes)

(out / "henoch-still-source.jpg").write_bytes(still_raw)
(out / "henoch-still.webp").write_bytes(still_bytes)
(out / "still-imageinfo.json").write_text(
    pretty(still_api),
    encoding="utf-8",
)

commons_api = "https://commons.wikimedia.org/w/api.php"
portrait_api = api(
    commons_api,
    {
        "action": "query",
        "prop": "imageinfo",
        "titles": os.environ["PORTRAIT_TITLE"],
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "format": "json",
        "formatversion": "2",
    },
)
portrait_page, portrait_info = one_image(
    portrait_api,
    os.environ["PORTRAIT_TITLE"],
)
ext = portrait_info.get("extmetadata") or {}
description = clean(
    (
        ext.get("ImageDescription")
        or ext.get("ObjectName")
        or {}
    ).get("value")
)
author = clean((ext.get("Artist") or {}).get("value"))
license_name = clean(
    (ext.get("LicenseShortName") or {}).get("value")
)
identity = (
    portrait_page.get("title", "") + " " + description
).lower()
if "leonard" not in identity or "nimoy" not in identity:
    raise SystemExit(
        "portrait metadata does not identify Leonard Nimoy"
    )
if "gage" not in author.lower() or "skidmore" not in author.lower():
    raise SystemExit(f"portrait author drifted: {author}")
accepted_license = (
    "cc by-sa 3.0",
    "cc-by-sa-3.0",
    "creative commons attribution-share alike 3.0",
)
if not any(
    token in license_name.lower()
    for token in accepted_license
):
    raise SystemExit(
        f"portrait license is not accepted: {license_name}"
    )

portrait_url = portrait_info.get("url")
if not portrait_url:
    raise SystemExit("Leonard Nimoy source image URL is absent")
portrait_raw = request_bytes(
    portrait_url,
    os.environ["PORTRAIT_SOURCE_PAGE"],
)
portrait_image, portrait_source_size, portrait_source_format = decode(
    portrait_raw
)
del portrait_image
portrait_bytes, _, _, portrait_output_size = normalize(
    portrait_raw,
    "portrait",
)
portrait_source_sha = digest(portrait_raw)
portrait_sha = digest(portrait_bytes)

(out / "leonard-nimoy-portrait-source.jpg").write_bytes(portrait_raw)
(out / "leonard-nimoy-portrait.jpg").write_bytes(portrait_bytes)
(out / "portrait-imageinfo.json").write_text(
    pretty(portrait_api),
    encoding="utf-8",
)

if still_url == portrait_url:
    raise SystemExit("Henoch media source URLs are not distinct")
if still_source_sha == portrait_source_sha:
    raise SystemExit("Henoch media source bytes are not distinct")
if still_sha == portrait_sha:
    raise SystemExit("Henoch output bytes are not distinct")
if still_sha in canonical_text or portrait_sha in canonical_text:
    raise SystemExit("Henoch derivative bytes are already canonical")

if still_source_size[0] < 500 or still_source_size[1] < 400:
    raise SystemExit(
        f"Henoch still dimensions are too small: {still_source_size}"
    )
if portrait_source_size[0] < 1000 or portrait_source_size[1] < 1200:
    raise SystemExit(
        "Leonard Nimoy portrait dimensions are too small: "
        f"{portrait_source_size}"
    )
if still_output_size[0] < 500 or still_output_size[1] < 400:
    raise SystemExit(
        f"Henoch still output is too small: {still_output_size}"
    )
if portrait_output_size[0] < 800 or portrait_output_size[1] < 1000:
    raise SystemExit(
        "Leonard Nimoy portrait output is too small: "
        f"{portrait_output_size}"
    )

claim = json.loads(
    (out / "claim-receipt.json").read_text(encoding="utf-8")
)
source = json.loads(
    (out / "source/source-probe.json").read_text(encoding="utf-8")
)
review = json.loads(
    (out / "review/source-review.json").read_text(encoding="utf-8")
)

receipt = {
    "version": 1,
    "transaction": "STAR-TREK-HENOCH-MEDIA-PREPARATION-V1",
    "generated_at": generated,
    "status": "media-prepared-pending-independent-review",
    "canonical": {
        "commit": os.environ["EXPECTED_MAIN"],
        "tree": os.environ["EXPECTED_TREE"],
        "parent": os.environ["EXPECTED_PARENT"],
        "message": os.environ["EXPECTED_MESSAGE"],
    },
    "claim": {
        "branch": os.environ["CLAIM_BRANCH"],
        "commit": os.environ["CLAIM_COMMIT"],
        "tree": os.environ["CLAIM_TREE"],
        "receipt_sha256": claim["receipt_sha256"],
        "artifact": claim["artifact"],
        "lease_id": os.environ["EXPECTED_LEASE"],
    },
    "source": {
        "branch": os.environ["SOURCE_BRANCH"],
        "commit": os.environ["SOURCE_COMMIT"],
        "tree": os.environ["SOURCE_TREE"],
        "receipt_sha256": source["receipt_sha256"],
        "artifact": source["artifact"],
        "role_revision": source["source_revision"],
    },
    "source_review": {
        "branch": os.environ["SOURCE_REVIEW_BRANCH"],
        "commit": os.environ["SOURCE_REVIEW_COMMIT"],
        "tree": os.environ["SOURCE_REVIEW_TREE"],
        "review_sha256": review["review_sha256"],
        "artifact": review["artifact"],
        "verdict": review["verdict"],
    },
    "task": {
        "id": os.environ["TASK_ID"],
        "performer": os.environ["EXPECTED_PERFORMER"],
        "character": os.environ["EXPECTED_CHARACTER"],
        "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
        "performance_modes": ["physical-prosthetic"],
        "status": "leased",
        "attempts": 1,
        "lease_id": os.environ["EXPECTED_LEASE"],
    },
    "queue": counts,
    "adjudication": review["adjudication"],
    "still": {
        "facet": "character",
        "expected_subject": "Henoch occupying Spock's body",
        "title": os.environ["STILL_TITLE"],
        "source_page": os.environ["STILL_SOURCE_PAGE"],
        "source_url": still_url,
        "source_pageid": still_page.get("pageid"),
        "source_sha1": still_info.get("sha1"),
        "source_sha256": still_source_sha,
        "source_bytes": len(still_raw),
        "source_dimensions": list(still_source_size),
        "source_format": still_source_format,
        "source_mime": still_info.get("mime"),
        "source_timestamp": still_info.get("timestamp"),
        "output": "henoch-still.webp",
        "sha256": still_sha,
        "bytes": len(still_bytes),
        "dimensions": list(still_output_size),
        "format": "WEBP",
        "normalization": {
            "pillow": "11.3.0",
            "resize": "full-frame thumbnail max 1600x1600",
            "encoder": "WEBP quality 94 method 6",
        },
        "review_status": "source-bound-pending-new-facet-votes",
    },
    "portrait": {
        "facet": "performer",
        "expected_subject": os.environ["EXPECTED_PERFORMER"],
        "title": os.environ["PORTRAIT_TITLE"],
        "source_page": os.environ["PORTRAIT_SOURCE_PAGE"],
        "source_url": portrait_url,
        "source_pageid": portrait_page.get("pageid"),
        "source_sha1": portrait_info.get("sha1"),
        "source_sha256": portrait_source_sha,
        "source_bytes": len(portrait_raw),
        "source_dimensions": list(portrait_source_size),
        "source_format": portrait_source_format,
        "source_mime": portrait_info.get("mime"),
        "source_timestamp": portrait_info.get("timestamp"),
        "description": description,
        "author": author,
        "license": license_name,
        "output": "leonard-nimoy-portrait.jpg",
        "sha256": portrait_sha,
        "bytes": len(portrait_bytes),
        "dimensions": list(portrait_output_size),
        "format": "JPEG",
        "normalization": {
            "pillow": "11.3.0",
            "resize": "full-frame thumbnail max 1200x1500",
            "encoder": "JPEG quality 93 optimized non-progressive",
        },
        "review_status": "independent-source-pending-new-facet-votes",
    },
    "boundary": {
        "character_still_exact_subject": True,
        "host_body_image_is_character_evidence": True,
        "performer_portrait_neutral_human": True,
        "performer_portrait_is_not_character_evidence": True,
        "source_distinctness_verified": True,
        "byte_distinctness_verified": True,
        "cross_facet_substitution": False,
        "physical_performance_attributed": True,
        "prosthetic_performance_attributed": False,
        "host_character_prosthetic_continuity": True,
        "makeup_design_attributed": False,
        "character_design_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
        "new_facet_votes_pending": True,
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "waterline_cycle_recorded": False,
    },
}
encoded = pretty(receipt)
receipt["receipt_sha256"] = digest(encoded.encode("utf-8"))
(out / "media-receipt.json").write_text(
    pretty(receipt),
    encoding="utf-8",
)
(out / "media-scout.json").write_text(
    pretty(
        {
            "version": 1,
            "transaction": "STAR-TREK-HENOCH-MEDIA-SCOUT-V1",
            "generated_at": generated,
            "still": receipt["still"],
            "portrait": receipt["portrait"],
            "boundary": receipt["boundary"],
        }
    ),
    encoding="utf-8",
)
PY

jq -e \
  --arg task "$TASK_ID" \
  --arg lease "$EXPECTED_LEASE" \
  '.transaction == "STAR-TREK-HENOCH-MEDIA-PREPARATION-V1"
   and .status == "media-prepared-pending-independent-review"
   and .task.id == $task
   and .task.lease_id == $lease
   and .task.status == "leased"
   and .task.performance_modes == ["physical-prosthetic"]
   and .queue == {
     total:2228,
     queued:1794,
     resolved:431,
     blocked:0,
     rejected:2,
     in_flight:1
   }
   and .adjudication.adjudicated_kind == "physical"
   and .adjudication.performance_mode == "physical-prosthetic"
   and .adjudication.physical_performance_attributed == true
   and .adjudication.prosthetic_performance_attributed == false
   and .adjudication.host_body == "Spock'\''s body"
   and .adjudication.episode == "Return to Tomorrow"
   and .adjudication.first_aired == "9 February 1968"
   and .still.title == "File:Spock inhabited by Henoch.jpg"
   and .still.expected_subject == "Henoch occupying Spock'\''s body"
   and .portrait.title == "File:Leonard Nimoy by Gage Skidmore.jpg"
   and .portrait.expected_subject == "Leonard Nimoy"
   and (.portrait.author | ascii_downcase | contains("gage skidmore"))
   and .still.source_sha256 != .portrait.source_sha256
   and .still.sha256 != .portrait.sha256
   and .boundary.character_still_exact_subject == true
   and .boundary.performer_portrait_neutral_human == true
   and .boundary.performer_portrait_is_not_character_evidence == true
   and .boundary.source_distinctness_verified == true
   and .boundary.byte_distinctness_verified == true
   and .boundary.cross_facet_substitution == false
   and .boundary.physical_performance_attributed == true
   and .boundary.prosthetic_performance_attributed == false
   and .boundary.new_facet_votes_pending == true
   and .boundary.canonical_mutation == false
   and .boundary.lease_mutation == false
   and .boundary.additional_lease_issued == false
   and .boundary.product_staged == false
   and .boundary.waterline_cycle_recorded == false' \
  "$OUT/media-receipt.json" >/dev/null

sha256sum "$WORK/data/AUTOPILOT.json" \
  | awk '{print $1}' > "$OUT/autopilot-after.sha256"
diff -u \
  "$OUT/autopilot-before.sha256" \
  "$OUT/autopilot-after.sha256"

gh api "/repos/${GITHUB_REPOSITORY}/branches/main" \
  > "$OUT/main-after.json"
test "$(jq -r .commit.sha "$OUT/main-after.json")" = "$EXPECTED_MAIN"

find "$OUT" -type f ! -name manifest.sha256 -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum > "$OUT/manifest.sha256"
sha256sum -c "$OUT/manifest.sha256"
