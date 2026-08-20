#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const LWAXANA_PRODUCT = "0fbf773eed3c59a51070d19bdf779dcd5327295f";
const LWAXANA_RECEIPT = "data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json";
const LWAXANA_RECEIPT_FILE_SHA = "b7e3be2cb3639f04e3decd11d5ef3ca0d516bbf992305222e84d37332daf65fe";
const LWAXANA_RECEIPT_ID = "172f506624b13c6bdeb97bd8f1d5982afa15883e17a5a74b24dfe4495de5f0b2";
const LWAXANA_CHECKER = "scripts/star-trek-lwaxana-eligibility-rejection.mjs";
const LWAXANA_CHECKER_SHA = "b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947";
const WRAPPER = "scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs";
const KZINTI_RECEIPT = "data/review/adapter-sdk/star-trek-kzinti-flyer-cycle.json";
const KZINTI_CHECKER = "scripts/star-trek-kzinti-flyer-cycle.mjs";
const LWAXANA_TASK = 'ap_a65494e8328ca262d82a49c0';
const KZINTI_TASK = "ap_8f2b1b123aa02bbbb27d00b4";
const WALL = 'UC-1391';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const ok = (value, message) => { if (!value) throw new Error(message); };
function run(label, executable, args, { cwd = process.cwd() } = {}) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

const prior = read(LWAXANA_RECEIPT);
const priorBody = structuredClone(prior);
delete priorBody.receipt_sha256;
ok(sha(fs.readFileSync(LWAXANA_RECEIPT)) === LWAXANA_RECEIPT_FILE_SHA
  && prior.receipt_sha256 === LWAXANA_RECEIPT_ID
  && prior.receipt_sha256 === sha(pretty(priorBody)),
'Lwaxana immutable rejection receipt drifted');
ok(sha(fs.readFileSync(LWAXANA_CHECKER)) === LWAXANA_CHECKER_SHA,
'Lwaxana immutable rejection checker drifted');
ok(prior.adjudication?.classification === 'ineligible / no card'
  && prior.adjudication?.card_created === false
  && prior.boundary?.character_card_created === false
  && prior.waterline?.cycle_id === "cycle_9319b21140ea9f3a85272c7f",
'Lwaxana immutable rejection semantics drifted');

const receipt = read(KZINTI_RECEIPT);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
ok(receipt.receipt_sha256 === sha(pretty(receiptBody))
  && receipt.transaction === 'STAR-TREK-CYCLE-KZINTI_FLYER'
  && receipt.canonical_parent === LWAXANA_PRODUCT
  && receipt.task?.id === KZINTI_TASK
  && receipt.task?.source_fingerprint === "a40931e9803dfd032ef0889b9110f6842945029ba04858cd7dc83375e28504ee",
'Kzinti Flyer successor receipt drifted');
ok(receipt.qualification?.checker_path === KZINTI_CHECKER
  && receipt.qualification?.checker_sha256 === sha(fs.readFileSync(KZINTI_CHECKER)),
'Kzinti Flyer successor checker binding drifted');
ok(receipt.prior_custody?.prior_lwaxana_rejection_receipt_identity === LWAXANA_RECEIPT_ID
  && receipt.prior_custody?.prior_lwaxana_rejection_checker_sha256 === LWAXANA_CHECKER_SHA
  && receipt.prior_custody?.prior_lwaxana_rejection_composable_checker_path === WRAPPER
  && receipt.prior_custody?.prior_lwaxana_rejection_composable_checker_sha256 === sha(fs.readFileSync(WRAPPER)),
'Lwaxana successor-composability custody drifted');

const pkg = read('package.json');
ok(pkg.scripts?.['star-trek:lwaxana-eligibility-rejection:check'] === `node ${WRAPPER}`,
'Lwaxana package route is not successor-composable');
ok(pkg.scripts?.['autopilot:fixtures']?.includes('npm run star-trek:lwaxana-eligibility-rejection:check'),
'Lwaxana composable route is missing from Autopilot fixtures');

const state = read('data/AUTOPILOT.json');
const lwaxana = state.jobs.find((row) => row.id === LWAXANA_TASK);
const kzinti = state.jobs.find((row) => row.id === KZINTI_TASK);
ok(lwaxana?.status === 'rejected' && (lwaxana.wall_ids || []).length === 0 && !lwaxana.lease,
'Lwaxana rejection task was reopened or wall-bound');
ok(kzinti?.status === 'resolved' && kzinti.wall_ids?.length === 1 && kzinti.wall_ids[0] === WALL,
'Kzinti Flyer successor task drifted');
const card = read('data/specimens.json').find((row) => row.id === WALL);
ok(card?.actor === 'James Doohan' && card?.character === 'Kzinti Flyer' && card?.kind === 'voice',
'UC-1391 is not the Kzinti Flyer successor card');
ok(!read('data/specimens.json').some((row) => row.actor === 'Majel Barrett' && row.character === 'Lwaxana Troi'),
'Lwaxana rejection was converted into a card');

run('verify exact Lwaxana product object', 'git', ['cat-file', '-e', `${LWAXANA_PRODUCT}^{commit}`]);
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'undercast-lwaxana-composable-'));
const historical = path.join(parent, 'worktree');
let added = false;
try {
  run('materialize exact Lwaxana rejection product', 'git', ['worktree', 'add', '--detach', historical, LWAXANA_PRODUCT]);
  added = true;
  run('validate immutable Lwaxana rejection at exact product', process.execPath, [LWAXANA_CHECKER], { cwd: historical });
} finally {
  if (added) spawnSync('git', ['worktree', 'remove', '--force', historical], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  fs.rmSync(parent, { recursive: true, force: true });
}
run('validate current Kzinti Flyer successor', process.execPath, [KZINTI_CHECKER]);
console.log('star-trek-lwaxana-eligibility-rejection-composable: PASS — the immutable no-card Lwaxana rejection passes at its exact product while UC-1391 is validly reused by the reviewed Kzinti Flyer successor');
