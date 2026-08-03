#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WAVE='CN-HRCT-W13';
const BASE='data/review/clifford-number/hr-discipline/wave-13/';
const lanes=['HRCT-01','HRCT-02','HRCT-03','HRCT-04','HRCT-05','HRCT-06'];
const states=['human_irreversible_cost_observed','family_and_support_cost_observed','lost_income_or_employment_cost_observed','healthcare_or_public_service_cost_observed','legal_or_representation_cost_observed','evidentiary_and_procedural_labor_cost_observed','internal_investigation_cost_published','external_review_or_regulatory_cost_published','legal_defense_cost_published','insurance_or_indemnifier_role_published','settlement_or_compensation_source_published','consultant_or_training_procurement_published','vendor_or_contractor_cost_allocation_published','decision_owner_cost_share_published','hr_or_adviser_cost_share_published','worker_or_record_repair_funded','prevention_or_system_change_funded','recurrence_surcharge_or_escalation','future_worker_monitoring_funded','residual_cost_and_closure_bounded'];
const allowed=['recovered_present','recovered_absent','partial','blocked','not_applicable'];
const expectedStatus={recovered_present:41,recovered_absent:0,partial:36,blocked:37,not_applicable:6};
const here=dirname(fileURLToPath(import.meta.url));
const defaultRoot=resolve(here,'..');

function die(m){ console.error(m); process.exit(1); }
function parseArgs(argv){ let root=defaultRoot,strict=false; for(let i=0;i<argv.length;i++){ if(argv[i]==='--root') root=resolve(argv[++i]||die('--root requires path')); else if(argv[i]==='--strict-root') strict=true; else if(argv[i]!=='--check') die(`unknown argument: ${argv[i]}`); } return {root,strict}; }
function text(root,p){ const a=join(root,p); if(!existsSync(a)) throw new Error(`missing ${p}`); return readFileSync(a,'utf8'); }
function jsonFile(root,p){ try{return JSON.parse(text(root,p));}catch(e){throw new Error(`invalid JSON ${p}: ${e.message}`);} }
function ok(c,m){ if(!c) throw new Error(m); }
function allFalse(o,label){ ok(o&&typeof o==='object',`${label} missing`); for(const [k,v] of Object.entries(o)) ok(v===false,`${label}.${k} must remain false`); }
function sha(b){ return createHash('sha256').update(b).digest('hex'); }
function files(root){ const out=[]; function walk(d){ for(const n of readdirSync(d)){ const a=join(d,n),s=statSync(a); if(s.isDirectory()) walk(a); else if(s.isFile()) out.push(relative(root,a).split('\\').join('/')); } } walk(root); return out.sort(); }

function validate(root,strict){
  const wave=jsonFile(root,BASE+'wave-13.json');
  ok(wave.wave_id===WAVE,'wave id drift');
  ok(wave.parent?.git_head==='9a4b07d6878d092c2c6b66645d5f92875f5f64a8','parent drift');
  ok(wave.parent?.parent_wave_id==='CN-HRBA-W12','parent wave drift');
  ok(wave.parent?.parent_manifest_sha256==='c555ee16e6206d2d4330abec669545d91a44e0dc69236076312e9b54fab1b165','parent manifest drift');
  ok(wave.parent?.mutation_count===0,'parent mutation');
  allFalse(wave.authority,'wave.authority');
  const c=wave.counts;
  ok(c.public_sources===24&&c.private_sources===0&&c.lanes===6&&c.observations===36&&c.findings===24,'source/lane denominator');
  ok(c.cost_transfer_states===20&&c.cost_transfer_cells===120&&c.actor_categories===14&&c.actor_cells===84,'cost-transfer denominator');
  ok(c.internalization_stages===12&&c.cost_transfer_records===6&&c.proposed_controls===20&&c.adopted_controls===0&&c.chloe_ai_use_findings===0,'control denominator');

  const sr=jsonFile(root,BASE+'SOURCE-REGISTER.json');
  ok(sr.source_count===24&&sr.private_source_count===0&&sr.remote_raw_bytes_committed===false,'source register');
  ok(sr.inherited_source_id_url_map_sha256==='217702eee723a470cdc41884254625db3f112c746b39323181ac0bba4ad4b4f4','source map drift');
  allFalse(sr.authority,'source.authority');
  let pointers=[];
  for(const p of [BASE+'sources/SOURCE-POINTERS-01.json',BASE+'sources/SOURCE-POINTERS-02.json']){
    const sh=jsonFile(root,p); ok(sh.records.length===12,'source shard denominator'); pointers.push(...sh.records);
  }
  ok(pointers.length===24&&new Set(pointers.map(x=>x.source_id)).size===24,'source pointer uniqueness');
  for(const p of pointers){ ok(p.status==='independently_recovered_public_source_pointer','weak source pointer'); ok(p.inherited_from_wave==='CN-HRRM-W10','source lineage drift'); ok(p.inherited_source_path.startsWith('data/review/clifford-number/hr-discipline/wave-10/sources/'),'source path drift'); ok(p.limits.length>=2,'unbounded source pointer'); }
  const sourceIds=new Set(pointers.map(x=>x.source_id));

  let obs=0,find=0;
  for(const lane of lanes){
    const l=jsonFile(root,BASE+`lanes/${lane}.json`);
    ok(l.lane_id===lane,'lane id drift'); ok(l.observations.length===6&&l.findings.length===4,'lane denominator');
    ok(l.terminal_receipt.closed_questions.length===0&&l.terminal_receipt.open_questions.length===8,'terminal receipt drift');
    for(const sid of l.source_ids) ok(sourceIds.has(sid),`dangling lane source ${sid}`);
    allFalse(l.authority,`${lane}.authority`); obs+=l.observations.length; find+=l.findings.length;
  }
  ok(obs===36&&find===24,'aggregate lane denominator');

  const mx=jsonFile(root,BASE+'INDEMNITY-COST-TRANSFER-MATRIX.json');
  ok(mx.cell_count===120&&mx.state_ids.length===20&&new Set(mx.state_ids).size===20,'matrix denominator');
  ok(JSON.stringify(mx.cell_format)===JSON.stringify(['lane_id','state_id','status','lane_source_ids']),'matrix format');
  ok(Object.keys(mx.patterns).length===6&&Object.keys(mx.lane_source_ids).length===6,'matrix lanes');
  const counts={recovered_present:0,recovered_absent:0,partial:0,blocked:0,not_applicable:0};
  for(const lane of lanes){
    const pat=mx.patterns[lane],src=mx.lane_source_ids[lane];
    ok(Array.isArray(pat)&&pat.length===20,'matrix pattern');
    ok(Array.isArray(src)&&src.length===2,'matrix sources');
    for(const sid of src) ok(sourceIds.has(sid),`matrix dangling source ${sid}`);
    for(const status of pat){ok(allowed.includes(status),'bad matrix status');counts[status]++;}
  }
  ok(JSON.stringify(counts)===JSON.stringify(expectedStatus),'matrix status denominator');
  allFalse(mx.authority,'matrix.authority');

  const actors=jsonFile(root,BASE+'ACTOR-COST-TRANSFER-MATRIX.json');
  ok(actors.actor_count===14&&actors.record_count===84&&actors.actors.length===14,'actor denominator');
  ok(JSON.stringify(actors.record_format)===JSON.stringify(['lane_id','actor','status','lane_source_ids']),'actor format');
  for(const lane of lanes){ok(actors.patterns[lane].length===14,'actor pattern');ok(actors.lane_source_ids[lane].length===2,'actor sources');}
  allFalse(actors.authority,'actors.authority');

  const ladder=jsonFile(root,BASE+'COST-TRANSFER-LADDER.json');
  ok(ladder.stage_count===12&&ladder.stages.length===12,'ladder denominator'); allFalse(ladder.authority,'ladder.authority');
  const proto=jsonFile(root,BASE+'INDEMNITY-CUSTODY-PROTOCOL.json');
  ok(proto.control_count===20&&proto.controls.length===20&&proto.controls.every(x=>x.adopted===false),'control denominator');
  ok(proto.hard_stops.includes('indemnity_used_as_accountability')&&proto.hard_stops.includes('recurrence_without_cost_escalation'),'hard stops');
  allFalse(proto.authority,'protocol.authority');

  const cases=jsonFile(root,BASE+'CASE-COST-TRANSFER-REGISTER.json');
  ok(cases.case_count===6&&cases.cases.length===6&&cases.cases.every(x=>x.closure_allowed===false),'case register');
  allFalse(cases.authority,'cases.authority');
  const ch=jsonFile(root,BASE+'CHLOE-NON-AI-INDEMNITY-BOUNDARY.json');
  ok(ch.named_non_ai_baseline===true&&ch.ai_use_established===false&&ch.final_coroner_conclusion_established===false,'Chloe boundary');
  ok(ch.prohibited_inferences.some(x=>x.includes('weak')),'victim-character refusal');
  ok(ch.prohibited_inferences.some(x=>x.includes('insurer')),'payer-silence refusal');
  allFalse(ch.authority,'chloe.authority');

  const mf=jsonFile(root,BASE+'MANIFEST.json');
  ok(mf.wave_id===WAVE&&mf.file_count===21,'manifest denominator');
  for(const row of mf.files){const b=Buffer.from(text(root,row.path));ok(b.length===row.bytes,`byte drift ${row.path}`);ok(sha(b)===row.sha256,`sha drift ${row.path}`);}
  if(strict){const expected=new Set(mf.files.map(x=>x.path).concat(BASE+'MANIFEST.json'));const got=new Set(files(root));ok(got.size===expected.size&&[...got].every(x=>expected.has(x)),'strict root drift');}
  console.log('CN-HRCT-W13 validation: passed');
}
try{const a=parseArgs(process.argv.slice(2));validate(a.root,a.strict);}catch(e){die(e.message);}
