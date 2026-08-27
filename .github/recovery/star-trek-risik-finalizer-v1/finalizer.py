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

    print("RISIK-CHECKER-SELF-IDENTITY-BEGIN")
    for index, line in enumerate(
        checker.read_text(encoding="utf-8").splitlines()[:50],
        start=1,
    ):
        print(f"{index:04d}: {line}")
    print("RISIK-CHECKER-SELF-IDENTITY-END")

    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    episodes = (receipt.get("source_review") or {}).get(
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

    repair = {
        "version": 1,
        "transaction": "STAR-TREK-RISIK-CHECKER-KEY-ORDER-REPAIR-V1",
        "classification": "exact-object-key-set-and-title-date-projection",
        "receipt_sha256": receipt.get("receipt_sha256"),
        "original_checker_sha256": hashlib.sha256(
            text.encode("utf-8")
        ).hexdigest(),
        "patched_checker_sha256": hashlib.sha256(
            checker.read_bytes()
        ).hexdigest(),
        "episodes": projected,
        "object_keys": ["first_aired", "title"],
        "product_data_changed": False,
        "media_changed": False,
        "attribution_changed": False,
        "waterline_logic_changed": False,
        "publication_logic_changed": False,
    }
    out = Path(os.environ["OUT"])
    out.mkdir(parents=True, exist_ok=True)
    (out / "checker-key-order-repair.json").write_text(
        json.dumps(repair, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(repair, indent=2, ensure_ascii=False))
