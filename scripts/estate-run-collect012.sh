#!/usr/bin/env bash
set -euo pipefail

EXECUTOR="scripts/estate-adopt-uc338-season17-012.mjs"
RUNNER="scripts/estate-run-collect012.sh"
PACKET_PUBLICATION="data/review/estate-debt/COLLECT-012-UC338-SEASON17-PACKET-PUBLICATION.json"
PACKET_ROOT="data/review/card-backfill/UC-338-season17-replacement"
ORIGINAL_PACKET_ROOT="data/review/card-backfill/UC-338"
RECEIPT="data/review/estate-debt/COLLECT-012-CANONICAL-ADOPTION.json"
PUBLICATION="data/review/estate-debt/COLLECT-012-PUBLICATION.json"
LEDGER="data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json"
DESTINATION="images/uc-338-still-fe30c21c2a17.jpg"

# Exact-head transaction custody.
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
test -e "$EXECUTOR"
test -e "$RUNNER"
test -e "$PACKET_PUBLICATION"
test -e "$PACKET_ROOT/manifest.json"
test -e "$PACKET_ROOT/SHA256SUMS"
test -e "$ORIGINAL_PACKET_ROOT/manifest.json"
test ! -e "$DESTINATION"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-012 final imported-packet adoption started on workflow run $GITHUB_RUN_ID.

Authorized head: $AUTHORIZED_HEAD.
Exact authorized set: UC-338/still, David Brierly's Season 17 K9 record.
Expected payment: 54 → 55 canonical adoptions; 1 → 0 remaining packet obligations; 730 → 731 complete pairs; 340 → 339 missing stills.

The original deferred packet remains preserved. The replacement packet is bound to the official Horns of Nimon Season 17 page and a byte-distinct K9 asset. No acceptance receipt will exist until the complete one-record candidate tree passes the repository and rendered-browser gate. The final publication-custody tree will pass the same complete gate again.
EOF_COMMENT

node --check "$EXECUTOR"
node scripts/estate-canonical-adoption-ledger.mjs
node "$EXECUTOR" | tee /tmp/COLLECT-012-preflight.json
test "$(node -p "require('/tmp/COLLECT-012-preflight.json').authorized")" = "1"
test "$(node -p "require('/tmp/COLLECT-012-preflight.json').pending")" = "1"
test "$(node -p "require('/tmp/COLLECT-012-preflight.json').already_adopted")" = "0"
test "$(node -p "require('/tmp/COLLECT-012-preflight.json').stills")" = "1"
test "$(node -p "require('/tmp/COLLECT-012-preflight.json').expected_cumulative_after")" = "55"
test "$(node -p "require('/tmp/COLLECT-012-preflight.json').expected_remaining_after")" = "0"
cp data/quality.json /tmp/COLLECT-012-quality-before.json

node "$EXECUTOR" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --report /tmp/COLLECT-012-apply.json \
  --write
test "$(node -p "require('/tmp/COLLECT-012-apply.json').counts.adopted")" = "1"
test "$(node -p "require('/tmp/COLLECT-012-apply.json').counts.already_adopted")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

git diff --quiet -- "$PACKET_ROOT" "$ORIGINAL_PACKET_ROOT"

npm run media:audit -- sync
node scripts/shard.mjs
node scripts/build-record-pages.mjs

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-012-quality-before.json \
  --validate | tee /tmp/COLLECT-012-validation.json
test "$(node -p "require('/tmp/COLLECT-012-validation.json').adoptions")" = "1"
test "$(node -p "require('/tmp/COLLECT-012-validation.json').quality.complete_pairs")" = "1"
test "$(node -p "require('/tmp/COLLECT-012-validation.json').quality.missing_still")" = "-1"
test "$(node -p "require('/tmp/COLLECT-012-validation.json').quality.missing_portrait")" = "0"
test "$(node -p "require('/tmp/COLLECT-012-validation.json').quality.missing_both")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

echo "$DESTINATION" > /tmp/COLLECT-012-expected-images.txt
git diff --name-only -z > /tmp/COLLECT-012-tracked-paths.zlist
git ls-files --others --exclude-standard -z > /tmp/COLLECT-012-untracked-paths.zlist
node --input-type=module - \
  /tmp/COLLECT-012-expected-images.txt \
  /tmp/COLLECT-012-tracked-paths.zlist \
  /tmp/COLLECT-012-untracked-paths.zlist <<'NODE'
import fs from 'node:fs';
const expectedImages = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/).filter(Boolean).sort();
const readZ = (file) => fs.readFileSync(file).toString('utf8').split('\0').filter(Boolean);
const paths = [...new Set([...readZ(process.argv[3]), ...readZ(process.argv[4])])].sort();
if (!paths.length) throw new Error('COLLECT-012 candidate produced no changed paths');
const actualImages = paths.filter((file) => file.startsWith('images/')).sort();
if (JSON.stringify(actualImages) !== JSON.stringify(expectedImages)) {
  throw new Error(`COLLECT-012 image path mismatch\nexpected=${expectedImages.join(',')}\nactual=${actualImages.join(',')}`);
}
const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file));
if (unexpected.length) throw new Error(`COLLECT-012 candidate escaped product boundary: ${unexpected.join(', ')}`);
if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json')) throw new Error('canonical ledgers were not changed');
console.log(`PASS — ${paths.length} changed paths contain the exact Season 17 K9 still and remain inside data/, records/, and the ruled destination set`);
NODE

test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
git add -A
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-012-candidate.patch
git write-tree > /tmp/COLLECT-012-candidate.tree
git diff --cached --quiet && { echo 'COLLECT-012 produced no staged candidate tree.' >&2; exit 1; }

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-012-candidate.tree)" = "$(git write-tree)"
git diff --quiet --cached "$AUTHORIZED_HEAD" -- "$PACKET_ROOT" "$ORIGINAL_PACKET_ROOT"
node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-012-quality-before.json \
  --validate
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

node "$EXECUTOR" \
  --before-quality /tmp/COLLECT-012-quality-before.json \
  --authorized-parent "$AUTHORIZED_HEAD" \
  --gated-tree "$(cat /tmp/COLLECT-012-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --promote | tee /tmp/COLLECT-012-promotion.json
test "$(node -p "require('/tmp/COLLECT-012-promotion.json').canonical_adoptions")" = "55"
test "$(node -p "require('/tmp/COLLECT-012-promotion.json').remaining")" = "0"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-012-ledger-validation.json
git add -- "$RECEIPT" "$LEDGER"
git diff --exit-code

PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-012-candidate.tree)" | sort)"
EXPECTED_PROMOTION_PATHS="$(printf '%s\n%s\n' "$LEDGER" "$RECEIPT" | sort)"
test "$PROMOTION_PATHS" = "$EXPECTED_PROMOTION_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-012-adoption.patch
git write-tree > /tmp/COLLECT-012-adoption.tree

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit \
  -m 'Estate collection: adopt final Season 17 K9 packet' \
  -m 'transaction=COLLECT-012' \
  -m 'batch=8' \
  -m 'batch_adoptions=1' \
  -m 'stills=1' \
  -m 'cumulative_adoptions=55' \
  -m 'remaining_packet_review=0' \
  -m 'complete_pairs_delta=1' \
  -m 'missing_still_delta=-1' \
  -m 'missing_portrait_delta=0' \
  -m 'missing_both_delta=0' \
  -m 'distinct_era_media=true' \
  -m 'imported_packet_estate_exhausted=true' \
  -m "authorized_parent=${AUTHORIZED_HEAD}" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-012-candidate.tree)" \
  -m "published_adoption_tree=$(cat /tmp/COLLECT-012-adoption.tree)"
ADOPTION_HEAD="$(git rev-parse HEAD)"
ADOPTION_TREE="$(git rev-parse HEAD^{tree})"
test "$ADOPTION_TREE" = "$(cat /tmp/COLLECT-012-adoption.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

node "$EXECUTOR" \
  --adoption-head "$ADOPTION_HEAD" \
  --adoption-tree "$ADOPTION_TREE" \
  --gated-tree "$(cat /tmp/COLLECT-012-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --reconciliation-parent "$ADOPTION_HEAD" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --reconcile | tee /tmp/COLLECT-012-reconciliation.json
test "$(node -p "require('/tmp/COLLECT-012-reconciliation.json').canonical_adoptions")" = "55"
test "$(node -p "require('/tmp/COLLECT-012-reconciliation.json').remaining")" = "0"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-012-final-ledger-validation.json

git rm "$EXECUTOR" "$RUNNER"
git add -- "$LEDGER" "$PUBLICATION"
FINAL_PATHS="$(git diff --cached --name-only | sort)"
EXPECTED_FINAL_PATHS="$(printf '%s\n%s\n%s\n%s\n' "$EXECUTOR" "$LEDGER" "$PUBLICATION" "$RUNNER" | sort)"
test "$FINAL_PATHS" = "$EXPECTED_FINAL_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-012-publication.patch
git write-tree > /tmp/COLLECT-012-publication.tree

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-012-publication.tree)" = "$(git write-tree)"
node scripts/estate-canonical-adoption-ledger.mjs

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$ADOPTION_HEAD"
git commit \
  -m 'Estate custody: reconcile final imported packet publication' \
  -m 'transaction=COLLECT-012' \
  -m "adoption_head=${ADOPTION_HEAD}" \
  -m "adoption_tree=${ADOPTION_TREE}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-012-candidate.tree)" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_publication_tree=$(cat /tmp/COLLECT-012-publication.tree)"
FINAL_HEAD="$(git rev-parse HEAD)"
FINAL_TREE="$(git rev-parse HEAD^{tree})"
test "$FINAL_TREE" = "$(cat /tmp/COLLECT-012-publication.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${ADOPTION_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-012 passed every gate and paid the final imported packet obligation on workflow run $GITHUB_RUN_ID.

```text
adoption head:          $ADOPTION_HEAD
final custody head:     $FINAL_HEAD
candidate tree:         $(cat /tmp/COLLECT-012-candidate.tree)
adoption tree:          $ADOPTION_TREE
final custody tree:     $(cat /tmp/COLLECT-012-publication.tree)
adopted stills:          1
cumulative:             55 / 55
remaining review:        0
complete pairs:        730 → 731
missing stills:        340 → 339
missing portraits:     350 → 350
missing both:          107 → 107
```

The candidate tree passed the complete repository and rendered-browser gate before any receipt existed. The final publication-custody tree passed the same complete gate again. The original UC-338 packet remains preserved, the cross-card duplicate policy was not lowered, and the executor and runner retired themselves. The imported 55-packet estate is fully adjudicated and canonically paid.
EOF_COMMENT
