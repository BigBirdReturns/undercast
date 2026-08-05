#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${EVIDENCE:?EVIDENCE is required}"
repo=BigBirdReturns/undercast
issue=387
supervisor_branch=agent/ssc-rd-wave03-exact-capture-terminal-supervisor-20260805
supervisor_workflow='RD-W03 exact-capture terminal supervisor'
product_branch=agent/ssc-rd-wave03-exact-capture-product-v4-20260805
mkdir -p "$EVIDENCE"
exec > >(tee "$EVIDENCE/finalizer.log") 2>&1
printf 'locate_supervisor\n' > "$EVIDENCE/stage.txt"

urlencode() {
  python3 - "$1" <<'PY'
from urllib.parse import quote
import sys
print(quote(sys.argv[1], safe=''))
PY
}
encoded_supervisor="$(urlencode "$supervisor_branch")"
encoded_product="$(urlencode "$product_branch")"
supervisor_head="$(gh api "/repos/$repo/branches/$encoded_supervisor" --jq .commit.sha)"
test -n "$supervisor_head"
printf 'supervisor_branch=%s\nsupervisor_head=%s\n' "$supervisor_branch" "$supervisor_head" > "$EVIDENCE/supervisor-custody.txt"

run_id=''
for _ in $(seq 1 120); do
  gh api --method GET "/repos/$repo/actions/runs" -f branch="$supervisor_branch" -f event=push -f per_page=100 > "$EVIDENCE/runs.json"
  run_id="$(python3 - "$EVIDENCE/runs.json" "$supervisor_workflow" "$supervisor_head" <<'PY'
import json, sys
rows=json.load(open(sys.argv[1])).get('workflow_runs',[])
rows=[r for r in rows if r.get('name')==sys.argv[2] and r.get('head_sha')==sys.argv[3] and r.get('event')=='push']
print(max((r['id'] for r in rows), default=''))
PY
)"
  test -n "$run_id" && break
  sleep 15
done
test -n "$run_id"
printf '%s\n' "$run_id" > "$EVIDENCE/supervisor-run-id.txt"

printf 'wait_supervisor\n' > "$EVIDENCE/stage.txt"
status=''
conclusion=''
for _ in $(seq 1 600); do
  gh api "/repos/$repo/actions/runs/$run_id" > "$EVIDENCE/run.json"
  read -r status conclusion < <(python3 - "$EVIDENCE/run.json" <<'PY'
import json, sys
r=json.load(open(sys.argv[1]))
print(r.get('status') or '', r.get('conclusion') or '')
PY
)
  test "$status" = completed && break
  sleep 20
done
test "$status" = completed
printf 'run_id=%s\nstatus=%s\nconclusion=%s\n' "$run_id" "$status" "$conclusion" > "$EVIDENCE/run-status.txt"

printf 'download_artifact\n' > "$EVIDENCE/stage.txt"
artifact_name="rd-wave03-exact-capture-terminal-supervisor-$run_id"
gh api "/repos/$repo/actions/runs/$run_id/artifacts" > "$EVIDENCE/artifacts.json"
read -r artifact_id artifact_digest < <(python3 - "$EVIDENCE/artifacts.json" "$artifact_name" <<'PY'
import json, sys
rows=[a for a in json.load(open(sys.argv[1])).get('artifacts',[]) if a.get('name')==sys.argv[2] and not a.get('expired')]
if len(rows)!=1: print('', '')
else: print(rows[0]['id'], rows[0].get('digest') or '')
PY
)
test -n "$artifact_id"
printf 'artifact_id=%s\nartifact_name=%s\nartifact_digest=%s\n' "$artifact_id" "$artifact_name" "$artifact_digest" > "$EVIDENCE/artifact-custody.txt"
rm -rf "$EVIDENCE/supervisor-artifact"
mkdir -p "$EVIDENCE/supervisor-artifact"
downloaded=false
for _ in $(seq 1 30); do
  if gh run download "$run_id" --repo "$repo" --name "$artifact_name" --dir "$EVIDENCE/supervisor-artifact"; then downloaded=true; break; fi
  sleep 10
done
test "$downloaded" = true

printf 'verify_capture_artifact\n' > "$EVIDENCE/stage.txt"
summary_path="$(find "$EVIDENCE/supervisor-artifact" -type f -name terminal-supervisor-summary.json -print -quit)"
test -n "$summary_path"
root="$(dirname "$summary_path")"
receipt_path="$root/current-capture/current-capture-receipt.json"
test -f "$receipt_path"
python3 - "$root" "$EVIDENCE/verified-terminal.json" "$run_id" "$conclusion" "$artifact_id" "$artifact_digest" <<'PY'
from __future__ import annotations
import hashlib, json, pathlib, sys
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
summary=json.loads((root/'terminal-supervisor-summary.json').read_text())
receipt=json.loads((root/'current-capture/current-capture-receipt.json').read_text())
assert summary['transaction_id']=='RD-W03-EXACT-CAPTURE-CURRENT-01'
assert summary['supervisor_run_id']==sys.argv[3]
assert summary['product_path_count']==6
assert summary['route_observation_denominator']==710
assert summary['captured_objects']==9
assert summary['refused_observations']==701
assert summary['adversarial_refusals']==35
assert summary['complete_current_main_gate']=='passed'
assert summary['credential_free_capture'] is True
assert summary['evidence_admissions']==0 and summary['chronology_resolved']==0 and summary['classes_closed']==0
assert summary['external_contacts']==0 and summary['external_reviews']==0 and summary['outside_human_dependency'] is False
assert summary['publication_effect']=='none' and summary['adoption_effect']=='none' and summary['graph_effect']=='none' and summary['merge_authority'] is False
assert receipt['route_count']==9 and receipt['summary']['successful']==9 and receipt['summary']['failed']==0
assert receipt['summary']['unchanged']==summary['unchanged_objects'] and receipt['summary']['drifted']==summary['drifted_objects']
assert [r['route_id'] for r in receipt['objects']]==[r['route_id'] for r in summary['objects']]
verified=[]
for row in receipt['objects']:
    assert row['ok'] is True and row['http_status']==200 and row['attempt_count']==1
    assert row['chronology_status']=='unresolved' and row['evidence_admitted'] is False and row['classes_closed']==0
    data=(root/'current-capture'/row['relative_path']).read_bytes()
    digest=hashlib.sha256(data).hexdigest()
    assert len(data)==row['current_bytes'] and digest==row['current_body_sha256']
    verified.append({k:row[k] for k in ['route_id','object_id','requested_url','final_url','content_type','initial_bytes','initial_body_sha256','current_bytes','current_body_sha256','body_drift']})
assert summary['capture_receipt_sha256']==hashlib.sha256((root/'current-capture/current-capture-receipt.json').read_bytes()).hexdigest()
terminal={
 'schema_version':1,'status':'capture_artifact_verified','supervisor_run_id':sys.argv[3],
 'supervisor_conclusion':sys.argv[4],'artifact_id':int(sys.argv[5]),'artifact_api_digest':sys.argv[6],
 'carrier_head':summary['carrier_head'],'product_base':summary['product_base'],'product_head':summary['product_head'],
 'product_tree':summary['product_tree'],'product_pr':summary['product_pr'],'supervisor_gated_main':summary['current_main'],
 'product_path_count':6,'route_observation_denominator':710,'captured_objects':9,'refused_observations':701,
 'adversarial_refusals':35,'unchanged_objects':summary['unchanged_objects'],'drifted_objects':summary['drifted_objects'],
 'objects':verified,'capture_receipt_sha256':summary['capture_receipt_sha256'],'credential_free_capture':True,
 'evidence_admissions':0,'chronology_resolved':0,'classes_closed':0,'external_contacts':0,'external_reviews':0,
 'outside_human_dependency':False,'publication_effect':'none','adoption_effect':'none','graph_effect':'none','merge_authority':False}
out.write_text(json.dumps(terminal,sort_keys=True,indent=2)+'\n')
PY
cat "$EVIDENCE/verified-terminal.json"

printf 'verify_product_and_live_main\n' > "$EVIDENCE/stage.txt"
product_head="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["product_head"])')"
product_pr="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["product_pr"])')"
remote_product_head="$(gh api "/repos/$repo/branches/$encoded_product" --jq .commit.sha)"
test "$remote_product_head" = "$product_head"
gh pr view "$product_pr" --repo "$repo" --json number,state,isDraft,headRefName,headRefOid,url > "$EVIDENCE/product-pr.json"
python3 - "$EVIDENCE/product-pr.json" "$product_branch" "$product_head" <<'PY'
import json, sys
p=json.load(open(sys.argv[1])); assert p['state']=='OPEN' and p['isDraft'] is True
assert p['headRefName']==sys.argv[2] and p['headRefOid']==sys.argv[3]
PY

git fetch --no-tags origin "+refs/heads/$product_branch:refs/remotes/origin/capture-product" +refs/heads/main:refs/remotes/origin/main
live_main="$(git rev-parse refs/remotes/origin/main)"
test "$(git rev-parse refs/remotes/origin/capture-product)" = "$product_head"
worktree="$RUNNER_TEMP/rd-wave03-terminal-finalizer-main"
rm -rf "$worktree"
git worktree add --detach "$worktree" "$live_main"
git -C "$worktree" config user.name github-actions[bot]
git -C "$worktree" config user.email 41898282+github-actions[bot]@users.noreply.github.com
mapfile -t paths < <(git diff-tree --no-commit-id --name-only -r "$product_head" | LC_ALL=C sort)
test "${#paths[@]}" -eq 6
for rel in "${paths[@]}"; do
  test ! -e "$worktree/$rel"
  mkdir -p "$worktree/$(dirname "$rel")"
  git show "$product_head:$rel" > "$worktree/$rel"
done
git -C "$worktree" add -- "${paths[@]}"
git -C "$worktree" commit --no-verify -m 'temporary RD-W03 terminal-finalizer current-main proof'
integration_head="$(git -C "$worktree" rev-parse HEAD)"
test "$(git -C "$worktree" show -s --format=%P "$integration_head")" = "$live_main"
printf 'live_main=%s\nintegration_head=%s\nproduct_head=%s\n' "$live_main" "$integration_head" "$product_head" > "$EVIDENCE/live-main-custody.txt"
cd "$worktree"
npm ci
npx playwright install --with-deps chromium
npm run gate
node scripts/rd-wave03-exact-capture.mjs --check
node test/rd-wave03-exact-capture-adversarial.mjs
test -z "$(git status --porcelain=v1 --untracked-files=all)"
cd "$GITHUB_WORKSPACE"

printf 'publish_ruling\n' > "$EVIDENCE/stage.txt"
drifted="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["drifted_objects"])')"
unchanged="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["unchanged_objects"])')"
receipt_sha="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["capture_receipt_sha256"])')"
delta_lines="$(python3 - "$EVIDENCE/verified-terminal.json" <<'PY'
import json, sys
for row in json.load(open(sys.argv[1]))['objects']:
    status='DRIFT' if row['body_drift'] else 'UNCHANGED'
    print(f"{row['route_id']}  {status}  {row['initial_bytes']}->{row['current_bytes']} bytes  {row['initial_body_sha256']}->{row['current_body_sha256']}")
PY
)"
if test "$drifted" -eq 0; then
  cat > "$EVIDENCE/ruling.md" <<EOF
RD-W03 exact capture is independently terminal and byte-identical.

\`\`\`text
supervisor run:          $run_id
supervisor conclusion:   $conclusion
artifact ID:             $artifact_id
artifact API digest:     $artifact_digest
product PR:              #$product_pr
exact product head:      $product_head
latest main gated:       $live_main
permanent product paths: 6
objects captured:        9 / 9
unchanged objects:       $unchanged
observations refused:    701
adversarial refusals:    35 / 35
complete gate:           PASS
credential-free capture: true
capture receipt SHA-256: $receipt_sha
\`\`\`

\`\`\`text
$delta_lines
\`\`\`

The finalizer re-read every retained object from the downloaded artifact, recomputed each byte count and SHA-256, verified the exact product branch and open draft PR, and reran the complete six-path overlay gate on latest main. Chronology remains unresolved; evidence admissions and classes closed remain zero. External contacts/reviews are 0/0, outside-human dependency is false, and publication/adoption/graph/merge authority remains absent.
EOF
  gh pr comment "$product_pr" --repo "$repo" --body-file "$EVIDENCE/ruling.md"
  gh issue comment "$issue" --repo "$repo" --body-file "$EVIDENCE/ruling.md"
  state="$(gh issue view "$issue" --repo "$repo" --json state --jq .state)"
  if test "$state" = OPEN; then gh issue close "$issue" --repo "$repo" --reason completed; fi
else
  cat > "$EVIDENCE/ruling.md" <<EOF
RD-W03 independently verified all nine retained current objects, but $drifted bodies differ from their immutable initial fingerprints.

\`\`\`text
supervisor run:          $run_id
supervisor conclusion:   $conclusion
artifact ID:             $artifact_id
artifact API digest:     $artifact_digest
product PR:              #$product_pr
exact product head:      $product_head
latest main gated:       $live_main
permanent product paths: 6
objects captured:        9 / 9
unchanged objects:       $unchanged
drifted objects:         $drifted
observations refused:    701
adversarial refusals:    35 / 35
complete gate:           PASS
credential-free capture: true
capture receipt SHA-256: $receipt_sha
\`\`\`

\`\`\`text
$delta_lines
\`\`\`

This is a bounded body-drift census, not evidence admission. HTTP status and allowed host were valid for every retained object; chronology remains unresolved and classes closed remain zero. Issue #387 stays open pending repository-native recensus, with no external contact or review dependency. The product PR remains draft and unmerged.
EOF
  gh pr comment "$product_pr" --repo "$repo" --body-file "$EVIDENCE/ruling.md"
  gh issue comment "$issue" --repo "$repo" --body-file "$EVIDENCE/ruling.md"
  child="$(gh issue list --repo "$repo" --state open --search 'RD-W03 exact-capture body drift recensus in:title' --json number --jq '.[0].number // empty')"
  if test -z "$child"; then gh issue create --repo "$repo" --title 'RD-W03 exact-capture body drift recensus' --body-file "$EVIDENCE/ruling.md" > "$EVIDENCE/drift-issue-url.txt"; fi
fi
printf 'complete\n' > "$EVIDENCE/stage.txt"
