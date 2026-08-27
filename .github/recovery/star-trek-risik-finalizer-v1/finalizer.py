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
    text = checker.read_text(encoding="utf-8")
    lines = text.splitlines()
    matches = [
        index for index, line in enumerate(lines)
        if "reviewed episode set drifted" in line
    ]
    if len(matches) != 1:
        raise SystemExit(
            f"Risik checker diagnostic anchor drifted: {len(matches)} matches"
        )
    center = matches[0]
    start = max(0, center - 35)
    end = min(len(lines), center + 36)
    print("RISIK-CHECKER-DIAGNOSTIC-BEGIN")
    for index in range(start, end):
        print(f"{index + 1:04d}: {lines[index]}")
    print("RISIK-CHECKER-DIAGNOSTIC-END")

    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    print("RISIK-RECEIPT-DIAGNOSTIC-BEGIN")
    print(json.dumps(
        {
            "source_review": receipt.get("source_review"),
            "checker_fields": {
                key: value
                for key, value in receipt.items()
                if "check" in key.lower() or "sha" in key.lower()
            },
            "receipt_sha256": receipt.get("receipt_sha256"),
            "checker_sha256": hashlib.sha256(checker.read_bytes()).hexdigest(),
            "receipt_file_sha256": hashlib.sha256(
                receipt_path.read_bytes()
            ).hexdigest(),
        },
        indent=2,
        ensure_ascii=False,
    ))
    print("RISIK-RECEIPT-DIAGNOSTIC-END")
