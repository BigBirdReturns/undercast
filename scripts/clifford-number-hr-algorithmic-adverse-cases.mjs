#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPECTED_PARENT_HEAD = '418e9509228aaa6249081075ce377244eb97d39f';
const EXPECTED_PARENT_MANIFEST_SHA256 = '1316744624123ba1e878a9125de6028182b8e5ca599650ec9c2daffd5abbcd5f';
const EXPECTED_LANES = Array.from({ length: 6 }, (_, i) => `HRDAC-0${i + 1}`);
const EXPECTED_STATES = ['use_case_registered','data_sources_fixed','protected_activity_and_safety_rules_fixed','construct_model_features_threshold_fixed','alert_generated','context_attached','worker_notified','support_and_welfare_arranged','meaningful_human_review_assigned','interim_measures_imposed','decision_issued','evidence_and_explanation_returned','challenge_resolved','system_outcome_reconciled'];
const STATUS = new Set(['recovered','partial','blocked','not_applicable']);
const AUTHORITY_KEYS = [
'ai_caused_chloe_moffat_death_claims_allowed','canonical_product_effects_allowed','case_causation_beyond_public_record_allowed','control_adoption_allowed','dissonance_purge_universal_claims_allowed','employer_liability_findings_allowed','employer_specific_intent_findings_allowed','final_coroner_conclusion_claims_allowed','graph_effects_allowed','individual_culpability_findings_allowed','legal_conclusions_allowed','named_company_misuse_beyond_public_record_allowed','parent_wave_mutation_allowed','private_source_publication_allowed','protected_activity_classification_claims_allowed','publication_effects_allowed','universal_prevalence_findings_allowed','victim_character_inferences_allowed'];

function fail(message) { throw new Error(message); }
function readText(file) { return fs.readFileSync(file, 'utf8'); }
function readJson(file) { return JSON.parse(readText(file)); }
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function canonical(obj) { return `${JSON.stringify(obj, null, 2)}\n`; }
function sortedUnique(values, label) {
  const sorted = [...values].sort();
  if (new Set(sorted).size !== sorted.length) fail(`${label}: duplicate value`);
  return sorted;
}
function exactKeys(obj, keys, label) {
  const actual = Object.keys(obj).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}: key drift`);
}
function validateAuthority(obj, label) {
  exactKeys(obj, AUTHORITY_KEYS, label);
  for (const key of AUTHORITY_KEYS) if (obj[key] !== false) fail(`${label}: authority escalation ${key}`);
}
function parseArgs(argv) {
  let mode = null; let root = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write' || arg === '--check') {
      if (mode) fail('choose exactly one of --write or --check');
      mode = arg.slice(2);
    } else if (arg === '--root') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) fail('--root requires a value');
      root = path.resolve(argv[++i]);
    } else fail(`unknown argument: ${arg}`);
  }
  if (!mode) fail('choose exactly one of --write or --check');
  return { mode, root };
}
function fileList(root) {
  const w3 = 'data/review/clifford-number/hr-discipline/wave-03';
  return [
    `${w3}/ADVERSE-ACTION-CHAIN-MATRIX.json`, `${w3}/CASE-REGISTER.json`, `${w3}/CHLOE-NON-AI-BOUNDARY.json`, `${w3}/REMEDY-AND-ACCOUNTABILITY-LEDGER.json`, `${w3}/SOURCE-REGISTER.json`, `${w3}/WAVE-03-SUMMARY.json`,
    ...EXPECTED_LANES.map(id => `${w3}/lanes/${id}.json`),
    `${w3}/sources/SOURCES-01.json`, `${w3}/sources/SOURCES-02.json`, `${w3}/sources/SOURCES-03.json`, `${w3}/wave-03.json`,
    'docs/research/clifford-number/hr-discipline/WAVE-03.md', 'schema/clifford-number-hr-algorithmic-adverse-case.schema.json', 'scripts/clifford-number-hr-algorithmic-adverse-cases.mjs', 'test/clifford-number-hr-algorithmic-adverse-cases-fixtures.mjs'
  ];
}
function loadAndValidate(root) {
  const base = path.join(root, 'data/review/clifford-number/hr-discipline/wave-03');
  const parentManifest = path.join(root, 'data/review/clifford-number/hr-discipline/wave-02/MANIFEST.json');
  if (!fs.existsSync(parentManifest)) fail('parent manifest missing');
  if (sha256(fs.readFileSync(parentManifest)) !== EXPECTED_PARENT_MANIFEST_SHA256) fail('parent manifest drift');

  const wave = readJson(path.join(base, 'wave-03.json'));
  if (wave.wave_id !== 'CN-HRDAC-W03' || wave.parent.head !== EXPECTED_PARENT_HEAD || wave.parent.manifest_sha256 !== EXPECTED_PARENT_MANIFEST_SHA256 || wave.parent.mutation_allowed !== false) fail('wave parent or identity drift');
  validateAuthority(wave.authority, 'wave authority');
  if (wave.adopted_control_count !== 0 || wave.inherited_control_count !== 15) fail('control count drift');
  if (wave.central_mechanism.toLowerCase().includes('all employers intentionally')) fail('universal purge promotion');

  const sourceRegister = readJson(path.join(base, 'SOURCE-REGISTER.json'));
  if (sourceRegister.source_count !== 18 || sourceRegister.private_source_count !== 0) fail('source denominator drift');
  const sourceRows = [];
  for (const shard of sourceRegister.shards) sourceRows.push(...readJson(path.join(root, shard)).sources);
  if (sourceRows.length !== 18) fail('source shard denominator drift');
  const sourceIds = sortedUnique(sourceRows.map(s => s.id), 'source ids');
  if (JSON.stringify(sourceIds) !== JSON.stringify(sortedUnique(sourceRegister.source_ids, 'register source ids'))) fail('source register mismatch');
  for (const source of sourceRows) {
    if (!/^https:\/\//.test(source.url) || source.status !== 'independently_recovered_public_source') fail(`source boundary drift: ${source.id}`);
  }
  const map = [...sourceRows].sort((a,b) => a.id.localeCompare(b.id)).map(s => `${s.id}\t${s.url}\n`).join('');
  const mapHash = sha256(Buffer.from(map));
  if (mapHash !== sourceRegister.source_id_url_map_sha256 || mapHash !== wave.source_id_url_map_sha256) fail('source identity/URL map drift');
  const sourceSet = new Set(sourceIds);

  const laneDir = path.join(base, 'lanes');
  const laneFiles = fs.readdirSync(laneDir).filter(x => x.endsWith('.json')).sort();
  if (JSON.stringify(laneFiles) !== JSON.stringify(EXPECTED_LANES.map(x => `${x}.json`))) fail('lane file denominator drift');
  const lanes = EXPECTED_LANES.map(id => readJson(path.join(laneDir, `${id}.json`)));
  for (const [index, lane] of lanes.entries()) {
    const id = EXPECTED_LANES[index];
    if (lane.lane_id !== id || lane.object_type !== 'algorithmic_adverse_case_lane' || lane.schema_version !== 1) fail(`${id}: identity drift`);
    validateAuthority(lane.authority, `${id} authority`);
    if (lane.observations.length !== 6 || lane.findings.length !== 4 || lane.open_questions.length !== 6) fail(`${id}: denominator drift`);
    if (new Set(lane.open_questions).size !== 6) fail(`${id}: duplicate open question`);
    for (const [i, obs] of lane.observations.entries()) {
      if (obs.id !== `${id}-O0${i + 1}` || !obs.claim || obs.source_ids.length < 1 || obs.limits.length < 1) fail(`${id}: observation drift`);
      for (const sid of obs.source_ids) if (!sourceSet.has(sid)) fail(`${id}: dangling observation source ${sid}`);
    }
    for (const [i, finding] of lane.findings.entries()) {
      if (finding.id !== `${id}-F0${i + 1}` || !finding.claim || finding.source_ids.length < 1 || finding.limits.length < 1) fail(`${id}: finding drift`);
      for (const sid of finding.source_ids) if (!sourceSet.has(sid)) fail(`${id}: dangling finding source ${sid}`);
    }
  }

  const cases = readJson(path.join(base, 'CASE-REGISTER.json'));
  if (cases.case_count !== 6 || cases.cases.length !== 6 || JSON.stringify(cases.cases.map(c => c.case_id)) !== JSON.stringify(EXPECTED_LANES)) fail('case denominator drift');
  for (const c of cases.cases) for (const sid of c.source_ids) if (!sourceSet.has(sid)) fail(`case dangling source: ${c.case_id}/${sid}`);
  const france = cases.cases.find(c => c.case_id === 'HRDAC-01');
  if (france.initial_monetary_amount !== 32000000 || france.final_monetary_amount !== 15000000 || france.final_public_state_date !== '2025-12-23') fail('Amazon France final judicial state drift');
  const seattle = cases.cases.find(c => c.case_id === 'HRDAC-06');
  if (!seattle.event_dates.includes('2027-06-01') || !seattle.limits.some(x => x.includes('2027-05-31'))) fail('Seattle transition boundary drift');

  const chloe = readJson(path.join(base, 'CHLOE-NON-AI-BOUNDARY.json'));
  if (chloe.ai_use_established !== false || chloe.ai_causation_established !== false || chloe.prohibited_inferences.length < 5) fail('Chloe non-AI boundary drift');

  const matrix = readJson(path.join(base, 'ADVERSE-ACTION-CHAIN-MATRIX.json'));
  if (matrix.case_count !== 6 || matrix.state_count !== 14 || matrix.cell_count !== 84 || JSON.stringify(matrix.state_order) !== JSON.stringify(EXPECTED_STATES)) fail('chain matrix denominator drift');
  if (matrix.cases.length !== 6) fail('chain case denominator drift');
  const statusCounts = { recovered:0, partial:0, blocked:0, not_applicable:0 };
  for (const [i, c] of matrix.cases.entries()) {
    if (c.case_id !== EXPECTED_LANES[i] || c.cells.length !== 14) fail('chain case identity drift');
    for (const [j, cell] of c.cells.entries()) {
      if (cell.state !== EXPECTED_STATES[j] || !STATUS.has(cell.status)) fail(`${c.case_id}: chain state drift`);
      statusCounts[cell.status]++;
      if (cell.status === 'blocked' && cell.source_ids.length !== 0) fail(`${c.case_id}: blocked cell cannot cite evidence`);
      for (const sid of cell.source_ids) if (!sourceSet.has(sid)) fail(`${c.case_id}: dangling chain source ${sid}`);
    }
  }
  if (Object.values(statusCounts).reduce((a,b)=>a+b,0) !== 84) fail('chain status denominator drift');

  const remedy = readJson(path.join(base, 'REMEDY-AND-ACCOUNTABILITY-LEDGER.json'));
  if (remedy.record_count !== 11 || remedy.records.length !== 11) fail('remedy denominator drift');
  for (const r of remedy.records) for (const sid of r.source_ids) if (!sourceSet.has(sid)) fail(`remedy dangling source: ${r.id}/${sid}`);
  const finalFrance = remedy.records.find(r => r.id === 'R-02');
  if (finalFrance.amount !== 15000000 || finalFrance.date !== '2025-12-23') fail('final France remedy drift');
  if (remedy.records.filter(r => r.case_id === 'HRDAC-06').some(r => !r.status.includes('without_merits'))) fail('Seattle merits promotion');

  return { wave, sourceRows, lanes, cases, chloe, matrix, remedy, statusCounts };
}
function buildSummary(data) {
  const findingStatuses = {};
  for (const lane of data.lanes) for (const f of lane.findings) findingStatuses[f.status] = (findingStatuses[f.status] || 0) + 1;
  return {
    schema_version:1, wave_id:'CN-HRDAC-W03', as_of:'2026-08-01', generated_from:'validated named algorithmic adverse-action case, chain, remedy and source ledgers',
    parent:{ head:EXPECTED_PARENT_HEAD, manifest_sha256:EXPECTED_PARENT_MANIFEST_SHA256, mutation_count:0 },
    source_count:data.sourceRows.length, private_source_count:0, case_count:data.cases.cases.length, named_organization_count:new Set(data.cases.cases.flatMap(c => c.organizations)).size,
    lane_count:data.lanes.length, observation_count:data.lanes.reduce((n,l)=>n+l.observations.length,0), finding_count:data.lanes.reduce((n,l)=>n+l.findings.length,0), finding_statuses:findingStatuses,
    chain_state_count:EXPECTED_STATES.length, chain_cell_count:84, chain_statuses:data.statusCounts,
    remedy_record_count:data.remedy.records.length, inherited_control_count:15, adopted_control_count:0, chloe_ai_use_findings:0,
    source_id_url_map_sha256:data.wave.source_id_url_map_sha256,
    cases:data.cases.cases.map(c => ({ case_id:c.case_id, title:c.title, final_public_state:c.final_public_state, final_public_state_date:c.final_public_state_date })),
    lanes:data.lanes.map(l => ({ lane_id:l.lane_id, title:l.title, terminal_state:l.terminal_state, observation_count:l.observations.length, finding_count:l.findings.length, open_question_count:l.open_questions.length })),
    authority:data.wave.authority
  };
}
function buildManifest(root) {
  const rows = fileList(root).map(rel => {
    const buf = fs.readFileSync(path.join(root, rel));
    return { path:rel, bytes:buf.length, sha256:sha256(buf) };
  }).sort((a,b) => a.path.localeCompare(b.path));
  return { algorithm:'sha256', schema_version:1, wave_id:'CN-HRDAC-W03', parent_head:EXPECTED_PARENT_HEAD, parent_manifest_sha256:EXPECTED_PARENT_MANIFEST_SHA256, manifest_excludes_self:true, exact_file_count:rows.length, files:rows };
}

try {
  const { mode, root } = parseArgs(process.argv.slice(2));
  const data = loadAndValidate(root);
  const summaryPath = path.join(root, 'data/review/clifford-number/hr-discipline/wave-03/WAVE-03-SUMMARY.json');
  const manifestPath = path.join(root, 'data/review/clifford-number/hr-discipline/wave-03/MANIFEST.json');
  const summaryBytes = canonical(buildSummary(data));
  if (mode === 'write') fs.writeFileSync(summaryPath, summaryBytes);
  else if (!fs.existsSync(summaryPath) || readText(summaryPath) !== summaryBytes) fail('stale Wave 03 summary');
  const manifestBytes = canonical(buildManifest(root));
  if (mode === 'write') fs.writeFileSync(manifestPath, manifestBytes);
  else if (!fs.existsSync(manifestPath) || readText(manifestPath) !== manifestBytes) fail('stale Wave 03 manifest');
  console.log(`algorithmic adverse cases ${mode}: passed — 6 cases, 18 sources, 36 observations, 24 findings, 84 chain cells, 11 remedies`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
