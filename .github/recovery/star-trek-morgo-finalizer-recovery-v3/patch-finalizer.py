#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import difflib
import hashlib
import json
import sys

if len(sys.argv) != 5:
    raise SystemExit("usage: patch-finalizer.py ORIGINAL PATCHED RECEIPT DIFF")

original_path = Path(sys.argv[1])
patched_path = Path(sys.argv[2])
receipt_path = Path(sys.argv[3])
diff_path = Path(sys.argv[4])
original = original_path.read_text(encoding="utf-8")

claim_old = '''        "claim": verify_identity(
            OUT / "claim-receipt.json",
            "receipt_sha256",
            CLAIM_RECEIPT_SHA,
            ("artifact",),
        ),'''
claim_new = '''        "claim": verify_identity(
            OUT / "claim-receipt.json",
            "receipt_sha256",
            CLAIM_RECEIPT_SHA,
        ),'''

census_old = '''    run("git", "diff", "--check", capture=False)

    actual = {'''
census_new = '''    run("git", "diff", "--check", capture=False)

    # The receipt and checker are intentionally new permanent product files.
    # Stage them before the path census so git diff can see them. The later
    # authorization set still refuses every path outside the sealed boundary.
    git("add", str(RECEIPT_PATH), str(CHECKER_PATH))

    actual = {'''

if original.count(claim_old) != 1:
    raise SystemExit(f"claim verifier boundary drifted: {original.count(claim_old)}")
if original.count(census_old) != 1:
    raise SystemExit(f"path census boundary drifted: {original.count(census_old)}")
if original.count('git("add", "-A")') != 1:
    raise SystemExit("full-tree staging boundary drifted")
for token in (
    'str(RECEIPT_PATH),',
    'str(CHECKER_PATH),',
    'raise SystemExit(f"finalizer omitted required paths:',
    'raise SystemExit(f"finalizer changed unauthorized paths:',
):
    if token not in original:
        raise SystemExit(f"required product-control token missing: {token}")

patched = original.replace(claim_old, claim_new, 1).replace(census_old, census_new, 1)
if patched.count('git("add", str(RECEIPT_PATH), str(CHECKER_PATH))') != 1:
    raise SystemExit("permanent-control staging repair did not settle")
if patched.count('("artifact",),') != original.count('("artifact",),') - 1:
    raise SystemExit("claim-only artifact repair cardinality drifted")
if patched.count('git("add", "-A")') != 1:
    raise SystemExit("full-tree staging was altered")
compile(patched, str(patched_path), "exec")

patched_path.parent.mkdir(parents=True, exist_ok=True)
patched_path.write_text(patched, encoding="utf-8")
patched_path.chmod(0o755)

diff = "".join(difflib.unified_diff(
    original.splitlines(keepends=True), patched.splitlines(keepends=True),
    fromfile="sealed-v2/finalizer.py", tofile="recovered-v4/finalizer.py"))
diff_path.parent.mkdir(parents=True, exist_ok=True)
diff_path.write_text(diff, encoding="utf-8")

receipt = {
    "version": 2,
    "transaction": "STAR-TREK-MORGO-FINALIZER-RECOVERY-V3-PATCH-V2",
    "classification": "claim-identity-and-permanent-control-census-ordering",
    "patched_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "original_sha256": hashlib.sha256(original.encode()).hexdigest(),
    "patched_sha256": hashlib.sha256(patched.encode()).hexdigest(),
    "repairs": [
        {
            "classification": "claim-artifact-inclusion-contract",
            "mechanism": "remove artifact from the claim verifier omission tuple",
        },
        {
            "classification": "permanent-control-path-census-ordering",
            "mechanism": "stage the new receipt and checker before enumerating the authorized product delta",
        },
    ],
    "product_logic_changed": False,
    "required_path_assertion_retained": True,
    "unauthorized_path_assertion_retained": True,
    "full_tree_staging_retained": True,
    "claim_contents_changed": False,
    "attribution_logic_changed": False,
    "lease_logic_changed": False,
    "waterline_logic_changed": False,
    "canonical_mutation": False,
    "additional_lease_issued": False,
}
receipt_path.parent.mkdir(parents=True, exist_ok=True)
receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
