#!/usr/bin/env bash
set -euo pipefail
rm -rf records test-results playwright-report .ci/projection-drift data/_curate
shopt -s nullglob
parts=( "$TRANSPORT" "$TRANSPORT".part-* )
test "${#parts[@]}" -eq "$TRANSPORT_PARTS"
git rm -f "$SELF" "${parts[@]}"
git add -A
git diff --cached --check
test -z "$(git diff --name-only)"

git diff --cached --name-only "$EXACT_MAIN" | sort > /tmp/doctor-who-cycle-005-candidate-paths.txt
! grep -Eq '^\.github/|^\.ci/' /tmp/doctor-who-cycle-005-candidate-paths.txt
mapfile -t image_paths < <(grep '^images/' /tmp/doctor-who-cycle-005-candidate-paths.txt || true)
test "${#image_paths[@]}" -eq 1
test "${image_paths[0]}" = "$STILL_PATH"
for required in \
  "$STILL_PATH" \
  data/AUTOPILOT.json \
  data/CENSUS-COVERAGE.json \
  data/MEDIA-AUDIT.json \
  data/SOURCES.json \
  data/media-live.json \
  data/media-manifest.json \
  data/specimens.json \
  data/journal/autopilot.jsonl \
  data/journal/media-audit.jsonl \
  scripts/doctor-who-cycle-004-still-correction.mjs; do
  grep -Fxq "$required" /tmp/doctor-who-cycle-005-candidate-paths.txt || {
    echo "required candidate path missing: $required" >&2
    exit 1
  }
done

CYCLE004_STILL_COMPOSABILITY_CANDIDATE=1 npm run gate 2>&1 | tee /tmp/doctor-who-cycle-005-candidate-gate.log
candidate_gate_sha256="$(sha256sum /tmp/doctor-who-cycle-005-candidate-gate.log | awk '{print $1}')"
echo "$candidate_gate_sha256" > /tmp/doctor-who-cycle-005-candidate-gate.sha256
echo "CANDIDATE_GATE_SHA256=$candidate_gate_sha256" >> "$GITHUB_ENV"
rm -rf records test-results playwright-report .ci/projection-drift data/_curate
git restore --worktree -- .
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
