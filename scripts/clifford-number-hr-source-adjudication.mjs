#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');
const WAVE_ID = 'CN-HR-W02';
const WAVE1_HEAD = 'b1b4dbc40e8b295b8f6a5d4fe7d252f0e791926e';
const WAVE1_MANIFEST_SHA256 = 'ac3f428b7fd3fea84b7d5ab4495ecfdb5a9053cbe423c3f1daa68e68155ed543';
const REQUIRED_LANES = ['HRV-01', 'HRV-02', 'HRV-03', 'HRV-04', 'HRV-05', 'HRV-06'];
const WAVE1_FINDING_IDS = [
  'hr01-f1','hr01-f2','hr01-f3','hr02-f1','hr02-f2','hr02-f3','hr03-f1','hr03-f2','hr03-f3',
  'hr04-f1','hr04-f2','hr04-f3','hr05-f1','hr05-f2','hr05-f3','hr06-f1','hr06-f2','hr06-f3',
  'hr07-f1','hr07-f2','hr07-f3','hr08-f1','hr08-f2','hr08-f3'
];
const AUTHORITY_KEYS = [
  'canonical_product_effects_allowed', 'claim_promotion_into_wave_01_allowed',
  'decision_receipt_adoption_allowed', 'employer_liability_findings_allowed',
  'employer_specific_causation_findings_allowed', 'graph_effects_allowed',
  'individual_culpability_findings_allowed', 'legal_conclusions_allowed',
  'private_source_publication_allowed', 'publication_effects_allowed',
  'source_raw_bytes_publication_allowed', 'universal_prevalence_findings_allowed',
  'wave_01_mutation_allowed'
];
const BASE = 'data/review/clifford-number/hr-selection/wave-02';
const GENERATED_SUMMARY = `${BASE}/WAVE-02-SUMMARY.json`;
const GENERATED_MANIFEST = `${BASE}/MANIFEST.json`;
const AUTHORED_FILES = [
  `${BASE}/wave-02.json`, `${BASE}/SOURCE-REGISTER.json`, `${BASE}/CLAIM-PROMOTION-LEDGER.json`,
  `${BASE}/DECISION-RECEIPT-PROTOCOL.json`,
  `${BASE}/sources/SOURCES-01.json`, `${BASE}/sources/SOURCES-02.json`, `${BASE}/sources/SOURCES-03.json`,
  ...REQUIRED_LANES.map(id => `${BASE}/lanes/${id}.json`),
  'docs/research/clifford-number/hr-selection/WAVE-02.md',
  'schema/clifford-number-hr-verification-lane.schema.json',
  'scripts/clifford-number-hr-source-adjudication.mjs',
  'test/clifford-number-hr-source-adjudication-fixtures.mjs'
];

function assert(condition, message) { if (!condition) throw new Error(message); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortDeep(value[k])]));
  return value;
}
function stableJson(value) { return `${JSON.stringify(sortDeep(value), null, 2)}\n`; }
function readJson(root, relative) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
  catch (error) { throw new Error(`${relative}: ${error.message}`); }
}
function unique(items, label) {
  const set = new Set();
  for (const item of items) { assert(!set.has(item), `${label}: duplicate ${item}`); set.add(item); }
  return set;
}
function validateAuthority(authority, label) {
  assert(authority && typeof authority === 'object' && !Array.isArray(authority), `${label}: authority must be object`);
  for (const key of AUTHORITY_KEYS) {
    assert(Object.hasOwn(authority, key), `${label}: missing authority ${key}`);
    assert(authority[key] === false, `${label}: ${key} must remain false`);
  }
  assert(Object.keys(authority).length === AUTHORITY_KEYS.length, `${label}: unexpected authority key`);
}

function verifyWave1Integrity(root) {
  const manifestPath = 'data/review/clifford-number/hr-selection/MANIFEST.json';
  const manifestBytes = fs.readFileSync(path.join(root, manifestPath));
  assert(sha256(manifestBytes) === WAVE1_MANIFEST_SHA256, `${manifestPath}: Wave 01 manifest hash changed`);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert(manifest.wave_id === 'CN-HR-W01', `${manifestPath}: wrong wave`);
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, file.path));
    assert(bytes.length === file.bytes, `${file.path}: Wave 01 byte count changed`);
    assert(sha256(bytes) === file.sha256, `${file.path}: Wave 01 file hash changed`);
  }
  const findings = new Map();
  for (let i = 1; i <= 8; i += 1) {
    const lane = readJson(root, `data/review/clifford-number/hr-selection/lanes/HR-0${i}.json`);
    for (const finding of lane.findings) {
      assert(!findings.has(finding.id), `Wave 01 duplicate finding ${finding.id}`);
      findings.set(finding.id, finding);
    }
  }
  assert(JSON.stringify([...findings.keys()].sort()) === JSON.stringify([...WAVE1_FINDING_IDS].sort()), 'Wave 01 finding set changed');
  return findings;
}

function validateSource(source) {
  assert(typeof source.id === 'string' && source.id.length > 0, 'source missing id');
  assert(typeof source.url === 'string' && source.url.startsWith('https://'), `${source.id}: source URL must use https`);
  assert(source.accessed === '2026-08-01', `${source.id}: accessed date must be pinned`);
  assert(source.verification_state === 'independently_recovered_public_source', `${source.id}: false verification state`);
  assert(source.retrieval_form === 'web_text_and_metadata_review', `${source.id}: unexpected retrieval form`);
  assert(source.raw_source_bytes_retained === false, `${source.id}: raw remote bytes may not be claimed`);
  assert(source.remote_byte_hash_claimed === false, `${source.id}: remote byte hash may not be claimed`);
  assert(Array.isArray(source.lane_ids) && source.lane_ids.length > 0, `${source.id}: missing lanes`);
  assert(Array.isArray(source.observed_propositions) && source.observed_propositions.length > 0, `${source.id}: missing propositions`);
  assert(Array.isArray(source.limits) && source.limits.length > 0, `${source.id}: missing limits`);
  assert(typeof source.passage_locator === 'string' && source.passage_locator.length > 0, `${source.id}: missing passage locator`);
}

function validateLane(lane, expectedId, sourceIds, wave1Findings) {
  const label = expectedId;
  assert(lane.schema_version === 1 && lane.wave_id === WAVE_ID && lane.lane_id === expectedId, `${label}: identity mismatch`);
  validateAuthority(lane.authority, label);
  assert(typeof lane.title === 'string' && lane.title.length > 0, `${label}: missing title`);
  assert(typeof lane.decisive_join === 'string' && lane.decisive_join.length > 0, `${label}: missing decisive_join`);
  assert(typeof lane.selection_rule === 'string' && lane.selection_rule.length > 0, `${label}: missing selection_rule`);
  assert(Array.isArray(lane.source_ids) && lane.source_ids.length > 0, `${label}: source_ids must be non-empty`);
  unique(lane.source_ids, `${label}.source_ids`);
  for (const sourceId of lane.source_ids) assert(sourceIds.has(sourceId), `${label}: dangling lane source ${sourceId}`);
  assert(Array.isArray(lane.observations) && lane.observations.length > 0, `${label}: observations must be non-empty`);
  assert(Array.isArray(lane.findings) && lane.findings.length > 0, `${label}: findings must be non-empty`);
  unique(lane.observations.map(x => x.id), `${label}.observations`);
  unique(lane.findings.map(x => x.id), `${label}.findings`);
  for (const item of [...lane.observations, ...lane.findings]) {
    assert(Array.isArray(item.source_ids), `${label}: ${item.id} missing source_ids`);
    for (const sourceId of item.source_ids) assert(sourceIds.has(sourceId), `${label}: ${item.id} dangling source ${sourceId}`);
  }
  for (const f of lane.findings) {
    assert(['independently_supported_scoped','bounded_synthesis','remains_blocked'].includes(f.status), `${label}: ${f.id} invalid status`);
    assert(Array.isArray(f.limits) && f.limits.length > 0, `${label}: ${f.id} missing limits`);
    assert(Array.isArray(f.wave_01_finding_ids), `${label}: ${f.id} missing Wave 01 joins`);
    for (const id of f.wave_01_finding_ids) assert(wave1Findings.has(id), `${label}: ${f.id} bad Wave 01 finding ${id}`);
  }
  const receipt = lane.terminal_receipt;
  assert(receipt && typeof receipt.state === 'string' && receipt.state.length > 0, `${label}: missing terminal state`);
  assert(Array.isArray(receipt.closed_questions) && receipt.closed_questions.length === 0, `${label}: questions may not be closed`);
  assert(Array.isArray(receipt.open_questions) && receipt.open_questions.length > 0, `${label}: open questions required`);
  assert(Array.isArray(receipt.prohibited_inferences) && receipt.prohibited_inferences.length > 0, `${label}: prohibited inferences required`);
}

export function validateCorpus(root) {
  const wave1Findings = verifyWave1Integrity(root);
  const wave = readJson(root, `${BASE}/wave-02.json`);
  assert(wave.schema_version === 1 && wave.id === WAVE_ID, 'wave-02.json: invalid identity');
  validateAuthority(wave.authority, 'wave-02.json');
  assert(wave.parent.head === WAVE1_HEAD, 'wave-02.json: parent head changed');
  assert(wave.parent.manifest_sha256 === WAVE1_MANIFEST_SHA256, 'wave-02.json: parent manifest changed');
  assert(JSON.stringify(wave.execution.lanes) === JSON.stringify(REQUIRED_LANES), 'wave-02.json: lane set changed');
  assert(wave.ledger_state.wave_01_findings_mutated === 0, 'wave-02.json: Wave 01 mutation claimed');
  assert(wave.ledger_state.adopted_controls === 0, 'wave-02.json: controls may not be adopted');
  assert(wave.ledger_state.private_sources_published === 0, 'wave-02.json: private source publication claimed');

  const register = readJson(root, `${BASE}/SOURCE-REGISTER.json`);
  assert(register.wave_id === WAVE_ID && register.source_count === 26, 'SOURCE-REGISTER.json: source count or wave mismatch');
  assert(register.private_source_count === 0, 'SOURCE-REGISTER.json: private source forbidden');
  assert(register.normalization.raw_remote_bytes_retained === false, 'SOURCE-REGISTER.json: raw bytes may not be retained');
  assert(register.normalization.remote_byte_hashes_claimed === false, 'SOURCE-REGISTER.json: remote hashes may not be claimed');
  assert(Array.isArray(register.shards) && register.shards.length === 3, 'SOURCE-REGISTER.json: three shards required');

  const sources = [];
  for (const shard of register.shards) {
    const data = readJson(root, shard.path);
    assert(data.wave_id === WAVE_ID && data.shard_id === shard.shard_id, `${shard.path}: identity mismatch`);
    assert(Array.isArray(data.sources) && data.sources.length === shard.source_count, `${shard.path}: source count mismatch`);
    for (const source of data.sources) { validateSource(source); sources.push(source); }
  }
  assert(sources.length === register.source_count, 'SOURCE-REGISTER.json: aggregate source count mismatch');
  const sourceIds = unique(sources.map(x => x.id), 'sources.ids');
  unique(sources.map(x => x.url), 'sources.urls');
  const mapBytes = `${[...sources].sort((a,b) => a.id.localeCompare(b.id)).map(x => `${x.id}\t${x.url}`).join('\n')}\n`;
  assert(sha256(Buffer.from(mapBytes)) === register.normalization.source_id_url_map_sha256, 'SOURCE-REGISTER.json: source id/url map rebound');
  for (const source of sources) for (const laneId of source.lane_ids) assert(REQUIRED_LANES.includes(laneId), `${source.id}: unknown lane ${laneId}`);

  const lanes = REQUIRED_LANES.map(id => {
    const relative = `${BASE}/lanes/${id}.json`;
    assert(fs.existsSync(path.join(root, relative)), `${relative}: missing required lane`);
    const value = readJson(root, relative);
    validateLane(value, id, sourceIds, wave1Findings);
    return value;
  });

  const ledger = readJson(root, `${BASE}/CLAIM-PROMOTION-LEDGER.json`);
  assert(ledger.wave_id === WAVE_ID && ledger.wave_01_head === WAVE1_HEAD, 'CLAIM-PROMOTION-LEDGER.json: identity mismatch');
  validateAuthority(ledger.authority, 'CLAIM-PROMOTION-LEDGER.json');
  assert(ledger.wave_01_mutated === false, 'CLAIM-PROMOTION-LEDGER.json: Wave 01 may not mutate');
  assert(ledger.wave_01_manifest_sha256 === WAVE1_MANIFEST_SHA256, 'CLAIM-PROMOTION-LEDGER.json: manifest mismatch');
  assert(Array.isArray(ledger.entries) && ledger.entries.length === WAVE1_FINDING_IDS.length, 'CLAIM-PROMOTION-LEDGER.json: complete 24-entry ledger required');
  const ledgerIds = unique(ledger.entries.map(x => x.wave_01_finding_id), 'claim ledger');
  assert(JSON.stringify([...ledgerIds].sort()) === JSON.stringify([...WAVE1_FINDING_IDS].sort()), 'CLAIM-PROMOTION-LEDGER.json: Wave 01 finding coverage incomplete');
  for (const entry of ledger.entries) {
    assert(entry.wave_01_mutated === false, `${entry.wave_01_finding_id}: mutation forbidden`);
    assert(wave1Findings.get(entry.wave_01_finding_id).claim === entry.wave_01_claim, `${entry.wave_01_finding_id}: claim text mismatch`);
    assert(wave1Findings.get(entry.wave_01_finding_id).status === entry.wave_01_status, `${entry.wave_01_finding_id}: prior status mismatch`);
    assert(['independently_supported_scoped','bounded_synthesis_retained','remains_blocked','not_reached_in_wave_02','remains_private_seed_only','normative_proposal_retained_not_adopted'].includes(entry.disposition), `${entry.wave_01_finding_id}: invalid disposition`);
    assert(Array.isArray(entry.limits) && entry.limits.length > 0, `${entry.wave_01_finding_id}: limits required`);
    for (const sourceId of entry.source_ids) assert(sourceIds.has(sourceId), `${entry.wave_01_finding_id}: dangling source ${sourceId}`);
  }

  const protocol = readJson(root, `${BASE}/DECISION-RECEIPT-PROTOCOL.json`);
  assert(protocol.wave_id === WAVE_ID && protocol.status === 'draft_protocol_not_adopted', 'DECISION-RECEIPT-PROTOCOL.json: identity/status mismatch');
  validateAuthority(protocol.authority, 'DECISION-RECEIPT-PROTOCOL.json');
  assert(protocol.private_source_required === false, 'DECISION-RECEIPT-PROTOCOL.json: private archive may not be required');
  assert(Array.isArray(protocol.actors) && protocol.actors.length === 7, 'DECISION-RECEIPT-PROTOCOL.json: seven actors required');
  assert(Array.isArray(protocol.controls) && protocol.controls.length === 7, 'DECISION-RECEIPT-PROTOCOL.json: seven controls required');
  for (const control of protocol.controls) assert(control.adopted === false, `${control.control_id}: control adoption forbidden`);
  assert(protocol.exploration_protocol.adopted === false, 'exploration protocol may not be adopted');
  assert(protocol.exploration_protocol.private_case_archive_required === false, 'private archive may not be required');
  assert(protocol.exploration_protocol.candidate_entitlement_created === false, 'automatic candidate entitlement forbidden');
  assert(protocol.exploration_protocol.retroactive_hiring_entitlement_created === false, 'retroactive entitlement forbidden');
  assert(Array.isArray(protocol.transaction_states) && protocol.transaction_states.length === 8, 'eight transaction states required');

  return { wave, register, sources, lanes, ledger, protocol };
}

function buildSummary(corpus) {
  const findingStatuses = {};
  const ledgerDispositions = {};
  for (const lane of corpus.lanes) for (const f of lane.findings) findingStatuses[f.status] = (findingStatuses[f.status] || 0) + 1;
  for (const entry of corpus.ledger.entries) ledgerDispositions[entry.disposition] = (ledgerDispositions[entry.disposition] || 0) + 1;
  return {
    authority: corpus.wave.authority,
    counts: {
      adopted_control_count: corpus.protocol.controls.filter(x => x.adopted).length,
      claim_adjudication_count: corpus.ledger.entries.length,
      finding_count: corpus.lanes.reduce((n, x) => n + x.findings.length, 0),
      independently_recovered_public_source_count: corpus.sources.length,
      lane_count: corpus.lanes.length,
      observation_count: corpus.lanes.reduce((n, x) => n + x.observations.length, 0),
      private_source_count: corpus.register.private_source_count,
      terminal_receipt_count: corpus.lanes.length,
      transaction_state_count: corpus.protocol.transaction_states.length,
      wave_01_mutation_count: corpus.ledger.entries.filter(x => x.wave_01_mutated).length,
    },
    finding_statuses: findingStatuses,
    generated_from: 'validated public-source shards, six independent adjudication lanes, complete Wave 01 claim ledger, and draft decision-receipt protocol',
    lanes: corpus.lanes.map(lane => ({
      finding_count: lane.findings.length,
      lane_id: lane.lane_id,
      observation_count: lane.observations.length,
      open_questions: lane.terminal_receipt.open_questions,
      source_count: lane.source_ids.length,
      terminal_state: lane.terminal_receipt.state,
    })),
    ledger_dispositions: ledgerDispositions,
    parent: corpus.wave.parent,
    schema_version: 1,
    source_id_url_map_sha256: corpus.register.normalization.source_id_url_map_sha256,
    wave_id: WAVE_ID,
  };
}

function buildManifest(root, summaryBytes) {
  const files = [];
  for (const relative of AUTHORED_FILES) {
    const bytes = fs.readFileSync(path.join(root, relative));
    files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  files.push({ path: GENERATED_SUMMARY, bytes: Buffer.byteLength(summaryBytes), sha256: sha256(Buffer.from(summaryBytes)) });
  files.sort((a,b) => a.path.localeCompare(b.path));
  return {
    algorithm: 'sha256', exact_file_count: files.length, files,
    manifest_excludes_self: true, parent_wave_01_manifest_sha256: WAVE1_MANIFEST_SHA256,
    schema_version: 1, wave_id: WAVE_ID
  };
}

export function generate(root) {
  const corpus = validateCorpus(root);
  const summaryBytes = stableJson(buildSummary(corpus));
  const manifestBytes = stableJson(buildManifest(root, summaryBytes));
  return { summaryBytes, manifestBytes };
}

function writeOrCheck(root, mode) {
  const { summaryBytes, manifestBytes } = generate(root);
  const outputs = [[GENERATED_SUMMARY, summaryBytes], [GENERATED_MANIFEST, manifestBytes]];
  for (const [relative, expected] of outputs) {
    const full = path.join(root, relative);
    if (mode === 'write') { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, expected); }
    else {
      assert(fs.existsSync(full), `${relative}: generated file missing`);
      assert(fs.readFileSync(full, 'utf8') === expected, `${relative}: generated bytes are stale`);
    }
  }
  return outputs;
}

function parseArgs(argv) {
  const mode = argv.includes('--write') ? 'write' : 'check';
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? path.resolve(argv[rootIndex + 1]) : DEFAULT_ROOT;
  return { mode, root };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { mode, root } = parseArgs(process.argv.slice(2));
    const outputs = writeOrCheck(root, mode);
    console.log(`clifford-number HR source adjudication ${mode}: passed (${outputs.length} generated files, 6 lanes, 26 independently recovered sources, 24 Wave 01 findings adjudicated, 0 Wave 01 mutations, 0 adopted controls)`);
  } catch (error) {
    console.error(`clifford-number HR source adjudication: ${error.message}`);
    process.exitCode = 1;
  }
}
