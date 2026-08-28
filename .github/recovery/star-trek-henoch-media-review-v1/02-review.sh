#!/usr/bin/env bash
set -Eeuo pipefail

python3 -m pip install \
  --disable-pip-version-check \
  --no-input \
  Pillow==11.3.0

python3 - <<'PY'
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageStat

import hashlib
import json
import os

out = Path(os.environ["OUT"])
media = out / "media"
receipt = json.loads(
    (media / "media-receipt.json").read_text(encoding="utf-8")
)

def stable(value):
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [stable(item) for item in value]
    return value

def pretty(value):
    return json.dumps(stable(value), indent=2, ensure_ascii=False) + "\n"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def decode(data):
    with Image.open(BytesIO(data)) as image:
        image.load()
        return image.convert("RGB")

def normalize(data, facet):
    image = decode(data)
    if facet == "still":
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    else:
        image.thumbnail((1200, 1500), Image.Resampling.LANCZOS)
    output = BytesIO()
    if facet == "still":
        image.save(output, format="WEBP", quality=94, method=6)
    else:
        image.save(
            output,
            format="JPEG",
            quality=93,
            optimize=True,
            progressive=False,
        )
    return output.getvalue(), image

def image_statistics(image):
    stat = ImageStat.Stat(image)
    return {
        "dimensions": list(image.size),
        "mean_rgb": [round(value, 4) for value in stat.mean],
        "rms_rgb": [round(value, 4) for value in stat.rms],
        "extrema": [list(pair) for pair in stat.extrema],
    }

def vote_id(side, namespace, asset_sha):
    payload = (
        f"{os.environ['WALL_ID']}|{side}|{namespace}|{asset_sha}"
    )
    return "mv_" + hashlib.sha256(payload.encode()).hexdigest()[:24]

def item_id(side, asset_sha):
    payload = f"{os.environ['WALL_ID']}|{side}|{asset_sha}"
    return "ma_" + hashlib.sha256(payload.encode()).hexdigest()[:24]

still_raw = (media / "henoch-still-source.jpg").read_bytes()
still_published = (media / "henoch-still.webp").read_bytes()
portrait_raw = (media / "leonard-nimoy-portrait-source.jpg").read_bytes()
portrait_published = (media / "leonard-nimoy-portrait.jpg").read_bytes()

still_replay, still_image = normalize(still_raw, "still")
portrait_replay, portrait_image = normalize(portrait_raw, "portrait")

if still_replay != still_published:
    raise SystemExit("independent Henoch still replay differs from publication")
if portrait_replay != portrait_published:
    raise SystemExit("independent Leonard Nimoy portrait replay differs from publication")

still_sha = digest(still_published)
portrait_sha = digest(portrait_published)
if still_sha != os.environ["EXPECTED_STILL_SHA"]:
    raise SystemExit("Henoch still identity drifted during replay")
if portrait_sha != os.environ["EXPECTED_PORTRAIT_SHA"]:
    raise SystemExit("Leonard Nimoy portrait identity drifted during replay")
if still_sha == portrait_sha:
    raise SystemExit("Henoch reviewed derivatives collide")

still_stats = image_statistics(still_image)
portrait_stats = image_statistics(portrait_image)
if still_stats["dimensions"] != receipt["still"]["dimensions"]:
    raise SystemExit("Henoch still dimensions drifted during review")
if portrait_stats["dimensions"] != receipt["portrait"]["dimensions"]:
    raise SystemExit("Leonard Nimoy portrait dimensions drifted during review")
for name, stats in (("still", still_stats), ("portrait", portrait_stats)):
    if any(high - low < 32 for low, high in stats["extrema"]):
        raise SystemExit(f"{name} derivative lacks expected tonal range")

still_item = item_id("still", still_sha)
portrait_item = item_id("portrait", portrait_sha)
expected_ids = {
    "still": os.environ["STILL_ITEM_ID"],
    "portrait": os.environ["PORTRAIT_ITEM_ID"],
}
if still_item != expected_ids["still"]:
    raise SystemExit("Henoch still item identity drifted")
if portrait_item != expected_ids["portrait"]:
    raise SystemExit("Henoch portrait item identity drifted")

reviewed_at = (
    datetime.now(timezone.utc)
    .replace(microsecond=0)
    .isoformat()
    .replace("+00:00", "Z")
)

still_votes = [
    {
        "id": vote_id("still", "identity", still_sha),
        "side": "still",
        "namespace": "identity",
        "value": "expected",
        "asset_sha256": still_sha,
        "reviewer": "chatgpt-henoch-still-identity-v1",
        "role": "second-desk",
        "enforced": True,
        "at": reviewed_at,
        "note": (
            "The exact Memory Alpha file title, frozen Henoch role source, "
            "and source-review host-body mechanism bind this derivative to "
            "Henoch occupying Spock's body."
        ),
        "evidence": [
            {"type": "asset-sha256", "value": still_sha},
            {"type": "source-sha256", "value": receipt["still"]["source_sha256"]},
            {"type": "source", "value": receipt["still"]["source_page"]},
            {"type": "file-title", "value": receipt["still"]["title"]},
        ],
    },
    {
        "id": vote_id("still", "presentation", still_sha),
        "side": "still",
        "namespace": "presentation",
        "value": "character-depiction",
        "asset_sha256": still_sha,
        "reviewer": "chatgpt-henoch-still-presentation-v1",
        "role": "second-desk",
        "enforced": True,
        "at": reviewed_at,
        "note": (
            "Direct review of the exact derivative shows the single Spock-body "
            "performance frame in Starfleet costume holding a cylindrical device. "
            "The image is filed as Henoch character evidence under the reviewed "
            "possession mechanism, not as generic performer portraiture."
        ),
        "evidence": [
            {"type": "asset-sha256", "value": still_sha},
            {"type": "visual-observation", "value": "single host-body character frame"},
            {"type": "reviewed-mechanism", "value": "Henoch occupying Spock's body"},
        ],
    },
]

portrait_votes = [
    {
        "id": vote_id("portrait", "identity", portrait_sha),
        "side": "portrait",
        "namespace": "identity",
        "value": "expected",
        "asset_sha256": portrait_sha,
        "reviewer": "chatgpt-henoch-portrait-identity-v1",
        "role": "second-desk",
        "enforced": True,
        "at": reviewed_at,
        "note": (
            "Identity is accepted from the exact Commons title, description, "
            "author, license, page ID, and archived source bytes. No facial "
            "recognition or biometric inference is used."
        ),
        "evidence": [
            {"type": "asset-sha256", "value": portrait_sha},
            {"type": "source-sha256", "value": receipt["portrait"]["source_sha256"]},
            {"type": "source", "value": receipt["portrait"]["source_page"]},
            {"type": "file-title", "value": receipt["portrait"]["title"]},
            {"type": "author", "value": receipt["portrait"]["author"]},
            {"type": "license", "value": receipt["portrait"]["license"]},
        ],
    },
    {
        "id": vote_id("portrait", "presentation", portrait_sha),
        "side": "portrait",
        "namespace": "presentation",
        "value": "neutral-human",
        "asset_sha256": portrait_sha,
        "reviewer": "chatgpt-henoch-portrait-presentation-v1",
        "role": "second-desk",
        "enforced": True,
        "at": reviewed_at,
        "note": (
            "Direct review of the exact derivative shows an out-of-character "
            "public-event portrait in ordinary dark clothing and glasses, without "
            "Starfleet uniform or filed Henoch character presentation."
        ),
        "evidence": [
            {"type": "asset-sha256", "value": portrait_sha},
            {"type": "visual-observation", "value": "neutral out-of-character public-event portrait"},
            {"type": "cross-facet-exclusion", "value": "not Henoch or Spock character evidence"},
        ],
    },
]

review = {
    "version": 1,
    "transaction": "STAR-TREK-HENOCH-INDEPENDENT-MEDIA-REVIEW-V1",
    "status": "media-review-complete",
    "reviewed_at": reviewed_at,
    "reviewer": "chatgpt-henoch-independent-media-reviewer-v1",
    "reviewed_role": "second-desk",
    "verdict": "pass",
    "canonical": receipt["canonical"],
    "media": {
        "branch": os.environ["MEDIA_BRANCH"],
        "commit": os.environ["MEDIA_COMMIT"],
        "tree": os.environ["MEDIA_TREE"],
        "receipt_sha256": receipt["receipt_sha256"],
        "artifact": receipt["artifact"],
    },
    "claim": receipt["claim"],
    "source": receipt["source"],
    "source_review": receipt["source_review"],
    "task": {
        **receipt["task"],
        "wall_id_reserved": os.environ["WALL_ID"],
    },
    "queue": receipt["queue"],
    "adjudication": receipt["adjudication"],
    "still": {
        "item_id": still_item,
        "title": receipt["still"]["title"],
        "source": receipt["still"]["source_page"],
        "source_sha256": receipt["still"]["source_sha256"],
        "sha256": still_sha,
        "bytes": len(still_published),
        "dimensions": list(still_image.size),
        "identity": "expected",
        "presentation": "character-depiction",
        "visual_observation": (
            "Single close Spock-body character frame in Starfleet costume, "
            "holding a cylindrical device."
        ),
        "votes": still_votes,
    },
    "portrait": {
        "item_id": portrait_item,
        "title": receipt["portrait"]["title"],
        "source": receipt["portrait"]["source_page"],
        "source_sha256": receipt["portrait"]["source_sha256"],
        "sha256": portrait_sha,
        "bytes": len(portrait_published),
        "dimensions": list(portrait_image.size),
        "identity": "expected",
        "presentation": "neutral-human",
        "visual_observation": (
            "Out-of-character public-event portrait in ordinary dark clothing "
            "and glasses; no Starfleet uniform or Henoch character presentation."
        ),
        "identity_basis": "source metadata only; no facial recognition",
        "votes": portrait_votes,
    },
    "votes": [*still_votes, *portrait_votes],
    "replay": {
        "pillow_version": "11.3.0",
        "still_normalization": receipt["still"]["normalization"],
        "portrait_normalization": receipt["portrait"]["normalization"],
        "still_byte_match": True,
        "portrait_byte_match": True,
        "still_statistics": still_stats,
        "portrait_statistics": portrait_stats,
    },
    "candidate_staging_admissible": True,
    "boundary": {
        "all_four_media_claims_enforced": True,
        "character_still_exact_subject": True,
        "host_body_image_is_character_evidence": True,
        "performer_portrait_neutral_human": True,
        "performer_portrait_is_not_character_evidence": True,
        "source_distinctness_verified": True,
        "byte_distinctness_verified": True,
        "cross_facet_substitution": False,
        "physical_performance_attributed": True,
        "prosthetic_performance_attributed": False,
        "host_character_prosthetic_continuity": True,
        "makeup_design_attributed": False,
        "character_design_attributed": False,
        "maker_attribution": "unresolved",
        "transformation_measured": False,
        "canonical_mutation": False,
        "lease_mutation": False,
        "additional_lease_issued": False,
        "product_staged": False,
        "waterline_cycle_recorded": False,
    },
}
body = pretty(review)
review["review_sha256"] = digest(body.encode("utf-8"))
(out / "media-review.json").write_text(
    pretty(review),
    encoding="utf-8",
)
(out / "still-replay.webp").write_bytes(still_replay)
(out / "portrait-replay.jpg").write_bytes(portrait_replay)
(out / "visual-review.json").write_text(
    pretty(
        {
            "version": 1,
            "transaction": "STAR-TREK-HENOCH-VISUAL-MEDIA-REVIEW-V1",
            "reviewed_at": reviewed_at,
            "still": {
                "asset_sha256": still_sha,
                "expected_subject": "Henoch occupying Spock's body",
                "identity": "expected",
                "presentation": "character-depiction",
                "observation": review["still"]["visual_observation"],
            },
            "portrait": {
                "asset_sha256": portrait_sha,
                "expected_subject": "Leonard Nimoy",
                "identity": "expected",
                "presentation": "neutral-human",
                "observation": review["portrait"]["visual_observation"],
                "identity_basis": review["portrait"]["identity_basis"],
            },
            "cross_facet_substitution": False,
            "verdict": "pass",
        }
    ),
    encoding="utf-8",
)
PY

jq -e \
  --arg task "$TASK_ID" \
  --arg lease "$EXPECTED_LEASE" \
  --arg wall "$WALL_ID" \
  '.transaction == "STAR-TREK-HENOCH-INDEPENDENT-MEDIA-REVIEW-V1"
   and .status == "media-review-complete"
   and .verdict == "pass"
   and .task.id == $task
   and .task.lease_id == $lease
   and .task.wall_id_reserved == $wall
   and .queue == {
     total:2228,
     queued:1794,
     resolved:431,
     blocked:0,
     rejected:2,
     in_flight:1
   }
   and .adjudication.adjudicated_kind == "physical"
   and .adjudication.performance_mode == "physical-prosthetic"
   and .adjudication.physical_performance_attributed == true
   and .adjudication.prosthetic_performance_attributed == false
   and .still.item_id == env.STILL_ITEM_ID
   and .still.sha256 == env.EXPECTED_STILL_SHA
   and .still.identity == "expected"
   and .still.presentation == "character-depiction"
   and (.still.votes | length) == 2
   and .portrait.item_id == env.PORTRAIT_ITEM_ID
   and .portrait.sha256 == env.EXPECTED_PORTRAIT_SHA
   and .portrait.identity == "expected"
   and .portrait.presentation == "neutral-human"
   and (.portrait.votes | length) == 2
   and (.votes | length) == 4
   and ([.votes[].asset_sha256] | unique | sort)
       == ([env.EXPECTED_STILL_SHA, env.EXPECTED_PORTRAIT_SHA] | unique | sort)
   and .replay.still_byte_match == true
   and .replay.portrait_byte_match == true
   and .candidate_staging_admissible == true
   and .boundary.all_four_media_claims_enforced == true
   and .boundary.character_still_exact_subject == true
   and .boundary.performer_portrait_neutral_human == true
   and .boundary.performer_portrait_is_not_character_evidence == true
   and .boundary.source_distinctness_verified == true
   and .boundary.byte_distinctness_verified == true
   and .boundary.cross_facet_substitution == false
   and .boundary.physical_performance_attributed == true
   and .boundary.prosthetic_performance_attributed == false
   and .boundary.canonical_mutation == false
   and .boundary.lease_mutation == false
   and .boundary.additional_lease_issued == false
   and .boundary.product_staged == false
   and .boundary.waterline_cycle_recorded == false' \
  "$OUT/media-review.json" >/dev/null

gh api "/repos/${GITHUB_REPOSITORY}/branches/main" \
  > "$OUT/main-after-review.json"
test "$(jq -r .commit.sha "$OUT/main-after-review.json")" \
  = "$EXPECTED_MAIN"

find "$OUT" -type f ! -name manifest.sha256 -print0 \
  | LC_ALL=C sort -z \
  | xargs -0 sha256sum > "$OUT/manifest.sha256"
sha256sum -c "$OUT/manifest.sha256"
