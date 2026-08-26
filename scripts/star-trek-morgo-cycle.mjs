#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const C = {"TASK_ID": "ap_a7fb29c5cce85c86708ea0e6", "PERFORMER": "Fred Tatasciore", "CHARACTER": "Morgo", "FINGERPRINT": "279c816ebd1b83899f5b257f7880df5734bb855f4206c2fc92c5278c9370ff46", "LEASE_ID": "lease_578930730585295673ca706d", "WALL_ID": "UC-1398", "LIVE_MAIN": "5e89a0ba59f36feae7986a9260b8fa17a824a8b7", "LIVE_TREE": "0819bd9ace59e2d8cf8721a5acd1f5de5498cd87", "CANDIDATE_COMMIT": "55e96dffe77c9562fa0b63c12cc58016db63754b", "CANDIDATE_TREE": "e225af43510b2ee5ede543fce5e8c0a263434be9", "CANDIDATE_RECEIPT_SHA": "3c5de16f13d0c758a1577e64b98007dc7c4968077fa45d66e8cea4d06eeb5295", "REVIEW_SHA": "1844a2f723931c348bc9659415b987b67d3b1449e62b8219484f9ad4a42173e0", "PREDECESSOR_RECEIPT_SHA": "c7cde25b13b7f1eb48b808d38b1a4744a5f8300e9d2f2ccd14507f14de16cc32", "PREDECESSOR_CHECKER_SHA": "85b92e61756b49afd6e56bf3240bec4fe3224a16015c5270f7ee3f9d0562eeb3", "PREDECESSOR_CYCLE_ID": "cycle_e314148f23e9a9ee10424775", "STILL_SHA": "d9e6600f5b4c56540329bddd824b6d8392193f9c19cafebb6187d2872c21f548", "PORTRAIT_SHA": "ae19bcd09869d848fd74202fcc3c59ac41dbef153f7a33844c278b91b8d4ea5f", "STILL_ITEM": "ma_4cf320b41ba67ad4dbe2f5dd", "PORTRAIT_ITEM": "ma_8254f59b1cc6004f0fa5f1a2"};
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const digestObject = (value) => crypto.createHash('sha256').update(JSON.stringify(stable(value), null, 2) + '\n').digest('hex');
const digestCompact = (value) => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const digestFile = (path) => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const fail = (message) => { throw new Error(`star-trek-morgo-cycle: ${message}`); };
const assetSrc = (value) => typeof value === 'string' ? value : value?.src;

const receiptPath = 'data/review/adapter-sdk/star-trek-morgo-cycle.json';
const checkerPath = 'scripts/star-trek-morgo-cycle.mjs';
const receipt = read(receiptPath);
const receiptBody = {...receipt};
delete receiptBody.receipt_sha256;
if (digestObject(receiptBody) !== receipt.receipt_sha256) fail('receipt identity drifted');
if (digestFile(checkerPath) !== receipt.qualification?.checker_sha256) fail('checker identity drifted');
if (receipt.transaction !== 'STAR-TREK-CYCLE-MORGO' || receipt.version !== 1) fail('receipt transaction drifted');
if (receipt.canonical_parent !== C.LIVE_MAIN || receipt.maintenance_parent?.tree !== C.LIVE_TREE) fail('publication base drifted');
if (receipt.task?.id !== C.TASK_ID || receipt.task?.performer !== C.PERFORMER || receipt.task?.character !== C.CHARACTER || receipt.task?.source_fingerprint !== C.FINGERPRINT) fail('task identity drifted');
if (receipt.task?.production !== 'The Least Dangerous Game' || receipt.task?.series !== 'Star Trek: Lower Decks' || receipt.task?.years !== '2022' || receipt.task?.performance_mode !== 'voice-animation') fail('performance object drifted');
for (const key of ['physical_performance_attributed','prosthetic_performance_attributed','animation_labor_attributed','character_design_attributed','voice_direction_attributed','vocal_processing_attributed','sound_attributed','transformation_measured']) {
  if (receipt.task?.[key] !== false) fail(`unsupported attribution promoted: ${key}`);
}
if (receipt.task?.maker_attribution !== 'unresolved') fail('maker attribution drifted');
if (receipt.lease?.id !== C.LEASE_ID || receipt.canonical?.wall_id !== C.WALL_ID) fail('lease or wall custody drifted');
if (receipt.candidate?.commit !== C.CANDIDATE_COMMIT || receipt.candidate?.tree !== C.CANDIDATE_TREE || receipt.candidate?.receipt_sha256 !== C.CANDIDATE_RECEIPT_SHA) fail('candidate custody drifted');
if (receipt.independent_review?.review_sha256 !== C.REVIEW_SHA || receipt.independent_review?.verdict !== 'pass') fail('independent review drifted');
if (receipt.predecessor?.receipt_sha256 !== C.PREDECESSOR_RECEIPT_SHA || receipt.predecessor?.checker_sha256 !== C.PREDECESSOR_CHECKER_SHA || receipt.predecessor?.cycle_id !== C.PREDECESSOR_CYCLE_ID) fail('Benbassat predecessor custody drifted');

const predecessor = read('data/review/adapter-sdk/star-trek-benbassat-cycle.json');
const predecessorBody = {...predecessor};
delete predecessorBody.receipt_sha256;
if (digestObject(predecessorBody) !== C.PREDECESSOR_RECEIPT_SHA || predecessor.receipt_sha256 !== C.PREDECESSOR_RECEIPT_SHA) fail('Benbassat receipt identity drifted');
if (digestFile('scripts/star-trek-benbassat-cycle.mjs') !== C.PREDECESSOR_CHECKER_SHA) fail('Benbassat checker identity drifted');

const candidate = read('data/review/adapter-sdk/star-trek-morgo-candidate.json');
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
if (trek.filter((row) => row.status === 'resolved').length < 430) fail('resolved floor regressed');
if (trek.filter((row) => ['leased','drafted','merged'].includes(row.status)).length > 1) fail('later-cycle active-task bound exceeded');

const water = read('data/WATERLINE-STATE.json');
const cycle = water.cycles.find((row) => row.id === receipt.reviewed_cycle?.id && row.scope_id === 'star-trek' && row.lease_id === C.LEASE_ID);
if (!cycle || cycle.outcome !== 'completed' || cycle.task_statuses?.[C.TASK_ID] !== 'resolved') fail('waterline custody drifted');
if (!water.cycles.some((row) => row.id === C.PREDECESSOR_CYCLE_ID && row.outcome === 'completed')) fail('Benbassat predecessor cycle missing');

const records = read('data/specimens.json').filter((row) => row.id === C.WALL_ID);
if (records.length !== 1) fail(`canonical record cardinality drifted (${records.length})`);
const record = records[0];
if (record.actor !== C.PERFORMER || record.character !== C.CHARACTER || record.production !== 'The Least Dangerous Game' || record.years !== '2022' || record.kind !== 'voice' || record.designer !== '—' || record.transform !== 2) fail('canonical record boundary drifted');
if (assetSrc(record.still) !== 'images/uc-1398-still.webp' || assetSrc(record.portrait) !== 'images/uc-1398-portrait.jpg') fail('canonical media paths drifted');
if (digestFile('images/uc-1398-still.webp') !== C.STILL_SHA || digestFile('images/uc-1398-portrait.jpg') !== C.PORTRAIT_SHA) fail('canonical media bytes drifted');

const audit = read('data/MEDIA-AUDIT.json');
const facets = audit.items.filter((row) => row.wall_id === C.WALL_ID && ['still','portrait'].includes(row.side));
if (facets.length !== 2 || new Set(facets.map((row) => row.side)).size !== 2) fail('media facet cardinality drifted');
for (const facet of facets) {
  const expected = facet.side === 'still'
    ? {id:C.STILL_ITEM, sha:C.STILL_SHA, presentation:'character-depiction'}
    : {id:C.PORTRAIT_ITEM, sha:C.PORTRAIT_SHA, presentation:'neutral-human'};
  if (facet.id !== expected.id || facet.status !== 'verified' || facet.asset?.sha256 !== expected.sha || facet.claims?.identity?.state !== 'enforced' || facet.claims?.identity?.value !== 'expected' || facet.claims?.presentation?.state !== 'enforced' || facet.claims?.presentation?.value !== expected.presentation || facet.votes?.length !== 2 || facet.votes.some((vote) => vote.asset_sha256 !== expected.sha)) fail(`${facet.side} media custody drifted`);
}

const sourceRows = read('data/SOURCES.json').filter((row) => row.id === C.WALL_ID);
if (sourceRows.length !== 1 || sourceRows[0].actor !== C.PERFORMER || sourceRows[0].character !== C.CHARACTER || assetSrc(sourceRows[0].still) !== 'images/uc-1398-still.webp' || assetSrc(sourceRows[0].portrait) !== 'images/uc-1398-portrait.jpg') fail('SOURCES custody drifted');

const registry = read('data/ESTATE-REGISTRY.json');
const estate = registry.estates.find((row) => row.id === 'star-trek');
if (!estate || digestFile('data/ESTATE-REGISTRY.json') !== receipt.registry?.sha256 || crypto.createHash('sha256').update(estate.next_gate).digest('hex') !== receipt.registry?.next_gate_sha256) fail('estate registry custody drifted');
if (!fs.readFileSync('sitemap.xml', 'utf8').includes(`records/${C.WALL_ID}/`)) fail('permanent route missing');

console.log('star-trek-morgo-cycle: PASS — Fred Tatasciore voice-animation custody, exact Morgo and performer media, reviewed waterline closure, maintenance-parent preservation, Benbassat predecessor custody, and later-cycle bounds are intact');
