#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os

OUT = Path(os.environ["OUT"])


def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value):
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def verify_identity(path: Path, field: str, omitted=()):
    payload = json.loads(path.read_text(encoding="utf-8"))
    expected = payload.get(field)
    if not isinstance(expected, str):
        raise SystemExit(f"{path.name} lacks {field}")
    body = dict(payload)
    body.pop(field, None)
    for key in omitted:
        body.pop(key, None)
    actual = hashlib.sha256(pretty(body).encode()).hexdigest()
    if actual != expected:
        raise SystemExit(f"{path.name} identity mismatch: {actual} != {expected}")
    return payload


claim = verify_identity(OUT / "claim-receipt.json", "receipt_sha256")
source_review = verify_identity(
    OUT / "source-review-v2.json", "review_sha256", ("artifact",)
)
media = verify_identity(
    OUT / "media-receipt.json", "receipt_sha256", ("artifact",)
)
media_review = verify_identity(
    OUT / "media-review.json", "review_sha256", ("artifact",)
)

expected_queue = {
    "total": 2228,
    "queued": 1795,
    "resolved": 430,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 1,
}
expected_titles = [
    "Something Borrowed, Something Green",
    "The Inner Fight",
    "Old Friends, New Planets",
]
expected_episodes = [
    {
        "title": "Something Borrowed, Something Green",
        "first_aired": "21 September 2023",
    },
    {
        "title": "The Inner Fight",
        "first_aired": "26 October 2023",
    },
    {
        "title": "Old Friends, New Planets",
        "first_aired": "2 November 2023",
    },
]

if claim["receipt_sha256"] != os.environ["CLAIM_RECEIPT_SHA"]:
    raise SystemExit("Risik claim identity drifted")
if claim["task"] != {
    "attempts": 1,
    "character": os.environ["EXPECTED_CHARACTER"],
    "id": os.environ["TASK_ID"],
    "performance_modes": ["voice-animation"],
    "performer": os.environ["EXPECTED_PERFORMER"],
    "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
    "status": "leased",
}:
    raise SystemExit(f"Risik claim task drifted: {claim['task']}")
if claim["lease"]["id"] != os.environ["EXPECTED_LEASE"]:
    raise SystemExit("Risik claim lease drifted")
if claim["queue"]["after"] != expected_queue:
    raise SystemExit("Risik claim queue drifted")

if source_review["review_sha256"] != os.environ["SOURCE_REVIEW_SHA"]:
    raise SystemExit("corrective source-review identity drifted")
if source_review["transaction"] != "STAR-TREK-RISIK-SOURCE-REVIEW-V2":
    raise SystemExit("corrective source-review transaction drifted")
if source_review["verdict"] != "pass":
    raise SystemExit("corrective source review does not pass")
if source_review["claim"]["lease_id"] != os.environ["EXPECTED_LEASE"]:
    raise SystemExit("corrective source-review lease drifted")
if source_review["task"]["id"] != os.environ["TASK_ID"]:
    raise SystemExit("corrective source-review task drifted")
adjudication = source_review["adjudication"]
source_episodes = [
    {"title": row["title"], "first_aired": row["first_aired"]}
    for row in adjudication["confirmed_voiced_episodes"]
]
if source_episodes != expected_episodes:
    raise SystemExit(f"corrective source-review episode set drifted: {source_episodes}")
if (
    adjudication["adjudicated_kind"] != "voice"
    or adjudication["performance_mode"] != "voice-animation"
    or adjudication["series"] != "Star Trek: Lower Decks"
    or adjudication["primary_production"] != expected_titles[0]
    or adjudication["primary_year"] != "2023"
):
    raise SystemExit("corrective source-review product boundary drifted")
for field in (
    "physical_performance_attributed",
    "prosthetic_performance_attributed",
    "animation_labor_attributed",
    "character_design_attributed",
    "voice_direction_attributed",
    "vocal_processing_attributed",
    "sound_attributed",
    "transformation_measured",
):
    if adjudication[field] is not False:
        raise SystemExit(f"corrective source review promoted unsupported {field}")
if adjudication["maker_attribution"] != "unresolved":
    raise SystemExit("corrective source review promoted maker attribution")

if media["receipt_sha256"] != os.environ["MEDIA_RECEIPT_SHA"]:
    raise SystemExit("Risik media receipt identity drifted")
if media["transaction"] != "STAR-TREK-RISIK-MEDIA-V1":
    raise SystemExit("Risik media transaction drifted")
if media["status"] != "media-prepared-pending-independent-review":
    raise SystemExit("Risik media status drifted")
if media["task"]["id"] != os.environ["TASK_ID"]:
    raise SystemExit("Risik media task drifted")
if media["task"]["lease_id"] != os.environ["EXPECTED_LEASE"]:
    raise SystemExit("Risik media lease drifted")
if media["task"]["wall_id_reserved"] != os.environ["WALL_ID"]:
    raise SystemExit("Risik wall reservation drifted")
if media["queue"] != expected_queue:
    raise SystemExit("Risik media queue drifted")
media_adj = media["adjudication"]
if media_adj["reviewed_episodes"] != expected_titles:
    raise SystemExit("Risik media episode set differs from corrective source review")
if (
    media_adj["selected_card_production"] != expected_titles[0]
    or media_adj["series"] != "Star Trek: Lower Decks"
    or media_adj["year"] != "2023"
    or media_adj["adjudicated_kind"] != "voice"
    or media_adj["performance_mode"] != "voice-animation"
):
    raise SystemExit("Risik media product boundary drifted")
if media["still"]["sha256"] != os.environ["STILL_SHA"]:
    raise SystemExit("Risik still identity drifted")
if media["portrait"]["sha256"] != os.environ["PORTRAIT_SHA"]:
    raise SystemExit("Risik portrait identity drifted")
if media["source_review"]["commit"] != os.environ["OLD_SOURCE_REVIEW_COMMIT"]:
    raise SystemExit("Risik media historical source-review pointer drifted")
if media["source_review"]["review_sha256"] != os.environ["OLD_SOURCE_REVIEW_SHA"]:
    raise SystemExit("Risik media historical source-review identity drifted")

if media_review["review_sha256"] != os.environ["MEDIA_REVIEW_SHA"]:
    raise SystemExit("Risik media-review identity drifted")
if media_review["transaction"] != "STAR-TREK-RISIK-MEDIA-REVIEW-V1":
    raise SystemExit("Risik media-review transaction drifted")
if media_review["verdict"] != "pass":
    raise SystemExit("Risik media review does not pass")
if media_review["candidate_staging_admissible"] is not True:
    raise SystemExit("Risik media review does not admit staging")
if media_review["task"]["id"] != os.environ["TASK_ID"]:
    raise SystemExit("Risik media-review task drifted")
if media_review["task"]["lease_id"] != os.environ["EXPECTED_LEASE"]:
    raise SystemExit("Risik media-review lease drifted")
if media_review["production"]["reviewed_episodes"] != expected_titles:
    raise SystemExit("Risik media-review episode set differs from corrective review")
if (
    media_review["production"]["selected_card_production"] != expected_titles[0]
    or media_review["production"]["series"] != "Star Trek: Lower Decks"
    or media_review["production"]["year"] != "2023"
):
    raise SystemExit("Risik media-review product boundary drifted")
if media_review["still"]["sha256"] != os.environ["STILL_SHA"]:
    raise SystemExit("Risik media-review still drifted")
if media_review["portrait"]["sha256"] != os.environ["PORTRAIT_SHA"]:
    raise SystemExit("Risik media-review portrait drifted")
if media_review["still"]["item_id"] != os.environ["STILL_ITEM"]:
    raise SystemExit("Risik still item identity drifted")
if media_review["portrait"]["item_id"] != os.environ["PORTRAIT_ITEM"]:
    raise SystemExit("Risik portrait item identity drifted")
if (
    media_review["still"]["identity"]["state"] != "enforced"
    or media_review["still"]["identity"]["value"] != "expected"
    or media_review["still"]["presentation"]["state"] != "enforced"
    or media_review["still"]["presentation"]["value"] != "character-depiction"
    or media_review["portrait"]["identity"]["state"] != "enforced"
    or media_review["portrait"]["identity"]["value"] != "expected"
    or media_review["portrait"]["presentation"]["state"] != "enforced"
    or media_review["portrait"]["presentation"]["value"] != "neutral-human"
):
    raise SystemExit("Risik media-review facet claims drifted")
if media_review["source_review"]["commit"] != os.environ["OLD_SOURCE_REVIEW_COMMIT"]:
    raise SystemExit("Risik media-review historical source pointer drifted")
if media_review["source_review"]["review_sha256"] != os.environ["OLD_SOURCE_REVIEW_SHA"]:
    raise SystemExit("Risik media-review historical source identity drifted")
boundary = media_review["boundary"]
for field in (
    "all_four_media_claims_enforced",
    "byte_distinct",
    "normalization_replay_exact",
    "source_distinct",
):
    if boundary[field] is not True:
        raise SystemExit(f"Risik media-review boundary lost {field}")
for field in (
    "canonical_mutation",
    "lease_mutation",
    "product_staged",
    "waterline_cycle_recorded",
    "cross_facet_substitution",
    "physical_performance_attributed",
    "prosthetic_performance_attributed",
    "animation_labor_attributed",
    "character_design_attributed",
    "voice_direction_attributed",
    "vocal_processing_attributed",
    "sound_attributed",
    "transformation_measured",
):
    if boundary[field] is not False:
        raise SystemExit(f"Risik media review promoted or mutated {field}")
if boundary["maker_attribution"] != "unresolved":
    raise SystemExit("Risik media review promoted maker attribution")

reconciliation = {
    "version": 1,
    "transaction": "STAR-TREK-RISIK-MEDIA-RECONCILIATION-V1",
    "reconciled_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
    "reconciler": "chatgpt-risik-media-reconciliation-v1",
    "verdict": "pass",
    "canonical": {
        "commit": os.environ["EXPECTED_MAIN"],
        "tree": os.environ["EXPECTED_TREE"],
        "message": os.environ["EXPECTED_MESSAGE"],
    },
    "claim": {
        "branch": os.environ["CLAIM_BRANCH"],
        "commit": os.environ["CLAIM_COMMIT"],
        "tree": os.environ["CLAIM_TREE"],
        "receipt_sha256": claim["receipt_sha256"],
        "lease_id": os.environ["EXPECTED_LEASE"],
    },
    "source_review": {
        "branch": os.environ["SOURCE_REVIEW_BRANCH"],
        "commit": os.environ["SOURCE_REVIEW_COMMIT"],
        "tree": os.environ["SOURCE_REVIEW_TREE"],
        "review_sha256": source_review["review_sha256"],
        "verdict": "pass",
    },
    "adjudication": {
        "adjudicated_kind": "voice",
        "performance_mode": "voice-animation",
        "series": "Star Trek: Lower Decks",
        "primary_production": expected_titles[0],
        "year": "2023",
        "confirmed_voiced_episodes": expected_episodes,
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
    "media": {
        "branch": os.environ["MEDIA_BRANCH"],
        "commit": os.environ["MEDIA_COMMIT"],
        "tree": os.environ["MEDIA_TREE"],
        "receipt_sha256": media["receipt_sha256"],
        "artifact": media.get("artifact"),
        "still": {
            "item_id": media_review["still"]["item_id"],
            "sha256": media["still"]["sha256"],
            "source": media_review["still"]["source"],
            "identity": "expected",
            "presentation": "character-depiction",
        },
        "portrait": {
            "item_id": media_review["portrait"]["item_id"],
            "sha256": media["portrait"]["sha256"],
            "source": media_review["portrait"]["source"],
            "identity": "expected",
            "presentation": "neutral-human",
        },
    },
    "media_review": {
        "branch": os.environ["MEDIA_REVIEW_BRANCH"],
        "commit": os.environ["MEDIA_REVIEW_COMMIT"],
        "tree": os.environ["MEDIA_REVIEW_TREE"],
        "review_sha256": media_review["review_sha256"],
        "artifact": media_review.get("artifact"),
        "verdict": "pass",
        "all_four_media_claims_enforced": True,
        "normalization_replay_exact": True,
    },
    "supersession": {
        "historical_source_review_branch": media_review["source_review"]["branch"],
        "historical_source_review_commit": media_review["source_review"]["commit"],
        "historical_source_review_sha256": media_review["source_review"]["review_sha256"],
        "superseded_for_adjudication_identity_by": source_review["review_sha256"],
        "media_bytes_retained": True,
        "media_facet_votes_retained": True,
        "reason": (
            "The corrective v2 source review independently fixes real-world air dates "
            "and binds all three Risik voice appearances. The existing media result and "
            "media review already use the same three-episode performance set, primary "
            "card production, exact bytes, and four enforced facet claims."
        ),
    },
    "task": {
        "id": os.environ["TASK_ID"],
        "performer": os.environ["EXPECTED_PERFORMER"],
        "character": os.environ["EXPECTED_CHARACTER"],
        "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
        "lease_id": os.environ["EXPECTED_LEASE"],
        "wall_id_reserved": os.environ["WALL_ID"],
        "status": "leased",
        "attempts": 1,
    },
    "queue": expected_queue,
    "candidate_staging_admissible": True,
    "boundary": {
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "task_resolved": False,
        "waterline_cycle_recorded": False,
        "pages_deployed": False,
    },
}
body = pretty(reconciliation)
reconciliation["reconciliation_sha256"] = hashlib.sha256(body.encode()).hexdigest()
(OUT / "media-reconciliation.json").write_text(
    pretty(reconciliation), encoding="utf-8"
)
