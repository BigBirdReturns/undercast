#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WAVE="CN-HRAC-W11";
const BASE="data/review/clifford-number/hr-discipline/wave-11/";
const lanes=["HRAC-01", "HRAC-02", "HRAC-03", "HRAC-04", "HRAC-05", "HRAC-06"];
const states=["trigger_and_exertion_defined", "allegation_or_concern_provenance_fixed", "process_classification_author_named", "notice_and_support_decision_authors_named", "interim_restriction_author_named", "independent_welfare_owner_assigned", "advice_chain_preserved", "conflict_review_completed", "accountable_decision_owner_named", "corrective_authority_identified", "personal_consequence_decision_published", "role_or_authority_restriction_published", "worker_or_record_repair_published", "compensation_or_restoration_published", "system_correction_published", "recurrence_escalates_consequence"];
const allowed=['recovered_present','recovered_absent','partial','blocked','not_applicable'];
const expectedStatus={"recovered_present": 28, "recovered_absent": 6, "partial": 29, "blocked": 33, "not_applicable": 0};
const here=dirname(fileURLToPath(import.meta.url));
const defaultRoot=resolve(here,'..');

function die(m){ console.error(m); process.exit(1); }
function parseArgs(argv){
  let root=defaultRoot, strict=false;
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--root') root=resolve(argv[++i]||die('--root requires path'));
    else if(argv[i]==='--strict-root') strict=true;
    else if(argv[i]!=='--check') die(`unknown argument: ${argv[i]}`);
  }
  return {root,strict};
}
function text(root,p){ const a=join(root,p); if(!existsSync(a)) throw new Error(`missing ${p}`); return readFileSync(a,'utf8'); }
function jsonFile(root,p){ try { return JSON.parse(text(root,p)); } catch(e) { throw new Error(`invalid JSON ${p}: ${e.message}`); } }
function ok(c,m){ if(!c) throw new Error(m); }
function allFalse(o,label){ ok(o&&typeof o==='object',`${label} missing`); for(const [k,v] of Object.entries(o)) ok(v===false,`${label}.${k} must remain false`); }
function sha(b){ return createHash('sha256').update(b).digest('hex'); }
function files(root){ const out=[]; function walk(d){ for(const n of readdirSync(d)){ const a=join(d,n), s=statSync(a); if(s.isDirectory()) walk(a); else if(s.isFile()) out.push(relative(root,a).split('\\').join('/')); } } walk(root); return out.sort(); }

function validate(root,strict){
  const wave=jsonFile(root,BASE+`wave-11.json`);
  ok(wave.wave_id===WAVE,'wave id drift');
  ok(wave.parent?.mutation_count===0,'parent mutation');
  ok(/^[0-9a-f]{40}$/.test(wave.parent?.git_head||''),'git parent missing');
  ok(/^[0-9a-f]{64}$/.test(wave.parent?.parent_manifest_sha256||''),'parent manifest identity missing');
  allFalse(wave.authority,'wave.authority');
  const c=wave.counts;
  ok(c.public_sources===24 && c.private_sources===0 && c.lanes===6 && c.observations===36 && c.findings===24,'source/lane denominator');
  ok(c.consequence_states===16 && c.consequence_cells===96 && c.actor_categories===12 && c.actor_cells===72,'consequence denominator');
  ok(c.consequence_stages===10 && c.consequence_records===6 && c.proposed_controls===18 && c.adopted_controls===0 && c.chloe_ai_use_findings===0,'control denominator');
  const sr=jsonFile(root,BASE+'SOURCE-REGISTER.json');
  ok(sr.source_count===24 && sr.private_source_count===0 && sr.remote_raw_bytes_committed===false,'source register denominator');
  ok(sr.inherited_source_id_url_map_sha256==='217702eee723a470cdc41884254625db3f112c746b39323181ac0bba4ad4b4f4','source map identity drift');
  allFalse(sr.authority,'source.authority');
  let pointers=[];
  for(const p of ["data/review/clifford-number/hr-discipline/wave-11/sources/SOURCE-POINTERS-01.json", "data/review/clifford-number/hr-discipline/wave-11/sources/SOURCE-POINTERS-02.json"]){
    const shard=jsonFile(root,p);
    ok(shard.records.length===12,'source pointer shard denominator');
    pointers.push(...shard.records);
  }
  ok(pointers.length===24 && new Set(pointers.map(x=>x.source_id)).size===24,'source pointer uniqueness');
  for(const p of pointers){
    ok(p.status==='independently_recovered_public_source_pointer','weak source pointer');
    ok(p.inherited_from_wave==='CN-HRRM-W10','source lineage drift');
    ok(p.inherited_source_path.startsWith('data/review/clifford-number/hr-discipline/wave-10/sources/'),'source path drift');
    ok(p.limits.length>=2,'unbounded source pointer');
  }
  const sourceIds=new Set(pointers.map(x=>x.source_id));
  let obs=0,find=0;
  for(const lane of lanes){
    const l=jsonFile(root,BASE+`lanes/${lane}.json`);
    ok(l.lane_id===lane,'lane id drift');
    ok(l.observations.length===6 && l.findings.length===4,'lane denominator');
    ok(l.terminal_receipt.closed_questions.length===0 && l.terminal_receipt.open_questions.length===8,'terminal receipt drift');
    for(const sid of l.source_ids) ok(sourceIds.has(sid),`dangling source ${sid}`);
    allFalse(l.authority,`${lane}.authority`);
    obs+=l.observations.length; find+=l.findings.length;
  }
  ok(obs===36 && find===24,'aggregate lane denominator');
  const mx=jsonFile(root,BASE+"CONSEQUENCE-CUSTODY-MATRIX.json");
  ok(mx.cell_count===96 && mx.cells.length===96,'matrix size');
  ok(mx.state_ids.length===16 && new Set(mx.state_ids).size===16,'state denominator');
  const counts={recovered_present:0,recovered_absent:0,partial:0,blocked:0,not_applicable:0};
  ok(JSON.stringify(mx.cell_format)===JSON.stringify(['lane_id','state_id','status','source_ids']),'matrix format');
  for(const cell of mx.cells){
    ok(Array.isArray(cell) && cell.length===4,'bad matrix cell format');
    const [laneId,stateId,status,cellSources]=cell;
    ok(lanes.includes(laneId) && states.includes(stateId) && allowed.includes(status),'bad matrix cell');
    counts[status]++;
    if(status==='blocked') ok(cellSources.length===0,'blocked cell cites proof');
    else for(const sid of cellSources) ok(sourceIds.has(sid),`matrix dangling source ${sid}`);
  }
  ok(JSON.stringify(counts)===JSON.stringify(expectedStatus),'matrix status denominator');
  allFalse(mx.authority,'matrix.authority');
  const actors=jsonFile(root,BASE+'ACTOR-AUTHORITY-MATRIX.json');
  ok(actors.actor_count===12 && actors.record_count===72 && actors.records.length===72,'actor matrix denominator');
  ok(JSON.stringify(actors.record_format)===JSON.stringify(['lane_id','actor','status','source_ids']) && actors.records.every(x=>Array.isArray(x)&&x.length===4),'actor matrix format');
  allFalse(actors.authority,'actors.authority');
  const ladder=jsonFile(root,BASE+'CONSEQUENCE-LADDER.json');
  ok(ladder.stage_count===10 && ladder.stages.length===10,'consequence ladder');
  allFalse(ladder.authority,'ladder.authority');
  const proto=jsonFile(root,BASE+'ACCOUNTABILITY-CONSEQUENCE-PROTOCOL.json');
  ok(proto.control_count===18 && proto.controls.length===18 && proto.controls.every(x=>x.adopted===false),'control denominator');
  ok(proto.hard_stops.includes('closure_by_silence') && proto.hard_stops.includes('corrective_authority_missing'),'hard stops');
  allFalse(proto.authority,'protocol.authority');
  const cases=jsonFile(root,BASE+'CASE-CONSEQUENCE-REGISTER.json');
  ok(cases.case_count===6 && cases.cases.length===6 && cases.cases.every(x=>x.closure_allowed===false),'case register');
  allFalse(cases.authority,'cases.authority');
  const ch=jsonFile(root,BASE+"CHLOE-NON-AI-CONSEQUENCE-BOUNDARY.json");
  ok(ch.named_non_ai_baseline===true && ch.ai_use_established===false && ch.final_coroner_conclusion_established===false,'Chloe boundary');
  ok(ch.prohibited_inferences.some(x=>x.includes('weak')),'victim-character refusal missing');
  ok(ch.prohibited_inferences.some(x=>x.includes('no consequence occurred')),'public-silence refusal missing');
  allFalse(ch.authority,'chloe.authority');
  const mf=jsonFile(root,BASE+'MANIFEST.json');
  ok(mf.wave_id===WAVE && mf.file_count===21,'manifest denominator');
  for(const row of mf.files){
    const b=Buffer.from(text(root,row.path));
    ok(b.length===row.bytes,`byte drift ${row.path}`);
    ok(sha(b)===row.sha256,`sha drift ${row.path}`);
  }
  if(strict){
    const expected=new Set(mf.files.map(x=>x.path).concat(BASE+'MANIFEST.json'));
    const got=new Set(files(root));
    ok(got.size===expected.size && [...got].every(x=>expected.has(x)),'strict root drift');
  }
  console.log('CN-HRAC-W11 validation: passed');
}
try { const a=parseArgs(process.argv.slice(2)); validate(a.root,a.strict); } catch(e) { die(e.message); }
