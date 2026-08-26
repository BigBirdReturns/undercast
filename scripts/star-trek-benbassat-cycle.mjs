#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const C = {"TASK_ID": "ap_dd7d1c73ed237230cd6e1d0b", "PERFORMER": "Nolan North", "CHARACTER": "Benbassat", "FINGERPRINT": "78e1384a3a11787064f98516e5759b55b33369d161067804c2d77f2ef6ef8885", "LEASE_ID": "lease_151ba8f5efac7d922ea2f8c2", "WALL_ID": "UC-1397", "LIVE_MAIN": "29b9ab279dac90fad82aac48633ef83d5ac81b39", "LIVE_TREE": "7c2ad054ceb3b3cbd1f0c00c838cfc3d014ff169", "CANDIDATE_COMMIT": "637d0b9d0cef669f354b9c4f5961a8e8bd0b1c19", "CANDIDATE_TREE": "0c09b5da9d37157f954725578a9b17bcd7d08109", "CANDIDATE_RECEIPT_SHA": "5d4f02fab0a0e77f9b8ab19d155be3b9f09437332403bb3e9a0681c0ab2512e3", "REVIEW_SHA": "a3cf9d3230e235f8ecd95bda46c27b24c5649638208d2b3779511b80cfa745cf", "ALICE_RECEIPT_SHA": "07331e142b70e21ff8eed6c40a23a576c259c9cd2afae462250a8961bcc09472", "ALICE_CHECKER_SHA": "7b924da030e7ea39d868bd582ae41dc6df443cf543bf97f2f22f960db06c2371", "ALICE_CYCLE_ID": "cycle_bc4e10d8ce3d09b5f12b81cc"};
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const digestObject = (value) => crypto.createHash('sha256').update(JSON.stringify(stable(value), null, 2) + '\n').digest('hex');
const digestCompact = (value) => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const digestFile = (path) => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const fail = (message) => { throw new Error(`star-trek-benbassat-cycle: ${message}`); };

const receiptPath = 'data/review/adapter-sdk/star-trek-benbassat-cycle.json';
const checkerPath = 'scripts/star-trek-benbassat-cycle.mjs';
const receipt = read(receiptPath);
const receiptBody = {...receipt};
delete receiptBody.receipt_sha256;
if (digestObject(receiptBody) !== receipt.receipt_sha256) fail('receipt identity drifted');
if (digestFile(checkerPath) !== receipt.qualification?.checker_sha256) fail('checker identity drifted');
if (receipt.transaction !== 'STAR-TREK-CYCLE-BENBASSAT' || receipt.version !== 2) fail('receipt transaction drifted');
if (receipt.canonical_parent !== C.LIVE_MAIN || receipt.maintenance_parent?.tree !== C.LIVE_TREE) fail('publication base drifted');
if (receipt.task?.id !== C.TASK_ID || receipt.task?.performer !== C.PERFORMER || receipt.task?.character !== C.CHARACTER || receipt.task?.source_fingerprint !== C.FINGERPRINT) fail('task identity drifted');
if (receipt.task?.production !== 'Võx' || receipt.task?.series !== 'Star Trek: Picard' || receipt.task?.years !== '2023' || receipt.task?.performance_mode !== 'voice-only') fail('performance object drifted');
if (receipt.task?.physical_performance_attributed !== false || receipt.task?.prosthetic_performance_attributed !== false || receipt.task?.maker_attribution !== 'unresolved') fail('unsupported attribution promoted');
if (receipt.lease?.id !== C.LEASE_ID || receipt.canonical?.wall_id !== C.WALL_ID) fail('lease or wall custody drifted');
if (receipt.candidate?.commit !== C.CANDIDATE_COMMIT || receipt.candidate?.tree !== C.CANDIDATE_TREE || receipt.candidate?.receipt_sha256 !== C.CANDIDATE_RECEIPT_SHA) fail('candidate custody drifted');
if (receipt.independent_review?.review_sha256 !== C.REVIEW_SHA || receipt.independent_review?.verdict !== 'pass') fail('independent review drifted');
if (receipt.predecessor?.receipt_sha256 !== C.ALICE_RECEIPT_SHA || receipt.predecessor?.checker_sha256 !== C.ALICE_CHECKER_SHA || receipt.predecessor?.cycle_id !== C.ALICE_CYCLE_ID) fail('Alice predecessor custody drifted');

const alice = read('data/review/adapter-sdk/star-trek-alice-cycle.json');
const aliceBody = {...alice};
delete aliceBody.receipt_sha256;
if (digestObject(aliceBody) !== C.ALICE_RECEIPT_SHA || alice.receipt_sha256 !== C.ALICE_RECEIPT_SHA) fail('Alice receipt identity drifted');
if (digestFile('scripts/star-trek-alice-cycle.mjs') !== C.ALICE_CHECKER_SHA) fail('Alice checker identity drifted');

const candidate = read('data/review/adapter-sdk/star-trek-benbassat-candidate.json');
const candidateBody = {...candidate};
delete candidateBody.receipt_sha256;
if (digestObject(candidateBody) !== C.CANDIDATE_RECEIPT_SHA || candidate.receipt_sha256 !== C.CANDIDATE_RECEIPT_SHA) fail('candidate receipt identity drifted');
for (const key of ['precomplete','terminal']) {
  const row = candidate.projection_refresh?.[key];
  if (!row) fail(`candidate ${key} census receipt missing`);
  const body = {...row};
  delete body.receipt_sha256;
  if (digestCompact(body) !== row.receipt_sha256) fail(`candidate ${key} census identity drifted`);
}

const state = read('data/AUTOPILOT.json');
const trek = state.jobs.filter((row) => row.scope === 'star-trek');
const task = trek.find((row) => row.id === C.TASK_ID);
if (!task || task.status !== 'resolved' || task.attempts !== 1 || task.performer !== C.PERFORMER || task.character !== C.CHARACTER || task.source_fingerprint !== C.FINGERPRINT || task.lease != null || task.outcome?.media_review?.lease_id !== C.LEASE_ID || JSON.stringify(task.wall_ids) !== JSON.stringify([C.WALL_ID])) fail('durable task drifted');
if (trek.length !== 2228) fail('Star Trek denominator drifted');
if (trek.filter((row) => row.status === 'resolved').length < 429) fail('resolved floor regressed');
if (trek.filter((row) => ['leased','drafted','merged'].includes(row.status)).length > 1) fail('later-cycle active-task bound exceeded');

const water = read('data/WATERLINE-STATE.json');
const cycle = water.cycles.find((row) => row.id === receipt.reviewed_cycle?.id && row.scope_id === 'star-trek' && row.lease_id === C.LEASE_ID);
if (!cycle || cycle.outcome !== 'completed' || cycle.task_statuses?.[C.TASK_ID] !== 'resolved') fail('waterline custody drifted');
if (!water.cycles.some((row) => row.id === C.ALICE_CYCLE_ID && row.outcome === 'completed')) fail('Alice predecessor cycle missing');

const records = read('data/specimens.json').filter((row) => row.id === C.WALL_ID);
if (records.length !== 1) fail(`canonical record cardinality drifted (${records.length})`);
const record = records[0];
if (record.actor !== C.PERFORMER || record.character !== C.CHARACTER || record.production !== 'Võx' || record.years !== '2023' || record.kind !== 'voice' || record.designer !== '—' || record.transform !== 2 || 'still' in record || 'portrait' in record) fail('canonical record boundary drifted');
if (!String(record.reveal || '').includes('physical-prosthetic hint is rejected')) fail('queue-hint rejection text missing');

const audit = read('data/MEDIA-AUDIT.json');
const facets = audit.items.filter((row) => row.wall_id === C.WALL_ID && ['still','portrait'].includes(row.side));
if (facets.length !== 2 || new Set(facets.map((row) => row.side)).size !== 2) fail('media facet cardinality drifted');
for (const facet of facets) {
  if (facet.status !== 'absent' || facet.asset !== null || JSON.stringify(facet.votes) !== '[]' || facet.claims?.identity !== null || facet.claims?.presentation !== null || !(facet.risk_codes || []).includes('source-declared-absent')) fail(`${facet.side} honest absence drifted`);
}

const sourceRows = read('data/SOURCES.json').filter((row) => row.id === C.WALL_ID);
if (sourceRows.length !== 1 || sourceRows[0].actor !== C.PERFORMER || sourceRows[0].character !== C.CHARACTER || sourceRows[0].still !== null || sourceRows[0].portrait !== null) fail('SOURCES custody drifted');
if (fs.existsSync('images') && fs.readdirSync('images').some((name) => name.startsWith('uc-1397-'))) fail('unexpected Benbassat image bytes');
if (!fs.readFileSync('sitemap.xml', 'utf8').includes(`records/${C.WALL_ID}/`)) fail('permanent route missing');

console.log('star-trek-benbassat-cycle: PASS — Nolan North voice-only Võx custody, honest visual absence, reviewed waterline closure, maintenance-parent preservation, Alice predecessor custody, and later-cycle bounds are intact');
