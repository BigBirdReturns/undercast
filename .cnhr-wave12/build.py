from pathlib import Path
import json, hashlib, subprocess, textwrap

ROOT = Path('.')
WAVE = 'CN-HRBA-W12'
BASE = 'data/review/clifford-number/hr-discipline/wave-12'
PARENT_MANIFEST_REL = 'data/review/clifford-number/hr-discipline/wave-11/MANIFEST.json'
parent_manifest_sha = hashlib.sha256(Path(PARENT_MANIFEST_REL).read_bytes()).hexdigest()
git_head = subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip()
hr_anchor = subprocess.check_output(['git','log','-1','--format=%H','--',PARENT_MANIFEST_REL], text=True).strip()
written = []

AUTH = {
 'ai_caused_chloe_moffat_death_claims_allowed': False,
 'burden_visibility_to_causation_promotion_allowed': False,
 'canonical_product_effects_allowed': False,
 'closure_by_silence_allowed': False,
 'control_adoption_allowed': False,
 'decision_owner_consequence_inference_allowed': False,
 'employer_liability_findings_allowed': False,
 'employer_specific_causation_findings_allowed': False,
 'external_contact_required': False,
 'final_coroner_conclusion_claims_allowed': False,
 'graph_effects_allowed': False,
 'individual_culpability_findings_allowed': False,
 'institution_cost_to_worker_repair_promotion_allowed': False,
 'lack_of_public_consequence_to_no_consequence_inference_allowed': False,
 'legal_conclusions_allowed': False,
 'named_company_intent_beyond_public_record_allowed': False,
 'parent_wave_mutation_allowed': False,
 'private_source_publication_allowed': False,
 'publication_effects_allowed': False,
 'recurrence_to_universal_prevalence_promotion_allowed': False,
 'self_report_to_independent_verification_promotion_allowed': False,
 'training_to_accountability_promotion_allowed': False,
 'universal_burden_allocation_findings_allowed': False,
 'victim_character_inferences_allowed': False,
}

def auth(): return dict(AUTH)
def sha(b): return hashlib.sha256(b).hexdigest()
def write(rel, obj, compact=False):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(obj, str): data = obj
    elif compact: data = json.dumps(obj, ensure_ascii=False, separators=(',',':')) + '\n'
    else: data = json.dumps(obj, ensure_ascii=False, indent=2) + '\n'
    p.write_text(data, encoding='utf-8')
    if rel not in written: written.append(rel)

# Reuse the twenty-four independently recovered public sources.
all_sources=[]
role_map={
 'event_and_response_snapshot':'human_and_response_burden_snapshot',
 'operative_guidance':'normative_burden_boundary',
 'finding_snapshot':'failure_and_burden_finding',
 'response_snapshot':'institutional_response_snapshot',
 'institutional_self_report':'institutional_cost_and_change_self_report',
 'oversight_snapshot':'public_oversight_burden_snapshot',
 'review_announcement':'future_verification_commitment',
 'finding_and_recurrence_snapshot':'recurrence_and_public_burden_snapshot',
 'operative_policy':'policy_cost_boundary',
 'background_research':'background_system_burden_evidence',
 'operative_process':'public_process_burden',
 'accountability_snapshot':'response_publication_burden',
 'intervention_evidence':'intervention_cost_and_outcome_evidence',
 'position_snapshot':'professional_population_burden_position',
}
for i in range(1,4):
    src=json.loads(Path(f'data/review/clifford-number/hr-discipline/wave-11/sources/SOURCES-0{i}.json').read_text())
    rows=[]
    for row in src['sources']:
        row=dict(row)
        row['case_ids']=[x.replace('HRAC-','HRBA-') if x.startswith('HRAC-') else x for x in row.get('case_ids',[])]
        row['burden_role']=role_map.get(row.pop('accountability_role','evidence_snapshot'),'evidence_snapshot')
        rows.append(row); all_sources.append(row)
    write(f'{BASE}/sources/SOURCES-0{i}.json', {'schema_version':1,'wave_id':WAVE,'shard_id':f'SOURCES-0{i}','sources':rows})
source_map=''.join(f"{s['id']}\t{s['url']}\n" for s in sorted(all_sources,key=lambda x:x['id']))
source_map_sha=sha(source_map.encode())
write(f'{BASE}/SOURCE-REGISTER.json', {
 'schema_version':1,'wave_id':WAVE,'source_count':24,'private_source_count':0,
 'remote_raw_bytes_committed':False,'source_id_url_map_sha256':source_map_sha,
 'burden_roles':sorted(set(s['burden_role'] for s in all_sources)),'authority':auth(),
})

states=[
 'affected_person_human_burden_observed','family_or_support_network_burden_observed',
 'income_or_employment_burden_observed','health_or_welfare_burden_observed',
 'reputational_or_status_burden_observed','procedural_and_evidentiary_labor_burden_observed',
 'public_service_or_regulatory_burden_observed','institution_financial_cost_published',
 'institution_operational_cost_published','decision_owner_personal_consequence_published',
 'hr_or_adviser_consequence_published','vendor_or_contractor_consequence_published',
 'role_or_authority_restriction_published','worker_or_record_repair_published',
 'compensation_or_restoration_published','system_change_cost_internalized',
 'recurrence_increases_owner_burden','residual_burden_and_closure_bounded',
]
status_patterns={
 'HRBA-01':['recovered_present','recovered_present','partial','recovered_present','recovered_present','recovered_present','recovered_present','blocked','partial','blocked','blocked','not_applicable','blocked','blocked','blocked','partial','partial','recovered_present'],
 'HRBA-02':['recovered_present','partial','recovered_present','recovered_present','recovered_present','recovered_present','recovered_present','partial','recovered_present','blocked','blocked','not_applicable','blocked','partial','blocked','recovered_present','partial','partial'],
 'HRBA-03':['recovered_present','partial','partial','recovered_present','partial','recovered_present','recovered_present','blocked','recovered_present','blocked','blocked','not_applicable','blocked','blocked','blocked','partial','recovered_present','partial'],
 'HRBA-04':['recovered_present','recovered_present','partial','recovered_present','recovered_present','recovered_present','recovered_present','blocked','partial','blocked','blocked','not_applicable','blocked','blocked','blocked','partial','partial','recovered_present'],
 'HRBA-05':['recovered_present','partial','recovered_present','recovered_present','partial','recovered_present','recovered_present','blocked','blocked','blocked','blocked','not_applicable','blocked','blocked','blocked','blocked','partial','recovered_present'],
 'HRBA-06':['recovered_present','partial','partial','recovered_present','partial','recovered_present','recovered_present','blocked','recovered_present','blocked','blocked','not_applicable','blocked','blocked','blocked','partial','recovered_present','recovered_present'],
}
case_meta={
 'HRBA-01':('CHLOE-MOFFAT-2025','Chloe Olivia Moffat','open_human_and_family_burden_visible_institutional_internalization_unverified',['chloe-guardian-2026','acas-investigation-meetings','acas-disciplinary-code','hse-support-standard','hse-role-standard','fph-national-conversation']),
 'HRBA-02':('AMIN-ABDULLAH-2016','Amin Abdullah','formal_failure_and_reform_cost_visible_personal_consequence_compensation_and_complete_repair_open',['amin-verita-report','amin-itv-report','amin-imperial-learning','nhs-being-fair','nhs-just-learning-case','last-resort-study']),
 'HRBA-03':('NICOLA-FORSTER-2022','Nicola Forster','human_public_and_operational_burden_visible_personal_consequence_repair_and_effectiveness_open',['nicola-pfd','nicola-mps-response-2024','casey-one-year','casey-followup-review','hse-support-standard','fph-national-conversation']),
 'HRBA-04':('WAYNE-BROWN-2024','Wayne Brown','human_family_and_public_oversight_burden_visible_internal_cost_consequence_and_repair_open',['wayne-pfd','wayne-response-report','pfd-process','pfd-nonresponses','hse-support-standard','acas-disciplinary-code']),
 'HRBA-05':('MATTHEW-BRIERLEY-2024','Matthew Brierley','human_employment_and_public_process_burden_visible_joined_institutional_cost_consequence_and_repair_open',['matthew-pfd','pfd-process','pfd-nonresponses','acas-disciplinary-code','hse-support-standard','last-resort-study']),
 'HRBA-06':('RICKIE-POON-2025','Rickie Poon','human_public_service_and_recurrence_burden_visible_personal_consequence_repair_and_cost_internalization_open',['rickie-pfd','prison-safety-framework','acct-research','pfd-process','pfd-nonresponses','fph-national-conversation']),
}
status_counts={x:0 for x in ['recovered_present','recovered_absent','partial','blocked','not_applicable']}
cells=[]
for lane, vals in status_patterns.items():
    primary=case_meta[lane][3][:2]
    for state,status in zip(states,vals):
        status_counts[status]+=1
        cells.append({'lane_id':lane,'state_id':state,'status':status,
          'source_ids':[] if status=='blocked' else primary,
          'limits':['Public addressability does not establish legal liability, complete causation, unpublished personal consequences, or universal burden allocation.']})
write(f'{BASE}/BURDEN-ALLOCATION-MATRIX.json', {
 'schema_version':1,'wave_id':WAVE,'case_count':6,'state_ids':states,
 'allowed_statuses':['recovered_present','recovered_absent','partial','blocked','not_applicable'],
 'cell_count':108,'status_counts':status_counts,'cells':cells,'authority':auth(),
}, compact=True)

actors=['affected_person','family_and_support_network','colleagues_union_or_advocate','employer_or_institution','decision_owner','hr_or_procedural_adviser','regulator_coroner_court_or_review','healthcare_or_public_service','insurer_or_indemnifier','vendor_or_contractor','public_or_taxpayer','future_workers']
actor_patterns={
 'HRBA-01':['recovered_present','recovered_present','partial','partial','blocked','blocked','recovered_present','partial','blocked','not_applicable','partial','partial'],
 'HRBA-02':['recovered_present','partial','partial','recovered_present','blocked','blocked','recovered_present','partial','blocked','not_applicable','partial','partial'],
 'HRBA-03':['recovered_present','partial','partial','recovered_present','blocked','blocked','recovered_present','partial','blocked','not_applicable','partial','partial'],
 'HRBA-04':['recovered_present','recovered_present','partial','partial','blocked','blocked','recovered_present','partial','blocked','not_applicable','partial','partial'],
 'HRBA-05':['recovered_present','partial','partial','partial','blocked','blocked','recovered_present','partial','blocked','not_applicable','partial','partial'],
 'HRBA-06':['recovered_present','partial','partial','recovered_present','blocked','blocked','recovered_present','recovered_present','blocked','not_applicable','recovered_present','partial'],
}
actor_records=[]
for lane,vals in actor_patterns.items():
    for actor,status in zip(actors,vals):
        actor_records.append({'lane_id':lane,'actor':actor,'status':status,
          'burden_or_power':'Burden, cost, corrective power, or consequence is separately tracked for this actor.',
          'source_ids':[] if status=='blocked' else case_meta[lane][3][:2],
          'limits':['Actor visibility is not proof of personal culpability, complete cost allocation, or legal liability.']})
write(f'{BASE}/BURDEN-TRANSFER-LEDGER.json', {'schema_version':1,'wave_id':WAVE,'actor_categories':actors,'actor_count':12,'record_count':72,'records':actor_records,'authority':auth()})

ladder=[(0,'harm_or_failure_visible'),(1,'direct_human_burden_recorded'),(2,'family_and_network_burden_recorded'),(3,'institutional_response_cost_recorded'),(4,'named_budget_and_accountable_owner'),(5,'worker_or_record_repair_completed'),(6,'personal_consequence_decision_completed'),(7,'role_vendor_or_adviser_consequence_completed'),(8,'recurrence_escalates_owner_burden'),(9,'affected_population_and_long_run_cost_reconciled')]
write(f'{BASE}/COST-INTERNALIZATION-LADDER.json', {'schema_version':1,'wave_id':WAVE,'stage_count':10,'stages':[{'stage':n,'id':i,'meaning':'This stage is distinct and cannot be inferred from a lower stage.'} for n,i in ladder], 'rules':['Human harm is not an institution cost merely because it becomes public.','Training expenditure is not worker repair.','A policy change is not a personal consequence.','A missing public consequence record cannot prove no consequence occurred.','Recurrence must increase accountable burden rather than merely restart training.'],'authority':auth()})
controls=['complete human burden register','family and support-network burden register','employment and income burden register','health and welfare burden register','reputational and status burden register','procedural labor and delay register','public-service burden register','institution financial and operational cost register','named decision-owner consequence decision','hr and adviser consequence decision','vendor and contractor consequence decision','role and authority restriction decision','worker and record repair','compensation and restoration','budget-level cost internalization','recurrence escalation rule','affected-population reconciliation','bounded public closure receipt']
write(f'{BASE}/BURDEN-INTERNALIZATION-PROTOCOL.json', {'schema_version':1,'wave_id':WAVE,'control_count':18,'controls':[{'id':f'HRBA-C{i:02d}','name':n,'adopted':False} for i,n in enumerate(controls,1)],'hard_stops':['closure_by_silence','training_used_as_accountability','worker_repair_unresolved','decision_owner_consequence_decision_missing','recurrence_without_escalated_owner_burden','affected_population_missing'],'authority':auth()})

case_rows=[]
for lane,(case_id,name,terminal,sids) in case_meta.items():
    observations=[
      f'The retained public record makes direct human burden in the {name} sentinel addressable within its stated scope.',
      'Family, support-network, employment, health, reputational, procedural, and public-service burdens remain separately classified.',
      'Institutional review, training, policy, or programme change is retained as response cost rather than promoted into personal consequence or worker repair.',
      'The public record does not provide a complete consequence ledger for decision owners, HR or advisers, vendors, role restrictions, compensation, and restoration.',
      'Absence of a public consequence record is treated as missing evidence rather than proof that no consequence occurred.',
      'Closure remains blocked where burden internalization, repair, recurrence escalation, or affected-population learning is incomplete.'
    ]
    findings=[
      ('F01','Direct human and external public burdens are more visible than decision-owner and adviser consequences.','independently_supported_scoped'),
      ('F02','Training, review, and policy change are institution responses but do not by themselves internalize the burden imposed on affected people.','bounded_synthesis'),
      ('F03','A missing public personal-consequence record cannot be converted into a finding that no consequence occurred.','boundary'),
      ('F04','Complete burden internalization, repair, and recurrence escalation remain open on the retained public record.','remains_blocked'),
    ]
    open_q=['Who absorbed each direct and indirect cost?','What personal consequence decision was made?','What role or authority restriction followed?','What worker or record repair was completed?','What compensation or restoration was completed?','What cost was internalized into the responsible budget or authority?','Did recurrence increase accountable burden?','Which affected populations remain outside the ledger?']
    lane_obj={'schema_version':1,'wave_id':WAVE,'lane_id':lane,'case_id':case_id,'name':name,'source_ids':sids,
      'observations':[{'id':f'{lane}-O{i:02d}','statement':x,'source_ids':sids[:2],'limits':['Observation is bounded to the cited public record.']} for i,x in enumerate(observations,1)],
      'findings':[{'id':f'{lane}-{fid}','claim':claim,'status':status,'source_ids':sids[:2],'limits':['Finding does not establish legal liability, personal culpability, or undisclosed consequences.']} for fid,claim,status in findings],
      'terminal_receipt':{'state':terminal,'closed_questions':[],'open_questions':open_q},'authority':auth()}
    write(f'{BASE}/lanes/{lane}.json', lane_obj)
    case_rows.append({'lane_id':lane,'case_id':case_id,'name':name,'closure_allowed':False,'highest_recovered_stage':{'HRBA-01':3,'HRBA-02':4,'HRBA-03':4,'HRBA-04':3,'HRBA-05':3,'HRBA-06':4}[lane],'terminal':terminal,'source_ids':sids,'open_questions':open_q})
write(f'{BASE}/CASE-BURDEN-REGISTER.json', {'schema_version':1,'wave_id':WAVE,'case_count':6,'cases':case_rows,'cross_case_boundary':['Missing public consequences are missing evidence, not proof of impunity.','Formal findings do not automatically establish individual culpability or legal liability.','Institutional response costs cannot be promoted into worker repair or compensation.','Employment, police, bail, healthcare, detention, and custody remain separate causal and legal domains.'],'authority':auth()})
write(f'{BASE}/CHLOE-NON-AI-BURDEN-BOUNDARY.json', {'schema_version':1,'wave_id':WAVE,'case_id':'CHLOE-MOFFAT-2025','named_non_ai_baseline':True,'ai_use_established':False,'algorithmic_monitoring_established':False,'automated_decision_established':False,'vendor_system_established':False,'final_coroner_conclusion_established':False,'permitted_join':['notice and preparation','support and companion access','independent welfare ownership','distress stop and safety handoff','interim restrictions','decision and advice authorship','human and family burden','reported institutional response versus personal consequence, repair, and verified prevention'],'prohibited_inferences':['AI or an algorithm was used in Chloe Moffat’s process.','AI caused Chloe Moffat’s death.','A final coroner conclusion or legal liability has been established.','Any named person is individually culpable.','Chloe Moffat was weak, irrational, or unable to tolerate ordinary workplace pressure.','Lack of a public personal-consequence record proves no consequence occurred.','Reported training proves accountability, repair, compensation, or durable prevention.'],'authority':auth()})

counts={'public_sources':24,'private_sources':0,'lanes':6,'observations':36,'findings':24,'burden_states':18,'burden_cells':108,'burden_status':status_counts,'actor_categories':12,'actor_cells':72,'internalization_stages':10,'burden_records':6,'proposed_controls':18,'adopted_controls':0,'chloe_ai_use_findings':0}
central='An institution has not internalized harm when affected people, families, and public systems absorb the irreversible cost while the institution records only training, policy revision, or reputational management.'
write(f'{BASE}/wave-12.json', {'schema_version':1,'wave_id':WAVE,'title':'Consequence asymmetry, burden transfer, and cost internalization','parent':{'branch':'main','git_head':git_head,'hr_estate_anchor':hr_anchor,'wave_id':'CN-HRAC-W11','manifest_sha256':parent_manifest_sha,'mutation_count':0},'counts':counts,'central_rule':central,'authority':auth()})
write(f'{BASE}/WAVE-12-SUMMARY.json', {'schema_version':1,'wave_id':WAVE,'as_of':'2026-08-03','title':'Consequence asymmetry, burden transfer, and cost internalization','central_rule':central,'counts':counts,'case_lifecycle':{x['lane_id']:x['terminal'] for x in case_rows},'interpretive_law':['Human harm is not an institution cost merely because it becomes public.','Training is not accountability.','Policy revision is not worker repair.','A named recipient is not a named decision owner.','A missing public consequence record cannot prove that no consequence occurred.','Compensation is not system correction.','Recurrence without increased accountable burden is not learning.','A surviving workforce is not the complete affected population.'],'source_id_url_map_sha256':source_map_sha,'authority':auth()})
write('docs/research/clifford-number/hr-discipline/WAVE-12.md', '# Clifford Number HR burden-allocation Wave 12\n\nWave 12 tests where the consequences of severe employment and adjacent state processes actually land. It separates direct human, family, employment, health, reputational, procedural, public-service, institutional, decision-owner, adviser, vendor, repair, compensation, and recurrence burdens.\n\nThe governing rule is that an institution has not internalized harm when affected people, families, and public systems absorb irreversible costs while the institution records only training, policy revision, or reputational management. A missing public personal-consequence record remains missing evidence; it is not proof that no consequence occurred. All controls remain unadopted.\n')
write('schema/clifford-number-hr-burden-allocation-lane.schema.json', {'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'https://bigbirdreturns.github.io/undercast/schema/clifford-number-hr-burden-allocation-lane.schema.json','title':'Clifford Number HR burden-allocation lane','type':'object','additionalProperties':False,'required':['schema_version','wave_id','lane_id','case_id','name','source_ids','observations','findings','terminal_receipt','authority'],'properties':{'schema_version':{'const':1},'wave_id':{'const':WAVE},'lane_id':{'pattern':'^HRBA-0[1-6]$'},'case_id':{'type':'string'},'name':{'type':'string'},'source_ids':{'type':'array','minItems':2,'uniqueItems':True},'observations':{'type':'array','minItems':6,'maxItems':6},'findings':{'type':'array','minItems':4,'maxItems':4},'terminal_receipt':{'type':'object'},'authority':{'type':'object'}}})

validator=f'''#!/usr/bin/env node
import {{ createHash }} from 'node:crypto'; import {{ existsSync,readFileSync,readdirSync,statSync }} from 'node:fs'; import {{ dirname,join,relative,resolve }} from 'node:path'; import {{ fileURLToPath }} from 'node:url';
const W='{WAVE}',B='{BASE}/',lanes={json.dumps(list(case_meta))},states={json.dumps(states)},allowed=['recovered_present','recovered_absent','partial','blocked','not_applicable']; const here=dirname(fileURLToPath(import.meta.url)),defRoot=resolve(here,'..');
function die(m){{console.error(m);process.exit(1)}} function args(a){{let root=defRoot,strict=false;for(let i=0;i<a.length;i++){{if(a[i]==='--root')root=resolve(a[++i]||die('--root requires path'));else if(a[i]==='--strict-root')strict=true;else if(a[i]!=='--check')die(`unknown argument: ${{a[i]}}`)}}return{{root,strict}}}} function txt(r,p){{const a=join(r,p);if(!existsSync(a))throw Error(`missing ${{p}}`);return readFileSync(a,'utf8')}} function js(r,p){{return JSON.parse(txt(r,p))}} function ok(c,m){{if(!c)throw Error(m)}} function fo(o,l){{ok(o&&typeof o==='object',l);for(const[k,v]of Object.entries(o))ok(v===false,`${{l}}.${{k}}`)}} function sh(b){{return createHash('sha256').update(b).digest('hex')}} function files(root){{const o=[];function w(d){{for(const n of readdirSync(d)){{const a=join(d,n),s=statSync(a);if(s.isDirectory())w(a);else if(s.isFile())o.push(relative(root,a).split('\\\\').join('/'))}}}}w(root);return o.sort()}}
function validate(root,strict){{const w=js(root,B+'wave-12.json');ok(w.wave_id===W&&/^[0-9a-f]{{40}}$/.test(w.parent.git_head)&&/^[0-9a-f]{{40}}$/.test(w.parent.hr_estate_anchor)&&w.parent.mutation_count===0,'parent');fo(w.authority,'wave');const c=w.counts;ok(c.public_sources===24&&c.private_sources===0&&c.lanes===6&&c.observations===36&&c.findings===24&&c.burden_states===18&&c.burden_cells===108&&c.actor_categories===12&&c.actor_cells===72&&c.internalization_stages===10&&c.proposed_controls===18&&c.adopted_controls===0&&c.chloe_ai_use_findings===0,'counts');const sr=js(root,B+'SOURCE-REGISTER.json');ok(sr.source_count===24&&sr.private_source_count===0&&!sr.remote_raw_bytes_committed,'sources');fo(sr.authority,'source');let src=[];for(let i=1;i<=3;i++){{const s=js(root,B+`sources/SOURCES-0${{i}}.json`);ok(s.sources.length===8,'shard');src.push(...s.sources)}}ok(new Set(src.map(x=>x.id)).size===24&&new Set(src.map(x=>x.url)).size===24,'source uniqueness');for(const s of src)ok(s.status==='independently_recovered_public_source'&&s.supports.length&&s.limits.length&&s.burden_role,'source bound');const map=src.sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`${{s.id}}\t${{s.url}}`).join('\n')+'\n';ok(sh(Buffer.from(map))===sr.source_id_url_map_sha256,'map');const ids=new Set(src.map(x=>x.id));let o=0,f=0;for(const lane of lanes){{const l=js(root,B+`lanes/${{lane}}.json`);ok(l.observations.length===6&&l.findings.length===4&&l.terminal_receipt.closed_questions.length===0&&l.terminal_receipt.open_questions.length===8,'lane');for(const s of l.source_ids)ok(ids.has(s),'lane source');fo(l.authority,lane);o+=6;f+=4}}ok(o===36&&f===24,'aggregate');const mx=js(root,B+'BURDEN-ALLOCATION-MATRIX.json');ok(mx.cells.length===108&&mx.state_ids.length===18,'matrix');for(const x of mx.cells){{ok(lanes.includes(x.lane_id)&&states.includes(x.state_id)&&allowed.includes(x.status),'cell');if(x.status==='blocked')ok(x.source_ids.length===0,'blocked proof');else for(const s of x.source_ids)ok(ids.has(s),'cell source')}}fo(mx.authority,'matrix');const led=js(root,B+'BURDEN-TRANSFER-LEDGER.json');ok(led.actor_count===12&&led.records.length===72,'actors');fo(led.authority,'ledger');const lad=js(root,B+'COST-INTERNALIZATION-LADDER.json');ok(lad.stages.length===10,'ladder');fo(lad.authority,'ladder');const p=js(root,B+'BURDEN-INTERNALIZATION-PROTOCOL.json');ok(p.controls.length===18&&p.controls.every(x=>x.adopted===false)&&p.hard_stops.includes('closure_by_silence')&&p.hard_stops.includes('decision_owner_consequence_decision_missing'),'protocol');fo(p.authority,'protocol');const cr=js(root,B+'CASE-BURDEN-REGISTER.json');ok(cr.cases.length===6&&cr.cases.every(x=>x.closure_allowed===false),'cases');fo(cr.authority,'cases');const ch=js(root,B+'CHLOE-NON-AI-BURDEN-BOUNDARY.json');ok(ch.named_non_ai_baseline&&!ch.ai_use_established&&!ch.final_coroner_conclusion_established&&ch.prohibited_inferences.some(x=>x.includes('weak'))&&ch.prohibited_inferences.some(x=>x.includes('no consequence occurred')),'Chloe');fo(ch.authority,'Chloe');const mf=js(root,B+'MANIFEST.json');ok(mf.file_count===21,'manifest');for(const r of mf.files){{const b=Buffer.from(txt(root,r.path));ok(b.length===r.bytes&&sh(b)===r.sha256,`manifest ${{r.path}}`)}}if(strict){{const ex=new Set(mf.files.map(x=>x.path).concat(B+'MANIFEST.json')),got=new Set(files(root));ok(got.size===ex.size&&[...got].every(x=>ex.has(x)),'strict')}}console.log('HR burden-allocation check: passed')}} try{{const a=args(process.argv.slice(2));validate(a.root,a.strict)}}catch(e){{die(e.message)}}
'''
write('scripts/clifford-number-hr-burden-allocation.mjs', validator)

fixture=f'''#!/usr/bin/env node
import {{ cpSync,mkdtempSync,readFileSync,writeFileSync }} from 'node:fs'; import {{ tmpdir }} from 'node:os'; import {{ join,resolve }} from 'node:path'; import {{ spawnSync }} from 'node:child_process'; const root=resolve(new URL('..',import.meta.url).pathname),script=join(root,'scripts/clifford-number-hr-burden-allocation.mjs'),B='{BASE}/'; function run(r,...x){{return spawnSync(process.execPath,[script,'--check','--root',r,...x],{{encoding:'utf8'}})}} function corpus(){{const d=mkdtempSync(join(tmpdir(),'hrba-'));cpSync(root,d,{{recursive:true}});return d}} function mutate(rel,fn){{const d=corpus(),p=join(d,rel),j=JSON.parse(readFileSync(p,'utf8'));fn(j);writeFileSync(p,JSON.stringify(j,null,2)+'\n');if(run(d).status===0)throw Error(`accepted ${{rel}}`)}} if(run(root).status!==0)throw Error('valid rejected'); const cases=[['authority',B+'wave-12.json',j=>j.authority.legal_conclusions_allowed=true],['parent',B+'wave-12.json',j=>j.parent.hr_estate_anchor='0'.repeat(40)],['private',B+'SOURCE-REGISTER.json',j=>j.private_source_count=1],['rebind',B+'sources/SOURCES-01.json',j=>j.sources[0].url='https://example.com'],['role',B+'sources/SOURCES-01.json',j=>delete j.sources[0].burden_role],['weak source',B+'sources/SOURCES-01.json',j=>j.sources[0].status='seed'],['obs',B+'lanes/HRBA-01.json',j=>j.observations.pop()],['finding',B+'lanes/HRBA-02.json',j=>j.findings.pop()],['closed',B+'lanes/HRBA-03.json',j=>j.terminal_receipt.closed_questions.push('x')],['dangling',B+'lanes/HRBA-04.json',j=>j.source_ids[0]='missing'],['matrix',B+'BURDEN-ALLOCATION-MATRIX.json',j=>j.cells.pop()],['status',B+'BURDEN-ALLOCATION-MATRIX.json',j=>j.cells[0].status='complete'],['blocked proof',B+'BURDEN-ALLOCATION-MATRIX.json',j=>j.cells.find(x=>x.status==='blocked').source_ids=['chloe-guardian-2026']],['matrix authority',B+'BURDEN-ALLOCATION-MATRIX.json',j=>j.authority.employer_liability_findings_allowed=true],['actors',B+'BURDEN-TRANSFER-LEDGER.json',j=>j.records.pop()],['actor authority',B+'BURDEN-TRANSFER-LEDGER.json',j=>j.authority.legal_conclusions_allowed=true],['ladder',B+'COST-INTERNALIZATION-LADDER.json',j=>j.stages.pop()],['ladder authority',B+'COST-INTERNALIZATION-LADDER.json',j=>j.authority.individual_culpability_findings_allowed=true],['adopt',B+'BURDEN-INTERNALIZATION-PROTOCOL.json',j=>j.controls[0].adopted=true],['silence stop',B+'BURDEN-INTERNALIZATION-PROTOCOL.json',j=>j.hard_stops=j.hard_stops.filter(x=>x!=='closure_by_silence')],['consequence stop',B+'BURDEN-INTERNALIZATION-PROTOCOL.json',j=>j.hard_stops=j.hard_stops.filter(x=>x!=='decision_owner_consequence_decision_missing')],['case close',B+'CASE-BURDEN-REGISTER.json',j=>j.cases[0].closure_allowed=true],['case count',B+'CASE-BURDEN-REGISTER.json',j=>j.cases.pop()],['Chloe AI',B+'CHLOE-NON-AI-BURDEN-BOUNDARY.json',j=>j.ai_use_established=true],['coroner',B+'CHLOE-NON-AI-BURDEN-BOUNDARY.json',j=>j.final_coroner_conclusion_established=true],['weak refusal',B+'CHLOE-NON-AI-BURDEN-BOUNDARY.json',j=>j.prohibited_inferences=j.prohibited_inferences.filter(x=>!x.includes('weak'))],['consequence refusal',B+'CHLOE-NON-AI-BURDEN-BOUNDARY.json',j=>j.prohibited_inferences=j.prohibited_inferences.filter(x=>!x.includes('no consequence occurred'))],['source count',B+'wave-12.json',j=>j.counts.public_sources=23],['cell count',B+'wave-12.json',j=>j.counts.burden_cells=107],['actor count',B+'wave-12.json',j=>j.counts.actor_cells=71],['adopt count',B+'wave-12.json',j=>j.counts.adopted_controls=1],['summary authority',B+'WAVE-12-SUMMARY.json',j=>j.authority.training_to_accountability_promotion_allowed=true],['source authority',B+'SOURCE-REGISTER.json',j=>j.authority.private_source_publication_allowed=true]]; for(const[,r,f]of cases)mutate(r,f);const d=corpus();writeFileSync(join(d,'EXTRA'),'x');if(run(d,'--strict-root').status===0)throw Error('strict accepted');for(const a of [['--wat'],['--root'],['--check','--write']])if(spawnSync(process.execPath,[script,...a],{{encoding:'utf8'}}).status===0)throw Error('CLI accepted');console.log(`HR burden fixtures: passed (1 valid + ${{cases.length+1}} refusals + 3 CLI)`)
'''
write('test/clifford-number-hr-burden-allocation-fixtures.mjs', fixture)

manifest_rel=f'{BASE}/MANIFEST.json'
manifest_files=[]
for rel in sorted(written):
    if rel==manifest_rel: continue
    b=Path(rel).read_bytes(); manifest_files.append({'path':rel,'bytes':len(b),'sha256':sha(b)})
assert len(manifest_files)==21, len(manifest_files)
write(manifest_rel, {'schema_version':1,'wave_id':WAVE,'file_count':21,'parent':{'branch':'main','git_head':git_head,'hr_estate_anchor':hr_anchor,'parent_wave_id':'CN-HRAC-W11','parent_manifest_sha256':parent_manifest_sha,'mutation_count':0},'files':manifest_files})
print(json.dumps({'manifest_sha256':sha(Path(manifest_rel).read_bytes()),'summary_sha256':sha(Path(f'{BASE}/WAVE-12-SUMMARY.json').read_bytes()),'matrix_sha256':sha(Path(f'{BASE}/BURDEN-ALLOCATION-MATRIX.json').read_bytes()),'source_map_sha256':source_map_sha,'files':22,'status_counts':status_counts},indent=2))
