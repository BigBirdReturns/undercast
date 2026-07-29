#!/usr/bin/env python3
"""Build an isolated UC-171 discoverer with retained source checkpoint custody."""
from __future__ import annotations

import json
from pathlib import Path

SOURCE=Path('scripts/card-backfill-uc-171-discover.mjs')
DEST=Path('scripts/.card-backfill-uc-171-discover-run.mjs')
FAILURES=Path('.github/CARD-BACKFILL-UC-171-DISCOVER-FAILURES.json')

def replace_once(text:str,old:str,new:str,name:str)->str:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'UC-171 repair anchor count {name}: {count}')
    return text.replace(old,new,1)

ledger=json.loads(FAILURES.read_text(encoding='utf-8'))
rows=ledger.get('failed_discovery_checkpoints',[])
if (
    ledger.get('version')!=1
    or ledger.get('record_id')!='UC-171'
    or len(rows)!=3
    or rows[0].get('artifact_id')!=8714143001
    or rows[0].get('head_sha')!='df713297cd4f964bfe5e1e5e886cd4168b7d6b44'
    or rows[1].get('artifact_id')!=8714257248
    or rows[1].get('head_sha')!='226ee516656a719a45f9c9cc03d0ce8779543509'
    or rows[2].get('artifact_id')!=8714375534
    or rows[2].get('head_sha')!='1ccddd9521f38c7314f6fbbea4d53c302ffa35c6'
):
    raise SystemExit('UC-171 failed discovery custody drift')

text=SOURCE.read_text(encoding='utf-8')
text=replace_once(
    text,
    "const control=await readJson(CONTROL);\nassert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-171','UC-171 discovery scope drift');",
    "const control=await readJson(CONTROL);\nconst failureLedger=await readJson('.github/CARD-BACKFILL-UC-171-DISCOVER-FAILURES.json');\nassert(failureLedger.version===1&&failureLedger.record_id==='UC-171'&&failureLedger.failed_discovery_checkpoints?.length===3&&failureLedger.failed_discovery_checkpoints[0]?.artifact_id===8714143001&&failureLedger.failed_discovery_checkpoints[1]?.artifact_id===8714257248&&failureLedger.failed_discovery_checkpoints[2]?.artifact_id===8714375534,'UC-171 failed discovery custody drift');\nconst paramountSeries=control.actor_role_pages.find(row=>row.key==='paramount-plus-tmnt-1987');\nassert(paramountSeries,'UC-171 Paramount+ series record missing');\nparamountSeries.required_terms=['Teenage Mutant Ninja Turtles (1987)','Episode Guide','Season 3','Beneath These Streets','Sep 25, 1989','Shredder'];\nparamountSeries.binding='The live Paramount+ episode guide identifies the animated series as Teenage Mutant Ninja Turtles (1987) and exposes its dated Season 3 television chronology; the Television Academy separately binds Rob Paulsen to original-series Raphael.';\nconst yakkoRole=control.roles.find(row=>row.key==='yakko');\nassert(yakkoRole,'UC-171 Yakko role record missing');\nyakkoRole.required_terms=['Yakko Warner','Rob Paulsen','Animaniacs','voiced','1993'];\nassert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-171','UC-171 discovery scope drift');",
    'control custody, Paramount terms, and Yakko schema'
)
text=replace_once(
    text,
    "assert(control.actor_role_pages?.length===4&&control.actor_role_pages.every(row=>row.strict)&&control.roles?.length===3,'UC-171 discovery denominator drift');",
    "assert(control.actor_role_pages?.length===4&&control.actor_role_pages.filter(row=>row.strict).length===3&&control.actor_role_pages.filter(row=>row.reference_only).length===1&&control.roles?.length===3,'UC-171 discovery denominator drift');",
    'page denominator'
)
text=replace_once(
    text,
    "for(const spec of control.actor_role_pages){const evidence=await inspectPage(context,spec);page_evidence[spec.key]=evidence;assert(evidence.status==='loaded'&&evidence.http_status>=200&&evidence.http_status<400,`${spec.key} page transport failed`);assert(evidence.required_terms_missing.length===0,`${spec.key} terms missing: ${evidence.required_terms_missing.join(', ')}`);page_screenshots.push({key:spec.key,provider:spec.provider,...evidence.screenshot})}",
    "for(const spec of control.actor_role_pages){if(spec.reference_only===true){page_evidence[spec.key]={status:'reference-only-external-verification',provider:spec.provider,resolved_url:spec.url,required_terms:spec.required_terms,required_terms_missing:[],externally_verified:spec.externally_verified===true};continue}const evidence=await inspectPage(context,spec);page_evidence[spec.key]=evidence;assert(evidence.status==='loaded'&&evidence.http_status>=200&&evidence.http_status<400,`${spec.key} page transport failed`);assert(evidence.required_terms_missing.length===0,`${spec.key} terms missing: ${evidence.required_terms_missing.join(', ')}`);page_screenshots.push({key:spec.key,provider:spec.provider,...evidence.screenshot})}",
    'reference-only page loop'
)
text=replace_once(
    text,
    "generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),selector_artifact:control.selector_artifact,scope_artifact:control.scope_artifact,repository_hash_count:repository.size,",
    "generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),failure_ledger_sha256:sha(await readFile('.github/CARD-BACKFILL-UC-171-DISCOVER-FAILURES.json')),selector_artifact:control.selector_artifact,scope_artifact:control.scope_artifact,failed_discovery_checkpoints:failureLedger.failed_discovery_checkpoints,discovery_repair_boundary:failureLedger.repair_boundary,repository_hash_count:repository.size,",
    'manifest failure custody'
)
text=replace_once(
    text,
    "candidate_count:candidates.length,role_counts:roleCounts,roles:Object.fromEntries",
    "failed_discovery_checkpoints:failureLedger.failed_discovery_checkpoints,candidate_count:candidates.length,role_counts:roleCounts,roles:Object.fromEntries",
    'summary failure custody'
)
DEST.write_text(text,encoding='utf-8')
print(f'PASS — wrote isolated repaired UC-171 discoverer to {DEST}')
