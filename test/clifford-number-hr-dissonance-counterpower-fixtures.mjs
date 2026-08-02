#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = resolve(new URL('..', import.meta.url).pathname);
const validator = resolve(sourceRoot, 'scripts/clifford-number-hr-dissonance-counterpower.mjs');
const W = 'data/review/clifford-number/hr-discipline/wave-04';
function read(path) { return JSON.parse(readFileSync(path,'utf8')); }
function write(path,obj) { writeFileSync(path,`${JSON.stringify(obj,null,2)}\n`); }
function run(root,args=['--check']) { return spawnSync(process.execPath,[validator,...args,'--root',root],{encoding:'utf8'}); }
function fresh() { const root=mkdtempSync(join(tmpdir(),'cnhr-dcp-')); cpSync(sourceRoot,root,{recursive:true}); return root; }
function expectFailure(name,mutate) { const root=fresh(); try { mutate(root); const r=run(root); if (r.status===0) throw new Error(`${name}: unexpectedly passed`); } finally { rmSync(root,{recursive:true,force:true}); } }

const valid=fresh();
try { const r=run(valid); if (r.status!==0) throw new Error(`valid corpus failed: ${r.stderr}`); } finally { rmSync(valid,{recursive:true,force:true}); }

const mutations = [
  ['authority escalation', root=>{ const p=join(root,W,'wave-04.json'); const x=read(p); x.authority.legal_conclusions_allowed=true; write(p,x); }],
  ['control adoption', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.controls[0].adopted=true; write(p,x); }],
  ['lane removal', root=>unlinkSync(join(root,W,'lanes/HRDCP-06.json'))],
  ['extra lane', root=>{ const src=join(root,W,'lanes/HRDCP-06.json'); cpSync(src,join(root,W,'lanes/HRDCP-07.json')); }],
  ['source rebind', root=>{ const p=join(root,W,'sources/SOURCES-01.json'); const x=read(p); x.sources[0].url='https://example.invalid/rebound'; write(p,x); }],
  ['duplicate source url', root=>{ const p=join(root,W,'sources/SOURCES-01.json'); const x=read(p); x.sources[1].url=x.sources[0].url; write(p,x); }],
  ['dangling source', root=>{ const p=join(root,W,'lanes/HRDCP-01.json'); const x=read(p); x.observations[0].source_ids=['missing-source']; write(p,x); }],
  ['protocol state removal', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.states=x.states.filter(s=>s.id!=='support_and_welfare_arranged'); x.state_count=x.states.length; write(p,x); }],
  ['protected taxonomy removal', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.states=x.states.filter(s=>s.id!=='protected_signal_taxonomy_fixed'); x.state_count=x.states.length; write(p,x); }],
  ['collective actor removal', root=>{ const p=join(root,W,'COUNTERPOWER-REGISTER.json'); const x=read(p); x.actors=x.actors.filter(a=>a.id!=='union_or_works_council'); x.actor_count=x.actors.length; write(p,x); }],
  ['safety actor removal', root=>{ const p=join(root,W,'COUNTERPOWER-REGISTER.json'); const x=read(p); x.actors=x.actors.filter(a=>a.id!=='safety_committee'); x.actor_count=x.actors.length; write(p,x); }],
  ['accommodation actor removal', root=>{ const p=join(root,W,'COUNTERPOWER-REGISTER.json'); const x=read(p); x.actors=x.actors.filter(a=>a.id!=='accommodation_owner'); x.actor_count=x.actors.length; write(p,x); }],
  ['token human review', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.human_review_definition.authority_to_reverse=false; write(p,x); }],
  ['acute safety stop removal', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.hard_stops=x.hard_stops.filter(s=>s!=='acute_safety_or_distress_handoff_required'); write(p,x); }],
  ['restoration state removal', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.states=x.states.filter(s=>s.id!=='remedy_and_restoration_completed'); x.state_count=x.states.length; write(p,x); }],
  ['system revision removal', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.states=x.states.filter(s=>s.id!=='system_revision_completed'); x.state_count=x.states.length; write(p,x); }],
  ['survivor reconciliation removal', root=>{ const p=join(root,W,'DISSONANCE-PRESERVATION-PROTOCOL.json'); const x=read(p); x.reconciliation_population=x.reconciliation_population.filter(s=>s!=='worker_exits'); write(p,x); }],
  ['invent Chloe AI use', root=>{ const p=join(root,W,'CHLOE-NON-AI-BASELINE-JOIN.json'); const x=read(p); x.ai_use_established=true; write(p,x); }],
  ['universal purge promotion', root=>{ const p=join(root,W,'wave-04.json'); const x=read(p); x.authority.dissonance_purge_universal_claims_allowed=true; write(p,x); }],
  ['future AI duties promoted', root=>{ const p=join(root,W,'JURISDICTION-STATE-REGISTER.json'); const x=read(p); x.states.find(s=>s.id==='EU-AI-ACT-EMPLOYMENT-HIGH-RISK').state='operative'; write(p,x); }],
  ['platform directive transposition promoted', root=>{ const p=join(root,W,'JURISDICTION-STATE-REGISTER.json'); const x=read(p); x.states.find(s=>s.id==='EU-PLATFORM-WORK').state='fully_transposed'; write(p,x); }],
  ['parent drift', root=>{ const p=join(root,W,'wave-04.json'); const x=read(p); x.parent.head='0000000000000000000000000000000000000000'; write(p,x); }],
  ['stale summary', root=>writeFileSync(join(root,W,'WAVE-04-SUMMARY.json'),'{}\n')],
  ['stale manifest', root=>writeFileSync(join(root,W,'MANIFEST.json'),'{}\n')],
  ['source denominator weakened', root=>{ const p=join(root,W,'SOURCE-REGISTER.json'); const x=read(p); x.source_count=23; write(p,x); }],
  ['protected central rule removed', root=>{ const p=join(root,W,'PROTECTED-SIGNAL-BOUNDARY.json'); const x=read(p); x.central_rule='generic compliance'; write(p,x); }],
];
for (const [name,mutate] of mutations) expectFailure(name,mutate);

const cli = [
  ['unknown CLI', ['--bogus']],
  ['missing root', ['--check','--root']],
  ['conflicting modes', ['--check','--write']],
];
for (const [name,args] of cli) { const r=spawnSync(process.execPath,[validator,...args],{encoding:'utf8'}); if (r.status===0) throw new Error(`${name}: unexpectedly passed`); }

console.log(`dissonance counterpower fixtures: passed (1 valid corpus + ${mutations.length} adversarial corpus refusals + ${cli.length} CLI refusals)`);
