#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-}"
: "${PRODUCT_COMMIT:?}"
: "${PRODUCT_TREE:?}"
: "${PRODUCT_PARENT:?}"
: "${TASK_ID:?}"
: "${LEASE_ID:?}"
: "${WALL_ID:?}"
: "${RECEIPT_PATH:?}"
: "${RECEIPT_SHA256:?}"
: "${CHECKER_PATH:?}"
: "${CHECKER_SHA256:?}"
: "${REVIEWED_CYCLE:?}"
: "${WATERLINE_EVENT:?}"
: "${NEXT_TASK:?}"
: "${NEXT_PERFORMER:?}"
: "${NEXT_CHARACTER:?}"
: "${NEXT_FINGERPRINT:?}"
: "${RESULT_BRANCH:?}"
: "${OUT:?}"

verify_main() {
  git fetch --no-tags origin main
  test "$(git rev-parse HEAD)" = "$PRODUCT_COMMIT"
  test "$(git rev-parse refs/remotes/origin/main)" = "$PRODUCT_COMMIT"
  test "$(git show -s --format=%T HEAD)" = "$PRODUCT_TREE"
  test "$(git show -s --format=%P HEAD)" = "$PRODUCT_PARENT"
  test "$(git show -s --format=%s HEAD)" = 'Star Trek: publish Alice (character) cycle'
}

prepare() {
  rm -rf "$OUT"
  mkdir -p "$OUT"
  verify_main
  test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"

  test "$(jq -r .transaction "$RECEIPT_PATH")" = STAR-TREK-CYCLE-ALICE
  test "$(jq -r .receipt_sha256 "$RECEIPT_PATH")" = "$RECEIPT_SHA256"
  test "$(jq -r .reviewed_cycle.id "$RECEIPT_PATH")" = "$REVIEWED_CYCLE"
  test "$(jq -r .reviewed_cycle.event_id "$RECEIPT_PATH")" = "$WATERLINE_EVENT"
  test "$(jq -r .task.id "$RECEIPT_PATH")" = "$TASK_ID"
  test "$(jq -r .lease.id "$RECEIPT_PATH")" = "$LEASE_ID"
  test "$(jq -r .canonical.wall_id "$RECEIPT_PATH")" = "$WALL_ID"
  test "$(jq -r .qualification.checker_sha256 "$RECEIPT_PATH")" = "$CHECKER_SHA256"
  test "$(sha256sum "$CHECKER_PATH" | awk '{print $1}')" = "$CHECKER_SHA256"

  npm ci --ignore-scripts
  node "$CHECKER_PATH" | tee "$OUT/alice-checker.log"
  node scripts/star-trek-anastasia-komananov-cycle.mjs | tee "$OUT/anastasia-checker.log"
  node scripts/validate.mjs | tee "$OUT/repository-validate.log"
  npm run media:audit -- gate --scope star-trek | tee "$OUT/media-gate.log"
  node scripts/waterline.mjs validate --scope star-trek | tee "$OUT/waterline-validate.log"
  node scripts/thesis-rails.mjs validate | tee "$OUT/thesis-validate.log"
  node scripts/thesis-rails.mjs next --json > "$OUT/next.json"
  test "$(jq -r .phase "$OUT/next.json")" = ready-for-one-cycle
  test "$(jq -r .candidate.task_id "$OUT/next.json")" = "$NEXT_TASK"
  test "$(jq -r .candidate.performer "$OUT/next.json")" = "$NEXT_PERFORMER"
  test "$(jq -r .candidate.character "$OUT/next.json")" = "$NEXT_CHARACTER"
  test "$(jq -r .candidate.source_fingerprint "$OUT/next.json")" = "$NEXT_FINGERPRINT"

  node - <<'NODE'
const fs=require('fs');
const state=JSON.parse(fs.readFileSync('data/AUTOPILOT.json'));
const trek=state.jobs.filter(x=>x.scope==='star-trek');
const task=trek.find(x=>x.id===process.env.TASK_ID);
const counts={
  total:trek.length,
  queued:trek.filter(x=>x.status==='queued').length,
  resolved:trek.filter(x=>x.status==='resolved').length,
  blocked:trek.filter(x=>x.status==='blocked').length,
  rejected:trek.filter(x=>x.status==='rejected').length,
  in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length,
};
if(!task||task.status!=='resolved'||task.performer!=='Nichelle Nichols'||task.character!=='Alice (character)'||task.wall_ids?.[0]!==process.env.WALL_ID) throw Error('Alice durable task drifted');
const expected={total:2228,queued:1798,resolved:428,blocked:0,rejected:2,in_flight:0};
if(JSON.stringify(counts)!==JSON.stringify(expected)) throw Error('Alice queue drifted: '+JSON.stringify(counts));
const water=JSON.parse(fs.readFileSync('data/WATERLINE-STATE.json'));
const cycle=water.cycles.find(x=>x.id===process.env.REVIEWED_CYCLE&&x.scope_id==='star-trek'&&x.lease_id===process.env.LEASE_ID);
if(!cycle||cycle.outcome!=='completed'||cycle.task_statuses?.[process.env.TASK_ID]!=='resolved') throw Error('Alice reviewed cycle drifted');
if(!fs.readFileSync('sitemap.xml','utf8').includes('records/'+process.env.WALL_ID+'/')) throw Error('Alice permanent route missing');
fs.writeFileSync(process.env.OUT+'/durable.json',JSON.stringify({task,counts,cycle},null,2)+'\n');
NODE

  gh api "/repos/${GITHUB_REPOSITORY}/branches/main" > "$OUT/main-before-pages.json"
  test "$(jq -r .commit.sha "$OUT/main-before-pages.json")" = "$PRODUCT_COMMIT"

  gh run list --repo "$GITHUB_REPOSITORY" --workflow pages.yml --branch main --limit 100 \
    --json databaseId,status,conclusion,headSha,event,createdAt,updatedAt,url > "$OUT/pages-before.json"
  pages_run="$(jq -r --arg sha "$PRODUCT_COMMIT" '[.[] | select(.headSha==$sha and .conclusion=="success")] | sort_by(.databaseId) | last.databaseId // empty' "$OUT/pages-before.json")"
  if test -z "$pages_run"; then
    triggered_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    gh workflow run pages.yml --repo "$GITHUB_REPOSITORY" --ref main
    for _ in $(seq 1 180); do
      gh run list --repo "$GITHUB_REPOSITORY" --workflow pages.yml --branch main --limit 100 \
        --json databaseId,status,conclusion,headSha,event,createdAt,updatedAt,url > "$OUT/pages-after-dispatch.json"
      pages_run="$(jq -r --arg sha "$PRODUCT_COMMIT" --arg at "$triggered_at" '[.[] | select(.headSha==$sha and .event=="workflow_dispatch" and .createdAt >= $at)] | sort_by(.databaseId) | last.databaseId // empty' "$OUT/pages-after-dispatch.json")"
      test -n "$pages_run" && break
      sleep 5
    done
  fi
  test -n "$pages_run"

  status=''
  for _ in $(seq 1 720); do
    gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}" > "$OUT/pages-run.json"
    status="$(jq -r .status "$OUT/pages-run.json")"
    test "$status" = completed && break
    sleep 5
  done
  test "$status" = completed
  test "$(jq -r .conclusion "$OUT/pages-run.json")" = success
  test "$(jq -r .head_sha "$OUT/pages-run.json")" = "$PRODUCT_COMMIT"
  gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}/jobs?filter=latest&per_page=100" > "$OUT/pages-jobs.json"
  jq -e '.jobs | any(.name=="deploy" and .status=="completed" and .conclusion=="success")' "$OUT/pages-jobs.json" >/dev/null

  gh api "/repos/${GITHUB_REPOSITORY}/branches/main" > "$OUT/main-after-pages.json"
  test "$(jq -r .commit.sha "$OUT/main-after-pages.json")" = "$PRODUCT_COMMIT"
  verify_main

  cp "$RECEIPT_PATH" "$OUT/canonical-receipt.json"
  cp "$CHECKER_PATH" "$OUT/canonical-checker.mjs"
  cp data/WATERLINE-STATE.json "$OUT/waterline-state.json"
  cp data/ESTATE-REGISTRY.json "$OUT/estate-registry.json"

  export PAGES_RUN="$pages_run"
  node - <<'NODE'
const fs=require('fs');
const main=JSON.parse(fs.readFileSync(process.env.OUT+'/main-after-pages.json'));
const durable=JSON.parse(fs.readFileSync(process.env.OUT+'/durable.json'));
const receipt=JSON.parse(fs.readFileSync(process.env.OUT+'/canonical-receipt.json'));
const pages=JSON.parse(fs.readFileSync(process.env.OUT+'/pages-run.json'));
const pagesJobs=JSON.parse(fs.readFileSync(process.env.OUT+'/pages-jobs.json'));
const next=JSON.parse(fs.readFileSync(process.env.OUT+'/next.json'));
const terminal={
  version:1,
  transaction:'STAR-TREK-ALICE-TERMINALIZATION-V2',
  status:'published-and-deployed',
  canonical:{commit:process.env.PRODUCT_COMMIT,tree:process.env.PRODUCT_TREE,parent:process.env.PRODUCT_PARENT,message:'Star Trek: publish Alice (character) cycle',readback:main.commit.sha},
  task:{id:durable.task.id,lease_id:process.env.LEASE_ID,performer:durable.task.performer,character:durable.task.character,status:durable.task.status,wall_id:durable.task.wall_ids?.[0],attempts:durable.task.attempts},
  receipt:{path:process.env.RECEIPT_PATH,receipt_sha256:receipt.receipt_sha256,checker_path:process.env.CHECKER_PATH,checker_sha256:receipt.qualification.checker_sha256},
  queue:durable.counts,
  reviewed_cycle:receipt.reviewed_cycle,
  pages:{run_id:pages.id,status:pages.status,conclusion:pages.conclusion,event:pages.event,head_sha:pages.head_sha,url:pages.html_url,jobs:pagesJobs.jobs.map(j=>({id:j.id,name:j.name,status:j.status,conclusion:j.conclusion}))},
  next,
  terminalizer:{run_id:process.env.GITHUB_RUN_ID,head_sha:process.env.GITHUB_SHA,canonical_mutation:false,lease_mutation:false},
  boundary:{marcia_brown_live_action_performance_separate:true,physical_performance_attributed_to_nichelle_nichols:false,unsupported_maker_functions_promoted:false,additional_lease_issued:false}
};
fs.writeFileSync(process.env.OUT+'/publication.json',JSON.stringify(terminal,null,2)+'\n');
fs.writeFileSync(process.env.OUT+'/verdict.txt',`PASS\nAlice cycle published and deployed\nProduct ${process.env.PRODUCT_COMMIT}\nPages run ${pages.id}\nReceipt ${receipt.receipt_sha256}\nNext ${next.candidate.task_id} ${next.candidate.performer} as ${next.candidate.character}\n`);
NODE

  test "$(jq -r .status "$OUT/publication.json")" = published-and-deployed
  test "$(jq -r .canonical.readback "$OUT/publication.json")" = "$PRODUCT_COMMIT"
  test "$(jq -r .queue.in_flight "$OUT/publication.json")" = 0
  test "$(jq -r .pages.conclusion "$OUT/publication.json")" = success
  test "$(jq -r .next.candidate.task_id "$OUT/publication.json")" = "$NEXT_TASK"
  find "$OUT" -type f ! -name manifest.sha256 -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > "$OUT/manifest.sha256"
  echo "pages_run=$pages_run" >> "$GITHUB_OUTPUT"
}

publish() {
  : "${ARTIFACT_ID:?}"
  : "${ARTIFACT_DIGEST:?}"
  jq --argjson id "$ARTIFACT_ID" --arg digest "$ARTIFACT_DIGEST" '.artifact={id:$id,digest:$digest}' "$OUT/publication.json" > "$OUT/publication.tmp"
  mv "$OUT/publication.tmp" "$OUT/publication.json"
  find "$OUT" -type f ! -name manifest.sha256 -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > "$OUT/manifest.sha256"
  test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"
  git config user.name undercast-alice-terminalizer
  git config user.email undercast-alice-terminalizer@users.noreply.github.com
  git checkout --orphan alice-terminal-result-v1
  git rm -rf .
  find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  mkdir -p transport/star-trek-alice-terminal-v1
  cp -a "$OUT"/. transport/star-trek-alice-terminal-v1/
  git add transport/star-trek-alice-terminal-v1
  git commit -m 'Record terminal Star Trek Alice cycle v1'
  git push origin "HEAD:refs/heads/${RESULT_BRANCH}"
}

case "$mode" in
  prepare) prepare ;;
  publish) publish ;;
  *) echo 'usage: terminalize.sh <prepare|publish>' >&2; exit 2 ;;
esac
