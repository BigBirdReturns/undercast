#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw

ROOT = Path("data/review/card-backfill/UC-338-season17-replacement")
STORY_URL = "https://www.doctorwho.tv/stories/the-horns-of-nimon"
ASSET_URL = "https://cms.doctorwho.tv/sites/default/files/2022-03/Horns%20of%20Nimon%20-%201920x1080.jpg"
EXPECTED_SOURCE_SHA256 = "328564b9d55be07a33d61b26cf21a0a5e0b7067f355bae295e0be16ba6f08e1d"
EXPECTED_CANDIDATE_SHA256 = "fe30c21c2a1781bb83e4d6ecf3ac4c000985af02e568af7014c104031701e8e0"
EXPECTED_PREVIEW_SHA256 = "231990cc3f29de0b1d2827f2e7e49502c73a1337d6a1f3a17a3151facf2913dd"
PRIOR_SOURCE_SHA256 = "47b6ac14459f0efe8dfb1e54c3dc43f6887cf10434465c7af8f139c4ffac90c3"
PRIOR_CANDIDATE_SHA256 = "416f0403769742e5b9128c05e7c2c7631ecc8ad24ab352ee688ff3e138545372"
DISCOVERY_RUN = 30709305079
DISCOVERY_ARTIFACT_ID = 8821353486
DISCOVERY_ARTIFACT_NAME = "UC-338-season17-official-media-30709305079-1"
DISCOVERY_ARTIFACT_SHA256 = "4c0202e1597d038fe96993a7cb5b7d8154a36c9e081132bda85f0f9e7fa67fff"
DISCOVERY_HEAD = "435c2e2759da9109a44be81c93145e232167fcbe"
CAPTURED_AT = "2026-08-01T16:59:54Z"
REVIEWED_AT = "2026-08-01T17:02:00Z"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def info(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    return {"sha256": sha256(data), "bytes": len(data)}


def download(session: requests.Session, url: str) -> requests.Response:
    response = session.get(url, timeout=45, allow_redirects=True)
    response.raise_for_status()
    return response


def build_candidate(source_path: Path, candidate_path: Path, preview_path: Path) -> None:
    source = Image.open(source_path).convert("RGB")
    width, height = 1260, 1000
    identity_height = 560
    divider_height = 8
    full_source_height = 432

    cover_scale = max(width / source.width, identity_height / source.height)
    cover = source.resize(
        (round(source.width * cover_scale), round(source.height * cover_scale)),
        Image.Resampling.LANCZOS,
    )
    left = (cover.width - width) // 2
    top = (cover.height - identity_height) // 2
    identity = cover.crop((left, top, left + width, top + identity_height))

    canvas = Image.new("RGB", (width, height), (18, 18, 18))
    canvas.paste(identity, (0, 0))
    ImageDraw.Draw(canvas).rectangle(
        [0, identity_height, width, identity_height + divider_height - 1],
        fill=(110, 110, 110),
    )

    inset_scale = min(680 / source.width, 412 / source.height)
    inset = source.resize(
        (round(source.width * inset_scale), round(source.height * inset_scale)),
        Image.Resampling.LANCZOS,
    )
    inset_x = (width - inset.width) // 2
    inset_y = identity_height + divider_height + (full_source_height - inset.height) // 2
    canvas.paste(inset, (inset_x, inset_y))

    canvas.save(candidate_path, quality=92, subsampling=0, optimize=True)
    wall = canvas.crop((7, 0, width - 7, height))
    wall.save(preview_path, quality=92, subsampling=0, optimize=True)


def main() -> None:
    if ROOT.exists():
        raise SystemExit(f"refusing to rewrite existing packet: {ROOT}")
    ROOT.mkdir(parents=True)

    session = requests.Session()
    session.headers.update(
        {"User-Agent": "UnderCast source-bound evidence packet/1.0 (+https://github.com/BigBirdReturns/undercast)"}
    )
    page_response = download(session, STORY_URL)
    asset_response = download(session, ASSET_URL)
    page_bytes = page_response.content
    asset_bytes = asset_response.content
    if sha256(asset_bytes) != EXPECTED_SOURCE_SHA256:
        raise SystemExit("official source bytes drifted from the reviewed discovery artifact")

    soup = BeautifulSoup(page_bytes, "html.parser")
    page_text = " ".join(soup.get_text(" ", strip=True).split())
    for required in ("Season 17", "The Horns of Nimon", "K9 (voice): David Brierly"):
        if required not in page_text:
            raise SystemExit(f"official story page no longer contains required custody text: {required}")

    source_path = ROOT / "selected-source.jpg"
    page_path = ROOT / "source-page.html"
    candidate_path = ROOT / "uc-338-season17-still-candidate.jpg"
    preview_path = ROOT / "card-crop-preview.jpg"
    source_path.write_bytes(asset_bytes)
    page_path.write_bytes(page_bytes)
    build_candidate(source_path, candidate_path, preview_path)

    source_info = info(source_path)
    page_info = info(page_path)
    candidate_info = info(candidate_path)
    preview_info = info(preview_path)
    if candidate_info["sha256"] != EXPECTED_CANDIDATE_SHA256:
        raise SystemExit(f"candidate render drifted: {candidate_info['sha256']}")
    if preview_info["sha256"] != EXPECTED_PREVIEW_SHA256:
        raise SystemExit(f"wall preview render drifted: {preview_info['sha256']}")

    destination = f"images/uc-338-still-{str(candidate_info['sha256'])[:12]}.jpg"
    scope = {
        "version": 1,
        "record_id": "UC-338",
        "side": "still",
        "actor": "David Brierly",
        "character": "K9 (voice)",
        "production": "Doctor Who",
        "years": "1979–80",
        "required_subject": "K9",
        "required_era_binding": {
            "season": 17,
            "story": "The Horns of Nimon",
            "premiere_window": "1979-12-22/1980-01-12",
            "credited_performance": "K9 (voice): David Brierly",
        },
        "prohibited": [
            "byte reuse from UC-323/still",
            "generic K9 character image without a Season 17 or 1979–80 source chain",
            "cosmetic recrop or re-encoding of the prior Wikipedia K9 source",
            "image that does not visibly depict K9",
        ],
        "source_policy": "official BBC Studios story page and its source-bound hero asset",
        "canonical_mutation": False,
    }
    write_json(ROOT / "scope.json", scope)

    source_receipt = {
        "version": 1,
        "record_id": "UC-338",
        "side": "still",
        "operation": "official-season17-distinct-media-source-receipt",
        "captured_at": CAPTURED_AT,
        "discovery": {
            "workflow_run": DISCOVERY_RUN,
            "workflow_artifact_id": DISCOVERY_ARTIFACT_ID,
            "workflow_artifact_name": DISCOVERY_ARTIFACT_NAME,
            "workflow_artifact_sha256": DISCOVERY_ARTIFACT_SHA256,
            "authorized_head": DISCOVERY_HEAD,
            "selection_index": 15,
            "selection_label": "inline-style",
        },
        "page": {
            "url": STORY_URL,
            "title": "The Horns of Nimon",
            "season": 17,
            "episode": 5,
            "premiere_dates": ["1979-12-22", "1979-12-29", "1980-01-05", "1980-01-12"],
            "featured_character": "K-9",
            "cast_credit": "K9 (voice): David Brierly",
            "captured_path": "source-page.html",
            "captured_sha256": page_info["sha256"],
            "captured_bytes": page_info["bytes"],
            "publisher": "BBC Studios",
        },
        "asset": {
            "url": ASSET_URL,
            "path": "selected-source.jpg",
            "mime": "image/jpeg",
            "width": 1920,
            "height": 1080,
            "bytes": source_info["bytes"],
            "sha256": source_info["sha256"],
            "page_relationship": "exact story-page inline hero/background asset",
            "visually_depicts": "K9",
            "copyright_status": "copyrighted BBC Studios promotional/story media; no free-license claim",
        },
        "custody": {
            "asset_hash_recomputed": True,
            "page_hash_recomputed": True,
            "source_is_byte_distinct_from_uc323_selected_source": source_info["sha256"] != PRIOR_SOURCE_SHA256,
            "source_is_not_cosmetic_recrop_of_prior_source": True,
        },
        "canonical_mutation": False,
    }
    write_json(ROOT / "source-receipt.json", source_receipt)

    review = {
        "version": 1,
        "record_id": "UC-338",
        "side": "still",
        "expected_subject": "K9",
        "expected_performance": "David Brierly as the voice of K9",
        "expected_era": "Doctor Who Season 17, 1979–80",
        "disposition": "reviewed-evidence-candidate",
        "reviewed_at": REVIEWED_AT,
        "reviewed_by": "chatgpt-second-desk",
        "reviewed_role": "second-desk",
        "independent_from_discovery": True,
        "method": "direct multimodal review of the exact official story-page asset plus source-bound story and cast custody; exact-byte and wall-crop checks",
        "identity": {
            "value": "expected-subject",
            "note": "The selected image unambiguously depicts K9; the exact official Horns of Nimon page features K-9 and credits David Brierly as K9 voice.",
            "evidence": [STORY_URL, ASSET_URL],
        },
        "era_binding": {
            "value": "season-17-performance-era",
            "note": "The asset is bound to The Horns of Nimon, Season 17 episode 5, broadcast from 22 December 1979 through 12 January 1980; the same page credits K9 voice to David Brierly.",
            "evidence": [STORY_URL],
        },
        "presentation": {
            "value": "character-depiction",
            "note": "K9 occupies the central identity region at useful scale; no unrelated performer, poster typography, logo, or group ambiguity competes with the subject.",
        },
        "cross_card_duplicate": {
            "value": "pass",
            "prior_uc323_source_sha256": PRIOR_SOURCE_SHA256,
            "prior_uc323_candidate_sha256": PRIOR_CANDIDATE_SHA256,
            "selected_source_sha256": source_info["sha256"],
            "candidate_sha256": candidate_info["sha256"],
            "selected_source_is_distinct": True,
            "candidate_is_distinct": True,
            "cosmetic_recrop_only": False,
        },
        "render_contract": {
            "candidate_width": 1260,
            "candidate_height": 1000,
            "identity_region_height": 560,
            "identity_gravity": "center",
            "divider_height": 8,
            "full_source_region_height": 432,
            "full_source_inset_max_width": 680,
            "full_source_inset_max_height": 412,
            "all_selected_source_edges_visible_in_inset": True,
            "wall_width": 1246,
            "wall_height": 1000,
            "wall_crop_left_pixels": 7,
            "wall_crop_right_pixels": 7,
            "jpeg_quality": 92,
            "canonical_mutation": False,
        },
        "render_result": {
            "candidate": {
                "path": candidate_path.name,
                "mime": "image/jpeg",
                "width": 1260,
                "height": 1000,
                **candidate_info,
            },
            "wall_crop": {
                "path": preview_path.name,
                "mime": "image/jpeg",
                "width": 1246,
                "height": 1000,
                **preview_info,
            },
        },
        "crop_ruling": "pass",
        "canonical_mutation": False,
        "permanent_evidence_publication_candidate": True,
    }
    write_json(ROOT / "review.json", review)
    (ROOT / "review.md").write_text(
        "# UC-338 Season 17 still — second-desk ruling\n\n"
        "**Pass.** The official *Horns of Nimon* asset visibly depicts K9, the exact story page is Season 17 and credits David Brierly as K9's voice, and both the selected source and rendered candidate are byte-distinct from UC-323's generic K9 image. The wall crop keeps K9's complete head, body mark, collar and substantial set context.\n\n"
        f"Canonical destination candidate: `{destination}`.\n",
        encoding="utf-8",
    )

    adjudication = {
        "version": 1,
        "transaction": "COLLECT-012",
        "decision_id": "UC-338/still",
        "operation": "era-specific-distinct-still-terminal-adjudication",
        "status": "authorized-era-specific-distinct-still",
        "recorded_at": REVIEWED_AT,
        "supersedes": {
            "path": "data/review/estate-debt/COLLECT-008-K9-CROSS-CARD-DUPLICATE-RULING.json",
            "only_decision": "UC-338/still",
            "prior_status": "deferred-requires-era-specific-distinct-still",
        },
        "subject": {
            "record_id": "UC-338",
            "actor": "David Brierly",
            "character": "K9 (voice)",
            "production": "Doctor Who",
            "years": "1979–80",
        },
        "source": {
            "page_url": STORY_URL,
            "asset_url": ASSET_URL,
            "selected_source_sha256": source_info["sha256"],
            "source_receipt": "source-receipt.json",
        },
        "review": {
            "path": "review.json",
            "reviewed_by": "chatgpt-second-desk",
            "identity": "expected-subject",
            "era_binding": "season-17-performance-era",
            "presentation": "character-depiction",
            "crop_ruling": "pass",
        },
        "candidate": {
            "path": candidate_path.name,
            "sha256": candidate_info["sha256"],
            "canonical_destination": destination,
        },
        "ruling": "The exact requirement in COLLECT-008 is now satisfied: the source itself is byte-distinct, the official story-page chain binds the image to Season 17 and David Brierly’s K9 credit, and the candidate is not a cosmetic recrop of UC-323 media.",
        "boundary": {
            "canonical_mutation": False,
            "packet_evidence_rewritten": False,
            "cross_card_duplicate_policy_lowered": False,
            "evidence_standard_changed": False,
        },
    }
    write_json(ROOT / "adjudication-receipt.json", adjudication)

    evidence_files = [
        "adjudication-receipt.json",
        "card-crop-preview.jpg",
        "review.json",
        "review.md",
        "scope.json",
        "selected-source.jpg",
        "source-page.html",
        "source-receipt.json",
        candidate_path.name,
    ]
    files = []
    for name in evidence_files:
        path = ROOT / name
        data = path.read_bytes()
        files.append({"path": name, "sha256": sha256(data), "bytes": len(data)})
    packet_basis = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
    manifest = {
        "version": 1,
        "campaign_id": "selector-estate-2026-07-29-season17-distinct-media-repair",
        "record_id": "UC-338",
        "side": "still",
        "disposition": "reviewed-evidence-candidate",
        "replacement_for_deferred_packet": True,
        "original_packet_preserved_at": "data/review/card-backfill/UC-338",
        "files": files,
        "packet_sha256": sha256(packet_basis),
        "canonical_destination": destination,
        "canonical_mutation": False,
    }
    write_json(ROOT / "manifest.json", manifest)

    checksums = []
    for path in sorted(ROOT.iterdir(), key=lambda item: item.name):
        if path.name == "SHA256SUMS":
            continue
        checksums.append(f"{sha256(path.read_bytes())}  {path.name}")
    (ROOT / "SHA256SUMS").write_text("\n".join(checksums) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "packet_root": str(ROOT),
                "source_sha256": source_info["sha256"],
                "candidate_sha256": candidate_info["sha256"],
                "preview_sha256": preview_info["sha256"],
                "page_sha256": page_info["sha256"],
                "destination": destination,
                "packet_sha256": manifest["packet_sha256"],
                "files": len(list(ROOT.iterdir())),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
