#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import hashlib
import html
import json
import os
import re

from PIL import Image

OUT = Path(os.environ["OUT"])
ROOT = Path(os.environ["ROOT"])
OUT.mkdir(parents=True, exist_ok=True)

EPISODES = [
    "Something Borrowed, Something Green",
    "The Inner Fight",
    "Old Friends, New Planets",
]
STILL_TITLE = "File:Risik.jpg"
PORTRAIT_TITLE = "File:Fred Tatasciore (52261767885).jpg"
PORTRAIT_SOURCE = "https://commons.wikimedia.org/wiki/File:Fred_Tatasciore_(52261767885).jpg"


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value):
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_identity(path: Path, field: str, expected: str, omitted=()):
    payload = read_json(path)
    identity = payload.get(field)
    body = dict(payload)
    body.pop(field, None)
    for key in omitted:
        body.pop(key, None)
    actual = hashlib.sha256(pretty(body).encode()).hexdigest()
    if identity != expected or actual != identity:
        raise SystemExit(f"{path.name} identity drifted: {identity} / {actual}")
    return payload


def fetch_json(base: str, params: dict):
    url = base + "?" + urlencode(params)
    request = Request(
        url,
        headers={
            "User-Agent": "UNDERCAST-Risik-Media/1.0 (source-bound-media)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=120) as response:
        return json.loads(response.read())


def fetch_bytes(url: str, referer: str | None = None) -> bytes:
    headers = {
        "User-Agent": "UNDERCAST-Risik-Media/1.0 (source-bound-media)",
        "Accept": "*/*",
    }
    if referer:
        headers["Referer"] = referer
    with urlopen(Request(url, headers=headers), timeout=120) as response:
        return response.read()


def clean(value: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def decode(data: bytes):
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert("RGB"), image.size, image.format or "unknown"


def download(info: dict, referer: str):
    errors = []
    for url in (info.get("thumburl"), info.get("url")):
        if not url:
            continue
        try:
            data = fetch_bytes(url, referer)
            decode(data)
            return data, url
        except Exception as exc:
            errors.append(f"{url}:{type(exc).__name__}:{exc}")
    raise RuntimeError("image download failed: " + " | ".join(errors))


def normalize(data: bytes, side: str):
    image, source_size, source_format = decode(data)
    if side == "still":
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, format="WEBP", quality=94, method=6)
    else:
        image.thumbnail((900, 1400), Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, format="JPEG", quality=91, optimize=True, progressive=False)
    return output.getvalue(), source_size, source_format, image.size


source = verify_identity(
    OUT / "source-probe.json",
    "receipt_sha256",
    os.environ["SOURCE_RECEIPT_SHA"],
    ("artifact",),
)
review = verify_identity(
    OUT / "source-review.json",
    "review_sha256",
    os.environ["SOURCE_REVIEW_SHA"],
    ("artifact",),
)
claim = verify_identity(
    OUT / "claim-receipt.json",
    "receipt_sha256",
    os.environ["CLAIM_RECEIPT_SHA"],
)

if (
    source.get("status") != "source-frozen-pending-independent-review"
    or review.get("verdict") != "pass"
    or review.get("adjudication", {}).get("performance_mode") != "voice-animation"
    or review.get("adjudication", {}).get("series") != "Star Trek: Lower Decks"
    or review.get("adjudication", {}).get("episodes") != EPISODES
    or review.get("adjudication", {}).get("year") != "2023"
    or review.get("adjudication", {}).get("single_card_production") is not None
    or review.get("adjudication", {}).get("single_card_production_status")
    != "pending-source-bound-media-selection"
):
    raise SystemExit("Risik source-review media boundary drifted")

for key in (
    "physical_performance_attributed",
    "prosthetic_performance_attributed",
    "animation_labor_attributed",
    "character_design_attributed",
    "voice_direction_attributed",
    "vocal_processing_attributed",
    "sound_attributed",
    "transformation_measured",
):
    if review.get("adjudication", {}).get(key) is not False:
        raise SystemExit(f"unsupported Risik attribution promoted: {key}")
if review.get("adjudication", {}).get("maker_attribution") != "unresolved":
    raise SystemExit("Risik maker attribution drifted")

state = read_json(ROOT / "data/AUTOPILOT.json")
trek = [row for row in state["jobs"] if row.get("scope") == "star-trek"]
task = next((row for row in trek if row.get("id") == os.environ["TASK_ID"]), None)
active = [row for row in trek if row.get("status") in {"leased", "drafted", "merged"}]
counts = {
    "total": len(trek),
    "queued": sum(row.get("status") == "queued" for row in trek),
    "resolved": sum(row.get("status") == "resolved" for row in trek),
    "blocked": sum(row.get("status") == "blocked" for row in trek),
    "rejected": sum(row.get("status") == "rejected" for row in trek),
    "in_flight": len(active),
}
if counts != {
    "total": 2228,
    "queued": 1795,
    "resolved": 430,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 1,
}:
    raise SystemExit(f"Risik media queue drifted: {counts}")
if (
    len(active) != 1
    or not task
    or task.get("id") != os.environ["TASK_ID"]
    or task.get("status") != "leased"
    or task.get("attempts") != 1
    or task.get("lease", {}).get("id") != os.environ["EXPECTED_LEASE"]
    or task.get("performer") != os.environ["EXPECTED_PERFORMER"]
    or task.get("character") != os.environ["EXPECTED_CHARACTER"]
    or task.get("source_fingerprint") != os.environ["EXPECTED_FINGERPRINT"]
):
    raise SystemExit(f"Risik media lease custody drifted: {task}")

wall_id = os.environ["WALL_ID"]
records = read_json(ROOT / "data/specimens.json")
if any(row.get("id") == wall_id for row in records):
    raise SystemExit(f"reserved Risik wall already exists: {wall_id}")
if list((ROOT / "images").glob("uc-1399-*")):
    raise SystemExit("reserved Risik media paths already exist")

audit = read_json(ROOT / "data/MEDIA-AUDIT.json")
prior = [
    item
    for item in audit.get("items", [])
    if item.get("id") == os.environ["PRIOR_PORTRAIT_ITEM"]
    and item.get("wall_id") == os.environ["PRIOR_PORTRAIT_WALL"]
    and item.get("side") == "portrait"
]
if len(prior) != 1:
    raise SystemExit(f"audited Fred Tatasciore portrait cardinality drifted: {len(prior)}")
prior_item = prior[0]
prior_asset = prior_item.get("asset") or {}
prior_claims = prior_item.get("claims") or {}
if (
    prior_item.get("actor") != os.environ["EXPECTED_PERFORMER"]
    or prior_item.get("expected_subject") != os.environ["EXPECTED_PERFORMER"]
    or prior_item.get("status") != "verified"
    or prior_asset.get("origin") != PORTRAIT_SOURCE
    or prior_asset.get("sha256") != os.environ["PRIOR_PORTRAIT_SHA"]
    or (prior_claims.get("identity") or {}).get("state") != "enforced"
    or (prior_claims.get("identity") or {}).get("value") != "expected"
    or (prior_claims.get("presentation") or {}).get("state") != "enforced"
    or (prior_claims.get("presentation") or {}).get("value") != "neutral-human"
):
    raise SystemExit("audited Fred Tatasciore portrait reuse boundary drifted")
(OUT / "prior-performer-audit.json").write_text(pretty(prior_item), encoding="utf-8")

still_api = fetch_json(
    "https://memory-alpha.fandom.com/api.php",
    {
        "action": "query",
        "prop": "revisions|imageinfo",
        "titles": STILL_TITLE,
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "iiurlwidth": "1600",
        "format": "json",
        "formatversion": "2",
    },
)
(OUT / "risik-file-api.json").write_text(pretty(still_api), encoding="utf-8")
still_pages = (still_api.get("query") or {}).get("pages") or []
if len(still_pages) != 1:
    raise SystemExit(f"Risik file page cardinality drifted: {len(still_pages)}")
still_page = still_pages[0]
if still_page.get("title") != STILL_TITLE:
    raise SystemExit(f"Risik file title drifted: {still_page.get('title')}")
still_revisions = still_page.get("revisions") or []
still_infos = still_page.get("imageinfo") or []
if len(still_revisions) != 1 or len(still_infos) != 1:
    raise SystemExit("Risik file revision or imageinfo cardinality drifted")
still_revision = still_revisions[0]
still_wikitext = ((still_revision.get("slots") or {}).get("main") or {}).get("content")
if not isinstance(still_wikitext, str):
    raise SystemExit("Risik file-page wikitext absent")
(OUT / "risik-file.wikitext").write_text(still_wikitext, encoding="utf-8")
still_info = still_infos[0]
still_ext = still_info.get("extmetadata") or {}
still_metadata = "\n".join(
    clean((still_ext.get(key) or {}).get("value"))
    for key in ("ImageDescription", "ObjectName", "Categories", "Credit")
)
still_evidence = still_wikitext + "\n" + still_metadata
selected = [episode for episode in EPISODES if episode.lower() in still_evidence.lower()]
if len(selected) != 1:
    raise SystemExit(f"Risik image does not select exactly one reviewed episode: {selected}")
selected_episode = selected[0]
production = next(
    (
        row
        for row in review["source"]["production_revisions"]
        if row.get("episode") == selected_episode
    ),
    None,
)
if not production:
    raise SystemExit("selected Risik production is absent from the independent source review")

still_origin = still_info.get("descriptionurl") or "https://memory-alpha.fandom.com/wiki/File:Risik.jpg"
expected_role_image = (review.get("media_boundary") or {}).get("character_page_image") or {}
if "Risik.jpg" not in (still_info.get("url") or ""):
    raise SystemExit("Risik still URL no longer identifies Risik.jpg")
if "Risik.jpg" not in (expected_role_image.get("source") or ""):
    raise SystemExit("role page image is no longer Risik.jpg")
still_raw, still_download = download(
    still_info, "https://memory-alpha.fandom.com/wiki/Risik"
)
still_bytes, still_source_size, still_source_format, still_output_size = normalize(
    still_raw, "still"
)
still_sha = digest_bytes(still_bytes)
(OUT / "risik-still.webp").write_bytes(still_bytes)

portrait_api = fetch_json(
    "https://commons.wikimedia.org/w/api.php",
    {
        "action": "query",
        "prop": "imageinfo",
        "titles": PORTRAIT_TITLE,
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "iiurlwidth": "900",
        "format": "json",
        "formatversion": "2",
    },
)
(OUT / "fred-tatasciore-api.json").write_text(pretty(portrait_api), encoding="utf-8")
portrait_pages = (portrait_api.get("query") or {}).get("pages") or []
if len(portrait_pages) != 1:
    raise SystemExit(f"Fred Tatasciore file cardinality drifted: {len(portrait_pages)}")
portrait_page = portrait_pages[0]
portrait_infos = portrait_page.get("imageinfo") or []
if portrait_page.get("title") != PORTRAIT_TITLE or len(portrait_infos) != 1:
    raise SystemExit("Fred Tatasciore portrait identity drifted")
portrait_info = portrait_infos[0]
portrait_ext = portrait_info.get("extmetadata") or {}
portrait_description = clean(
    (portrait_ext.get("ImageDescription") or portrait_ext.get("ObjectName") or {}).get("value")
)
portrait_categories = clean((portrait_ext.get("Categories") or {}).get("value"))
portrait_author = clean((portrait_ext.get("Artist") or {}).get("value"))
portrait_license = clean((portrait_ext.get("LicenseShortName") or {}).get("value"))
identity_text = " ".join(
    (portrait_page["title"], portrait_description, portrait_categories)
).lower()
if "fred" not in identity_text or "tatasciore" not in identity_text:
    raise SystemExit("portrait metadata does not identify Fred Tatasciore")
if not any(token in portrait_license.lower() for token in ("cc by", "cc0", "public domain")):
    raise SystemExit(f"portrait license is not accepted: {portrait_license}")
portrait_descriptionurl = portrait_info.get("descriptionurl") or PORTRAIT_SOURCE
if portrait_descriptionurl != PORTRAIT_SOURCE:
    raise SystemExit(f"portrait source drifted: {portrait_descriptionurl}")
portrait_raw, portrait_download = download(
    portrait_info, "https://commons.wikimedia.org/"
)
portrait_bytes, portrait_source_size, portrait_source_format, portrait_output_size = normalize(
    portrait_raw, "portrait"
)
portrait_sha = digest_bytes(portrait_bytes)
(OUT / "fred-tatasciore-portrait.jpg").write_bytes(portrait_bytes)

if still_sha == portrait_sha:
    raise SystemExit("Risik still and performer portrait collide")
existing = {}
for file in (ROOT / "images").iterdir():
    if file.is_file():
        existing.setdefault(digest_bytes(file.read_bytes()), []).append(
            str(file.relative_to(ROOT))
        )
if still_sha in existing:
    raise SystemExit(f"Risik still duplicates canonical bytes: {existing[still_sha]}")
if portrait_sha in existing:
    raise SystemExit(f"Risik portrait duplicates canonical bytes: {existing[portrait_sha]}")
if portrait_sha == os.environ["PRIOR_PORTRAIT_SHA"]:
    raise SystemExit("Risik portrait duplicates the prior Morgo derivative")
if still_origin == portrait_descriptionurl:
    raise SystemExit("Risik still and portrait sources collide")

canonical_text = "\n".join(
    path.read_text(errors="replace")
    for path in (
        ROOT / "data/specimens.json",
        ROOT / "data/SOURCES.json",
        ROOT / "data/MEDIA-AUDIT.json",
        ROOT / "data/media-manifest.json",
    )
    if path.exists()
)
if still_origin in canonical_text or STILL_TITLE in canonical_text:
    raise SystemExit("Risik still source is already canonical")
if portrait_descriptionurl not in canonical_text:
    raise SystemExit("audited Fred Tatasciore portrait source is no longer canonical")

receipt = {
    "version": 1,
    "transaction": "STAR-TREK-RISIK-MEDIA-V1",
    "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    "status": "media-prepared-pending-independent-review",
    "canonical_parent": os.environ["EXPECTED_MAIN"],
    "canonical_tree": os.environ["EXPECTED_TREE"],
    "claim": {
        "branch": os.environ["CLAIM_BRANCH"],
        "commit": os.environ["CLAIM_COMMIT"],
        "tree": os.environ["CLAIM_TREE"],
        "receipt_sha256": os.environ["CLAIM_RECEIPT_SHA"],
        "lease_id": os.environ["EXPECTED_LEASE"],
    },
    "source": {
        "branch": os.environ["SOURCE_BRANCH"],
        "commit": os.environ["SOURCE_COMMIT"],
        "tree": os.environ["SOURCE_TREE"],
        "receipt_sha256": os.environ["SOURCE_RECEIPT_SHA"],
    },
    "source_review": {
        "branch": os.environ["SOURCE_REVIEW_BRANCH"],
        "commit": os.environ["SOURCE_REVIEW_COMMIT"],
        "tree": os.environ["SOURCE_REVIEW_TREE"],
        "review_sha256": os.environ["SOURCE_REVIEW_SHA"],
        "verdict": "pass",
    },
    "task": {
        "id": os.environ["TASK_ID"],
        "lease_id": os.environ["EXPECTED_LEASE"],
        "performer": os.environ["EXPECTED_PERFORMER"],
        "character": os.environ["EXPECTED_CHARACTER"],
        "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
        "status": "leased",
        "attempts": 1,
        "wall_id_reserved": wall_id,
    },
    "adjudication": {
        "adjudicated_kind": "voice",
        "performance_mode": "voice-animation",
        "performance_scope": review["adjudication"]["performance_scope"],
        "series": "Star Trek: Lower Decks",
        "reviewed_episodes": EPISODES,
        "selected_card_production": selected_episode,
        "selected_production_revision": production,
        "year": "2023",
        "physical_performance_attributed": False,
        "prosthetic_performance_attributed": False,
        "animation_labor_attributed": False,
        "character_design_attributed": False,
        "voice_direction_attributed": False,
        "vocal_processing_attributed": False,
        "sound_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
    },
    "still": {
        "title": STILL_TITLE,
        "file_page_revision": {
            "revision": still_revision.get("revid"),
            "parentid": still_revision.get("parentid"),
            "timestamp": still_revision.get("timestamp"),
            "wikitext_sha256": digest_text(still_wikitext),
        },
        "descriptionurl": still_origin,
        "origin": still_info.get("url"),
        "download_url": still_download,
        "timestamp": still_info.get("timestamp"),
        "mime": still_info.get("mime"),
        "sha256": still_sha,
        "bytes": len(still_bytes),
        "source_size": still_source_size,
        "output_size": still_output_size,
        "source_format": still_source_format,
        "expected_subject": "Risik in the selected 2381 Lower Decks appearance",
        "selected_card_production": selected_episode,
        "source_binding": "Risik infobox primary image plus exact file-page production token",
        "review_status": "source-bound-pending-new-facet-votes",
    },
    "portrait": {
        "title": PORTRAIT_TITLE,
        "descriptionurl": portrait_descriptionurl,
        "origin": portrait_descriptionurl,
        "download_url": portrait_download,
        "timestamp": portrait_info.get("timestamp"),
        "mime": portrait_info.get("mime"),
        "sha256": portrait_sha,
        "bytes": len(portrait_bytes),
        "source_size": portrait_source_size,
        "output_size": portrait_output_size,
        "source_format": portrait_source_format,
        "author": portrait_author,
        "license": portrait_license,
        "description": portrait_description,
        "expected_subject": os.environ["EXPECTED_PERFORMER"],
        "review_status": "audited-source-reuse-pending-new-facet-votes",
        "reuse": {
            "wall_id": os.environ["PRIOR_PORTRAIT_WALL"],
            "item_id": os.environ["PRIOR_PORTRAIT_ITEM"],
            "prior_asset_sha256": os.environ["PRIOR_PORTRAIT_SHA"],
            "prior_identity_claim": prior_claims["identity"],
            "prior_presentation_claim": prior_claims["presentation"],
        },
    },
    "queue": counts,
    "boundary": {
        "single_card_production_selected_by_character_file_page": True,
        "source_distinct": still_origin != portrait_descriptionurl,
        "byte_distinct": still_sha != portrait_sha,
        "performer_source_reused": True,
        "performer_source_reuse_same_actor": True,
        "performer_source_prior_identity_enforced": True,
        "performer_source_prior_presentation_enforced": True,
        "new_derivative_preserves_full_frame": True,
        "new_derivative_encoding": "JPEG quality 91, full frame, max 900x1400",
        "new_derivative_byte_distinct_from_all_current_assets": portrait_sha not in existing,
        "cross_facet_substitution": False,
        "new_facet_votes_pending": True,
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "waterline_cycle_recorded": False,
    },
}
encoded = pretty(receipt)
receipt["receipt_sha256"] = hashlib.sha256(encoded.encode()).hexdigest()
(OUT / "media-receipt.json").write_text(pretty(receipt), encoding="utf-8")
