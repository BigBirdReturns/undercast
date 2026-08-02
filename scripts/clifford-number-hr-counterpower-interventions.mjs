#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const DATA = 'data/review/clifford-number/hr-discipline/wave-05';
const LANE_IDS = ['HRDCI-01','HRDCI-02','HRDCI-03','HRDCI-04','HRDCI-05','HRDCI-06'];
const FALSE_KEYS = [
  'ai_caused_chloe_moffat_death_claims_allowed','canonical_product_effects_allowed','control_adoption_allowed',
  'dissonance_purge_universal_claims_allowed','employer_liability_findings_allowed','employer_specific_causation_findings_allowed',
  'final_coroner_conclusion_claims_allowed','graph_effects_allowed','individual_culpability_findings_allowed','legal_conclusions_allowed',
  'named_company_intent_or_misuse_beyond_public_record_allowed','parent_wave_mutation_allowed','private_source_publication_allowed',
  'protected_activity_classification_claims_allowed','publication_effects_allowed','soft_partnership_as_collective_bargaining_claims_allowed',
  'unpublished_contract_term_inference_allowed','universal_prevalence_findings_allowed','victim_character_inferences_allowed'
];

function args() {
  const out = { mode: 'check', root: process.cwd(), strictRoot: false };
  for (let i=2; i<process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--write') out.mode = 'write';
    else if (a === '--check') out.mode = 'check';
    else if (a === '--root') out.root = resolve(process.argv[++i]);
    else if (a === '--strict-root') out.strictRoot = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function load(root, path) { return JSON.parse(readFileSync(join(root, path), 'utf8')); }
function stable(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function requireFalse(authority, label) {
  const keys = Object.keys(authority).sort();
  const expected = [...FALSE_KEYS].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`${label} authority keys drift`);
  for (const key of FALSE_KEYS) if (authority[key] !== false) throw new Error(`${label} authority escalation: ${key}`);
}
function unique(values, label) { if (new Set(values).size !== values.length) throw new Error(`${label} duplicate values`); }

function sourceMapHash(sources) {
  return sha(Buffer.from([...sources].sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`${s.id}\0${s.url}\n`).join('')));
}

function buildSummary(ctx) {
  const statuses = {};
  for (const lane of ctx.lanes) for (const finding of lane.findings) statuses[finding.status] = (statuses[finding.status] || 0) + 1;
  return {
    schema_version: 1,
    wave_id: 'CN-HRDCI-W05',
    as_of: '2026-08-01',
    generated_from: 'validated source, instrument, timing, actor, remedy and lane ledgers',
    parent: { head: ctx.wave.parent.head, manifest_sha256: ctx.wave.parent.manifest_sha256, mutation_count: 0 },
    source_count: ctx.sources.length,
    private_source_count: 0,
    lane_count: ctx.lanes.length,
    observation_count: ctx.lanes.reduce((n,l)=>n+l.observations.length,0),
    finding_count: ctx.lanes.reduce((n,l)=>n+l.findings.length,0),
    finding_statuses: statuses,
    depth_level_count: ctx.depth.level_count,
    instrument_count: ctx.instruments.instrument_count,
    timing_state_count: ctx.timing.state_count,
    timing_cell_count: ctx.timing.cell_count,
    timing_statuses: ctx.timing.summary,
    actor_count: ctx.actors.actor_count,
    actor_cell_count: ctx.actors.cell_count,
    remedy_record_count: ctx.remedies.record_count,
    binding_predeployment_instrument_count: 2,
    soft_predeployment_instrument_count: 2,
    post_harm_challenge_or_remedy_count: 2,
    preaction_pause_recovered_count: 0,
    system_revision_recovered_count: 0,
    survivor_bias_reconciliation_recovered_count: 0,
    adopted_control_count: 0,
    chloe_ai_use_findings: 0,
    authority: ctx.wave.authority,
    lanes: ctx.lanes.map(l=>({lane_id:l.lane_id,title:l.title,instrument_id:l.instrument_id,counterpower_entry_stage:l.counterpower_entry_stage,highest_publicly_recovered_depth_level:l.highest_publicly_recovered_depth_level,terminal_state:l.terminal_state,observation_count:l.observations.length,finding_count:l.findings.length,open_questions:l.open_questions}))
  };
}

function walk(root, dir='') {
  const abs = join(root, dir); const out=[];
  for (const name of readdirSync(abs)) {
    if (name === '.git') continue;
    const rel = join(dir,name); const st = statSync(join(root,rel));
    if (st.isDirectory()) out.push(...walk(root,rel)); else out.push(rel.replaceAll('\\','/'));
  }
  return out;
}

function candidatePaths() {
  return [
    `${DATA}/ACTOR-POWER-MATRIX.json`, `${DATA}/CHLOE-NON-AI-PREVENTION-BOUNDARY.json`, `${DATA}/COUNTERPOWER-DEPTH-LADDER.json`,
    `${DATA}/INSTRUMENT-ENFORCEABILITY-REGISTER.json`, `${DATA}/PREHARM-POSTHARM-MATRIX.json`, `${DATA}/REMEDY-AND-REVISION-LEDGER.json`,
    `${DATA}/SOURCE-REGISTER.json`, `${DATA}/WAVE-05-SUMMARY.json`, `${DATA}/wave-05.json`,
    ...LANE_IDS.map(id=>`${DATA}/lanes/${id}.json`),
    `${DATA}/sources/SOURCES-01.json`, `${DATA}/sources/SOURCES-02.json`,
    'docs/research/clifford-number/hr-discipline/WAVE-05.md',
    'schema/clifford-number-hr-counterpower-intervention-lane.schema.json',
    'scripts/clifford-number-hr-counterpower-interventions.mjs',
    'test/clifford-number-hr-counterpower-interventions-fixtures.mjs'
  ].sort();
}

function buildManifest(root, parent) {
  const files = candidatePaths().map(path=>{
    const bytes = readFileSync(join(root,path));
    return { path, bytes: bytes.length, sha256: sha(bytes) };
  });
  return { schema_version:1, wave_id:'CN-HRDCI-W05', algorithm:'sha256', parent_head:parent.head, parent_manifest_sha256:parent.manifest_sha256, exact_file_count:files.length, manifest_excludes_self:true, files };
}

function validate(root) {
  const wave = load(root,`${DATA}/wave-05.json`);
  if (wave.wave_id !== 'CN-HRDCI-W05') throw new Error('wave id drift');
  if (wave.parent.head !== 'ee7705464eb974e40a6d4bc52fd0b88e164640db') throw new Error('parent head drift');
  if (wave.parent.manifest_sha256 !== 'c4659d37610b61c2403d10ab1b27b6bc4327aecb9b2103f3e85446da704460df') throw new Error('parent manifest drift');
  if (wave.parent.mutation_allowed !== false) throw new Error('parent mutation enabled');
  requireFalse(wave.authority,'wave');

  const shard1 = load(root,`${DATA}/sources/SOURCES-01.json`); const shard2 = load(root,`${DATA}/sources/SOURCES-02.json`);
  const sources = [...shard1.sources,...shard2.sources];
  if (sources.length !== 22) throw new Error(`source count drift: ${sources.length}`);
  unique(sources.map(s=>s.id),'source ids'); unique(sources.map(s=>s.url),'source urls');
  for (const s of sources) { if (!s.id || !s.url || !s.publisher || s.status.includes('private')) throw new Error(`invalid source ${s.id}`); }
  const sourceIndex = new Map(sources.map(s=>[s.id,s]));
  const sourceRegister = load(root,`${DATA}/SOURCE-REGISTER.json`);
  if (sourceRegister.source_count !== 22 || sourceRegister.private_source_count !== 0) throw new Error('source register denominator drift');
  if (sourceRegister.source_id_url_map_sha256 !== sourceMapHash(sources)) throw new Error('source identity map drift');

  const lanes = LANE_IDS.map(id=>load(root,`${DATA}/lanes/${id}.json`));
  if (JSON.stringify(lanes.map(l=>l.lane_id)) !== JSON.stringify(LANE_IDS)) throw new Error('lane set drift');
  unique(lanes.map(l=>l.instrument_id),'instrument ids');
  for (const lane of lanes) {
    requireFalse(lane.authority,lane.lane_id);
    if (lane.observations.length !== 6 || lane.findings.length !== 4 || lane.open_questions.length !== 6) throw new Error(`${lane.lane_id} denominator drift`);
    unique(lane.source_ids,`${lane.lane_id} sources`);
    for (const sid of lane.source_ids) if (!sourceIndex.has(sid)) throw new Error(`${lane.lane_id} dangling source ${sid}`);
    if (lane.counterpower_entry_stage.startsWith('pre_deployment_soft') && lane.highest_publicly_recovered_depth_level > 2) throw new Error(`${lane.lane_id} soft instrument overpromoted`);
    if (lane.lane_id === 'HRDCI-05' && lane.highest_publicly_recovered_depth_level !== 5) throw new Error('Uber/Ola depth drift');
    if (lane.lane_id === 'HRDCI-06' && lane.highest_publicly_recovered_depth_level !== 6) throw new Error('Seattle depth drift');
    for (const f of lane.findings) if (f.claim.toLowerCase().includes('system revision recovered')) throw new Error(`${lane.lane_id} system revision overpromotion`);
  }

  const depth = load(root,`${DATA}/COUNTERPOWER-DEPTH-LADDER.json`); requireFalse(depth.authority,'depth');
  if (depth.level_count !== 9 || depth.case_depths.length !== 6) throw new Error('depth denominator drift');
  if (depth.summary.cases_reaching_preaction_pause_or_hold !== 0 || depth.summary.cases_reaching_system_revision !== 0 || depth.summary.cases_reaching_survivor_bias_reconciliation !== 0) throw new Error('depth closure overpromoted');

  const instruments = load(root,`${DATA}/INSTRUMENT-ENFORCEABILITY-REGISTER.json`); requireFalse(instruments.authority,'instruments');
  if (instruments.instrument_count !== 6 || instruments.instruments.length !== 6) throw new Error('instrument denominator drift');
  for (const row of instruments.instruments) {
    if (['HRDCI-03','HRDCI-04'].includes(row.lane_id) && row.binding_or_authoritative !== false) throw new Error(`${row.lane_id} soft partnership promoted`);
    if (row.system_revision_recovered !== false) throw new Error(`${row.lane_id} system revision promoted`);
  }

  const timing = load(root,`${DATA}/PREHARM-POSTHARM-MATRIX.json`); requireFalse(timing.authority,'timing');
  if (timing.state_count !== 9 || timing.case_count !== 6 || timing.cell_count !== 54 || timing.cells.length !== 54) throw new Error('timing denominator drift');
  const timingStatuses = new Set(['recovered','partial','blocked','not_applicable']);
  for (const c of timing.cells) if (!timingStatuses.has(c.status)) throw new Error('invalid timing status');
  if (timing.summary.preaction_pause_recovered !== 0 || timing.summary.system_revision_recovered !== 0 || timing.summary.survivor_bias_reconciliation_recovered !== 0) throw new Error('timing overpromotion');

  const actors = load(root,`${DATA}/ACTOR-POWER-MATRIX.json`); requireFalse(actors.authority,'actors');
  if (actors.actor_count !== 10 || actors.case_count !== 6 || actors.cell_count !== 60 || actors.cells.length !== 60) throw new Error('actor denominator drift');
  if (actors.summary.support_person_recovered_cells !== 0 || actors.summary.external_auditor_recovered_cells !== 0) throw new Error('actor overpromotion');

  const remedies = load(root,`${DATA}/REMEDY-AND-REVISION-LEDGER.json`); requireFalse(remedies.authority,'remedies');
  if (remedies.record_count !== 6 || remedies.records.length !== 6) throw new Error('remedy denominator drift');
  if (remedies.records.filter(r=>r.individual_restoration).length !== 1) throw new Error('individual restoration denominator drift');
  for (const r of remedies.records) if (r.system_revision || r.survivor_bias_reconciliation) throw new Error('remedy closure overpromotion');

  const chloe = load(root,`${DATA}/CHLOE-NON-AI-PREVENTION-BOUNDARY.json`); requireFalse(chloe.authority,'chloe');
  if (chloe.ai_use_established || chloe.algorithmic_monitoring_established || chloe.automated_decision_established || chloe.vendor_system_established) throw new Error('invented Chloe AI use');
  if (chloe.causal_equivalence_allowed || chloe.pre_harm_independent_counterpower_recovered) throw new Error('Chloe boundary drift');
  for (const sid of chloe.source_ids) if (!sourceIndex.has(sid)) throw new Error(`Chloe dangling source ${sid}`);

  return { wave, sources, lanes, depth, instruments, timing, actors, remedies, chloe };
}

const opt = args();
const ctx = validate(opt.root);
const summary = buildSummary(ctx);
const summaryPath = join(opt.root,`${DATA}/WAVE-05-SUMMARY.json`);
if (opt.mode === 'write') writeFileSync(summaryPath,stable(summary));
else if (readFileSync(summaryPath,'utf8') !== stable(summary)) throw new Error('stale Wave 05 summary');

const manifest = buildManifest(opt.root,ctx.wave.parent);
const manifestPath = join(opt.root,`${DATA}/MANIFEST.json`);
if (opt.mode === 'write') writeFileSync(manifestPath,stable(manifest));
else if (readFileSync(manifestPath,'utf8') !== stable(manifest)) throw new Error('stale Wave 05 manifest');

if (opt.strictRoot) {
  const observed = walk(opt.root).filter(p=>p !== `${DATA}/MANIFEST.json`).sort();
  const expected = candidatePaths();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`exact root denominator drift: ${JSON.stringify({missing:expected.filter(p=>!observed.includes(p)),extra:observed.filter(p=>!expected.includes(p))})}`);
}
console.log(`counterpower intervention check: passed (${ctx.sources.length} sources, ${ctx.lanes.length} lanes, 36 observations, 24 findings, 9 depth levels, 54 timing cells, 60 actor cells, 0 system revisions)`);
