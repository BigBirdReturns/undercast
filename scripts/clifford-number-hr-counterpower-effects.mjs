#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  waveId: 'CN-HRDCE-W06',
  parentBranch: 'agent/clifford-number-hr-counterpower-intervention-wave-05',
  parentHead: '05125b9684a9a0923a8996e662cc633c47c72fbd',
  parentManifest: '1ab48de710d482eaa8cbed78cf6ff7f0568acbcd463b79525e67f4a394a31e6b',
  parentWaveId: 'CN-HRDCI-W05',
  sourceCount: 24,
  laneIds: ['HRDCE-01','HRDCE-02','HRDCE-03','HRDCE-04','HRDCE-05','HRDCE-06'],
  sourceShards: [
    'data/review/clifford-number/hr-discipline/wave-06/sources/SOURCES-01.json',
    'data/review/clifford-number/hr-discipline/wave-06/sources/SOURCES-02.json',
    'data/review/clifford-number/hr-discipline/wave-06/sources/SOURCES-03.json',
  ],
  effectIds: [
    'evidence_and_logic_access',
    'processing_or_adverse_action_pause',
    'individual_restoration',
    'worker_compensation',
    'feature_or_use_retirement',
    'workflow_or_policy_revision',
    'model_threshold_or_data_revision',
    'followup_verification_and_collective_memory',
  ],
  remedyStages: [
    'signal_visible',
    'evidence_preserved',
    'counterpower_actor_authorised',
    'processing_or_action_paused',
    'reason_and_context_joined',
    'decision_corrected',
    'individual_restored',
    'worker_compensated',
    'system_revised',
    'implementation_and_population_reconciled',
  ],
  receiptStates: [
    'use_case_and_exertion_registered',
    'data_sources_and_recipients_fixed',
    'construct_model_threshold_and_version_fixed',
    'protected_safety_accommodation_context_fixed',
    'worker_and_collective_notice_issued',
    'alert_or_classification_generated',
    'counterpower_actor_assigned',
    'processing_or_adverse_action_held',
    'worker_evidence_and_explanation_returned',
    'decision_and_interim_harm_resolved',
    'individual_restoration_completed',
    'worker_compensation_completed',
    'feature_use_workflow_or_policy_revised',
    'model_threshold_or_data_revised',
    'implementation_independently_verified',
    'outcomes_and_survivor_bias_reconciled',
  ],
});

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(here, '..');

function die(message) {
  console.error(message);
  process.exit(1);
}
function parseArgs(argv) {
  const known = new Set(['--write','--check','--strict-root','--root']);
  let mode = null;
  let root = defaultRoot;
  let strictRoot = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!known.has(arg)) die(`unknown argument: ${arg}`);
    if (arg === '--write' || arg === '--check') {
      if (mode && mode !== arg) die('conflicting modes');
      mode = arg;
    } else if (arg === '--strict-root') {
      strictRoot = true;
    } else if (arg === '--root') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) die('--root requires a path');
      root = resolve(value);
      i += 1;
    }
  }
  return { mode: mode ?? '--check', root, strictRoot };
}
function pathAt(root, rel) { return join(root, rel); }
function readText(root, rel) {
  const p = pathAt(root, rel);
  if (!existsSync(p)) throw new Error(`missing required file: ${rel}`);
  return readFileSync(p, 'utf8');
}
function readJson(root, rel) {
  try { return JSON.parse(readText(root, rel)); }
  catch (error) { throw new Error(`invalid JSON ${rel}: ${error.message}`); }
}
function pretty(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256Bytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sha256Text(text) { return sha256Bytes(Buffer.from(text)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function sameArray(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} drift`);
}
function assertAuthorityFalse(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`);
  for (const [key, state] of Object.entries(value)) {
    assert(state === false, `${label}.${key} must remain false`);
  }
}
function listFiles(root) {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) out.push(relative(root, abs).split('\\').join('/'));
    }
  }
  walk(root);
  return out.sort();
}
function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a],[b]) => a.localeCompare(b)));
}

const lanePaths = EXPECTED.laneIds.map(id =>
  `data/review/clifford-number/hr-discipline/wave-06/lanes/${id}.json`);
const staticPaths = [
  'data/review/clifford-number/hr-discipline/wave-06/wave-06.json',
  'data/review/clifford-number/hr-discipline/wave-06/SOURCE-REGISTER.json',
  'data/review/clifford-number/hr-discipline/wave-06/CASE-REGISTER.json',
  'data/review/clifford-number/hr-discipline/wave-06/COUNTERPOWER-EFFECT-MATRIX.json',
  'data/review/clifford-number/hr-discipline/wave-06/REMEDY-LADDER.json',
  'data/review/clifford-number/hr-discipline/wave-06/SYSTEM-CHANGE-RECEIPT.json',
  'data/review/clifford-number/hr-discipline/wave-06/CHLOE-NON-AI-EFFECTS-BOUNDARY.json',
  ...lanePaths,
  ...EXPECTED.sourceShards,
  'docs/research/clifford-number/hr-discipline/WAVE-06.md',
  'schema/clifford-number-hr-counterpower-effects-lane.schema.json',
  'scripts/clifford-number-hr-counterpower-effects.mjs',
  'test/clifford-number-hr-counterpower-effects-fixtures.mjs',
];
const summaryPath = 'data/review/clifford-number/hr-discipline/wave-06/WAVE-06-SUMMARY.json';
const manifestPath = 'data/review/clifford-number/hr-discipline/wave-06/MANIFEST.json';
const manifestBoundPaths = [...staticPaths, summaryPath].sort();
const packetPaths = [...manifestBoundPaths, manifestPath].sort();

function loadAndValidate(root) {
  const wave = readJson(root, staticPaths[0]);
  assert(wave.wave_id === EXPECTED.waveId, 'wave id drift');
  assert(wave.parent?.branch === EXPECTED.parentBranch, 'parent branch drift');
  assert(wave.parent?.head === EXPECTED.parentHead, 'parent head drift');
  assert(wave.parent?.manifest_sha256 === EXPECTED.parentManifest, 'parent manifest drift');
  assert(wave.parent?.wave_id === EXPECTED.parentWaveId, 'parent wave id drift');
  assert(wave.parent?.mutation_count === 0, 'parent mutation must remain zero');
  assert(wave.source_count === 24 && wave.private_source_count === 0, 'wave source denominator drift');
  assert(wave.lane_count === 6 && wave.observation_count === 36 && wave.finding_count === 24, 'wave lane denominator drift');
  assert(wave.effect_type_count === 8 && wave.effect_cell_count === 48, 'wave effect denominator drift');
  assert(wave.remedy_stage_count === 10 && wave.system_change_state_count === 16, 'wave remedy denominator drift');
  assert(wave.proposed_control_count === 16 && wave.adopted_control_count === 0, 'wave control denominator drift');
  assert(wave.chloe_ai_use_findings === 0, 'invented Chloe AI finding');
  assertAuthorityFalse(wave.authority, 'wave.authority');

  const sourceRegister = readJson(root, staticPaths[1]);
  assert(sourceRegister.wave_id === EXPECTED.waveId, 'source register wave drift');
  assert(sourceRegister.source_count === 24 && sourceRegister.private_source_count === 0, 'source register denominator drift');
  assert(sourceRegister.remote_raw_bytes_committed === false, 'raw remote bytes may not be committed');
  sameArray(sourceRegister.source_shards, EXPECTED.sourceShards, 'source shards');

  const allSources = EXPECTED.sourceShards.flatMap(path => {
    const shard = readJson(root, path);
    assert(shard.wave_id === EXPECTED.waveId, `${path} wave drift`);
    assert(Array.isArray(shard.sources) && shard.sources.length === 8, `${path} must contain 8 sources`);
    return shard.sources;
  });
  assert(allSources.length === 24, 'source total drift');
  const sourceIds = allSources.map(source => source.id);
  const sourceUrls = allSources.map(source => source.url);
  assert(new Set(sourceIds).size === 24, 'duplicate source id');
  assert(new Set(sourceUrls).size === 24, 'duplicate source URL');
  for (const source of allSources) {
    assert(source.status === 'independently_recovered_public_source', `weak source status ${source.id}`);
    assert(typeof source.publisher === 'string' && source.publisher.length > 2, `missing publisher ${source.id}`);
    assert(typeof source.url === 'string' && source.url.startsWith('https://'), `invalid source URL ${source.id}`);
    assert(Array.isArray(source.supports) && source.supports.length > 0, `missing source supports ${source.id}`);
    assert(Array.isArray(source.limits) && source.limits.length > 0, `missing source limits ${source.id}`);
  }
  const sourceMap = [...allSources]
    .sort((a,b) => a.id.localeCompare(b.id))
    .map(source => `${source.id}\t${source.url}`)
    .join('\n') + '\n';
  assert(sha256Text(sourceMap) === sourceRegister.source_id_url_map_sha256, 'source identity map drift');
  const sourceIdSet = new Set(sourceIds);

  const lanes = lanePaths.map(path => readJson(root, path));
  sameArray(lanes.map(lane => lane.lane_id), EXPECTED.laneIds, 'lane ids');
  const findingStatuses = [];
  for (const lane of lanes) {
    assert(lane.wave_id === EXPECTED.waveId, `${lane.lane_id} wave drift`);
    assert(Array.isArray(lane.named_objects) && lane.named_objects.length >= 2, `${lane.lane_id} named objects missing`);
    assert(Array.isArray(lane.source_ids) && lane.source_ids.length >= 3, `${lane.lane_id} source denominator`);
    for (const id of lane.source_ids) assert(sourceIdSet.has(id), `${lane.lane_id} dangling lane source ${id}`);
    assert(Array.isArray(lane.observations) && lane.observations.length === 6, `${lane.lane_id} observation denominator`);
    assert(Array.isArray(lane.findings) && lane.findings.length === 4, `${lane.lane_id} finding denominator`);
    assert(lane.terminal_receipt?.open_questions?.length === 8, `${lane.lane_id} open-question denominator`);
    assert(Array.isArray(lane.terminal_receipt.closed_questions) && lane.terminal_receipt.closed_questions.length === 0, `${lane.lane_id} closed questions not allowed`);
    for (const observation of lane.observations) {
      assert(typeof observation.statement === 'string' && observation.statement.length >= 20, `${lane.lane_id} weak observation`);
      for (const id of observation.source_ids) assert(sourceIdSet.has(id), `${lane.lane_id} dangling observation source ${id}`);
    }
    for (const finding of lane.findings) {
      assert(['independently_supported_scoped','effect_recovered_scoped','bounded_synthesis'].includes(finding.status), `${lane.lane_id} invalid finding status`);
      findingStatuses.push(finding.status);
      for (const id of finding.source_ids) assert(sourceIdSet.has(id), `${lane.lane_id} dangling finding source ${id}`);
      assert(Array.isArray(finding.limits) && finding.limits.length > 0, `${lane.lane_id} missing finding limits`);
    }
    assertAuthorityFalse(lane.authority, `${lane.lane_id}.authority`);
  }
  assert(JSON.stringify(countBy(lanes.flatMap(l => l.observations), () => 'observations')) === JSON.stringify({observations:36}), 'observation total drift');
  assert(JSON.stringify(countBy(lanes.flatMap(l => l.findings), () => 'findings')) === JSON.stringify({findings:24}), 'finding total drift');
  assert(JSON.stringify(countBy(findingStatuses, value => value)) === JSON.stringify({
    bounded_synthesis:6,
    effect_recovered_scoped:6,
    independently_supported_scoped:12,
  }), 'finding-status denominator drift');

  const caseRegister = readJson(root, staticPaths[2]);
  assert(caseRegister.wave_id === EXPECTED.waveId && caseRegister.case_count === 6, 'case register denominator drift');
  sameArray(caseRegister.cases.map(item => item.case_id), EXPECTED.laneIds, 'case ids');
  const amazon = caseRegister.cases.find(item => item.case_id === 'HRDCE-01');
  assert(amazon.ai_use_established === false, 'invented Amazon Italy AI use');
  const uber = caseRegister.cases.find(item => item.case_id === 'HRDCE-04');
  assert(uber.named_objects.includes('App Drivers & Couriers Union'), 'collective counterpower removed from Uber/Ola case');

  const matrix = readJson(root, staticPaths[3]);
  assert(matrix.wave_id === EXPECTED.waveId, 'effect matrix wave drift');
  assert(matrix.case_count === 6 && matrix.effect_type_count === 8 && matrix.cell_count === 48, 'effect matrix denominator drift');
  sameArray(matrix.effect_types.map(item => item.id), EXPECTED.effectIds, 'effect type ids');
  assert(Array.isArray(matrix.cells) && matrix.cells.length === 48, 'effect cell count drift');
  const expectedPairs = new Set(EXPECTED.laneIds.flatMap(caseId => EXPECTED.effectIds.map(effectId => `${caseId}|${effectId}`)));
  const observedPairs = new Set();
  const allowedStatuses = new Set(['recovered','partial','blocked','not_applicable']);
  for (const cell of matrix.cells) {
    const pair = `${cell.case_id}|${cell.effect_id}`;
    assert(expectedPairs.has(pair), `unexpected effect cell ${pair}`);
    assert(!observedPairs.has(pair), `duplicate effect cell ${pair}`);
    observedPairs.add(pair);
    assert(allowedStatuses.has(cell.status), `invalid effect status ${pair}`);
    assert(Array.isArray(cell.limits) && cell.limits.length > 0, `missing effect limits ${pair}`);
    for (const id of cell.source_ids) assert(sourceIdSet.has(id), `dangling effect source ${id}`);
    if (cell.status === 'blocked') assert(cell.source_ids.length === 0, `blocked effect has sources ${pair}`);
  }
  assert(observedPairs.size === 48, 'effect matrix pair denominator drift');
  const effectStatusCounts = countBy(matrix.cells, cell => cell.status);
  assert(JSON.stringify(effectStatusCounts) === JSON.stringify({
    blocked:13,
    not_applicable:7,
    partial:16,
    recovered:12,
  }), 'effect status counts drift');
  assert(JSON.stringify(matrix.status_counts) === JSON.stringify(effectStatusCounts), 'declared effect status counts drift');
  const cell = (caseId, effectId) => matrix.cells.find(item => item.case_id === caseId && item.effect_id === effectId);
  assert(cell('HRDCE-01','processing_or_adverse_action_pause').status === 'recovered', 'Amazon processing stop removed');
  assert(cell('HRDCE-01','feature_or_use_retirement').status === 'recovered', 'Amazon use retirement removed');
  assert(cell('HRDCE-02','feature_or_use_retirement').status === 'recovered', 'Serco biometric retirement removed');
  assert(cell('HRDCE-03','feature_or_use_retirement').status === 'recovered', 'Microsoft feature retirement removed');
  assert(cell('HRDCE-03','followup_verification_and_collective_memory').status === 'partial', 'Microsoft independent verification fabricated');
  assert(cell('HRDCE-04','evidence_and_logic_access').status === 'recovered', 'Uber/Ola explanation effect removed');
  assert(cell('HRDCE-05','individual_restoration').status === 'recovered', 'Seattle restoration removed');
  assert(cell('HRDCE-05','worker_compensation').status === 'recovered', 'Seattle worker payment removed');
  assert(cell('HRDCE-06','individual_restoration').status === 'blocked', 'Italy rider restoration fabricated');
  assert(cell('HRDCE-06','worker_compensation').status === 'blocked', 'regulator fine promoted to worker compensation');
  assert(!matrix.cells.some(item => item.effect_id === 'model_threshold_or_data_revision' && item.status === 'recovered'), 'unsupported model revision promoted');
  assertAuthorityFalse(matrix.authority, 'effect matrix authority');

  const ladder = readJson(root, staticPaths[4]);
  assert(ladder.wave_id === EXPECTED.waveId && ladder.stage_count === 10, 'remedy ladder denominator drift');
  sameArray(ladder.stages.map(stage => stage.id), EXPECTED.remedyStages, 'remedy stages');
  assert(ladder.non_equivalences.includes('regulator_fine_is_not_worker_compensation'), 'fine/worker-compensation distinction removed');
  assert(ladder.non_equivalences.includes('restoration_is_not_system_revision'), 'restoration/system-revision distinction removed');
  assertAuthorityFalse(ladder.authority, 'remedy ladder authority');

  const receipt = readJson(root, staticPaths[5]);
  assert(receipt.wave_id === EXPECTED.waveId && receipt.adopted === false, 'receipt adoption drift');
  assert(receipt.state_count === 16 && receipt.states.length === 16, 'receipt state denominator drift');
  sameArray(receipt.states.map(state => state.id), EXPECTED.receiptStates, 'receipt states');
  assert(receipt.control_count === 16 && receipt.controls.length === 16 && receipt.adopted_control_count === 0, 'receipt control denominator drift');
  assert(receipt.controls.every(control => control.adopted === false), 'control adoption');
  const cp = receipt.counterpower_definition;
  assert(cp.information_only_sufficient === false && cp.human_presence_sufficient === false, 'token counterpower accepted');
  for (const key of ['authority_to_inspect','authority_to_delay','authority_to_pause','authority_to_override','authority_to_reverse','authority_to_restore','authority_to_force_revision_or_record_refusal']) {
    assert(cp[key] === true, `counterpower authority removed: ${key}`);
  }
  assert(receipt.hard_stops.includes('acute_safety_or_distress_handoff_required'), 'acute distress hard stop removed');
  assert(receipt.hard_stops.includes('implementation_claim_without_verification'), 'verification hard stop removed');
  assertAuthorityFalse(receipt.authority, 'system receipt authority');

  const chloe = readJson(root, staticPaths[6]);
  assert(chloe.wave_id === EXPECTED.waveId && chloe.named_non_ai_baseline === true, 'Chloe boundary missing');
  for (const key of ['ai_use_established','algorithmic_monitoring_established','automated_decision_established','vendor_system_established']) {
    assert(chloe[key] === false, `invented Chloe system use: ${key}`);
  }
  assert(chloe.ai_use_finding_count === 0, 'invented Chloe AI finding count');
  assert(chloe.prohibited_inferences.some(item => item.includes('weak')), 'victim-character refusal removed');
  assert(chloe.prohibited_inferences.some(item => item.includes('final coroner')), 'final-coroner refusal removed');
  assertAuthorityFalse(chloe.authority, 'Chloe authority');

  return { wave, sourceRegister, allSources, lanes, caseRegister, matrix, ladder, receipt, chloe, findingStatuses, effectStatusCounts };
}

function buildSummary(corpus) {
  const laneSummaries = corpus.lanes.map(lane => ({
    lane_id: lane.lane_id,
    title: lane.title,
    terminal_state: lane.terminal_receipt.state,
    observation_count: lane.observations.length,
    finding_count: lane.findings.length,
    open_question_count: lane.terminal_receipt.open_questions.length,
  }));
  const recoveredByEffect = Object.fromEntries(EXPECTED.effectIds.map(effectId => [
    effectId,
    corpus.matrix.cells.filter(cell => cell.effect_id === effectId && cell.status === 'recovered').length,
  ]));
  return {
    schema_version: 1,
    wave_id: EXPECTED.waveId,
    as_of: corpus.wave.as_of,
    generated_from: 'validated named-case, source, effect, remedy, system-change, and boundary ledgers',
    parent: {
      branch: EXPECTED.parentBranch,
      head: EXPECTED.parentHead,
      manifest_sha256: EXPECTED.parentManifest,
      wave_id: EXPECTED.parentWaveId,
      mutation_count: 0,
    },
    source_count: corpus.allSources.length,
    private_source_count: 0,
    lane_count: corpus.lanes.length,
    observation_count: corpus.lanes.reduce((n,lane) => n + lane.observations.length, 0),
    finding_count: corpus.lanes.reduce((n,lane) => n + lane.findings.length, 0),
    finding_statuses: countBy(corpus.lanes.flatMap(lane => lane.findings), finding => finding.status),
    effect_type_count: corpus.matrix.effect_types.length,
    effect_cell_count: corpus.matrix.cells.length,
    effect_statuses: corpus.effectStatusCounts,
    recovered_effects_by_type: recoveredByEffect,
    remedy_stage_count: corpus.ladder.stages.length,
    system_change_state_count: corpus.receipt.states.length,
    proposed_control_count: corpus.receipt.controls.length,
    adopted_control_count: 0,
    chloe_ai_use_findings: 0,
    lanes: laneSummaries,
    authority: corpus.wave.authority,
  };
}

function buildManifest(root) {
  const files = manifestBoundPaths.map(rel => {
    const bytes = readFileSync(pathAt(root, rel));
    return { path: rel, bytes: bytes.length, sha256: sha256Bytes(bytes) };
  });
  return {
    schema_version: 1,
    wave_id: EXPECTED.waveId,
    parent: {
      branch: EXPECTED.parentBranch,
      head: EXPECTED.parentHead,
      manifest_sha256: EXPECTED.parentManifest,
      wave_id: EXPECTED.parentWaveId,
      mutation_count: 0,
    },
    file_count: files.length,
    files,
  };
}

function run() {
  const { mode, root, strictRoot } = parseArgs(process.argv.slice(2));
  let corpus = loadAndValidate(root);
  const summary = buildSummary(corpus);
  if (mode === '--write') {
    writeFileSync(pathAt(root, summaryPath), pretty(summary));
    const manifest = buildManifest(root);
    writeFileSync(pathAt(root, manifestPath), pretty(manifest));
    corpus = loadAndValidate(root);
  }
  const observedSummary = readText(root, summaryPath);
  assert(observedSummary === pretty(buildSummary(corpus)), 'stale generated summary');
  const expectedManifest = buildManifest(root);
  const observedManifest = readText(root, manifestPath);
  assert(observedManifest === pretty(expectedManifest), 'stale generated manifest');
  if (strictRoot) {
    const observedPaths = listFiles(root);
    assert(JSON.stringify(observedPaths) === JSON.stringify(packetPaths), JSON.stringify({
      error:'exact file denominator drift',
      missing:packetPaths.filter(path => !observedPaths.includes(path)),
      extra:observedPaths.filter(path => !packetPaths.includes(path)),
    }));
  }
  console.log(
    `counterpower effects check: passed (` +
    `${corpus.allSources.length} sources, ${corpus.lanes.length} lanes, ` +
    `36 observations, 24 findings, 8 effect types, 48 effect cells, ` +
    `10 remedy stages, 16 system-change states, 16 unadopted controls)`
  );
}

try { run(); }
catch (error) { die(error?.stack ?? String(error)); }
