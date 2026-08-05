#!/usr/bin/env bash
set -euo pipefail

SOURCE_BRANCH=agent/ssc-rd-wave03-exact-capture-materializer-20260805
SOURCE_PATH=tmp/rd-wave03-exact-capture-materialize.py
EVIDENCE_DIR="${EVIDENCE:?EVIDENCE is required}"
mkdir -p "$EVIDENCE_DIR"

git fetch --no-tags origin "+refs/heads/${SOURCE_BRANCH}:refs/remotes/origin/${SOURCE_BRANCH}"
source_head="$(git rev-parse "refs/remotes/origin/${SOURCE_BRANCH}")"
git show "${source_head}:${SOURCE_PATH}" > "$EVIDENCE_DIR/materializer.py"
source_blob="$(git hash-object "$EVIDENCE_DIR/materializer.py")"
source_sha256="$(sha256sum "$EVIDENCE_DIR/materializer.py" | awk '{print $1}')"
printf 'source_branch=%s\nsource_head=%s\nsource_path=%s\nsource_blob=%s\nsource_sha256=%s\n' \
  "$SOURCE_BRANCH" "$source_head" "$SOURCE_PATH" "$source_blob" "$source_sha256" \
  > "$EVIDENCE_DIR/materializer-source.txt"
python3 -m py_compile "$EVIDENCE_DIR/materializer.py"
exec python3 "$EVIDENCE_DIR/materializer.py" "$@"
