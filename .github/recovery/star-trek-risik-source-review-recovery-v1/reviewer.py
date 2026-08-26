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
API = "https://memory-alpha.fandom.com/api.php"

EPISODES = [
    "Something Borrowed, Something Green",
    "The Inner Fight",
    "Old Friends, New Planets",
]
EPISODE_TITLES = [f"{name} (episode)" for name in EPISODES]

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

def verify_identity(path: Path, field: str, expected: str, omitted=()):
    payload = json.loads(path.read_text(encoding="utf-8"))
    identity = payload.get(field)
    body = dict(payload)
    body.pop(field, None)
    for key in omitted:
        body.pop(key, None)
    actual = hashlib.sha256(pretty(body).encode()).hexdigest()
    if identity != expected or actual != identity:
        raise SystemExit(f"{path.name} identity drifted: {identity} / {actual}")
    return payload

def fetch_json(params):
    url = API + "?" + urlencode(params)
    request = Request(
        url,
        headers={
            "User-Agent": "UNDERCAST-Risik-Source-Review/1.0 (second-desk)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=120) as response:
        return json.loads(response.read())

def extract_airdate(wikitext: str, rendered: str):
    patterns = [
        r"^\|\s*(?:date|airdate|first[_ ]aired)\s*=\s*([^\n]+?)\s*$",
        r"\b(?:first aired|originally aired|aired)\s+(?:on\s+)?([A-Z][a-z]+ \d{1,2}, 2023)\b",
        r"\b(\d{1,2} [A-Z][a-z]+ 2023)\b",
    ]
    for source in (wikitext, rendered):
        for pattern in patterns:
            match = re.search(pattern, source, flags=re.I | re.M)
            if match:
                value = html.unescape(re.sub(r"<[^>]+>", "", match.group(1))).strip()
                value = re.sub(r"\{\{[^{}]*\}\}", "", value).strip()
                if value:
                    return value
    return None

source_path = OUT / "source-probe.json"
role_path = OUT / "risik-source.wikitext"
source = verify_identity(
    source_path,
    "receipt_sha256",
    os.environ["SOURCE_RECEIPT_SHA"],
    ("artifact",),
)
role_wikitext = role_path.read_text(encoding="utf-8")
if digest_text(role_wikitext) != source["source_revision"]["content_sha256"]:
    raise SystemExit("frozen Risik role bytes drifted")

required_role_tokens = [
    "|actor         = [[Fred Tatasciore]]",
    "{{bginfo|Risik was voiced by [[Fred Tatasciore]].}}",
]
for token in required_role_tokens:
    if token not in role_wikitext:
        raise SystemExit(f"Risik role source token missing: {token}")
for episode in EPISODES:
    if episode not in role_wikitext:
        raise SystemExit(f"Risik episode binding missing: {episode}")

api_doc = fetch_json(
    {
        "action": "query",
        "prop": "revisions|pageimages|extracts",
        "titles": "|".join(EPISODE_TITLES),
        "rvprop": "ids|timestamp|content",
        "rvslots": "main",
        "piprop": "original",
        "explaintext": "1",
        "format": "json",
        "formatversion": "2",
    }
)
(OUT / "episode-api.json").write_text(pretty(api_doc), encoding="utf-8")
pages = (api_doc.get("query") or {}).get("pages") or []
by_title = {page.get("title"): page for page in pages}
if set(by_title) != set(EPISODE_TITLES):
    raise SystemExit(f"Risik production page set drifted: {sorted(by_title)}")

production_revisions = []
for index, title in enumerate(EPISODE_TITLES, 1):
    page = by_title[title]
    revisions = page.get("revisions") or []
    if len(revisions) != 1:
        raise SystemExit(f"{title} revision cardinality drifted: {len(revisions)}")
    revision = revisions[0]
    slot = (revision.get("slots") or {}).get("main") or {}
    wikitext = slot.get("content")
    if not isinstance(wikitext, str):
        raise SystemExit(f"{title} wikitext absent")
    rendered = page.get("extract") or ""
    if "lower decks" not in (wikitext + "\n" + rendered).lower():
        raise SystemExit(f"{title} does not bind Star Trek: Lower Decks")
    if "2023" not in (wikitext + "\n" + rendered):
        raise SystemExit(f"{title} does not expose the 2023 production year")
    episode_name = title.removesuffix(" (episode)")
    if episode_name not in role_wikitext:
        raise SystemExit(f"{title} is not bound by the frozen role source")

    (OUT / f"episode-{index}.wikitext").write_text(wikitext, encoding="utf-8")
    (OUT / f"episode-{index}.txt").write_text(rendered, encoding="utf-8")
    production_revisions.append(
        {
            "title": title,
            "episode": episode_name,
            "pageid": page.get("pageid"),
            "revision": revision.get("revid"),
            "parentid": revision.get("parentid"),
            "timestamp": revision.get("timestamp"),
            "content_sha256": digest_text(wikitext),
            "rendered_extract_sha256": digest_text(rendered),
            "page_image": page.get("original"),
            "first_aired": extract_airdate(wikitext, rendered),
            "series_verified": "Star Trek: Lower Decks",
            "year_verified": "2023",
        }
    )

rendered_review = {
    "version": 1,
    "transaction": "STAR-TREK-RISIK-RENDERED-SOURCE-REVIEW-V1",
    "reviewed_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    "role": {
        "title": "Risik",
        "revision": source["source_revision"]["revision"],
        "content_sha256": source["source_revision"]["content_sha256"],
        "rendered_extract_sha256": source["source_revision"]["rendered_extract_sha256"],
        "voice_credit_verified": True,
        "performer_verified": "Fred Tatasciore",
        "episode_bindings_verified": EPISODES,
    },
    "productions": production_revisions,
}
(OUT / "rendered-source-review.json").write_text(
    pretty(rendered_review), encoding="utf-8"
)

review = {
    "version": 1,
    "transaction": "STAR-TREK-RISIK-SOURCE-REVIEW-V1",
    "reviewed_at": rendered_review["reviewed_at"],
    "reviewer": "chatgpt-risik-independent-source-reviewer-v1",
    "reviewed_role": "second-desk",
    "verdict": "pass",
    "canonical_parent": os.environ["EXPECTED_MAIN"],
    "canonical_tree": os.environ["EXPECTED_TREE"],
    "source": {
        "branch": os.environ["SOURCE_BRANCH"],
        "commit": os.environ["SOURCE_COMMIT"],
        "tree": os.environ["SOURCE_TREE"],
        "receipt_sha256": os.environ["SOURCE_RECEIPT_SHA"],
        "role_revision": source["source_revision"],
        "production_revisions": production_revisions,
    },
    "claim": source["claim"],
    "task": {
        "id": os.environ["TASK_ID"],
        "lease_id": os.environ["EXPECTED_LEASE"],
        "performer": os.environ["EXPECTED_PERFORMER"],
        "character": os.environ["EXPECTED_CHARACTER"],
        "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
        "status": "leased",
        "attempts": 1,
    },
    "adjudication": {
        "adjudicated_kind": "voice",
        "performance_mode": "voice-animation",
        "performance_scope": (
            "Fred Tatasciore's animated voice performance as the Orion Risik "
            "in three Star Trek: Lower Decks episodes from 2023."
        ),
        "series": "Star Trek: Lower Decks",
        "episodes": EPISODES,
        "year": "2023",
        "single_card_production": None,
        "single_card_production_status": "pending-source-bound-media-selection",
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
    "media_boundary": {
        "character_page_image": source["source_revision"].get("page_image"),
        "still_status": "pending-source-bound-media-review",
        "portrait_status": "pending-independent-performer-media-review",
        "cross_facet_substitution": False,
        "single_card_production_selection_pending": True,
    },
    "queue": source["queue"],
    "rendered_review": rendered_review,
    "boundary": {
        "source_revision_frozen": True,
        "production_revisions_frozen": True,
        "rendered_revision_frozen": True,
        "independent_source_review_complete": True,
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "media_review_complete": False,
        "waterline_cycle_recorded": False,
    },
}
encoded = pretty(review)
review["review_sha256"] = hashlib.sha256(encoded.encode()).hexdigest()
(OUT / "source-review.json").write_text(pretty(review), encoding="utf-8")
