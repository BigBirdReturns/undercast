#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');
const WAVE_ID = 'CN-HR-W01';
const REQUIRED_LANES = ['HR-01', 'HR-02', 'HR-03', 'HR-04', 'HR-05', 'HR-06', 'HR-07', 'HR-08'];
const AUTHORITY_KEYS = [
  'canonical_product_effects_allowed',
  'decision_receipt_adoption_allowed',
  'employer_liability_findings_allowed',
  'graph_effects_allowed',
  'individual_culpability_findings_allowed',
  'legal_conclusions_allowed',
  'private_source_publication_allowed',
  'publication_effects_allowed',
  'universal_prevalence_findings_allowed'
];
const SOURCE_URL_MAP_SHA256 = '96edaabfd715460e8fa29b7e928a23d668e63edaca008cbf4eedaa843f4387ac';
const DATA_ROOT = 'data/review/clifford-number/hr-selection';
const SOURCE_REGISTER = `${DATA_ROOT}/SOURCE-REGISTER.json`;
const SOURCE_SHARDS = [1, 2, 3, 4].map(index => `${DATA_ROOT}/sources/SOURCES-${String(index).padStart(2, '0')}.json`);
const RECEIPT_SPEC = `${DATA_ROOT}/DECISION-RECEIPT-SPEC.json`;
const GENERATED_SUMMARY = `${DATA_ROOT}/WAVE-01-SUMMARY.json`;
const GENERATED_MANIFEST = `${DATA_ROOT}/MANIFEST.json`;
const INPUT_FILES = [
  'schema/clifford-number-hr-selection-lane.schema.json',
  `${DATA_ROOT}/wave-01.json`,
  SOURCE_REGISTER,
  ...SOURCE_SHARDS,
  RECEIPT_SPEC,
  ...REQUIRED_LANES.map(id => `${DATA_ROOT}/lanes/${id}.json`),
  'docs/research/clifford-number/hr-selection/WAVE-01.md',
  'scripts/clifford-number-hr-selection.mjs',
  'test/clifford-number-hr-selection-fixtures.mjs'
];

function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])]));
  }
  return value;
}

function readJson(root, relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueIds(items, scope) {
  const ids = new Set();
  for (const item of items) {
    assert(item && typeof item.id === 'string' && item.id.length > 0, `${scope}: item missing id`);
    assert(!ids.has(item.id), `${scope}: duplicate id ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

function validateAuthority(authority, scope) {
  assert(authority && typeof authority === 'object' && !Array.isArray(authority), `${scope}: authority must be an object`);
  for (const key of AUTHORITY_KEYS) {
    assert(Object.hasOwn(authority, key), `${scope}: missing authority key ${key}`);
    assert(authority[key] === false, `${scope}: ${key} must remain false`);
  }
  assert(Object.keys(authority).length === AUTHORITY_KEYS.length, `${scope}: unexpected authority key`);
}

function validateSourceRegister(root, register) {
  const scope = 'SOURCE-REGISTER.json';
  assert(register.schema_version === 1 && register.object_type === 'source_register', `${scope}: invalid identity`);
  assert(register.wave_id === WAVE_ID, `${scope}: wave_id mismatch`);
  assert(Array.isArray(register.private_sources) && register.private_sources.length === 1, `${scope}: exactly one private source object required`);
  assert(Array.isArray(register.shards) && register.shards.length === 4, `${scope}: exactly four public source shards required`);
  const shardSources = [];
  for (let index = 0; index < SOURCE_SHARDS.length; index += 1) {
    const shardPath = SOURCE_SHARDS[index];
    const shard = readJson(root, shardPath);
    const expectedId = `SRC-${String(index + 1).padStart(2, '0')}`;
    assert(shard.schema_version === 1 && shard.object_type === 'source_shard', `${shardPath}: invalid identity`);
    assert(shard.wave_id === WAVE_ID && shard.shard_id === expectedId, `${shardPath}: shard identity mismatch`);
    assert(Array.isArray(shard.sources) && shard.sources.length === shard.source_count, `${shardPath}: source_count mismatch`);
    assert(register.shards[index].shard_id === expectedId && register.shards[index].path === shardPath, `${scope}: shard index mismatch`);
    assert(register.shards[index].source_count === shard.source_count, `${scope}: shard count mismatch`);
    assert(register.shards[index].first_source_id === shard.sources[0].id, `${scope}: shard first source mismatch`);
    assert(register.shards[index].last_source_id === shard.sources.at(-1).id, `${scope}: shard last source mismatch`);
    shardSources.push(...shard.sources);
  }
  const sources = [...register.private_sources, ...shardSources];
  assert(sources.length === 42, `${scope}: exactly 42 source objects required`);
  assert(register.source_count === sources.length, `${scope}: source_count mismatch`);
  assert(register.public_url_lead_count === 41, `${scope}: exactly 41 normalized public URL leads required`);
  assert(register.private_artifact_count === 1, `${scope}: exactly one private seed artifact required`);
  assert(register.reference_definition_count_in_seed === 46, `${scope}: reference definition count must remain 46`);
  assert(register.normalization.overlapping_seed_formulations === 2, `${scope}: overlapping formulation count must remain 2`);
  assert(register.normalization.repetition_counts_as_independent_corroboration === false, `${scope}: repetition may not count as independent corroboration`);

  const sourceIds = uniqueIds(sources, `${scope}.sources`);
  const privateSources = sources.filter(source => source.kind === 'private_seed_artifact');
  assert(privateSources.length === 1, `${scope}: one private seed artifact required`);
  const seed = privateSources[0];
  assert(seed.id === 'seed-genealogy-2026-08-01', `${scope}: private seed identity changed`);
  assert(seed.url === null, `${scope}: private seed must not have a public URL`);
  assert(seed.verification_state === 'digest_verified_content_not_committed', `${scope}: private seed state changed`);
  assert(seed.artifact.raw_artifact_committed === false, `${scope}: raw private seed may not be committed`);
  assert(seed.artifact.bytes === 65347, `${scope}: private seed byte count changed`);
  assert(seed.artifact.sha256 === 'eb0b6e92e4e3bc38522baf9df28271baca52cfc85a49602e41d97cd1525ddeae', `${scope}: private seed digest changed`);

  const publicSources = sources.filter(source => source.url !== null);
  assert(publicSources.length === 41, `${scope}: public source lead count mismatch`);
  for (const source of publicSources) {
    assert(typeof source.url === 'string' && source.url.startsWith('https://'), `${scope}: ${source.id} must use https`);
    assert(['seed_declared_not_reverified', 'unclassified_seed_lead'].includes(source.verification_state), `${scope}: ${source.id} may not claim independent verification`);
    assert(Array.isArray(source.lane_ids), `${scope}: ${source.id} lane_ids must be an array`);
    if (source.verification_state === 'unclassified_seed_lead') {
      assert(source.lane_ids.length === 0, `${scope}: unclassified source must not be attached to a lane`);
    } else {
      assert(source.lane_ids.length > 0, `${scope}: classified source must attach to at least one lane`);
    }
  }
  const sourceUrlMap = Object.fromEntries(publicSources.slice().sort((a, b) => a.id.localeCompare(b.id)).map(source => [source.id, source.url]));
  assert(sha256(JSON.stringify(sourceUrlMap)) === SOURCE_URL_MAP_SHA256, `${scope}: source URL mismatch`);
  return { register, sources, sourceIds };
}

function validateReceiptSpec(spec) {
  const scope = 'DECISION-RECEIPT-SPEC.json';
  assert(spec.schema_version === 1 && spec.object_type === 'decision_receipt_specification', `${scope}: invalid identity`);
  assert(spec.wave_id === WAVE_ID, `${scope}: wave_id mismatch`);
  assert(spec.status === 'normative_seed_not_adopted', `${scope}: status must remain normative_seed_not_adopted`);
  validateAuthority(spec.authority, scope);
  const actorIds = spec.actors.map(actor => actor.actor_id);
  assert(JSON.stringify(actorIds) === JSON.stringify(['job_owner', 'hr', 'assessment_vendor', 'hiring_manager', 'employer', 'candidate', 'external_auditor']), `${scope}: actor set or order changed`);
  assert(spec.controls.length === 7, `${scope}: seven proposed controls required`);
  for (const control of spec.controls) {
    assert(control.adopted === false, `${scope}: ${control.control_id} may not be adopted in this wave`);
  }
  assert(spec.non_entitlements.length >= 4, `${scope}: non-entitlements must remain explicit`);
  return spec;
}

function validateLane(lane, expectedId, sourceIds) {
  const scope = expectedId;
  assert(lane.schema_version === 1, `${scope}: schema_version must be 1`);
  assert(lane.object_type === 'hr_selection_lane', `${scope}: object_type mismatch`);
  assert(lane.wave_id === WAVE_ID, `${scope}: wave_id mismatch`);
  assert(lane.lane_id === expectedId, `${scope}: lane_id mismatch`);
  assert(typeof lane.title === 'string' && lane.title.length > 0, `${scope}: missing title`);
  assert(typeof lane.genealogy_stage === 'string' && lane.genealogy_stage.length > 0, `${scope}: missing genealogy_stage`);
  assert(typeof lane.decisive_join === 'string' && lane.decisive_join.length > 0, `${scope}: missing decisive_join`);
  assert(typeof lane.selection_rule === 'string' && lane.selection_rule.length > 0, `${scope}: missing selection_rule`);
  validateAuthority(lane.authority, scope);

  assert(Array.isArray(lane.source_ids) && lane.source_ids.length > 0, `${scope}: source_ids must be non-empty`);
  assert(new Set(lane.source_ids).size === lane.source_ids.length, `${scope}: duplicate source id in lane`);
  for (const sourceId of lane.source_ids) {
    assert(sourceIds.has(sourceId), `${scope}: dangling lane source ${sourceId}`);
  }

  assert(Array.isArray(lane.observations) && lane.observations.length > 0, `${scope}: observations must be non-empty`);
  uniqueIds(lane.observations, `${scope}.observations`);
  assert(Array.isArray(lane.findings) && lane.findings.length > 0, `${scope}: findings must be non-empty`);
  uniqueIds(lane.findings, `${scope}.findings`);
  for (const item of [...lane.observations, ...lane.findings]) {
    assert(Array.isArray(item.source_ids) && item.source_ids.length > 0, `${scope}: ${item.id} source_ids must be non-empty`);
    for (const sourceId of item.source_ids) {
      assert(sourceIds.has(sourceId), `${scope}: ${item.id} has dangling source ${sourceId}`);
      assert(lane.source_ids.includes(sourceId), `${scope}: ${item.id} source ${sourceId} is not declared by the lane`);
    }
  }
  for (const item of lane.findings) {
    assert(['seed_supported', 'seed_synthesis', 'blocked', 'normative_proposal'].includes(item.status), `${scope}: ${item.id} has invalid status`);
    assert(item.status !== 'promoted', `${scope}: findings may not be promoted`);
    assert(Array.isArray(item.limits) && item.limits.length > 0, `${scope}: ${item.id} must preserve limits`);
  }

  const receipt = lane.terminal_receipt;
  assert(receipt && typeof receipt.state === 'string' && receipt.state.length > 0, `${scope}: terminal receipt missing state`);
  assert(Array.isArray(receipt.closed_control_questions), `${scope}: closed_control_questions must be an array`);
  assert(receipt.closed_control_questions.length === 0, `${scope}: this wave may not close control questions`);
  assert(Array.isArray(receipt.open_control_questions) && receipt.open_control_questions.length > 0, `${scope}: open_control_questions must be non-empty`);
  assert(Array.isArray(receipt.prohibited_inferences) && receipt.prohibited_inferences.length > 0, `${scope}: prohibited_inferences must be non-empty`);
  return lane;
}

export function validateCorpus(root) {
  const wave = readJson(root, `${DATA_ROOT}/wave-01.json`);
  assert(wave.schema_version === 1 && wave.object_type === 'research_wave' && wave.id === WAVE_ID, 'wave-01.json: invalid identity');
  validateAuthority(wave.authority, 'wave-01.json');
  assert(wave.source_specification.sha256 === 'eb0b6e92e4e3bc38522baf9df28271baca52cfc85a49602e41d97cd1525ddeae', 'wave-01.json: seed digest changed');
  assert(wave.source_specification.bytes === 65347, 'wave-01.json: seed byte count changed');
  assert(wave.source_specification.reference_definitions === 46, 'wave-01.json: reference definition count changed');
  assert(wave.source_specification.normalized_public_url_leads === 41, 'wave-01.json: normalized URL count changed');
  assert(wave.source_specification.raw_artifact_committed === false, 'wave-01.json: raw private seed may not be committed');
  assert(wave.source_specification.repetition_is_independent_corroboration === false, 'wave-01.json: repeated formulation may not count as independent corroboration');
  assert(wave.source_specification.materialized_base_head === 'cdca4d9b935d88c64fa5009bdb309eda2fb4f6a4', 'wave-01.json: base head changed');
  assert(wave.boundary.canonical_product_paths_allowed.length === 0, 'wave-01.json: canonical product paths must remain empty');
  assert(wave.boundary.graph_paths_allowed.length === 0, 'wave-01.json: graph paths must remain empty');
  assert(wave.boundary.publication_paths_allowed.length === 0, 'wave-01.json: publication paths must remain empty');
  assert(wave.ledger_state.public_source_leads_independently_verified === 0, 'wave-01.json: verified public source count must remain 0');
  assert(wave.ledger_state.promoted_findings === 0, 'wave-01.json: promoted findings must remain 0');
  assert(wave.ledger_state.adopted_controls === 0, 'wave-01.json: adopted controls must remain 0');
  assert(wave.ledger_state.closed_control_questions === 0, 'wave-01.json: closed control questions must remain 0');
  assert(JSON.stringify(wave.execution.lanes) === JSON.stringify(REQUIRED_LANES), 'wave-01.json: lane set or order changed');
  assert(wave.execution.required_terminal_receipts === REQUIRED_LANES.length, 'wave-01.json: terminal receipt count changed');

  const { register, sources, sourceIds } = validateSourceRegister(root, readJson(root, SOURCE_REGISTER));
  const receiptSpec = validateReceiptSpec(readJson(root, RECEIPT_SPEC));
  const lanes = REQUIRED_LANES.map(id => {
    const relative = `${DATA_ROOT}/lanes/${id}.json`;
    assert(fs.existsSync(path.join(root, relative)), `${relative}: missing required lane`);
    return validateLane(readJson(root, relative), id, sourceIds);
  });
  return { wave, register, sources, receiptSpec, lanes };
}

function buildSummary(corpus) {
  const observationStates = {};
  const findingStatuses = {};
  const lanes = corpus.lanes.map(lane => {
    for (const item of lane.observations) observationStates[item.state] = (observationStates[item.state] || 0) + 1;
    for (const item of lane.findings) findingStatuses[item.status] = (findingStatuses[item.status] || 0) + 1;
    return {
      lane_id: lane.lane_id,
      genealogy_stage: lane.genealogy_stage,
      source_count: lane.source_ids.length,
      observation_count: lane.observations.length,
      finding_count: lane.findings.length,
      terminal_state: lane.terminal_receipt.state,
      closed_control_question_count: lane.terminal_receipt.closed_control_questions.length,
      open_control_questions: lane.terminal_receipt.open_control_questions
    };
  });
  return {
    schema_version: 1,
    wave_id: WAVE_ID,
    generated_from: 'validated private-seed intake, source-lead register, evidence-only lanes, and normative decision-receipt specification',
    authority: corpus.wave.authority,
    counts: {
      lane_count: corpus.lanes.length,
      terminal_receipt_count: corpus.lanes.length,
      source_object_count: corpus.sources.length,
      public_source_lead_count: corpus.register.public_url_lead_count,
      independently_verified_public_source_count: 0,
      private_source_object_count: corpus.register.private_artifact_count,
      observation_count: corpus.lanes.reduce((sum, lane) => sum + lane.observations.length, 0),
      finding_count: corpus.lanes.reduce((sum, lane) => sum + lane.findings.length, 0),
      promoted_finding_count: 0,
      proposed_control_count: corpus.receiptSpec.controls.length,
      adopted_control_count: corpus.receiptSpec.controls.filter(control => control.adopted).length,
      open_control_question_count: corpus.lanes.reduce((sum, lane) => sum + lane.terminal_receipt.open_control_questions.length, 0),
      closed_control_question_count: 0
    },
    observation_states: observationStates,
    finding_statuses: findingStatuses,
    lanes
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildManifest(root, summaryBytes) {
  const files = [];
  for (const relative of INPUT_FILES) {
    const bytes = fs.readFileSync(path.join(root, relative));
    files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  files.push({ path: GENERATED_SUMMARY, bytes: Buffer.byteLength(summaryBytes), sha256: sha256(summaryBytes) });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema_version: 1,
    wave_id: WAVE_ID,
    algorithm: 'sha256',
    manifest_excludes_self: true,
    exact_file_count: files.length,
    files
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
    if (mode === 'write') {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, expected);
    } else {
      assert(fs.existsSync(full), `${relative}: generated file missing`);
      const actual = fs.readFileSync(full, 'utf8');
      assert(actual === expected, `${relative}: generated bytes are stale`);
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
    console.log(`clifford-number hr-selection ${mode}: passed (${outputs.length} generated files, 8 lanes, 42 source objects, 8 terminal receipts, 0 promoted findings, 0 adopted controls)`);
  } catch (error) {
    console.error(`clifford-number hr-selection: ${error.message}`);
    process.exitCode = 1;
  }
}
