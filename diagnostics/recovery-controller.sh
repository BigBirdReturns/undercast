#!/usr/bin/env bash
set -Eeuo pipefail

rebase() {
rm -rf "$STAGE_ROOT" "$DIAGNOSTIC_ROOT"
mkdir -p "$STAGE_ROOT" "$DIAGNOSTIC_ROOT"
cp -a /tmp/original-anastasia-stage-v1/. "$STAGE_ROOT/"

(cd "$STAGE_ROOT" && sha256sum -c manifest.sha256)
(cd /tmp/original-anastasia-review-v1 && sha256sum -c manifest.sha256)
test "$(jq -r .review_sha256 /tmp/original-anastasia-review-v1/independent-review.json)" = "$ORIGINAL_REVIEW_SHA256"
test "$(jq -r .status /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/finalization.json)" = qualified
test "$(jq -r .receipt_sha256 /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/finalization.json)" = 030adb34c2ad90d3c7274edd045439e20e0b26e2dcbc84bd7b1e661ebff72972
test "$(jq -r .checker_sha256 /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/finalization.json)" = a613a407de3082d29743dd3317ad9fec99e389947e26b5ac53d59c1f213de3a6
test "$(jq -r .reviewed_cycle /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/finalization.json)" = cycle_6337cdcea3938940b7d2aa95
cp /tmp/original-anastasia-review-v1/independent-review.json "$STAGE_ROOT/original-independent-review.json"
cp /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/finalization.json "$STAGE_ROOT/original-qualified-finalization.json"
cp /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/receipt.json "$STAGE_ROOT/original-qualified-receipt.json"
cp /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/next.json "$STAGE_ROOT/original-qualified-next.json"
cp /tmp/original-anastasia-finalization-failure-v1/star-trek-anastasia-final-v1/waterline.json "$STAGE_ROOT/original-qualified-waterline.json"

stage_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ORIGINAL_STAGE_ARTIFACT}")"
review_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ORIGINAL_REVIEW_ARTIFACT}")"
failure_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${ORIGINAL_FINALIZATION_ARTIFACT}")"
media_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${MEDIA_ARTIFACT}")"
test "$(jq -r .expired <<<"$stage_meta")" = false
test "$(jq -r .name <<<"$stage_meta")" = star-trek-anastasia-stage-v1
test "$(jq -r .digest <<<"$stage_meta")" = "sha256:${ORIGINAL_STAGE_DIGEST}"
test "$(jq -r .workflow_run.id <<<"$stage_meta")" = "$ORIGINAL_RUN"
test "$(jq -r .expired <<<"$review_meta")" = false
test "$(jq -r .name <<<"$review_meta")" = star-trek-anastasia-independent-review-v1
test "$(jq -r .digest <<<"$review_meta")" = "sha256:${ORIGINAL_REVIEW_DIGEST}"
test "$(jq -r .workflow_run.id <<<"$review_meta")" = "$ORIGINAL_RUN"
test "$(jq -r .expired <<<"$failure_meta")" = false
test "$(jq -r .digest <<<"$failure_meta")" = "sha256:${ORIGINAL_FINALIZATION_DIGEST}"
test "$(jq -r .expired <<<"$media_meta")" = false
test "$(jq -r .name <<<"$media_meta")" = star-trek-anastasia-media-v1
test "$(jq -r .digest <<<"$media_meta")" = "sha256:${MEDIA_DIGEST}"
test "$(jq -r .workflow_run.id <<<"$media_meta")" = "$MEDIA_RUN"
test "$(jq -r .workflow_run.head_sha <<<"$media_meta")" = "$MEDIA_HEAD"
printf '%s\n' "$stage_meta" | jq . > "$STAGE_ROOT/original-stage-artifact.json"
printf '%s\n' "$review_meta" | jq . > "$STAGE_ROOT/original-review-artifact.json"
printf '%s\n' "$failure_meta" | jq . > "$STAGE_ROOT/original-finalization-artifact.json"
printf '%s\n' "$media_meta" | jq . > "$STAGE_ROOT/source-media-artifact.json"

live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$CURRENT_MAIN"
test "$(jq -r .commit.tree.sha <<<"$live")" = "$CURRENT_TREE"
test "$(jq -r '.parents | length' <<<"$live")" = 1
test "$(jq -r .parents[0].sha <<<"$live")" = "$QUEEN_PARENT"
printf '%s\n' "$live" | jq . > "$STAGE_ROOT/live-main.json"

git fetch --filter=blob:none --no-tags origin main "$OLD_CANDIDATE_BRANCH" "$CONTROLLER_SOURCE_BRANCH"
test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"
test "$(git rev-parse "${CURRENT_MAIN}^{tree}")" = "$CURRENT_TREE"
test "$(git rev-parse "${CURRENT_MAIN}^")" = "$QUEEN_PARENT"
test "$(git rev-parse "${QUEEN_PARENT}^{tree}")" = "$QUEEN_TREE"
test "$(git rev-parse "refs/remotes/origin/${OLD_CANDIDATE_BRANCH}")" = "$OLD_CANDIDATE"
test "$(git rev-parse "${OLD_CANDIDATE}^{tree}")" = "$OLD_CANDIDATE_TREE"
test "$(git rev-parse "${OLD_CANDIDATE}^")" = "$QUEEN_PARENT"

git show "refs/remotes/origin/${CONTROLLER_SOURCE_BRANCH}:${CONTROLLER_SOURCE_PATH}" > "$CONTROLLER"
echo "${CONTROLLER_SHA256}  ${CONTROLLER}" | sha256sum -c -
node --check "$CONTROLLER"
printf '%s  %s\n' "$CONTROLLER_SHA256" "$CONTROLLER" > "$STAGE_ROOT/controller.sha256"

git diff --name-only "$QUEEN_PARENT" "$CURRENT_MAIN" | LC_ALL=C sort -u > "$STAGE_ROOT/maintenance-paths.txt"
cat > "$STAGE_ROOT/expected-maintenance-paths.txt" <<'PATHS'
data/MEDIA-SEARCH-LATEST.json
data/journal/media-search.jsonl
PATHS
cmp "$STAGE_ROOT/expected-maintenance-paths.txt" "$STAGE_ROOT/maintenance-paths.txt"

git diff --name-only "$QUEEN_PARENT" "$OLD_CANDIDATE" | LC_ALL=C sort -u > "$STAGE_ROOT/old-candidate-paths-readback.txt"
cmp "$STAGE_ROOT/candidate-paths.txt" "$STAGE_ROOT/old-candidate-paths-readback.txt"
test "$(wc -l < "$STAGE_ROOT/candidate-paths.txt" | tr -d ' ')" = "$CANDIDATE_PATH_COUNT"
test "$(sha256sum "$STAGE_ROOT/candidate-paths.txt" | cut -d' ' -f1)" = "$CANDIDATE_PATH_LEDGER_SHA256"
test -z "$(comm -12 "$STAGE_ROOT/candidate-paths.txt" "$STAGE_ROOT/maintenance-paths.txt")"
test -z "$(grep -E '^(\.github/|transport/|\.luna/)' "$STAGE_ROOT/candidate-paths.txt" || true)"

git checkout --detach "$CURRENT_MAIN"
npm ci --ignore-scripts --no-audit --no-fund
node scripts/star-trek-queen-of-hearts-cycle.mjs
node scripts/thesis-rails.mjs validate
node scripts/thesis-rails.mjs next --json > "$STAGE_ROOT/thesis-next.json"
jq -e --arg task "$TASK_ID" --arg fp "$SOURCE_FINGERPRINT" \
  '.phase=="ready-for-one-cycle" and .scope_id=="star-trek" and .candidate.task_id==$task and .candidate.source_fingerprint==$fp' \
  "$STAGE_ROOT/thesis-next.json" >/dev/null

cp "$STAGE_ROOT/stage.json" "$STAGE_ROOT/original-stage.json"
cp "$STAGE_ROOT/candidate-metadata.json" "$STAGE_ROOT/original-candidate-metadata.json"
cp /tmp/original-anastasia-stage-v1/live-main.json "$STAGE_ROOT/original-live-main.json"
cp /tmp/original-anastasia-stage-v1/thesis-next.json "$STAGE_ROOT/original-thesis-next.json"

git checkout --detach "$OLD_CANDIDATE"
git checkout "$CURRENT_MAIN" -- data/MEDIA-SEARCH-LATEST.json data/journal/media-search.jsonl
git add data/MEDIA-SEARCH-LATEST.json data/journal/media-search.jsonl
rebased_tree="$(git write-tree)"
export GIT_AUTHOR_NAME=undercast-star-trek-anastasia-recovery
export GIT_AUTHOR_EMAIL=star-trek-anastasia-recovery@users.noreply.github.com
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_AUTHOR_DATE=2026-08-23T05:13:09Z
export GIT_COMMITTER_DATE=2026-08-23T05:13:09Z
rebased_commit="$(printf '%s\n' 'Star Trek: rebase reviewed Anastasia candidate onto media-search maintenance' | git commit-tree "$rebased_tree" -p "$CURRENT_MAIN")"
test "$(git rev-parse "${rebased_commit}^{tree}")" = "$rebased_tree"
test "$(git rev-parse "${rebased_commit}^")" = "$CURRENT_MAIN"
git diff --name-only "$CURRENT_MAIN" "$rebased_commit" | LC_ALL=C sort -u > "$STAGE_ROOT/rebased-candidate-paths.txt"
cmp "$STAGE_ROOT/candidate-paths.txt" "$STAGE_ROOT/rebased-candidate-paths.txt"
candidate_path_count="$(wc -l < "$STAGE_ROOT/rebased-candidate-paths.txt" | tr -d ' ')"
candidate_path_ledger_sha256="$(sha256sum "$STAGE_ROOT/rebased-candidate-paths.txt" | cut -d' ' -f1)"
test "$candidate_path_count" = "$CANDIDATE_PATH_COUNT"
test "$candidate_path_ledger_sha256" = "$CANDIDATE_PATH_LEDGER_SHA256"

existing="$(git ls-remote origin "refs/heads/${REBASED_CANDIDATE_BRANCH}" | cut -f1)"
if test -n "$existing"; then
  test "$existing" = "$rebased_commit"
else
  git push origin "${rebased_commit}:refs/heads/${REBASED_CANDIDATE_BRANCH}"
fi
test "$(git ls-remote origin "refs/heads/${REBASED_CANDIDATE_BRANCH}" | cut -f1)" = "$rebased_commit"

node - "$STAGE_ROOT" "$CURRENT_MAIN" "$CURRENT_TREE" "$rebased_commit" "$rebased_tree" "$candidate_path_count" "$candidate_path_ledger_sha256" "$GITHUB_RUN_ID" <<'NODE'
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const [root, currentMain, currentTree, candidateCommit, candidateTree, pathCountRaw, pathSha, runIdRaw] = process.argv.slice(2);
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const pretty = (value) => JSON.stringify(stable(value), null, 2) + '\n';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

const stage = read('stage.json');
const originalStageReceipt = stage.receipt_sha256;
stage.canonical_parent = currentMain;
stage.canonical_tree = currentTree;
delete stage.receipt_sha256;
stage.receipt_sha256 = sha(Buffer.from(pretty(stage)));
write('stage.json', stage);

const metadata = read('candidate-metadata.json');
const originalCandidate = {
  canonical_parent: metadata.canonical_parent,
  canonical_tree: metadata.canonical_tree,
  commit: metadata.candidate_commit,
  tree: metadata.candidate_tree,
  workflow_run: metadata.workflow_run,
};
metadata.canonical_parent = currentMain;
metadata.canonical_tree = currentTree;
metadata.candidate_commit = candidateCommit;
metadata.candidate_tree = candidateTree;
metadata.candidate_path_count = Number(pathCountRaw);
metadata.candidate_path_ledger_sha256 = pathSha;
metadata.workflow_run = Number(runIdRaw);
write('candidate-metadata.json', metadata);

const rebindBody = {
  version: 1,
  transaction: 'STAR-TREK-ANASTASIA-CANDIDATE-REBIND-V2',
  current_main: { commit: currentMain, tree: currentTree },
  prior_product_parent: {
    commit: '97956ce415d565d968cc5f66067142183ec28a1f',
    tree: 'ff8adadb6dd36ab84a21336bdd30ce3cb17b5335',
  },
  maintenance_paths: [
    'data/MEDIA-SEARCH-LATEST.json',
    'data/journal/media-search.jsonl',
  ],
  original_candidate: originalCandidate,
  rebound_candidate: {
    commit: candidateCommit,
    tree: candidateTree,
    path_count: Number(pathCountRaw),
    path_ledger_sha256: pathSha,
  },
  lease: {
    id: stage.lease.id,
    claim_event_id: stage.lease.claim_event_id,
    additional_lease_issued: false,
  },
  original_stage_receipt_sha256: originalStageReceipt,
  rebound_stage_receipt_sha256: stage.receipt_sha256,
  original_artifacts: {
    stage: {
      id: 9487851739,
      sha256: '19046c8b4f9ef68d71628816184276e7f69fc98179ab9da9f635fd84efc2798e',
    },
    review: {
      id: 9487860916,
      sha256: '6712542cd1d77718c564663b0fd5d16b0f81654c3115c83dc0338c7cbc02b532',
      review_sha256: 'a981414aa4d8066d6bc6fdedae402a01a96bf1ee8a3476c2189e359d88d229d5',
    },
    finalization_failure: {
      id: 9487877149,
      sha256: 'fb7c90e325e2eba7b5bf96babc53ab71524be7e96a4a136cabb36ae68dbadbb6',
      failure_mode: 'adapter-sdk baseline stale after otherwise qualified local product',
    },
  },
  boundary: {
    product_delta_changed: false,
    source_media_parent_changed: false,
    task_reclaimed: false,
    review_reused_without_reexecution: false,
    canonical_mutation: false,
  },
};
write('rebind.json', { ...rebindBody, receipt_sha256: sha(Buffer.from(pretty(rebindBody))) });
NODE

stage_receipt_sha256="$(jq -r .receipt_sha256 "$STAGE_ROOT/stage.json")"
test -n "$stage_receipt_sha256"
rm -f "$STAGE_ROOT/manifest.sha256"
(cd "$STAGE_ROOT" && find . -maxdepth 1 -type f ! -name manifest.sha256 -printf '%P\n' | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done > manifest.sha256 && sha256sum -c manifest.sha256)

echo "candidate_commit=$rebased_commit" >> "$GITHUB_OUTPUT"
echo "candidate_tree=$rebased_tree" >> "$GITHUB_OUTPUT"
echo "candidate_path_count=$candidate_path_count" >> "$GITHUB_OUTPUT"
echo "candidate_path_ledger_sha256=$candidate_path_ledger_sha256" >> "$GITHUB_OUTPUT"
echo "stage_receipt_sha256=$stage_receipt_sha256" >> "$GITHUB_OUTPUT"
}

review() {
rm -rf "$REVIEW_ROOT"
mkdir -p "$REVIEW_ROOT"
(cd "$STAGE_ROOT" && sha256sum -c manifest.sha256)
test "$(jq -r .canonical_parent "$STAGE_ROOT/stage.json")" = "$CURRENT_MAIN"
test "$(jq -r .canonical_tree "$STAGE_ROOT/stage.json")" = "$CURRENT_TREE"
test "$(jq -r .candidate_commit "$STAGE_ROOT/candidate-metadata.json")" = "$CANDIDATE_COMMIT"
test "$(jq -r .candidate_tree "$STAGE_ROOT/candidate-metadata.json")" = "$CANDIDATE_TREE"
test "$(jq -r .lease.id "$STAGE_ROOT/stage.json")" = lease_7d5e1311748aad6fae189b59
test "$(jq -r .lease.claim_event_id "$STAGE_ROOT/stage.json")" = apj_99eeee2ec5587c35f13f3f16
test "$(jq -r .boundary.task_reclaimed "$STAGE_ROOT/rebind.json")" = false

live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$CURRENT_MAIN"
test "$(jq -r .commit.tree.sha <<<"$live")" = "$CURRENT_TREE"

git fetch --filter=blob:none --no-tags origin "$REBASED_CANDIDATE_BRANCH" "$CONTROLLER_SOURCE_BRANCH"
test "$(git rev-parse "refs/remotes/origin/${REBASED_CANDIDATE_BRANCH}")" = "$CANDIDATE_COMMIT"
git show "refs/remotes/origin/${CONTROLLER_SOURCE_BRANCH}:${CONTROLLER_SOURCE_PATH}" > "$CONTROLLER"
echo "${CONTROLLER_SHA256}  ${CONTROLLER}" | sha256sum -c -
node --check "$CONTROLLER"

git checkout --detach "$CANDIDATE_COMMIT"
test "$(git rev-parse HEAD^{tree})" = "$CANDIDATE_TREE"
test "$(git rev-parse HEAD^)" = "$CURRENT_MAIN"
git diff --name-only "$CURRENT_MAIN" HEAD | LC_ALL=C sort -u > /tmp/rebound-review-paths.txt
cmp /tmp/rebound-review-paths.txt "$STAGE_ROOT/candidate-paths.txt"
test "$(wc -l < /tmp/rebound-review-paths.txt | tr -d ' ')" = "$CANDIDATE_PATH_COUNT"
test "$(sha256sum /tmp/rebound-review-paths.txt | cut -d' ' -f1)" = "$CANDIDATE_PATH_LEDGER_SHA256"
test -z "$(grep -E '^(\.github/|transport/|\.luna/)' /tmp/rebound-review-paths.txt || true)"

npm ci --ignore-scripts --no-audit --no-fund
STAGE_ROOT="$STAGE_ROOT" REVIEW_ROOT="$REVIEW_ROOT" \
  EXPECTED_MAIN="$CURRENT_MAIN" EXPECTED_TREE="$CURRENT_TREE" MEDIA_CANONICAL_PARENT="$MEDIA_CANONICAL_PARENT" \
  CANDIDATE_COMMIT="$CANDIDATE_COMMIT" CANDIDATE_TREE="$CANDIDATE_TREE" \
  CANDIDATE_PATH_COUNT="$CANDIDATE_PATH_COUNT" CANDIDATE_PATH_LEDGER_SHA256="$CANDIDATE_PATH_LEDGER_SHA256" \
  node "$CONTROLLER" review | tee "$REVIEW_ROOT/review.stdout.log"

review_sha256="$(jq -r .review_sha256 "$REVIEW_ROOT/independent-review.json")"
test -n "$review_sha256"
jq -e --arg commit "$CANDIDATE_COMMIT" --arg tree "$CANDIDATE_TREE" \
  '.verdict=="pass" and .canonical_parent=="933415b505d1c6e40c7e4bd44bf132c61a5ea32d" and .candidate.commit==$commit and .candidate.tree==$tree and .lease_id=="lease_7d5e1311748aad6fae189b59"' \
  "$REVIEW_ROOT/independent-review.json" >/dev/null
(cd "$REVIEW_ROOT" && find . -maxdepth 1 -type f ! -name manifest.sha256 -printf '%P\n' | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done > manifest.sha256 && sha256sum -c manifest.sha256)
echo "review_sha256=$review_sha256" >> "$GITHUB_OUTPUT"
}

finalize() {
rm -rf "$FINAL_ROOT" "$DIAGNOSTIC_ROOT"
mkdir -p "$FINAL_ROOT" "$DIAGNOSTIC_ROOT"
(cd "$STAGE_ROOT" && sha256sum -c manifest.sha256)
(cd "$REVIEW_ROOT" && sha256sum -c manifest.sha256)
test "$(jq -r .candidate.commit "$REVIEW_ROOT/independent-review.json")" = "$CANDIDATE_COMMIT"
test "$(jq -r .review_sha256 "$REVIEW_ROOT/independent-review.json")" = "$REBOUND_REVIEW_SHA256"
test "$(jq -r .lease_id "$REVIEW_ROOT/independent-review.json")" = lease_7d5e1311748aad6fae189b59

live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$CURRENT_MAIN"
test "$(jq -r .commit.tree.sha <<<"$live")" = "$CURRENT_TREE"
printf '%s\n' "$live" | jq . > "$FINAL_ROOT/main-before.json"

git fetch --filter=blob:none --no-tags origin main "$REBASED_CANDIDATE_BRANCH" "$CONTROLLER_SOURCE_BRANCH"
test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"
test "$(git rev-parse "refs/remotes/origin/${REBASED_CANDIDATE_BRANCH}")" = "$CANDIDATE_COMMIT"
git show "refs/remotes/origin/${CONTROLLER_SOURCE_BRANCH}:${CONTROLLER_SOURCE_PATH}" > "$CONTROLLER"
echo "${CONTROLLER_SHA256}  ${CONTROLLER}" | sha256sum -c -
node --check "$CONTROLLER"

git checkout --detach "$CANDIDATE_COMMIT"
test "$(git rev-parse HEAD^{tree})" = "$CANDIDATE_TREE"
test "$(git rev-parse HEAD^)" = "$CURRENT_MAIN"
git diff --name-only "$CURRENT_MAIN" HEAD | LC_ALL=C sort -u > /tmp/recovery-candidate-paths.txt
cmp /tmp/recovery-candidate-paths.txt "$STAGE_ROOT/candidate-paths.txt"
npm ci --ignore-scripts --no-audit --no-fund

STAGE_ROOT="$STAGE_ROOT" REVIEW_ROOT="$REVIEW_ROOT" FINAL_ROOT="$FINAL_ROOT" \
  EXPECTED_MAIN="$CURRENT_MAIN" EXPECTED_TREE="$CURRENT_TREE" MEDIA_CANONICAL_PARENT="$MEDIA_CANONICAL_PARENT" \
  CANDIDATE_BRANCH="$REBASED_CANDIDATE_BRANCH" \
  CANDIDATE_COMMIT="$CANDIDATE_COMMIT" CANDIDATE_TREE="$CANDIDATE_TREE" \
  CANDIDATE_PATH_COUNT="$CANDIDATE_PATH_COUNT" CANDIDATE_PATH_LEDGER_SHA256="$CANDIDATE_PATH_LEDGER_SHA256" \
  STAGE_ARTIFACT_ID="$REBOUND_STAGE_ARTIFACT_ID" STAGE_ARTIFACT_DIGEST="$REBOUND_STAGE_ARTIFACT_DIGEST" \
  REVIEW_ARTIFACT_ID="$REBOUND_REVIEW_ARTIFACT_ID" REVIEW_ARTIFACT_DIGEST="$REBOUND_REVIEW_ARTIFACT_DIGEST" \
  MEDIA_RUN="$MEDIA_RUN" MEDIA_ARTIFACT="$MEDIA_ARTIFACT" MEDIA_DIGEST="sha256:${MEDIA_DIGEST}" \
  node "$CONTROLLER" finalize | tee "$FINAL_ROOT/finalize.stdout.log"

jq -e '.transaction=="STAR-TREK-ANASTASIA-KOMANANOV-FINALIZATION-V1" and .status=="qualified"' "$FINAL_ROOT/finalization.json" >/dev/null
npm run adapter:write
npm run adapter:check
git diff --check

python3 - "$CANDIDATE_COMMIT" /tmp/anastasia-recovery-finalizer-paths.z <<'PY'
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
    raise SystemExit('Anastasia recovery finalizer produced no repository changes')
blocked = [p for p in paths if p.startswith(('.github/', 'transport/', '.luna/'))]
if blocked:
    raise SystemExit('Anastasia recovery finalizer escaped product scope: ' + ', '.join(blocked))
out.write_bytes(b'\0'.join(p.encode() for p in paths) + b'\0')
PY
while IFS= read -r -d '' file; do git add -- "$file"; done < /tmp/anastasia-recovery-finalizer-paths.z
test -n "$(git diff --cached --name-only)"
git config user.name undercast-star-trek-anastasia-recovery-publisher
git config user.email star-trek-anastasia-recovery-publisher@users.noreply.github.com
product_tree="$(git write-tree)"
product_commit="$(printf '%s\n' 'Star Trek: publish Anastasia Komananov cycle' | git commit-tree "$product_tree" -p "$CURRENT_MAIN")"
test "$(git rev-parse "${product_commit}^{tree}")" = "$product_tree"
test "$(git rev-parse "${product_commit}^")" = "$CURRENT_MAIN"
git diff --name-only "$CURRENT_MAIN" "$product_commit" | LC_ALL=C sort -u > "$FINAL_ROOT/product-paths.txt"
test -z "$(grep -E '^(\.github/|transport/|\.luna/)' "$FINAL_ROOT/product-paths.txt" || true)"
for required in \
  data/review/adapter-sdk/BASELINE.json \
  data/review/adapter-sdk/star-trek-anastasia-komananov-cycle.json \
  scripts/star-trek-anastasia-komananov-cycle.mjs \
  images/uc-1395-still.jpg \
  images/uc-1395-portrait.jpg; do
  test "$(grep -c "^${required}$" "$FINAL_ROOT/product-paths.txt")" = 1
done
product_path_count="$(wc -l < "$FINAL_ROOT/product-paths.txt" | tr -d ' ')"
product_path_ledger_sha256="$(sha256sum "$FINAL_ROOT/product-paths.txt" | cut -d' ' -f1)"

git checkout --detach "$product_commit"
node scripts/star-trek-anastasia-komananov-cycle.mjs
node scripts/star-trek-queen-of-hearts-cycle.mjs
node scripts/thesis-rails.mjs validate
node scripts/media-audit.mjs gate --scope star-trek
node scripts/waterline.mjs validate
node scripts/corpus-ops.mjs validate
node scripts/validate.mjs
node scripts/gate.mjs --skip-rendered
test -z "$(git status --porcelain)"

test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$CURRENT_MAIN"
git push origin "${product_commit}:refs/heads/main"
test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$product_commit"

dispatch_epoch="$(date -u +%s)"
gh workflow run pages.yml --ref main
pages_run=''
for _ in $(seq 1 180); do
  runs="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?branch=main&event=workflow_dispatch&per_page=30")"
  pages_run="$(jq -r --arg sha "$product_commit" --argjson epoch "$dispatch_epoch" '[.workflow_runs[] | select(.head_sha==$sha and ((.created_at|fromdateiso8601) >= $epoch))] | sort_by(.created_at) | last | .id // empty' <<<"$runs")"
  if test -n "$pages_run"; then
    status="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}" --jq .status)"
    if test "$status" = completed; then
      test "$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}" --jq .conclusion)" = success
      break
    fi
  fi
  sleep 5
done
test -n "$pages_run"
pages_result="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}")"
test "$(jq -r .conclusion <<<"$pages_result")" = success
test "$(jq -r .head_sha <<<"$pages_result")" = "$product_commit"
printf '%s\n' "$pages_result" | jq . > "$FINAL_ROOT/pages-run.json"

main_after="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$main_after")" = "$product_commit"
test "$(jq -r .commit.tree.sha <<<"$main_after")" = "$product_tree"
test "$(jq -r '.parents | length' <<<"$main_after")" = 1
test "$(jq -r .parents[0].sha <<<"$main_after")" = "$CURRENT_MAIN"
printf '%s\n' "$main_after" | jq . > "$FINAL_ROOT/main-after.json"

receipt_sha256="$(jq -r .receipt_sha256 "$FINAL_ROOT/receipt.json")"
checker_sha256="$(jq -r .checker_sha256 "$FINAL_ROOT/finalization.json")"
reviewed_cycle="$(jq -r .reviewed_cycle "$FINAL_ROOT/finalization.json")"
next_task="$(jq -r .next.task_id "$FINAL_ROOT/finalization.json")"
jq -n \
  --arg status published \
  --arg product_commit "$product_commit" \
  --arg product_tree "$product_tree" \
  --arg canonical_parent "$CURRENT_MAIN" \
  --argjson product_path_count "$product_path_count" \
  --arg product_path_ledger_sha256 "$product_path_ledger_sha256" \
  --argjson pages_run "$pages_run" \
  --arg receipt_sha256 "$receipt_sha256" \
  --arg checker_sha256 "$checker_sha256" \
  --arg reviewed_cycle "$reviewed_cycle" \
  --arg next_task "$next_task" \
  --arg lease_id lease_7d5e1311748aad6fae189b59 \
  --arg rebound_candidate "$CANDIDATE_COMMIT" \
  --arg rebound_review_sha256 "$REBOUND_REVIEW_SHA256" \
  '{version:2,transaction:"STAR-TREK-ANASTASIA-KOMANANOV-RECOVERY-TERMINAL-V2",status:$status,product_commit:$product_commit,product_tree:$product_tree,canonical_parent:$canonical_parent,product_path_count:$product_path_count,product_path_ledger_sha256:$product_path_ledger_sha256,pages_run:$pages_run,receipt_sha256:$receipt_sha256,checker_sha256:$checker_sha256,reviewed_cycle:$reviewed_cycle,next_task:$next_task,lease:{id:$lease_id,additional_lease_issued:false},rebound_candidate:$rebound_candidate,rebound_review_sha256:$rebound_review_sha256,adapter_baseline_refreshed:true,canonical_mutation:true}' \
  > "$FINAL_ROOT/terminal.json"

cp data/review/adapter-sdk/star-trek-anastasia-komananov-cycle.json "$FINAL_ROOT/canonical-receipt.json"
cp scripts/star-trek-anastasia-komananov-cycle.mjs "$FINAL_ROOT/canonical-checker.mjs"
cp data/review/adapter-sdk/BASELINE.json "$FINAL_ROOT/adapter-baseline.json"
cp "$STAGE_ROOT/rebind.json" "$FINAL_ROOT/candidate-rebind.json"
cp "$STAGE_ROOT/candidate-metadata.json" "$FINAL_ROOT/rebound-candidate-metadata.json"
cp "$REVIEW_ROOT/independent-review.json" "$FINAL_ROOT/rebound-independent-review.json"
cp "$STAGE_ROOT/original-stage-artifact.json" "$FINAL_ROOT/"
cp "$STAGE_ROOT/original-review-artifact.json" "$FINAL_ROOT/"
cp "$STAGE_ROOT/original-finalization-artifact.json" "$FINAL_ROOT/"
sha256sum data/review/adapter-sdk/BASELINE.json > "$FINAL_ROOT/adapter-baseline.sha256"
(cd "$FINAL_ROOT" && find . -maxdepth 1 -type f ! -name manifest.sha256 -printf '%P\n' | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done > manifest.sha256 && sha256sum -c manifest.sha256)

echo "product_commit=$product_commit" >> "$GITHUB_OUTPUT"
echo "product_tree=$product_tree" >> "$GITHUB_OUTPUT"
echo "pages_run=$pages_run" >> "$GITHUB_OUTPUT"
echo "receipt_sha256=$receipt_sha256" >> "$GITHUB_OUTPUT"
echo "checker_sha256=$checker_sha256" >> "$GITHUB_OUTPUT"
echo "reviewed_cycle=$reviewed_cycle" >> "$GITHUB_OUTPUT"
echo "next_task=$next_task" >> "$GITHUB_OUTPUT"
}

publish_result() {
(cd "$FINAL_ROOT" && sha256sum -c manifest.sha256)
test "$(jq -r .status "$FINAL_ROOT/terminal.json")" = published
test "$(jq -r .product_commit "$FINAL_ROOT/terminal.json")" = "$PRODUCT_COMMIT"
test "$(jq -r .product_tree "$FINAL_ROOT/terminal.json")" = "$PRODUCT_TREE"
test "$(jq -r .pages_run "$FINAL_ROOT/terminal.json")" = "$PAGES_RUN"
test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$PRODUCT_COMMIT"

git config user.name undercast-anastasia-recovery-terminal
git config user.email anastasia-recovery-terminal@users.noreply.github.com
git switch --orphan terminal-result
git rm -rf . >/dev/null 2>&1 || true
mkdir -p transport/star-trek-anastasia-recovery-v2
cp -a "$FINAL_ROOT"/. transport/star-trek-anastasia-recovery-v2/
jq -n \
  --arg status complete \
  --arg product_commit "$PRODUCT_COMMIT" \
  --arg product_tree "$PRODUCT_TREE" \
  --argjson pages_run "$PAGES_RUN" \
  --argjson run_id "$GITHUB_RUN_ID" \
  --argjson artifact_id "$TERMINAL_ARTIFACT_ID" \
  --arg artifact_digest "$TERMINAL_ARTIFACT_DIGEST" \
  '{version:1,transaction:"PUBLISH-ANASTASIA-RECOVERY-RESULT-V2",status:$status,run_id:$run_id,artifact:{id:$artifact_id,digest:$artifact_digest},canonical:{commit:$product_commit,tree:$product_tree},pages_run:$pages_run}' \
  > transport/star-trek-anastasia-recovery-v2/result.json
git add transport/star-trek-anastasia-recovery-v2
git commit -m 'Publish Anastasia recovery terminal result'
git push --force origin "HEAD:refs/heads/${RESULT_BRANCH}"
}

case "${1:-}" in
  rebase) rebase ;;
  review) review ;;
  finalize) finalize ;;
  publish_result) publish_result ;;
  *) echo "usage: $0 rebase|review|finalize|publish_result" >&2; exit 2 ;;
esac
