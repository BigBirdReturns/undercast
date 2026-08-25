#!/usr/bin/env bash
set -Eeuo pipefail
git reset --soft "$CLAIM_COMMIT"
git add -A
git diff --cached --name-only | LC_ALL=C sort > "$OUT/candidate-paths.txt"
test -s "$OUT/candidate-paths.txt"
test "$(grep -c '^data/review/adapter-sdk/star-trek-benbassat-candidate.json$' "$OUT/candidate-paths.txt")" = 1
test "$(grep -c '^images/uc-1397-' "$OUT/candidate-paths.txt" || true)" = 0
if grep -E '(^\.github/|^transport/|__pycache__|\.pyc$)' "$OUT/candidate-paths.txt"; then
  echo "candidate contains transport or bytecode residue" >&2
  exit 1
fi
git config user.name undercast-benbassat-candidate-v4
git config user.email undercast-benbassat-candidate-v4@users.noreply.github.com
git commit -m 'Star Trek: stage corrected Benbassat candidate v4'
candidate_commit="$(git rev-parse HEAD)"
candidate_tree="$(git show -s --format=%T HEAD)"
test "$(git show -s --format=%P HEAD)" = "$CLAIM_COMMIT"
jq -n --arg commit "$candidate_commit" --arg tree "$candidate_tree" --arg parent "$CLAIM_COMMIT" --arg task "$TASK_ID" --arg wall "$WALL_ID" --arg lease "$EXPECTED_LEASE" --arg live_main "$LIVE_MAIN" --arg live_tree "$LIVE_TREE" \
  '{version:7,transaction:"STAR-TREK-BENBASSAT-CANDIDATE-PUBLICATION-V7",commit:$commit,tree:$tree,parent:$parent,publication_base:{commit:$live_main,tree:$live_tree},task_id:$task,lease_id:$lease,wall_id:$wall,canonical_mutation:false,independent_review_pending:true,waterline_pending:true}' \
  > "$OUT/candidate-commit.json"
find "$OUT" -type f ! -name manifest.sha256 -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > "$OUT/manifest.sha256"
git push origin "HEAD:refs/heads/${RESULT_BRANCH}"
