#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch-lifecycle-receipt.py <lifecycle.py>")
    path = Path(sys.argv[1])
    text = path.read_text(encoding="utf-8")
    old = '    lease_id = current.get("outcome", {}).get("lease_id")\n'
    new = (
        '    outcome = current.get("outcome", {})\n'
        '    lease_id = outcome.get("lease_id") or (outcome.get("media_review") or {}).get("lease_id")\n'
        '    if not lease_id:\n'
        '        raise SystemExit("resolved task lacks its originating lease receipt")\n'
    )
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"lifecycle receipt patch cardinality drifted: {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


if __name__ == "__main__":
    main()
