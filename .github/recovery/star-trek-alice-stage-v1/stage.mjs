#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const env = process.env;
const MAIN = env.EXPECTED_MAIN;
const MAIN_TREE = env.EXPECTED_MAIN_TREE;
const CANDIDATE_COMMIT = env.CANDIDATE_COMMIT;
const CANDIDATE_TREE = env.CANDIDATE_TREE;
const TASK_ID = env.TASK_ID;
const LEASE_ID = env.LEASE_ID;
const FINGERPRINT = env.SOURCE_FINGERPRINT;
const MEDIA_ROOT = env.MEDIA_ROOT;
const CLAIM_ROOT = env.CLAIM_ROOT;
const STAGE_ROOT = env.STAGE_ROOT;
const WALL_ID = 'UC-1396';
const PERFORMER = 'Nichelle Nichols';
const CHARACTER = 'Alice (character)';
const PRODUCTION = 'Once Upon a Planet';
const YEARS = '1973';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/Alice_(character)';
const EPISODE_SOURCE = 'https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)';
const PRIOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-anastasia-komananov-cycle.json';
const PRIOR_CHECKER_PATH = 'scripts/star-trek-anastasia-komananov-cycle.mjs';
const QUEUE_AFTER = { total: 2228, queued: 1798, resolved: 428, blocked: 0, rejected: 2, in_flight: 0 };
const KNOWN_FOR = 'The animated 2269 Alice robot voiced by Nichelle Nichols in Once Upon a Planet (1973).';
const REVEAL = 'The frozen Alice source separates two performances. Marcia Brown played the 2267 live-action Alice in Shore Leave, while Nichelle Nichols voiced the 2269 animated Alice in Once Upon a Planet. This record is limited to Nichols’s animated voice performance. The exact 2269 character still and a separately sourced licensed Nichols portrait are retained; physical performance, animation labor, character design, voice direction, vocal processing, sound, transformation measurement, and every other unsupported maker function remain unresolved.';

const ensure = (value, message) => { if (!value) throw new Error(message); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (file) => sha(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const readJsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();

function run(program, args, { capture = false } = {}) {
  const result = spawnSync(program, args, { cwd: process.cwd(), env: process.env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: capture ? ['ignore','pipe','pipe'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} ${args.join(' ')} failed: ${capture ? (result.stderr || result.stdout || '').trim() : `exit ${result.status}`}`);
  return capture ? result.stdout : '';
}
const node = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
const npm = (args, options = {}) => run('npm', args, options);

function taskRow() {
  const state = readJson('data/AUTOPILOT.json');
  const task = state.jobs.find((row) => row.id === TASK_ID);
  ensure(task, 'Alice task missing');
  return { state, task };
}
function queueCounts() {
  const trek = readJson('data/AUTOPILOT.json').jobs.filter((row) => row.scope === 'star-trek');
  return {
    total: trek.length,
    queued: trek.filter((row) => row.status === 'queued').length,
    resolved: trek.filter((row) => row.status === 'resolved').length,
    blocked: trek.filter((row) => row.status === 'blocked').length,
    rejected: trek.filter((row) => row.status === 'rejected').length,
    in_flight: trek.filter((row) => ['leased','drafted','merged'].includes(row.status)).length,
  };
}
function buildDraft() {
  return {
    character: CHARACTER,
    actor: PERFORMER,
    production: PRODUCTION,
    universe: 'Star Trek',
    years: YEARS,
    designer: '—',
    transform: 2,
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
    references: [
      { claim: 'performance', label: 'The Alice source identifies Nichelle Nichols as the voice of the 2269 animated Alice and separates Marcia Brown’s live-action performance', publisher: 'Memory Alpha', source: SOURCE },
      { claim: 'production', label: 'Once Upon a Planet is the 1973 animated episode featuring Alice’s 2269 appearance', publisher: 'Memory Alpha', source: EPISODE_SOURCE },
    ],
    wiki: 'https://en.wikipedia.org/wiki/Nichelle_Nichols',
  };
}

function verifyInputs() {
  ensure(MAIN && MAIN_TREE && CANDIDATE_COMMIT && CANDIDATE_TREE && TASK_ID && LEASE_ID && FINGERPRINT && MEDIA_ROOT && CLAIM_ROOT && STAGE_ROOT, 'stage environment incomplete');
  const media = readJson(path.join(MEDIA_ROOT, 'media-scout.json'));
  const mediaBody = structuredClone(media); delete mediaBody.receipt_sha256;
  ensure(media.receipt_sha256 === sha(Buffer.from(pretty(mediaBody))), 'Alice media receipt hash drifted');
  ensure(media.transaction === 'STAR-TREK-ALICE-MEDIA-SCOUT-V1' && media.status === 'success', 'Alice media scout status drifted');
  ensure(media.canonical_parent === MAIN && media.canonical_tree === MAIN_TREE, 'Alice media parent drifted');
  ensure(media.candidate?.commit === CANDIDATE_COMMIT && media.candidate?.tree === CANDIDATE_TREE, 'Alice media candidate drifted');
  ensure(media.task?.id === TASK_ID && media.task?.lease_id === LEASE_ID && media.task?.source_fingerprint === FINGERPRINT, 'Alice media task drifted');
  ensure(media.adjudication?.performance_mode === 'voice-animation' && media.adjudication?.nichelle_nichols_voice_performance === true && media.adjudication?.marcia_brown_live_action_performance_separate === true && media.adjudication?.physical_performance_attributed_to_nichelle_nichols === false && media.adjudication?.maker_attribution === 'unresolved', 'Alice performance adjudication drifted');
  ensure(media.boundary?.exact_2269_animated_alice === true && media.boundary?.live_action_2267_alice_excluded === true && media.boundary?.devna_still_reuse === false && media.boundary?.cross_facet_substitution === false && media.boundary?.canonical_mutation === false, 'Alice media boundary drifted');
  const still = path.join(MEDIA_ROOT, 'alice-2269-still.webp');
  const portrait = path.join(MEDIA_ROOT, 'nichelle-nichols-portrait.jpg');
  ensure(fs.existsSync(still) && fs.existsSync(portrait), 'Alice media bytes missing');
  ensure(shaFile(still) === media.still.sha256 && shaFile(portrait) === media.portrait.sha256 && media.still.sha256 !== media.portrait.sha256, 'Alice media bytes drifted');

  const claim = readJson(path.join(CLAIM_ROOT, 'claim.json'));
  const batch = readJson(path.join(CLAIM_ROOT, 'batch.json'));
  ensure(claim.status === 'claimed-on-candidate-branch' && claim.candidate?.commit === CANDIDATE_COMMIT && claim.candidate?.tree === CANDIDATE_TREE, 'Alice claim candidate drifted');
  ensure(claim.task_id === TASK_ID && claim.lease_fields?.['$.batch.lease_id'] === LEASE_ID && claim.additional_lease_issued === false && claim.canonical_mutation === false, 'Alice claim receipt drifted');
  ensure(batch.lease_id === LEASE_ID && batch.tasks?.length === 1 && batch.tasks[0].id === TASK_ID && batch.tasks[0].source_fingerprint === FINGERPRINT, 'Alice claim batch drifted');
  return { media, still, portrait, claim, batch };
}

function patchCard(media, stillFile, portraitFile) {
  const cards = readJson('data/specimens.json');
  const matches = cards.filter((row) => normalize(row.actor) === normalize(PERFORMER) && normalize(row.character) === normalize(CHARACTER));
  ensure(matches.length === 1, `expected one Alice/Nichelle Nichols card, found ${matches.length}`);
  const card = matches[0];
  ensure(card.id === WALL_ID, `Alice expected ${WALL_ID}, got ${card.id}`);
  const stillPath = `images/${WALL_ID.toLowerCase()}-still.webp`;
  const portraitPath = `images/${WALL_ID.toLowerCase()}-portrait.jpg`;
  fs.copyFileSync(stillFile, stillPath);
  fs.copyFileSync(portraitFile, portraitPath);
  ensure(shaFile(stillPath) === media.still.sha256 && shaFile(portraitPath) === media.portrait.sha256, 'Alice copied media drifted');
  for (const file of fs.readdirSync('images').map((name) => path.join('images', name))) {
    if (!fs.statSync(file).isFile() || file === stillPath || file === portraitPath) continue;
    const digest = shaFile(file);
    ensure(digest !== media.still.sha256 && digest !== media.portrait.sha256, `Alice media duplicates ${file}`);
  }
  Object.assign(card, {
    kind: 'voice',
    character: CHARACTER,
    actor: PERFORMER,
    production: PRODUCTION,
    universe: 'Star Trek',
    years: YEARS,
    designer: '—',
    transform: 2,
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
    references: buildDraft().references,
    link: SOURCE,
    still: { src: stillPath, kind: 'still', origin: media.still.descriptionurl, focus: { x: 'center', y: 'center' }, pin: true },
    portrait: { src: portraitPath, kind: 'free', origin: media.portrait.descriptionurl, author: media.portrait.author, license: media.portrait.license, year: 2018, focus: { x: 'center', y: 'upper' }, pin: true },
  });
  writeJson('data/specimens.json', cards);
  const ledger = readJson('data/SOURCES.json');
  let source = ledger.find((row) => row.id === WALL_ID);
  if (!source) { source = { id: WALL_ID }; ledger.push(source); }
  Object.assign(source, { id: WALL_ID, actor: PERFORMER, character: CHARACTER, universe: 'Star Trek', still: card.still, portrait: card.portrait, fetched_at: media.generated_at.slice(0,10) });
  ledger.sort((a,b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeJson('data/SOURCES.json', ledger);
  return { card, source, stillPath, portraitPath };
}

function buildResolution(media, reviewedAt) {
  const items = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL_ID).sort((a,b) => a.side.localeCompare(b.side));
  ensure(items.length === 2, `expected two Alice media facets, found ${items.length}`);
  const still = items.find((row) => row.side === 'still');
  const portrait = items.find((row) => row.side === 'portrait');
  ensure(still?.asset?.sha256 === media.still.sha256 && portrait?.asset?.sha256 === media.portrait.sha256, 'Alice media-audit hashes drifted');
  const common = { enforced: true, at: reviewedAt };
  return {
    version: 2,
    reviewed_by: 'chatgpt-alice-source-review',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    votes: [
      { item_id: still.id, namespace: 'identity', value: 'expected', note: 'The frozen Alice source and file title bind this exact image to Alice’s 2269 animated appearance voiced by Nichelle Nichols.', evidence: [`source-page:${SOURCE}`, `source-revision:${media.source.revision}`, `source-file:${media.still.descriptionurl}`, `asset-sha256:${media.still.sha256}`], ...common },
      { item_id: still.id, namespace: 'presentation', value: 'character-depiction', note: 'The frame depicts the 2269 animated Alice and excludes Marcia Brown’s 2267 live-action performance.', evidence: ['source-caption:Alice (2269)', 'source-boundary:Nichelle Nichols voice', `asset-sha256:${media.still.sha256}`], ...common },
      { item_id: portrait.id, namespace: 'identity', value: 'expected', note: 'The licensed Commons source identifies Nichelle Nichols and supports performer identity only.', evidence: [`source-file:${media.portrait.descriptionurl}`, `source-author:${media.portrait.author}`, `source-license:${media.portrait.license}`, `asset-sha256:${media.portrait.sha256}`], ...common },
      { item_id: portrait.id, namespace: 'presentation', value: 'neutral-human', note: 'The portrait presents Nichelle Nichols as a neutral human performer and is source-distinct and byte-distinct from the animated Alice still and all canonical assets.', evidence: [`source-file:${media.portrait.descriptionurl}`, `asset-sha256:${media.portrait.sha256}`], ...common },
    ],
  };
}

function main() {
  fs.mkdirSync(STAGE_ROOT, { recursive: true });
  const { media, still, portrait, claim, batch } = verifyInputs();
  const priorReceipt = readJson(PRIOR_RECEIPT_PATH);
  ensure(priorReceipt.task?.id === 'ap_82712ddec2c606e4c7d1a152' && priorReceipt.reviewed_cycle?.id, 'Anastasia predecessor receipt drifted');
  node(PRIOR_CHECKER_PATH);

  let current = taskRow().task;
  ensure(current.status === 'leased' && current.lease?.id === LEASE_ID && current.attempts === 1, 'Alice candidate is not the exact leased task');
  ensure(current.performer === PERFORMER && current.character === CHARACTER && current.source_fingerprint === FINGERPRINT, 'Alice leased identity drifted');

  fs.rmSync('.luna', { recursive: true, force: true });
  fs.mkdirSync('.luna', { recursive: true });
  writeJson('.luna/batch.json', batch);
  const results = { version: 1, lease_id: LEASE_ID, agent: batch.agent, results: [{ task_id: TASK_ID, decision: 'draft', draft: buildDraft() }] };
  writeJson('.luna/results.json', results);
  npm(['run','autopilot','--','submit','--batch','.luna/batch.json','--input','.luna/results.json']);
  node('scripts/grow.mjs', ['--drafts']);
  const patched = patchCard(media, still, portrait);

  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  node('scripts/needs.mjs');
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');
  npm(['run','autopilot','--','sync','--scope','star-trek']);

  current = taskRow().task;
  ensure(current.status === 'merged' && current.wall_ids?.length === 1 && current.wall_ids[0] === WALL_ID && current.role_on_wall === true, 'Alice task did not enter merged review state');
  npm(['run','media:audit','--','sync','--scope','star-trek']);
  const reviewedAt = new Date().toISOString();
  const resolution = buildResolution(media, reviewedAt);
  writeJson(path.join(STAGE_ROOT, 'media-resolution.json'), resolution);
  npm(['run','media:audit','--','resolve','--input',path.join(STAGE_ROOT,'media-resolution.json'),'--scope','star-trek']);
  npm(['run','media:audit','--','gate','--scope','star-trek']);

  const mediaReview = {
    version: 1,
    reviewed_by: 'chatgpt-alice-source-review',
    lease_id: LEASE_ID,
    reviews: [{ task_id: TASK_ID, records: [{ wall_id: WALL_ID,
      still: { disposition: 'verified', subject: CHARACTER, source: media.still.descriptionurl, note: 'The exact 2269 animated Alice frame is separate from Marcia Brown’s 2267 live-action performance.' },
      portrait: { disposition: 'verified', subject: PERFORMER, source: media.portrait.descriptionurl, note: 'The licensed portrait identifies Nichelle Nichols as a neutral human performer and is separate from character evidence.' },
    }] }],
  };
  writeJson(path.join(STAGE_ROOT, 'media-review.json'), mediaReview);
  npm(['run','autopilot','--','complete','--input',path.join(STAGE_ROOT,'media-review.json')]);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);
  current = taskRow().task;
  ensure(current.status === 'resolved' && current.wall_ids?.[0] === WALL_ID, 'Alice task did not resolve');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify(QUEUE_AFTER), `Alice terminal candidate queue drifted: ${JSON.stringify(counts)}`);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status','--scope','star-trek','--json'], { capture: true }));
  ensure(waterline.phase === 'receipt-required', `Alice candidate waterline phase is ${waterline.phase}`);
  const unreceipted = Array.isArray(waterline.cycles?.unreceipted) ? waterline.cycles.unreceipted : [];
  ensure(unreceipted.length === 1 && unreceipted[0].lease_id === LEASE_ID, 'Alice must be the single unreceipted cycle');
  writeJson(path.join(STAGE_ROOT, 'waterline-before-receipt.json'), waterline);

  const card = readJson('data/specimens.json').find((row) => row.id === WALL_ID);
  const source = readJson('data/SOURCES.json').find((row) => row.id === WALL_ID);
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL_ID).sort((a,b) => a.side.localeCompare(b.side));
  const claimEvent = readJsonl('data/journal/autopilot.jsonl').find((row) => row.op === 'lease.claimed' && row.task_id === TASK_ID && row.lease_id === LEASE_ID);
  ensure(claimEvent, 'Alice claim event missing');
  const body = {
    version: 1,
    transaction: 'STAR-TREK-ALICE-CANDIDATE-STAGE-V1',
    canonical_parent: MAIN,
    canonical_tree: MAIN_TREE,
    claim_candidate: { commit: CANDIDATE_COMMIT, tree: CANDIDATE_TREE },
    task: { id: TASK_ID, performer: PERFORMER, role: CHARACTER, source: SOURCE, source_fingerprint: FINGERPRINT, queued_mode_hint: ['physical-and-voice'], adjudicated_kind: 'voice', performance_mode: 'voice-animation', physical_performance_attributed: false, marcia_brown_live_action_performance_separate: true, maker_attribution: 'unresolved' },
    lease: { id: LEASE_ID, claim_event_id: claimEvent.id, claimed_at: batch.claimed_at, expires_at: batch.expires_at, readiness_token: batch.readiness?.lease_token, selection: batch.selection },
    wall_id: WALL_ID,
    card_sha256: sha(Buffer.from(pretty(card))),
    source_ledger_sha256: sha(Buffer.from(pretty(source))),
    media_facets_sha256: sha(Buffer.from(pretty(facets))),
    media: { still_path: card.still.src, still_origin: card.still.origin, still_sha256: shaFile(card.still.src), portrait_path: card.portrait.src, portrait_origin: card.portrait.origin, portrait_sha256: shaFile(card.portrait.src), portrait_author: card.portrait.author, portrait_license: card.portrait.license },
    queue: counts,
    media_review_sha256: current.outcome?.review_sha256,
    source_media_receipt_sha256: media.receipt_sha256,
    canonical_mutation: false,
    additional_lease_issued: false,
  };
  const stage = { ...body, receipt_sha256: sha(Buffer.from(pretty(body))) };
  writeJson(path.join(STAGE_ROOT, 'stage.json'), stage);
  writeJson(path.join(STAGE_ROOT, 'batch.json'), batch);
  writeJson(path.join(STAGE_ROOT, 'results.json'), results);
  writeJson(path.join(STAGE_ROOT, 'media-scout.json'), media);
  writeJson(path.join(STAGE_ROOT, 'claim.json'), claim);
  console.log(JSON.stringify({ status: 'staged', wall_id: WALL_ID, lease_id: LEASE_ID, receipt_sha256: stage.receipt_sha256 }, null, 2));
}

try { main(); } catch (error) { console.error(`alice-stage-v1: ${error instanceof Error ? error.stack || error.message : String(error)}`); process.exit(1); }
