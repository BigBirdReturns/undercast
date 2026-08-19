#!/usr/bin/env bash
set -euo pipefail

test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$EXPECTED_MAIN"
rm -rf /tmp/kukulkan-probe-receipt-v2
mkdir -p /tmp/kukulkan-probe-receipt-v2
cp /tmp/kol-tai-prep-v4/source-receipt.json /tmp/kukulkan-probe-receipt-v2/
cp /tmp/kol-tai-prep-v4/media-preparation.json /tmp/kukulkan-probe-receipt-v2/
cp /tmp/kukulkan-controller-v2/controller-source-manifest.json /tmp/kukulkan-probe-receipt-v2/
cp /tmp/kukulkan-next-v2.json /tmp/kukulkan-probe-receipt-v2/thesis-next.json

source_receipt_sha="$(jq -r .receipt_sha256 /tmp/kol-tai-prep-v4/source-receipt.json)"
facets_sha="$(jq -r .facets_sha256 /tmp/kol-tai-prep-v4/media-preparation.json)"
controller_manifest_sha="$(sha256sum /tmp/kukulkan-controller-v2/controller-source-manifest.json | cut -d' ' -f1)"

jq -n \
  --argjson version 2 \
  --arg transaction STAR-TREK-KUKULKAN-PROBE-V2 \
  --arg status success \
  --argjson workflow_run "$GITHUB_RUN_ID" \
  --arg workflow_head "$GITHUB_SHA" \
  --arg canonical_parent "$EXPECTED_MAIN" \
  --arg task_id "$TASK_ID" \
  --arg source_fingerprint "$TASK_FINGERPRINT" \
  --arg character "$TARGET_CHARACTER" \
  --arg performer "$TARGET_PERFORMER" \
  --arg wall_id "$WALL_ID" \
  --arg source_receipt_sha256 "$source_receipt_sha" \
  --arg facets_sha256 "$facets_sha" \
  --arg controller_manifest_sha256 "$controller_manifest_sha" \
  --argjson prep_artifact "$PREP_ARTIFACT_ID" \
  --arg prep_digest "$PREP_ARTIFACT_DIGEST" \
  --argjson controller_artifact "$CONTROLLER_ARTIFACT_ID" \
  --arg controller_digest "$CONTROLLER_ARTIFACT_DIGEST" \
  '{version:$version,transaction:$transaction,status:$status,workflow_run:$workflow_run,workflow_head:$workflow_head,canonical_parent:$canonical_parent,task_id:$task_id,source_fingerprint:$source_fingerprint,character:$character,performer:$performer,wall_id:$wall_id,source_receipt_sha256:$source_receipt_sha256,facets_sha256:$facets_sha256,controller_manifest_sha256:$controller_manifest_sha256,artifacts:{preparation:{id:$prep_artifact,digest:$prep_digest},controller:{id:$controller_artifact,digest:$controller_digest}},canonical_mutation:false,lease_taken:false}' \
  > /tmp/kukulkan-probe-receipt-v2/kukulkan-probe-v2.json

git fetch --filter=blob:none --no-tags origin "$RESULT_BRANCH"
git checkout --detach FETCH_HEAD
locator=transport/kukulkan-probe-v2/run-start.json
test -f "$locator"
python3 - "$source_receipt_sha" "$facets_sha" "$controller_manifest_sha" "$PREP_ARTIFACT_ID" "$PREP_ARTIFACT_DIGEST" "$CONTROLLER_ARTIFACT_ID" "$CONTROLLER_ARTIFACT_DIGEST" <<'PY'
from pathlib import Path
import json
import sys

path = Path('transport/kukulkan-probe-v2/run-start.json')
data = json.loads(path.read_text())
data['status'] = 'success'
data['source_receipt_sha256'] = sys.argv[1]
data['facets_sha256'] = sys.argv[2]
data['controller_manifest_sha256'] = sys.argv[3]
data['artifacts'] = {
    'preparation': {'id': int(sys.argv[4]), 'digest': sys.argv[5]},
    'controller': {'id': int(sys.argv[6]), 'digest': sys.argv[7]},
}
data['canonical_mutation'] = False
data['lease_taken'] = False
path.write_text(json.dumps(data, indent=2) + '\n')
PY
git config user.name undercast-star-trek-kukulkan-probe
git config user.email star-trek-kukulkan-probe@users.noreply.github.com
git add "$locator"
git commit -m 'Kukulkan: seal live-bound non-mutating probe v2'
git push --force origin "HEAD:refs/heads/${RESULT_BRANCH}"
