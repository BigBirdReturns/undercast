#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const C = {"MORGO_PRODUCT": "129e6f9c389fe61bb8027f4e046bea7de510cb84", "MORGO_RECEIPT": "data/review/adapter-sdk/star-trek-morgo-cycle.json", "MORGO_RECEIPT_SHA": "bbaf8f35578fefe02e5497ed5b11c290dc139f5347cc09cc6a376214d88aaa89", "MORGO_CHECKER": "scripts/star-trek-morgo-cycle.mjs", "MORGO_CHECKER_SHA": "96a01340a938ecaae780704947dd37ff4674dc797a45d901a8dee15bd99f9d26", "MORGO_WRAPPER": "scripts/star-trek-morgo-cycle-composable.mjs", "RISIK_RECEIPT": "data/review/adapter-sdk/star-trek-risik-cycle.json", "RISIK_CHECKER": "scripts/star-trek-risik-cycle.mjs", "MORGO_TASK": "ap_a7fb29c5cce85c86708ea0e6", "RISIK_TASK": "ap_096624f177ae0c9f2e91836c", "MORGO_WALL": "UC-1398", "RISIK_WALL": "UC-1399"};
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const ok = (value, message) => { if (!value) throw new Error(`star-trek-morgo-cycle-composable: ${message}`); };
function run(label, executable, args, { cwd = process.cwd() } = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

const morgo = read(C.MORGO_RECEIPT);
const morgoBody = structuredClone(morgo);
delete morgoBody.receipt_sha256;
ok(morgo.receipt_sha256 === C.MORGO_RECEIPT_SHA
  && sha(pretty(morgoBody)) === C.MORGO_RECEIPT_SHA,
  'immutable Morgo receipt drifted');
ok(sha(fs.readFileSync(C.MORGO_CHECKER)) === C.MORGO_CHECKER_SHA,
  'immutable Morgo checker drifted');

const risik = read(C.RISIK_RECEIPT);
const risikBody = structuredClone(risik);
delete risikBody.receipt_sha256;
ok(risik.transaction === 'STAR-TREK-CYCLE-RISIK'
  && risik.receipt_sha256 === sha(pretty(risikBody)),
  'Risik successor receipt drifted');
ok(risik.predecessor?.product_commit === C.MORGO_PRODUCT
  && risik.predecessor?.receipt_sha256 === C.MORGO_RECEIPT_SHA
  && risik.predecessor?.checker_sha256 === C.MORGO_CHECKER_SHA
  && risik.predecessor?.composable_checker_path === C.MORGO_WRAPPER
  && risik.predecessor?.composable_checker_sha256 === sha(fs.readFileSync(C.MORGO_WRAPPER)),
  'Morgo successor-composability custody drifted');
ok(risik.qualification?.checker_path === C.RISIK_CHECKER
  && risik.qualification?.checker_sha256 === sha(fs.readFileSync(C.RISIK_CHECKER)),
  'Risik checker binding drifted');

const pkg = read('package.json');
ok(pkg.scripts?.['star-trek:morgo-cycle:check'] === `node ${C.MORGO_WRAPPER}`,
  'Morgo package route is not successor-composable');
ok(pkg.scripts?.['star-trek:risik-cycle:check'] === `node ${C.RISIK_CHECKER}`,
  'Risik package route is absent');
ok(pkg.scripts?.['autopilot:fixtures']?.includes('npm run star-trek:morgo-cycle:check')
  && pkg.scripts?.['autopilot:fixtures']?.includes('npm run star-trek:risik-cycle:check'),
  'current Star Trek cycle routes are absent from Autopilot fixtures');

const state = read('data/AUTOPILOT.json');
const morgoTask = state.jobs.find((row) => row.id === C.MORGO_TASK);
const risikTask = state.jobs.find((row) => row.id === C.RISIK_TASK);
ok(morgoTask?.status === 'resolved' && morgoTask.wall_ids?.[0] === C.MORGO_WALL,
  'Morgo historical task drifted');
ok(risikTask?.status === 'resolved' && risikTask.wall_ids?.[0] === C.RISIK_WALL,
  'Risik successor task drifted');

run('verify exact Morgo product object', 'git', ['cat-file', '-e', `${C.MORGO_PRODUCT}^{commit}`]);
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'undercast-morgo-composable-'));
const historical = path.join(parent, 'worktree');
let added = false;
try {
  run('materialize exact Morgo product', 'git', ['worktree', 'add', '--quiet', '--detach', historical, C.MORGO_PRODUCT]);
  added = true;
  run('validate immutable Morgo product', process.execPath, [C.MORGO_CHECKER], { cwd: historical });
} finally {
  if (added) spawnSync('git', ['worktree', 'remove', '--force', historical], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  fs.rmSync(parent, { recursive: true, force: true });
}
run('validate current Risik successor', process.execPath, [C.RISIK_CHECKER]);
console.log('star-trek-morgo-cycle-composable: PASS — immutable Morgo custody passes at its exact product while the reviewed Risik successor is current');
