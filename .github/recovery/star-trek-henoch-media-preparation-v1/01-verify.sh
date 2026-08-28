#!/usr/bin/env bash
set -Eeuo pipefail
rm -rf "$WORK" "$OUT" "$PUBLISH" "$INDEX"
mkdir -p "$OUT/source" "$OUT/review"

test "$(git merge-base HEAD "$EXPECTED_MAIN")" = "$EXPECTED_MAIN"
test "$(git rev-list --count "$EXPECTED_MAIN..HEAD")" = 4
test "$(git show -s --format=%s HEAD)" = "Prepare Star Trek Henoch media v1"
git diff --name-only "$EXPECTED_MAIN" HEAD | LC_ALL=C sort > "$OUT/carrier-paths.txt"
printf '%s\n' \
  .github/recovery/star-trek-henoch-media-preparation-v1/01-verify.sh \
  .github/recovery/star-trek-henoch-media-preparation-v1/02-prepare.sh \
  .github/recovery/star-trek-henoch-media-preparation-v1/03-publish.sh \
  .github/workflows/star-trek-henoch-media-preparation-v1.yml \
  | LC_ALL=C sort > "$OUT/expected-carrier-paths.txt"
diff -u "$OUT/expected-carrier-paths.txt" "$OUT/carrier-paths.txt"

test -z "$(git ls-remote --heads origin "refs/heads/${RESULT_BRANCH}")"

git fetch --no-tags --depth=2 origin \
  "+refs/heads/main:refs/remotes/origin/main"
git fetch --no-tags --depth=2 origin \
  "+refs/heads/${CLAIM_BRANCH}:refs/remotes/origin/${CLAIM_BRANCH}"
git fetch --no-tags --depth=1 origin \
  "+refs/heads/${SOURCE_BRANCH}:refs/remotes/origin/${SOURCE_BRANCH}"
git fetch --no-tags --depth=1 origin \
  "+refs/heads/${SOURCE_REVIEW_BRANCH}:refs/remotes/origin/${SOURCE_REVIEW_BRANCH}"

test "$(git rev-parse refs/remotes/origin/main)" = "$EXPECTED_MAIN"
test "$(git show -s --format=%T "$EXPECTED_MAIN")" = "$EXPECTED_TREE"
test "$(git show -s --format=%P "$EXPECTED_MAIN")" = "$EXPECTED_PARENT"
test "$(git show -s --format=%s "$EXPECTED_MAIN")" = "$EXPECTED_MESSAGE"

claim_ref="refs/remotes/origin/${CLAIM_BRANCH}"
source_ref="refs/remotes/origin/${SOURCE_BRANCH}"
review_ref="refs/remotes/origin/${SOURCE_REVIEW_BRANCH}"

test "$(git rev-parse "$claim_ref")" = "$CLAIM_COMMIT"
test "$(git show -s --format=%T "$claim_ref")" = "$CLAIM_TREE"
test "$(git show -s --format=%P "$claim_ref")" = "$EXPECTED_MAIN"

test "$(git rev-parse "$source_ref")" = "$SOURCE_COMMIT"
test "$(git show -s --format=%T "$source_ref")" = "$SOURCE_TREE"
test -z "$(git show -s --format=%P "$source_ref")"

test "$(git rev-parse "$review_ref")" = "$SOURCE_REVIEW_COMMIT"
test "$(git show -s --format=%T "$review_ref")" = "$SOURCE_REVIEW_TREE"
test -z "$(git show -s --format=%P "$review_ref")"

git show "${claim_ref}:data/review/adapter-sdk/star-trek-henoch-claim.json" \
  > "$OUT/claim-receipt.json"
for name in \
  source-probe.json \
  henoch-source.wikitext \
  henoch-extract.txt \
  manifest.sha256
do
  git show "${source_ref}:transport/star-trek-henoch-source-v1/${name}" \
    > "$OUT/source/${name}"
done
git show \
  "${review_ref}:transport/star-trek-henoch-source-review-v1/source-review.json" \
  > "$OUT/review/source-review.json"

python3 - <<'PY'
from pathlib import Path
from urllib.parse import unquote
import hashlib
import json
import os
import re

out = Path(os.environ["OUT"])

def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value

def verify(path, field, omitted=()):
    payload = json.loads(path.read_text(encoding="utf-8"))
    expected = payload[field]
    body = dict(payload)
    body.pop(field, None)
    for key in omitted:
        body.pop(key, None)
    actual = hashlib.sha256(
        (json.dumps(stable(body), indent=2, ensure_ascii=False) + "\n").encode()
    ).hexdigest()
    if actual != expected:
        raise SystemExit(
            f"{path.name} identity mismatch: {actual} != {expected}"
        )
    return payload

claim = verify(out / "claim-receipt.json", "receipt_sha256")
source = verify(
    out / "source/source-probe.json",
    "receipt_sha256",
    ("artifact",),
)
review = verify(
    out / "review/source-review.json",
    "review_sha256",
    ("artifact",),
)

if claim["receipt_sha256"] != os.environ["CLAIM_RECEIPT_SHA"]:
    raise SystemExit("Henoch claim receipt drifted")
if claim.get("artifact") != {
    "id": int(os.environ["CLAIM_ARTIFACT_ID"]),
    "digest": os.environ["CLAIM_ARTIFACT_DIGEST"],
}:
    raise SystemExit("Henoch claim artifact drifted")

if source["receipt_sha256"] != os.environ["SOURCE_RECEIPT_SHA"]:
    raise SystemExit("Henoch source receipt drifted")
if source.get("artifact") != {
    "id": int(os.environ["SOURCE_ARTIFACT_ID"]),
    "digest": os.environ["SOURCE_ARTIFACT_DIGEST"],
}:
    raise SystemExit("Henoch source artifact drifted")

if review["review_sha256"] != os.environ["SOURCE_REVIEW_SHA"]:
    raise SystemExit("Henoch source-review identity drifted")
if review.get("artifact") != {
    "id": int(os.environ["SOURCE_REVIEW_ARTIFACT_ID"]),
    "digest": os.environ["SOURCE_REVIEW_ARTIFACT_DIGEST"],
}:
    raise SystemExit("Henoch source-review artifact drifted")
if review.get("verdict") != "pass":
    raise SystemExit("Henoch source review did not pass")

expected_task = {
    "id": os.environ["TASK_ID"],
    "performer": os.environ["EXPECTED_PERFORMER"],
    "character": os.environ["EXPECTED_CHARACTER"],
    "source_fingerprint": os.environ["EXPECTED_FINGERPRINT"],
    "status": "leased",
    "attempts": 1,
}
for payload_name, task in (
    ("claim", claim.get("task") or {}),
    ("source", source.get("task") or {}),
    ("review", review.get("task") or {}),
):
    if any(task.get(key) != value for key, value in expected_task.items()):
        raise SystemExit(f"Henoch {payload_name} task drifted: {task}")
if claim["task"].get("performance_modes") != ["physical-prosthetic"]:
    raise SystemExit("Henoch claim mode drifted")
if source["task"].get("performance_modes") != ["physical-prosthetic"]:
    raise SystemExit("Henoch source mode drifted")

if (
    claim.get("lease", {}).get("id") != os.environ["EXPECTED_LEASE"]
    or source.get("claim", {}).get("lease_id")
       != os.environ["EXPECTED_LEASE"]
    or review.get("task", {}).get("lease_id")
       != os.environ["EXPECTED_LEASE"]
):
    raise SystemExit("Henoch lease custody drifted")

expected_queue = {
    "total": 2228,
    "queued": 1794,
    "resolved": 431,
    "blocked": 0,
    "rejected": 2,
    "in_flight": 1,
}
if claim.get("queue", {}).get("after") != expected_queue:
    raise SystemExit("Henoch claim queue drifted")
if source.get("queue") != expected_queue:
    raise SystemExit("Henoch source queue drifted")

adjudication = review.get("adjudication") or {}
required_adjudication = {
    "adjudicated_kind": "physical",
    "performance_mode": "physical-prosthetic",
    "performer": None,
    "embodied_character": "Henoch",
    "host_body": "Spock's body",
    "host_character": "Spock",
    "host_character_prosthetic_continuity": True,
    "physical_performance_attributed": True,
    "prosthetic_performance_attributed": False,
    "makeup_design_attributed": False,
    "series": "Star Trek",
    "episode": "Return to Tomorrow",
    "production": "Return to Tomorrow",
    "year": "1968",
    "first_aired": "9 February 1968",
    "maker_attribution": "unresolved",
    "transformation_measured": False,
}
for key, value in required_adjudication.items():
    if key == "performer":
        continue
    if adjudication.get(key) != value:
        raise SystemExit(
            f"Henoch source adjudication drifted at {key}: "
            f"{adjudication.get(key)!r}"
        )
for key in (
    "animation_labor_attributed",
    "character_design_attributed",
    "sound_attributed",
    "vocal_processing_attributed",
    "voice_direction_attributed",
):
    if adjudication.get(key) is not False:
        raise SystemExit(f"unsupported Henoch attribution appeared: {key}")

boundary = review.get("boundary") or {}
for key in (
    "source_revision_frozen",
    "rendered_revision_frozen",
    "supporting_revisions_frozen_by_second_desk",
    "independent_source_review_complete",
):
    if boundary.get(key) is not True:
        raise SystemExit(f"Henoch review boundary lost {key}")
for key in (
    "canonical_mutation",
    "lease_mutation",
    "additional_lease_issued",
    "media_prepared",
    "product_staged",
    "waterline_cycle_recorded",
):
    if boundary.get(key) is not False:
        raise SystemExit(f"Henoch review boundary drifted at {key}")

image = (
    review.get("media_boundary", {})
    .get("character_page_image", {})
    .get("source")
)
if (
    not image
    or "Spock_inhabited_by_Henoch.jpg" not in unquote(image)
    or review["media_boundary"].get("host_body_image_is_character_evidence")
       is not True
):
    raise SystemExit("Henoch character-still source boundary drifted")
if review["media_boundary"].get("cross_facet_substitution") is not False:
    raise SystemExit("Henoch cross-facet boundary drifted")

frozen = (out / "source/henoch-source.wikitext").read_text(
    encoding="utf-8"
)
for pattern in (
    r"^\|image\s*=\s*Spock inhabited by Henoch\.jpg\s*$",
    r"^\|actor\s*=\s*\[\[Leonard Nimoy\]\]\s*$",
    r"Henoch was played by \[\[Leonard Nimoy\]\]",
    r"occupied \[\[Spock\]\]'s body",
    r"\{\{TOS\|Return to Tomorrow\}\}",
):
    if not re.search(pattern, frozen, flags=re.I | re.M):
        raise SystemExit(
            f"Henoch frozen source lacks media marker: {pattern}"
        )
PY

git worktree add --detach "$WORK" "$CLAIM_COMMIT"
sha256sum "$WORK/data/AUTOPILOT.json" \
  | awk '{print $1}' > "$OUT/autopilot-before.sha256"
