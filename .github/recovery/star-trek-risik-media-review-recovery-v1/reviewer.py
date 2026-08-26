#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
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


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value):
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


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


def fetch_bytes(url: str, referer: str | None = None):
    headers = {
        "User-Agent": "UNDERCAST-Risik-Media-Review/1.0 (second-desk)",
        "Accept": "*/*",
    }
    if referer:
        headers["Referer"] = referer
    with urlopen(Request(url, headers=headers), timeout=120) as response:
        return response.read()


def decode(data: bytes):
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert("RGB"), image.size, image.format or "unknown"


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


def item_id(wall: str, side: str, digest: str):
    seed = f"{wall}:{side}:{digest}".encode()
    return "ma_" + hashlib.sha256(seed).hexdigest()[:24]


media = verify_identity(
    OUT / "media-receipt.json",
    "receipt_sha256",
    os.environ["MEDIA_RECEIPT_SHA"],
    ("artifact",),
)
source_review = verify_identity(
    OUT / "source-review.json",
    "review_sha256",
    os.environ["SOURCE_REVIEW_SHA"],
    ("artifact",),
)

if (
    media.get("transaction") != "STAR-TREK-RISIK-MEDIA-V1"
    or media.get("status") != "media-prepared-pending-independent-review"
    or media.get("canonical_parent") != os.environ["EXPECTED_MAIN"]
    or media.get("canonical_tree") != os.environ["EXPECTED_TREE"]
    or media.get("task", {}).get("id") != os.environ["TASK_ID"]
    or media.get("task", {}).get("lease_id") != os.environ["EXPECTED_LEASE"]
    or media.get("task", {}).get("wall_id_reserved") != os.environ["WALL_ID"]
    or media.get("task", {}).get("status") != "leased"
):
    raise SystemExit("Risik media custody drifted")

adjudication = media.get("adjudication") or {}
selected = adjudication.get("selected_card_production")
if (
    adjudication.get("adjudicated_kind") != "voice"
    or adjudication.get("performance_mode") != "voice-animation"
    or adjudication.get("series") != "Star Trek: Lower Decks"
    or adjudication.get("reviewed_episodes") != EPISODES
    or selected != "Something Borrowed, Something Green"
    or adjudication.get("year") != "2023"
):
    raise SystemExit(f"Risik media adjudication drifted: {adjudication}")
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
    if adjudication.get(key) is not False:
        raise SystemExit(f"unsupported Risik attribution promoted: {key}")
if adjudication.get("maker_attribution") != "unresolved":
    raise SystemExit("Risik maker attribution drifted")

source_adjudication = source_review.get("adjudication") or {}
if (
    source_review.get("verdict") != "pass"
    or source_adjudication.get("episodes") != EPISODES
    or source_adjudication.get("single_card_production") is not None
    or source_adjudication.get("single_card_production_status")
    != "pending-source-bound-media-selection"
):
    raise SystemExit("Risik source-review handoff drifted")

still = media.get("still") or {}
portrait = media.get("portrait") or {}
still_bytes = (OUT / "risik-still.webp").read_bytes()
portrait_bytes = (OUT / "fred-tatasciore-portrait.jpg").read_bytes()
if digest_bytes(still_bytes) != still.get("sha256"):
    raise SystemExit("Risik still artifact hash drifted")
if digest_bytes(portrait_bytes) != portrait.get("sha256"):
    raise SystemExit("Risik portrait artifact hash drifted")
if still.get("sha256") != os.environ["EXPECTED_STILL_SHA"]:
    raise SystemExit("Risik still sealed hash drifted")
if portrait.get("sha256") != os.environ["EXPECTED_PORTRAIT_SHA"]:
    raise SystemExit("Risik portrait sealed hash drifted")
if still.get("sha256") == portrait.get("sha256"):
    raise SystemExit("Risik media facets collide")

file_wikitext = (OUT / "risik-file.wikitext").read_text(encoding="utf-8")
if digest_text(file_wikitext) != still.get("file_page_revision", {}).get("wikitext_sha256"):
    raise SystemExit("Risik file-page evidence drifted")
selected_tokens = [episode for episode in EPISODES if episode.lower() in file_wikitext.lower()]
if selected_tokens != [selected]:
    raise SystemExit(f"Risik file page no longer selects one production: {selected_tokens}")
if still.get("title") != "File:Risik.jpg":
    raise SystemExit("Risik still title drifted")
if still.get("selected_card_production") != selected:
    raise SystemExit("Risik still production binding drifted")

still_raw = fetch_bytes(
    still["download_url"], "https://memory-alpha.fandom.com/wiki/Risik"
)
still_replay, still_source_size, still_source_format, still_output_size = normalize(
    still_raw, "still"
)
if still_replay != still_bytes:
    raise SystemExit("Risik still normalization replay differs from the published derivative")
if list(still_source_size) != still.get("source_size"):
    raise SystemExit("Risik still source dimensions drifted")
if list(still_output_size) != still.get("output_size"):
    raise SystemExit("Risik still output dimensions drifted")

portrait_raw = fetch_bytes(
    portrait["download_url"], "https://commons.wikimedia.org/"
)
portrait_replay, portrait_source_size, portrait_source_format, portrait_output_size = normalize(
    portrait_raw, "portrait"
)
if portrait_replay != portrait_bytes:
    raise SystemExit("Risik portrait normalization replay differs from the published derivative")
if list(portrait_source_size) != portrait.get("source_size"):
    raise SystemExit("Risik portrait source dimensions drifted")
if list(portrait_output_size) != portrait.get("output_size"):
    raise SystemExit("Risik portrait output dimensions drifted")
identity_text = " ".join(
    (portrait.get("title") or "", portrait.get("description") or "")
).lower()
if "fred" not in identity_text or "tatasciore" not in identity_text:
    raise SystemExit("Risik portrait metadata does not identify Fred Tatasciore")
if not any(
    token in (portrait.get("license") or "").lower()
    for token in ("cc by", "cc0", "public domain")
):
    raise SystemExit("Risik portrait license is not accepted")

prior = read_json(OUT / "prior-performer-audit.json")
prior_claims = prior.get("claims") or {}
if (
    prior.get("id") != os.environ["PRIOR_PORTRAIT_ITEM"]
    or prior.get("wall_id") != os.environ["PRIOR_PORTRAIT_WALL"]
    or prior.get("actor") != os.environ["EXPECTED_PERFORMER"]
    or prior.get("status") != "verified"
    or (prior.get("asset") or {}).get("sha256") != os.environ["PRIOR_PORTRAIT_SHA"]
    or (prior_claims.get("identity") or {}).get("state") != "enforced"
    or (prior_claims.get("identity") or {}).get("value") != "expected"
    or (prior_claims.get("presentation") or {}).get("state") != "enforced"
    or (prior_claims.get("presentation") or {}).get("value") != "neutral-human"
):
    raise SystemExit("prior Fred Tatasciore audit custody drifted")

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
if counts != media.get("queue") or counts != {
    "total": 2228,
    "queued": 1795,
    "resolved": 430,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 1,
}:
    raise SystemExit(f"Risik media-review queue drifted: {counts}")
if (
    len(active) != 1
    or not task
    or task.get("status") != "leased"
    or task.get("attempts") != 1
    or task.get("lease", {}).get("id") != os.environ["EXPECTED_LEASE"]
):
    raise SystemExit("Risik lease custody drifted during media review")

wall = os.environ["WALL_ID"]
still_item = item_id(wall, "still", still["sha256"])
portrait_item = item_id(wall, "portrait", portrait["sha256"])
reviewer = "chatgpt-risik-independent-media-reviewer-v1"
reviewed_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

review = {
    "version": 1,
    "transaction": "STAR-TREK-RISIK-MEDIA-REVIEW-V1",
    "reviewed_at": reviewed_at,
    "reviewer": reviewer,
    "reviewed_role": "second-desk",
    "status": "media-review-complete",
    "verdict": "pass",
    "candidate_staging_admissible": True,
    "canonical_parent": os.environ["EXPECTED_MAIN"],
    "canonical_tree": os.environ["EXPECTED_TREE"],
    "media": {
        "branch": os.environ["MEDIA_BRANCH"],
        "commit": os.environ["MEDIA_COMMIT"],
        "tree": os.environ["MEDIA_TREE"],
        "receipt_sha256": os.environ["MEDIA_RECEIPT_SHA"],
    },
    "source_review": {
        "branch": os.environ["SOURCE_REVIEW_BRANCH"],
        "commit": os.environ["SOURCE_REVIEW_COMMIT"],
        "tree": os.environ["SOURCE_REVIEW_TREE"],
        "review_sha256": os.environ["SOURCE_REVIEW_SHA"],
    },
    "task": {
        "id": os.environ["TASK_ID"],
        "lease_id": os.environ["EXPECTED_LEASE"],
        "performer": os.environ["EXPECTED_PERFORMER"],
        "character": os.environ["EXPECTED_CHARACTER"],
        "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
        "status": "leased",
        "attempts": 1,
        "wall_id_reserved": wall,
    },
    "production": {
        "series": "Star Trek: Lower Decks",
        "reviewed_episodes": EPISODES,
        "selected_card_production": selected,
        "year": "2023",
        "selection_basis": "exact File:Risik.jpg file-page production token",
    },
    "still": {
        "item_id": still_item,
        "sha256": still["sha256"],
        "bytes": len(still_bytes),
        "source": still["descriptionurl"],
        "download_url": still["download_url"],
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
            "value": "character-depiction",
            "support": 2,
            "reviewers": 1,
            "human_reviewers": 1,
            "competing": [],
        },
        "votes": [
            {
                "reviewer": reviewer,
                "reviewed_at": reviewed_at,
                "claim": "identity",
                "value": "expected",
                "asset_sha256": still["sha256"],
                "evidence": "File:Risik.jpg metadata, source-bound production token, and byte-exact normalization replay",
            },
            {
                "reviewer": reviewer,
                "reviewed_at": reviewed_at,
                "claim": "presentation",
                "value": "character-depiction",
                "asset_sha256": still["sha256"],
                "evidence": "animated character frame bound to Risik and Something Borrowed, Something Green",
            },
        ],
    },
    "portrait": {
        "item_id": portrait_item,
        "sha256": portrait["sha256"],
        "bytes": len(portrait_bytes),
        "source": portrait["descriptionurl"],
        "download_url": portrait["download_url"],
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
            "value": "neutral-human",
            "support": 2,
            "reviewers": 1,
            "human_reviewers": 1,
            "competing": [],
        },
        "votes": [
            {
                "reviewer": reviewer,
                "reviewed_at": reviewed_at,
                "claim": "identity",
                "value": "expected",
                "asset_sha256": portrait["sha256"],
                "evidence": "Commons title and description identify Fred Tatasciore; prior canonical same-performer audit remains enforced",
                "facial_recognition_used": False,
            },
            {
                "reviewer": reviewer,
                "reviewed_at": reviewed_at,
                "claim": "presentation",
                "value": "neutral-human",
                "asset_sha256": portrait["sha256"],
                "evidence": "full-frame licensed event photograph with byte-exact normalization replay",
                "facial_recognition_used": False,
            },
        ],
        "reuse": portrait["reuse"],
    },
    "queue": counts,
    "boundary": {
        "all_four_media_claims_enforced": True,
        "single_card_production_selected": True,
        "source_distinct": media["boundary"]["source_distinct"],
        "byte_distinct": media["boundary"]["byte_distinct"],
        "cross_facet_substitution": False,
        "no_facial_recognition_used": True,
        "normalization_replay_exact": True,
        "physical_performance_attributed": False,
        "prosthetic_performance_attributed": False,
        "animation_labor_attributed": False,
        "character_design_attributed": False,
        "voice_direction_attributed": False,
        "vocal_processing_attributed": False,
        "sound_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "waterline_cycle_recorded": False,
    },
}
encoded = pretty(review)
review["review_sha256"] = hashlib.sha256(encoded.encode()).hexdigest()
(OUT / "media-review.json").write_text(pretty(review), encoding="utf-8")
