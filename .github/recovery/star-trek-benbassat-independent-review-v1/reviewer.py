#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
import hashlib
import json
import os
import subprocess

OUT = Path(os.environ["OUT"])
CANDIDATE_ROOT = Path(os.environ["CANDIDATE_ROOT"])
SOURCE_REVIEW_ROOT = Path(os.environ["SOURCE_REVIEW_ROOT"])
MEDIA_ROOT = Path(os.environ["MEDIA_ROOT"])
EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_TREE = os.environ["EXPECTED_TREE"]
CLAIM_BRANCH = os.environ["CLAIM_BRANCH"]
TASK_ID = os.environ["TASK_ID"]
EXPECTED_PERFORMER = os.environ["EXPECTED_PERFORMER"]
EXPECTED_CHARACTER = os.environ["EXPECTED_CHARACTER"]
EXPECTED_FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
WALL_ID = os.environ["WALL_ID"]


def stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def stable_bytes(value: Any) -> bytes:
    return (json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n").encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_identity(path: Path, field: str, removable: tuple[str, ...] = ()) -> dict[str, Any]:
    payload = load(path)
    expected = payload[field]
    body = dict(payload)
    body.pop(field, None)
    for key in removable:
        body.pop(key, None)
    actual = sha256_bytes(stable_bytes(body))
    if actual != expected:
        raise SystemExit(f"{path.name} identity mismatch: {actual} != {expected}")
    return payload


def recurse(node: Any, predicate: Callable[[dict[str, Any]], bool], pointer: str = ""):
    hits: list[tuple[dict[str, Any], str]] = []
    if isinstance(node, dict):
        if predicate(node):
            hits.append((node, pointer or "/"))
        for key, value in node.items():
            hits.extend(recurse(value, predicate, f"{pointer}/{key}"))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            hits.extend(recurse(value, predicate, f"{pointer}/{index}"))
    return hits


def search_json(predicate: Callable[[dict[str, Any]], bool]):
    hits: list[dict[str, Any]] = []
    for path in Path("data").rglob("*.json"):
        try:
            payload = load(path)
        except Exception:
            continue
        for obj, pointer in recurse(payload, predicate):
            hits.append({"path": str(path), "pointer": pointer, "object": obj})
    return hits


def main() -> None:
    candidate = verify_identity(CANDIDATE_ROOT / "candidate-receipt.json", "receipt_sha256")
    source_review = verify_identity(SOURCE_REVIEW_ROOT / "source-review.json", "review_sha256", ("artifact",))
    media_receipt = verify_identity(MEDIA_ROOT / "media-receipt.json", "receipt_sha256", ("artifact",))

    if candidate.get("transaction") != "STAR-TREK-BENBASSAT-CANDIDATE-V1":
        raise SystemExit("candidate transaction drifted")
    if candidate.get("status") != "candidate-ready-for-independent-review":
        raise SystemExit("candidate is not reviewable")
    task_receipt = candidate.get("task") or {}
    expected_task = {
        "id": TASK_ID,
        "performer": EXPECTED_PERFORMER,
        "character": EXPECTED_CHARACTER,
        "source_fingerprint": EXPECTED_FINGERPRINT,
        "status": "resolved",
    }
    for key, expected in expected_task.items():
        if task_receipt.get(key) != expected:
            raise SystemExit(f"candidate task {key} drifted: {task_receipt.get(key)!r} != {expected!r}")
    if task_receipt.get("wall_ids") != [WALL_ID]:
        raise SystemExit("candidate wall binding drifted")
    lease_id = task_receipt.get("lease_id")
    if not lease_id:
        raise SystemExit("candidate lease id is missing")
    if candidate.get("canonical_parent") != EXPECTED_MAIN or candidate.get("canonical_tree") != EXPECTED_TREE:
        raise SystemExit("candidate canonical parent drifted")
    if candidate.get("queue") != {"total": 2228, "queued": 1797, "resolved": 429, "blocked": 0, "rejected": 2, "in_flight": 0}:
        raise SystemExit(f"candidate queue drifted: {candidate.get('queue')}")
    boundary = candidate.get("boundary") or {}
    expected_boundary = {
        "physical_prosthetic_hint_accepted": False,
        "physical_performance_attributed": False,
        "prosthetic_performance_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
        "independent_product_review_complete": False,
        "waterline_cycle_recorded": False,
        "canonical_mutation": False,
        "additional_lease_issued": False,
    }
    for key, expected in expected_boundary.items():
        if boundary.get(key) != expected:
            raise SystemExit(f"candidate boundary {key} drifted")

    if source_review.get("verdict") != "pass" or source_review.get("adjudication", {}).get("performance_mode") != "voice-animation":
        raise SystemExit("source review no longer supports voice-animation")
    if source_review.get("task", {}).get("id") != TASK_ID:
        raise SystemExit("source review task drifted")
    if source_review.get("review_sha256") != candidate.get("source_review", {}).get("review_sha256"):
        raise SystemExit("candidate source-review identity drifted")
    if media_receipt.get("receipt_sha256") != candidate.get("media", {}).get("receipt_sha256"):
        raise SystemExit("candidate media receipt identity drifted")
    if media_receipt.get("task", {}).get("lease_id") != lease_id:
        raise SystemExit("media lease binding drifted")

    state = load(Path("data/AUTOPILOT.json"))
    trek = [row for row in state.get("jobs", []) if row.get("scope") == "star-trek"]
    task_matches = [row for row in trek if row.get("id") == TASK_ID]
    if len(task_matches) != 1:
        raise SystemExit("durable Benbassat task cardinality drifted")
    task = task_matches[0]
    if task.get("status") != "resolved" or task.get("wall_ids") != [WALL_ID]:
        raise SystemExit("durable Benbassat task is not resolved")
    if (task.get("lease") or {}).get("id") != lease_id:
        raise SystemExit("durable Benbassat lease drifted")
    counts = {
        "total": len(trek),
        "queued": sum(row.get("status") == "queued" for row in trek),
        "resolved": sum(row.get("status") == "resolved" for row in trek),
        "blocked": sum(row.get("status") == "blocked" for row in trek),
        "rejected": sum(row.get("status") == "rejected" for row in trek),
        "in_flight": sum(row.get("status") in {"leased", "drafted", "merged"} for row in trek),
    }
    if counts != candidate.get("queue"):
        raise SystemExit(f"durable queue differs from candidate receipt: {counts}")

    record_hits = search_json(lambda obj: obj.get("id") == WALL_ID and obj.get("character") == EXPECTED_CHARACTER and obj.get("actor") == EXPECTED_PERFORMER)
    primary_record_hits = [hit for hit in record_hits if not any(token in hit["path"].lower() for token in ("review", "archive", "shard", "search", "contract"))]
    if len(primary_record_hits) != 1:
        raise SystemExit(f"primary Benbassat record cardinality drifted: {primary_record_hits}")
    record = primary_record_hits[0]["object"]
    if record.get("kind") != "voice" or record.get("production") != "Star Trek: Prodigy":
        raise SystemExit("Benbassat canonical record modality drifted")
    if record.get("designer") not in {"—", "-", None, ""}:
        raise SystemExit("unsupported maker attribution was promoted")
    reveal = str(record.get("reveal") or "").lower()
    for required in ("voice performance", "physical-prosthetic hint is rejected", "unresolved"):
        if required not in reveal:
            raise SystemExit(f"Benbassat reveal omitted boundary marker: {required}")

    facet_hits = search_json(lambda obj: obj.get("wall_id") == WALL_ID and obj.get("side") in {"still", "portrait"} and "expected_subject" in obj)
    primary_facets = [hit for hit in facet_hits if "media-audit" in hit["path"].lower() and "review" not in hit["path"].lower()]
    if len(primary_facets) != 2 or {hit["object"].get("side") for hit in primary_facets} != {"still", "portrait"}:
        raise SystemExit(f"Benbassat media facets drifted: {primary_facets}")

    checked_media: dict[str, Any] = {}
    for side in ("still", "portrait"):
        facet = next(hit["object"] for hit in primary_facets if hit["object"].get("side") == side)
        expected_subject = EXPECTED_CHARACTER if side == "still" else EXPECTED_PERFORMER
        if facet.get("expected_subject") != expected_subject:
            raise SystemExit(f"{side} expected subject drifted")
        if facet.get("status") not in {"verified", "absent"}:
            raise SystemExit(f"{side} is not terminal")
        if facet.get("status") == "verified":
            asset = facet.get("asset") or {}
            path = Path(asset.get("src") or "")
            if not path.is_file():
                raise SystemExit(f"{side} asset missing: {path}")
            actual = sha256_file(path)
            if actual != asset.get("sha256"):
                raise SystemExit(f"{side} asset digest drifted")
            media_side = candidate.get("media", {}).get("facets", {}).get(side) or {}
            if media_side.get("sha256") != actual:
                raise SystemExit(f"candidate {side} receipt digest drifted")
            checked_media[side] = {"status": "verified", "path": str(path), "sha256": actual, "origin": asset.get("origin")}
        else:
            checked_media[side] = {"status": "absent", "reason": facet.get("reason")}
    if checked_media.get("still", {}).get("sha256") and checked_media.get("still", {}).get("sha256") == checked_media.get("portrait", {}).get("sha256"):
        raise SystemExit("candidate facets reuse bytes")
    if checked_media.get("still", {}).get("origin") and checked_media.get("still", {}).get("origin") == checked_media.get("portrait", {}).get("origin"):
        raise SystemExit("candidate facets reuse the same source")

    waterline = load(Path("data/WATERLINE-STATE.json"))
    premature = [cycle for cycle in waterline.get("cycles", []) if cycle.get("scope_id") == "star-trek" and cycle.get("lease_id") == lease_id]
    if premature:
        raise SystemExit(f"Benbassat waterline was recorded before independent review: {premature}")

    candidate_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    candidate_tree = subprocess.check_output(["git", "show", "-s", "--format=%T", "HEAD"], text=True).strip()
    candidate_parent = subprocess.check_output(["git", "show", "-s", "--format=%P", "HEAD"], text=True).strip()
    claim_commit = subprocess.check_output(["git", "rev-parse", f"refs/remotes/origin/{CLAIM_BRANCH}"], text=True).strip()
    if candidate_parent != claim_commit:
        raise SystemExit(f"candidate parent is not the durable claim: {candidate_parent} != {claim_commit}")
    changed_paths = subprocess.check_output(["git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], text=True).splitlines()
    if "data/review/adapter-sdk/star-trek-benbassat-candidate.json" not in changed_paths:
        raise SystemExit("candidate receipt is not committed")

    review = {
        "version": 1,
        "transaction": "STAR-TREK-BENBASSAT-INDEPENDENT-REVIEW-V1",
        "reviewed_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "reviewer": "chatgpt-benbassat-independent-second-desk",
        "reviewed_role": "second-desk",
        "verdict": "pass",
        "canonical_parent": {"commit": EXPECTED_MAIN, "tree": EXPECTED_TREE},
        "claim": {"commit": claim_commit, "lease_id": lease_id},
        "candidate": {
            "commit": candidate_commit,
            "tree": candidate_tree,
            "parent": candidate_parent,
            "receipt_sha256": candidate["receipt_sha256"],
            "changed_paths": changed_paths,
        },
        "task": {
            "id": TASK_ID,
            "lease_id": lease_id,
            "performer": EXPECTED_PERFORMER,
            "character": EXPECTED_CHARACTER,
            "source_fingerprint": EXPECTED_FINGERPRINT,
            "status": task["status"],
            "wall_id": WALL_ID,
            "attempts": task.get("attempts"),
        },
        "canonical_record": {
            "path": primary_record_hits[0]["path"],
            "pointer": primary_record_hits[0]["pointer"],
            "record_sha256": sha256_bytes(stable_bytes(record)),
            "kind": record.get("kind"),
            "production": record.get("production"),
        },
        "media": checked_media,
        "queue": counts,
        "gates": {
            "repository_validate": 0,
            "media_gate": 0,
            "thesis_validate": 0,
            "autopilot_fixtures": 0,
        },
        "boundary": {
            "performance_mode": "voice-animation",
            "queued_physical_prosthetic_hint_rejected": True,
            "physical_performance_attributed": False,
            "prosthetic_performance_attributed": False,
            "maker_attribution": "unresolved",
            "transformation_measured": False,
            "source_distinct_media": True,
            "byte_distinct_media": True,
            "cross_facet_substitution": False,
            "waterline_cycle_recorded": False,
            "canonical_mutation": False,
            "lease_mutation": False,
            "additional_lease_issued": False,
        },
    }
    review["review_sha256"] = sha256_bytes(stable_bytes(review))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "independent-review.json").write_text(json.dumps(stable(review), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "verdict.txt").write_text(
        "PASS\n"
        "Benbassat candidate passed independent product review\n"
        f"Candidate {candidate_commit}\n"
        f"Lease {lease_id}\n"
        f"Wall {WALL_ID}\n"
        f"Review {review['review_sha256']}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
