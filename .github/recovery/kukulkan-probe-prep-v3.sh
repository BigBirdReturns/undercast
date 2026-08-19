#!/usr/bin/env bash
set -euo pipefail

source_path=/tmp/kukulkan-probe-prep-v2.sh
target_path=/tmp/kukulkan-probe-prep-v3-inner.sh
test -s "$source_path"
cp "$source_path" "$target_path"
python3 - "$target_path" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
replacements = (
    (
        "marker = '          python3 /tmp/build-kol-tai-prep-v4.py\\n'",
        "marker = 'python3 /tmp/build-kol-tai-prep-v4.py\\n'",
    ),
    (
        "    '          export BUILDER_PATH=/tmp/build-kol-tai-prep-v4.py\\n'",
        "    'export BUILDER_PATH=/tmp/build-kol-tai-prep-v4.py\\n'",
    ),
    (
        "    '          python3 /tmp/generalize-doohan-builder-v1.py /tmp/build-kol-tai-prep-v4.py\\n'",
        "    'python3 /tmp/generalize-doohan-builder-v1.py /tmp/build-kol-tai-prep-v4.py\\n'",
    ),
)
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'probe prep extraction marker drifted: {old!r} count={count}')
    text = text.replace(old, new, 1)
path.write_text(text)
PY
chmod +x "$target_path"
exec "$target_path"
