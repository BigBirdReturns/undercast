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
    or len(rows) != 4
    or rows[0].get("artifact_id") != 8706731789
    or rows[1].get("run_id") != 30406725565
    or rows[2].get("artifact_id") != 8706939535
    or rows[3].get("artifact_id") != 8707028764
):
    raise SystemExit("UC-126 failed discovery custody drift")

text = SOURCE.read_text(encoding="utf-8")
text = replace_once(
    text,
    "const control = await readJson(CONTROL);\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 discovery scope drift');",
    "const control = await readJson(CONTROL);\nconst failureLedger = await readJson('.github/CARD-BACKFILL-UC-126-DISCOVER-FAILURES.json');\nassert(failureLedger.version === 1 && failureLedger.record_id === 'UC-126' && failureLedger.failed_discovery_checkpoints?.length === 4 && failureLedger.failed_discovery_checkpoints[0]?.artifact_id === 8706731789 && failureLedger.failed_discovery_checkpoints[1]?.run_id === 30406725565 && failureLedger.failed_discovery_checkpoints[2]?.artifact_id === 8706939535 && failureLedger.failed_discovery_checkpoints[3]?.artifact_id === 8707028764, 'UC-126 failed discovery custody drift');\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 discovery scope drift');",
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
    "  if (page.pageimage) addTitle(`File:${page.pageimage}`);",
    "  if (page.pageimage) addTitle(`File:${page.pageimage}`);\n  for (const match of rawWikitext.matchAll(/\\[\\[(?:File|Image):([^|\\]\\n]+)/gi)) addTitle(`File:${match[1].trim()}`);",
    "raw revision file inventory",
)
text = replace_once(
    text,
    "      if (dimensions.width < 180 || dimensions.height < 180) continue;",
    "      const genericDimensionFloorException = dimensions.width < 180 || dimensions.height < 180;\n      const sourceFloor = role.key === 'bubbles' ? 100 : 180;\n      if (dimensions.width < sourceFloor || dimensions.height < sourceFloor) continue;",
    "source floor",
)
text = replace_once(
    text,
    "        ...dimensions,\n        score: row.score,",
    "        ...dimensions,\n        generic_dimension_floor_exception: genericDimensionFloorException,\n        score: row.score,",
    "floor receipt",
)
text = replace_once(
    text,
    "    scope_artifact: control.scope_artifact,\n    repository_hash_count: repository.size,",
    "    scope_artifact: control.scope_artifact,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints,\n    discovery_repair_boundary: failureLedger.repair_boundary,\n    repository_hash_count: repository.size,",
    "manifest",
)
text = replace_once(
    text,
    "    production: 'Powerpuff Girls / Fairly OddParents / etc.',\n    role_counts: roleCounts,\n    candidate_count: candidates.length,",
    "    production: 'Powerpuff Girls / Fairly OddParents / etc.',\n    role_counts: roleCounts,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints,\n    candidate_count: candidates.length,",
    "summary",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-126 discovery runner to {DEST}")
