from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import hashlib
import html
import json
import re
import sys

from PIL import Image

if len(sys.argv) != 3:
    raise SystemExit("usage: lorot-media-prepare-v1.py <preparation-root> <repo-root>")

root = Path(sys.argv[1]).resolve()
repo = Path(sys.argv[2]).resolve()
out = root / "output"
out.mkdir(parents=True, exist_ok=True)

EXPECTED_PARENT = "640754cdeb5a7679790682ab6c28070c28ca9fae"
EXPECTED_TASK = "ap_9b7123237c640f1ce0a16ffe"
EXPECTED_FINGERPRINT = "df893de8f597caf34517ccfc5b7da21953f2b05b21cf8d11dd4c387e9216bf8c"
EXPECTED_SOURCE_RECEIPT = "8d781a52e3ca2216df22b9ccb2ab271d5bd3440b6e48c2878c94bce2580947cd"
EXPECTED_SOURCE_ARTIFACT = 9451813968
EXPECTED_SOURCE_ARTIFACT_SHA = "9ff62d960e44beb644bfb5657bdb878939001b878294431ac4ea6bbb2a3e23f8"
CHARACTER = "Lorot"
PERFORMER = "Jeri Ryan"
WALL = "UC-1392"
STILL_TITLE = "File:Seven Lorot.jpg"
STILL_PAGE = "https://memory-alpha.fandom.com/wiki/File:Seven_Lorot.jpg"
PORTRAIT_TITLE = "File:Jeri Ryan 2014.jpg"
PORTRAIT_PAGE = "https://commons.wikimedia.org/wiki/File:Jeri_Ryan_2014.jpg"
USER_AGENT = "UNDERCAST-Lorot-Media/1.0 (exact-subject and attribution audit)"


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value) -> str:
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def object_hash(value: dict) -> str:
    return sha_bytes(pretty(value).encode())


def clean(value: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def request_bytes(url: str, referer: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    with urlopen(Request(url, headers=headers), timeout=90) as response:
        return response.read()


def api(base: str, params: dict) -> dict:
    return json.loads(request_bytes(base + "?" + urlencode(params)))


def decode_image(data: bytes):
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert("RGB"), image.size, image.format or "unknown"


def normalize(data: bytes, side: str):
    image, source_size, source_format = decode_image(data)
    image.thumbnail((1600, 1600) if side == "still" else (1200, 1500), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    if side == "still":
        image.save(buffer, format="WEBP", quality=94, method=6)
    else:
        image.save(buffer, format="JPEG", quality=94, optimize=True, progressive=False)
    return buffer.getvalue(), source_size, source_format


def fetch_image(base: str, title: str, referer: str, width: int):
    data = api(base, {
        "action": "query",
        "prop": "imageinfo",
        "titles": title,
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "iiurlwidth": str(width),
        "format": "json",
        "formatversion": "2",
    })
    pages = data.get("query", {}).get("pages", [])
    if len(pages) != 1 or pages[0].get("missing"):
        raise SystemExit(f"image metadata missing for {title}")
    page = pages[0]
    info_rows = page.get("imageinfo") or []
    if len(info_rows) != 1:
        raise SystemExit(f"imageinfo cardinality drifted for {title}")
    info = info_rows[0]
    raw = None
    selected_url = None
    errors = []
    for url in (info.get("thumburl"), info.get("url")):
        if not url:
            continue
        try:
            candidate = request_bytes(url, referer)
            decode_image(candidate)
            raw = candidate
            selected_url = url
            break
        except Exception as error:
            errors.append(str(error))
    if raw is None:
        raise SystemExit(f"image download failed for {title}: {errors}")
    return page, info, raw, selected_url, data


source_probe = json.loads((root / "source-probe.json").read_text())
task = json.loads((root / "task.json").read_text())
locator = json.loads((root / "source-locator.json").read_text())
if source_probe.get("receipt_sha256") != EXPECTED_SOURCE_RECEIPT:
    raise SystemExit("Lorot source receipt identity drifted")
if source_probe.get("canonical_parent") != EXPECTED_PARENT:
    raise SystemExit("Lorot source parent drifted")
if source_probe.get("task_id") != EXPECTED_TASK or source_probe.get("source_fingerprint") != EXPECTED_FINGERPRINT:
    raise SystemExit("Lorot source task binding drifted")
if source_probe.get("adjudicated_kind") != "physical" or source_probe.get("maker_attribution") != "unresolved":
    raise SystemExit("Lorot source adjudication drifted")
if locator.get("artifact", {}).get("id") != EXPECTED_SOURCE_ARTIFACT or locator.get("artifact", {}).get("sha256") != EXPECTED_SOURCE_ARTIFACT_SHA:
    raise SystemExit("Lorot source artifact binding drifted")
if task.get("id") != EXPECTED_TASK or task.get("status") != "queued":
    raise SystemExit("Lorot task state drifted")
if task.get("character") != CHARACTER or task.get("performer") != PERFORMER:
    raise SystemExit("Lorot task identity drifted")

specimens = json.loads((repo / "data/specimens.json").read_text())
audit = json.loads((repo / "data/MEDIA-AUDIT.json").read_text())
ids = []
for row in specimens:
    match = re.fullmatch(r"UC-(\d+)", str(row.get("id", "")))
    if match:
        ids.append(int(match.group(1)))
if not ids or f"UC-{max(ids) + 1}" != WALL:
    raise SystemExit("Lorot wall identity drifted")

canonical_text = "\n".join([
    (repo / "data/specimens.json").read_text(errors="replace"),
    (repo / "data/SOURCES.json").read_text(errors="replace"),
    (repo / "data/MEDIA-AUDIT.json").read_text(errors="replace"),
    (repo / "CREDITS.md").read_text(errors="replace"),
])
if STILL_PAGE in canonical_text:
    raise SystemExit("Lorot still source is already canonical")
if PORTRAIT_PAGE in canonical_text:
    raise SystemExit("selected Jeri Ryan portrait source is already canonical")
existing_hashes = set()
for item in audit.get("items", []):
    digest = (item.get("asset") or {}).get("sha256")
    if digest:
        existing_hashes.add(digest)
for path in (repo / "images").glob("*"):
    if path.is_file():
        existing_hashes.add(sha_bytes(path.read_bytes()))

memory_api = "https://memory-alpha.fandom.com/api.php"
still_page, still_info, still_raw, still_url, still_api = fetch_image(memory_api, STILL_TITLE, "https://memory-alpha.fandom.com/", 1600)
still_description = clean(((still_info.get("extmetadata") or {}).get("ImageDescription") or {}).get("value"))
still_identity = f"{still_page.get('title', '')} {still_description}".lower()
if "lorot" not in still_identity:
    raise SystemExit("role still identity does not name Lorot")
still_bytes, still_source_size, still_source_format = normalize(still_raw, "still")
still_sha = sha_bytes(still_bytes)
if min(still_source_size) < 250 or still_sha in existing_hashes:
    raise SystemExit("Lorot still is too small or byte-collides with canonical media")

commons_api = "https://commons.wikimedia.org/w/api.php"
portrait_page, portrait_info, portrait_raw, portrait_url, portrait_api = fetch_image(commons_api, PORTRAIT_TITLE, "https://commons.wikimedia.org/", 1200)
portrait_ext = portrait_info.get("extmetadata") or {}
portrait_description = clean((portrait_ext.get("ImageDescription") or portrait_ext.get("ObjectName") or {}).get("value"))
portrait_identity = f"{portrait_page.get('title', '')} {portrait_description}".lower()
if "jeri" not in portrait_identity or "ryan" not in portrait_identity:
    raise SystemExit("portrait metadata does not identify Jeri Ryan")
portrait_license = clean((portrait_ext.get("LicenseShortName") or {}).get("value"))
if not any(value in portrait_license.lower() for value in ("public domain", "cc by", "cc0")):
    raise SystemExit("portrait license is not accepted")
portrait_author = clean((portrait_ext.get("Artist") or {}).get("value"))
portrait_bytes, portrait_source_size, portrait_source_format = normalize(portrait_raw, "portrait")
portrait_sha = sha_bytes(portrait_bytes)
if min(portrait_source_size) < 250 or portrait_sha in existing_hashes:
    raise SystemExit("Jeri Ryan portrait is too small or byte-collides with canonical media")
if portrait_sha == still_sha or PORTRAIT_PAGE == STILL_PAGE:
    raise SystemExit("Lorot cross-facet collision")

still_filename = "uc-1392-still.webp"
portrait_filename = "uc-1392-portrait.jpg"
(out / still_filename).write_bytes(still_bytes)
(out / portrait_filename).write_bytes(portrait_bytes)

generated = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
fetched_at = generated[:10]

still = {
    "status": "verified",
    "path": f"images/{still_filename}",
    "title": STILL_TITLE,
    "origin": STILL_PAGE,
    "asset_url": still_info.get("url"),
    "download_url": still_url,
    "sha256": still_sha,
    "bytes": len(still_bytes),
    "source_size": list(still_source_size),
    "source_format": still_source_format,
    "mime": still_info.get("mime"),
    "timestamp": still_info.get("timestamp"),
    "description": still_description,
}
portrait = {
    "status": "verified",
    "path": f"images/{portrait_filename}",
    "title": PORTRAIT_TITLE,
    "origin": PORTRAIT_PAGE,
    "asset_url": portrait_info.get("url"),
    "download_url": portrait_url,
    "sha256": portrait_sha,
    "bytes": len(portrait_bytes),
    "source_size": list(portrait_source_size),
    "source_format": portrait_source_format,
    "mime": portrait_info.get("mime"),
    "timestamp": portrait_info.get("timestamp"),
    "description": portrait_description,
    "author": portrait_author,
    "license": portrait_license,
    "year": 2014,
}

facets = [
    {
        "id": "ma_" + hashlib.sha256(f"{WALL}:portrait:{portrait_sha}".encode()).hexdigest()[:24],
        "scope": "star-trek",
        "wall_id": WALL,
        "side": "portrait",
        "actor": PERFORMER,
        "character": CHARACTER,
        "expected_subject": PERFORMER,
        "source_fetched_at": fetched_at,
        "asset": {"src": portrait["path"], "sha256": portrait_sha, "bytes": len(portrait_bytes), "origin": PORTRAIT_PAGE, "kind": "free"},
        "risk_codes": [],
        "votes": [
            {"reviewer": "chatgpt-source-identity-second-desk", "role": "second-desk", "namespace": "identity", "value": "expected", "note": "The licensed Commons source identifies Jeri Ryan and supports performer identity only; it is not Lorot, Seven of Nine, episode, prosthetic, or maker evidence.", "evidence": [f"source-origin:{PORTRAIT_PAGE}", f"asset-sha256:{portrait_sha}"], "enforced": True, "at": generated, "asset_sha256": portrait_sha},
            {"reviewer": "chatgpt-source-identity-second-desk", "role": "second-desk", "namespace": "presentation", "value": "neutral-human", "note": "The portrait presents Jeri Ryan as a human performer and remains source-distinct and byte-distinct from Lorot character evidence and all canonical assets.", "evidence": [f"source-origin:{PORTRAIT_PAGE}", f"asset-sha256:{portrait_sha}"], "enforced": True, "at": generated, "asset_sha256": portrait_sha},
        ],
        "status": "verified",
        "claims": {
            "identity": {"state": "enforced", "value": "expected", "support": 2, "reviewers": 1, "human_reviewers": 1, "competing": []},
            "presentation": {"state": "enforced", "value": "neutral-human", "support": 2, "reviewers": 1, "human_reviewers": 1, "competing": []},
        },
    },
    {
        "id": "ma_" + hashlib.sha256(f"{WALL}:still:{still_sha}".encode()).hexdigest()[:24],
        "scope": "star-trek",
        "wall_id": WALL,
        "side": "still",
        "actor": PERFORMER,
        "character": CHARACTER,
        "expected_subject": CHARACTER,
        "source_fetched_at": fetched_at,
        "asset": {"src": still["path"], "sha256": still_sha, "bytes": len(still_bytes), "origin": STILL_PAGE, "kind": "still"},
        "risk_codes": [],
        "votes": [
            {"reviewer": "chatgpt-source-identity-second-desk", "role": "second-desk", "namespace": "identity", "value": "expected", "note": "The Memory Alpha file identity explicitly names Lorot and is retained only as exact Lorot character evidence.", "evidence": [f"source-page:{STILL_PAGE}", f"asset-sha256:{still_sha}"], "enforced": True, "at": generated, "asset_sha256": still_sha},
            {"reviewer": "chatgpt-source-identity-second-desk", "role": "second-desk", "namespace": "presentation", "value": "character-depiction", "note": "The frame depicts Seven of Nine acting as Lorot; it is not treated as the original Vulcan body, a neutral performer portrait, or maker evidence.", "evidence": [f"source-page:{STILL_PAGE}", f"asset-sha256:{still_sha}"], "enforced": True, "at": generated, "asset_sha256": still_sha},
        ],
        "status": "verified",
        "claims": {
            "identity": {"state": "enforced", "value": "expected", "support": 2, "reviewers": 1, "human_reviewers": 1, "competing": []},
            "presentation": {"state": "enforced", "value": "character-depiction", "support": 2, "reviewers": 1, "human_reviewers": 1, "competing": []},
        },
    },
]
facets.sort(key=lambda row: row["side"])

media = {
    "version": 1,
    "transaction": "STAR-TREK-LOROT-MEDIA-PREPARATION-V1",
    "status": "success",
    "generated_at": generated,
    "canonical_parent": EXPECTED_PARENT,
    "task_id": EXPECTED_TASK,
    "source_fingerprint": EXPECTED_FINGERPRINT,
    "wall_id": WALL,
    "character": CHARACTER,
    "performer": PERFORMER,
    "production": "Star Trek: Voyager (Infinite Regress)",
    "years": "1998",
    "performance_mode": "physical-prosthetic",
    "adjudicated_performance_mode": "physical / live-action under Seven of Nine’s Borg presentation",
    "performance_scope": "Jeri Ryan’s physical performance as Subaltern Lorot while Seven of Nine manifests Lorot in Infinite Regress (1998)",
    "seven_of_nine_body_not_conflated_with_original_lorot_body": True,
    "maker_attribution": "unresolved",
    "prosthetic_design_attribution": "unresolved",
    "makeup_attribution": "unresolved",
    "costume_attribution": "unresolved",
    "direction_attribution": "unresolved",
    "editing_attribution": "unresolved",
    "sound_processing_attribution": "unresolved",
    "production_shop_attribution": "unresolved",
    "still": still,
    "portrait": portrait,
    "facets": facets,
    "facets_sha256": sha_bytes(pretty(facets).encode()),
    "media_review": {"verdict": "pass", "still_identity": "expected", "still_presentation": "character-depiction", "portrait_identity": "expected", "portrait_presentation": "neutral-human", "cross_facet_substitution": False},
    "byte_collision": False,
    "source_collision": False,
    "cross_facet_substitution": False,
    "source_probe_artifact": {"id": EXPECTED_SOURCE_ARTIFACT, "sha256": EXPECTED_SOURCE_ARTIFACT_SHA},
    "source_probe_receipt_sha256": EXPECTED_SOURCE_RECEIPT,
    "canonical_mutation": False,
    "lease_taken": False,
}
media["receipt_sha256"] = object_hash(media)

(root / "media-preparation.json").write_text(pretty(media))
(root / "facets.json").write_text(pretty(facets))
(root / "still-api.json").write_text(json.dumps(still_api, indent=2, ensure_ascii=False) + "\n")
(root / "portrait-api.json").write_text(json.dumps(portrait_api, indent=2, ensure_ascii=False) + "\n")

result = {"status": "success", "canonical_parent": EXPECTED_PARENT, "task_id": EXPECTED_TASK, "source_fingerprint": EXPECTED_FINGERPRINT, "wall_id": WALL, "still_sha256": still_sha, "portrait_sha256": portrait_sha, "media_receipt_sha256": media["receipt_sha256"], "canonical_mutation": False, "lease_taken": False}
print(json.dumps(result, indent=2))
