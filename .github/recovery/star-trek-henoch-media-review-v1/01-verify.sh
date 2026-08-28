#!/usr/bin/env bash
set -Eeuo pipefail

rm -rf "$OUT" "$PUBLISH" "$INDEX"
mkdir -p "$OUT"

test "$(git merge-base HEAD "$EXPECTED_MAIN")" = "$EXPECTED_MAIN"
test -z "$(git rev-list --merges "$EXPECTED_MAIN..HEAD")"
test "$(git show -s --format=%s HEAD)" = "$TRIGGER_MESSAGE"

git diff --name-only "$EXPECTED_MAIN" HEAD | LC_ALL=C sort \
  > "$OUT/carrier-paths.txt"
printf '%s\n' \
  .github/recovery/star-trek-henoch-media-review-v1/01-verify.sh \
  .github/recovery/star-trek-henoch-media-review-v1/02-review.sh \
  .github/recovery/star-trek-henoch-media-review-v1/03-publish.sh \
  .github/workflows/star-trek-henoch-media-review-v1.yml \
  | LC_ALL=C sort > "$OUT/expected-carrier-paths.txt"
diff -u "$OUT/expected-carrier-paths.txt" "$OUT/carrier-paths.txt"

test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"

git fetch --no-tags --depth=2 origin \
  "+refs/heads/main:refs/remotes/origin/main"
git fetch --no-tags --depth=1 origin \
  "+refs/heads/${MEDIA_BRANCH}:refs/remotes/origin/${MEDIA_BRANCH}"

test "$(git rev-parse refs/remotes/origin/main)" = "$EXPECTED_MAIN"
test "$(git show -s --format=%T "$EXPECTED_MAIN")" = "$EXPECTED_TREE"
test "$(git show -s --format=%s "$EXPECTED_MAIN")" = "$EXPECTED_MESSAGE"

gh api "/repos/${GITHUB_REPOSITORY}/git/commits/$EXPECTED_MAIN" \
  > "$OUT/main-commit-api.json"
jq -e \
  --arg parent "$EXPECTED_PARENT" \
  '(.parents | map(.sha)) == [$parent]' \
  "$OUT/main-commit-api.json" >/dev/null

media_ref="refs/remotes/origin/${MEDIA_BRANCH}"
test "$(git rev-parse "$media_ref")" = "$MEDIA_COMMIT"
test "$(git show -s --format=%T "$media_ref")" = "$MEDIA_TREE"
test "$(git show -s --format=%s "$media_ref")" = "$MEDIA_MESSAGE"

gh api "/repos/${GITHUB_REPOSITORY}/git/commits/$MEDIA_COMMIT" \
  > "$OUT/media-commit-api.json"
jq -e '(.parents | length) == 0' "$OUT/media-commit-api.json" >/dev/null

git archive "$media_ref" "$MEDIA_PREFIX" | tar -x -C "$OUT"
mv "$OUT/$MEDIA_PREFIX" "$OUT/media"
rm -rf "$OUT/transport"

while read -r digest original; do
  test -n "$digest" || continue
  relative="${original#/tmp/star-trek-henoch-media-v1/}"
  file="$OUT/media/$relative"
  test -f "$file"
  test "$(sha256sum "$file" | awk '{print $1}')" = "$digest"
done < "$OUT/media/manifest.sha256"

python3 - <<'PY'
from pathlib import Path
import hashlib
import json
import os

out = Path(os.environ["OUT"])
media = out / "media"

def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value

def digest(data):
    return hashlib.sha256(data).hexdigest()

receipt = json.loads(
    (media / "media-receipt.json").read_text(encoding="utf-8")
)
identity = receipt.get("receipt_sha256")
body = dict(receipt)
body.pop("receipt_sha256", None)
body.pop("artifact", None)
actual = digest(
    (json.dumps(stable(body), indent=2, ensure_ascii=False) + "\n").encode()
)
if identity != os.environ["MEDIA_RECEIPT_SHA"] or actual != identity:
    raise SystemExit(
        f"Henoch media receipt identity drifted: {identity} / {actual}"
    )

expected_artifact = {
    "id": int(os.environ["MEDIA_ARTIFACT_ID"]),
    "digest": os.environ["MEDIA_ARTIFACT_DIGEST"],
}
if receipt.get("artifact") != expected_artifact:
    raise SystemExit("Henoch media artifact custody drifted")

if (
    receipt.get("transaction")
    != "STAR-TREK-HENOCH-MEDIA-PREPARATION-V1"
    or receipt.get("status")
    != "media-prepared-pending-independent-review"
):
    raise SystemExit("Henoch media transaction boundary drifted")

canonical = receipt.get("canonical") or {}
if canonical != {
    "commit": os.environ["EXPECTED_MAIN"],
    "tree": os.environ["EXPECTED_TREE"],
    "parent": os.environ["EXPECTED_PARENT"],
    "message": os.environ["EXPECTED_MESSAGE"],
}:
    raise SystemExit(f"Henoch media canonical custody drifted: {canonical}")

expected_task = {
    "id": os.environ["TASK_ID"],
    "performer": os.environ["EXPECTED_PERFORMER"],
    "character": os.environ["EXPECTED_CHARACTER"],
    "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
    "performance_modes": ["physical-prosthetic"],
    "status": "leased",
    "attempts": 1,
    "lease_id": os.environ["EXPECTED_LEASE"],
}
if receipt.get("task") != expected_task:
    raise SystemExit(f"Henoch media task custody drifted: {receipt.get('task')}")

expected_queue = {
    "total": 2228,
    "queued": 1794,
    "resolved": 431,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 1,
}
if receipt.get("queue") != expected_queue:
    raise SystemExit(f"Henoch media queue drifted: {receipt.get('queue')}")

adjudication = receipt.get("adjudication") or {}
required = {
    "adjudicated_kind": "physical",
    "performance_mode": "physical-prosthetic",
    "embodied_character": "Henoch",
    "host_body": "Spock's body",
    "host_character": "Spock",
    "host_character_prosthetic_continuity": True,
    "physical_performance_attributed": True,
    "prosthetic_performance_attributed": False,
    "makeup_design_attributed": False,
    "character_design_attributed": False,
    "episode": "Return to Tomorrow",
    "production": "Return to Tomorrow",
    "series": "Star Trek",
    "first_aired": "9 February 1968",
    "year": "1968",
    "maker_attribution": "unresolved",
    "transformation_measured": False,
}
for key, value in required.items():
    if adjudication.get(key) != value:
        raise SystemExit(
            f"Henoch media adjudication drifted at {key}: "
            f"{adjudication.get(key)!r}"
        )

still = receipt.get("still") or {}
portrait = receipt.get("portrait") or {}
if still.get("title") != "File:Spock inhabited by Henoch.jpg":
    raise SystemExit("Henoch still source title drifted")
if still.get("expected_subject") != "Henoch occupying Spock's body":
    raise SystemExit("Henoch still subject drifted")
if portrait.get("title") != "File:Leonard Nimoy by Gage Skidmore.jpg":
    raise SystemExit("Leonard Nimoy portrait source title drifted")
if portrait.get("expected_subject") != "Leonard Nimoy":
    raise SystemExit("Leonard Nimoy portrait subject drifted")
if portrait.get("author") != "Gage Skidmore":
    raise SystemExit("Leonard Nimoy portrait author drifted")
if portrait.get("license") != "CC BY-SA 3.0":
    raise SystemExit("Leonard Nimoy portrait license drifted")

expected_files = {
    "henoch-still-source.jpg": still.get("source_sha256"),
    "henoch-still.webp": still.get("sha256"),
    "leonard-nimoy-portrait-source.jpg": portrait.get("source_sha256"),
    "leonard-nimoy-portrait.jpg": portrait.get("sha256"),
}
for name, expected in expected_files.items():
    actual = digest((media / name).read_bytes())
    if actual != expected:
        raise SystemExit(f"Henoch media bytes drifted for {name}: {actual}")

if still.get("sha256") != os.environ["EXPECTED_STILL_SHA"]:
    raise SystemExit("Henoch still SHA-256 drifted")
if portrait.get("sha256") != os.environ["EXPECTED_PORTRAIT_SHA"]:
    raise SystemExit("Leonard Nimoy portrait SHA-256 drifted")
if still.get("source_sha256") == portrait.get("source_sha256"):
    raise SystemExit("Henoch source-byte collision appeared")
if still.get("sha256") == portrait.get("sha256"):
    raise SystemExit("Henoch derivative-byte collision appeared")

boundary = receipt.get("boundary") or {}
for key in (
    "character_still_exact_subject",
    "host_body_image_is_character_evidence",
    "performer_portrait_neutral_human",
    "performer_portrait_is_not_character_evidence",
    "source_distinctness_verified",
    "byte_distinctness_verified",
    "physical_performance_attributed",
    "host_character_prosthetic_continuity",
    "new_facet_votes_pending",
):
    if boundary.get(key) is not True:
        raise SystemExit(f"Henoch media boundary lost {key}")
for key in (
    "cross_facet_substitution",
    "prosthetic_performance_attributed",
    "makeup_design_attributed",
    "character_design_attributed",
    "transformation_measured",
    "canonical_mutation",
    "lease_mutation",
    "additional_lease_issued",
    "product_staged",
    "waterline_cycle_recorded",
):
    if boundary.get(key) is not False:
        raise SystemExit(f"Henoch media boundary drifted at {key}")
PY

gh api "/repos/${GITHUB_REPOSITORY}/branches/main" \
  > "$OUT/main-after-verify.json"
test "$(jq -r .commit.sha "$OUT/main-after-verify.json")" \
  = "$EXPECTED_MAIN"
