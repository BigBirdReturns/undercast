#!/usr/bin/env bash
set -euo pipefail

EXECUTOR="scripts/estate-adopt-normalized-review-010.mjs"
RUNNER="scripts/estate-run-collect010.sh"
VOCABULARY_RULING="data/review/estate-debt/COLLECT-010-NORMALIZED-REVIEW-VOCABULARY-RULING.json"
SEMANTIC_RULING="data/review/estate-debt/COLLECT-010-PACKET-SEMANTIC-ADAPTER-RULING.json"
RECEIPT="data/review/estate-debt/COLLECT-010-CANONICAL-ADOPTION.json"
PUBLICATION="data/review/estate-debt/COLLECT-010-PUBLICATION.json"
LEDGER="data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json"
ADOPTION_WORKFLOW=".github/workflows/estate-adopt-normalized-review-010.yml"
OBSOLETE_AUDIT_WORKFLOW=".github/workflows/estate-audit-packet-review-incompatible-009.yml"

# Exact-head transaction custody.
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
test -e "$EXECUTOR"
test -e "$RUNNER"
test -e "$VOCABULARY_RULING"
test -e "$SEMANTIC_RULING"
test -e "$ADOPTION_WORKFLOW"
test -e "$OBSOLETE_AUDIT_WORKFLOW"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-010 normalized-review adoption started on workflow run $GITHUB_RUN_ID.

Authorized head: $AUTHORIZED_HEAD.
Exact authorized set: twelve normalized packets, comprising ten stills and two portraits.
Expected payment: 38 → 50 canonical adoptions; 17 → 5 remaining packet obligations; 716 → 728 complete pairs; 350 → 340 missing stills; 356 → 354 missing portraits.

No acceptance receipt will exist until the complete twelve-record candidate tree passes the repository and rendered-browser gate. The final publication-custody tree will pass the same complete gate again.
EOF_COMMENT

node --check "$EXECUTOR"
node scripts/estate-canonical-adoption-ledger.mjs
node "$EXECUTOR" | tee /tmp/COLLECT-010-preflight.json
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').authorized")" = "12"
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').pending")" = "12"
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').already_adopted")" = "0"
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').stills")" = "10"
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').portraits")" = "2"
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').expected_cumulative_after")" = "50"
test "$(node -p "require('/tmp/COLLECT-010-preflight.json').expected_remaining_after")" = "5"
cp data/quality.json /tmp/COLLECT-010-quality-before.json

node "$EXECUTOR" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --report /tmp/COLLECT-010-apply.json \
  --write
test "$(node -p "require('/tmp/COLLECT-010-apply.json').counts.adopted")" = "12"
test "$(node -p "require('/tmp/COLLECT-010-apply.json').counts.already_adopted")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

npm run media:audit -- sync
node scripts/shard.mjs
node scripts/build-record-pages.mjs

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-010-quality-before.json \
  --validate | tee /tmp/COLLECT-010-validation.json
test "$(node -p "require('/tmp/COLLECT-010-validation.json').adoptions")" = "12"
test "$(node -p "require('/tmp/COLLECT-010-validation.json').quality.complete_pairs")" = "12"
test "$(node -p "require('/tmp/COLLECT-010-validation.json').quality.missing_still")" = "-10"
test "$(node -p "require('/tmp/COLLECT-010-validation.json').quality.missing_portrait")" = "-2"
test "$(node -p "require('/tmp/COLLECT-010-validation.json').quality.missing_both")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

node --input-type=module - "$SEMANTIC_RULING" > /tmp/COLLECT-010-expected-images.txt <<'NODE'
import fs from 'node:fs';
const ruling = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const images = ruling.decisions
  .filter((row) => row.status === 'authorized-semantic-adapter')
  .map((row) => row.proposed_binding.src)
  .sort();
if (images.length !== 12 || new Set(images).size !== 12) throw new Error(`expected twelve unique destinations, found ${images.length}/${new Set(images).size}`);
for (const image of images) console.log(image);
NODE

git diff --name-only -z > /tmp/COLLECT-010-tracked-paths.zlist
git ls-files --others --exclude-standard -z > /tmp/COLLECT-010-untracked-paths.zlist
node --input-type=module - \
  /tmp/COLLECT-010-expected-images.txt \
  /tmp/COLLECT-010-tracked-paths.zlist \
  /tmp/COLLECT-010-untracked-paths.zlist <<'NODE'
import fs from 'node:fs';
const expectedImages = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean).sort();
const readZ = (file) => fs.readFileSync(file).toString('utf8').split('\0').filter(Boolean);
const paths = [...new Set([...readZ(process.argv[3]), ...readZ(process.argv[4])])].sort();
if (!paths.length) throw new Error('COLLECT-010 candidate produced no changed paths');
const actualImages = paths.filter((file) => file.startsWith('images/')).sort();
if (JSON.stringify(actualImages) !== JSON.stringify(expectedImages)) {
  throw new Error(`COLLECT-010 image path mismatch\nexpected=${expectedImages.join(',')}\nactual=${actualImages.join(',')}`);
}
const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file));
if (unexpected.length) throw new Error(`COLLECT-010 candidate escaped product boundary: ${unexpected.join(', ')}`);
if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json')) throw new Error('canonical ledgers were not changed');
console.log(`PASS — ${paths.length} changed paths contain twelve exact images and remain inside data/, records/, and the ruled destination set`);
NODE

test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
git add -A
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-010-candidate.patch
git write-tree > /tmp/COLLECT-010-candidate.tree
git diff --cached --quiet && { echo 'COLLECT-010 produced no staged candidate tree.' >&2; exit 1; }

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-010-candidate.tree)" = "$(git write-tree)"
node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-010-quality-before.json \
  --validate
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-010-quality-before.json \
  --authorized-parent "$AUTHORIZED_HEAD" \
  --gated-tree "$(cat /tmp/COLLECT-010-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --promote | tee /tmp/COLLECT-010-promotion.json
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-010-ledger-validation.json
git add -- "$RECEIPT" "$LEDGER"
git diff --exit-code

# The paid adoption commit retires both the mutation workflow and the obsolete
# classifier that would otherwise rerun on every user-authored PR synchronization.
git rm "$ADOPTION_WORKFLOW" "$OBSOLETE_AUDIT_WORKFLOW"
git add -- "$RECEIPT" "$LEDGER"
PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-010-candidate.tree)" | sort)"
EXPECTED_PROMOTION_PATHS="$(printf '%s\n%s\n%s\n%s\n' \
  "$ADOPTION_WORKFLOW" \
  "$LEDGER" \
  "$OBSOLETE_AUDIT_WORKFLOW" \
  "$RECEIPT" | sort)"
test "$PROMOTION_PATHS" = "$EXPECTED_PROMOTION_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-010-adoption.patch
git write-tree > /tmp/COLLECT-010-adoption.tree

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit \
  -m 'Estate collection: adopt normalized review packet lane' \
  -m 'transaction=COLLECT-010' \
  -m 'batch=6' \
  -m 'batch_adoptions=12' \
  -m 'stills=10' \
  -m 'portraits=2' \
  -m 'cumulative_adoptions=50' \
  -m 'remaining_packet_review=5' \
  -m 'complete_pairs_delta=12' \
  -m 'missing_still_delta=-10' \
  -m 'missing_portrait_delta=-2' \
  -m 'arbitrary_batch_size=false' \
  -m "authorized_parent=${AUTHORIZED_HEAD}" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-010-candidate.tree)" \
  -m "published_adoption_tree=$(cat /tmp/COLLECT-010-adoption.tree)"
ADOPTION_HEAD="$(git rev-parse HEAD)"
ADOPTION_TREE="$(git rev-parse HEAD^{tree})"
test "$ADOPTION_TREE" = "$(cat /tmp/COLLECT-010-adoption.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

node "$EXECUTOR" \
  --adoption-head "$ADOPTION_HEAD" \
  --adoption-tree "$ADOPTION_TREE" \
  --gated-tree "$(cat /tmp/COLLECT-010-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --reconciliation-parent "$ADOPTION_HEAD" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --reconcile | tee /tmp/COLLECT-010-reconciliation.json
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-010-final-ledger-validation.json

git rm "$EXECUTOR" "$RUNNER"
git add -- "$LEDGER" "$PUBLICATION"
FINAL_PATHS="$(git diff --cached --name-only | sort)"
EXPECTED_FINAL_PATHS="$(printf '%s\n%s\n%s\n%s\n' "$EXECUTOR" "$LEDGER" "$PUBLICATION" "$RUNNER" | sort)"
test "$FINAL_PATHS" = "$EXPECTED_FINAL_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-010-publication.patch
git write-tree > /tmp/COLLECT-010-publication.tree

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-010-publication.tree)" = "$(git write-tree)"
node scripts/estate-canonical-adoption-ledger.mjs

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$ADOPTION_HEAD"
git commit \
  -m 'Estate custody: reconcile normalized review publication' \
  -m 'transaction=COLLECT-010' \
  -m "adoption_head=${ADOPTION_HEAD}" \
  -m "adoption_tree=${ADOPTION_TREE}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-010-candidate.tree)" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_publication_tree=$(cat /tmp/COLLECT-010-publication.tree)"
FINAL_HEAD="$(git rev-parse HEAD)"
FINAL_TREE="$(git rev-parse HEAD^{tree})"
test "$FINAL_TREE" = "$(cat /tmp/COLLECT-010-publication.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${ADOPTION_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-010 passed every gate and paid the complete normalized-review lane on workflow run $GITHUB_RUN_ID.

```text
adoption head:          $ADOPTION_HEAD
final custody head:     $FINAL_HEAD
candidate tree:         $(cat /tmp/COLLECT-010-candidate.tree)
adoption tree:          $ADOPTION_TREE
final custody tree:     $(cat /tmp/COLLECT-010-publication.tree)
adopted objects:        12
stills:                  10
portraits:                2
cumulative:              50 / 55
remaining review:         5
complete pairs:         716 → 728
missing stills:         350 → 340
missing portraits:      356 → 354
missing both:           109 → 109
```

The candidate tree passed the complete repository and rendered-browser gate before any receipt existed. The final publication-custody tree passed the same complete gate again. The mutation workflow, obsolete incompatible classifier, executor, and runner retired themselves. Four batched-amortized portraits and one distinct-era K9 still remain.
EOF_COMMENT
