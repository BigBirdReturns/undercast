#!/usr/bin/env python3
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

SOURCE_HEAD_DEFAULT = "766b9b6002cfba9710f6dce5f56c4816607bc696"
OVERLAP_PATH = "data/review/estate-debt/COLLECT-001-PR88-OVERLAP.json"
REPORT_PATH_DEFAULT = "data/review/estate-debt/COLLECT-014-PR88-DIRECT-ONLY-AUDIT.json"
OUTPUT_ROOT_DEFAULT = "data/review/pr88-direct-only"

EVIDENCE_MAP = {
    "UC-178": (
        "data/review/card-backfill/exact-production-stills-wave-003-provenance.json",
        "data/review/card-backfill/exact-production-stills-wave-003-media-resolution.json",
    ),
    "UC-180": (
        "data/review/card-backfill/exact-production-stills-wave-003-provenance.json",
        "data/review/card-backfill/exact-production-stills-wave-003-media-resolution.json",
    ),
    "UC-246": (
        "data/review/card-backfill/exact-character-stills-wave-005-provenance.json",
        "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json",
    ),
    "UC-250": (
        "data/review/card-backfill/exact-character-stills-wave-005-provenance.json",
        "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json",
    ),
    "UC-277": (
        "data/review/card-backfill/exact-character-stills-wave-005-provenance.json",
        "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json",
    ),
    "UC-283": (
        "data/review/card-backfill/exact-character-stills-wave-005-provenance.json",
        "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json",
    ),
    "UC-290": (
        "data/review/card-backfill/exact-character-stills-wave-005-provenance.json",
        "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json",
    ),
    "UC-684": (
        "data/review/card-backfill/uc-684-portrait-provenance.json",
        "data/review/card-backfill/uc-046-uc-684-media-resolution-2026-07-26.json",
    ),
    "UC-1092": (
        "data/review/card-backfill/star-trek-portraits-wave-004-provenance.json",
        "data/review/card-backfill/star-trek-portraits-wave-004-media-resolution.json",
    ),
}


def fail(message: str) -> None:
    raise RuntimeError(message)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode("utf-8") + data).hexdigest()


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def git_show(head: str, path: str) -> bytes:
    result = subprocess.run(
        ["git", "show", f"{head}:{path}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        fail(f"cannot read {head}:{path}: {result.stderr.decode('utf-8', 'replace').strip()}")
    return result.stdout


def git_json(head: str, path: str) -> Any:
    try:
        return json.loads(git_show(head, path).decode("utf-8"))
    except Exception as error:
        fail(f"cannot parse {head}:{path}: {error}")


def same_json(left: Any, right: Any) -> bool:
    return json.dumps(left, sort_keys=True, separators=(",", ":")) == json.dumps(
        right, sort_keys=True, separators=(",", ":")
    )


def exact_row(rows: list[dict[str, Any]], record_id: str, label: str) -> dict[str, Any]:
    matches = [row for row in rows if row.get("id") == record_id]
    require(len(matches) == 1, f"{label}: expected one {record_id} row, found {len(matches)}")
    return matches[0]


def provenance_row(doc: Any, record_id: str) -> dict[str, Any]:
    if isinstance(doc, dict) and doc.get("wall_id") == record_id:
        return doc
    rows = doc.get("records") if isinstance(doc, dict) else None
    require(isinstance(rows, list), f"{record_id}: provenance records[] missing")
    matches = [row for row in rows if row.get("wall_id") == record_id]
    require(len(matches) == 1, f"{record_id}: expected one provenance row, found {len(matches)}")
    return matches[0]


def source_page(row: dict[str, Any]) -> str:
    if isinstance(row.get("source"), dict):
        value = row["source"].get("page")
    else:
        value = row.get("source_page")
    require(isinstance(value, str) and value.startswith(("http://", "https://")), "source page missing")
    return value


def candidate_metadata(row: dict[str, Any]) -> dict[str, Any]:
    output = row.get("output") if isinstance(row.get("output"), dict) else row
    result = {
        "path": output.get("path") or row.get("path"),
        "sha256": output.get("sha256") or row.get("sha256"),
        "bytes": output.get("bytes") or row.get("bytes"),
        "width": output.get("width") or row.get("width"),
        "height": output.get("height") or row.get("height"),
    }
    for key in ("path", "sha256", "bytes", "width", "height"):
        require(result.get(key) is not None, f"candidate {key} missing")
    return result


def vote_hashes(vote: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    for item in vote.get("evidence") or []:
        if isinstance(item, dict) and item.get("type") == "asset-sha256":
            value = item.get("value")
            if isinstance(value, str):
                values.add(value)
    return values


def terminal_votes(doc: Any, expected_hash: str, record_id: str) -> list[dict[str, Any]]:
    votes = doc.get("votes") if isinstance(doc, dict) else None
    require(isinstance(votes, list), f"{record_id}: resolution votes[] missing")
    selected = [
        copy.deepcopy(vote)
        for vote in votes
        if vote.get("namespace") in {"identity", "presentation"}
        and expected_hash in vote_hashes(vote)
    ]
    namespaces = sorted(vote.get("namespace") for vote in selected)
    require(namespaces == ["identity", "presentation"], f"{record_id}: vote set drifted: {namespaces}")
    for vote in selected:
        require(vote.get("enforced") is True, f"{record_id}: unenforced {vote.get('namespace')} vote")
        if vote.get("namespace") == "identity":
            require(vote.get("value") == "expected", f"{record_id}: identity vote is not expected")
        else:
            require(
                vote.get("value") in {"character-depiction", "neutral-human"},
                f"{record_id}: invalid presentation vote",
            )
    return selected


def provenance_year(record_id: str, row: dict[str, Any]) -> int | None:
    source = row.get("source") if isinstance(row.get("source"), dict) else row
    year = source.get("year")
    if isinstance(year, int):
        return year
    return 2013 if record_id == "UC-1092" else None


def proposed_binding(
    record_id: str,
    side: str,
    stale_binding: dict[str, Any],
    provenance: dict[str, Any],
    expected_hash: str,
) -> dict[str, Any]:
    old_src = stale_binding.get("src")
    require(isinstance(old_src, str), f"{record_id}/{side}: stale src missing")
    extension = Path(old_src).suffix.lower()
    require(extension in {".jpg", ".jpeg", ".png", ".webp"}, f"{record_id}: bad extension")
    focus = stale_binding.get("focus")
    if not isinstance(focus, dict):
        focus = {"x": "center", "y": "center"}
    require(focus.get("x") in {"left", "center", "right"}, f"{record_id}: invalid focus.x")
    require(
        focus.get("y") in {"top", "upper", "center", "lower", "bottom"},
        f"{record_id}: invalid focus.y",
    )
    origin = source_page(provenance)
    binding: dict[str, Any] = {
        "src": f"images/{record_id.lower()}-{side}-{expected_hash[:12]}{extension}",
        "kind": "still" if side == "still" else stale_binding.get("kind"),
        "origin": origin,
        "pin": True,
        "focus": {"x": focus["x"], "y": focus["y"]},
    }
    if side == "portrait":
        source = provenance.get("source") if isinstance(provenance.get("source"), dict) else provenance
        license_value = source.get("license") or provenance.get("license")
        author = source.get("author") or provenance.get("author")
        if origin.startswith("https://commons.wikimedia.org/wiki/File:") and license_value:
            binding["kind"] = "free"
            require(isinstance(author, str) and author.strip(), f"{record_id}: free portrait lacks author")
            year = provenance_year(record_id, provenance)
            require(isinstance(year, int), f"{record_id}: free portrait lacks year")
            binding["author"] = author
            binding["license"] = license_value
            binding["year"] = year
        else:
            binding["kind"] = "copyright"
    require(binding["kind"] in {"still", "free", "copyright"}, f"{record_id}: invalid kind")
    return binding


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_hash_index(
    specimens: list[dict[str, Any]], sources: list[dict[str, Any]]
) -> dict[str, set[str]]:
    manifest = json.loads(Path("data/media-manifest.json").read_text(encoding="utf-8"))
    assets = manifest.get("assets")
    require(isinstance(assets, dict), "media manifest assets{} missing")
    source_by_id = {row.get("id"): row for row in sources}
    index: dict[str, set[str]] = {}
    unresolved: list[str] = []
    for specimen in specimens:
        record_id = specimen.get("id")
        source = source_by_id.get(record_id)
        if not isinstance(source, dict):
            unresolved.append(f"{record_id}:source-row-missing")
            continue
        for side in ("still", "portrait"):
            left = specimen.get(side)
            right = source.get(side)
            if left is None and right is None:
                continue
            if not same_json(left, right):
                unresolved.append(f"{record_id}/{side}:canonical-row-disagreement")
                continue
            src = left.get("src") if isinstance(left, dict) else None
            if not isinstance(src, str):
                unresolved.append(f"{record_id}/{side}:missing-src")
                continue
            local = Path(src)
            if local.exists() and local.is_file():
                digest = file_hash(local)
            else:
                row = assets.get(src)
                digest = row.get("sha256") if isinstance(row, dict) else None
            if not isinstance(digest, str) or len(digest) != 64:
                unresolved.append(f"{record_id}/{side}:{src}")
                continue
            index.setdefault(digest, set()).add(f"{record_id}/{side}:{src}")
    require(not unresolved, f"unresolved canonical media hashes: {unresolved[:8]}")
    return index


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".tmp-{os.getpid()}")
    temporary.write_bytes(data)
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--head", required=True)
    parser.add_argument("--source-head", default=SOURCE_HEAD_DEFAULT)
    parser.add_argument("--now", required=True)
    parser.add_argument("--report", default=REPORT_PATH_DEFAULT)
    parser.add_argument("--output-root", default=OUTPUT_ROOT_DEFAULT)
    args = parser.parse_args()

    current_head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    require(current_head == args.head, f"authorized head mismatch: {current_head} != {args.head}")
    require(args.source_head == SOURCE_HEAD_DEFAULT, "PR88 source head drifted")
    report_path = Path(args.report)
    output_root = Path(args.output_root)
    require(not report_path.exists(), f"{report_path} already exists")
    require(not output_root.exists(), f"{output_root} already exists")

    overlap = json.loads(Path(OVERLAP_PATH).read_text(encoding="utf-8"))
    require(overlap.get("pr88", {}).get("head") == args.source_head, "overlap source head drifted")
    direct = overlap.get("direct_adoption_only")
    require(isinstance(direct, list) and len(direct) == 9, "direct-only denominator is not nine")
    expected_ids = sorted(EVIDENCE_MAP)
    actual_ids = sorted(row.get("record") for row in direct)
    require(actual_ids == expected_ids, f"direct-only record set drifted: {actual_ids}")

    current_specimens = json.loads(Path("data/specimens.json").read_text(encoding="utf-8"))
    current_sources = json.loads(Path("data/SOURCES.json").read_text(encoding="utf-8"))
    stale_specimens = git_json(args.source_head, "data/specimens.json")
    stale_sources = git_json(args.source_head, "data/SOURCES.json")
    require(isinstance(current_specimens, list) and isinstance(current_sources, list), "current ledgers malformed")
    require(isinstance(stale_specimens, list) and isinstance(stale_sources, list), "PR88 ledgers malformed")
    canonical_hashes = canonical_hash_index(current_specimens, current_sources)

    source_dir = output_root / "source"
    source_dir.mkdir(parents=True)
    shared_paths = sorted({path for pair in EVIDENCE_MAP.values() for path in pair})
    source_receipts = []
    for source_path_value in shared_paths:
        data = git_show(args.source_head, source_path_value)
        destination = source_dir / Path(source_path_value).name
        write_atomic(destination, data)
        source_receipts.append(
            {
                "source_path": source_path_value,
                "retained_path": destination.as_posix(),
                "sha256": sha256(data),
                "git_blob": git_blob(data),
                "bytes": len(data),
            }
        )

    current_source_by_id = {row.get("id"): row for row in current_sources}
    stale_source_by_id = {row.get("id"): row for row in stale_sources}
    direct_by_id = {row["record"]: row for row in direct}
    decisions = []
    candidate_seen: dict[str, str] = {}
    totals = {"complete_pairs": 0, "missing_still": 0, "missing_portrait": 0, "missing_both": 0}

    for record_id in expected_ids:
        direct_row = direct_by_id[record_id]
        side = direct_row["side"]
        expected_hash = direct_row["pr88_sha256"]
        require(side in {"still", "portrait"}, f"{record_id}: invalid side")
        require(isinstance(expected_hash, str) and len(expected_hash) == 64, f"{record_id}: bad hash")
        require(expected_hash not in candidate_seen, f"{record_id}: duplicates {candidate_seen.get(expected_hash)}")
        candidate_seen[expected_hash] = f"{record_id}/{side}"

        stale_specimen = exact_row(stale_specimens, record_id, "PR88 specimens")
        stale_source = stale_source_by_id.get(record_id)
        require(isinstance(stale_source, dict), f"{record_id}: PR88 source missing")
        stale_binding = stale_specimen.get(side)
        require(isinstance(stale_binding, dict), f"{record_id}/{side}: PR88 binding missing")
        require(same_json(stale_binding, stale_source.get(side)), f"{record_id}/{side}: PR88 ledgers disagree")
        stale_src = stale_binding.get("src")
        require(isinstance(stale_src, str), f"{record_id}/{side}: PR88 src missing")
        candidate = git_show(args.source_head, stale_src)
        require(sha256(candidate) == expected_hash, f"{record_id}/{side}: source hash drifted")

        provenance_path, resolution_path = EVIDENCE_MAP[record_id]
        provenance_doc = git_json(args.source_head, provenance_path)
        resolution_doc = git_json(args.source_head, resolution_path)
        provenance = provenance_row(provenance_doc, record_id)
        metadata = candidate_metadata(provenance)
        require(metadata["path"] == stale_src, f"{record_id}/{side}: provenance path differs")
        require(metadata["sha256"] == expected_hash, f"{record_id}/{side}: provenance hash differs")
        require(metadata["bytes"] == len(candidate), f"{record_id}/{side}: byte count differs")
        votes = terminal_votes(resolution_doc, expected_hash, record_id)

        current_specimen = exact_row(current_specimens, record_id, "current specimens")
        current_source = current_source_by_id.get(record_id)
        require(isinstance(current_source, dict), f"{record_id}: current source missing")
        require(current_specimen.get("actor") == stale_specimen.get("actor"), f"{record_id}: actor drifted")
        require(current_specimen.get("character") == stale_specimen.get("character"), f"{record_id}: character drifted")
        require(current_source.get("actor") == current_specimen.get("actor"), f"{record_id}: actor rows disagree")
        require(current_source.get("character") == current_specimen.get("character"), f"{record_id}: character rows disagree")

        current_binding = current_specimen.get(side)
        current_source_binding = current_source.get(side)
        current_rows_agree = same_json(current_binding, current_source_binding)
        other_side = "portrait" if side == "still" else "still"
        other_binding = current_specimen.get(other_side)
        other_source_binding = current_source.get(other_side)
        other_rows_agree = same_json(other_binding, other_source_binding)
        other_present = isinstance(other_binding, dict) and isinstance(other_binding.get("src"), str)
        proposed = proposed_binding(record_id, side, stale_binding, provenance, expected_hash)
        destination = Path(proposed["src"])
        destination_exists = destination.exists()
        destination_hash = file_hash(destination) if destination_exists and destination.is_file() else None
        duplicate_matches = sorted(canonical_hashes.get(expected_hash, set()))
        blockers: list[str] = []
        if not current_rows_agree:
            blockers.append("current-canonical-row-disagreement")
        elif current_binding is not None:
            blockers.append("current-binding-occupied")
        if not other_rows_agree:
            blockers.append("opposite-side-canonical-row-disagreement")
        if destination_exists:
            blockers.append("versioned-destination-already-exists")
        if duplicate_matches:
            blockers.append("candidate-duplicates-current-canonical-media")
        status = "blocked" if blockers else "authorized-current-null"
        effect = {
            "complete_pairs": 1 if not blockers and other_present else 0,
            "missing_still": -1 if not blockers and side == "still" else 0,
            "missing_portrait": -1 if not blockers and side == "portrait" else 0,
            "missing_both": -1 if not blockers and not other_present else 0,
        }
        if not blockers:
            for key in totals:
                totals[key] += effect[key]

        packet_dir = output_root / record_id
        packet_dir.mkdir(parents=True)
        retained_candidate = packet_dir / Path(stale_src).name
        write_atomic(retained_candidate, candidate)
        evidence = {
            "version": 1,
            "transaction": "COLLECT-014",
            "obligation_id": f"{record_id}/{side}",
            "source": {
                "pull_request": 88,
                "source_head": args.source_head,
                "source_path": stale_src,
                "source_git_blob": subprocess.check_output(
                    ["git", "rev-parse", f"{args.source_head}:{stale_src}"], text=True
                ).strip(),
                "retained_path": retained_candidate.as_posix(),
                "candidate_sha256": expected_hash,
                "candidate_bytes": len(candidate),
                "candidate_width": metadata["width"],
                "candidate_height": metadata["height"],
                "provenance_path": provenance_path,
                "resolution_path": resolution_path,
            },
            "identity": {
                "actor": current_specimen.get("actor"),
                "character": current_specimen.get("character"),
                "production": current_specimen.get("production"),
                "years": current_specimen.get("years"),
            },
            "review": {
                "reviewed_by": resolution_doc.get("reviewed_by"),
                "reviewed_role": resolution_doc.get("reviewed_role"),
                "reviewed_at": resolution_doc.get("reviewed_at"),
                "votes": votes,
                "identity": "expected",
                "presentation": next(vote["value"] for vote in votes if vote["namespace"] == "presentation"),
            },
            "current": {
                "canonical_rows_agree": current_rows_agree,
                "binding": current_binding,
                "other_side": other_side,
                "other_side_rows_agree": other_rows_agree,
                "other_side_present": other_present,
                "destination_exists": destination_exists,
                "destination_sha256": destination_hash,
            },
            "duplicate_scan": {
                "candidate_sha256": expected_hash,
                "current_canonical_matches": duplicate_matches,
                "pass": not duplicate_matches,
            },
            "proposed_binding": proposed,
            "quality_effect_if_adopted": effect,
            "status": status,
            "blockers": blockers,
            "boundary": {
                "canonical_mutation": False,
                "source_evidence_rewritten": False,
                "source_branch_merge_authorized": False,
            },
        }
        evidence_path = packet_dir / "evidence.json"
        write_atomic(evidence_path, json_bytes(evidence))
        write_atomic(
            packet_dir / "SHA256SUMS",
            (
                f"{expected_hash}  {retained_candidate.name}\n"
                f"{sha256(evidence_path.read_bytes())}  evidence.json\n"
            ).encode("utf-8"),
        )
        decisions.append(evidence)

    authorized = [row for row in decisions if row["status"] == "authorized-current-null"]
    blocked = [row for row in decisions if row["status"] == "blocked"]
    retained_files = []
    for path in sorted(output_root.rglob("*")):
        if path.is_file():
            data = path.read_bytes()
            retained_files.append(
                {"path": path.as_posix(), "sha256": sha256(data), "git_blob": git_blob(data), "bytes": len(data)}
            )
    manifest = {
        "version": 1,
        "transaction": "COLLECT-014",
        "operation": "pr88-direct-only-evidence-retention-manifest",
        "source_pull_request": 88,
        "source_head": args.source_head,
        "authorized_head": args.head,
        "files": retained_files,
        "counts": {
            "source_evidence_files": len(source_receipts),
            "obligation_packets": len(decisions),
            "retained_files": len(retained_files),
        },
        "canonical_mutation": False,
    }
    manifest_path = output_root / "MANIFEST.json"
    write_atomic(manifest_path, json_bytes(manifest))

    report = {
        "version": 1,
        "transaction": "COLLECT-014",
        "operation": "pr88-direct-only-current-head-reconciliation",
        "status": "authorized" if not blocked else "authorized-with-blockers",
        "recorded_at": args.now,
        "authorization": {
            "authorized_head": args.head,
            "source_pull_request": 88,
            "source_head": args.source_head,
            "overlap_receipt": OVERLAP_PATH,
        },
        "denominator": {
            "direct_only_objects": 9,
            "reviewed": len(decisions),
            "authorized": len(authorized),
            "blocked": len(blocked),
            "stills": sum(row["obligation_id"].endswith("/still") for row in decisions),
            "portraits": sum(row["obligation_id"].endswith("/portrait") for row in decisions),
        },
        "authorized_obligations": [row["obligation_id"] for row in authorized],
        "blocked_obligations": [
            {"obligation_id": row["obligation_id"], "blockers": row["blockers"]} for row in blocked
        ],
        "quality_effect_if_authorized_set_is_adopted": totals,
        "source_evidence": source_receipts,
        "retained_manifest": {
            "path": manifest_path.as_posix(),
            "sha256": sha256(manifest_path.read_bytes()),
            "git_blob": git_blob(manifest_path.read_bytes()),
        },
        "decisions": decisions,
        "boundary": {
            "canonical_mutation": False,
            "source_branch_merge_authorized": False,
            "source_evidence_rewritten": False,
            "review_authority_added": False,
            "arbitrary_batch_size_used": False,
            "complete_denominator_reviewed": True,
            "next_authorized_work": (
                "adopt the complete authorized direct-only set as one evidence-sized transaction; "
                "retain any blocked object under its exact terminal blocker"
            ),
        },
    }
    write_atomic(report_path, json_bytes(report))
    print(
        json.dumps(
            {
                "transaction": "COLLECT-014",
                "reviewed": len(decisions),
                "authorized": len(authorized),
                "blocked": len(blocked),
                "quality_effect": totals,
                "report": report_path.as_posix(),
                "manifest": manifest_path.as_posix(),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"COLLECT-014 audit failed: {error}", file=sys.stderr)
        raise
