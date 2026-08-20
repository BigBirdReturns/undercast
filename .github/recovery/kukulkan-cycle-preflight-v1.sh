#!/usr/bin/env bash
set -euo pipefail

active=''
for attempt in $(seq 1 120); do
  runs="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs?per_page=100")"
  active="$(jq --argjson self "$GITHUB_RUN_ID" '[.workflow_runs[] | select(.id != $self and .status != "completed" and (.head_branch // "" | test("^agent/star-trek-kukulkan-(probe|cycle)")))] | length' <<<"$runs")"
  if test "$active" = 0; then break; fi
  sleep 5
done
test "$active" = 0

test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$EXPECTED_MAIN"
git fetch --filter=blob:none --no-tags origin main
test "$(git rev-parse FETCH_HEAD)" = "$EXPECTED_MAIN"
git checkout --detach "$EXPECTED_MAIN"
node scripts/star-trek-kol-tai-cycle.mjs
node scripts/thesis-rails.mjs next --json > /tmp/kukulkan-cycle-next.json
test "$(jq -r .phase /tmp/kukulkan-cycle-next.json)" = ready-for-one-cycle
test "$(jq -r .candidate.task_id /tmp/kukulkan-cycle-next.json)" = "$TASK_ID"
test "$(jq -r .candidate.source_fingerprint /tmp/kukulkan-cycle-next.json)" = "$TASK_FINGERPRINT"
test "$(jq -r .candidate.character /tmp/kukulkan-cycle-next.json)" = Kukulkan
test "$(jq -r .candidate.performer /tmp/kukulkan-cycle-next.json)" = 'James Doohan'

rm -rf /tmp/kukulkan-probe-receipt /tmp/kukulkan-preparation /tmp/kukulkan-controller-sealed /tmp/kukulkan-controller-exec
rm -f /tmp/kukulkan-probe-receipt.zip /tmp/kukulkan-preparation.zip /tmp/kukulkan-controller.zip
mkdir -p /tmp/kukulkan-probe-receipt /tmp/kukulkan-preparation /tmp/kukulkan-controller-sealed

probe_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${PROBE_RECEIPT_ARTIFACT}")"
test "$(jq -r .expired <<<"$probe_meta")" = false
test "$(jq -r .name <<<"$probe_meta")" = star-trek-kukulkan-probe-v6
test "$(jq -r .workflow_run.id <<<"$probe_meta")" = "$PROBE_RUN"
test "$(jq -r .digest <<<"$probe_meta")" = "sha256:${PROBE_RECEIPT_ARTIFACT_SHA}"
gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${PROBE_RECEIPT_ARTIFACT}/zip" > /tmp/kukulkan-probe-receipt.zip
echo "$PROBE_RECEIPT_ARTIFACT_SHA  /tmp/kukulkan-probe-receipt.zip" | sha256sum -c -
unzip -q /tmp/kukulkan-probe-receipt.zip -d /tmp/kukulkan-probe-receipt
jq -e --arg parent "$EXPECTED_MAIN" --arg task "$TASK_ID" --arg fingerprint "$TASK_FINGERPRINT" --arg source "$SOURCE_RECEIPT_SHA" --arg facets "$FACETS_SHA" --arg manifest "$SEALED_CONTROLLER_MANIFEST_SHA" '.status == "success" and .canonical_parent == $parent and .task_id == $task and .source_fingerprint == $fingerprint and .source_receipt_sha256 == $source and .facets_sha256 == $facets and .controller_manifest_sha256 == $manifest and .canonical_mutation == false and .lease_taken == false' /tmp/kukulkan-probe-receipt/kukulkan-probe-v2.json >/dev/null

media_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${MEDIA_PREP_ARTIFACT}")"
test "$(jq -r .expired <<<"$media_meta")" = false
test "$(jq -r .name <<<"$media_meta")" = star-trek-kukulkan-media-v6
test "$(jq -r .workflow_run.id <<<"$media_meta")" = "$MEDIA_PREP_RUN"
test "$(jq -r .digest <<<"$media_meta")" = "sha256:${MEDIA_PREP_ARTIFACT_SHA}"
gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${MEDIA_PREP_ARTIFACT}/zip" > /tmp/kukulkan-preparation.zip
echo "$MEDIA_PREP_ARTIFACT_SHA  /tmp/kukulkan-preparation.zip" | sha256sum -c -
unzip -q /tmp/kukulkan-preparation.zip -d /tmp/kukulkan-preparation
jq -e --arg parent "$EXPECTED_MAIN" --arg task "$TASK_ID" --arg wall "$WALL_ID" --arg source "$SOURCE_RECEIPT_SHA" --arg facets "$FACETS_SHA" '.canonical_parent == $parent and .task_id == $task and .wall_id == $wall and .source_receipt_sha256 == $source and .facets_sha256 == $facets and .maker_attribution == "unresolved" and .media_review.verdict == "pass" and .byte_collision == false and .source_collision == false and .cross_facet_substitution == false' /tmp/kukulkan-preparation/media-preparation.json >/dev/null

controller_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${CONTROLLER_ARTIFACT}")"
test "$(jq -r .expired <<<"$controller_meta")" = false
test "$(jq -r .name <<<"$controller_meta")" = star-trek-kukulkan-controller-source-v6
test "$(jq -r .workflow_run.id <<<"$controller_meta")" = "$PROBE_RUN"
test "$(jq -r .digest <<<"$controller_meta")" = "sha256:${CONTROLLER_ARTIFACT_SHA}"
gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${CONTROLLER_ARTIFACT}/zip" > /tmp/kukulkan-controller.zip
echo "$CONTROLLER_ARTIFACT_SHA  /tmp/kukulkan-controller.zip" | sha256sum -c -
unzip -q /tmp/kukulkan-controller.zip -d /tmp/kukulkan-controller-sealed
test "$(sha256sum /tmp/kukulkan-controller-sealed/controller-source-manifest.json | cut -d' ' -f1)" = "$SEALED_CONTROLLER_MANIFEST_SHA"

python3 - <<'PY'
from pathlib import Path
import hashlib, json
root=Path('/tmp/kukulkan-controller-sealed')
manifest=json.loads((root/'controller-source-manifest.json').read_text())
if manifest.get('canonical_parent') != 'af8c0891b38275889bc90ca76af763ce6dd9b59c': raise SystemExit('sealed controller parent drifted')
if manifest.get('task_id') != 'ap_8aa8780eda59987cb5a1de36': raise SystemExit('sealed controller task drifted')
if manifest.get('source_receipt_identity') != '8bd855653a81825dafe71625d0efd5bae08f6cffe69f72e68dce145f541c6fef': raise SystemExit('sealed controller source identity drifted')
for row in manifest.get('files', []):
    path=root/'programs'/row['file']
    if path.stat().st_size != row['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
        raise SystemExit(f'sealed controller program drifted: {path.name}')
PY

cp -a /tmp/kukulkan-controller-sealed /tmp/kukulkan-controller-exec
python3 /tmp/kukulkan-cycle-controller-rebind-v1.py /tmp/kukulkan-controller-exec /tmp/kukulkan-preparation
chmod +x /tmp/kukulkan-controller-exec/programs/*
bash -n /tmp/kukulkan-controller-exec/programs/unitkukulkan-controller.sh
node --check /tmp/kukulkan-controller-exec/programs/unitkukulkan-stage.mjs
node --check /tmp/kukulkan-controller-exec/programs/unitkukulkan-review.mjs
node --check /tmp/kukulkan-controller-exec/programs/unitkukulkan-prior-phase.mjs
node --check /tmp/kukulkan-controller-exec/programs/unitkukulkan-finalize.mjs

python3 - <<'PY'
from pathlib import Path
import hashlib, json
root=Path('/tmp/kukulkan-controller-exec')
manifest=json.loads((root/'controller-source-manifest.json').read_text())
if manifest.get('execution_rebinding', {}).get('status') != 'applied': raise SystemExit('execution rebinding receipt missing')
for row in manifest.get('files', []):
    path=root/'programs'/row['file']
    if path.stat().st_size != row['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
        raise SystemExit(f'execution controller program drifted: {path.name}')
PY

ln -sfn /tmp/kukulkan-controller-exec/programs /tmp/unitkukulkan-programs
rm -rf /tmp/unitkukulkan-cycle-preflight
mkdir -p /tmp/unitkukulkan-cycle-preflight
cp /tmp/kukulkan-probe-receipt/kukulkan-probe-v2.json /tmp/unitkukulkan-cycle-preflight/
cp /tmp/kukulkan-controller-sealed/controller-source-manifest.json /tmp/unitkukulkan-cycle-preflight/sealed-controller-source-manifest.json
cp /tmp/kukulkan-controller-exec/controller-source-manifest.json /tmp/unitkukulkan-cycle-preflight/execution-controller-source-manifest.json
cp /tmp/kukulkan-controller-exec/execution-controller-rebinding.json /tmp/unitkukulkan-cycle-preflight/
cp /tmp/kukulkan-cycle-next.json /tmp/unitkukulkan-cycle-preflight/thesis-next.json
