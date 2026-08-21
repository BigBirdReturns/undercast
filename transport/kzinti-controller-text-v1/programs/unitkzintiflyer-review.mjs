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
const STILL_PATH = 'images/uc-1391-still.webp';
const STILL_SOURCE = "https://memory-alpha.fandom.com/wiki/File:Kzinti_Flyer.jpg";
const STILL_SHA = 'ab5bf6bc35d63a5b1511f82303f7dd1dc0aa886b423c90d11b22c7949a7b93de';
const PORTRAIT_PATH = 'images/uc-1391-portrait.jpg';
const PORTRAIT_SOURCE = "https://commons.wikimedia.org/wiki/File:Doohan.JPG";
const PORTRAIT_SHA = 'fa3811f5d44a7e3f58283b53dfb39282ee01ca7ae261c4ff78e47a47610db3a0';
const LWAXANA_COMPOSABLE_CHECKER_PATH = "scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs";

const candidateMetaPath = process.argv[2];
const stagePath = process.argv[3];
const outPath = process.argv[4] || '/tmp/unitkzintiflyer-independent-review.json';
if (!candidateMetaPath || !stagePath) {
  throw new Error('usage: unitkzintiflyer-review.mjs <candidate-metadata.json> <stage.json> [out.json]');
}

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)), message);
const fileSha = (file) => sha(fs.readFileSync(file));
function run(label, executable, args, { capture = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  return capture ? result.stdout.trim() : result;
}

const meta = read(candidateMetaPath);
const stage = read(stagePath);
const stageBody = structuredClone(stage);
delete stageBody.stage_sha256;
ok(stage.stage_sha256 === sha(pretty(stageBody)), 'Kzinti Flyer stage receipt hash drifted');
ok(stage.canonical_parent === MAIN && meta.canonical_parent === MAIN, 'candidate parent drifted');
const head = run('read candidate commit', 'git', ['rev-parse', 'HEAD'], { capture: true });
const tree = run('read candidate tree', 'git', ['rev-parse', 'HEAD^{tree}'], { capture: true });
ok(head === meta.candidate_commit && tree === meta.candidate_tree, 'candidate checkout does not match metadata');
ok(run('read candidate parent', 'git', ['rev-parse', 'HEAD^'], { capture: true }) === MAIN, 'candidate is not one-parent from canonical main');
ok(Number(meta.candidate_path_count) > 0 && /^[0-9a-f]{64}$/.test(meta.candidate_path_ledger_sha256 || ''), 'candidate path receipt is invalid');
const paths = run('read candidate paths', 'git', ['diff', '--name-only', `${MAIN}..HEAD`], { capture: true }).split(/\r?\n/).filter(Boolean).sort();
ok(paths.length === meta.candidate_path_count, 'candidate path count drifted');
ok(sha(Buffer.from(`${paths.join('\n')}\n`)) === meta.candidate_path_ledger_sha256, 'candidate path ledger drifted');
ok(!paths.some((item) => item.startsWith('.github/') || item.startsWith('scripts/.unitkzintiflyer-')), 'candidate contains transport paths');
ok(paths.includes(LWAXANA_COMPOSABLE_CHECKER_PATH) && paths.includes('package.json'), 'candidate lost Lwaxana successor-composability paths');
ok(fileSha(LWAXANA_COMPOSABLE_CHECKER_PATH) === stage.predecessor_compatibility?.composable_checker_sha256, 'candidate Lwaxana composability checker drifted');
ok(read('package.json').scripts?.['star-trek:lwaxana-eligibility-rejection:check'] === `node ${LWAXANA_COMPOSABLE_CHECKER_PATH}`, 'candidate Lwaxana package route drifted');

run('validate candidate archive', process.execPath, ['scripts/validate.mjs']);
run('validate candidate media closure', process.execPath, ['scripts/media-audit.mjs', 'gate', '--scope', 'star-trek']);
run('validate candidate thesis rails', process.execPath, ['scripts/thesis-rails.mjs', 'validate']);
const phaseChecker = path.join(path.dirname(process.argv[1]), 'unitkzintiflyer-prior-phase.mjs');
run('validate bounded prior-cycle candidate phase', process.execPath, [phaseChecker, stage.lease.id]);
const waterlineStatus = JSON.parse(run('inspect candidate waterline', process.execPath, ['scripts/waterline.mjs', 'status', '--scope', 'star-trek', '--json'], { capture: true }));

const state = read('data/AUTOPILOT.json');
const task = state.jobs.find((row) => row.id === TASK);
ok(task?.status === 'resolved' && task.performer === PERFORMER && task.character === ROLE && task.source_fingerprint === FINGERPRINT, 'Kzinti Flyer resolved task drifted');
same(task.performance_modes, ['voice-animation'], 'Kzinti Flyer queue hint drifted');
same(task.wall_ids, [WALL], 'Kzinti Flyer wall binding drifted');
ok(task.outcome?.kind === 'audited-wall' && task.outcome.review_sha256 === stage.review.review_sha256, 'Kzinti Flyer task review receipt drifted');

const card = read('data/specimens.json').find((row) => row.id === WALL);
ok(card && card.actor === PERFORMER && card.character === ROLE && card.production === "Star Trek: The Animated Series (The Slaver Weapon)" && card.universe === 'Star Trek' && card.years === '1973' && card.kind === 'voice' && card.transform === 2 && card.designer === '—' && card.link === SOURCE, 'Kzinti Flyer canonical record drifted');
ok(card.reveal === "The frozen Kzinti Flyer source identifies James Doohan as the role’s performer and places the role in The Slaver Weapon, supporting a voice-only claim bounded to the 1973 episode. The exact role still is retained only as character evidence, while a separately sourced public-domain portrait supports Doohan’s identity. Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separately bounded James Doohan roles. No physical performance, animation, character design, voice direction, editing, sound processing, production-shop labor, vocal transformation, or other maker credit is inferred.", 'Kzinti Flyer performance, related-role, image, and maker boundary is not explicit');
ok(card.references?.some((row) => row.claim === 'performance' && row.source === SOURCE), 'Kzinti Flyer role receipt is missing');
ok(card.references?.some((row) => row.source === FIRST_EPISODE_SOURCE) && card.references?.some((row) => row.source === LAST_EPISODE_SOURCE), 'Kzinti Flyer production timeline receipts are missing');
ok(fileSha(STILL_PATH) === STILL_SHA && fileSha(PORTRAIT_PATH) === PORTRAIT_SHA, 'Kzinti Flyer media bytes drifted');
ok(card.still?.origin === STILL_SOURCE && card.portrait?.origin === PORTRAIT_SOURCE && card.portrait?.license === 'Public domain', 'Kzinti Flyer media provenance drifted');

const source = read('data/SOURCES.json').find((row) => row.id === WALL);
same(source.still, card.still, 'Kzinti Flyer source still drifted');
same(source.portrait, card.portrait, 'Kzinti Flyer source portrait drifted');
const facets = read('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
ok(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'Kzinti Flyer media review is incomplete');
const portrait = facets.find((row) => row.side === 'portrait');
const still = facets.find((row) => row.side === 'still');
ok(still?.asset?.sha256 === STILL_SHA && still.claims?.identity?.value === 'expected' && still.claims?.presentation?.value === 'character-depiction', 'Kzinti Flyer still ruling drifted');
ok(portrait?.asset?.sha256 === PORTRAIT_SHA && portrait.claims?.identity?.value === 'expected' && portrait.claims?.presentation?.value === 'neutral-human', 'James Doohan portrait ruling drifted');

const claims = jsonl('data/journal/autopilot.jsonl').filter((row) => row.op === 'lease.claimed' && row.scope === 'star-trek');
const claim = claims.find((row) => row.lease_id === stage.lease.id && row.task_id === TASK);
ok(claim?.id === stage.lease.claim_event_id, 'Kzinti Flyer claim event drifted');
for (const row of claims) {
  const body = structuredClone(row);
  delete body.id;
  ok(row.id === `apj_${sha(JSON.stringify(body)).slice(0, 24)}`, 'Star Trek claim is not content-addressed');
}
const acceptance = jsonl('data/journal/candidates.jsonl').filter((row) => row.op === 'draft.accept' && row.specimen === WALL);
ok(acceptance.length === 1 && acceptance[0].id === stage.candidate.event_id, 'Kzinti Flyer candidate acceptance drifted');
const cycles = read('data/WATERLINE-STATE.json').cycles.filter((row) => row.scope_id === 'star-trek');
ok(!cycles.some((row) => row.lease_id === stage.lease.id), 'Kzinti Flyer candidate was receipted before independent review');
ok(waterlineStatus.cycles?.unreceipted?.length === 1 && waterlineStatus.cycles.unreceipted[0].lease_id === stage.lease.id, 'Kzinti Flyer is not the single open cycle');

const body = {
  version: 1,
  transaction: 'STAR-TREK-UNITKZINTI_FLYER-INDEPENDENT-REVIEW',
  reviewed_at: new Date().toISOString(),
  reviewed_by: 'chatgpt-independent-second-desk',
  canonical_parent: MAIN,
  candidate: {
    commit: meta.candidate_commit,
    tree: meta.candidate_tree,
    path_count: meta.candidate_path_count,
    path_ledger_sha256: meta.candidate_path_ledger_sha256,
    stage_receipt_sha256: stage.stage_sha256,
  },
  exact_subject: {
    task_id: TASK,
    wall_id: WALL,
    performer: PERFORMER,
    role: ROLE,
    source: SOURCE,
    source_fingerprint: FINGERPRINT,
    still_sha256: STILL_SHA,
    portrait_sha256: PORTRAIT_SHA,
    task_review_sha256: task.outcome.review_sha256,
  },
  findings: {
    candidate_is_one_parent_from_canonical_main: true,
    candidate_is_transport_free: true,
    exact_performer_role_source_receipt_present: true,
    card_is_voice_only: true,
    broad_queue_hint_is_not_promoted: true,
    role_identity_is_not_maker_identity: true,
    physical_performance_is_not_attributed: true,
    animation_and_maker_work_are_not_attributed: true,
    voice_credit_is_not_promoted_to_processing_credit: true,
    kukulkan_kol_tai_karl_four_domar_chuft_captain_cadmar_cheeron_ari_bn_bem_roles_are_not_conflated: true,
    exact_character_and_performer_media_are_separate: true,
    current_star_trek_media_debt_is_zero: true,
    exactly_one_unreceipted_cycle_exists: true,
    prior_lwaxana_eligibility_rejection_custody_passes: true,
    prior_lwaxana_eligibility_rejection_composable_route_passes: true,
  },
  verdict: 'pass',
  boundary: {
    maker_attribution_resolved: false,
    sound_processing_attribution_resolved: false,
    vocal_transformation_measured: false,
    outside_human_dependency: false,
    owner_physical_action_required: false,
  },
};
const review = { ...body, review_sha256: sha(pretty(body)) };
write(outPath, review);
console.log(JSON.stringify({ transaction: review.transaction, verdict: review.verdict, candidate_commit: review.candidate.commit, review_sha256: review.review_sha256 }, null, 2));
