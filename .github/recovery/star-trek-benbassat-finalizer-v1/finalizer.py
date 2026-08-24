#!/usr/bin/env python3
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib
import json
import os
import re
import subprocess

OUT = Path(os.environ["OUT"])
REVIEW_ROOT = Path(os.environ["REVIEW_ROOT"])
SOURCE_REVIEW_ROOT = Path(os.environ["SOURCE_REVIEW_ROOT"])
MEDIA_ROOT = Path(os.environ["MEDIA_ROOT"])
EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_TREE = os.environ["EXPECTED_TREE"]
TASK_ID = os.environ["TASK_ID"]
EXPECTED_PERFORMER = os.environ["EXPECTED_PERFORMER"]
EXPECTED_CHARACTER = os.environ["EXPECTED_CHARACTER"]
EXPECTED_FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
WALL_ID = os.environ["WALL_ID"]
ALICE_RECEIPT_PATH = Path(os.environ["ALICE_RECEIPT_PATH"])
ALICE_RECEIPT_SHA256 = os.environ["ALICE_RECEIPT_SHA256"]
ALICE_CHECKER_PATH = Path(os.environ["ALICE_CHECKER_PATH"])
ALICE_CHECKER_SHA256 = os.environ["ALICE_CHECKER_SHA256"]
ALICE_CYCLE_ID = os.environ["ALICE_CYCLE_ID"]
RECEIPT_PATH = Path(os.environ["RECEIPT_PATH"])
CHECKER_PATH = Path(os.environ["CHECKER_PATH"])
PACKAGE_PATH = Path("package.json")


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


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


def write(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


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


def task_and_counts() -> tuple[dict[str, Any], dict[str, int]]:
    state = load(Path("data/AUTOPILOT.json"))
    trek = [row for row in state.get("jobs", []) if row.get("scope") == "star-trek"]
    matches = [row for row in trek if row.get("id") == TASK_ID]
    if len(matches) != 1:
        raise SystemExit(f"Benbassat task cardinality drifted: {len(matches)}")
    counts = {
        "total": len(trek),
        "queued": sum(row.get("status") == "queued" for row in trek),
        "resolved": sum(row.get("status") == "resolved" for row in trek),
        "blocked": sum(row.get("status") == "blocked" for row in trek),
        "rejected": sum(row.get("status") == "rejected" for row in trek),
        "in_flight": sum(row.get("status") in {"leased", "drafted", "merged"} for row in trek),
    }
    return matches[0], counts


def find_record() -> dict[str, Any]:
    hits: list[tuple[Path, dict[str, Any]]] = []

    def walk(node: Any):
        if isinstance(node, dict):
            if node.get("id") == WALL_ID and node.get("character") == EXPECTED_CHARACTER and node.get("actor") == EXPECTED_PERFORMER:
                yield node
            for value in node.values():
                yield from walk(value)
        elif isinstance(node, list):
            for value in node:
                yield from walk(value)

    for path in Path("data").rglob("*.json"):
        if any(token in str(path).lower() for token in ("review", "archive", "shard", "search", "contract")):
            continue
        try:
            payload = load(path)
        except Exception:
            continue
        for record in walk(payload):
            hits.append((path, record))
    if len(hits) != 1:
        raise SystemExit(f"Benbassat primary record cardinality drifted: {[(str(path), row.get('id')) for path, row in hits]}")
    path, record = hits[0]
    return {"path": str(path), "record": record}


def create_cycle_inputs() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    review = verify_identity(REVIEW_ROOT / "independent-review.json", "review_sha256", ("artifact",))
    candidate = verify_identity(Path("data/review/adapter-sdk/star-trek-benbassat-candidate.json"), "receipt_sha256")
    source_review = verify_identity(SOURCE_REVIEW_ROOT / "source-review.json", "review_sha256", ("artifact",))
    media = verify_identity(MEDIA_ROOT / "media-receipt.json", "receipt_sha256", ("artifact",))
    task, counts = task_and_counts()
    if review.get("verdict") != "pass" or review.get("task", {}).get("id") != TASK_ID:
        raise SystemExit("independent review is not a passing Benbassat review")
    if candidate.get("task", {}).get("lease_id") != review.get("task", {}).get("lease_id"):
        raise SystemExit("candidate/review lease drifted")
    lease_id = review["task"]["lease_id"]
    if task.get("status") != "resolved" or task.get("wall_ids") != [WALL_ID] or (task.get("lease") or {}).get("id") != lease_id:
        raise SystemExit("Benbassat durable state drifted before waterline")
    expected_counts = {"total": 2228, "queued": 1797, "resolved": 429, "blocked": 0, "rejected": 2, "in_flight": 0}
    if counts != expected_counts:
        raise SystemExit(f"Benbassat pre-waterline queue drifted: {counts}")
    waterline = load(Path("data/WATERLINE-STATE.json"))
    if any(cycle.get("scope_id") == "star-trek" and cycle.get("lease_id") == lease_id for cycle in waterline.get("cycles", [])):
        raise SystemExit("Benbassat waterline already exists")
    prior = next((cycle for cycle in waterline.get("cycles", []) if cycle.get("id") == ALICE_CYCLE_ID), None)
    if prior is None or prior.get("outcome") != "completed":
        raise SystemExit("Alice predecessor waterline is missing")

    media_hash_material = {
        "wall_id": WALL_ID,
        "still": media.get("facets", {}).get("still"),
        "portrait": media.get("facets", {}).get("portrait"),
    }
    media_hash = sha256_bytes(stable_bytes(media_hash_material))
    job_hash = sha256_bytes(stable_bytes({"task_id": TASK_ID, "status": "resolved", "lease_id": lease_id, "wall_id": WALL_ID}))
    claimed_at = (task.get("lease") or {}).get("claimed_at") or (task.get("lease") or {}).get("issued_at") or now()
    reviewed_at = now()
    evidence = [
        {"type": "canonical-parent", "value": EXPECTED_MAIN},
        {"type": "candidate-commit", "value": review["candidate"]["commit"]},
        {"type": "independent-review", "value": review["review_sha256"]},
        {"type": "source-review", "value": source_review["review_sha256"]},
        {"type": "media-receipt", "value": media["receipt_sha256"]},
        {"type": "wall-record", "value": WALL_ID},
    ]
    note = "The durable Benbassat lease resolved Nolan North’s animated voice performance in Star Trek: Prodigy, rejected the physical-prosthetic queue hint, preserved source-distinct character and performer media or honest absence, and left every unsupported maker function unresolved."
    common = {
        "scope_id": "star-trek",
        "lease_id": lease_id,
        "outcome": "completed",
        "claimed_at": claimed_at,
        "closed_at": reviewed_at,
        "readiness_token": (task.get("lease") or {}).get("readiness_token"),
        "task_ids": [TASK_ID],
        "task_statuses": {TASK_ID: "resolved"},
        "media_item_set_sha256": media_hash,
        "job_set_sha256": job_hash,
        "note": note,
        "evidence": evidence,
        "reviewed_by": review.get("reviewer") or "chatgpt-benbassat-independent-second-desk",
        "reviewed_role": "second-desk",
        "reviewed_at": reviewed_at,
    }
    variants = [
        {"scope_id": "star-trek", "lease_id": lease_id, "outcome": "completed", "note": note, "evidence": evidence, "reviewed_by": common["reviewed_by"], "reviewed_role": "second-desk"},
        {"scope_id": "star-trek", "lease_id": lease_id, "outcome": "completed", "task_ids": [TASK_ID], "task_statuses": {TASK_ID: "resolved"}, "note": note, "evidence": evidence, "reviewed_by": common["reviewed_by"], "reviewed_role": "second-desk"},
        common,
    ]
    copied = deepcopy(prior)
    for key in ("id",):
        copied.pop(key, None)
    copied.update(common)
    variants.append(copied)
    for index, payload in enumerate(variants):
        write(OUT / f"cycle-input-{index}.json", payload)
    write(OUT / "cycle-input-context.json", {
        "task": task,
        "counts": counts,
        "lease_id": lease_id,
        "review": review,
        "candidate": candidate,
        "source_review": source_review,
        "media": media,
        "prior_cycle": prior,
        "variant_count": len(variants),
    })


def make_checker(receipt: dict[str, Any]) -> str:
    constants = {
        "TASK_ID": TASK_ID,
        "PERFORMER": EXPECTED_PERFORMER,
        "CHARACTER": EXPECTED_CHARACTER,
        "WALL_ID": WALL_ID,
        "FINGERPRINT": EXPECTED_FINGERPRINT,
        "LEASE_ID": receipt["lease"]["id"],
        "RECEIPT_SHA256": receipt["receipt_sha256"],
        "CYCLE_ID": receipt["reviewed_cycle"]["id"],
        "ALICE_RECEIPT_SHA256": ALICE_RECEIPT_SHA256,
        "ALICE_CHECKER_SHA256": ALICE_CHECKER_SHA256,
        "ALICE_CYCLE_ID": ALICE_CYCLE_ID,
    }
    constants_text = json.dumps(constants, ensure_ascii=False)
    return f"""#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const C = {constants_text};
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const digestObject = (value) => crypto.createHash('sha256').update(JSON.stringify(stable(value), null, 2) + '\\n').digest('hex');
const digestFile = (path) => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const fail = (message) => {{ throw new Error(`star-trek-benbassat-cycle: ${{message}}`); }};

const receiptPath = 'data/review/adapter-sdk/star-trek-benbassat-cycle.json';
const receipt = read(receiptPath);
const receiptBody = {{...receipt}};
delete receiptBody.receipt_sha256;
if (digestObject(receiptBody) !== C.RECEIPT_SHA256 || receipt.receipt_sha256 !== C.RECEIPT_SHA256) fail('receipt identity drifted');
if (receipt.transaction !== 'STAR-TREK-CYCLE-BENBASSAT') fail('transaction drifted');
if (receipt.task?.id !== C.TASK_ID || receipt.task?.performer !== C.PERFORMER || receipt.task?.character !== C.CHARACTER || receipt.task?.source_fingerprint !== C.FINGERPRINT) fail('task identity drifted');
if (receipt.lease?.id !== C.LEASE_ID || receipt.canonical?.wall_id !== C.WALL_ID) fail('lease or wall custody drifted');
if (receipt.task?.performance_mode !== 'voice-animation' || receipt.task?.physical_performance_attributed !== false || receipt.task?.prosthetic_performance_attributed !== false || receipt.task?.maker_attribution !== 'unresolved') fail('performance boundary drifted');
if (receipt.reviewed_cycle?.id !== C.CYCLE_ID || receipt.reviewed_cycle?.outcome !== 'completed') fail('reviewed cycle drifted');
if (receipt.predecessor?.receipt_identity !== C.ALICE_RECEIPT_SHA256 || receipt.predecessor?.checker_sha256 !== C.ALICE_CHECKER_SHA256 || receipt.predecessor?.cycle_id !== C.ALICE_CYCLE_ID) fail('Alice predecessor custody drifted');

const aliceReceipt = read('data/review/adapter-sdk/star-trek-alice-cycle.json');
const aliceBody = {{...aliceReceipt}};
delete aliceBody.receipt_sha256;
if (digestObject(aliceBody) !== C.ALICE_RECEIPT_SHA256 || aliceReceipt.receipt_sha256 !== C.ALICE_RECEIPT_SHA256) fail('Alice receipt identity drifted');
if (digestFile('scripts/star-trek-alice-cycle.mjs') !== C.ALICE_CHECKER_SHA256) fail('Alice checker identity drifted');

const state = read('data/AUTOPILOT.json');
const trek = state.jobs.filter((row) => row.scope === 'star-trek');
const task = trek.find((row) => row.id === C.TASK_ID);
if (!task || task.status !== 'resolved' || task.performer !== C.PERFORMER || task.character !== C.CHARACTER || task.source_fingerprint !== C.FINGERPRINT || task.lease?.id !== C.LEASE_ID || JSON.stringify(task.wall_ids) !== JSON.stringify([C.WALL_ID])) fail('durable task drifted');
if (trek.length !== 2228) fail('Star Trek denominator drifted');
if (trek.filter((row) => row.status === 'resolved').length < 429) fail('resolved floor regressed');
if (trek.filter((row) => ['leased','drafted','merged'].includes(row.status)).length > 1) fail('later-cycle active-task bound exceeded');

const water = read('data/WATERLINE-STATE.json');
const cycle = water.cycles.find((row) => row.id === C.CYCLE_ID && row.scope_id === 'star-trek' && row.lease_id === C.LEASE_ID);
if (!cycle || cycle.outcome !== 'completed' || cycle.task_statuses?.[C.TASK_ID] !== 'resolved') fail('waterline custody drifted');
if (!water.cycles.some((row) => row.id === C.ALICE_CYCLE_ID && row.outcome === 'completed')) fail('Alice predecessor cycle missing');

const walk = (node, predicate, out = []) => {{
  if (Array.isArray(node)) for (const value of node) walk(value, predicate, out);
  else if (node && typeof node === 'object') {{
    if (predicate(node)) out.push(node);
    for (const value of Object.values(node)) walk(value, predicate, out);
  }}
  return out;
}};
let records = [];
let facets = [];
for (const file of fs.readdirSync('data')) {{
  if (!file.endsWith('.json')) continue;
  try {{
    const payload = read(`data/${{file}}`);
    if (!/review|archive|shard|search|contract/i.test(file)) records.push(...walk(payload, (row) => row.id === C.WALL_ID && row.character === C.CHARACTER && row.actor === C.PERFORMER));
    if (/media-audit/i.test(file)) facets.push(...walk(payload, (row) => row.wall_id === C.WALL_ID && ['still','portrait'].includes(row.side) && 'expected_subject' in row));
  }} catch {{}}
}}
if (records.length !== 1) fail(`canonical record cardinality drifted (${{records.length}})`);
const record = records[0];
if (record.kind !== 'voice' || record.production !== 'Star Trek: Prodigy' || !String(record.reveal || '').includes('physical-prosthetic hint is rejected')) fail('canonical record boundary drifted');
if (!['—','-',null,undefined,''].includes(record.designer)) fail('unsupported maker attribution promoted');
if (facets.length !== 2 || new Set(facets.map((row) => row.side)).size !== 2) fail('media facet cardinality drifted');
for (const facet of facets) {{
  const expected = facet.side === 'still' ? C.CHARACTER : C.PERFORMER;
  if (facet.expected_subject !== expected || !['verified','absent'].includes(facet.status)) fail(`${{facet.side}} boundary drifted`);
  if (facet.status === 'verified') {{
    if (!facet.asset?.src || !fs.existsSync(facet.asset.src) || digestFile(facet.asset.src) !== facet.asset.sha256) fail(`${{facet.side}} asset drifted`);
  }}
}}
const verified = facets.filter((row) => row.status === 'verified');
if (verified.length === 2 && (verified[0].asset.sha256 === verified[1].asset.sha256 || verified[0].asset.origin === verified[1].asset.origin)) fail('cross-facet media reuse detected');
if (!fs.readFileSync('sitemap.xml', 'utf8').includes(`records/${{C.WALL_ID}}/`)) fail('permanent route missing');
console.log('star-trek-benbassat-cycle: PASS — exact Nolan North animated voice performance custody, physical-prosthetic hint rejection, source-distinct terminal media, unresolved maker functions, Alice predecessor custody, reviewed waterline closure, and later-cycle bounds are intact');
"""


def write_product() -> None:
    context = load(OUT / "cycle-input-context.json")
    review = verify_identity(REVIEW_ROOT / "independent-review.json", "review_sha256", ("artifact",))
    candidate = verify_identity(Path("data/review/adapter-sdk/star-trek-benbassat-candidate.json"), "receipt_sha256")
    source_review = verify_identity(SOURCE_REVIEW_ROOT / "source-review.json", "review_sha256", ("artifact",))
    media_receipt = verify_identity(MEDIA_ROOT / "media-receipt.json", "receipt_sha256", ("artifact",))
    task, counts = task_and_counts()
    waterline = load(Path("data/WATERLINE-STATE.json"))
    lease_id = review["task"]["lease_id"]
    cycles = [cycle for cycle in waterline.get("cycles", []) if cycle.get("scope_id") == "star-trek" and cycle.get("lease_id") == lease_id]
    if len(cycles) != 1:
        raise SystemExit(f"Benbassat waterline cardinality drifted: {len(cycles)}")
    cycle = cycles[0]
    if cycle.get("outcome") != "completed" or cycle.get("task_statuses", {}).get(TASK_ID) != "resolved":
        raise SystemExit("Benbassat waterline outcome drifted")
    record_info = find_record()
    record = record_info["record"]
    if task.get("status") != "resolved" or task.get("wall_ids") != [WALL_ID]:
        raise SystemExit("Benbassat durable task drifted after waterline")
    expected_counts = {"total": 2228, "queued": 1797, "resolved": 429, "blocked": 0, "rejected": 2, "in_flight": 0}
    if counts != expected_counts:
        raise SystemExit(f"Benbassat terminal queue drifted: {counts}")
    if sha256_file(ALICE_CHECKER_PATH) != ALICE_CHECKER_SHA256:
        raise SystemExit("Alice checker identity drifted")
    alice = verify_identity(ALICE_RECEIPT_PATH, "receipt_sha256")
    if alice["receipt_sha256"] != ALICE_RECEIPT_SHA256:
        raise SystemExit("Alice receipt identity drifted")

    source_probe = load(SOURCE_REVIEW_ROOT / "source-probe.json")
    next_doc = load(OUT / "thesis-next-after-waterline.json")
    if next_doc.get("phase") != "ready-for-one-cycle" or next_doc.get("candidate", {}).get("task_id") == TASK_ID:
        raise SystemExit("post-Benbassat rail did not advance")

    receipt: dict[str, Any] = {
        "version": 1,
        "transaction": "STAR-TREK-CYCLE-BENBASSAT",
        "generated_at": now(),
        "canonical_parent": EXPECTED_MAIN,
        "task": {
            "id": TASK_ID,
            "performer": EXPECTED_PERFORMER,
            "character": EXPECTED_CHARACTER,
            "production": "Star Trek: Prodigy",
            "years": "2020s",
            "source": "https://memory-alpha.fandom.com/wiki/Benbassat",
            "source_fingerprint": EXPECTED_FINGERPRINT,
            "source_receipts": [source_probe["source_revision"]],
            "production_source": source_review["medium_source"]["source"],
            "production_receipt": source_review["medium_source"],
            "queued_mode_hint": ["physical-prosthetic"],
            "adjudicated_kind": "voice",
            "performance_mode": "voice-animation",
            "performance_scope": "Nolan North’s animated voice performance as Benbassat in Star Trek: Prodigy",
            "physical_prosthetic_hint_rejected": True,
            "physical_performance_attributed": False,
            "prosthetic_performance_attributed": False,
            "animation_labor_attribution": "unresolved",
            "character_design_attribution": "unresolved",
            "voice_direction_attribution": "unresolved",
            "vocal_processing_attribution": "unresolved",
            "sound_attribution": "unresolved",
            "editing_attribution": "unresolved",
            "production_shop_attribution": "unresolved",
            "transformation_measured": False,
            "maker_attribution": "unresolved",
        },
        "lease": task["lease"],
        "candidate": {
            "claim_commit": review["claim"]["commit"],
            "candidate_commit": review["candidate"]["commit"],
            "candidate_tree": review["candidate"]["tree"],
            "candidate_receipt_sha256": candidate["receipt_sha256"],
            "changed_paths": review["candidate"]["changed_paths"],
        },
        "independent_review": {
            "verdict": review["verdict"],
            "review_sha256": review["review_sha256"],
            "reviewer": review["reviewer"],
            "reviewed_role": review["reviewed_role"],
            "artifact": review.get("artifact"),
        },
        "source_review": {
            "verdict": source_review["verdict"],
            "review_sha256": source_review["review_sha256"],
            "reviewer": source_review["reviewer"],
            "performance_mode": source_review["adjudication"]["performance_mode"],
        },
        "predecessor": {
            "task_id": alice["task"]["id"],
            "character": alice["task"].get("role") or alice["task"].get("character"),
            "receipt_path": str(ALICE_RECEIPT_PATH),
            "receipt_identity": ALICE_RECEIPT_SHA256,
            "checker_path": str(ALICE_CHECKER_PATH),
            "checker_sha256": ALICE_CHECKER_SHA256,
            "cycle_id": ALICE_CYCLE_ID,
        },
        "canonical": {
            "wall_id": WALL_ID,
            "record": record,
            "record_sha256": sha256_bytes(stable_bytes(record)),
        },
        "media": {
            "receipt_sha256": media_receipt["receipt_sha256"],
            "still": media_receipt["facets"]["still"],
            "portrait": media_receipt["facets"]["portrait"],
        },
        "queue": {
            "before": {"total": 2228, "queued": 1798, "resolved": 428, "blocked": 0, "rejected": 2, "in_flight": 0},
            "after": counts,
        },
        "reviewed_cycle": {
            "id": cycle["id"],
            "prior_cycle_id": ALICE_CYCLE_ID,
            "outcome": cycle["outcome"],
            "reviewed_at": cycle.get("reviewed_at") or cycle.get("closed_at"),
            "event_id": cycle.get("event_id"),
        },
        "next": next_doc,
        "qualification": {
            "checker_path": str(CHECKER_PATH),
            "denominator": 2228,
            "resolved_floor": 429,
        },
        "boundary": {
            "canonical_subject_contract": True,
            "exact_benbassat_character": True,
            "physical_prosthetic_hint_rejected": True,
            "physical_performance_attributed": False,
            "prosthetic_performance_attributed": False,
            "maker_attribution": "unresolved",
            "source_distinct_media": True,
            "byte_distinct_media": True,
            "cross_facet_substitution": False,
            "outside_human_dependency": False,
            "owner_physical_action_required": False,
            "additional_lease_issued": False,
        },
    }
    receipt["receipt_sha256"] = sha256_bytes(stable_bytes(receipt))
    checker = make_checker(receipt)
    CHECKER_PATH.parent.mkdir(parents=True, exist_ok=True)
    CHECKER_PATH.write_text(checker, encoding="utf-8")
    checker_hash = sha256_file(CHECKER_PATH)
    receipt["qualification"]["checker_sha256"] = checker_hash
    receipt.pop("receipt_sha256", None)
    receipt["receipt_sha256"] = sha256_bytes(stable_bytes(receipt))
    CHECKER_PATH.write_text(make_checker(receipt), encoding="utf-8")
    final_checker_hash = sha256_file(CHECKER_PATH)
    if final_checker_hash != checker_hash:
        receipt["qualification"]["checker_sha256"] = final_checker_hash
        receipt.pop("receipt_sha256", None)
        receipt["receipt_sha256"] = sha256_bytes(stable_bytes(receipt))
        CHECKER_PATH.write_text(make_checker(receipt), encoding="utf-8")
        final_checker_hash = sha256_file(CHECKER_PATH)
        receipt["qualification"]["checker_sha256"] = final_checker_hash
        receipt.pop("receipt_sha256", None)
        receipt["receipt_sha256"] = sha256_bytes(stable_bytes(receipt))
        CHECKER_PATH.write_text(make_checker(receipt), encoding="utf-8")
    write(RECEIPT_PATH, stable(receipt))
    package = load(PACKAGE_PATH)
    scripts = package.setdefault("scripts", {})
    scripts["star-trek:benbassat-cycle:check"] = "node scripts/star-trek-benbassat-cycle.mjs"
    write(PACKAGE_PATH, package)
    write(OUT / "canonical-receipt.json", stable(receipt))
    (OUT / "checker-sha256.txt").write_text(sha256_file(CHECKER_PATH) + "\n", encoding="utf-8")


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2 or sys.argv[1] not in {"cycle-inputs", "product"}:
        raise SystemExit("usage: finalizer.py <cycle-inputs|product>")
    if sys.argv[1] == "cycle-inputs":
        create_cycle_inputs()
    else:
        write_product()
