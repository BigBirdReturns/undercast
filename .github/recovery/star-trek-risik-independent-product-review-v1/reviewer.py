#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
import hashlib
import json
import os
import sys

OUT = Path(os.environ["OUT"])

EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_MAIN_TREE = os.environ["EXPECTED_MAIN_TREE"]
CLAIM_COMMIT = os.environ["CLAIM_COMMIT"]
CANDIDATE_COMMIT = os.environ["CANDIDATE_COMMIT"]
CANDIDATE_TREE = os.environ["CANDIDATE_TREE"]
CANDIDATE_MESSAGE = os.environ["CANDIDATE_MESSAGE"]
CANDIDATE_RECEIPT_SHA = os.environ["CANDIDATE_RECEIPT_SHA"]
STAGE_RESULT_COMMIT = os.environ["STAGE_RESULT_COMMIT"]
STAGE_RESULT_TREE = os.environ["STAGE_RESULT_TREE"]
STAGE_ARTIFACT_ID = int(os.environ["STAGE_ARTIFACT_ID"])
STAGE_ARTIFACT_DIGEST = os.environ["STAGE_ARTIFACT_DIGEST"]

TASK_ID = os.environ["TASK_ID"]
PERFORMER = os.environ["EXPECTED_PERFORMER"]
CHARACTER = os.environ["EXPECTED_CHARACTER"]
FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
LEASE_ID = os.environ["EXPECTED_LEASE"]
WALL_ID = os.environ["WALL_ID"]

SOURCE_REVIEW_COMMIT = os.environ["SOURCE_REVIEW_COMMIT"]
SOURCE_REVIEW_TREE = os.environ["SOURCE_REVIEW_TREE"]
SOURCE_REVIEW_SHA = os.environ["SOURCE_REVIEW_SHA"]
RECONCILIATION_COMMIT = os.environ["RECONCILIATION_COMMIT"]
RECONCILIATION_TREE = os.environ["RECONCILIATION_TREE"]
RECONCILIATION_SHA = os.environ["RECONCILIATION_SHA"]
MEDIA_COMMIT = os.environ["MEDIA_COMMIT"]
MEDIA_TREE = os.environ["MEDIA_TREE"]
MEDIA_RECEIPT_SHA = os.environ["MEDIA_RECEIPT_SHA"]
MEDIA_REVIEW_COMMIT = os.environ["MEDIA_REVIEW_COMMIT"]
MEDIA_REVIEW_TREE = os.environ["MEDIA_REVIEW_TREE"]
MEDIA_REVIEW_SHA = os.environ["MEDIA_REVIEW_SHA"]

STILL_SHA = os.environ["EXPECTED_STILL_SHA"]
PORTRAIT_SHA = os.environ["EXPECTED_PORTRAIT_SHA"]
STILL_ITEM_ID = os.environ["STILL_ITEM_ID"]
PORTRAIT_ITEM_ID = os.environ["PORTRAIT_ITEM_ID"]

EXPECTED_QUEUE = {
    "total": 2228,
    "queued": 1795,
    "resolved": 431,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 0,
}
EXPECTED_EPISODES = [
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


def stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def pretty(value: Any) -> str:
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"


def stable_hash(value: Any) -> str:
    return hashlib.sha256(pretty(value).encode()).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(pretty(value), encoding="utf-8")


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def exact_text(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def verify_identity(
    path: Path,
    field: str,
    omit_variants: Iterable[tuple[str, ...]] = ((), ("artifact",)),
) -> tuple[dict[str, Any], tuple[str, ...]]:
    payload = read_json(path)
    expected = payload.get(field)
    if not isinstance(expected, str):
        raise SystemExit(f"{path.name} lacks {field}")
    for omitted in omit_variants:
        body = dict(payload)
        body.pop(field, None)
        for key in omitted:
            body.pop(key, None)
        if stable_hash(body) == expected:
            return payload, omitted
    raise SystemExit(f"{path.name} no longer reproduces {field}={expected}")


def collection_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict) and isinstance(value.get("items"), list):
        return [row for row in value["items"] if isinstance(row, dict)]
    return []


def asset_src(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        src = value.get("src")
        return src if isinstance(src, str) else None
    return None


def contains_pair(value: Any, key: str, expected: Any) -> bool:
    if isinstance(value, dict):
        if value.get(key) == expected:
            return True
        return any(contains_pair(item, key, expected) for item in value.values())
    if isinstance(value, list):
        return any(contains_pair(item, key, expected) for item in value)
    return False


def queue_counts(jobs: list[dict[str, Any]]) -> dict[str, int]:
    trek = [row for row in jobs if row.get("scope") == "star-trek"]
    active = [
        row
        for row in trek
        if row.get("status") in {"leased", "drafted", "merged"}
    ]
    return {
        "total": len(trek),
        "queued": sum(row.get("status") == "queued" for row in trek),
        "resolved": sum(row.get("status") == "resolved" for row in trek),
        "blocked": sum(row.get("status") == "blocked" for row in trek),
        "rejected": sum(row.get("status") == "rejected" for row in trek),
        "in_flight": len(active),
    }


def inspect() -> None:
    candidate, candidate_omitted = verify_identity(
        Path("data/review/adapter-sdk/star-trek-risik-candidate.json"),
        "receipt_sha256",
        ((),),
    )
    if candidate_omitted:
        raise SystemExit("candidate identity unexpectedly omits fields")
    if candidate["receipt_sha256"] != CANDIDATE_RECEIPT_SHA:
        raise SystemExit("candidate receipt identity drifted")
    if (
        candidate.get("transaction") != "STAR-TREK-RISIK-CANDIDATE-V1"
        or candidate.get("status") != "candidate-ready-for-independent-review"
    ):
        raise SystemExit("candidate transaction boundary drifted")
    if (
        candidate.get("canonical_parent") != EXPECTED_MAIN
        or candidate.get("canonical_tree") != EXPECTED_MAIN_TREE
        or candidate.get("claim_commit") != CLAIM_COMMIT
    ):
        raise SystemExit("candidate canonical or claim custody drifted")

    lineage = {
        "commit": exact_text(OUT / "candidate-commit.txt"),
        "tree": exact_text(OUT / "candidate-tree.txt"),
        "parent": exact_text(OUT / "candidate-parent.txt"),
        "message": exact_text(OUT / "candidate-message.txt"),
    }
    if lineage != {
        "commit": CANDIDATE_COMMIT,
        "tree": CANDIDATE_TREE,
        "parent": CLAIM_COMMIT,
        "message": CANDIDATE_MESSAGE,
    }:
        raise SystemExit(f"candidate Git lineage drifted: {lineage}")

    stage = read_json(OUT / "stage-result.json")
    if stage != {
        "version": 2,
        "transaction": "STAR-TREK-RISIK-STAGE-RESULT-V2",
        "status": "candidate-published-pending-independent-product-review",
        "candidate_branch": "agent/star-trek-risik-candidate-v1",
        "result_branch": "agent/star-trek-risik-stage-result-v2",
        "commit": CANDIDATE_COMMIT,
        "tree": CANDIDATE_TREE,
        "parent": CLAIM_COMMIT,
        "receipt_sha256": CANDIDATE_RECEIPT_SHA,
        "media_reconciliation_sha256": RECONCILIATION_SHA,
        "artifact": {
            "id": STAGE_ARTIFACT_ID,
            "digest": STAGE_ARTIFACT_DIGEST,
        },
        "canonical_mutation": False,
        "independent_product_review_pending": True,
        "waterline_cycle_recorded": False,
        "additional_lease_issued": False,
    }:
        raise SystemExit(f"stage-result custody drifted: {stage}")

    claim, claim_omitted = verify_identity(
        OUT / "claim-receipt.json",
        "receipt_sha256",
        ((), ("artifact",)),
    )
    if (
        claim.get("transaction") != "STAR-TREK-RISIK-CLAIM-V2"
        or claim.get("receipt_sha256")
        != "c83b365b93019b0fe0dfd579cabec2cbd7c8dd4b679fcce547a6e59b5980089d"
        or claim.get("task", {}).get("id") != TASK_ID
        or claim.get("lease", {}).get("id") != LEASE_ID
    ):
        raise SystemExit("claim custody drifted")

    source_review, source_omitted = verify_identity(
        OUT / "source-review.json",
        "review_sha256",
        (("artifact",), ()),
    )
    if (
        source_review.get("transaction") != "STAR-TREK-RISIK-SOURCE-REVIEW-V2"
        or source_review.get("verdict") != "pass"
        or source_review.get("review_sha256") != SOURCE_REVIEW_SHA
        or source_review.get("claim", {}).get("lease_id") != LEASE_ID
    ):
        raise SystemExit("source-review custody drifted")
    adjudication = source_review.get("adjudication") or {}
    if (
        adjudication.get("adjudicated_kind") != "voice"
        or adjudication.get("performance_mode") != "voice-animation"
        or adjudication.get("series") != "Star Trek: Lower Decks"
        or adjudication.get("primary_production")
        != "Something Borrowed, Something Green"
        or adjudication.get("primary_year") != "2023"
        or adjudication.get("confirmed_voiced_episodes") != EXPECTED_EPISODES
    ):
        raise SystemExit(f"source-review adjudication drifted: {adjudication}")

    reconciliation, reconciliation_omitted = verify_identity(
        OUT / "media-reconciliation.json",
        "reconciliation_sha256",
        (("artifact",), ()),
    )
    if (
        reconciliation.get("transaction")
        != "STAR-TREK-RISIK-MEDIA-RECONCILIATION-V1"
        or reconciliation.get("verdict") != "pass"
        or reconciliation.get("candidate_staging_admissible") is not True
        or reconciliation.get("reconciliation_sha256") != RECONCILIATION_SHA
        or reconciliation.get("source_review", {}).get("review_sha256")
        != SOURCE_REVIEW_SHA
        or reconciliation.get("task", {}).get("lease_id") != LEASE_ID
    ):
        raise SystemExit("media reconciliation drifted")

    media_receipt, media_omitted = verify_identity(
        OUT / "media-receipt.json",
        "receipt_sha256",
        (("artifact",), ()),
    )
    if (
        media_receipt.get("transaction") != "STAR-TREK-RISIK-MEDIA-V1"
        or media_receipt.get("receipt_sha256") != MEDIA_RECEIPT_SHA
        or media_receipt.get("task", {}).get("id") != TASK_ID
        or media_receipt.get("task", {}).get("lease_id") != LEASE_ID
        or media_receipt.get("still", {}).get("sha256") != STILL_SHA
        or media_receipt.get("portrait", {}).get("sha256") != PORTRAIT_SHA
    ):
        raise SystemExit("media receipt drifted")

    media_review, media_review_omitted = verify_identity(
        OUT / "media-review.json",
        "review_sha256",
        (("artifact",), ()),
    )
    if (
        media_review.get("transaction") != "STAR-TREK-RISIK-MEDIA-REVIEW-V1"
        or media_review.get("verdict") != "pass"
        or media_review.get("review_sha256") != MEDIA_REVIEW_SHA
        or media_review.get("media", {}).get("receipt_sha256")
        != MEDIA_RECEIPT_SHA
        or media_review.get("candidate_staging_admissible") is not True
        or media_review.get("boundary", {}).get(
            "all_four_media_claims_enforced"
        )
        is not True
    ):
        raise SystemExit("media review drifted")

    task_summary = candidate.get("task") or {}
    if task_summary != {
        "attempts": 1,
        "character": CHARACTER,
        "id": TASK_ID,
        "lease_id": LEASE_ID,
        "performer": PERFORMER,
        "source_fingerprint": FINGERPRINT,
        "status": "resolved",
        "wall_ids": [WALL_ID],
    }:
        raise SystemExit(f"candidate task summary drifted: {task_summary}")
    if candidate.get("queue") != EXPECTED_QUEUE:
        raise SystemExit(f"candidate queue drifted: {candidate.get('queue')}")

    source_summary = candidate.get("source_review") or {}
    if (
        source_summary.get("branch")
        != "agent/star-trek-risik-source-review-result-v2"
        or source_summary.get("commit") != SOURCE_REVIEW_COMMIT
        or source_summary.get("review_sha256") != SOURCE_REVIEW_SHA
        or source_summary.get("verdict") != "pass"
        or source_summary.get("performance_mode") != "voice-animation"
        or source_summary.get("series") != "Star Trek: Lower Decks"
        or source_summary.get("primary_production")
        != "Something Borrowed, Something Green"
        or source_summary.get("year") != "2023"
        or source_summary.get("confirmed_voiced_episodes") != EXPECTED_EPISODES
    ):
        raise SystemExit(f"candidate source summary drifted: {source_summary}")

    media_summary = candidate.get("media") or {}
    if (
        media_summary.get("commit") != MEDIA_COMMIT
        or media_summary.get("receipt_sha256") != MEDIA_RECEIPT_SHA
        or media_summary.get("review_commit") != MEDIA_REVIEW_COMMIT
        or media_summary.get("review_sha256") != MEDIA_REVIEW_SHA
        or media_summary.get("review_verdict") != "pass"
        or media_summary.get("still", {}).get("sha256") != STILL_SHA
        or media_summary.get("portrait", {}).get("sha256") != PORTRAIT_SHA
    ):
        raise SystemExit("candidate media summary drifted")

    reconciliation_summary = candidate.get("media_reconciliation") or {}
    if reconciliation_summary != {
        "artifact": {
            "digest": "df182d1c0fb9d90ad819b05dfeeb1aae5e7f355cb5de3f23540b63670176b854",
            "id": 9633709103,
        },
        "branch": "agent/star-trek-risik-media-reconciliation-result-v1",
        "candidate_staging_admissible": True,
        "commit": RECONCILIATION_COMMIT,
        "reconciliation_sha256": RECONCILIATION_SHA,
        "tree": RECONCILIATION_TREE,
        "verdict": "pass",
    }:
        raise SystemExit("candidate reconciliation summary drifted")

    boundary = candidate.get("boundary") or {}
    expected_boundary = {
        "additional_lease_issued": False,
        "animation_labor_attributed": False,
        "canonical_mutation": False,
        "character_design_attributed": False,
        "cross_facet_substitution": False,
        "independent_product_review_complete": False,
        "maker_attribution": "unresolved",
        "performer_source_reuse_admitted": True,
        "physical_performance_attributed": False,
        "primary_risik_still": True,
        "prosthetic_performance_attributed": False,
        "single_card_production": "Something Borrowed, Something Green",
        "sound_attributed": False,
        "three_voiced_episodes_confirmed": True,
        "transformation_measured": False,
        "vocal_processing_attributed": False,
        "voice_animation": True,
        "voice_direction_attributed": False,
        "waterline_cycle_recorded": False,
    }
    if boundary != expected_boundary:
        raise SystemExit(f"candidate attribution boundary drifted: {boundary}")

    candidate_record = candidate.get("canonical_record") or {}
    expected_record = candidate_record.get("record")
    if not isinstance(expected_record, dict):
        raise SystemExit("candidate canonical record is absent")
    if stable_hash(expected_record) != candidate_record.get("record_sha256"):
        raise SystemExit("candidate record identity drifted")
    records = [
        row
        for row in collection_items(read_json(Path("data/specimens.json")))
        if row.get("id") == WALL_ID
    ]
    if records != [expected_record]:
        raise SystemExit(f"canonical Risik record differs from receipt: {records}")

    expected_record_subset = {
        "actor": PERFORMER,
        "character": CHARACTER,
        "production": "Something Borrowed, Something Green",
        "universe": "Star Trek",
        "years": "2023",
        "designer": "—",
        "transform": 2,
        "kind": "voice",
    }
    for key, value in expected_record_subset.items():
        if expected_record.get(key) != value:
            raise SystemExit(f"Risik record {key} drifted: {expected_record.get(key)}")

    still_path = Path(asset_src(expected_record.get("still")) or "")
    portrait_path = Path(asset_src(expected_record.get("portrait")) or "")
    if still_path.as_posix() != "images/uc-1399-still.webp":
        raise SystemExit(f"Risik still path drifted: {still_path}")
    if portrait_path.as_posix() != "images/uc-1399-portrait.jpg":
        raise SystemExit(f"Risik portrait path drifted: {portrait_path}")
    if file_hash(still_path) != STILL_SHA:
        raise SystemExit("Risik still bytes drifted")
    if file_hash(portrait_path) != PORTRAIT_SHA:
        raise SystemExit("Risik portrait bytes drifted")

    audit_items = [
        row
        for row in collection_items(read_json(Path("data/MEDIA-AUDIT.json")))
        if row.get("wall_id") == WALL_ID
    ]
    if len(audit_items) != 2:
        raise SystemExit(f"Risik media cardinality drifted: {len(audit_items)}")
    audit_by_side = {row.get("side"): row for row in audit_items}
    expected_facets = {
        "still": {
            "id": STILL_ITEM_ID,
            "sha256": STILL_SHA,
            "identity": "expected",
            "presentation": "character-depiction",
            "subject": CHARACTER,
        },
        "portrait": {
            "id": PORTRAIT_ITEM_ID,
            "sha256": PORTRAIT_SHA,
            "identity": "expected",
            "presentation": "neutral-human",
            "subject": PERFORMER,
        },
    }
    for side, expected in expected_facets.items():
        facet = audit_by_side.get(side)
        if not facet:
            raise SystemExit(f"Risik {side} facet is absent")
        claims = facet.get("claims") or {}
        if (
            facet.get("id") != expected["id"]
            or facet.get("scope") != "star-trek"
            or facet.get("status") != "verified"
            or facet.get("actor") != PERFORMER
            or facet.get("character") != CHARACTER
            or facet.get("expected_subject") != expected["subject"]
            or (facet.get("asset") or {}).get("sha256") != expected["sha256"]
            or (claims.get("identity") or {}).get("state") != "enforced"
            or (claims.get("identity") or {}).get("value")
            != expected["identity"]
            or (claims.get("presentation") or {}).get("state") != "enforced"
            or (claims.get("presentation") or {}).get("value")
            != expected["presentation"]
        ):
            raise SystemExit(f"Risik {side} facet drifted: {facet}")
        votes = facet.get("votes") or []
        if len(votes) != 2:
            raise SystemExit(f"Risik {side} vote cardinality drifted")
        for vote in votes:
            if (
                vote.get("asset_sha256") != expected["sha256"]
                or vote.get("enforced") is not True
                or vote.get("role") != "second-desk"
            ):
                raise SystemExit(f"Risik {side} vote drifted: {vote}")
            evidence = vote.get("evidence") or []
            required_evidence = {
                f"media-review:{MEDIA_REVIEW_SHA}",
                f"media-reconciliation:{RECONCILIATION_SHA}",
                f"source-review:{SOURCE_REVIEW_SHA}",
            }
            if not required_evidence.issubset(set(evidence)):
                raise SystemExit(f"Risik {side} vote evidence drifted: {evidence}")

    candidate_facets = {
        row.get("side"): row for row in (media_summary.get("facets") or [])
    }
    for side, facet in audit_by_side.items():
        if candidate_facets.get(side) != facet:
            raise SystemExit(f"candidate {side} facet does not reproduce audit")

    autopilot = read_json(Path("data/AUTOPILOT.json"))
    jobs = [row for row in autopilot.get("jobs", []) if isinstance(row, dict)]
    matches = [row for row in jobs if row.get("id") == TASK_ID]
    if len(matches) != 1:
        raise SystemExit(f"Risik task cardinality drifted: {len(matches)}")
    task = matches[0]
    if (
        task.get("scope") != "star-trek"
        or task.get("performer") != PERFORMER
        or task.get("character") != CHARACTER
        or task.get("source_fingerprint") != FINGERPRINT
        or task.get("status") != "resolved"
        or task.get("attempts") != 1
        or task.get("lease") is not None
        or task.get("wall_ids") != [WALL_ID]
        or task.get("role_on_wall") is not True
    ):
        raise SystemExit(f"durable Risik task drifted: {task}")
    if not contains_pair(task, "lease_id", LEASE_ID):
        raise SystemExit("resolved Risik task lost originating lease custody")
    counts = queue_counts(jobs)
    if counts != EXPECTED_QUEUE:
        raise SystemExit(f"durable Star Trek queue drifted: {counts}")

    waterline = read_json(Path("data/WATERLINE-STATE.json"))
    cycles = [
        row
        for row in waterline.get("cycles", [])
        if isinstance(row, dict)
        and (
            row.get("lease_id") == LEASE_ID
            or TASK_ID in (row.get("task_statuses") or {})
        )
    ]
    if cycles:
        raise SystemExit(f"Risik waterline cycle was recorded prematurely: {cycles}")

    actual_paths = [
        line
        for line in (OUT / "candidate-changed-paths.txt").read_text().splitlines()
        if line
    ]
    excluded = {
        "data/review/adapter-sdk/star-trek-risik-candidate.json",
        "images/uc-1399-portrait.jpg",
        "images/uc-1399-still.webp",
    }
    projected_paths = sorted(path for path in actual_paths if path not in excluded)
    if projected_paths != sorted(candidate.get("changed_paths") or []):
        raise SystemExit("candidate changed-path receipt does not reproduce Git delta")
    if len(actual_paths) != 44 or len(projected_paths) != 41:
        raise SystemExit(
            f"candidate path cardinality drifted: {len(actual_paths)} / {len(projected_paths)}"
        )
    if any(path.startswith(".github/") or path.startswith("transport/") for path in actual_paths):
        raise SystemExit("candidate contains controller or transport material")

    main_now = exact_text(OUT / "main-after.txt")
    if main_now != EXPECTED_MAIN:
        raise SystemExit(f"canonical main moved during review: {main_now}")

    evidence = {
        "version": 1,
        "transaction": "STAR-TREK-RISIK-INDEPENDENT-PRODUCT-EVIDENCE-V1",
        "candidate": {
            "commit": CANDIDATE_COMMIT,
            "tree": CANDIDATE_TREE,
            "parent": CLAIM_COMMIT,
            "message": CANDIDATE_MESSAGE,
            "receipt_sha256": candidate["receipt_sha256"],
            "record_sha256": candidate_record["record_sha256"],
            "changed_paths": actual_paths,
        },
        "stage_result": stage,
        "identity_contracts": {
            "claim_omitted": list(claim_omitted),
            "source_review_omitted": list(source_omitted),
            "reconciliation_omitted": list(reconciliation_omitted),
            "media_omitted": list(media_omitted),
            "media_review_omitted": list(media_review_omitted),
        },
        "task": task,
        "queue": counts,
        "record": expected_record,
        "media_facets": audit_items,
        "source_review": {
            "commit": SOURCE_REVIEW_COMMIT,
            "tree": SOURCE_REVIEW_TREE,
            "review_sha256": SOURCE_REVIEW_SHA,
            "confirmed_voiced_episodes": EXPECTED_EPISODES,
        },
        "media_reconciliation": {
            "commit": RECONCILIATION_COMMIT,
            "tree": RECONCILIATION_TREE,
            "reconciliation_sha256": RECONCILIATION_SHA,
        },
        "media": {
            "commit": MEDIA_COMMIT,
            "tree": MEDIA_TREE,
            "receipt_sha256": MEDIA_RECEIPT_SHA,
            "review_commit": MEDIA_REVIEW_COMMIT,
            "review_tree": MEDIA_REVIEW_TREE,
            "review_sha256": MEDIA_REVIEW_SHA,
            "still_sha256": STILL_SHA,
            "portrait_sha256": PORTRAIT_SHA,
        },
        "waterline_matches": cycles,
        "canonical_main": main_now,
    }
    write_json(OUT / "independent-evidence.json", evidence)


def receipt() -> None:
    evidence = read_json(OUT / "independent-evidence.json")
    controls = read_json(OUT / "control-results.json")
    review = {
        "version": 1,
        "transaction": "STAR-TREK-RISIK-INDEPENDENT-PRODUCT-REVIEW-V1",
        "reviewed_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "reviewer": "chatgpt-risik-independent-product-reviewer-v1",
        "reviewed_role": "second-desk",
        "verdict": "pass",
        "canonical_parent": {
            "commit": EXPECTED_MAIN,
            "tree": EXPECTED_MAIN_TREE,
        },
        "candidate": evidence["candidate"],
        "stage_result": {
            "commit": STAGE_RESULT_COMMIT,
            "tree": STAGE_RESULT_TREE,
            "artifact": evidence["stage_result"]["artifact"],
        },
        "task": {
            "id": TASK_ID,
            "performer": PERFORMER,
            "character": CHARACTER,
            "source_fingerprint": FINGERPRINT,
            "lease_id": LEASE_ID,
            "status": "resolved",
            "attempts": 1,
            "wall_id": WALL_ID,
        },
        "queue": EXPECTED_QUEUE,
        "record": evidence["record"],
        "source_review": evidence["source_review"],
        "media_reconciliation": evidence["media_reconciliation"],
        "media": evidence["media"],
        "controls": controls,
        "candidate_publication_admissible": True,
        "boundary": {
            "independent_product_review_complete": True,
            "canonical_mutation": False,
            "lease_mutation": False,
            "additional_lease_issued": False,
            "waterline_cycle_recorded": False,
            "pages_deployed": False,
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
        "evidence_sha256": file_hash(OUT / "independent-evidence.json"),
    }
    review["review_sha256"] = stable_hash(review)
    write_json(OUT / "independent-review.json", review)


MODES = {"inspect": inspect, "receipt": receipt}
if len(sys.argv) != 2 or sys.argv[1] not in MODES:
    raise SystemExit("usage: reviewer.py <inspect|receipt>")
MODES[sys.argv[1]]()
