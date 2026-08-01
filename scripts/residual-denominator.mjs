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
const GENERATED_SUMMARY = 'data/review/residual-denominator/WAVE-01-SUMMARY.json';
const GENERATED_MANIFEST = 'data/review/residual-denominator/MANIFEST.json';
const INPUT_FILES = [
  'schema/residual-denominator-lane.schema.json',
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

export function validateLane(lane, expectedId) {
  const scope = expectedId;
  assert(lane.schema_version === 1, `${scope}: schema_version must be 1`);
  assert(lane.wave_id === 'RD-W01', `${scope}: wave_id must be RD-W01`);
  assert(lane.lane_id === expectedId, `${scope}: lane_id mismatch`);
  assert(typeof lane.title === 'string' && lane.title.length > 0, `${scope}: missing title`);
  assert(typeof lane.decisive_join === 'string' && lane.decisive_join.length > 0, `${scope}: missing decisive_join`);
  assert(typeof lane.selection_rule === 'string' && lane.selection_rule.length > 0, `${scope}: missing selection_rule`);
  validateAuthority(lane.authority, scope);

  assert(Array.isArray(lane.sources) && lane.sources.length > 0, `${scope}: sources must be non-empty`);
  const sourceIds = uniqueIds(lane.sources, `${scope}.sources`);
  for (const source of lane.sources) {
    assert(typeof source.url === 'string' && source.url.startsWith('https://'), `${scope}: source ${source.id} must use https`);
    assert(source.accessed === '2026-08-01', `${scope}: source ${source.id} must pin accessed date`);
    assert(Array.isArray(source.supports) && source.supports.length > 0, `${scope}: source ${source.id} missing supports`);
    assert(Array.isArray(source.limits) && source.limits.length > 0, `${scope}: source ${source.id} missing limits`);
  }

  assert(Array.isArray(lane.observations) && lane.observations.length > 0, `${scope}: observations must be non-empty`);
  uniqueIds(lane.observations, `${scope}.observations`);
  assert(Array.isArray(lane.findings) && lane.findings.length > 0, `${scope}: findings must be non-empty`);
  uniqueIds(lane.findings, `${scope}.findings`);
  for (const item of [...lane.observations, ...lane.findings]) {
    assert(Array.isArray(item.source_ids), `${scope}: ${item.id} source_ids must be an array`);
    for (const sourceId of item.source_ids) {
      assert(sourceIds.has(sourceId), `${scope}: ${item.id} has dangling source ${sourceId}`);
    }
  }

  const receipt = lane.terminal_receipt;
  assert(receipt && typeof receipt.state === 'string' && receipt.state.length > 0, `${scope}: terminal receipt missing state`);
  assert(Array.isArray(receipt.closed_residual_classes), `${scope}: closed_residual_classes must be an array`);
  assert(receipt.closed_residual_classes.length === 0, `${scope}: this wave may not close residual classes`);
  assert(Array.isArray(receipt.open_residual_classes) && receipt.open_residual_classes.length > 0, `${scope}: open_residual_classes must be non-empty`);
  assert(Array.isArray(receipt.prohibited_inferences) && receipt.prohibited_inferences.length > 0, `${scope}: prohibited_inferences must be non-empty`);
  return lane;
}

export function validateCorpus(root) {
  const wave = readJson(root, 'data/review/residual-denominator/wave-01.json');
  assert(wave.schema_version === 1 && wave.id === 'RD-W01', 'wave-01.json: invalid identity');
  validateAuthority(wave.authority, 'wave-01.json');
  assert(wave.denominator.canonical_residual_classes === 42, 'wave-01.json: canonical denominator must remain 42');
  assert(wave.denominator.closed_residual_classes === 0, 'wave-01.json: closed denominator must remain 0');
  assert(wave.denominator.open_residual_classes === 42, 'wave-01.json: open denominator must remain 42');
  assert(JSON.stringify(wave.execution.lanes) === JSON.stringify(REQUIRED_LANES), 'wave-01.json: lane set or order changed');
  assert(wave.execution.required_terminal_receipts === 6, 'wave-01.json: six receipts required');

  const lanes = REQUIRED_LANES.map(id => {
    const relative = `data/review/residual-denominator/lanes/${id}.json`;
    assert(fs.existsSync(path.join(root, relative)), `${relative}: missing required lane`);
    return validateLane(readJson(root, relative), id);
  });
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
    console.log(`residual-denominator ${mode}: passed (${outputs.length} generated files, 6 terminal receipts, 0 residual classes closed)`);
  } catch (error) {
    console.error(`residual-denominator: ${error.message}`);
    process.exitCode = 1;
  }
}
