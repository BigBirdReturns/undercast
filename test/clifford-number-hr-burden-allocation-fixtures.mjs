#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=resolve(new URL('..',import.meta.url).pathname);
const script=join(root,"scripts/clifford-number-hr-burden-allocation.mjs");
function run(r,...extra){ return spawnSync(process.execPath,[script,'--check','--root',r,...extra],{encoding:'utf8'}); }
function corpus(){ const d=mkdtempSync(join(tmpdir(),"cnhr-12-")); cpSync(root,d,{recursive:true}); return d; }
function mutate(rel,fn){
  const d=corpus(), p=join(d,rel), j=JSON.parse(readFileSync(p,'utf8'));
  fn(j); writeFileSync(p,JSON.stringify(j,null,2)+'\n');
  const r=run(d); if(r.status===0) throw new Error(`mutation accepted: ${rel}`);
}
if(run(root).status!==0) throw new Error('valid corpus rejected');
const cases=[
["authority","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.authority.legal_conclusions_allowed=true}],
["parent","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.parent.git_head='0'.repeat(40)}],
["parent manifest","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.parent.parent_manifest_sha256='0'.repeat(64)}],
["source count","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.counts.public_sources=23}],
["private count","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.counts.private_sources=1}],
["lane count","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.counts.lanes=5}],
["cell count","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.counts.burden_cells=107}],
["actor count","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.counts.actor_cells=71}],
["control count","data/review/clifford-number/hr-discipline/wave-12/wave-12.json",j=>{j.counts.adopted_controls=1}],
["source pointer count","data/review/clifford-number/hr-discipline/wave-12/SOURCE-REGISTER.json",j=>{j.source_count=23}],
["raw source","data/review/clifford-number/hr-discipline/wave-12/SOURCE-REGISTER.json",j=>{j.remote_raw_bytes_committed=true}],
["source map","data/review/clifford-number/hr-discipline/wave-12/SOURCE-REGISTER.json",j=>{j.inherited_source_id_url_map_sha256='0'.repeat(64)}],
["source authority","data/review/clifford-number/hr-discipline/wave-12/SOURCE-REGISTER.json",j=>{j.authority.private_source_publication_allowed=true}],
["pointer lineage","data/review/clifford-number/hr-discipline/wave-12/sources/SOURCE-POINTERS-01.json",j=>{j.records[0].inherited_from_wave='OTHER'}],
["pointer path","data/review/clifford-number/hr-discipline/wave-12/sources/SOURCE-POINTERS-01.json",j=>{j.records[0].inherited_source_path='bad'}],
["weak pointer","data/review/clifford-number/hr-discipline/wave-12/sources/SOURCE-POINTERS-01.json",j=>{j.records[0].status='seed'}],
["lane observations","data/review/clifford-number/hr-discipline/wave-12/lanes/HRBA-01.json",j=>{j.observations.pop()}],
["lane findings","data/review/clifford-number/hr-discipline/wave-12/lanes/HRBA-02.json",j=>{j.findings.pop()}],
["closed question","data/review/clifford-number/hr-discipline/wave-12/lanes/HRBA-03.json",j=>{j.terminal_receipt.closed_questions.push('done')}],
["dangling lane source","data/review/clifford-number/hr-discipline/wave-12/lanes/HRBA-04.json",j=>{j.source_ids[0]='missing'}],
["lane authority","data/review/clifford-number/hr-discipline/wave-12/lanes/HRBA-05.json",j=>{j.authority.individual_culpability_findings_allowed=true}],
["matrix size","data/review/clifford-number/hr-discipline/wave-12/BURDEN-ALLOCATION-MATRIX.json",j=>{j.patterns['HRBA-01'].pop()}],
["matrix state","data/review/clifford-number/hr-discipline/wave-12/BURDEN-ALLOCATION-MATRIX.json",j=>{j.state_ids.pop()}],
["bad status","data/review/clifford-number/hr-discipline/wave-12/BURDEN-ALLOCATION-MATRIX.json",j=>{j.patterns['HRBA-01'][0]='closed'}],
["matrix dangling source","data/review/clifford-number/hr-discipline/wave-12/BURDEN-ALLOCATION-MATRIX.json",j=>{j.lane_source_ids['HRBA-01'][0]='missing'}],
["matrix authority","data/review/clifford-number/hr-discipline/wave-12/BURDEN-ALLOCATION-MATRIX.json",j=>{j.authority.employer_liability_findings_allowed=true}],
["actor count","data/review/clifford-number/hr-discipline/wave-12/ACTOR-BURDEN-MATRIX.json",j=>{j.records.pop()}],
["actor authority","data/review/clifford-number/hr-discipline/wave-12/ACTOR-BURDEN-MATRIX.json",j=>{j.authority.legal_conclusions_allowed=true}],
["ladder count","data/review/clifford-number/hr-discipline/wave-12/COST-INTERNALIZATION-LADDER.json",j=>{j.stages.pop()}],
["protocol adopted","data/review/clifford-number/hr-discipline/wave-12/BURDEN-INTERNALIZATION-PROTOCOL.json",j=>{j.controls[0].adopted=true}],
["hard stop","data/review/clifford-number/hr-discipline/wave-12/BURDEN-INTERNALIZATION-PROTOCOL.json",j=>{j.hard_stops=j.hard_stops.filter(x=>x!=='closure_by_silence')}],
["case closure","data/review/clifford-number/hr-discipline/wave-12/CASE-BURDEN-REGISTER.json",j=>{j.cases[0].closure_allowed=true}],
["Chloe AI","data/review/clifford-number/hr-discipline/wave-12/CHLOE-NON-AI-BURDEN-BOUNDARY.json",j=>{j.ai_use_established=true}]
];
for(const [,rel,fn] of cases) mutate(rel,fn);
const strict=corpus(); writeFileSync(join(strict,'EXTRA'),'x');
if(run(strict,'--strict-root').status===0) throw new Error('strict extra file accepted');
for(const args of [['--wat'],['--root'],['--check','--write']]){
  const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
  if(r.status===0) throw new Error(`bad CLI accepted: ${args.join(' ')}`);
}
console.log('CN-HRBA-W12 fixtures: passed (1 valid corpus + 34 adversarial corpus refusals + 3 CLI refusals)');
