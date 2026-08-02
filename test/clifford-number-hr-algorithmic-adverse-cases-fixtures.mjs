#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const script = path.join(repoRoot, 'scripts/clifford-number-hr-algorithmic-adverse-cases.mjs');
const node = process.execPath;
function run(root, args=['--check','--root',root]) { return spawnSync(node, [script, ...args], { encoding:'utf8' }); }
function json(file) { return JSON.parse(fs.readFileSync(file,'utf8')); }
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value,null,2)}\n`); }
function clone() { const d=fs.mkdtempSync(path.join(os.tmpdir(),'cnhr-w03-')); fs.cpSync(repoRoot,d,{recursive:true}); return d; }
function mutate(label, fn) {
  const d=clone();
  try { fn(d); const r=run(d); if (r.status === 0) throw new Error(`${label}: mutation was accepted`); }
  finally { fs.rmSync(d,{recursive:true,force:true}); }
}

let valid = run(repoRoot);
if (valid.status !== 0) throw new Error(`valid corpus failed: ${valid.stderr}`);
const base = 'data/review/clifford-number/hr-discipline/wave-03';
const lane = d => path.join(d,base,'lanes/HRDAC-01.json');
const wave = d => path.join(d,base,'wave-03.json');
const cases = d => path.join(d,base,'CASE-REGISTER.json');
const matrix = d => path.join(d,base,'ADVERSE-ACTION-CHAIN-MATRIX.json');
const remedy = d => path.join(d,base,'REMEDY-AND-ACCOUNTABILITY-LEDGER.json');
const chloe = d => path.join(d,base,'CHLOE-NON-AI-BOUNDARY.json');

const tests = [
 ['authority escalation', d => { const x=json(wave(d)); x.authority.control_adoption_allowed=true; write(wave(d),x); }],
 ['universal purge promotion', d => { const x=json(wave(d)); x.central_mechanism='All employers intentionally purge dissent.'; write(wave(d),x); }],
 ['control adoption', d => { const x=json(wave(d)); x.adopted_control_count=1; write(wave(d),x); }],
 ['parent head drift', d => { const x=json(wave(d)); x.parent.head='deadbeef'; write(wave(d),x); }],
 ['parent manifest drift', d => { fs.appendFileSync(path.join(d,'data/review/clifford-number/hr-discipline/wave-02/MANIFEST.json'),' '); }],
 ['Chloe AI use invented', d => { const x=json(chloe(d)); x.ai_use_established=true; write(chloe(d),x); }],
 ['Chloe prohibition removed', d => { const x=json(chloe(d)); x.prohibited_inferences=[]; write(chloe(d),x); }],
 ['lane missing', d => fs.rmSync(lane(d))],
 ['lane extra', d => fs.copyFileSync(lane(d),path.join(d,base,'lanes/HRDAC-07.json'))],
 ['lane observation removed', d => { const x=json(lane(d)); x.observations.pop(); write(lane(d),x); }],
 ['lane dangling source', d => { const x=json(lane(d)); x.findings[0].source_ids=['not-a-source']; write(lane(d),x); }],
 ['duplicate source id', d => { const f=path.join(d,base,'sources/SOURCES-03.json'); const x=json(f); x.sources[0].id='amazon-france-cnil-decision-2023'; write(f,x); }],
 ['source URL rebound', d => { const f=path.join(d,base,'sources/SOURCES-01.json'); const x=json(f); x.sources[0].url='https://example.com/rebound'; write(f,x); }],
 ['case denominator removed', d => { const x=json(cases(d)); x.cases.pop(); write(cases(d),x); }],
 ['Amazon France final amount regressed', d => { const x=json(cases(d)); x.cases[0].final_monetary_amount=32000000; write(cases(d),x); }],
 ['Seattle transition removed', d => { const x=json(cases(d)); x.cases[5].event_dates=x.cases[5].event_dates.filter(v=>v!=='2027-06-01'); write(cases(d),x); }],
 ['chain state removed', d => { const x=json(matrix(d)); x.state_order.pop(); write(matrix(d),x); }],
 ['blocked chain cites evidence', d => { const x=json(matrix(d)); const c=x.cases[0].cells.find(v=>v.status==='blocked'); c.source_ids=['amazon-france-cnil-decision-2023']; write(matrix(d),x); }],
 ['remedy denominator removed', d => { const x=json(remedy(d)); x.records.pop(); write(remedy(d),x); }],
 ['Seattle merits promoted', d => { const x=json(remedy(d)); x.records.find(r=>r.id==='R-08').status='final_merits_finding'; write(remedy(d),x); }],
 ['stale summary', d => fs.appendFileSync(path.join(d,base,'WAVE-03-SUMMARY.json'),' ')],
 ['stale manifest', d => fs.appendFileSync(path.join(d,base,'MANIFEST.json'),' ')],
];
for (const [label,fn] of tests) mutate(label,fn);

const cli = [
 ['unknown CLI',['--nope']],
 ['conflicting modes',['--write','--check']],
 ['missing root value',['--check','--root']],
];
for (const [label,args] of cli) { const r=run(repoRoot,args); if (r.status===0) throw new Error(`${label}: CLI mutation accepted`); }
console.log(`algorithmic adverse cases fixtures: passed — 1 valid corpus + ${tests.length} adversarial corpus refusals + ${cli.length} CLI refusals`);
