#!/usr/bin/env bash
set -euo pipefail

: "${EVIDENCE:?EVIDENCE is required}"
source_branch=agent/ssc-rd-wave03-exact-capture-finalizer-20260805
source_path=tmp/rd-wave03-exact-capture-finalize.sh
mkdir -p "$EVIDENCE"

git fetch --no-tags origin "+refs/heads/${source_branch}:refs/remotes/origin/${source_branch}"
source_head="$(git rev-parse "refs/remotes/origin/${source_branch}")"
git show "${source_head}:${source_path}" > "$EVIDENCE/finalizer-v2.py-source.sh"
python3 - "$EVIDENCE/finalizer-v2.py-source.sh" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
replacements=[
('settlement_branch=agent/ssc-rd-wave03-exact-capture-settlement-20260805','settlement_branch=agent/ssc-rd-wave03-exact-capture-settlement-v2-20260805'),
("settlement_workflow='RD-W03 exact-capture settlement'","settlement_workflow='RD-W03 exact-capture settlement v2'"),
('product_branch=agent/ssc-rd-wave03-exact-capture-product-v2-20260805','product_branch=agent/ssc-rd-wave03-exact-capture-product-v3-20260805'),
('artifact_name="rd-wave03-exact-capture-settlement-$run_id"','artifact_name="rd-wave03-exact-capture-settlement-v2-$run_id"'),
]
for old,new in replacements:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'expected one v2 finalizer substitution, found {count}: {old}')
    text=text.replace(old,new,1)
path.write_text(text)
PY
bash -n "$EVIDENCE/finalizer-v2.py-source.sh"
printf 'source_branch=%s\nsource_head=%s\nsource_path=%s\nsource_blob=%s\nsource_sha256=%s\nsubstitutions=4\n' \
  "$source_branch" "$source_head" "$source_path" \
  "$(git hash-object "$EVIDENCE/finalizer-v2.py-source.sh")" \
  "$(sha256sum "$EVIDENCE/finalizer-v2.py-source.sh" | awk '{print $1}')" \
  > "$EVIDENCE/finalizer-source.txt"
exec bash "$EVIDENCE/finalizer-v2.py-source.sh"
