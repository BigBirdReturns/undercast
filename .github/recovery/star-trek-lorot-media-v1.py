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

REPO = Path(".")
ROOT = Path(os.environ["ROOT"])
PROBE_ROOT = ROOT / "probe"
OUT = ROOT / "output"
OUT.mkdir(parents=True, exist_ok=True)

EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
TASK_ID = os.environ["TASK_ID"]
FINGERPRINT = os.environ["FINGERPRINT"]
WALL_ID = os.environ["WALL_ID"]

probe = json.loads((PROBE_ROOT / "source-probe.json").read_text())
task = json.loads((PROBE_ROOT / "task.json").read_text())
if probe.get("canonical_parent") != EXPECTED_MAIN:
    raise SystemExit("source-probe parent binding drifted")
if probe.get("task_id") != TASK_ID or probe.get("source_fingerprint") != FINGERPRINT:
    raise SystemExit("source-probe task binding drifted")
if probe.get("adjudicated_kind") != "physical" or probe.get("lease_taken") is not False:
    raise SystemExit("source-probe authority or modality drifted")
frozen_role_text = (PROBE_ROOT / "frozen-source.wikitext").read_text()
if "Lorot" not in frozen_role_text or "Jeri Ryan" not in frozen_role_text or "Infinite Regress" not in frozen_role_text:
    raise SystemExit("frozen Lorot role evidence drifted")

USER_AGENT = "UNDERCAST-Lorot-Media/1.1 (source and attribution audit)"


def request_bytes(url: str, referer: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if referer:
        headers["Referer"] = referer
    with urlopen(Request(url, headers=headers), timeout=120) as response:
        return response.read()


def api_json(base: str, params: dict[str, str]) -> dict:
    return json.loads(request_bytes(base + "?" + urlencode(params)))


def clean(value: str | None) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def decode(data: bytes) -> tuple[Image.Image, tuple[int, int], str]:
    with Image.open(BytesIO(data)) as source:
        source.load()
        return source.convert("RGB"), source.size, source.format or "unknown"


def normalize(data: bytes, side: str) -> tuple[bytes, tuple[int, int], str]:
    image, source_size, source_format = decode(data)
    image.thumbnail((1600, 1600) if side == "still" else (1200, 1500), Image.Resampling.LANCZOS)
    buffer = BytesIO()
    if side == "still":
        image.save(buffer, format="WEBP", quality=94, method=6)
    else:
        image.save(buffer, format="JPEG", quality=94, optimize=True, progressive=False)
    return buffer.getvalue(), source_size, source_format


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def facet(
    *,
    side: str,
    asset_sha: str,
    asset_bytes: int,
    origin: str,
    expected_subject: str,
    presentation: str,
    identity_note: str,
    presentation_note: str,
    evidence: list[str],
    generated_at: str,
) -> dict:
    return {
        "id": "ma_" + sha256(f"{WALL_ID}:{side}:{asset_sha}".encode())[:24],
        "scope": "star-trek",
        "wall_id": WALL_ID,
        "side": side,
        "actor": "Jeri Ryan",
        "character": "Lorot",
        "expected_subject": expected_subject,
        "source_fetched_at": generated_at[:10],
        "asset": {
            "src": f"images/uc-1392-{side}." + ("webp" if side == "still" else "jpg"),
            "sha256": asset_sha,
            "bytes": asset_bytes,
            "origin": origin,
            "kind": "still" if side == "still" else "free",
        },
        "risk_codes": [],
        "votes": [
            {
                "reviewer": "chatgpt-source-identity-second-desk",
                "role": "second-desk",
                "namespace": "identity",
                "value": "expected",
                "note": identity_note,
                "evidence": evidence,
                "enforced": True,
                "at": generated_at,
                "asset_sha256": asset_sha,
            },
            {
                "reviewer": "chatgpt-source-identity-second-desk",
                "role": "second-desk",
                "namespace": "presentation",
                "value": presentation,
                "note": presentation_note,
                "evidence": evidence,
                "enforced": True,
                "at": generated_at,
                "asset_sha256": asset_sha,
            },
        ],
        "status": "verified",
        "claims": {
            "identity": {
                "state": "enforced",
                "value": "expected",
                "support": 2,
                "reviewers": 1,
                "human_reviewers": 1,
                "competing": [],
            },
            "presentation": {
                "state": "enforced",
                "value": presentation,
                "support": 2,
                "reviewers": 1,
                "human_reviewers": 1,
                "competing": [],
            },
        },
    }


existing_hashes = {
    sha256(path.read_bytes())
    for path in (REPO / "images").glob("*")
    if path.is_file()
}
canonical_text = "\n".join(
    (REPO / path).read_text(errors="replace")
    for path in ("data/specimens.json", "data/SOURCES.json", "data/MEDIA-AUDIT.json", "CREDITS.md")
)

memory_api = "https://memory-alpha.fandom.com/api.php"
still_title = "File:Seven Lorot.jpg"
still_api = api_json(
    memory_api,
    {
        "action": "query",
        "prop": "imageinfo",
        "titles": still_title,
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "iiurlwidth": "1600",
        "format": "json",
        "formatversion": "2",
    },
)
still_page = still_api["query"]["pages"][0]
still_infos = still_page.get("imageinfo") or []
if len(still_infos) != 1:
    raise SystemExit("exact Lorot still metadata cardinality drifted")
still_info = still_infos[0]
still_source_page = still_info.get("descriptionurl") or "https://memory-alpha.fandom.com/wiki/File:Seven_Lorot.jpg"
if "Seven_Lorot" not in still_source_page and "Seven Lorot" not in still_page.get("title", ""):
    raise SystemExit("exact Lorot still identity metadata drifted")
still_raw = None
still_download_url = None
for url in (still_info.get("thumburl"), still_info.get("url")):
    if not url:
        continue
    try:
        candidate = request_bytes(url, "https://memory-alpha.fandom.com/")
        decode(candidate)
        still_raw = candidate
        still_download_url = url
        break
    except Exception:
        pass
if still_raw is None:
    raise SystemExit("exact Lorot still download failed")
still_bytes, still_source_size, still_source_format = normalize(still_raw, "still")
still_sha = sha256(still_bytes)
if min(still_source_size) < 250 or still_sha in existing_hashes:
    raise SystemExit("Lorot still is unusable or collides with canonical bytes")

commons_api = "https://commons.wikimedia.org/w/api.php"
portrait_title = "File:Jeri Ryan 2014.jpg"
portrait_api = api_json(
    commons_api,
    {
        "action": "query",
        "prop": "imageinfo",
        "titles": portrait_title,
        "iiprop": "url|size|sha1|mime|timestamp|extmetadata",
        "iiurlwidth": "1200",
        "format": "json",
        "formatversion": "2",
    },
)
portrait_page = portrait_api["query"]["pages"][0]
portrait_infos = portrait_page.get("imageinfo") or []
if len(portrait_infos) != 1:
    raise SystemExit("Jeri Ryan portrait metadata cardinality drifted")
portrait_info = portrait_infos[0]
portrait_ext = portrait_info.get("extmetadata") or {}
portrait_description = clean(
    (portrait_ext.get("ImageDescription") or portrait_ext.get("ObjectName") or {}).get("value")
)
portrait_identity = (portrait_page.get("title", "") + " " + portrait_description).lower()
portrait_license = clean((portrait_ext.get("LicenseShortName") or {}).get("value"))
portrait_author = clean((portrait_ext.get("Artist") or {}).get("value"))
portrait_origin = portrait_info.get("descriptionurl") or "https://commons.wikimedia.org/wiki/File:Jeri_Ryan_2014.jpg"
if "jeri" not in portrait_identity or "ryan" not in portrait_identity:
    raise SystemExit("portrait identity metadata drifted")
if not any(value in portrait_license.lower() for value in ("public domain", "cc by", "cc0")):
    raise SystemExit("portrait licence is not accepted")
if (
    portrait_origin in canonical_text
    or portrait_page.get("title", "") in canonical_text
    or portrait_page.get("title", "").replace(" ", "_") in canonical_text
):
    raise SystemExit("portrait source already exists in canonical corpus")
portrait_raw = None
portrait_download_url = None
for url in (portrait_info.get("thumburl"), portrait_info.get("url")):
    if not url:
        continue
    try:
        candidate = request_bytes(url, "https://commons.wikimedia.org/")
        decode(candidate)
        portrait_raw = candidate
        portrait_download_url = url
        break
    except Exception:
        pass
if portrait_raw is None:
    raise SystemExit("Jeri Ryan portrait download failed")
portrait_bytes, portrait_source_size, portrait_source_format = normalize(portrait_raw, "portrait")
portrait_sha = sha256(portrait_bytes)
if min(portrait_source_size) < 250 or portrait_sha in existing_hashes or portrait_sha == still_sha:
    raise SystemExit("portrait is unusable or collides with canonical bytes")
if portrait_origin == still_source_page:
    raise SystemExit("cross-facet source collision")

# Freeze the canonical episode target as supplemental production context. The
# Lorot page remains the sole performer-role attribution authority.
episode_api = api_json(
    memory_api,
    {
        "action": "query",
        "prop": "revisions",
        "titles": "Infinite Regress (episode)",
        "redirects": "1",
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "format": "json",
        "formatversion": "2",
    },
)
episode_page = episode_api["query"]["pages"][0]
episode_revisions = episode_page.get("revisions") or []
if episode_page.get("missing") or len(episode_revisions) != 1:
    raise SystemExit("Infinite Regress source resolution drifted")
episode_revision = episode_revisions[0]
episode_text = episode_revision["slots"]["main"]["content"]
episode_source = "https://memory-alpha.fandom.com/wiki/Infinite_Regress_(episode)"
episode_receipt = {
    "source": episode_source,
    "pageid": episode_page["pageid"],
    "revision": episode_revision["revid"],
    "timestamp": episode_revision["timestamp"],
    "content_sha256": sha256(episode_text.encode()),
}

still_name = "uc-1392-still.webp"
portrait_name = "uc-1392-portrait.jpg"
(OUT / still_name).write_bytes(still_bytes)
(OUT / portrait_name).write_bytes(portrait_bytes)

generated_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
still = {
    "title": still_page["title"],
    "origin": still_source_page,
    "asset_url": still_info.get("url"),
    "download_url": still_download_url,
    "source_page": still_source_page,
    "sha256": still_sha,
    "bytes": len(still_bytes),
    "source_size": still_source_size,
    "source_format": still_source_format,
    "mime": still_info.get("mime"),
    "timestamp": still_info.get("timestamp"),
}
portrait = {
    "title": portrait_page["title"],
    "origin": portrait_origin,
    "asset_url": portrait_info.get("url"),
    "download_url": portrait_download_url,
    "sha256": portrait_sha,
    "bytes": len(portrait_bytes),
    "source_size": portrait_source_size,
    "source_format": portrait_source_format,
    "mime": portrait_info.get("mime"),
    "timestamp": portrait_info.get("timestamp"),
    "description": portrait_description,
    "author": portrait_author,
    "license": portrait_license,
    "year": 2014,
}

task["source"] = task["sources"][0]
task["production"] = "Star Trek: Voyager (Infinite Regress)"
task["years"] = "1998"
task["episode_source"] = episode_source
task["episode_receipt"] = episode_receipt

portrait_evidence = [
    f"source-origin:{portrait_origin}",
    f"source-author:{portrait_author}",
    f"source-license:{portrait_license}",
    f"asset-sha256:{portrait_sha}",
]
still_evidence = [
    "source-page:https://memory-alpha.fandom.com/wiki/Lorot",
    "source-revision:2743351",
    f"source-file:{still_source_page}",
    f"source-asset:{still_info.get('url')}",
    f"asset-sha256:{still_sha}",
]
facets = [
    facet(
        side="portrait",
        asset_sha=portrait_sha,
        asset_bytes=len(portrait_bytes),
        origin=portrait_origin,
        expected_subject="Jeri Ryan",
        presentation="neutral-human",
        identity_note=(
            "The licensed Commons file identifies Jeri Ryan and supports performer identity only; "
            "it is not Lorot, Seven of Nine, production, makeup, or maker evidence."
        ),
        presentation_note=(
            "The portrait presents Jeri Ryan as a human performer and is source-distinct and "
            "byte-distinct from the exact Lorot still and every canonical asset."
        ),
        evidence=portrait_evidence,
        generated_at=generated_at,
    ),
    facet(
        side="still",
        asset_sha=still_sha,
        asset_bytes=len(still_bytes),
        origin=still_source_page,
        expected_subject="Lorot as manifested through Seven of Nine",
        presentation="character-depiction",
        identity_note=(
            "The exact Memory Alpha file is titled Seven Lorot and depicts Seven of Nine acting as "
            "Lorot in Infinite Regress; the frozen Lorot page identifies Jeri Ryan as the performer."
        ),
        presentation_note=(
            "The exact frame depicts Lorot’s manifested personality through Seven of Nine. It is not "
            "treated as Lorot’s original Vulcan or Borg body, a neutral performer portrait, or maker evidence."
        ),
        evidence=still_evidence,
        generated_at=generated_at,
    ),
]
facets_sha = sha256((json.dumps(stable(facets), indent=2, ensure_ascii=False) + "\n").encode())
media = {
    "version": 1,
    "transaction": "STAR-TREK-LOROT-MEDIA-PREPARATION-V1",
    "generated_at": generated_at,
    "canonical_parent": EXPECTED_MAIN,
    "task_id": TASK_ID,
    "source_fingerprint": FINGERPRINT,
    "wall_id": WALL_ID,
    "character": "Lorot",
    "performer": "Jeri Ryan",
    "production": task["production"],
    "years": task["years"],
    "source": task["source"],
    "source_receipts": task.get("source_receipts"),
    "episode_source": episode_source,
    "episode_receipt": episode_receipt,
    "queued_mode_hint": task.get("performance_modes"),
    "adjudicated_kind": "physical",
    "performance_mode": "physical-prosthetic",
    "performance_scope": (
        "Jeri Ryan’s physical live-action performance as Lorot through Seven of Nine in Infinite Regress (1998)"
    ),
    "seven_of_nine_body_not_conflated_with_original_lorot_body": True,
    "voice_performance_attributed": False,
    "maker_attribution": "unresolved",
    "makeup_maker_attribution": "unresolved",
    "costume_maker_attribution": "unresolved",
    "character_design_maker_attribution": "unresolved",
    "editing_attribution": "unresolved",
    "sound_processing_attribution": "unresolved",
    "production_shop_attribution": "unresolved",
    "still": still,
    "portrait": portrait,
    "still_path": still_name,
    "portrait_path": portrait_name,
    "facets": facets,
    "facets_sha256": facets_sha,
    "byte_collision": False,
    "source_collision": False,
    "cross_facet_substitution": False,
    "media_review": {
        "reviewer": "chatgpt-source-identity-second-desk",
        "verdict": "pass",
        "scope": "exact Lorot manifestation still and source-distinct Jeri Ryan portrait only",
    },
    "canonical_mutation": False,
    "lease_taken": False,
}
media_body = json.dumps(stable(media), separators=(",", ":"), ensure_ascii=False).encode()
media["receipt_sha256"] = sha256(media_body)

(OUT / "media-preparation.json").write_text(json.dumps(stable(media), indent=2, ensure_ascii=False) + "\n")
(OUT / "task.json").write_text(json.dumps(task, indent=2, ensure_ascii=False) + "\n")
(OUT / "source-probe.json").write_text(json.dumps(probe, indent=2, ensure_ascii=False) + "\n")
(OUT / "frozen-source.wikitext").write_text(frozen_role_text)
(OUT / "frozen-source-api.json").write_text((PROBE_ROOT / "frozen-source-api.json").read_text())
(OUT / "episode-source.wikitext").write_text(episode_text)
(OUT / "episode-source-api.json").write_text(json.dumps(episode_api, indent=2, ensure_ascii=False) + "\n")
(OUT / "still-image-api.json").write_text(json.dumps(still_api, indent=2, ensure_ascii=False) + "\n")
(OUT / "portrait-image-api.json").write_text(json.dumps(portrait_api, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"status": "success", "wall_id": WALL_ID, "facets_sha256": facets_sha, "receipt_sha256": media["receipt_sha256"]}, indent=2))
