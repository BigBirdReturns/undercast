#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SCRIPT='scripts/clifford-number-hr-learning-audit.mjs';
const BASE='data/review/clifford-number/hr-discipline/wave-07';
const expected=[
  `${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`,`${BASE}/OUTCOME-POPULATION-LEDGER.json`,
  `${BASE}/RECURRENCE-AND-DRIFT-REGISTER.json`,`${BASE}/LEARNING-RECEIPT.json`,
  `${BASE}/CHLOE-NON-AI-LEARNING-BOUNDARY.json`,`${BASE}/SOURCE-REGISTER.json`,
  `${BASE}/WAVE-07-SUMMARY.json`,`${BASE}/MANIFEST.json`,`${BASE}/wave-07.json`,
  ...['01','02','03','04','05','06'].map(x=>`${BASE}/lanes/HRDL-${x}.json`),
  ...['01','02','03'].map(x=>`${BASE}/sources/SOURCES-${x}.json`),
  'docs/research/clifford-number/hr-discipline/WAVE-07.md',
  'schema/clifford-number-hr-learning-audit-lane.schema.json',SCRIPT,
  'test/clifford-number-hr-learning-audit-fixtures.mjs'
].sort();
function run(root,args,expect=0){const r=spawnSync(process.execPath,[path.join(root,SCRIPT),...args],{cwd:root,encoding:'utf8'});if(r.status!==expect)throw new Error(`unexpected exit ${r.status} expected ${expect}\n${r.stdout}\n${r.stderr}`);return r;}
function copyCorpus(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cnhr-w07-'));for(const rel of expected){const src=path.join(ROOT,rel),dst=path.join(dir,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);fs.chmodSync(dst,fs.statSync(src).mode);}return dir;}
function mutate(name,fn){const dir=copyCorpus();try{fn(dir);const r=spawnSync(process.execPath,[path.join(dir,SCRIPT),'--write','--strict-root','--root',dir],{cwd:dir,encoding:'utf8'});if(r.status===0)throw new Error(`${name} was accepted`);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function j(dir,rel){return JSON.parse(fs.readFileSync(path.join(dir,rel),'utf8'));}
function w(dir,rel,obj){fs.writeFileSync(path.join(dir,rel),JSON.stringify(obj,null,2)+'\n');}
const valid=copyCorpus();run(valid,['--check','--strict-root','--root',valid],0);fs.rmSync(valid,{recursive:true,force:true});
const tests=[
 ['authority escalation',d=>{const r=`${BASE}/wave-07.json`;const x=j(d,r);x.authority.legal_conclusions_allowed=true;w(d,r,x);}],
 ['parent drift',d=>{const r=`${BASE}/wave-07.json`;const x=j(d,r);x.parent.head='0'.repeat(40);w(d,r,x);}],
 ['source rebinding',d=>{const r=`${BASE}/sources/SOURCES-01.json`;const x=j(d,r);x.sources[0].url='https://example.invalid/rebound';w(d,r,x);}],
 ['duplicate source identity',d=>{const r=`${BASE}/sources/SOURCES-01.json`;const x=j(d,r);x.sources[1].id=x.sources[0].id;w(d,r,x);}],
 ['private source publication',d=>{const r=`${BASE}/sources/SOURCES-01.json`;const x=j(d,r);x.sources[0].private=true;w(d,r,x);}],
 ['weak source status',d=>{const r=`${BASE}/sources/SOURCES-01.json`;const x=j(d,r);x.sources[0].status='seed_declared_not_reverified';w(d,r,x);}],
 ['missing lane',d=>fs.rmSync(path.join(d,`${BASE}/lanes/HRDL-06.json`))],
 ['observation denominator drift',d=>{const r=`${BASE}/lanes/HRDL-01.json`;const x=j(d,r);x.observations.pop();w(d,r,x);}],
 ['finding denominator drift',d=>{const r=`${BASE}/lanes/HRDL-02.json`;const x=j(d,r);x.findings.pop();w(d,r,x);}],
 ['dangling source',d=>{const r=`${BASE}/lanes/HRDL-03.json`;const x=j(d,r);x.source_ids.push('missing-source');w(d,r,x);}],
 ['matrix status promotion',d=>{const r=`${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`;const x=j(d,r);const c=x.cells.find(c=>c.status==='blocked');c.status='recovered';w(d,r,x);}],
 ['matrix cell removal',d=>{const r=`${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`;const x=j(d,r);x.cells.pop();w(d,r,x);}],
 ['outcome cell removal',d=>{const r=`${BASE}/OUTCOME-POPULATION-LEDGER.json`;const x=j(d,r);x.cells.pop();w(d,r,x);}],
 ['recurrence record removal',d=>{const r=`${BASE}/RECURRENCE-AND-DRIFT-REGISTER.json`;const x=j(d,r);x.records.pop();w(d,r,x);}],
 ['control adoption',d=>{const r=`${BASE}/LEARNING-RECEIPT.json`;const x=j(d,r);x.controls[0].adopted=true;w(d,r,x);}],
 ['receipt state removal',d=>{const r=`${BASE}/LEARNING-RECEIPT.json`;const x=j(d,r);x.states.pop();w(d,r,x);}],
 ['vendor statement promoted to verification',d=>{const r=`${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`;const x=j(d,r);const c=x.cells.find(c=>c.lane_id==='HRDL-03'&&c.stage_id==='independent_implementation_verification');c.status='recovered';w(d,r,x);}],
 ['fine promoted to compensation',d=>{const r=`${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`;const x=j(d,r);const c=x.cells.find(c=>c.lane_id==='HRDL-06'&&c.stage_id==='worker_compensation');c.status='recovered';w(d,r,x);}],
 ['restoration promoted to revision',d=>{const r=`${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`;const x=j(d,r);const c=x.cells.find(c=>c.lane_id==='HRDL-05'&&c.stage_id==='validation_target_revised');c.status='recovered';w(d,r,x);}],
 ['followup promoted to survivor reconciliation',d=>{const r=`${BASE}/OUTCOME-POPULATION-LEDGER.json`;const x=j(d,r);const c=x.cells.find(c=>c.lane_id==='HRDL-06'&&c.population_id==='workers_silent_or_deterred');c.status='recovered';w(d,r,x);}],
 ['invented Chloe AI use',d=>{const r=`${BASE}/CHLOE-NON-AI-LEARNING-BOUNDARY.json`;const x=j(d,r);x.ai_use_established=true;w(d,r,x);}],
 ['victim-character refusal removed',d=>{const r=`${BASE}/CHLOE-NON-AI-LEARNING-BOUNDARY.json`;const x=j(d,r);x.prohibited_inferences=x.prohibited_inferences.filter(s=>!s.includes('weak'));w(d,r,x);}],
 ['extra strict-root file',d=>fs.writeFileSync(path.join(d,'EXTRA.txt'),'drift\n')],
 ['source register denominator drift',d=>{const r=`${BASE}/SOURCE-REGISTER.json`;const x=j(d,r);x.source_count=999;w(d,r,x);}],
];
for(const [name,fn] of tests) mutate(name,fn);
const cli=copyCorpus();
for(const args of [['--unknown'],['--check','--write'],['--check','--root','/definitely/missing']]){const r=spawnSync(process.execPath,[path.join(cli,SCRIPT),...args],{cwd:cli,encoding:'utf8'});if(r.status===0)throw new Error(`CLI refusal failed ${args}`);}fs.rmSync(cli,{recursive:true,force:true});
console.log(`learning audit fixtures: passed (1 valid corpus + ${tests.length} adversarial corpus refusals + 3 CLI refusals)`);
