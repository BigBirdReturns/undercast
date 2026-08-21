#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const LEASE = process.argv[2];
if (!LEASE) throw new Error('usage: unitkzintiflyer-prior-phase.mjs <unitkzintiflyer-lease-id>');
const TASK = 'ap_8f2b1b123aa02bbbb27d00b4';
const WALL = 'UC-1391';
const PERFORMER = 'James Doohan';
const ROLE = "Kzinti Flyer";
const SOURCE = "https://memory-alpha.fandom.com/wiki/Kzinti_Flyer";
const FINGERPRINT = 'a40931e9803dfd032ef0889b9110f6842945029ba04858cd7dc83375e28504ee';
const STILL_SHA = 'ab5bf6bc35d63a5b1511f82303f7dd1dc0aa886b423c90d11b22c7949a7b93de';
const PORTRAIT_SHA = 'fa3811f5d44a7e3f58283b53dfb39282ee01ca7ae261c4ff78e47a47610db3a0';
const PRIOR_LWAXANA_RECEIPT = 'data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json';
const PRIOR_LWAXANA_RECEIPT_FILE_SHA = 'b7e3be2cb3639f04e3decd11d5ef3ca0d516bbf992305222e84d37332daf65fe';
const PRIOR_LWAXANA_RECEIPT_ID = '172f506624b13c6bdeb97bd8f1d5982afa15883e17a5a74b24dfe4495de5f0b2';
const PRIOR_LWAXANA_CHECKER = 'scripts/star-trek-lwaxana-eligibility-rejection.mjs';
const PRIOR_LWAXANA_CHECKER_SHA = 'b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947';
const PRIOR_LWAXANA_CYCLE = 'cycle_9319b21140ea9f3a85272c7f';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok = (value, message) => { if (!value) throw new Error(message); };
const fileSha = (file) => sha(fs.readFileSync(file));
function run(label, executable, args) {
  const result = spawnSync(executable, args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
  if (result.error || result.status !== 0) throw new Error(`${label} failed:\n${result.stdout || ''}\n${result.stderr || ''}`);
}

const prior = read(PRIOR_LWAXANA_RECEIPT);
const priorBody = structuredClone(prior); delete priorBody.receipt_sha256;
ok(fileSha(PRIOR_LWAXANA_RECEIPT) === PRIOR_LWAXANA_RECEIPT_FILE_SHA
  && prior.receipt_sha256 === PRIOR_LWAXANA_RECEIPT_ID
  && prior.receipt_sha256 === sha(pretty(priorBody))
  && prior.waterline?.cycle_id === PRIOR_LWAXANA_CYCLE
  && fileSha(PRIOR_LWAXANA_CHECKER) === PRIOR_LWAXANA_CHECKER_SHA,
'prior Lwaxana eligibility-rejection custody drifted');
ok(prior.adjudication?.classification === 'ineligible / no card'
  && prior.adjudication?.card_created === false
  && prior.boundary?.character_card_created === false
  && prior.next_deterministic_obligation?.candidate?.task_id === TASK
  && prior.next_deterministic_obligation?.candidate?.source_fingerprint === FINGERPRINT,
'prior Lwaxana eligibility-rejection semantic custody drifted');

const state = read('data/AUTOPILOT.json');
const trek = state.jobs.filter((row) => row.scope === 'star-trek');
const task = trek.find((row) => row.id === TASK);
ok(trek.length === 2228
  && task?.status === 'resolved'
  && task.performer === PERFORMER
  && task.character === ROLE
  && task.source_fingerprint === FINGERPRINT
  && task.wall_ids?.length === 1
  && task.wall_ids[0] === WALL,
'Kzinti Flyer projected task drifted');
const card = read('data/specimens.json').find((row) => row.id === WALL);
ok(card?.actor === PERFORMER && card?.character === ROLE && card?.production === "Star Trek: The Animated Series (The Slaver Weapon)"
  && card?.years === '1973' && card?.kind === 'voice' && card?.designer === '—' && card?.link === SOURCE,
'Kzinti Flyer projected card drifted');
ok(card.reveal === "The frozen Kzinti Flyer source identifies James Doohan as the role’s performer and places the role in The Slaver Weapon, supporting a voice-only claim bounded to the 1973 episode. The exact role still is retained only as character evidence, while a separately sourced public-domain portrait supports Doohan’s identity. Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separately bounded James Doohan roles. No physical performance, animation, character design, voice direction, editing, sound processing, production-shop labor, vocal transformation, or other maker credit is inferred.", 'Kzinti Flyer performance boundary drifted');
ok(fileSha(card.still.src) === STILL_SHA && fileSha(card.portrait.src) === PORTRAIT_SHA, 'Kzinti Flyer projected media drifted');
const facets = read('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL);
ok(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'Kzinti Flyer projected media review is incomplete');

const claims = jsonl('data/journal/autopilot.jsonl').filter((row) => row.op === 'lease.claimed' && row.scope === 'star-trek');
const claim = claims.find((row) => row.lease_id === LEASE && row.task_id === TASK);
ok(claim, 'Kzinti Flyer claim is missing');
for (const row of claims) {
  const body = structuredClone(row); delete body.id;
  ok(row.id === `apj_${sha(JSON.stringify(body)).slice(0, 24)}`, 'Star Trek claim is not content-addressed');
}
const receipts = read('data/WATERLINE-STATE.json').cycles.filter((row) => row.scope_id === 'star-trek');
const byLease = new Map(receipts.map((row) => [row.lease_id, row]));
ok(!byLease.has(LEASE), 'Kzinti Flyer candidate already has a cycle receipt');
const unreceipted = claims.filter((row) => !byLease.has(row.lease_id));
ok(unreceipted.length === 1 && unreceipted[0].lease_id === LEASE && unreceipted[0].task_id === TASK,
'Kzinti Flyer is not the single unreceipted Star Trek cycle');
ok(trek.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length === 0,
'Kzinti Flyer projected task did not return to zero in-flight work');
ok(trek.filter((row) => row.status === 'queued').length === 1803
  && trek.filter((row) => row.status === 'resolved').length === 423
  && trek.filter((row) => row.status === 'rejected').length === 2,
'Kzinti Flyer candidate queue drifted');
const estate = read('data/ESTATE-REGISTRY.json').estates.find((row) => row.id === 'star-trek');
const PRIOR_CANONICAL_PRODUCT_CYCLE = 'cycle_0175bc5e1dd368374c066342';
ok(estate?.next_gate?.includes(PRIOR_CANONICAL_PRODUCT_CYCLE) && estate.next_gate.includes('1,805 tasks remain queued'),
'canonical registry changed before Kzinti Flyer receipt');
const baseline = read('data/review/adapter-sdk/BASELINE.json');
ok(baseline.inputs?.estate_registry?.sha256 === fileSha('data/ESTATE-REGISTRY.json'), 'adapter baseline registry binding drifted');
console.log('star-trek-kzinti-flyer-prior-phase: PASS — immutable Lwaxana rejection custody survives one resolved, unreceipted Kzinti Flyer projection while the no-card predecessor leaves the canonical registry on the prior Kukulkan product');
