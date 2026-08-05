#!/usr/bin/env bash
set -Eeuo pipefail

sealed_commit="d5e13a7db6b0ab394f9caabdefe0059e54415f3f"
sealed_wrapper_sha256="f4d970126c7de42ba35e2e3a5b3e43cba7739ddbdcd082ad5b4d36a67fb9c4b5"
sealed_payload_sha256="a2350b88fc260ff60df5f48f00906a8a994cd09a3d6301cb077f2b48932dccce"
work="${RUNNER_TEMP:-/tmp}/ux02a-review-carrier-v2"
mkdir -p "$work"

test "$(git show -s --format=%P HEAD)" = "$sealed_commit"
git show "${sealed_commit}:tmp/ux02a-materialize.sh" > "$work/sealed-wrapper.sh"
test "$(sha256sum "$work/sealed-wrapper.sh" | awk '{print $1}')" = "$sealed_wrapper_sha256"

python3 - "$work/sealed-wrapper.sh" "$work/materializer.sh" "$sealed_payload_sha256" <<'PY'
from pathlib import Path
import base64
import hashlib
import lzma
import re
import sys

wrapper_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
expected_payload_sha256 = sys.argv[3]
wrapper = wrapper_path.read_text(encoding="utf-8")
match = re.search(
    r"base64 -d <<'PAYLOAD' \| xz -dc > \"\$payload\"\n(.*?)\nPAYLOAD\n",
    wrapper,
    flags=re.DOTALL,
)
if not match:
    raise SystemExit("sealed materializer payload is missing")
script = lzma.decompress(base64.b64decode("".join(match.group(1).split()))).decode("utf-8")
actual_payload_sha256 = hashlib.sha256(script.encode("utf-8")).hexdigest()
if actual_payload_sha256 != expected_payload_sha256:
    raise SystemExit(
        f"sealed materializer payload drift: {actual_payload_sha256} != {expected_payload_sha256}"
    )
old = """grep -Fq '## DEC-0016 — Compact archive navigation is progressive enhancement, not a new destination' docs/DECISIONS.md
grep -Fq 'DEC-0015 remains the authority for dense mobile evidence' docs/DECISIONS.md
grep -Fq 'Connections and Constellations remain contextual or secondary under DEC-0009' docs/DECISIONS.md
"""
new = """python3 - <<'PYDECISIONS'
from pathlib import Path
text = \" \".join(Path(\"docs/DECISIONS.md\").read_text(encoding=\"utf-8\").split())
required = [
    \"## DEC-0016 — Compact archive navigation is progressive enhancement, not a new destination\",
    \"DEC-0015 remains the authority for dense mobile evidence\",
    \"Connections and Constellations remain contextual or secondary under DEC-0009\",
]
for phrase in required:
    if phrase not in text:
        raise SystemExit(f\"decision-log authority phrase is missing: {phrase}\")
PYDECISIONS
"""
if script.count(old) != 1:
    raise SystemExit(f"decision assertion block count is {script.count(old)}, expected 1")
output_path.write_text(script.replace(old, new, 1), encoding="utf-8")
PY

chmod +x "$work/materializer.sh"
exec bash "$work/materializer.sh"
