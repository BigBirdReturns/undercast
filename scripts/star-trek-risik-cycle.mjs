#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const C = {"TASK_ID": "ap_096624f177ae0c9f2e91836c", "PERFORMER": "Fred Tatasciore", "CHARACTER": "Risik", "FINGERPRINT": "6a66df1f109bbe6f0cd679ab95e29d0090dc3f3139219a99daae82b3001f2cc6", "LEASE_ID": "lease_5d07d02fd67ea40a4950b1dd", "WALL_ID": "UC-1399", "LIVE_MAIN": "4a2f98c4dc2039f596857cfdff01e701acbd2e4d", "LIVE_TREE": "cc87894c72de3a7331b7ebe63e11badfaaecb4c5", "LIVE_PARENT": "129e6f9c389fe61bb8027f4e046bea7de510cb84", "CANDIDATE_COMMIT": "03afc14da5b1cbe53cb99708edddb3c4c33a0adf", "CANDIDATE_TREE": "945e4da7a8b325173ac2b7b8da9fd3d65c5525c3", "CANDIDATE_RECEIPT_SHA": "831bc23f0060dfdebd3c99ffd905947bf3143344568ee174fe66dac4fcab1641", "REVIEW_COMMIT": "9c3916a64b8026f6dbc50c5a1251ac8950caf378", "REVIEW_TREE": "cc47fccda9d604d22f64b57c82647d497e39ed2f", "REVIEW_SHA": "ed561287b1008f0b1a4cc571fc84c8aa0b91d28000df541e69447330c3ba8c04", "MORGO_PRODUCT": "129e6f9c389fe61bb8027f4e046bea7de510cb84", "MORGO_RECEIPT_SHA": "bbaf8f35578fefe02e5497ed5b11c290dc139f5347cc09cc6a376214d88aaa89", "MORGO_CHECKER_SHA": "96a01340a938ecaae780704947dd37ff4674dc797a45d901a8dee15bd99f9d26", "MORGO_CYCLE_ID": "cycle_cbd56708498f15573b441357", "CYCLE_ID": "cycle_208262c3f2dc4b499ef5f2f4", "STILL_SHA": "3e79fb94f8745963493334d49674efca2d801ca03d4aa05cd5f49f08cf4ffcb9", "PORTRAIT_SHA": "e38d8c94d6ae0d64f41c2c24a4957b576e9cc2ac815a8824d4ee625519de9b42", "STILL_ITEM": "ma_c33a2bc57b2edeb77c2170e9", "PORTRAIT_ITEM": "ma_1c7457e3778e5c94ece5dabd", "REGISTRY_SHA": "6e09c6c2d0e10c94acea62a53653adfc9c627c578b4c5e02d005661a76becd2c", "REGISTRY_GATE_SHA": "51cdbd86c39b17af88bfee46bc81873bb305e3d6f718447f9b86a30f6fb47b83"};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = (file) => sha(fs.readFileSync(file));
const fail = (message) => { throw new Error(`star-trek-risik-cycle: ${message}`); };
const assetSrc = (value) => typeof value === 'string' ? value : value?.src;

const receiptPath = 'data/review/adapter-sdk/star-trek-risik-cycle.json';
const checkerPath = 'scripts/star-trek-risik-cycle.mjs';
const receipt = read(receiptPath);
const body = structuredClone(receipt);
delete body.receipt_sha256;
if (receipt.receipt_sha256 !== sha(pretty(body))) fail('receipt identity drifted');
if (fileHash(checkerPath) !== receipt.qualification?.checker_sha256) fail('checker identity drifted');
if (receipt.transaction !== 'STAR-TREK-CYCLE-RISIK' || receipt.version !== 1) fail('receipt transaction drifted');
if (receipt.canonical_parent !== C.LIVE_MAIN
  || receipt.maintenance_parent?.tree !== C.LIVE_TREE
  || receipt.maintenance_parent?.parent !== C.LIVE_PARENT) fail('maintenance publication base drifted');
if (receipt.task?.id !== C.TASK_ID
  || receipt.task?.performer !== C.PERFORMER
  || receipt.task?.character !== C.CHARACTER
  || receipt.task?.source_fingerprint !== C.FINGERPRINT
  || receipt.task?.production !== 'Something Borrowed, Something Green'
  || receipt.task?.series !== 'Star Trek: Lower Decks'
  || receipt.task?.years !== '2023'
  || receipt.task?.performance_mode !== 'voice-animation') fail('performance object drifted');
for (const key of [
  'physical_performance_attributed',
  'prosthetic_performance_attributed',
  'animation_labor_attributed',
  'character_design_attributed',
  'voice_direction_attributed',
  'vocal_processing_attributed',
  'sound_attributed',
  'transformation_measured',
]) {
  if (receipt.task?.[key] !== false) fail(`unsupported attribution promoted: ${key}`);
}
if (receipt.task?.maker_attribution !== 'unresolved') fail('maker attribution drifted');
if (receipt.lease?.id !== C.LEASE_ID || receipt.canonical?.wall_id !== C.WALL_ID) fail('lease or wall custody drifted');
if (receipt.candidate?.commit !== C.CANDIDATE_COMMIT
  || receipt.candidate?.tree !== C.CANDIDATE_TREE
  || receipt.candidate?.receipt_sha256 !== C.CANDIDATE_RECEIPT_SHA) fail('candidate custody drifted');
if (receipt.independent_review?.commit !== C.REVIEW_COMMIT
  || receipt.independent_review?.tree !== C.REVIEW_TREE
  || receipt.independent_review?.review_sha256 !== C.REVIEW_SHA
  || receipt.independent_review?.verdict !== 'pass') fail('independent review drifted');
if (receipt.predecessor?.product_commit !== C.MORGO_PRODUCT
  || receipt.predecessor?.receipt_sha256 !== C.MORGO_RECEIPT_SHA
  || receipt.predecessor?.checker_sha256 !== C.MORGO_CHECKER_SHA
  || receipt.predecessor?.cycle_id !== C.MORGO_CYCLE_ID) fail('Morgo predecessor custody drifted');

const predecessor = read('data/review/adapter-sdk/star-trek-morgo-cycle.json');
const predecessorBody = structuredClone(predecessor);
delete predecessorBody.receipt_sha256;
if (predecessor.receipt_sha256 !== C.MORGO_RECEIPT_SHA
  || sha(pretty(predecessorBody)) !== C.MORGO_RECEIPT_SHA) fail('Morgo receipt identity drifted');
if (fileHash('scripts/star-trek-morgo-cycle.mjs') !== C.MORGO_CHECKER_SHA) fail('Morgo checker identity drifted');

const candidate = read('data/review/adapter-sdk/star-trek-risik-candidate.json');
const candidateBody = structuredClone(candidate);
delete candidateBody.receipt_sha256;
if (candidate.receipt_sha256 !== C.CANDIDATE_RECEIPT_SHA
  || sha(pretty(candidateBody)) !== C.CANDIDATE_RECEIPT_SHA) fail('candidate receipt identity drifted');

const state = read('data/AUTOPILOT.json');
const trek = state.jobs.filter((row) => row.scope === 'star-trek');
const task = trek.find((row) => row.id === C.TASK_ID);
if (!task
  || task.status !== 'resolved'
  || task.attempts !== 1
  || task.performer !== C.PERFORMER
  || task.character !== C.CHARACTER
  || task.source_fingerprint !== C.FINGERPRINT
  || task.lease != null
  || JSON.stringify(task.wall_ids) !== JSON.stringify([C.WALL_ID])) fail('durable task drifted');
const active = trek.filter((row) => ['leased','drafted','merged'].includes(row.status));
if (trek.length !== 2228) fail('Star Trek denominator drifted');
if (trek.filter((row) => row.status === 'resolved').length < 431) fail('resolved floor regressed');
if (active.length > 1) fail('later-cycle active-task bound exceeded');

const water = read('data/WATERLINE-STATE.json');
const cycle = water.cycles.find((row) => row.id === C.CYCLE_ID
  && row.scope_id === 'star-trek'
  && row.lease_id === C.LEASE_ID);
if (!cycle || cycle.outcome !== 'completed' || cycle.task_statuses?.[C.TASK_ID] !== 'resolved') fail('waterline custody drifted');
if (!water.cycles.some((row) => row.id === C.MORGO_CYCLE_ID && row.outcome === 'completed')) fail('Morgo predecessor cycle missing');

const records = read('data/specimens.json').filter((row) => row.id === C.WALL_ID);
if (records.length !== 1) fail(`canonical record cardinality drifted (${records.length})`);
const record = records[0];
if (record.actor !== C.PERFORMER
  || record.character !== C.CHARACTER
  || record.production !== 'Something Borrowed, Something Green'
  || record.years !== '2023'
  || record.kind !== 'voice'
  || record.designer !== '—'
  || record.transform !== 2) fail('canonical record boundary drifted');
if (assetSrc(record.still) !== 'images/uc-1399-still.webp'
  || assetSrc(record.portrait) !== 'images/uc-1399-portrait.jpg') fail('canonical media paths drifted');
if (fileHash('images/uc-1399-still.webp') !== C.STILL_SHA
  || fileHash('images/uc-1399-portrait.jpg') !== C.PORTRAIT_SHA) fail('canonical media bytes drifted');

const audit = read('data/MEDIA-AUDIT.json');
const facets = audit.items.filter((row) => row.wall_id === C.WALL_ID && ['still','portrait'].includes(row.side));
if (facets.length !== 2 || new Set(facets.map((row) => row.side)).size !== 2) fail('media facet cardinality drifted');
for (const facet of facets) {
  const expected = facet.side === 'still'
    ? {id:C.STILL_ITEM, sha:C.STILL_SHA, presentation:'character-depiction'}
    : {id:C.PORTRAIT_ITEM, sha:C.PORTRAIT_SHA, presentation:'neutral-human'};
  if (facet.id !== expected.id
    || facet.status !== 'verified'
    || facet.asset?.sha256 !== expected.sha
    || facet.claims?.identity?.state !== 'enforced'
    || facet.claims?.identity?.value !== 'expected'
    || facet.claims?.presentation?.state !== 'enforced'
    || facet.claims?.presentation?.value !== expected.presentation
    || facet.votes?.length !== 2
    || facet.votes.some((vote) => vote.asset_sha256 !== expected.sha
      || vote.enforced !== true
      || vote.role !== 'second-desk')) fail(`${facet.side} media custody drifted`);
}

const episodes = receipt.source_review?.confirmed_voiced_episodes;
const expectedEpisodes = [{"title": "Something Borrowed, Something Green", "first_aired": "21 September 2023"}, {"title": "The Inner Fight", "first_aired": "26 October 2023"}, {"title": "Old Friends, New Planets", "first_aired": "2 November 2023"}];
if (!Array.isArray(episodes)
  || episodes.some((row) => !row
    || typeof row !== 'object'
    || Array.isArray(row)
    || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(['first_aired','title']))
  || JSON.stringify(episodes.map((row) => ({title: row.title, first_aired: row.first_aired}))) !== JSON.stringify(expectedEpisodes)) fail('reviewed episode set drifted');
const registry = read('data/ESTATE-REGISTRY.json');
const estate = registry.estates.find((row) => row.id === 'star-trek');
if (!estate
  || fileHash('data/ESTATE-REGISTRY.json') !== C.REGISTRY_SHA
  || sha(estate.next_gate) !== C.REGISTRY_GATE_SHA) fail('estate registry custody drifted');

const pkg = read('package.json');
if (pkg.scripts?.['star-trek:morgo-cycle:check'] !== 'node scripts/star-trek-morgo-cycle-composable.mjs'
  || pkg.scripts?.['star-trek:risik-cycle:check'] !== 'node scripts/star-trek-risik-cycle.mjs'
  || !pkg.scripts?.['autopilot:fixtures']?.includes('npm run star-trek:risik-cycle:check')) fail('package checker routes drifted');
if (!fs.readFileSync('sitemap.xml', 'utf8').includes(`records/${C.WALL_ID}/`)) fail('permanent route missing');

console.log('star-trek-risik-cycle: PASS — Fred Tatasciore voice-animation custody, three reviewed Risik appearances, exact source-distinct media, reviewed waterline closure, maintenance-parent preservation, and Morgo predecessor custody are intact');
