#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(new URL('..',import.meta.url).pathname);
const script=join(root,'scripts/clifford-number-hr-disciplinary-sentinels.mjs');
function run(r,...extra){return spawnSync(process.execPath,[script,'--check','--root',r,...extra],{encoding:'utf8'})}
function corpus(){const d=mkdtempSync(join(tmpdir(),'hrds-'));cpSync(root,d,{recursive:true});return d}
function mutate(rel,fn){const d=corpus(),p=join(d,rel);const j=JSON.parse(readFileSync(p,'utf8'));fn(j);writeFileSync(p,JSON.stringify(j,null,2)+'\n');const r=run(d);if(r.status===0)throw new Error(`mutation accepted: ${rel}`)}
if(run(root).status!==0)throw new Error('valid corpus rejected');
const cases=[
 ['wave authority', 'data/review/clifford-number/hr-discipline/wave-08/wave-08.json',j=>j.authority.legal_conclusions_allowed=true],
 ['adopt control','data/review/clifford-number/hr-discipline/wave-08/SEVERITY-OVER-LABEL-PROTOCOL.json',j=>j.controls[0].adopted=true],
 ['invent Chloe AI','data/review/clifford-number/hr-discipline/wave-08/CHLOE-NON-AI-SENTINEL-BOUNDARY.json',j=>j.ai_use_established=true],
 ['remove weakness refusal','data/review/clifford-number/hr-discipline/wave-08/CHLOE-NON-AI-SENTINEL-BOUNDARY.json',j=>j.prohibited_inferences=j.prohibited_inferences.filter(x=>!x.includes('weak'))],
 ['parent drift','data/review/clifford-number/hr-discipline/wave-08/wave-08.json',j=>j.parent.head='0'.repeat(40)],
 ['source count','data/review/clifford-number/hr-discipline/wave-08/wave-08.json',j=>j.counts.public_sources=23],
 ['private source','data/review/clifford-number/hr-discipline/wave-08/SOURCE-REGISTER.json',j=>j.private_source_count=1],
 ['source rebinding','data/review/clifford-number/hr-discipline/wave-08/sources/SOURCES-01.json',j=>j.sources[0].url='https://example.com/rebound'],
 ['weak source','data/review/clifford-number/hr-discipline/wave-08/sources/SOURCES-01.json',j=>j.sources[0].status='seed_only'],
 ['missing source limit','data/review/clifford-number/hr-discipline/wave-08/sources/SOURCES-01.json',j=>j.sources[0].limits=[]],
 ['lane denominator','data/review/clifford-number/hr-discipline/wave-08/lanes/HRDS-01.json',j=>j.observations.pop()],
 ['closed question','data/review/clifford-number/hr-discipline/wave-08/lanes/HRDS-01.json',j=>j.terminal_receipt.closed_questions.push('closed')],
 ['dangling source','data/review/clifford-number/hr-discipline/wave-08/lanes/HRDS-02.json',j=>j.source_ids[0]='missing'],
 ['cell denominator','data/review/clifford-number/hr-discipline/wave-08/SENTINEL-PROCESS-MATRIX.json',j=>j.cells.pop()],
 ['bad status','data/review/clifford-number/hr-discipline/wave-08/SENTINEL-PROCESS-MATRIX.json',j=>j.cells[0].status='complete'],
 ['blocked proof','data/review/clifford-number/hr-discipline/wave-08/SENTINEL-PROCESS-MATRIX.json',j=>{const x=j.cells.find(c=>c.status==='blocked');x.source_ids=['chloe-guardian-2026']}],
 ['matrix authority','data/review/clifford-number/hr-discipline/wave-08/SENTINEL-PROCESS-MATRIX.json',j=>j.authority.employer_liability_findings_allowed=true],
 ['case count','data/review/clifford-number/hr-discipline/wave-08/CASE-REGISTER.json',j=>j.case_count=5],
 ['case authority','data/review/clifford-number/hr-discipline/wave-08/CASE-REGISTER.json',j=>j.authority.victim_character_inferences_allowed=true],
 ['domain causal collapse','data/review/clifford-number/hr-discipline/wave-08/DOMAIN-BOUNDARY-REGISTER.json',j=>j.prohibited_promotions=j.prohibited_promotions.filter(x=>x!=='custody_failure_to_employer_causation')],
 ['domain AI promotion','data/review/clifford-number/hr-discipline/wave-08/DOMAIN-BOUNDARY-REGISTER.json',j=>j.prohibited_promotions=j.prohibited_promotions.filter(x=>x!=='generic_algorithmic_risk_to_named_case_ai_use')],
 ['domain authority','data/review/clifford-number/hr-discipline/wave-08/DOMAIN-BOUNDARY-REGISTER.json',j=>j.authority.legal_conclusions_allowed=true],
 ['protocol state','data/review/clifford-number/hr-discipline/wave-08/SEVERITY-OVER-LABEL-PROTOCOL.json',j=>j.states.pop()],
];
for(const [,rel,fn] of cases)mutate(rel,fn);
const strict=corpus();writeFileSync(join(strict,'EXTRA'),'x');if(run(strict,'--strict-root').status===0)throw new Error('strict extra file accepted');
for(const args of [['--wat'],['--root'],['--check','--write']]){const r=spawnSync(process.execPath,[script,...args],{encoding:'utf8'});if(r.status===0)throw new Error(`bad CLI accepted ${args.join(' ')}`)}
console.log(`disciplinary sentinel fixtures: passed (1 valid corpus + ${cases.length+1} adversarial corpus refusals + 3 CLI refusals)`)
