#!/usr/bin/env bash
set -euo pipefail

test -n "$PRODUCT_COMMIT"
test -n "$EXECUTION_ARTIFACT"
test -n "$EXECUTION_DIGEST"
test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$PRODUCT_COMMIT"

execution_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${EXECUTION_ARTIFACT}")"
test "$(jq -r .expired <<<"$execution_meta")" = false
test "$(jq -r .name <<<"$execution_meta")" = star-trek-kukulkan-cycle-execution-v1
test "$(jq -r .workflow_run.id <<<"$execution_meta")" = "$GITHUB_RUN_ID"
test "$(jq -r .digest <<<"$execution_meta")" = "sha256:${EXECUTION_DIGEST#sha256:}"

rm -rf /tmp/unitkukulkan-cleanup
mkdir -p /tmp/unitkukulkan-cleanup
git ls-remote --heads origin 'refs/heads/agent/star-trek-kukulkan*' \
  | cut -f2 \
  | sed 's#^refs/heads/##' \
  | LC_ALL=C sort -u \
  > /tmp/unitkukulkan-cleanup/deleted-refs.txt

while IFS= read -r branch; do
  test -n "$branch" || continue
  git push origin --delete "$branch"
done < /tmp/unitkukulkan-cleanup/deleted-refs.txt

git ls-remote --heads origin 'refs/heads/agent/star-trek-kukulkan*' \
  | cut -f2 \
  | sed 's#^refs/heads/##' \
  | LC_ALL=C sort -u \
  > /tmp/unitkukulkan-cleanup/remaining-refs.txt
test ! -s /tmp/unitkukulkan-cleanup/remaining-refs.txt
test "$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main" --jq .sha)" = "$PRODUCT_COMMIT"

deleted_count="$(grep -c . /tmp/unitkukulkan-cleanup/deleted-refs.txt || true)"
jq -n \
  --argjson version 1 \
  --arg transaction STAR-TREK-KUKULKAN-CLEANUP-V1 \
  --arg status success \
  --arg product_commit "$PRODUCT_COMMIT" \
  --argjson workflow_run "$GITHUB_RUN_ID" \
  --argjson execution_artifact "$EXECUTION_ARTIFACT" \
  --arg execution_sha256 "${EXECUTION_DIGEST#sha256:}" \
  --argjson deleted_ref_count "$deleted_count" \
  '{version:$version,transaction:$transaction,status:$status,product_commit:$product_commit,workflow_run:$workflow_run,execution_artifact:$execution_artifact,execution_sha256:$execution_sha256,deleted_ref_count:$deleted_ref_count,remaining_ref_count:0}' \
  > /tmp/unitkukulkan-cleanup/cleanup.json
