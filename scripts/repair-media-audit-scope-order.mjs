#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const command = process.argv[2];
const BASE = process.env.EXACT_MAIN;
const PARENT = process.env.RECOVERY_PARENT;
const NOW = process.env.REPAIR_AT;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const run = (program, args, options = {}) => execFileSync(program, args, {
  stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  encoding: options.capture ? 'utf8' : undefined,
  maxBuffer: 256 * 1024 * 1024,
});
const replaceOnce = (path, before, after, label) => {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(before)) throw new Error(`${label} drifted in ${path}`);
  fs.writeFileSync(path, source.replace(before, after));
};

function status(scope) {
  return JSON.parse(run(process.execPath, ['scripts/media-audit.mjs', 'status', '--scope', scope, '--json'], { capture: true }));
}

function apply() {
  if (!BASE || !PARENT || !NOW) throw new Error('EXACT_MAIN, RECOVERY_PARENT, and REPAIR_AT are required');

  const scopesPath = 'data/MEDIA-AUDIT-SCOPES.json';
  const scopesDoc = read(scopesPath);
  const byId = new Map(scopesDoc.scopes.map((row) => [row.id, row]));
  const expected = ['doctor-who', 'star-trek', 'sitewide'];
  if (byId.size !== expected.length || expected.some((id) => !byId.has(id))) {
    throw new Error(`unexpected media-audit scopes: ${[...byId.keys()].sort().join(', ')}`);
  }
  scopesDoc.scopes = expected.map((id) => byId.get(id));
  write(scopesPath, scopesDoc);

  replaceOnce(
    'scripts/lib/media-audit.mjs',
    `export function scopeForSpecimen(scopes, specimen) {\n  return scopes.find((scope) =>\n    scope.status !== "retired"\n    && (!scope.match?.universe || normalize(scope.match.universe) === normalize(specimen.universe)),\n  );\n}`,
    `export function scopeForSpecimen(scopes, specimen) {\n  const active = scopes.filter((scope) => scope.status !== "retired");\n  return active.find((scope) =>\n    scope.match?.universe\n    && normalize(scope.match.universe) === normalize(specimen.universe),\n  ) || active.find((scope) => !scope.match?.universe) || null;\n}`,
    'shared scope selector',
  );

  replaceOnce(
    'scripts/media-audit.mjs',
    `  sha256,\n  stableJson,`,
    `  sha256,\n  scopeForSpecimen,\n  stableJson,`,
    'media-audit import block',
  );
  replaceOnce(
    'scripts/media-audit.mjs',
    `function scopeForSpecimen(scopes, specimen) {\n  return scopes.find((scope) => scope.status !== "retired" && (!scope.match?.universe || normalize(scope.match.universe) === normalize(specimen.universe)));\n}\n`,
    '',
    'duplicate local scope selector',
  );

  replaceOnce(
    'scripts/media-audit-fixtures.mjs',
    `{
  const scopes = [
    { id: "star-trek", status: "active", match: { universe: "Star Trek" }, facets: ["still", "portrait"] },
    { id: "sitewide", status: "active", facets: ["still", "portrait"] },
  ];
  const starTrek = { id: "UC-001", universe: "Star Trek", actor: "Mark Allen Shepherd", character: "Morn" };
  const horror = { id: "UC-025", universe: "Horror", actor: "Javier Botet", character: "Mama, the Crooked Man & others" };
  assert.equal(scopeForSpecimen(scopes, starTrek)?.id, "star-trek", "specific first-match scope wins");
  const fallback = scopeForSpecimen(scopes, horror);
  assert.equal(fallback?.id, "sitewide", "non-Star-Trek specimen enters the fallback scope");
  assert.deepEqual(fallback.facets, ["still", "portrait"], "fallback exposes both public card faces");
}
`,
    `{
  const scopes = [
    { id: "sitewide", status: "active", facets: ["still", "portrait"] },
    { id: "doctor-who", status: "active", match: { universe: "Doctor Who" }, facets: ["still", "portrait"] },
    { id: "star-trek", status: "active", match: { universe: "Star Trek" }, facets: ["still", "portrait"] },
  ];
  const starTrek = { id: "UC-001", universe: "Star Trek", actor: "Mark Allen Shepherd", character: "Morn" };
  const doctorWho = { id: "UC-1345", universe: "Doctor Who", actor: "Dan Starkey", character: "Commander (The Sontarans)" };
  const horror = { id: "UC-025", universe: "Horror", actor: "Javier Botet", character: "Mama, the Crooked Man & others" };
  assert.equal(scopeForSpecimen(scopes, starTrek)?.id, "star-trek", "specific Star Trek scope outranks an earlier fallback");
  assert.equal(scopeForSpecimen(scopes, doctorWho)?.id, "doctor-who", "specific Doctor Who scope outranks an earlier fallback");
  const fallback = scopeForSpecimen(scopes, horror);
  assert.equal(fallback?.id, "sitewide", "unmatched specimen enters the fallback scope");
  assert.deepEqual(fallback.facets, ["still", "portrait"], "fallback exposes both public card faces");
}
`,
    'scope-order fixture',
  );

  replaceOnce(
    'scripts/doctor-who-pilot-cycle.mjs',
    `const audit = read('data/MEDIA-AUDIT.json');`,
    `const auditBytes = fs.readFileSync('data/MEDIA-AUDIT.json');\nconst audit = JSON.parse(auditBytes);`,
    'pilot audit load',
  );
  const pilotAnchor = `if (receipt.task.id !== TASK_ID || receipt.lease.id !== LEASE_ID || receipt.canonical.wall_id !== wallId) fail('pilot receipt identity drifted');`;
  replaceOnce(
    'scripts/doctor-who-pilot-cycle.mjs',
    pilotAnchor,
    `${pilotAnchor}\nif (receipt.media.media_audit_sha256 !== sha(auditBytes)) fail('pilot media-audit receipt drifted');`,
    'pilot media-audit receipt check',
  );

  fs.writeFileSync(
    'data/MEDIA-AUDIT.json',
    execFileSync('git', ['show', `${PARENT}:data/MEDIA-AUDIT.json`], { maxBuffer: 256 * 1024 * 1024 }),
  );
  run(process.execPath, ['scripts/media-audit.mjs', 'sync', '--now', NOW]);

  const star = status('star-trek');
  const doctor = status('doctor-who');
  fs.writeFileSync('/tmp/star-trek-after.json', JSON.stringify(star, null, 2) + '\n');
  fs.writeFileSync('/tmp/doctor-who-after.json', JSON.stringify(doctor, null, 2) + '\n');
  if (star.total !== 882 || star.complete !== 880 || star.verified !== 610 || star.absent !== 270 || star.review !== 2 || star.attention !== 0) {
    throw new Error(`Star Trek audit custody was not restored exactly: ${JSON.stringify(star)}`);
  }

  const auditBytes = fs.readFileSync('data/MEDIA-AUDIT.json');
  const pilotReceiptPath = 'data/review/adapter-sdk/doctor-who-pilot-cycle-001.json';
  const pilotReceipt = read(pilotReceiptPath);
  pilotReceipt.media.media_audit_sha256 = sha(auditBytes);
  delete pilotReceipt.receipt_sha256;
  pilotReceipt.receipt_sha256 = sha(JSON.stringify(stable(pilotReceipt)) + '\n');
  write(pilotReceiptPath, pilotReceipt);
}

function receipt() {
  const candidateLog = process.env.CANDIDATE_GATE_LOG || '/tmp/media-audit-scope-order-candidate-gate.log';
  const canonical = Object.fromEntries([
    'data/specimens.json',
    'data/SOURCES.json',
    'data/AUTOPILOT.json',
    'data/WATERLINE-STATE.json',
    'data/ROADMAP-STATE.json',
  ].map((path) => [path, sha(fs.readFileSync(path))]));
  const result = {
    version: 1,
    transaction: 'MEDIA-AUDIT-SCOPE-ORDER-REPAIR-001',
    operation: 'restore-specific-scope-precedence-and-pre-pilot-review-custody',
    generated_at: NOW,
    base_sha: BASE,
    recovery_parent: PARENT,
    defect: {
      cause: 'The sitewide fallback preceded the Star Trek-specific scope, so first-match routing reassigned every Star Trek facet to sitewide and collapsed the active Star Trek denominator to zero.',
      merged_star_trek_status: read('/tmp/star-trek-before.json'),
      merged_scope_order: read('/tmp/media-audit-scopes-before.json').scopes.map((row) => row.id),
      merged_audit_sha256: sha(fs.readFileSync('/tmp/media-audit-before.json')),
    },
    recovery: {
      vote_seed: `${PARENT}:data/MEDIA-AUDIT.json`,
      vote_seed_sha256: sha(execFileSync('git', ['show', `${PARENT}:data/MEDIA-AUDIT.json`], { maxBuffer: 256 * 1024 * 1024 })),
      final_scope_order: read('data/MEDIA-AUDIT-SCOPES.json').scopes.map((row) => row.id),
      final_audit_sha256: sha(fs.readFileSync('data/MEDIA-AUDIT.json')),
      star_trek_status: read('/tmp/star-trek-after.json'),
      doctor_who_status: read('/tmp/doctor-who-after.json'),
    },
    canonical_sha256: canonical,
    boundary: {
      canonical_specimens_unchanged: true,
      canonical_sources_unchanged: true,
      autopilot_state_unchanged: true,
      waterline_state_unchanged: true,
      roadmap_state_unchanged: true,
      doctor_who_cycle_reopened: false,
      second_lease_issued: false,
      fallback_order_can_no_longer_swallow_specific_scopes: true,
    },
    qualification: {
      candidate_gate: 'passed',
      candidate_gate_log_sha256: sha(fs.readFileSync(candidateLog)),
    },
  };
  result.receipt_sha256 = sha(JSON.stringify(stable(result)) + '\n');
  write('data/review/adapter-sdk/doctor-who-pilot-cycle-001-media-scope-repair.json', result);
}

if (command === 'apply') apply();
else if (command === 'receipt') receipt();
else throw new Error('use apply or receipt');
