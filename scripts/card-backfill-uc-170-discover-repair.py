#!/usr/bin/env python3
"""Build an isolated UC-170 discoverer with retained failure custody."""
from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-170-discover.mjs")
DEST = Path("scripts/.card-backfill-uc-170-discover-run.mjs")
FAILURES = Path(".github/CARD-BACKFILL-UC-170-DISCOVER-FAILURES.json")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-170 repair anchor count {name}: {count}")
    return text.replace(old, new, 1)


failure_ledger = json.loads(FAILURES.read_text(encoding="utf-8"))
rows = failure_ledger.get("failed_discovery_checkpoints", [])
if (
    failure_ledger.get("version") != 1
    or failure_ledger.get("record_id") != "UC-170"
    or len(rows) != 1
    or rows[0].get("artifact_id") != 8712519412
    or rows[0].get("head_sha") != "820258a7f3ad3a9c9b6c3d112e32f52813d704f7"
):
    raise SystemExit("UC-170 failed discovery custody drift")

text = SOURCE.read_text(encoding="utf-8")
text = replace_once(
    text,
    "      ...result.selected, repository_matches\n",
    "      ...result.selected, repository_matches: repositoryMatches\n",
    "candidate duplicate receipt",
)
text = replace_once(
    text,
    "const control = await readJson(CONTROL);\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-170', 'UC-170 discovery scope drift');",
    "const control = await readJson(CONTROL);\nconst failureLedger = await readJson('.github/CARD-BACKFILL-UC-170-DISCOVER-FAILURES.json');\nassert(failureLedger.version === 1 && failureLedger.record_id === 'UC-170' && failureLedger.failed_discovery_checkpoints?.length === 1 && failureLedger.failed_discovery_checkpoints[0]?.artifact_id === 8712519412, 'UC-170 failed discovery custody drift');\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-170', 'UC-170 discovery scope drift');",
    "control custody",
)
text = replace_once(
    text,
    "    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,\n    repository_hash_count: repository.size,",
    "    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), failure_ledger_sha256: sha(await readFile('.github/CARD-BACKFILL-UC-170-DISCOVER-FAILURES.json')), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, discovery_repair_boundary: failureLedger.repair_boundary,\n    repository_hash_count: repository.size,",
    "manifest failure custody",
)
text = replace_once(
    text,
    "    record_id: 'UC-170', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', years: '1980s–',\n    candidate_count: candidates.length, role_counts: roleCounts,",
    "    record_id: 'UC-170', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', years: '1980s–',\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, candidate_count: candidates.length, role_counts: roleCounts,",
    "summary failure custody",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-170 repaired discoverer to {DEST}")
