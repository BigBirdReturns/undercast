#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cmd = process.argv[2];
const env = process.env;
const EXPECTED_MAIN = env.EXPECTED_MAIN || '4900668f614a060f31ceeefb5009f7ee93cb17c1';
const MEDIA_CANONICAL_PARENT = env.MEDIA_CANONICAL_PARENT || 'b22d01251746a824a404308e6c9e3466aef2091a';
const TASK_ID = 'ap_a7bae45c6030e1212e1ad6b0';
const SOURCE_FINGERPRINT = 'dd367d1cef3b2089e6757a4321195ea40a6096e6785db9a00fe1a13a846c9e48';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/Maryl';
const SOURCE_PAGEID = 55511;
const SOURCE_REVISION = 3165630;
const SOURCE_TIMESTAMP = '2024-05-31T20:24:48Z';
const SOURCE_CONTENT_SHA256 = 'e6c751211b039a3af3beb9c7f8562c98c13ec596ca82f94d8bd3b2457a0c233f';
const EPISODE_SOURCE = 'https://memory-alpha.fandom.com/wiki/Infinite_Regress_(episode)';
const EPISODE_RECEIPT = {
  content_sha256: '8b7f7186684d8132850813f398f564d5a9c3153f71c3466bac8c74359771a617',
  pageid: 1557,
  revision: 3475117,
  source: EPISODE_SOURCE,
  timestamp: '2026-05-29T15:45:00Z',
};
const PERFORMER = 'Jeri Ryan';
const CHARACTER = 'Maryl';
const PRODUCTION = 'Star Trek: Voyager (Infinite Regress)';
const YEARS = '1998';
const STILL_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Seven_as_a_frightened_child.jpg';
const REJECTED_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Maryl.jpg';
const STILL_SHA256 = '77a124d4f21f79cc1cbdab2a5bfb33e5cd2cf98e6ba8d488d4e3d912b4035fe4';
const REJECTED_SHA256 = '6cbdf1091b85899027a13086ee129ec565d912f3bbc1d82c2b5fe05163e0e0fe';
const PORTRAIT_FILE = 'Jeri Ryan by Brian Wilkins (2010).jpg';
const PORTRAIT_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Jeri_Ryan_by_Brian_Wilkins_(2010).jpg';
const PRIOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-lorot-cycle.json';
const PRIOR_CHECKER_PATH = 'scripts/star-trek-lorot-cycle.mjs';
const PRIOR_RECEIPT_SHA256 = '1ae4135622cebbe2c1b6f720fbcf424733841b4309c972c058fcc97a49676618';
const PRIOR_CHECKER_SHA256 = 'ca67ce1547a4dcdfe0c910d24c7151e6d04e51cea31bab2b7a6e16acc37c0ced';
const PRIOR_CYCLE_ID = 'cycle_cb79b2fbcd6ff6e9dc749f99';
const KNOWN_FOR = 'The frightened child whose personality Jeri Ryan manifests through Seven of Nine in Infinite Regress (1998).';
const REVEAL = 'The frozen Maryl source credits Erica Mer for the girl in reflection and Jeri Ryan for Seven of Nine assuming Maryl’s personality. This record is limited to Ryan’s physical live-action performance through Seven; Maryl’s original Human body and prosthetic design, makeup, costume, direction, editing, sound, production-shop labor, transformation measurement, and other maker functions remain unresolved.';

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
  ensure(task, 'Maryl task missing from Autopilot');
  return { state, task };
}

function cardRow() {
  const cards = readJson('data/specimens.json');
  const matches = cards.filter((row) => normalize(row.actor) === normalize(PERFORMER) && normalize(row.character) === normalize(CHARACTER));
  ensure(matches.length === 1, `expected one Maryl/Jeri Ryan card, found ${matches.length}`);
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

function verifyPinnedSource(mediaRoot) {
  const visual = readJson(findOne(mediaRoot, 'visual-review.json'));
  ensure(visual.verdict === 'pass', 'Maryl visual review is not pass');
  ensure(visual.canonical_parent === MEDIA_CANONICAL_PARENT, 'Maryl media canonical parent drifted');
  ensure(visual.task_id === TASK_ID && visual.source_fingerprint === SOURCE_FINGERPRINT, 'Maryl visual review identity drifted');
  ensure(visual.target?.performer === PERFORMER && visual.target?.character === CHARACTER, 'Maryl visual review target drifted');
  ensure(visual.selected_still?.download_sha256 === STILL_SHA256, 'selected Maryl still hash drifted');
  ensure(visual.selected_still?.descriptionurl === STILL_ORIGIN, 'selected Maryl still origin drifted');
  ensure(visual.rejected_cross_performer_file?.download_sha256 === REJECTED_SHA256, 'rejected Erica Mer image hash drifted');
  ensure(visual.rejected_cross_performer_file?.descriptionurl === REJECTED_ORIGIN, 'rejected Erica Mer image origin drifted');
  ensure(visual.basis?.cross_performer_substitution === false && visual.basis?.generic_seven_still_used === false, 'Maryl visual boundary drifted');

  const sourceRevision = readJson(findOne(mediaRoot, 'source-revision.json'));
  const page = sourceRevision.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  const content = revision?.slots?.main?.content;
  ensure(page?.pageid === SOURCE_PAGEID && revision?.revid === SOURCE_REVISION && revision?.timestamp === SOURCE_TIMESTAMP, 'Maryl pinned source revision drifted');
  ensure(sha(Buffer.from(content, 'utf8')) === SOURCE_CONTENT_SHA256, 'Maryl pinned source content hash drifted');
  for (const literal of [
    '|image         = Maryl.jpg',
    '|caption       = Maryl',
    '|image2        = Seven as a frightened child.jpg',
    '|caption2      = Seven as Maryl',
    '|actor         = [[Erica Mer]] (girl in reflection)<br>[[Jeri Ryan]]',
    'Seven once again reverted to a frightened Maryl',
  ]) ensure(content.includes(literal), `Maryl source lost literal: ${literal}`);

  const still = findOne(mediaRoot, 'selected-jeri-ryan-maryl.jpg');
  ensure(shaFile(still) === STILL_SHA256, 'Maryl retained still bytes drifted');
  return { visual, sourceRevision, still };
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
      {
        claim: 'performance',
        label: 'The Maryl source separately credits Jeri Ryan and identifies Seven of Nine assuming Maryl’s personality in Infinite Regress',
        publisher: 'Memory Alpha',
        source: SOURCE,
      },
      {
        claim: 'production',
        label: 'Infinite Regress is the Star Trek: Voyager episode in which Seven manifests Maryl',
        publisher: 'Memory Alpha',
        source: EPISODE_SOURCE,
      },
    ],
    wiki: 'https://en.wikipedia.org/wiki/Jeri_Ryan',
  };
}

function patchCardAndLedger(wallId, stillSource) {
  const cards = readJson('data/specimens.json');
  const card = cards.find((row) => row.id === wallId);
  ensure(card, `card ${wallId} missing after grow`);
  ensure(normalize(card.actor) === normalize(PERFORMER) && normalize(card.character) === normalize(CHARACTER), 'grown Maryl card identity drifted');
  card.production = PRODUCTION;
  card.universe = 'Star Trek';
  card.years = YEARS;
  card.designer = '—';
  card.transform = 2;
  delete card.kind;
  card.knownFor = KNOWN_FOR;
  card.reveal = REVEAL;
  card.references = buildDraft().references;
  card.link = SOURCE;

  const stillPath = `images/${wallId.toLowerCase()}-still.jpg`;
  fs.copyFileSync(stillSource, stillPath);
  ensure(shaFile(stillPath) === STILL_SHA256, 'copied Maryl still hash drifted');
  card.still = {
    src: stillPath,
    kind: 'still',
    origin: STILL_ORIGIN,
    focus: { x: 'center', y: 'center' },
    pin: true,
  };
  writeJson('data/specimens.json', cards);

  node('scripts/pin.mjs', [wallId, '--wiki', 'https://commons.wikimedia.org/w/api.php', '--portrait', PORTRAIT_FILE], {
    extraEnv: { CONTACT: 'chatgpt-maryl-cycle' },
  });

  const nextCards = readJson('data/specimens.json');
  const nextCard = nextCards.find((row) => row.id === wallId);
  ensure(nextCard?.portrait?.origin === PORTRAIT_ORIGIN, `Maryl portrait origin drifted: ${nextCard?.portrait?.origin}`);
  ensure(/CC BY 2\.0/i.test(nextCard.portrait.license || ''), `Maryl portrait license drifted: ${nextCard.portrait.license}`);
  ensure(/Brian Wilkins/i.test(nextCard.portrait.author || ''), `Maryl portrait author drifted: ${nextCard.portrait.author}`);
  nextCard.portrait.year = 2010;
  nextCard.portrait.focus = { x: 'center', y: 'upper' };
  nextCard.portrait.pin = true;
  writeJson('data/specimens.json', nextCards);

  const portraitPath = nextCard.portrait.src;
  const portraitSha = shaFile(portraitPath);
  const existingPortraits = ['images/uc-037-portrait.jpg', 'images/uc-1392-portrait.jpg'];
  for (const file of existingPortraits) {
    ensure(fs.existsSync(file), `required prior portrait missing: ${file}`);
    ensure(shaFile(file) !== portraitSha, `Maryl portrait duplicates ${file}`);
  }
  for (const file of fs.readdirSync('images').map((name) => path.join('images', name))) {
    if (!fs.statSync(file).isFile() || file === portraitPath) continue;
    ensure(shaFile(file) !== portraitSha, `Maryl portrait duplicates existing asset ${file}`);
  }

  let ledger = readJson('data/SOURCES.json');
  let source = ledger.find((row) => row.id === wallId);
  if (!source) {
    source = { id: wallId, actor: PERFORMER, character: CHARACTER, universe: 'Star Trek', still: null, portrait: null };
    ledger.push(source);
  }
  source.actor = PERFORMER;
  source.character = CHARACTER;
  source.universe = 'Star Trek';
  source.still = nextCard.still;
  source.portrait = nextCard.portrait;
  source.fetched_at = new Date().toISOString().slice(0, 10);
  ledger.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeJson('data/SOURCES.json', ledger);
  return { card: nextCard, portraitPath, portraitSha };
}

function buildMediaResolution(wallId, reviewedAt) {
  const audit = readJson('data/MEDIA-AUDIT.json');
  const items = audit.items.filter((row) => row.wall_id === wallId).sort((a, b) => a.side.localeCompare(b.side));
  ensure(items.length === 2, `expected two Maryl media facets, found ${items.length}`);
  const still = items.find((row) => row.side === 'still');
  const portrait = items.find((row) => row.side === 'portrait');
  ensure(still?.asset?.sha256 === STILL_SHA256, 'Maryl media-audit still hash drifted');
  ensure(portrait?.asset?.sha256 && portrait.asset.sha256 !== STILL_SHA256, 'Maryl media-audit portrait hash missing or colliding');
  const common = { enforced: true, at: reviewedAt };
  return {
    version: 2,
    reviewed_by: 'chatgpt-maryl-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    votes: [
      {
        item_id: still.id,
        namespace: 'identity',
        value: 'expected',
        note: 'The pinned source caption identifies this exact frame as Seven as Maryl in Infinite Regress.',
        evidence: [`source-page:${SOURCE}`, `source-revision:${SOURCE_REVISION}`, `source-file:${STILL_ORIGIN}`, `asset-sha256:${STILL_SHA256}`],
        ...common,
      },
      {
        item_id: still.id,
        namespace: 'presentation',
        value: 'character-depiction',
        note: 'The frame depicts adult Seven of Nine physically performing Maryl’s frightened-child personality, not Erica Mer’s reflected child.',
        evidence: [`source-caption:Seven as Maryl`, `rejected-cross-performer:${REJECTED_ORIGIN}`, `rejected-sha256:${REJECTED_SHA256}`, `asset-sha256:${STILL_SHA256}`],
        ...common,
      },
      {
        item_id: portrait.id,
        namespace: 'identity',
        value: 'expected',
        note: 'The licensed Commons file identifies Jeri Ryan and is separate from character and maker evidence.',
        evidence: [`source-file:${PORTRAIT_ORIGIN}`, `source-author:Brian Wilkins`, `source-license:CC BY 2.0`, `asset-sha256:${portrait.asset.sha256}`],
        ...common,
      },
      {
        item_id: portrait.id,
        namespace: 'presentation',
        value: 'neutral-human',
        note: 'The portrait presents Jeri Ryan as a neutral human performer and is byte-distinct from prior canonical Jeri Ryan portraits.',
        evidence: [`source-file:${PORTRAIT_ORIGIN}`, `distinct-from:UC-037`, `distinct-from:UC-1392`, `asset-sha256:${portrait.asset.sha256}`],
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
  const sourceProof = verifyPinnedSource(mediaRoot);

  node(PRIOR_CHECKER_PATH);
  node('scripts/thesis-rails.mjs', ['validate']);
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id === TASK_ID && next.candidate?.source_fingerprint === SOURCE_FINGERPRINT, 'thesis rail did not select Maryl');
  writeJson(path.join(stageRoot, 'thesis-next.json'), next);

  fs.rmSync('.luna', { recursive: true, force: true });
  npm(['run', 'autopilot', '--', 'next', '--agent', 'chatgpt-star-trek-maryl', '--scope', 'star-trek', '--capability-profile', 'text-vision', '--limit', '1', '--lease-minutes', '1440', '--out', '.luna/batch.json', '--prompt', '.luna/AUTOPILOT-PROMPT.md']);
  const batch = readJson('.luna/batch.json');
  ensure(batch.tasks?.length === 1 && batch.tasks[0].id === TASK_ID && batch.tasks[0].source_fingerprint === SOURCE_FINGERPRINT, 'Maryl lease packet drifted');
  const results = {
    version: 1,
    lease_id: batch.lease_id,
    agent: batch.agent,
    results: [{ task_id: TASK_ID, decision: 'draft', draft: buildDraft() }],
  };
  writeJson('.luna/results.json', results);
  npm(['run', 'autopilot', '--', 'submit', '--batch', '.luna/batch.json', '--input', '.luna/results.json']);
  node('scripts/grow.mjs', ['--drafts']);

  const { card } = cardRow();
  const media = patchCardAndLedger(card.id, sourceProof.still);
  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  node('scripts/needs.mjs');
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');
  npm(['run', 'autopilot', '--', 'sync']);

  let current = taskRow().task;
  ensure(current.status === 'merged' && current.role_on_wall === true && current.wall_ids?.length === 1 && current.wall_ids[0] === card.id, 'Maryl task did not enter merged review state');

  npm(['run', 'media:audit', '--', 'sync']);
  const reviewedAt = new Date().toISOString();
  const resolution = buildMediaResolution(card.id, reviewedAt);
  writeJson(path.join(stageRoot, 'media-resolution.json'), resolution);
  npm(['run', 'media:audit', '--', 'resolve', '--input', path.join(stageRoot, 'media-resolution.json')]);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);

  const sourceLedger = readJson('data/SOURCES.json').find((row) => row.id === card.id);
  ensure(sourceLedger?.still?.origin === STILL_ORIGIN && sourceLedger?.portrait?.origin === PORTRAIT_ORIGIN, 'Maryl source ledger media drifted');
  const mediaReview = {
    version: 1,
    reviewed_by: 'chatgpt-maryl-second-desk',
    lease_id: batch.lease_id,
    reviews: [{
      task_id: TASK_ID,
      records: [{
        wall_id: card.id,
        still: {
          disposition: 'verified',
          subject: CHARACTER,
          source: STILL_ORIGIN,
          note: 'The pinned frame is captioned Seven as Maryl and depicts Jeri Ryan’s frightened-child performance through Seven of Nine.',
        },
        portrait: {
          disposition: 'verified',
          subject: PERFORMER,
          source: PORTRAIT_ORIGIN,
          note: 'The licensed portrait identifies Jeri Ryan as a neutral human performer and is distinct from the character frame.',
        },
      }],
    }],
  };
  writeJson(path.join(stageRoot, 'media-review.json'), mediaReview);
  npm(['run', 'autopilot', '--', 'complete', '--input', path.join(stageRoot, 'media-review.json')]);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);

  current = taskRow().task;
  ensure(current.status === 'resolved' && current.wall_ids?.[0] === card.id, 'Maryl task did not resolve');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify({ total: 2228, queued: 1801, resolved: 425, blocked: 0, rejected: 2, in_flight: 0 }), `Maryl terminal queue drifted: ${JSON.stringify(counts)}`);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(waterline.phase === 'receipt-required', `Maryl candidate waterline phase is ${waterline.phase}`);
  ensure((Array.isArray(waterline.cycles?.unreceipted) ? waterline.cycles.unreceipted.length : waterline.cycles?.unreceipted) === 1, 'Maryl candidate must have exactly one unreceipted cycle');
  writeJson(path.join(stageRoot, 'waterline-before-receipt.json'), waterline);

  const auditItems = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === card.id).sort((a, b) => a.side.localeCompare(b.side));
  const source = readJson('data/SOURCES.json').find((row) => row.id === card.id);
  const finalCard = readJson('data/specimens.json').find((row) => row.id === card.id);
  const claimEvent = readJsonl('data/journal/autopilot.jsonl').find((row) => row.op === 'lease.claimed' && row.task_id === TASK_ID && row.lease_id === batch.lease_id);
  ensure(claimEvent, 'Maryl claim event missing');
  const stageBody = {
    version: 1,
    transaction: 'STAR-TREK-MARYL-CANDIDATE-STAGE-V1',
    canonical_parent: EXPECTED_MAIN,
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
      source: SOURCE,
      source_fingerprint: SOURCE_FINGERPRINT,
      performance_mode: 'physical-prosthetic',
      original_maryl_body_inferred: false,
      erica_mer_reflection_conflated: false,
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
    media_facets_sha256: sha(Buffer.from(stablePretty(auditItems))),
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
    canonical_mutation: false,
  };
  const stageReceipt = { ...stageBody, receipt_sha256: sha(Buffer.from(stablePretty(stageBody))) };
  writeJson(path.join(stageRoot, 'stage.json'), stageReceipt);
  fs.copyFileSync('.luna/batch.json', path.join(stageRoot, 'batch.json'));
  fs.copyFileSync('.luna/results.json', path.join(stageRoot, 'results.json'));
  fs.copyFileSync(findOne(mediaRoot, 'visual-review.json'), path.join(stageRoot, 'source-media-visual-review.json'));
  console.log(JSON.stringify({ status: 'staged', wall_id: card.id, lease_id: batch.lease_id, stage_receipt_sha256: stageReceipt.receipt_sha256, portrait_sha256: media.portraitSha }, null, 2));
}

function verifyCandidate(stageDoc) {
  ensure(stageDoc.transaction === 'STAR-TREK-MARYL-CANDIDATE-STAGE-V1' && stageDoc.canonical_parent === EXPECTED_MAIN, 'Maryl stage receipt identity drifted');
  const stageBody = { ...stageDoc }; delete stageBody.receipt_sha256;
  ensure(stageDoc.receipt_sha256 === sha(Buffer.from(stablePretty(stageBody))), 'Maryl stage receipt hash drifted');
  const { task } = taskRow();
  ensure(task.status === 'resolved' && task.performer === PERFORMER && task.character === CHARACTER && task.source_fingerprint === SOURCE_FINGERPRINT, 'Maryl task state drifted');
  ensure(task.performance_modes?.length === 1 && task.performance_modes[0] === 'physical-prosthetic', 'Maryl task mode drifted');
  ensure(task.wall_ids?.length === 1 && task.wall_ids[0] === stageDoc.wall_id, 'Maryl task wall binding drifted');
  ensure(task.outcome?.review_sha256 === stageDoc.media_review_sha256, 'Maryl media review binding drifted');
  const card = readJson('data/specimens.json').find((row) => row.id === stageDoc.wall_id);
  ensure(card && card.actor === PERFORMER && card.character === CHARACTER && card.production === PRODUCTION && card.universe === 'Star Trek' && card.years === YEARS && card.designer === '—' && card.transform === 2, 'Maryl card fields drifted');
  ensure(!('kind' in card), 'Maryl physical card must not carry voice kind');
  ensure(card.knownFor === KNOWN_FOR && card.reveal === REVEAL && card.link === SOURCE, 'Maryl card copy drifted');
  ensure(card.reveal.includes('Erica Mer') && card.reveal.includes('original Human body') && card.reveal.includes('remain unresolved'), 'Maryl identity boundary copy drifted');
  ensure(card.references?.some((row) => row.claim === 'performance' && sourceKey(row.source) === sourceKey(SOURCE)), 'Maryl performance reference missing');
  ensure(card.references?.some((row) => row.claim === 'production' && sourceKey(row.source) === sourceKey(EPISODE_SOURCE)), 'Maryl production reference missing');
  ensure(card.still?.origin === STILL_ORIGIN && shaFile(card.still.src) === STILL_SHA256, 'Maryl still drifted');
  ensure(card.portrait?.origin === PORTRAIT_ORIGIN && /Brian Wilkins/i.test(card.portrait.author || '') && /CC BY 2\.0/i.test(card.portrait.license || ''), 'Maryl portrait provenance drifted');
  ensure(shaFile(card.portrait.src) === stageDoc.media.portrait_sha256, 'Maryl portrait bytes drifted');
  ensure(shaFile(card.portrait.src) !== shaFile('images/uc-037-portrait.jpg') && shaFile(card.portrait.src) !== shaFile('images/uc-1392-portrait.jpg'), 'Maryl portrait duplicates prior Jeri Ryan asset');
  ensure(card.still.origin !== REJECTED_ORIGIN && shaFile(card.still.src) !== REJECTED_SHA256, 'Erica Mer reflection was substituted into Jeri Ryan card');
  const source = readJson('data/SOURCES.json').find((row) => row.id === stageDoc.wall_id);
  ensure(source && JSON.stringify(source.still) === JSON.stringify(card.still) && JSON.stringify(source.portrait) === JSON.stringify(card.portrait) && source.fetched_at, 'Maryl source ledger drifted');
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === stageDoc.wall_id).sort((a, b) => a.side.localeCompare(b.side));
  ensure(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'Maryl media facets are not verified');
  ensure(facets.find((row) => row.side === 'still')?.asset?.sha256 === STILL_SHA256, 'Maryl still facet drifted');
  ensure(facets.find((row) => row.side === 'portrait')?.asset?.sha256 === stageDoc.media.portrait_sha256, 'Maryl portrait facet drifted');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify({ total: 2228, queued: 1801, resolved: 425, blocked: 0, rejected: 2, in_flight: 0 }), `Maryl candidate queue drifted: ${JSON.stringify(counts)}`);
  return { task, card, source, facets, counts };
}

function review() {
  const stageRoot = env.STAGE_ROOT;
  const reviewRoot = env.REVIEW_ROOT;
  ensure(stageRoot && reviewRoot, 'review requires STAGE_ROOT and REVIEW_ROOT');
  fs.mkdirSync(reviewRoot, { recursive: true });
  const stageDoc = readJson(path.join(stageRoot, 'stage.json'));
  const verified = verifyCandidate(stageDoc);
  node(PRIOR_CHECKER_PATH);
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/thesis-rails.mjs', ['validate']);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(waterline.phase === 'receipt-required', 'Maryl independent review expected receipt-required waterline');
  const body = {
    version: 1,
    transaction: 'STAR-TREK-MARYL-INDEPENDENT-REVIEW-V1',
    verdict: 'pass',
    canonical_parent: EXPECTED_MAIN,
    candidate: {
      commit: env.CANDIDATE_COMMIT,
      tree: env.CANDIDATE_TREE,
      path_count: Number(env.CANDIDATE_PATH_COUNT),
      path_ledger_sha256: env.CANDIDATE_PATH_LEDGER_SHA256,
    },
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
      source_fingerprint: SOURCE_FINGERPRINT,
      performance_mode: 'physical-prosthetic',
    },
    lease_id: stageDoc.lease.id,
    wall_id: stageDoc.wall_id,
    queue: verified.counts,
    media: stageDoc.media,
    boundary: {
      erica_mer_reflection_conflated: false,
      original_maryl_body_inferred: false,
      cross_facet_substitution: false,
      maker_attribution: 'unresolved',
    },
    checks: {
      archive_gate: 'pass',
      media_gate: 'pass',
      prior_lorot_checker: 'pass',
      waterline: 'receipt-required',
    },
  };
  const doc = { ...body, review_sha256: sha(Buffer.from(stablePretty(body))) };
  writeJson(path.join(reviewRoot, 'independent-review.json'), doc);
  console.log(JSON.stringify({ status: 'reviewed', verdict: 'pass', review_sha256: doc.review_sha256 }, null, 2));
}

function checkerSource({ wallId, receiptPath }) {
  return `#!/usr/bin/env node\nimport fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';\nconst RECEIPT=${JSON.stringify(receiptPath)},CHECKER='scripts/star-trek-maryl-cycle.mjs',TASK=${JSON.stringify(TASK_ID)},WALL=${JSON.stringify(wallId)},PERFORMER=${JSON.stringify(PERFORMER)},ROLE=${JSON.stringify(CHARACTER)},SOURCE=${JSON.stringify(SOURCE)},EPISODE_SOURCE=${JSON.stringify(EPISODE_SOURCE)},FINGERPRINT=${JSON.stringify(SOURCE_FINGERPRINT)},MAIN=${JSON.stringify(EXPECTED_MAIN)},STILL_SHA=${JSON.stringify(STILL_SHA256)},STILL_ORIGIN=${JSON.stringify(STILL_ORIGIN)},PORTRAIT_ORIGIN=${JSON.stringify(PORTRAIT_ORIGIN)},PRIOR_RECEIPT=${JSON.stringify(PRIOR_RECEIPT_PATH)},PRIOR_CHECKER=${JSON.stringify(PRIOR_CHECKER_PATH)},PRIOR_RECEIPT_ID=${JSON.stringify(PRIOR_RECEIPT_SHA256)},PRIOR_CHECKER_SHA=${JSON.stringify(PRIOR_CHECKER_SHA256)},PRIOR_CYCLE=${JSON.stringify(PRIOR_CYCLE_ID)};\nconst sha=v=>crypto.createHash('sha256').update(v).digest('hex'),stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v,pretty=v=>JSON.stringify(stable(v),null,2)+'\\n',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),jsonl=f=>fs.readFileSync(f,'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse),ok=(x,m)=>{if(!x)throw Error(m)},same=(a,b,m)=>ok(JSON.stringify(stable(a))===JSON.stringify(stable(b)),m);\nconst receipt=read(RECEIPT),body=structuredClone(receipt);delete body.receipt_sha256;ok(receipt.receipt_sha256===sha(pretty(body))&&receipt.transaction==='STAR-TREK-CYCLE-MARYL'&&receipt.canonical_parent===MAIN,'Maryl receipt identity drifted');ok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(CHECKER)),'Maryl checker hash drifted');\nconst state=read('data/AUTOPILOT.json'),trek=state.jobs.filter(x=>x.scope==='star-trek'),task=trek.find(x=>x.id===TASK);ok(trek.length===2228&&task?.status==='resolved'&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,'Maryl task drifted');same(task.performance_modes,['physical-prosthetic'],'Maryl mode drifted');same(task.wall_ids,[WALL],'Maryl wall drifted');ok(task.outcome?.review_sha256===receipt.canonical.outcome_review_sha256,'Maryl review binding drifted');\nconst card=read('data/specimens.json').find(x=>x.id===WALL);ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production===${JSON.stringify(PRODUCTION)}&&card.universe==='Star Trek'&&card.years==='1998'&&card.transform===2&&card.designer==='—'&&card.link===SOURCE&&!('kind'in card),'Maryl card drifted');ok(card.knownFor===${JSON.stringify(KNOWN_FOR)}&&card.reveal===${JSON.stringify(REVEAL)},'Maryl copy drifted');ok(card.references?.some(x=>x.claim==='performance'&&x.source===SOURCE)&&card.references?.some(x=>x.claim==='production'&&x.source===EPISODE_SOURCE),'Maryl references drifted');ok(sha(fs.readFileSync(card.still.src))===STILL_SHA&&card.still.origin===STILL_ORIGIN,'Maryl still drifted');ok(card.portrait.origin===PORTRAIT_ORIGIN&&/Brian Wilkins/i.test(card.portrait.author||'')&&/CC BY 2.0/i.test(card.portrait.license||''),'Maryl portrait provenance drifted');ok(sha(fs.readFileSync(card.portrait.src))===receipt.media.portrait_sha256,'Maryl portrait bytes drifted');ok(sha(fs.readFileSync(card.portrait.src))!==sha(fs.readFileSync('images/uc-037-portrait.jpg'))&&sha(fs.readFileSync(card.portrait.src))!==sha(fs.readFileSync('images/uc-1392-portrait.jpg')),'Maryl portrait duplicated prior Jeri Reyan asset');ok(card.still.origin!==${JSON.stringify(REJECTED_ORIGIN)}&&sha(fs.readFileSync(card.still.src))!==${JSON.stringify(REJECTED_SHA256)},'Erica Mer reflection conflated');\nconst source=read('data/SOURCES.json').find(x=>x.id===WALL);same(source.still,card.still,'source still drifted');same(source.portrait,card.portrait,'source portrait drifted');const facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===WALL).sort((a,b)=>a.side.localeCompare(b.side));ok(facets.length===2&&facets.every(x=>x.status==='verified'),'Maryl facets drifted');ok(facets.find(x=>x.side==='still')?.asset?.sha256===STILL_SHA&&facets.find(x=>x.side==='portrait')?.asset?.sha256===receipt.media.portrait_sha256,'Maryl facet bytes drifted');ok(receipt.canonical.record_sha256===sha(pretty(card))&&receipt.media.facets_sha256===sha(pretty(facets))&&receipt.media.source_ledger_sha256===sha(pretty(source)),'Maryl receipt projections drifted');\nconst claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek'),water=read('data/WATERLINE-STATE.json'),cycles=water.cycles.filter(x=>x.scope_id==='star-trek'),byLease=new Map(cycles.map(x=>[x.lease_id,x])),own=byLease.get(receipt.lease.id);ok(own?.id===receipt.reviewed_cycle.id&&own.outcome==='completed'&&own.task_statuses?.[TASK]==='resolved','Maryl waterline cycle drifted');const events=jsonl('data/journal/waterline.jsonl').filter(x=>x.id===receipt.reviewed_cycle.event_id&&x.lease_id===receipt.lease.id&&x.receipt_id===own.id);ok(events.length===1,'Maryl waterline event drifted');const later=claims.filter(x=>Date.parse(x.at)>Date.parse(receipt.reviewed_cycle.reviewed_at)),unreceipted=later.filter(x=>!byLease.has(x.lease_id));ok(unreceipted.length<=1,'more than one later cycle is unreceipted');ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later task is active');const resolved=trek.filter(x=>x.status==='resolved').length,queued=trek.filter(x=>x.status==='queued').length;ok(resolved>=425,'resolved floor regressed');if(later.length===0)same({total:trek.length,ueued,resolved,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length},{total:2228,queued:1801,resolved:425,blocked:0,rejected:2,in_flight:0},'Maryl terminal queue drifted');\nconst registry=read('data/ESTATE-REGISTRY.json'),estate=registry.estates.find(x=>x.id==='star-trek'),latest=cycles.at(-1),registryQueued=queued+unreceipted.length;ok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(registryQueued.toLocaleString('en-US')+' tasks remain queued'),'registry gate drifted');const prior=read(PRIOR_RECEIPT);ok(prior.receipt_sha256===PRIOR_RECEIPT_ID&&prior.reviewed_cycle?.id===PRIOR_CYCLE&&sha(fs.readFileSync(PRIOR_CHECKER))===PRIOR_CHECKER_SHA,'Lorot predecessor drifted');const run=spawnSync(process.execPath,[PRIOR_CHECKER],{encoding:'utf8',maxBuffer:256*1024*1024,env:process.env});ok(run.status===0,'Lorot predecessor checker failed');ok(receipt.boundary?.original_maryl_body_inferred===false&&receipt.boundary?.erica_mer_reflection_conflated===false&&receipt.boundary?.maker_attributed===false&&receipt.boundary?.cross_facet_substitution===false&&receipt.boundary?.additional_lease_issued===false,'Maryl boundary drifted');ok(fs.readFileSync('sitemap.xml','utf8').includes('records/'+WALL+'/'),'Maryl permanent route missing');console.log('star-trek-maryl-cycle: PASS — exact Jeri Ryan Maryl-through-Seven performance custody, Erica Mer reflection separation, source-distinct verified media, unresolved maker functions, reviewed waterline closure, Lorot predecessor custody, and later-cycle bounds are intact');\n`;
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
  ensure(reviewDoc.verdict === 'pass' && reviewDoc.candidate?.commit === env.CANDIDATE_COMMIT && reviewDoc.wall_id === stageDoc.wall_id && reviewDoc.lease_id === stageDoc.lease.id, 'Maryl independent review drifted');
  const reviewBody = { ...reviewDoc }; delete reviewBody.review_sha256;
  ensure(reviewDoc.review_sha256 === sha(Buffer.from(stablePretty(reviewBody))), 'Maryl independent review hash drifted');

  node(PRIOR_CHECKER_PATH);
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  const reviewedAt = new Date().toISOString();
  const cycleInput = {
    version: 1,
    scope_id: 'star-trek',
    lease_id: stageDoc.lease.id,
    outcome: 'completed',
    reviewed_by: 'chatgpt-maryl-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    note: 'The Maryl lease resumed from a durable candidate branch, preserved Erica Mer’s reflected-child performance as separate, verified exact Maryl-through-Seven and Jeri Ryan media, and returned the Star Trek wall to zero media debt.',
    evidence: [
      { type: 'workflow-run', value: `GitHub Actions run ${env.GITHUB_RUN_ID} — staged, independently reviewed, finalized, and published the exact Maryl cycle.` },
      { type: 'commit', value: `${env.CANDIDATE_COMMIT} — durable reviewed Maryl candidate before final receipt publication.` },
      { type: 'restart-proof', value: `Candidate branch ${env.CANDIDATE_BRANCH} and stage/review artifacts ${env.STAGE_ARTIFACT_ID}/${env.REVIEW_ARTIFACT_ID} persisted before finalization.` },
    ],
  };
  writeJson(path.join(finalRoot, 'cycle-input.json'), cycleInput);
  npm(['run', 'waterline', '--', 'record-cycle', '--input', path.join(finalRoot, 'cycle-input.json')]);

  const water = readJson('data/WATERLINE-STATE.json');
  const cycle = water.cycles.filter((row) => row.scope_id === 'star-trek' && row.lease_id === stageDoc.lease.id).at(-1);
  ensure(cycle?.outcome === 'completed' && cycle.task_statuses?.[TASK_ID] === 'resolved', 'Maryl reviewed waterline cycle missing');
  const event = readJsonl('data/journal/waterline.jsonl').filter((row) => row.lease_id === stageDoc.lease.id && row.receipt_id === cycle.id).at(-1);
  ensure(event, 'Maryl waterline event missing');

  const registry = readJson('data/ESTATE-REGISTRY.json');
  const estate = registry.estates.find((row) => row.id === 'star-trek');
  ensure(estate, 'Star Trek estate missing');
  estate.next_gate = `Star Trek reviewed Maryl cycle ${cycle.id} resolved Jeri Ryan’s physical live-action performance as Maryl through Seven of Nine in Infinite Regress (1998) within the preserved 2,228-task denominator; 1,801 tasks remain queued. The exact Seven-as-Maryl role frame and a separately sourced licensed Jeri Ryan portrait are verified. Erica Mer’s reflected-child depiction remains separate, Maryl’s original Human body is not inferred from Seven of Nine, and prosthetic design, makeup, costume, direction, editing, sound, production-shop, transformation measurement, and other maker attribution remain unresolved. Any later cycle must begin from the repository-native thesis rail, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
  writeJson('data/ESTATE-REGISTRY.json', registry);

  // Settle every deterministic projection before hashing the permanent receipt.
  // No source, media-audit, card, or route mutation may occur after those hashes
  // are recorded.
  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  npm(['run', 'media:audit', '--', 'sync']);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');

  const card = readJson('data/specimens.json').find((row) => row.id === stageDoc.wall_id);
  const source = readJson('data/SOURCES.json').find((row) => row.id === stageDoc.wall_id);
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === stageDoc.wall_id).sort((a, b) => a.side.localeCompare(b.side));
  const task = taskRow().task;
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify({ total: 2228, queued: 1801, resolved: 425, blocked: 0, rejected: 2, in_flight: 0 }), 'Maryl final queue drifted');
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id !== TASK_ID, 'Maryl final rail did not return to collection');

  const receiptPath = 'data/review/adapter-sdk/star-trek-maryl-cycle.json';
  const checkerPath = 'scripts/star-trek-maryl-cycle.mjs';
  const checker = checkerSource({ wallId: stageDoc.wall_id, receiptPath });
  fs.writeFileSync(checkerPath, checker);
  let checkerText = fs.readFileSync(checkerPath, 'utf8');
  const checkerTypo = '{total:trek.length,ueued,resolved,';
  ensure(checkerText.includes(checkerTypo), 'Maryl checker typo repair target missing');
  checkerText = checkerText.replace(checkerTypo, '{total:trek.length,queued,resolved,');
  fs.writeFileSync(checkerPath, checkerText);
  fs.chmodSync(checkerPath, 0o755);
  const checkerSha = shaFile(checkerPath);
  const sourceMediaVisualReview = readJson(path.join(stageRoot, 'source-media-visual-review.json'));

  const receiptBody = {
    version: 1,
    transaction: 'STAR-TREK-CYCLE-MARYL',
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
      performance_scope: 'Jeri Ryan’s physical live-action performance as Maryl through Seven of Nine in Infinite Regress (1998)',
      erica_mer_scope: 'the separately depicted girl in reflection',
      original_maryl_body_inferred: false,
      erica_mer_reflection_conflated: false,
      maker_attribution: 'unresolved',
      prosthetic_design_attribution: 'unresolved',
      makeup_attribution: 'unresolved',
      costume_attribution: 'unresolved',
      direction_attribution: 'unresolved',
      editing_attribution: 'unresolved',
      sound_attribution: 'unresolved',
      production_shop_attribution: 'unresolved',
      transformation_measured: false,
    },
    lease: stageDoc.lease,
    candidate: {
      commit: env.CANDIDATE_COMMIT,
      tree: env.CANDIDATE_TREE,
      path_count: Number(env.CANDIDATE_PATH_COUNT),
      path_ledger_sha256: env.CANDIDATE_PATH_LEDGER_SHA256,
      stage_receipt_sha256: stageDoc.receipt_sha256,
      artifact: { id: Number(env.STAGE_ARTIFACT_ID), sha256: String(env.STAGE_ARTIFACT_DIGEST || '').replace(/^sha256:/, '') },
    },
    independent_review: {
      verdict: 'pass',
      review_sha256: reviewDoc.review_sha256,
      artifact: { id: Number(env.REVIEW_ARTIFACT_ID), sha256: String(env.REVIEW_ARTIFACT_DIGEST || '').replace(/^sha256:/, '') },
    },
    source_media: {
      workflow_run: Number(env.MEDIA_RUN),
      artifact: { id: Number(env.MEDIA_ARTIFACT), sha256: String(env.MEDIA_DIGEST || '').replace(/^sha256:/, '') },
      visual_review_sha256: sha(Buffer.from(stablePretty(sourceMediaVisualReview))),
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
    queue: {
      before: { total: 2228, queued: 1802, resolved: 424, blocked: 0, rejected: 2, in_flight: 0 },
      after: counts,
    },
    prior_custody: {
      task_id: 'ap_9b7123237c640f1ce0a16ffe',
      character: 'Lorot',
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
    qualification: {
      checker_path: checkerPath,
      denominator: 2228,
      resolved_floor: 425,
      checker_sha256: checkerSha,
    },
    boundary: {
      queued_mode_hint_promoted: false,
      role_or_maker_conflated: false,
      original_maryl_body_inferred: false,
      erica_mer_reflection_conflated: false,
      maker_attributed: false,
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
  pkg.scripts['star-trek:maryl-cycle:check'] = 'node scripts/star-trek-maryl-cycle.mjs';
  if (!pkg.scripts['autopilot:fixtures'].includes('npm run star-trek:maryl-cycle:check')) pkg.scripts['autopilot:fixtures'] += ' && npm run star-trek:maryl-cycle:check';
  writeJson('package.json', pkg);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);
  node(checkerPath);

  const finalWaterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(finalWaterline.phase === 'ready-for-cycle' && finalWaterline.claim_allowed === true, `Maryl final waterline is ${finalWaterline.phase}`);
  const finalNext = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(finalNext.phase === 'ready-for-one-cycle', 'Maryl final thesis rail did not return to collection');
  writeJson(path.join(finalRoot, 'receipt.json'), receipt);
  writeJson(path.join(finalRoot, 'waterline.json'), finalWaterline);
  writeJson(path.join(finalRoot, 'next.json'), finalNext);
  writeJson(path.join(finalRoot, 'finalization.json'), {
    version: 1,
    transaction: 'STAR-TREK-MARYL-FINALIZATION-V1',
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
  else throw new Error('usage: star-trek-maryl-cycle-v1.mjs <stage|review|finalize>');
} catch (error) {
  console.error(`maryl-cycle: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
}
