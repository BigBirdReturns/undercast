#!/usr/bin/env bash
set -euo pipefail

TARGET_BRANCH="${TARGET_BRANCH:-agent/estate-consolidation-001}"
AUTHORIZED_HEAD="${AUTHORIZED_HEAD:?AUTHORIZED_HEAD is required}"
PR_NUMBER="${PR_NUMBER:-132}"
EXECUTOR="scripts/estate-adopt-current-null-lane-008.mjs"
RUNNER="scripts/estate-run-collect008-v3.sh"
RULING="data/review/estate-debt/COLLECT-007-CURRENT-NULL-WHOLE-LANE-ADJUDICATION.json"
CORRECTION="data/review/estate-debt/COLLECT-008-K9-CROSS-CARD-DUPLICATE-RULING.json"
RECEIPT="data/review/estate-debt/COLLECT-008-CANONICAL-ADOPTION.json"
PUBLICATION="data/review/estate-debt/COLLECT-008-PUBLICATION.json"
LEDGER="data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json"

report_failure() {
  local status=$?
  trap - ERR
  gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body "COLLECT-008 V3 failed closed on workflow run ${GITHUB_RUN_ID}. No 23-object payment claim is authorized unless both the smoke-passed adoption commit and the final publication-custody commit exist on the exact branch. Preserve the K9 duplicate ruling and repair only the exact data, quality, gate, or lease failure." || true
  exit "$status"
}
trap report_failure ERR

# Exact-head custody.
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
test -e "$EXECUTOR"
test -e "$RULING"
test -e "$CORRECTION"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-008 V3 started on workflow run $GITHUB_RUN_ID.

Authorized head: $AUTHORIZED_HEAD.
Corrected denominator: 24 reviewed, 23 authorized for adoption, 1 explicitly deferred.
Deferred: UC-338/still — David Brierly as K9, pending a byte-distinct Season 17 / 1979–80 still.
Expected payment: 15 → 38 canonical adoptions; 40 → 17 remaining packet obligations; 693 → 716 complete pairs; 373 → 350 missing stills.

The cross-card duplicate gate remains unchanged. No acceptance receipt will exist until the complete 23-card candidate tree passes the repository and rendered-browser gate.
EOF_COMMENT

# Prove the superseding K9 ruling.
node --input-type=module - "$RULING" "$CORRECTION" <<'NODE'
import fs from 'node:fs';
const ruling = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const correction = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
if (ruling.transaction !== 'COLLECT-007' || ruling.denominator?.authorized !== 24 || ruling.denominator?.blocked !== 0) throw new Error('whole-lane ruling drifted');
if (correction.transaction !== 'COLLECT-008' || correction.status !== 'authorized-with-one-deferment') throw new Error('cross-card correction identity drifted');
if (correction.collision?.candidate_sha256 !== '416f0403769742e5b9128c05e7c2c7631ecc8ad24ab352ee688ff3e138545372') throw new Error('K9 duplicate hash drifted');
if (correction.corrected_denominator?.authorized_for_collected_adoption !== 23 || correction.corrected_denominator?.deferred !== 1) throw new Error('corrected denominator drifted');
const decisions = new Map(correction.decisions.map((row) => [row.decision_id, row]));
if (decisions.get('UC-323/still')?.status !== 'authorized-primary-character-depiction') throw new Error('UC-323 ruling drifted');
if (decisions.get('UC-338/still')?.status !== 'deferred-requires-era-specific-distinct-still') throw new Error('UC-338 deferment drifted');
NODE

# Specialize the proven 24-object executor to the exact corrected 23-object set.
python3 - <<'PY'
from pathlib import Path

path = Path('scripts/estate-adopt-current-null-lane-008.mjs')
text = path.read_text(encoding='utf-8')

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    text = text.replace(old, new)

replace_once(
    '  for (const decision of ruling.decisions) {',
    '  for (const decision of ruling.decisions.filter((row) => row.decision_id !== "UC-338/still")) {',
    'deferred-obligation filter')
replace_once(
    '  assert(contexts.length === 24, `expected 24 COLLECT-008 contexts, found ${contexts.length}`);',
    '  assert(contexts.length === 23, `expected 23 corrected COLLECT-008 contexts, found ${contexts.length}`);',
    'corrected context denominator')
replace_once(
    '  assert(after.complete_pairs === before.complete_pairs + 24, "complete-pair delta is not +24");\n  assert(after.missing_still === before.missing_still - 24, "missing-still delta is not -24");',
    '  assert(after.complete_pairs === before.complete_pairs + 23, "complete-pair delta is not +23");\n  assert(after.missing_still === before.missing_still - 23, "missing-still delta is not -23");',
    'quality assertions')
replace_once(
    '    deltas: { complete_pairs: 24, missing_still: -24, missing_portrait: 0, missing_both: 0 },',
    '    deltas: { complete_pairs: 23, missing_still: -23, missing_portrait: 0, missing_both: 0 },',
    'quality delta receipt')
replace_once(
    '''    ruling: {
      path: inspection.rulingDoc.safe,
      sha256: inspection.rulingDoc.sha256,
      git_blob: inspection.rulingDoc.git_blob,
      reviewed: 24,
      authorized: 24,
      blocked: 0,
    },''',
    '''    ruling: {
      path: inspection.rulingDoc.safe,
      sha256: inspection.rulingDoc.sha256,
      git_blob: inspection.rulingDoc.git_blob,
      reviewed: 24,
      authorized: 23,
      blocked: 1,
      cross_card_duplicate_ruling: "data/review/estate-debt/COLLECT-008-K9-CROSS-CARD-DUPLICATE-RULING.json",
      deferred_obligation: "UC-338/still",
    },''',
    'receipt ruling summary')
replace_once(
    '''    counts: {
      canonical_adoptions: 24,
      cumulative_canonical_adoptions: 39,
      imported_packets_remaining_for_adoption_review: 16,
      stills: 24,
      portraits: 0,
    },''',
    '''    counts: {
      canonical_adoptions: 23,
      cumulative_canonical_adoptions: 38,
      imported_packets_remaining_for_adoption_review: 17,
      stills: 23,
      portraits: 0,
    },''',
    'receipt counts')
replace_once(
    '''    boundary: {
      visitor_visible_media_improvements: 24,
      arbitrary_batch_size_used: false,
      complete_authorized_lane_exhausted: true,''',
    '''    boundary: {
      visitor_visible_media_improvements: 23,
      arbitrary_batch_size_used: false,
      corrected_authorized_set_exhausted: true,
      deferred_distinct_media_debt: 1,''',
    'receipt boundary')
replace_once(
    '      next_authorized_work: "normalize or terminally reject all 16 packet-review-incompatible objects",',
    '      next_authorized_work: "normalize or terminally reject all 16 packet-review-incompatible objects and resolve UC-338/still with a distinct era-specific still",',
    'next work')
replace_once(
    '''    adoption_count: 24,
    obligations: inspection.contexts.map((context) => context.key),
    quality_delta: { complete_pairs: 24, missing_still: -24, missing_portrait: 0, missing_both: 0 },''',
    '''    adoption_count: 23,
    obligations: inspection.contexts.map((context) => context.key),
    quality_delta: { complete_pairs: 23, missing_still: -23, missing_portrait: 0, missing_both: 0 },''',
    'ledger batch')
replace_once(
    '''  ledger.cumulative = {
    canonical_adoptions: 39,
    remaining_for_canonical_review: 16,
    stills: 39,
    portraits: 0,
    visitor_visible_media_improvements: 39,
  };''',
    '''  ledger.cumulative = {
    canonical_adoptions: 38,
    remaining_for_canonical_review: 17,
    stills: 38,
    portraits: 0,
    visitor_visible_media_improvements: 38,
  };''',
    'ledger cumulative')
replace_once(
    '''  ledger.next_batch_contract = {
    batch: 6,
    prior_canonical_adoptions: 39,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 39,
    expected_remaining_after_full_batch: 16,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_packet_review_normalization_or_terminal_rejection: true,
    census: DEFAULTS.census,
    remaining_lane_counts: { null_binding_without_prior_state: 0, packet_review_incompatible: 16 },
  };''',
    '''  ledger.next_batch_contract = {
    batch: 6,
    prior_canonical_adoptions: 38,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 38,
    expected_remaining_after_full_batch: 17,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_packet_review_normalization_or_terminal_rejection: true,
    requires_distinct_era_media: true,
    census: DEFAULTS.census,
    remaining_lane_counts: { null_binding_without_prior_state: 0, packet_review_incompatible: 16, distinct_media_debt: 1 },
  };''',
    'next batch contract')
replace_once(
    '  return { receipt: receiptResolved.safe, ledger: DEFAULTS.ledger, cumulative_adoptions: 39, remaining: 16 };',
    '  return { receipt: receiptResolved.safe, ledger: DEFAULTS.ledger, cumulative_adoptions: 38, remaining: 17 };',
    'promotion result')
replace_once(
    '  assert(batch.status === "paid" && batch.receipt === DEFAULTS.receipt && batch.adoption_count === 24, "COLLECT-008 ledger batch drifted");',
    '  assert(batch.status === "paid" && batch.receipt === DEFAULTS.receipt && batch.adoption_count === 23, "COLLECT-008 ledger batch drifted");',
    'publication batch validation')
replace_once(
    '''    cumulative: {
      canonical_adoptions: 39,
      remaining_for_canonical_review: 16,
      visitor_visible_media_improvements: 39,
      complete_pairs: 717,
      missing_stills: 349,
    },''',
    '''    cumulative: {
      canonical_adoptions: 38,
      remaining_for_canonical_review: 17,
      visitor_visible_media_improvements: 38,
      complete_pairs: 716,
      missing_stills: 350,
      deferred_distinct_media_debt: 1,
    },''',
    'publication cumulative')
replace_once(
    '  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 39, remaining: 16 };',
    '  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 38, remaining: 17 };',
    'publication result')
replace_once(
    '    console.log(JSON.stringify({ transaction: "COLLECT-008", status: "validated", adoptions: 24, quality: result.deltas }, null, 2));',
    '    console.log(JSON.stringify({ transaction: "COLLECT-008", status: "validated", adoptions: 23, quality: result.deltas }, null, 2));',
    'validation output')
replace_once(
    '''    expected_cumulative_after: 39,
    expected_remaining_after: 16,
    expected_quality: { complete_pairs: 24, missing_still: -24, missing_portrait: 0, missing_both: 0 },''',
    '''    expected_cumulative_after: 38,
    expected_remaining_after: 17,
    expected_quality: { complete_pairs: 23, missing_still: -23, missing_portrait: 0, missing_both: 0 },''',
    'preflight output')

path.write_text(text, encoding='utf-8')
PY
node --check "$EXECUTOR"
grep -Fq 'source.fetched_at = String(now).slice(0, 10);' "$EXECUTOR"
grep -Fq 'UC-338/still' "$EXECUTOR"

# Prove prior state and exact corrected denominator.
node scripts/estate-canonical-adoption-ledger.mjs
node "$EXECUTOR" | tee /tmp/COLLECT-008-v3-preflight.json
test "$(node -p "require('/tmp/COLLECT-008-v3-preflight.json').authorized")" = "23"
test "$(node -p "require('/tmp/COLLECT-008-v3-preflight.json').pending")" = "23"
test "$(node -p "require('/tmp/COLLECT-008-v3-preflight.json').already_adopted")" = "0"
test "$(node -p "require('/tmp/COLLECT-008-v3-preflight.json').expected_cumulative_after")" = "38"
test "$(node -p "require('/tmp/COLLECT-008-v3-preflight.json').expected_remaining_after")" = "17"
test "$(node -p "require('/tmp/COLLECT-008-v3-preflight.json').obligations.includes('UC-338/still')")" = "false"
cp data/quality.json /tmp/COLLECT-008-v3-quality-before.json

# Apply the entire corrected set, then rebuild public projections.
node "$EXECUTOR" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --report /tmp/COLLECT-008-v3-apply.json \
  --write
test "$(node -p "require('/tmp/COLLECT-008-v3-apply.json').counts.adopted")" = "23"
test "$(node -p "require('/tmp/COLLECT-008-v3-apply.json').counts.already_adopted")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

npm run media:audit -- sync
node scripts/shard.mjs
node scripts/build-record-pages.mjs

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-008-v3-quality-before.json \
  --validate | tee /tmp/COLLECT-008-v3-validation.json
test "$(node -p "require('/tmp/COLLECT-008-v3-validation.json').adoptions")" = "23"
test "$(node -p "require('/tmp/COLLECT-008-v3-validation.json').quality.complete_pairs")" = "23"
test "$(node -p "require('/tmp/COLLECT-008-v3-validation.json').quality.missing_still")" = "-23"
test "$(node -p "require('/tmp/COLLECT-008-v3-validation.json').quality.missing_portrait")" = "0"
test "$(node -p "require('/tmp/COLLECT-008-v3-validation.json').quality.missing_both")" = "0"

# Stage the exact candidate tree, explicitly excluding the deferred duplicate.
node --input-type=module - "$RULING" > /tmp/COLLECT-008-v3-expected-images.txt <<'NODE'
import fs from 'node:fs';
const ruling = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const images = ruling.decisions
  .filter((row) => row.status === 'authorized-current-null' && row.decision_id !== 'UC-338/still')
  .map((row) => row.current.destination_path)
  .sort();
if (images.length !== 23 || new Set(images).size !== 23) throw new Error(`expected 23 unique corrected destinations, found ${images.length}/${new Set(images).size}`);
for (const image of images) console.log(image);
NODE

git diff --name-only -z > /tmp/COLLECT-008-v3-tracked-paths.zlist
git ls-files --others --exclude-standard -z > /tmp/COLLECT-008-v3-untracked-paths.zlist
node --input-type=module - \
  /tmp/COLLECT-008-v3-expected-images.txt \
  /tmp/COLLECT-008-v3-tracked-paths.zlist \
  /tmp/COLLECT-008-v3-untracked-paths.zlist \
  "$EXECUTOR" <<'NODE'
import fs from 'node:fs';
const expectedImages = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean).sort();
const readZ = (file) => fs.readFileSync(file).toString('utf8').split('\0').filter(Boolean);
const paths = [...new Set([...readZ(process.argv[3]), ...readZ(process.argv[4])])].sort();
const executor = process.argv[5];
if (!paths.length) throw new Error('COLLECT-008 V3 candidate produced no changed paths');
const actualImages = paths.filter((file) => file.startsWith('images/')).sort();
if (JSON.stringify(actualImages) !== JSON.stringify(expectedImages)) throw new Error(`COLLECT-008 V3 image mismatch\nexpected=${expectedImages.join(',')}\nactual=${actualImages.join(',')}`);
const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file) && file !== executor);
if (unexpected.length) throw new Error(`COLLECT-008 V3 escaped product boundary: ${unexpected.join(', ')}`);
if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json') || !paths.includes(executor)) throw new Error('canonical ledgers or specialized executor were not changed');
if (paths.includes('images/uc-338-still-416f04037697.jpg')) throw new Error('deferred UC-338 destination entered the candidate tree');
console.log(`PASS — ${paths.length} paths contain 23 exact images, the specialized executor, and no deferred K9 destination`);
NODE

test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
git add -A
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-008-v3-candidate.patch
git write-tree > /tmp/COLLECT-008-v3-candidate.tree
git diff --cached --quiet && { echo 'COLLECT-008 V3 produced no staged candidate tree.' >&2; exit 1; }

# One complete smoke gate before any acceptance receipt exists.
npm run gate
git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-008-v3-candidate.tree)" = "$(git write-tree)"
node "$EXECUTOR" --before-quality /tmp/COLLECT-008-v3-quality-before.json --validate
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

# Promote the immutable receipt and cumulative ledger only after smoke.
node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-008-v3-quality-before.json \
  --authorized-parent "$AUTHORIZED_HEAD" \
  --gated-tree "$(cat /tmp/COLLECT-008-v3-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --promote | tee /tmp/COLLECT-008-v3-promotion.json
test "$(node -p "require('/tmp/COLLECT-008-v3-promotion.json').cumulative_adoptions")" = "38"
test "$(node -p "require('/tmp/COLLECT-008-v3-promotion.json').remaining")" = "17"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-008-v3-ledger-validation.json
git add -- "$RECEIPT" "$LEDGER"
git diff --exit-code

PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-008-v3-candidate.tree)" | sort)"
EXPECTED_PATHS="$(printf '%s\n%s\n' "$LEDGER" "$RECEIPT" | sort)"
test "$PROMOTION_PATHS" = "$EXPECTED_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-008-v3-adoption.patch
git write-tree > /tmp/COLLECT-008-v3-adoption.tree

# Publish the smoke-passed product tree under the exact-head lease.
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit \
  -m 'Estate collection: adopt corrected current-null packet set' \
  -m 'transaction=COLLECT-008' \
  -m 'batch_adoptions=23' \
  -m 'deferred_obligations=1' \
  -m 'deferred=UC-338/still' \
  -m 'arbitrary_batch_size=false' \
  -m 'cumulative_adoptions=38' \
  -m 'remaining_packet_review=17' \
  -m 'complete_pairs_delta=23' \
  -m 'missing_still_delta=-23' \
  -m "authorized_parent=${AUTHORIZED_HEAD}" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-008-v3-candidate.tree)" \
  -m "published_adoption_tree=$(cat /tmp/COLLECT-008-v3-adoption.tree)"
ADOPTION_HEAD="$(git rev-parse HEAD)"
ADOPTION_TREE="$(git rev-parse HEAD^{tree})"
test "$ADOPTION_TREE" = "$(cat /tmp/COLLECT-008-v3-adoption.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

# Reconcile publication custody, then retire the temporary executors.
node "$EXECUTOR" \
  --adoption-head "$ADOPTION_HEAD" \
  --adoption-tree "$ADOPTION_TREE" \
  --gated-tree "$(cat /tmp/COLLECT-008-v3-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --reconciliation-parent "$ADOPTION_HEAD" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --reconcile | tee /tmp/COLLECT-008-v3-reconciliation.json
test "$(node -p "require('/tmp/COLLECT-008-v3-reconciliation.json').canonical_adoptions")" = "38"
test "$(node -p "require('/tmp/COLLECT-008-v3-reconciliation.json').remaining")" = "17"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-008-v3-final-ledger-validation.json

git rm "$EXECUTOR" "$RUNNER"
git add -- "$LEDGER" "$PUBLICATION"
PATHS="$(git diff --cached --name-only | sort)"
EXPECTED="$(printf '%s\n%s\n%s\n%s\n' "$EXECUTOR" "$LEDGER" "$PUBLICATION" "$RUNNER" | sort)"
test "$PATHS" = "$EXPECTED"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-008-v3-publication.patch
git write-tree > /tmp/COLLECT-008-v3-publication.tree

# Final custody tree receives the same complete gate.
npm run gate
git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-008-v3-publication.tree)" = "$(git write-tree)"
node scripts/estate-canonical-adoption-ledger.mjs

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$ADOPTION_HEAD"
git commit \
  -m 'Estate custody: reconcile corrected current-null publication' \
  -m 'transaction=COLLECT-008' \
  -m "adoption_head=${ADOPTION_HEAD}" \
  -m "adoption_tree=${ADOPTION_TREE}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-008-v3-candidate.tree)" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_publication_tree=$(cat /tmp/COLLECT-008-v3-publication.tree)"
FINAL_HEAD="$(git rev-parse HEAD)"
FINAL_TREE="$(git rev-parse HEAD^{tree})"
test "$FINAL_TREE" = "$(cat /tmp/COLLECT-008-v3-publication.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${ADOPTION_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

trap - ERR
gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT || true
COLLECT-008 V3 passed and published on workflow run $GITHUB_RUN_ID.

All 23 non-colliding current-null packets are now canonical media. UC-338/still remains explicitly deferred for a byte-distinct Season 17 / David Brierly-era K9 image.

```text
adoption head:           $ADOPTION_HEAD
final custody head:      $FINAL_HEAD
cumulative adoptions:    38 / 55
remaining packet review: 17
complete pairs:          693 → 716
missing stills:          373 → 350
missing portraits:       356 → 356
missing both:            109 → 109
```

The corrected candidate tree and final publication-custody tree both passed the complete repository gate including rendered-browser checks. The cross-card duplicate policy was not weakened, packet evidence was not rewritten, and no arbitrary batch size was used.
EOF_COMMENT
