#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import hashlib
import json
import os
import re

OUT = Path(os.environ["OUT"])
OUT.mkdir(parents=True, exist_ok=True)

SOURCE_URL = "https://memory-alpha.fandom.com/wiki/Henoch"
API = "https://memory-alpha.fandom.com/api.php"


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value):
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def digest_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def fetch_json(params, label):
    url = API + "?" + urlencode(params)
    req = Request(
        url,
        headers={
            "User-Agent": "UNDERCAST-Henoch-Source/1.0 (source-freeze)",
            "Accept": "application/json",
        },
    )
    with urlopen(req, timeout=120) as response:
        raw = response.read()
    document = json.loads(raw)
    (OUT / f"{label}.json").write_text(pretty(document), encoding="utf-8")
    return url, document


def one_page(document, label):
    pages = (document.get("query") or {}).get("pages") or []
    if len(pages) != 1:
        raise SystemExit(f"{label} page cardinality drifted: {len(pages)}")
    page = pages[0]
    if page.get("missing") is not None:
        raise SystemExit(f"{label} page is missing")
    return page


def one_revision(page, label):
    revisions = page.get("revisions") or []
    if len(revisions) != 1:
        raise SystemExit(f"{label} revision cardinality drifted: {len(revisions)}")
    revision = revisions[0]
    slot = (revision.get("slots") or {}).get("main") or {}
    wikitext = slot.get("content")
    if not isinstance(wikitext, str):
        raise SystemExit(f"{label} wikitext is absent")
    return revision, wikitext


discovery_params = {
    "action": "query",
    "prop": "revisions|pageimages|extracts",
    "titles": "Henoch",
    "redirects": "1",
    "rvprop": "ids|timestamp|content",
    "rvslots": "main",
    "rvlimit": "1",
    "piprop": "original|name",
    "explaintext": "1",
    "format": "json",
    "formatversion": "2",
}
discovery_request, discovery_doc = fetch_json(discovery_params, "henoch-discovery-api")
discovery_page = one_page(discovery_doc, "Henoch discovery")
discovery_revision, discovery_wikitext = one_revision(discovery_page, "Henoch discovery")

revision_id = discovery_revision.get("revid")
if not isinstance(revision_id, int) or revision_id <= 0:
    raise SystemExit(f"Henoch discovery revision is invalid: {revision_id}")

frozen_params = {
    "action": "query",
    "prop": "revisions|pageimages|extracts",
    "revids": str(revision_id),
    "rvprop": "ids|timestamp|content",
    "rvslots": "main",
    "piprop": "original|name",
    "explaintext": "1",
    "format": "json",
    "formatversion": "2",
}
frozen_request, frozen_doc = fetch_json(frozen_params, "henoch-api")
page = one_page(frozen_doc, "Henoch frozen")
revision, wikitext = one_revision(page, "Henoch frozen")
extract = page.get("extract") or ""

(OUT / "henoch-source.wikitext").write_text(wikitext, encoding="utf-8")
(OUT / "henoch-extract.txt").write_text(extract, encoding="utf-8")

if discovery_page.get("title") != "Henoch" or page.get("title") != "Henoch":
    raise SystemExit(
        f"Henoch title drifted: {discovery_page.get('title')} / {page.get('title')}"
    )

discovery_identity = {
    "pageid": discovery_page.get("pageid"),
    "revision": discovery_revision.get("revid"),
    "parentid": discovery_revision.get("parentid"),
    "timestamp": discovery_revision.get("timestamp"),
    "content_sha256": digest_text(discovery_wikitext),
}
frozen_identity = {
    "pageid": page.get("pageid"),
    "revision": revision.get("revid"),
    "parentid": revision.get("parentid"),
    "timestamp": revision.get("timestamp"),
    "content_sha256": digest_text(wikitext),
}
if discovery_identity != frozen_identity:
    raise SystemExit(
        f"Henoch discovery/frozen revision mismatch: "
        f"{discovery_identity} != {frozen_identity}"
    )

lower = (wikitext + "\n" + extract).lower()
performer_markers = [
    pattern
    for pattern in (
        r"\bleonard\s+nimoy\b",
        r"\bnimoy\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
physical_markers = [
    pattern
    for pattern in (
        r"\bplayed by\b",
        r"\bportrayed by\b",
        r"\bbody of spock\b",
        r"\bspock(?:'s|’s) body\b",
        r"\bin spock(?:'s|’s) body\b",
        r"\binhabited\b",
        r"\bpossess(?:ed|ing|ion)?\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
prosthetic_markers = [
    pattern
    for pattern in (
        r"\bprosthetic\b",
        r"\bmakeup\b",
        r"\bvulcan\b",
        r"\bspock\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
episode_markers = [
    pattern
    for pattern in (
        r"\breturn to tomorrow\b",
        r"\b2268\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
identity_markers = [
    pattern
    for pattern in (
        r"\bhenoch\b",
        r"\bsargon\b",
        r"\bthalassa\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
if not performer_markers:
    raise SystemExit("Henoch source does not identify Leonard Nimoy")
if not identity_markers:
    raise SystemExit("Henoch source does not identify Henoch")

claim = json.loads((OUT / "claim-receipt.json").read_text(encoding="utf-8"))
task_state = json.loads((OUT / "claim-task-state.json").read_text(encoding="utf-8"))

body = {
    "version": 1,
    "transaction": "STAR-TREK-HENOCH-SOURCE-PROBE-V1",
    "generated_at": datetime.now(timezone.utc)
    .replace(microsecond=0)
    .isoformat()
    .replace("+00:00", "Z"),
    "status": "source-frozen-pending-independent-review",
    "canonical_parent": os.environ["EXPECTED_MAIN"],
    "canonical_tree": os.environ["EXPECTED_TREE"],
    "claim": {
        "branch": os.environ["CLAIM_BRANCH"],
        "commit": os.environ["CLAIM_COMMIT"],
        "tree": os.environ["CLAIM_TREE"],
        "receipt_sha256": os.environ["CLAIM_RECEIPT_SHA"],
        "lease_id": os.environ["EXPECTED_LEASE"],
    },
    "task": {
        "id": os.environ["TASK_ID"],
        "performer": os.environ["EXPECTED_PERFORMER"],
        "character": os.environ["EXPECTED_CHARACTER"],
        "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
        "performance_modes": ["physical-prosthetic"],
        "status": "leased",
        "attempts": 1,
        "source": SOURCE_URL,
    },
    "source_discovery": {
        "request": discovery_request,
        "title": discovery_page["title"],
        **discovery_identity,
    },
    "source_revision": {
        "request": frozen_request,
        "source": SOURCE_URL,
        "title": page["title"],
        **frozen_identity,
        "rendered_extract_sha256": digest_text(extract),
        "page_image": page.get("original"),
    },
    "attribution_markers": {
        "identity": identity_markers,
        "performer": performer_markers,
        "physical": physical_markers,
        "prosthetic_or_host": prosthetic_markers,
        "episode": episode_markers,
    },
    "provisional_adjudication": {
        "queued_mode_hint": ["physical-prosthetic"],
        "adjudicated_kind": None,
        "performance_mode": "pending-independent-review",
        "production": None,
        "episode": None,
        "year": None,
        "embodied_character": None,
        "host_body": None,
        "maker_attribution": "unresolved",
        "physical_performance_attributed": False,
        "prosthetic_performance_attributed": False,
        "animation_labor_attributed": False,
        "character_design_attributed": False,
        "voice_direction_attributed": False,
        "vocal_processing_attributed": False,
        "sound_attributed": False,
        "transformation_measured": False,
    },
    "queue": task_state["counts"],
    "boundary": {
        "source_revision_frozen": True,
        "discovery_and_exact_revision_agree": True,
        "independent_source_review_complete": False,
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "media_review_complete": False,
        "waterline_cycle_recorded": False,
    },
}
encoded = pretty(body)
body["receipt_sha256"] = hashlib.sha256(encoded.encode()).hexdigest()
(OUT / "source-probe.json").write_text(pretty(body), encoding="utf-8")
