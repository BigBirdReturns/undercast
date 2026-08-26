#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib
import json
import os
import sys

OUT = Path(os.environ["OUT"])
EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_TREE = os.environ["EXPECTED_TREE"]
EXPECTED_PARENT = os.environ["EXPECTED_PARENT"]
EXPECTED_MESSAGE = os.environ["EXPECTED_MESSAGE"]
RECEIPT_PATH = Path(os.environ["RECEIPT_PATH"])
RECEIPT_SHA = os.environ["RECEIPT_SHA"]
CHECKER_PATH = Path(os.environ["CHECKER_PATH"])
CHECKER_SHA = os.environ["CHECKER_SHA"]
TASK_ID = os.environ["TASK_ID"]
PERFORMER = os.environ["EXPECTED_PERFORMER"]
CHARACTER = os.environ["EXPECTED_CHARACTER"]
FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
LEASE_ID = os.environ["EXPECTED_LEASE"]
WALL_ID = os.environ["WALL_ID"]
CYCLE_ID = os.environ["CYCLE_ID"]
CANDIDATE_COMMIT = os.environ["CANDIDATE_COMMIT"]
CANDIDATE_RECEIPT_SHA = os.environ["CANDIDATE_RECEIPT_SHA"]
REVIEW_COMMIT = os.environ["REVIEW_COMMIT"]
REVIEW_SHA = os.environ["REVIEW_SHA"]
STILL_SHA = os.environ["STILL_SHA"]
PORTRAIT_SHA = os.environ["PORTRAIT_SHA"]
STILL_ITEM = os.environ["STILL_ITEM"]
PORTRAIT_ITEM = os.environ["PORTRAIT_ITEM"]
PAGES_RUN_ID = int(os.environ["PAGES_RUN_ID"])
PAGES_JOB_ID = int(os.environ["PAGES_JOB_ID"])
NEXT_TASK_ID = os.environ["NEXT_TASK_ID"]
NEXT_PERFORMER = os.environ["NEXT_PERFORMER"]
NEXT_CHARACTER = os.environ["NEXT_CHARACTER"]
NEXT_FINGERPRINT = os.environ["NEXT_FINGERPRINT"]


def stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def object_hash(value: Any) -> str:
    body = json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"
    return hashlib.sha256(body.encode()).hexdigest()


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def asset_src(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("src")
    return None


def audit_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict) and isinstance(value.get("items"), list):
        return [row for row in value["items"] if isinstance(row, dict)]
    return []


def inspect() -> None:
    main = {
        "commit": (OUT / "main-commit.txt").read_text().strip(),
        "tree": (OUT / "main-tree.txt").read_text().strip(),
        "parent": (OUT / "main-parent.txt").read_text().strip(),
        "message": (OUT / "main-message.txt").read_text().strip(),
    }
    expected_main = {
        "commit": EXPECTED_MAIN,
        "tree": EXPECTED_TREE,
        "parent": EXPECTED_PARENT,
        "message": EXPECTED_MESSAGE,
    }
    if main != expected_main:
        raise SystemExit(f"canonical Git boundary drifted: {main}")

    receipt = read_json(RECEIPT_PATH)
    receipt_body = dict(receipt)
    identity = receipt_body.pop("receipt_sha256", None)
    actual_identity = object_hash(receipt_body)
    if identity != RECEIPT_SHA or actual_identity != RECEIPT_SHA:
        raise SystemExit(
            f"Morgo receipt identity drifted: {identity} / {actual_identity}"
        )
    if file_hash(CHECKER_PATH) != CHECKER_SHA:
        raise SystemExit("Morgo checker identity drifted")
    if (
        receipt.get("transaction") != "STAR-TREK-CYCLE-MORGO"
        or receipt.get("version") != 1
        or receipt.get("canonical_parent") != EXPECTED_PARENT
    ):
        raise SystemExit("Morgo permanent receipt contract drifted")

    candidate = receipt.get("candidate") or {}
    if (
        candidate.get("commit") != CANDIDATE_COMMIT
        or candidate.get("receipt_sha256") != CANDIDATE_RECEIPT_SHA
    ):
        raise SystemExit("Morgo candidate custody drifted")
    review = receipt.get("independent_review") or {}
    if (
        review.get("commit") != REVIEW_COMMIT
        or review.get("review_sha256") != REVIEW_SHA
        or review.get("verdict") != "pass"
    ):
        raise SystemExit("Morgo independent-review custody drifted")

    task_receipt = receipt.get("task") or {}
    required_task = {
        "id": TASK_ID,
        "performer": PERFORMER,
        "character": CHARACTER,
        "source_fingerprint": FINGERPRINT,
        "production": "The Least Dangerous Game",
        "series": "Star Trek: Lower Decks",
        "years": "2022",
        "performance_mode": "voice-animation",
    }
    for key, expected in required_task.items():
        if task_receipt.get(key) != expected:
            raise SystemExit(f"Morgo receipt task {key} drifted")
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
        if task_receipt.get(key) is not False:
            raise SystemExit(f"unsupported Morgo attribution promoted: {key}")
    if task_receipt.get("maker_attribution") != "unresolved":
        raise SystemExit("Morgo maker attribution drifted")

    boundary = receipt.get("boundary") or {}
    required_boundary = {
        "additional_lease_issued": False,
        "all_four_media_claims_enforced": True,
        "automatic_crater_page_image_excluded": True,
        "cross_facet_substitution": False,
        "exact_morgo_character": True,
        "performer_source_reuse_admitted": True,
        "primary_morgo_still": True,
        "source_distinct_media": True,
    }
    for key, expected in required_boundary.items():
        if boundary.get(key) != expected:
            raise SystemExit(f"Morgo receipt boundary {key} drifted")

    queue = {
        "total": 2228,
        "queued": 1796,
        "resolved": 430,
        "blocked": 0,
        "rejected": 2,
        "in_flight": 0,
    }
    if (receipt.get("queue") or {}).get("after") != queue:
        raise SystemExit("Morgo receipt queue drifted")

    cycle_receipt = receipt.get("reviewed_cycle") or {}
    if (
        cycle_receipt.get("id") != CYCLE_ID
        or cycle_receipt.get("lease_id") != LEASE_ID
        or cycle_receipt.get("outcome") != "completed"
        or cycle_receipt.get("task_statuses", {}).get(TASK_ID) != "resolved"
    ):
        raise SystemExit("Morgo receipt reviewed-cycle custody drifted")

    state = read_json(Path("data/AUTOPILOT.json"))
    trek = [row for row in state.get("jobs", []) if row.get("scope") == "star-trek"]
    matches = [row for row in trek if row.get("id") == TASK_ID]
    if len(matches) != 1:
        raise SystemExit(f"Morgo durable task cardinality drifted: {len(matches)}")
    task = matches[0]
    durable_lease = (
        task.get("outcome", {}).get("media_review", {}).get("lease_id")
        or task.get("outcome", {}).get("lease_id")
    )
    if (
        task.get("status") != "resolved"
        or task.get("attempts") != 1
        or task.get("performer") != PERFORMER
        or task.get("character") != CHARACTER
        or task.get("source_fingerprint") != FINGERPRINT
        or task.get("lease") is not None
        or task.get("wall_ids") != [WALL_ID]
        or durable_lease != LEASE_ID
    ):
        raise SystemExit(f"Morgo durable task drifted: {task}")
    actual_queue = {
        "total": len(trek),
        "queued": sum(row.get("status") == "queued" for row in trek),
        "resolved": sum(row.get("status") == "resolved" for row in trek),
        "blocked": sum(row.get("status") == "blocked" for row in trek),
        "rejected": sum(row.get("status") == "rejected" for row in trek),
        "in_flight": sum(
            row.get("status") in {"leased", "drafted", "merged"} for row in trek
        ),
    }
    if actual_queue != queue:
        raise SystemExit(f"Morgo canonical queue drifted: {actual_queue}")

    records = [
        row for row in read_json(Path("data/specimens.json"))
        if row.get("id") == WALL_ID
    ]
    if len(records) != 1:
        raise SystemExit(f"Morgo record cardinality drifted: {len(records)}")
    record = records[0]
    exact_record = {
        "actor": PERFORMER,
        "character": CHARACTER,
        "production": "The Least Dangerous Game",
        "universe": "Star Trek",
        "years": "2022",
        "kind": "voice",
        "designer": "—",
        "transform": 2,
    }
    for key, expected in exact_record.items():
        if record.get(key) != expected:
            raise SystemExit(f"Morgo record {key} drifted")
    if asset_src(record.get("still")) != "images/uc-1398-still.webp":
        raise SystemExit("Morgo still path drifted")
    if asset_src(record.get("portrait")) != "images/uc-1398-portrait.jpg":
        raise SystemExit("Morgo portrait path drifted")
    if file_hash(Path("images/uc-1398-still.webp")) != STILL_SHA:
        raise SystemExit("Morgo still bytes drifted")
    if file_hash(Path("images/uc-1398-portrait.jpg")) != PORTRAIT_SHA:
        raise SystemExit("Morgo portrait bytes drifted")

    audit = read_json(Path("data/MEDIA-AUDIT.json"))
    facets = [
        row
        for row in audit_items(audit)
        if row.get("wall_id") == WALL_ID and row.get("side") in {"still", "portrait"}
    ]
    if len(facets) != 2:
        raise SystemExit(f"Morgo media facet cardinality drifted: {len(facets)}")
    expected_facets = {
        "still": (STILL_ITEM, STILL_SHA, "character-depiction"),
        "portrait": (PORTRAIT_ITEM, PORTRAIT_SHA, "neutral-human"),
    }
    for facet in facets:
        item_id, digest, presentation_value = expected_facets[facet["side"]]
        claims = facet.get("claims") or {}
        identity_claim = claims.get("identity") or {}
        presentation_claim = claims.get("presentation") or {}
        if (
            facet.get("id") != item_id
            or facet.get("status") != "verified"
            or (facet.get("asset") or {}).get("sha256") != digest
            or identity_claim.get("state") != "enforced"
            or identity_claim.get("value") != "expected"
            or presentation_claim.get("state") != "enforced"
            or presentation_claim.get("value") != presentation_value
        ):
            raise SystemExit(f"Morgo {facet['side']} facet drifted")
        votes = facet.get("votes") or []
        if len(votes) != 2 or any(vote.get("asset_sha256") != digest for vote in votes):
            raise SystemExit(f"Morgo {facet['side']} vote custody drifted")

    water = read_json(Path("data/WATERLINE-STATE.json"))
    cycles = [
        row
        for row in water.get("cycles", [])
        if row.get("id") == CYCLE_ID
        and row.get("scope_id") == "star-trek"
        and row.get("lease_id") == LEASE_ID
    ]
    if (
        len(cycles) != 1
        or cycles[0].get("outcome") != "completed"
        or cycles[0].get("task_statuses", {}).get(TASK_ID) != "resolved"
    ):
        raise SystemExit("Morgo canonical waterline custody drifted")

    pages = read_json(OUT / "pages-run.json")
    jobs = read_json(OUT / "pages-jobs.json")
    if (
        pages.get("id") != PAGES_RUN_ID
        or pages.get("status") != "completed"
        or pages.get("conclusion") != "success"
        or pages.get("head_sha") != EXPECTED_MAIN
    ):
        raise SystemExit("Morgo Pages run custody drifted")
    deploys = [
        row
        for row in jobs.get("jobs", [])
        if row.get("id") == PAGES_JOB_ID
        and row.get("name") == "deploy"
        and row.get("status") == "completed"
        and row.get("conclusion") == "success"
    ]
    if len(deploys) != 1:
        raise SystemExit("Morgo Pages deploy job custody drifted")

    next_doc = read_json(OUT / "next.json")
    expected_next = {
        "task_id": NEXT_TASK_ID,
        "performer": NEXT_PERFORMER,
        "character": NEXT_CHARACTER,
        "source_fingerprint": NEXT_FINGERPRINT,
    }
    if next_doc.get("phase") != "ready-for-one-cycle":
        raise SystemExit(f"Morgo successor phase drifted: {next_doc}")
    for key, expected in expected_next.items():
        if next_doc.get("candidate", {}).get(key) != expected:
            raise SystemExit(f"Morgo successor {key} drifted")
    if receipt.get("next") != next_doc:
        raise SystemExit("Morgo receipt and reproduced successor rail disagree")

    evidence = {
        "canonical": main,
        "receipt": {
            "path": RECEIPT_PATH.as_posix(),
            "receipt_sha256": RECEIPT_SHA,
            "checker_path": CHECKER_PATH.as_posix(),
            "checker_sha256": CHECKER_SHA,
        },
        "task": task,
        "queue": actual_queue,
        "record": record,
        "facets": facets,
        "reviewed_cycle": cycles[0],
        "pages": {
            "run": pages,
            "deploy_job": deploys[0],
        },
        "next": next_doc,
    }
    write_json(OUT / "terminal-evidence.json", evidence)


def receipt() -> None:
    evidence = read_json(OUT / "terminal-evidence.json")
    attestation = {
        "version": 3,
        "transaction": "STAR-TREK-MORGO-TERMINAL-READBACK-V3",
        "verified_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "verifier": "chatgpt-morgo-terminal-readback-v3",
        "verdict": "pass",
        "canonical": evidence["canonical"],
        "task": {
            "id": TASK_ID,
            "lease_id": LEASE_ID,
            "wall_id": WALL_ID,
            "performer": PERFORMER,
            "character": CHARACTER,
            "status": "resolved",
        },
        "queue": evidence["queue"],
        "receipt": evidence["receipt"],
        "reviewed_cycle_id": CYCLE_ID,
        "pages": {
            "run_id": PAGES_RUN_ID,
            "job_id": PAGES_JOB_ID,
            "conclusion": "success",
            "head_sha": EXPECTED_MAIN,
        },
        "next": evidence["next"],
        "evidence_sha256": file_hash(OUT / "terminal-evidence.json"),
        "boundary": {
            "exact_head_deployment_complete": True,
            "queue_closed": True,
            "originating_lease_completed": True,
            "additional_lease_issued": False,
            "successor_claimed": False,
            "canonical_mutation_by_readback": False,
        },
    }
    attestation["attestation_sha256"] = object_hash(attestation)
    write_json(OUT / "terminal-readback.json", attestation)


MODES = {"inspect": inspect, "receipt": receipt}
if len(sys.argv) != 2 or sys.argv[1] not in MODES:
    raise SystemExit("usage: verifier.py <inspect|receipt>")
MODES[sys.argv[1]]()
