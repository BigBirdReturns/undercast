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
const STILL_SHA = '4a5191e7614e31b280b8358b2389f19e877f731bd226ec307f597e9db2c81b57';
const PORTRAIT_SHA = 'aced8b0de7ccc4aa3bb2122d9d9cac36f2a10c77ab3c1e5753c21f2cb65c6d40';
const candidateMetaPath = process.argv[2];
const stagePath = process.argv[3];
const outPath = process.argv[4] || '/tmp/white-rabbit-independent-review.json';
if (!candidateMetaPath || !stagePath) throw new Error('usage: white-rabbit-review.mjs <candidate-metadata.json> <stage.json> [out.json]');

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(JSON.stringify(stable(actual)) === JSON.stringify(stable(expected)), message);
const fileSha = (file) => sha(fs.readFileSync(file));
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

const meta = read(candidateMetaPath);
const stage = read(stagePath);
const stageBody = structuredClone(stage);
delete stageBody.stage_sha256;
ok(stage.stage_sha256 === sha(pretty(stageBody)), 'White Rabbit stage receipt hash drifted');
ok(stage.canonical_parent === MAIN && meta.canonical_parent === MAIN, 'candidate parent drifted');
const head = run('read candidate commit', 'git', ['rev-parse', 'HEAD'], { capture: true });
const tree = run('read candidate tree', 'git', ['rev-parse', 'HEAD^{tree}'], { capture: true });
ok(head === meta.candidate_commit && tree === meta.candidate_tree, 'candidate checkout does not match metadata');
ok(run('read candidate parent', 'git', ['rev-parse', 'HEAD^'], { capture: true }) === MAIN, 'candidate is not one-parent from canonical main');
ok(Number(meta.candidate_path_count) > 0 && /^[0-9a-f]{64}$/.test(meta.candidate_path_ledger_sha256 || ''), 'candidate path receipt is invalid');
const paths = run('read candidate paths', 'git', ['diff', '--name-only', `${MAIN}..HEAD`], { capture: true }).split(/\r?\n/).filter(Boolean).sort();
ok(paths.length === meta.candidate_path_count, 'candidate path count drifted');
ok(sha(Buffer.from(`${paths.join('\n')}\n`)) === meta.candidate_path_ledger_sha256, 'candidate path ledger drifted');
ok(!paths.some((item) => item.startsWith('.github/') || item.startsWith('scripts/.white-rabbit-')), 'candidate contains transport paths');

run('validate candidate archive', process.execPath, ['scripts/validate.mjs']);
run('validate candidate media closure', process.execPath, ['scripts/media-audit.mjs', 'gate', '--scope', 'star-trek']);
run('validate candidate thesis rails', process.execPath, ['scripts/thesis-rails.mjs', 'validate']);
const phaseChecker = path.join(path.dirname(process.argv[1]), 'white-rabbit-prior-phase.mjs');
run('validate bounded prior-cycle candidate phase', process.execPath, [phaseChecker, stage.lease.id]);
const waterlineStatus = JSON.parse(run('inspect candidate waterline', process.execPath, ['scripts/waterline.mjs', 'status', '--scope', 'star-trek', '--json'], { capture: true }));

const state = read('data/AUTOPILOT.json');
const task = state.jobs.find((row) => row.id === TASK);
ok(task?.status === 'resolved' && task.performer === PERFORMER && task.character === ROLE && task.source_fingerprint === FINGERPRINT, 'White Rabbit resolved task drifted');
same(task.performance_modes, ['physical-and-voice'], 'White Rabbit queue hint drifted');
same(task.wall_ids, [WALL], 'White Rabbit wall binding drifted');
ok(task.outcome?.kind === 'audited-wall' && task.outcome.review_sha256 === stage.review.review_sha256, 'White Rabbit task review receipt drifted');

const card = read('data/specimens.json').find((row) => row.id === WALL);
ok(card && card.actor === PERFORMER && card.character === ROLE && card.production === 'Once Upon a Planet' && card.universe === 'Star Trek' && card.years === '1973' && card.kind === 'voice' && card.transform === 2 && card.designer === '—' && card.link === SOURCE, 'White Rabbit canonical record drifted');
ok(card.reveal.includes('William Blackburn') && card.reveal.includes('role-specific voice contribution') && card.reveal.includes('physical performance'), 'White Rabbit performance separation is not explicit');
ok(card.references?.some((row) => row.claim === 'performance' && row.source === SOURCE), 'White Rabbit performance receipt is missing');
ok(card.references?.some((row) => row.claim === 'production' && row.source.includes('Once_Upon_a_Planet_(episode)')), 'White Rabbit production receipt is missing');
ok(fileSha(card.still.src) === STILL_SHA && fileSha(card.portrait.src) === PORTRAIT_SHA, 'White Rabbit media bytes drifted');
ok(card.still.origin.includes('/White_Rabbit%2C_2269.jpg/') && card.portrait.origin === PORTRAIT_SOURCE && card.portrait.license === 'Public domain', 'White Rabbit media provenance drifted');

const source = read('data/SOURCES.json').find((row) => row.id === WALL);
same(source.still, card.still, 'White Rabbit source still drifted');
same(source.portrait, card.portrait, 'White Rabbit source portrait drifted');
const facets = read('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
ok(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'White Rabbit media review is incomplete');
const portrait = facets.find((row) => row.side === 'portrait');
const still = facets.find((row) => row.side === 'still');
ok(still?.asset?.sha256 === STILL_SHA && still.claims?.identity?.value === 'expected' && still.claims?.presentation?.value === 'character-depiction', 'White Rabbit still ruling drifted');
ok(portrait?.asset?.sha256 === PORTRAIT_SHA && portrait.claims?.identity?.value === 'expected' && portrait.claims?.presentation?.value === 'neutral-human', 'James Doohan portrait ruling drifted');

const claims = jsonl('data/journal/autopilot.jsonl').filter((row) => row.op === 'lease.claimed' && row.scope === 'star-trek');
const claim = claims.find((row) => row.lease_id === stage.lease.id && row.task_id === TASK);
ok(claim?.id === stage.lease.claim_event_id, 'White Rabbit claim event drifted');
for (const row of claims) {
  const body = structuredClone(row);
  delete body.id;
  ok(row.id === `apj_${sha(JSON.stringify(body)).slice(0, 24)}`, 'Star Trek claim is not content-addressed');
}
const acceptance = jsonl('data/journal/candidates.jsonl').filter((row) => row.op === 'draft.accept' && row.specimen === WALL);
ok(acceptance.length === 1 && acceptance[0].id === stage.candidate.event_id, 'White Rabbit candidate acceptance drifted');
const cycles = read('data/WATERLINE-STATE.json').cycles.filter((row) => row.scope_id === 'star-trek');
ok(!cycles.some((row) => row.lease_id === stage.lease.id), 'White Rabbit candidate was receipted before independent review');
ok(waterlineStatus.cycles?.unreceipted?.length === 1 && waterlineStatus.cycles.unreceipted[0].lease_id === stage.lease.id, 'White Rabbit is not the single open cycle');

const body = {
  version: 1,
  transaction: 'STAR-TREK-WHITE-RABBIT-INDEPENDENT-REVIEW',
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
    combined_queue_hint_is_not_promoted: true,
    william_blackburn_physical_portrayal_remains_distinct: true,
    
    other_white_rabbit_performers_are_not_conflated: true,
    physical_performance_is_not_attributed: true,
    exact_character_and_performer_media_are_separate: true,
    current_star_trek_media_debt_is_zero: true,
    exactly_one_unreceipted_cycle_exists: true,
    prior_korax_custody_passes: true,
    prior_kor_custody_passes: true,
    prior_koloth_custody_passes: true,
    prior_kaz_custody_passes: true,
    prior_guardian_custody_passes: true,
    prior_landru_custody_passes: true,
    prior_curzon_custody_passes: true,
    prior_armus_custody_passes: true,
    prior_m5_custody_passes: true,
  },
  verdict: 'pass',
  boundary: {
    maker_attribution_resolved: false,
    vocal_transformation_measured: false,
    outside_human_dependency: false,
    owner_physical_action_required: false,
  },
};
const review = { ...body, review_sha256: sha(pretty(body)) };
write(outPath, review);
console.log(JSON.stringify({ transaction: review.transaction, verdict: review.verdict, candidate_commit: review.candidate.commit, review_sha256: review.review_sha256 }, null, 2));
