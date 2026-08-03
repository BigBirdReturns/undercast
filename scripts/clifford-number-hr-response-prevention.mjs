#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  waveId: 'CN-HRRP-W09',
  parentHead: '75fd0a46d8201aae092df39cc6eabdbb48226cd7',
  parentManifest: 'd7c04ddc712ee6e73d6932701af851f5b75b1b413676e2416ce3a5505b16ac9f',
  parentWaveId: 'CN-HRDS-W08',
  laneIds: ['HRRP-01','HRRP-02','HRRP-03','HRRP-04','HRRP-05','HRRP-06'],
  sourceCount: 24,
  sourceShards: [
    'data/review/clifford-number/hr-discipline/wave-09/sources/SOURCES-01.json',
    'data/review/clifford-number/hr-discipline/wave-09/sources/SOURCES-02.json',
    'data/review/clifford-number/hr-discipline/wave-09/sources/SOURCES-03.json',
  ],
  responseStates: [
    'finding_or_recommendation_published',
    'recipient_or_duty_holder_named',
    'response_or_action_plan_publicly_recoverable',
    'implementation_owner_named',
    'timetable_or_reopen_trigger_fixed',
    'live_process_change_specified',
    'training_or_policy_deployed',
    'worker_or_record_repair_specified',
    'independent_implementation_verification',
    'recurrence_or_drift_review',
    'affected_population_outcomes_included',
    'closure_claim_bounded',
  ],
  responseStatusCounts: {
    blocked: 21,
    not_applicable: 0,
    partial: 29,
    recovered_absent: 0,
    recovered_present: 22,
  },
  receiptStates: [
    'finding_or_recommendation_fixed',
    'recipient_and_duty_fixed',
    'response_receipt_and_publication_state_fixed',
    'implementation_owner_named',
    'deadline_and_reopen_trigger_fixed',
    'prechange_baseline_preserved',
    'live_process_change_specified',
    'training_or_policy_deployed',
    'worker_and_record_repair_completed',
    'independent_implementation_verification_completed',
    'challenge_and_collective_access_operational',
    'recurrence_and_drift_review_completed',
    'excluded_exited_silent_and_restored_outcomes_included',
    'residual_harm_and_failure_modes_published',
    'closure_claim_independently_reviewed',
    'future_control_and_validation_target_revised',
  ],
});

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(here, '..');

function die(message) {
  console.error(message);
  process.exit(1);
}
function parseArgs(argv) {
  const known = new Set(['--write', '--check', '--strict-root', '--root']);
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
function readBytes(root, rel) {
  const p = pathAt(root, rel);
  if (!existsSync(p)) throw new Error(`missing required file: ${rel}`);
  return readFileSync(p);
}
function readText(root, rel) { return readBytes(root, rel).toString('utf8'); }
function readJson(root, rel) {
  try { return JSON.parse(readText(root, rel)); }
  catch (error) { throw new Error(`invalid JSON ${rel}: ${error.message}`); }
}
function pretty(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256Bytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function sha256Text(text) { return sha256Bytes(Buffer.from(text)); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function assertAuthorityFalse(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} missing`);
  for (const [key, state] of Object.entries(value)) {
    assert(state === false, `${label}.${key} must remain false`);
  }
}
function sameArray(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} drift`);
}
function sameObject(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} drift`);
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
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

const lanePaths = EXPECTED.laneIds.map(
  id => `data/review/clifford-number/hr-discipline/wave-09/lanes/${id}.json`,
);
const staticPaths = [
  'data/review/clifford-number/hr-discipline/wave-09/wave-09.json',
  'data/review/clifford-number/hr-discipline/wave-09/SOURCE-REGISTER.json',
  'data/review/clifford-number/hr-discipline/wave-09/CASE-RESPONSE-REGISTER.json',
  'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-CUSTODY-LEDGER.json',
  'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-TO-PREVENTION-MATRIX.json',
  'data/review/clifford-number/hr-discipline/wave-09/PREVENTION-IMPLEMENTATION-RECEIPT.json',
  'data/review/clifford-number/hr-discipline/wave-09/CHLOE-NON-AI-PREVENTION-BOUNDARY.json',
  ...lanePaths,
  ...EXPECTED.sourceShards,
  'docs/research/clifford-number/hr-discipline/WAVE-09.md',
  'schema/clifford-number-hr-response-prevention-lane.schema.json',
  'scripts/clifford-number-hr-response-prevention.mjs',
  'test/clifford-number-hr-response-prevention-fixtures.mjs',
];
const summaryPath = 'data/review/clifford-number/hr-discipline/wave-09/WAVE-09-SUMMARY.json';
const manifestPath = 'data/review/clifford-number/hr-discipline/wave-09/MANIFEST.json';
const manifestBoundPaths = [...staticPaths, summaryPath].sort();
const packetPaths = [...manifestBoundPaths, manifestPath].sort();

function loadAndValidate(root) {
  const wave = readJson(root, staticPaths[0]);
  assert(wave.wave_id === EXPECTED.waveId, 'wave id drift');
  assert(wave.parent?.branch === 'main', 'parent branch drift');
  assert(wave.parent?.head === EXPECTED.parentHead, 'parent head drift');
  assert(wave.parent?.manifest_sha256 === EXPECTED.parentManifest, 'parent manifest drift');
  assert(wave.parent?.wave_id === EXPECTED.parentWaveId, 'parent wave id drift');
  assert(wave.parent?.mutation_count === 0, 'parent mutation must remain zero');
  assert(wave.counts?.public_sources === 24 && wave.counts?.private_sources === 0, 'wave source denominator drift');
  assert(wave.counts?.lanes === 6 && wave.counts?.observations === 36 && wave.counts?.findings === 24, 'wave lane denominator drift');
  assert(wave.counts?.response_states === 12 && wave.counts?.response_cells === 72, 'wave response denominator drift');
  assert(wave.counts?.proposed_controls === 16 && wave.counts?.adopted_controls === 0, 'wave control denominator drift');
  assert(wave.counts?.chloe_ai_use_findings === 0, 'invented Chloe AI finding');
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
  assert(allSources.length === EXPECTED.sourceCount, 'source total drift');
  const sourceIds = allSources.map(source => source.id);
  const sourceUrls = allSources.map(source => source.url);
  assert(new Set(sourceIds).size === EXPECTED.sourceCount, 'duplicate source id');
  assert(new Set(sourceUrls).size === EXPECTED.sourceCount, 'duplicate source URL');
  for (const source of allSources) {
    assert(source.status === 'independently_recovered_public_source', `weak source status ${source.id}`);
    assert(typeof source.publisher === 'string' && source.publisher.length > 2, `missing publisher ${source.id}`);
    assert(typeof source.url === 'string' && source.url.startsWith('https://'), `invalid source URL ${source.id}`);
    assert(Array.isArray(source.supports) && source.supports.length > 0, `missing source supports ${source.id}`);
    assert(Array.isArray(source.limits) && source.limits.length > 0, `missing source limits ${source.id}`);
  }
  const sourceMap = [...allSources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(source => `${source.id}\t${source.url}`)
    .join('\n') + '\n';
  assert(sha256Text(sourceMap) === sourceRegister.source_id_url_map_sha256, 'source identity map drift');
  const sourceIdSet = new Set(sourceIds);

  const caseRegister = readJson(root, staticPaths[2]);
  assert(caseRegister.wave_id === EXPECTED.waveId, 'case register wave drift');
  assert(caseRegister.case_count === 6 && caseRegister.cases.length === 6, 'case register denominator drift');
  sameArray(caseRegister.cases.map(row => row.lane_id), EXPECTED.laneIds, 'case register lane order');
  assert(caseRegister.cases.every(row => row.closed === false), 'case may not be silently closed');
  assertAuthorityFalse(caseRegister.authority, 'caseRegister.authority');

  const custody = readJson(root, staticPaths[3]);
  assert(custody.wave_id === EXPECTED.waveId && custody.row_count === 6 && custody.rows.length === 6, 'response custody denominator drift');
  sameArray(custody.rows.map(row => row.lane_id), EXPECTED.laneIds, 'response custody lanes');
  assert(custody.rules.includes('not_listed_as_confirmed_nonresponse_does_not_prove_response_publication'), 'non-response boundary missing');
  assert(custody.rules.includes('training_and_policy_claims_require_live_process_and_outcome_evidence'), 'training boundary missing');
  assertAuthorityFalse(custody.authority, 'custody.authority');

  const lanes = lanePaths.map(path => readJson(root, path));
  sameArray(lanes.map(lane => lane.lane_id), EXPECTED.laneIds, 'lane ids');
  const findingStatuses = new Set(['independently_supported_scoped', 'bounded_synthesis', 'remains_blocked', 'boundary']);
  let observationCount = 0;
  let findingCount = 0;
  for (const lane of lanes) {
    assert(lane.wave_id === EXPECTED.waveId, `${lane.lane_id} wave drift`);
    assert(Array.isArray(lane.source_ids) && lane.source_ids.length >= 3, `${lane.lane_id} source denominator`);
    for (const id of lane.source_ids) assert(sourceIdSet.has(id), `${lane.lane_id} dangling lane source ${id}`);
    assert(Array.isArray(lane.observations) && lane.observations.length === 6, `${lane.lane_id} observation denominator`);
    assert(Array.isArray(lane.findings) && lane.findings.length === 4, `${lane.lane_id} finding denominator`);
    assert(lane.terminal_receipt?.open_questions?.length === 8, `${lane.lane_id} open-question denominator`);
    assert(Array.isArray(lane.terminal_receipt.closed_questions) && lane.terminal_receipt.closed_questions.length === 0, `${lane.lane_id} closed questions not allowed`);
    for (const observation of lane.observations) {
      assert(typeof observation.statement === 'string' && observation.statement.length >= 20, `${lane.lane_id} weak observation`);
      for (const id of observation.source_ids) assert(sourceIdSet.has(id), `${lane.lane_id} dangling observation source ${id}`);
      observationCount += 1;
    }
    for (const finding of lane.findings) {
      assert(findingStatuses.has(finding.status), `${lane.lane_id} unknown finding status`);
      assert(typeof finding.claim === 'string' && finding.claim.length >= 20, `${lane.lane_id} weak finding`);
      for (const id of finding.source_ids) assert(sourceIdSet.has(id), `${lane.lane_id} dangling finding source ${id}`);
      findingCount += 1;
    }
    assertAuthorityFalse(lane.authority, `${lane.lane_id}.authority`);
  }
  assert(observationCount === 36 && findingCount === 24, 'aggregate lane denominator drift');

  const matrix = readJson(root, staticPaths[4]);
  assert(matrix.wave_id === EXPECTED.waveId && matrix.case_count === 6, 'matrix wave/case drift');
  sameArray(matrix.state_ids, EXPECTED.responseStates, 'matrix state ids');
  assert(matrix.cell_count === 72 && matrix.cells.length === 72, 'matrix cell denominator drift');
  const allowedStatuses = new Set(['recovered_present', 'recovered_absent', 'partial', 'blocked', 'not_applicable']);
  for (const cell of matrix.cells) {
    assert(EXPECTED.laneIds.includes(cell.lane_id), `unknown matrix lane ${cell.lane_id}`);
    assert(EXPECTED.responseStates.includes(cell.state_id), `unknown matrix state ${cell.state_id}`);
    assert(allowedStatuses.has(cell.status), `unknown matrix status ${cell.status}`);
    if (cell.status === 'blocked') assert(cell.source_ids.length === 0, 'blocked cell must not cite proof');
    else for (const id of cell.source_ids) assert(sourceIdSet.has(id), `matrix dangling source ${id}`);
    assert(Array.isArray(cell.limits) && cell.limits.length > 0, 'matrix cell lacks limits');
  }
  const computedStatusCounts = countBy(matrix.cells, cell => cell.status);
  for (const status of allowedStatuses) if (!(status in computedStatusCounts)) computedStatusCounts[status] = 0;
  const normalizedCounts = Object.fromEntries(Object.entries(computedStatusCounts).sort(([a], [b]) => a.localeCompare(b)));
  sameObject(normalizedCounts, EXPECTED.responseStatusCounts, 'matrix status counts');
  sameObject(matrix.status_counts, EXPECTED.responseStatusCounts, 'stored matrix status counts');

  const protocol = readJson(root, staticPaths[5]);
  assert(protocol.wave_id === EXPECTED.waveId, 'protocol wave drift');
  sameArray(protocol.states.map(row => row.state_id), EXPECTED.receiptStates, 'protocol states');
  assert(protocol.controls.length === 16, 'protocol control denominator');
  assert(protocol.controls.every(control => control.adopted === false), 'control adoption forbidden');
  assert(protocol.hard_stops.length === 6, 'protocol hard-stop denominator');
  assertAuthorityFalse(protocol.authority, 'protocol.authority');

  const chloe = readJson(root, staticPaths[6]);
  assert(chloe.wave_id === EXPECTED.waveId, 'Chloe boundary wave drift');
  assert(chloe.named_non_ai_baseline === true, 'Chloe must remain named non-AI baseline');
  assert(chloe.ai_use_established === false && chloe.ai_use_finding_count === 0, 'invented Chloe AI finding');
  assert(chloe.prohibited_inferences.some(item => item.includes('weak')), 'victim weakness refusal missing');
  assert(chloe.prohibited_inferences.some(item => item.includes('Reported training')), 'reported-response promotion refusal missing');
  assertAuthorityFalse(chloe.authority, 'chloe.authority');

  return { wave, sourceRegister, lanes, matrix, protocol };
}

function buildSummary(validated) {
  return {
    adopted_control_count: 0,
    as_of: '2026-08-02',
    authority: validated.wave.authority,
    case_terminal_receipts: Object.fromEntries(
      validated.lanes.map(lane => [lane.lane_id, lane.terminal_receipt.state]),
    ),
    central_rule: validated.wave.central_rule,
    chloe_ai_use_findings: 0,
    finding_count: 24,
    interpretive_law: validated.wave.interpretive_law,
    lane_count: 6,
    object_type: 'clifford_number_hr_response_prevention_wave',
    observation_count: 36,
    parent: validated.wave.parent,
    private_source_count: 0,
    proposed_control_count: 16,
    purpose: validated.wave.purpose,
    response_cell_count: 72,
    response_state_count: 12,
    response_status_counts: EXPECTED.responseStatusCounts,
    source_count: 24,
    source_id_url_map_sha256: validated.sourceRegister.source_id_url_map_sha256,
    title: validated.wave.title,
    wave_id: EXPECTED.waveId,
  };
}

function buildManifest(root) {
  const files = manifestBoundPaths.map(path => {
    const bytes = readBytes(root, path);
    return { path, bytes: bytes.length, sha256: sha256Bytes(bytes) };
  });
  return {
    file_count: files.length,
    files,
    parent: {
      branch: 'main',
      head: EXPECTED.parentHead,
      mutation_count: 0,
      parent_manifest_sha256: EXPECTED.parentManifest,
      parent_wave_id: EXPECTED.parentWaveId,
    },
    schema_version: 1,
    wave_id: EXPECTED.waveId,
  };
}

function writeGenerated(root, summary, manifest) {
  mkdirSync(dirname(pathAt(root, summaryPath)), { recursive: true });
  writeFileSync(pathAt(root, summaryPath), pretty(summary));
  writeFileSync(pathAt(root, manifestPath), pretty(manifest));
}
function checkGenerated(root, summary, manifest) {
  assert(readText(root, summaryPath) === pretty(summary), 'stale Wave 09 summary bytes');
  assert(readText(root, manifestPath) === pretty(manifest), 'stale Wave 09 manifest bytes');
}
function assertStrictRoot(root) {
  sameArray(listFiles(root), packetPaths, 'strict root file set');
}

try {
  const args = parseArgs(process.argv.slice(2));
  const validated = loadAndValidate(args.root);
  const summary = buildSummary(validated);
  if (args.mode === '--write') {
    mkdirSync(dirname(pathAt(args.root, summaryPath)), { recursive: true });
    writeFileSync(pathAt(args.root, summaryPath), pretty(summary));
    const manifest = buildManifest(args.root);
    writeFileSync(pathAt(args.root, manifestPath), pretty(manifest));
    console.log('response prevention write: passed (2 generated files)');
  } else {
    const manifest = buildManifest(args.root);
    checkGenerated(args.root, summary, manifest);
    console.log('response prevention check: passed (24 sources, 6 lanes, 36 observations, 24 findings, 72 response cells, 16 unadopted controls)');
  }
  if (args.strictRoot) assertStrictRoot(args.root);
} catch (error) {
  die(error.message);
}
