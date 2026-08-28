#!/usr/bin/env bash
set -Eeuo pipefail

jq \
  --argjson id "$ARTIFACT_ID" \
  --arg digest "$ARTIFACT_DIGEST" \
  '.artifact={id:$id,digest:$digest}' \
  "$OUT/media-review.json" > "$OUT/review.tmp"
mv "$OUT/review.tmp" "$OUT/media-review.json"

find "$OUT" -type f ! -name manifest.sha256 -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum > "$OUT/manifest.sha256"
sha256sum -c "$OUT/manifest.sha256"

test "$(git ls-remote origin refs/heads/main | awk '{print $1}')" \
  = "$EXPECTED_MAIN"
test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"

mkdir -p "$PUBLISH/transport/star-trek-henoch-media-review-v1"
cp -a "$OUT"/. "$PUBLISH/transport/star-trek-henoch-media-review-v1/"

export GIT_INDEX_FILE="$INDEX"
rm -f "$GIT_INDEX_FILE"
git read-tree --empty
git --work-tree="$PUBLISH" add -A
result_tree="$(git write-tree)"

export GIT_AUTHOR_NAME=undercast-henoch-media-review-v1
export GIT_AUTHOR_EMAIL=undercast-henoch-media-review-v1@users.noreply.github.com
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
result_commit="$(
  printf '%s\n' "Record Star Trek Henoch independent media review v1" \
    | git commit-tree "$result_tree"
)"

test -z "$(git show -s --format=%P "$result_commit")"
test "$(git show -s --format=%T "$result_commit")" = "$result_tree"
test "$(git show -s --format=%s "$result_commit")" \
  = "Record Star Trek Henoch independent media review v1"

git push origin "${result_commit}:refs/heads/${RESULT_BRANCH}"

test "$(
  git ls-remote origin "refs/heads/${RESULT_BRANCH}" | awk '{print $1}'
)" = "$result_commit"
test "$(git ls-remote origin refs/heads/main | awk '{print $1}')" \
  = "$EXPECTED_MAIN"

git show \
  "${result_commit}:transport/star-trek-henoch-media-review-v1/media-review.json" \
  | jq -e \
      --argjson artifact "$ARTIFACT_ID" \
      --arg digest "$ARTIFACT_DIGEST" \
      '.transaction == "STAR-TREK-HENOCH-INDEPENDENT-MEDIA-REVIEW-V1"
       and .status == "media-review-complete"
       and .verdict == "pass"
       and .artifact == {id:$artifact,digest:$digest}
       and .candidate_staging_admissible == true
       and .boundary.all_four_media_claims_enforced == true
       and .boundary.canonical_mutation == false
       and .boundary.lease_mutation == false
       and .boundary.product_staged == false' \
      >/dev/null
