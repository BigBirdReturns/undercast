#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');

export const WAVE_ID = 'CN-HR-W03';
export const ACCESS_DATE = '2026-08-01';
export const PARENT_HEAD = 'fdfdeade8b44d0c1af5442735a360761322dc109';
export const PARENT_MANIFEST_SHA256 = '751072a42669ab6fdc9eb0f3f7720ac2a51f6b698f0b6c07f5e9a3c1337f358f';
export const WAVE_ROOT = 'data/review/clifford-number/hr-selection/wave-03';
export const PARENT_MANIFEST = 'data/review/clifford-number/hr-selection/wave-02/MANIFEST.json';
export const GENERATED_SUMMARY = `${WAVE_ROOT}/WAVE-03-SUMMARY.json`;
export const GENERATED_MANIFEST = `${WAVE_ROOT}/MANIFEST.json`;

export const REQUIRED_LANES = ['HRG-01', 'HRG-02', 'HRG-03', 'HRG-04', 'HRG-05', 'HRG-06'];
export const SOURCE_SHARDS = ['SOURCES-01.json', 'SOURCES-02.json', 'SOURCES-03.json', 'SOURCES-04.json'];
export const AUTHORITY_KEYS = [
  'canonical_product_effects_allowed',
  'candidate_entitlement_findings_allowed',
  'control_adoption_allowed',
  'employer_liability_findings_allowed',
  'employer_specific_causation_findings_allowed',
  'graph_effects_allowed',
  'individual_culpability_findings_allowed',
  'legal_conclusions_allowed',
  'private_source_publication_allowed',
  'publication_effects_allowed',
  'universal_prevalence_findings_allowed',
  'wave_02_mutation_allowed'
];

export const INPUT_FILES = [
  'schema/clifford-number-hr-governance-lane.schema.json',
  `${WAVE_ROOT}/wave-03.json`,
  `${WAVE_ROOT}/SOURCE-REGISTER.json`,
  `${WAVE_ROOT}/JURISDICTION-STATE-REGISTER.json`,
  `${WAVE_ROOT}/DEPLOYMENT-CUSTODY-PROTOCOL.json`,
  `${WAVE_ROOT}/FALSE-NEGATIVE-AUDIT-PROTOCOL.json`,
  ...REQUIRED_LANES.map(id => `${WAVE_ROOT}/lanes/${id}.json`),
  ...SOURCE_SHARDS.map(name => `${WAVE_ROOT}/sources/${name}`),
  'docs/research/clifford-number/hr-selection/WAVE-03.md',
  'scripts/clifford-number-hr-governance.mjs',
  'test/clifford-number-hr-governance-fixtures.mjs'
];

const EXPECTED_JURISDICTIONS = {
  'US-FED-ADA': { state: 'operative', date: null },
  'US-FED-UGESP': { state: 'operative', date: '1978' },
  'NYC-LL144': { state: 'operative', date: '2023-07-05' },
  'EU-AIA-ANNEX-III-EMPLOYMENT': { state: 'enacted_pre_effective', date: '2027-12-02' },
  'CO-SB26-189': { state: 'enacted_pre_effective', date: '2027-01-01' },
  'NIST-AI-RMF': { state: 'voluntary', date: null }
};

const EXPECTED_DEPLOYMENT_STATES = [
  'role_object_fixed',
  'provider_and_instrument_fixed',
  'configuration_fixed',
  'accommodation_dispositioned',
  'human_oversight_assigned',
  'decision_issued',
  'candidate_evidence_returned',
  'deployment_reconciled'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortDeep(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function readBytes(root, relative) {
  const full = path.join(root, relative);
  assert(fs.existsSync(full), `${relative}: missing`);
  return fs.readFileSync(full);
}

function readJson(root, relative) {
  try {
    return JSON.parse(readBytes(root, relative).toString('utf8'));
  } catch (error) {
    throw new Error(`${relative}: ${error.message}`);
  }
}

function exactKeys(value, required, scope) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${scope}: must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${scope}: unexpected or missing keys`);
}

function validateAuthority(authority, scope) {
  exactKeys(authority, AUTHORITY_KEYS, `${scope}.authority`);
  for (const key of AUTHORITY_KEYS) {
    assert(authority[key] === false, `${scope}: ${key} must remain false`);
  }
}

function uniqueStrings(values, scope, { nonEmpty = true } = {}) {
  assert(Array.isArray(values), `${scope}: must be an array`);
  if (nonEmpty) assert(values.length > 0, `${scope}: must be non-empty`);
  const seen = new Set();
  for (const value of values) {
    assert(typeof value === 'string' && value.length > 0, `${scope}: values must be non-empty strings`);
    assert(!seen.has(value), `${scope}: duplicate value ${value}`);
    seen.add(value);
  }
  return seen;
}

function uniqueIds(items, scope) {
  assert(Array.isArray(items) && items.length > 0, `${scope}: must be a non-empty array`);
  const seen = new Set();
  for (const item of items) {
    assert(item && typeof item.id === 'string' && item.id.length > 0, `${scope}: item missing id`);
    assert(!seen.has(item.id), `${scope}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function typeMatches(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'null') return value === null;
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

export function validateAgainstSchema(value, schema, scope = '$') {
  if (!schema || Object.keys(schema).length === 0) return;
  if (Object.hasOwn(schema, 'const')) {
    assert(Object.is(value, schema.const), `${scope}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum) {
    assert(schema.enum.includes(value), `${scope}: value ${JSON.stringify(value)} is not in enum`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    assert(types.some(type => typeMatches(value, type)), `${scope}: invalid type`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${scope}: string too short`);
    if (schema.pattern) assert(new RegExp(schema.pattern).test(value), `${scope}: pattern mismatch`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${scope}: too few items`);
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, `${scope}: too many items`);
    if (schema.uniqueItems) {
      const encoded = value.map(item => JSON.stringify(item));
      assert(new Set(encoded).size === encoded.length, `${scope}: duplicate array item`);
    }
    if (schema.items) value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${scope}[${index}]`));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (schema.required) {
      for (const key of schema.required) assert(Object.hasOwn(value, key), `${scope}: missing required property ${key}`);
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) assert(allowed.has(key), `${scope}: unexpected property ${key}`);
    }
    if (schema.properties) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (Object.hasOwn(value, key)) validateAgainstSchema(value[key], childSchema, `${scope}.${key}`);
      }
    }
  }
}

function validateParent(root) {
  const bytes = readBytes(root, PARENT_MANIFEST);
  assert(sha256(bytes) === PARENT_MANIFEST_SHA256, `${PARENT_MANIFEST}: parent manifest drift`);
  const manifest = JSON.parse(bytes.toString('utf8'));
  assert(manifest.wave_id === 'CN-HR-W02', `${PARENT_MANIFEST}: wrong parent wave`);
  assert(manifest.schema_version === 1, `${PARENT_MANIFEST}: wrong schema version`);
  assert(manifest.algorithm === 'sha256', `${PARENT_MANIFEST}: wrong algorithm`);
  assert(manifest.exact_file_count === 18, `${PARENT_MANIFEST}: wrong parent file count`);
  assert(manifest.manifest_excludes_self === true, `${PARENT_MANIFEST}: parent manifest must exclude self`);
  return manifest;
}

function validateSchema(root) {
  const relative = 'schema/clifford-number-hr-governance-lane.schema.json';
  const schema = readJson(root, relative);
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${relative}: wrong draft`);
  assert(schema.type === 'object' && schema.additionalProperties === false, `${relative}: lane object must remain closed`);
  assert(schema.properties?.lane_id?.pattern === '^HRG-0[1-6]$', `${relative}: lane identity weakened`);
  assert(schema.properties?.wave_id?.const === WAVE_ID, `${relative}: wave identity weakened`);
  const authorityProps = schema.properties?.authority?.properties;
  assert(authorityProps && Object.keys(authorityProps).length === AUTHORITY_KEYS.length, `${relative}: authority keys changed`);
  for (const key of AUTHORITY_KEYS) assert(authorityProps[key]?.const === false, `${relative}: ${key} schema lock weakened`);
  assert(schema.properties?.observations?.minItems === 6 && schema.properties?.observations?.maxItems === 6, `${relative}: observation denominator changed`);
  assert(schema.properties?.findings?.minItems === 4 && schema.properties?.findings?.maxItems === 4, `${relative}: finding denominator changed`);
  assert(schema.properties?.terminal_receipt?.properties?.closed_questions?.maxItems === 0, `${relative}: closed-question rule weakened`);
  return schema;
}

function listExactJsonFiles(root, relativeDirectory) {
  const full = path.join(root, relativeDirectory);
  assert(fs.existsSync(full), `${relativeDirectory}: missing directory`);
  return fs.readdirSync(full, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
}

function validateSources(root) {
  const register = readJson(root, `${WAVE_ROOT}/SOURCE-REGISTER.json`);
  assert(register.schema_version === 1 && register.wave_id === WAVE_ID, 'SOURCE-REGISTER.json: invalid identity');
  assert(register.object_type === 'source_register', 'SOURCE-REGISTER.json: wrong object type');
  assert(register.accessed === ACCESS_DATE, 'SOURCE-REGISTER.json: accessed date drift');
  assert(register.private_source_count === 0, 'SOURCE-REGISTER.json: private sources prohibited');
  assert(register.source_count === 23, 'SOURCE-REGISTER.json: source denominator must remain 23');
  assert(register.normalization?.remote_bytes_committed === false, 'SOURCE-REGISTER.json: remote bytes may not be claimed');
  assert(register.normalization?.remote_sha256_claimed === false, 'SOURCE-REGISTER.json: remote hashes may not be claimed');
  assert(register.normalization?.urls_require_https === true, 'SOURCE-REGISTER.json: HTTPS requirement missing');

  const actualShardFiles = listExactJsonFiles(root, `${WAVE_ROOT}/sources`);
  assert(JSON.stringify(actualShardFiles) === JSON.stringify(SOURCE_SHARDS), 'source directory: missing or extra shard');

  assert(Array.isArray(register.shards) && register.shards.length === SOURCE_SHARDS.length, 'SOURCE-REGISTER.json: wrong shard count');
  const all = [];
  for (let i = 0; i < SOURCE_SHARDS.length; i += 1) {
    const name = SOURCE_SHARDS[i];
    const relative = `${WAVE_ROOT}/sources/${name}`;
    const shard = readJson(root, relative);
    assert(shard.schema_version === 1 && shard.wave_id === WAVE_ID, `${relative}: invalid identity`);
    assert(shard.object_type === 'adjudicated_source_shard', `${relative}: wrong object type`);
    assert(Array.isArray(shard.sources) && shard.sources.length > 0, `${relative}: empty source shard`);
    const meta = register.shards[i];
    assert(meta.path === relative, `${relative}: register path mismatch`);
    assert(meta.shard_id === shard.shard_id, `${relative}: shard id mismatch`);
    assert(meta.source_count === shard.sources.length, `${relative}: source count mismatch`);
    assert(meta.first_source_id === shard.sources[0].id && meta.last_source_id === shard.sources.at(-1).id, `${relative}: boundary mismatch`);
    all.push(...shard.sources);
  }
  assert(all.length === 23, 'source shards: source denominator must remain 23');

  const requiredKeys = [
    'accessed', 'authority_type', 'id', 'jurisdiction', 'legal_state', 'limits', 'published',
    'publisher', 'remote_bytes_committed', 'remote_sha256_claimed', 'status', 'supports', 'title', 'url'
  ];
  const ids = new Set();
  const urls = new Set();
  for (const source of all) {
    exactKeys(source, requiredKeys, `source ${source.id ?? '<missing>'}`);
    assert(!ids.has(source.id), `sources: duplicate id ${source.id}`);
    assert(!urls.has(source.url), `sources: duplicate url ${source.url}`);
    ids.add(source.id);
    urls.add(source.url);
    assert(source.accessed === ACCESS_DATE, `source ${source.id}: accessed date drift`);
    assert(typeof source.url === 'string' && source.url.startsWith('https://'), `source ${source.id}: must use https`);
    assert(['independently_recovered_public_source', 'vendor_declared_public_source'].includes(source.status), `source ${source.id}: invalid verification state`);
    assert(source.remote_bytes_committed === false, `source ${source.id}: remote bytes may not be committed`);
    assert(source.remote_sha256_claimed === false, `source ${source.id}: remote hash may not be claimed`);
    uniqueStrings(source.supports, `source ${source.id}.supports`);
    uniqueStrings(source.limits, `source ${source.id}.limits`);
    assert(typeof source.publisher === 'string' && source.publisher.length > 0, `source ${source.id}: missing publisher`);
    assert(typeof source.title === 'string' && source.title.length > 0, `source ${source.id}: missing title`);
    assert(!source.id.toLowerCase().includes('private'), `source ${source.id}: private source identity prohibited`);
  }

  const mapBytes = [...all]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(source => `${source.id}\t${source.url}\n`)
    .join('');
  const mapHash = sha256(Buffer.from(mapBytes, 'utf8'));
  assert(register.source_id_url_map_sha256 === mapHash, 'SOURCE-REGISTER.json: source ID/URL map hash mismatch');
  assert(register.normalization.exact_source_id_url_map_sha256 === mapHash, 'SOURCE-REGISTER.json: normalized source map hash mismatch');
  return { register, sources: all, sourceIds: ids, mapHash };
}

function dateValue(date) {
  if (date === null) return null;
  if (/^\d{4}$/.test(date)) return new Date(`${date}-01-01T00:00:00Z`).getTime();
  return new Date(`${date}T00:00:00Z`).getTime();
}

function validateJurisdictions(root, sourceIds) {
  const relative = `${WAVE_ROOT}/JURISDICTION-STATE-REGISTER.json`;
  const register = readJson(root, relative);
  assert(register.schema_version === 1 && register.wave_id === WAVE_ID, `${relative}: invalid identity`);
  assert(register.object_type === 'jurisdiction_state_register', `${relative}: wrong object type`);
  assert(register.accessed === ACCESS_DATE, `${relative}: accessed date drift`);
  validateAuthority(register.authority, relative);
  assert(Array.isArray(register.states) && register.states.length === 6, `${relative}: state denominator must remain 6`);
  const ids = uniqueIds(register.states, `${relative}.states`);
  assert(JSON.stringify([...ids].sort()) === JSON.stringify(Object.keys(EXPECTED_JURISDICTIONS).sort()), `${relative}: jurisdiction set changed`);
  const accessTime = dateValue(ACCESS_DATE);
  for (const state of register.states) {
    const expected = EXPECTED_JURISDICTIONS[state.id];
    assert(state.state === expected.state, `${relative}: ${state.id} state mismatch`);
    assert(state.effective_or_application_date === expected.date, `${relative}: ${state.id} date mismatch`);
    uniqueStrings(state.source_ids, `${relative}.${state.id}.source_ids`);
    for (const id of state.source_ids) assert(sourceIds.has(id), `${relative}: ${state.id} dangling source ${id}`);
    uniqueStrings(state.recovered_burdens, `${relative}.${state.id}.recovered_burdens`);
    uniqueStrings(state.not_established, `${relative}.${state.id}.not_established`);
    assert(typeof state.operative_boundary === 'string' && state.operative_boundary.length > 0, `${relative}: ${state.id} missing boundary`);
    const time = dateValue(state.effective_or_application_date);
    if (state.state === 'operative' && time !== null) assert(time <= accessTime, `${relative}: future law mislabeled operative for ${state.id}`);
    if (state.state === 'enacted_pre_effective') assert(time > accessTime, `${relative}: pre-effective date must be future for ${state.id}`);
    if (state.state === 'voluntary') assert(time === null, `${relative}: voluntary framework must not have operative date`);
  }
  return register;
}

function validateProtocolSources(protocol, sourceIds, scope) {
  validateAuthority(protocol.authority, scope);
  uniqueStrings(protocol.source_ids, `${scope}.source_ids`);
  for (const id of protocol.source_ids) assert(sourceIds.has(id), `${scope}: dangling source ${id}`);
  assert(protocol.adopted === false, `${scope}: protocol may not be adopted`);
  assert(protocol.wave_id === WAVE_ID && protocol.schema_version === 1, `${scope}: invalid identity`);
}

function validateDeploymentProtocol(root, sourceIds) {
  const relative = `${WAVE_ROOT}/DEPLOYMENT-CUSTODY-PROTOCOL.json`;
  const protocol = readJson(root, relative);
  validateProtocolSources(protocol, sourceIds, relative);
  assert(protocol.object_type === 'deployment_custody_protocol', `${relative}: wrong object type`);
  assert(protocol.protocol_id === 'CNHR-DEPLOY-01', `${relative}: wrong protocol id`);
  assert(protocol.status === 'normative_protocol_not_adopted', `${relative}: wrong status`);
  assert(Array.isArray(protocol.states) && protocol.states.length === 8, `${relative}: state denominator must remain 8`);
  assert(JSON.stringify(protocol.states.map(state => state.id)) === JSON.stringify(EXPECTED_DEPLOYMENT_STATES), `${relative}: state sequence changed`);
  for (const state of protocol.states) {
    uniqueStrings(state.required_fields, `${relative}.${state.id}.required_fields`);
    assert(typeof state.retained_burden === 'string' && state.retained_burden.length > 0, `${relative}: ${state.id} missing burden`);
  }
  assert(Array.isArray(protocol.controls) && protocol.controls.length === 7, `${relative}: control denominator must remain 7`);
  const controlIds = new Set();
  for (const control of protocol.controls) {
    assert(typeof control.control_id === 'string' && control.control_id.length > 0, `${relative}: control missing id`);
    assert(!controlIds.has(control.control_id), `${relative}: duplicate control ${control.control_id}`);
    controlIds.add(control.control_id);
    assert(control.adopted === false, `${relative}: control ${control.control_id} may not be adopted`);
  }
  assert(controlIds.size === 7, `${relative}: duplicate control`);
  uniqueStrings(protocol.non_entitlements, `${relative}.non_entitlements`);
  return protocol;
}

function validateFalseNegativeProtocol(root, sourceIds) {
  const relative = `${WAVE_ROOT}/FALSE-NEGATIVE-AUDIT-PROTOCOL.json`;
  const protocol = readJson(root, relative);
  validateProtocolSources(protocol, sourceIds, relative);
  assert(protocol.object_type === 'false_negative_audit_protocol', `${relative}: wrong object type`);
  assert(protocol.protocol_id === 'CNHR-FN-01', `${relative}: wrong protocol id`);
  assert(protocol.status === 'normative_research_protocol_not_adopted', `${relative}: wrong status`);
  assert(typeof protocol.control_question === 'string' && protocol.control_question.length > 0, `${relative}: missing control question`);
  uniqueStrings(protocol.denominators, `${relative}.denominators`);
  assert(protocol.denominators.length === 13, `${relative}: denominator set must remain 13`);
  assert(Array.isArray(protocol.stages) && protocol.stages.length === 2, `${relative}: stage denominator must remain 2`);
  assert(protocol.stages[0].id === 'FN-A' && protocol.stages[1].id === 'FN-B', `${relative}: stage sequence changed`);
  for (const stage of protocol.stages) {
    assert(typeof stage.purpose === 'string' && stage.purpose.length > 0, `${relative}: ${stage.id} missing purpose`);
    assert(typeof stage.selection_rule === 'string' && stage.selection_rule.length > 0, `${relative}: ${stage.id} missing selection rule`);
    uniqueStrings(stage.required_controls, `${relative}.${stage.id}.required_controls`);
    uniqueStrings(stage.outcomes, `${relative}.${stage.id}.outcomes`);
  }
  assert(Array.isArray(protocol.metrics) && protocol.metrics.length === 6, `${relative}: metric denominator must remain 6`);
  uniqueIds(protocol.metrics, `${relative}.metrics`);
  for (const metric of protocol.metrics) assert(typeof metric.formula === 'string' && metric.formula.length > 0, `${relative}: ${metric.id} missing formula`);
  uniqueStrings(protocol.prohibited_inferences, `${relative}.prohibited_inferences`);
  const joined = stableJson(protocol).toLowerCase();
  assert(!joined.includes('"automatic_hiring": true'), `${relative}: automatic hiring entitlement prohibited`);
  assert(protocol.prohibited_inferences.some(value => value.includes('Every rejected candidate')), `${relative}: universal false-negative refusal missing`);
  assert(protocol.prohibited_inferences.some(value => value.includes('retroactive entitlement')), `${relative}: entitlement refusal missing`);
  return protocol;
}

function validateLanes(root, schema, sourceIds) {
  const actualLaneFiles = listExactJsonFiles(root, `${WAVE_ROOT}/lanes`);
  const expectedLaneFiles = REQUIRED_LANES.map(id => `${id}.json`);
  assert(JSON.stringify(actualLaneFiles) === JSON.stringify(expectedLaneFiles), 'lane directory: missing or extra lane');

  const evidenceIds = new Set();
  return REQUIRED_LANES.map(expectedId => {
    const relative = `${WAVE_ROOT}/lanes/${expectedId}.json`;
    const lane = readJson(root, relative);
    validateAgainstSchema(lane, schema, expectedId);
    assert(lane.lane_id === expectedId, `${relative}: lane id mismatch`);
    validateAuthority(lane.authority, relative);
    const laneSources = uniqueStrings(lane.source_ids, `${relative}.source_ids`);
    for (const id of laneSources) assert(sourceIds.has(id), `${relative}: dangling lane source ${id}`);
    for (const item of [...lane.observations, ...lane.findings]) {
      assert(!evidenceIds.has(item.id), `${relative}: duplicate evidence id ${item.id}`);
      evidenceIds.add(item.id);
      const itemSources = uniqueStrings(item.source_ids, `${relative}.${item.id}.source_ids`);
      for (const id of itemSources) {
        assert(sourceIds.has(id), `${relative}: ${item.id} dangling source ${id}`);
        assert(laneSources.has(id), `${relative}: ${item.id} source ${id} missing from lane source set`);
      }
    }
    assert(lane.terminal_receipt.closed_questions.length === 0, `${relative}: may not close questions`);
    return lane;
  });
}

function validateWave(root, sourceMapHash) {
  const relative = `${WAVE_ROOT}/wave-03.json`;
  const wave = readJson(root, relative);
  assert(wave.schema_version === 1 && wave.wave_id === WAVE_ID && wave.id === WAVE_ID, `${relative}: invalid identity`);
  assert(wave.object_type === 'wave_constitution', `${relative}: wrong object type`);
  assert(wave.accessed === ACCESS_DATE, `${relative}: accessed date drift`);
  validateAuthority(wave.authority, relative);
  assert(wave.parent?.head === PARENT_HEAD, `${relative}: parent head drift`);
  assert(wave.parent?.manifest_path === PARENT_MANIFEST, `${relative}: parent manifest path drift`);
  assert(wave.parent?.manifest_sha256 === PARENT_MANIFEST_SHA256, `${relative}: parent manifest hash drift`);
  assert(wave.parent?.mutation_allowed === false, `${relative}: parent mutation must remain false`);
  assert(wave.boundary?.wave_02_mutation_allowed === false, `${relative}: Wave 02 mutation must remain false`);
  assert(wave.boundary?.control_adoption_allowed === false, `${relative}: control adoption must remain false`);
  for (const key of ['canonical_product_paths_allowed', 'graph_paths_allowed', 'publication_paths_allowed', 'private_source_paths_allowed']) {
    assert(Array.isArray(wave.boundary?.[key]) && wave.boundary[key].length === 0, `${relative}: ${key} must remain empty`);
  }
  assert(wave.counts?.lane_count === 6, `${relative}: lane count drift`);
  assert(wave.counts?.public_source_count === 23 && wave.counts?.private_source_count === 0, `${relative}: source count drift`);
  assert(wave.counts?.observation_count === 36 && wave.counts?.finding_count === 24, `${relative}: evidence denominator drift`);
  assert(wave.counts?.terminal_receipt_count === 6, `${relative}: terminal receipt count drift`);
  assert(wave.counts?.adopted_control_count === 0, `${relative}: adopted controls prohibited`);
  const boundaries = Object.fromEntries(wave.exact_temporal_boundaries.map(item => [item.id, item]));
  assert(boundaries['NYC-LL144']?.date === '2023-07-05' && boundaries['NYC-LL144']?.state === 'operative', `${relative}: NYC boundary drift`);
  assert(boundaries['CO-SB26-189']?.date === '2027-01-01' && boundaries['CO-SB26-189']?.state === 'enacted_pre_effective', `${relative}: Colorado boundary drift`);
  assert(boundaries['EU-AIA-ANNEX-III-EMPLOYMENT']?.date === '2027-12-02' && boundaries['EU-AIA-ANNEX-III-EMPLOYMENT']?.state === 'enacted_pre_effective', `${relative}: EU boundary drift`);
  assert(typeof sourceMapHash === 'string' && sourceMapHash.length === 64, `${relative}: missing source map custody`);
  return wave;
}

export function validateCorpus(root = DEFAULT_ROOT) {
  const parentManifest = validateParent(root);
  const schema = validateSchema(root);
  const sourceCorpus = validateSources(root);
  const wave = validateWave(root, sourceCorpus.mapHash);
  const jurisdictions = validateJurisdictions(root, sourceCorpus.sourceIds);
  const deployment = validateDeploymentProtocol(root, sourceCorpus.sourceIds);
  const falseNegative = validateFalseNegativeProtocol(root, sourceCorpus.sourceIds);
  const lanes = validateLanes(root, schema, sourceCorpus.sourceIds);

  const referenced = new Set([
    ...jurisdictions.states.flatMap(state => state.source_ids),
    ...deployment.source_ids,
    ...falseNegative.source_ids,
    ...lanes.flatMap(lane => lane.source_ids)
  ]);
  for (const source of sourceCorpus.sources) assert(referenced.has(source.id), `source ${source.id}: unreferenced source object`);

  return { parentManifest, schema, sourceCorpus, wave, jurisdictions, deployment, falseNegative, lanes };
}

function countBy(items, key) {
  const result = {};
  for (const item of items) result[item[key]] = (result[item[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function buildSummary(corpus) {
  const laneRows = corpus.lanes.map(lane => ({
    lane_id: lane.lane_id,
    title: lane.title,
    source_count: lane.source_ids.length,
    observation_count: lane.observations.length,
    finding_count: lane.findings.length,
    observation_states: countBy(lane.observations, 'state'),
    finding_statuses: countBy(lane.findings, 'status'),
    open_questions: lane.terminal_receipt.open_questions,
    terminal_state: lane.terminal_receipt.state
  }));
  const findings = corpus.lanes.flatMap(lane => lane.findings);
  const observations = corpus.lanes.flatMap(lane => lane.observations);
  return {
    schema_version: 1,
    wave_id: WAVE_ID,
    generated_from: 'validated current-law, deployment-custody, and false-negative-audit ledgers',
    accessed: ACCESS_DATE,
    authority: corpus.wave.authority,
    parent: {
      head: PARENT_HEAD,
      manifest_sha256: PARENT_MANIFEST_SHA256,
      mutation_count: 0
    },
    source_count: corpus.sourceCorpus.sources.length,
    private_source_count: 0,
    source_statuses: countBy(corpus.sourceCorpus.sources, 'status'),
    source_authority_types: countBy(corpus.sourceCorpus.sources, 'authority_type'),
    source_legal_states: countBy(corpus.sourceCorpus.sources, 'legal_state'),
    source_id_url_map_sha256: corpus.sourceCorpus.mapHash,
    jurisdiction_state_count: corpus.jurisdictions.states.length,
    jurisdiction_states: countBy(corpus.jurisdictions.states, 'state'),
    lane_count: laneRows.length,
    observation_count: observations.length,
    observation_states: countBy(observations, 'state'),
    finding_count: findings.length,
    finding_statuses: countBy(findings, 'status'),
    terminal_receipt_count: laneRows.length,
    deployment_protocol: {
      adopted: corpus.deployment.adopted,
      state_count: corpus.deployment.states.length,
      control_count: corpus.deployment.controls.length,
      adopted_control_count: corpus.deployment.controls.filter(control => control.adopted).length
    },
    false_negative_protocol: {
      adopted: corpus.falseNegative.adopted,
      denominator_count: corpus.falseNegative.denominators.length,
      stage_count: corpus.falseNegative.stages.length,
      metric_count: corpus.falseNegative.metrics.length
    },
    exact_temporal_boundaries: corpus.wave.exact_temporal_boundaries,
    lanes: laneRows
  };
}

function buildManifest(root, summaryBytes) {
  const files = [];
  for (const relative of INPUT_FILES) {
    const bytes = readBytes(root, relative);
    files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  files.push({ path: GENERATED_SUMMARY, bytes: Buffer.byteLength(summaryBytes), sha256: sha256(Buffer.from(summaryBytes, 'utf8')) });
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema_version: 1,
    wave_id: WAVE_ID,
    algorithm: 'sha256',
    exact_file_count: files.length,
    manifest_excludes_self: true,
    parent_wave_02_head: PARENT_HEAD,
    parent_wave_02_manifest_sha256: PARENT_MANIFEST_SHA256,
    files
  };
}

export function generate(root = DEFAULT_ROOT) {
  const corpus = validateCorpus(root);
  const summaryBytes = stableJson(buildSummary(corpus));
  const manifestBytes = stableJson(buildManifest(root, summaryBytes));
  return { corpus, summaryBytes, manifestBytes };
}

export function writeOrCheck(root, mode) {
  const { summaryBytes, manifestBytes } = generate(root);
  const outputs = [
    [GENERATED_SUMMARY, summaryBytes],
    [GENERATED_MANIFEST, manifestBytes]
  ];
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

export function parseArgs(argv) {
  const allowed = new Set(['--write', '--check', '--root']);
  for (const arg of argv) {
    if (arg.startsWith('--')) assert(allowed.has(arg), `unknown argument ${arg}`);
  }
  assert(!(argv.includes('--write') && argv.includes('--check')), 'choose exactly one of --write or --check');
  const mode = argv.includes('--write') ? 'write' : 'check';
  const rootIndex = argv.indexOf('--root');
  if (rootIndex >= 0) {
    assert(rootIndex + 1 < argv.length && !argv[rootIndex + 1].startsWith('--'), '--root requires a value');
    assert(argv.filter(arg => arg === '--root').length === 1, '--root may appear only once');
  }
  const root = rootIndex >= 0 ? path.resolve(argv[rootIndex + 1]) : DEFAULT_ROOT;
  return { mode, root };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { mode, root } = parseArgs(process.argv.slice(2));
    const outputs = writeOrCheck(root, mode);
    const corpus = validateCorpus(root);
    console.log(
      `clifford-number HR governance ${mode}: passed (` +
      `${outputs.length} generated files, ${corpus.lanes.length} lanes, ` +
      `${corpus.sourceCorpus.sources.length} public sources, ` +
      `${corpus.jurisdictions.states.length} jurisdiction states, ` +
      `${corpus.deployment.controls.length} deployment controls unadopted, ` +
      `${corpus.falseNegative.stages.length} false-negative stages unadopted)`
    );
  } catch (error) {
    console.error(`clifford-number HR governance: ${error.message}`);
    process.exitCode = 1;
  }
}
