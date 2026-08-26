#!/usr/bin/env python3
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os

finalizer = Path(os.environ["PATCHED_FINALIZER"])
runner = Path(os.environ["PATCHED_RUNNER"])
patch_receipt = Path(os.environ["PATCH_RECEIPT"])

before = finalizer.read_text(encoding="utf-8")

old_guard = '''    waterline = load(Path("data/WATERLINE-STATE.json"))
    if any(
        row.get("scope_id") == "star-trek" and row.get("lease_id") == LEASE_ID
        for row in waterline.get("cycles", [])
    ):
        raise SystemExit("Benbassat waterline cycle already exists")
    if not any(
'''

new_guard = '''    waterline = load(Path("data/WATERLINE-STATE.json"))
    benbassat_cycles = [
        row for row in waterline.get("cycles", [])
        if row.get("scope_id") == "star-trek" and row.get("lease_id") == LEASE_ID
    ]
    if len(benbassat_cycles) > 1:
        raise SystemExit(f"Benbassat waterline cardinality drifted: {len(benbassat_cycles)}")
    if benbassat_cycles:
        recorded = benbassat_cycles[0]
        review = docs["review"]
        evidence = recorded.get("evidence") or []
        expected_evidence = {
            (
                "workflow-run",
                f"github-actions-artifact:{review.get('artifact', {}).get('id')}:"
                f"{review.get('artifact', {}).get('digest')}",
            ),
            ("commit", CANDIDATE_COMMIT),
            (
                "restart-proof",
                f"candidate-receipt:{CANDIDATE_RECEIPT_SHA};"
                f"independent-review:{REVIEW_SHA};lease:{LEASE_ID}",
            ),
        }
        actual_evidence = {
            (row.get("type"), row.get("value"))
            for row in evidence
            if isinstance(row, dict)
        }
        expected_note = (
            "The reviewed Benbassat cycle resolves Nolan North’s off-screen voiceover in "
            "Star Trek: Picard episode Võx (2023), rejects the physical-prosthetic queue hint, "
            "preserves honest absence for both visual facets, and leaves unsupported maker "
            "functions unresolved."
        )
        expected_reviewer = (
            review.get("reviewer")
            or "chatgpt-benbassat-independent-product-reviewer-v8"
        )
        if (
            recorded.get("outcome") != "completed"
            or recorded.get("task_statuses", {}).get(TASK_ID) != "resolved"
            or recorded.get("note") != expected_note
            or recorded.get("reviewed_by") != expected_reviewer
            or recorded.get("reviewed_role") != "second-desk"
            or recorded.get("reviewed_at") != review.get("reviewed_at")
            or len(evidence) != 3
            or actual_evidence != expected_evidence
        ):
            raise SystemExit("existing Benbassat waterline cycle does not match this reviewed execution")
    if not any(
'''

if before.count(old_guard) != 1:
    raise SystemExit(f"finalizer cycle guard anchor drifted: {before.count(old_guard)}")
after = before.replace(old_guard, new_guard, 1)

registry_anchor = '''    CHECKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    CHECKER_PATH.write_text(checker_source(), encoding="utf-8")
'''

registry_block = '''    registry_path = Path("data/ESTATE-REGISTRY.json")
    registry = load(registry_path)
    estate = next(
        (row for row in registry.get("estates", []) if row.get("id") == "star-trek"),
        None,
    )
    if estate is None:
        raise SystemExit("Star Trek estate registry entry missing")
    registry_next_gate = (
        f"Star Trek reviewed Benbassat cycle {cycle['id']} resolved Nolan North’s "
        "off-screen voice performance as Captain Benbassat in Star Trek: Picard episode "
        f"Võx (2023) within the preserved {counts['total']:,}-task denominator; "
        f"{counts['queued']:,} tasks remain queued. Both visual facets remain honest "
        "absences because the source page provides no page-bound character image and no "
        "compliant licensed, byte-distinct Nolan North portrait was established. The "
        "physical-prosthetic queue hint is rejected; physical performance, prosthetic "
        "performance, animation labor, character design, voice direction, vocal processing, "
        "sound, editing, production-shop labor, transformation measurement, and every "
        "unsupported maker function remain unresolved. Any later cycle must begin from the "
        "repository-native thesis rail, claim at most one compatible task, and return to a "
        "reviewed cycle receipt before another claim."
    )
    estate["next_gate"] = registry_next_gate
    write(registry_path, registry)
    receipt["registry"] = {
        "path": str(registry_path),
        "estate_id": "star-trek",
        "reviewed_cycle_id": cycle["id"],
        "queued": counts["queued"],
        "next_gate": registry_next_gate,
        "next_gate_sha256": sha256_bytes(registry_next_gate.encode("utf-8")),
    }

    CHECKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    CHECKER_PATH.write_text(checker_source(), encoding="utf-8")
'''

if after.count(registry_anchor) != 1:
    raise SystemExit(f"registry insertion anchor drifted: {after.count(registry_anchor)}")
after = after.replace(registry_anchor, registry_block, 1)
finalizer.write_text(after, encoding="utf-8")

runner_before = runner.read_text(encoding="utf-8")
runner_old = '''rm -rf "$OUT"
mkdir -p "$REVIEW_ROOT" "$SOURCE_ROOT" "$MEDIA_ROOT" "$PREPRODUCT_ROOT"
'''
runner_new = '''rm -rf "$OUT"
mkdir -p "$REVIEW_ROOT" "$SOURCE_ROOT" "$MEDIA_ROOT" "$PREPRODUCT_ROOT"
cp "$PATCH_RECEIPT" "$OUT/finalizer-cycle-registry-patch.json"
'''
if runner_before.count(runner_old) != 1:
    raise SystemExit(f"runner receipt anchor drifted: {runner_before.count(runner_old)}")
runner_after = runner_before.replace(runner_old, runner_new, 1)
runner.write_text(runner_after, encoding="utf-8")

receipt = {
    "version": 1,
    "transaction": "STAR-TREK-BENBASSAT-FINALIZER-CYCLE-REGISTRY-COMPOSABILITY-V1",
    "patched_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "failed_runs": [32929286855, 32930173467],
    "sealed_archive_sha256": os.environ["CARRIER_SHA256"],
    "original_finalizer_sha256": hashlib.sha256(before.encode()).hexdigest(),
    "patched_finalizer_sha256": hashlib.sha256(after.encode()).hexdigest(),
    "original_runner_sha256": hashlib.sha256(runner_before.encode()).hexdigest(),
    "patched_runner_sha256": hashlib.sha256(runner_after.encode()).hexdigest(),
    "cycle_idempotence": {
        "maximum_cardinality": 1,
        "scope_id": "star-trek",
        "lease_id": os.environ["LEASE_ID"],
        "outcome": "completed",
        "task_id": os.environ["TASK_ID"],
        "task_status": "resolved",
        "candidate_commit": os.environ["CANDIDATE_COMMIT"],
        "candidate_receipt_sha256": os.environ["CANDIDATE_RECEIPT_SHA"],
        "independent_review_sha256": os.environ["REVIEW_SHA"],
        "reviewed_role": "second-desk",
    },
    "registry_projection": {
        "path": "data/ESTATE-REGISTRY.json",
        "estate_id": "star-trek",
        "cycle": "runtime exact reviewed Benbassat cycle",
        "queue": "runtime durable Star Trek queue",
        "alice_checker_modified": False,
    },
    "boundary": {
        "canonical_mutation_by_patch": False,
        "lease_mutation_by_patch": False,
        "candidate_mutation_by_patch": False,
        "waterline_replay": False,
        "unrelated_prior_cycle_accepted": False,
        "predecessor_checker_weakened": False,
    },
}
patch_receipt.write_text(
    json.dumps(receipt, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)
