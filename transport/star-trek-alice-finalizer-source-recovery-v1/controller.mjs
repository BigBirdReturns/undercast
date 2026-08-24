#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cmd = process.argv[2];
const env = process.env;
const CURRENT_MAIN = env.CURRENT_MAIN;
const CURRENT_TREE = env.CURRENT_TREE;
const ORIGINAL_MAIN = env.ORIGINAL_MAIN;
const ORIGINAL_TREE = env.ORIGINAL_TREE;
const CLAIM_COMMIT = env.CLAIM_COMMIT;
const CLAIM_TREE = env.CLAIM_TREE;
const ORIGINAL_CANDIDATE_COMMIT = env.ORIGINAL_CANDIDATE_COMMIT;
const ORIGINAL_CANDIDATE_TREE = env.ORIGINAL_CANDIDATE_TREE;
const REBASED_CANDIDATE_COMMIT = env.REBASED_CANDIDATE_COMMIT;
const REBASED_CANDIDATE_TREE = env.REBASED_CANDIDATE_TREE;
const STAGE_ROOT = env.STAGE_ROOT;
const REVIEW_ROOT = env.REVIEW_ROOT;
const FINAL_ROOT = env.FINAL_ROOT;

const TASK_ID = 'ap_c7ff8298a99fe94fc55bbdbc';
const LEASE_ID = 'lease_e1da8637695057922f1840d4';
const SOURCE_FINGERPRINT = '9caf9645daf70d67203bd0056980531a7190659c5209e15b3899cf6bac016297';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/Alice_(character)';
const EPISODE_SOURCE = 'https://memory-alpha.fandom.com/wiki/Once_Upon_a_Planet_(episode)';
const PERFORMER = 'Nichelle Nichols';
const CHARACTER = 'Alice (character)';
const PRODUCTION = 'Once Upon a Planet';
const YEARS = '1973';
const WALL_ID = 'UC-1396';
const STILL_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Alice,_2269.jpg';
const STILL_SHA256 = '0d6afbfc6bb6a06901cd69f328da989878e2b2d5ad0065e002a2218bdad9cf64';
const PORTRAIT_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Nichelle_Nichols_(46141497921).jpg';
const PORTRAIT_SHA256 = '4e51f3d6f781cc6ce7bbabeba4d05a2eb0780a1e208f216d111c8e527c998799';
const PORTRAIT_AUTHOR = 'Miguel Discart';
const PORTRAIT_LICENSE = 'CC BY-SA 2.0';
const PRIOR_TASK_ID = 'ap_82712ddec2c606e4c7d1a152';
const PRIOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-anastasia-komananov-cycle.json';
const PRIOR_CHECKER_PATH = 'scripts/star-trek-anastasia-komananov-cycle.mjs';
const PRIOR_RECEIPT_SHA256 = '2a42f849ce1f9725fb5a6b711d1a3c96550a36c0549d24c6aae5bda1dc64b07f';
const PRIOR_CYCLE_ID = 'cycle_58b8485af876b2e5a4ce45d2';
const KNOWN_FOR = 'The animated 2269 Alice robot voiced by Nichelle Nichols in Once Upon a Planet (1973).';
const REVEAL = 'The frozen Alice source separates two performances. Marcia Brown played the 2267 live-action Alice in Shore Leave, while Nichelle Nichols voiced the 2269 animated Alice in Once Upon a Planet. This record is limited to Nichols’s animated voice performance. The exact 2269 character still and a separately sourced licensed Nichols portrait are retained; physical performance, animation labor, character design, voice direction, vocal processing, sound, transformation measurement, and every other unsupported maker function remain unresolved.';
const QUEUE_BEFORE = { total: 2228, queued: 1799, resolved: 427, blocked: 0, rejected: 2, in_flight: 0 };
const QUEUE_AFTER = { total: 2228, queued: 1798, resolved: 428, blocked: 0, rejected: 2, in_flight: 0 };

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (file) => sha(fs.readFileSync(file));
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
const readJsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

function taskRow() {
  const state = readJson('data/AUTOPILOT.json');
  const task = state.jobs.find((row) => row.id === TASK_ID);
  ensure(task, 'Alice task is missing from Autopilot');
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
    in_flight: trek.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length,
  };
}

function verifyStageReceipt(stageDoc) {
  ensure(stageDoc.transaction === 'STAR-TREK-ALICE-CANDIDATE-STAGE-V1', 'Alice stage transaction drifted');
  ensure(stageDoc.canonical_parent === ORIGINAL_MAIN && stageDoc.canonical_tree === ORIGINAL_TREE, 'Alice stage canonical binding drifted');
  const body = structuredClone(stageDoc); delete body.receipt_sha256;
  ensure(stageDoc.receipt_sha256 === sha(Buffer.from(stablePretty(body))), 'Alice stage receipt hash drifted');
  ensure(stageDoc.task?.id === TASK_ID && stageDoc.task?.performer === PERFORMER && stageDoc.task?.role === CHARACTER && stageDoc.task?.source_fingerprint === SOURCE_FINGERPRINT, 'Alice stage task drifted');
  ensure(stageDoc.lease?.id === LEASE_ID, 'Alice stage lease drifted');
  ensure(stageDoc.wall_id === WALL_ID, 'Alice stage wall drifted');
  ensure(stageDoc.media?.still_sha256 === STILL_SHA256 && stageDoc.media?.portrait_sha256 === PORTRAIT_SHA256, 'Alice stage media hashes drifted');
  ensure(stageDoc.canonical_mutation === false && stageDoc.additional_lease_issued === false, 'Alice stage exceeded noncanonical authority');
}

function verifyCandidate(stageDoc) {
  verifyStageReceipt(stageDoc);
  const { task } = taskRow();
  ensure(task.status === 'resolved' && task.attempts === 1, 'Alice task is not the one-attempt resolved candidate');
  ensure(task.performer === PERFORMER && task.character === CHARACTER && task.source_fingerprint === SOURCE_FINGERPRINT, 'Alice task identity drifted');
  ensure(JSON.stringify(task.performance_modes) === JSON.stringify(['physical-and-voice']), 'Alice queued mode hint drifted');
  ensure(task.wall_ids?.length === 1 && task.wall_ids[0] === WALL_ID, 'Alice wall binding drifted');
  ensure(task.outcome?.review_sha256 === stageDoc.media_review_sha256, 'Alice media review binding drifted');

  const card = readJson('data/specimens.json').find((row) => row.id === WALL_ID);
  ensure(card && card.kind === 'voice' && card.actor === PERFORMER && card.character === CHARACTER && card.production === PRODUCTION && card.universe === 'Star Trek' && card.years === YEARS && card.designer === '—' && card.transform === 2 && card.link === SOURCE, 'Alice card fields drifted');
  ensure(card.knownFor === KNOWN_FOR && card.reveal === REVEAL, 'Alice card copy drifted');
  ensure(card.references?.some((row) => row.claim === 'performance' && sourceKey(row.source) === sourceKey(SOURCE)), 'Alice performance reference missing');
  ensure(card.references?.some((row) => row.claim === 'production' && sourceKey(row.source) === sourceKey(EPISODE_SOURCE)), 'Alice production reference missing');
  ensure(card.still?.origin === STILL_ORIGIN && shaFile(card.still.src) === STILL_SHA256, 'Alice still drifted');
  ensure(card.portrait?.origin === PORTRAIT_ORIGIN && card.portrait.author === PORTRAIT_AUTHOR && card.portrait.license === PORTRAIT_LICENSE && shaFile(card.portrait.src) === PORTRAIT_SHA256, 'Alice portrait drifted');
  ensure(STILL_SHA256 !== PORTRAIT_SHA256 && card.still.origin !== card.portrait.origin, 'Alice media facets collide');

  const source = readJson('data/SOURCES.json').find((row) => row.id === WALL_ID);
  ensure(source && JSON.stringify(source.still) === JSON.stringify(card.still) && JSON.stringify(source.portrait) === JSON.stringify(card.portrait) && source.fetched_at, 'Alice source ledger drifted');
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
  ensure(facets.length === 2 && facets.every((row) => row.status === 'verified'), 'Alice media facets are not verified');
  const still = facets.find((row) => row.side === 'still');
  const portrait = facets.find((row) => row.side === 'portrait');
  ensure(still?.expected_subject === CHARACTER && still.asset?.sha256 === STILL_SHA256, 'Alice still facet subject or bytes drifted');
  ensure(portrait?.expected_subject === PERFORMER && portrait.asset?.sha256 === PORTRAIT_SHA256, 'Alice portrait facet subject or bytes drifted');
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify(QUEUE_AFTER), `Alice candidate queue drifted: ${JSON.stringify(counts)}`);
  return { task, card, source, facets, counts };
}

function priorCustody() {
  const receipt = readJson(PRIOR_RECEIPT_PATH);
  ensure(receipt.receipt_sha256 === PRIOR_RECEIPT_SHA256 && receipt.reviewed_cycle?.id === PRIOR_CYCLE_ID && receipt.task?.id === PRIOR_TASK_ID, 'Anastasia predecessor receipt drifted');
  ensure(receipt.qualification?.checker_sha256 === shaFile(PRIOR_CHECKER_PATH), 'Anastasia predecessor checker hash drifted');
  node(PRIOR_CHECKER_PATH);
  return { receipt, checkerSha: shaFile(PRIOR_CHECKER_PATH) };
}

function review() {
  ensure(STAGE_ROOT && REVIEW_ROOT && REBASED_CANDIDATE_COMMIT && REBASED_CANDIDATE_TREE, 'review environment is incomplete');
  fs.mkdirSync(REVIEW_ROOT, { recursive: true });
  const stageDoc = readJson(path.join(STAGE_ROOT, 'stage.json'));
  const verified = verifyCandidate(stageDoc);
  const prior = priorCustody();
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/thesis-rails.mjs', ['validate']);
  const waterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  const unreceipted = Array.isArray(waterline.cycles?.unreceipted) ? waterline.cycles.unreceipted : [];
  ensure(waterline.phase === 'receipt-required' && unreceipted.length === 1 && unreceipted[0].lease_id === LEASE_ID, 'Alice independent review expected one receipt-required cycle');

  const body = {
    version: 1,
    transaction: 'STAR-TREK-ALICE-INDEPENDENT-REVIEW-V2',
    verdict: 'pass',
    reviewed_at: new Date().toISOString(),
    canonical_parent: { commit: CURRENT_MAIN, tree: CURRENT_TREE },
    maintenance_parent: { commit: ORIGINAL_MAIN, tree: ORIGINAL_TREE, allowed_paths: ['data/MEDIA-SEARCH-LATEST.json', 'data/journal/media-search.jsonl'] },
    original_candidate: { commit: ORIGINAL_CANDIDATE_COMMIT, tree: ORIGINAL_CANDIDATE_TREE, claim_commit: CLAIM_COMMIT, claim_tree: CLAIM_TREE },
    rebased_candidate: { commit: REBASED_CANDIDATE_COMMIT, tree: REBASED_CANDIDATE_TREE },
    task: { id: TASK_ID, lease_id: LEASE_ID, source_fingerprint: SOURCE_FINGERPRINT, performer: PERFORMER, character: CHARACTER, wall_id: WALL_ID, attempts: 1 },
    queue: verified.counts,
    media: {
      still: { subject: CHARACTER, sha256: STILL_SHA256, origin: STILL_ORIGIN },
      portrait: { subject: PERFORMER, sha256: PORTRAIT_SHA256, origin: PORTRAIT_ORIGIN, author: PORTRAIT_AUTHOR, license: PORTRAIT_LICENSE },
    },
    prior_custody: { task_id: PRIOR_TASK_ID, receipt_sha256: PRIOR_RECEIPT_SHA256, checker_sha256: prior.checkerSha, cycle_id: PRIOR_CYCLE_ID },
    boundary: {
      canonical_subject_contract: true,
      exact_2269_animated_alice: true,
      live_action_2267_alice_excluded: true,
      marcia_brown_live_action_performance_separate: true,
      physical_performance_attributed: false,
      animation_labor_attributed: false,
      character_design_attributed: false,
      voice_direction_attributed: false,
      vocal_processing_attributed: false,
      sound_attributed: false,
      transformation_measured: false,
      maker_attributed: false,
      cross_facet_substitution: false,
      additional_lease_issued: false,
      canonical_mutation: false,
    },
    gates: { repository: 0, media: 0, thesis: 0, predecessor: 0, waterline: 0 },
  };
  const doc = { ...body, review_sha256: sha(Buffer.from(stablePretty(body))) };
  writeJson(path.join(REVIEW_ROOT, 'independent-review.json'), doc);
  writeJson(path.join(REVIEW_ROOT, 'review-evidence.json'), { version: 1, stage: stageDoc, task: verified.task, card: verified.card, source: verified.source, facets: verified.facets, waterline });
  console.log(JSON.stringify({ status: 'reviewed', verdict: doc.verdict, review_sha256: doc.review_sha256 }, null, 2));
}

function checkerSource({ receiptPath, checkerPath, priorCheckerSha }) {
  const constants = {
    receiptPath,
    checkerPath,
    taskId: TASK_ID,
    wallId: WALL_ID,
    performer: PERFORMER,
    role: CHARACTER,
    source: SOURCE,
    episodeSource: EPISODE_SOURCE,
    fingerprint: SOURCE_FINGERPRINT,
    canonicalParent: CURRENT_MAIN,
    stillSha: STILL_SHA256,
    stillOrigin: STILL_ORIGIN,
    portraitSha: PORTRAIT_SHA256,
    portraitOrigin: PORTRAIT_ORIGIN,
    portraitAuthor: PORTRAIT_AUTHOR,
    portraitLicense: PORTRAIT_LICENSE,
    priorReceiptPath: PRIOR_RECEIPT_PATH,
    priorCheckerPath: PRIOR_CHECKER_PATH,
    priorReceiptId: PRIOR_RECEIPT_SHA256,
    priorCheckerSha,
    priorCycleId: PRIOR_CYCLE_ID,
    knownFor: KNOWN_FOR,
    reveal: REVEAL,
  };
  return `#!/usr/bin/env node\nimport fs from 'node:fs';\nimport crypto from 'node:crypto';\nimport {spawnSync} from 'node:child_process';\nconst C=${JSON.stringify(constants)};\nconst sha=v=>crypto.createHash('sha256').update(v).digest('hex');\nconst stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;\nconst pretty=v=>JSON.stringify(stable(v),null,2)+'\\n';\nconst read=f=>JSON.parse(fs.readFileSync(f,'utf8'));\nconst jsonl=f=>fs.readFileSync(f,'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse);\nconst ok=(x,m)=>{if(!x)throw Error(m)};\nconst same=(a,b,m)=>ok(JSON.stringify(stable(a))===JSON.stringify(stable(b)),m);\nconst receipt=read(C.receiptPath),body=structuredClone(receipt);delete body.receipt_sha256;\nok(receipt.receipt_sha256===sha(pretty(body))&&receipt.transaction==='STAR-TREK-CYCLE-ALICE'&&receipt.canonical_parent===C.canonicalParent,'Alice receipt identity drifted');\nok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(C.checkerPath)),'Alice checker hash drifted');\nconst state=read('data/AUTOPILOT.json'),trek=state.jobs.filter(x=>x.scope==='star-trek'),task=trek.find(x=>x.id===C.taskId);\nok(trek.length===2228&&task?.status==='resolved'&&task.attempts===1&&task.performer===C.performer&&task.character===C.role&&task.source_fingerprint===C.fingerprint,'Alice task drifted');\nsame(task.performance_modes,['physical-and-voice'],'Alice queued mode hint drifted');same(task.wall_ids,[C.wallId],'Alice wall drifted');\nok(task.outcome?.review_sha256===receipt.canonical.outcome_review_sha256,'Alice review binding drifted');\nconst card=read('data/specimens.json').find(x=>x.id===C.wallId);\nok(card&&card.kind==='voice'&&card.actor===C.performer&&card.character===C.role&&card.production==='Once Upon a Planet'&&card.universe==='Star Trek'&&card.years==='1973'&&card.transform===2&&card.designer==='—'&&card.link===C.source,'Alice card drifted');\nok(card.knownFor===C.knownFor&&card.reveal===C.reveal,'Alice copy drifted');\nok(card.references?.some(x=>x.claim==='performance'&&x.source===C.source)&&card.references?.some(x=>x.claim==='production'&&x.source===C.episodeSource),'Alice references drifted');\nok(sha(fs.readFileSync(card.still.src))===C.stillSha&&card.still.origin===C.stillOrigin,'Alice still drifted');\nok(sha(fs.readFileSync(card.portrait.src))===C.portraitSha&&card.portrait.origin===C.portraitOrigin&&card.portrait.author===C.portraitAuthor&&card.portrait.license===C.portraitLicense,'Alice portrait drifted');\nconst source=read('data/SOURCES.json').find(x=>x.id===C.wallId);same(source.still,card.still,'Alice source still drifted');same(source.portrait,card.portrait,'Alice source portrait drifted');\nconst facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===C.wallId).sort((a,b)=>a.side.localeCompare(b.side));\nok(facets.length===2&&facets.every(x=>x.status==='verified'),'Alice facets drifted');\nok(facets.find(x=>x.side==='still')?.expected_subject===C.role&&facets.find(x=>x.side==='still')?.asset?.sha256===C.stillSha,'Alice still facet drifted');\nok(facets.find(x=>x.side==='portrait')?.expected_subject===C.performer&&facets.find(x=>x.side==='portrait')?.asset?.sha256===C.portraitSha,'Alice portrait facet drifted');\nok(receipt.canonical.record_sha256===sha(pretty(card))&&receipt.media.facets_sha256===sha(pretty(facets))&&receipt.media.source_ledger_sha256===sha(pretty(source)),'Alice receipt projections drifted');\nconst claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek');\nconst water=read('data/WATERLINE-STATE.json'),cycles=water.cycles.filter(x=>x.scope_id==='star-trek'),byLease=new Map(cycles.map(x=>[x.lease_id,x])),own=byLease.get(receipt.lease.id);\nok(own?.id===receipt.reviewed_cycle.id&&own.outcome==='completed'&&own.task_statuses?.[C.taskId]==='resolved','Alice waterline cycle drifted');\nconst events=jsonl('data/journal/waterline.jsonl').filter(x=>x.id===receipt.reviewed_cycle.event_id&&x.lease_id===receipt.lease.id&&x.receipt_id===own.id);ok(events.length===1,'Alice waterline event drifted');\nconst later=claims.filter(x=>Date.parse(x.at)>Date.parse(receipt.reviewed_cycle.reviewed_at)),unreceipted=later.filter(x=>!byLease.has(x.lease_id));\nok(unreceipted.length<=1,'more than one later cycle is unreceipted');ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later task is active');\nconst resolved=trek.filter(x=>x.status==='resolved').length,queued=trek.filter(x=>x.status==='queued').length;ok(resolved>=428,'resolved floor regressed');\nif(later.length===0)same({total:trek.length,queued,resolved,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length},{total:2228,queued:1798,resolved:428,blocked:0,rejected:2,in_flight:0},'Alice terminal queue drifted');\nconst registry=read('data/ESTATE-REGISTRY.json'),estate=registry.estates.find(x=>x.id==='star-trek'),latest=cycles.at(-1),registryQueued=queued+unreceipted.length;\nok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(registryQueued.toLocaleString('en-US')+' tasks remain queued'),'Alice registry gate drifted');\nconst prior=read(C.priorReceiptPath);ok(prior.receipt_sha256===C.priorReceiptId&&prior.reviewed_cycle?.id===C.priorCycleId&&sha(fs.readFileSync(C.priorCheckerPath))===C.priorCheckerSha,'Anastasia predecessor drifted');\nconst run=spawnSync(process.execPath,[C.priorCheckerPath],{encoding:'utf8',maxBuffer:256*1024*1024,env:process.env});ok(run.status===0,'Anastasia predecessor checker failed');\nok(receipt.boundary?.marcia_brown_live_action_performance_separate===true&&receipt.boundary?.physical_performance_attributed===false&&receipt.boundary?.animation_labor_attributed===false&&receipt.boundary?.character_design_attributed===false&&receipt.boundary?.voice_direction_attributed===false&&receipt.boundary?.vocal_processing_attributed===false&&receipt.boundary?.sound_attributed===false&&receipt.boundary?.transformation_measured===false&&receipt.boundary?.maker_attributed===false&&receipt.boundary?.cross_facet_substitution===false&&receipt.boundary?.additional_lease_issued===false,'Alice boundary drifted');\nok(fs.readFileSync('sitemap.xml','utf8').includes('records/'+C.wallId+'/'),'Alice permanent route missing');\nconsole.log('star-trek-alice-cycle: PASS — exact Nichelle Nichols animated voice performance custody, Marcia Brown live-action separation, source-distinct verified media, unresolved maker functions, Anastasia predecessor custody, reviewed waterline closure, and later-cycle bounds are intact');\n`;
}

function finalize() {
  ensure(STAGE_ROOT && REVIEW_ROOT && FINAL_ROOT && REBASED_CANDIDATE_COMMIT && REBASED_CANDIDATE_TREE, 'finalize environment is incomplete');
  fs.mkdirSync(FINAL_ROOT, { recursive: true });
  const stageDoc = readJson(path.join(STAGE_ROOT, 'stage.json'));
  const reviewDoc = readJson(path.join(REVIEW_ROOT, 'independent-review.json'));
  const verified = verifyCandidate(stageDoc);
  ensure(reviewDoc.transaction === 'STAR-TREK-ALICE-INDEPENDENT-REVIEW-V2' && reviewDoc.verdict === 'pass' && reviewDoc.rebased_candidate?.commit === REBASED_CANDIDATE_COMMIT && reviewDoc.task?.id === TASK_ID && reviewDoc.task?.lease_id === LEASE_ID, 'Alice independent review drifted');
  const reviewBody = structuredClone(reviewDoc); delete reviewBody.review_sha256;
  ensure(reviewDoc.review_sha256 === sha(Buffer.from(stablePretty(reviewBody))), 'Alice independent review hash drifted');
  const prior = priorCustody();
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);

  const reviewedAt = new Date().toISOString();
  const cycleInput = {
    version: 1,
    scope_id: 'star-trek',
    lease_id: LEASE_ID,
    outcome: 'completed',
    reviewed_by: 'chatgpt-alice-independent-review',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    note: 'The Alice lease resolved Nichelle Nichols’s animated voice performance as the 2269 Alice, preserved Marcia Brown’s 2267 live-action performance as a separate object, verified source-distinct character and performer media, and returned the Star Trek queue to zero in-flight work.',
    evidence: [
      { type: 'workflow-run', value: `GitHub Actions run ${env.GITHUB_RUN_ID || 'local'} — rebased, independently reviewed, finalized, and published the exact Alice cycle.` },
      { type: 'commit', value: `${REBASED_CANDIDATE_COMMIT} — durable reviewed Alice candidate over current canonical maintenance state.` },
      { type: 'restart-proof', value: `Original candidate ${ORIGINAL_CANDIDATE_COMMIT}, stage receipt ${stageDoc.receipt_sha256}, and independent review ${reviewDoc.review_sha256} persisted before receipt construction.` },
    ],
  };
  writeJson(path.join(FINAL_ROOT, 'cycle-input.json'), cycleInput);
  npm(['run', 'waterline', '--', 'record-cycle', '--input', path.join(FINAL_ROOT, 'cycle-input.json')]);

  const water = readJson('data/WATERLINE-STATE.json');
  const cycle = water.cycles.filter((row) => row.scope_id === 'star-trek' && row.lease_id === LEASE_ID).at(-1);
  ensure(cycle?.outcome === 'completed' && cycle.task_statuses?.[TASK_ID] === 'resolved', 'Alice reviewed waterline cycle missing');
  const event = readJsonl('data/journal/waterline.jsonl').filter((row) => row.lease_id === LEASE_ID && row.receipt_id === cycle.id).at(-1);
  ensure(event, 'Alice waterline event missing');

  const registry = readJson('data/ESTATE-REGISTRY.json');
  const estate = registry.estates.find((row) => row.id === 'star-trek');
  ensure(estate, 'Star Trek estate missing');
  estate.next_gate = `Star Trek reviewed Alice cycle ${cycle.id} resolved Nichelle Nichols’s animated voice performance as the 2269 Alice in Once Upon a Planet (1973) within the preserved 2,228-task denominator; 1,798 tasks remain queued. The exact animated Alice still and a separately sourced licensed Nichelle Nichols portrait are verified. Marcia Brown’s 2267 live-action Alice remains a separate performance, and physical performance, animation labor, character design, voice direction, vocal processing, sound, transformation measurement, production-shop labor, and every other unsupported maker function remain unresolved. Any later cycle must begin from the repository-native thesis rail, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
  writeJson('data/ESTATE-REGISTRY.json', registry);

  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  npm(['run', 'media:audit', '--', 'sync', '--scope', 'star-trek']);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');

  const card = readJson('data/specimens.json').find((row) => row.id === WALL_ID);
  const source = readJson('data/SOURCES.json').find((row) => row.id === WALL_ID);
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
  const task = taskRow().task;
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify(QUEUE_AFTER), 'Alice final queue drifted');
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id !== TASK_ID, 'Alice final rail did not return to collection');

  const stageMeta = readJson(path.join(STAGE_ROOT, 'candidate-metadata.json'));
  const mediaScout = readJson(path.join(STAGE_ROOT, 'media-scout.json'));
  const receiptPath = 'data/review/adapter-sdk/star-trek-alice-cycle.json';
  const checkerPath = 'scripts/star-trek-alice-cycle.mjs';
  fs.writeFileSync(checkerPath, checkerSource({ receiptPath, checkerPath, priorCheckerSha: prior.checkerSha }));
  fs.chmodSync(checkerPath, 0o755);
  const checkerSha = shaFile(checkerPath);

  const receiptBody = {
    version: 1,
    transaction: 'STAR-TREK-CYCLE-ALICE',
    generated_at: reviewedAt,
    canonical_parent: CURRENT_MAIN,
    maintenance_parent: { commit: ORIGINAL_MAIN, tree: ORIGINAL_TREE, paths: ['data/MEDIA-SEARCH-LATEST.json', 'data/journal/media-search.jsonl'] },
    task: {
      id: TASK_ID,
      performer: PERFORMER,
      role: CHARACTER,
      production: PRODUCTION,
      years: YEARS,
      source: SOURCE,
      source_fingerprint: SOURCE_FINGERPRINT,
      source_receipts: mediaScout.task?.source_receipts || [mediaScout.source],
      episode_source: EPISODE_SOURCE,
      episode_receipt: mediaScout.episode_receipt,
      queued_mode_hint: ['physical-and-voice'],
      adjudicated_kind: 'voice',
      performance_mode: 'voice-animation',
      performance_scope: 'Nichelle Nichols’s animated voice performance as the 2269 Alice in Once Upon a Planet (1973)',
      marcia_brown_live_action_performance_separate: true,
      physical_performance_attributed: false,
      animation_labor_attribution: 'unresolved',
      character_design_attribution: 'unresolved',
      voice_direction_attribution: 'unresolved',
      vocal_processing_attribution: 'unresolved',
      sound_attribution: 'unresolved',
      transformation_measured: false,
      maker_attribution: 'unresolved',
    },
    lease: stageDoc.lease,
    claim_candidate: { commit: CLAIM_COMMIT, tree: CLAIM_TREE },
    candidate: {
      original_commit: ORIGINAL_CANDIDATE_COMMIT,
      original_tree: ORIGINAL_CANDIDATE_TREE,
      rebased_commit: REBASED_CANDIDATE_COMMIT,
      rebased_tree: REBASED_CANDIDATE_TREE,
      path_count: stageMeta.path_count,
      path_ledger_sha256: stageMeta.path_ledger_sha256,
      stage_receipt_sha256: stageDoc.receipt_sha256,
      artifact: stageMeta.artifact,
    },
    independent_review: {
      verdict: 'pass',
      review_sha256: reviewDoc.review_sha256,
      artifact: { id: Number(env.REVIEW_ARTIFACT_ID || 0), sha256: String(env.REVIEW_ARTIFACT_DIGEST || 'local').replace(/^sha256:/, '') },
    },
    source_media: {
      branch: env.MEDIA_RESULT_BRANCH || 'agent/star-trek-alice-media-result-v1',
      receipt_sha256: mediaScout.receipt_sha256,
      source_revision: mediaScout.source,
      episode_receipt: mediaScout.episode_receipt,
    },
    canonical: {
      wall_id: WALL_ID,
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
      character: 'Anastasia Komananov',
      receipt_path: PRIOR_RECEIPT_PATH,
      receipt_identity: PRIOR_RECEIPT_SHA256,
      checker_path: PRIOR_CHECKER_PATH,
      checker_sha256: prior.checkerSha,
      cycle_id: PRIOR_CYCLE_ID,
    },
    reviewed_cycle: { id: cycle.id, event_id: event.id, prior_cycle_id: PRIOR_CYCLE_ID, outcome: cycle.outcome, reviewed_at: cycle.reviewed_at },
    next,
    qualification: { checker_path: checkerPath, denominator: 2228, resolved_floor: 428, checker_sha256: checkerSha },
    boundary: {
      canonical_subject_contract: true,
      exact_2269_animated_alice: true,
      live_action_2267_alice_excluded: true,
      marcia_brown_live_action_performance_separate: true,
      physical_performance_attributed: false,
      animation_labor_attributed: false,
      character_design_attributed: false,
      voice_direction_attributed: false,
      vocal_processing_attributed: false,
      sound_attributed: false,
      transformation_measured: false,
      maker_attributed: false,
      cross_facet_substitution: false,
      outside_human_dependency: false,
      owner_physical_action_required: false,
      additional_lease_issued: false,
    },
  };
  const receipt = { ...receiptBody, receipt_sha256: sha(Buffer.from(stablePretty(receiptBody))) };
  writeJson(receiptPath, receipt);

  const pkg = readJson('package.json');
  pkg.scripts['star-trek:alice-cycle:check'] = 'node scripts/star-trek-alice-cycle.mjs';
  if (!String(pkg.scripts['autopilot:fixtures'] || '').includes('npm run star-trek:alice-cycle:check')) pkg.scripts['autopilot:fixtures'] += ' && npm run star-trek:alice-cycle:check';
  writeJson('package.json', pkg);

  node('scripts/validate.mjs');
  node('scripts/thesis-rails.mjs', ['validate']);
  node(PRIOR_CHECKER_PATH);
  node(checkerPath);
  npm(['run', 'autopilot:fixtures']);
  const finalWaterline = JSON.parse(node('scripts/waterline.mjs', ['status', '--scope', 'star-trek', '--json'], { capture: true }));
  ensure(finalWaterline.phase === 'ready-for-cycle' && finalWaterline.claim_allowed === true, `Alice final waterline is ${finalWaterline.phase}`);
  const finalNext = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(finalNext.phase === 'ready-for-one-cycle' && finalNext.candidate?.task_id !== TASK_ID, 'Alice final thesis rail did not return to collection');

  writeJson(path.join(FINAL_ROOT, 'receipt.json'), receipt);
  writeJson(path.join(FINAL_ROOT, 'waterline.json'), finalWaterline);
  writeJson(path.join(FINAL_ROOT, 'next.json'), finalNext);
  writeJson(path.join(FINAL_ROOT, 'finalization.json'), {
    version: 1,
    transaction: 'STAR-TREK-ALICE-FINALIZATION-V1',
    status: 'qualified',
    canonical_parent: CURRENT_MAIN,
    original_candidate_commit: ORIGINAL_CANDIDATE_COMMIT,
    rebased_candidate_commit: REBASED_CANDIDATE_COMMIT,
    task_id: TASK_ID,
    lease_id: LEASE_ID,
    wall_id: WALL_ID,
    receipt_sha256: receipt.receipt_sha256,
    checker_sha256: checkerSha,
    reviewed_cycle: cycle.id,
    next: finalNext.candidate,
    additional_lease_issued: false,
  });
  console.log(JSON.stringify({ status: 'qualified', wall_id: WALL_ID, receipt_sha256: receipt.receipt_sha256, checker_sha256: checkerSha, cycle_id: cycle.id, next: finalNext.candidate }, null, 2));
}

try {
  if (cmd === 'review') review();
  else if (cmd === 'finalize') finalize();
  else throw new Error('usage: alice-finalizer-controller.mjs <review|finalize>');
} catch (error) {
  console.error(`alice-finalizer-v1: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
}
