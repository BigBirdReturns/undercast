#!/usr/bin/env bash
set -Eeuo pipefail
rm -rf "$ROOT" "$MEDIA_ROOT" "$STAGE_ROOT" /tmp/maryl-media.zip /tmp/star-trek-maryl-cycle-v1.mjs /tmp/star-trek-maryl-cycle-v1.mjs.sha256
mkdir -p "$ROOT" "$MEDIA_ROOT" "$STAGE_ROOT"
bash .github/recovery/star-trek-maryl-cycle-v1/prepare.sh

live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$EXPECTED_MAIN"
test "$(jq -r .commit.tree.sha <<<"$live")" = "$EXPECTED_TREE"
test "$(jq -r '.parents | length' <<<"$live")" = 1
test "$(jq -r .commit.message <<<"$live")" = 'Star Trek: publish Lorot cycle'
printf '%s\n' "$live" | jq . > "$ROOT/live-main.json"
test -z "$(git ls-remote origin "refs/heads/${CANDIDATE_BRANCH}" || true)"

meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${MEDIA_ARTIFACT}")"
test "$(jq -r .expired <<<"$meta")" = false
test "$(jq -r .name <<<"$meta")" = star-trek-maryl-source-media-v1
test "$(jq -r .digest <<<"$meta")" = "$MEDIA_DIGEST"
test "$(jq -r .workflow_run.id <<<"$meta")" = "$MEDIA_RUN"
test "$(jq -r .workflow_run.head_sha <<<"$meta")" = "$MEDIA_HEAD"
printf '%s\n' "$meta" | jq . > "$ROOT/source-media-artifact.json"
gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${MEDIA_ARTIFACT}/zip" > /tmp/maryl-media.zip
echo "${MEDIA_DIGEST#sha256:}  /tmp/maryl-media.zip" | sha256sum -c -
unzip -q /tmp/maryl-media.zip -d "$MEDIA_ROOT"
for file in locator.json visual-review.json source-revision.json source.wikitext selected-jeri-ryan-maryl.jpg; do
  test -n "$(find "$MEDIA_ROOT" -type f -name "$file" -print -quit)"
done

git fetch --filter=blob:none --no-tags origin main
test "$(git rev-parse refs/remotes/origin/main)" = "$EXPECTED_MAIN"
git checkout --detach "$EXPECTED_MAIN"
git checkout -B "$CANDIDATE_BRANCH"
npm ci --ignore-scripts

MEDIA_ROOT="$MEDIA_ROOT" STAGE_ROOT="$STAGE_ROOT" EXPECTED_MAIN="$EXPECTED_MAIN" \
  node /tmp/star-trek-maryl-cycle-v1.mjs stage | tee "$ROOT/stage.stdout.log"
rm -rf .luna

python3 - "$EXPECTED_MAIN" /tmp/maryl-candidate-paths.z <<'PY'
from pathlib import Path
import subprocess, sys
base, out = sys.argv[1], Path(sys.argv[2])
paths = []
for command in (
    ['git', 'diff', '--name-only', '-z', base],
    ['git', 'ls-files', '--others', '--exclude-standard', '-z'],
):
    paths.extend(p.decode() for p in subprocess.check_output(command).split(b'\0') if p)
paths = sorted(set(paths))
if not paths:
    raise SystemExit('Maryl candidate produced no repository changes')
blocked = [p for p in paths if p.startswith(('.github/', 'transport/', '.luna/', '.maryl/'))]
if blocked:
    raise SystemExit('Maryl candidate escaped product scope: ' + ', '.join(blocked))
out.write_bytes(b'\0'.join(p.encode() for p in paths) + b'\0')
PY
while IFS= read -r -d '' file; do git add -- "$file"; done < /tmp/maryl-candidate-paths.z
test -n "$(git diff --cached --name-only)"

git config user.name undercast-star-trek-maryl-stage
git config user.email star-trek-maryl-stage@users.noreply.github.com
git commit -m 'Star Trek: stage Maryl candidate'
candidate_commit="$(git rev-parse HEAD)"
candidate_tree="$(git rev-parse HEAD^{tree})"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
git diff --name-only "$EXPECTED_MAIN"..HEAD | LC_ALL=C sort -u > "$STAGE_ROOT/candidate-paths.txt"
candidate_path_count="$(wc -l < "$STAGE_ROOT/candidate-paths.txt" | tr -d ' ')"
candidate_path_ledger_sha256="$(sha256sum "$STAGE_ROOT/candidate-paths.txt" | cut -d' ' -f1)"
test -z "$(grep -E '^(\.github/|transport/)' "$STAGE_ROOT/candidate-paths.txt" || true)"
jq -n \
  --arg canonical_parent "$EXPECTED_MAIN" \
  --arg candidate_commit "$candidate_commit" \
  --arg candidate_tree "$candidate_tree" \
  --argjson candidate_path_count "$candidate_path_count" \
  --arg candidate_path_ledger_sha256 "$candidate_path_ledger_sha256" \
  --arg workflow_run "$GITHUB_RUN_ID" \
  '{version:1,transaction:"STAR-TREK-MARYL-CANDIDATE-METADATA-V1",canonical_parent:$canonical_parent,candidate_commit:$candidate_commit,candidate_tree:$candidate_tree,candidate_path_count:$candidate_path_count,candidate_path_ledger_sha256:$candidate_path_ledger_sha256,workflow_run:($workflow_run|tonumber)}' \
  > "$STAGE_ROOT/candidate-metadata.json"
cp "$ROOT/live-main.json" "$ROOT/source-media-artifact.json" "$ROOT/stage.stdout.log" "$STAGE_ROOT/"
cp /tmp/star-trek-maryl-cycle-v1.mjs.sha256 "$STAGE_ROOT/helper.sha256"
(cd "$STAGE_ROOT" && find . -maxdepth 1 -type f ! -name manifest.sha256 -printf '%P\n' | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done > manifest.sha256)

git push origin "HEAD:refs/heads/${CANDIDATE_BRANCH}"
wall_id="$(jq -r .wall_id "$STAGE_ROOT/stage.json")"
lease_id="$(jq -r .lease.id "$STAGE_ROOT/stage.json")"
echo "candidate_commit=$candidate_commit" >> "$GITHUB_OUTPUT"
echo "candidate_tree=$candidate_tree" >> "$GITHUB_OUTPUT"
echo "candidate_path_count=$candidate_path_count" >> "$GITHUB_OUTPUT"
echo "candidate_path_ledger_sha256=$candidate_path_ledger_sha256" >> "$GITHUB_OUTPUT"
echo "wall_id=$wall_id" >> "$GITHUB_OUTPUT"
echo "lease_id=$lease_id" >> "$GITHUB_OUTPUT"
