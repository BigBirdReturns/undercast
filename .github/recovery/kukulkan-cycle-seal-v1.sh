#!/usr/bin/env bash
set -euo pipefail

test -n "$PRODUCT_COMMIT"
test -n "$PRODUCT_TREE"
test -n "$PAGES_RUN"
live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$PRODUCT_COMMIT"
test "$(jq -r .commit.tree.sha <<<"$live")" = "$PRODUCT_TREE"
test "$(jq -r '.parents | length' <<<"$live")" = 1
test "$(jq -r .parents[0].sha <<<"$live")" = "$EXPECTED_MAIN"
test "$(jq -r .commit.message <<<"$live")" = 'Star Trek: publish Kukulkan cycle'
test "$CANDIDATE_COMMIT" != "$PRODUCT_COMMIT"
test "$CANDIDATE_TREE" = "$PRODUCT_TREE"

git fetch --filter=blob:none --no-tags origin main
test "$(git rev-parse FETCH_HEAD)" = "$PRODUCT_COMMIT"
git checkout --detach "$PRODUCT_COMMIT"
node scripts/star-trek-kukulkan-cycle.mjs
node scripts/star-trek-kol-tai-cycle.mjs
node scripts/thesis-rails.mjs validate
node scripts/media-audit.mjs gate --scope star-trek
node scripts/waterline.mjs validate
node scripts/corpus-ops.mjs validate

pages="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${PAGES_RUN}")"
test "$(jq -r .status <<<"$pages")" = completed
test "$(jq -r .conclusion <<<"$pages")" = success
test "$(jq -r .head_sha <<<"$pages")" = "$PRODUCT_COMMIT"

rm -rf /tmp/unitkukulkan-cycle-execution
mkdir -p /tmp/unitkukulkan-cycle-execution
cp data/review/adapter-sdk/star-trek-kukulkan-cycle.json /tmp/unitkukulkan-cycle-execution/
cp scripts/star-trek-kukulkan-cycle.mjs /tmp/unitkukulkan-cycle-execution/
cp /tmp/kukulkan-probe-receipt/kukulkan-probe-v2.json /tmp/unitkukulkan-cycle-execution/
cp /tmp/kukulkan-controller-exec/controller-source-manifest.json /tmp/unitkukulkan-cycle-execution/execution-controller-source-manifest.json
cp /tmp/kukulkan-controller-exec/execution-controller-rebinding.json /tmp/unitkukulkan-cycle-execution/
cp /tmp/unitkukulkan-final-product-receipt/publication.txt /tmp/unitkukulkan-cycle-execution/
cp /tmp/unitkukulkan-final-product-receipt/thesis-status.json /tmp/unitkukulkan-cycle-execution/
cp /tmp/unitkukulkan-final-product-receipt/thesis-next.json /tmp/unitkukulkan-cycle-execution/

jq -n \
  --argjson version 1 \
  --arg transaction STAR-TREK-KUKULKAN-CYCLE-EXECUTION-V1 \
  --arg status success \
  --argjson workflow_run "$GITHUB_RUN_ID" \
  --arg workflow_head "$GITHUB_SHA" \
  --arg canonical_parent "$EXPECTED_MAIN" \
  --arg task_id "$TASK_ID" \
  --arg source_fingerprint "$TASK_FINGERPRINT" \
  --arg wall_id "$WALL_ID" \
  --arg product_commit "$PRODUCT_COMMIT" \
  --arg product_tree "$PRODUCT_TREE" \
  --arg candidate_commit "$CANDIDATE_COMMIT" \
  --arg candidate_tree "$CANDIDATE_TREE" \
  --argjson pages_run "$PAGES_RUN" \
  --argjson probe_run "$PROBE_RUN" \
  --argjson probe_receipt_artifact "$PROBE_RECEIPT_ARTIFACT" \
  --arg probe_receipt_sha256 "$PROBE_RECEIPT_ARTIFACT_SHA" \
  --argjson media_artifact "$MEDIA_PREP_ARTIFACT" \
  --arg media_sha256 "$MEDIA_PREP_ARTIFACT_SHA" \
  --argjson sealed_controller_artifact "$CONTROLLER_ARTIFACT" \
  --arg sealed_controller_sha256 "$CONTROLLER_ARTIFACT_SHA" \
  --argjson execution_controller_artifact "$CONTROLLER_EXECUTION_ARTIFACT" \
  --arg execution_controller_sha256 "${CONTROLLER_EXECUTION_DIGEST#sha256:}" \
  --argjson candidate_artifact "$CANDIDATE_ARTIFACT" \
  --arg candidate_sha256 "${CANDIDATE_DIGEST#sha256:}" \
  --argjson review_artifact "$REVIEW_ARTIFACT" \
  --arg review_sha256 "${REVIEW_DIGEST#sha256:}" \
  --argjson final_receipt_artifact "$FINAL_RECEIPT_ARTIFACT" \
  --arg final_receipt_sha256 "${FINAL_RECEIPT_DIGEST#sha256:}" \
  '{version:$version,transaction:$transaction,status:$status,workflow_run:$workflow_run,workflow_head:$workflow_head,canonical_parent:$canonical_parent,task_id:$task_id,source_fingerprint:$source_fingerprint,wall_id:$wall_id,product:{commit:$product_commit,tree:$product_tree,parent:$canonical_parent,pages_run:$pages_run},candidate:{commit:$candidate_commit,tree:$candidate_tree},probe:{run:$probe_run,receipt_artifact:$probe_receipt_artifact,receipt_sha256:$probe_receipt_sha256,media_artifact:$media_artifact,media_sha256:$media_sha256,sealed_controller_artifact:$sealed_controller_artifact,sealed_controller_sha256:$sealed_controller_sha256},artifacts:{execution_controller:{id:$execution_controller_artifact,sha256:$execution_controller_sha256},candidate:{id:$candidate_artifact,sha256:$candidate_sha256},independent_review:{id:$review_artifact,sha256:$review_sha256},final_product_receipt:{id:$final_receipt_artifact,sha256:$final_receipt_sha256}}}' \
  > /tmp/unitkukulkan-cycle-execution/execution.json
sha256sum /tmp/unitkukulkan-cycle-execution/* > /tmp/unitkukulkan-cycle-execution/manifest.sha256
printf 'product_commit=%s\n' "$PRODUCT_COMMIT" >> "$GITHUB_OUTPUT"
