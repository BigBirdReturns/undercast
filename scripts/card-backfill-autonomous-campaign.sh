#!/usr/bin/env bash
set -euo pipefail

CONTROL="${CONTROL:-.github/CARD-BACKFILL-COHORT.json}"
BRANCH="${CARD_BACKFILL_BRANCH:-${GITHUB_REF_NAME:-$(git branch --show-current)}}"
RUN_ID="${GITHUB_RUN_ID:-local-$(date +%s)}"
LIMIT="${CARD_BACKFILL_COHORT_LIMIT:-40}"
MAX_CYCLES="${CARD_BACKFILL_MAX_CYCLES:-12}"
TIME_BUDGET_MINUTES="${CARD_BACKFILL_TIME_BUDGET_MINUTES:-330}"
PUBLISH_TARGET="${CARD_BACKFILL_PUBLISH_TARGET:-40}"
MACHINE_MODEL="${CARD_BACKFILL_MODEL:-openai/gpt-4.1-mini}"
MACHINE_FALLBACK_MODEL="${CARD_BACKFILL_FALLBACK_MODEL:-openai/gpt-4o-mini}"
ROOT="${RUNNER_TEMP:-/tmp}/card-backfill-autonomous-${RUN_ID}"
START_EPOCH=$(date +%s)
DEADLINE_EPOCH=$((START_EPOCH + TIME_BUDGET_MINUTES * 60))
mkdir -p "$ROOT" .github/card-backfill/adjudications .github/card-backfill/autonomous-runs

cycles=0
selected_total=0
pending_total=0
accepted_total=0
rejected_total=0
published_total=0
stop_reason="max-cycles"
last_cohort=""
last_batch=""
last_planner=""

log() { printf '[card-backfill-autonomous] %s\n' "$*"; }
json_number() { node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));let v=x;for(const p of process.argv[2].split('.'))v=v?.[p];process.stdout.write(String(v??0))" "$1" "$2"; }
json_string() { node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));let v=x;for(const p of process.argv[2].split('.'))v=v?.[p];process.stdout.write(v==null?'':String(v))" "$1" "$2"; }

configure_git() {
  git config user.name 'undercast-card-backfill-autonomous'
  git config user.email 'undercast-card-backfill-autonomous@users.noreply.github.com'
}

push_paths() {
  local message="$1"; shift
  git add -A -- "$@"
  git diff --cached --check
  if git diff --cached --quiet; then
    log "no repository mutation for: $message"
    return 0
  fi
  git commit -m "$message"
  git push origin "HEAD:$BRANCH"
}

staged_count() {
  node - <<'NODE'
const fs=require('fs');
const path='data/review/card-backfill-staging/STAGING.json';
if(!fs.existsSync(path)){process.stdout.write('0');process.exit(0)}
const x=JSON.parse(fs.readFileSync(path,'utf8'));
process.stdout.write(String(x.counts?.staged||0));
NODE
}

publish_staging() {
  local mode="$1"
  local staged
  staged=$(staged_count)
  if (( staged < 2 )); then return 0; fi
  if [[ "$mode" != "final" ]] && (( staged < PUBLISH_TARGET )); then return 0; fi
  local amount=$staged
  if (( amount > PUBLISH_TARGET )); then amount=$PUBLISH_TARGET; fi
  if (( amount > 50 )); then amount=50; fi
  local publication="$ROOT/publication-$(date +%s)"
  mkdir -p "$publication"
  log "publishing $amount staged packet(s) in one permanent batch"
  node scripts/card-backfill-staging.mjs validate \
    --root data/review/card-backfill-staging \
    --permanent-root data/review/card-backfill | tee "$publication/validate.log"
  node scripts/card-backfill-staging.mjs plan \
    --root data/review/card-backfill-staging \
    --permanent-root data/review/card-backfill \
    --control "$CONTROL" \
    --out "$publication" \
    --limit "$amount" \
    --require-ready | tee "$publication/plan.log"
  node scripts/card-backfill-cohort-materialize.mjs \
    --plan "$publication/publication-plan.json" \
    --staging data/review/card-backfill-staging \
    --destination data/review/card-backfill | tee "$publication/materialize.log"
  git add -A -- data/review/card-backfill data/review/card-backfill-staging
  git diff --cached --check
  npm run gate 2>&1 | tee "$publication/gate.log"
  git add -A -- data/review/card-backfill data/review/card-backfill-staging
  git diff --cached --check
  git commit -m "Card backfill: autonomously publish ${amount} evidence packets"
  git push origin "HEAD:$BRANCH"
  published_total=$((published_total + amount))
}

prepare_shard_table() {
  local shards_json="$1" out="$2"
  node --input-type=module - "$shards_json" > "$out" <<'NODE'
import fs from 'node:fs';
const value=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const row of value.matrix?.include||[])console.log([row.id,row.count,row.plan_path].join('\t'));
NODE
}

run_portrait_shard() {
  local cycle_root="$1" planning="$2" id="$3" count="$4" plan_path="$5"
  local shard_root="$cycle_root/shards/shard-$id" output="$shard_root/output" plan="$planning/$plan_path"
  mkdir -p "$output"
  node scripts/card-backfill-wikimedia-portraits.mjs \
    --plan "$plan" \
    --out "$output/candidates" \
    --journal "$output/media-search.jsonl" \
    --latest "$output/latest.json" \
    --run-id "${RUN_ID}-cycle-${cycles}-shard-${id}" \
    --contact 'bigbirdreturns@proton.me' \
    --delay-ms 500 | tee "$output/retrieve.log"
  printf '%s\n' '{"version":1,"restore":[],"adapter":"exact-canonical-wikimedia-portrait"}' > "$output/retrieval-restore.json"
  cp "$plan" "$output/retrieval-plan.json"
}

run_worktree_shard() {
  local cycle_root="$1" planning="$2" id="$3" count="$4" plan_path="$5" work="$6"
  local shard_root="$cycle_root/shards/shard-$id" output="$shard_root/output" plan="$planning/$plan_path"
  mkdir -p "$output"
  cp "$plan" "$work/retrieval-plan.json"
  (
    cd "$work"
    node scripts/media-search-prepare.mjs \
      --plan retrieval-plan.json \
      --ids-out retrieval-ids.txt \
      --mask-unselected \
      --restore-out retrieval-restore.json | tee "$output/prepare.log"
    local ids
    ids=$(cat retrieval-ids.txt)
    if [[ -n "$ids" ]]; then
      RETRIEVE_ONLY="$ids" \
      RETRIEVE_MAX="$count" \
      IMAGE_MODE=loose \
      CRAWL_DELAY_MS=500 \
      CONTACT='bigbirdreturns@proton.me' \
      node scripts/retrieve.mjs | tee "$output/retrieve.log"
    fi
    node scripts/media-search-restore.mjs --receipt retrieval-restore.json | tee "$output/restore.log"
  )
  node scripts/media-search-report.mjs \
    --baseline "$GITHUB_WORKSPACE" \
    --candidate "$work" \
    --plan "$plan" \
    --out "$output/candidates" \
    --journal "$output/media-search.jsonl" \
    --latest "$output/latest.json" \
    --run-id "${RUN_ID}-cycle-${cycles}-shard-${id}" | tee "$output/report.log"
  cp "$work/retrieval-restore.json" "$output/retrieval-restore.json"
  cp "$plan" "$output/retrieval-plan.json"
}

run_cycle() {
  cycles=$((cycles + 1))
  local cycle_root="$ROOT/cycle-$(printf '%02d' "$cycles")"
  local planning="$cycle_root/planning"
  local final="$cycle_root/final"
  mkdir -p "$planning" "$final"
  log "cycle $cycles: planning next $LIMIT-obligation shape-equivalent cohort"
  set +e
  node scripts/card-backfill-cohort.mjs plan \
    --control "$CONTROL" \
    --out "$planning" \
    --limit "$LIMIT" > "$planning/plan.log" 2>&1
  local plan_status=$?
  set -e
  cat "$planning/plan.log"
  last_planner="routine"
  if (( plan_status != 0 )) && grep -Eq 'no ready cohort available|unknown or unavailable cohort' "$planning/plan.log"; then
    log "cycle $cycles: routine-ready cohorts exhausted; entering bounded Wikipedia-only still frontier"
    rm -rf "$planning"
    mkdir -p "$planning"
    set +e
    node scripts/card-backfill-open-web-plan.mjs \
      --control "$CONTROL" \
      --out "$planning" \
      --limit "$LIMIT" > "$planning/plan.log" 2>&1
    plan_status=$?
    set -e
    cat "$planning/plan.log"
    last_planner="bounded-open-web"
  fi
  if (( plan_status != 0 )); then
    if grep -Eq 'no ready cohort available|unknown or unavailable cohort|no bounded open-web cohort available' "$planning/plan.log"; then
      stop_reason="coverage-pass-drained"
      return 2
    fi
    return "$plan_status"
  fi

  local selected cohort batch
  selected=$(json_number "$planning/batch.json" selected_count)
  cohort=$(json_string "$planning/batch.json" cohort_key)
  batch=$(json_string "$planning/batch.json" batch_sha256)
  last_cohort="$cohort"
  last_batch="$batch"
  if (( selected == 0 )); then stop_reason="no-selectable-obligations"; return 2; fi
  selected_total=$((selected_total + selected))
  log "cycle $cycles: selected $selected from $cohort"

  local shards_tsv="$cycle_root/shards.tsv"
  prepare_shard_table "$planning/shards.json" "$shards_tsv"
  local first_plan
  first_plan=$(awk -F '\t' 'NR==1{print $3}' "$shards_tsv")
  local side route
  side=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write([...new Set(p.candidates.map(r=>r.side))][0]||'')" "$planning/$first_plan")
  route=$(node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write([...new Set(p.candidates.map(r=>r.cohort_key.split('::')[2]))][0]||'')" "$planning/$first_plan")

  local -a worktrees=() pids=()
  local shard_status=0
  if [[ "$side" == "portrait" && "$route" == "performer-reference-crawl" ]]; then
    while IFS=$'\t' read -r id count plan_path; do
      run_portrait_shard "$cycle_root" "$planning" "$id" "$count" "$plan_path" &
      pids+=("$!")
    done < "$shards_tsv"
  else
    while IFS=$'\t' read -r id count plan_path; do
      local work="$cycle_root/worktree-$id"
      git worktree add --detach "$work" HEAD >/dev/null
      worktrees+=("$work")
      run_worktree_shard "$cycle_root" "$planning" "$id" "$count" "$plan_path" "$work" &
      pids+=("$!")
    done < "$shards_tsv"
  fi
  for pid in "${pids[@]}"; do
    if ! wait "$pid"; then shard_status=1; fi
  done
  for work in "${worktrees[@]}"; do git worktree remove --force "$work" >/dev/null 2>&1 || true; done
  if (( shard_status != 0 )); then return "$shard_status"; fi

  node scripts/card-backfill-cohort-merge.mjs \
    --batch "$planning/batch.json" \
    --shards-root "$cycle_root/shards" \
    --out "$final/candidates" \
    --run-id "${RUN_ID}-cycle-${cycles}" | tee "$final/merge.log"
  node scripts/card-backfill-cohort-packetize.mjs \
    --baseline "$GITHUB_WORKSPACE" \
    --candidates "$final/candidates" \
    --report "$final/candidates/report.json" \
    --batch "$planning/batch.json" \
    --scopes "$planning/batch-scopes" \
    --control "$CONTROL" \
    --out "$final/packets" \
    --magick magick | tee "$final/packetize.log"

  local decisions="$final/machine-decisions.json"
  node scripts/card-backfill-machine-adjudicate.mjs \
    --candidates "$final/packets" \
    --out "$decisions" \
    --model "$MACHINE_MODEL" \
    --fallback-model "$MACHINE_FALLBACK_MODEL" \
    --max-parallel 2 \
    --cycle "$cycles" \
    --artifact-name "card-backfill-autonomous-${RUN_ID}-cycle-${cycles}" \
    --head-sha "$(git rev-parse HEAD)" | tee "$final/machine-adjudicate.log"

  local adjudicated="$final/adjudicated"
  node scripts/card-backfill-cohort-adjudicate.mjs \
    --candidates "$final/packets" \
    --decisions "$decisions" \
    --control "$CONTROL" \
    --out "$adjudicated" \
    --source-run-id "$RUN_ID" | tee "$final/adjudicate.log"
  node scripts/card-backfill-staging.mjs stage \
    --input "$adjudicated" \
    --root data/review/card-backfill-staging \
    --permanent-root data/review/card-backfill | tee "$final/stage.log"
  node scripts/card-backfill-staging.mjs validate \
    --root data/review/card-backfill-staging \
    --permanent-root data/review/card-backfill | tee "$final/staging-validate.log"

  local decision_dest=".github/card-backfill/adjudications/${batch}.json"
  if [[ -f "$decision_dest" ]]; then
    cmp -s "$decisions" "$decision_dest" || { echo "decision collision $decision_dest" >&2; return 1; }
  else
    cp "$decisions" "$decision_dest"
  fi
  local receipt="$adjudicated/adjudication-run-receipt.json"
  local pending accepted rejected
  pending=$(json_number "$receipt" counts.pending)
  accepted=$(json_number "$receipt" counts.accepted)
  rejected=$(json_number "$receipt" counts.rejected)
  pending_total=$((pending_total + pending))
  accepted_total=$((accepted_total + accepted))
  rejected_total=$((rejected_total + rejected))

  push_paths "Card backfill: autonomous cycle ${cycles} adjudicated ${selected}" \
    .github/card-backfill/adjudications \
    data/review/card-backfill-staging
  publish_staging routine
  log "cycle $cycles complete: pending=$pending accepted=$accepted rejected=$rejected staged=$(staged_count)"
}

write_receipt() {
  local end_epoch elapsed completed total open staged receipt
  end_epoch=$(date +%s)
  elapsed=$((end_epoch - START_EPOCH))
  total=$(node -e "const c=require('./.github/CARD-BACKFILL-COHORT.json');process.stdout.write(String(c.freeze.selector_defined_estate))")
  completed=$(node - <<'NODE'
const fs=require('fs'),path=require('path');
const root='data/review/card-backfill';
let count=0;
for(const entry of fs.readdirSync(root,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name==='batches')continue;
  const dir=path.join(root,entry.name);
  if(fs.existsSync(path.join(dir,'manifest.json'))||fs.existsSync(path.join(dir,'review.json')))count++;
}
process.stdout.write(String(count));
NODE
)
  open=$((total - completed))
  staged=$(staged_count)
  receipt=".github/card-backfill/autonomous-runs/${RUN_ID}.json"
  RUN_ID_VALUE="$RUN_ID" STOP_REASON_VALUE="$stop_reason" BRANCH_VALUE="$BRANCH" LAST_COHORT_VALUE="$last_cohort" LAST_BATCH_VALUE="$last_batch" LAST_PLANNER_VALUE="$last_planner" \
  CYCLES_VALUE="$cycles" SELECTED_VALUE="$selected_total" PENDING_VALUE="$pending_total" ACCEPTED_VALUE="$accepted_total" REJECTED_VALUE="$rejected_total" PUBLISHED_VALUE="$published_total" \
  COMPLETED_VALUE="$completed" OPEN_VALUE="$open" TOTAL_VALUE="$total" STAGED_VALUE="$staged" ELAPSED_VALUE="$elapsed" RECEIPT_PATH="$receipt" \
  node --input-type=module - <<'NODE'
import fs from 'node:fs';
const n=(name)=>Number(process.env[name]);
const value={
  version:1,
  lane:'card-backfill-autonomous-campaign',
  workflow_run_id:process.env.RUN_ID_VALUE,
  branch:process.env.BRANCH_VALUE,
  stopped_at:new Date().toISOString(),
  stop_reason:process.env.STOP_REASON_VALUE,
  counts:{
    cycles:n('CYCLES_VALUE'),
    obligations_selected:n('SELECTED_VALUE'),
    candidates_adjudicated:n('PENDING_VALUE'),
    accepted_for_staging:n('ACEPTED_VALUE'),
    rejected_or_quarantined:n('REJECTED_VALUE'),
    permanent_packets_published:n('PUBLISHED_VALUE'),
    completed_evidence_packets:n('COMPLETED_VALUE'),
    open_source_declared_absences:n('OPEN_VALUE'),
    selector_defined_estate:n('TOTAL_VALUE'),
    staged_awaiting_publication:n('STAGED_VALUE'),
    elapsed_seconds:n('ELAPSED_VALUE'),
  },
  last_planner:process.env.LAST_PLANNER_VALUE||null,
  last_cohort:process.env.LAST_COHORT_VALUE||null,
  last_batch_sha256:process.env.LAST_BATCH_VALUE||null,
  manual_continue_required:false,
  fail_closed:true,
  canonical_mutation:false,
};
fs.writeFileSync(process.env.RECEIPT_PATH,JSON.stringify(value,null,2)+'\n');
NODE
  push_paths "Card backfill: record autonomous campaign ${RUN_ID}" .github/card-backfill/autonomous-runs
  log "receipt=$receipt completed=$completed open=$open staged=$staged stop=$stop_reason"
}

configure_git
log "starting autonomous campaign on $BRANCH: max_cycles=$MAX_CYCLES limit=$LIMIT budget=${TIME_BUDGET_MINUTES}m"
node --check scripts/card-backfill-machine-adjudicate.mjs
node scripts/card-backfill-machine-adjudicate-fixtures.mjs
node scripts/card-backfill-bounded-open-web-fixtures.mjs
npm run media:search:fixtures

for ((index=1; index<=MAX_CYCLES; index++)); do
  if (( $(date +%s) >= DEADLINE_EPOCH )); then stop_reason="time-budget"; break; fi
  if run_cycle; then :; else
    status=$?
    if (( status == 2 )); then break; fi
    exit "$status"
  fi
done

publish_staging final
if (( cycles >= MAX_CYCLES )) && [[ "$stop_reason" == "max-cycles" ]]; then stop_reason="max-cycles"; fi
write_receipt

# After this workflow is present on the default branch, workflow_dispatch can re-arm
# a time-limited run without a human. One twelve-cycle run has capacity for 480
# obligations: enough to drain the current routine-ready and bounded open-web coverage
# pass without using a chat continuation as a scheduling primitive.
if [[ "$stop_reason" == "time-budget" || "$stop_reason" == "max-cycles" ]]; then
  if command -v gh >/dev/null 2>&1 && [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    log "attempting unattended re-arm"
    GH_TOKEN="${GITHUB_TOKEN:-}" gh api -X POST \
      "repos/${GITHUB_REPOSITORY}/actions/workflows/card-backfill-autonomous.yml/dispatches" \
      -f ref="$BRANCH" \
      -f "inputs[max_cycles]=$MAX_CYCLES" \
      -f "inputs[cohort_limit]=$LIMIT" \
      -f "inputs[time_budget_minutes]=$TIME_BUDGET_MINUTES" || log "re-arm unavailable until workflow exists on the default branch"
  fi
fi

log "autonomous campaign finished: cycles=$cycles selected=$selected_total accepted=$accepted_total published=$published_total stop=$stop_reason"
