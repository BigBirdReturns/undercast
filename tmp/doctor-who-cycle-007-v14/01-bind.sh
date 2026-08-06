#!/usr/bin/env bash
set -euo pipefail

: "${CURRENT_MAIN:?}" "${REVIEWED_MAIN:?}" "${ATTESTED_MAIN:?}" "${ORIGINAL_CARRIER_HEAD:?}"
: "${REVIEWED_CANDIDATE_COMMIT:?}" "${REVIEWED_CANDIDATE_TREE:?}" "${REVIEWED_CANDIDATE_GATE_SHA256:?}"
: "${REVIEWED_LEASE_ID:?}" "${REVIEWED_CLAIM_EVENT_ID:?}" "${HEAD_SHA:?}" "${HEAD_BRANCH:?}"
: "${SELF:?}" "${DRIVER:?}" "${ROOT:?}" "${DIAGNOSTICS_ROOT:?}" "${REVIEW_ROOT:?}"
: "${REPLAY:?}" "${INTEGRATION:?}" "${OUT:?}" "${CYCLE_ASSET_DIR:?}" "${CYCLE_CONTEXT:?}"
: "${SELECTION_DIR:?}" "${PREFLIGHT_DIR:?}" "${MEDIA_DIR:?}" "${CYCLE_AT:?}"

rm -rf "$ROOT/replay" "$ROOT/integration" "$OUT"
mkdir -p "$ROOT" "$OUT"

# Bind the exact six-file, read-only carrier and the live PR base.
test "$(git rev-parse HEAD)" = "$HEAD_SHA"
test "$(git show -s --format=%P HEAD)" = "$CURRENT_MAIN"
test "$(git rev-list --count "$CURRENT_MAIN"..HEAD)" = "1"
test "$(git merge-base "$CURRENT_MAIN" HEAD)" = "$CURRENT_MAIN"
printf '%s\n' \
  "$SELF" \
  "$DRIVER" \
  tmp/doctor-who-cycle-007-v14/01-bind.sh \
  tmp/doctor-who-cycle-007-v14/02-replay.sh \
  tmp/doctor-who-cycle-007-v14/03-integrate.sh \
  tmp/doctor-who-cycle-007-v14/04-handoff.sh \
  | LC_ALL=C sort > "$OUT/expected-carrier-paths.txt"
git diff --name-only "$CURRENT_MAIN"...HEAD | LC_ALL=C sort > "$OUT/actual-carrier-paths.txt"
diff -u "$OUT/expected-carrier-paths.txt" "$OUT/actual-carrier-paths.txt"
git fetch --no-tags origin \
  "+refs/heads/main:refs/remotes/origin/main" \
  "+refs/heads/${HEAD_BRANCH}:refs/remotes/origin/${HEAD_BRANCH}"
test "$(git rev-parse refs/remotes/origin/main)" = "$CURRENT_MAIN"
test "$(git rev-parse refs/remotes/origin/${HEAD_BRANCH})" = "$HEAD_SHA"
test "$(git merge-base "$REVIEWED_MAIN" "$CURRENT_MAIN")" = "$REVIEWED_MAIN"
git diff --name-only "$REVIEWED_MAIN"..."$CURRENT_MAIN" | LC_ALL=C sort > "$OUT/current-main-drift-paths.txt"
test -z "$(git status --porcelain)"

# Bind immutable candidate, diagnostics, and independent review metadata.
gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${CANDIDATE_RUN}" > "$OUT/candidate-run.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${CANDIDATE_RUN}/jobs?per_page=100" > "$OUT/candidate-jobs.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${CANDIDATE_ARTIFACT_ID}" > "$OUT/candidate-artifact.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${DIAGNOSTICS_ARTIFACT_ID}" > "$OUT/diagnostics-artifact.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${REVIEW_RUN}" > "$OUT/review-run.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${REVIEW_RUN}/jobs?per_page=100" > "$OUT/review-jobs.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts/${REVIEW_ARTIFACT_ID}" > "$OUT/review-artifact.json"

jq -e --argjson run "$CANDIDATE_RUN" --arg head "$ORIGINAL_CARRIER_HEAD" \
  '.id == $run and .head_sha == $head and .status == "completed" and .conclusion == "success"' \
  "$OUT/candidate-run.json" >/dev/null
jq -e --argjson job "$CANDIDATE_JOB" \
  'any(.jobs[]; .id == $job and .name == "materialize" and .status == "completed" and .conclusion == "success")' \
  "$OUT/candidate-jobs.json" >/dev/null
jq -e --argjson id "$CANDIDATE_ARTIFACT_ID" --arg name "$CANDIDATE_ARTIFACT_NAME" \
  --arg digest "sha256:${CANDIDATE_ARTIFACT_SHA256}" --argjson run "$CANDIDATE_RUN" --arg head "$ORIGINAL_CARRIER_HEAD" \
  '.id == $id and .name == $name and .digest == $digest and .expired == false and .workflow_run.id == $run and .workflow_run.head_sha == $head' \
  "$OUT/candidate-artifact.json" >/dev/null
jq -e --argjson id "$DIAGNOSTICS_ARTIFACT_ID" --arg name "$DIAGNOSTICS_ARTIFACT_NAME" \
  --arg digest "sha256:${DIAGNOSTICS_ARTIFACT_SHA256}" --argjson run "$CANDIDATE_RUN" --arg head "$ORIGINAL_CARRIER_HEAD" \
  '.id == $id and .name == $name and .digest == $digest and .expired == false and .workflow_run.id == $run and .workflow_run.head_sha == $head' \
  "$OUT/diagnostics-artifact.json" >/dev/null
jq -e --argjson run "$REVIEW_RUN" \
  '.id == $run and .status == "completed" and .conclusion == "success"' "$OUT/review-run.json" >/dev/null
jq -e --argjson job "$REVIEW_JOB" \
  'any(.jobs[]; .id == $job and .name == "review" and .status == "completed" and .conclusion == "success")' \
  "$OUT/review-jobs.json" >/dev/null
jq -e --argjson id "$REVIEW_ARTIFACT_ID" --arg name "$REVIEW_ARTIFACT_NAME" \
  --arg digest "sha256:${REVIEW_ARTIFACT_SHA256}" --argjson run "$REVIEW_RUN" \
  '.id == $id and .name == $name and .digest == $digest and .expired == false and .workflow_run.id == $run' \
  "$OUT/review-artifact.json" >/dev/null

review="$REVIEW_ROOT/doctor-who-cycle-007-v8-independent-review.json"
test -f "$review"
test "$(jq -r '.receipt_sha256' "$review")" = "$REVIEW_RECEIPT_SHA256"
jq -e --arg main "$REVIEWED_MAIN" --arg commit "$REVIEWED_CANDIDATE_COMMIT" \
  --arg tree "$REVIEWED_CANDIDATE_TREE" --arg gate "$REVIEWED_CANDIDATE_GATE_SHA256" '
    .transaction == "DOCTOR-WHO-CYCLE-007-KRAGAR-INDEPENDENT-CANDIDATE-REVIEW-V1" and
    .verdict == "approved-for-separate-finalization" and .base_main == $main and
    .candidate.commit == $commit and .candidate.tree == $tree and
    .candidate.gate_sha256 == $gate and .candidate.paths == 41 and
    .target.wall_id == "UC-1352" and .target.task_id == "ap_ffea809b980b468b33fa462c" and
    .target.still_sha256 == "f6f32eb1c51445838ba27ae449548d9bb581b04bb2b321a5789f7f285872d409" and
    .boundary.canonical_lease_issued == false and .boundary.live_queue_mutated == false and
    .boundary.merge_authorized == false and .boundary.product_published == false
  ' "$review" >/dev/null

test "$(cat "$DIAGNOSTICS_ROOT/candidate-commit.txt")" = "$REVIEWED_CANDIDATE_COMMIT"
test "$(cat "$DIAGNOSTICS_ROOT/candidate-tree.txt")" = "$REVIEWED_CANDIDATE_TREE"
test "$(cat "$DIAGNOSTICS_ROOT/candidate-gate.sha256")" = "$REVIEWED_CANDIDATE_GATE_SHA256"
test "$(jq -r '.lease.id' "$DIAGNOSTICS_ROOT/context.json")" = "$REVIEWED_LEASE_ID"
test "$(jq -r '.lease.claim_event.id' "$DIAGNOSTICS_ROOT/context.json")" = "$REVIEWED_CLAIM_EVENT_ID"

# Verify the extracted V8 payload and corrected executable members.
test -f "$CYCLE_ASSET_DIR/transport-manifest.json"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const root = process.env.CYCLE_ASSET_DIR;
const manifest = JSON.parse(fs.readFileSync(`${root}/transport-manifest.json`, 'utf8'));
if (manifest.version !== 8 || manifest.transaction !== 'DOCTOR-WHO-CYCLE-007-KRAGAR-MATERIALIZER-V8') throw new Error('payload manifest identity drifted');
if (manifest.exact_main !== process.env.REVIEWED_MAIN || manifest.attested_main !== process.env.ATTESTED_MAIN) throw new Error('payload main custody drifted');
const corrected = {
  '02-materialize.sh': {bytes: 1927, sha256: '4c2c40f1cad46a2d0787f02d6395ae77f9cffcfe5316ae27009ac6f58e104fe6'},
  '03-candidate.sh': {bytes: 2619, sha256: 'f454636883f6e1f3fcadf5308866614acb92c83abf83ef5df2ad63775c931910'},
};
for (const row of manifest.files) {
  const bytes = fs.readFileSync(`${root}/${row.path}`);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const expected = corrected[row.path] ?? row;
  if (bytes.length !== expected.bytes || digest !== expected.sha256 || row.mode !== '100755') throw new Error(`payload member drifted: ${row.path}`);
}
NODE
chmod +x "$CYCLE_ASSET_DIR"/*.sh "$CYCLE_ASSET_DIR"/*.mjs
for script in "$CYCLE_ASSET_DIR"/*.sh; do bash -n "$script"; done
for script in "$CYCLE_ASSET_DIR"/*.mjs; do node --check "$script"; done

sudo apt-get update >/dev/null
sudo apt-get install -y imagemagick >/dev/null
identify -version | head -1 | tee "$OUT/imagemagick-version.txt"
