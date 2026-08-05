#!/usr/bin/env bash
set -euo pipefail
candidate_at="$(cat /tmp/doctor-who-cycle-005-candidate-at.txt)"
GIT_AUTHOR_DATE="$candidate_at" GIT_COMMITTER_DATE="$candidate_at" git commit \
  -m 'Doctor Who: resolve bounded cycle 005 Kaarsh candidate' \
  -m 'claim one source-preserved voice role and review the exact source-named Kaarsh still' \
  -m 'keep the portrait honestly absent, repair cycle-004 checker composability, and reserve the reviewed cycle receipt'
candidate_commit="$(git rev-parse HEAD)"
workflow_job_id="$(gh api \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?filter=latest&per_page=100" \
  --jq '.jobs[] | select(.name == "cycle-005") | .id' | head -n 1)"
test "$workflow_job_id" -gt 0
echo "$candidate_commit" > /tmp/doctor-who-cycle-005-candidate-commit.txt
echo "$workflow_job_id" > /tmp/doctor-who-cycle-005-workflow-job.txt
echo "candidate_commit=$candidate_commit" >> "$GITHUB_OUTPUT"
echo "candidate_gate_sha256=$CANDIDATE_GATE_SHA256" >> "$GITHUB_OUTPUT"
echo "workflow_job_id=$workflow_job_id" >> "$GITHUB_OUTPUT"
echo "candidate_commit=$candidate_commit" >> "$GITHUB_STEP_SUMMARY"
echo "candidate_gate_sha256=$CANDIDATE_GATE_SHA256" >> "$GITHUB_STEP_SUMMARY"
echo "workflow_job_id=$workflow_job_id" >> "$GITHUB_STEP_SUMMARY"
