#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const LEASE = process.argv[2];
if (!LEASE) throw new Error('usage: white-rabbit-prior-phase.mjs <white-rabbit-lease-id>');

const TASK = 'ap_4023ad9add0c718ecb2c6040';
const WALL = 'UC-1370';
const PERFORMER = 'James Doohan';
const ROLE = 'White Rabbit';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/White_Rabbit';
const FINGERPRINT = 'a5dc46d26e6b8f75cb52ec6ed0c0819cdc882dce39669f1f355940022d6c93b8';
const STILL_SHA = '4a5191e7614e31b280b8358b2389f19e877f731bd226ec307f597e9db2c81b57';
const PORTRAIT_SHA = 'aced8b0de7ccc4aa3bb2122d9d9cac36f2a10c77ab3c1e5753c21f2cb65c6d40';



const KORAX_TASK = 'ap_a926c74957211800c4a6d482';
const KORAX_LEASE = 'lease_6745fd243478c16e4687f721';
const KORAX_WALL = 'UC-1369';
const KORAX_CYCLE = 'cycle_d0ac4d87953b8ff835c88fb9';
const KORAX_RECEIPT = 'data/review/adapter-sdk/star-trek-korax-cycle.json';
const KORAX_RECEIPT_FILE = '45fe401a3b9b5bae668a2e7bf2a566f2f7456ce4dab5fa5b7cef5f7fef179db0';
const KORAX_RECEIPT_ID = 'f6d2d004c859f1cf3b5bc8fe0ab5a3b6d1c35cf01095e0c16f9c943eba11d381';
const KORAX_CHECKER = 'scripts/star-trek-korax-cycle.mjs';
const KORAX_CHECKER_SHA = '04035d7515ff95fc8c7a45edc116709b3168aa8d6ca6b542f76486babdfea006';

const KOR_TASK = 'ap_c361a3f03ac5400aebae273b';
const KOR_LEASE = 'lease_9c1f31d5dedfe458339e38d1';
const KOR_WALL = 'UC-1368';
const KOR_CYCLE = 'cycle_9b23d57211d14d0c6abbfb03';
const KOR_RECEIPT = 'data/review/adapter-sdk/star-trek-kor-cycle.json';
const KOR_RECEIPT_FILE = 'cb78e1bfa794ea0b5a7165ff48ba381a86538968740eaad452be22cb4690ac05';
const KOR_RECEIPT_ID = '6b2d648ce0ab62a846e27df231eff8d324558cd07e30fcedbbf5ceb3ac7c7ba3';
const KOR_CHECKER = 'scripts/star-trek-kor-cycle.mjs';
const KOR_CHECKER_SHA = '20293b617a9ea3e363fc279351bd464e41865c5e9809d764f1f4f11c661b8324';

const KOLOTH_TASK = 'ap_918cc23cc2fe14184dcab00c';
const KOLOTH_LEASE = 'lease_95a81145183ba0b8e32ba854';
const KOLOTH_WALL = 'UC-1367';
const KOLOTH_CYCLE = 'cycle_d4c4c9ca7c7ba705373d6eb6';
const KOLOTH_RECEIPT = 'data/review/adapter-sdk/star-trek-koloth-cycle.json';
const KOLOTH_RECEIPT_FILE = '1b27a8179e11b5cbb42b9209e058a80acec3959eb765854a39cdba7e7dca87f2';
const KOLOTH_RECEIPT_ID = '6dbae7a3072ee431daf456652426e8895656411583acff64e2cee66a12983822';
const KOLOTH_CHECKER = 'scripts/star-trek-koloth-cycle.mjs';
const KOLOTH_CHECKER_SHA = '0eb2d3a4f02464b8476dc7be115660a3eac9871944d1b23a69f26ff15dda7812';

const KAZ_TASK = 'ap_e8205bc4b6cf541471be3395';
const KAZ_LEASE = 'lease_a01cea591ec9f448dfda504c';
const KAZ_WALL = 'UC-1366';
const KAZ_CYCLE = 'cycle_690b6e1f79aa674305e73b8a';
const KAZ_RECEIPT = 'data/review/adapter-sdk/star-trek-kaz-cycle.json';
const KAZ_RECEIPT_FILE = '6521ccdcdcfe692c70ca91f37ecdd3e9d56de9efbb0997d5b795b78a58d2040d';
const KAZ_RECEIPT_ID = '1e599ea90f9f96c9a1cbfb33d7443170fdd3ae2f988c320994b61d4f26dbb5c4';
const KAZ_CHECKER = 'scripts/star-trek-kaz-cycle.mjs';
const KAZ_CHECKER_SHA = '48ffa7f77f226609891be97f166ab74049fcee74774588e3fdb6b17cf41f7c5c';

const GUARDIAN_TASK = 'ap_70b647ed87cbb58329315b4a';
const GUARDIAN_LEASE = 'lease_89116c1207375d4c23a32ede';
const GUARDIAN_WALL = 'UC-1365';
const GUARDIAN_CYCLE = 'cycle_7ac7126efeea280ef2561137';
const GUARDIAN_RECEIPT = 'data/review/adapter-sdk/star-trek-guardian-cycle.json';
const GUARDIAN_RECEIPT_FILE = '9aabda49277cc744139d94e7d2909deebec32c62b7ea105a48bb7c4ac5279e6b';
const GUARDIAN_RECEIPT_ID = 'd733471f73cd08b5dce510b928e5071c92167850d50623c2202e63bdec71c58b';
const GUARDIAN_CHECKER = 'scripts/star-trek-guardian-cycle.mjs';
const GUARDIAN_CHECKER_SHA = 'd68c494151b09db611603b1671624a522102c00de8f798a7bb9854c91a0cb654';

const LANDRU_TASK = 'ap_2ae83cd81cc74c2630c352ba';
const LANDRU_LEASE = 'lease_492df3ffd571f6aafcfcc644';
const LANDRU_WALL = 'UC-1364';
const LANDRU_CYCLE = 'cycle_3d6e45bac66e3b582260307d';
const LANDRU_RECEIPT = 'data/review/adapter-sdk/star-trek-landru-cycle.json';
const LANDRU_RECEIPT_FILE = '5388c7c1e09ddd1c31cfd501893776a79c993e73e8bb7951363dac1229cc69ff';
const LANDRU_RECEIPT_ID = 'e5181979ba6d027cee26cbdcf94048af14b75c37419b1a0e893f849e44f8164c';
const LANDRU_CHECKER = 'scripts/star-trek-landru-cycle.mjs';
const LANDRU_CHECKER_SHA = '477a54286cf592fdb99812f252c812af1f4d9d3ddf12b91edf5228dc7c1b8410';

const CURZON_RECEIPT = 'data/review/adapter-sdk/star-trek-curzon-cycle.json';
const CURZON_RECEIPT_FILE = '231092292013d931731fcf05cb8fcc58c87c0f7ad4c52f9efebac39f70d80e54';
const CURZON_RECEIPT_ID = 'c9cf5e4442f914b24ec9becb30f45f791e7977e37faac9179bb3a52e197332e1';
const CURZON_CHECKER = 'scripts/star-trek-curzon-cycle.mjs';
const CURZON_CHECKER_SHA = '08deb0b80c991095bf83581e9d933a3e24f43bee73f5e5fe2dd1c8e252e80445';

const ARMUS_RECEIPT = 'data/review/adapter-sdk/star-trek-armus-cycle.json';
const ARMUS_RECEIPT_FILE = '11b5d17403f26221d0e47f183f12c086c0c153fe88bea85cdde974150911df0f';
const ARMUS_RECEIPT_ID = '24bc122415b318099d6a8483f7669c32caf7a89daa1b0f0b7ee3820119c7ee94';
const ARMUS_CHECKER = 'scripts/star-trek-armus-cycle.mjs';
const ARMUS_CHECKER_SHA = '4261811a301276f7d110b49240dda6153b5678487d88148ccfdd51f1d093be8f';

const M5_RECEIPT = 'data/review/adapter-sdk/star-trek-m5-cycle.json';
const M5_RECEIPT_FILE = '8d7057b5771de07cd46e874132dca182c309c95dcff2b9d8f1a0e458ba9a4989';
const M5_RECEIPT_ID = '3d7fa1d75e9007dc0605a2369ac2e812e109a11b87be834fb0359d480ddcd65c';
const M5_CHECKER = 'scripts/star-trek-m5-cycle.mjs';
const M5_CHECKER_SHA = 'da593599181fafe68f8c140187f6b61f3762e9d4c164caf3697198655d33ffc1';

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok = (value, message) => { if (!value) throw new Error(message); };
const fileSha = (file) => sha(fs.readFileSync(file));

for (const [label, receiptPath, receiptFile, receiptId, checkerPath, checkerSha] of [
  ['Korax', KORAX_RECEIPT, KORAX_RECEIPT_FILE, KORAX_RECEIPT_ID, KORAX_CHECKER, KORAX_CHECKER_SHA],
  ['Kor', KOR_RECEIPT, KOR_RECEIPT_FILE, KOR_RECEIPT_ID, KOR_CHECKER, KOR_CHECKER_SHA],
  ['Koloth', KOLOTH_RECEIPT, KOLOTH_RECEIPT_FILE, KOLOTH_RECEIPT_ID, KOLOTH_CHECKER, KOLOTH_CHECKER_SHA],
  ['Kaz', KAZ_RECEIPT, KAZ_RECEIPT_FILE, KAZ_RECEIPT_ID, KAZ_CHECKER, KAZ_CHECKER_SHA],
  ['Guardian', GUARDIAN_RECEIPT, GUARDIAN_RECEIPT_FILE, GUARDIAN_RECEIPT_ID, GUARDIAN_CHECKER, GUARDIAN_CHECKER_SHA],
  ['Landru', LANDRU_RECEIPT, LANDRU_RECEIPT_FILE, LANDRU_RECEIPT_ID, LANDRU_CHECKER, LANDRU_CHECKER_SHA],
  ['Curzon', CURZON_RECEIPT, CURZON_RECEIPT_FILE, CURZON_RECEIPT_ID, CURZON_CHECKER, CURZON_CHECKER_SHA],
  ['Armus', ARMUS_RECEIPT, ARMUS_RECEIPT_FILE, ARMUS_RECEIPT_ID, ARMUS_CHECKER, ARMUS_CHECKER_SHA],
  ['M-5', M5_RECEIPT, M5_RECEIPT_FILE, M5_RECEIPT_ID, M5_CHECKER, M5_CHECKER_SHA],
]) {
  const receipt = read(receiptPath);
  const body = structuredClone(receipt); delete body.receipt_sha256;
  ok(fileSha(receiptPath) === receiptFile
    && receipt.receipt_sha256 === receiptId
    && receipt.receipt_sha256 === sha(pretty(body))
    && fileSha(checkerPath) === checkerSha,
  `${label} custody drifted`);
}

const state = read('data/AUTOPILOT.json');
const trek = state.jobs.filter((row) => row.scope === 'star-trek');
const task = trek.find((row) => row.id === TASK);
const koraxTask = trek.find((row) => row.id === KORAX_TASK);
const korTask = trek.find((row) => row.id === KOR_TASK);
const kolothTask = trek.find((row) => row.id === KOLOTH_TASK);
const kazTask = trek.find((row) => row.id === KAZ_TASK);
const guardianTask = trek.find((row) => row.id === GUARDIAN_TASK);
const landruTask = trek.find((row) => row.id === LANDRU_TASK);
ok(trek.length === 2228
  && task?.status === 'resolved'
  && task.performer === PERFORMER
  && task.character === ROLE
  && task.source_fingerprint === FINGERPRINT
  && task.wall_ids?.length === 1
  && task.wall_ids[0] === WALL,
'White Rabbit projected task drifted');
ok(koraxTask?.status === 'resolved' && koraxTask.wall_ids?.includes(KORAX_WALL), 'Korax task drifted');
ok(korTask?.status === 'resolved' && korTask.wall_ids?.includes(KOR_WALL), 'Kor task drifted');
ok(kolothTask?.status === 'resolved' && kolothTask.wall_ids?.includes(KOLOTH_WALL), 'Koloth task drifted');
ok(kazTask?.status === 'resolved' && kazTask.wall_ids?.includes(KAZ_WALL), 'Kaz task drifted');
ok(guardianTask?.status === 'resolved' && guardianTask.wall_ids?.includes(GUARDIAN_WALL), 'Guardian task drifted');
ok(landruTask?.status === 'resolved' && landruTask.wall_ids?.includes(LANDRU_WALL), 'Landru task drifted');

const card = read('data/specimens.json').find((row) => row.id === WALL);
ok(card?.actor === PERFORMER
  && card?.character === ROLE
  && card?.production === 'Once Upon a Planet'
  && card?.years === '1973'
  && card?.kind === 'voice'
  && card?.designer === '—'
  && card?.link === SOURCE,
'White Rabbit projected card drifted');
ok(card.reveal?.includes('William Blackburn')
  && card.reveal?.includes('role-specific voice contribution')
  && card.reveal?.includes('no claim'),
'White Rabbit performance boundary drifted');
ok(fileSha(card.still.src) === STILL_SHA && fileSha(card.portrait.src) === PORTRAIT_SHA, 'White Rabbit projected media drifted');
const facets = read('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL);
ok(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'White Rabbit projected media review is incomplete');

const claims = jsonl('data/journal/autopilot.jsonl').filter((row) => row.op === 'lease.claimed' && row.scope === 'star-trek');
const whiteRabbitClaim = claims.find((row) => row.lease_id === LEASE && row.task_id === TASK);
ok(whiteRabbitClaim, 'White Rabbit claim is missing');
for (const row of claims) {
  const body = structuredClone(row); delete body.id;
  ok(row.id === `apj_${sha(JSON.stringify(body)).slice(0, 24)}`, 'Star Trek claim is not content-addressed');
}

const water = read('data/WATERLINE-STATE.json');
const receipts = water.cycles.filter((row) => row.scope_id === 'star-trek');
const byLease = new Map();
for (const row of receipts) {
  ok(!byLease.has(row.lease_id), 'duplicate Star Trek cycle receipt');
  byLease.set(row.lease_id, row);
}
ok(byLease.get(KORAX_LEASE)?.id === KORAX_CYCLE && byLease.get(KORAX_LEASE)?.task_statuses?.[KORAX_TASK] === 'resolved', 'Korax cycle drifted');
ok(byLease.get(KOR_LEASE)?.id === KOR_CYCLE && byLease.get(KOR_LEASE)?.task_statuses?.[KOR_TASK] === 'resolved', 'Kor cycle drifted');
ok(byLease.get(KOLOTH_LEASE)?.id === KOLOTH_CYCLE && byLease.get(KOLOTH_LEASE)?.task_statuses?.[KOLOTH_TASK] === 'resolved', 'Koloth cycle drifted');
ok(byLease.get(KAZ_LEASE)?.id === KAZ_CYCLE
  && byLease.get(KAZ_LEASE)?.task_statuses?.[KAZ_TASK] === 'resolved',
'Kaz cycle drifted');
ok(byLease.get(GUARDIAN_LEASE)?.id === GUARDIAN_CYCLE
  && byLease.get(GUARDIAN_LEASE)?.task_statuses?.[GUARDIAN_TASK] === 'resolved',
'Guardian cycle drifted');
ok(byLease.get(LANDRU_LEASE)?.id === LANDRU_CYCLE
  && byLease.get(LANDRU_LEASE)?.task_statuses?.[LANDRU_TASK] === 'resolved',
'Landru cycle drifted');
ok(!byLease.has(LEASE), 'White Rabbit candidate already has a cycle receipt');

const unreceipted = claims.filter((row) => !byLease.has(row.lease_id));
ok(unreceipted.length === 1
  && unreceipted[0].lease_id === LEASE
  && unreceipted[0].task_id === TASK,
'White Rabbit is not the single unreceipted Star Trek cycle');
ok(trek.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length === 0,
'White Rabbit projected task did not return to zero in-flight work');
ok(trek.filter((row) => row.status === 'queued').length === 1826
  && trek.filter((row) => row.status === 'resolved').length === 401
  && trek.filter((row) => row.status === 'rejected').length === 1,
'White Rabbit candidate queue drifted');

const registry = read('data/ESTATE-REGISTRY.json');
const estate = registry.estates.find((row) => row.id === 'star-trek');
ok(estate?.next_gate?.includes(KORAX_CYCLE)
  && estate.next_gate.includes('1,827 tasks remain queued'),
'canonical registry changed before White Rabbit receipt');
const baseline = read('data/review/adapter-sdk/BASELINE.json');
ok(baseline.inputs?.estate_registry?.sha256 === fileSha('data/ESTATE-REGISTRY.json'),
'adapter baseline registry binding drifted');

console.log('star-trek-white-rabbit-prior-phase: PASS — immutable Korax and prior Star Trek custody survives exactly one resolved, unreceipted White Rabbit projection while canonical registry state remains unchanged');
