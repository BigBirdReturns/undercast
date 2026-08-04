#!/usr/bin/env bash
set -euo pipefail

TARGET_BRANCH="agent/ux-02-navigation-parity"
PR_NUMBER="255"
EVIDENCE="${EVIDENCE:-${RUNNER_TEMP:-/tmp}/ux-02a-dec0016-evidence}"
mkdir -p "$EVIDENCE"
STAGE="bootstrap"

post_comment() {
  local body="$1"
  jq -n --arg body "$body" '{body:$body}' > /tmp/ux-02a-comment.json
  curl --silent --show-error --fail-with-body \
    -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    --data @/tmp/ux-02a-comment.json \
    "https://api.github.com/repos/BigBirdReturns/undercast/issues/${PR_NUMBER}/comments" \
    >/dev/null || true
}

on_error() {
  local status="$?"
  trap - ERR
  printf 'status=failure\nstage=%s\nexit=%s\nrun=%s\ntarget_branch=%s\n' \
    "$STAGE" "$status" "${GITHUB_RUN_ID:-unknown}" "$TARGET_BRANCH" \
    > "$EVIDENCE/status.txt"
  post_comment "UX-02A DEC-0016 materializer run ${GITHUB_RUN_ID:-unknown} failed at stage ${STAGE} with status ${status}."
  exit "$status"
}
trap on_error ERR

STAGE="fetch-live-refs"
git fetch --no-tags origin \
  "+refs/heads/main:refs/remotes/origin/main" \
  "+refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
TARGET_SHA="$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")"
BASE_SHA="$(git rev-parse refs/remotes/origin/main)"
PATCH_PATH="tmp/ux-02-navigation-continuity-v6.py"
git show "${TARGET_SHA}:${PATCH_PATH}" > /tmp/ux-02-navigation-continuity-dec0016.py

post_comment "UX-02A DEC-0016 materializer run ${GITHUB_RUN_ID} started on target head ${TARGET_SHA} and live main ${BASE_SHA}; UX-03, DEC-0009, DEC-0012 and DEC-0015 remain binding."

STAGE="reset-live-main"
git reset --hard "$BASE_SHA"

STAGE="apply-semantic-composition"
python /tmp/ux-02-navigation-continuity-dec0016.py

STAGE="install-node"
npm ci 2>&1 | tee "$EVIDENCE/npm-ci.log"

STAGE="initial-projections"
node scripts/shard.mjs 2>&1 | tee "$EVIDENCE/shard-before.log"
node scripts/build-record-pages.mjs 2>&1 | tee "$EVIDENCE/records-before.log"

STAGE="static-contracts"
node --check assets/site-navigation.js
node --check scripts/site-seams.mjs
node --check tests/rendered/site.spec.mjs
node --check tests/rendered/ux-journeys.spec.mjs
node scripts/site-seams.mjs 2>&1 | tee "$EVIDENCE/site-seams.log"
grep -Fq '## DEC-0016 — Compact archive navigation is progressive enhancement, not a new destination' docs/DECISIONS.md
grep -Fq 'DEC-0015 remains the authority for dense mobile evidence' docs/DECISIONS.md
grep -Fq 'Connections and Constellations remain contextual or secondary under DEC-0009' docs/DECISIONS.md
git diff --check

STAGE="generated-record-custody"
EXPECTED_RECORDS="$(node --input-type=module -e 'import {readFileSync} from "node:fs"; const live=JSON.parse(readFileSync("data/specimens.json","utf8")); const retired=JSON.parse(readFileSync("data/tombstones.json","utf8")); console.log(live.length+(retired.records||[]).length);')"
GENERATED_RECORDS="$(find records -mindepth 2 -maxdepth 2 -type f -name index.html | wc -l | tr -d ' ')"
test "$GENERATED_RECORDS" = "$EXPECTED_RECORDS"
find records -mindepth 2 -maxdepth 2 -type f -name index.html -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum \
  > "$EVIDENCE/generated-records-before.sha256"

while IFS= read -r -d '' file; do
  grep -Fq '../../assets/site-navigation.js' "$file" || { printf 'record lacks shared controller: %s\n' "$file" >&2; exit 1; }
  grep -Fq 'class="archive-map"' "$file" || { printf 'record lacks archive map: %s\n' "$file" >&2; exit 1; }
  grep -Fq 'aria-current="location">Recognition records' "$file" || { printf 'record lacks current archive section: %s\n' "$file" >&2; exit 1; }
  if grep -Eq '<a[^>]*>Connections</a>' "$file"; then
    printf 'record promoted Connections into primary navigation: %s\n' "$file" >&2
    exit 1
  fi
done < <(find records -mindepth 2 -maxdepth 2 -type f -name index.html -print0)

permanent_paths=(
  404.html
  assets/site-navigation.js
  assets/site-shell.css
  constellation.html
  coverage.html
  data/archive.json
  docs/DECISIONS.md
  docs/UX-READINESS.md
  index.html
  recognition.html
  scripts/build-record-pages.mjs
  scripts/site-seams.mjs
  tests/rendered/site.spec.mjs
  tests/rendered/ux-journeys.spec.mjs
)

STAGE="exact-denominator"
mapfile -t actual_paths < <({ git diff --name-only "$BASE_SHA"; git ls-files --others --exclude-standard; } | LC_ALL=C sort -u)
test "${#actual_paths[@]}" = "${#permanent_paths[@]}"
for file in "${permanent_paths[@]}"; do
  printf '%s\n' "${actual_paths[@]}" | grep -Fxq "$file"
done
if printf '%s\n' "${actual_paths[@]}" | grep -Eq '^records/|^\.github/|^tmp/|^\.ci/'; then
  printf 'workflow, transport, or generated output entered the permanent denominator\n' >&2
  exit 1
fi

STAGE="create-one-commit-product"
git config user.name undercast-transaction-bot
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git add -- "${permanent_paths[@]}"
git commit -m 'UX: normalize mobile archive navigation and current location'
PRODUCT_SHA="$(git rev-parse HEAD)"
test "$(git rev-list --count "$BASE_SHA"..HEAD)" = 1
test -z "$(git status --porcelain)"

STAGE="collection-policy-preflight"
cat > /tmp/ux-02a-pr-event.json <<'JSON'
{
  "pull_request": {
    "labels": [{"name": "owner-approved-product-change"}],
    "body": "Implements DEC-0016 while preserving DEC-0009, DEC-0012 and DEC-0015."
  }
}
JSON
node scripts/corpus-ops.mjs check-pr --base "$BASE_SHA" --event /tmp/ux-02a-pr-event.json --json 2>&1 | tee "$EVIDENCE/collection-policy.log"

STAGE="generated-record-replay"
node scripts/build-record-pages.mjs 2>&1 | tee "$EVIDENCE/records-replay.log"
find records -mindepth 2 -maxdepth 2 -type f -name index.html -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum \
  > "$EVIDENCE/generated-records-after.sha256"
diff -u "$EVIDENCE/generated-records-before.sha256" "$EVIDENCE/generated-records-after.sha256" | tee "$EVIDENCE/generated-records.diff"
node scripts/shard.mjs 2>&1 | tee "$EVIDENCE/shard-replay.log"
test -z "$(git status --porcelain)"

STAGE="install-browser-engines"
timeout 900s npx playwright install --with-deps chromium firefox webkit 2>&1 | tee "$EVIDENCE/playwright-install.log"

STAGE="five-engine-ux"
timeout 900s npm run test:ux 2>&1 | tee "$EVIDENCE/test-ux.log"

STAGE="canonical-gate"
timeout 1200s npm run gate 2>&1 | tee "$EVIDENCE/gate.log"
test -z "$(git status --porcelain)"

STAGE="stable-main"
git fetch --no-tags origin "+refs/heads/main:refs/remotes/origin/main"
test "$(git rev-parse refs/remotes/origin/main)" = "$BASE_SHA"
test "$(git rev-list --count "$BASE_SHA"..HEAD)" = 1
mapfile -t final_paths < <(git diff --name-only "$BASE_SHA"..HEAD | LC_ALL=C sort)
test "${#final_paths[@]}" = "${#permanent_paths[@]}"
for file in "${permanent_paths[@]}"; do
  printf '%s\n' "${final_paths[@]}" | grep -Fxq "$file"
done
if printf '%s\n' "${final_paths[@]}" | grep -Eq '^records/|^\.github/|^tmp/|^\.ci/'; then
  printf 'workflow, transport, or generated-record path survived product publication\n' >&2
  exit 1
fi
git diff --check "$BASE_SHA"..HEAD

STAGE="write-qualification"
{
  printf 'status=success\n'
  printf 'run=%s\n' "$GITHUB_RUN_ID"
  printf 'base=%s\n' "$BASE_SHA"
  printf 'source=%s\n' "$TARGET_SHA"
  printf 'product=%s\n' "$PRODUCT_SHA"
  printf 'decision=DEC-0016\n'
  printf 'generated_records=%s\n' "$GENERATED_RECORDS"
  printf 'changed_paths=%s\n' "${#final_paths[@]}"
  printf '%s\n' "${final_paths[@]}"
} > "$EVIDENCE/qualification.txt"

STAGE="publish-product"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${TARGET_SHA}" origin "HEAD:refs/heads/${TARGET_BRANCH}"
post_comment "UX-02A DEC-0016 materializer run ${GITHUB_RUN_ID} passed policy preflight, ${GENERATED_RECORDS}-page generated-record replay, the five-engine UX matrix, committed visual baselines and the complete repository gate; it published exact one-commit product ${PRODUCT_SHA} on base ${BASE_SHA}."

printf 'status=success\nproduct=%s\nbase=%s\n' "$PRODUCT_SHA" "$BASE_SHA" > "$EVIDENCE/status.txt"
