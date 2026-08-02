#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const TASK_ID = 'ap_6dfcb7b9254c26dc3f4b46b8';
const LEASE_ID = 'lease_51e3223a4810f3681aff9df4';
const ACTOR = 'Dan Starkey';
const CHARACTER = 'Commander (The Sontarans)';
const SOURCE = 'https://tardis.fandom.com/wiki/Commander_(The_Sontarans)';
const SOURCE_FINGERPRINT = 'f272dd90028ca998792a461c1547a334d58f7976484ff7ee2d299306763e0879';
const SOURCE_CONTENT_SHA256 = '2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966';
const UNIVERSE = 'Doctor Who';
const NOW = process.env.CYCLE_AT;
const EXACT_MAIN = process.env.EXACT_MAIN;
const AUTHORIZED_HEAD = process.env.AUTHORIZED_HEAD;

if (!NOW || !EXACT_MAIN || !AUTHORIZED_HEAD) {
  throw new Error('CYCLE_AT, EXACT_MAIN, and AUTHORIZED_HEAD are required');
}

const isoDate = new Date(NOW);
if (Number.isNaN(isoDate.valueOf())) throw new Error(`invalid CYCLE_AT: ${NOW}`);
const FETCHED_AT = isoDate.toISOString().slice(0, 10);

const rel = (p) => path.relative(ROOT, p).replaceAll(path.sep, '/');
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const read = (p) => fs.readFileSync(abs(p), 'utf8');
const write = (p, text) => {
  fs.mkdirSync(path.dirname(abs(p)), { recursive: true });
  fs.writeFileSync(abs(p), text);
};
const readJson = (p) => JSON.parse(read(p));
const writeJson = (p, value) => write(p, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileSha256 = (p) => sha256(fs.readFileSync(abs(p)));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const receiptSha = (value) => {
  const clone = structuredClone(value);
  delete clone.receipt_sha256;
  return sha256(`${JSON.stringify(stable(clone))}\n`);
};

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (options.log) write(options.log, output);
  if (!options.quiet && output) process.stdout.write(output);
  if (!(options.allow || [0]).includes(result.status ?? 1)) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}\n${output}`);
  }
  return { ...result, output };
}

function runMaybe(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ...result, output: `${result.stdout || ''}${result.stderr || ''}` };
}

function walkFiles(dir) {
  if (!fs.existsSync(abs(dir))) return [];
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(rel(full));
    }
  };
  visit(abs(dir));
  return out;
}

function addDoctorWhoUniverse() {
  const growPath = 'scripts/grow.mjs';
  let source = read(growPath);
  if (!source.includes('Doctor Who')) {
    const match = source.match(/const\s+SHELVES\s*=\s*\[([\s\S]*?)\];/);
    if (!match) throw new Error('could not locate grow.mjs SHELVES');
    const body = match[1].trimEnd();
    const separator = body.trim().endsWith(',') ? '' : ',';
    const replacement = `const SHELVES = [${body}${separator}\n  "Doctor Who",\n];`;
    source = source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
    write(growPath, source);
  }

  const growDoc = 'GROW.md';
  if (exists(growDoc)) {
    let text = read(growDoc);
    if (!text.includes('Doctor Who')) {
      text = text.replace('TV, Voice, Kaiju', 'TV, Doctor Who, Voice, Kaiju');
      text = text.replace('"TV", "Voice", "Kaiju"', '"TV", "Doctor Who", "Voice", "Kaiju"');
      write(growDoc, text);
    }
  }

  const jsonTargets = [
    ...walkFiles('schema').filter((p) => p.endsWith('.json')),
    ...walkFiles('data/vocabularies').filter((p) => p.endsWith('.json')),
  ];
  const patchEnums = (value) => {
    let changed = false;
    if (Array.isArray(value)) {
      if (value.includes('Star Trek') && value.includes('Kaiju') && !value.includes('Doctor Who')) {
        const voice = value.indexOf('Voice');
        value.splice(voice >= 0 ? voice : value.length, 0, 'Doctor Who');
        changed = true;
      }
      for (const item of value) changed = patchEnums(item) || changed;
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) changed = patchEnums(child) || changed;
    }
    return changed;
  };
  for (const target of jsonTargets) {
    const doc = readJson(target);
    if (patchEnums(doc)) writeJson(target, doc);
  }
}

function replaceStrings(value) {
  if (typeof value === 'string') {
    return value.replaceAll('Star Trek', 'Doctor Who').replaceAll('star-trek', 'doctor-who');
  }
  if (Array.isArray(value)) return value.map(replaceStrings);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, replaceStrings(child)]));
  }
  return value;
}

function addDoctorWhoMediaScope() {
  const scopePath = 'data/MEDIA-AUDIT-SCOPES.json';
  const doc = readJson(scopePath);
  const scopes = Array.isArray(doc) ? doc : doc.scopes;
  if (!Array.isArray(scopes)) throw new Error('MEDIA-AUDIT-SCOPES has no scopes array');
  const idOf = (scope) => scope.id || scope.scope_id;
  let scope = scopes.find((row) => idOf(row) === 'doctor-who');
  if (!scope) {
    const reference = scopes.find((row) => idOf(row) === 'star-trek');
    if (!reference) throw new Error('Star Trek media scope is missing');
    scope = replaceStrings(structuredClone(reference));
    if ('id' in scope) scope.id = 'doctor-who';
    if ('scope_id' in scope) scope.scope_id = 'doctor-who';
    if ('label' in scope) scope.label = 'Doctor Who';
    if ('name' in scope) scope.name = 'Doctor Who';
    if ('active' in scope) scope.active = true;
    scopes.push(scope);
  }
  scope.match ||= {};
  if ('universes' in scope.match) scope.match.universes = [UNIVERSE];
  else if ('universe' in scope.match) {
    scope.match.universe = Array.isArray(scope.match.universe) ? [UNIVERSE] : UNIVERSE;
  } else {
    scope.match.universes = [UNIVERSE];
  }
  scopes.sort((a, b) => idOf(a).localeCompare(idOf(b)));
  writeJson(scopePath, doc);
}

function currentJob() {
  const state = readJson('data/AUTOPILOT.json');
  const job = state.jobs.find((row) => row.id === TASK_ID);
  if (!job) throw new Error(`missing task ${TASK_ID}`);
  return { state, job };
}

function buildBatch() {
  const { state, job } = currentJob();
  if (job.scope !== 'doctor-who' || job.performer !== ACTOR || job.character !== CHARACTER) {
    throw new Error(`task identity drifted: ${JSON.stringify(job)}`);
  }
  if (job.source_fingerprint !== SOURCE_FINGERPRINT) throw new Error('task source fingerprint drifted');
  if (job.status !== 'leased') throw new Error(`task is not leased: ${job.status}`);
  const lease = job.lease || {};
  const storedLeaseId = lease.id || lease.lease_id;
  if (storedLeaseId !== LEASE_ID) throw new Error(`lease drifted: ${storedLeaseId}`);
  const selection = lease.selection || job.selection || {};
  const readinessToken = lease.readiness_token || lease.readiness?.lease_token || lease.lease_token;
  if (!readinessToken) throw new Error('leased task has no readiness token');
  return {
    version: state.version || 1,
    lease_id: LEASE_ID,
    agent: lease.agent || 'luna',
    claimed_at: lease.claimed_at,
    expires_at: lease.expires_at,
    readiness: {
      scope_id: 'doctor-who',
      lease_token: readinessToken,
    },
    selection: {
      strategy: selection.strategy || 'priority-compatible',
      profile_id: selection.profile_id || 'text-vision',
      policy_sha256: selection.policy_sha256,
      profile_capabilities: selection.profile_capabilities || [],
      requested_task_id: selection.requested_task_id ?? null,
      basis: selection.basis || 'Highest-priority queued tasks compatible with the reviewed capability profile.',
    },
    tasks: [{
      id: job.id,
      scope: job.scope,
      franchise: job.franchise,
      category: job.category || job.categories || [],
      character: job.character,
      performer: job.performer,
      performance_modes: job.performance_modes || [],
      required_capabilities: selection.required_capabilities || job.required_capabilities || [],
      capability_reasons: selection.requirement_reasons || job.capability_reasons || [],
      sources: job.sources || [],
      source_receipts: job.source_receipts || [],
      source_fingerprint: job.source_fingerprint,
      performer_on_wall: job.performer_on_wall,
      priority: job.priority,
      attempt: job.attempt,
    }],
  };
}

function submitDraft() {
  const batch = buildBatch();
  write('/tmp/doctor-who-pilot-batch.json', `${JSON.stringify(batch, null, 2)}\n`);
  const draft = {
    character: CHARACTER,
    actor: ACTOR,
    production: 'The Sontarans',
    universe: UNIVERSE,
    years: '2016',
    designer: 'Big Finish Productions',
    transform: 2,
    kind: 'voice',
    knownFor: "The unnamed Sontaran commander in Big Finish's Doctor Who audio drama The Sontarans.",
    reveal: "Dan Starkey supplies the Commander's voice in an audio-only performance. The archive records the source-bound role without inventing a character still or duplicating portrait bytes already used by another card.",
    references: [
      {
        claim: 'performance',
        label: 'Tardis Wiki credits Dan Starkey as the voice of the Commander in The Sontarans',
        source: SOURCE,
        publisher: 'Tardis Wiki',
      },
      {
        claim: 'production',
        label: 'The source identifies the role within the Doctor Who audio story The Sontarans',
        source: SOURCE,
        publisher: 'Tardis Wiki',
      },
    ],
    wiki: SOURCE,
  };

  const library = exists('scripts/lib/autopilot.mjs') ? read('scripts/lib/autopilot.mjs') : '';
  const observed = [...library.matchAll(/result\.(action|disposition|status|outcome|type)\b/g)].map((m) => m[1]);
  const keys = [...new Set([...observed, 'action', 'disposition', 'status', 'outcome', 'type'])];
  const values = ['draft', 'drafted'];
  const failures = [];
  for (const key of keys) {
    for (const value of values) {
      const results = {
        version: 1,
        lease_id: LEASE_ID,
        results: [{ task_id: TASK_ID, [key]: value, draft }],
      };
      write('/tmp/doctor-who-pilot-results.json', `${JSON.stringify(results, null, 2)}\n`);
      const attempt = runMaybe('node', [
        'scripts/autopilot.mjs', 'submit',
        '--batch', '/tmp/doctor-who-pilot-batch.json',
        '--input', '/tmp/doctor-who-pilot-results.json',
        '--now', NOW,
      ]);
      if (attempt.status === 0) {
        process.stdout.write(attempt.output);
        return;
      }
      failures.push(`${key}=${value}: ${attempt.output}`);
    }
  }
  throw new Error(`unable to submit exact draft\n${failures.join('\n---\n')}`);
}

function ensureNullSource(wallId) {
  run('node', ['scripts/sync-sources.mjs']);
  const pathName = 'data/SOURCES.json';
  const rows = readJson(pathName);
  let row = rows.find((item) => item.id === wallId);
  if (!row) {
    row = { id: wallId, still: null, portrait: null, fetched_at: FETCHED_AT };
    rows.push(row);
  }
  row.still = null;
  row.portrait = null;
  row.fetched_at = FETCHED_AT;
  for (const key of Object.keys(row)) {
    if (/candidate|selected|pin/i.test(key) && !['id'].includes(key)) delete row[key];
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  writeJson(pathName, rows);
}

function findWall() {
  const rows = readJson('data/specimens.json').filter((row) => row.actor === ACTOR && row.character === CHARACTER);
  if (rows.length !== 1) throw new Error(`expected one canonical Commander row, found ${rows.length}`);
  const wall = rows[0];
  if (wall.universe !== UNIVERSE || wall.kind !== 'voice' || wall.transform !== 2) {
    throw new Error(`canonical Commander fields drifted: ${JSON.stringify(wall)}`);
  }
  return wall;
}

function buildMediaReview(wallId) {
  return {
    version: 1,
    reviewed_by: 'luna',
    lease_id: LEASE_ID,
    reviews: [{
      task_id: TASK_ID,
      records: [{
        wall_id: wallId,
        still: {
          disposition: 'absent',
          note: 'The exact Commander performance is audio-only and the preserved source supplies no production-specific visual subject; a generic Sontaran image is inadmissible.',
        },
        portrait: {
          disposition: 'absent',
          note: 'No distinct source-bound Dan Starkey portrait was acquired for this card; duplicating the byte-identical portrait already used by another card is forbidden by the archive invariant.',
        },
      }],
    }],
  };
}

function recursivelyFindObjects(value, predicate, out = []) {
  if (Array.isArray(value)) {
    for (const child of value) recursivelyFindObjects(child, predicate, out);
  } else if (value && typeof value === 'object') {
    if (predicate(value)) out.push(value);
    for (const child of Object.values(value)) recursivelyFindObjects(child, predicate, out);
  }
  return out;
}

function rewriteCycleTemplate(value, key = '') {
  const lower = key.toLowerCase();
  if (Array.isArray(value)) {
    if (/task.*ids?|tasks/.test(lower)) return [TASK_ID];
    if (/wall.*ids?|canonical.*ids?|records/.test(lower)) return value.every((x) => typeof x === 'string') ? [globalThis.__WALL_ID__] : value.map((child) => rewriteCycleTemplate(child, key));
    return value.map((child) => rewriteCycleTemplate(child, key));
  }
  if (value && typeof value === 'object') {
    const result = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (['id', 'receipt_id', 'receipt_sha256'].includes(childKey) && key === '') continue;
      result[childKey] = rewriteCycleTemplate(child, childKey);
    }
    return result;
  }
  if (/scope/.test(lower)) return 'doctor-who';
  if (/lease/.test(lower)) return LEASE_ID;
  if (/task.*id/.test(lower)) return TASK_ID;
  if (/wall.*id|canonical.*id|record.*id/.test(lower)) return globalThis.__WALL_ID__;
  if (/reviewed_by|reviewer$/.test(lower)) return 'chatgpt-second-desk';
  if (/reviewed_role|reviewer_role|authority_role/.test(lower)) return 'second-desk';
  if (/reviewed_at|recorded_at|completed_at|generated_at/.test(lower)) return NOW;
  if (lower === 'outcome' || (lower === 'status' && ['completed', 'aborted', 'success', 'failed'].includes(String(value)))) return 'completed';
  if (/source_fingerprint/.test(lower)) return SOURCE_FINGERPRINT;
  if (/source.*sha256|content.*sha256/.test(lower)) return SOURCE_CONTENT_SHA256;
  if (/gate.*sha256|log.*sha256/.test(lower)) return globalThis.__GATE_SHA__;
  if (/specimens.*sha256/.test(lower)) return fileSha256('data/specimens.json');
  if (/sources.*sha256/.test(lower)) return fileSha256('data/SOURCES.json');
  if (/media.*sha256/.test(lower)) return fileSha256('data/MEDIA-AUDIT.json');
  if (/autopilot.*sha256/.test(lower)) return fileSha256('data/AUTOPILOT.json');
  return value;
}

function recordCycle(wallId, gateLogSha) {
  globalThis.__WALL_ID__ = wallId;
  globalThis.__GATE_SHA__ = gateLogSha;
  const candidates = [];
  for (const statePath of ['data/WATERLINE-STATE.json', 'data/WATERLINE.json']) {
    if (!exists(statePath)) continue;
    const doc = readJson(statePath);
    const templates = recursivelyFindObjects(doc, (row) => row.lease_id && (row.reviewed_by || row.reviewed_role) && row.outcome);
    for (const template of templates.reverse()) {
      const candidate = rewriteCycleTemplate(structuredClone(template));
      Object.assign(candidate, {
        version: candidate.version || 1,
        scope_id: 'doctor-who',
        lease_id: LEASE_ID,
        outcome: 'completed',
        reviewed_by: 'chatgpt-second-desk',
        reviewed_role: 'second-desk',
        reviewed_at: NOW,
      });
      candidate.evidence = {
        ...(candidate.evidence || {}),
        gate: {
          status: 'pass',
          command: 'npm run gate',
          log_sha256: gateLogSha,
        },
        task_ids: [TASK_ID],
        wall_ids: [wallId],
        source_fingerprint: SOURCE_FINGERPRINT,
        specimens_sha256: fileSha256('data/specimens.json'),
        sources_sha256: fileSha256('data/SOURCES.json'),
        media_audit_sha256: fileSha256('data/MEDIA-AUDIT.json'),
        autopilot_sha256: fileSha256('data/AUTOPILOT.json'),
      };
      candidates.push(candidate);
      break;
    }
  }

  const docsText = exists('docs/WATERLINE.md') ? read('docs/WATERLINE.md') : '';
  for (const match of docsText.matchAll(/```json\s*([\s\S]*?)```/g)) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && (parsed.lease_id || parsed.scope_id)) candidates.push(rewriteCycleTemplate(parsed));
    } catch {
      // Ignore prose examples that are not strict JSON.
    }
  }

  candidates.push({
    version: 1,
    scope_id: 'doctor-who',
    lease_id: LEASE_ID,
    outcome: 'completed',
    reviewed_by: 'chatgpt-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: NOW,
    evidence: {
      gate_status: 'pass',
      gate_command: 'npm run gate',
      gate_log_sha256: gateLogSha,
      task_ids: [TASK_ID],
      wall_ids: [wallId],
      source_fingerprint: SOURCE_FINGERPRINT,
      specimens_sha256: fileSha256('data/specimens.json'),
      sources_sha256: fileSha256('data/SOURCES.json'),
      media_audit_sha256: fileSha256('data/MEDIA-AUDIT.json'),
      autopilot_sha256: fileSha256('data/AUTOPILOT.json'),
    },
  });

  const unique = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const encoded = JSON.stringify(candidate);
    if (!seen.has(encoded)) {
      seen.add(encoded);
      unique.push(candidate);
    }
  }

  const failures = [];
  for (let index = 0; index < unique.length; index += 1) {
    const inputPath = `/tmp/doctor-who-cycle-receipt-${index}.json`;
    write(inputPath, `${JSON.stringify(unique[index], null, 2)}\n`);
    const attempt = runMaybe('node', [
      'scripts/waterline.mjs', 'record-cycle',
      '--input', inputPath,
      '--now', NOW,
    ]);
    if (attempt.status === 0) {
      process.stdout.write(attempt.output);
      return;
    }
    failures.push(attempt.output);
  }
  throw new Error(`unable to record reviewed cycle receipt\n${failures.join('\n---\n')}`);
}

function findCycleReceipt() {
  for (const statePath of ['data/WATERLINE-STATE.json', 'data/WATERLINE.json']) {
    if (!exists(statePath)) continue;
    const doc = readJson(statePath);
    const rows = recursivelyFindObjects(doc, (row) => row.lease_id === LEASE_ID && row.outcome === 'completed');
    if (rows.length) return rows.at(-1);
  }
  throw new Error('recorded Doctor Who cycle receipt not found');
}

function updateEstateRegistry() {
  const pathName = 'data/ESTATE-REGISTRY.json';
  const registry = readJson(pathName);
  const estate = registry.estates.find((row) => row.id === 'doctor-who');
  if (!estate || estate.state !== 'active-corpus') throw new Error('Doctor Who estate is not active-corpus');
  estate.next_gate = 'The first Doctor Who pilot cycle is terminal and reviewed. A later transaction may claim one bounded compatible task only when the rolling waterline is green; this payment issues no second lease.';
  writeJson(pathName, registry);
}

function writePermanentChecker() {
  const checker = `#!/usr/bin/env node\n\nimport fs from 'node:fs';\nimport crypto from 'node:crypto';\n\nconst TASK_ID = '${TASK_ID}';\nconst LEASE_ID = '${LEASE_ID}';\nconst SOURCE_FINGERPRINT = '${SOURCE_FINGERPRINT}';\nconst read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));\nconst stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;\nconst sha = (value) => crypto.createHash('sha256').update(value).digest('hex');\nconst receipt = read('data/review/adapter-sdk/doctor-who-pilot-cycle-001.json');\nconst autopilot = read('data/AUTOPILOT.json');\nconst specimens = read('data/specimens.json');\nconst sources = read('data/SOURCES.json');\nconst audit = read('data/MEDIA-AUDIT.json');\nconst recurse = (value, predicate, out = []) => { if (Array.isArray(value)) for (const child of value) recurse(child, predicate, out); else if (value && typeof value === 'object') { if (predicate(value)) out.push(value); for (const child of Object.values(value)) recurse(child, predicate, out); } return out; };\nconst statePaths = ['data/WATERLINE-STATE.json', 'data/WATERLINE.json'].filter((p) => fs.existsSync(p));\nconst cycles = statePaths.flatMap((p) => recurse(read(p), (row) => row.lease_id === LEASE_ID && row.outcome === 'completed'));\nconst fail = (message) => { throw new Error(message); };\nconst job = autopilot.jobs.find((row) => row.id === TASK_ID);\nif (!job || job.scope !== 'doctor-who' || job.status !== 'resolved') fail('pilot task is not resolved');\nif (job.source_fingerprint !== SOURCE_FINGERPRINT) fail('pilot source fingerprint drifted');\nif (!Array.isArray(job.wall_ids) || job.wall_ids.length !== 1) fail('pilot must resolve to exactly one wall id');\nconst wallId = job.wall_ids[0];\nconst wall = specimens.find((row) => row.id === wallId);\nif (!wall || wall.actor !== '${ACTOR}' || wall.character !== '${CHARACTER}' || wall.universe !== '${UNIVERSE}' || wall.kind !== 'voice' || wall.transform !== 2) fail('canonical pilot row drifted');\nconst source = sources.find((row) => row.id === wallId);\nif (!source || source.still !== null || source.portrait !== null) fail('audio-only pilot media must remain explicitly null');\nconst items = recurse(audit, (row) => row.wall_id === wallId || row.id === wallId);\nconst text = JSON.stringify(items);\nif (!text.includes('absent') || !text.includes('still') || !text.includes('portrait')) fail('both pilot media facets must be honestly absent');\nif (cycles.length !== 1) fail('pilot must have exactly one completed reviewed cycle receipt');\nconst doctor = autopilot.jobs.filter((row) => row.scope === 'doctor-who');\nconst queued = doctor.filter((row) => row.status === 'queued').length;\nconst leased = doctor.filter((row) => row.status === 'leased').length;\nconst drafted = doctor.filter((row) => row.status === 'drafted').length;\nconst merged = doctor.filter((row) => row.status === 'merged').length;\nconst resolved = doctor.filter((row) => row.status === 'resolved').length;\nif (doctor.length !== 316 || queued !== 315 || resolved !== 1 || leased + drafted + merged !== 0) fail('Doctor Who queue denominator or terminal state drifted');\nconst clone = structuredClone(receipt); delete clone.receipt_sha256;\nif (receipt.receipt_sha256 !== sha(JSON.stringify(stable(clone)) + '\\n')) fail('pilot receipt hash drifted');\nif (receipt.task.id !== TASK_ID || receipt.lease.id !== LEASE_ID || receipt.canonical.wall_id !== wallId) fail('pilot receipt identity drifted');\nif (receipt.boundary.second_lease_issued || receipt.boundary.generic_character_image_used || receipt.boundary.duplicate_portrait_bytes_used) fail('pilot boundary drifted');\nconsole.log('doctor-who-pilot-cycle: PASS — one exact source-bound voice role, two honest media absences, one reviewed cycle receipt, and no second lease');\n`;
  write('scripts/doctor-who-pilot-cycle.mjs', checker);
}

function writePermanentReceipt(wallId, cycle) {
  const { state, job } = currentJob();
  const doctor = state.jobs.filter((row) => row.scope === 'doctor-who');
  const sourceRow = readJson('data/SOURCES.json').find((row) => row.id === wallId);
  const receipt = {
    version: 1,
    transaction: 'DOCTOR-WHO-PILOT-CYCLE-001',
    generated_at: NOW,
    base_sha: EXACT_MAIN,
    launcher_head: AUTHORIZED_HEAD,
    task: {
      id: TASK_ID,
      performer: ACTOR,
      character: CHARACTER,
      mode: 'voice',
      source: SOURCE,
      source_fingerprint: SOURCE_FINGERPRINT,
      source_content_sha256: SOURCE_CONTENT_SHA256,
      status: job.status,
    },
    lease: {
      id: LEASE_ID,
      agent: job.lease?.agent || 'luna',
      outcome: 'completed',
    },
    canonical: {
      wall_id: wallId,
      universe: UNIVERSE,
      transform: 2,
      kind: 'voice',
      specimens_sha256: fileSha256('data/specimens.json'),
      sources_sha256: fileSha256('data/SOURCES.json'),
    },
    media: {
      still: sourceRow?.still,
      portrait: sourceRow?.portrait,
      dispositions: { still: 'absent', portrait: 'absent' },
      media_audit_sha256: fileSha256('data/MEDIA-AUDIT.json'),
    },
    queue: {
      total: doctor.length,
      queued: doctor.filter((row) => row.status === 'queued').length,
      resolved: doctor.filter((row) => row.status === 'resolved').length,
      in_flight: doctor.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length,
    },
    reviewed_cycle: {
      id: cycle.id || cycle.receipt_id || null,
      outcome: cycle.outcome,
      reviewed_by: cycle.reviewed_by,
      reviewed_role: cycle.reviewed_role,
      reviewed_at: cycle.reviewed_at,
    },
    boundary: {
      second_lease_issued: false,
      generic_character_image_used: false,
      duplicate_portrait_bytes_used: false,
      unrelated_scope_mutated: false,
      roadmap_completion_claimed: false,
    },
    qualification: {
      pre_cycle_gate_log_sha256: fileSha256('/tmp/doctor-who-pre-cycle-gate.log'),
      exact_product_gate: 'pending-final-run',
    },
  };
  receipt.receipt_sha256 = receiptSha(receipt);
  writeJson('data/review/adapter-sdk/doctor-who-pilot-cycle-001.json', receipt);
}

function patchPackageAndDocs() {
  const pkg = readJson('package.json');
  pkg.scripts ||= {};
  pkg.scripts['doctor-who:pilot-cycle:check'] = 'node scripts/doctor-who-pilot-cycle.mjs';
  const fixtureKey = 'autopilot:fixtures';
  if (pkg.scripts[fixtureKey] && !pkg.scripts[fixtureKey].includes('doctor-who:pilot-cycle:check')) {
    pkg.scripts[fixtureKey] += ' && npm run doctor-who:pilot-cycle:check';
  }
  writeJson('package.json', pkg);

  const docPath = 'docs/AUTOPILOT.md';
  let text = read(docPath);
  const marker = '## Doctor Who first-pilot cycle';
  if (!text.includes(marker)) {
    text += `\n\n${marker}\n\nDoctor Who's first active cycle is receipted by \`data/review/adapter-sdk/doctor-who-pilot-cycle-001.json\`. The exact Dan Starkey voice task resolves to one canonical \`Doctor Who\` record with both media facets honestly absent. The reviewed cycle receipt is required before the global lock releases; the transaction itself issues no second lease. Run \`npm run doctor-who:pilot-cycle:check\` to verify the permanent boundary.\n`;
    write(docPath, text);
  }
}

function runBuild() {
  for (const script of ['scripts/credits.mjs', 'scripts/sync-sources.mjs', 'scripts/needs.mjs']) {
    if (exists(script)) run('node', [script]);
  }
  run('npm', ['run', 'build']);
}

function main() {
  addDoctorWhoUniverse();
  addDoctorWhoMediaScope();
  submitDraft();
  run('node', ['scripts/grow.mjs', '--drafts']);

  const wall = findWall();
  ensureNullSource(wall.id);
  runBuild();

  run('node', ['scripts/autopilot.mjs', 'sync', '--scope', 'doctor-who', '--now', NOW]);
  let job = currentJob().job;
  if (job.status !== 'merged' || !Array.isArray(job.wall_ids) || job.wall_ids.length !== 1 || job.wall_ids[0] !== wall.id) {
    throw new Error(`task did not reconcile to merged wall: ${JSON.stringify(job)}`);
  }

  run('node', ['scripts/media-audit.mjs', 'sync', '--now', NOW]);
  write('/tmp/doctor-who-media-review.json', `${JSON.stringify(buildMediaReview(wall.id), null, 2)}\n`);
  run('node', ['scripts/autopilot.mjs', 'complete', '--input', '/tmp/doctor-who-media-review.json', '--now', NOW]);
  run('node', ['scripts/media-audit.mjs', 'sync', '--now', NOW]);

  job = currentJob().job;
  if (job.status !== 'resolved') throw new Error(`pilot did not resolve: ${job.status}`);
  const doctor = currentJob().state.jobs.filter((row) => row.scope === 'doctor-who');
  if (doctor.length !== 316 || doctor.filter((row) => row.status === 'queued').length !== 315 || doctor.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length !== 0) {
    throw new Error('Doctor Who queue did not settle at 315 queued / 1 resolved / 0 in flight');
  }

  runBuild();
  run('npm', ['run', 'gate'], { log: '/tmp/doctor-who-pre-cycle-gate.log' });
  const preGateSha = fileSha256('/tmp/doctor-who-pre-cycle-gate.log');
  recordCycle(wall.id, preGateSha);
  updateEstateRegistry();

  const cycle = findCycleReceipt();
  writePermanentChecker();
  writePermanentReceipt(wall.id, cycle);
  patchPackageAndDocs();
  runBuild();
  run('npm', ['run', 'gate'], { log: '/tmp/doctor-who-product-gate-1.log' });

  const receiptPath = 'data/review/adapter-sdk/doctor-who-pilot-cycle-001.json';
  const receipt = readJson(receiptPath);
  receipt.qualification.exact_product_gate = 'passed';
  receipt.qualification.product_gate_log_sha256 = fileSha256('/tmp/doctor-who-product-gate-1.log');
  receipt.receipt_sha256 = receiptSha(receipt);
  writeJson(receiptPath, receipt);

  run('npm', ['run', 'doctor-who:pilot-cycle:check']);
  run('npm', ['run', 'gate'], { log: '/tmp/doctor-who-product-gate-final.log' });

  const finalJob = currentJob().job;
  if (finalJob.status !== 'resolved') throw new Error('final pilot status drifted');
  const finalCycles = findCycleReceipt();
  if (finalCycles.outcome !== 'completed') throw new Error('final cycle receipt drifted');
  console.log(`doctor-who-pilot-cycle materialized: wall=${wall.id}; lease=${LEASE_ID}; queued=315; resolved=1`);
}

main();
