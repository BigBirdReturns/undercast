#!/usr/bin/env bash
set -Eeuo pipefail
rm -rf "$REVIEW_ROOT"
mkdir -p "$REVIEW_ROOT"
live="$(gh api "/repos/${GITHUB_REPOSITORY}/commits/main")"
test "$(jq -r .sha <<<"$live")" = "$EXPECTED_MAIN"
test "$(git ls-remote origin "refs/heads/${CANDIDATE_BRANCH}" | cut -f1)" = "$CANDIDATE_COMMIT"
git fetch --filter=blob:none --no-tags origin main "$CANDIDATE_BRANCH"
test "$(git rev-parse "refs/remotes/origin/${CANDIDATE_BRANCH}")" = "$CANDIDATE_COMMIT"
git checkout --detach "$CANDIDATE_COMMIT"
test "$(git rev-parse HEAD^{tree})" = "$CANDIDATE_TREE"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
git diff --name-only "$EXPECTED_MAIN"..HEAD | LC_ALL=C sort -u > /tmp/review-live-paths.txt
cmp /tmp/review-live-paths.txt "$STAGE_ROOT/candidate-paths.txt"
test "$(wc -l < /tmp/review-live-paths.txt | tr -d ' ')" = "$CANDIDATE_PATH_COUNT"
test "$(sha256sum /tmp/review-live-paths.txt | cut -d' ' -f1)" = "$CANDIDATE_PATH_LEDGER_SHA256"
test -z "$(grep -E '^(\.github/|transport/)' /tmp/review-live-paths.txt || true)"
(cd "$STAGE_ROOT" && sha256sum -c manifest.sha256)
npm ci --ignore-scripts
STAGE_ROOT="$STAGE_ROOT" REVIEW_ROOT="$REVIEW_ROOT" EXPECTED_MAIN="$EXPECTED_MAIN" \
  CANDIDATE_COMMIT="$CANDIDATE_COMMIT" CANDIDATE_TREE="$CANDIDATE_TREE" \
  CANDIDATE_PATH_COUNT="$CANDIDATE_PATH_COUNT" CANDIDATE_PATH_LEDGER_SHA256="$CANDIDATE_PATH_LEDGER_SHA256" \
  node /tmp/star-trek-maryl-cycle-v1.mjs review | tee "$REVIEW_ROOT/review.stdout.log"
review_sha256="$(jq -r .review_sha256 "$REVIEW_ROOT/independent-review.json")"
echo "review_sha256=$review_sha256" >> "$GITHUB_OUTPUT"
(cd "$REVIEW_ROOT" && find . -maxdepth 1 -type f ! -name manifest.sha256 -printf '%P\n' | LC_ALL=C sort | while read -r file; do sha256sum "$file"; done > manifest.sha256)
