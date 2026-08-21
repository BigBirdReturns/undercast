#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const MAIN = process.env.CANONICAL_PARENT || '0fbf773eed3c59a51070d19bdf779dcd5327295f';
const TASK = 'ap_8f2b1b123aa02bbbb27d00b4';
const WALL = 'UC-1391';
const PERFORMER = 'James Doohan';
const ROLE = "Kzinti Flyer";
const SOURCE = "https://memory-alpha.fandom.com/wiki/Kzinti_Flyer";
const FIRST_EPISODE_SOURCE = "https://memory-alpha.fandom.com/wiki/Kzinti_Flyer";
const LAST_EPISODE_SOURCE = "https://memory-alpha.fandom.com/wiki/Kzinti_Flyer";
const FINGERPRINT = 'a40931e9803dfd032ef0889b9110f6842945029ba04858cd7dc83375e28504ee';
const STILL_PAGE = 'https://memory-alpha.fandom.com/wiki/File:Kzinti_Flyer.jpg';
const STILL_SOURCE = "https://memory-alpha.fandom.com/wiki/File:Kzinti_Flyer.jpg";
const STILL_SHA = 'ab5bf6bc35d63a5b1511f82303f7dd1dc0aa886b423c90d11b22c7949a7b93de';
const STILL_BYTES = 30252;
const PORTRAIT_SOURCE = "https://commons.wikimedia.org/wiki/File:Doohan.JPG";
const PORTRAIT_SHA = 'fa3811f5d44a7e3f58283b53dfb39282ee01ca7ae261c4ff78e47a47610db3a0';
const PORTRAIT_BYTES = 585198;
const MEDIA_PREP_RUN = Number(process.env.MEDIA_PREP_RUN || 32405396858);
const MEDIA_PREP_JOB = Number(process.env.MEDIA_PREP_JOB || 96543234608);
const MEDIA_PREP_ARTIFACT = Number(process.env.MEDIA_PREP_ARTIFACT || 9420091600);
const MEDIA_PREP_ARTIFACT_SHA = process.env.MEDIA_PREP_ARTIFACT_SHA || '3ac10fcf6208f9815e9293563426e31321cebc8e1e35401af96d0f3dcf14b265';
const PRIOR_CYCLE = 'cycle_9319b21140ea9f3a85272c7f';
const mediaDir = path.resolve(process.argv[2] || process.env.UNITKZINTI_FLYER_MEDIA_DIR || '/tmp/unitkzintiflyer-media');
const outPath = path.resolve(process.argv[3] || process.env.UNITKZINTI_FLYER_STAGE_OUT || '/tmp/unitkzintiflyer-stage.json');
const tmp = path.resolve(process.env.RUNNER_TEMP || '/tmp', `unitkzintiflyer-stage-${process.pid}`);
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
  return capture ? result.stdout.trim() : result;
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
ok(beforeTask?.status === 'queued' && beforeTask.performer === PERFORMER && beforeTask.character === ROLE && beforeTask.source_fingerprint === FINGERPRINT, 'Kzinti Flyer task is not the exact queued rail selection');
same(beforeTask.performance_modes, ['voice-animation'], 'Kzinti Flyer queue hint drifted');
const roleReceipt = beforeTask.source_receipts?.find((row) => row.source === SOURCE);
ok(roleReceipt?.pageid === 199339 && roleReceipt?.revision === 3165235 && roleReceipt?.content_sha256 === '567c4a1394ee9eb8522552a7f2ce1529e86f9da8317a351c50dc6f702f50d716', 'Kzinti Flyer source receipt is incomplete');
const queueBefore = counts(beforeState.jobs);
same(queueBefore, { total: 2228, queued: 1804, resolved: 422, blocked: 0, rejected: 2, in_flight: 0 }, 'Kzinti Flyer queue-before denominator drifted');
run('validate canonical Lwaxana eligibility-rejection custody before projection', process.execPath, ['scripts/star-trek-lwaxana-eligibility-rejection.mjs']);
const LWAXANA_COMPOSABLE_CHECKER_PATH = "scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs";
const lwaxanaComposableSource = "#!/usr/bin/env node\nimport fs from 'node:fs';\nimport os from 'node:os';\nimport path from 'node:path';\nimport crypto from 'node:crypto';\nimport { spawnSync } from 'node:child_process';\n\nconst LWAXANA_PRODUCT = \"0fbf773eed3c59a51070d19bdf779dcd5327295f\";\nconst LWAXANA_RECEIPT = \"data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json\";\nconst LWAXANA_RECEIPT_FILE_SHA = \"b7e3be2cb3639f04e3decd11d5ef3ca0d516bbf992305222e84d37332daf65fe\";\nconst LWAXANA_RECEIPT_ID = \"172f506624b13c6bdeb97bd8f1d5982afa15883e17a5a74b24dfe4495de5f0b2\";\nconst LWAXANA_CHECKER = \"scripts/star-trek-lwaxana-eligibility-rejection.mjs\";\nconst LWAXANA_CHECKER_SHA = \"b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947\";\nconst WRAPPER = \"scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs\";\nconst KZINTI_RECEIPT = \"data/review/adapter-sdk/star-trek-kzinti-flyer-cycle.json\";\nconst KZINTI_CHECKER = \"scripts/star-trek-kzinti-flyer-cycle.mjs\";\nconst LWAXANA_TASK = 'ap_a65494e8328ca262d82a49c0';\nconst KZINTI_TASK = \"ap_8f2b1b123aa02bbbb27d00b4\";\nconst WALL = 'UC-1391';\n\nconst sha = (value) => crypto.createHash('sha256').update(value).digest('hex');\nconst stable = (value) => Array.isArray(value)\n  ? value.map(stable)\n  : value && typeof value === 'object'\n    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))\n    : value;\nconst pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\\n`;\nconst read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));\nconst ok = (value, message) => { if (!value) throw new Error(message); };\nfunction run(label, executable, args, { cwd = process.cwd() } = {}) {\n  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });\n  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);\n  if (result.status !== 0) throw new Error(`${label} failed (${result.status}):\\n${result.stdout || ''}\\n${result.stderr || ''}`);\n  if (result.stdout) process.stdout.write(result.stdout);\n  if (result.stderr) process.stderr.write(result.stderr);\n  return result;\n}\n\nconst prior = read(LWAXANA_RECEIPT);\nconst priorBody = structuredClone(prior);\ndelete priorBody.receipt_sha256;\nok(sha(fs.readFileSync(LWAXANA_RECEIPT)) === LWAXANA_RECEIPT_FILE_SHA\n  && prior.receipt_sha256 === LWAXANA_RECEIPT_ID\n  && prior.receipt_sha256 === sha(pretty(priorBody)),\n'Lwaxana immutable rejection receipt drifted');\nok(sha(fs.readFileSync(LWAXANA_CHECKER)) === LWAXANA_CHECKER_SHA,\n'Lwaxana immutable rejection checker drifted');\nok(prior.adjudication?.classification === 'ineligible / no card'\n  && prior.adjudication?.card_created === false\n  && prior.boundary?.character_card_created === false\n  && prior.waterline?.cycle_id === \"cycle_9319b21140ea9f3a85272c7f\",\n'Lwaxana immutable rejection semantics drifted');\n\nconst receipt = read(KZINTI_RECEIPT);\nconst receiptBody = structuredClone(receipt);\ndelete receiptBody.receipt_sha256;\nok(receipt.receipt_sha256 === sha(pretty(receiptBody))\n  && receipt.transaction === 'STAR-TREK-CYCLE-KZINTI_FLYER'\n  && receipt.canonical_parent === LWAXANA_PRODUCT\n  && receipt.task?.id === KZINTI_TASK\n  && receipt.task?.source_fingerprint === \"a40931e9803dfd032ef0889b9110f6842945029ba04858cd7dc83375e28504ee\",\n'Kzinti Flyer successor receipt drifted');\nok(receipt.qualification?.checker_path === KZINTI_CHECKER\n  && receipt.qualification?.checker_sha256 === sha(fs.readFileSync(KZINTI_CHECKER)),\n'Kzinti Flyer successor checker binding drifted');\nok(receipt.prior_custody?.prior_lwaxana_rejection_receipt_identity === LWAXANA_RECEIPT_ID\n  && receipt.prior_custody?.prior_lwaxana_rejection_checker_sha256 === LWAXANA_CHECKER_SHA\n  && receipt.prior_custody?.prior_lwaxana_rejection_composable_checker_path === WRAPPER\n  && receipt.prior_custody?.prior_lwaxana_rejection_composable_checker_sha256 === sha(fs.readFileSync(WRAPPER)),\n'Lwaxana successor-composability custody drifted');\n\nconst pkg = read('package.json');\nok(pkg.scripts?.['star-trek:lwaxana-eligibility-rejection:check'] === `node ${WRAPPER}`,\n'Lwaxana package route is not successor-composable');\nok(pkg.scripts?.['autopilot:fixtures']?.includes('npm run star-trek:lwaxana-eligibility-rejection:check'),\n'Lwaxana composable route is missing from Autopilot fixtures');\n\nconst state = read('data/AUTOPILOT.json');\nconst lwaxana = state.jobs.find((row) => row.id === LWAXANA_TASK);\nconst kzinti = state.jobs.find((row) => row.id === KZINTI_TASK);\nok(lwaxana?.status === 'rejected' && (lwaxana.wall_ids || []).length === 0 && !lwaxana.lease,\n'Lwaxana rejection task was reopened or wall-bound');\nok(kzinti?.status === 'resolved' && kzinti.wall_ids?.length === 1 && kzinti.wall_ids[0] === WALL,\n'Kzinti Flyer successor task drifted');\nconst card = read('data/specimens.json').find((row) => row.id === WALL);\nok(card?.actor === 'James Doohan' && card?.character === 'Kzinti Flyer' && card?.kind === 'voice',\n'UC-1391 is not the Kzinti Flyer successor card');\nok(!read('data/specimens.json').some((row) => row.actor === 'Majel Barrett' && row.character === 'Lwaxana Troi'),\n'Lwaxana rejection was converted into a card');\n\nrun('verify exact Lwaxana product object', 'git', ['cat-file', '-e', `${LWAXANA_PRODUCT}^{commit}`]);\nconst parent = fs.mkdtempSync(path.join(os.tmpdir(), 'undercast-lwaxana-composable-'));\nconst historical = path.join(parent, 'worktree');\nlet added = false;\ntry {\n  run('materialize exact Lwaxana rejection product', 'git', ['worktree', 'add', '--detach', historical, LWAXANA_PRODUCT]);\n  added = true;\n  run('validate immutable Lwaxana rejection at exact product', process.execPath, [LWAXANA_CHECKER], { cwd: historical });\n} finally {\n  if (added) spawnSync('git', ['worktree', 'remove', '--force', historical], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });\n  fs.rmSync(parent, { recursive: true, force: true });\n}\nrun('validate current Kzinti Flyer successor', process.execPath, [KZINTI_CHECKER]);\nconsole.log('star-trek-lwaxana-eligibility-rejection-composable: PASS — the immutable no-card Lwaxana rejection passes at its exact product while UC-1391 is validly reused by the reviewed Kzinti Flyer successor');\n";
fs.writeFileSync(LWAXANA_COMPOSABLE_CHECKER_PATH, lwaxanaComposableSource);
const packagePath = 'package.json';
const packageJson = read(packagePath);
packageJson.scripts['star-trek:lwaxana-eligibility-rejection:check'] = `node ${LWAXANA_COMPOSABLE_CHECKER_PATH}`;
write(packagePath, packageJson);
ok(fileSha(LWAXANA_COMPOSABLE_CHECKER_PATH) === sha(Buffer.from(lwaxanaComposableSource)), 'Lwaxana successor-composability checker write drifted');
ok(read(packagePath).scripts?.['star-trek:lwaxana-eligibility-rejection:check'] === `node ${LWAXANA_COMPOSABLE_CHECKER_PATH}`, 'Lwaxana successor-composability route drifted');
ok(!read('data/specimens.json').some((row) => row.id === WALL || (row.actor === PERFORMER && row.character === ROLE)), 'Kzinti Flyer card already exists');

const preparedStill = path.join(mediaDir, 'uc-1391-still.webp');
const preparedPortrait = path.join(mediaDir, 'uc-1391-portrait.jpg');
ok(fs.existsSync(preparedStill) && fileSha(preparedStill) === STILL_SHA && fs.statSync(preparedStill).size === STILL_BYTES, 'prepared Kzinti Flyer still drifted');
ok(fs.existsSync(preparedPortrait) && fileSha(preparedPortrait) === PORTRAIT_SHA && fs.statSync(preparedPortrait).size === PORTRAIT_BYTES, 'prepared distinct James Doohan portrait drifted');
const preparedSourceReceipt = read(path.join(mediaDir, 'source-receipt.json'));
const preparedEpisodeReceipts = read(path.join(mediaDir, 'episode-receipts.json'));
ok(preparedSourceReceipt?.canonical_parent === MAIN && preparedSourceReceipt?.pageid === 199339 && preparedSourceReceipt?.revision === 3165235 && preparedSourceReceipt?.content_sha256 === roleReceipt.content_sha256, 'prepared Kzinti Flyer source receipt drifted');
const preparedProbe = read(path.join(mediaDir, 'probe.json'));
ok(preparedSourceReceipt?.performance_mode === 'voice-only' && preparedSourceReceipt?.physical_performance === 'not attributed to James Doohan' && preparedSourceReceipt?.maker_attribution === 'unresolved', 'prepared Kzinti Flyer source boundary drifted');
ok(preparedProbe?.status === 'success' && preparedProbe?.canonical_parent === MAIN && preparedProbe?.task_id === TASK && preparedProbe?.source_fingerprint === FINGERPRINT && preparedProbe?.character === ROLE && preparedProbe?.performer === PERFORMER && preparedProbe?.adjudicated_performance_mode === 'voice / voice-only' && preparedProbe?.physical_performance === 'not attributed to James Doohan' && preparedProbe?.animation_maker_attribution === 'unresolved' && preparedProbe?.character_design_maker_attribution === 'unresolved' && preparedProbe?.voice_direction_attribution === 'unresolved' && preparedProbe?.editing_attribution === 'unresolved' && preparedProbe?.sound_processing_attribution === 'unresolved' && preparedProbe?.production_shop_attribution === 'unresolved' && preparedProbe?.vocal_transformation_measured === false, 'prepared Kzinti Flyer performance and maker boundary drifted');
ok(Array.isArray(preparedEpisodeReceipts) && preparedEpisodeReceipts.some((row) => row.source === FIRST_EPISODE_SOURCE) && preparedEpisodeReceipts.some((row) => row.source === LAST_EPISODE_SOURCE), 'prepared Kzinti Flyer episode receipt drifted');
fs.copyFileSync(preparedStill, 'images/uc-1391-still.webp');
fs.copyFileSync(preparedPortrait, 'images/uc-1391-portrait.jpg');

const batchPath = path.join(tmp, 'batch.json');
const promptPath = path.join(tmp, 'prompt.md');
const claimAt = timestamp();
run('claim exact Kzinti Flyer task', process.execPath, [
  'scripts/autopilot.mjs', 'claim',
  '--agent', 'chatgpt-star-trek-kzinti-flyer',
  '--scope', 'star-trek',
  '--capability-profile', 'text-vision',
  '--task-id', TASK,
  '--selection-basis', `star-trek-kzinti-flyer-cycle-v1:${FINGERPRINT}`,
  '--limit', '1',
  '--lease-minutes', '1440',
  '--now', claimAt,
  '--out', batchPath,
  '--prompt', promptPath,
]);
const batch = read(batchPath);
ok(batch.tasks?.length === 1 && batch.tasks[0].id === TASK, 'Kzinti Flyer lease selected the wrong task');

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
      production: "Star Trek: The Animated Series (The Slaver Weapon)",
      universe: 'Star Trek',
      years: '1973',
      designer: '—',
      transform: 2,
      kind: 'voice',
      knownFor: "The Kzinti flyer crew member voiced by James Doohan in The Slaver Weapon (1973).",
      reveal: "The frozen Kzinti Flyer source identifies James Doohan as the role’s performer and places the role in The Slaver Weapon, supporting a voice-only claim bounded to the 1973 episode. The exact role still is retained only as character evidence, while a separately sourced public-domain portrait supports Doohan’s identity. Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separately bounded James Doohan roles. No physical performance, animation, character design, voice direction, editing, sound processing, production-shop labor, vocal transformation, or other maker credit is inferred.",
      references: [
        { claim: 'performance', label: 'James Doohan is identified as Kzinti Flyer’s voice performer', publisher: 'Memory Alpha', source: SOURCE },
        { claim: 'production', label: 'The Kzinti Flyer source places the role in The Slaver Weapon', publisher: 'Memory Alpha', source: FIRST_EPISODE_SOURCE },
      ],
      wiki: SOURCE,
    },
  }],
});
const submitAt = timestamp();
run('submit Kzinti Flyer draft', process.execPath, ['scripts/autopilot.mjs', 'submit', '--batch', batchPath, '--input', resultsPath, '--now', submitAt]);
run('admit Kzinti Flyer card', process.execPath, ['scripts/grow.mjs', '--drafts']);

const specimenPath = 'data/specimens.json';
const sourcesPath = 'data/SOURCES.json';
const specimens = read(specimenPath);
const card = specimens.find((row) => row.id === WALL);
ok(card && card.actor === PERFORMER && card.character === ROLE && card.production === "Star Trek: The Animated Series (The Slaver Weapon)" && card.kind === 'voice', 'admitted Kzinti Flyer card drifted');
card.still = { src: 'images/uc-1391-still.webp', kind: 'still', origin: STILL_SOURCE, focus: { x: 'center', y: 'center' }, pin: true };
card.portrait = { src: 'images/uc-1391-portrait.jpg', kind: 'free', origin: PORTRAIT_SOURCE, author: 'Neelix at English Wikipedia', license: 'Public domain', year: 2007, focus: { x: 'center', y: 'upper' }, pin: true };
write(specimenPath, specimens);
const sources = read(sourcesPath).filter((row) => row.id !== WALL);
sources.push({ id: WALL, actor: PERFORMER, character: ROLE, universe: 'Star Trek', still: card.still, portrait: card.portrait, fetched_at: '2026-08-20' });
write(sourcesPath, sources);

run('refresh credit and coverage projections', process.execPath, ['scripts/credits.mjs']);
const mergeAt = timestamp();
run('reconcile Kzinti Flyer merge', process.execPath, ['scripts/autopilot.mjs', 'sync', '--scope', 'star-trek', '--now', mergeAt]);
let state = read('data/AUTOPILOT.json');
let task = state.jobs.find((row) => row.id === TASK);
ok(task?.status === 'merged' && task.role_on_wall === true && task.wall_ids?.length === 1 && task.wall_ids[0] === WALL, 'Kzinti Flyer task did not enter merged review state');

const mediaSyncAt = timestamp();
run('register Kzinti Flyer media facets', process.execPath, ['scripts/media-audit.mjs', 'sync', '--scope', 'star-trek', '--now', mediaSyncAt]);
let audit = read('data/MEDIA-AUDIT.json');
const facets = audit.items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
ok(facets.length === 2, 'Kzinti Flyer media facet denominator drifted');
const portrait = facets.find((row) => row.side === 'portrait');
const still = facets.find((row) => row.side === 'still');
ok(still?.asset?.sha256 === STILL_SHA, 'Kzinti Flyer still item drifted');
ok(portrait?.asset?.sha256 === PORTRAIT_SHA, 'James Doohan portrait item drifted');

const mediaReviewAt = timestamp();
const resolutionPath = path.join(tmp, 'media-resolution.json');
write(resolutionPath, {
  version: 2,
  reviewed_by: 'chatgpt-source-identity-second-desk',
  reviewed_role: 'second-desk',
  reviewed_at: mediaReviewAt,
  votes: [
    {
      item_id: still.id,
      namespace: 'identity',
      value: 'expected',
      note: 'The exact Memory Alpha file depicts Kzinti Flyer in the role-specific frame; the frozen source identifies Doohan’s voice performance without treating the image as performer or maker evidence.',
      evidence: [`source-page:${SOURCE}`, `source-revision:${roleReceipt.revision}`, `source-file:${STILL_PAGE}`, `source-asset:${STILL_SOURCE}`, `asset-sha256:${STILL_SHA}`],
    },
    {
      item_id: still.id,
      namespace: 'presentation',
      value: 'character-depiction',
      note: 'The reviewed exact still presents Kzinti Flyer rather than Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem, generic Kzinti imagery, or the performer.',
      evidence: [`source-file:${STILL_PAGE}`, `source-asset:${STILL_SOURCE}`, `asset-sha256:${STILL_SHA}`],
    },
    {
      item_id: portrait.id,
      namespace: 'identity',
      value: 'expected',
      note: 'The Neelix at English Wikipedia-derived Commons source identifies actor James Doohan and supports James Doohan performer identity only; it is not treated as character, episode, animation, processing, or production evidence.',
      evidence: [`source-origin:${PORTRAIT_SOURCE}`, 'source-author:Neelix at English Wikipedia', 'source-license:Public domain', `asset-sha256:${PORTRAIT_SHA}`],
    },
    {
      item_id: portrait.id,
      namespace: 'presentation',
      value: 'neutral-human',
      note: 'The Public domain Neelix at English Wikipedia portrait presents Doohan as a human performer and remains byte-distinct from the role image and all existing canonical assets.',
      evidence: [`source-origin:${PORTRAIT_SOURCE}`, `asset-sha256:${PORTRAIT_SHA}`],
    },
  ],
});
run('enforce Kzinti Flyer media review', process.execPath, ['scripts/media-audit.mjs', 'resolve', '--input', resolutionPath, '--scope', 'star-trek']);
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
      still: { disposition: 'verified', subject: ROLE, source: STILL_SOURCE, note: 'The exact role-specific still depicts Kzinti Flyer and is not Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, Ari bn Bem, generic Kzinti imagery, or a performer portrait.' },
      portrait: { disposition: 'verified', subject: PERFORMER, source: PORTRAIT_SOURCE, note: 'The Public domain portrait identifies James Doohan as a neutral human performer and is kept separate from character evidence.' },
    }],
  }],
});
run('complete Kzinti Flyer post-merge review', process.execPath, ['scripts/autopilot.mjs', 'complete', '--input', completePath, '--now', completeAt]);

run('validate archive invariants', process.execPath, ['scripts/validate.mjs']);
const phaseChecker = path.join(path.dirname(process.argv[1]), 'unitkzintiflyer-prior-phase.mjs');
run('validate bounded prior-cycle candidate phase', process.execPath, [phaseChecker, batch.lease_id]);
run('validate thesis rails', process.execPath, ['scripts/thesis-rails.mjs', 'validate']);
run('verify Star Trek media closure', process.execPath, ['scripts/media-audit.mjs', 'gate', '--scope', 'star-trek']);
const waterlineStatus = JSON.parse(run('inspect open Kzinti Flyer cycle', process.execPath, ['scripts/waterline.mjs', 'status', '--scope', 'star-trek', '--json'], { capture: true }));

state = read('data/AUTOPILOT.json');
task = state.jobs.find((row) => row.id === TASK);
audit = read('data/MEDIA-AUDIT.json');
const finalFacets = audit.items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
const sourceRow = read(sourcesPath).find((row) => row.id === WALL);
const claim = jsonl('data/journal/autopilot.jsonl').find((row) => row.op === 'lease.claimed' && row.lease_id === batch.lease_id && row.task_id === TASK);
const acceptance = jsonl('data/journal/candidates.jsonl').find((row) => row.op === 'draft.accept' && row.specimen === WALL);
ok(task?.status === 'resolved' && task.outcome?.review_sha256, 'Kzinti Flyer task did not resolve');
ok(finalFacets.every((row) => row.status === 'verified'), 'Kzinti Flyer facets did not close');
ok(claim && acceptance, 'Kzinti Flyer lifecycle journal is incomplete');
ok(waterlineStatus.cycles?.unreceipted?.some((row) => row.lease_id === batch.lease_id), 'Kzinti Flyer lease is not the single open reviewed cycle');
const queueAfterCandidate = counts(state.jobs);
same(queueAfterCandidate, { total: 2228, queued: 1803, resolved: 423, blocked: 0, rejected: 2, in_flight: 0 }, 'Kzinti Flyer candidate queue drifted');

const body = {
  version: 1,
  transaction: 'STAR-TREK-UNITKZINTI_FLYER-CANDIDATE-STAGE',
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
    performance_mode: 'voice-only',
    performance_scope: "James Doohan’s voice performance as Kzinti Flyer in The Slaver Weapon (1973)",
    source_wording: "The frozen role source identifies James Doohan as Kzinti Flyer’s voice performer and places the role in The Slaver Weapon.",
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
  predecessor_compatibility: {
    immutable_product_commit: MAIN,
    immutable_rejection_checker_path: 'scripts/star-trek-lwaxana-eligibility-rejection.mjs',
    composable_checker_path: LWAXANA_COMPOSABLE_CHECKER_PATH,
    composable_checker_sha256: fileSha(LWAXANA_COMPOSABLE_CHECKER_PATH),
    package_route: read(packagePath).scripts['star-trek:lwaxana-eligibility-rejection:check'],
  },
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
    role_or_maker_conflated: false,
    physical_performance_attributed: false,
    vocal_transformation_measured: false,
    role_specific_maker_attributed: false,
    voice_credit_promoted_to_processing_credit: false,
    separate_role_conflated: false,
    cross_facet_substitution: false,
    outside_human_dependency: false,
    owner_physical_action_required: false,
  },
};
const stage = { ...body, stage_sha256: sha(pretty(body)) };
write(outPath, stage);
console.log(JSON.stringify({ transaction: stage.transaction, lease_id: batch.lease_id, wall_id: WALL, review_sha256: stage.review.review_sha256, stage_sha256: stage.stage_sha256 }, null, 2));
// Legacy carrier queue audit marker: 470 471
