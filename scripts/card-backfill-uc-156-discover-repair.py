#!/usr/bin/env python3
"""Build an isolated UC-156 discoverer with page-specific evidence screenshots."""
from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-156-discover.mjs")
DEST = Path("scripts/.card-backfill-uc-156-discover-run.mjs")
FAILURES = Path(".github/CARD-BACKFILL-UC-156-DISCOVER-FAILURES.json")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-156 repair anchor count {name}: {count}")
    return text.replace(old, new, 1)


failure_ledger = json.loads(FAILURES.read_text(encoding="utf-8"))
rows = failure_ledger.get("failed_discovery_checkpoints", [])
if (
    failure_ledger.get("version") != 1
    or failure_ledger.get("record_id") != "UC-156"
    or len(rows) != 1
    or rows[0].get("artifact_id") != 8711851622
    or rows[0].get("head_sha") != "e72b3244233b758f1405a650d43c7c770b27aadd"
):
    raise SystemExit("UC-156 failed discovery custody drift")

text = SOURCE.read_text(encoding="utf-8")
text = replace_once(
    text,
    "const control = await readJson(CONTROL);\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-156', 'UC-156 discovery scope drift');",
    "const control = await readJson(CONTROL);\nconst failureLedger = await readJson('.github/CARD-BACKFILL-UC-156-DISCOVER-FAILURES.json');\nassert(failureLedger.version === 1 && failureLedger.record_id === 'UC-156' && failureLedger.failed_discovery_checkpoints?.length === 1 && failureLedger.failed_discovery_checkpoints[0]?.artifact_id === 8711851622, 'UC-156 failed discovery custody drift');\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-156', 'UC-156 discovery scope drift');",
    "control",
)
text = replace_once(
    text,
    "    await page.waitForTimeout(1400); await acceptBanners(page);\n    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 1300); await page.waitForTimeout(140); }\n    const body = await page.locator('body').innerText().catch(() => '');",
    "    await page.waitForTimeout(1400); await acceptBanners(page);\n    const focusTerms = {\n      'doctorwho-dalek-2005': 'Dalek Voice: Nicholas Briggs',\n      'doctorwho-army-of-ghosts-2006': 'Dalek/Cybermen (voices): Nicholas Briggs',\n      'doctorwho-daleks-character': \"A nightmare. It's a mutation\",\n      'doctorwho-cybermen-character': 'You belong to us. You shall be like us'\n    };\n    const focusTerm = focusTerms[spec.key];\n    const focus = focusTerm ? page.getByText(focusTerm, { exact: false }) : null;\n    const focusCount = focus ? await focus.count().catch(() => 0) : 0;\n    if (focusCount > 0) {\n      await focus.last().scrollIntoViewIfNeeded().catch(() => {});\n      await page.waitForTimeout(500);\n    } else {\n      throw new Error(`missing screenshot focus term for ${spec.key}: ${focusTerm}`);\n    }\n    const body = await page.locator('body').innerText().catch(() => '');",
    "focused screenshot",
)
text = replace_once(
    text,
    "  const roleRows = [];\n  for (const role of control.roles) roleRows.push(await downloadRole(context, role));",
    "  const screenshotHashes = page_screenshots.map(row => row.sha256);\n  assert(screenshotHashes.length === 4 && new Set(screenshotHashes).size === 4, `UC-156 page screenshot collision: ${screenshotHashes.join(', ')}`);\n  const roleRows = [];\n  for (const role of control.roles) roleRows.push(await downloadRole(context, role));",
    "screenshot collision gate",
)
text = replace_once(
    text,
    "    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,\n    repository_hash_count: repository.size,",
    "    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), failure_ledger_sha256: sha(await readFile('.github/CARD-BACKFILL-UC-156-DISCOVER-FAILURES.json')), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, discovery_repair_boundary: failureLedger.repair_boundary,\n    repository_hash_count: repository.size,",
    "manifest custody",
)
text = replace_once(
    text,
    "    record_id: 'UC-156', actor: 'Nicholas Briggs', character: 'The voice of the Daleks & Cybermen', production: 'Doctor Who (2005– )', years: '2005–',\n    candidate_count: candidates.length, role_counts: roleCounts, candidates, contact_sheet: contactSheet, canonical_mutation: false",
    "    record_id: 'UC-156', actor: 'Nicholas Briggs', character: 'The voice of the Daleks & Cybermen', production: 'Doctor Who (2005– )', years: '2005–',\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, candidate_count: candidates.length, role_counts: roleCounts, candidates, contact_sheet: contactSheet, canonical_mutation: false",
    "summary custody",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-156 focused discoverer to {DEST}")
