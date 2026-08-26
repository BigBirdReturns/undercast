#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import hashlib
import html
import json
import os
import re

OUT = Path(os.environ["OUT"])
OUT.mkdir(parents=True, exist_ok=True)

SOURCE_URL = "https://memory-alpha.fandom.com/wiki/Risik"
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

def fetch_json(params):
    url = API + "?" + urlencode(params)
    req = Request(
        url,
        headers={
            "User-Agent": "UNDERCAST-Risik-Source/1.0 (source-freeze)",
            "Accept": "application/json",
        },
    )
    with urlopen(req, timeout=120) as response:
        return json.loads(response.read())

params = {
    "action": "query",
    "prop": "revisions|pageimages|extracts",
    "revids": os.environ["EXPECTED_REVISION"],
    "rvprop": "ids|timestamp|content",
    "rvslots": "main",
    "piprop": "original",
    "explaintext": "1",
    "format": "json",
    "formatversion": "2",
}
api_doc = fetch_json(params)
(OUT / "risik-api.json").write_text(pretty(api_doc), encoding="utf-8")
pages = (api_doc.get("query") or {}).get("pages") or []
if len(pages) != 1:
    raise SystemExit(f"Risik page cardinality drifted: {len(pages)}")
page = pages[0]
revisions = page.get("revisions") or []
if len(revisions) != 1:
    raise SystemExit(f"Risik revision cardinality drifted: {len(revisions)}")
revision = revisions[0]
slot = (revision.get("slots") or {}).get("main") or {}
wikitext = slot.get("content")
if not isinstance(wikitext, str):
    raise SystemExit("Risik wikitext is absent")
(OUT / "risik-source.wikitext").write_text(wikitext, encoding="utf-8")
extract = page.get("extract") or ""
(OUT / "risik-extract.txt").write_text(extract, encoding="utf-8")

expected = {
    "pageid": int(os.environ["EXPECTED_PAGEID"]),
    "revision": int(os.environ["EXPECTED_REVISION"]),
    "timestamp": os.environ["EXPECTED_TIMESTAMP"],
    "content_sha256": os.environ["EXPECTED_CONTENT_SHA"],
}
actual = {
    "pageid": page.get("pageid"),
    "revision": revision.get("revid"),
    "timestamp": revision.get("timestamp"),
    "content_sha256": digest_text(wikitext),
}
if page.get("title") != "Risik":
    raise SystemExit(f"Risik title drifted: {page.get('title')}")
if actual != expected:
    raise SystemExit(f"Risik source revision drifted: {actual} != {expected}")

lower = (wikitext + "\n" + extract).lower()
performer_markers = [
    pattern for pattern in (
        r"\bfred\s+tatasciore\b",
        r"\btatasciore\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
voice_markers = [
    pattern for pattern in (
        r"\bvoiced\b",
        r"\bvoice\b",
        r"\bvoice actor\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
animation_markers = [
    pattern for pattern in (
        r"\banimated\b",
        r"\blower decks\b",
        r"\bprodigy\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
physical_markers = [
    pattern for pattern in (
        r"\bportrayed by\b",
        r"\bplayed by\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
prosthetic_markers = [
    pattern for pattern in (
        r"\bprosthetic\b",
        r"\bmakeup\b",
    )
    if re.search(pattern, lower, flags=re.I)
]
if not performer_markers:
    raise SystemExit("Risik source does not identify Fred Tatasciore")

claim = json.loads((OUT / "claim-receipt.json").read_text(encoding="utf-8"))
task_state = json.loads((OUT / "claim-task-state.json").read_text(encoding="utf-8"))

body = {
    "version": 1,
    "transaction": "STAR-TREK-RISIK-SOURCE-PROBE-V1",
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
        "performance_modes": ["voice-animation"],
        "status": "leased",
        "attempts": 1,
        "source": SOURCE_URL,
    },
    "source_revision": {
        "source": SOURCE_URL,
        "title": page["title"],
        "pageid": actual["pageid"],
        "revision": actual["revision"],
        "parentid": revision.get("parentid"),
        "timestamp": actual["timestamp"],
        "content_sha256": actual["content_sha256"],
        "rendered_extract_sha256": digest_text(extract),
        "page_image": page.get("original"),
    },
    "attribution_markers": {
        "performer": performer_markers,
        "voice": voice_markers,
        "animation": animation_markers,
        "physical": physical_markers,
        "prosthetic": prosthetic_markers,
    },
    "provisional_adjudication": {
        "queued_mode_hint": ["voice-animation"],
        "adjudicated_kind": None,
        "performance_mode": "pending-independent-review",
        "production": None,
        "episode": None,
        "year": None,
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
