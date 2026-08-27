#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import base64
import gzip
import os
import subprocess

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
