#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
base_sha="$PR_BASE_SHA"
rm -rf "$WORKTREE"
git worktree add --detach "$WORKTREE" "$base_sha"
while IFS= read -r path; do
  mkdir -p "$WORKTREE/$(dirname "$path")"
  cp -p "$PRODUCT_OUT/$path" "$WORKTREE/$path"
done < "$PAYLOAD_OUT/expected-paths.txt"
git -C "$WORKTREE" add -N --pathspec-from-file="$PAYLOAD_OUT/expected-paths.txt"
git -C "$WORKTREE" diff --name-only "$base_sha" | LC_ALL=C sort > "$OUT/overlay-paths.txt"
diff -u "$PAYLOAD_OUT/expected-paths.txt" "$OUT/overlay-paths.txt"
git -C "$WORKTREE" diff --check
git -C "$WORKTREE" config user.name 'Undercast Autopilot'
git -C "$WORKTREE" config user.email 'autopilot@undercast.invalid'
git -C "$WORKTREE" add --pathspec-from-file="$PAYLOAD_OUT/expected-paths.txt"
git -C "$WORKTREE" diff --cached --name-only | LC_ALL=C sort > "$OUT/staged-paths.txt"
diff -u "$PAYLOAD_OUT/expected-paths.txt" "$OUT/staged-paths.txt"
export GIT_AUTHOR_DATE='2026-08-07T02:30:00Z'
export GIT_COMMITTER_DATE='2026-08-07T02:30:00Z'
git -C "$WORKTREE" commit -m 'Doctor Who: materialize reviewed cycle 008 Kreg candidate'
candidate_commit="$(git -C "$WORKTREE" rev-parse HEAD)"
test "$(git -C "$WORKTREE" show -s --format=%P HEAD)" = "$base_sha"
git -C "$WORKTREE" diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort > "$OUT/commit-paths.txt"
diff -u "$PAYLOAD_OUT/expected-paths.txt" "$OUT/commit-paths.txt"
WORKTREE="$WORKTREE" COMMIT="$candidate_commit" MANIFEST="$PAYLOAD_OUT/candidate-file-manifest.json" python3 - <<'PY'
import json, os, subprocess
manifest=json.load(open(os.environ['MANIFEST']))
for row in manifest['files']:
    blob=subprocess.check_output(['git','-C',os.environ['WORKTREE'],'rev-parse',f"{os.environ['COMMIT']}:{row['path']}"],text=True).strip()
    assert blob==row['git_blob'], (row['path'],blob,row['git_blob'])
PY
printf '%s\n' "$candidate_commit" > "$OUT/candidate-commit.txt"
git -C "$WORKTREE" rev-parse 'HEAD^{tree}' > "$OUT/candidate-tree.txt"
test -z "$(git -C "$WORKTREE" status --porcelain)"
