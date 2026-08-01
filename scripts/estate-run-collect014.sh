#!/usr/bin/env bash
set -euo pipefail

SOURCE_HEAD="766b9b6002cfba9710f6dce5f56c4816607bc696"
SOURCE_BRANCH="agent/card-backfill-luna-local"
SOURCE_ROOT="/tmp/pr88-direct-only-source"
AUDITOR="scripts/estate-audit-pr88-direct-only-014.py"
EXECUTOR="scripts/estate-adopt-pr88-direct-only-014.mjs"
RUNNER="scripts/estate-run-collect014.sh"
OVERLAP="data/review/estate-debt/COLLECT-001-PR88-OVERLAP.json"
AUDIT_REPORT="data/review/estate-debt/COLLECT-014-PR88-DIRECT-ONLY-AUDIT.json"
RULING="data/review/estate-debt/COLLECT-014-PR88-DIRECT-ONLY-RULING.json"
SOURCE_OUTPUT="data/review/pr88-direct-only"
SOURCE_MANIFEST="data/review/pr88-direct-only/SOURCE-MANIFEST.json"
CROP_ROOT="data/review/pr88-direct-only/crops"
CROP_MANIFEST="data/review/pr88-direct-only/CROP-MANIFEST.json"
RECEIPT="data/review/estate-debt/COLLECT-014-CANONICAL-ADOPTION.json"
PUBLICATION="data/review/estate-debt/COLLECT-014-PUBLICATION.json"

EXPECTED_IMAGES=(
  "images/uc-178-still-2d6360659016.jpg"
  "images/uc-180-still-a822b0f93820.jpg"
  "images/uc-246-still-8fbd07acbca9.jpg"
  "images/uc-250-still-dc677dbabf75.jpg"
  "images/uc-277-still-9816923c2843.jpg"
  "images/uc-283-still-12ecff4901da.jpg"
  "images/uc-290-still-fb8537fa1294.jpg"
  "images/uc-684-portrait-1a2d9a32dbbc.jpg"
  "images/uc-1092-portrait-5c73e975be5b.jpg"
)

SOURCE_PATHS=(
  "images/uc-178-still.jpg"
  "images/uc-180-still.jpg"
  "images/uc-246-still.jpg"
  "images/uc-250-still.jpg"
  "images/uc-277-still.jpg"
  "images/uc-283-still.jpg"
  "images/uc-290-still.jpg"
  "images/uc-684-portrait.jpg"
  "images/uc-1092-portrait.jpg"
  "data/review/card-backfill/exact-production-stills-wave-003-provenance.json"
  "data/review/card-backfill/exact-production-stills-wave-003-media-resolution.json"
  "data/review/card-backfill/exact-character-stills-wave-005-provenance.json"
  "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json"
  "data/review/card-backfill/uc-684-portrait-provenance.json"
  "data/review/card-backfill/uc-046-uc-684-media-resolution-2026-07-26.json"
  "data/review/card-backfill/star-trek-portraits-wave-004-provenance.json"
  "data/review/card-backfill/star-trek-portraits-wave-004-media-resolution.json"
)

# Exact-head and source-head custody.
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
test -e "$AUDITOR"
test -e "$EXECUTOR"
test -e "$RUNNER"
test -e "$OVERLAP"
test ! -e "$AUDIT_REPORT"
test ! -e "$RULING"
test ! -e "$SOURCE_OUTPUT"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
for file in "${EXPECTED_IMAGES[@]}"; do test ! -e "$file"; done

git fetch origin "refs/heads/${SOURCE_BRANCH}:refs/remotes/origin/${SOURCE_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${SOURCE_BRANCH}")" = "$SOURCE_HEAD"
git cat-file -e "${SOURCE_HEAD}^{commit}"
rm -rf "$SOURCE_ROOT"
mkdir -p "$SOURCE_ROOT"
for source_path in "${SOURCE_PATHS[@]}"; do
  destination="$SOURCE_ROOT/$source_path"
  mkdir -p "$(dirname "$destination")"
  git show "${SOURCE_HEAD}:${source_path}" > "$destination"
done

node --check "$EXECUTOR"
python3 -m py_compile "$AUDITOR"
node scripts/estate-canonical-adoption-ledger.mjs

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 "$AUDITOR" \
  --head "$AUTHORIZED_HEAD" \
  --source-head "$SOURCE_HEAD" \
  --now "$NOW" | tee /tmp/COLLECT-014-audit.json
test "$(node -p "require('/tmp/COLLECT-014-audit.json').reviewed")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-audit.json').authorized")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-audit.json').blocked")" = "0"
test "$(node -p "require('/tmp/COLLECT-014-audit.json').quality_effect.complete_pairs")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-audit.json').quality_effect.missing_still")" = "-7"
test "$(node -p "require('/tmp/COLLECT-014-audit.json').quality_effect.missing_portrait")" = "-2"
test "$(node -p "require('/tmp/COLLECT-014-audit.json').quality_effect.missing_both")" = "0"
test "$(node -p "require('./$AUDIT_REPORT').status")" = "authorized"

# Deterministic current-wall crop custody. ImageMagick is installed explicitly
# by the workflow so each retained source receives the same 1246x1000 review.
if command -v magick >/dev/null 2>&1; then
  IM=(magick)
elif command -v convert >/dev/null 2>&1; then
  IM=(convert)
else
  echo "ImageMagick is required for COLLECT-014 crop custody." >&2
  exit 1
fi
if command -v identify >/dev/null 2>&1; then
  IDENTIFY=(identify)
else
  IDENTIFY=(magick identify)
fi
mkdir -p "$CROP_ROOT"
CROP_ROWS="/tmp/COLLECT-014-crop-rows.tsv"
: > "$CROP_ROWS"
while IFS='|' read -r obligation candidate_sha source_path gravity output_name; do
  test -n "$obligation"
  input="$SOURCE_ROOT/$source_path"
  output="$CROP_ROOT/$output_name"
  test -e "$input"
  test "$(sha256sum "$input" | awk '{print $1}')" = "$candidate_sha"
  "${IM[@]}" "$input" \
    -auto-orient \
    -resize '1246x1000^' \
    -gravity "$gravity" \
    -extent 1246x1000 \
    -strip \
    -quality 92 \
    "$output"
  dimensions="$("${IDENTIFY[@]}" -format '%wx%h' "$output")"
  test "$dimensions" = "1246x1000"
  crop_sha="$(sha256sum "$output" | awk '{print $1}')"
  crop_bytes="$(stat -c '%s' "$output")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$obligation" "$candidate_sha" "$gravity" "$output" "$crop_sha" "$crop_bytes" >> "$CROP_ROWS"
done <<'EOF_CROPS'
UC-178/still|2d636065901653585e612634b51ab071abbee2a8cc74262061a42771ffcebc93|images/uc-178-still.jpg|center|uc-178-still-card-crop.jpg
UC-180/still|a822b0f938209d0e9bab88174c4b690426fd7c50f5946f7410a3c0aedfeb8ed9|images/uc-180-still.jpg|east|uc-180-still-card-crop.jpg
UC-246/still|8fbd07acbca9f6d3a54c9298605ba305e42957b495a3e95d1022701c049a9e30|images/uc-246-still.jpg|west|uc-246-still-card-crop.jpg
UC-250/still|dc677dbabf7566779f1ba80bb4bab29b24ac66b894079041687ef9436de9f497|images/uc-250-still.jpg|center|uc-250-still-card-crop.jpg
UC-277/still|9816923c2843a31d6de3ba5fd2a09035261d6c6b1c8f7276a7f9ee5fb687b522|images/uc-277-still.jpg|center|uc-277-still-card-crop.jpg
UC-283/still|12ecff4901dad96cbf803051f9b8e60c5d33fcb890218fa7ee1eec9458736d50|images/uc-283-still.jpg|center|uc-283-still-card-crop.jpg
UC-290/still|fb8537fa12949e3300873404ba2b35da0f72f5ed0691875a10da1c02cdf5ee7f|images/uc-290-still.jpg|center|uc-290-still-card-crop.jpg
UC-684/portrait|1a2d9a32dbbc05fdba1e4ba6fbfea7dd1b619c1f01a8f0f9f7383f64d54f579c|images/uc-684-portrait.jpg|center|uc-684-portrait-card-crop.jpg
UC-1092/portrait|5c73e975be5ba36ed295422f0c789a10a1017886759769590907c2c6171b6933|images/uc-1092-portrait.jpg|center|uc-1092-portrait-card-crop.jpg
EOF_CROPS

python3 - "$CROP_ROWS" "$CROP_MANIFEST" "$NOW" "$SOURCE_HEAD" <<'PY_CROP_MANIFEST'
import json
from pathlib import Path
import sys

rows_path, output_path, now, source_head = sys.argv[1:]
items = []
for raw in Path(rows_path).read_text(encoding="utf-8").splitlines():
    obligation_id, candidate_sha256, gravity, path, crop_sha256, crop_bytes = raw.split("\t")
    items.append({
        "obligation_id": obligation_id,
        "candidate_sha256": candidate_sha256,
        "path": path,
        "sha256": crop_sha256,
        "bytes": int(crop_bytes),
        "width": 1246,
        "height": 1000,
        "gravity": gravity,
        "recipe": "auto-orient; cover-resize 1246x1000; ruled gravity; extent 1246x1000; strip metadata; JPEG quality 92",
        "ruling": "pass",
    })
if len(items) != 9 or len({item["obligation_id"] for item in items}) != 9:
    raise SystemExit("COLLECT-014 crop denominator is not nine unique obligations")
doc = {
    "version": 1,
    "transaction": "COLLECT-014",
    "operation": "pr88-direct-only-current-wall-crop-custody",
    "status": "complete",
    "recorded_at": now,
    "source_pr": 88,
    "source_head": source_head,
    "items": items,
    "boundary": {
        "canonical_mutation": False,
        "source_evidence_rewritten": False,
        "review_authority_added": False,
        "current_wall_dimensions": True,
    },
}
path = Path(output_path)
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
PY_CROP_MANIFEST

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-014 PR #88 direct-only reconciliation started on workflow run $GITHUB_RUN_ID.

Authorized current head: $AUTHORIZED_HEAD.
Frozen source head: $SOURCE_HEAD.
Exact denominator: seven stills and two portraits, nine objects total.
Audit result: nine authorized, zero blocked.
Expected payment: 731 → 740 complete pairs; 339 → 332 missing stills; 350 → 348 missing portraits; missing-both remains 107.

The source branch will not merge. Exact source blobs, second-desk identity and presentation rulings, current duplicate screening, and deterministic 1246x1000 crop custody are retained on this branch. No acceptance receipt will exist until the complete candidate tree passes the repository and rendered-browser gate. The publication-custody tree will pass the same complete gate again.
EOF_COMMENT

node "$EXECUTOR" --source-root "$SOURCE_ROOT" | tee /tmp/COLLECT-014-preflight.json
test "$(node -p "require('/tmp/COLLECT-014-preflight.json').authorized")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-preflight.json').pending")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-preflight.json').already_adopted")" = "0"
test "$(node -p "require('/tmp/COLLECT-014-preflight.json').stills")" = "7"
test "$(node -p "require('/tmp/COLLECT-014-preflight.json').portraits")" = "2"
cp data/quality.json /tmp/COLLECT-014-quality-before.json

node "$EXECUTOR" \
  --source-root "$SOURCE_ROOT" \
  --now "$NOW" \
  --report /tmp/COLLECT-014-apply.json \
  --write
test "$(node -p "require('/tmp/COLLECT-014-apply.json').counts.adopted")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-apply.json').counts.already_adopted")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

npm run media:audit -- sync
node scripts/shard.mjs
node scripts/build-record-pages.mjs

node "$EXECUTOR" \
  --source-root "$SOURCE_ROOT" \
  --before-quality /tmp/COLLECT-014-quality-before.json \
  --validate | tee /tmp/COLLECT-014-validation.json
test "$(node -p "require('/tmp/COLLECT-014-validation.json').adoptions")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-validation.json').quality.complete_pairs")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-validation.json').quality.missing_still")" = "-7"
test "$(node -p "require('/tmp/COLLECT-014-validation.json').quality.missing_portrait")" = "-2"
test "$(node -p "require('/tmp/COLLECT-014-validation.json').quality.missing_both")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

git diff --name-only -z > /tmp/COLLECT-014-tracked-paths.zlist
git ls-files --others --exclude-standard -z > /tmp/COLLECT-014-untracked-paths.zlist
printf '%s\n' "${EXPECTED_IMAGES[@]}" | sort > /tmp/COLLECT-014-expected-images.txt
node --input-type=module - \
  /tmp/COLLECT-014-expected-images.txt \
  /tmp/COLLECT-014-tracked-paths.zlist \
  /tmp/COLLECT-014-untracked-paths.zlist \
  "$AUDIT_REPORT" "$RULING" "$SOURCE_MANIFEST" "$CROP_MANIFEST" <<'NODE_BOUNDARY'
import fs from 'node:fs';
const expectedImages = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean).sort();
const readZ = (file) => fs.readFileSync(file).toString('utf8').split('\0').filter(Boolean);
const paths = [...new Set([...readZ(process.argv[3]), ...readZ(process.argv[4])])].sort();
if (!paths.length) throw new Error('COLLECT-014 candidate produced no changed paths');
const actualImages = paths.filter((file) => file.startsWith('images/')).sort();
if (JSON.stringify(actualImages) !== JSON.stringify(expectedImages)) {
  throw new Error(`COLLECT-014 image path mismatch\nexpected=${expectedImages.join(',')}\nactual=${actualImages.join(',')}`);
}
const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file));
if (unexpected.length) throw new Error(`COLLECT-014 candidate escaped product boundary: ${unexpected.join(', ')}`);
for (const required of ['data/specimens.json','data/SOURCES.json',process.argv[5],process.argv[6],process.argv[7],process.argv[8]]) {
  if (!paths.includes(required)) throw new Error(`COLLECT-014 candidate lacks required path ${required}`);
}
console.log(`PASS — ${paths.length} changed paths retain the exact nine-object evidence estate and remain inside data/, records/, and the ruled destination set`);
NODE_BOUNDARY

test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
git add -A
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-014-candidate.patch
git write-tree > /tmp/COLLECT-014-candidate.tree
git diff --cached --quiet && { echo 'COLLECT-014 produced no staged candidate tree.' >&2; exit 1; }

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-014-candidate.tree)" = "$(git write-tree)"
node "$EXECUTOR" \
  --source-root "$SOURCE_ROOT" \
  --before-quality /tmp/COLLECT-014-quality-before.json \
  --validate
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

node "$EXECUTOR" \
  --source-root "$SOURCE_ROOT" \
  --before-quality /tmp/COLLECT-014-quality-before.json \
  --authorized-parent "$AUTHORIZED_HEAD" \
  --gated-tree "$(cat /tmp/COLLECT-014-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --promote | tee /tmp/COLLECT-014-promotion.json
test "$(node -p "require('/tmp/COLLECT-014-promotion.json').canonical_adoptions")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-promotion.json').rejected")" = "0"
test "$(node -p "require('/tmp/COLLECT-014-promotion.json').remaining")" = "0"
git add -- "$RECEIPT"
git diff --exit-code
PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-014-candidate.tree)" | sort)"
test "$PROMOTION_PATHS" = "$RECEIPT"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-014-adoption.patch
git write-tree > /tmp/COLLECT-014-adoption.tree

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit \
  -m 'Estate collection: adopt PR88 direct-only media lane' \
  -m 'transaction=COLLECT-014' \
  -m 'source_pr=88' \
  -m "source_head=${SOURCE_HEAD}" \
  -m 'canonical_adoptions=9' \
  -m 'rejected=0' \
  -m 'remaining=0' \
  -m 'stills=7' \
  -m 'portraits=2' \
  -m 'complete_pairs_delta=9' \
  -m 'missing_still_delta=-7' \
  -m 'missing_portrait_delta=-2' \
  -m 'missing_both_delta=0' \
  -m 'source_branch_merged=false' \
  -m 'arbitrary_batch_size=false' \
  -m "authorized_parent=${AUTHORIZED_HEAD}" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-014-candidate.tree)" \
  -m "published_adoption_tree=$(cat /tmp/COLLECT-014-adoption.tree)"
ADOPTION_HEAD="$(git rev-parse HEAD)"
ADOPTION_TREE="$(git rev-parse HEAD^{tree})"
test "$ADOPTION_TREE" = "$(cat /tmp/COLLECT-014-adoption.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

node "$EXECUTOR" \
  --adoption-head "$ADOPTION_HEAD" \
  --adoption-tree "$ADOPTION_TREE" \
  --gated-tree "$(cat /tmp/COLLECT-014-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --reconciliation-parent "$ADOPTION_HEAD" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --reconcile | tee /tmp/COLLECT-014-reconciliation.json
test "$(node -p "require('/tmp/COLLECT-014-reconciliation.json').canonical_adoptions")" = "9"
test "$(node -p "require('/tmp/COLLECT-014-reconciliation.json').rejected")" = "0"
test "$(node -p "require('/tmp/COLLECT-014-reconciliation.json').remaining")" = "0"

git rm "$AUDITOR" "$EXECUTOR" "$RUNNER"
git add -- "$PUBLICATION"
FINAL_PATHS="$(git diff --cached --name-only | sort)"
EXPECTED_FINAL_PATHS="$(printf '%s\n%s\n%s\n%s\n' "$AUDITOR" "$EXECUTOR" "$PUBLICATION" "$RUNNER" | sort)"
test "$FINAL_PATHS" = "$EXPECTED_FINAL_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-014-publication.patch
git write-tree > /tmp/COLLECT-014-publication.tree

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-014-publication.tree)" = "$(git write-tree)"

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$ADOPTION_HEAD"
git commit \
  -m 'Estate custody: reconcile PR88 direct-only publication' \
  -m 'transaction=COLLECT-014' \
  -m "adoption_head=${ADOPTION_HEAD}" \
  -m "adoption_tree=${ADOPTION_TREE}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-014-candidate.tree)" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_publication_tree=$(cat /tmp/COLLECT-014-publication.tree)"
FINAL_HEAD="$(git rev-parse HEAD)"
FINAL_TREE="$(git rev-parse HEAD^{tree})"
test "$FINAL_TREE" = "$(cat /tmp/COLLECT-014-publication.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${ADOPTION_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-014 passed every gate and paid the complete PR #88 direct-only lane on workflow run $GITHUB_RUN_ID.

```text
source PR/head:          #88 / $SOURCE_HEAD
adoption head:           $ADOPTION_HEAD
final custody head:      $FINAL_HEAD
candidate tree:          $(cat /tmp/COLLECT-014-candidate.tree)
adoption tree:           $ADOPTION_TREE
final custody tree:      $(cat /tmp/COLLECT-014-publication.tree)
canonical adoptions:      9 / 9
rejected:                 0
remaining terminal work:  0
complete pairs:         731 → 740
missing stills:         339 → 332
missing portraits:      350 → 348
missing both:           107 → 107
```

The source branch was not merged. Exact PR #88 source blobs, second-desk identity and presentation rulings, current canonical duplicate screening, and deterministic card crops remain retained. The complete candidate tree passed the repository and rendered-browser gate before the paid receipt existed. The publication-custody tree passed the same complete gate again. The auditor, executor, and runner retired themselves.
EOF_COMMENT
