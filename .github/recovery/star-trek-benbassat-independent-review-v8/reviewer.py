#!/usr/bin/env python3
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import hashlib, json, os, sys

OUT=Path(os.environ['OUT'])
TASK_ID=os.environ['TASK_ID']; PERFORMER=os.environ['EXPECTED_PERFORMER']; CHARACTER=os.environ['EXPECTED_CHARACTER']
FINGERPRINT=os.environ['EXPECTED_FINGERPRINT']; LEASE_ID=os.environ['EXPECTED_LEASE']; WALL_ID=os.environ['WALL_ID']
EXPECTED_MAIN=os.environ['EXPECTED_MAIN']; EXPECTED_TREE=os.environ['EXPECTED_TREE']; LIVE_MAIN=os.environ['LIVE_MAIN']; LIVE_TREE=os.environ['LIVE_TREE']
CLAIM_COMMIT=os.environ['EXPECTED_CLAIM_COMMIT']; CLAIM_TREE=os.environ['EXPECTED_CLAIM_TREE']
SOURCE_REVIEW_SHA=os.environ['EXPECTED_SOURCE_REVIEW_SHA']; MEDIA_RECEIPT_SHA=os.environ['EXPECTED_MEDIA_RECEIPT_SHA']; SETTLEMENT_SHA=os.environ['EXPECTED_SETTLEMENT_SHA']
CANDIDATE_COMMIT=os.environ['EXPECTED_CANDIDATE_COMMIT']; CANDIDATE_TREE=os.environ['EXPECTED_CANDIDATE_TREE']; CANDIDATE_RECEIPT_SHA=os.environ['EXPECTED_CANDIDATE_RECEIPT_SHA']; MEDIA_AUDIT_SHA=os.environ['EXPECTED_MEDIA_AUDIT_SHA']

def stable(v:Any)->Any:
    if isinstance(v,dict): return {k:stable(v[k]) for k in sorted(v)}
    if isinstance(v,list): return [stable(x) for x in v]
    return v

def read(path:Path)->Any: return json.loads(path.read_text(encoding='utf-8'))
def write(path:Path,v:Any)->None:
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(stable(v),indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def hash_json(v:Any)->str: return hashlib.sha256((json.dumps(stable(v),indent=2,ensure_ascii=False)+'\n').encode()).hexdigest()
def hash_file(path:Path)->str: return hashlib.sha256(path.read_bytes()).hexdigest()
def identity(path:Path,field:str,omitted:tuple[str,...]=())->str:
    p=read(path); expected=p[field]; body=dict(p); body.pop(field,None)
    for k in omitted: body.pop(k,None)
    actual=hash_json(body)
    if actual!=expected: raise SystemExit(f'{path.name} identity mismatch: {actual} != {expected}')
    return expected

def compact_identity(receipt:dict[str,Any])->None:
    expected=receipt.get('receipt_sha256'); body=dict(receipt); body.pop('receipt_sha256',None)
    actual=hashlib.sha256(json.dumps(body,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    if actual!=expected: raise SystemExit(f'projection receipt identity mismatch: {actual} != {expected}')

def walk(node:Any):
    if isinstance(node,dict):
        yield node
        for v in node.values(): yield from walk(v)
    elif isinstance(node,list):
        for v in node: yield from walk(v)

def expect(obj:dict[str,Any],required:dict[str,Any],label:str)->None:
    for k,v in required.items():
        if obj.get(k)!=v: raise SystemExit(f'{label} {k} drifted: {obj.get(k)}')

def inspect()->None:
    candidate_path=OUT/'candidate-receipt.json'; source_path=OUT/'source-review.json'; media_receipt_path=OUT/'media-receipt.json'; settlement_path=OUT/'preproduct-settlement.json'
    candidate=read(candidate_path); source=read(source_path); media_receipt=read(media_receipt_path); settlement=read(settlement_path)
    if identity(candidate_path,'receipt_sha256')!=CANDIDATE_RECEIPT_SHA: raise SystemExit('candidate receipt identity drifted')
    if identity(source_path,'review_sha256',('artifact',))!=SOURCE_REVIEW_SHA: raise SystemExit('source review identity drifted')
    if identity(media_receipt_path,'receipt_sha256',('artifact',))!=MEDIA_RECEIPT_SHA: raise SystemExit('media receipt identity drifted')
    if identity(settlement_path,'receipt_sha256',('artifact',))!=SETTLEMENT_SHA: raise SystemExit('settlement identity drifted')
    expect(candidate,{'transaction':'STAR-TREK-BENBASSAT-CANDIDATE-V3','status':'candidate-ready-for-independent-review','canonical_parent':EXPECTED_MAIN,'canonical_tree':EXPECTED_TREE,'claim_commit':CLAIM_COMMIT,'publication_base':{'commit':LIVE_MAIN,'tree':LIVE_TREE,'kind':'product-neutral-media-search-maintenance'}},'candidate')
    expect(candidate.get('task') or {},{'id':TASK_ID,'lease_id':LEASE_ID,'performer':PERFORMER,'character':CHARACTER,'source_fingerprint':FINGERPRINT,'status':'resolved','attempts':1,'wall_ids':[WALL_ID]},'candidate task')
    expected_counts={'total':2228,'queued':1797,'resolved':429,'blocked':0,'rejected':2,'in_flight':0}
    if candidate.get('queue')!=expected_counts: raise SystemExit(f'candidate queue drifted: {candidate.get("queue")}')
    expect(candidate.get('source_review') or {},{'review_sha256':SOURCE_REVIEW_SHA,'verdict':'pass','production':'Star Trek: Picard','episode':'Võx','performance_mode':'voice-only'},'source summary')
    cm=candidate.get('media') or {}
    if cm.get('receipt_sha256')!=MEDIA_RECEIPT_SHA: raise SystemExit('candidate media receipt drifted')
    for side in ('still','portrait'):
        if (cm.get('facets') or {}).get(side,{}).get('status')!='absent': raise SystemExit(f'candidate {side} is not absent')
    boundary=candidate.get('boundary') or {}
    expect(boundary,{'off_screen_voiceover':True,'physical_prosthetic_hint_accepted':False,'physical_performance_attributed':False,'prosthetic_performance_attributed':False,'animation_performance_attributed':False,'maker_attribution':'unresolved','transformation_measured':False,'honest_media_absence':True,'cross_facet_substitution':False,'independent_product_review_complete':False,'waterline_cycle_recorded':False,'canonical_mutation':False,'additional_lease_issued':False},'candidate boundary')
    projection=candidate.get('projection_refresh') or {}; pre=projection.get('precomplete') or {}; terminal=projection.get('terminal') or {}
    for receipt in (pre,terminal):
        compact_identity(receipt); coverage=receipt.get('coverage') or {}
        expect(coverage,{'performer':PERFORMER,'character':CHARACTER,'role_on_wall':True,'wall_ids':[WALL_ID]},'projection coverage')
    if pre.get('success') is not True or pre.get('mode') not in {'live-refresh','frozen-project-only'}: raise SystemExit('precomplete projection inadmissible')
    if pre.get('mode')=='frozen-project-only':
        if pre.get('fallback_reason')!='recognized-source-unavailability' or pre.get('source_snapshot_unchanged') is not True: raise SystemExit('frozen fallback custody failed')
        attempts=pre.get('attempts') or []
        if not attempts or any(x.get('classification')!='recognized-source-unavailability' for x in attempts): raise SystemExit('frozen fallback ledger incomplete')
    if terminal.get('success') is not True or terminal.get('mode')!='project-only' or terminal.get('source_snapshot_unchanged') is not True: raise SystemExit('terminal projection inadmissible')
    state=read(Path('data/AUTOPILOT.json')); trek=[x for x in state.get('jobs',[]) if x.get('scope')=='star-trek']; rows=[x for x in trek if x.get('id')==TASK_ID]
    if len(rows)!=1: raise SystemExit(f'task cardinality drifted: {len(rows)}')
    task=rows[0]
    expect(task,{'status':'resolved','attempts':1,'wall_ids':[WALL_ID]},'durable task')
    if task.get('lease') is not None or task.get('outcome',{}).get('kind')!='audited-wall' or task.get('outcome',{}).get('media_review',{}).get('lease_id')!=LEASE_ID: raise SystemExit('durable lease custody drifted')
    counts={'total':len(trek),'queued':sum(x.get('status')=='queued' for x in trek),'resolved':sum(x.get('status')=='resolved' for x in trek),'blocked':sum(x.get('status')=='blocked' for x in trek),'rejected':sum(x.get('status')=='rejected' for x in trek),'in_flight':sum(x.get('status') in {'leased','drafted','merged'} for x in trek)}
    if counts!=expected_counts: raise SystemExit(f'durable queue drifted: {counts}')
    records=[x for x in read(Path('data/specimens.json')) if x.get('id')==WALL_ID]
    if len(records)!=1: raise SystemExit(f'record cardinality drifted: {len(records)}')
    record=records[0]; expect(record,{'character':CHARACTER,'actor':PERFORMER,'production':'Võx','universe':'Star Trek','years':'2023','designer':'—','transform':2,'kind':'voice','link':'https://memory-alpha.fandom.com/wiki/Benbassat'},'record')
    if record.get('wiki') not in (None,'https://memory-alpha.fandom.com/wiki/Benbassat'): raise SystemExit('record wiki alias drifted')
    if 'still' in record or 'portrait' in record: raise SystemExit('record violates honest absence')
    combined=' '.join(str(record.get(k,'')) for k in ('knownFor','reveal'))
    for token in ('off-screen voiceover','physical-prosthetic hint is rejected','maker function remain unresolved'):
        if token not in combined: raise SystemExit(f'record boundary token missing: {token}')
    refs={x.get('source') for x in record.get('references') or []}
    if not {'https://memory-alpha.fandom.com/wiki/Benbassat','https://memory-alpha.fandom.com/wiki/V%C3%B5x_(episode)'}.issubset(refs): raise SystemExit('record references drifted')
    media_path=Path('data/MEDIA-AUDIT.json')
    if hash_file(media_path)!=MEDIA_AUDIT_SHA: raise SystemExit('MEDIA-AUDIT object drifted')
    media=read(media_path)
    if not isinstance(media,dict) or set(media)!={'items','source','updated_at','version'}: raise SystemExit('MEDIA-AUDIT root schema drifted')
    facets=[x for x in walk(media) if x.get('wall_id')==WALL_ID and x.get('side') in {'still','portrait'}]
    if len(facets)!=2 or {x.get('side') for x in facets}!={'still','portrait'}: raise SystemExit(f'media facet cardinality mismatch: {len(facets)}')
    subjects={'still':CHARACTER,'portrait':PERFORMER}
    for facet in facets:
        side=facet.get('side'); expect(facet,{'scope':'star-trek','wall_id':WALL_ID,'actor':PERFORMER,'character':CHARACTER,'expected_subject':subjects[side],'status':'absent','asset':None,'votes':[],'risk_codes':['source-declared-absent'],'claims':{'identity':None,'presentation':None}},f'{side} facet')
    sources=[x for x in read(Path('data/SOURCES.json')) if x.get('id')==WALL_ID]
    if len(sources)!=1: raise SystemExit(f'SOURCES cardinality drifted: {len(sources)}')
    source_row=sources[0]; expect(source_row,{'actor':PERFORMER,'character':CHARACTER,'still':None,'portrait':None},'SOURCES row')
    if list(Path('images').glob('uc-1397-*')): raise SystemExit('unexpected Benbassat image bytes')
    paths=(OUT/'candidate-paths.txt').read_text().splitlines()
    if 'data/review/adapter-sdk/star-trek-benbassat-candidate.json' not in paths: raise SystemExit('candidate receipt path missing')
    forbidden=[p for p in paths if p.startswith('.github/') or p.startswith('transport/') or '__pycache__' in p or p.endswith('.pyc') or p.startswith('images/uc-1397-')]
    if forbidden: raise SystemExit(f'forbidden candidate paths: {forbidden}')
    write(OUT/'exact-product-evidence.json',{'task':task,'counts':counts,'record':record,'facets':facets,'source_row':source_row,'candidate_paths':paths,'projection_refresh':projection,'identities':{'candidate_commit':CANDIDATE_COMMIT,'candidate_tree':CANDIDATE_TREE,'candidate_receipt_sha256':CANDIDATE_RECEIPT_SHA,'media_audit_sha256':MEDIA_AUDIT_SHA,'source_review_sha256':SOURCE_REVIEW_SHA,'media_receipt_sha256':MEDIA_RECEIPT_SHA,'preproduct_settlement_sha256':SETTLEMENT_SHA}})

def receipt()->None:
    candidate=read(OUT/'candidate-receipt.json'); evidence=read(OUT/'exact-product-evidence.json')
    review={'version':8,'transaction':'STAR-TREK-BENBASSAT-INDEPENDENT-REVIEW-V8','reviewed_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'reviewer':'chatgpt-benbassat-independent-product-reviewer-v8','reviewed_role':'second-desk','verdict':'pass','canonical_parent':EXPECTED_MAIN,'publication_base':{'commit':LIVE_MAIN,'tree':LIVE_TREE,'kind':'product-neutral-media-search-maintenance'},'candidate':{'branch':os.environ['CANDIDATE_BRANCH'],'commit':CANDIDATE_COMMIT,'tree':CANDIDATE_TREE,'receipt_sha256':candidate['receipt_sha256']},'claim':{'branch':os.environ['CLAIM_BRANCH'],'commit':CLAIM_COMMIT,'tree':CLAIM_TREE,'lease_id':LEASE_ID},'preproduct':{'settlement_branch':os.environ['SETTLEMENT_BRANCH'],'receipt_sha256':SETTLEMENT_SHA,'source_review_sha256':SOURCE_REVIEW_SHA,'media_receipt_sha256':MEDIA_RECEIPT_SHA},'task':{'id':TASK_ID,'lease_id':LEASE_ID,'performer':PERFORMER,'character':CHARACTER,'source_fingerprint':FINGERPRINT,'status':'resolved','wall_id':WALL_ID},'queue':evidence['counts'],'projection_refresh':evidence['projection_refresh'],'gates':{'repository_validate':0,'media_gate':0,'thesis_validate':0,'autopilot_fixtures':0},'evidence_sha256':hash_file(OUT/'exact-product-evidence.json'),'boundary':{'production':'Star Trek: Picard','episode':'Võx','year':'2023','performance_mode':'voice-only','off_screen_voiceover':True,'queued_physical_prosthetic_hint_rejected':True,'physical_performance_attributed':False,'prosthetic_performance_attributed':False,'animation_performance_attributed':False,'maker_attribution':'unresolved','transformation_measured':False,'honest_media_absence':True,'media_schema':'source-declared-absent-with-null-claims','cross_facet_substitution':False,'originating_lease_verified_in':'task.outcome.media_review.lease_id','census_refresh_verified':True,'census_fallback_admission':'recognized-source-unavailability-with-unchanged-snapshot','waterline_cycle_recorded':False,'canonical_mutation':False,'lease_mutation':False,'additional_lease_issued':False}}
    review['review_sha256']=hash_json(review); write(OUT/'independent-review.json',review)

modes={'inspect':inspect,'receipt':receipt}
if len(sys.argv)!=2 or sys.argv[1] not in modes: raise SystemExit('usage: reviewer.py <inspect|receipt>')
modes[sys.argv[1]]()
