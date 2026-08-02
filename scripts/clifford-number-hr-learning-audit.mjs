#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const WAVE_ID = 'CN-HRDL-W07';
const BASE = 'data/review/clifford-number/hr-discipline/wave-07';
const PARENT_HEAD = '23ea1165065500e540b84eb0aa6f1de203cfc530';
const PARENT_MANIFEST = '44814d0f693cae4c2be4f47ab82de931c191c9e8b7a15c51b910bfda52d006ca';
const LANE_IDS = ['HRDL-01','HRDL-02','HRDL-03','HRDL-04','HRDL-05','HRDL-06'];
const EXPECTED_STATUS = {recovered:22, partial:25, blocked:19, not_applicable:6};
const EXPECTED_OUTCOME_STATUS = {recovered:6, partial:10, blocked:29, not_applicable:3};
const EXPECTED_SOURCE_MAP_SHA = '02ed55fddb4567cad2118486dc5c5612a89d29473d2a9a3447e62af454e8bafd';

function fail(message) { throw new Error(message); }
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function jpath(root, rel) { return path.join(root, rel); }
function readJson(root, rel) { return JSON.parse(fs.readFileSync(jpath(root, rel), 'utf8')); }
function jsonBytes(obj) { return Buffer.from(JSON.stringify(obj, null, 2) + '\n', 'utf8'); }
function walk(dir, base=dir) {
  const out=[];
  for (const name of fs.readdirSync(dir).sort()) {
    const full=path.join(dir,name); const st=fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full,base)); else out.push(path.relative(base,full).split(path.sep).join('/'));
  }
  return out;
}
function expectedPaths() {
  const roots = [
    `${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`,
    `${BASE}/OUTCOME-POPULATION-LEDGER.json`,
    `${BASE}/RECURRENCE-AND-DRIFT-REGISTER.json`,
    `${BASE}/LEARNING-RECEIPT.json`,
    `${BASE}/CHLOE-NON-AI-LEARNING-BOUNDARY.json`,
    `${BASE}/SOURCE-REGISTER.json`,
    `${BASE}/WAVE-07-SUMMARY.json`,
    `${BASE}/MANIFEST.json`,
    `${BASE}/wave-07.json`,
  ];
  for (const id of LANE_IDS) roots.push(`${BASE}/lanes/${id}.json`);
  for (let i=1;i<=3;i++) roots.push(`${BASE}/sources/SOURCES-${String(i).padStart(2,'0')}.json`);
  roots.push('docs/research/clifford-number/hr-discipline/WAVE-07.md');
  roots.push('schema/clifford-number-hr-learning-audit-lane.schema.json');
  roots.push('scripts/clifford-number-hr-learning-audit.mjs');
  roots.push('test/clifford-number-hr-learning-audit-fixtures.mjs');
  return roots.sort();
}
function load(root) {
  const wave=readJson(root,`${BASE}/wave-07.json`);
  const lanes=LANE_IDS.map(id=>readJson(root,`${BASE}/lanes/${id}.json`));
  const shards=[1,2,3].map(i=>readJson(root,`${BASE}/sources/SOURCES-${String(i).padStart(2,'0')}.json`));
  const sources=shards.flatMap(s=>s.sources);
  return {
    wave,lanes,sources,
    matrix:readJson(root,`${BASE}/IMPLEMENTATION-VERIFICATION-MATRIX.json`),
    outcomes:readJson(root,`${BASE}/OUTCOME-POPULATION-LEDGER.json`),
    recurrence:readJson(root,`${BASE}/RECURRENCE-AND-DRIFT-REGISTER.json`),
    receipt:readJson(root,`${BASE}/LEARNING-RECEIPT.json`),
    chloe:readJson(root,`${BASE}/CHLOE-NON-AI-LEARNING-BOUNDARY.json`),
    sourceRegister:readJson(root,`${BASE}/SOURCE-REGISTER.json`),
  };
}
function allFalse(obj, where) {
  for (const [k,v] of Object.entries(obj)) if (v !== false) fail(`${where}.${k} must remain false`);
}
function validate(root, strictRoot=false) {
  const d=load(root);
  if (d.wave.wave_id!==WAVE_ID) fail('wave id drift');
  if (d.wave.parent?.head!==PARENT_HEAD) fail('parent head drift');
  if (d.wave.parent?.manifest_sha256!==PARENT_MANIFEST) fail('parent manifest drift');
  allFalse(d.wave.authority,'wave.authority');
  if (d.lanes.length!==6 || new Set(d.lanes.map(x=>x.lane_id)).size!==6) fail('lane denominator drift');
  let observations=0, findings=0;
  const sourceIds=new Set(d.sources.map(s=>s.id));
  if (d.sources.length!==24 || sourceIds.size!==24) fail('source denominator or duplicate identity');
  if (d.sources.some(s=>s.status!=='independently_recovered_public_source')) fail('weak source status');
  if (d.sources.some(s=>s.private===true)) fail('private source publication');
  if (d.sourceRegister.source_count!==24 || d.sourceRegister.source_ids.length!==24) fail('source register denominator drift');
  const urls=new Map();
  for (const s of d.sources) {
    if (urls.has(s.id) && urls.get(s.id)!==s.url) fail('source identity rebound');
    urls.set(s.id,s.url);
  }
  const sourceMap=d.sources.map(s=>`${s.id}\t${s.url}`).sort().join('\n')+'\n';
  if (sha(Buffer.from(sourceMap,'utf8'))!==EXPECTED_SOURCE_MAP_SHA) fail('source identity map drift');
  for (const lane of d.lanes) {
    if (lane.wave_id!==WAVE_ID) fail('lane wave drift');
    if (lane.observations.length!==6 || lane.findings.length!==4) fail(`${lane.lane_id} denominator drift`);
    observations+=lane.observations.length; findings+=lane.findings.length;
    allFalse(lane.authority,`${lane.lane_id}.authority`);
    for (const sid of lane.source_ids) if (!sourceIds.has(sid)) fail(`dangling source ${sid}`);
    for (const o of lane.observations) for (const sid of o.source_ids) if (!sourceIds.has(sid)) fail(`dangling observation source ${sid}`);
    for (const f of lane.findings) for (const sid of f.source_ids) if (!sourceIds.has(sid)) fail(`dangling finding source ${sid}`);
  }
  if (observations!==36 || findings!==24) fail('observation/finding denominator drift');
  if (d.matrix.cell_count!==72 || d.matrix.cells.length!==72 || d.matrix.stage_ids.length!==12) fail('implementation matrix denominator drift');
  const status={recovered:0,partial:0,blocked:0,not_applicable:0};
  for (const c of d.matrix.cells) {
    if (!(c.status in status)) fail('unknown matrix status'); status[c.status]++;
    for (const sid of c.source_ids) if (!sourceIds.has(sid)) fail(`dangling matrix source ${sid}`);
  }
  if (JSON.stringify(status)!==JSON.stringify(EXPECTED_STATUS)) fail(`matrix status drift ${JSON.stringify(status)}`);
  if (d.outcomes.cell_count!==48 || d.outcomes.cells.length!==48 || d.outcomes.population_ids.length!==8) fail('outcome population denominator drift');
  const outcomeStatus={recovered:0,partial:0,blocked:0,not_applicable:0};
  for (const c of d.outcomes.cells) { if (!(c.status in outcomeStatus)) fail('unknown outcome status'); outcomeStatus[c.status]++; }
  if (JSON.stringify(outcomeStatus)!==JSON.stringify(EXPECTED_OUTCOME_STATUS)) fail(`outcome status drift ${JSON.stringify(outcomeStatus)}`);
  if (d.recurrence.records.length!==6) fail('recurrence denominator drift');
  if (d.receipt.states.length!==16 || d.receipt.controls.length!==16) fail('learning receipt denominator drift');
  if (d.receipt.controls.some(c=>c.adopted!==false)) fail('control adoption');
  allFalse(d.receipt.authority,'receipt.authority');
  if (!d.chloe.named_non_ai_baseline || d.chloe.ai_use_finding_count!==0) fail('Chloe non-AI boundary drift');
  if (d.chloe.ai_use_established || d.chloe.algorithmic_monitoring_established || d.chloe.automated_decision_established || d.chloe.vendor_system_established) fail('invented Chloe AI use');
  allFalse(d.chloe.authority,'chloe.authority');
  if (!d.chloe.prohibited_inferences.some(x=>x.includes('weak'))) fail('victim-character refusal removed');
  if (strictRoot) {
    const observed=walk(root).sort(); const expected=expectedPaths();
    if (JSON.stringify(observed)!==JSON.stringify(expected)) {
      const e=new Set(expected), o=new Set(observed);
      fail(`strict root drift missing=${expected.filter(x=>!o.has(x))} extra=${observed.filter(x=>!e.has(x))}`);
    }
  }
  return {d,status,observations,findings};
}
function buildSummary(root) {
  const {d,status,observations,findings}=validate(root,false);
  const outcomeStatus={recovered:0,partial:0,blocked:0,not_applicable:0};
  for (const c of d.outcomes.cells) outcomeStatus[c.status]++;
  const sourceMap=d.sources.map(s=>`${s.id}\t${s.url}`).sort().join('\n')+'\n';
  return {
    schema_version:1,wave_id:WAVE_ID,
    title:d.wave.title,as_of:d.wave.as_of,parent:d.wave.parent,
    counts:{
      public_sources:d.sources.length,private_sources:0,lanes:d.lanes.length,
      observations,findings,implementation_stages:d.matrix.stage_ids.length,
      implementation_cells:d.matrix.cells.length,implementation_status:status,
      outcome_populations:d.outcomes.population_ids.length,outcome_cells:d.outcomes.cells.length,
      outcome_status:outcomeStatus,recurrence_records:d.recurrence.records.length,
      learning_receipt_states:d.receipt.states.length,proposed_controls:d.receipt.controls.length,
      adopted_controls:0,chloe_ai_use_findings:0,
    },
    lane_terminal_receipts:Object.fromEntries(d.lanes.map(x=>[x.lane_id,x.terminal_receipt])),
    central_rule:d.wave.central_rule,
    interpretive_law:[
      'Correction is not learning.',
      'Visibility is not authority.',
      'Explanation is not restoration.',
      'A regulatory fine is not worker compensation.',
      'Restoration is not system revision.',
      'A vendor statement is not independent verification.',
      'Follow-up is not survivor-bias reconciliation.',
      'Silence, exit, deterrence, and exclusion are missing evidence rather than proof of system health.'
    ],
    source_id_url_map_sha256:sha(Buffer.from(sourceMap,'utf8')),
    authority:d.wave.authority,
  };
}
function buildManifest(root) {
  const rows=[];
  for (const rel of expectedPaths().filter(x=>x!==`${BASE}/MANIFEST.json`)) {
    const bytes=fs.readFileSync(jpath(root,rel)); const mode=(fs.statSync(jpath(root,rel)).mode & 0o111)?'100755':'100644';
    rows.push({path:rel,bytes:bytes.length,sha256:sha(bytes),mode});
  }
  return {schema_version:1,wave_id:WAVE_ID,parent_head:PARENT_HEAD,file_count:rows.length,files:rows};
}
function writeGenerated(root) {
  validate(root,false);
  fs.writeFileSync(jpath(root,`${BASE}/WAVE-07-SUMMARY.json`),jsonBytes(buildSummary(root)));
  fs.writeFileSync(jpath(root,`${BASE}/MANIFEST.json`),jsonBytes(buildManifest(root)));
}
function checkGenerated(root,strictRoot=false) {
  validate(root,strictRoot);
  const expectedSummary=jsonBytes(buildSummary(root));
  const actualSummary=fs.readFileSync(jpath(root,`${BASE}/WAVE-07-SUMMARY.json`));
  if (!actualSummary.equals(expectedSummary)) fail('stale generated summary');
  const expectedManifest=jsonBytes(buildManifest(root));
  const actualManifest=fs.readFileSync(jpath(root,`${BASE}/MANIFEST.json`));
  if (!actualManifest.equals(expectedManifest)) fail('stale generated manifest');
  return buildSummary(root);
}

const args=process.argv.slice(2);
let root='.'; let mode=null; let strict=false;
for (let i=0;i<args.length;i++) {
  const a=args[i];
  if (a==='--root') { if (!args[i+1]) fail('--root requires a value'); root=args[++i]; }
  else if (a==='--write') { if (mode) fail('choose one mode'); mode='write'; }
  else if (a==='--check') { if (mode) fail('choose one mode'); mode='check'; }
  else if (a==='--strict-root') strict=true;
  else fail(`unknown argument ${a}`);
}
if (!mode) fail('one of --write or --check is required');
root=path.resolve(root);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail('root must be an existing directory');
if (mode==='write') { writeGenerated(root); const s=checkGenerated(root,strict); console.log(`learning audit write: passed (${s.counts.public_sources} sources, ${s.counts.lanes} lanes, ${s.counts.implementation_cells} implementation cells, ${s.counts.outcome_cells} outcome cells)`); }
else { const s=checkGenerated(root,strict); console.log(`learning audit check: passed (${s.counts.public_sources} sources, ${s.counts.lanes} lanes, ${s.counts.observations} observations, ${s.counts.findings} findings, ${s.counts.proposed_controls} unadopted controls)`); }
