#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import base64
import gzip
import hashlib
import json
import os
import subprocess
import sys

workspace = Path(os.environ["GITHUB_WORKSPACE"])
workflow_path = ".github/workflows/star-trek-risik-finalizer-v1.yml"
expected_workflow_blob = "80991fa5c7f869e6a7b962c94daae237ca076fa7"
actual_workflow_blob = subprocess.check_output(
    ["git", "rev-parse", f"HEAD:{workflow_path}"],
    cwd=workspace,
    text=True,
).strip()
if actual_workflow_blob != expected_workflow_blob:
    raise SystemExit(
        f"Risik finalizer workflow blob drifted: {actual_workflow_blob} != {expected_workflow_blob}"
    )

runtime = workspace / ".github/recovery/star-trek-risik-finalizer-v1"
encoded = b"".join(
    path.read_bytes().strip()
    for path in sorted(runtime.glob("finalizer.py.gz.b64.part-*"))
)
source = gzip.decompress(base64.b64decode(encoded)).decode("utf-8")
namespace = {"__name__": "__main__", "__file__": str(runtime / "finalizer-runtime.py")}
exec(compile(source, namespace["__file__"], "exec"), namespace)

if sys.argv[1:] == ["prepare"]:
    checker = Path.cwd() / "scripts/star-trek-risik-cycle.mjs"
    receipt_path = (
        Path.cwd()
        / "data/review/adapter-sdk/star-trek-risik-cycle.json"
    )
    old_assertion = """if (JSON.stringify(episodes) !== JSON.stringify([{"title": "Something Borrowed, Something Green", "first_aired": "21 September 2023"}, {"title": "The Inner Fight", "first_aired": "26 October 2023"}, {"title": "Old Friends, New Planets", "first_aired": "2 November 2023"}])) fail('reviewed episode set drifted');"""
    new_assertion = """const expectedEpisodes = [{"title": "Something Borrowed, Something Green", "first_aired": "21 September 2023"}, {"title": "The Inner Fight", "first_aired": "26 October 2023"}, {"title": "Old Friends, New Planets", "first_aired": "2 November 2023"}];
if (!Array.isArray(episodes)
  || episodes.some((row) => !row
    || typeof row !== 'object'
    || Array.isArray(row)
    || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(['first_aired','title']))
  || JSON.stringify(episodes.map((row) => ({title: row.title, first_aired: row.first_aired}))) !== JSON.stringify(expectedEpisodes)) fail('reviewed episode set drifted');"""

    text = checker.read_text(encoding="utf-8")
    if text.count(old_assertion) != 1:
        raise SystemExit(
            f"Risik checker key-order patch anchor drifted: "
            f"{text.count(old_assertion)} matches"
        )
    patched = text.replace(old_assertion, new_assertion, 1)
    if old_assertion in patched or patched.count(new_assertion) != 1:
        raise SystemExit("Risik checker key-order patch did not close")
    checker.write_text(patched, encoding="utf-8")
    subprocess.run(["node", "--check", str(checker)], check=True)

    def stable(value):
        if isinstance(value, dict):
            return {key: stable(value[key]) for key in sorted(value)}
        if isinstance(value, list):
            return [stable(item) for item in value]
        return value

    def pretty(value):
        return json.dumps(
            stable(value),
            indent=2,
            ensure_ascii=False,
        ) + "\n"

    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    original_receipt_sha = receipt.get("receipt_sha256")
    qualification = receipt.get("qualification")
    if not isinstance(qualification, dict):
        raise SystemExit("Risik receipt qualification object is absent")
    original_checker_sha = qualification.get("checker_sha256")
    if not isinstance(original_checker_sha, str):
        raise SystemExit("Risik receipt checker identity is absent")

    patched_checker_sha = hashlib.sha256(checker.read_bytes()).hexdigest()
    qualification["checker_sha256"] = patched_checker_sha

    receipt_body = dict(receipt)
    receipt_body.pop("receipt_sha256", None)
    patched_receipt_sha = hashlib.sha256(
        pretty(receipt_body).encode("utf-8")
    ).hexdigest()
    receipt["receipt_sha256"] = patched_receipt_sha
    receipt_path.write_text(pretty(receipt), encoding="utf-8")

    reread = json.loads(receipt_path.read_text(encoding="utf-8"))
    reread_body = dict(reread)
    reread_identity = reread_body.pop("receipt_sha256", None)
    reproduced_identity = hashlib.sha256(
        pretty(reread_body).encode("utf-8")
    ).hexdigest()
    if reread_identity != patched_receipt_sha or reproduced_identity != patched_receipt_sha:
        raise SystemExit(
            "Risik receipt identity did not reproduce after checker reseal"
        )
    if hashlib.sha256(checker.read_bytes()).hexdigest() != (
        (reread.get("qualification") or {}).get("checker_sha256")
    ):
        raise SystemExit("Risik checker identity did not reproduce after reseal")

    episodes = (reread.get("source_review") or {}).get(
        "confirmed_voiced_episodes"
    )
    expected = [
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
    if not isinstance(episodes, list):
        raise SystemExit("Risik receipt episode set is not a list")
    if any(
        not isinstance(row, dict)
        or sorted(row) != ["first_aired", "title"]
        for row in episodes
    ):
        raise SystemExit(
            f"Risik receipt episode object shape drifted: {episodes}"
        )
    projected = [
        {
            "title": row["title"],
            "first_aired": row["first_aired"],
        }
        for row in episodes
    ]
    if projected != expected:
        raise SystemExit(
            f"Risik receipt episode values drifted: {projected}"
        )


    new_product_paths = [
        "data/review/adapter-sdk/star-trek-risik-cycle.json",
        "scripts/star-trek-morgo-cycle-composable.mjs",
        "scripts/star-trek-risik-cycle.mjs",
    ]
    missing_product_paths = [
        relative
        for relative in new_product_paths
        if not Path(relative).is_file()
    ]
    if missing_product_paths:
        raise SystemExit(
            f"Risik generated product paths are absent: {missing_product_paths}"
        )
    untracked_product_paths = sorted(
        line
        for line in subprocess.check_output(
            [
                "git",
                "ls-files",
                "--others",
                "--exclude-standard",
                "--",
                *new_product_paths,
            ],
            text=True,
        ).splitlines()
        if line
    )
    if untracked_product_paths != sorted(new_product_paths):
        raise SystemExit(
            "Risik generated product path topology drifted before staging: "
            f"{untracked_product_paths}"
        )
    subprocess.run(
        ["git", "add", "--", *new_product_paths],
        check=True,
    )
    staged_product_paths = sorted(
        line
        for line in subprocess.check_output(
            [
                "git",
                "diff",
                "--cached",
                "--name-only",
                "--",
                *new_product_paths,
            ],
            text=True,
        ).splitlines()
        if line
    )
    if staged_product_paths != sorted(new_product_paths):
        raise SystemExit(
            "Risik generated product paths did not enter the index exactly: "
            f"{staged_product_paths}"
        )

    repair = {
        "version": 1,
        "transaction": "STAR-TREK-RISIK-CHECKER-RECEIPT-PATH-RESEAL-V1",
        "classification": "coherent-checker-and-receipt-identity-reseal",
        "original_receipt_sha256": original_receipt_sha,
        "patched_receipt_sha256": patched_receipt_sha,
        "original_checker_sha256": original_checker_sha,
        "patched_checker_sha256": patched_checker_sha,
        "changed_receipt_fields": [
            "qualification.checker_sha256",
            "receipt_sha256",
        ],
        "checker_change": (
            "replace key-order-sensitive raw JSON comparison with exact "
            "object-key-set and ordered title/date projection"
        ),
        "episodes": projected,
        "object_keys": ["first_aired", "title"],
        "product_data_changed": False,
        "media_changed": False,
        "attribution_changed": False,
        "waterline_logic_changed": False,
        "publication_logic_changed": False,
        "pre_staged_new_product_paths": new_product_paths,
        "path_contract_change": (
            "place the exact three generated terminal files in the Git index "
            "before the unchanged workflow computes its candidate delta"
        ),
    }
    out = Path(os.environ["OUT"])
    out.mkdir(parents=True, exist_ok=True)
    (out / "checker-receipt-reseal.json").write_text(
        json.dumps(repair, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(repair, indent=2, ensure_ascii=False))
