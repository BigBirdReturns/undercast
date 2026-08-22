#!/usr/bin/env bash
set -euo pipefail

stage() {
set -euo pipefail
mkdir -p /tmp/white-rabbit-programs
cat /tmp/white-rabbit-payload.b64 | base64 -d | xz -d | tar -xf - -C /tmp/white-rabbit-programs --strip-components=1
python3 - <<'PY_PATCH'
from pathlib import Path
p=Path('/tmp/white-rabbit-programs/white-rabbit-stage.mjs')
t=p.read_text()
old="{ claim: 'performance', label: 'The White Rabbit source separates James Doohan’s animated voice from William Blackburn’s live-action physical portrayal', publisher: 'Memory Alpha', source: SOURCE },"
new="{ claim: 'performance', label: 'Once Upon a Planet credits James Doohan as the animated White Rabbit, separately from William Blackburn’s live-action physical portrayal', publisher: 'Memory Alpha', source: 'https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)' },"
if t.count(old) != 1:
    raise SystemExit('White Rabbit duplicate performance evidence seam not found exactly once')
p.write_text(t.replace(old,new))
PY_PATCH
test "$(sha256sum /tmp/white-rabbit-programs/white-rabbit-stage.mjs | cut -d' ' -f1)" = "9ad0cf5180deec49659e215600ae3ad397c4e39b14fd7f1f87d3e1384738f3a8"
test "$(sha256sum /tmp/white-rabbit-programs/white-rabbit-review.mjs | cut -d' ' -f1)" = "34ac3e6d29cb86d81a250169921bb08f2e9c15e6161cab3f4a254d4eca5a47c4"
test "$(sha256sum /tmp/white-rabbit-programs/white-rabbit-finalize.mjs | cut -d' ' -f1)" = "944f3652c1c81e3137d946be8af0ded69b5ec4e201ffeab79f80dc6c789a147f"
test "$(sha256sum /tmp/white-rabbit-programs/white-rabbit-prior-phase.mjs | cut -d' ' -f1)" = "3f73eba659fadb27eff90e2642a960d47193471cdc0c56f31b7e06bb0e6a558d"
node --check /tmp/white-rabbit-programs/white-rabbit-stage.mjs
node --check /tmp/white-rabbit-programs/white-rabbit-review.mjs
node --check /tmp/white-rabbit-programs/white-rabbit-finalize.mjs
node --check /tmp/white-rabbit-programs/white-rabbit-prior-phase.mjs
set -euo pipefail
test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_MAIN"
git fetch --filter=blob:none --no-tags origin main
git checkout --detach "$EXPECTED_MAIN"
npm ci

media_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${MEDIA_PREP_RUN}/artifacts")"
test "$(jq -r --argjson id "$MEDIA_PREP_ARTIFACT" '[.artifacts[] | select(.id==$id)] | length' <<<"$media_meta")" = "1"
test "$(jq -r --argjson id "$MEDIA_PREP_ARTIFACT" '.artifacts[] | select(.id==$id) | .name' <<<"$media_meta")" = "star-trek-white-rabbit-media"
test "$(jq -r --argjson id "$MEDIA_PREP_ARTIFACT" '.artifacts[] | select(.id==$id) | .digest' <<<"$media_meta")" = "sha256:${MEDIA_PREP_ARTIFACT_SHA}"
rm -rf /tmp/white-rabbit-media
mkdir -p /tmp/white-rabbit-media
gh run download "$MEDIA_PREP_RUN" -n star-trek-white-rabbit-media -D /tmp/white-rabbit-media
node /tmp/white-rabbit-programs/white-rabbit-stage.mjs /tmp/white-rabbit-media /tmp/white-rabbit-stage.json | tee /tmp/white-rabbit-stage.log
git diff --check
test -z "$(git status --short | awk '$2 ~ /^\.github\// {print}')"

git config user.name "undercast-star-trek-white-rabbit-candidate"
git config user.email "star-trek-white-rabbit-candidate@users.noreply.github.com"
git add -A
git commit -m "Star Trek: stage White Rabbit candidate"
candidate_commit="$(git rev-parse HEAD)"
candidate_tree="$(git rev-parse HEAD^{tree})"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
test "$(git rev-list --count "$EXPECTED_MAIN"..HEAD)" = "1"
test -z "$(git rev-list --merges "$EXPECTED_MAIN"..HEAD)"
git diff --name-only "$EXPECTED_MAIN"..HEAD | LC_ALL=C sort -u > /tmp/white-rabbit-candidate-paths.txt
test -z "$(grep '^\.github/' /tmp/white-rabbit-candidate-paths.txt || true)"
test -z "$(grep '^scripts/\.white-rabbit-' /tmp/white-rabbit-candidate-paths.txt || true)"
path_count="$(wc -l < /tmp/white-rabbit-candidate-paths.txt | tr -d ' ')"
path_sha256="$(sha256sum /tmp/white-rabbit-candidate-paths.txt | cut -d' ' -f1)"

cat > /tmp/white-rabbit-candidate-metadata.json <<JSON
{
  "canonical_parent": "$EXPECTED_MAIN",
  "candidate_commit": "$candidate_commit",
  "candidate_tree": "$candidate_tree",
  "candidate_path_count": $path_count,
  "candidate_path_ledger_sha256": "$path_sha256"
}
JSON

git push --force origin "HEAD:refs/heads/${CANDIDATE_BRANCH}"
test "$(git ls-remote origin "refs/heads/${CANDIDATE_BRANCH}" | cut -f1)" = "$candidate_commit"

mkdir -p /tmp/white-rabbit-candidate-artifact
cp /tmp/white-rabbit-candidate-metadata.json /tmp/white-rabbit-candidate-artifact/candidate-metadata.json
cp /tmp/white-rabbit-stage.json /tmp/white-rabbit-candidate-artifact/stage.json
cp /tmp/white-rabbit-stage.log /tmp/white-rabbit-candidate-artifact/stage.log
cp /tmp/white-rabbit-candidate-paths.txt /tmp/white-rabbit-candidate-artifact/candidate-paths.txt
cp /tmp/white-rabbit-media/metadata.json /tmp/white-rabbit-candidate-artifact/media-preparation.json
printf '%s\n' "$candidate_commit" > /tmp/white-rabbit-candidate-artifact/candidate-commit.txt
printf '%s\n' "$candidate_tree" > /tmp/white-rabbit-candidate-artifact/candidate-tree.txt

printf 'commit=%s\n' "$candidate_commit" >> "$GITHUB_OUTPUT"
printf 'tree=%s\n' "$candidate_tree" >> "$GITHUB_OUTPUT"
printf 'path_count=%s\n' "$path_count" >> "$GITHUB_OUTPUT"
printf 'path_sha256=%s\n' "$path_sha256" >> "$GITHUB_OUTPUT"

}

review() {
set -euo pipefail
artifact_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100")"
test "$(jq -r '[.artifacts[] | select(.name=="white-rabbit-candidate-product")] | length' <<<"$artifact_meta")" = "1"
candidate_artifact="$(jq -r '.artifacts[] | select(.name=="white-rabbit-candidate-product") | .id' <<<"$artifact_meta")"
candidate_digest="$(jq -r '.artifacts[] | select(.name=="white-rabbit-candidate-product") | .digest' <<<"$artifact_meta")"
test "$candidate_artifact" -gt 0
test "${candidate_digest#sha256:}" != "$candidate_digest"

candidate_commit="$(jq -r '.candidate_commit' /tmp/white-rabbit-candidate-artifact/candidate-metadata.json)"
candidate_tree="$(jq -r '.candidate_tree' /tmp/white-rabbit-candidate-artifact/candidate-metadata.json)"
git fetch --filter=blob:none --no-tags --depth=2 origin "$CANDIDATE_BRANCH"
test "$(git rev-parse FETCH_HEAD)" = "$candidate_commit"
git checkout --detach "$candidate_commit"
test "$(git rev-parse HEAD^{tree})" = "$candidate_tree"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
npm ci

node /tmp/white-rabbit-programs/white-rabbit-review.mjs \
  /tmp/white-rabbit-candidate-artifact/candidate-metadata.json \
  /tmp/white-rabbit-candidate-artifact/stage.json \
  /tmp/white-rabbit-independent-review.json | tee /tmp/white-rabbit-independent-review.log
test -z "$(git status --porcelain)"

mkdir -p /tmp/white-rabbit-review-artifact
cp /tmp/white-rabbit-independent-review.json /tmp/white-rabbit-review-artifact/independent-review.json
cp /tmp/white-rabbit-independent-review.log /tmp/white-rabbit-review-artifact/independent-review.log
printf '%s\n' "$candidate_artifact" > /tmp/white-rabbit-review-artifact/candidate-artifact-id.txt
printf '%s\n' "$candidate_digest" > /tmp/white-rabbit-review-artifact/candidate-artifact-digest.txt

}

publish() {
set -euo pipefail
test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$EXPECTED_MAIN"
git fetch --filter=blob:none --no-tags origin main
candidate_commit="$(jq -r '.candidate_commit' /tmp/white-rabbit-candidate-artifact/candidate-metadata.json)"
candidate_tree="$(jq -r '.candidate_tree' /tmp/white-rabbit-candidate-artifact/candidate-metadata.json)"
git fetch --filter=blob:none --no-tags --depth=2 origin "$CANDIDATE_BRANCH"
test "$(git rev-parse FETCH_HEAD)" = "$candidate_commit"
git checkout --detach "$candidate_commit"
test "$(git rev-parse HEAD^{tree})" = "$candidate_tree"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
npm ci

jobs_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100")"
phase_job="$(jq -r '[.jobs[] | select(.name=="white-rabbit-cycle")] | if length==1 then .[0].id else empty end' <<<"$jobs_meta")"
test "$phase_job" -gt 0
candidate_job="$phase_job"
review_job="$phase_job"
publication_job="$phase_job"

artifact_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/artifacts?per_page=100")"
candidate_artifact="$(jq -r '[.artifacts[] | select(.name=="white-rabbit-candidate-product")] | if length==1 then .[0].id else empty end' <<<"$artifact_meta")"
candidate_digest="$(jq -r '[.artifacts[] | select(.name=="white-rabbit-candidate-product")] | if length==1 then .[0].digest else empty end' <<<"$artifact_meta")"
review_artifact="$(jq -r '[.artifacts[] | select(.name=="white-rabbit-independent-review")] | if length==1 then .[0].id else empty end' <<<"$artifact_meta")"
review_digest="$(jq -r '[.artifacts[] | select(.name=="white-rabbit-independent-review")] | if length==1 then .[0].digest else empty end' <<<"$artifact_meta")"
test "$candidate_artifact" -gt 0
test "$review_artifact" -gt 0
candidate_sha="${candidate_digest#sha256:}"
review_sha="${review_digest#sha256:}"
test "$candidate_sha" != "$candidate_digest"
test "$review_sha" != "$review_digest"

cat > /tmp/white-rabbit-execution.json <<JSON
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

node /tmp/white-rabbit-programs/white-rabbit-finalize.mjs \
  /tmp/white-rabbit-candidate-artifact/candidate-metadata.json \
  /tmp/white-rabbit-candidate-artifact/stage.json \
  /tmp/white-rabbit-review-artifact/independent-review.json \
  /tmp/white-rabbit-execution.json \
  /tmp/white-rabbit-finalize.json | tee /tmp/white-rabbit-finalize.log

git diff --check
git config user.name "undercast-star-trek-white-rabbit-publisher"
git config user.email "star-trek-white-rabbit-publisher@users.noreply.github.com"
git reset --soft "$EXPECTED_MAIN"
git add -A
git commit -m "Star Trek: publish White Rabbit cycle"
product_commit="$(git rev-parse HEAD)"
product_tree="$(git rev-parse HEAD^{tree})"
test "$(git rev-parse HEAD^)" = "$EXPECTED_MAIN"
test "$(git rev-list --count "$EXPECTED_MAIN"..HEAD)" = "1"
test -z "$(git rev-list --merges "$EXPECTED_MAIN"..HEAD)"
git diff --name-only "$EXPECTED_MAIN"..HEAD | LC_ALL=C sort -u > /tmp/white-rabbit-product-paths.txt
test -z "$(grep '^\.github/' /tmp/white-rabbit-product-paths.txt || true)"
test -z "$(grep '^scripts/\.white-rabbit-' /tmp/white-rabbit-product-paths.txt || true)"
test "$(grep -c '^data/review/adapter-sdk/star-trek-white-rabbit-cycle.json$' /tmp/white-rabbit-product-paths.txt)" = "1"
test "$(grep -c '^scripts/star-trek-white-rabbit-cycle.mjs$' /tmp/white-rabbit-product-paths.txt)" = "1"
test "$(grep -c '^images/uc-1370-still.webp$' /tmp/white-rabbit-product-paths.txt)" = "1"
test "$(grep -c '^images/uc-1370-portrait.jpg$' /tmp/white-rabbit-product-paths.txt)" = "1"

cat > /tmp/collection-event.json <<'JSON'
{
  "pull_request": {
    "labels": [],
    "body": "Terminal-Product: canonical card UC-1370, exact animated White Rabbit voice and media closure, reviewed Star Trek waterline receipt, permanent route, and prior-cycle custody.\n\nThe transaction adds one rail-selected performer-role card, exact separate character and performer facets, correction of the combined physical-and-voice hint, one independent exact-product review, and one receipt-bearing finalizer. William Blackburn's live-action physical portrayal remains distinct from James Doohan's animated White Rabbit voice performance; maker attribution and role-specific vocal processing remain unresolved and nonblocking."
  }
}
JSON
node scripts/corpus-ops.mjs check-pr --base "$EXPECTED_MAIN" --event /tmp/collection-event.json --json
node scripts/thesis-rails.mjs check-pr --base "$EXPECTED_MAIN" --event /tmp/collection-event.json
node scripts/star-trek-white-rabbit-cycle.mjs
node scripts/star-trek-korax-cycle.mjs
node scripts/star-trek-kor-cycle.mjs
node scripts/star-trek-koloth-cycle.mjs
node scripts/star-trek-kaz-cycle.mjs
node scripts/star-trek-guardian-cycle.mjs
node scripts/star-trek-landru-cycle.mjs
node scripts/star-trek-curzon-cycle.mjs
node scripts/star-trek-armus-cycle.mjs
node scripts/star-trek-m5-cycle.mjs
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

mkdir -p /tmp/white-rabbit-final-product-receipt
cp data/review/adapter-sdk/star-trek-white-rabbit-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-white-rabbit-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-korax-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-korax-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-kor-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-kor-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-koloth-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-koloth-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-kaz-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-kaz-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-guardian-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-guardian-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-landru-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-landru-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-curzon-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-curzon-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-armus-cycle.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-armus-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-armus-cycle-historical.mjs /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-m5-cycle.json /tmp/white-rabbit-final-product-receipt/
cp data/review/adapter-sdk/star-trek-m5-composability-v1.json /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-m5-cycle.mjs /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-m5-cycle-composable-v1.mjs /tmp/white-rabbit-final-product-receipt/
cp scripts/star-trek-m5-cycle-historical.mjs /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-candidate-artifact/candidate-metadata.json /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-candidate-artifact/stage.json /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-review-artifact/independent-review.json /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-execution.json /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-finalize.json /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-finalize.log /tmp/white-rabbit-final-product-receipt/
cp /tmp/white-rabbit-product-paths.txt /tmp/white-rabbit-final-product-receipt/product-paths.txt
cp /tmp/white-rabbit-media/metadata.json /tmp/white-rabbit-final-product-receipt/media-preparation.json
printf '%s\n' "$product_commit" > /tmp/white-rabbit-final-product-receipt/product-commit.txt
printf '%s\n' "$product_tree" > /tmp/white-rabbit-final-product-receipt/product-tree.txt
printf '%s\n' "$pages_run" > /tmp/white-rabbit-final-product-receipt/pages-run.txt
node scripts/thesis-rails.mjs status --json > /tmp/white-rabbit-final-product-receipt/thesis-status.json
node scripts/thesis-rails.mjs next --json > /tmp/white-rabbit-final-product-receipt/thesis-next.json
sha256sum \
  data/review/adapter-sdk/star-trek-white-rabbit-cycle.json \
  scripts/star-trek-white-rabbit-cycle.mjs \
  data/review/adapter-sdk/star-trek-korax-cycle.json \
  scripts/star-trek-korax-cycle.mjs \
  data/review/adapter-sdk/star-trek-kor-cycle.json \
  scripts/star-trek-kor-cycle.mjs \
  data/review/adapter-sdk/star-trek-koloth-cycle.json \
  scripts/star-trek-koloth-cycle.mjs \
  data/review/adapter-sdk/star-trek-kaz-cycle.json \
  scripts/star-trek-kaz-cycle.mjs \
  data/review/adapter-sdk/star-trek-guardian-cycle.json \
  scripts/star-trek-guardian-cycle.mjs \
  data/review/adapter-sdk/star-trek-landru-cycle.json \
  scripts/star-trek-landru-cycle.mjs \
  data/review/adapter-sdk/star-trek-curzon-cycle.json \
  scripts/star-trek-curzon-cycle.mjs \
  data/review/adapter-sdk/star-trek-armus-cycle.json \
  scripts/star-trek-armus-cycle.mjs \
  scripts/star-trek-armus-cycle-historical.mjs \
  data/review/adapter-sdk/star-trek-m5-cycle.json \
  data/review/adapter-sdk/star-trek-m5-composability-v1.json \
  scripts/star-trek-m5-cycle.mjs \
  scripts/star-trek-m5-cycle-composable-v1.mjs \
  scripts/star-trek-m5-cycle-historical.mjs \
  images/uc-1370-still.webp \
  images/uc-1370-portrait.jpg \
  > /tmp/white-rabbit-final-product-receipt/key-sha256.txt
cat > /tmp/white-rabbit-final-product-receipt/publication.txt <<EOF
product_commit=${product_commit}
product_tree=${product_tree}
pages_run=${pages_run}
terminal_card=UC-1370 James Doohan as White Rabbit
EOF

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
