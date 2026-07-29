#!/usr/bin/env python3
"""Build an isolated UC-146 portrait discoverer with retained failure custody."""
from __future__ import annotations

import json
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-146-discover.mjs")
DEST = Path("scripts/.card-backfill-uc-146-discover-run.mjs")
FAILURES = Path(".github/CARD-BACKFILL-UC-146-DISCOVER-FAILURES.json")


def replace_once(text: str, old: str, new: str, name: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"UC-146 repair anchor count {name}: {count}")
    return text.replace(old, new, 1)


failure_ledger = json.loads(FAILURES.read_text(encoding="utf-8"))
rows = failure_ledger.get("failed_discovery_checkpoints", [])
if (
    failure_ledger.get("version") != 1
    or failure_ledger.get("record_id") != "UC-146"
    or len(rows) != 2
    or rows[0].get("artifact_id") != 8709557095
    or rows[0].get("head_sha") != "467330424b785612be368398b6c7145e0a6f379e"
    or rows[1].get("artifact_id") != 8709666865
    or rows[1].get("head_sha") != "f64cd601b26dd78cc62a3b5f081215ddb72a1227"
):
    raise SystemExit("UC-146 failed discovery custody drift")

text = SOURCE.read_text(encoding="utf-8")
text = replace_once(
    text,
    "const control = await readJson(CONTROL);\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-146', 'UC-146 discovery scope drift');",
    "const control = await readJson(CONTROL);\nconst failureLedger = await readJson('.github/CARD-BACKFILL-UC-146-DISCOVER-FAILURES.json');\nassert(failureLedger.version === 1 && failureLedger.record_id === 'UC-146' && failureLedger.failed_discovery_checkpoints?.length === 2 && failureLedger.failed_discovery_checkpoints[0]?.artifact_id === 8709557095 && failureLedger.failed_discovery_checkpoints[1]?.artifact_id === 8709666865, 'UC-146 failed discovery custody drift');\nassert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-146', 'UC-146 discovery scope drift');",
    "control",
)
text = replace_once(
    text,
    "assert(control.actor_identity_pages?.length === 2 && control.actor_identity_pages.every(row => row.strict) && control.commons?.files?.length === 2 && control.selection_contract?.required_candidate_count === 2, 'UC-146 discovery denominator drift');",
    "assert(control.actor_identity_pages?.length === 4 && control.actor_identity_pages.filter(row => row.strict).length === 2 && control.actor_identity_pages.filter(row => row.reference_only).length === 2 && control.commons?.files?.length === 2 && control.selection_contract?.required_candidate_count === 2, 'UC-146 discovery denominator drift');",
    "denominator",
)
text = replace_once(
    text,
    "  for (const spec of control.actor_identity_pages) {\n    const evidence = await inspectPage(context, spec);\n    page_evidence[spec.key] = evidence;\n    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} identity page transport failed`);\n    assert(evidence.required_terms_missing.length === 0, `${spec.key} identity terms missing: ${evidence.required_terms_missing.join(', ')}`);\n    page_screenshots.push({ key: spec.key, provider: spec.provider, ...evidence.screenshot });\n  }",
    "  for (const spec of control.actor_identity_pages) {\n    if (spec.reference_only === true) {\n      page_evidence[spec.key] = { status: 'reference-only-external-verification', provider: spec.provider, resolved_url: spec.url, required_terms: spec.required_terms, required_terms_missing: [], externally_verified: spec.externally_verified === true };\n      continue;\n    }\n    const evidence = await inspectPage(context, spec);\n    page_evidence[spec.key] = evidence;\n    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} identity page transport failed`);\n    assert(evidence.required_terms_missing.length === 0, `${spec.key} identity terms missing: ${evidence.required_terms_missing.join(', ')}`);\n    page_screenshots.push({ key: spec.key, provider: spec.provider, ...evidence.screenshot });\n  }",
    "identity page loop",
)
text = replace_once(
    text,
    "generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,\n    repository_hash_count: repository.size, actor_identity_bindings: control.actor_identity_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),",
    "generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,\n    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, discovery_repair_boundary: failureLedger.repair_boundary,\n    repository_hash_count: repository.size, actor_identity_bindings: control.actor_identity_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, strict: row.strict === true, reference_only: row.reference_only === true, externally_verified: row.externally_verified === true, page_evidence_key: row.key })),",
    "manifest custody",
)
text = replace_once(
    text,
    "record_id: 'UC-146', actor: 'Tim Rose', side: 'portrait', candidate_count: candidates.length,",
    "record_id: 'UC-146', actor: 'Tim Rose', side: 'portrait', failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, candidate_count: candidates.length,",
    "summary custody",
)
text = replace_once(
    text,
    "actor_identity_pages: control.actor_identity_pages.map(row => ({ key: row.key, provider: row.provider, url: row.url, screenshot_sha256: page_evidence[row.key]?.screenshot?.sha256 || null, body_sha256: page_evidence[row.key]?.body_sha256 || null })),",
    "actor_identity_pages: control.actor_identity_pages.map(row => ({ key: row.key, provider: row.provider, url: row.url, strict: row.strict === true, reference_only: row.reference_only === true, externally_verified: row.externally_verified === true, screenshot_sha256: page_evidence[row.key]?.screenshot?.sha256 || null, body_sha256: page_evidence[row.key]?.body_sha256 || null })),",
    "summary identity pages",
)
DEST.write_text(text, encoding="utf-8")
print(f"PASS — wrote isolated UC-146 portrait discoverer to {DEST}")
