#!/usr/bin/env python3
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

EXPECTED_MAIN = os.environ["EXPECTED_MAIN"]
EXPECTED_TREE = os.environ["EXPECTED_TREE"]
TASK_ID = os.environ["TASK_ID"]
EXPECTED_PERFORMER = os.environ["EXPECTED_PERFORMER"]
EXPECTED_CHARACTER = os.environ["EXPECTED_CHARACTER"]
EXPECTED_FINGERPRINT = os.environ["EXPECTED_FINGERPRINT"]
WALL_ID = os.environ["WALL_ID"]
ALICE_TASK_ID = os.environ["ALICE_TASK_ID"]
ALICE_WALL_ID = os.environ["ALICE_WALL_ID"]
OUT = Path(os.environ["OUT"])
REVIEW_ROOT = Path(os.environ["REVIEW_ROOT"])
MEDIA_ROOT = Path(os.environ["MEDIA_ROOT"])


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


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def recursive_hits(node: Any, predicate: Callable[[dict[str, Any]], bool], pointer: str = "", parent: Any = None, key: Any = None):
    hits: list[tuple[dict[str, Any], Any, Any, str]] = []
    if isinstance(node, dict):
        if predicate(node):
            hits.append((node, parent, key, pointer or "/"))
        for child_key, child in node.items():
            hits.extend(recursive_hits(child, predicate, f"{pointer}/{child_key}", node, child_key))
    elif isinstance(node, list):
        for index, child in enumerate(node):
            hits.extend(recursive_hits(child, predicate, f"{pointer}/{index}", node, index))
    return hits


def json_candidates(predicate: Callable[[dict[str, Any]], bool]):
    candidates = []
    for path in Path("data").rglob("*.json"):
        if not path.is_file():
            continue
        try:
            payload = load_json(path)
        except Exception:
            continue
        for obj, parent, key, pointer in recursive_hits(payload, predicate):
            candidates.append({"path": path, "payload": payload, "object": obj, "parent": parent, "key": key, "pointer": pointer})
    return candidates


def score_primary(path: Path, alice_product_paths: set[str], media: bool = False) -> int:
    lower = str(path).lower()
    parts = {part.lower() for part in path.parts}
    score = 0
    if str(path) in alice_product_paths:
        score += 200
    if path.parent == Path("data"):
        score += 80
    basename = path.name.lower()
    if media and "media-audit" in basename:
        score += 150
    if not media and basename in {"data.json", "records.json", "specimens.json", "undercast.json", "wall.json", "cards.json"}:
        score += 150
    if any(token in parts or token in lower for token in ("review", "archive", "shard", "generated", "search", "contract", "site", "census")):
        score -= 120
    return score


def replace_strings(value: Any, replacements: dict[str, str]) -> Any:
    if isinstance(value, str):
        output = value
        for old, new in replacements.items():
            output = output.replace(old, new)
        return output
    if isinstance(value, list):
        return [replace_strings(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: replace_strings(item, replacements) for key, item in value.items()}
    return value


def find_task(state: dict[str, Any], task_id: str) -> dict[str, Any]:
    matches = [row for row in state.get("jobs", []) if row.get("id") == task_id]
    if len(matches) != 1:
        raise SystemExit(f"task cardinality drifted for {task_id}: {len(matches)}")
    return matches[0]


def queue_counts(state: dict[str, Any]) -> dict[str, int]:
    trek = [row for row in state.get("jobs", []) if row.get("scope") == "star-trek"]
    return {
        "total": len(trek),
        "queued": sum(row.get("status") == "queued" for row in trek),
        "resolved": sum(row.get("status") == "resolved" for row in trek),
        "blocked": sum(row.get("status") == "blocked" for row in trek),
        "rejected": sum(row.get("status") == "rejected" for row in trek),
        "in_flight": sum(row.get("status") in {"leased", "drafted", "merged"} for row in trek),
    }


def prepare() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    media_receipt = load_json(MEDIA_ROOT / "media-receipt.json")
    source_review = load_json(REVIEW_ROOT / "source-review.json")
    state_path = Path("data/AUTOPILOT.json")
    state = load_json(state_path)
    task = find_task(state, TASK_ID)
    alice_task = find_task(state, ALICE_TASK_ID)
    if task.get("status") != "leased" or not task.get("lease", {}).get("id"):
        raise SystemExit("Benbassat is not the durable leased task")
    counts = queue_counts(state)
    expected_counts = {"total": 2228, "queued": 1797, "resolved": 428, "blocked": 0, "rejected": 2, "in_flight": 1}
    if counts != expected_counts:
        raise SystemExit(f"leased queue drifted: {counts}")

    alice_product_paths = set((OUT / "alice-product-paths.txt").read_text().splitlines())
    record_predicate = lambda obj: obj.get("id") == ALICE_WALL_ID and {"character", "actor", "production", "universe", "knownFor", "reveal", "references", "kind"}.issubset(obj)
    record_hits = json_candidates(record_predicate)
    if not record_hits:
        raise SystemExit("Alice canonical record was not found")
    record_hits.sort(key=lambda hit: (-score_primary(hit["path"], alice_product_paths, media=False), str(hit["path"]), hit["pointer"]))
    record_hit = record_hits[0]
    if not isinstance(record_hit["parent"], list):
        raise SystemExit(f"primary record parent is not a list: {record_hit['path']} {record_hit['pointer']}")
    max_score = score_primary(record_hit["path"], alice_product_paths, media=False)
    tied = [hit for hit in record_hits if score_primary(hit["path"], alice_product_paths, media=False) == max_score]
    if len({str(hit["path"]) for hit in tied}) != 1:
        raise SystemExit(f"primary record path is ambiguous: {[str(hit['path']) for hit in tied]}")
    for hit in json_candidates(lambda obj: obj.get("id") == WALL_ID):
        if "review" not in str(hit["path"]).lower():
            raise SystemExit(f"reserved wall id already exists at {hit['path']} {hit['pointer']}")

    still = media_receipt["facets"]["still"]
    portrait = media_receipt["facets"]["portrait"]
    replacements = {
        ALICE_WALL_ID: WALL_ID,
        "Nichelle Nichols": EXPECTED_PERFORMER,
        "Alice (character)": EXPECTED_CHARACTER,
        "https://memory-alpha.fandom.com/wiki/Alice_(character)": "https://memory-alpha.fandom.com/wiki/Benbassat",
        "https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)": "https://memory-alpha.fandom.com/wiki/Star_Trek:_Prodigy",
    }
    record = replace_strings(deepcopy(record_hit["object"]), replacements)
    record.update({
        "id": WALL_ID,
        "character": EXPECTED_CHARACTER,
        "actor": EXPECTED_PERFORMER,
        "production": "Star Trek: Prodigy",
        "universe": "Star Trek",
        "years": "2020s",
        "designer": "—",
        "knownFor": "The animated Benbassat performance credited to Nolan North in Star Trek: Prodigy.",
        "reveal": "The frozen Benbassat source credits Nolan North and binds the role to Star Trek: Prodigy. A separately frozen production source identifies Prodigy as animated, so this record is limited to North’s voice performance. The queued physical-prosthetic hint is rejected. The exact character image and a separately sourced licensed performer portrait are retained when verified; physical performance, prosthetic work, animation labor, character design, voice direction, vocal processing, sound, transformation measurement, and every other unsupported maker function remain unresolved.",
        "references": [
            {
                "claim": "performance",
                "label": "The Benbassat source credits Nolan North for the character",
                "publisher": "Memory Alpha",
                "source": "https://memory-alpha.fandom.com/wiki/Benbassat",
            },
            {
                "claim": "production",
                "label": "The Star Trek: Prodigy source identifies the production as animated",
                "publisher": "Memory Alpha",
                "source": "https://memory-alpha.fandom.com/wiki/Star_Trek:_Prodigy",
            },
        ],
        "link": "https://memory-alpha.fandom.com/wiki/Benbassat",
        "kind": "voice",
    })

    product_media: dict[str, Any] = {}
    for side, facet in (("still", still), ("portrait", portrait)):
        if facet.get("status") != "verified":
            record.pop(side, None)
            product_media[side] = {"status": "absent", "reason": facet.get("reason")}
            continue
        source_path = MEDIA_ROOT / facet["path"]
        if not source_path.is_file():
            raise SystemExit(f"media file missing: {source_path}")
        if sha256_file(source_path) != facet["sha256"]:
            raise SystemExit(f"media digest drifted for {side}")
        suffix = source_path.suffix.lower()
        destination = Path("images") / f"{WALL_ID.lower()}-{side}{suffix}"
        if destination.exists():
            raise SystemExit(f"destination already exists: {destination}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination)
        entry: dict[str, Any] = {
            "src": str(destination),
            "kind": "still" if side == "still" else "free",
            "origin": facet["source_file"],
            "focus": {"x": "center", "y": "center" if side == "still" else "upper"},
            "pin": True,
        }
        if side == "portrait":
            if facet.get("author"):
                entry["author"] = facet["author"]
            if facet.get("license"):
                entry["license"] = facet["license"]
        record[side] = entry
        product_media[side] = {
            "status": "verified",
            "path": str(destination),
            "sha256": facet["sha256"],
            "bytes": facet["bytes"],
            "origin": facet["source_file"],
            "kind": entry["kind"],
            "author": facet.get("author"),
            "license": facet.get("license"),
        }

    record_hit["parent"].insert(record_hit["key"] + 1, record)
    write_json(record_hit["path"], record_hit["payload"])
    (OUT / "primary-record-path.txt").write_text(str(record_hit["path"]) + "\n")
    write_json(OUT / "record.json", record)

    facet_hits = json_candidates(lambda obj: obj.get("wall_id") == ALICE_WALL_ID and obj.get("side") in {"still", "portrait"} and "expected_subject" in obj)
    if len(facet_hits) < 2:
        raise SystemExit("Alice media facets were not found")
    by_file: dict[str, list[dict[str, Any]]] = {}
    for hit in facet_hits:
        by_file.setdefault(str(hit["path"]), []).append(hit)
    ranked = sorted(by_file.items(), key=lambda item: (-score_primary(Path(item[0]), alice_product_paths, media=True), item[0]))
    media_path_text, media_hits = ranked[0]
    if {hit["object"].get("side") for hit in media_hits} != {"still", "portrait"}:
        raise SystemExit(f"primary media facet file lacks both Alice sides: {media_path_text}")
    media_path = Path(media_path_text)
    media_payload = load_json(media_path)
    current_hits = recursive_hits(media_payload, lambda obj: obj.get("wall_id") == ALICE_WALL_ID and obj.get("side") in {"still", "portrait"} and "expected_subject" in obj)
    templates = {obj["side"]: obj for obj, _, _, _ in current_hits}
    list_parents = {(id(parent), pointer.rsplit("/", 1)[0]): parent for _, parent, _, pointer in current_hits if isinstance(parent, list)}
    if len(list_parents) != 1:
        raise SystemExit(f"media facet parent is ambiguous in {media_path}")
    parent_list = next(iter(list_parents.values()))
    source_date = source_review["reviewed_at"][:10]

    for side in ("portrait", "still"):
        facet_source = portrait if side == "portrait" else still
        template = replace_strings(deepcopy(templates[side]), replacements)
        template["id"] = "ma_" + hashlib.sha256(f"{TASK_ID}:{WALL_ID}:{side}".encode()).hexdigest()[:24]
        template["scope"] = "star-trek"
        template["wall_id"] = WALL_ID
        template["side"] = side
        template["actor"] = EXPECTED_PERFORMER
        template["character"] = EXPECTED_CHARACTER
        template["expected_subject"] = EXPECTED_PERFORMER if side == "portrait" else EXPECTED_CHARACTER
        template["source_fetched_at"] = source_date
        template["risk_codes"] = []
        if facet_source.get("status") == "verified":
            asset = product_media[side]
            template["asset"] = {
                "src": asset["path"],
                "sha256": asset["sha256"],
                "bytes": asset["bytes"],
                "origin": asset["origin"],
                "kind": asset["kind"],
            }
            template["status"] = "verified"
            identity_note = (
                "The licensed Commons source identifies Nolan North and supports performer identity only."
                if side == "portrait"
                else "The frozen Benbassat character page selected this exact image as its page image and supports character identity only."
            )
            presentation = "neutral-human" if side == "portrait" else "exact-character"
            template["votes"] = [
                {
                    "reviewer": "chatgpt-benbassat-source-review",
                    "role": "second-desk",
                    "namespace": "identity",
                    "value": "expected",
                    "note": identity_note,
                    "evidence": [
                        f"source-file:{asset['origin']}",
                        f"asset-sha256:{asset['sha256']}",
                        f"source-review:{source_review['review_sha256']}",
                    ],
                    "enforced": True,
                    "at": source_review["reviewed_at"],
                    "asset_sha256": asset["sha256"],
                },
                {
                    "reviewer": "chatgpt-benbassat-source-review",
                    "role": "second-desk",
                    "namespace": "presentation",
                    "value": presentation,
                    "note": (
                        "The performer image is a neutral human portrait and is source-distinct and byte-distinct from the Benbassat still and all canonical assets."
                        if side == "portrait"
                        else "The character image is the page-selected Benbassat depiction and is source-distinct and byte-distinct from the performer portrait and all canonical assets."
                    ),
                    "evidence": [
                        f"source-file:{asset['origin']}",
                        f"asset-sha256:{asset['sha256']}",
                        f"source-review:{source_review['review_sha256']}",
                    ],
                    "enforced": True,
                    "at": source_review["reviewed_at"],
                    "asset_sha256": asset["sha256"],
                },
            ]
            template["claims"] = {
                "identity": {"state": "enforced", "value": "expected", "support": 2, "reviewers": 1, "human_reviewers": 1, "competing": []},
                "presentation": {"state": "enforced", "value": presentation, "support": 2, "reviewers": 1, "human_reviewers": 1, "competing": []},
            }
            template.pop("reason", None)
        else:
            template["asset"] = None
            template["status"] = "absent"
            template["reason"] = facet_source.get("reason") or "No compliant exact media was available."
            template["votes"] = []
            template["claims"] = {}
        parent_list.append(template)

    write_json(media_path, media_payload)
    (OUT / "primary-media-path.txt").write_text(str(media_path) + "\n")

    replacements.update({
        str(alice_task.get("id")): TASK_ID,
        str(alice_task.get("source_fingerprint", "")): EXPECTED_FINGERPRINT,
        str((alice_task.get("lease") or {}).get("id", "")): task["lease"]["id"],
    })
    alice_still_sha = (((alice_task.get("draft") or {}).get("media") or {}).get("still") or {}).get("sha256")
    alice_portrait_sha = (((alice_task.get("draft") or {}).get("media") or {}).get("portrait") or {}).get("sha256")
    if alice_still_sha and still.get("sha256"):
        replacements[str(alice_still_sha)] = still["sha256"]
    if alice_portrait_sha and portrait.get("sha256"):
        replacements[str(alice_portrait_sha)] = portrait["sha256"]

    draft_template = replace_strings(deepcopy(alice_task.get("draft") or {}), replacements)
    outcome_template = replace_strings(deepcopy(alice_task.get("outcome_review") or {}), replacements)
    common = {
        "task_id": TASK_ID,
        "lease_id": task["lease"]["id"],
        "readiness_token": task["lease"].get("readiness_token"),
        "source_fingerprint": EXPECTED_FINGERPRINT,
        "performer": EXPECTED_PERFORMER,
        "character": EXPECTED_CHARACTER,
        "wall_id": WALL_ID,
        "wall_ids": [WALL_ID],
        "performance_mode": "voice-animation",
        "record": record,
        "sources": ["https://memory-alpha.fandom.com/wiki/Benbassat", "https://memory-alpha.fandom.com/wiki/Star_Trek:_Prodigy"],
        "media": product_media,
        "source_review_sha256": source_review["review_sha256"],
        "media_receipt_sha256": media_receipt["receipt_sha256"],
    }
    draft_template.update(common)
    draft_template["status"] = draft_template.get("status") or "ready"
    draft_template["notes"] = "Nolan North’s Benbassat performance is adjudicated as voice-animation; the physical-prosthetic queue hint and all unsupported maker functions remain rejected or unresolved."
    submission = dict(common)
    submission.update({
        "version": 1,
        "transaction": "STAR-TREK-BENBASSAT-SUBMISSION-V1",
        "draft": draft_template,
        "result": draft_template,
        "submission": draft_template,
        "review": {
            "source_review_sha256": source_review["review_sha256"],
            "media_receipt_sha256": media_receipt["receipt_sha256"],
            "performance_mode": "voice-animation",
            "physical_performance_attributed": False,
            "maker_attribution": "unresolved",
        },
    })

    outcome_template.update(common)
    outcome_template.update({
        "version": 1,
        "transaction": "STAR-TREK-BENBASSAT-COMPLETION-REVIEW-V1",
        "verdict": "pass",
        "reviewer": "chatgpt-benbassat-candidate-producer",
        "reviewed_role": "producer",
        "status": "resolved",
        "resolved": True,
        "physical_performance_attributed": False,
        "prosthetic_performance_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
        "additional_lease_issued": False,
        "canonical_mutation": False,
    })
    outcome_review = dict(common)
    outcome_review.update({
        "version": 1,
        "transaction": "STAR-TREK-BENBASSAT-COMPLETION-REVIEW-V1",
        "verdict": "pass",
        "reviewer": "chatgpt-benbassat-candidate-producer",
        "reviewed_role": "producer",
        "review": outcome_template,
        "outcome": outcome_template,
        "completion": outcome_template,
        "media_review": outcome_template,
        "result": outcome_template,
    })

    write_json(OUT / "submission.json", submission)
    write_json(OUT / "outcome-review.json", outcome_review)
    write_json(OUT / "product-media.json", product_media)
    write_json(OUT / "prepared-state.json", {"task": task, "alice_task": alice_task, "counts": counts, "record_path": str(record_hit["path"]), "media_path": str(media_path)})


def receipt() -> None:
    state = load_json(Path("data/AUTOPILOT.json"))
    task = find_task(state, TASK_ID)
    counts = queue_counts(state)
    expected_counts = {"total": 2228, "queued": 1797, "resolved": 429, "blocked": 0, "rejected": 2, "in_flight": 0}
    if task.get("status") != "resolved" or task.get("wall_ids") != [WALL_ID]:
        raise SystemExit(f"Benbassat task is not resolved to {WALL_ID}: {task}")
    if counts != expected_counts:
        raise SystemExit(f"resolved queue drifted: {counts}")
    record = load_json(OUT / "record.json")
    media_receipt = load_json(MEDIA_ROOT / "media-receipt.json")
    source_review = load_json(REVIEW_ROOT / "source-review.json")
    product_media = load_json(OUT / "product-media.json")
    changed_paths = subprocess.check_output(["git", "diff", "--name-only", os.environ["CLAIM_COMMIT"], "--"], text=True).splitlines()
    transition = {
        "submit_command": (OUT / "submit-command.txt").read_text().strip(),
        "complete_command": (OUT / "complete-command.txt").read_text().strip(),
    }
    candidate = {
        "version": 1,
        "transaction": "STAR-TREK-BENBASSAT-CANDIDATE-V1",
        "generated_at": now(),
        "status": "candidate-ready-for-independent-review",
        "canonical_parent": EXPECTED_MAIN,
        "canonical_tree": EXPECTED_TREE,
        "claim_commit": os.environ["CLAIM_COMMIT"],
        "task": {
            "id": TASK_ID,
            "lease_id": task.get("lease", {}).get("id"),
            "performer": EXPECTED_PERFORMER,
            "character": EXPECTED_CHARACTER,
            "source_fingerprint": EXPECTED_FINGERPRINT,
            "status": task.get("status"),
            "attempts": task.get("attempts"),
            "wall_ids": task.get("wall_ids"),
        },
        "canonical_record": {
            "wall_id": WALL_ID,
            "record": record,
            "record_sha256": sha256_bytes(stable_bytes(record)),
        },
        "source_review": {
            "branch": os.environ["SOURCE_REVIEW_BRANCH"],
            "review_sha256": source_review["review_sha256"],
            "verdict": source_review["verdict"],
            "performance_mode": source_review["adjudication"]["performance_mode"],
        },
        "media": {
            "branch": os.environ["MEDIA_BRANCH"],
            "receipt_sha256": media_receipt["receipt_sha256"],
            "facets": product_media,
        },
        "queue": counts,
        "transition": transition,
        "changed_paths": changed_paths,
        "boundary": {
            "physical_prosthetic_hint_accepted": False,
            "physical_performance_attributed": False,
            "prosthetic_performance_attributed": False,
            "maker_attribution": "unresolved",
            "transformation_measured": False,
            "independent_product_review_complete": False,
            "waterline_cycle_recorded": False,
            "canonical_mutation": False,
            "additional_lease_issued": False,
        },
    }
    body = stable_bytes(candidate)
    candidate["receipt_sha256"] = sha256_bytes(body)
    write_json(Path("data/review/adapter-sdk/star-trek-benbassat-candidate.json"), stable(candidate))
    write_json(OUT / "candidate-receipt.json", stable(candidate))


if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "receipt"}:
        raise SystemExit("usage: candidate-builder.py <prepare|receipt>")
    if sys.argv[1] == "prepare":
        prepare()
    else:
        receipt()
