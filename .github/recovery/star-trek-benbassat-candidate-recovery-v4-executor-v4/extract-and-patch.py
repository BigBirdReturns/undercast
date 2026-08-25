#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import hashlib
import json
import os

SOURCE = Path(os.environ["SEALED_WORKFLOW"])
TARGET = Path(os.environ["RUN_ROOT"])

EXPECTED_BLOCKS = [
    "Freeze lifecycle and verify immutable corrected layers",
    "Submit, grow, and reconcile the exact leased object",
    "Rebuild projections before the completion invariant and resolve the media review",
    "Rebuild terminal projections and qualify the candidate",
    "Squash and publish the corrected candidate result",
]


def extract_run_blocks(text: str) -> list[tuple[str, str]]:
    lines = text.splitlines()
    blocks: list[tuple[str, str]] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if line.startswith("      - name: "):
            name = line[len("      - name: ") :]
            cursor = index + 1
            run_start = None
            while cursor < len(lines) and not lines[cursor].startswith("      - "):
                if lines[cursor] == "        run: |":
                    run_start = cursor + 1
                    break
                cursor += 1
            if run_start is not None:
                cursor = run_start
                body: list[str] = []
                while cursor < len(lines) and not lines[cursor].startswith("      - "):
                    current = lines[cursor]
                    if current.startswith("          "):
                        body.append(current[10:])
                    elif current == "":
                        body.append("")
                    else:
                        break
                    cursor += 1
                blocks.append((name, "\n".join(body) + "\n"))
                index = cursor
                continue
        index += 1
    return blocks


def replace_once(body: str, old: str, new: str, label: str) -> tuple[str, dict[str, str]]:
    count = body.count(old)
    if count != 1:
        raise SystemExit(f"{label} cardinality drifted: expected 1, found {count}")
    return body.replace(old, new, 1), {"label": label, "from": old, "to": new}


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    blocks = extract_run_blocks(SOURCE.read_text(encoding="utf-8"))
    names = [name for name, _ in blocks]
    if names != EXPECTED_BLOCKS:
        raise SystemExit(f"run-block sequence drifted: {names}")

    receipts: list[dict[str, object]] = []
    for position, (name, body) in enumerate(blocks, 1):
        changes: list[dict[str, str]] = []

        if position == 1:
            for old, new, label in [
                (".media.still.status", ".layers.media.still.status", "settlement still selector"),
                (".media.portrait.status", ".layers.media.portrait.status", "settlement portrait selector"),
                ("and .media.honest_absence == true\n", "", "obsolete top-level media absence selector"),
            ]:
                body, receipt = replace_once(body, old, new, label)
                changes.append(receipt)

        if position == 2:
            replacements = [
                (
                    "if(!task||task.status!=='drafted'||task.lease?.id!==process.env.EXPECTED_LEASE) throw Error('native submit did not draft the existing Benbassat lease');",
                    "if(!task||task.status!=='drafted'||task.outcome?.lease_id!==process.env.EXPECTED_LEASE||task.lease!=null) throw Error('native submit did not preserve the originating Benbassat lease receipt');",
                    "post-submit lease receipt",
                ),
                (
                    "rows[0].production!=='Star Trek: Picard'",
                    "rows[0].production!=='Võx'",
                    "grown record episode production",
                ),
                (
                    "if(!task||task.status!=='merged'||JSON.stringify(task.wall_ids)!=='[\"UC-1397\"]'||task.lease?.id!==process.env.EXPECTED_LEASE) throw Error('Benbassat did not reconcile to merged under the original lease');",
                    "if(!task||task.status!=='merged'||JSON.stringify(task.wall_ids)!=='[\"UC-1397\"]'||task.outcome?.lease_id!==process.env.EXPECTED_LEASE||task.lease!=null) throw Error('Benbassat did not reconcile to merged under the originating lease receipt');",
                    "post-sync lease receipt",
                ),
            ]
            for old, new, label in replacements:
                body, receipt = replace_once(body, old, new, label)
                changes.append(receipt)

        if position == 3:
            old = "if(!task||task.status!=='resolved'||JSON.stringify(task.wall_ids)!=='[\"UC-1397\"]'||task.outcome?.kind!=='audited-wall'||task.lease?.id!==process.env.EXPECTED_LEASE) throw Error('post-merge media review did not resolve Benbassat');"
            new = "if(!task||task.status!=='resolved'||JSON.stringify(task.wall_ids)!=='[\"UC-1397\"]'||task.outcome?.kind!=='audited-wall'||task.outcome?.media_review?.lease_id!==process.env.EXPECTED_LEASE||task.lease!=null) throw Error('post-merge media review did not preserve the originating lease receipt');"
            body, receipt = replace_once(body, old, new, "post-complete lease receipt")
            changes.append(receipt)

        path = TARGET / f"{position:02d}.sh"
        path.write_text("#!/usr/bin/env bash\n" + body, encoding="utf-8")
        path.chmod(0o755)
        receipts.append(
            {
                "position": position,
                "name": name,
                "path": str(path),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "changes": changes,
            }
        )

    receipt = {
        "version": 2,
        "transaction": "STAR-TREK-BENBASSAT-CANDIDATE-V4-LIFECYCLE-PATCH-V4",
        "sealed_workflow": str(SOURCE),
        "sealed_workflow_blob": os.environ["SEALED_WORKFLOW_BLOB"],
        "lifecycle_blob": os.environ["LIFECYCLE_BLOB"],
        "batch_sha256": os.environ["BATCH_SHA256"],
        "run_blocks": receipts,
        "canonical_mutation": False,
        "additional_lease_issued": False,
    }
    (TARGET / "patch-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
