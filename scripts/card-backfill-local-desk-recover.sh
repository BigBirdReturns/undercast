#!/usr/bin/env bash
set -euo pipefail

SOURCE_RUN_ID=30593861671
SOURCE_HEAD=16bc625ff47b0f508a4a6958fff0db255f2ca72a
WAVE_SHA=c0caa3c183b89007d8cdf5f661d25678d3f40621468202e246a7ebe56b07417c
HEAD_BRANCH=${GITHUB_REF_NAME:-agent/card-backfill-next-041}
INITIAL_HEAD=$(git rev-parse HEAD)
MUTATION_HEAD=$INITIAL_HEAD
SUCCESS=0

publish_status() {
  local sha=$1 state=$2 description=$3
  gh api -X POST \
    "repos/${GITHUB_REPOSITORY}/statuses/${sha}" \
    -f state="$state" \
    -f context='card-backfill/local-desk-recovery' \
    -f description="${description:0:140}" \
    -f target_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}" >/dev/null
}

on_exit() {
  local code=$?
  if [ "$SUCCESS" -ne 1 ]; then
    publish_status "$INITIAL_HEAD" failure "run ${GITHUB_RUN_ID}: local retained-wave recovery failed; rediscovery=0"
  fi
  exit "$code"
}
trap on_exit EXIT

publish_status "$INITIAL_HEAD" pending "run ${GITHUB_RUN_ID}: installing local desk and recovering retained 140"

if [ -f ".github/card-backfill/waves/${WAVE_SHA}.json" ]; then
  gh workflow run card-backfill-supervisor.yml \
    --repo "$GITHUB_REPOSITORY" \
    --ref "$HEAD_BRANCH" \
    -f reason=retained-wave-already-reduced
  publish_status "$INITIAL_HEAD" success "retained wave already reduced; duplicate refused; supervisor dispatched"
  SUCCESS=1
  echo 'PASS — retained wave already reduced; duplicate recovery refused'
  exit 0
fi

node --check scripts/card-backfill-install-local-desk.mjs
node --check scripts/card-backfill-retained-wave-decisions.mjs
node --check scripts/card-backfill-local-adjudicate.mjs
python3 -m py_compile scripts/card-backfill-image-features.py
node scripts/card-backfill-install-local-desk.mjs
git diff --check
grep -q 'card-backfill-local-adjudicate.mjs' .github/workflows/card-backfill-amortized-wave.yml
! grep -q 'card-backfill-machine-adjudicate.mjs' .github/workflows/card-backfill-amortized-wave.yml
! grep -q 'models: read' .github/workflows/card-backfill-amortized-wave.yml
! grep -q 'copilot-requests:' .github/workflows/card-backfill-amortized-activation.yml

echo 'PASS — regular production, source policy, gate, and activation lifecycle are provider-independent'

node scripts/card-backfill-local-adjudicate-fixtures.mjs
node scripts/card-backfill-source-policy-v3-fixtures.mjs
node scripts/card-backfill-amortization-fixtures.mjs
node scripts/card-backfill-amortization-collect-fixtures.mjs
node scripts/card-backfill-lessons-fixtures.mjs
node scripts/card-backfill-attempt-index-fixtures.mjs
node scripts/card-backfill-wave-fixtures.mjs
node scripts/card-backfill-lessons.mjs validate --out "$RUNNER_TEMP/lessons-local-desk-validation.json"

echo 'PASS — local desk, source precision, amortization, and inherited rigor fail closed'

metadata="$RUNNER_TEMP/source-run.json"
gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${SOURCE_RUN_ID}" > "$metadata"
observed_source_head=$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.head_sha||''))" "$metadata")
observed_source_branch=$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.head_branch||''))" "$metadata")
[ "$observed_source_head" = "$SOURCE_HEAD" ]
[ "$observed_source_branch" = "$HEAD_BRANCH" ]

planning="$RUNNER_TEMP/source-planning"
results="$RUNNER_TEMP/recovered-results"
mkdir -p "$planning" "$results"
gh run download "$SOURCE_RUN_ID" \
  --repo "$GITHUB_REPOSITORY" \
  --name "card-backfill-amortized-plan-${SOURCE_RUN_ID}" \
  --dir "$planning"
test -f "$planning/wave.json"
test -f "$planning/amortization-plan.json"
test -f "$planning/assemble-matrix.json"
[ "$(node -e "const x=require(process.argv[1]);process.stdout.write(String(x.wave_sha256))" "$planning/wave.json")" = "$WAVE_SHA" ]

echo 'PASS — retained source run, source head, branch, wave, and plan are digest-bound'

node -e "const x=require(process.argv[1]);for(const row of x.include)console.log([row.batch_sha256,row.batch_index,row.batch_path].join('\t'))" "$planning/assemble-matrix.json" \
| while IFS=$'\t' read -r batch_sha batch_index batch_path; do
    original="$RUNNER_TEMP/original-$batch_sha"
    shards="$RUNNER_TEMP/shards-$batch_sha"
    final="$results/$batch_sha"
    rm -rf "$original" "$shards" "$final"
    mkdir -p "$original" "$shards" "$final"
    gh run download "$SOURCE_RUN_ID" \
      --repo "$GITHUB_REPOSITORY" \
      --name "card-backfill-amortized-result-${batch_sha}-${SOURCE_RUN_ID}" \
      --dir "$original"
    gh run download "$SOURCE_RUN_ID" \
      --repo "$GITHUB_REPOSITORY" \
      --pattern "card-backfill-amortized-shard-${batch_sha}-*-${SOURCE_RUN_ID}" \
      --dir "$shards"
    test -f "$original/packets/batch-result.json"
    test -d "$original/packets/packets"
    telemetry=$(find "$shards" -name source-telemetry.json -type f | wc -l)
    [ "$telemetry" -gt 0 ]
    cp -a "$original/packets" "$final/packets"
    node scripts/card-backfill-amortization-collect.mjs \
      --shards-root "$shards" \
      --out "$final/amortization" \
      --batch-sha "$batch_sha" | tee "$final/amortization-recovery.log"
    node scripts/card-backfill-retained-wave-decisions.mjs \
      --candidates "$final/packets" \
      --out "$final/machine-decisions.json" \
      --source-head "$SOURCE_HEAD" \
      --source-run-id "$SOURCE_RUN_ID" | tee "$final/retained-decisions.log"
    node scripts/card-backfill-cohort-adjudicate.mjs \
      --candidates "$final/packets" \
      --decisions "$final/machine-decisions.json" \
      --control .github/CARD-BACKFILL-COHORT.json \
      --out "$final/adjudicated" \
      --source-run-id "$SOURCE_RUN_ID" | tee "$final/adjudicate-recovery.log"
    cp "$planning/$batch_path" "$final/batch.json"
    node scripts/card-backfill-build-recovered-result.mjs \
      --final "$final" \
      --batch "$planning/$batch_path" \
      --wave "$planning/wave.json" \
      --source-head "$SOURCE_HEAD" \
      --source-run-id "$SOURCE_RUN_ID" \
      --batch-index "$batch_index" \
      --recovery-run-id "$GITHUB_RUN_ID" \
      --recovery-code-head "$INITIAL_HEAD"
    echo "PASS — recovered ${batch_sha}; telemetry=${telemetry}; source_transport_calls=0"
  done

count=$(find "$results" -name wave-result.json -type f | wc -l)
[ "$count" -eq 4 ]
accepted=$(find "$results" -path '*/adjudicated/accepted/*/review.json' -type f | wc -l)
[ "$accepted" -eq 2 ]
echo 'PASS — four retained batches recovered: selected=140 accepted=2 rediscovery=0 cloud_inference=0'

observed_head=$(git rev-parse HEAD)
[ "$observed_head" = "$MUTATION_HEAD" ]
node scripts/card-backfill-wave-reduce-amortized.mjs \
  --wave "$planning/wave.json" \
  --amortization-plan "$planning/amortization-plan.json" \
  --results-root "$results" \
  --staging-root data/review/card-backfill-staging \
  --permanent-root data/review/card-backfill \
  --adjudications-root .github/card-backfill/adjudications \
  --wave-receipt-root .github/card-backfill/waves \
  --performance-root .github/card-backfill/performance \
  --source-head "$SOURCE_HEAD" \
  --mutation-head "$MUTATION_HEAD" \
  --observed-head "$observed_head" | tee "$RUNNER_TEMP/local-desk-recovery-reduce.log"
node scripts/card-backfill-staging.mjs validate \
  --root data/review/card-backfill-staging \
  --permanent-root data/review/card-backfill
test -f ".github/card-backfill/waves/${WAVE_SHA}.json"
staged=$(node -e "const x=require('./data/review/card-backfill-staging/STAGING.json');process.stdout.write(String(x.counts.staged))")
[ "$staged" -ge 2 ]
echo "PASS — retained reduction complete; staged=${staged}; publication floor reached"

git add -A -- \
  .github/actions/card-backfill-runtime/action.yml \
  .github/workflows/card-backfill-amortized-activation.yml \
  .github/workflows/card-backfill-amortized-wave.yml \
  .github/card-backfill/adjudications \
  .github/card-backfill/waves \
  .github/card-backfill/performance \
  data/review/card-backfill-staging \
  package.json \
  scripts/gate.mjs \
  scripts/card-backfill-local-adjudicate-fixtures.mjs \
  scripts/card-backfill-source-policy-v3-fixtures.mjs \
  scripts/lib/card-backfill-source-policy-v3.mjs
git diff --cached --check
git config user.name 'undercast-card-backfill-local-recovery'
git config user.email 'undercast-card-backfill-local-recovery@users.noreply.github.com'
git commit -m 'Card backfill: recover retained wave and install local second desk'
remote_head=$(git ls-remote origin "refs/heads/${HEAD_BRANCH}" | awk '{print $1}')
if [ "$remote_head" != "$MUTATION_HEAD" ]; then
  echo "branch moved from recovery mutation head $MUTATION_HEAD to $remote_head; refusing stale push"
  exit 1
fi
git push origin "HEAD:${HEAD_BRANCH}"
final_head=$(git rev-parse HEAD)

gh workflow run card-backfill-supervisor.yml \
  --repo "$GITHUB_REPOSITORY" \
  --ref "$HEAD_BRANCH" \
  -f reason=local-retained-wave-recovery-complete
publish_status "$INITIAL_HEAD" success "retained 140 reduced; accepted=2; local desk installed; supervisor dispatched"
publish_status "$final_head" success "retained 140 reduced; accepted=2; local desk installed; supervisor dispatched"
SUCCESS=1
echo "PASS — pushed ${final_head}; supervisor owns the next transition; manual_continue_required=false"
