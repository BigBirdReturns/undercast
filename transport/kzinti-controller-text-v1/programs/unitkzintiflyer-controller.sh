#!/usr/bin/env bash
set -euo pipefail

export EXPECTED_MAIN="${EXPECTED_MAIN:-0fbf773eed3c59a51070d19bdf779dcd5327295f}"
export CANONICAL_PARENT="${CANONICAL_PARENT:-$EXPECTED_MAIN}"
export CANDIDATE_BRANCH="${CANDIDATE_BRANCH:-agent/star-trek-kzinti-flyer-candidate-v1}"
export MEDIA_PREP_RUN="${MEDIA_PREP_RUN:-32405396858}"
export MEDIA_PREP_JOB="${MEDIA_PREP_JOB:-96543234608}"
export MEDIA_PREP_ARTIFACT="${MEDIA_PREP_ARTIFACT:-9420091600}"
export MEDIA_PREP_ARTIFACT_SHA="${MEDIA_PREP_ARTIFACT_SHA:-3ac10fcf6208f9815e9293563426e31321cebc8e1e35401af96d0f3dcf14b265}"

stage() {
  set -euo pipefail
  test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_MAIN"
  git fetch --filter=blob:none --no-tags origin main
  git checkout --detach "$EXPECTED_MAIN"
  npm ci

  media_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${MEDIA_PREP_RUN}/artifacts")"
  test "$(jq -r --argjson id "$MEDIA_PREP_ARTIFACT" '[.artifacts[] | select(.id==$id)] | length' <<<"$media_meta")" = "1"
  test "$(jq -r --argjson id "$MEDIA_PREP_ARTIFACT" '.artifacts[] | select(.id==$id) | .name' <<<"$media_meta")" = "star-trek-kzinti-flyer-probe-v1"
  test "$(jq -r --argjson id "$MEDIA_PREP_ARTIFACT" '.artifacts[] | select(.id==$id) | .digest' <<<"$media_meta")" = "sha256:${MEDIA_PREP_ARTIFACT_SHA}"
  rm -rf /tmp/unitkzintiflyer-media
  mkdir -p /tmp/unitkzintiflyer-media
  gh run download "$MEDIA_PREP_RUN" -n star-trek-kzinti-flyer-probe-v1 -D /tmp/unitkzintiflyer-media
  jq -s '.' /tmp/unitkzintiflyer-media/source-receipt.json > /tmp/unitkzintiflyer-media/episode-receipts.json
  cp /tmp/unitkzintiflyer-media/source-receipt.json /tmp/unitkzintiflyer-media/source-ledger.json
  cp /tmp/unitkzintiflyer-media/media-preparation.json /tmp/unitkzintiflyer-media/media-review.json

  node /tmp/unitkzintiflyer-programs/unitkzintiflyer-stage.mjs /tmp/unitkzintiflyer-media /tmp/unitkzintiflyer-stage.json | tee /tmp/unitkzintiflyer-stage.log
  git diff --check
  test -z "$(git status --short | awk '$2 ~ /^\.github\// {print}')"

  git config user.name "undercast-star-trek-kzinti-flyer-candidate"
  git config user.email "star-trek-kzinti-flyer-candidate@users.noreply.github.com"
  git add -A
  git commit -m "Star Trek: stage Kzinti Flyer candidate"
  candidate_commit="$(git rev-parse HEAD)"
  candidate_tree="$(git rev-parse HEAD^{tree})"
  test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
  test "$(git rev-list --count "$EXPECTED_MAIN"..HEAD)" = "1"
  test -z "$(git rev-list --merges "$EXPECTED_MAIN"..HEAD)"
  git diff --name-only "$EXPECTED_MAIN"..HEAD | LC_ALL=C sort -u > /tmp/unitkzintiflyer-candidate-paths.txt
  test -z "$(grep '^\.github/' /tmp/unitkzintiflyer-candidate-paths.txt || true)"
  test -z "$(grep '^scripts/\.unitkzintiflyer-' /tmp/unitkzintiflyer-candidate-paths.txt || true)"
  path_count="$(wc -l < /tmp/unitkzintiflyer-candidate-paths.txt | tr -d ' ')"
  path_sha256="$(sha256sum /tmp/unitkzintiflyer-candidate-paths.txt | cut -d' ' -f1)"

  cat > /tmp/unitkzintiflyer-candidate-metadata.json <<JSON
{
  "version": 1,
  "canonical_parent": "$EXPECTED_MAIN",
  "candidate_commit": "$candidate_commit",
  "candidate_tree": "$candidate_tree",
  "candidate_path_count": $path_count,
  "candidate_path_ledger_sha256": "$path_sha256"
}
JSON

  git push --force origin "HEAD:refs/heads/${CANDIDATE_BRANCH}"
  test "$(git ls-remote origin "refs/heads/${CANDIDATE_BRANCH}" | cut -f1)" = "$candidate_commit"

  rm -rf /tmp/unitkzintiflyer-candidate-artifact
  mkdir -p /tmp/unitkzintiflyer-candidate-artifact
  cp /tmp/unitkzintiflyer-candidate-metadata.json /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json
  cp /tmp/unitkzintiflyer-stage.json /tmp/unitkzintiflyer-candidate-artifact/stage.json
  cp /tmp/unitkzintiflyer-stage.log /tmp/unitkzintiflyer-candidate-artifact/stage.log
  cp /tmp/unitkzintiflyer-candidate-paths.txt /tmp/unitkzintiflyer-candidate-artifact/candidate-paths.txt
  cp /tmp/unitkzintiflyer-media/media-preparation.json /tmp/unitkzintiflyer-candidate-artifact/media-preparation.json
  cp /tmp/unitkzintiflyer-media/source-receipt.json /tmp/unitkzintiflyer-candidate-artifact/source-receipt.json
  cp /tmp/unitkzintiflyer-media/episode-receipts.json /tmp/unitkzintiflyer-candidate-artifact/episode-receipts.json
  cp /tmp/unitkzintiflyer-media/source-ledger.json /tmp/unitkzintiflyer-candidate-artifact/source-ledger.json
  cp /tmp/unitkzintiflyer-media/media-review.json /tmp/unitkzintiflyer-candidate-artifact/media-review.json
  printf '%s\n' "$candidate_commit" > /tmp/unitkzintiflyer-candidate-artifact/candidate-commit.txt
  printf '%s\n' "$candidate_tree" > /tmp/unitkzintiflyer-candidate-artifact/candidate-tree.txt

  printf 'commit=%s\n' "$candidate_commit" >> "$GITHUB_OUTPUT"
  printf 'tree=%s\n' "$candidate_tree" >> "$GITHUB_OUTPUT"
  printf 'path_count=%s\n' "$path_count" >> "$GITHUB_OUTPUT"
  printf 'path_sha256=%s\n' "$path_sha256" >> "$GITHUB_OUTPUT"
}

review() {
  set -euo pipefail
  artifact_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100")"
  test "$(jq -r '[.artifacts[] | select(.name=="star-trek-kzinti-flyer-candidate-product-v1")] | length' <<<"$artifact_meta")" = "1"
  candidate_artifact="$(jq -r '.artifacts[] | select(.name=="star-trek-kzinti-flyer-candidate-product-v1") | .id' <<<"$artifact_meta")"
  candidate_digest="$(jq -r '.artifacts[] | select(.name=="star-trek-kzinti-flyer-candidate-product-v1") | .digest' <<<"$artifact_meta")"
  test "$candidate_artifact" -gt 0
  test "${candidate_digest#sha256:}" != "$candidate_digest"

  candidate_commit="$(jq -r '.candidate_commit' /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json)"
  candidate_tree="$(jq -r '.candidate_tree' /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json)"
  git fetch --filter=blob:none --no-tags --depth=2 origin "$CANDIDATE_BRANCH"
  test "$(git rev-parse FETCH_HEAD)" = "$candidate_commit"
  git checkout --detach "$candidate_commit"
  test "$(git rev-parse HEAD^{tree})" = "$candidate_tree"
  test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
  npm ci

  node /tmp/unitkzintiflyer-programs/unitkzintiflyer-review.mjs \
    /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json \
    /tmp/unitkzintiflyer-candidate-artifact/stage.json \
    /tmp/star-trek-kzinti-flyer-independent-review-v1.json | tee /tmp/star-trek-kzinti-flyer-independent-review-v1.log
  test -z "$(git status --porcelain)"

  rm -rf /tmp/unitkzintiflyer-review-artifact
  mkdir -p /tmp/unitkzintiflyer-review-artifact
  cp /tmp/star-trek-kzinti-flyer-independent-review-v1.json /tmp/unitkzintiflyer-review-artifact/independent-review.json
  cp /tmp/star-trek-kzinti-flyer-independent-review-v1.log /tmp/unitkzintiflyer-review-artifact/independent-review.log
  printf '%s\n' "$candidate_artifact" > /tmp/unitkzintiflyer-review-artifact/candidate-artifact-id.txt
  printf '%s\n' "$candidate_digest" > /tmp/unitkzintiflyer-review-artifact/candidate-artifact-digest.txt
}

publish() {
  set -euo pipefail
  test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_MAIN"
  git fetch --filter=blob:none --no-tags origin main
  candidate_commit="$(jq -r '.candidate_commit' /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json)"
  candidate_tree="$(jq -r '.candidate_tree' /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json)"
  git fetch --filter=blob:none --no-tags --depth=2 origin "$CANDIDATE_BRANCH"
  test "$(git rev-parse FETCH_HEAD)" = "$candidate_commit"
  git checkout --detach "$candidate_commit"
  test "$(git rev-parse HEAD^{tree})" = "$candidate_tree"
  test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
  npm ci

  jobs_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100")"
  publication_job="$(jq -r '[.jobs[] | select(.name=="publish" or .name=="unitkzintiflyer-cycle")] | if length>=1 then .[0].id else empty end' <<<"$jobs_meta")"
  test "$publication_job" -gt 0
  if test -f "${ROOT:-}/candidate-result.json"; then
    candidate_artifact="$(jq -r '.candidate.artifact.id' "${ROOT}/candidate-result.json")"; candidate_sha="$(jq -r '.candidate.artifact.sha256' "${ROOT}/candidate-result.json")"
    review_artifact="$(jq -r '.independent_review.artifact.id' "${ROOT}/candidate-result.json")"; review_sha="$(jq -r '.independent_review.artifact.sha256' "${ROOT}/candidate-result.json")"
    candidate_run="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${candidate_artifact}" --jq .workflow_run.id)"
    candidate_jobs="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${candidate_run}/jobs?per_page=100")"
    candidate_job="$(jq -r '[.jobs[] | select(.name=="candidate" or .name=="unitkzintiflyer-cycle")] | if length>=1 then .[0].id else empty end' <<<"$candidate_jobs")"; review_job="$candidate_job"
  else
    artifact_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100")"
    candidate_artifact="$(jq -r '[.artifacts[] | select(.name=="star-trek-kzinti-flyer-candidate-product-v1")][0].id' <<<"$artifact_meta")"; candidate_digest="$(jq -r '[.artifacts[] | select(.name=="star-trek-kzinti-flyer-candidate-product-v1")][0].digest' <<<"$artifact_meta")"
    review_artifact="$(jq -r '[.artifacts[] | select(.name=="star-trek-kzinti-flyer-independent-review-v1")][0].id' <<<"$artifact_meta")"; review_digest="$(jq -r '[.artifacts[] | select(.name=="star-trek-kzinti-flyer-independent-review-v1")][0].digest' <<<"$artifact_meta")"
    candidate_sha="${candidate_digest#sha256:}"; review_sha="${review_digest#sha256:}"; candidate_job="$publication_job"; review_job="$publication_job"
  fi
  test "$candidate_artifact" -gt 0; test "$review_artifact" -gt 0; test "$candidate_job" -gt 0; test "$review_job" -gt 0; test -n "$candidate_sha"; test -n "$review_sha"

  cat > /tmp/unitkzintiflyer-execution.json <<JSON
{
  "workflow_run": ${GITHUB_RUN_ID},
  "candidate_job": ${candidate_job},
  "candidate_artifact": ${candidate_artifact},
  "candidate_artifact_sha256": "${candidate_sha}",
  "independent_review_job": ${review_job},
  "independent_review_artifact": ${review_artifact},
  "independent_review_artifact_sha256": "${review_sha}",
  "publication_job": ${publication_job},
  "media_preparation_run": ${MEDIA_PREP_RUN},
  "media_preparation_job": ${MEDIA_PREP_JOB},
  "media_preparation_artifact": ${MEDIA_PREP_ARTIFACT},
  "media_preparation_artifact_sha256": "${MEDIA_PREP_ARTIFACT_SHA}"
}
JSON

  node /tmp/unitkzintiflyer-programs/unitkzintiflyer-finalize.mjs \
    /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json \
    /tmp/unitkzintiflyer-candidate-artifact/stage.json \
    /tmp/unitkzintiflyer-review-artifact/independent-review.json \
    /tmp/unitkzintiflyer-execution.json \
    /tmp/unitkzintiflyer-finalize.json | tee /tmp/unitkzintiflyer-finalize.log

  git diff --check
  git config user.name "undercast-star-trek-kzinti-flyer-publisher"
  git config user.email "star-trek-kzinti-flyer-publisher@users.noreply.github.com"
  git reset --soft "$EXPECTED_MAIN"
  git add -A
  git commit -m "Star Trek: publish Kzinti Flyer cycle"
  product_commit="$(git rev-parse HEAD)"
  product_tree="$(git rev-parse HEAD^{tree})"
  test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
  test "$(git rev-list --count "$EXPECTED_MAIN"..HEAD)" = "1"
  test -z "$(git rev-list --merges "$EXPECTED_MAIN"..HEAD)"
  git diff --name-only "$EXPECTED_MAIN"..HEAD | LC_ALL=C sort -u > /tmp/unitkzintiflyer-product-paths.txt
  test -z "$(grep '^\.github/' /tmp/unitkzintiflyer-product-paths.txt || true)"
  test -z "$(grep '^scripts/\.unitkzintiflyer-' /tmp/unitkzintiflyer-product-paths.txt || true)"
  test "$(grep -c '^data/review/adapter-sdk/star-trek-kzinti-flyer-cycle.json$' /tmp/unitkzintiflyer-product-paths.txt)" = "1"
  test "$(grep -c '^scripts/star-trek-kzinti-flyer-cycle.mjs$' /tmp/unitkzintiflyer-product-paths.txt)" = "1"
  test "$(grep -c '^scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs$' /tmp/unitkzintiflyer-product-paths.txt)" = "1"
  test "$(grep -c '^package.json$' /tmp/unitkzintiflyer-product-paths.txt)" = "1"
  test "$(grep -c '^images/uc-1391-still.webp$' /tmp/unitkzintiflyer-product-paths.txt)" = "1"
  test "$(grep -c '^images/uc-1391-portrait.jpg$' /tmp/unitkzintiflyer-product-paths.txt)" = "1"

  cat > /tmp/collection-event.json <<'JSON'
{
  "pull_request": {
    "labels": [],
    "body": "Terminal-Product: canonical card UC-1391, exact Kzinti Flyer voice performance and media closure, reviewed Star Trek waterline receipt, permanent route, and Lwaxana eligibility-rejection custody.\n\nThe transaction adds one rail-selected performer-role card, an exact role-specific character still and a separately sourced performer portrait, voice-only adjudication of the broad voice-animation hint, one independent exact-product review, and one receipt-bearing finalizer. James Doohan’s documented Kzinti Flyer voice performance remains distinct from Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem, the exact Kzinti Flyer role still, and animation, physical performance, design, direction, editing, post-production sound processing, production-shop, vocal-transformation, and other maker labor that the frozen evidence does not name."
  }
}
JSON
  node scripts/corpus-ops.mjs check-pr --base "$EXPECTED_MAIN" --event /tmp/collection-event.json --json
  node scripts/thesis-rails.mjs check-pr --base "$EXPECTED_MAIN" --event /tmp/collection-event.json
  node scripts/star-trek-kzinti-flyer-cycle.mjs
  test "$(sha256sum data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json | cut -d' ' -f1)" = "b7e3be2cb3639f04e3decd11d5ef3ca0d516bbf992305222e84d37332daf65fe"
  test "$(sha256sum scripts/star-trek-lwaxana-eligibility-rejection.mjs | cut -d' ' -f1)" = "b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947"
  jq -e '.receipt_sha256 == "172f506624b13c6bdeb97bd8f1d5982afa15883e17a5a74b24dfe4495de5f0b2" and .adjudication.classification == "ineligible / no card" and .adjudication.card_created == false and .boundary.character_card_created == false and .next_deterministic_obligation.candidate.task_id == "ap_8f2b1b123aa02bbbb27d00b4" and .next_deterministic_obligation.candidate.source_fingerprint == "a40931e9803dfd032ef0889b9110f6842945029ba04858cd7dc83375e28504ee"' data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json >/dev/null
  node scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs
  node scripts/thesis-rails.mjs validate
  node scripts/media-audit.mjs gate --scope star-trek
  node scripts/waterline.mjs validate
  node scripts/corpus-ops.mjs validate
  node scripts/validate.mjs
  node scripts/gate.mjs --skip-rendered

  npx playwright install --with-deps chromium
  npm run test:rendered
  npm run test:ux:chromium
  node scripts/site-sweep.mjs
  test -z "$(git status --porcelain)"

  test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_MAIN"
  git push origin "HEAD:refs/heads/main"
  for attempt in $(seq 1 20); do
    observed="$(git ls-remote origin refs/heads/main | cut -f1)"
    if [ "$observed" = "$product_commit" ]; then break; fi
    sleep 2
  done
  test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$product_commit"

  gh workflow run pages.yml --ref main
  pages_run=""
  for attempt in $(seq 1 40); do
    pages_runs="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/workflows/pages.yml/runs?event=workflow_dispatch&branch=main&per_page=30")"
    pages_run="$(jq -r --arg sha "$product_commit" '[.workflow_runs[] | select(.head_sha==$sha and .event=="workflow_dispatch")] | sort_by(.created_at) | last | .id // empty' <<<"$pages_runs")"
    if [[ "$pages_run" =~ ^[0-9]+$ ]]; then break; fi
    sleep 2
  done
  [[ "$pages_run" =~ ^[0-9]+$ ]]
  pages_conclusion=""
  pages_result=""
  for attempt in $(seq 1 120); do
    pages_result="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${pages_run}")"
    pages_status="$(jq -r '.status' <<<"$pages_result")"
    if [ "$pages_status" = "completed" ]; then
      pages_conclusion="$(jq -r '.conclusion' <<<"$pages_result")"
      break
    fi
    sleep 5
  done
  test "$pages_conclusion" = "success"
  test "$(jq -r '.head_sha' <<<"$pages_result")" = "$product_commit"

  rm -rf /tmp/unitkzintiflyer-final-product-receipt
  mkdir -p /tmp/unitkzintiflyer-final-product-receipt
  cp data/review/adapter-sdk/star-trek-kzinti-flyer-cycle.json /tmp/unitkzintiflyer-final-product-receipt/
  cp scripts/star-trek-kzinti-flyer-cycle.mjs /tmp/unitkzintiflyer-final-product-receipt/
  cp data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json /tmp/unitkzintiflyer-final-product-receipt/
  cp scripts/star-trek-lwaxana-eligibility-rejection.mjs /tmp/unitkzintiflyer-final-product-receipt/
  cp scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-candidate-artifact/candidate-metadata.json /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-candidate-artifact/stage.json /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-review-artifact/independent-review.json /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-execution.json /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-finalize.json /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-finalize.log /tmp/unitkzintiflyer-final-product-receipt/
  cp /tmp/unitkzintiflyer-product-paths.txt /tmp/unitkzintiflyer-final-product-receipt/product-paths.txt
  cp /tmp/unitkzintiflyer-media/media-preparation.json /tmp/unitkzintiflyer-final-product-receipt/media-preparation.json
  cp /tmp/unitkzintiflyer-media/source-receipt.json /tmp/unitkzintiflyer-final-product-receipt/source-receipt.json
  cp /tmp/unitkzintiflyer-media/episode-receipts.json /tmp/unitkzintiflyer-final-product-receipt/episode-receipts.json
  cp /tmp/unitkzintiflyer-media/source-ledger.json /tmp/unitkzintiflyer-final-product-receipt/source-ledger.json
  cp /tmp/unitkzintiflyer-media/media-review.json /tmp/unitkzintiflyer-final-product-receipt/media-review.json
  printf '%s\n' "$product_commit" > /tmp/unitkzintiflyer-final-product-receipt/product-commit.txt
  printf '%s\n' "$product_tree" > /tmp/unitkzintiflyer-final-product-receipt/product-tree.txt
  printf '%s\n' "$pages_run" > /tmp/unitkzintiflyer-final-product-receipt/pages-run.txt
  node scripts/thesis-rails.mjs status --json > /tmp/unitkzintiflyer-final-product-receipt/thesis-status.json
  node scripts/thesis-rails.mjs next --json > /tmp/unitkzintiflyer-final-product-receipt/thesis-next.json
  sha256sum \
    data/review/adapter-sdk/star-trek-kzinti-flyer-cycle.json \
    scripts/star-trek-kzinti-flyer-cycle.mjs \
    data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json \
    scripts/star-trek-lwaxana-eligibility-rejection.mjs \
    scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs \
    images/uc-1391-still.webp \
    images/uc-1391-portrait.jpg \
    > /tmp/unitkzintiflyer-final-product-receipt/key-sha256.txt
  cat > /tmp/unitkzintiflyer-final-product-receipt/publication.txt <<EOF_PUBLICATION
product_commit=${product_commit}
product_tree=${product_tree}
pages_run=${pages_run}
terminal_card=UC-1391 James Doohan as Kzinti Flyer
EOF_PUBLICATION

  printf 'product_commit=%s\n' "$product_commit" >> "$GITHUB_OUTPUT"
  printf 'product_tree=%s\n' "$product_tree" >> "$GITHUB_OUTPUT"
  printf 'pages_run=%s\n' "$pages_run" >> "$GITHUB_OUTPUT"
}

case "${1:-}" in
  stage) stage ;;
  review) review ;;
  publish) publish ;;
  *) echo "usage: $0 stage|review|publish" >&2; exit 2 ;;
esac
