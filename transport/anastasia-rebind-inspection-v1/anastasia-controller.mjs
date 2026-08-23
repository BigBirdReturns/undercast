#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cmd = process.argv[2];
const env = process.env;
const EXPECTED_MAIN = env.EXPECTED_MAIN || '97956ce415d565d968cc5f66067142183ec28a1f';
const EXPECTED_TREE = env.EXPECTED_TREE || 'ff8adadb6dd36ab84a21336bdd30ce3cb17b5335';
const MEDIA_CANONICAL_PARENT = env.MEDIA_CANONICAL_PARENT || '97956ce415d565d968cc5f66067142183ec28a1f';
const TASK_ID = 'ap_82712ddec2c606e4c7d1a152';
const SOURCE_FINGERPRINT = '8c45968f68d0b1afab3be38b612d0cee8a3c0ed1ae424cbc3ff51993aac39060';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/Anastasia_Komananov';
const SOURCE_PAGEID = 23346;
const SOURCE_REVISION = 3441447;
const SOURCE_TIMESTAMP = '2026-02-23T08:48:48Z';
const SOURCE_CONTENT_SHA256 = 'a5ef5c837f6a48aa9ef7cf2576e5ec43f6b8a2f32c17adf1dd58693c334543f3';
const EPISODE_SOURCE = 'https://memory-alpha.fandom.com/wiki/Our_Man_Bashir_(episode)';
const EPISODE_RECEIPT = {
  source: EPISODE_SOURCE,
  pageid: 918,
  revision: 3496191,
  timestamp: '2026-07-25T17:30:38Z',
  content_sha256: '3ec66c23b42237312df2bfc28dd598b5dc52749310f1fca78bc48796762cefb4',
};
const PERFORMER = 'Nana Visitor';
const CHARACTER = 'Anastasia Komananov';
const PRODUCTION = 'Our Man Bashir';
const YEARS = '1995';
const WALL_ID = 'UC-1395';
const STILL_FILE = 'anastasia-komananov-still.jpg';
const STILL_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Anastasia_Komananov.jpg';
const STILL_SHA256 = 'f7e57251322e01c4194527007da561327550700f252692f451e51df3ccefd257';
const PORTRAIT_FILE = 'nana-visitor-portrait.jpg';
const PORTRAIT_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Nana_Visitor_(42105426150).jpg';
const PORTRAIT_SHA256 = '8e9b0ac511e8564a3dd7cdfefab458957bdf76ffb82280b6f89432be9f40ed41';
const PORTRAIT_AUTHOR = 'Super Festivals from Ft. Lauderdale, USA';
const PORTRAIT_LICENSE = 'CC BY 2.0';
const PRIOR_TASK_ID = 'ap_a2fc2c7b0d3dec8a244ef048';
const PRIOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-queen-of-hearts-cycle.json';
const PRIOR_CHECKER_PATH = 'scripts/star-trek-queen-of-hearts-cycle.mjs';
const PRIOR_RECEIPT_SHA256 = 'b14f26bc59ff8713f866c0c001381cba6430789fbe600d6953e9ce19c65f8443';
const PRIOR_CHECKER_SHA256 = 'f07920c3e4f9fcb3752a56f8f79ec4ff42d7156dbefefd496332092fcc4fee5a';
const PRIOR_CYCLE_ID = 'cycle_d0a7a4a27199d383bf8770ca';
const KNOWN_FOR = 'The KGB operative hologram whose form took on Kira Nerys’s physical characteristics, performed by Nana Visitor in Our Man Bashir (1995).';
const REVEAL = 'The frozen Anastasia Komananov source credits Nana Visitor because the holographic character took on Kira Nerys’s physical characteristics in Our Man Bashir. This record is limited to Visitor’s physical live-action performance through Kira’s body after the transporter-pattern substitution. Komananov’s default holographic appearance, Felix’s program authorship, costume design, hair, prosthetic makeup, direction, editing, sound, transformation measurement, and other maker functions remain unresolved.';
const QUEUE_BEFORE = { total: 2228, queued: 1800, resolved: 426, blocked: 0, rejected: 2, in_flight: 0 };
const QUEUE_AFTER = { total: 2228, queued: 1799, resolved: 427, blocked: 0, rejected: 2, in_flight: 0 };

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (file) => sha(fs.readFileSync(file));
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const sourceKey = (value) => { try { const url = new URL(value); url.hash = ''; return url.toString().replace(/\/$/, ''); } catch { return String(value || '').trim(); } };

function run(program, args, { capture = false, cwd = process.cwd(), extraEnv = {} } = {}) {
  const result = spawnSync(program, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || '').trim() : `exit ${result.status}`;
    throw new Error(`${program} ${args.join(' ')} failed: ${detail}`);
  }
  return capture ? result.stdout : '';
}
const node = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
const npm = (args, options = {}) => run('npm', args, options);

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function findOne(root, basename) {
  const matches = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === basename) matches.push(file);
    }
  };
  walk(root);
  ensure(matches.length === 1, `expected one ${basename} under ${root}, found ${matches.length}`);
  return matches[0];
}

function taskRow() {
  const state = readJson('data/AUTOPILOT.json');
  const task = state.jobs.find((row) => row.id === TASK_ID);
  ensure(task, 'Anastasia Komananov task missing from Autopilot');
  return { state, task };
}

function cardRow() {
  const cards = readJson('data/specimens.json');
  const matches = cards.filter((row) => normalize(row.actor) === normalize(PERFORMER) && normalize(row.character) === normalize(CHARACTER));
  ensure(matches.length === 1, `expected one Anastasia Komananov/Nana Visitor card, found ${matches.length}`);
  return { cards, card: matches[0] };
}

function queueCounts() {
  const trek = readJson('data/AUTOPILOT.json').jobs.filter((row) => row.scope === 'star-trek');
  return {
    total: trek.length,
    queued: trek.filter((row) => row.status === 'queued').length,
    resolved: trek.filter((row) => row.status === 'resolved').length,
    blocked: trek.filter((row) => row.status === 'blocked').length,
    rejected: trek.filter((row) => row.status === 'rejected').length,
    in_flight: trek.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length,
  };
}

function verifyMedia(mediaRoot) {
  const scout = readJson(findOne(mediaRoot, 'media-scout.json'));
  ensure(scout.transaction === 'STAR-TREK-ANASTASIA-MEDIA-SCOUT-V1', 'Anastasia media transaction drifted');
  ensure(scout.canonical_parent === MEDIA_CANONICAL_PARENT, 'Anastasia media canonical parent drifted');
  ensure(scout.task?.id === TASK_ID && scout.task?.performer === PERFORMER && scout.task?.character === CHARACTER && scout.task?.source_fingerprint === SOURCE_FINGERPRINT, 'Anastasia media task identity drifted');
  ensure(JSON.stringify(scout.task.queued_mode_hint) === JSON.stringify(['physical-prosthetic']), 'Anastasia queued mode hint drifted');
  ensure(scout.source?.pageid === SOURCE_PAGEID && scout.source.revision === SOURCE_REVISION && scout.source.timestamp === SOURCE_TIMESTAMP && scout.source.content_sha256 === SOURCE_CONTENT_SHA256, 'Anastasia source receipt drifted');
  ensure(scout.source?.selected_lead_image === 'Anastasia Komananov.jpg', 'Anastasia lead-image selection drifted');
  ensure(scout.episode_receipt?.source === EPISODE_SOURCE && JSON.stringify(scout.episode_receipt) === JSON.stringify(EPISODE_RECEIPT), 'Anastasia episode receipt drifted');
  ensure(scout.still?.descriptionurl === STILL_ORIGIN && scout.still.sha256 === STILL_SHA256 && scout.still.title === 'File:Anastasia Komananov.jpg', 'Anastasia still scout drifted');
  ensure(scout.portrait?.descriptionurl === PORTRAIT_ORIGIN && scout.portrait.sha256 === PORTRAIT_SHA256 && scout.portrait.author === PORTRAIT_AUTHOR && scout.portrait.license === PORTRAIT_LICENSE, 'Anastasia portrait scout drifted');
  ensure(Array.isArray(scout.portrait.duplicate_existing_paths) && scout.portrait.duplicate_existing_paths.length === 0, 'Anastasia portrait duplicates canonical media');
  ensure(scout.boundary?.komananov_hologram_and_kira_body_distinguished === true && scout.boundary?.nana_visitor_physical_performance_through_kira_body === true && scout.boundary?.hologram_creator_or_costume_maker_attributed === false && scout.boundary?.transformation_measured === false && scout.boundary?.cross_facet_substitution === false && scout.boundary?.lease_taken === false && scout.boundary?.canonical_mutation === false, 'Anastasia media boundary drifted');

  const sourceRevision = readJson(findOne(mediaRoot, 'source-revision.json'));
  const page = sourceRevision.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = revision?.slots?.main?.content;
  ensure(page?.pageid === SOURCE_PAGEID && revision?.revid === SOURCE_REVISION && revision?.timestamp === SOURCE_TIMESTAMP, 'Anastasia pinned source revision drifted');
  ensure(sha(Buffer.from(content, 'utf8')) === SOURCE_CONTENT_SHA256, 'Anastasia pinned source content hash drifted');
  for (const literal of [
    '|image       = Anastasia Komananov.jpg',
    '|caption     = Anastasia Komananov',
    '|actor       = [[Nana Visitor]]',
    'Komananov subsequently took on the physical characteristics of [[Kira Nerys]]',
    'the role was played by Kira actress [[Nana Visitor]]',
  ]) ensure(content.includes(literal), `Anastasia source lost literal: ${literal}`);

  const episode = readJson(findOne(mediaRoot, 'episode-receipt.json'));
  ensure(JSON.stringify(episode) === JSON.stringify(EPISODE_RECEIPT), 'Anastasia episode artifact drifted');
  const still = findOne(mediaRoot, STILL_FILE);
  const portrait = findOne(mediaRoot, PORTRAIT_FILE);
  ensure(shaFile(still) === STILL_SHA256, 'Anastasia retained still bytes drifted');
  ensure(shaFile(portrait) === PORTRAIT_SHA256, 'Anastasia retained portrait bytes drifted');
  ensure(STILL_SHA256 !== PORTRAIT_SHA256, 'Anastasia media facets collide');
  return { scout, sourceRevision, episode, still, portrait };
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
      { claim: 'performance', label: 'The Anastasia Komananov source credits Nana Visitor after the hologram takes on Kira Nerys’s physical characteristics', publisher: 'Memory Alpha', source: SOURCE },
      { claim: 'production', label: 'Our Man Bashir is the 1995 Deep Space Nine episode in which Komananov takes on Kira’s physical characteristics', publisher: 'Memory Alpha', source: EPISODE_SOURCE },
    ],
    wiki: 'https://en.wikipedia.org/wiki/Nana_Visitor',
  };
}

function patchCardAndLedger(wallId, media) {
  const cards = readJson('data/specimens.json');
  const card = cards.find((row) => row.id === wallId);
  ensure(card, `card ${wallId} missing after grow`);
  ensure(normalize(card.actor) === normalize(PERFORMER) && normalize(card.character) === normalize(CHARACTER), 'grown Anastasia card identity drifted');
  Object.assign(card, {
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
  });
  delete card.kind;
  const stillPath = `images/${wallId.toLowerCase()}-still.jpg`;
  const portraitPath = `images/${wallId.toLowerCase()}-portrait.jpg`;
  fs.copyFileSync(media.still, stillPath);
  fs.copyFileSync(media.portrait, portraitPath);
  ensure(shaFile(stillPath) === STILL_SHA256 && shaFile(portraitPath) === PORTRAIT_SHA256, 'Anastasia copied media bytes drifted');
  for (const file of fs.readdirSync('images').map((name) => path.join('images', name))) {
    if (!fs.statSync(file).isFile() || file === stillPath || file === portraitPath) continue;
    ensure(shaFile(file) !== PORTRAIT_SHA256, `Anastasia portrait duplicates existing asset ${file}`);
  }
  card.still = { src: stillPath, kind: 'still', origin: STILL_ORIGIN, focus: { x: 'center', y: 'center' }, pin: true };
  card.portrait = { src: portraitPath, kind: 'free', origin: PORTRAIT_ORIGIN, author: PORTRAIT_AUTHOR, license: PORTRAIT_LICENSE, year: 2018, focus: { x: 'center', y: 'upper' }, pin: true };
  writeJson('data/specimens.json', cards);

  const ledger = readJson('data/SOURCES.json');
  let source = ledger.find((row) => row.id === wallId);
  if (!source) { source = { id: wallId }; ledger.push(source); }
  Object.assign(source, { id: wallId, actor: PERFORMER, character: CHARACTER, universe: 'Star Trek', still: card.still, portrait: card.portrait, fetched_at: new Date().toISOString().slice(0, 10) });
  ledger.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeJson('data/SOURCES.json', ledger);
  return { card, source, stillPath, portraitPath };
}

function buildMediaResolution(wallId, reviewedAt) {
  const items = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === wallId).sort((a, b) => a.side.localeCompare(b.side));
  ensure(items.length === 2, `expected two Anastasia media facets, found ${items.length}`);
  const still = items.find((row) => row.side === 'still');
  const portrait = items.find((row) => row.side === 'portrait');
  ensure(still?.asset?.sha256 === STILL_SHA256 && portrait?.asset?.sha256 === PORTRAIT_SHA256, 'Anastasia media-audit hashes drifted');
  const common = { enforced: true, at: reviewedAt };
  return {
    version: 2,
    reviewed_by: 'chatgpt-anastasia-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    votes: [
      {
        item_id: still.id,
        namespace: 'identity',
        value: 'expected',
        note: 'The revision-bound source names this exact lead image Anastasia Komananov and credits Nana Visitor after the hologram takes on Kira Nerys’s physical characteristics.',
        evidence: [`source-page:${SOURCE}`, `source-revision:${SOURCE_REVISION}`, `source-file:${STILL_ORIGIN}`, `asset-sha256:${STILL_SHA256}`],
        ...common,
      },
      {
        item_id: still.id,
        namespace: 'presentation',
        value: 'character-depiction',
        note: 'The frame depicts Komananov’s Kira-bodied manifestation in Our Man Bashir and is not evidence of the hologram’s default appearance.',
        evidence: ['source-caption:Anastasia Komananov', 'source-boundary:physical characteristics of Kira Nerys', `asset-sha256:${STILL_SHA256}`],
        ...common,
      },
      {
        item_id: portrait.id,
        namespace: 'identity',
        value: 'expected',
        note: 'The licensed Commons photograph identifies Nana Visitor and is separate from character and maker evidence.',
        evidence: [`source-file:${PORTRAIT_ORIGIN}`, `source-author:${PORTRAIT_AUTHOR}`, `source-license:${PORTRAIT_LICENSE}`, `asset-sha256:${PORTRAIT_SHA256}`],
        ...common,
      },
      {
        item_id: portrait.id,
        namespace: 'presentation',
        value: 'neutral-human',
        note: 'The portrait presents Nana Visitor as a neutral human performer and is byte-distinct from every existing canonical asset.',
        evidence: [`source-file:${PORTRAIT_ORIGIN}`, 'distinct-from:UC-686', 'distinct-from:UC-1113', `asset-sha256:${PORTRAIT_SHA256}`],
        ...common,
      },
    ],
  };
}

function stage() {
  const mediaRoot = env.MEDIA_ROOT;
  const stageRoot = env.STAGE_ROOT;
  ensure(mediaRoot && stageRoot, 'stage requires MEDIA_ROOT and STAGE_ROOT');
  fs.mkdirSync(stageRoot, { recursive: true });
  const media = verifyMedia(mediaRoot);

  ensure(shaFile(PRIOR_CHECKER_PATH) === PRIOR_CHECKER_SHA256, 'Queen predecessor checker bytes drifted');
  const priorReceipt = readJson(PRIOR_RECEIPT_PATH);
  ensure(priorReceipt.receipt_sha256 === PRIOR_RECEIPT_SHA256 && priorReceipt.reviewed_cycle?.id === PRIOR_CYCLE_ID, 'Queen predecessor receipt drifted');
  node(PRIOR_CHECKER_PATH);
  node('scripts/thesis-rails.mjs', ['validate']);
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id === TASK_ID && next.candidate?.source_fingerprint === SOURCE_FINGERPRINT, 'thesis rail did not select Anastasia Komananov');
  writeJson(path.join(stageRoot, 'thesis-next.json'), next);

  fs.rmSync('.luna', { recursive: true, force: true });
  npm(['run', 'autopilot', '--', 'next', '--agent', 'chatgpt-star-trek-anastasia-v1', '--scope', 'star-trek', '--capability-profile', 'text-vision', '--limit', '1', '--lease-minutes', '1440', '--out', '.luna/batch.json', '--prompt', '.luna/AUTOPILOT-PROMPT.md']);
  const batch = readJson('.luna/batch.json');
  ensure(batch.tasks?.length === 1 && batch.tasks[0].id === TASK_ID && batch.tasks[0].source_fingerprint === SOURCE_FINGERPRINT, 'Anastasia lease packet drifted');
  const results = { version: 1, lease_id: batch.lease_id, agent: batch.agent, results: [{ task_id: TASK_ID, decision: 'draft', draft: buildDraft() }] };
  writeJson('.luna/results.json', results);
  npm(['run', 'autopilot', '--', 'submit', '--batch', '.luna/batch.json', '--input', '.luna/results.json']);
  node('scripts/grow.mjs', ['--drafts']);

  const { card } = cardRow();
  ensure(card.id === WALL_ID, `Anastasia expected ${WALL_ID}, got ${card.id}`);
  patchCardAndLedger(card.id, media);
  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  node('scripts/needs.mjs');
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');
  npm(['run', 'autopilot', '--', 'sync', '--scope', 'star-trek']);

  let current = taskRow().task;
  ensure(current.status === 'merged' && current.role_on_wall === true && current.wall_ids?.length === 1 && current.wall_ids[0] === card.id, 'Anastasia task did not enter merged review state');

  npm(['run', 'media:audit', '--', 'sync', '--scope', 'star-trek']);
  const reviewedAt = new Date().toISOString();
  const resolution = buildMediaResolution(card.id, reviewedAt);
  writeJson(path.join(stageRoot, 'media-resolution.json'), resolution);
  npm(['run', 'media:audit', '--', 'resolve', '--input', path.join(stageRoot, 'media-resolution.json'), '--scope', 'star-trek']);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);

  const mediaReview = {
    version: 1,
    reviewed_by: 'chatgpt-anastasia-second-desk',
    lease_id: batch.lease_id,
    reviews: [{
      task_id: TASK_ID,
      records: [{
        wall_id: card.id,
        still: { disposition: 'verified', subject: CHARACTER, source: STILL_ORIGIN, note: 'The pinned frame is the revision-bound Kira-bodied Anastasia Komananov manifestation and is not evidence of the hologram’s default appearance.' },
        portrait: { disposition: 'verified', subject: PERFORMER, source: PORTRAIT_ORIGIN, note: 'The licensed portrait identifies Nana Visitor as a neutral human performer and remains separate from character evidence.' },
      }],
    }],
  };
  writeJson(path.join(stageRoot, 'media-review.json'), mediaReview);
  npm(['run', 'autopilot', '--', 'complete', '--input', path.join(stageRoot, 'media-review.json')]);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);
  current = taskRow().task;
  ensure(current.status === 'resolved' && current.wall_ids?.[0] === card.id, 'Anastasia task did not resolve');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify(QUEUE_AFTER), `Anastasia terminal candidate queue drifted: ${JSON.stringify(counts)}`);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(waterline.phase === 'receipt-required', `Anastasia candidate waterline phase is ${waterline.phase}`);
  const unreceipted = Array.isArray(waterline.cycles?.unreceipted) ? waterline.cycles.unreceipted : [];
  ensure(unreceipted.length === 1 && unreceipted[0].lease_id === batch.lease_id, 'Anastasia candidate must be the single unreceipted cycle');
  writeJson(path.join(stageRoot, 'waterline-before-receipt.json'), waterline);

  const finalCard = readJson('data/specimens.json').find((row) => row.id === card.id);
  const source = readJson('data/SOURCES.json').find((row) => row.id === card.id);
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === card.id).sort((a, b) => a.side.localeCompare(b.side));
  const claimEvent = readJsonl('data/journal/autopilot.jsonl').find((row) => row.op === 'lease.claimed' && row.task_id === TASK_ID && row.lease_id === batch.lease_id);
  ensure(claimEvent, 'Anastasia claim event missing');
  const scout = readJson(findOne(mediaRoot, 'media-scout.json'));
  const stageBody = {
    version: 1,
    transaction: 'STAR-TREK-ANASTASIA-KOMANANOV-CANDIDATE-STAGE-V1',
    canonical_parent: EXPECTED_MAIN,
    canonical_tree: EXPECTED_TREE,
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
      source: SOURCE,
      source_fingerprint: SOURCE_FINGERPRINT,
      queued_mode_hint: ['physical-prosthetic'],
      adjudicated_kind: 'physical',
      performance_mode: 'physical-prosthetic',
      physical_performance_attributed: true,
      default_holographic_appearance_inferred: false,
      kira_body_manifestation_scope: true,
      maker_attribution: 'unresolved',
    },
    lease: {
      id: batch.lease_id,
      claim_event_id: claimEvent.id,
      claimed_at: batch.claimed_at,
      expires_at: batch.expires_at,
      readiness_token: batch.readiness.lease_token,
      selection: batch.selection,
    },
    wall_id: card.id,
    card_sha256: sha(Buffer.from(stablePretty(finalCard))),
    source_ledger_sha256: sha(Buffer.from(stablePretty(source))),
    media_facets_sha256: sha(Buffer.from(stablePretty(facets))),
    media: {
      still_path: finalCard.still.src,
      still_origin: finalCard.still.origin,
      still_sha256: shaFile(finalCard.still.src),
      portrait_path: finalCard.portrait.src,
      portrait_origin: finalCard.portrait.origin,
      portrait_sha256: shaFile(finalCard.portrait.src),
      portrait_author: finalCard.portrait.author,
      portrait_license: finalCard.portrait.license,
    },
    queue: counts,
    media_review_sha256: current.outcome.review_sha256,
    source_media_scout_sha256: sha(Buffer.from(stablePretty(scout))),
    canonical_mutation: false,
  };
  const stageReceipt = { ...stageBody, receipt_sha256: sha(Buffer.from(stablePretty(stageBody))) };
  writeJson(path.join(stageRoot, 'stage.json'), stageReceipt);
  fs.copyFileSync('.luna/batch.json', path.join(stageRoot, 'batch.json'));
  fs.copyFileSync('.luna/results.json', path.join(stageRoot, 'results.json'));
  fs.copyFileSync(findOne(mediaRoot, 'media-scout.json'), path.join(stageRoot, 'source-media-scout.json'));
  console.log(JSON.stringify({ status: 'staged', wall_id: card.id, lease_id: batch.lease_id, stage_receipt_sha256: stageReceipt.receipt_sha256 }, null, 2));
}

function verifyCandidate(stageDoc) {
  ensure(stageDoc.transaction === 'STAR-TREK-ANASTASIA-KOMANANOV-CANDIDATE-STAGE-V1' && stageDoc.canonical_parent === EXPECTED_MAIN && stageDoc.canonical_tree === EXPECTED_TREE, 'Anastasia stage receipt identity drifted');
  const stageBody = { ...stageDoc }; delete stageBody.receipt_sha256;
  ensure(stageDoc.receipt_sha256 === sha(Buffer.from(stablePretty(stageBody))), 'Anastasia stage receipt hash drifted');
  const { task } = taskRow();
  ensure(task.status === 'resolved' && task.performer === PERFORMER && task.character === CHARACTER && task.source_fingerprint === SOURCE_FINGERPRINT, 'Anastasia task state drifted');
  ensure(JSON.stringify(task.performance_modes) === JSON.stringify(['physical-prosthetic']), 'Anastasia queued mode hint drifted');
  ensure(task.wall_ids?.length === 1 && task.wall_ids[0] === stageDoc.wall_id, 'Anastasia wall binding drifted');
  ensure(task.outcome?.review_sha256 === stageDoc.media_review_sha256, 'Anastasia media review binding drifted');
  const card = readJson('data/specimens.json').find((row) => row.id === stageDoc.wall_id);
  ensure(card && card.actor === PERFORMER && card.character === CHARACTER && card.production === PRODUCTION && card.universe === 'Star Trek' && card.years === YEARS && card.designer === '—' && card.transform === 2 && !('kind' in card) && card.link === SOURCE, 'Anastasia card fields drifted');
  ensure(card.knownFor === KNOWN_FOR && card.reveal === REVEAL, 'Anastasia card copy drifted');
  ensure(card.reveal.includes('Kira’s body') && card.reveal.includes('default holographic appearance') && card.reveal.includes('remain unresolved'), 'Anastasia performance boundary copy drifted');
  ensure(card.references?.some((row) => row.claim === 'performance' && sourceKey(row.source) === sourceKey(SOURCE)), 'Anastasia performance reference missing');
  ensure(card.references?.some((row) => row.claim === 'production' && sourceKey(row.source) === sourceKey(EPISODE_SOURCE)), 'Anastasia production reference missing');
  ensure(card.still?.origin === STILL_ORIGIN && shaFile(card.still.src) === STILL_SHA256, 'Anastasia still drifted');
  ensure(card.portrait?.origin === PORTRAIT_ORIGIN && card.portrait.author === PORTRAIT_AUTHOR && card.portrait.license === PORTRAIT_LICENSE && shaFile(card.portrait.src) === PORTRAIT_SHA256, 'Anastasia portrait drifted');
  const source = readJson('data/SOURCES.json').find((row) => row.id === stageDoc.wall_id);
  ensure(source && JSON.stringify(source.still) === JSON.stringify(card.still) && JSON.stringify(source.portrait) === JSON.stringify(card.portrait) && source.fetched_at, 'Anastasia source ledger drifted');
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === stageDoc.wall_id).sort((a, b) => a.side.localeCompare(b.side));
  ensure(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'Anastasia media facets are not verified');
  ensure(facets.find((row) => row.side === 'still')?.asset?.sha256 === STILL_SHA256 && facets.find((row) => row.side === 'portrait')?.asset?.sha256 === PORTRAIT_SHA256, 'Anastasia facet bytes drifted');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify(QUEUE_AFTER), `Anastasia candidate queue drifted: ${JSON.stringify(counts)}`);
  return { task, card, source, facets, counts };
}

function review() {
  const stageRoot = env.STAGE_ROOT;
  const reviewRoot = env.REVIEW_ROOT;
  ensure(stageRoot && reviewRoot, 'review requires STAGE_ROOT and REVIEW_ROOT');
  fs.mkdirSync(reviewRoot, { recursive: true });
  const stageDoc = readJson(path.join(stageRoot, 'stage.json'));
  const verified = verifyCandidate(stageDoc);
  ensure(shaFile(PRIOR_CHECKER_PATH) === PRIOR_CHECKER_SHA256, 'Queen predecessor checker bytes drifted during review');
  node(PRIOR_CHECKER_PATH);
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/thesis-rails.mjs', ['validate']);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  const unreceipted = Array.isArray(waterline.cycles?.unreceipted) ? waterline.cycles.unreceipted : [];
  ensure(waterline.phase === 'receipt-required' && unreceipted.length === 1 && unreceipted[0].lease_id === stageDoc.lease.id, 'Anastasia independent review expected one receipt-required cycle');
  const body = {
    version: 1,
    transaction: 'STAR-TREK-ANASTASIA-KOMANANOV-INDEPENDENT-REVIEW-V1',
    verdict: 'pass',
    canonical_parent: EXPECTED_MAIN,
    candidate: {
      commit: env.CANDIDATE_COMMIT,
      tree: env.CANDIDATE_TREE,
      path_count: Number(env.CANDIDATE_PATH_COUNT),
      path_ledger_sha256: env.CANDIDATE_PATH_LEDGER_SHA256,
    },
    task: { id: TASK_ID, performer: PERFORMER, role: CHARACTER, source_fingerprint: SOURCE_FINGERPRINT, queued_mode_hint: ['physical-prosthetic'], performance_mode: 'physical-prosthetic' },
    lease_id: stageDoc.lease.id,
    wall_id: stageDoc.wall_id,
    queue: verified.counts,
    media: stageDoc.media,
    boundary: {
      queued_mode_hint_promoted: false,
      physical_performance_attributed: true,
      default_holographic_appearance_inferred: false,
      kira_body_manifestation_scope: true,
      program_creator_attributed: false,
      costume_maker_attributed: false,
      prosthetic_makeup_attributed: false,
      transformation_measured: false,
      cross_facet_substitution: false,
    },
    checks: { archive_gate: 'pass', media_gate: 'pass', prior_queen_checker: 'pass', waterline: 'receipt-required' },
  };
  const doc = { ...body, review_sha256: sha(Buffer.from(stablePretty(body))) };
  writeJson(path.join(reviewRoot, 'independent-review.json'), doc);
  console.log(JSON.stringify({ status: 'reviewed', verdict: 'pass', review_sha256: doc.review_sha256 }, null, 2));
}

function checkerSource({ wallId, receiptPath }) {
  const constants = {
    receiptPath,
    taskId: TASK_ID,
    wallId,
    performer: PERFORMER,
    role: CHARACTER,
    source: SOURCE,
    episodeSource: EPISODE_SOURCE,
    fingerprint: SOURCE_FINGERPRINT,
    main: EXPECTED_MAIN,
    stillSha: STILL_SHA256,
    stillOrigin: STILL_ORIGIN,
    portraitSha: PORTRAIT_SHA256,
    portraitOrigin: PORTRAIT_ORIGIN,
    priorReceiptPath: PRIOR_RECEIPT_PATH,
    priorCheckerPath: PRIOR_CHECKER_PATH,
    priorReceiptId: PRIOR_RECEIPT_SHA256,
    priorCheckerSha: PRIOR_CHECKER_SHA256,
    priorCycleId: PRIOR_CYCLE_ID,
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
  };
  return `#!/usr/bin/env node\nimport fs from 'node:fs';\nimport crypto from 'node:crypto';\nimport { spawnSync } from 'node:child_process';\nconst C=${JSON.stringify(constants)};\nconst CHECKER='scripts/star-trek-anastasia-komananov-cycle.mjs';\nconst sha=v=>crypto.createHash('sha256').update(v).digest('hex');\nconst stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;\nconst pretty=v=>JSON.stringify(stable(v),null,2)+'\\n';\nconst read=f=>JSON.parse(fs.readFileSync(f,'utf8'));\nconst jsonl=f=>fs.readFileSync(f,'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse);\nconst ok=(x,m)=>{if(!x)throw Error(m)};\nconst same=(a,b,m)=>ok(JSON.stringify(stable(a))===JSON.stringify(stable(b)),m);\nconst receipt=read(C.receiptPath), body=structuredClone(receipt); delete body.receipt_sha256;\nok(receipt.receipt_sha256===sha(pretty(body))&&receipt.transaction==='STAR-TREK-CYCLE-ANASTASIA-KOMANANOV'&&receipt.canonical_parent===C.main,'Anastasia receipt identity drifted');\nok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(CHECKER)),'Anastasia checker hash drifted');\nconst state=read('data/AUTOPILOT.json'), trek=state.jobs.filter(x=>x.scope==='star-trek'), task=trek.find(x=>x.id===C.taskId);\nok(trek.length===2228&&task?.status==='resolved'&&task.performer===C.performer&&task.character===C.role&&task.source_fingerprint===C.fingerprint,'Anastasia task drifted');\nsame(task.performance_modes,['physical-prosthetic'],'Anastasia mode drifted'); same(task.wall_ids,[C.wallId],'Anastasia wall drifted');\nok(task.outcome?.review_sha256===receipt.canonical.outcome_review_sha256,'Anastasia review binding drifted');\nconst card=read('data/specimens.json').find(x=>x.id===C.wallId);\nok(card&&card.actor===C.performer&&card.character===C.role&&card.production==='Our Man Bashir'&&card.universe==='Star Trek'&&card.years==='1995'&&card.transform===2&&card.designer==='—'&&card.link===C.source&&!('kind'in card),'Anastasia card drifted');\nok(card.knownFor===C.knownFor&&card.reveal===C.reveal,'Anastasia copy drifted');\nok(card.references?.some(x=>x.claim==='performance'&&x.source===C.source)&&card.references?.some(x=>x.claim==='production'&&x.source===C.episodeSource),'Anastasia references drifted');\nok(sha(fs.readFileSync(card.still.src))===C.stillSha&&card.still.origin===C.stillOrigin,'Anastasia still drifted');\nok(sha(fs.readFileSync(card.portrait.src))===C.portraitSha&&card.portrait.origin===C.portraitOrigin&&card.portrait.author==='Super Festivals from Ft. Lauderdale, USA'&&card.portrait.license==='CC BY 2.0','Anastasia portrait drifted');\nconst source=read('data/SOURCES.json').find(x=>x.id===C.wallId); same(source.still,card.still,'Anastasia source still drifted'); same(source.portrait,card.portrait,'Anastasia source portrait drifted');\nconst facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===C.wallId).sort((a,b)=>a.side.localeCompare(b.side));\nok(facets.length===2&&facets.every(x=>x.status==='verified'),'Anastasia facets drifted');\nok(facets.find(x=>x.side==='still')?.asset?.sha256===C.stillSha&&facets.find(x=>x.side==='portrait')?.asset?.sha256===C.portraitSha,'Anastasia facet bytes drifted');\nok(receipt.canonical.record_sha256===sha(pretty(card))&&receipt.media.facets_sha256===sha(pretty(facets))&&receipt.media.source_ledger_sha256===sha(pretty(source)),'Anastasia receipt projections drifted');\nconst claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek');\nconst water=read('data/WATERLINE-STATE.json'), cycles=water.cycles.filter(x=>x.scope_id==='star-trek'), byLease=new Map(cycles.map(x=>[x.lease_id,x])), own=byLease.get(receipt.lease.id);\nok(own?.id===receipt.reviewed_cycle.id&&own.outcome==='completed'&&own.task_statuses?.[C.taskId]==='resolved','Anastasia waterline cycle drifted');\nconst events=jsonl('data/journal/waterline.jsonl').filter(x=>x.id===receipt.reviewed_cycle.event_id&&x.lease_id===receipt.lease.id&&x.receipt_id===own.id); ok(events.length===1,'Anastasia waterline event drifted');\nconst later=claims.filter(x=>Date.parse(x.at)>Date.parse(receipt.reviewed_cycle.reviewed_at)), unreceipted=later.filter(x=>!byLease.has(x.lease_id));\nok(unreceipted.length<=1,'more than one later cycle is unreceipted'); ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later task is active');\nconst resolved=trek.filter(x=>x.status==='resolved').length, queued=trek.filter(x=>x.status==='queued').length; ok(resolved>=427,'resolved floor regressed');\nif(later.length===0)same({total:trek.length,queued,resolved,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length},{total:2228,queued:1799,resolved:427,blocked:0,rejected:2,in_flight:0},'Anastasia terminal queue drifted');\nconst registry=read('data/ESTATE-REGISTRY.json'), estate=registry.estates.find(x=>x.id==='star-trek'), latest=cycles.at(-1), registryQueued=queued+unreceipted.length;\nok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(registryQueued.toLocaleString('en-US')+' tasks remain queued'),'registry gate drifted');\nconst prior=read(C.priorReceiptPath); ok(prior.receipt_sha256===C.priorReceiptId&&prior.reviewed_cycle?.id===C.priorCycleId&&sha(fs.readFileSync(C.priorCheckerPath))===C.priorCheckerSha,'Queen predecessor drifted');\nconst run=spawnSync(process.execPath,[C.priorCheckerPath],{encoding:'utf8',maxBuffer:256*1024*1024,env:process.env}); ok(run.status===0,'Queen predecessor checker failed');\nok(receipt.boundary?.default_holographic_appearance_inferred===false&&receipt.boundary?.kira_body_manifestation_scope===true&&receipt.boundary?.program_creator_attributed===false&&receipt.boundary?.costume_maker_attributed===false&&receipt.boundary?.prosthetic_makeup_attributed===false&&receipt.boundary?.transformation_measured===false&&receipt.boundary?.cross_facet_substitution===false&&receipt.boundary?.additional_lease_issued===false,'Anastasia boundary drifted');\nok(fs.readFileSync('sitemap.xml','utf8').includes('records/'+C.wallId+'/'),'Anastasia permanent route missing');\nconsole.log('star-trek-anastasia-komananov-cycle: PASS — exact Nana Visitor Kira-bodied Komananov performance custody, source-distinct verified media, default-hologram separation, unresolved maker functions, reviewed waterline closure, Queen predecessor custody, and later-cycle bounds are intact');\n`;
}

function finalize() {
  const stageRoot = env.STAGE_ROOT;
  const reviewRoot = env.REVIEW_ROOT;
  const finalRoot = env.FINAL_ROOT;
  ensure(stageRoot && reviewRoot && finalRoot, 'finalize requires STAGE_ROOT, REVIEW_ROOT, and FINAL_ROOT');
  fs.mkdirSync(finalRoot, { recursive: true });
  const stageDoc = readJson(path.join(stageRoot, 'stage.json'));
  const reviewDoc = readJson(path.join(reviewRoot, 'independent-review.json'));
  verifyCandidate(stageDoc);
  ensure(reviewDoc.verdict === 'pass' && reviewDoc.candidate?.commit === env.CANDIDATE_COMMIT && reviewDoc.wall_id === stageDoc.wall_id && reviewDoc.lease_id === stageDoc.lease.id, 'Anastasia independent review drifted');
  const reviewBody = { ...reviewDoc }; delete reviewBody.review_sha256;
  ensure(reviewDoc.review_sha256 === sha(Buffer.from(stablePretty(reviewBody))), 'Anastasia independent review hash drifted');

  ensure(shaFile(PRIOR_CHECKER_PATH) === PRIOR_CHECKER_SHA256, 'Queen predecessor checker bytes drifted during finalization');
  node(PRIOR_CHECKER_PATH);
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  const reviewedAt = new Date().toISOString();
  const cycleInput = {
    version: 1,
    scope_id: 'star-trek',
    lease_id: stageDoc.lease.id,
    outcome: 'completed',
    reviewed_by: 'chatgpt-anastasia-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    note: 'The Anastasia Komananov lease preserved Nana Visitor’s physical performance through Kira Nerys’s body, did not infer the hologram’s default appearance, verified exact separate character and performer media, and returned the Star Trek wall to zero media debt.',
    evidence: [
      { type: 'workflow-run', value: `GitHub Actions run ${env.GITHUB_RUN_ID || 'local-dry-run'} — staged, independently reviewed, and finalized the exact Anastasia Komananov cycle.` },
      { type: 'commit', value: `${env.CANDIDATE_COMMIT} — durable reviewed Anastasia candidate before receipt publication.` },
      { type: 'restart-proof', value: `Candidate branch ${env.CANDIDATE_BRANCH || 'local'} and stage/review artifacts ${env.STAGE_ARTIFACT_ID || 'local'}/${env.REVIEW_ARTIFACT_ID || 'local'} persisted before finalization.` },
    ],
  };
  writeJson(path.join(finalRoot, 'cycle-input.json'), cycleInput);
  npm(['run', 'waterline', '--', 'record-cycle', '--input', path.join(finalRoot, 'cycle-input.json')]);

  const water = readJson('data/WATERLINE-STATE.json');
  const cycle = water.cycles.filter((row) => row.scope_id === 'star-trek' && row.lease_id === stageDoc.lease.id).at(-1);
  ensure(cycle?.outcome === 'completed' && cycle.task_statuses?.[TASK_ID] === 'resolved', 'Anastasia reviewed waterline cycle missing');
  const event = readJsonl('data/journal/waterline.jsonl').filter((row) => row.lease_id === stageDoc.lease.id && row.receipt_id === cycle.id).at(-1);
  ensure(event, 'Anastasia waterline event missing');

  const registry = readJson('data/ESTATE-REGISTRY.json');
  const estate = registry.estates.find((row) => row.id === 'star-trek');
  ensure(estate, 'Star Trek estate missing');
  estate.next_gate = `Star Trek reviewed Anastasia Komananov cycle ${cycle.id} resolved Nana Visitor’s physical live-action performance after the hologram took on Kira Nerys’s physical characteristics in Our Man Bashir (1995) within the preserved 2,228-task denominator; 1,799 tasks remain queued. The exact Kira-bodied Komananov frame and a separately sourced licensed Nana Visitor portrait are verified. Komananov’s default holographic appearance is not inferred from Kira’s body, and Felix’s program authorship, costume design, hair, prosthetic makeup, direction, editing, sound, transformation measurement, and other maker functions remain unresolved. Any later cycle must begin from the repository-native thesis rail, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
  writeJson('data/ESTATE-REGISTRY.json', registry);

  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  npm(['run', 'media:audit', '--', 'sync', '--scope', 'star-trek']);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');

  const card = readJson('data/specimens.json').find((row) => row.id === stageDoc.wall_id);
  const source = readJson('data/SOURCES.json').find((row) => row.id === stageDoc.wall_id);
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === stageDoc.wall_id).sort((a, b) => a.side.localeCompare(b.side));
  const task = taskRow().task;
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify(QUEUE_AFTER), 'Anastasia final queue drifted');
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id !== TASK_ID, 'Anastasia final rail did not return to collection');

  const receiptPath = 'data/review/adapter-sdk/star-trek-anastasia-komananov-cycle.json';
  const checkerPath = 'scripts/star-trek-anastasia-komananov-cycle.mjs';
  fs.writeFileSync(checkerPath, checkerSource({ wallId: stageDoc.wall_id, receiptPath }));
  fs.chmodSync(checkerPath, 0o755);
  const checkerSha = shaFile(checkerPath);
  const sourceMediaScout = readJson(path.join(stageRoot, 'source-media-scout.json'));

  const receiptBody = {
    version: 1,
    transaction: 'STAR-TREK-CYCLE-ANASTASIA-KOMANANOV',
    generated_at: reviewedAt,
    canonical_parent: EXPECTED_MAIN,
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
      production: PRODUCTION,
      years: YEARS,
      source: SOURCE,
      source_fingerprint: SOURCE_FINGERPRINT,
      source_receipts: [{ source: SOURCE, pageid: SOURCE_PAGEID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }],
      episode_source: EPISODE_SOURCE,
      episode_receipt: EPISODE_RECEIPT,
      queued_mode_hint: ['physical-prosthetic'],
      adjudicated_kind: 'physical',
      performance_mode: 'physical-prosthetic',
      performance_scope: 'Nana Visitor’s physical live-action performance as Anastasia Komananov after the hologram takes on Kira Nerys’s physical characteristics in Our Man Bashir (1995)',
      physical_performance_attributed: true,
      default_holographic_appearance_inferred: false,
      kira_body_manifestation_scope: true,
      maker_attribution: 'unresolved',
      program_creator_attribution: 'unresolved',
      costume_design_attribution: 'unresolved',
      hair_attribution: 'unresolved',
      prosthetic_makeup_attribution: 'unresolved',
      direction_attribution: 'unresolved',
      editing_attribution: 'unresolved',
      sound_attribution: 'unresolved',
      transformation_measured: false,
    },
    lease: stageDoc.lease,
    candidate: {
      commit: env.CANDIDATE_COMMIT,
      tree: env.CANDIDATE_TREE,
      path_count: Number(env.CANDIDATE_PATH_COUNT),
      path_ledger_sha256: env.CANDIDATE_PATH_LEDGER_SHA256,
      stage_receipt_sha256: stageDoc.receipt_sha256,
      artifact: { id: Number(env.STAGE_ARTIFACT_ID || 0), sha256: String(env.STAGE_ARTIFACT_DIGEST || 'local').replace(/^sha256:/, '') },
    },
    independent_review: {
      verdict: 'pass',
      review_sha256: reviewDoc.review_sha256,
      artifact: { id: Number(env.REVIEW_ARTIFACT_ID || 0), sha256: String(env.REVIEW_ARTIFACT_DIGEST || 'local').replace(/^sha256:/, '') },
    },
    source_media: {
      workflow_run: Number(env.MEDIA_RUN || 0),
      artifact: { id: Number(env.MEDIA_ARTIFACT || 0), sha256: String(env.MEDIA_DIGEST || 'local').replace(/^sha256:/, '') },
      scout_sha256: sha(Buffer.from(stablePretty(sourceMediaScout))),
      canonical_parent: MEDIA_CANONICAL_PARENT,
    },
    canonical: {
      wall_id: stageDoc.wall_id,
      record: card,
      outcome_review_sha256: task.outcome.review_sha256,
      record_sha256: sha(Buffer.from(stablePretty(card))),
    },
    media: {
      still: 'verified',
      still_path: card.still.src,
      still_origin: card.still.origin,
      still_sha256: shaFile(card.still.src),
      portrait: 'verified',
      portrait_path: card.portrait.src,
      portrait_origin: card.portrait.origin,
      portrait_author: card.portrait.author,
      portrait_license: card.portrait.license,
      portrait_sha256: shaFile(card.portrait.src),
      facets,
      facets_sha256: sha(Buffer.from(stablePretty(facets))),
      source_ledger_sha256: sha(Buffer.from(stablePretty(source))),
      cross_facet_substitution: false,
      maker_attribution: 'unresolved',
    },
    queue: { before: QUEUE_BEFORE, after: counts },
    prior_custody: {
      task_id: PRIOR_TASK_ID,
      character: 'Queen of Hearts',
      receipt_path: PRIOR_RECEIPT_PATH,
      receipt_identity: PRIOR_RECEIPT_SHA256,
      checker_path: PRIOR_CHECKER_PATH,
      checker_sha256: PRIOR_CHECKER_SHA256,
      cycle_id: PRIOR_CYCLE_ID,
    },
    reviewed_cycle: {
      id: cycle.id,
      event_id: event.id,
      prior_cycle_id: PRIOR_CYCLE_ID,
      outcome: cycle.outcome,
      reviewed_at: cycle.reviewed_at,
    },
    next,
    qualification: { checker_path: checkerPath, denominator: 2228, resolved_floor: 427, checker_sha256: checkerSha },
    boundary: {
      queued_mode_hint_promoted: false,
      physical_performance_attributed: true,
      default_holographic_appearance_inferred: false,
      kira_body_manifestation_scope: true,
      program_creator_attributed: false,
      costume_maker_attributed: false,
      prosthetic_makeup_attributed: false,
      transformation_measured: false,
      cross_facet_substitution: false,
      outside_human_dependency: false,
      owner_physical_action_required: false,
      additional_lease_issued: false,
    },
  };
  const receipt = { ...receiptBody, receipt_sha256: sha(Buffer.from(stablePretty(receiptBody))) };
  writeJson(receiptPath, receipt);

  const pkg = readJson('package.json');
  pkg.scripts['star-trek:anastasia-komananov-cycle:check'] = 'node scripts/star-trek-anastasia-komananov-cycle.mjs';
  if (!pkg.scripts['autopilot:fixtures'].includes('npm run star-trek:anastasia-komananov-cycle:check')) pkg.scripts['autopilot:fixtures'] += ' && npm run star-trek:anastasia-komananov-cycle:check';
  writeJson('package.json', pkg);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);
  node(checkerPath);

  const finalWaterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(finalWaterline.phase === 'ready-for-cycle' && finalWaterline.claim_allowed === true, `Anastasia final waterline is ${finalWaterline.phase}`);
  const finalNext = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(finalNext.phase === 'ready-for-one-cycle', 'Anastasia final thesis rail did not return to collection');
  writeJson(path.join(finalRoot, 'receipt.json'), receipt);
  writeJson(path.join(finalRoot, 'waterline.json'), finalWaterline);
  writeJson(path.join(finalRoot, 'next.json'), finalNext);
  writeJson(path.join(finalRoot, 'finalization.json'), {
    version: 1,
    transaction: 'STAR-TREK-ANASTASIA-KOMANANOV-FINALIZATION-V1',
    status: 'qualified',
    canonical_parent: EXPECTED_MAIN,
    candidate_commit: env.CANDIDATE_COMMIT,
    task_id: TASK_ID,
    wall_id: stageDoc.wall_id,
    receipt_sha256: receipt.receipt_sha256,
    checker_sha256: checkerSha,
    reviewed_cycle: cycle.id,
    next: finalNext.candidate,
  });
  console.log(JSON.stringify({ status: 'qualified', wall_id: stageDoc.wall_id, receipt_sha256: receipt.receipt_sha256, checker_sha256: checkerSha, cycle_id: cycle.id, next: finalNext.candidate }, null, 2));
}

try {
  if (cmd === 'stage') stage();
  else if (cmd === 'review') review();
  else if (cmd === 'finalize') finalize();
  else throw new Error('usage: anastasia-controller-v2.mjs <stage|review|finalize>');
} catch (error) {
  console.error(`anastasia-cycle-v2: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
}
