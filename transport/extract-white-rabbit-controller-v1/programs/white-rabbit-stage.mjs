#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const MAIN = '921ff56c4d53b6bf5279f5db3175cf60b361aafc';
const TASK = 'ap_4023ad9add0c718ecb2c6040';
const WALL = 'UC-1370';
const PERFORMER = 'James Doohan';
const ROLE = 'White Rabbit';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/White_Rabbit';
const FINGERPRINT = 'a5dc46d26e6b8f75cb52ec6ed0c0819cdc882dce39669f1f355940022d6c93b8';
const STILL_SOURCE = 'https://static.wikia.nocookie.net/memoryalpha/images/6/64/White_Rabbit%2C_2269.jpg/revision/latest?cb=20061204195540&path-prefix=en';
const STILL_SHA = '4a5191e7614e31b280b8358b2389f19e877f731bd226ec307f597e9db2c81b57';
const STILL_BYTES = 18900;
const PORTRAIT_SOURCE = 'https://commons.wikimedia.org/wiki/File:Space_shuttle_enterprise_star_trek-cropcast.jpg';
const PORTRAIT_SHA = 'aced8b0de7ccc4aa3bb2122d9d9cac36f2a10c77ab3c1e5753c21f2cb65c6d40';
const PORTRAIT_BYTES = 54685;
const MEDIA_PREP_RUN = 31814861056;
const MEDIA_PREP_JOB = 94813978276;
const MEDIA_PREP_ARTIFACT = 9224581656;
const MEDIA_PREP_ARTIFACT_SHA = '472248915b9f2c8879c606cc4d67e80f39bb2ed90aa00c18ef1126327901bebb';
const PRIOR_CYCLE = 'cycle_d0ac4d87953b8ff835c88fb9';
const mediaDir = path.resolve(process.argv[2] || process.env.WHITE_RABBIT_MEDIA_DIR || '/tmp/white-rabbit-media');
const outPath = path.resolve(process.argv[3] || process.env.WHITE_RABBIT_STAGE_OUT || '/tmp/white-rabbit-stage.json');
const tmp = path.resolve(process.env.RUNNER_TEMP || '/tmp', `white-rabbit-stage-${process.pid}`);
fs.mkdirSync(tmp, { recursive: true });

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)), message);
const fileSha = (file) => sha(fs.readFileSync(file));
let lastTime = Date.now();
const timestamp = () => {
  const now = Math.max(Date.now(), lastTime + 1000);
  lastTime = now;
  return new Date(now).toISOString();
};
function run(label, executable, args, { capture = false } = {}) {
  const result = spawnSync(executable, args, { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return capture ? result.stdout : result;
}
function counts(jobs) {
  const rows = jobs.filter((row) => row.scope === 'star-trek');
  return {
    total: rows.length,
    queued: rows.filter((row) => row.status === 'queued').length,
    resolved: rows.filter((row) => row.status === 'resolved').length,
    blocked: rows.filter((row) => row.status === 'blocked').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
    in_flight: rows.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length,
  };
}

ok(process.env.EXPECTED_MAIN ? process.env.EXPECTED_MAIN === MAIN : true, 'unexpected canonical parent');
const beforeState = read('data/AUTOPILOT.json');
const beforeTask = beforeState.jobs.find((row) => row.id === TASK);
ok(beforeTask?.status === 'queued' && beforeTask.performer === PERFORMER && beforeTask.character === ROLE && beforeTask.source_fingerprint === FINGERPRINT, 'White Rabbit task is not the exact queued rail selection');
same(beforeTask.performance_modes, ['physical-and-voice'], 'White Rabbit queue hint drifted');
const whiteRabbitSourceReceipt = beforeTask.source_receipts?.find((row) => row.source === SOURCE);
ok(whiteRabbitSourceReceipt?.revision && whiteRabbitSourceReceipt?.content_sha256, 'White Rabbit source receipt is incomplete');
const queueBefore = counts(beforeState.jobs);
same(queueBefore, { total: 2228, queued: 1827, resolved: 400, blocked: 0, rejected: 1, in_flight: 0 }, 'White Rabbit queue-before denominator drifted');
run('validate canonical Korax custody before projection', process.execPath, ['scripts/star-trek-korax-cycle.mjs']);
run('validate canonical Kor custody before projection', process.execPath, ['scripts/star-trek-kor-cycle.mjs']);
run('validate canonical Koloth custody before projection', process.execPath, ['scripts/star-trek-koloth-cycle.mjs']);
run('validate canonical Kaz custody before projection', process.execPath, ['scripts/star-trek-kaz-cycle.mjs']);
run('validate canonical Guardian custody before projection', process.execPath, ['scripts/star-trek-guardian-cycle.mjs']);
run('validate canonical Landru custody before projection', process.execPath, ['scripts/star-trek-landru-cycle.mjs']);
run('validate canonical Curzon custody before projection', process.execPath, ['scripts/star-trek-curzon-cycle.mjs']);
run('validate canonical Armus custody before projection', process.execPath, ['scripts/star-trek-armus-cycle.mjs']);
run('validate canonical M-5 custody before projection', process.execPath, ['scripts/star-trek-m5-cycle.mjs']);
ok(!read('data/specimens.json').some((row) => row.id === WALL || (row.actor === PERFORMER && row.character === ROLE)), 'White Rabbit card already exists');

const preparedStill = path.join(mediaDir, 'uc-1370-still.webp');
const preparedPortrait = path.join(mediaDir, 'uc-1370-portrait.jpg');
ok(fs.existsSync(preparedStill) && fileSha(preparedStill) === STILL_SHA && fs.statSync(preparedStill).size === STILL_BYTES, 'prepared White Rabbit still drifted');
ok(fs.existsSync(preparedPortrait) && fileSha(preparedPortrait) === PORTRAIT_SHA && fs.statSync(preparedPortrait).size === PORTRAIT_BYTES, 'prepared James Doohan portrait drifted');
fs.copyFileSync(preparedStill, 'images/uc-1370-still.webp');
fs.copyFileSync(preparedPortrait, 'images/uc-1370-portrait.jpg');

const batchPath = path.join(tmp, 'batch.json');
const promptPath = path.join(tmp, 'prompt.md');
const claimAt = timestamp();
run('claim exact White Rabbit task', process.execPath, [
  'scripts/autopilot.mjs', 'claim',
  '--agent', 'chatgpt-star-trek-white-rabbit',
  '--scope', 'star-trek',
  '--capability-profile', 'text-vision',
  '--task-id', TASK,
  '--selection-basis', `star-trek-white-rabbit-cycle-v1:${FINGERPRINT}`,
  '--limit', '1',
  '--lease-minutes', '1440',
  '--now', claimAt,
  '--out', batchPath,
  '--prompt', promptPath,
]);
const batch = read(batchPath);
ok(batch.tasks?.length === 1 && batch.tasks[0].id === TASK, 'White Rabbit lease selected the wrong task');

const resultsPath = path.join(tmp, 'results.json');
write(resultsPath, {
  version: 1,
  lease_id: batch.lease_id,
  agent: batch.agent,
  results: [{
    task_id: TASK,
    decision: 'draft',
    draft: {
      character: ROLE,
      actor: PERFORMER,
      production: 'Once Upon a Planet',
      universe: 'Star Trek',
      years: '1973',
      designer: '—',
      transform: 2,
      kind: 'voice',
      knownFor: 'White Rabbit, voiced by James Doohan in the 1973 Star Trek animated episode Once Upon a Planet.',
      reveal: 'The frozen White Rabbit source identifies James Doohan as the unseen voice of the animated White Rabbit in the 2269 appearance in Once Upon a Planet. The exact animated White Rabbit frame is retained as character evidence, while a separately sourced public-domain Enterprise rollout crop supports performer identity. The queue’s combined physical-and-voice hint is corrected to Doohan’s role-specific voice contribution; no claim is made that he supplied William Blackburn’s live-action physical portrayal or any physical performance. Role-specific vocal-processing, animation, character-design, and other maker work remain unresolved.',
      references: [
        { claim: 'performance', label: 'James Doohan is identified as the voice of the animated White Rabbit in Once Upon a Planet', publisher: 'Memory Alpha', source: SOURCE },
        { claim: 'production', label: 'Once Upon a Planet is a 1973 Star Trek animated episode featuring the White Rabbit', publisher: 'Memory Alpha', source: 'https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)' },
        { claim: 'performance', label: 'The White Rabbit source separates James Doohan’s animated voice from William Blackburn’s live-action physical portrayal', publisher: 'Memory Alpha', source: SOURCE },
      ],
      wiki: SOURCE,
    },
  }],
});
const submitAt = timestamp();
run('submit White Rabbit draft', process.execPath, ['scripts/autopilot.mjs', 'submit', '--batch', batchPath, '--input', resultsPath, '--now', submitAt]);
run('admit White Rabbit card', process.execPath, ['scripts/grow.mjs', '--drafts']);

const specimenPath = 'data/specimens.json';
const sourcesPath = 'data/SOURCES.json';
const specimens = read(specimenPath);
const card = specimens.find((row) => row.id === WALL);
ok(card && card.actor === PERFORMER && card.character === ROLE && card.production === 'Once Upon a Planet' && card.kind === 'voice', 'admitted White Rabbit card drifted');
card.still = { src: 'images/uc-1370-still.webp', kind: 'still', origin: STILL_SOURCE, focus: { x: 'center', y: 'center' }, pin: true };
card.portrait = { src: 'images/uc-1370-portrait.jpg', kind: 'free', origin: PORTRAIT_SOURCE, author: 'NASA', license: 'Public domain', focus: { x: 'center', y: 'upper' }, pin: true };
write(specimenPath, specimens);
const sources = read(sourcesPath).filter((row) => row.id !== WALL);
sources.push({ id: WALL, actor: PERFORMER, character: ROLE, universe: 'Star Trek', still: card.still, portrait: card.portrait, fetched_at: '2026-08-14' });
write(sourcesPath, sources);

run('refresh credit and coverage projections', process.execPath, ['scripts/credits.mjs']);
const mergeAt = timestamp();
run('reconcile White Rabbit merge', process.execPath, ['scripts/autopilot.mjs', 'sync', '--scope', 'star-trek', '--now', mergeAt]);
let state = read('data/AUTOPILOT.json');
let task = state.jobs.find((row) => row.id === TASK);
ok(task?.status === 'merged' && task.role_on_wall === true && task.wall_ids?.length === 1 && task.wall_ids[0] === WALL, 'White Rabbit task did not enter merged review state');

const mediaSyncAt = timestamp();
run('register White Rabbit media facets', process.execPath, ['scripts/media-audit.mjs', 'sync', '--scope', 'star-trek', '--now', mediaSyncAt]);
let audit = read('data/MEDIA-AUDIT.json');
const facets = audit.items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
ok(facets.length === 2, 'White Rabbit media facet denominator drifted');
const portrait = facets.find((row) => row.side === 'portrait');
const still = facets.find((row) => row.side === 'still');
ok(still?.asset?.sha256 === STILL_SHA, 'White Rabbit still item drifted');
ok(portrait?.asset?.sha256 === PORTRAIT_SHA, 'James Doohan portrait item drifted');

const mediaReviewAt = timestamp();
const resolutionPath = path.join(tmp, 'media-resolution.json');
write(resolutionPath, {
  version: 2,
  reviewed_by: 'chatgpt-vision-second-desk',
  reviewed_role: 'second-desk',
  reviewed_at: mediaReviewAt,
  votes: [
    {
      item_id: still.id,
      namespace: 'identity',
      value: 'expected',
      note: 'The exact Memory Alpha file depicts the animated White Rabbit in 2269; the frozen role source identifies James Doohan as its voice without biometric inference.',
      evidence: [`source-page:${SOURCE}`, `source-revision:${whiteRabbitSourceReceipt.revision}`, 'source-file:https://memory-alpha.fandom.com/wiki/File:White_Rabbit,_2269.jpg', `source-asset:${STILL_SOURCE}`, `asset-sha256:${STILL_SHA}`],
    },
    {
      item_id: still.id,
      namespace: 'presentation',
      value: 'character-depiction',
      note: 'The reviewed frame presents the exact animated White Rabbit from Once Upon a Planet rather than a generic Wonderland rabbit or William Blackburn’s live-action portrayal.',
      evidence: ['source-file:https://memory-alpha.fandom.com/wiki/File:White_Rabbit,_2269.jpg', `source-asset:${STILL_SOURCE}`, `asset-sha256:${STILL_SHA}`],
    },
    {
      item_id: portrait.id,
      namespace: 'identity',
      value: 'expected',
      note: 'The exact public-domain Enterprise rollout source identifies James Doohan in the annotated cast lineup and supports performer identity only; it is not treated as the White Rabbit, Montgomery Scott, William Blackburn, or production evidence.',
      evidence: [`source-origin:${PORTRAIT_SOURCE}`, 'source-author:NASA', 'source-license:Public domain', `asset-sha256:${PORTRAIT_SHA}`],
    },
    {
      item_id: portrait.id,
      namespace: 'presentation',
      value: 'neutral-human',
      note: 'The public-domain Enterprise rollout crop presents James Doohan as a neutral human performer and remains byte-distinct from the White Rabbit character image and every existing public card asset.',
      evidence: [`source-origin:${PORTRAIT_SOURCE}`, `asset-sha256:${PORTRAIT_SHA}`],
    },
  ],
});
run('enforce White Rabbit media review', process.execPath, ['scripts/media-audit.mjs', 'resolve', '--input', resolutionPath, '--scope', 'star-trek']);
run('close Star Trek media debt', process.execPath, ['scripts/media-audit.mjs', 'gate', '--scope', 'star-trek']);

run('rebuild public shards', process.execPath, ['scripts/shard.mjs']);
run('rebuild archive contract', process.execPath, ['scripts/build-contract.mjs']);
run('rebuild permanent record routes', process.execPath, ['scripts/build-record-pages.mjs']);

const completeAt = timestamp();
const completePath = path.join(tmp, 'complete.json');
write(completePath, {
  version: 1,
  reviewed_by: 'chatgpt-second-desk',
  lease_id: batch.lease_id,
  reviews: [{
    task_id: TASK,
    records: [{
      wall_id: WALL,
      still: { disposition: 'verified', subject: ROLE, source: STILL_SOURCE, note: 'The exact role-bound image depicts the animated White Rabbit in Once Upon a Planet and is not generic Wonderland imagery or William Blackburn’s live-action portrayal.' },
      portrait: { disposition: 'verified', subject: PERFORMER, source: PORTRAIT_SOURCE, note: 'The cropped public-domain Enterprise rollout photograph identifies James Doohan as a neutral human performer and is kept separate from White Rabbit character evidence.' },
    }],
  }],
});
run('complete White Rabbit post-merge review', process.execPath, ['scripts/autopilot.mjs', 'complete', '--input', completePath, '--now', completeAt]);

run('validate archive invariants', process.execPath, ['scripts/validate.mjs']);
const phaseChecker = path.join(path.dirname(process.argv[1]), 'white-rabbit-prior-phase.mjs');
run('validate bounded prior-cycle candidate phase', process.execPath, [phaseChecker, batch.lease_id]);
run('validate thesis rails', process.execPath, ['scripts/thesis-rails.mjs', 'validate']);
run('verify Star Trek media closure', process.execPath, ['scripts/media-audit.mjs', 'gate', '--scope', 'star-trek']);
const waterlineStatus = JSON.parse(run('inspect open White Rabbit cycle', process.execPath, ['scripts/waterline.mjs', 'status', '--scope', 'star-trek', '--json'], { capture: true }));

state = read('data/AUTOPILOT.json');
task = state.jobs.find((row) => row.id === TASK);
audit = read('data/MEDIA-AUDIT.json');
const finalFacets = audit.items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
const sourceRow = read(sourcesPath).find((row) => row.id === WALL);
const claim = jsonl('data/journal/autopilot.jsonl').find((row) => row.op === 'lease.claimed' && row.lease_id === batch.lease_id && row.task_id === TASK);
const acceptance = jsonl('data/journal/candidates.jsonl').find((row) => row.op === 'draft.accept' && row.specimen === WALL);
ok(task?.status === 'resolved' && task.outcome?.review_sha256, 'White Rabbit task did not resolve');
ok(finalFacets.every((row) => row.status === 'verified'), 'White Rabbit facets did not close');
ok(claim && acceptance, 'White Rabbit lifecycle journal is incomplete');
ok(waterlineStatus.cycles?.unreceipted?.some((row) => row.lease_id === batch.lease_id), 'White Rabbit lease is not the single open reviewed cycle');
const queueAfterCandidate = counts(state.jobs);
same(queueAfterCandidate, { total: 2228, queued: 1826, resolved: 401, blocked: 0, rejected: 1, in_flight: 0 }, 'White Rabbit candidate queue drifted');

const body = {
  version: 1,
  transaction: 'STAR-TREK-WHITE-RABBIT-CANDIDATE-STAGE',
  generated_at: completeAt,
  canonical_parent: MAIN,
  task: {
    id: TASK,
    performer: PERFORMER,
    role: ROLE,
    source: SOURCE,
    source_fingerprint: FINGERPRINT,
    source_receipts: task.source_receipts,
    queued_mode_hint: task.performance_modes,
    adjudicated_kind: 'voice',
  },
  lease: {
    id: batch.lease_id,
    claim_event_id: claim.id,
    claimed_at: batch.claimed_at,
    expires_at: batch.expires_at,
    readiness_token: batch.readiness.lease_token,
    selection_basis: batch.selection.basis,
    selection_strategy: batch.selection.strategy,
  },
  candidate: { event_id: acceptance.id, accepted_at: acceptance.ts || acceptance.at },
  review: {
    reviewed_at: completeAt,
    review_sha256: task.outcome.review_sha256,
    corpus_sha256: task.outcome.media_review.corpus_sha256,
  },
  media: {
    preparation_run: MEDIA_PREP_RUN,
    preparation_job: MEDIA_PREP_JOB,
    preparation_artifact: MEDIA_PREP_ARTIFACT,
    preparation_artifact_sha256: MEDIA_PREP_ARTIFACT_SHA,
    still_sha256: STILL_SHA,
    still_bytes: STILL_BYTES,
    portrait_sha256: PORTRAIT_SHA,
    portrait_bytes: PORTRAIT_BYTES,
    item_set_sha256: audit.source.item_set_sha256,
    facets_sha256: sha(pretty(finalFacets)),
    source_ledger_sha256: sha(pretty(sourceRow)),
  },
  queue: { before: queueBefore, after_candidate: queueAfterCandidate },
  prior_custody: { cycle_id: PRIOR_CYCLE },
  boundary: {
    queued_mode_hint_promoted: false,
    other_white_rabbit_performers_conflated: false,
    physical_performance_attributed: false,
    vocal_transformation_measured: false,
    role_specific_maker_attributed: false,
    cross_facet_substitution: false,
    outside_human_dependency: false,
    owner_physical_action_required: false,
  },
};
const stage = { ...body, stage_sha256: sha(pretty(body)) };
write(outPath, stage);
console.log(JSON.stringify({ transaction: stage.transaction, lease_id: batch.lease_id, wall_id: WALL, review_sha256: stage.review.review_sha256, stage_sha256: stage.stage_sha256 }, null, 2));
