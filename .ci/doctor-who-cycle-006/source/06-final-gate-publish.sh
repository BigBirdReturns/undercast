#!/usr/bin/env bash
set -euo pipefail
git add -A
git diff --cached --check
final_at="$(cat /tmp/doctor-who-cycle-005-final-at.txt)"
GIT_AUTHOR_DATE="$final_at" GIT_COMMITTER_DATE="$final_at" git commit \
  -m 'Doctor Who: complete reviewed cycle 005 for Kaarsh' \
  -m 'retain exact source, voice modality, character still, media, queue, workflow, artifact, waterline, and cycle-004 checker custody' \
  -m 'leave 311 queued obligations, zero work in flight, and no sixth lease'
final_head="$(git rev-parse HEAD)"
echo "$final_head" > /tmp/doctor-who-cycle-005-final-head.txt
git diff --name-only "$EXACT_MAIN"...HEAD | sort > /tmp/doctor-who-cycle-005-final-paths.txt
git diff --check "$EXACT_MAIN"...HEAD
! grep -Eq '^\.github/|^\.ci/|scripts/apply-doctor-who-cycle' /tmp/doctor-who-cycle-005-final-paths.txt
mapfile -t image_paths < <(grep '^images/' /tmp/doctor-who-cycle-005-final-paths.txt || true)
test "${#image_paths[@]}" -eq 1
test "${image_paths[0]}" = "$STILL_PATH"
for required in \
  "$STILL_PATH" \
  data/review/adapter-sdk/doctor-who-cycle-005-kaarsh.json \
  data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json \
  scripts/doctor-who-cycle-005.mjs \
  scripts/doctor-who-cycle-004-still-correction.mjs \
  data/WATERLINE-STATE.json \
  data/journal/waterline.jsonl \
  data/media-manifest.json \
  data/media-live.json \
  package.json \
  data/ESTATE-REGISTRY.json \
  docs/AUTOPILOT.md; do
  grep -Fxq "$required" /tmp/doctor-who-cycle-005-final-paths.txt || {
    echo "required final path missing: $required" >&2
    exit 1
  }
done

npm run gate 2>&1 | tee /tmp/doctor-who-cycle-005-final-gate.log
final_gate_sha256="$(sha256sum /tmp/doctor-who-cycle-005-final-gate.log | awk '{print $1}')"
echo "$final_gate_sha256" > /tmp/doctor-who-cycle-005-final-gate.sha256
rm -rf records test-results playwright-report .ci/projection-drift data/_curate
git restore --worktree -- .
test -z "$(git status --porcelain)"
npm run doctor-who:cycle-005:check

git fetch --no-tags --depth=128 origin \
  "refs/heads/main:refs/remotes/origin/main" \
  "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse refs/remotes/origin/main)" = "$EXACT_MAIN"
test "$(git rev-parse refs/remotes/origin/${TARGET_BRANCH})" = "$AUTHORIZED_HEAD"
test "$(git merge-base HEAD refs/remotes/origin/main)" = "$EXACT_MAIN"
git push origin "HEAD:refs/heads/${TARGET_BRANCH}" \
  --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}"
echo "final_head=$final_head" >> "$GITHUB_STEP_SUMMARY"
echo "final_gate_sha256=$final_gate_sha256" >> "$GITHUB_STEP_SUMMARY"
echo "final_paths=$(wc -l < /tmp/doctor-who-cycle-005-final-paths.txt)" >> "$GITHUB_STEP_SUMMARY"
echo "sixth_lease_issued=false" >> "$GITHUB_STEP_SUMMARY"
