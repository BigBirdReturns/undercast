#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(here, '..');
const REQUIRED_LANES = ['RD-01', 'RD-02', 'RD-03', 'RD-04', 'RD-05', 'RD-06'];
const AUTHORITY_KEYS = [
  'reviewed_disposition_changes_allowed',
  'complete_compact_findings_allowed',
  'racial_order_findings_allowed',
  'prevalence_findings_allowed',
  'coordination_findings_allowed',
  'common_purpose_findings_allowed',
  'graph_effects_allowed',
  'publication_effects_allowed'
];
const LANE_SCHEMA = 'schema/residual-denominator-lane.schema.json';
const GENERATED_SUMMARY = 'data/review/residual-denominator/WAVE-01-SUMMARY.json';
const GENERATED_MANIFEST = 'data/review/residual-denominator/MANIFEST.json';
const INPUT_FILES = [
  LANE_SCHEMA,
  'data/review/residual-denominator/wave-01.json',
  ...REQUIRED_LANES.map(id => `data/review/residual-denominator/lanes/${id}.json`),
  'docs/research/residual-denominator/WAVE-01.md',
  'scripts/residual-denominator.mjs',
  'test/residual-denominator-fixtures.mjs'
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
  const full = path.join(root, relativePath);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function typeMatches(value, expected) {
  return valueType(value) === expected;
}

function deepKey(value) {
  return JSON.stringify(sortDeep(value));
}

export function validateAgainstSchema(value, schema, scope = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error(`${scope}: schema node must be an object`);
  }
  const types = schema.type === undefined ? null : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types) {
    assert(types.some(type => typeMatches(value, type)), `${scope}: expected type ${types.join('|')}, got ${valueType(value)}`);
  }
  if (Object.hasOwn(schema, 'const')) {
    assert(deepKey(value) === deepKey(schema.const), `${scope}: value must equal schema const`);
  }
  if (Array.isArray(schema.enum)) {
    assert(schema.enum.some(candidate => deepKey(candidate) === deepKey(value)), `${scope}: value not in schema enum`);
  }
  if (schema.minLength !== undefined || schema.pattern !== undefined) {
    assert(typeof value === 'string', `${scope}: string constraint applied to non-string`);
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${scope}: string shorter than minLength ${schema.minLength}`);
    if (schema.pattern !== undefined) assert(new RegExp(schema.pattern).test(value), `${scope}: string does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${scope}: array shorter than minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, `${scope}: array longer than maxItems ${schema.maxItems}`);
    if (schema.uniqueItems) {
      const keys = value.map(deepKey);
      assert(new Set(keys).size === keys.length, `${scope}: array items must be unique`);
    }
    if (schema.items) value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${scope}[${index}]`));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      assert(Object.hasOwn(value, required), `${scope}: missing required property ${required}`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert(Object.hasOwn(properties, key), `${scope}: additional property ${key} is not allowed`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateAgainstSchema(value[key], child, `${scope}.${key}`);
    }
  }
  return value;
}

function validateSchemaContract(schema) {
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${LANE_SCHEMA}: unsupported schema dialect`);
  assert(schema.type === 'object' && schema.additionalProperties === false, `${LANE_SCHEMA}: lane root must remain a closed object`);
  const properties = schema.properties || {};
  for (const required of ['authority', 'sources', 'observations', 'findings', 'terminal_receipt']) {
    assert(properties[required], `${LANE_SCHEMA}: missing protected property ${required}`);
  }
  const findingSources = properties.findings?.items?.properties?.source_ids;
  const observationSources = properties.observations?.items?.properties?.source_ids;
  assert(findingSources?.minItems === 1 && findingSources?.uniqueItems === true, `${LANE_SCHEMA}: finding source_ids must require one or more unique sources`);
  assert(observationSources?.minItems === 1 && observationSources?.uniqueItems === true, `${LANE_SCHEMA}: observation source_ids must require one or more unique sources`);
  assert(properties.sources?.items?.additionalProperties === false, `${LANE_SCHEMA}: source objects must remain closed`);
  assert(properties.terminal_receipt?.properties?.closed_residual_classes?.maxItems === 0, `${LANE_SCHEMA}: residual closure must remain impossible`);
  for (const key of AUTHORITY_KEYS) {
    assert(properties.authority?.properties?.[key]?.const === false, `${LANE_SCHEMA}: authority key ${key} must remain false`);
  }
  return schema;
}

function validateAuthority(authority, scope) {
  assert(authority && typeof authority === 'object' && !Array.isArray(authority), `${scope}: authority must be an object`);
  for (const key of AUTHORITY_KEYS) {
    assert(Object.hasOwn(authority, key), `${scope}: missing authority key ${key}`);
    assert(authority[key] === false, `${scope}: ${key} must remain false`);
  }
  assert(Object.keys(authority).length === AUTHORITY_KEYS.length, `${scope}: unexpected authority key`);
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

function assertUniqueStrings(items, scope) {
  assert(Array.isArray(items), `${scope}: expected an array`);
  assert(items.every(item => typeof item === 'string' && item.length > 0), `${scope}: values must be non-empty strings`);
  assert(new Set(items).size === items.length, `${scope}: values must be unique`);
}

export function validateLane(lane, expectedId, schema) {
  const scope = expectedId;
  validateAgainstSchema(lane, schema, scope);
  assert(lane.schema_version === 1, `${scope}: schema_version must be 1`);
  assert(lane.wave_id === 'RD-W01', `${scope}: wave_id must be RD-W01`);
  assert(lane.lane_id === expectedId, `${scope}: lane_id mismatch`);
  validateAuthority(lane.authority, scope);

  const sourceIds = uniqueIds(lane.sources, `${scope}.sources`);
  for (const source of lane.sources) {
    assert(source.url.startsWith('https://'), `${scope}: source ${source.id} must use https`);
    assert(source.accessed === '2026-08-01', `${scope}: source ${source.id} must pin accessed date`);
  }

  uniqueIds([...lane.observations, ...lane.findings], `${scope}.evidence_items`);
  for (const item of [...lane.observations, ...lane.findings]) {
    assert(item.source_ids.length > 0, `${scope}: ${item.id} must cite at least one source`);
    for (const sourceId of item.source_ids) {
      assert(sourceIds.has(sourceId), `${scope}: ${item.id} has dangling source ${sourceId}`);
    }
  }

  const receipt = lane.terminal_receipt;
  assert(receipt.closed_residual_classes.length === 0, `${scope}: this wave may not close residual classes`);
  assertUniqueStrings(receipt.open_residual_classes, `${scope}.terminal_receipt.open_residual_classes`);
  assertUniqueStrings(receipt.prohibited_inferences, `${scope}.terminal_receipt.prohibited_inferences`);
  return lane;
}

export function validateCorpus(root) {
  const schema = validateSchemaContract(readJson(root, LANE_SCHEMA));
  const wave = readJson(root, 'data/review/residual-denominator/wave-01.json');
  assert(wave.schema_version === 1 && wave.id === 'RD-W01', 'wave-01.json: invalid identity');
  validateAuthority(wave.authority, 'wave-01.json');
  assert(wave.denominator.canonical_residual_classes === 42, 'wave-01.json: canonical denominator must remain 42');
  assert(wave.denominator.closed_residual_classes === 0, 'wave-01.json: closed denominator must remain 0');
  assert(wave.denominator.open_residual_classes === 42, 'wave-01.json: open denominator must remain 42');
  assert(JSON.stringify(wave.execution.lanes) === JSON.stringify(REQUIRED_LANES), 'wave-01.json: lane set or order changed');
  assert(wave.execution.required_terminal_receipts === 6, 'wave-01.json: six receipts required');
  assert(wave.boundary?.review_status === 'evidence_only_draft', 'wave-01.json: review status must remain evidence_only_draft');
  assert(Array.isArray(wave.boundary?.canonical_product_paths_allowed) && wave.boundary.canonical_product_paths_allowed.length === 0, 'wave-01.json: canonical product paths must remain empty');
  assert(Array.isArray(wave.boundary?.graph_paths_allowed) && wave.boundary.graph_paths_allowed.length === 0, 'wave-01.json: graph paths must remain empty');
  assert(Array.isArray(wave.boundary?.publication_paths_allowed) && wave.boundary.publication_paths_allowed.length === 0, 'wave-01.json: publication paths must remain empty');

  const laneDirectory = path.join(root, 'data/review/residual-denominator/lanes');
  const expectedFiles = REQUIRED_LANES.map(id => `${id}.json`).sort();
  const actualFiles = fs.readdirSync(laneDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name)
    .sort();
  assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), `lane directory must contain exactly ${expectedFiles.join(', ')}`);

  const lanes = REQUIRED_LANES.map(id => validateLane(readJson(root, `data/review/residual-denominator/lanes/${id}.json`), id, schema));
  return { wave, lanes };
}

function buildSummary(corpus) {
  const findingCounts = {};
  const observationCounts = {};
  const lanes = corpus.lanes.map(lane => {
    for (const item of lane.findings) findingCounts[item.status] = (findingCounts[item.status] || 0) + 1;
    for (const item of lane.observations) observationCounts[item.state] = (observationCounts[item.state] || 0) + 1;
    return {
      lane_id: lane.lane_id,
      source_count: lane.sources.length,
      observation_count: lane.observations.length,
      finding_count: lane.findings.length,
      terminal_state: lane.terminal_receipt.state,
      closed_residual_classes: lane.terminal_receipt.closed_residual_classes.length,
      open_residual_classes: lane.terminal_receipt.open_residual_classes
    };
  });
  return {
    schema_version: 1,
    wave_id: 'RD-W01',
    generated_from: 'validated source ledgers',
    authority: corpus.wave.authority,
    denominator: corpus.wave.denominator,
    lane_count: lanes.length,
    terminal_receipt_count: lanes.length,
    source_count: corpus.lanes.reduce((sum, lane) => sum + lane.sources.length, 0),
    observation_count: corpus.lanes.reduce((sum, lane) => sum + lane.observations.length, 0),
    finding_count: corpus.lanes.reduce((sum, lane) => sum + lane.findings.length, 0),
    observation_states: observationCounts,
    finding_statuses: findingCounts,
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
    wave_id: 'RD-W01',
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

export function parseArgs(argv) {
  let mode = 'check';
  let modeSeen = false;
  let root = DEFAULT_ROOT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write' || arg === '--check') {
      assert(!modeSeen, 'choose exactly one of --write or --check');
      mode = arg.slice(2);
      modeSeen = true;
      continue;
    }
    if (arg === '--root') {
      const value = argv[index + 1];
      assert(value && !value.startsWith('--'), '--root requires a value');
      root = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  return { mode, root };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { mode, root } = parseArgs(process.argv.slice(2));
    const outputs = writeOrCheck(root, mode);
    console.log(`residual-denominator ${mode}: passed (${outputs.length} generated files, 6 terminal receipts, 0 residual classes closed)`);
  } catch (error) {
    console.error(`residual-denominator: ${error.message}`);
    process.exitCode = 1;
  }
}
