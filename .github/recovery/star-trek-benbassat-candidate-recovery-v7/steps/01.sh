#!/usr/bin/env bash
set -Eeuo pipefail
rm -rf "$OUT"
mkdir -p "$REVIEW_ROOT" "$MEDIA_ROOT" "$SETTLEMENT_ROOT"
cp "$LIFECYCLE_SOURCE" "$LIFECYCLE"
cp "$BATCH_SOURCE" "$BATCH"
chmod +x "$LIFECYCLE"
python3 -m py_compile "$LIFECYCLE"
test "$(sha256sum "$BATCH" | awk '{print $1}')" = 3609c0bd26a68a4fe3ec93f1fddc5ea230e64e329ac5d92fdb1205ec21c35519
sha256sum "$LIFECYCLE" "$BATCH" > "$OUT/lifecycle.sha256"
test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"

git fetch --no-tags origin main "$CLAIM_BRANCH" "$SOURCE_REVIEW_BRANCH" "$MEDIA_BRANCH" "$SETTLEMENT_BRANCH"
test "$(git rev-parse refs/remotes/origin/main)" = "$LIVE_MAIN"
test "$(git show -s --format=%T "$LIVE_MAIN")" = "$LIVE_TREE"
test "$(git show -s --format=%P "$LIVE_MAIN")" = "$EXPECTED_MAIN"
test "$(git show -s --format=%s "$LIVE_MAIN")" = "$LIVE_MESSAGE"
git diff --name-only "$EXPECTED_MAIN..$LIVE_MAIN" | LC_ALL=C sort > "$OUT/live-maintenance-paths.txt"
printf "%s\n" "data/MEDIA-SEARCH-LATEST.json" "data/journal/media-search.jsonl" > "$OUT/expected-maintenance-paths.txt"
diff -u "$OUT/expected-maintenance-paths.txt" "$OUT/live-maintenance-paths.txt"

source_ref="refs/remotes/origin/${SOURCE_REVIEW_BRANCH}"
media_ref="refs/remotes/origin/${MEDIA_BRANCH}"
settlement_ref="refs/remotes/origin/${SETTLEMENT_BRANCH}"
claim_ref="refs/remotes/origin/${CLAIM_BRANCH}"

git show "${source_ref}:${SOURCE_REVIEW_PATH}" > "$REVIEW_ROOT/source-review.json"
git show "${media_ref}:${MEDIA_PATH}" > "$MEDIA_ROOT/media-receipt.json"
git show "${settlement_ref}:${SETTLEMENT_PATH}" > "$SETTLEMENT_ROOT/settlement.json"

jq -e \
  --arg task "$TASK_ID" --arg performer "$EXPECTED_PERFORMER" --arg character "$EXPECTED_CHARACTER" --arg fp "$EXPECTED_FINGERPRINT" \
  '.transaction == "STAR-TREK-BENBASSAT-SOURCE-REVIEW-V1"
   and .verdict == "pass"
   and .review_sha256 == env.EXPECTED_SOURCE_REVIEW_SHA
   and .task.id == $task and .task.performer == $performer and .task.character == $character and .task.source_fingerprint == $fp
   and .production_source.series == "Star Trek: Picard"
   and .production_source.title == "Võx"
   and .production_source.year == "2023"
   and .adjudication.adjudicated_kind == "voice"
   and .adjudication.performance_mode == "voice-only"
   and .adjudication.physical_prosthetic_hint_accepted == false
   and .adjudication.physical_performance_attributed == false
   and .adjudication.prosthetic_performance_attributed == false
   and .adjudication.animation_performance_attributed == false
   and .adjudication.maker_attribution == "unresolved"' \
  "$REVIEW_ROOT/source-review.json" >/dev/null

jq -e \
  --arg task "$TASK_ID" --arg lease "$EXPECTED_LEASE" --arg wall "$WALL_ID" \
  '.transaction == "STAR-TREK-BENBASSAT-MEDIA-V1"
   and .status == "complete"
   and .receipt_sha256 == env.EXPECTED_MEDIA_RECEIPT_SHA
   and .task.id == $task and .task.lease_id == $lease and .task.wall_id_reserved == $wall
   and .task.performance_mode == "voice-only"
   and .facets.still.status == "absent"
   and .facets.portrait.status == "absent"
   and .boundary.cross_facet_substitution == false
   and .boundary.physical_performance_attributed == false
   and .boundary.prosthetic_performance_attributed == false
   and .boundary.animation_performance_attributed == false
   and .boundary.canonical_mutation == false
   and .boundary.lease_mutation == false' \
  "$MEDIA_ROOT/media-receipt.json" >/dev/null

jq -e \
  --arg task "$TASK_ID" --arg lease "$EXPECTED_LEASE" --arg wall "$WALL_ID" \
  '.transaction == "STAR-TREK-BENBASSAT-PREPRODUCT-SETTLEMENT-V2"
   and .status == "preproduct-ready"
   and .receipt_sha256 == env.EXPECTED_SETTLEMENT_SHA
   and .canonical.commit == env.EXPECTED_MAIN
   and .canonical.tree == env.EXPECTED_TREE
   and .task.id == $task and .task.lease_id == $lease and .task.wall_id_reserved == $wall
   and .task.status == "leased" and .task.attempts == 1
   and .queue == {total:2228,queued:1797,resolved:428,blocked:0,rejected:2,in_flight:1}
   and .adjudication.adjudicated_kind == "voice"
   and .adjudication.performance_mode == "voice-only"
   and .adjudication.production == "Star Trek: Picard"
   and .adjudication.episode == "Võx"
   and .layers.media.still.status == "absent"
   and .layers.media.portrait.status == "absent"
   and .boundary.single_lease_durable == true
   and .boundary.honest_media_absence == true
   and .boundary.product_staged == false
   and .boundary.canonical_mutation == false
   and .boundary.additional_lease_issued == false' \
  "$SETTLEMENT_ROOT/settlement.json" >/dev/null

python3 - <<'PY'
from pathlib import Path
import hashlib
import json
import os

def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value

checks = [
    (Path(os.environ["REVIEW_ROOT"]) / "source-review.json", "review_sha256", ("artifact",)),
    (Path(os.environ["MEDIA_ROOT"]) / "media-receipt.json", "receipt_sha256", ("artifact",)),
    (Path(os.environ["SETTLEMENT_ROOT"]) / "settlement.json", "receipt_sha256", ("artifact",)),
]
for path, field, omitted in checks:
    payload = json.loads(path.read_text())
    expected = payload[field]
    body = dict(payload)
    body.pop(field, None)
    for key in omitted:
        body.pop(key, None)
    actual = hashlib.sha256(
        (json.dumps(stable(body), indent=2, ensure_ascii=False) + "\n").encode()
    ).hexdigest()
    if actual != expected:
        raise SystemExit(f"{path.name} identity mismatch: {actual} != {expected}")
PY

claim_commit="$(git rev-parse "$claim_ref")"
claim_tree="$(git show -s --format=%T "$claim_ref")"
test "$claim_commit" = "$EXPECTED_CLAIM_COMMIT"
test "$claim_tree" = "$EXPECTED_CLAIM_TREE"
test "$(git show -s --format=%P "$claim_ref")" = "$EXPECTED_MAIN"
echo "CLAIM_COMMIT=$claim_commit" >> "$GITHUB_ENV"
git checkout --detach "$claim_ref"
git clean -fdx
test -z "$(git status --porcelain)"
cp data/review/adapter-sdk/star-trek-benbassat-claim.json "$OUT/claim-receipt.json"
jq -e \
  --arg task "$TASK_ID" \
  --arg lease "$EXPECTED_LEASE" \
  '.transaction == "STAR-TREK-BENBASSAT-CLAIM-V1"
   and .receipt_sha256 == env.EXPECTED_CLAIM_RECEIPT_SHA
   and .task.id == $task
   and .task.status == "leased"
   and .lease.id == $lease
   and .source_review.production == "Star Trek: Picard"
   and .source_review.episode == "Võx"
   and .source_review.performance_mode == "voice-only"
   and .boundary.product_staged == false
   and .boundary.canonical_mutation == false
   and .boundary.additional_lease_issued == false' \
  "$OUT/claim-receipt.json" >/dev/null
python3 - <<'PY'
from pathlib import Path
import hashlib
import json
import os

path = Path(os.environ["OUT"]) / "claim-receipt.json"
payload = json.loads(path.read_text())
expected = payload["receipt_sha256"]
body = dict(payload)
body.pop("receipt_sha256", None)

def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value

actual = hashlib.sha256(
    (json.dumps(stable(body), indent=2, ensure_ascii=False) + "\n").encode()
).hexdigest()
if actual != expected:
    raise SystemExit(f"claim receipt identity mismatch: {actual} != {expected}")
PY
npm ci --ignore-scripts
cp "$BATCH" "$OUT/batch.json"
gh api "/repos/${GITHUB_REPOSITORY}/branches/main" > "$OUT/main-before.json"
test "$(jq -r .commit.sha "$OUT/main-before.json")" = "$LIVE_MAIN"

