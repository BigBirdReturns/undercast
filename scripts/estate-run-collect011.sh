#!/usr/bin/env bash
set -euo pipefail

EXECUTOR="scripts/estate-adopt-batched-portraits-011.mjs"
RUNNER="scripts/estate-run-collect011.sh"
RULING="data/review/estate-debt/COLLECT-011-BATCHED-PORTRAIT-SECOND-DESK-RULING.json"
RECEIPT="data/review/estate-debt/COLLECT-011-CANONICAL-ADOPTION.json"
PUBLICATION="data/review/estate-debt/COLLECT-011-PUBLICATION.json"
LEDGER="data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json"

# Exact-head transaction custody.
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
test -e "$EXECUTOR"
test -e "$RUNNER"
test -e "$RULING"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-011 complete batched-portrait adoption started on workflow run $GITHUB_RUN_ID.

Authorized head: $AUTHORIZED_HEAD.
Exact authorized set: four portraits — Scott Lawrence, Mike Henry, Michael Bell, and Joseph Bishara.
Expected payment: 50 → 54 canonical adoptions; 5 → 1 remaining packet obligation; 728 → 730 complete pairs; 354 → 350 missing portraits; 109 → 107 missing both.

No acceptance receipt will exist until the complete four-record candidate tree passes the repository and rendered-browser gate. The final publication-custody tree will pass the same complete gate again.
EOF_COMMENT

node --check "$EXECUTOR"
node scripts/estate-canonical-adoption-ledger.mjs
node "$EXECUTOR" | tee /tmp/COLLECT-011-preflight.json
test "$(node -p "require('/tmp/COLLECT-011-preflight.json').authorized")" = "4"
test "$(node -p "require('/tmp/COLLECT-011-preflight.json').pending")" = "4"
test "$(node -p "require('/tmp/COLLECT-011-preflight.json').already_adopted")" = "0"
test "$(node -p "require('/tmp/COLLECT-011-preflight.json').portraits")" = "4"
test "$(node -p "require('/tmp/COLLECT-011-preflight.json').expected_cumulative_after")" = "54"
test "$(node -p "require('/tmp/COLLECT-011-preflight.json').expected_remaining_after")" = "1"
cp data/quality.json /tmp/COLLECT-011-quality-before.json

node "$EXECUTOR" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --report /tmp/COLLECT-011-apply.json \
  --write
test "$(node -p "require('/tmp/COLLECT-011-apply.json').counts.adopted")" = "4"
test "$(node -p "require('/tmp/COLLECT-011-apply.json').counts.already_adopted")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

npm run media:audit -- sync
node scripts/shard.mjs
node scripts/build-record-pages.mjs

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-011-quality-before.json \
  --validate | tee /tmp/COLLECT-011-validation.json
test "$(node -p "require('/tmp/COLLECT-011-validation.json').adoptions")" = "4"
test "$(node -p "require('/tmp/COLLECT-011-validation.json').quality.complete_pairs")" = "2"
test "$(node -p "require('/tmp/COLLECT-011-validation.json').quality.missing_still")" = "0"
test "$(node -p "require('/tmp/COLLECT-011-validation.json').quality.missing_portrait")" = "-4"
test "$(node -p "require('/tmp/COLLECT-011-validation.json').quality.missing_both")" = "-2"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

node --input-type=module - "$RULING" > /tmp/COLLECT-011-expected-images.txt <<'NODE'
import fs from 'node:fs';
const ruling = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const images = ruling.decisions
  .filter((row) => row.status === 'authorized-batched-second-desk')
  .map((row) => row.proposed_binding.src)
  .sort();
if (images.length !== 4 || new Set(images).size !== 4) throw new Error(`expected four unique destinations, found ${images.length}/${new Set(images).size}`);
for (const image of images) console.log(image);
NODE

git diff --name-only -z > /tmp/COLLECT-011-tracked-paths.zlist
git ls-files --others --exclude-standard -z > /tmp/COLLECT-011-untracked-paths.zlist
node --input-type=module - \
  /tmp/COLLECT-011-expected-images.txt \
  /tmp/COLLECT-011-tracked-paths.zlist \
  /tmp/COLLECT-011-untracked-paths.zlist <<'NODE'
import fs from 'node:fs';
const expectedImages = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean).sort();
const readZ = (file) => fs.readFileSync(file).toString('utf8').split('\0').filter(Boolean);
const paths = [...new Set([...readZ(process.argv[3]), ...readZ(process.argv[4])])].sort();
if (!paths.length) throw new Error('COLLECT-011 candidate produced no changed paths');
const actualImages = paths.filter((file) => file.startsWith('images/')).sort();
if (JSON.stringify(actualImages) !== JSON.stringify(expectedImages)) {
  throw new Error(`COLLECT-011 image path mismatch\nexpected=${expectedImages.join(',')}\nactual=${actualImages.join(',')}`);
}
const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file));
if (unexpected.length) throw new Error(`COLLECT-011 candidate escaped product boundary: ${unexpected.join(', ')}`);
if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json')) throw new Error('canonical ledgers were not changed');
console.log(`PASS — ${paths.length} changed paths contain four exact portraits and remain inside data/, records/, and the ruled destination set`);
NODE

test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
git add -A
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-011-candidate.patch
git write-tree > /tmp/COLLECT-011-candidate.tree
git diff --cached --quiet && { echo 'COLLECT-011 produced no staged candidate tree.' >&2; exit 1; }

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-011-candidate.tree)" = "$(git write-tree)"
node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-011-quality-before.json \
  --validate
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-011-quality-before.json \
  --authorized-parent "$AUTHORIZED_HEAD" \
  --gated-tree "$(cat /tmp/COLLECT-011-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --promote | tee /tmp/COLLECT-011-promotion.json
test "$(node -p "require('/tmp/COLLECT-011-promotion.json').canonical_adoptions")" = "54"
test "$(node -p "require('/tmp/COLLECT-011-promotion.json').remaining")" = "1"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-011-ledger-validation.json
git add -- "$RECEIPT" "$LEDGER"
git diff --exit-code

PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-011-candidate.tree)" | sort)"
EXPECTED_PROMOTION_PATHS="$(printf '%s\n%s\n' "$LEDGER" "$RECEIPT" | sort)"
test "$PROMOTION_PATHS" = "$EXPECTED_PROMOTION_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-011-adoption.patch
git write-tree > /tmp/COLLECT-011-adoption.tree

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit \
  -m 'Estate collection: adopt complete batched portrait lane' \
  -m 'transaction=COLLECT-011' \
  -m 'batch=7' \
  -m 'batch_adoptions=4' \
  -m 'portraits=4' \
  -m 'cumulative_adoptions=54' \
  -m 'remaining_packet_review=1' \
  -m 'complete_pairs_delta=2' \
  -m 'missing_portrait_delta=-4' \
  -m 'missing_both_delta=-2' \
  -m 'arbitrary_batch_size=false' \
  -m "authorized_parent=${AUTHORIZED_HEAD}" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-011-candidate.tree)" \
  -m "published_adoption_tree=$(cat /tmp/COLLECT-011-adoption.tree)"
ADOPTION_HEAD="$(git rev-parse HEAD)"
ADOPTION_TREE="$(git rev-parse HEAD^{tree})"
test "$ADOPTION_TREE" = "$(cat /tmp/COLLECT-011-adoption.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

node "$EXECUTOR" \
  --adoption-head "$ADOPTION_HEAD" \
  --adoption-tree "$ADOPTION_TREE" \
  --gated-tree "$(cat /tmp/COLLECT-011-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --reconciliation-parent "$ADOPTION_HEAD" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --reconcile | tee /tmp/COLLECT-011-reconciliation.json
test "$(node -p "require('/tmp/COLLECT-011-reconciliation.json').canonical_adoptions")" = "54"
test "$(node -p "require('/tmp/COLLECT-011-reconciliation.json').remaining")" = "1"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-011-final-ledger-validation.json

git rm "$EXECUTOR" "$RUNNER"
git add -- "$LEDGER" "$PUBLICATION"
FINAL_PATHS="$(git diff --cached --name-only | sort)"
EXPECTED_FINAL_PATHS="$(printf '%s\n%s\n%s\n%s\n' "$EXECUTOR" "$LEDGER" "$PUBLICATION" "$RUNNER" | sort)"
test "$FINAL_PATHS" = "$EXPECTED_FINAL_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-011-publication.patch
git write-tree > /tmp/COLLECT-011-publication.tree

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-011-publication.tree)" = "$(git write-tree)"
node scripts/estate-canonical-adoption-ledger.mjs

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$ADOPTION_HEAD"
git commit \
  -m 'Estate custody: reconcile complete batched portrait publication' \
  -m 'transaction=COLLECT-011' \
  -m "adoption_head=${ADOPTION_HEAD}" \
  -m "adoption_tree=${ADOPTION_TREE}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-011-candidate.tree)" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_publication_tree=$(cat /tmp/COLLECT-011-publication.tree)"
FINAL_HEAD="$(git rev-parse HEAD)"
FINAL_TREE="$(git rev-parse HEAD^{tree})"
test "$FINAL_TREE" = "$(cat /tmp/COLLECT-011-publication.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${ADOPTION_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-011 passed every gate and paid the complete batched portrait lane on workflow run $GITHUB_RUN_ID.

```text
adoption head:          $ADOPTION_HEAD
final custody head:     $FINAL_HEAD
candidate tree:         $(cat /tmp/COLLECT-011-candidate.tree)
adoption tree:          $ADOPTION_TREE
final custody tree:     $(cat /tmp/COLLECT-011-publication.tree)
adopted portraits:       4
cumulative:             54 / 55
remaining review:        1
complete pairs:        728 → 730
missing stills:        340 → 340
missing portraits:     354 → 350
missing both:          109 → 107
```

The candidate tree passed the complete repository and rendered-browser gate before any receipt existed. The final publication-custody tree passed the same complete gate again. The executor and runner retired themselves. Only UC-338/still remains, requiring a byte-distinct David Brierly-era K9 image.
EOF_COMMENT
