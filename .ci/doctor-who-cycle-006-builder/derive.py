#!/usr/bin/env python3
from __future__ import annotations

import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile
import textwrap

SOURCE_DIR = Path(sys.argv[1]).resolve()
OUT_DIR = Path(sys.argv[2]).resolve()
CARRIER_DIR = Path(sys.argv[3]).resolve()

EXACT_MAIN = "c340dc710e423a86b2ad3afa3fcf38a2751e8eb7"
TARGET_BRANCH = "agent/doctor-who-cycle-006-kayste-completion"
SELF = ".github/workflows/complete-doctor-who-cycle-006-kayste.yml"
TRANSPORT_BASE = ".ci/doctor-who-cycle-006/scripts.tgz.b64"

TASK_ID = "ap_c8e74653ac0877837814db21"
ROLE = "Kayste"
PERFORMER = "Dan Starkey"
SOURCE_URL = "https://tardis.fandom.com/wiki/Kayste"
SOURCE_PAGE_ID = "184657"
SOURCE_REVISION = "2593000"
SOURCE_TIMESTAMP = "2018-12-01T22:00:55Z"
SOURCE_CONTENT_SHA = "3ff314fbae95a13aead70ca7934692859d27e1ab57d7289b608692dd44bf06e2"
SOURCE_FINGERPRINT = "5a28fd22ffbd22398bd63338896f32f83edc5b88dc9248e3045fb5e5e85f82e2"
CANONICAL_ID = "UC-1351"
PRODUCTION = "Terror of the Sontarans"
PRODUCTION_URL = "https://tardis.fandom.com/wiki/Terror_of_the_Sontarans_(audio_story)"
YEAR = "2015"
DESIGNER = "Big Finish Productions"

PORTRAIT_PATH = "images/uc-1351-portrait.jpg"
PORTRAIT_SHA = "0c08fa4fa7f597ee55589e884e8a9d60f3e4e79500a714ff69891ad7f13d9368"
PORTRAIT_BYTES = "63017"
PORTRAIT_ORIGINAL_SHA = "c0dc68b5fa879e894f8b4c675a9390c05a28d9ba225fba4b52736827caf1c569"
PORTRAIT_FILE_TITLE = "File:Dan Starkey (27229445610).jpg"
PORTRAIT_PAGE_ID = "48874293"
PORTRAIT_PAGE = "https://commons.wikimedia.org/wiki/File:Dan_Starkey_(27229445610).jpg"
PORTRAIT_AUTHOR = "Supercon Convention"
PORTRAIT_LICENSE = "CC BY-SA 2.0"
PORTRAIT_DIMS = "420x600"

SELECTION_RUN = "30950611825"
SELECTION_ARTIFACT = "doctor-who-cycle-006-preflight-30950611825"
SELECTION_ARTIFACT_SHA = "15f153e93224d75d3168664ba1c55ebf42c61e864280aded3e3c571c5cde4413"
MEDIA_RUN = "30951744686"
MEDIA_ARTIFACT = "doctor-who-cycle-006-kayste-media-preflight-30951744686"
MEDIA_ARTIFACT_SHA = "13483de0b34a3fbff3be6c6f494dba11b62ca212b7d267b932e92dd9ae0fc7a1"
REBIND_RUN = "30953767874"
REBIND_ARTIFACT = "doctor-who-cycle-006-current-main-rebind-30953767874"
REBIND_ARTIFACT_SHA = "388325bbd09c7846850cf7152e3fa539c58293504de32fc89131473c1832d174"
REBIND_RECEIPT_SHA = "ff94801281b28df3dd4f6ccbf1872228bb057f897fd1b978ad009032977e3447"

OLD = {
    "cycle": "005",
    "task": "ap_ed7221a03fdd4679379e23f8",
    "role": "Kaarsh",
    "source_url": "https://tardis.fandom.com/wiki/Kaarsh",
    "source_page": "89948",
    "source_revision": "2331498",
    "source_timestamp": "2017-06-05T17:53:32Z",
    "source_sha": "a656f352afef65b58a8945b08b0fbf869c6943a932125643cb60e236ff7cd3d4",
    "source_fingerprint": "ba3075acf7a348064e8e11359afa0ecc35fa231f8867e8c9496e101884366d43",
    "canonical": "UC-1350",
    "production": "The Gunpowder Plot",
    "production_url": "https://tardis.fandom.com/wiki/The_Gunpowder_Plot_(video_game)",
    "year": "2011",
    "designer": "Sumo Digital",
    "asset_path": "images/uc-1350-still.jpg",
    "asset_sha": "ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad",
    "asset_bytes": "41459",
    "source_image_sha": "e1300bbbea2f5bde0cfb6596b30e37f97018299bedf131514001e0ed996492da",
    "file_title": "File:Kaarsh.jpg",
    "file_page": "https://tardis.fandom.com/wiki/File:Kaarsh.jpg",
    "file_page_id": "91567",
    "dims": "640x373",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def require_replace(text: str, old: str, new: str, *, minimum: int = 1) -> str:
    count = text.count(old)
    if count < minimum:
        raise RuntimeError(f"expected at least {minimum} occurrence(s) of {old!r}, found {count}")
    return text.replace(old, new)


def replace_identity(text: str) -> str:
    replacements = [
        (OLD["production_url"], PRODUCTION_URL),
        (OLD["source_url"], SOURCE_URL),
        (OLD["file_page"], PORTRAIT_PAGE),
        (OLD["task"], TASK_ID),
        (OLD["source_fingerprint"], SOURCE_FINGERPRINT),
        (OLD["source_sha"], SOURCE_CONTENT_SHA),
        (OLD["source_image_sha"], PORTRAIT_ORIGINAL_SHA),
        (OLD["asset_sha"], PORTRAIT_SHA),
        (OLD["asset_path"], PORTRAIT_PATH),
        (OLD["source_timestamp"], SOURCE_TIMESTAMP),
        (OLD["source_page"], SOURCE_PAGE_ID),
        (OLD["source_revision"], SOURCE_REVISION),
        (OLD["file_page_id"], PORTRAIT_PAGE_ID),
        (OLD["file_title"], PORTRAIT_FILE_TITLE),
        (OLD["canonical"], CANONICAL_ID),
        (OLD["production"], PRODUCTION),
        (OLD["designer"], DESIGNER),
        (OLD["dims"], PORTRAIT_DIMS),
        (OLD["asset_bytes"], PORTRAIT_BYTES),
        ("doctor-who-cycle-005", "doctor-who-cycle-006"),
        ("DOCTOR-WHO-CYCLE-005", "DOCTOR-WHO-CYCLE-006"),
        ("cycle-005", "cycle-006"),
        ("Cycle 005", "Cycle 006"),
        ("cycle 005", "cycle 006"),
        ("CYCLE005", "CYCLE006"),
        ("Kaarsh", ROLE),
        ("KAARSH", "KAYSTE"),
        (OLD["year"], YEAR),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def transform_materializer(source: str) -> str:
    text = replace_identity(source)
    identifier_replacements = {
        "sourceImageSha": "portraitOriginalSha",
        "stillSha": "portraitSha",
        "stillBytes": "portraitBytes",
        "stillCandidatePath": "portraitCandidatePath",
        "stillRepoPath": "portraitRepoPath",
        "KAYSTE_STILL_CANDIDATE": "KAYSTE_PORTRAIT_CANDIDATE",
        "stillCandidate": "portraitCandidate",
        "stillDimensions": "portraitDimensions",
    }
    for old, new in identifier_replacements.items():
        text = text.replace(old, new)

    text = text.replace("character-depiction", "performer-portrait")
    text = text.replace("single-character Kayste game still", "Dan Starkey performer portrait")
    text = text.replace("exact single-character Kayste game still", "independently licensed Dan Starkey performer portrait")
    text = text.replace("Kayste game still", "Dan Starkey performer portrait")
    text = text.replace("character still", "performer portrait")
    text = text.replace("source/file-title based", "Commons source-page and attribution based")
    text = text.replace("the revision-bound Kayste source names this exact file and Dan Starkey as voice actor", "the Kayste source identifies Dan Starkey as voice actor and the independent Commons file supplies performer identity evidence")
    text = text.replace("The revision-bound source identifies Dan Starkey as Kayste’s voice actor and names the exact Kayste.jpg character image. The character still supports Kayste depiction; no existing Dan Starkey portrait is duplicated or reused.", "The revision-bound source identifies Dan Starkey as Kayste’s voice actor. The independently licensed Commons portrait supports performer identity only; the Kayste character still remains honestly absent.")
    text = text.replace("The revision-bound source identifies Dan Starkey as Kayste's voice actor and names the exact Kayste.jpg character image. The character still supports Kayste depiction; no existing Dan Starkey portrait is duplicated or reused.", "The revision-bound source identifies Dan Starkey as Kayste's voice actor. The independently licensed Commons portrait supports performer identity only; the Kayste character still remains honestly absent.")

    # The prior cycle copies one reviewed asset. Retarget that exact byte operation.
    text = text.replace('"images/uc-1351-still.jpg"', f'"{PORTRAIT_PATH}"')
    text = text.replace("/tmp/doctor-who-cycle-006-kaarsh-still", "/tmp/doctor-who-cycle-006-kayste-portrait")

    # Correct the newly grown canonical record before any projection or media command runs.
    marker_patterns = [
        'runNode(["scripts/credits.mjs"',
        "runNode(['scripts/credits.mjs'",
        'runNode(["scripts/media-stage.mjs"',
        "runNode(['scripts/media-stage.mjs'",
    ]
    marker_index = -1
    for marker in marker_patterns:
        marker_index = text.find(marker)
        if marker_index >= 0:
            break
    if marker_index < 0:
        raise RuntimeError("could not locate first projection command in materializer")
    record_override = textwrap.dedent(f'''

    // Cycle 006 media correction: the source provides no Kayste character image.
    // The independently reviewed Commons bytes are performer portrait evidence only.
    {{
      const records = readJson("data/specimens.json");
      const record = records.find((entry) => entry.id === canonicalId);
      assert(record, `missing adopted ${{canonicalId}} record before projection rebuild`);
      record.actor = performer;
      record.character = role;
      record.universe = "Doctor Who";
      record.kind = "voice";
      record.production = production;
      record.years = "{YEAR}";
      record.designer = "{DESIGNER}";
      record.knownFor = `${{role}} in the {YEAR} Doctor Who audio drama ${{production}}.`;
      record.link = sourceUrl;
      record.references = [
        {{ claim: "performance", label: `Dan Starkey is identified as ${{role}}’s voice actor`, publisher: "Tardis Wiki", source: sourceUrl }},
        {{ claim: "production", label: `${{role}} appears in the Doctor Who audio drama ${{production}}`, publisher: "Tardis Wiki", source: "{PRODUCTION_URL}" }},
      ];
      record.reveal = "The revision-bound source identifies Dan Starkey as Kayste’s voice actor. The independently licensed Commons portrait supports performer identity only; the Kayste character still remains honestly absent.";
      record.portrait = {{
        src: portraitRepoPath,
        kind: "portrait",
        origin: "{PORTRAIT_PAGE}",
        license: "{PORTRAIT_LICENSE}",
        author: "{PORTRAIT_AUTHOR}",
        focus: {{ x: "center", y: "center" }},
      }};
      delete record.still;
      delete record.image;
      writeJson("data/specimens.json", records);
    }}

    ''' )
    text = text[:marker_index] + record_override + text[marker_index:]

    # Swap only media-audit command-side semantics; preserve historical checker names.
    command_pattern = re.compile(r"runNode\(\[(?:(?!\]\);).)*?media-audit\.mjs(?:(?!\]\);).)*?\]\);", re.S)
    commands = list(command_pattern.finditer(text))
    if not commands:
        raise RuntimeError("no media-audit command blocks found")
    rebuilt = []
    cursor = 0
    for match in commands:
        block = match.group(0)
        if re.search(r'["\']vote["\']', block):
            block = block.replace('"still"', '"portrait"').replace("'still'", "'portrait'")
            block = block.replace("character-depiction", "performer-portrait")
            block = block.replace("single-character Kayste game still", "Dan Starkey performer portrait")
            block = block.replace("generic Sontaran substitute", "Kayste character evidence")
            # The performer—not the role—is the expected subject for the portrait.
            block = re.sub(r'(["\']--expected-subject["\']\s*,\s*)role\b', r'\1performer', block)
        elif re.search(r'["\']absent["\']', block):
            block = block.replace('"portrait"', '"still"').replace("'portrait'", "'still'")
            # The absent side is the Kayste character still.
            block = re.sub(r'(["\']--expected-subject["\']\s*,\s*)performer\b', r'\1role', block)
        rebuilt.append(text[cursor:match.start()])
        rebuilt.append(block)
        cursor = match.end()
    rebuilt.append(text[cursor:])
    text = "".join(rebuilt)

    # Current-cycle audit variables are names only; swap the common pairs without touching
    # historical cycle-004 still-correction identifiers.
    for left, right in [
        ("stillItem", "portraitItem"),
        ("stillAuditItem", "portraitAuditItem"),
        ("stillMediaItem", "portraitMediaItem"),
        ("stillVote", "portraitVote"),
        ("stillStatus", "portraitStatus"),
    ]:
        placeholder = f"__SWAP_{left.upper()}__"
        text = re.sub(rf"\b{re.escape(left)}\b", placeholder, text)
        text = re.sub(rf"\b{re.escape(right)}\b", left, text)
        text = text.replace(placeholder, right)

    # Ensure the candidate asset is treated and receipted as a portrait.
    text = text.replace('kind: "still"', 'kind: "portrait"')
    text = text.replace("kind: 'still'", "kind: 'portrait'")
    text = text.replace('"side": "still"', '"side": "portrait"')
    text = text.replace('"presentation": "character-depiction"', '"presentation": "performer-portrait"')

    boundary_replacements = {
        "exact_character_still_adopted": "exact_performer_portrait_adopted",
        "still_treated_as_character_evidence": "portrait_treated_as_performer_evidence",
        "fifth_doctor_who_lease_is_this_cycle": "sixth_doctor_who_lease_is_this_cycle",
        "sixth_lease_issued": "seventh_lease_issued",
    }
    for old, new in boundary_replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"portrait_adopted:\s*false", "portrait_adopted: true", text)
    text = re.sub(r'portrait_status:\s*["\']absent["\']', 'portrait_status: "verified"', text)
    text = re.sub(r"still_adopted:\s*true", "still_adopted: false", text)
    text = re.sub(r'still_status:\s*["\']verified["\']', 'still_status: "absent"', text)

    # Run every prior permanent checker, including cycle 005, before cycle 006 may publish.
    cycle5_call = 'runNode(["scripts/doctor-who-cycle-005.mjs"]);'
    if cycle5_call not in text:
        insertion_markers = [
            'runNode(["scripts/doctor-who-cycle-004-still-correction.mjs"]);',
            "runNode(['scripts/doctor-who-cycle-004-still-correction.mjs']);",
        ]
        inserted = False
        for marker in insertion_markers:
            if marker in text:
                text = text.replace(marker, marker + "\n" + cycle5_call, 1)
                inserted = True
                break
        if not inserted:
            raise RuntimeError("could not insert prior cycle-005 checker call")

    old_tokens = [OLD["task"], OLD["role"], OLD["canonical"], OLD["asset_sha"], OLD["source_sha"]]
    for token in old_tokens:
        if token in text:
            raise RuntimeError(f"materializer retained old token {token}")
    required = [TASK_ID, ROLE, CANONICAL_ID, PORTRAIT_SHA, PORTRAIT_PATH, '"performer-portrait"', '"still"']
    for token in required:
        if token not in text:
            raise RuntimeError(f"materializer missing required token {token}")
    return text


def transform_finalizer(source: str) -> str:
    text = replace_identity(source)
    for old, new in {
        "sourceImageSha": "portraitOriginalSha",
        "stillSha": "portraitSha",
        "stillBytes": "portraitBytes",
        "stillRepoPath": "portraitRepoPath",
        "stillCandidatePath": "portraitCandidatePath",
        "KAYSTE_STILL_CANDIDATE": "KAYSTE_PORTRAIT_CANDIDATE",
    }.items():
        text = text.replace(old, new)

    # Swap current-cycle record/audit side semantics. Historical filenames contain
    # 'still-correction' as a substring and therefore remain untouched.
    text = text.replace(".__SIDE_TMP__", ".__SIDE_TMP_RESERVED__")
    text = text.replace(".still", ".__SIDE_TMP__")
    text = text.replace(".portrait", ".still")
    text = text.replace(".__SIDE_TMP__", ".portrait")
    for quote in ('"', "'"):
        text = text.replace(f"{quote}still{quote}", f"{quote}__SIDE_TMP__{quote}")
        text = text.replace(f"{quote}portrait{quote}", f"{quote}still{quote}")
        text = text.replace(f"{quote}__SIDE_TMP__{quote}", f"{quote}portrait{quote}")

    text = text.replace("character-depiction", "performer-portrait")
    text = text.replace("single-character Kayste game still", "Dan Starkey performer portrait")
    text = text.replace("exact single-character Kayste game still", "independently licensed Dan Starkey performer portrait")
    text = text.replace("Kayste game still", "Dan Starkey performer portrait")
    text = text.replace("character still", "performer portrait")
    text = text.replace("source/file-title based", "Commons source-page and attribution based")
    text = text.replace("fifth", "sixth").replace("Fifth", "Sixth")
    text = text.replace("sixth Doctor Who lease issued", "seventh Doctor Who lease issued")
    text = text.replace("sixth_lease_issued", "seventh_lease_issued")
    text = text.replace("fifth_doctor_who_lease_is_this_cycle", "sixth_doctor_who_lease_is_this_cycle")
    text = text.replace("exact_character_still_adopted", "exact_performer_portrait_adopted")
    text = text.replace("still_treated_as_character_evidence", "portrait_treated_as_performer_evidence")

    # Current-cycle history moves from five reviewed cycles to six. Restrict numeric
    # edits to lines that are explicitly about cycle or claim counts.
    lines = []
    for line in text.splitlines():
        low = line.lower()
        if any(key in low for key in ["reviewedcycle", "reviewed cycle", "cyclecount", "cycle_count", "claimcount", "claim_count", "historical_claim", "minimum_resolved", "minimum resolved"]):
            line = re.sub(r"\b5\b", "6", line)
        if any(key in low for key in ["cycles_before", "cycles before", "prior_reviewed", "prior reviewed"]):
            line = re.sub(r"\b4\b", "5", line)
        lines.append(line)
    text = "\n".join(lines) + ("\n" if source.endswith("\n") else "")

    # The newly generated checker must compose with the completed cycle-005 checker.
    calls = [
        'runNode(["scripts/doctor-who-cycle-004-still-correction.mjs"]);',
        'runNode("scripts/doctor-who-cycle-004-still-correction.mjs");',
        "runNode(['scripts/doctor-who-cycle-004-still-correction.mjs']);",
        "runNode('scripts/doctor-who-cycle-004-still-correction.mjs');",
    ]
    prior_call = 'runNode(["scripts/doctor-who-cycle-005.mjs"]);'
    if prior_call not in text:
        for marker in calls:
            if marker in text:
                text = text.replace(marker, marker + "\n" + prior_call, 1)
                break
        else:
            # A finalizer may call the previous checker through run(); insert before
            # the current-cycle checker execution if the exact marker is absent.
            marker = 'runNode(["scripts/doctor-who-cycle-006.mjs"]);'
            if marker in text:
                text = text.replace(marker, prior_call + "\n" + marker, 1)
            else:
                raise RuntimeError("could not compose cycle-005 checker in finalizer")

    # Add explicit portrait attribution requirements to the generated checker wherever
    # it validates the current record origin.
    attribution = textwrap.dedent(f'''
      assert(record.portrait?.license === "{PORTRAIT_LICENSE}", "Kayste performer portrait license drifted");
      assert(record.portrait?.author === "{PORTRAIT_AUTHOR}", "Kayste performer portrait author drifted");
    ''').strip()
    origin_needles = [
        f'assert(record.portrait?.origin === "{PORTRAIT_PAGE}"',
        f"assert(record.portrait?.origin === '{PORTRAIT_PAGE}'",
    ]
    if attribution not in text:
        for needle in origin_needles:
            idx = text.find(needle)
            if idx >= 0:
                line_end = text.find("\n", idx)
                text = text[:line_end + 1] + attribution + "\n" + text[line_end + 1:]
                break

    # Correct current-cycle receipt boundary values after side swapping.
    text = re.sub(r"portrait_adopted:\s*false", "portrait_adopted: true", text)
    text = re.sub(r'portrait_status:\s*["\']absent["\']', 'portrait_status: "verified"', text)
    text = re.sub(r"still_adopted:\s*true", "still_adopted: false", text)
    text = re.sub(r'still_status:\s*["\']verified["\']', 'still_status: "absent"', text)

    old_tokens = [OLD["task"], OLD["role"], OLD["canonical"], OLD["asset_sha"], OLD["source_sha"]]
    for token in old_tokens:
        if token in text:
            raise RuntimeError(f"finalizer retained old token {token}")
    required = [TASK_ID, ROLE, CANONICAL_ID, PORTRAIT_SHA, PORTRAIT_PATH, "doctor-who-cycle-006", "doctor-who-cycle-005.mjs"]
    for token in required:
        if token not in text:
            raise RuntimeError(f"finalizer missing required token {token}")
    return text


def write_helpers(out: Path, materializer_sha: str, finalizer_sha: str) -> None:
    binder = f'''#!/usr/bin/env bash
set -euo pipefail

: "${{AUTHORIZED_HEAD:?}}" "${{TARGET_BRANCH:?}}" "${{SELF:?}}" "${{TRANSPORT:?}}" "${{TRANSPORT_PARTS:?}}" "${{TRANSPORT_SHA256:?}}"
: "${{CYCLE_ASSET_DIR:?}}" "${{CYCLE_CONTEXT:?}}" "${{SELECTION_DIR:?}}" "${{MEDIA_DIR:?}}" "${{REBIND_DIR:?}}"

expected_main="{EXACT_MAIN}"
expected_branch="{TARGET_BRANCH}"
expected_task="{TASK_ID}"
expected_source_sha="{SOURCE_CONTENT_SHA}"
expected_source_fingerprint="{SOURCE_FINGERPRINT}"
expected_portrait_sha="{PORTRAIT_SHA}"
expected_rebind_sha="{REBIND_RECEIPT_SHA}"

[[ "$TARGET_BRANCH" == "$expected_branch" ]]
[[ "$(git rev-parse HEAD)" == "$AUTHORIZED_HEAD" ]]
git fetch --no-tags origin \
  "refs/heads/main:refs/remotes/origin/main" \
  "refs/heads/${{TARGET_BRANCH}}:refs/remotes/origin/${{TARGET_BRANCH}}"
[[ "$(git rev-parse refs/remotes/origin/main)" == "$expected_main" ]]
[[ "$(git rev-parse refs/remotes/origin/${{TARGET_BRANCH}})" == "$AUTHORIZED_HEAD" ]]
[[ ! -e tmp/ux02a.trigger ]]

mapfile -t parts < <(printf '%s\n' "$TRANSPORT" "$TRANSPORT".part-* | sort)
[[ "${{#parts[@]}}" -eq "$TRANSPORT_PARTS" ]]
mkdir -p "$CYCLE_ASSET_DIR"
cat "${{parts[@]}}" | tr -d '\n\r\t ' | base64 --decode > /tmp/doctor-who-cycle-006-bootstrap.tgz
[[ "$(sha256sum /tmp/doctor-who-cycle-006-bootstrap.tgz | awk '{{print $1}}')" == "$TRANSPORT_SHA256" ]]
tar -xzf /tmp/doctor-who-cycle-006-bootstrap.tgz -C "$CYCLE_ASSET_DIR"
[[ "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-006.mjs" | awk '{{print $1}}')" == "{materializer_sha}" ]]
[[ "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs" | awk '{{print $1}}')" == "{finalizer_sha}" ]]
chmod +x "$CYCLE_ASSET_DIR"/*.sh

node --input-type=module <<'NODE'
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const selectionDir = process.env.SELECTION_DIR;
const mediaDir = process.env.MEDIA_DIR;
const rebindDir = process.env.REBIND_DIR;
const selection = JSON.parse(fs.readFileSync(`${{selectionDir}}/selected-task.json`, 'utf8'));
const task = selection.task;
if (task.id !== '{TASK_ID}' || task.performer !== '{PERFORMER}' || task.character !== '{ROLE}') throw new Error('Kayste selection identity drifted');
if (task.source_fingerprint !== '{SOURCE_FINGERPRINT}' || task.source_receipts?.[0]?.content_sha256 !== '{SOURCE_CONTENT_SHA}') throw new Error('Kayste source custody drifted');
const sourceBody = fs.readFileSync(`${{selectionDir}}/source-01.wikitext`);
if (sha(sourceBody) !== '{SOURCE_CONTENT_SHA}') throw new Error('Kayste source body drifted');
const portrait = fs.readFileSync(`${{mediaDir}}/dan-starkey-candidate-420x600.jpg`);
if (sha(portrait) !== '{PORTRAIT_SHA}' || portrait.length !== {PORTRAIT_BYTES}) throw new Error('Kayste portrait bytes drifted');
const mediaReceipt = JSON.parse(fs.readFileSync(`${{mediaDir}}/portrait-candidate-receipt.json`, 'utf8'));
if (mediaReceipt.selected?.pageid !== {PORTRAIT_PAGE_ID} || mediaReceipt.selected?.license !== '{PORTRAIT_LICENSE}' || mediaReceipt.candidate?.sha256 !== '{PORTRAIT_SHA}') throw new Error('Kayste portrait receipt drifted');
const rebindBytes = fs.readFileSync(`${{rebindDir}}/current-main-rebind.json`);
const declaredRebind = fs.readFileSync(`${{rebindDir}}/current-main-rebind.sha256`, 'utf8').trim();
if (declaredRebind !== '{REBIND_RECEIPT_SHA}') throw new Error('Kayste rebind declaration drifted');
const rebind = JSON.parse(rebindBytes);
if (rebind.exact_main !== '{EXACT_MAIN}' || rebind.lease_issued !== false || rebind.global_active_count !== 0 || rebind.task?.id !== '{TASK_ID}') throw new Error('Kayste current-main rebind drifted');
if (rebind.boundary?.claim_authorized !== true || rebind.boundary?.ux02a_trigger_present !== false) throw new Error('Kayste rebind does not authorize claim');
fs.copyFileSync(`${{mediaDir}}/dan-starkey-candidate-420x600.jpg`, '/tmp/doctor-who-cycle-006-kayste-portrait.jpg');
const normalized = {{
  version: 1,
  exact_main: '{EXACT_MAIN}',
  task,
  source_body_sha256: sha(sourceBody),
  portrait: {{
    source_file: '{PORTRAIT_FILE_TITLE}',
    source_pageid: {PORTRAIT_PAGE_ID},
    source_page: '{PORTRAIT_PAGE}',
    author: '{PORTRAIT_AUTHOR}',
    license: '{PORTRAIT_LICENSE}',
    original_sha256: '{PORTRAIT_ORIGINAL_SHA}',
    candidate_sha256: '{PORTRAIT_SHA}',
    candidate_bytes: {PORTRAIT_BYTES},
    candidate_dimensions: '{PORTRAIT_DIMS}',
  }},
  quality: rebind.quality,
  boundary: rebind.boundary,
}};
fs.writeFileSync('/tmp/doctor-who-cycle-006-normalized-verification.json', `${{JSON.stringify(normalized, null, 2)}}\n`);
NODE

printf '%s\n' "$expected_main" > /tmp/doctor-who-cycle-006-exact-main.txt
printf '%s\n' "$AUTHORIZED_HEAD" > /tmp/doctor-who-cycle-006-authorized-head.txt
printf '%s\n' "$SELF" "$TRANSPORT" "$TRANSPORT".part-* | sort > /tmp/doctor-who-cycle-006-transport-paths.txt
printf 'EXACT_MAIN=%s\n' "$expected_main" >> "$GITHUB_ENV"
printf 'CYCLE_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" >> "$GITHUB_ENV"
printf 'KAYSTE_PORTRAIT_CANDIDATE=%s\n' /tmp/doctor-who-cycle-006-kayste-portrait.jpg >> "$GITHUB_ENV"
printf 'NORMALIZED_VERIFICATION=%s\n' /tmp/doctor-who-cycle-006-normalized-verification.json >> "$GITHUB_ENV"
'''

    materialize = '''#!/usr/bin/env bash
set -euo pipefail
cp "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-006.mjs" /tmp/apply-doctor-who-cycle-006.mjs
cp "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs" /tmp/apply-doctor-who-cycle-finalize-006.mjs
rm -f "$SELF" "$TRANSPORT" "$TRANSPORT".part-*
node /tmp/apply-doctor-who-cycle-006.mjs 2>&1 | tee /tmp/doctor-who-cycle-006-materialize.log
for path in "$SELF" "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done
'''

    candidate_gate = '''#!/usr/bin/env bash
set -euo pipefail
for path in "$SELF" "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done
npm run gate 2>&1 | tee /tmp/doctor-who-cycle-006-candidate-gate.log
sha256sum /tmp/doctor-who-cycle-006-candidate-gate.log | awk '{print $1}' > /tmp/doctor-who-cycle-006-candidate-gate.sha256
'''

    candidate_commit = '''#!/usr/bin/env bash
set -euo pipefail
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add -A
for path in "$SELF" "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done
if git diff --cached --quiet; then echo 'candidate produced no durable changes' >&2; exit 1; fi
git commit -m 'Doctor Who: stage cycle 006 Kayste candidate'
candidate="$(git rev-parse HEAD)"
printf '%s\n' "$candidate" > /tmp/doctor-who-cycle-006-candidate-commit.txt
node --input-type=module <<'NODE'
import fs from 'node:fs';
const path = process.env.CYCLE_CONTEXT;
const context = JSON.parse(fs.readFileSync(path, 'utf8'));
context.execution ??= {};
context.execution.candidate_commit = fs.readFileSync('/tmp/doctor-who-cycle-006-candidate-commit.txt', 'utf8').trim();
context.execution.candidate_gate_sha256 = fs.readFileSync('/tmp/doctor-who-cycle-006-candidate-gate.sha256', 'utf8').trim();
fs.writeFileSync(path, `${JSON.stringify(context, null, 2)}\n`);
NODE
'''

    finalize = '''#!/usr/bin/env bash
set -euo pipefail
: "${CANDIDATE_ARTIFACT_ID:?}" "${CANDIDATE_ARTIFACT_SHA256:?}" "${WORKFLOW_JOB:?}"
node /tmp/apply-doctor-who-cycle-finalize-006.mjs 2>&1 | tee /tmp/doctor-who-cycle-006-finalize.log
'''

    final_gate = '''#!/usr/bin/env bash
set -euo pipefail
for path in "$SELF" "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done
npm run gate 2>&1 | tee /tmp/doctor-who-cycle-006-final-gate.log
sha256sum /tmp/doctor-who-cycle-006-final-gate.log | awk '{print $1}' > /tmp/doctor-who-cycle-006-final-gate.sha256
git add -A
for path in "$SELF" "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done
if git diff --cached --quiet; then echo 'finalizer produced no receipt-bearing changes' >&2; exit 1; fi
git commit -m 'Doctor Who: complete reviewed cycle 006 for Kayste'
final="$(git rev-parse HEAD)"
printf '%s\n' "$final" > /tmp/doctor-who-cycle-006-final-commit.txt
git fetch --no-tags origin "refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
[[ "$(git rev-parse refs/remotes/origin/${TARGET_BRANCH})" == "$AUTHORIZED_HEAD" ]]
git push --force-with-lease="refs/heads/${TARGET_BRANCH}:${AUTHORIZED_HEAD}" origin "HEAD:refs/heads/${TARGET_BRANCH}"
'''

    for name, content in {
        "01-bind-decode.sh": binder,
        "02-materialize.sh": materialize,
        "03-candidate-gate.sh": candidate_gate,
        "04-candidate-commit.sh": candidate_commit,
        "05-finalize.sh": finalize,
        "06-final-gate-publish.sh": final_gate,
    }.items():
        (out / name).write_text(content)
        os.chmod(out / name, 0o755)


def deterministic_tgz(source_dir: Path) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz", compresslevel=9) as archive:
        for path in sorted(source_dir.iterdir(), key=lambda p: p.name):
            if not path.is_file():
                continue
            data = path.read_bytes()
            info = tarfile.TarInfo(path.name)
            info.size = len(data)
            info.mode = 0o755 if path.suffix == ".sh" else 0o644
            info.mtime = 0
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            archive.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def workflow_text(transport_sha: str, parts: int, materializer_sha: str, finalizer_sha: str, manifest_sha: str) -> str:
    return f'''name: complete-doctor-who-cycle-006-kayste

on:
  pull_request:
    branches: [main]
    paths:
      - "{SELF}"
      - "{TRANSPORT_BASE}*"

permissions:
  contents: write
  actions: read

concurrency:
  group: complete-doctor-who-cycle-006-kayste-${{{{ github.event.pull_request.number }}}}
  cancel-in-progress: true

env:
  AUTHORIZED_HEAD: ${{{{ github.event.pull_request.head.sha }}}}
  TARGET_BRANCH: ${{{{ github.event.pull_request.head.ref }}}}
  SELF: {SELF}
  TRANSPORT: {TRANSPORT_BASE}
  TRANSPORT_PARTS: "{parts}"
  TRANSPORT_SHA256: {transport_sha}
  MATERIALIZER_SHA256: {materializer_sha}
  FINALIZER_SHA256: {finalizer_sha}
  TRANSPORT_MANIFEST_SHA256: {manifest_sha}
  CYCLE_ASSET_DIR: /tmp/doctor-who-cycle-006
  CYCLE_CONTEXT: /tmp/doctor-who-cycle-006-context.json
  SELECTION_DIR: /tmp/doctor-who-cycle-006-selection
  MEDIA_DIR: /tmp/doctor-who-cycle-006-media
  REBIND_DIR: /tmp/doctor-who-cycle-006-rebind
  GH_TOKEN: ${{{{ github.token }}}}

jobs:
  cycle-006:
    if: github.repository == 'BigBirdReturns/undercast' && github.event.pull_request.head.repo.full_name == github.repository && github.event.pull_request.head.ref == '{TARGET_BRANCH}'
    runs-on: ubuntu-24.04
    timeout-minutes: 240
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{{{ env.AUTHORIZED_HEAD }}}}
          fetch-depth: 0
          filter: blob:none

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: npm

      - name: Install exact dependencies, rendered runtime, and deterministic image tooling
        shell: bash
        run: |
          set -euo pipefail
          npm ci
          npx playwright install --with-deps chromium
          sudo apt-get update >/dev/null
          sudo apt-get install -y imagemagick >/dev/null
          identify -version | head -1

      - name: Download exact cycle-006 selection packet
        uses: actions/download-artifact@v4
        with:
          name: {SELECTION_ARTIFACT}
          path: ${{{{ env.SELECTION_DIR }}}}
          github-token: ${{{{ github.token }}}}
          repository: BigBirdReturns/undercast
          run-id: {SELECTION_RUN}

      - name: Download exact Kayste media packet
        uses: actions/download-artifact@v4
        with:
          name: {MEDIA_ARTIFACT}
          path: ${{{{ env.MEDIA_DIR }}}}
          github-token: ${{{{ github.token }}}}
          repository: BigBirdReturns/undercast
          run-id: {MEDIA_RUN}

      - name: Download exact clean-main cycle-006 rebind
        uses: actions/download-artifact@v4
        with:
          name: {REBIND_ARTIFACT}
          path: ${{{{ env.REBIND_DIR }}}}
          github-token: ${{{{ github.token }}}}
          repository: BigBirdReturns/undercast
          run-id: {REBIND_RUN}

      - name: Decode and bind strict cycle-006 custody
        shell: bash
        run: |
          set -euo pipefail
          shopt -s nullglob
          mapfile -t parts < <(printf '%s\n' "$TRANSPORT" "$TRANSPORT".part-* | sort)
          test "${{#parts[@]}}" -eq "$TRANSPORT_PARTS"
          mkdir -p "$CYCLE_ASSET_DIR"
          cat "${{parts[@]}}" | tr -d '\n\r\t ' | base64 --decode > /tmp/doctor-who-cycle-006-bootstrap.tgz
          test "$(sha256sum /tmp/doctor-who-cycle-006-bootstrap.tgz | awk '{{print $1}}')" = "$TRANSPORT_SHA256"
          tar -xzf /tmp/doctor-who-cycle-006-bootstrap.tgz -C "$CYCLE_ASSET_DIR"
          test "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-006.mjs" | awk '{{print $1}}')" = "$MATERIALIZER_SHA256"
          test "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs" | awk '{{print $1}}')" = "$FINALIZER_SHA256"
          test "$(sha256sum "$CYCLE_ASSET_DIR/transport-manifest.json" | awk '{{print $1}}')" = "$TRANSPORT_MANIFEST_SHA256"
          chmod +x "$CYCLE_ASSET_DIR"/*.sh
          bash "$CYCLE_ASSET_DIR/01-bind-decode.sh"

      - name: Claim, materialize, review, and resolve exactly one Kayste task
        shell: bash
        run: bash "$CYCLE_ASSET_DIR/02-materialize.sh"

      - name: Stage and completely gate workflow-free terminal candidate
        shell: bash
        run: bash "$CYCLE_ASSET_DIR/03-candidate-gate.sh"

      - name: Commit terminal candidate
        shell: bash
        run: bash "$CYCLE_ASSET_DIR/04-candidate-commit.sh"

      - name: Upload exact terminal candidate evidence
        id: candidate-upload
        uses: actions/upload-artifact@v4
        with:
          name: doctor-who-cycle-006-candidate-${{{{ github.run_id }}}}
          retention-days: 30
          compression-level: 0
          if-no-files-found: error
          path: |
            ${{{{ env.CYCLE_CONTEXT }}}}
            /tmp/doctor-who-cycle-006-candidate-*
            /tmp/doctor-who-cycle-006-materialize.log
            /tmp/doctor-who-cycle-006-candidate-gate.log
            /tmp/doctor-who-cycle-006-candidate-gate.sha256
            /tmp/doctor-who-cycle-006-normalized-verification.json
            /tmp/doctor-who-cycle-006-kayste-portrait.jpg

      - name: Bind candidate artifact and workflow job custody
        shell: bash
        env:
          ARTIFACT_ID: ${{{{ steps.candidate-upload.outputs.artifact-id }}}}
          ARTIFACT_DIGEST: ${{{{ steps.candidate-upload.outputs.artifact-digest }}}}
        run: |
          set -euo pipefail
          job_id="$(gh api "repos/${{GITHUB_REPOSITORY}}/actions/runs/${{GITHUB_RUN_ID}}/jobs?per_page=100" --jq '.jobs[] | select(.name=="cycle-006") | .id' | head -1)"
          test -n "$job_id"
          digest="${{ARTIFACT_DIGEST#sha256:}}"
          test -n "$ARTIFACT_ID" -a -n "$digest"
          printf 'CANDIDATE_ARTIFACT_ID=%s\n' "$ARTIFACT_ID" >> "$GITHUB_ENV"
          printf 'CANDIDATE_ARTIFACT_SHA256=%s\n' "$digest" >> "$GITHUB_ENV"
          printf 'WORKFLOW_JOB=%s\n' "$job_id" >> "$GITHUB_ENV"

      - name: Write and validate reviewed cycle and permanent checker
        shell: bash
        run: bash "$CYCLE_ASSET_DIR/05-finalize.sh"

      - name: Commit, completely gate, and publish exact final product
        shell: bash
        run: bash "$CYCLE_ASSET_DIR/06-final-gate-publish.sh"

      - name: Upload complete cycle and final-gate evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: doctor-who-cycle-006-final-${{{{ github.run_id }}}}
          retention-days: 30
          compression-level: 0
          if-no-files-found: warn
          path: |
            ${{{{ env.CYCLE_CONTEXT }}}}
            /tmp/doctor-who-cycle-006-candidate-*
            /tmp/doctor-who-cycle-006-final-*
            /tmp/doctor-who-cycle-006-finalize.log
            /tmp/doctor-who-cycle-006-materialize.log
            /tmp/doctor-who-cycle-006-normalized-verification.json
            /tmp/doctor-who-cycle-006-kayste-portrait.jpg
            data/review/adapter-sdk/doctor-who-cycle-006-kayste.json
            data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json
            scripts/doctor-who-cycle-006.mjs
'''


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CARRIER_DIR.mkdir(parents=True, exist_ok=True)
    materializer_source = (SOURCE_DIR / "apply-doctor-who-cycle-005.mjs").read_text()
    finalizer_source = (SOURCE_DIR / "apply-doctor-who-cycle-finalize-005.mjs").read_text()
    materializer = transform_materializer(materializer_source)
    finalizer = transform_finalizer(finalizer_source)
    materializer_path = OUT_DIR / "apply-doctor-who-cycle-006.mjs"
    finalizer_path = OUT_DIR / "apply-doctor-who-cycle-finalize-006.mjs"
    materializer_path.write_text(materializer)
    finalizer_path.write_text(finalizer)
    materializer_sha = sha256_bytes(materializer.encode())
    finalizer_sha = sha256_bytes(finalizer.encode())
    write_helpers(OUT_DIR, materializer_sha, finalizer_sha)

    manifest = {
        "version": 1,
        "transaction": "DOCTOR-WHO-CYCLE-006-KAYSTE",
        "exact_main": EXACT_MAIN,
        "target_branch": TARGET_BRANCH,
        "task": {
            "id": TASK_ID,
            "performer": PERFORMER,
            "role": ROLE,
            "performance_mode": "voice",
            "source_url": SOURCE_URL,
            "source_page_id": int(SOURCE_PAGE_ID),
            "source_revision": int(SOURCE_REVISION),
            "source_content_sha256": SOURCE_CONTENT_SHA,
            "source_fingerprint": SOURCE_FINGERPRINT,
            "canonical_wall_id": CANONICAL_ID,
        },
        "portrait": {
            "path": PORTRAIT_PATH,
            "sha256": PORTRAIT_SHA,
            "bytes": int(PORTRAIT_BYTES),
            "dimensions": PORTRAIT_DIMS,
            "origin": PORTRAIT_PAGE,
            "page_id": int(PORTRAIT_PAGE_ID),
            "author": PORTRAIT_AUTHOR,
            "license": PORTRAIT_LICENSE,
            "use_boundary": "performer identity only; Kayste character still absent",
        },
        "evidence": {
            "selection_run": int(SELECTION_RUN),
            "selection_artifact": SELECTION_ARTIFACT,
            "selection_artifact_sha256": SELECTION_ARTIFACT_SHA,
            "media_run": int(MEDIA_RUN),
            "media_artifact": MEDIA_ARTIFACT,
            "media_artifact_sha256": MEDIA_ARTIFACT_SHA,
            "rebind_run": int(REBIND_RUN),
            "rebind_artifact": REBIND_ARTIFACT,
            "rebind_artifact_sha256": REBIND_ARTIFACT_SHA,
            "rebind_receipt_sha256": REBIND_RECEIPT_SHA,
        },
        "files": {},
        "boundary": {
            "maximum_tasks": 1,
            "sixth_lease_is_this_cycle": True,
            "seventh_lease_issued": False,
            "workflow_free_candidate_required": True,
            "receipt_bearing_final_gate_required": True,
        },
    }
    for path in sorted(OUT_DIR.iterdir(), key=lambda p: p.name):
        if path.is_file() and path.name != "transport-manifest.json":
            manifest["files"][path.name] = sha256_bytes(path.read_bytes())
    manifest_path = OUT_DIR / "transport-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    manifest_sha = sha256_bytes(manifest_path.read_bytes())

    tgz = deterministic_tgz(OUT_DIR)
    transport_sha = sha256_bytes(tgz)
    encoded = base64.b64encode(tgz).decode("ascii")
    shard_size = 24000
    shards = [encoded[i:i + shard_size] for i in range(0, len(encoded), shard_size)]
    transport_dir = CARRIER_DIR / ".ci/doctor-who-cycle-006"
    workflow_dir = CARRIER_DIR / ".github/workflows"
    transport_dir.mkdir(parents=True, exist_ok=True)
    workflow_dir.mkdir(parents=True, exist_ok=True)
    for index, shard in enumerate(shards, start=1):
        name = "scripts.tgz.b64" if index == 1 else f"scripts.tgz.b64.part-{index:03d}"
        (transport_dir / name).write_text(shard + "\n")
    (workflow_dir / "complete-doctor-who-cycle-006-kayste.yml").write_text(
        workflow_text(transport_sha, len(shards), materializer_sha, finalizer_sha, manifest_sha)
    )
    receipt = {
        "version": 1,
        "exact_main": EXACT_MAIN,
        "target_branch": TARGET_BRANCH,
        "transport_sha256": transport_sha,
        "transport_bytes": len(tgz),
        "transport_parts": len(shards),
        "materializer_sha256": materializer_sha,
        "finalizer_sha256": finalizer_sha,
        "transport_manifest_sha256": manifest_sha,
        "carrier_paths": sorted(str(path.relative_to(CARRIER_DIR)) for path in CARRIER_DIR.rglob("*") if path.is_file()),
    }
    (CARRIER_DIR / "BUILD-RECEIPT.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps(receipt, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
