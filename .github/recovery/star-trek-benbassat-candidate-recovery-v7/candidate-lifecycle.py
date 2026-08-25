#!/usr/bin/env python3
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib
import json
import os
import subprocess
import sys

EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_TREE = os.environ["EXPECTED_TREE"]
LIVE_MAIN = os.environ["LIVE_MAIN"]
LIVE_TREE = os.environ["LIVE_TREE"]
TASK_ID = os.environ["TASK_ID"]
PERFORMER = os.environ["EXPECTED_PERFORMER"]
CHARACTER = os.environ["EXPECTED_CHARACTER"]
FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
WALL_ID = os.environ["WALL_ID"]
ALICE_WALL_ID = os.environ["ALICE_WALL_ID"]
OUT = Path(os.environ["OUT"])
REVIEW_ROOT = Path(os.environ["REVIEW_ROOT"])
MEDIA_ROOT = Path(os.environ["MEDIA_ROOT"])
BATCH = Path(os.environ["BATCH"])
EXPECTED_LEASE = os.environ["EXPECTED_LEASE"]


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
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def sha(value: Any) -> str:
    return hashlib.sha256((json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n").encode()).hexdigest()


def walk(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)


def tasks(state: dict[str, Any]) -> list[dict[str, Any]]:
    return [row for row in state.get("jobs", []) if row.get("scope") == "star-trek"]


def task(state: dict[str, Any]) -> dict[str, Any]:
    rows = [row for row in tasks(state) if row.get("id") == TASK_ID]
    if len(rows) != 1:
        raise SystemExit(f"Benbassat task cardinality drifted: {len(rows)}")
    return rows[0]


def counts(state: dict[str, Any]) -> dict[str, int]:
    rows = tasks(state)
    return {
        "total": len(rows),
        "queued": sum(row.get("status") == "queued" for row in rows),
        "resolved": sum(row.get("status") == "resolved" for row in rows),
        "blocked": sum(row.get("status") == "blocked" for row in rows),
        "rejected": sum(row.get("status") == "rejected" for row in rows),
        "in_flight": sum(row.get("status") in {"leased", "drafted", "merged"} for row in rows),
    }


def exact_record() -> dict[str, Any]:
    specimens = read_json(Path("data/specimens.json"))
    alice = [row for row in specimens if row.get("id") == ALICE_WALL_ID]
    if len(alice) != 1:
        raise SystemExit(f"Alice template cardinality drifted: {len(alice)}")
    if any(row.get("id") == WALL_ID for row in specimens):
        raise SystemExit(f"reserved wall id already exists: {WALL_ID}")
    row = deepcopy(alice[0])
    row.update({
        "id": WALL_ID,
        "character": CHARACTER,
        "actor": PERFORMER,
        "production": "Võx",
        "universe": "Star Trek",
        "years": "2023",
        "designer": "—",
        "transform": 2,
        "knownFor": "Nolan North’s off-screen voiceover as Captain Benbassat in the Star Trek: Picard episode Võx (2023).",
        "reveal": "The frozen Benbassat source credits Nolan North for the character and binds the role to the Star Trek: Picard episode Võx. The episode source identifies North as Benbassat’s voice during the Excelsior emergency transmission. This record is limited to North’s off-screen voiceover. The queued physical-prosthetic hint is rejected; physical performance, prosthetic work, character design, voice direction, vocal processing, sound, editing, production-shop labor, transformation measurement, and every unsupported maker function remain unresolved.",
        "references": [
            {"claim": "performance", "label": "The Benbassat source credits Nolan North as the character’s voice", "publisher": "Memory Alpha", "source": "https://memory-alpha.fandom.com/wiki/Benbassat"},
            {"claim": "production", "label": "Võx identifies Nolan North as Captain Benbassat’s voice in the 2023 Star Trek: Picard episode", "publisher": "Memory Alpha", "source": "https://memory-alpha.fandom.com/wiki/V%C3%B5x_(episode)"},
        ],
        "link": "https://memory-alpha.fandom.com/wiki/Benbassat",
        "wiki": "https://memory-alpha.fandom.com/wiki/Benbassat",
        "kind": "voice",
    })
    row.pop("still", None)
    row.pop("portrait", None)
    return row


def prepare() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    state = read_json(Path("data/AUTOPILOT.json"))
    current = task(state)
    queue = counts(state)
    expected = {"total": 2228, "queued": 1797, "resolved": 428, "blocked": 0, "rejected": 2, "in_flight": 1}
    if current.get("status") != "leased" or not current.get("lease", {}).get("id"):
        raise SystemExit("Benbassat is not the durable leased task")
    if queue != expected:
        raise SystemExit(f"leased queue drifted: {queue}")
    if read_json(Path("data/drafts.json")) != []:
        raise SystemExit("data/drafts.json is not empty before the bounded submission")
    batch = read_json(BATCH)
    if batch.get("lease_id") != current["lease"]["id"] or batch.get("agent") != current["lease"]["agent"]:
        raise SystemExit("recovered batch does not match the durable lease")
    if len(batch.get("tasks") or []) != 1 or batch["tasks"][0].get("id") != TASK_ID:
        raise SystemExit("recovered batch does not contain exactly Benbassat")
    if batch["tasks"][0].get("source_fingerprint") != FINGERPRINT:
        raise SystemExit("recovered batch source fingerprint drifted")
    record = exact_record()
    result = {"version": 1, "lease_id": batch["lease_id"], "agent": batch["agent"], "results": [{"task_id": TASK_ID, "decision": "draft", "draft": record}]}
    write_json(OUT / "record.json", record)
    write_json(OUT / "results.json", result)
    write_json(OUT / "prepared-state.json", {"task": current, "counts": queue, "batch_sha256": hashlib.sha256(BATCH.read_bytes()).hexdigest()})


def add_absent_media_facets() -> None:
    source_review = read_json(REVIEW_ROOT / "source-review.json")
    media_receipt = read_json(MEDIA_ROOT / "media-receipt.json")
    media_path = Path("data/MEDIA-AUDIT.json")
    media_state = read_json(media_path)
    if any(row.get("wall_id") == WALL_ID for row in walk(media_state)):
        raise SystemExit(f"media state already contains {WALL_ID}")
    alice_facets = [row for row in walk(media_state) if row.get("wall_id") == ALICE_WALL_ID and row.get("side") in {"still", "portrait"}]
    if len(alice_facets) != 2:
        raise SystemExit(f"Alice media template cardinality drifted: {len(alice_facets)}")
    parents = []
    def locate(node: Any):
        if isinstance(node, list):
            if any(isinstance(item, dict) and item.get("wall_id") == ALICE_WALL_ID and item.get("side") in {"still", "portrait"} for item in node):
                parents.append(node)
            for item in node:
                locate(item)
        elif isinstance(node, dict):
            for item in node.values():
                locate(item)
    locate(media_state)
    if len({id(parent) for parent in parents}) != 1:
        raise SystemExit("Alice media facet parent is ambiguous")
    parent = parents[0]
    for template in sorted(alice_facets, key=lambda row: row["side"]):
        side = template["side"]
        facet = deepcopy(template)
        facet.update({
            "id": "ma_" + hashlib.sha256(f"{TASK_ID}:{WALL_ID}:{side}".encode()).hexdigest()[:24],
            "scope": "star-trek",
            "wall_id": WALL_ID,
            "side": side,
            "actor": PERFORMER,
            "character": CHARACTER,
            "expected_subject": PERFORMER if side == "portrait" else CHARACTER,
            "source_fetched_at": source_review["reviewed_at"][:10],
            "asset": None,
            "risk_codes": [],
            "votes": [],
            "status": "absent",
            "claims": {},
            "reason": media_receipt["facets"][side]["reason"],
        })
        parent.append(facet)
    write_json(media_path, media_state)


def postgrow() -> None:
    state = read_json(Path("data/AUTOPILOT.json"))
    current = task(state)
    queue = counts(state)
    expected = {"total": 2228, "queued": 1797, "resolved": 428, "blocked": 0, "rejected": 2, "in_flight": 1}
    if current.get("status") != "merged" or current.get("wall_ids") != [WALL_ID]:
        raise SystemExit(f"Benbassat did not reach merged media-review state: {current.get('status')} {current.get('wall_ids')}")
    if queue != expected:
        raise SystemExit(f"merged queue drifted: {queue}")
    if read_json(Path("data/drafts.json")) != []:
        raise SystemExit("grow.mjs did not consume the bounded draft")
    records = [row for row in read_json(Path("data/specimens.json")) if row.get("id") == WALL_ID]
    if len(records) != 1:
        raise SystemExit(f"Benbassat record cardinality drifted: {len(records)}")
    record = records[0]
    required = {"actor": PERFORMER, "character": CHARACTER, "production": "Võx", "universe": "Star Trek", "years": "2023", "kind": "voice"}
    for key, value in required.items():
        if record.get(key) != value:
            raise SystemExit(f"Benbassat record {key} drifted: {record.get(key)}")
    if "still" in record or "portrait" in record:
        raise SystemExit("honest media absence was not preserved in the record")
    # media:audit sync derives absent facets and their receipts from specimens and SOURCES.
    media_receipt = read_json(MEDIA_ROOT / "media-receipt.json")
    review = {
        "version": 1,
        "reviewed_by": "chatgpt-benbassat-candidate-producer",
        "lease_id": current.get("outcome", {}).get("lease_id"),
        "reviews": [{"task_id": TASK_ID, "records": [{"wall_id": WALL_ID, "still": {"disposition": "absent", "note": media_receipt["facets"]["still"]["reason"]}, "portrait": {"disposition": "absent", "note": media_receipt["facets"]["portrait"]["reason"]}}]}],
    }
    if not review["lease_id"]:
        raise SystemExit("merged task lacks its originating lease receipt")
    write_json(OUT / "media-review.json", review)
    write_json(OUT / "merged-state.json", {"task": current, "counts": queue, "record": record})


def stamp_sources() -> None:
    source_review = read_json(REVIEW_ROOT / "source-review.json")
    path = Path("data/SOURCES.json")
    ledger = read_json(path)
    rows = [row for row in ledger if row.get("id") == WALL_ID]
    if len(rows) != 1:
        raise SystemExit(f"SOURCES Benbassat row cardinality drifted: {len(rows)}")
    row = rows[0]
    if row.get("actor") != PERFORMER or row.get("character") != CHARACTER:
        raise SystemExit("SOURCES Benbassat identity drifted")
    if row.get("still") is not None or row.get("portrait") is not None:
        raise SystemExit("SOURCES does not preserve honest media absence")
    row["fetched_at"] = source_review["reviewed_at"][:10]
    write_json(path, ledger)


def receipt() -> None:
    state = read_json(Path("data/AUTOPILOT.json"))
    current = task(state)
    queue = counts(state)
    expected = {"total": 2228, "queued": 1797, "resolved": 429, "blocked": 0, "rejected": 2, "in_flight": 0}
    if current.get("status") != "resolved" or current.get("wall_ids") != [WALL_ID]:
        raise SystemExit("Benbassat is not resolved to the reserved wall id")
    if queue != expected:
        raise SystemExit(f"resolved queue drifted: {queue}")
    record = [row for row in read_json(Path("data/specimens.json")) if row.get("id") == WALL_ID]
    if len(record) != 1:
        raise SystemExit("Benbassat canonical candidate record is missing")
    source_review = read_json(REVIEW_ROOT / "source-review.json")
    media_receipt = read_json(MEDIA_ROOT / "media-receipt.json")
    lease_id = current.get("outcome", {}).get("media_review", {}).get("lease_id")
    if lease_id != EXPECTED_LEASE:
        raise SystemExit(f"resolved media review lease drifted: {lease_id}")
    candidate = {
        "version": 3,
        "transaction": "STAR-TREK-BENBASSAT-CANDIDATE-V3",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "candidate-ready-for-independent-review",
        "canonical_parent": EXPECTED_MAIN,
        "canonical_tree": EXPECTED_TREE,
        "publication_base": {"commit": LIVE_MAIN, "tree": LIVE_TREE, "kind": "product-neutral-media-search-maintenance"},
        "claim_commit": os.environ["CLAIM_COMMIT"],
        "task": {"id": TASK_ID, "lease_id": lease_id, "performer": PERFORMER, "character": CHARACTER, "source_fingerprint": FINGERPRINT, "status": current.get("status"), "attempts": current.get("attempts"), "wall_ids": current.get("wall_ids")},
        "canonical_record": {"wall_id": WALL_ID, "record": record[0], "record_sha256": sha(record[0])},
        "source_review": {"branch": os.environ["SOURCE_REVIEW_BRANCH"], "review_sha256": source_review["review_sha256"], "verdict": source_review["verdict"], "production": "Star Trek: Picard", "episode": "Võx", "first_aired": "13 April 2023", "performance_mode": "voice-only"},
        "media": {"branch": os.environ["MEDIA_BRANCH"], "receipt_sha256": media_receipt["receipt_sha256"], "facets": {"still": media_receipt["facets"]["still"], "portrait": media_receipt["facets"]["portrait"]}},
        "queue": queue,
        "transition": {"batch_sha256": hashlib.sha256(BATCH.read_bytes()).hexdigest(), "submit_command": (OUT / "submit-command.txt").read_text().strip(), "grow_command": (OUT / "grow-command.txt").read_text().strip(), "sync_command": (OUT / "sync-command.txt").read_text().strip(), "complete_command": (OUT / "complete-command.txt").read_text().strip()},
        "changed_paths": subprocess.check_output(["git", "diff", "--name-only", os.environ["CLAIM_COMMIT"], "--"], text=True).splitlines(),
        "boundary": {"off_screen_voiceover": True, "physical_prosthetic_hint_accepted": False, "physical_performance_attributed": False, "prosthetic_performance_attributed": False, "animation_performance_attributed": False, "maker_attribution": "unresolved", "transformation_measured": False, "honest_media_absence": True, "cross_facet_substitution": False, "independent_product_review_complete": False, "waterline_cycle_recorded": False, "canonical_mutation": False, "additional_lease_issued": False},
    }
    candidate["receipt_sha256"] = sha(candidate)
    write_json(Path("data/review/adapter-sdk/star-trek-benbassat-candidate.json"), stable(candidate))
    write_json(OUT / "candidate-receipt.json", stable(candidate))


MODES = {"prepare": prepare, "postgrow": postgrow, "stamp-sources": stamp_sources, "receipt": receipt}
if len(sys.argv) != 2 or sys.argv[1] not in MODES:
    raise SystemExit("usage: candidate-lifecycle.py <prepare|postgrow|stamp-sources|receipt>")
MODES[sys.argv[1]]()
