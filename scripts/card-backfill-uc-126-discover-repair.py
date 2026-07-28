#!/usr/bin/env python3
"""Build the isolated UC-126 discovery runner without mutating the committed collector."""
from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-126-discover.mjs")
DEST = Path("scripts/.card-backfill-uc-126-discover-run.mjs")
FAILURES = Path(".github/CARD-BACKFILL-UC-126-DISCOVER-FAILURES.json")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-126 repair anchor count {name}: {count}")
    return text.replace(old, new, 1)


failure_ledger = json.loads(FAILURES.read_text(encoding="utf-8"))
rows = failure_ledger.get("failed_discovery_checkpoints", [])
if (
    failure_ledger.get("version") != 1
    or failure_ledger.get("record_id") != "UC-126"
    or len(rows) != 6
    or rows[0].get("artifact_id") != 8706731789
    or rows[1].get("run_id") != 30406725565
    or rows[2].get("artifact_id") != 8706939535
    or rows[3].get("artifact_id") != 8707028764
    or rows[4].get("artifact_id") != 8707103373
    or rows[5].get("run_id") != 30407678136
):
    raise SystemExit("UC-126 failed discovery custody drift")

text = SOURCE.read_text(encoding="utf-8")
text = replace_once(
    text,
    "const control = await readJson(CONTROL);\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 discovery scope drift');",
    "const control = await readJson(CONTROL);\nconst failureLedger = await readJson('.github/CARD-BACKFILL-UC-126-DISCOVER-FAILURES.json');\nassert(failureLedger.version === 1 && failureLedger.record_id === 'UC-126' && failureLedger.failed_discovery_checkpoints?.length === 6 && failureLedger.failed_discovery_checkpoints[0]?.artifact_id === 8706731789 && failureLedger.failed_discovery_checkpoints[1]?.run_id === 30406725565 && failureLedger.failed_discovery_checkpoints[2]?.artifact_id === 8706939535 && failureLedger.failed_discovery_checkpoints[3]?.artifact_id === 8707028764 && failureLedger.failed_discovery_checkpoints[4]?.artifact_id === 8707103373 && failureLedger.failed_discovery_checkpoints[5]?.run_id === 30407678136, 'UC-126 failed discovery custody drift');\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 discovery scope drift');",
    "control",
)
text = replace_once(
    text,
    "assert(control.actor_role_pages?.length === 5 && control.actor_role_pages.filter(row => row.strict).length === 3 && control.actor_role_pages.filter(row => row.reference_only).length === 2, 'UC-126 actor-role denominator drift');",
    "assert(control.actor_role_pages?.length === 5 && control.actor_role_pages.filter(row => row.strict).length === 2 && control.actor_role_pages.filter(row => row.reference_only).length === 3, 'UC-126 actor-role denominator drift');",
    "denominator",
)
text = replace_once(
    text,
    "assert(control.selection_contract?.exact_four_role_composite_required === true && control.selection_contract?.original_1998_bubbles_required === true && control.selection_contract?.tara_strong_timmy_main_series_required === true && control.selection_contract?.named_dc_super_hero_girls_harley_continuity_required === true && control.selection_contract?.friendship_is_magic_twilight_required === true && control.selection_contract?.canonical_1998_is_bubbles_chronology_only === true && control.selection_contract?.all_four_panels_required === true && control.selection_contract?.canonical_mutation === false, 'UC-126 selection contract drift');",
    "assert(control.selection_contract?.exact_four_role_composite_required === true && control.selection_contract?.bubbles_probe_artifact_required === true && control.bubbles_probe_artifact?.artifact_id === 8707180738 && control.bubbles_probe_artifact?.summary_sha256 === '7a37a081951ee3204e9b9acdabab49a4cad68427b1fff2b95c982e9c8fc6212e' && control.selection_contract?.original_1998_bubbles_required === true && control.selection_contract?.tara_strong_timmy_main_series_required === true && control.selection_contract?.named_dc_super_hero_girls_harley_continuity_required === true && control.selection_contract?.friendship_is_magic_twilight_required === true && control.selection_contract?.canonical_1998_is_bubbles_chronology_only === true && control.selection_contract?.all_four_panels_required === true && control.selection_contract?.canonical_mutation === false, 'UC-126 selection contract drift');",
    "probe contract",
)
text = replace_once(
    text,
    "  if (page.pageimage) addTitle(`File:${page.pageimage}`);",
    "  if (page.pageimage) addTitle(`File:${page.pageimage}`);\n  for (const match of rawWikitext.matchAll(/\\[\\[(?:File|Image):([^|\\]\\n]+)/gi)) addTitle(`File:${match[1].trim()}`);",
    "raw revision file inventory",
)
text = replace_once(
    text,
    "  let score = 0;",
    "  let score = Number(row.score_bonus || 0);",
    "score bonus",
)
text = replace_once(
    text,
    "  const roleSignal = filenameMatches.length > 0 || row.title === pageImageTitle;",
    "  const roleSignal = row.direct_asset === true || filenameMatches.length > 0 || row.title === pageImageTitle;",
    "direct role signal",
)
text = replace_once(
    text,
    "  const pageImageTitle = page.pageimage ? `File:${page.pageimage}` : null;",
    "  for (const asset of role.direct_assets || []) {\n    rows.push({\n      title: asset.title,\n      url: asset.url,\n      thumburl: null,\n      mime: null,\n      width: asset.expected_width || 0,\n      height: asset.expected_height || 0,\n      metadata_text: asset.metadata_text || '',\n      extmetadata: {},\n      direct_asset: true,\n      expected_sha256: asset.expected_sha256 || null,\n      expected_width: asset.expected_width || null,\n      expected_height: asset.expected_height || null,\n      score_bonus: asset.score_bonus || 0,\n      probe_rank: asset.probe_rank || null\n    });\n  }\n  const pageImageTitle = page.pageimage ? `File:${page.pageimage}` : null;",
    "direct assets",
)
text = replace_once(
    text,
    "    .filter(row => row.roleSignal)",
    "    .filter(row => row.direct_asset === true || row.roleSignal)",
    "direct filter",
)
text = replace_once(
    text,
    "  add(row.url, 'api-original');",
    "  add(row.url, row.direct_asset === true ? 'hash-pinned-probe-delivery' : 'api-original');",
    "direct probe kind",
)
text = replace_once(
    text,
    "      const mime = signatureMime(bytes);\n      if (bytes.length < 7000 || mime === 'unknown') continue;",
    "      const mime = signatureMime(bytes);\n      const contentSha = sha(bytes);\n      const byteFloor = role.key === 'bubbles' ? 3000 : 7000;\n      if (bytes.length < byteFloor || mime === 'unknown') continue;\n      if (row.expected_sha256) assert(contentSha === row.expected_sha256, `${role.key} probe hash drift for ${row.title}`);",
    "direct hash and byte floor",
)
text = replace_once(
    text,
    "      try { dimensions = identify(path, mime); } catch {}\n      if (dimensions.width < 180 || dimensions.height < 180) continue;",
    "      try { dimensions = identify(path, mime); } catch {}\n      if (row.expected_width) assert(dimensions.width === row.expected_width, `${role.key} probe width drift for ${row.title}`);\n      if (row.expected_height) assert(dimensions.height === row.expected_height, `${role.key} probe height drift for ${row.title}`);\n      const genericDimensionFloorException = dimensions.width < 180 || dimensions.height < 180;\n      const sourceFloor = role.key === 'bubbles' ? 100 : 180;\n      if (dimensions.width < sourceFloor || dimensions.height < sourceFloor) continue;",
    "dimensions and source floor",
)
text = replace_once(
    text,
    "        sha256: sha(bytes),\n        ...dimensions,\n        score: row.score,",
    "        sha256: contentSha,\n        ...dimensions,\n        generic_dimension_floor_exception: genericDimensionFloorException,\n        direct_asset: row.direct_asset === true,\n        probe_rank: row.probe_rank || null,\n        score: row.score,",
    "direct asset receipt",
)
text = replace_once(
    text,
    "    scope_artifact: control.scope_artifact,\n    repository_hash_count: repository.size,",
    "    scope_artifact: control.scope_artifact,\n    bubbles_probe_artifact: control.bubbles_probe_artifact,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints,\n    discovery_repair_boundary: failureLedger.repair_boundary,\n    repository_hash_count: repository.size,",
    "manifest",
)
text = replace_once(
    text,
    "    production: 'Powerpuff Girls / Fairly OddParents / etc.',\n    role_counts: roleCounts,\n    candidate_count: candidates.length,",
    "    production: 'Powerpuff Girls / Fairly OddParents / etc.',\n    role_counts: roleCounts,\n    bubbles_probe_artifact: control.bubbles_probe_artifact,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints,\n    candidate_count: candidates.length,",
    "summary",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-126 discovery runner to {DEST}")
