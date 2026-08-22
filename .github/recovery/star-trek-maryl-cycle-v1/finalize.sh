#!/usr/bin/env bash
set -Eeuo pipefail
rm -rf "$FINAL_ROOT"
mkdir -p "$FINAL_ROOT"
live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$EXPECTED_MAIN"
test "$(jq -r .commit.tree.sha <<<"$live")" = "$EXPECTED_TREE"
test "$(git ls-remote origin "refs/heads/${CANDIDATE_BRANCH}" | cut -f1)" = "$CANDIDATE_COMMIT"
git fetch --filter=blob:none --no-tags origin main "$CANDIDATE_BRANCH"
git checkout --detach "$CANDIDATE_COMMIT"
test "$(git rev-parse HEAD^{tree})" = "$CANDIDATE_TREE"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
(cd "$STAGE_ROOT" && sha256sum -c manifest.sha256)
(cd "$REVIEW_ROOT" && sha256sum -c manifest.sha256)
npm ci --ignore-scripts

STAGE_ROOT="$STAGE_ROOT" REVIEW_ROOT="$REVIEW_ROOT" FINAL_ROOT="$FINAL_ROOT" \
  EXPECTED_MAIN="$EXPECTED_MAIN" MEDIA_CANONICAL_PARENT="$MEDIA_CANONICAL_PARENT" CANDIDATE_BRANCH="$CANDIDATE_BRANCH" \
  CANDIDATE_COMMIT="$CANDIDATE_COMMIT" CANDIDATE_TREE="$CANDIDATE_TREE" \
  CANDIDATE_PATH_COUNT="$CANDIDATE_PATH_COUNT" CANDIDATE_PATH_LEDGER_SHA256="$CANDIDATE_PATH_LEDGER_SHA256" \
  STAGE_ARTIFACT_ID="$STAGE_ARTIFACT_ID" STAGE_ARTIFACT_DIGEST="$STAGE_ARTIFACT_DIGEST" \
  REVIEW_ARTIFACT_ID="$REVIEW_ARTIFACT_ID" REVIEW_ARTIFACT_DIGEST="$REVIEW_ARTIFACT_DIGEST" \
  MEDIA_RUN="$MEDIA_RUN" MEDIA_ARTIFACT="$MEDIA_ARTIFACT" MEDIA_DIGEST="$MEDIA_DIGEST" \
  node /tmp/star-trek-maryl-cycle-v1.mjs finalize | tee "$FINAL_ROOT/finalize.stdout.log"

python3 - "$CANDIDATE_COMMIT" /tmp/maryl-finalizer-paths.z <<'PY'
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
    raise SystemExit('Maryl finalizer produced no repository changes')
blocked = [p for p in paths if p.startswith(('.github/', 'transport/', '.luna/', '.maryl/'))]
if blocked:
    raise SystemExit('Maryl finalizer escaped product scope: ' + ', '.join(blocked))
out.write_bytes(b'\0'.join(p.encode() for p in paths) + b'\0')
PY
while IFS= read -r -d '' file; do git add -- "$file"; done < /tmp/maryl-finalizer-paths.z
test -n "$(git diff --cached --name-only)"
git config user.name undercast-star-trek-maryl-publisher
git config user.email star-trek-maryl-publisher@users.noreply.github.com
product_tree="$(git write-tree)"
product_commit="$(printf '%s\n' 'Star Trek: publish Maryl cycle' | git commit-tree "$product_tree" -p "$EXPECTED_MAIN")"
test "$(git rev-parse "${product_commit}^{tree}")" = "$product_tree"
test "$(git rev-parse "${product_commit}^")" = "$EXPECTED_MAIN"
git diff --name-only "$EXPECTED_MAIN" "$product_commit" | LC_ALL=C sort -u > "$FINAL_ROOT/product-paths.txt"
test -z "$(grep -E '^(\.github/|transport/)' "$FINAL_ROOT/product-paths.txt" || true)"
product_path_count="$(wc -l < "$FINAL_ROOT/product-paths.txt" | tr -d ' ')"
product_path_ledger_sha256="$(sha256sum "$FINAL_ROOT/product-paths.txt" | cut -d' ' -f1)"

live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)"
test "$live" = "$EXPECTED_MAIN"
git push origin "${product_commit}:refs/heads/main"
test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$product_commit"

dispatch_epoch="$(date -u +%s)"
gh workflow run pages.yml --ref main
pages_run=''
for _ in $(seq 1 180); do
  runs="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?branch=main&event=workflow_dispatch&per_page=30")"
  pages_run="$(jq -r --arg sha "$product_commit" --argjson epoch "$dispatch_epoch" '[.workflow_runs[] | select(.head_sha==$sha and ((.created_at|fromdateiso8601) >= $epoch))] | sort_by(.created_at) | last | .id // empty' <<<"$runs")"
  if test -n "$pages_run"; then
    conclusion="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}" --jq '.conclusion // empty')"
    status="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}" --jq .status)"
    if test "$status" = completed; then
      test "$conclusion" = success
      break
    fi
  fi
  sleep 10
done
test -n "$pages_run"
test "$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}" --jq .conclusion)" = success

jq -n \
  --arg product_commit "$product_commit" \
  --arg product_tree "$product_tree" \
  --argjson product_path_count "$product_path_count" \
  --arg product_path_ledger_sha256 "$product_path_ledger_sha256" \
  --argjson pages_run "$pages_run" \
  --arg receipt_sha256 "$(jq -r .receipt_sha256 "$FINAL_ROOT/receipt.json")" \
  --arg checker_sha256 "$(jq -r .checker_sha256 "$FINAL_ROOT/finalization.json")" \
  '{version:1,transaction:"STAR-TREK-MARYL-TERMINAL-EXECUTION-V1",status:"published",product_commit:$product_commit,product_tree:$product_tree,product_path_count:$product_path_count,product_path_ledger_sha256:$product_path_ledger_sha256,pages_run:$pages_run,receipt_sha256:$receipt_sha256,checker_sha256:$checker_sha256}' \
  > "$FINAL_ROOT/terminal.json"

mapfile -t maryl_branches < <(
  git ls-remote --heads origin 'refs/heads/*maryl*' \
    | awk '{sub(/^refs\/heads\//,"",$2); print $2}' \
    | LC_ALL=C sort -u
)
for branch in "${maryl_branches[@]}"; do
  test -n "$branch" || continue
  git push origin --delete "$branch"
done
for _ in $(seq 1 30); do
  test -z "$(git ls-remote --heads origin 'refs/heads/*maryl*')" && break
  sleep 2
done
test -z "$(git ls-remote --heads origin 'refs/heads/*maryl*')"
jq -n --argjson version 1 --arg transaction STAR-TREK-MARYL-CLEANUP-V1 --arg status complete --arg product "$product_commit" '{version:$version,transaction:$transaction,status:$status,product_commit:$product,maryl_refs_remaining:0}' > "$FINAL_ROOT/cleanup.json"
(cd "$FINAL_ROOT" && find . -maxdepth 1 -type f ! -name manifest.sha256 -printf '%P\n' | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done > manifest.sha256)
echo "product_commit=$product_commit" >> "$GITHUB_OUTPUT"
echo "pages_run=$pages_run" >> "$GITHUB_OUTPUT"
