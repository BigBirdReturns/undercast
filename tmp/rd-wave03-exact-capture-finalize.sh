#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${EVIDENCE:?EVIDENCE is required}"
repo=BigBirdReturns/undercast
issue=387
settlement_branch=agent/ssc-rd-wave03-exact-capture-settlement-20260805
settlement_workflow='RD-W03 exact-capture settlement'
product_branch=agent/ssc-rd-wave03-exact-capture-product-v2-20260805
mkdir -p "$EVIDENCE"
exec > >(tee "$EVIDENCE/finalizer.log") 2>&1
stage=preflight
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"

on_error() {
  code=$?
  set +e
  current_stage="$(cat "$EVIDENCE/stage.txt" 2>/dev/null || echo unknown)"
  tail -n 180 "$EVIDENCE/finalizer.log" > "$EVIDENCE/failure-tail.txt" 2>/dev/null || true
  {
    printf 'RD-W03 independent exact-capture finalizer failed closed at stage `%s`.\n\n' "$current_stage"
    printf 'No terminal admission, chronology, closure, publication, adoption, graph, outside-human, or merge authority is accepted. Issue #387 remains open unless a separate byte-verified terminal receipt already closed it.\n\n'
    printf '```text\n'
    cat "$EVIDENCE/failure-tail.txt" 2>/dev/null || true
    printf '\n```\n'
  } > "$EVIDENCE/failure-comment.md"
  gh issue comment "$issue" --repo "$repo" --body-file "$EVIDENCE/failure-comment.md" >/dev/null 2>&1 || true
  exit "$code"
}
trap on_error ERR

urlencode() {
  python3 - "$1" <<'PY'
from urllib.parse import quote
import sys
print(quote(sys.argv[1], safe=''))
PY
}

encoded_settlement="$(urlencode "$settlement_branch")"
encoded_product="$(urlencode "$product_branch")"
settlement_head="$(gh api "/repos/$repo/branches/$encoded_settlement" --jq .commit.sha)"
test -n "$settlement_head"
printf 'settlement_branch=%s\nsettlement_head=%s\n' "$settlement_branch" "$settlement_head" > "$EVIDENCE/settlement-custody.txt"

stage=locate_settlement_run
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"
run_id=''
for _ in $(seq 1 120); do
  gh api --method GET "/repos/$repo/actions/runs" \
    -f branch="$settlement_branch" -f event=push -f per_page=100 \
    > "$EVIDENCE/runs.json"
  run_id="$(python3 - "$EVIDENCE/runs.json" "$settlement_workflow" "$settlement_head" <<'PY'
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
printf '%s\n' "$run_id" > "$EVIDENCE/settlement-run-id.txt"

stage=wait_for_settlement_run
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"
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

stage=download_settlement_artifact
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"
artifact_name="rd-wave03-exact-capture-settlement-$run_id"
gh api "/repos/$repo/actions/runs/$run_id/artifacts" > "$EVIDENCE/artifacts.json"
read -r artifact_id artifact_digest < <(python3 - "$EVIDENCE/artifacts.json" "$artifact_name" <<'PY'
import json, sys
rows=[a for a in json.load(open(sys.argv[1])).get('artifacts',[]) if a.get('name')==sys.argv[2] and not a.get('expired')]
if len(rows)!=1:
    print('', '')
else:
    print(rows[0]['id'], rows[0].get('digest') or '')
PY
)
test -n "$artifact_id"
printf 'artifact_id=%s\nartifact_name=%s\nartifact_digest=%s\n' "$artifact_id" "$artifact_name" "$artifact_digest" > "$EVIDENCE/artifact-custody.txt"
rm -rf "$EVIDENCE/settlement-artifact"
mkdir -p "$EVIDENCE/settlement-artifact"
downloaded=false
for _ in $(seq 1 30); do
  if gh run download "$run_id" --repo "$repo" --name "$artifact_name" --dir "$EVIDENCE/settlement-artifact"; then
    downloaded=true
    break
  fi
  sleep 10
done
test "$downloaded" = true

stage=verify_terminal_capture
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"
summary_path="$(find "$EVIDENCE/settlement-artifact" -type f -name terminal-summary.json -print -quit)"
test -n "$summary_path"
artifact_root="$(dirname "$summary_path")"
receipt_path="$artifact_root/capture/receipt.json"
test -f "$receipt_path"
python3 - "$artifact_root" "$EVIDENCE/verified-terminal.json" "$run_id" "$conclusion" "$artifact_id" "$artifact_digest" <<'PY'
from __future__ import annotations
import hashlib, json, pathlib, sys
root=pathlib.Path(sys.argv[1])
out=pathlib.Path(sys.argv[2])
run_id=sys.argv[3]
conclusion=sys.argv[4]
artifact_id=int(sys.argv[5])
artifact_digest=sys.argv[6]
selected=['RD01-OFF-001','RD02-OFF-004','RD04-OFF-004','RD04-OFF-005','RD05-OFF-001','RD05-OFF-002','RD05-OFF-003','RD05-OFF-005','RD05-OFF-007']
summary=json.loads((root/'terminal-summary.json').read_text())
receipt=json.loads((root/'capture/receipt.json').read_text())
assert summary['transaction_id']=='RD-W03-EXACT-CAPTURE-01'
assert summary['settlement_run_id']==run_id
assert summary['product_path_count']==6
assert summary['route_observation_denominator']==710
assert summary['selected_object_denominator']==9
assert summary['refused_observation_denominator']==701
assert summary['adversarial_refusals']==35
assert summary['complete_gate']=='passed'
assert summary['captured_objects']==9
assert summary['credential_free_capture'] is True
assert summary['evidence_admissions']==0
assert summary['chronology_resolved']==0
assert summary['classes_closed']==0
assert summary['external_contacts']==0 and summary['external_reviews']==0
assert summary['outside_human_dependency'] is False
assert summary['publication_effect']=='none'
assert summary['adoption_effect']=='none'
assert summary['graph_effect']=='none'
assert summary['merge_authority'] is False
assert receipt['transaction_id']=='RD-W03-EXACT-CAPTURE-01'
assert receipt['route_count']==9
assert [r['route_id'] for r in receipt['objects']]==selected
assert [r['route_id'] for r in summary['objects']]==selected
verified=[]
for row in receipt['objects']:
    path=root/'capture'/row['relative_path']
    data=path.read_bytes()
    digest=hashlib.sha256(data).hexdigest()
    assert len(data)==row['bytes']
    assert digest==row['body_sha256']
    assert row['http_status']==200
    assert row['attempt_count']==1
    assert row['chronology_status']=='unresolved'
    assert row['evidence_admitted'] is False
    assert row['classes_closed']==0
    verified.append({'route_id':row['route_id'],'object_id':row['object_id'],'bytes':row['bytes'],'sha256':digest,'final_url':row['final_url'],'content_type':row['content_type']})
assert summary['receipt_sha256']==hashlib.sha256((root/'capture/receipt.json').read_bytes()).hexdigest()
terminal={
  'schema_version':1,
  'status':'capture_verified',
  'settlement_run_id':run_id,
  'settlement_run_conclusion':conclusion,
  'settlement_artifact_id':artifact_id,
  'settlement_artifact_api_digest':artifact_digest,
  'carrier_head':summary['carrier_head'],
  'product_base':summary['product_base'],
  'product_head':summary['product_head'],
  'product_tree':summary['product_tree'],
  'product_pr':summary['product_pr'],
  'product_path_count':6,
  'route_observation_denominator':710,
  'captured_objects':9,
  'refused_observations':701,
  'adversarial_refusals':35,
  'complete_gate':'passed',
  'credential_free_capture':True,
  'receipt_sha256':summary['receipt_sha256'],
  'objects':verified,
  'evidence_admissions':0,
  'chronology_resolved':0,
  'classes_closed':0,
  'external_contacts':0,
  'external_reviews':0,
  'outside_human_dependency':False,
  'publication_effect':'none',
  'adoption_effect':'none',
  'graph_effect':'none',
  'merge_authority':False,
}
out.write_text(json.dumps(terminal,sort_keys=True,indent=2)+'\n')
PY
cat "$EVIDENCE/verified-terminal.json"

stage=verify_product_ref_and_pr
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"
product_head="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["product_head"])')"
product_pr="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["product_pr"])')"
remote_product_head="$(gh api "/repos/$repo/branches/$encoded_product" --jq .commit.sha)"
test "$remote_product_head" = "$product_head"
gh pr view "$product_pr" --repo "$repo" --json number,state,isDraft,headRefName,headRefOid,url > "$EVIDENCE/product-pr.json"
python3 - "$EVIDENCE/product-pr.json" "$product_branch" "$product_head" <<'PY'
import json, sys
p=json.load(open(sys.argv[1]))
assert p['state']=='OPEN'
assert p['isDraft'] is True
assert p['headRefName']==sys.argv[2]
assert p['headRefOid']==sys.argv[3]
PY

stage=publish_terminal_ruling
printf '%s\n' "$stage" > "$EVIDENCE/stage.txt"
receipt_sha="$(python3 -c 'import json,os; print(json.load(open(os.environ["EVIDENCE"]+"/verified-terminal.json"))["receipt_sha256"])')"
object_lines="$(python3 - "$EVIDENCE/verified-terminal.json" <<'PY'
import json, sys
for row in json.load(open(sys.argv[1]))['objects']:
    print(f"{row['route_id']}  {row['bytes']} bytes  {row['sha256']}")
PY
)"
run_note='success'
test "$conclusion" = success || run_note="${conclusion}_after_verified_terminal_artifact"
cat > "$EVIDENCE/terminal-comment.md" <<EOF
RD-W03 exact capture is independently terminal and byte-verified.

\`\`\`text
settlement run:          $run_id
settlement conclusion:   $run_note
artifact ID:             $artifact_id
artifact API digest:     $artifact_digest
product PR:              #$product_pr
exact product head:      $product_head
permanent product paths: 6
observations accounted:  710
objects captured:        9 / 9
observations refused:    701
adversarial refusals:    35 / 35
complete gate:           PASS
credential-free capture: true
receipt SHA-256:         $receipt_sha
\`\`\`

\`\`\`text
$object_lines
\`\`\`

The finalizer re-read every retained object from the downloaded artifact and independently recomputed its byte count and SHA-256. All nine match their immutable initial receipt bindings. Chronology remains unresolved for all nine; evidence admissions and classes closed remain zero. External contacts/reviews are 0/0, outside-human dependency is false, and publication/adoption/graph/merge authority remains absent. The product PR remains draft and unmerged.
EOF
gh pr comment "$product_pr" --repo "$repo" --body-file "$EVIDENCE/terminal-comment.md"
gh issue comment "$issue" --repo "$repo" --body-file "$EVIDENCE/terminal-comment.md"
issue_state="$(gh issue view "$issue" --repo "$repo" --json state --jq .state)"
if test "$issue_state" = OPEN; then gh issue close "$issue" --repo "$repo" --reason completed; fi
printf 'complete\n' > "$EVIDENCE/stage.txt"
trap - ERR
