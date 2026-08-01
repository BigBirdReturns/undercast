#!/usr/bin/env bash
set -euo pipefail

PAYLOAD="scripts/estate-adopt-uc338-013.py.gz.b64"
EXECUTOR="/tmp/estate-adopt-uc338-013.py"
EXECUTOR_SHA256="3722dbbe9e4c25ab7c45d2fc0881946df428960df8d36fa79e6759859905f46a"
RUNNER="scripts/estate-run-collect013.sh"
PACKET_PUBLICATION="data/review/estate-debt/COLLECT-012-UC338-SEASON17-PACKET-PUBLICATION.json"
MANIFEST="data/review/card-backfill/UC-338-season17-replacement/manifest.json"
ADJUDICATION="data/review/card-backfill/UC-338-season17-replacement/adjudication-receipt.json"
RECEIPT="data/review/estate-debt/COLLECT-013-CANONICAL-ADOPTION.json"
PUBLICATION="data/review/estate-debt/COLLECT-013-PUBLICATION.json"
LEDGER="data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json"
EXPECTED_IMAGE="images/uc-338-still-fe30c21c2a17.jpg"

# Exact-head transaction custody.
test "$(git rev-parse HEAD)" = "$AUTHORIZED_HEAD"
git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
test -z "$(git status --porcelain)"
test -e "$PAYLOAD"
test -e "$RUNNER"
test -e "$PACKET_PUBLICATION"
test -e "$MANIFEST"
test -e "$ADJUDICATION"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
test ! -e "$EXPECTED_IMAGE"
base64 -d "$PAYLOAD" | gzip -d > "$EXECUTOR"
test "$(sha256sum "$EXECUTOR" | awk '{print $1}')" = "$EXECUTOR_SHA256"
chmod 700 "$EXECUTOR"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-013 final imported-packet adoption started on workflow run $GITHUB_RUN_ID.

Authorized head: $AUTHORIZED_HEAD.
Exact authorized object: UC-338/still — David Brierly-era K9 from the official Season 17 *Horns of Nimon* source chain.
Expected payment: 54 → 55 canonical adoptions; 1 → 0 remaining imported packet obligations; 730 → 731 complete pairs; 340 → 339 missing stills.

No acceptance receipt will exist until the exact candidate tree passes the complete repository and rendered-browser gate. The final zero-debt publication-custody tree will pass the same complete gate again.
EOF_COMMENT

python3 -m py_compile "$EXECUTOR"
node scripts/estate-canonical-adoption-ledger.mjs
python3 "$EXECUTOR" | tee /tmp/COLLECT-013-preflight.json
test "$(node -p "require('/tmp/COLLECT-013-preflight.json').authorized")" = "1"
test "$(node -p "require('/tmp/COLLECT-013-preflight.json').pending")" = "1"
test "$(node -p "require('/tmp/COLLECT-013-preflight.json').already_adopted")" = "0"
test "$(node -p "require('/tmp/COLLECT-013-preflight.json').stills")" = "1"
test "$(node -p "require('/tmp/COLLECT-013-preflight.json').expected_cumulative_after")" = "55"
test "$(node -p "require('/tmp/COLLECT-013-preflight.json').expected_remaining_after")" = "0"
cp data/quality.json /tmp/COLLECT-013-quality-before.json

python3 "$EXECUTOR" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --report /tmp/COLLECT-013-apply.json \
  --write
test "$(node -p "require('/tmp/COLLECT-013-apply.json').counts.adopted")" = "1"
test "$(node -p "require('/tmp/COLLECT-013-apply.json').counts.already_adopted")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

npm run media:audit -- sync
node scripts/shard.mjs
node scripts/build-record-pages.mjs

python3 "$EXECUTOR" \
  --before-quality /tmp/COLLECT-013-quality-before.json \
  --validate | tee /tmp/COLLECT-013-validation.json
test "$(node -p "require('/tmp/COLLECT-013-validation.json').adoptions")" = "1"
test "$(node -p "require('/tmp/COLLECT-013-validation.json').quality.complete_pairs")" = "1"
test "$(node -p "require('/tmp/COLLECT-013-validation.json').quality.missing_still")" = "-1"
test "$(node -p "require('/tmp/COLLECT-013-validation.json').quality.missing_portrait")" = "0"
test "$(node -p "require('/tmp/COLLECT-013-validation.json').quality.missing_both")" = "0"
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

git diff --name-only -z > /tmp/COLLECT-013-tracked-paths.zlist
git ls-files --others --exclude-standard -z > /tmp/COLLECT-013-untracked-paths.zlist
node --input-type=module - \
  "$EXPECTED_IMAGE" \
  /tmp/COLLECT-013-tracked-paths.zlist \
  /tmp/COLLECT-013-untracked-paths.zlist <<'NODE'
import fs from 'node:fs';
const expectedImage = process.argv[2];
const readZ = (file) => fs.readFileSync(file).toString('utf8').split('\0').filter(Boolean);
const paths = [...new Set([...readZ(process.argv[3]), ...readZ(process.argv[4])])].sort();
if (!paths.length) throw new Error('COLLECT-013 candidate produced no changed paths');
const actualImages = paths.filter((file) => file.startsWith('images/')).sort();
if (JSON.stringify(actualImages) !== JSON.stringify([expectedImage])) {
  throw new Error(`COLLECT-013 image path mismatch\nexpected=${expectedImage}\nactual=${actualImages.join(',')}`);
}
const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && file !== expectedImage);
if (unexpected.length) throw new Error(`COLLECT-013 candidate escaped product boundary: ${unexpected.join(', ')}`);
if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json')) throw new Error('canonical ledgers were not changed');
console.log(`PASS — ${paths.length} changed paths contain the exact Season 17 K9 still and remain inside data/, records/, and the ruled destination`);
NODE

test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"
git add -A
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-013-candidate.patch
git write-tree > /tmp/COLLECT-013-candidate.tree
git diff --cached --quiet && { echo 'COLLECT-013 produced no staged candidate tree.' >&2; exit 1; }

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-013-candidate.tree)" = "$(git write-tree)"
python3 "$EXECUTOR" \
  --before-quality /tmp/COLLECT-013-quality-before.json \
  --validate
test ! -e "$RECEIPT"
test ! -e "$PUBLICATION"

python3 "$EXECUTOR" \
  --before-quality /tmp/COLLECT-013-quality-before.json \
  --authorized-parent "$AUTHORIZED_HEAD" \
  --gated-tree "$(cat /tmp/COLLECT-013-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --promote | tee /tmp/COLLECT-013-promotion.json
test "$(node -p "require('/tmp/COLLECT-013-promotion.json').canonical_adoptions")" = "55"
test "$(node -p "require('/tmp/COLLECT-013-promotion.json').remaining")" = "0"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-013-ledger-validation.json
git add -- "$RECEIPT" "$LEDGER"
git diff --exit-code

PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-013-candidate.tree)" | sort)"
EXPECTED_PROMOTION_PATHS="$(printf '%s\n%s\n' "$LEDGER" "$RECEIPT" | sort)"
test "$PROMOTION_PATHS" = "$EXPECTED_PROMOTION_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-013-adoption.patch
git write-tree > /tmp/COLLECT-013-adoption.tree

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$AUTHORIZED_HEAD"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit \
  -m 'Estate collection: adopt final imported packet obligation' \
  -m 'transaction=COLLECT-013' \
  -m 'batch=8' \
  -m 'batch_adoptions=1' \
  -m 'stills=1' \
  -m 'cumulative_adoptions=55' \
  -m 'remaining_packet_review=0' \
  -m 'complete_pairs_delta=1' \
  -m 'missing_still_delta=-1' \
  -m 'missing_portrait_delta=0' \
  -m 'missing_both_delta=0' \
  -m 'distinct_media_debt_closed=true' \
  -m 'arbitrary_batch_size=false' \
  -m "authorized_parent=${AUTHORIZED_HEAD}" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-013-candidate.tree)" \
  -m "published_adoption_tree=$(cat /tmp/COLLECT-013-adoption.tree)"
ADOPTION_HEAD="$(git rev-parse HEAD)"
ADOPTION_TREE="$(git rev-parse HEAD^{tree})"
test "$ADOPTION_TREE" = "$(cat /tmp/COLLECT-013-adoption.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

python3 "$EXECUTOR" \
  --adoption-head "$ADOPTION_HEAD" \
  --adoption-tree "$ADOPTION_TREE" \
  --gated-tree "$(cat /tmp/COLLECT-013-candidate.tree)" \
  --workflow-run "$GITHUB_RUN_ID" \
  --reconciliation-parent "$ADOPTION_HEAD" \
  --now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --reconcile | tee /tmp/COLLECT-013-reconciliation.json
test "$(node -p "require('/tmp/COLLECT-013-reconciliation.json').canonical_adoptions")" = "55"
test "$(node -p "require('/tmp/COLLECT-013-reconciliation.json').remaining")" = "0"
node scripts/estate-canonical-adoption-ledger.mjs | tee /tmp/COLLECT-013-final-ledger-validation.json

git rm "$PAYLOAD" "$RUNNER"
rm -f "$EXECUTOR"
git add -- "$LEDGER" "$PUBLICATION"
FINAL_PATHS="$(git diff --cached --name-only | sort)"
EXPECTED_FINAL_PATHS="$(printf '%s\n%s\n%s\n%s\n' "$PAYLOAD" "$LEDGER" "$PUBLICATION" "$RUNNER" | sort)"
test "$FINAL_PATHS" = "$EXPECTED_FINAL_PATHS"
git diff --cached --check
git diff --cached --binary > /tmp/COLLECT-013-publication.patch
git write-tree > /tmp/COLLECT-013-publication.tree

npm run gate

git diff --exit-code
test -z "$(git ls-files --others --exclude-standard)"
test "$(cat /tmp/COLLECT-013-publication.tree)" = "$(git write-tree)"
node scripts/estate-canonical-adoption-ledger.mjs

git fetch origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
test "$(git rev-parse "refs/remotes/origin/${TARGET_BRANCH}")" = "$ADOPTION_HEAD"
git commit \
  -m 'Estate custody: reconcile zero-debt imported packet publication' \
  -m 'transaction=COLLECT-013' \
  -m "adoption_head=${ADOPTION_HEAD}" \
  -m "adoption_tree=${ADOPTION_TREE}" \
  -m "gated_candidate_tree=$(cat /tmp/COLLECT-013-candidate.tree)" \
  -m "workflow_run=${GITHUB_RUN_ID}" \
  -m "gated_publication_tree=$(cat /tmp/COLLECT-013-publication.tree)"
FINAL_HEAD="$(git rev-parse HEAD)"
FINAL_TREE="$(git rev-parse HEAD^{tree})"
test "$FINAL_TREE" = "$(cat /tmp/COLLECT-013-publication.tree)"
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${ADOPTION_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"

gh pr comment "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --body-file - <<EOF_COMMENT
COLLECT-013 passed every gate and paid the final imported packet obligation on workflow run $GITHUB_RUN_ID.

```text
adoption head:          $ADOPTION_HEAD
final custody head:     $FINAL_HEAD
candidate tree:         $(cat /tmp/COLLECT-013-candidate.tree)
adoption tree:          $ADOPTION_TREE
final custody tree:     $(cat /tmp/COLLECT-013-publication.tree)
adopted object:         UC-338/still
cumulative:             55 / 55
remaining review:        0
complete pairs:        730 → 731
missing stills:        340 → 339
missing portraits:     350 → 350
missing both:          107 → 107
```

The exact Season 17 K9 candidate tree passed the complete repository and rendered-browser gate before any receipt existed. The final zero-debt publication-custody tree passed the same complete gate again. The executor payload and runner retired themselves. The imported 55-packet estate is now exhausted without rewriting the original deferred packet or lowering the cross-card duplicate rule.
EOF_COMMENT
