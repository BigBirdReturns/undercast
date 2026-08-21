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

const PRIOR_LWAXANA_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/receipt.json';
const PRIOR_LWAXANA_RECEIPT_FILE_SHA = 'b7e3be2cb3639f04e3decd11d5ef3ca0d516bbf992305222e84d37332daf65fe';
const PRIOR_LWAXANA_RECEIPT_ID = '172f506624b13c6bdeb97bd8f1d5982afa15883e17a5a74b24dfe4495de5f0b2';
const PRIOR_LWAXANA_CHECKER_PATH = 'scripts/star-trek-lwaxana-eligibility-rejection.mjs';
const PRIOR_LWAXANA_CHECKER_SHA = 'b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947';
const PRIOR_LWAXANA_CYCLE_ID = 'cycle_9319b21140ea9f3a85272c7f';

const RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-kzinti-flyer-cycle.json';
const CHECKER_PATH = 'scripts/star-trek-kzinti-flyer-cycle.mjs';
const LWAXANA_COMPOSABLE_CHECKER_PATH = "scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs";

const candidateMetaPath = process.argv[2];
const stagePath = process.argv[3];
const reviewPath = process.argv[4];
const executionPath = process.argv[5];
const outPath = process.argv[6] || '/tmp/unitkzintiflyer-finalize.json';
if (!candidateMetaPath || !stagePath || !reviewPath || !executionPath) {
  throw new Error('usage: unitkzintiflyer-finalize.mjs <candidate-meta> <stage> <review> <execution> [out]');
}

const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const pretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const jsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const write = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(stableJson(actual) === stableJson(expected), message);
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
function objectHash(object, field) {
  const body = structuredClone(object);
  delete body[field];
  return sha(pretty(body));
}

const meta = read(candidateMetaPath);
const stage = read(stagePath);
const review = read(reviewPath);
const executionInput = read(executionPath);
ok(stage.stage_sha256 === objectHash(stage, 'stage_sha256'), 'Kzinti Flyer stage receipt hash drifted');
ok(review.review_sha256 === objectHash(review, 'review_sha256') && review.verdict === 'pass', 'Kzinti Flyer independent review is invalid');
ok(meta.canonical_parent === MAIN && stage.canonical_parent === MAIN && review.canonical_parent === MAIN, 'Kzinti Flyer parent binding drifted');
ok(meta.candidate_commit === review.candidate.commit && meta.candidate_tree === review.candidate.tree, 'candidate and review bindings disagree');
ok(review.candidate.stage_receipt_sha256 === stage.stage_sha256, 'review lost stage custody');
ok(review.findings?.prior_lwaxana_eligibility_rejection_composable_route_passes === true, 'review lost Lwaxana successor-composability finding');
ok(stage.predecessor_compatibility?.immutable_product_commit === MAIN
  && stage.predecessor_compatibility?.composable_checker_path === LWAXANA_COMPOSABLE_CHECKER_PATH
  && stage.predecessor_compatibility?.composable_checker_sha256 === fileSha(LWAXANA_COMPOSABLE_CHECKER_PATH),
'Lwaxana successor-composability candidate custody drifted');
ok(run('read candidate commit', 'git', ['rev-parse', 'HEAD'], { capture: true }) === meta.candidate_commit, 'finalizer is not on reviewed candidate');
ok(run('read candidate tree', 'git', ['rev-parse', 'HEAD^{tree}'], { capture: true }) === meta.candidate_tree, 'reviewed candidate tree drifted');
ok(run('read candidate parent', 'git', ['rev-parse', 'HEAD^'], { capture: true }) === MAIN, 'reviewed candidate parent drifted');

const stateBeforeCycle = read('data/AUTOPILOT.json');
const taskBeforeCycle = stateBeforeCycle.jobs.find((row) => row.id === TASK);
ok(taskBeforeCycle?.status === 'resolved' && taskBeforeCycle.outcome?.review_sha256 === stage.review.review_sha256, 'Kzinti Flyer candidate is not resolved under the reviewed media receipt');
same(counts(stateBeforeCycle.jobs), {
  total: 2228,
  queued: 1803,
  resolved: 423,
  blocked: 0,
  rejected: 2,
  in_flight: 0,
}, 'Kzinti Flyer candidate queue drifted');
const preCycles = read('data/WATERLINE-STATE.json').cycles.filter((row) => row.scope_id === 'star-trek');
ok(!preCycles.some((row) => row.lease_id === stage.lease.id), 'Kzinti Flyer lease was already receipted');
const phaseChecker = path.join(path.dirname(process.argv[1]), 'unitkzintiflyer-prior-phase.mjs');
run('validate bounded prior-cycle candidate phase before receipt', process.execPath, [phaseChecker, stage.lease.id]);

const reviewedAt = new Date().toISOString();
const cycleInputPath = `${process.env.RUNNER_TEMP || '/tmp'}/unitkzintiflyer-cycle-input-${process.pid}.json`;
write(cycleInputPath, {
  scope_id: 'star-trek',
  lease_id: stage.lease.id,
  outcome: 'completed',
  note: "The rail-selected Kzinti Flyer obligation resolved as James Doohan’s documented voice performance in The Slaver Weapon (1973). The exact role-specific still and a separately sourced public-domain performer portrait are verified independently. The broad voice-animation hint is adjudicated as voice-only. Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separate James Doohan roles. Animation, physical performance, design, direction, editing, sound processing, production-shop, vocal-transformation, and other maker attribution remain unresolved.",
  evidence: [
    {
      type: 'workflow-run',
      value: `GitHub Actions Kzinti Flyer publication run ${executionInput.workflow_run}; candidate job ${executionInput.candidate_job}; independent review job ${executionInput.independent_review_job}; publication job ${executionInput.publication_job}`,
    },
    {
      type: 'commit',
      value: `${meta.candidate_commit} exact one-parent candidate tree ${meta.candidate_tree}; path ledger ${meta.candidate_path_ledger_sha256}`,
    },
    {
      type: 'restart-proof',
      value: `Candidate artifact ${executionInput.candidate_artifact} sha256 ${executionInput.candidate_artifact_sha256}; independent review artifact ${executionInput.independent_review_artifact} sha256 ${executionInput.independent_review_artifact_sha256}; media preparation artifact ${executionInput.media_preparation_artifact} sha256 ${executionInput.media_preparation_artifact_sha256}`,
    },
  ],
  reviewed_by: 'chatgpt-second-desk',
  reviewed_role: 'second-desk',
  reviewed_at: reviewedAt,
});
run('record Kzinti Flyer waterline cycle', process.execPath, ['scripts/waterline.mjs', 'record-cycle', '--input', cycleInputPath]);

const water = read('data/WATERLINE-STATE.json');
const cycles = water.cycles.filter((row) => row.scope_id === 'star-trek');
const cycle = cycles.find((row) => row.lease_id === stage.lease.id);
ok(cycle?.outcome === 'completed' && cycle.task_statuses?.[TASK] === 'resolved' && cycle.reviewed_at === reviewedAt, 'Kzinti Flyer cycle receipt drifted');
const event = jsonl('data/journal/waterline.jsonl').find((row) => row.lease_id === stage.lease.id && row.receipt_id === cycle.id);
ok(event, 'Kzinti Flyer waterline event is missing');

const registryPath = 'data/ESTATE-REGISTRY.json';
const registry = read(registryPath);
const estate = registry.estates.find((row) => row.id === 'star-trek');
ok(estate, 'Star Trek estate is missing');
estate.next_gate = `Star Trek reviewed Kzinti Flyer cycle ${cycle.id} resolved James Doohan as Kzinti Flyer’s voice performer in The Slaver Weapon (1973) within the preserved 2,228-task denominator; 1,803 tasks remain queued. The exact Kzinti Flyer still and a separately sourced public-domain Doohan portrait are verified, the broad voice-animation hint is adjudicated as voice-only, Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separate James Doohan roles, and physical performance, animation, design, direction, editing, sound processing, production-shop, vocal-transformation, and other maker attribution remain unresolved. Any later cycle must begin from the repository-native thesis rail, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
write(registryPath, registry);
run('refresh adapter baseline registry binding', process.execPath, ['scripts/census-adapter.mjs', 'write']);

const priorAriReceipt = read(PRIOR_LWAXANA_RECEIPT_PATH);
const priorAriBody = structuredClone(priorAriReceipt);
delete priorAriBody.receipt_sha256;
ok(fileSha(PRIOR_LWAXANA_RECEIPT_PATH) === PRIOR_LWAXANA_RECEIPT_FILE_SHA
  && priorAriReceipt.receipt_sha256 === PRIOR_LWAXANA_RECEIPT_ID
  && priorAriReceipt.receipt_sha256 === sha(pretty(priorAriBody))
  && priorAriReceipt.waterline?.cycle_id === PRIOR_LWAXANA_CYCLE_ID,
'prior Lwaxana eligibility-rejection receipt custody drifted');
ok(fileSha(PRIOR_LWAXANA_CHECKER_PATH) === PRIOR_LWAXANA_CHECKER_SHA, 'prior Lwaxana eligibility-rejection checker custody drifted');
ok(priorAriReceipt.adjudication?.classification === 'ineligible / no card'
  && priorAriReceipt.adjudication?.card_created === false
  && priorAriReceipt.boundary?.character_card_created === false
  && priorAriReceipt.next_deterministic_obligation?.candidate?.task_id === TASK
  && priorAriReceipt.next_deterministic_obligation?.candidate?.source_fingerprint === FINGERPRINT,
'prior Lwaxana eligibility-rejection semantic custody drifted');

const packagePath = 'package.json';
const packageJson = read(packagePath);
packageJson.scripts['star-trek:lwaxana-eligibility-rejection:check'] = `node ${LWAXANA_COMPOSABLE_CHECKER_PATH}`;
packageJson.scripts['star-trek:kzinti-flyer-cycle:check'] = 'node scripts/star-trek-kzinti-flyer-cycle.mjs';
if (!packageJson.scripts['autopilot:fixtures'].includes('npm run star-trek:kzinti-flyer-cycle:check')) {
  packageJson.scripts['autopilot:fixtures'] += ' && npm run star-trek:kzinti-flyer-cycle:check';
}
write(packagePath, packageJson);

const state = read('data/AUTOPILOT.json');
const task = state.jobs.find((row) => row.id === TASK);
const card = read('data/specimens.json').find((row) => row.id === WALL);
const sourceRow = read('data/SOURCES.json').find((row) => row.id === WALL);
const facets = read('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
const claims = jsonl('data/journal/autopilot.jsonl').filter((row) => row.op === 'lease.claimed' && row.scope === 'star-trek');
const claim = claims.find((row) => row.lease_id === stage.lease.id && row.task_id === TASK);
const acceptance = jsonl('data/journal/candidates.jsonl').find((row) => row.op === 'draft.accept' && row.specimen === WALL);
const queueAfter = counts(state.jobs);
same(queueAfter, {
  total: 2228,
  queued: 1803,
  resolved: 423,
  blocked: 0,
  rejected: 2,
  in_flight: 0,
}, 'Kzinti Flyer terminal queue drifted');
ok(task && card && sourceRow && facets.length === 2 && claim && acceptance, 'Kzinti Flyer final canonical inputs are incomplete');

const execution = {
  publication_run: executionInput.workflow_run,
  publication_job: executionInput.publication_job,
  candidate_job: executionInput.candidate_job,
  candidate_artifact: executionInput.candidate_artifact,
  candidate_artifact_sha256: executionInput.candidate_artifact_sha256,
  candidate_commit: meta.candidate_commit,
  candidate_tree: meta.candidate_tree,
  candidate_path_count: meta.candidate_path_count,
  candidate_path_ledger_sha256: meta.candidate_path_ledger_sha256,
  candidate_metadata_sha256: fileSha(candidateMetaPath),
  stage_receipt_sha256: stage.stage_sha256,
  independent_review_job: executionInput.independent_review_job,
  independent_review_artifact: executionInput.independent_review_artifact,
  independent_review_artifact_sha256: executionInput.independent_review_artifact_sha256,
  independent_review_file_sha256: fileSha(reviewPath),
  independent_review_identity: review.review_sha256,
  media_preparation_run: executionInput.media_preparation_run,
  media_preparation_job: executionInput.media_preparation_job,
  media_preparation_artifact: executionInput.media_preparation_artifact,
  media_preparation_artifact_sha256: executionInput.media_preparation_artifact_sha256,
};
execution.qualification_identity = sha(stableJson(execution));

const priorCustody = {
  prior_lwaxana_rejection_receipt_path: PRIOR_LWAXANA_RECEIPT_PATH,
  prior_lwaxana_rejection_receipt_file_sha256: PRIOR_LWAXANA_RECEIPT_FILE_SHA,
  prior_lwaxana_rejection_receipt_identity: PRIOR_LWAXANA_RECEIPT_ID,
  prior_lwaxana_rejection_checker_path: PRIOR_LWAXANA_CHECKER_PATH,
  prior_lwaxana_rejection_checker_sha256: PRIOR_LWAXANA_CHECKER_SHA,
  prior_lwaxana_rejection_composable_checker_path: LWAXANA_COMPOSABLE_CHECKER_PATH,
  prior_lwaxana_rejection_composable_checker_sha256: fileSha(LWAXANA_COMPOSABLE_CHECKER_PATH),
  prior_lwaxana_rejection_product_commit: MAIN,
  prior_lwaxana_rejection_cycle_id: PRIOR_LWAXANA_CYCLE_ID,
};

const checkerSource = `#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const RECEIPT=${JSON.stringify(RECEIPT_PATH)}, CHECKER=${JSON.stringify(CHECKER_PATH)};
const TASK=${JSON.stringify(TASK)}, LEASE=${JSON.stringify(stage.lease.id)}, WALL=${JSON.stringify(WALL)}, CYCLE=${JSON.stringify(cycle.id)}, EVENT=${JSON.stringify(event.id)}, REVIEW=${JSON.stringify(reviewedAt)};
const PERFORMER=${JSON.stringify(PERFORMER)}, ROLE=${JSON.stringify(ROLE)}, SOURCE=${JSON.stringify(SOURCE)}, FIRST_EPISODE_SOURCE=${JSON.stringify(FIRST_EPISODE_SOURCE)}, LAST_EPISODE_SOURCE=${JSON.stringify(LAST_EPISODE_SOURCE)}, FINGERPRINT=${JSON.stringify(FINGERPRINT)};
const MAIN=${JSON.stringify(MAIN)}, CANDIDATE=${JSON.stringify(meta.candidate_commit)}, TREE=${JSON.stringify(meta.candidate_tree)}, PATH_SHA=${JSON.stringify(meta.candidate_path_ledger_sha256)}, REVIEW_ID=${JSON.stringify(review.review_sha256)}, REVIEW_FILE=${JSON.stringify(fileSha(reviewPath))}, PUBLICATION_RUN=${Number(executionInput.workflow_run)}, PUBLICATION_JOB=${Number(executionInput.publication_job)};
const STILL_PATH=${JSON.stringify(STILL_PATH)}, STILL_SHA=${JSON.stringify(STILL_SHA)}, STILL_ORIGIN=${JSON.stringify(STILL_SOURCE)}, PORTRAIT_PATH=${JSON.stringify(PORTRAIT_PATH)}, PORTRAIT_SHA=${JSON.stringify(PORTRAIT_SHA)}, PORTRAIT_ORIGIN=${JSON.stringify(PORTRAIT_SOURCE)};
const PRIOR_LWAXANA_RECEIPT=${JSON.stringify(PRIOR_LWAXANA_RECEIPT_PATH)}, PRIOR_LWAXANA_RECEIPT_FILE=${JSON.stringify(PRIOR_LWAXANA_RECEIPT_FILE_SHA)}, PRIOR_LWAXANA_RECEIPT_ID=${JSON.stringify(PRIOR_LWAXANA_RECEIPT_ID)}, PRIOR_LWAXANA_CHECKER=${JSON.stringify(PRIOR_LWAXANA_CHECKER_PATH)}, PRIOR_LWAXANA_CHECKER_SHA=${JSON.stringify(PRIOR_LWAXANA_CHECKER_SHA)}, PRIOR_LWAXANA_COMPOSABLE=${JSON.stringify(LWAXANA_COMPOSABLE_CHECKER_PATH)}, PRIOR_LWAXANA_CYCLE=${JSON.stringify(PRIOR_LWAXANA_CYCLE_ID)};
const TOTAL=2228, RESOLVED_FLOOR=423;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+'\\n';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')), jsonl=f=>fs.readFileSync(f,'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse);
const ok=(x,m)=>{if(!x)throw Error(m)}, same=(a,b,m)=>ok(sj(a)===sj(b),m);
const receipt=read(RECEIPT), rb=structuredClone(receipt);delete rb.receipt_sha256;
ok(receipt.receipt_sha256===sha(pretty(rb))&&receipt.transaction==='STAR-TREK-CYCLE-KZINTI_FLYER'&&receipt.canonical_parent===MAIN,'Kzinti Flyer receipt identity drifted');
ok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(CHECKER)),'Kzinti Flyer checker hash drifted');
const state=read('data/AUTOPILOT.json'), trek=state.jobs.filter(x=>x.scope==='star-trek'), task=trek.find(x=>x.id===TASK);
ok(trek.length===TOTAL&&task?.status==='resolved'&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,'Kzinti Flyer task drifted');
same(task.performance_modes,['voice-animation'],'Kzinti Flyer queued mode hint drifted');
same(task.wall_ids,[WALL],'Kzinti Flyer wall binding drifted');
ok(task.outcome?.review_sha256===receipt.canonical.outcome_review_sha256,'Kzinti Flyer task review binding drifted');
const card=read('data/specimens.json').find(x=>x.id===WALL);
ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production==="Star Trek: The Animated Series (The Slaver Weapon)"&&card.universe==='Star Trek'&&card.years==='1973'&&card.kind==='voice'&&card.transform===2&&card.designer==='—'&&card.link===SOURCE,'Kzinti Flyer canonical record drifted');
ok(card.reveal==="The frozen Kzinti Flyer source identifies James Doohan as the role’s performer and places the role in The Slaver Weapon, supporting a voice-only claim bounded to the 1973 episode. The exact role still is retained only as character evidence, while a separately sourced public-domain portrait supports Doohan’s identity. Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem remain separately bounded James Doohan roles. No physical performance, animation, character design, voice direction, editing, sound processing, production-shop labor, vocal transformation, or other maker credit is inferred.",'Kzinti Flyer performance boundary drifted');
ok(card.references?.some(x=>x.claim==='performance'&&x.source===SOURCE)&&card.references?.some(x=>x.claim==='production'&&x.source===FIRST_EPISODE_SOURCE)&&card.references?.some(x=>x.claim==='production'&&x.source===LAST_EPISODE_SOURCE),'Kzinti Flyer source custody drifted');
ok(sha(fs.readFileSync(STILL_PATH))===STILL_SHA&&sha(fs.readFileSync(PORTRAIT_PATH))===PORTRAIT_SHA,'Kzinti Flyer media bytes drifted');
ok(card.still?.origin===STILL_ORIGIN&&card.portrait?.origin===PORTRAIT_ORIGIN&&card.portrait?.license==='Public domain','Kzinti Flyer media provenance drifted');
const source=read('data/SOURCES.json').find(x=>x.id===WALL);
same(source.still,card.still,'Kzinti Flyer source still drifted');
same(source.portrait,card.portrait,'Kzinti Flyer source portrait drifted');
const facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===WALL).sort((a,b)=>a.side.localeCompare(b.side));
ok(facets.length===2&&facets.every(x=>x.status==='verified'),'Kzinti Flyer facets drifted');
const portrait=facets.find(x=>x.side==='portrait'), still=facets.find(x=>x.side==='still');
ok(still?.asset?.sha256===STILL_SHA&&still.claims?.identity?.value==='expected'&&still.claims?.presentation?.value==='character-depiction','Kzinti Flyer still review drifted');
ok(portrait?.asset?.sha256===PORTRAIT_SHA&&portrait.claims?.identity?.value==='expected'&&portrait.claims?.presentation?.value==='neutral-human','Kzinti Flyer portrait review drifted');
ok(receipt.task?.adjudicated_kind==='voice'&&receipt.task?.performance_mode==='voice-only'&&receipt.task?.queued_mode_hint?.[0]==='voice-animation'&&receipt.task?.species==='Kzinti'&&receipt.task?.episode==="The Slaver Weapon"&&receipt.task?.performance_scope==="James Doohan’s voice performance as Kzinti Flyer in The Slaver Weapon (1973)"&&receipt.task?.kukulkan_role_not_conflated===true&&receipt.task?.kol_tai_role_not_conflated===true&&receipt.task?.karl_four_role_not_conflated===true&&receipt.task?.domar_role_not_conflated===true&&receipt.task?.chuft_captain_role_not_conflated===true&&receipt.task?.role_still_is_character_evidence_only===true&&receipt.task?.maker_attribution==='unresolved'&&receipt.task?.vocal_transformation_measured===false,'Kzinti Flyer adjudication drifted');
ok(receipt.canonical.record_sha256===sha(pretty(card))&&receipt.media.facets_sha256===sha(pretty(facets))&&receipt.media.source_ledger_sha256===sha(pretty(source)),'Kzinti Flyer receipt projections drifted');
const claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek');
for(const row of claims){const b=structuredClone(row);delete b.id;ok(row.id==='apj_'+sha(JSON.stringify(b)).slice(0,24),'Star Trek claim is not content-addressed')}
const claim=claims.find(x=>x.lease_id===LEASE&&x.task_id===TASK);
ok(claim?.id===receipt.lease.claim_event_id,'Kzinti Flyer claim drifted');
const acceptance=jsonl('data/journal/candidates.jsonl').filter(x=>x.op==='draft.accept'&&x.specimen===WALL);
ok(acceptance.length===1&&acceptance[0].id===receipt.candidate.event_id,'Kzinti Flyer candidate event drifted');
const water=read('data/WATERLINE-STATE.json'), receipts=water.cycles.filter(x=>x.scope_id==='star-trek'), byLease=new Map();
for(const row of receipts){ok(!byLease.has(row.lease_id),'duplicate Star Trek cycle receipt');byLease.set(row.lease_id,row)}
const unitkzintiflyer=byLease.get(LEASE);
ok(unitkzintiflyer?.id===CYCLE&&unitkzintiflyer.outcome==='completed'&&unitkzintiflyer.task_statuses?.[TASK]==='resolved'&&unitkzintiflyer.reviewed_at===REVIEW,'Kzinti Flyer cycle receipt drifted');
const cb=structuredClone(unitkzintiflyer);delete cb.id;
ok(CYCLE==='cycle_'+sha(sj(cb)).slice(0,24),'Kzinti Flyer cycle is not content-addressed');
const events=jsonl('data/journal/waterline.jsonl').filter(x=>x.id===EVENT&&x.lease_id===LEASE&&x.receipt_id===CYCLE);
ok(events.length===1,'Kzinti Flyer waterline event drifted');
const eb=structuredClone(events[0]);delete eb.id;
ok(EVENT==='waterline_'+sha(JSON.stringify(eb)).slice(0,24),'Kzinti Flyer waterline event is not content-addressed');
const later=claims.filter(x=>Date.parse(x.at)>Date.parse(REVIEW)), unreceipted=later.filter(x=>!byLease.has(x.lease_id));
ok(unreceipted.length<=1,'more than one later Star Trek cycle is unreceipted');
ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later Star Trek task is active');
for(const row of later.filter(x=>byLease.has(x.lease_id))){const c=byLease.get(row.lease_id),j=trek.find(x=>x.id===row.task_id);ok(c.task_ids?.length===1&&c.task_ids[0]===row.task_id&&j?.status==='resolved','later receipted Star Trek cycle drifted')}
const resolved=trek.filter(x=>x.status==='resolved').length, queued=trek.filter(x=>x.status==='queued').length;
ok(resolved>=RESOLVED_FLOOR,'Star Trek resolved floor regressed');
if(later.length===0)same({total:trek.length,queued,resolved,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length},{total:2228,queued:1803,resolved:423,blocked:0,rejected:2,in_flight:0},'Kzinti Flyer terminal queue drifted');
const latest=receipts.at(-1), registry=read('data/ESTATE-REGISTRY.json'), estate=registry.estates.find(x=>x.id==='star-trek'), registryQueued=queued+unreceipted.length;
ok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(registryQueued.toLocaleString('en-US')+' tasks remain queued'),'Star Trek registry phase gate drifted');
const baseline=read('data/review/adapter-sdk/BASELINE.json');
ok(baseline.inputs?.estate_registry?.sha256===sha(fs.readFileSync('data/ESTATE-REGISTRY.json')),'adapter baseline registry binding drifted');
const prior=read(PRIOR_LWAXANA_RECEIPT), priorBody=structuredClone(prior);delete priorBody.receipt_sha256;
ok(sha(fs.readFileSync(PRIOR_LWAXANA_RECEIPT))===PRIOR_LWAXANA_RECEIPT_FILE&&prior.receipt_sha256===PRIOR_LWAXANA_RECEIPT_ID&&prior.receipt_sha256===sha(pretty(priorBody))&&prior.waterline?.cycle_id===PRIOR_LWAXANA_CYCLE&&sha(fs.readFileSync(PRIOR_LWAXANA_CHECKER))===PRIOR_LWAXANA_CHECKER_SHA,'Kzinti Flyer lost prior Lwaxana eligibility-rejection custody');
ok(prior.adjudication?.classification==='ineligible / no card'&&prior.adjudication?.card_created===false&&prior.boundary?.character_card_created===false&&prior.next_deterministic_obligation?.candidate?.task_id===TASK&&prior.next_deterministic_obligation?.candidate?.source_fingerprint===FINGERPRINT,'Kzinti Flyer lost prior Lwaxana eligibility-rejection semantic custody');
ok(receipt.prior_custody?.prior_lwaxana_rejection_composable_checker_path===PRIOR_LWAXANA_COMPOSABLE&&receipt.prior_custody?.prior_lwaxana_rejection_composable_checker_sha256===sha(fs.readFileSync(PRIOR_LWAXANA_COMPOSABLE))&&receipt.prior_custody?.prior_lwaxana_rejection_product_commit===MAIN,'Kzinti Flyer lost Lwaxana successor-composability custody');
const execution=structuredClone(receipt.execution), qualificationIdentity=execution.qualification_identity;delete execution.qualification_identity;
ok(qualificationIdentity===sha(sj(execution)),'Kzinti Flyer qualification identity drifted');
ok(receipt.execution?.publication_run===PUBLICATION_RUN&&receipt.execution?.publication_job===PUBLICATION_JOB&&receipt.execution?.candidate_commit===CANDIDATE&&receipt.execution?.candidate_tree===TREE&&receipt.execution?.candidate_path_ledger_sha256===PATH_SHA&&receipt.execution?.independent_review_identity===REVIEW_ID&&receipt.execution?.independent_review_file_sha256===REVIEW_FILE,'Kzinti Flyer execution custody drifted');
ok(read('package.json').scripts?.['star-trek:lwaxana-eligibility-rejection:check']==='node '+PRIOR_LWAXANA_COMPOSABLE,'Lwaxana composable checker route drifted');
ok(read('package.json').scripts?.['star-trek:kzinti-flyer-cycle:check']==='node scripts/star-trek-kzinti-flyer-cycle.mjs','Kzinti Flyer checker route drifted');
ok(receipt.boundary?.queued_mode_hint_promoted===false&&receipt.boundary?.role_or_maker_conflated===false&&receipt.boundary?.physical_performance_attributed===false&&receipt.boundary?.animation_or_maker_attributed===false&&receipt.boundary?.voice_credit_promoted_to_processing_credit===false&&receipt.boundary?.separate_role_conflated===false&&receipt.boundary?.vocal_transformation_measured===false&&receipt.boundary?.cross_facet_substitution===false&&receipt.boundary?.outside_human_dependency===false&&receipt.boundary?.owner_physical_action_required===false&&receipt.boundary?.additional_lease_issued===false,'Kzinti Flyer authority boundary drifted');
ok(fs.readFileSync('sitemap.xml','utf8').includes('records/UC-1391/'),'Kzinti Flyer permanent route missing');
console.log('star-trek-kzinti-flyer-cycle: PASS — exact Kzinti Flyer voice custody, exact independent character and performer media, no physical, animation, processing, or maker promotion, separate Kukulkan, Kol-Tai, Karl Four, Domar, Chuft-Captain, Cadmar, Cheeron, and Ari bn Bem custody, reviewed waterline closure, immutable Lwaxana eligibility-rejection predecessor custody, and later-cycle bounds are intact');
`;
fs.writeFileSync(CHECKER_PATH, checkerSource);
const checkerSha = fileSha(CHECKER_PATH);

const receiptBody = {
  version: 1,
  transaction: 'STAR-TREK-CYCLE-KZINTI_FLYER',
  generated_at: reviewedAt,
  canonical_parent: MAIN,
  task: {
    id: TASK,
    performer: PERFORMER,
    role: ROLE,
    production: "Star Trek: The Animated Series (The Slaver Weapon)",
    years: '1973',
    source: SOURCE,
    source_fingerprint: FINGERPRINT,
    source_receipts: task.source_receipts,
    queued_mode_hint: task.performance_modes,
    adjudicated_kind: 'voice',
    performance_mode: 'voice-only',
    species: 'Kzinti',
    occupation: 'flyer crew member',
    episode: "The Slaver Weapon",
    kukulkan_role_not_conflated: true,
    kol_tai_role_not_conflated: true,
    karl_four_role_not_conflated: true,
    domar_role_not_conflated: true,
    chuft_captain_role_not_conflated: true,
    role_still_is_character_evidence_only: true,
    performance_scope: "James Doohan’s voice performance as Kzinti Flyer in The Slaver Weapon (1973)",
    source_wording: "The frozen role source identifies James Doohan as Kzinti Flyer’s voice performer and places the role in The Slaver Weapon.",
    voice_credit_is_performance_not_processing_credit: true,
    physical_performance: 'not attributed to James Doohan',
    maker_attribution: 'unresolved',
    animation_maker_attribution: 'unresolved',
    character_design_maker_attribution: 'unresolved',
    voice_direction_attribution: 'unresolved',
    editing_attribution: 'unresolved',
    sound_processing_attribution: 'unresolved',
    production_shop_attribution: 'unresolved',
    vocal_transformation_measured: false,
  },
  lease: {
    id: stage.lease.id,
    claim_event_id: claim.id,
    claimed_at: stage.lease.claimed_at,
    readiness_token: stage.lease.readiness_token,
    selection_basis: stage.lease.selection_basis,
    selection_strategy: stage.lease.selection_strategy,
  },
  candidate: { event_id: acceptance.id, accepted_at: acceptance.ts || acceptance.at },
  execution,
  canonical: {
    wall_id: WALL,
    record: card,
    outcome_review_sha256: task.outcome.review_sha256,
    record_sha256: sha(pretty(card)),
  },
  media: {
    still: 'verified',
    still_path: STILL_PATH,
    still_origin: STILL_SOURCE,
    still_source_page: 'https://memory-alpha.fandom.com/wiki/File:Kzinti_Flyer.jpg',
    still_sha256: STILL_SHA,
    portrait: 'verified',
    portrait_path: PORTRAIT_PATH,
    portrait_origin: PORTRAIT_SOURCE,
    portrait_author: 'Neelix at English Wikipedia',
    portrait_license: 'Public domain',
    portrait_sha256: PORTRAIT_SHA,
    facets,
    facets_sha256: sha(pretty(facets)),
    source_ledger_sha256: sha(pretty(sourceRow)),
    cross_facet_substitution: false,
    maker_attribution: 'unresolved',
  },
  queue: { before: stage.queue.before, after: queueAfter },
  prior_custody: priorCustody,
  reviewed_cycle: {
    id: cycle.id,
    event_id: event.id,
    prior_cycle_id: PRIOR_LWAXANA_CYCLE_ID,
    outcome: cycle.outcome,
    reviewed_at: reviewedAt,
  },
  qualification: {
    checker_path: CHECKER_PATH,
    denominator: 2228,
    resolved_floor: 423,
    checker_sha256: checkerSha,
  },
  boundary: {
    queued_mode_hint_promoted: false,
    role_or_maker_conflated: false,
    physical_performance_attributed: false,
    animation_or_maker_attributed: false,
    voice_credit_promoted_to_processing_credit: false,
    separate_role_conflated: false,
    vocal_transformation_measured: false,
    cross_facet_substitution: false,
    outside_human_dependency: false,
    owner_physical_action_required: false,
    additional_lease_issued: false,
  },
};
const receipt = { ...receiptBody, receipt_sha256: sha(pretty(receiptBody)) };
write(RECEIPT_PATH, receipt);

run('rebuild final public shards', process.execPath, ['scripts/shard.mjs']);
run('rebuild final archive contract', process.execPath, ['scripts/build-contract.mjs']);
run('rebuild final permanent routes', process.execPath, ['scripts/build-record-pages.mjs']);
run('validate permanent Kzinti Flyer cycle', process.execPath, [CHECKER_PATH]);
run('validate composable Lwaxana rejection custody on successor', process.execPath, [LWAXANA_COMPOSABLE_CHECKER_PATH]);
const finalPrior = read(PRIOR_LWAXANA_RECEIPT_PATH);
ok(finalPrior.adjudication?.classification === 'ineligible / no card'
  && finalPrior.adjudication?.card_created === false
  && finalPrior.boundary?.character_card_created === false
  && finalPrior.next_deterministic_obligation?.candidate?.task_id === TASK
  && finalPrior.next_deterministic_obligation?.candidate?.source_fingerprint === FINGERPRINT,
'final Lwaxana eligibility-rejection semantic custody drifted');
run('validate final thesis rails', process.execPath, ['scripts/thesis-rails.mjs', 'validate']);
run('validate final media closure', process.execPath, ['scripts/media-audit.mjs', 'gate', '--scope', 'star-trek']);
run('validate final waterline', process.execPath, ['scripts/waterline.mjs', 'validate']);
run('validate collection mode', process.execPath, ['scripts/corpus-ops.mjs', 'validate']);
run('validate final archive', process.execPath, ['scripts/validate.mjs']);

const summary = {
  transaction: receipt.transaction,
  candidate_commit: meta.candidate_commit,
  candidate_tree: meta.candidate_tree,
  review_identity: review.review_sha256,
  cycle_id: cycle.id,
  waterline_event_id: event.id,
  receipt_path: RECEIPT_PATH,
  receipt_identity: receipt.receipt_sha256,
  checker_path: CHECKER_PATH,
  checker_sha256: checkerSha,
  prior_lwaxana_rejection_checker_sha256: PRIOR_LWAXANA_CHECKER_SHA,
  prior_lwaxana_rejection_composable_checker_path: LWAXANA_COMPOSABLE_CHECKER_PATH,
  prior_lwaxana_rejection_composable_checker_sha256: fileSha(LWAXANA_COMPOSABLE_CHECKER_PATH),
  queue: queueAfter,
};
write(outPath, summary);
console.log(JSON.stringify(summary, null, 2));
