#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ROOT,
  stableJson,
  sha256,
  validateRoot
} from "./rd-wave03-rd01-validate.mjs";

const EXPECTED_LANE = "RD-01";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArgs(argv) {
  let mode = 'check';
  let modeSeen = false;
  let out = null;
  let receipt = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--check','--print','--execute'].includes(arg)) {
      assert(!modeSeen, 'choose exactly one mode');
      mode = arg.slice(2);
      modeSeen = true;
      continue;
    }
    if (arg === '--verify-receipt') {
      assert(!modeSeen, 'choose exactly one mode');
      const value = argv[index + 1];
      assert(value && !value.startsWith('--'), '--verify-receipt requires a path');
      mode = 'verify-receipt';
      receipt = path.resolve(value);
      modeSeen = true;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      assert(value && !value.startsWith('--'), '--out requires a directory');
      out = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  if (mode === 'execute') assert(out, '--execute requires --out');
  if (mode !== 'execute') assert(out === null, '--out is valid only with --execute');
  return { mode, out, receipt };
}

function buildPlan(root = DEFAULT_ROOT) {
  const { protocol, fieldIds, cells, routes } = validateRoot(root);
  return {
    schema_version: 1,
    wave_id: protocol.wave_id,
    lane_id: protocol.lane_id,
    status: protocol.status,
    protocol_sha256: sha256(stableJson(protocol)),
    matrix: {
      frozen_units: protocol.frozen_units.count,
      field_count: fieldIds.length,
      required_cells: cells.length,
      cell_ids_sha256: protocol.matrix.cell_ids_sha256
    },
    routes: {
      official: protocol.routes.official_count,
      candidate: protocol.routes.candidate_count,
      total: routes.length,
      route_ids_sha256: protocol.routes.expanded_route_ids_sha256,
      route_urls_sha256: protocol.routes.expanded_route_urls_sha256
    },
    request_policy: protocol.request_policy,
    admission: protocol.admission,
    authority: protocol.authority,
    closure: protocol.closure,
    expanded_routes: routes
  };
}

async function readBoundedBody(response, maximumBytes) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  if (!response.body) return { bytes: 0, sha256: sha256(Buffer.alloc(0)), body_limit_exceeded: false };
  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel('maximum body exceeded');
      return { bytes, sha256: null, body_limit_exceeded: true };
    }
    hash.update(value);
  }
  return { bytes, sha256: hash.digest('hex'), body_limit_exceeded: false };
}

async function executeRoute(route) {
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), route.timeout_ms);
  try {
    const response = await fetch(route.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/json,application/pdf;q=0.9,*/*;q=0.1',
        'user-agent': `UnderCast-${EXPECTED_LANE}-Wave03-public-source-intake`
      }
    });
    const body = await readBoundedBody(response, route.maximum_body_bytes);
    const outcome = body.body_limit_exceeded
      ? 'body_limit_exceeded'
      : (response.status >= 200 && response.status < 300 ? 'candidate_response_observed' : 'http_response_without_candidate');
    return {
      route_id: route.route_id,
      route_class: route.route_class,
      cell_id: route.cell_id,
      requested_url: route.url,
      final_url: response.url || route.url,
      attempt_count: 1,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome,
      http_status: response.status,
      content_type: response.headers.get('content-type'),
      bytes: body.bytes,
      body_sha256: body.sha256,
      body_limit_exceeded: body.body_limit_exceeded,
      evidence_admitted: false,
      followups_spawned: 0
    };
  } catch (error) {
    const timeout = controller.signal.aborted;
    return {
      route_id: route.route_id,
      route_class: route.route_class,
      cell_id: route.cell_id,
      requested_url: route.url,
      final_url: null,
      attempt_count: 1,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      outcome: timeout ? 'timeout' : 'network_error',
      http_status: null,
      content_type: null,
      bytes: 0,
      body_sha256: null,
      body_limit_exceeded: false,
      evidence_admitted: false,
      followups_spawned: 0,
      error_class: error?.name || 'Error',
      error_message: String(error?.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function executeWithConcurrency(routes, concurrency) {
  const results = new Array(routes.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= routes.length) return;
      results[index] = await executeRoute(routes[index]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function classifyCells(cells, routeResults) {
  const byCell = new Map(cells.map(cellId => [cellId, []]));
  for (const result of routeResults) byCell.get(result.cell_id)?.push(result);
  return cells.map(cellId => {
    const results = byCell.get(cellId);
    let state;
    if (results.length === 0) {
      state = 'no_predeclared_route';
    } else if (results.some(result => result.outcome === 'candidate_response_observed')) {
      state = 'candidate_response_observed';
    } else if (results.every(result => ['timeout','network_error','body_limit_exceeded'].includes(result.outcome))) {
      state = 'route_exhausted';
    } else {
      state = 'route_completed_without_admissible_candidate';
    }
    return {
      cell_id: cellId,
      state,
      route_ids: results.map(result => result.route_id),
      candidate_only: true,
      evidence_admitted: false,
      closure_eligible: false
    };
  });
}

async function executePlan(root, out) {
  const { protocol, cells, routes } = validateRoot(root);
  const plan = buildPlan(root);
  const startedAt = new Date().toISOString();
  const routeResults = await executeWithConcurrency(routes, protocol.request_policy.concurrency);
  const classifications = classifyCells(cells, routeResults);
  const receipt = {
    schema_version: 1,
    wave_id: protocol.wave_id,
    lane_id: protocol.lane_id,
    exact_head: process.env.GITHUB_SHA || null,
    workflow_run_id: process.env.GITHUB_RUN_ID || null,
    protocol_sha256: plan.protocol_sha256,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    request_policy: protocol.request_policy,
    route_result_count: routeResults.length,
    route_results: routeResults,
    matrix: {
      required_cells: cells.length,
      classified_cells: classifications.length,
      evidence_admitted_cells: 0,
      closed_cells: 0,
      classifications
    },
    authority: protocol.authority,
    closure: {
      classes_closed: 0,
      closure_attempted: false,
      law: protocol.closure.law
    }
  };
  verifyReceiptObject(receipt, root);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'plan.json'), stableJson(plan));
  fs.writeFileSync(path.join(out, 'receipt.json'), stableJson(receipt));
  return receipt;
}

function verifyReceiptObject(receipt, root = DEFAULT_ROOT) {
  const { protocol, cells, routes } = validateRoot(root);
  const plan = buildPlan(root);
  assert(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'receipt must be an object');
  assert(receipt.schema_version === 1 && receipt.wave_id === 'RD-W03' && receipt.lane_id === EXPECTED_LANE, 'receipt identity mismatch');
  assert(receipt.protocol_sha256 === plan.protocol_sha256, 'receipt protocol hash mismatch');
  assert(receipt.route_result_count === routes.length && receipt.route_results.length === routes.length, 'receipt route denominator mismatch');
  const expectedRouteIds = routes.map(route => route.route_id);
  const actualRouteIds = receipt.route_results.map(result => result.route_id);
  assert(JSON.stringify(actualRouteIds) === JSON.stringify(expectedRouteIds), 'receipt route order or identity mismatch');
  assert(receipt.route_results.every(result => result.attempt_count === 1 && result.evidence_admitted === false && result.followups_spawned === 0), 'receipt violates one-attempt or no-admission boundary');
  assert(receipt.matrix.required_cells === cells.length && receipt.matrix.classified_cells === cells.length, 'receipt cell denominator mismatch');
  assert(receipt.matrix.classifications.length === cells.length, 'receipt classification array mismatch');
  assert(JSON.stringify(receipt.matrix.classifications.map(row => row.cell_id)) === JSON.stringify(cells), 'receipt cell order or identity mismatch');
  assert(receipt.matrix.classifications.every(row => row.candidate_only === true && row.evidence_admitted === false && row.closure_eligible === false), 'receipt promoted a candidate or closure');
  assert(receipt.matrix.evidence_admitted_cells === 0 && receipt.matrix.closed_cells === 0, 'receipt admitted evidence or closed cells');
  assert(receipt.authority.outside_human_dependency === false && receipt.authority.external_contacts === 0 && receipt.authority.external_reviews === 0, 'receipt created an outside-human dependency');
  assert(receipt.closure.classes_closed === 0 && receipt.closure.closure_attempted === false, 'receipt attempted closure');
  return receipt;
}

function verifyReceiptFile(receiptPath, root = DEFAULT_ROOT) {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  return verifyReceiptObject(receipt, root);
}

async function main() {
  const { mode, out, receipt } = parseArgs(process.argv.slice(2));
  if (mode === 'check') {
    const first = stableJson(buildPlan(DEFAULT_ROOT));
    const second = stableJson(buildPlan(DEFAULT_ROOT));
    assert(first === second, `${EXPECTED_LANE}: deterministic clean replay changed bytes`);
    console.log(`${EXPECTED_LANE} deterministic builder: passed (${JSON.parse(first).routes.total} routes, 2 clean replays)`);
    return;
  }
  if (mode === 'print') {
    process.stdout.write(stableJson(buildPlan(DEFAULT_ROOT)));
    return;
  }
  if (mode === 'verify-receipt') {
    const verified = verifyReceiptFile(receipt, DEFAULT_ROOT);
    console.log(`${EXPECTED_LANE} execution receipt: passed (${verified.route_result_count} routes, ${verified.matrix.classified_cells} cells, 0 classes closed)`);
    return;
  }
  const executed = await executePlan(DEFAULT_ROOT, out);
  console.log(`${EXPECTED_LANE} source protocol: completed (${executed.route_result_count} routes, ${executed.matrix.classified_cells} cells, 0 evidence admissions, 0 classes closed)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`${EXPECTED_LANE} builder: ${error.message}`);
    process.exit(1);
  });
}
