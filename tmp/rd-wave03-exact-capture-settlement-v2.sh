#!/usr/bin/env bash
set -euo pipefail

repo="${REPO_ROOT:?REPO_ROOT is required}"
artifacts="${ARTIFACT_ROOT:?ARTIFACT_ROOT is required}"
base="${PRODUCT_BASE:?PRODUCT_BASE is required}"
worktree="${PRODUCT_WORKTREE:?PRODUCT_WORKTREE is required}"
evidence="${EVIDENCE:?EVIDENCE is required}"
source_branch=agent/ssc-rd-wave03-exact-capture-materializer-20260805
source_path=tmp/rd-wave03-exact-capture-materialize.py
mkdir -p "$evidence"

git -C "$repo" fetch --no-tags origin "+refs/heads/${source_branch}:refs/remotes/origin/${source_branch}"
source_head="$(git -C "$repo" rev-parse "refs/remotes/origin/${source_branch}")"
git -C "$repo" show "${source_head}:${source_path}" > "$evidence/materializer.py"
python3 - "$evidence/materializer.py" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
replacements=[
(
"assert(JSON.stringify(refusals) === JSON.stringify(EXPECTED_REFUSALS), 'refusal denominator changed');",
"for (const [key, count] of Object.entries(EXPECTED_REFUSALS)) assert(refusals[key] === count, `refusal denominator changed for ${key}`); assert(Object.keys(refusals).length === Object.keys(EXPECTED_REFUSALS).length, 'unexpected refusal class');"
),
(
"assert(JSON.stringify(protocol.selection.refusal_counts) === JSON.stringify(EXPECTED_REFUSALS), 'protocol refusal counts changed');",
"for (const [key, count] of Object.entries(EXPECTED_REFUSALS)) assert(protocol.selection.refusal_counts[key] === count, `protocol refusal count changed for ${key}`); assert(Object.keys(protocol.selection.refusal_counts).length === Object.keys(EXPECTED_REFUSALS).length, 'unexpected protocol refusal class');"
),
]
for old,new in replacements:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'expected one occurrence of serializer-sensitive assertion, found {count}: {old}')
    text=text.replace(old,new,1)
path.write_text(text)
PY
python3 -m py_compile "$evidence/materializer.py"
printf 'source_branch=%s\nsource_head=%s\nsource_path=%s\nsource_blob=%s\nsource_sha256=%s\npatch_count=2\n' \
  "$source_branch" "$source_head" "$source_path" \
  "$(git hash-object "$evidence/materializer.py")" \
  "$(sha256sum "$evidence/materializer.py" | awk '{print $1}')" \
  > "$evidence/materializer-source.txt"

python3 "$evidence/materializer.py" \
  --repo "$repo" \
  --artifacts "$artifacts" \
  --base "$base" \
  --worktree "$worktree" \
  --evidence "$evidence"
