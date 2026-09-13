#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, '..');
export const PROTOCOL_PATH = "data/research/residual-denominator/wave-03/rd-03/protocol.json";
export const SCHEMA_PATH = "schema/rd-wave03-rd03-intake.schema.json";
export const MATRIX_PATH = null;
export const WORKFLOW_PATH = ".github/workflows/rd-wave03-rd03-intake.yml";
export const EXPECTED_PATHS = ["data/research/residual-denominator/wave-03/rd-03/protocol.json", "schema/rd-wave03-rd03-intake.schema.json", "scripts/rd-wave03-rd03-build.mjs", "scripts/rd-wave03-rd03-validate.mjs", "test/rd-wave03-rd03-adversarial.mjs", ".github/workflows/rd-wave03-rd03-intake.yml", "docs/research/residual-denominator/wave-03/RD-03.md"];
const EXPECTED_SCHEMA_SHA256 = "922c447f6055675561a437561d7010d74dc8940f765f2c7704a3ef8f21293b54";
const EXPECTED_LANE = "RD-03";
const EXPECTED_UNIT_COUNT = 5;
const EXPECTED_FIELD_COUNT = 11;
const EXPECTED_CELL_COUNT = 55;
const EXPECTED_OFFICIAL_COUNT = 5;
const EXPECTED_CANDIDATE_COUNT = 45;
const EXPECTED_TOTAL_COUNT = 50;
const EXPECTED_MATRIX_MODE = "embedded_immutable_input";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(root, relativePath) {
  try {
    return JSON.parse(readText(root, relativePath));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

function exactKeys(value, keys, scope) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${scope}: expected object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${scope}: expected exact keys ${expected.join(', ')}, got ${actual.join(', ')}`);
}

function uniqueStrings(values, scope) {
  assert(Array.isArray(values), `${scope}: expected array`);
  assert(values.every(value => typeof value === 'string' && value.length > 0), `${scope}: values must be non-empty strings`);
  assert(new Set(values).size === values.length, `${scope}: values must be unique`);
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function schemaTypeMatches(value, expected) {
  return valueType(value) === expected;
}

function deepKey(value) {
  return JSON.stringify(sortDeep(value));
}

export function validateAgainstSchema(value, schema, scope = '$') {
  assert(schema && typeof schema === 'object' && !Array.isArray(schema), `${scope}: schema node must be an object`);
  const types = schema.type === undefined ? null : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types) assert(types.some(type => schemaTypeMatches(value, type)), `${scope}: expected ${types.join('|')}, got ${valueType(value)}`);
  if (Object.hasOwn(schema, 'const')) assert(deepKey(value) === deepKey(schema.const), `${scope}: value differs from const`);
  if (Array.isArray(schema.enum)) assert(schema.enum.some(candidate => deepKey(candidate) === deepKey(value)), `${scope}: value not in enum`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined) assert(value.length >= schema.minLength, `${scope}: shorter than minLength`);
    if (schema.pattern !== undefined) assert(new RegExp(schema.pattern).test(value), `${scope}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined) assert(value >= schema.minimum, `${scope}: below minimum`);
    if (schema.maximum !== undefined) assert(value <= schema.maximum, `${scope}: above maximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined) assert(value.length >= schema.minItems, `${scope}: fewer than minItems`);
    if (schema.maxItems !== undefined) assert(value.length <= schema.maxItems, `${scope}: more than maxItems`);
    if (schema.uniqueItems) assert(new Set(value.map(deepKey)).size === value.length, `${scope}: array items must be unique`);
    if (schema.items) value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${scope}[${index}]`));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) assert(Object.hasOwn(value, required), `${scope}: missing ${required}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert(Object.hasOwn(properties, key), `${scope}: additional property ${key}`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateAgainstSchema(value[key], child, `${scope}.${key}`);
    }
  }
  return value;
}

function lineHash(values) {
  return sha256(`${values.join('\n')}\n`);
}

export function matrixCellIds(protocol, fieldIds) {
  return protocol.frozen_units.ids.flatMap(unitId => fieldIds.map(fieldId => `${protocol.lane_id}:${unitId}:${fieldId}`));
}

function expandCandidateRoutes(protocol, fieldIds) {
  const family = protocol.routes.candidate_family;
  const routes = [];
  let index = 0;
  outer:
  for (const unitId of protocol.frozen_units.ids) {
    for (const fieldId of fieldIds) {
      for (const variant of family.variants) {
        if (index >= family.take) break outer;
        const url = new URL(family.base_url);
        url.searchParams.set('affiliate', family.affiliate);
        url.searchParams.set('query', `site:${family.site_filter} ${family.query_prefix} ${unitId} ${fieldId} ${variant}`);
        routes.push({
          route_id: `${family.route_id_prefix}-${String(index + 1).padStart(4, '0')}`,
          route_class: 'candidate',
          cell_id: `${protocol.lane_id}:${unitId}:${fieldId}`,
          method: protocol.request_policy.method,
          url: url.toString(),
          maximum_attempts: protocol.request_policy.maximum_attempts,
          timeout_ms: protocol.request_policy.timeout_ms,
          maximum_body_bytes: protocol.request_policy.maximum_body_bytes,
          concurrency: protocol.request_policy.concurrency,
          result_spawned_followups: protocol.request_policy.result_spawned_followups,
          automatic_second_pass: protocol.request_policy.automatic_second_pass
        });
        index += 1;
      }
    }
  }
  assert(index === family.take, `${EXPECTED_LANE}: candidate family expansion produced ${index}, expected ${family.take}`);
  return routes;
}

export function expandRoutes(protocol, fieldIds) {
  const policy = protocol.request_policy;
  const official = protocol.routes.official.map(route => ({
    route_id: route.route_id,
    route_class: 'official',
    cell_id: route.cell_id,
    method: policy.method,
    url: route.url,
    maximum_attempts: policy.maximum_attempts,
    timeout_ms: policy.timeout_ms,
    maximum_body_bytes: policy.maximum_body_bytes,
    concurrency: policy.concurrency,
    result_spawned_followups: policy.result_spawned_followups,
    automatic_second_pass: policy.automatic_second_pass
  }));
  return [...official, ...expandCandidateRoutes(protocol, fieldIds)];
}

function validateMatrixContract(root, protocol) {
  if (EXPECTED_MATRIX_MODE === 'separate_immutable_input') {
    assert(MATRIX_PATH, `${EXPECTED_LANE}: missing matrix path constant`);
    assert(protocol.matrix.contract_mode === EXPECTED_MATRIX_MODE, `${EXPECTED_LANE}: matrix mode changed`);
    assert(protocol.matrix.contract_path === MATRIX_PATH, `${EXPECTED_LANE}: matrix path changed`);
    const bytes = readText(root, MATRIX_PATH);
    assert(sha256(bytes) === protocol.matrix.contract_sha256, `${EXPECTED_LANE}: matrix contract bytes changed`);
    const matrix = JSON.parse(bytes);
    exactKeys(matrix, ['schema_version','wave_id','lane_id','contract_id','immutable','unit_ids','field_ids','required_cells','cell_ids_sha256'], `${EXPECTED_LANE}.matrix_contract`);
    assert(matrix.schema_version === 1 && matrix.wave_id === 'RD-W03' && matrix.lane_id === EXPECTED_LANE, `${EXPECTED_LANE}: matrix identity changed`);
    assert(matrix.immutable === true, `${EXPECTED_LANE}: matrix must remain immutable`);
    assert(JSON.stringify(matrix.unit_ids) === JSON.stringify(protocol.frozen_units.ids), `${EXPECTED_LANE}: matrix unit order changed`);
    uniqueStrings(matrix.field_ids, `${EXPECTED_LANE}.matrix.field_ids`);
    assert(matrix.field_ids.length === EXPECTED_FIELD_COUNT, `${EXPECTED_LANE}: matrix field count changed`);
    assert(matrix.required_cells === EXPECTED_CELL_COUNT, `${EXPECTED_LANE}: matrix cell count changed`);
    const cells = matrixCellIds(protocol, matrix.field_ids);
    assert(lineHash(cells) === matrix.cell_ids_sha256, `${EXPECTED_LANE}: matrix cell hash changed`);
    assert(protocol.matrix.embedded_field_ids === null, `${EXPECTED_LANE}: separate matrix cannot embed fields`);
    return matrix.field_ids;
  }

  assert(protocol.matrix.contract_mode === 'embedded_immutable_input', `${EXPECTED_LANE}: embedded matrix mode changed`);
  assert(protocol.matrix.contract_path === null && protocol.matrix.contract_sha256 === null, `${EXPECTED_LANE}: embedded matrix cannot point to a mutable path`);
  uniqueStrings(protocol.matrix.embedded_field_ids, `${EXPECTED_LANE}.matrix.embedded_field_ids`);
  assert(protocol.matrix.embedded_field_ids.length === EXPECTED_FIELD_COUNT, `${EXPECTED_LANE}: embedded field count changed`);
  return protocol.matrix.embedded_field_ids;
}

function validateWorkflow(root) {
  const workflow = readText(root, WORKFLOW_PATH);
  assert(/permissions:\s*\n\s*contents:\s*read\b/.test(workflow), `${WORKFLOW_PATH}: workflow must be contents-read only`);
  assert(!/\bcontents:\s*write\b|\bissues:\s*write\b|\bpull-requests:\s*write\b/.test(workflow), `${WORKFLOW_PATH}: write permission detected`);
  assert(!/\bworkflow_dispatch\b|\brepository_dispatch\b|\bschedule:\b/.test(workflow), `${WORKFLOW_PATH}: unbounded trigger detected`);
  assert(!/\bgh\s+|\bgit\s+push\b|curl[^\n]*-[Xx]\s*(POST|PUT|PATCH|DELETE)/.test(workflow), `${WORKFLOW_PATH}: write-capable command detected`);
}

export function loadProtocol(root = DEFAULT_ROOT) {
  return readJson(root, PROTOCOL_PATH);
}

export function validateProtocol(protocol, { root = DEFAULT_ROOT } = {}) {
  const schemaBytes = readText(root, SCHEMA_PATH);
  assert(sha256(schemaBytes) === EXPECTED_SCHEMA_SHA256, `${SCHEMA_PATH}: closed schema bytes changed`);
  const schema = JSON.parse(schemaBytes);
  validateAgainstSchema(protocol, schema, EXPECTED_LANE);

  assert(protocol.schema_version === 1 && protocol.wave_id === 'RD-W03' && protocol.lane_id === EXPECTED_LANE, `${EXPECTED_LANE}: identity changed`);
  assert(protocol.status === 'pre_execution_intake', `${EXPECTED_LANE}: status changed`);
  assert(JSON.stringify(protocol.permanent_paths) === JSON.stringify(EXPECTED_PATHS), `${EXPECTED_LANE}: permanent path denominator changed`);
  uniqueStrings(protocol.permanent_paths, `${EXPECTED_LANE}.permanent_paths`);
  for (const relativePath of protocol.permanent_paths) {
    assert(!/(^|\/)(tmp|transport|carrier|materializer|controller|trigger)(\/|\.|-|$)/i.test(relativePath), `${EXPECTED_LANE}: transport-like permanent path ${relativePath}`);
    assert(fs.existsSync(path.join(root, relativePath)), `${EXPECTED_LANE}: missing permanent path ${relativePath}`);
  }

  uniqueStrings(protocol.frozen_units.ids, `${EXPECTED_LANE}.frozen_units.ids`);
  assert(protocol.frozen_units.count === EXPECTED_UNIT_COUNT && protocol.frozen_units.ids.length === EXPECTED_UNIT_COUNT, `${EXPECTED_LANE}: frozen unit denominator changed`);

  const fieldIds = validateMatrixContract(root, protocol);
  const cells = matrixCellIds(protocol, fieldIds);
  assert(protocol.matrix.field_count === EXPECTED_FIELD_COUNT, `${EXPECTED_LANE}: field denominator changed`);
  assert(protocol.matrix.required_cells === EXPECTED_CELL_COUNT && cells.length === EXPECTED_CELL_COUNT, `${EXPECTED_LANE}: matrix denominator changed`);
  assert(lineHash(cells) === protocol.matrix.cell_ids_sha256, `${EXPECTED_LANE}: matrix cell hash changed`);

  const routes = expandRoutes(protocol, fieldIds);
  assert(protocol.routes.official_count === EXPECTED_OFFICIAL_COUNT, `${EXPECTED_LANE}: official route denominator changed`);
  assert(protocol.routes.candidate_count === EXPECTED_CANDIDATE_COUNT, `${EXPECTED_LANE}: candidate route denominator changed`);
  assert(protocol.routes.total_count === EXPECTED_TOTAL_COUNT && routes.length === EXPECTED_TOTAL_COUNT, `${EXPECTED_LANE}: total route denominator changed`);
  assert(protocol.routes.official.length === EXPECTED_OFFICIAL_COUNT, `${EXPECTED_LANE}: official route array changed`);
  assert(protocol.routes.candidate_family.take === EXPECTED_CANDIDATE_COUNT, `${EXPECTED_LANE}: candidate route take changed`);

  const cellSet = new Set(cells);
  const ids = new Set();
  const urls = new Set();
  for (const route of routes) {
    assert(!ids.has(route.route_id), `${EXPECTED_LANE}: duplicate route id ${route.route_id}`);
    ids.add(route.route_id);
    assert(!urls.has(route.url), `${EXPECTED_LANE}: duplicate route URL ${route.url}`);
    urls.add(route.url);
    assert(cellSet.has(route.cell_id), `${EXPECTED_LANE}: route ${route.route_id} targets unknown cell`);
    const parsed = new URL(route.url);
    assert(parsed.protocol === 'https:', `${EXPECTED_LANE}: route ${route.route_id} must use HTTPS`);
    assert(route.method === 'GET' && route.maximum_attempts === 1, `${EXPECTED_LANE}: route ${route.route_id} changed request semantics`);
    assert(route.timeout_ms === 45000 && route.maximum_body_bytes === 5242880 && route.concurrency === 2, `${EXPECTED_LANE}: route ${route.route_id} changed bounds`);
    assert(route.result_spawned_followups === 0 && route.automatic_second_pass === false, `${EXPECTED_LANE}: route ${route.route_id} may not spawn work`);
  }
  assert(lineHash(routes.map(route => route.route_id)) === protocol.routes.expanded_route_ids_sha256, `${EXPECTED_LANE}: expanded route-id hash changed`);
  assert(lineHash(routes.map(route => route.url)) === protocol.routes.expanded_route_urls_sha256, `${EXPECTED_LANE}: expanded route-URL hash changed`);

  assert(JSON.stringify(protocol.admission.required_bindings) === JSON.stringify(['official_object','unit_identity','event_class','chronology','bytes']), `${EXPECTED_LANE}: admission bindings changed`);
  assert(protocol.admission.candidate_result_is_evidence === false && protocol.admission.automatic_admission === false && protocol.admission.exact_capture_required === true, `${EXPECTED_LANE}: candidate admission boundary changed`);
  assert(protocol.authority.outside_human_dependency === false && protocol.authority.external_contacts === 0 && protocol.authority.external_reviews === 0, `${EXPECTED_LANE}: outside-human boundary changed`);
  assert(protocol.authority.publication_effect === 'none' && protocol.authority.adoption_effect === 'none' && protocol.authority.graph_effect === 'none', `${EXPECTED_LANE}: authority effect changed`);
  assert(protocol.closure.classes_closed === 0 && protocol.closure.allow_at_intake === false, `${EXPECTED_LANE}: intake may not close classes`);

  validateWorkflow(root);
  return { protocol, fieldIds, cells, routes };
}

export function validateRoot(root = DEFAULT_ROOT) {
  return validateProtocol(loadProtocol(root), { root });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateRoot(DEFAULT_ROOT);
    console.log(`${EXPECTED_LANE} intake validation: passed (${result.protocol.frozen_units.count} units, ${result.cells.length} cells, ${result.routes.length} routes, 0 classes closed)`);
  } catch (error) {
    console.error(`${EXPECTED_LANE} intake validation: ${error.message}`);
    process.exit(1);
  }
}
