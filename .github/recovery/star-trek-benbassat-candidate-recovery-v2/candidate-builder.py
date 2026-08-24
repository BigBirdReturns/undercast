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
TASK_ID = os.environ["TASK_ID"]
PERFORMER = os.environ["EXPECTED_PERFORMER"]
CHARACTER = os.environ["EXPECTED_CHARACTER"]
FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
WALL_ID = os.environ["WALL_ID"]
ALICE_TASK_ID = os.environ["ALICE_TASK_ID"]
ALICE_WALL_ID = os.environ["ALICE_WALL_ID"]
OUT = Path(os.environ["OUT"])
REVIEW_ROOT = Path(os.environ["REVIEW_ROOT"])
MEDIA_ROOT = Path(os.environ["MEDIA_ROOT"])


def stable(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def digest(value: Any) -> str:
    body = (json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n").encode()
    return hashlib.sha256(body).hexdigest()


def replace(value: Any, mapping: dict[str, str]) -> Any:
    if isinstance(value, str):
        result = value
        for old, new in mapping.items():
            if old:
                result = result.replace(old, new)
        return result
    if isinstance(value, list):
        return [replace(item, mapping) for item in value]
    if isinstance(value, dict):
        return {key: replace(item, mapping) for key, item in value.items()}
    return value


def hits(node: Any, predicate, parent=None, key=None):
    found = []
    if isinstance(node, dict):
        if predicate(node):
            found.append((node, parent, key))
        for child_key, child in node.items():
            found.extend(hits(child, predicate, node, child_key))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            found.extend(hits(child, predicate, node, index))
    return found


def task_by_id(state: dict[str, Any], task_id: str) -> dict[str, Any]:
    rows = [row for row in state.get("jobs", []) if row.get("id") == task_id]
    if len(rows) != 1:
        raise SystemExit(f"task cardinality drifted for {task_id}: {len(rows)}")
    return rows[0]


def queue(state: dict[str, Any]) -> dict[str, int]:
    rows = [row for row in state.get("jobs", []) if row.get("scope") == "star-trek"]
    return {
        "total": len(rows),
        "queued": sum(row.get("status") == "queued" for row in rows),
        "resolved": sum(row.get("status") == "resolved" for row in rows),
        "blocked": sum(row.get("status") == "blocked" for row in rows),
        "rejected": sum(row.get("status") == "rejected" for row in rows),
        "in_flight": sum(row.get("status") in {"leased", "drafted", "merged"} for row in rows),
    }


def prepare() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    source_review = read_json(REVIEW_ROOT / "source-review.json")
    media_receipt = read_json(MEDIA_ROOT / "media-receipt.json")
    state_path = Path("data/AUTOPILOT.json")
    state = read_json(state_path)
    task = task_by_id(state, TASK_ID)
    alice = task_by_id(state, ALICE_TASK_ID)
    if task.get("status") != "leased" or not task.get("lease", {}).get("id"):
        raise SystemExit("Benbassat is not the durable leased task")
    counts = queue(state)
    if counts != {"total": 2228, "queued": 1797, "resolved": 428, "blocked": 0, "rejected": 2, "in_flight": 1}:
        raise SystemExit(f"leased queue drifted: {counts}")

    mapping = {
        ALICE_WALL_ID: WALL_ID,
        str(alice.get("id") or ""): TASK_ID,
        str(alice.get("source_fingerprint") or ""): FINGERPRINT,
        str((alice.get("lease") or {}).get("id") or ""): task["lease"]["id"],
        "Nichelle Nichols": PERFORMER,
        "Alice (character)": CHARACTER,
        "https://memory-alpha.fandom.com/wiki/Alice_(character)": "https://memory-alpha.fandom.com/wiki/Benbassat",
        "https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)": "https://memory-alpha.fandom.com/wiki/V%C3%B5x_(episode)",
    }

    specimens_path = Path("data/specimens.json")
    specimens = read_json(specimens_path)
    record_hits = hits(specimens, lambda obj: obj.get("id") == ALICE_WALL_ID)
    record_hits = [item for item in record_hits if isinstance(item[1], list)]
    if len(record_hits) != 1:
        raise SystemExit(f"Alice record cardinality drifted: {len(record_hits)}")
    alice_record, record_parent, record_index = record_hits[0]
    if hits(specimens, lambda obj: obj.get("id") == WALL_ID):
        raise SystemExit(f"{WALL_ID} is already occupied")
    record = replace(deepcopy(alice_record), mapping)
    record.update({
        "id": WALL_ID,
        "character": CHARACTER,
        "actor": PERFORMER,
        "production": "Võx",
        "universe": "Star Trek",
        "years": "2023",
        "designer": "—",
        "knownFor": "Nolan North’s off-screen voiceover as Captain Benbassat in the Star Trek: Picard episode Võx (2023).",
        "reveal": "The frozen Benbassat source credits Nolan North for the character and binds the role to the Star Trek: Picard episode Võx. The episode source identifies North as Benbassat’s voice during the Excelsior emergency transmission. This record is limited to North’s off-screen voiceover. The queued physical-prosthetic hint is rejected; physical performance, prosthetic work, character design, voice direction, vocal processing, sound, editing, production-shop labor, transformation measurement, and every unsupported maker function remain unresolved.",
        "references": [
            {"claim": "performance", "label": "The Benbassat source credits Nolan North as the character’s voice", "publisher": "Memory Alpha", "source": "https://memory-alpha.fandom.com/wiki/Benbassat"},
            {"claim": "production", "label": "Võx identifies Nolan North as Captain Benbassat’s voice in the 2023 Star Trek: Picard episode", "publisher": "Memory Alpha", "source": "https://memory-alpha.fandom.com/wiki/V%C3%B5x_(episode)"},
        ],
        "link": "https://memory-alpha.fandom.com/wiki/Benbassat",
        "kind": "voice",
    })
    record.pop("still", None)
    record.pop("portrait", None)
    record_parent.insert(int(record_index) + 1, record)
    write_json(specimens_path, specimens)

    media_path = Path("data/MEDIA-AUDIT.json")
    media_state = read_json(media_path)
    facet_hits = hits(media_state, lambda obj: obj.get("wall_id") == ALICE_WALL_ID and obj.get("side") in {"still", "portrait"})
    if len(facet_hits) != 2 or len({id(parent) for _, parent, _ in facet_hits}) != 1:
        raise SystemExit("Alice media facet custody drifted")
    media_parent = facet_hits[0][1]
    if not isinstance(media_parent, list):
        raise SystemExit("Alice media facet parent is not a list")
    source_date = source_review["reviewed_at"][:10]
    for template, _, _ in sorted(facet_hits, key=lambda item: item[0]["side"]):
        side = template["side"]
        facet = replace(deepcopy(template), mapping)
        facet.update({
            "id": "ma_" + hashlib.sha256(f"{TASK_ID}:{WALL_ID}:{side}".encode()).hexdigest()[:24],
            "scope": "star-trek",
            "wall_id": WALL_ID,
            "side": side,
            "actor": PERFORMER,
            "character": CHARACTER,
            "expected_subject": PERFORMER if side == "portrait" else CHARACTER,
            "source_fetched_at": source_date,
            "asset": None,
            "risk_codes": [],
            "votes": [],
            "status": "absent",
            "claims": {},
            "reason": media_receipt["facets"][side]["reason"],
        })
        media_parent.append(facet)
    write_json(media_path, media_state)

    product_media = {
        side: {"status": "absent", "reason": media_receipt["facets"][side]["reason"]}
        for side in ("still", "portrait")
    }
    common = {
        "task_id": TASK_ID,
        "lease_id": task["lease"]["id"],
        "readiness_token": task["lease"].get("readiness_token"),
        "source_fingerprint": FINGERPRINT,
        "performer": PERFORMER,
        "character": CHARACTER,
        "wall_id": WALL_ID,
        "wall_ids": [WALL_ID],
        "performance_mode": "voice-only",
        "record": record,
        "sources": ["https://memory-alpha.fandom.com/wiki/Benbassat", "https://memory-alpha.fandom.com/wiki/V%C3%B5x_(episode)"],
        "media": product_media,
        "source_review_sha256": source_review["review_sha256"],
        "media_receipt_sha256": media_receipt["receipt_sha256"],
    }
    draft = replace(deepcopy(alice.get("draft") or {}), mapping)
    draft.update(common)
    draft["status"] = "ready"
    draft["notes"] = "Nolan North’s Benbassat performance is an off-screen voiceover in Star Trek: Picard’s Võx; the physical-prosthetic hint and unsupported maker functions remain rejected or unresolved."
    submission = dict(common)
    submission.update({"version": 2, "transaction": "STAR-TREK-BENBASSAT-SUBMISSION-V2", "draft": draft, "result": draft, "submission": draft})

    review = replace(deepcopy(alice.get("outcome_review") or {}), mapping)
    review.update(common)
    review.update({
        "version": 2,
        "transaction": "STAR-TREK-BENBASSAT-COMPLETION-REVIEW-V2",
        "verdict": "pass",
        "reviewer": "chatgpt-benbassat-candidate-producer",
        "reviewed_role": "producer",
        "status": "resolved",
        "resolved": True,
        "physical_performance_attributed": False,
        "prosthetic_performance_attributed": False,
        "animation_performance_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
        "additional_lease_issued": False,
        "canonical_mutation": False,
    })
    outcome = dict(common)
    outcome.update({"version": 2, "transaction": "STAR-TREK-BENBASSAT-COMPLETION-REVIEW-V2", "verdict": "pass", "review": review, "outcome": review, "completion": review, "media_review": review, "result": review})

    write_json(OUT / "record.json", record)
    write_json(OUT / "product-media.json", product_media)
    write_json(OUT / "submission.json", submission)
    write_json(OUT / "outcome-review.json", outcome)
    write_json(OUT / "prepared-state.json", {"task": task, "alice_task": alice, "counts": counts})


def receipt() -> None:
    state = read_json(Path("data/AUTOPILOT.json"))
    task = task_by_id(state, TASK_ID)
    counts = queue(state)
    if task.get("status") != "resolved" or task.get("wall_ids") != [WALL_ID]:
        raise SystemExit("Benbassat task did not resolve to the reserved wall id")
    if counts != {"total": 2228, "queued": 1797, "resolved": 429, "blocked": 0, "rejected": 2, "in_flight": 0}:
        raise SystemExit(f"resolved queue drifted: {counts}")
    record = read_json(OUT / "record.json")
    source_review = read_json(REVIEW_ROOT / "source-review.json")
    media_receipt = read_json(MEDIA_ROOT / "media-receipt.json")
    candidate = {
        "version": 2,
        "transaction": "STAR-TREK-BENBASSAT-CANDIDATE-V2",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "candidate-ready-for-independent-review",
        "canonical_parent": EXPECTED_MAIN,
        "canonical_tree": EXPECTED_TREE,
        "claim_commit": os.environ["CLAIM_COMMIT"],
        "task": {"id": TASK_ID, "lease_id": task.get("lease", {}).get("id"), "performer": PERFORMER, "character": CHARACTER, "source_fingerprint": FINGERPRINT, "status": task.get("status"), "attempts": task.get("attempts"), "wall_ids": task.get("wall_ids")},
        "canonical_record": {"wall_id": WALL_ID, "record": record, "record_sha256": digest(record)},
        "source_review": {"branch": os.environ["SOURCE_REVIEW_BRANCH"], "review_sha256": source_review["review_sha256"], "verdict": source_review["verdict"], "production": "Star Trek: Picard", "episode": "Võx", "first_aired": "13 April 2023", "performance_mode": "voice-only"},
        "media": {"branch": os.environ["MEDIA_BRANCH"], "receipt_sha256": media_receipt["receipt_sha256"], "facets": read_json(OUT / "product-media.json")},
        "queue": counts,
        "transition": {"submit_command": (OUT / "submit-command.txt").read_text().strip(), "complete_command": (OUT / "complete-command.txt").read_text().strip()},
        "changed_paths": subprocess.check_output(["git", "diff", "--name-only", os.environ["CLAIM_COMMIT"], "--"], text=True).splitlines(),
        "boundary": {"off_screen_voiceover": True, "physical_prosthetic_hint_accepted": False, "physical_performance_attributed": False, "prosthetic_performance_attributed": False, "animation_performance_attributed": False, "maker_attribution": "unresolved", "transformation_measured": False, "honest_media_absence": True, "independent_product_review_complete": False, "waterline_cycle_recorded": False, "canonical_mutation": False, "additional_lease_issued": False},
    }
    candidate["receipt_sha256"] = digest(candidate)
    write_json(Path("data/review/adapter-sdk/star-trek-benbassat-candidate.json"), stable(candidate))
    write_json(OUT / "candidate-receipt.json", stable(candidate))


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "receipt"}:
        raise SystemExit("usage: candidate-builder.py <prepare|receipt>")
    prepare() if sys.argv[1] == "prepare" else receipt()
