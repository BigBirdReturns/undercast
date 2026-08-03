#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(new URL('..',import.meta.url).pathname);
const script=join(root,'scripts/clifford-number-hr-reopen-monitor.mjs');
function run(r,...extra){return spawnSync(process.execPath,[script,'--check','--root',r,...extra],{encoding:'utf8'})}
function corpus(){const d=mkdtempSync(join(tmpdir(),'hrrm-'));cpSync(root,d,{recursive:true});return d}
function mutate(rel,fn){const d=corpus(),p=join(d,rel),j=JSON.parse(readFileSync(p,'utf8'));fn(j);writeFileSync(p,JSON.stringify(j,null,2)+'\n');const r=run(d);if(r.status===0)throw new Error(`mutation accepted: ${rel}`)}
if(run(root).status!==0)throw new Error('valid corpus rejected');
const B='data/review/clifford-number/hr-discipline/wave-10/';
const cases=[
 ['authority escalation',B+'wave-10.json',j=>j.authority.legal_conclusions_allowed=true],
 ['parent drift',B+'wave-10.json',j=>j.parent.git_head='0'.repeat(40)],
 ['HR anchor drift',B+'wave-10.json',j=>j.parent.hr_estate_anchor='0'.repeat(40)],
 ['source count',B+'wave-10.json',j=>j.counts.public_sources=23],
 ['private source',B+'SOURCE-REGISTER.json',j=>j.private_source_count=1],
 ['source rebinding',B+'sources/SOURCES-01.json',j=>j.sources[0].url='https://example.com/rebound'],
 ['source recheck removed',B+'sources/SOURCES-01.json',j=>delete j.sources[0].recheck_by],
 ['weak source',B+'sources/SOURCES-01.json',j=>j.sources[0].status='seed_only'],
 ['lane denominator',B+'lanes/HRRM-01.json',j=>j.observations.pop()],
 ['lane closed',B+'lanes/HRRM-01.json',j=>j.lifecycle_state='closed'],
 ['next review missing',B+'lanes/HRRM-02.json',j=>j.next_review_date=''],
 ['reopen triggers removed',B+'lanes/HRRM-03.json',j=>j.reopen_triggers=[]],
 ['closed question',B+'lanes/HRRM-04.json',j=>j.terminal_receipt.closed_questions.push('done')],
 ['dangling source',B+'lanes/HRRM-05.json',j=>j.source_ids[0]='missing'],
 ['matrix size',B+'RECURRENCE-AND-REOPEN-MATRIX.json',j=>j.cells.pop()],
 ['bad matrix status',B+'RECURRENCE-AND-REOPEN-MATRIX.json',j=>j.cells[0][2]='resolved'],
 ['blocked cell proof',B+'RECURRENCE-AND-REOPEN-MATRIX.json',j=>{const x=j.cells.find(c=>c[2]==='blocked');x[3]=['chloe-guardian-2026']}],
 ['matrix authority',B+'RECURRENCE-AND-REOPEN-MATRIX.json',j=>j.authority.employer_liability_findings_allowed=true],
 ['trigger removed',B+'REOPEN-TRIGGER-PROTOCOL.json',j=>j.triggers.pop()],
 ['control adopted',B+'REOPEN-TRIGGER-PROTOCOL.json',j=>j.controls[0].adopted=true],
 ['closure hard stop removed',B+'REOPEN-TRIGGER-PROTOCOL.json',j=>j.hard_stops=j.hard_stops.filter(x=>x!=='closure_by_silence')],
 ['freshness denominator',B+'EVIDENCE-FRESHNESS-LEDGER.json',j=>j.records.pop()],
 ['freshness closes',B+'EVIDENCE-FRESHNESS-LEDGER.json',j=>j.records[0].closure_effect='close'],
 ['case closure allowed',B+'CASE-REOPEN-REGISTER.json',j=>j.cases[0].closure_allowed=true],
 ['explicit recurrence removed',B+'CASE-REOPEN-REGISTER.json',j=>j.cases.find(x=>x.lane_id==='HRRM-06').recurrence_basis='none'],
 ['invent Chloe AI',B+'CHLOE-NON-AI-REOPEN-BOUNDARY.json',j=>j.ai_use_established=true],
 ['invent final coroner',B+'CHLOE-NON-AI-REOPEN-BOUNDARY.json',j=>j.final_coroner_conclusion_established=true],
 ['remove weakness refusal',B+'CHLOE-NON-AI-REOPEN-BOUNDARY.json',j=>j.prohibited_inferences=j.prohibited_inferences.filter(x=>!x.includes('weak'))],
 ['remove silence refusal',B+'CHLOE-NON-AI-REOPEN-BOUNDARY.json',j=>j.prohibited_inferences=j.prohibited_inferences.filter(x=>!x.includes('Lack of a new public event'))],
];
for(const [,rel,fn] of cases)mutate(rel,fn);
const strict=corpus();writeFileSync(join(strict,'EXTRA'),'x');if(run(strict,'--strict-root').status===0)throw new Error('strict extra file accepted');
for(const a of [['--wat'],['--root'],['--check','--write']]){const r=spawnSync(process.execPath,[script,...a],{encoding:'utf8'});if(r.status===0)throw new Error(`bad CLI accepted ${a.join(' ')}`)}
console.log(`HR recurrence monitor fixtures: passed (1 valid corpus + ${cases.length+1} adversarial corpus refusals + 3 CLI refusals)`)
