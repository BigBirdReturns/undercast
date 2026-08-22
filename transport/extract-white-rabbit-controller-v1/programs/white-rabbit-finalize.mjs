#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const MAIN = '921ff56c4d53b6bf5279f5db3175cf60b361aafc';
const TASK = 'ap_4023ad9add0c718ecb2c6040';
const WALL = 'UC-1370';
const PERFORMER = 'James Doohan';
const ROLE = 'White Rabbit';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/White_Rabbit';
const FINGERPRINT = 'a5dc46d26e6b8f75cb52ec6ed0c0819cdc882dce39669f1f355940022d6c93b8';
const STILL_PATH = 'images/uc-1370-still.webp';
const STILL_SOURCE = 'https://static.wikia.nocookie.net/memoryalpha/images/6/64/White_Rabbit%2C_2269.jpg/revision/latest?cb=20061204195540&path-prefix=en';
const STILL_SHA = '4a5191e7614e31b280b8358b2389f19e877f731bd226ec307f597e9db2c81b57';
const PORTRAIT_PATH = 'images/uc-1370-portrait.jpg';
const PORTRAIT_SOURCE = 'https://commons.wikimedia.org/wiki/File:Space_shuttle_enterprise_star_trek-cropcast.jpg';
const PORTRAIT_SHA = 'aced8b0de7ccc4aa3bb2122d9d9cac36f2a10c77ab3c1e5753c21f2cb65c6d40';




const KORAX_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-korax-cycle.json';
const KORAX_CHECKER_PATH = 'scripts/star-trek-korax-cycle.mjs';
const KORAX_RECEIPT_FILE_SHA = '45fe401a3b9b5bae668a2e7bf2a566f2f7456ce4dab5fa5b7cef5f7fef179db0';
const KORAX_RECEIPT_ID = 'f6d2d004c859f1cf3b5bc8fe0ab5a3b6d1c35cf01095e0c16f9c943eba11d381';
const KORAX_CHECKER_SHA = '04035d7515ff95fc8c7a45edc116709b3168aa8d6ca6b542f76486babdfea006';
const KORAX_CYCLE_ID = 'cycle_d0ac4d87953b8ff835c88fb9';

const KOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-kor-cycle.json';
const KOR_CHECKER_PATH = 'scripts/star-trek-kor-cycle.mjs';
const KOR_RECEIPT_FILE_SHA = 'cb78e1bfa794ea0b5a7165ff48ba381a86538968740eaad452be22cb4690ac05';
const KOR_RECEIPT_ID = '6b2d648ce0ab62a846e27df231eff8d324558cd07e30fcedbbf5ceb3ac7c7ba3';
const KOR_CHECKER_SHA = '20293b617a9ea3e363fc279351bd464e41865c5e9809d764f1f4f11c661b8324';
const KOR_CYCLE_ID = 'cycle_9b23d57211d14d0c6abbfb03';

const KOLOTH_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-koloth-cycle.json';
const KOLOTH_CHECKER_PATH = 'scripts/star-trek-koloth-cycle.mjs';
const KOLOTH_RECEIPT_FILE_SHA = '1b27a8179e11b5cbb42b9209e058a80acec3959eb765854a39cdba7e7dca87f2';
const KOLOTH_RECEIPT_ID = '6dbae7a3072ee431daf456652426e8895656411583acff64e2cee66a12983822';
const KOLOTH_CHECKER_SHA = '0eb2d3a4f02464b8476dc7be115660a3eac9871944d1b23a69f26ff15dda7812';
const KOLOTH_CYCLE_ID = 'cycle_d4c4c9ca7c7ba705373d6eb6';

const KAZ_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-kaz-cycle.json';
const KAZ_CHECKER_PATH = 'scripts/star-trek-kaz-cycle.mjs';
const KAZ_RECEIPT_FILE_SHA = '6521ccdcdcfe692c70ca91f37ecdd3e9d56de9efbb0997d5b795b78a58d2040d';
const KAZ_RECEIPT_ID = '1e599ea90f9f96c9a1cbfb33d7443170fdd3ae2f988c320994b61d4f26dbb5c4';
const KAZ_CHECKER_SHA = '48ffa7f77f226609891be97f166ab74049fcee74774588e3fdb6b17cf41f7c5c';
const KAZ_CYCLE_ID = 'cycle_690b6e1f79aa674305e73b8a';

const GUARDIAN_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-guardian-cycle.json';
const GUARDIAN_CHECKER_PATH = 'scripts/star-trek-guardian-cycle.mjs';
const GUARDIAN_RECEIPT_FILE_SHA = '9aabda49277cc744139d94e7d2909deebec32c62b7ea105a48bb7c4ac5279e6b';
const GUARDIAN_RECEIPT_ID = 'd733471f73cd08b5dce510b928e5071c92167850d50623c2202e63bdec71c58b';
const GUARDIAN_CHECKER_SHA = 'd68c494151b09db611603b1671624a522102c00de8f798a7bb9854c91a0cb654';
const GUARDIAN_CYCLE_ID = 'cycle_7ac7126efeea280ef2561137';

const LANDRU_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-landru-cycle.json';
const LANDRU_CHECKER_PATH = 'scripts/star-trek-landru-cycle.mjs';
const LANDRU_RECEIPT_FILE_SHA = '5388c7c1e09ddd1c31cfd501893776a79c993e73e8bb7951363dac1229cc69ff';
const LANDRU_RECEIPT_ID = 'e5181979ba6d027cee26cbdcf94048af14b75c37419b1a0e893f849e44f8164c';
const LANDRU_CHECKER_SHA = '477a54286cf592fdb99812f252c812af1f4d9d3ddf12b91edf5228dc7c1b8410';
const LANDRU_CYCLE_ID = 'cycle_3d6e45bac66e3b582260307d';

const CURZON_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-curzon-cycle.json';
const CURZON_CHECKER_PATH = 'scripts/star-trek-curzon-cycle.mjs';
const CURZON_RECEIPT_FILE_SHA = '231092292013d931731fcf05cb8fcc58c87c0f7ad4c52f9efebac39f70d80e54';
const CURZON_RECEIPT_ID = 'c9cf5e4442f914b24ec9becb30f45f791e7977e37faac9179bb3a52e197332e1';
const CURZON_CHECKER_SHA = '08deb0b80c991095bf83581e9d933a3e24f43bee73f5e5fe2dd1c8e252e80445';
const CURZON_CYCLE_ID = 'cycle_9017acacfbd7c929d8b169b4';

const ARMUS_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-armus-cycle.json';
const ARMUS_CHECKER_PATH = 'scripts/star-trek-armus-cycle.mjs';
const ARMUS_HISTORICAL_PATH = 'scripts/star-trek-armus-cycle-historical.mjs';
const ARMUS_RECEIPT_FILE_SHA = '11b5d17403f26221d0e47f183f12c086c0c153fe88bea85cdde974150911df0f';
const ARMUS_RECEIPT_ID = '24bc122415b318099d6a8483f7669c32caf7a89daa1b0f0b7ee3820119c7ee94';
const ARMUS_CHECKER_SHA = '4261811a301276f7d110b49240dda6153b5678487d88148ccfdd51f1d093be8f';
const ARMUS_HISTORICAL_SHA = 'b12851a4ab81df9b1306aa6716cc51954a747fb7cd602291e6b940bd0fcfc612';

const M5_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-m5-cycle.json';
const M5_CHECKER_PATH = 'scripts/star-trek-m5-cycle.mjs';
const M5_PREVIOUS_WRAPPER_PATH = 'scripts/star-trek-m5-cycle-composable-v1.mjs';
const M5_HISTORICAL_PATH = 'scripts/star-trek-m5-cycle-historical.mjs';
const M5_COMP_PATH = 'data/review/adapter-sdk/star-trek-m5-composability-v1.json';
const M5_RECEIPT_FILE_SHA = '8d7057b5771de07cd46e874132dca182c309c95dcff2b9d8f1a0e458ba9a4989';
const M5_RECEIPT_ID = '3d7fa1d75e9007dc0605a2369ac2e812e109a11b87be834fb0359d480ddcd65c';
const M5_CHECKER_SHA = 'da593599181fafe68f8c140187f6b61f3762e9d4c164caf3697198655d33ffc1';
const M5_PREVIOUS_SHA = 'a56b2618d5c64f8dc8b28b1c850d43c47a460dbc7ac892c4c6b2eee2045c2ee6';
const M5_HISTORICAL_SHA = '7fbd9abe5cc58e061157b17d07c529594a96fd0ecf23e90d38c43ecd2654cc89';
const M5_COMP_FILE_SHA = 'd3ff61e160d28c0977b6be34a9e83d1ed9b54f267c0477a056201ef0707f3a8d';
const M5_COMP_ID = 'c89de4b1027cd3ba70599462839a4f231715f6749203828054904a6690af26b9';

const RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-white-rabbit-cycle.json';
const CHECKER_PATH = 'scripts/star-trek-white-rabbit-cycle.mjs';

const candidateMetaPath = process.argv[2];
const stagePath = process.argv[3];
const reviewPath = process.argv[4];
const executionPath = process.argv[5];
const outPath = process.argv[6] || '/tmp/white-rabbit-finalize.json';
if (!candidateMetaPath || !stagePath || !reviewPath || !executionPath) {
  throw new Error('usage: white-rabbit-finalize.mjs <candidate-meta> <stage> <review> <execution> [out]');
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
  if (result.status !== 0) {
    throw new Error(`${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
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
ok(stage.stage_sha256 === objectHash(stage, 'stage_sha256'), 'White Rabbit stage receipt hash drifted');
ok(review.review_sha256 === objectHash(review, 'review_sha256') && review.verdict === 'pass', 'White Rabbit independent review is invalid');
ok(meta.canonical_parent === MAIN
  && meta.candidate_commit === review.candidate.commit
  && meta.candidate_tree === review.candidate.tree,
'candidate and review bindings disagree');
ok(review.candidate.stage_receipt_sha256 === stage.stage_sha256, 'review lost stage custody');
ok(run('read candidate commit', 'git', ['rev-parse', 'HEAD'], { capture: true }) === meta.candidate_commit,
'finalizer is not on reviewed candidate');
ok(run('read candidate tree', 'git', ['rev-parse', 'HEAD^{tree}'], { capture: true }) === meta.candidate_tree,
'reviewed candidate tree drifted');
ok(run('read candidate parent', 'git', ['rev-parse', 'HEAD^'], { capture: true }) === MAIN,
'reviewed candidate parent drifted');

const stateBeforeCycle = read('data/AUTOPILOT.json');
const taskBeforeCycle = stateBeforeCycle.jobs.find((row) => row.id === TASK);
ok(taskBeforeCycle?.status === 'resolved'
  && taskBeforeCycle.outcome?.review_sha256 === stage.review.review_sha256,
'White Rabbit candidate is not resolved under the reviewed media receipt');
const preCycles = read('data/WATERLINE-STATE.json').cycles.filter((row) => row.scope_id === 'star-trek');
ok(!preCycles.some((row) => row.lease_id === stage.lease.id), 'White Rabbit lease was already receipted');
const phaseChecker = new URL('./white-rabbit-prior-phase.mjs', import.meta.url);
run('validate bounded prior-cycle candidate phase before receipt', process.execPath, [phaseChecker.pathname, stage.lease.id]);

const reviewedAt = new Date().toISOString();
const cycleInputPath = `${process.env.RUNNER_TEMP || '/tmp'}/white-rabbit-cycle-input-${process.pid}.json`;
write(cycleInputPath, {
  scope_id: 'star-trek',
  lease_id: stage.lease.id,
  outcome: 'completed',
  note: 'The rail-selected White Rabbit obligation resolved as James Doohan’s unseen voice performance for the animated 2269 appearance in Once Upon a Planet, with an exact role-bound character image, a separate public-domain performer portrait, correction of the combined physical-and-voice queue hint, and no transfer of William Blackburn’s live-action physical portrayal, any physical performance, or unsupported vocal-processing, animation, character-design, or other maker credit.',
  evidence: [
    {
      type: 'workflow-run',
      value: `GitHub Actions White Rabbit publication run ${executionInput.workflow_run}; candidate job ${executionInput.candidate_job}; independent review job ${executionInput.independent_review_job}; publication job ${executionInput.publication_job}`,
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
run('record White Rabbit waterline cycle', process.execPath, [
  'scripts/waterline.mjs', 'record-cycle', '--input', cycleInputPath,
]);

const water = read('data/WATERLINE-STATE.json');
const cycles = water.cycles.filter((row) => row.scope_id === 'star-trek');
const cycle = cycles.find((row) => row.lease_id === stage.lease.id);
ok(cycle?.outcome === 'completed'
  && cycle.task_statuses?.[TASK] === 'resolved'
  && cycle.reviewed_at === reviewedAt,
'White Rabbit cycle receipt drifted');
const event = jsonl('data/journal/waterline.jsonl').find(
  (row) => row.lease_id === stage.lease.id && row.receipt_id === cycle.id,
);
ok(event, 'White Rabbit waterline event is missing');

const registryPath = 'data/ESTATE-REGISTRY.json';
const registry = read(registryPath);
const estate = registry.estates.find((row) => row.id === 'star-trek');
ok(estate, 'Star Trek estate is missing');
estate.next_gate = `Star Trek reviewed White Rabbit cycle ${cycle.id} resolved James Doohan as the White Rabbit’s unseen voice in Once Upon a Planet within the preserved 2,228-task denominator; 1,826 tasks remain queued. The exact animated White Rabbit character image and public-domain neutral performer portrait are verified separately, the combined physical-and-voice queue hint is corrected to Doohan’s voice-only contribution, William Blackburn’s live-action physical portrayal remains distinct, physical performance and maker attribution remain unresolved, and any later cycle must begin from the repository-native thesis rail, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
write(registryPath, registry);
run('refresh adapter baseline registry binding', process.execPath, ['scripts/census-adapter.mjs', 'write']);



const koraxReceipt = read(KORAX_RECEIPT_PATH);
const koraxBody = structuredClone(koraxReceipt); delete koraxBody.receipt_sha256;
ok(fileSha(KORAX_RECEIPT_PATH) === KORAX_RECEIPT_FILE_SHA && koraxReceipt.receipt_sha256 === KORAX_RECEIPT_ID && koraxReceipt.receipt_sha256 === sha(pretty(koraxBody)), 'Korax receipt custody drifted');
ok(fileSha(KORAX_CHECKER_PATH) === KORAX_CHECKER_SHA, 'Korax checker custody drifted');

const korReceipt = read(KOR_RECEIPT_PATH);
const korBody = structuredClone(korReceipt); delete korBody.receipt_sha256;
ok(fileSha(KOR_RECEIPT_PATH) === KOR_RECEIPT_FILE_SHA && korReceipt.receipt_sha256 === KOR_RECEIPT_ID && korReceipt.receipt_sha256 === sha(pretty(korBody)), 'Kor receipt custody drifted');
ok(fileSha(KOR_CHECKER_PATH) === KOR_CHECKER_SHA, 'Kor checker custody drifted');

const kolothReceipt = read(KOLOTH_RECEIPT_PATH);
const kolothBody = structuredClone(kolothReceipt); delete kolothBody.receipt_sha256;
ok(fileSha(KOLOTH_RECEIPT_PATH) === KOLOTH_RECEIPT_FILE_SHA
  && kolothReceipt.receipt_sha256 === KOLOTH_RECEIPT_ID
  && kolothReceipt.receipt_sha256 === sha(pretty(kolothBody)),
'Koloth receipt custody drifted');
ok(fileSha(KOLOTH_CHECKER_PATH) === KOLOTH_CHECKER_SHA, 'Koloth checker custody drifted');

const kazReceipt = read(KAZ_RECEIPT_PATH);
ok(fileSha(KAZ_RECEIPT_PATH) === KAZ_RECEIPT_FILE_SHA
  && kazReceipt.receipt_sha256 === KAZ_RECEIPT_ID
  && kazReceipt.reviewed_cycle?.id === KAZ_CYCLE_ID,
'Kaz receipt custody drifted');
ok(fileSha(KAZ_CHECKER_PATH) === KAZ_CHECKER_SHA, 'Kaz checker custody drifted');

const guardianReceipt = read(GUARDIAN_RECEIPT_PATH);
ok(fileSha(GUARDIAN_RECEIPT_PATH) === GUARDIAN_RECEIPT_FILE_SHA
  && guardianReceipt.receipt_sha256 === GUARDIAN_RECEIPT_ID
  && guardianReceipt.reviewed_cycle?.id === GUARDIAN_CYCLE_ID,
'Guardian receipt custody drifted');
ok(fileSha(GUARDIAN_CHECKER_PATH) === GUARDIAN_CHECKER_SHA, 'Guardian checker custody drifted');

const landruReceipt = read(LANDRU_RECEIPT_PATH);
ok(fileSha(LANDRU_RECEIPT_PATH) === LANDRU_RECEIPT_FILE_SHA
  && landruReceipt.receipt_sha256 === LANDRU_RECEIPT_ID
  && landruReceipt.reviewed_cycle?.id === LANDRU_CYCLE_ID,
'Landru receipt custody drifted');
ok(fileSha(LANDRU_CHECKER_PATH) === LANDRU_CHECKER_SHA, 'Landru checker custody drifted');

const curzonReceipt = read(CURZON_RECEIPT_PATH);
ok(fileSha(CURZON_RECEIPT_PATH) === CURZON_RECEIPT_FILE_SHA
  && curzonReceipt.receipt_sha256 === CURZON_RECEIPT_ID
  && curzonReceipt.reviewed_cycle?.id === CURZON_CYCLE_ID,
'Curzon receipt custody drifted');
ok(fileSha(CURZON_CHECKER_PATH) === CURZON_CHECKER_SHA, 'Curzon checker custody drifted');

const armusReceipt = read(ARMUS_RECEIPT_PATH);
ok(fileSha(ARMUS_RECEIPT_PATH) === ARMUS_RECEIPT_FILE_SHA
  && armusReceipt.receipt_sha256 === ARMUS_RECEIPT_ID,
'Armus receipt custody drifted');
ok(fileSha(ARMUS_CHECKER_PATH) === ARMUS_CHECKER_SHA
  && fileSha(ARMUS_HISTORICAL_PATH) === ARMUS_HISTORICAL_SHA,
'Armus checker custody drifted');

const m5Receipt = read(M5_RECEIPT_PATH);
ok(fileSha(M5_RECEIPT_PATH) === M5_RECEIPT_FILE_SHA
  && m5Receipt.receipt_sha256 === M5_RECEIPT_ID,
'M-5 receipt custody drifted');
const m5Comp = read(M5_COMP_PATH);
ok(fileSha(M5_CHECKER_PATH) === M5_CHECKER_SHA
  && fileSha(M5_PREVIOUS_WRAPPER_PATH) === M5_PREVIOUS_SHA
  && fileSha(M5_HISTORICAL_PATH) === M5_HISTORICAL_SHA
  && fileSha(M5_COMP_PATH) === M5_COMP_FILE_SHA
  && m5Comp.receipt_sha256 === M5_COMP_ID,
'M-5 checker and composability custody drifted');

const packagePath = 'package.json';
const packageJson = read(packagePath);
packageJson.scripts['star-trek:white-rabbit-cycle:check'] = 'node scripts/star-trek-white-rabbit-cycle.mjs';
if (!packageJson.scripts['autopilot:fixtures'].includes('npm run star-trek:white-rabbit-cycle:check')) {
  packageJson.scripts['autopilot:fixtures'] += ' && npm run star-trek:white-rabbit-cycle:check';
}
write(packagePath, packageJson);

const task = read('data/AUTOPILOT.json').jobs.find((row) => row.id === TASK);
const card = read('data/specimens.json').find((row) => row.id === WALL);
const sourceRow = read('data/SOURCES.json').find((row) => row.id === WALL);
const facets = read('data/MEDIA-AUDIT.json').items
  .filter((row) => row.wall_id === WALL)
  .sort((a, b) => a.side.localeCompare(b.side));
const claims = jsonl('data/journal/autopilot.jsonl').filter(
  (row) => row.op === 'lease.claimed' && row.scope === 'star-trek',
);
const claim = claims.find((row) => row.lease_id === stage.lease.id && row.task_id === TASK);
const acceptance = jsonl('data/journal/candidates.jsonl').find(
  (row) => row.op === 'draft.accept' && row.specimen === WALL,
);
const queueAfter = counts(read('data/AUTOPILOT.json').jobs);
same(queueAfter, {
  total: 2228,
  queued: 1826,
  resolved: 401,
  blocked: 0,
  rejected: 1,
  in_flight: 0,
}, 'White Rabbit terminal queue drifted');
ok(task && card && sourceRow && facets.length === 2 && claim && acceptance,
'White Rabbit final canonical inputs are incomplete');

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
  korax_receipt_path: KORAX_RECEIPT_PATH,
  korax_receipt_file_sha256: KORAX_RECEIPT_FILE_SHA,
  korax_receipt_identity: KORAX_RECEIPT_ID,
  korax_checker_path: KORAX_CHECKER_PATH,
  korax_checker_sha256: KORAX_CHECKER_SHA,
  korax_cycle_id: KORAX_CYCLE_ID,
  kor_receipt_path: KOR_RECEIPT_PATH,
  kor_receipt_file_sha256: KOR_RECEIPT_FILE_SHA,
  kor_receipt_identity: KOR_RECEIPT_ID,
  kor_checker_path: KOR_CHECKER_PATH,
  kor_checker_sha256: KOR_CHECKER_SHA,
  kor_cycle_id: KOR_CYCLE_ID,
  koloth_receipt_path: KOLOTH_RECEIPT_PATH,
  koloth_receipt_file_sha256: KOLOTH_RECEIPT_FILE_SHA,
  koloth_receipt_identity: KOLOTH_RECEIPT_ID,
  koloth_checker_path: KOLOTH_CHECKER_PATH,
  kor_checker_sha256: KOR_CHECKER_SHA,
  koloth_checker_sha256: KOLOTH_CHECKER_SHA,
  koloth_cycle_id: KOLOTH_CYCLE_ID,
  kaz_receipt_path: KAZ_RECEIPT_PATH,
  kaz_receipt_file_sha256: KAZ_RECEIPT_FILE_SHA,
  kaz_receipt_identity: KAZ_RECEIPT_ID,
  kaz_checker_path: KAZ_CHECKER_PATH,
  kaz_checker_sha256: KAZ_CHECKER_SHA,
  kaz_cycle_id: KAZ_CYCLE_ID,
  guardian_receipt_path: GUARDIAN_RECEIPT_PATH,
  guardian_receipt_file_sha256: GUARDIAN_RECEIPT_FILE_SHA,
  guardian_receipt_identity: GUARDIAN_RECEIPT_ID,
  guardian_checker_path: GUARDIAN_CHECKER_PATH,
  guardian_checker_sha256: GUARDIAN_CHECKER_SHA,
  guardian_cycle_id: GUARDIAN_CYCLE_ID,
  landru_receipt_path: LANDRU_RECEIPT_PATH,
  landru_receipt_file_sha256: LANDRU_RECEIPT_FILE_SHA,
  landru_receipt_identity: LANDRU_RECEIPT_ID,
  landru_checker_path: LANDRU_CHECKER_PATH,
  landru_checker_sha256: LANDRU_CHECKER_SHA,
  landru_cycle_id: LANDRU_CYCLE_ID,
  curzon_receipt_path: CURZON_RECEIPT_PATH,
  curzon_receipt_file_sha256: CURZON_RECEIPT_FILE_SHA,
  curzon_receipt_identity: CURZON_RECEIPT_ID,
  curzon_checker_path: CURZON_CHECKER_PATH,
  curzon_checker_sha256: CURZON_CHECKER_SHA,
  curzon_cycle_id: CURZON_CYCLE_ID,
  armus_receipt_path: ARMUS_RECEIPT_PATH,
  armus_receipt_file_sha256: ARMUS_RECEIPT_FILE_SHA,
  armus_receipt_identity: ARMUS_RECEIPT_ID,
  armus_checker_path: ARMUS_CHECKER_PATH,
  armus_checker_sha256: ARMUS_CHECKER_SHA,
  armus_historical_checker_path: ARMUS_HISTORICAL_PATH,
  armus_historical_checker_sha256: ARMUS_HISTORICAL_SHA,
  m5_receipt_path: M5_RECEIPT_PATH,
  m5_receipt_file_sha256: M5_RECEIPT_FILE_SHA,
  m5_receipt_identity: M5_RECEIPT_ID,
  m5_checker_path: M5_CHECKER_PATH,
  m5_checker_sha256: M5_CHECKER_SHA,
  m5_previous_wrapper_path: M5_PREVIOUS_WRAPPER_PATH,
  m5_previous_wrapper_sha256: M5_PREVIOUS_SHA,
  m5_historical_checker_path: M5_HISTORICAL_PATH,
  m5_historical_checker_sha256: M5_HISTORICAL_SHA,
  m5_composability_receipt_path: M5_COMP_PATH,
  m5_composability_receipt_file_sha256: M5_COMP_FILE_SHA,
  m5_composability_receipt_identity: M5_COMP_ID,
};

const checkerSource = `#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
const RECEIPT=${JSON.stringify(RECEIPT_PATH)}, CHECKER=${JSON.stringify(CHECKER_PATH)};
const TASK=${JSON.stringify(TASK)}, LEASE=${JSON.stringify(stage.lease.id)}, WALL=${JSON.stringify(WALL)}, CYCLE=${JSON.stringify(cycle.id)}, EVENT=${JSON.stringify(event.id)}, REVIEW=${JSON.stringify(reviewedAt)};
const PERFORMER=${JSON.stringify(PERFORMER)}, ROLE=${JSON.stringify(ROLE)}, SOURCE=${JSON.stringify(SOURCE)}, FINGERPRINT=${JSON.stringify(FINGERPRINT)};
const MAIN=${JSON.stringify(MAIN)}, CANDIDATE=${JSON.stringify(meta.candidate_commit)}, TREE=${JSON.stringify(meta.candidate_tree)}, PATH_SHA=${JSON.stringify(meta.candidate_path_ledger_sha256)}, REVIEW_ID=${JSON.stringify(review.review_sha256)}, REVIEW_FILE=${JSON.stringify(fileSha(reviewPath))}, PUBLICATION_RUN=${JSON.stringify(executionInput.workflow_run)}, PUBLICATION_JOB=${JSON.stringify(executionInput.publication_job)};
const STILL_PATH=${JSON.stringify(STILL_PATH)}, STILL_SHA=${JSON.stringify(STILL_SHA)}, STILL_ORIGIN=${JSON.stringify(STILL_SOURCE)}, PORTRAIT_PATH=${JSON.stringify(PORTRAIT_PATH)}, PORTRAIT_SHA=${JSON.stringify(PORTRAIT_SHA)}, PORTRAIT_ORIGIN=${JSON.stringify(PORTRAIT_SOURCE)};
const TOTAL=2228, RESOLVED_FLOOR=401;
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+'\\n';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')), jsonl=f=>fs.readFileSync(f,'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse);
const ok=(x,m)=>{if(!x)throw Error(m)}, same=(a,b,m)=>ok(sj(a)===sj(b),m);
const receipt=read(RECEIPT), rb=structuredClone(receipt);delete rb.receipt_sha256;
ok(receipt.receipt_sha256===sha(pretty(rb))&&receipt.transaction==='STAR-TREK-CYCLE-WHITE-RABBIT'&&receipt.canonical_parent===MAIN,'White Rabbit receipt identity drifted');
ok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(CHECKER)),'White Rabbit checker hash drifted');
const state=read('data/AUTOPILOT.json'), trek=state.jobs.filter(x=>x.scope==='star-trek'), task=trek.find(x=>x.id===TASK);
ok(trek.length===TOTAL&&task?.status==='resolved'&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,'White Rabbit task drifted');
same(task.performance_modes,['physical-and-voice'],'White Rabbit queued mode hint drifted');
same(task.wall_ids,[WALL],'White Rabbit wall binding drifted');
const card=read('data/specimens.json').find(x=>x.id===WALL);
ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production==='Once Upon a Planet'&&card.universe==='Star Trek'&&card.years==='1973'&&card.kind==='voice'&&card.transform===2&&card.designer==='—'&&card.link===SOURCE,'White Rabbit canonical record drifted');
ok(card.reveal.includes('William Blackburn')&&card.reveal.includes('role-specific voice contribution')&&card.reveal.includes('physical performance'),'White Rabbit performance boundary drifted');
ok(card.references?.some(x=>x.claim==='performance'&&x.source===SOURCE)&&card.references?.some(x=>x.source.includes('Once_Upon_a_Planet_(episode)')),'White Rabbit source custody drifted');
ok(sha(fs.readFileSync(STILL_PATH))===STILL_SHA&&sha(fs.readFileSync(PORTRAIT_PATH))===PORTRAIT_SHA,'White Rabbit media bytes drifted');
ok(card.still?.origin===STILL_ORIGIN&&card.portrait?.origin===PORTRAIT_ORIGIN&&card.portrait?.license==='Public domain','White Rabbit media provenance drifted');
const source=read('data/SOURCES.json').find(x=>x.id===WALL);
same(source.still,card.still,'White Rabbit source still drifted');
same(source.portrait,card.portrait,'White Rabbit source portrait drifted');
const facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===WALL).sort((a,b)=>a.side.localeCompare(b.side));
ok(facets.length===2&&facets.every(x=>x.status==='verified'),'White Rabbit facets drifted');
const portrait=facets.find(x=>x.side==='portrait'), still=facets.find(x=>x.side==='still');
ok(still?.asset?.sha256===STILL_SHA&&still.claims?.identity?.value==='expected'&&still.claims?.presentation?.value==='character-depiction','White Rabbit still review drifted');
ok(portrait?.asset?.sha256===PORTRAIT_SHA&&portrait.claims?.identity?.value==='expected'&&portrait.claims?.presentation?.value==='neutral-human','White Rabbit portrait review drifted');
ok(receipt.task?.adjudicated_kind==='voice'&&receipt.task?.performance_mode==='voice-only'&&receipt.task?.queued_mode_hint?.[0]==='physical-and-voice'&&receipt.task?.maker_attribution==='unresolved'&&receipt.task?.vocal_transformation_measured===false,'White Rabbit adjudication drifted');
ok(receipt.canonical.record_sha256===sha(pretty(card))&&receipt.media.facets_sha256===sha(pretty(facets))&&receipt.media.source_ledger_sha256===sha(pretty(source)),'White Rabbit receipt projections drifted');
const claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek');
for(const row of claims){const b=structuredClone(row);delete b.id;ok(row.id==='apj_'+sha(JSON.stringify(b)).slice(0,24),'Star Trek claim is not content-addressed')}
const claim=claims.find(x=>x.lease_id===LEASE&&x.task_id===TASK);
ok(claim?.id===receipt.lease.claim_event_id,'White Rabbit claim drifted');
const acceptance=jsonl('data/journal/candidates.jsonl').filter(x=>x.op==='draft.accept'&&x.specimen===WALL);
ok(acceptance.length===1&&acceptance[0].id===receipt.candidate.event_id,'White Rabbit candidate event drifted');
const water=read('data/WATERLINE-STATE.json'), receipts=water.cycles.filter(x=>x.scope_id==='star-trek'), byLease=new Map();
for(const row of receipts){ok(!byLease.has(row.lease_id),'duplicate Star Trek cycle receipt');byLease.set(row.lease_id,row)}
const whiteRabbit=byLease.get(LEASE);
ok(whiteRabbit?.id===CYCLE&&whiteRabbit.outcome==='completed'&&whiteRabbit.task_statuses?.[TASK]==='resolved'&&whiteRabbit.reviewed_at===REVIEW,'White Rabbit cycle receipt drifted');
const cb=structuredClone(whiteRabbit);delete cb.id;
ok(CYCLE==='cycle_'+sha(sj(cb)).slice(0,24),'White Rabbit cycle is not content-addressed');
const events=jsonl('data/journal/waterline.jsonl').filter(x=>x.id===EVENT&&x.lease_id===LEASE&&x.receipt_id===CYCLE);
ok(events.length===1,'White Rabbit waterline event drifted');
const eb=structuredClone(events[0]);delete eb.id;
ok(EVENT==='waterline_'+sha(JSON.stringify(eb)).slice(0,24),'White Rabbit waterline event is not content-addressed');
const later=claims.filter(x=>Date.parse(x.at)>Date.parse(REVIEW)), unreceipted=later.filter(x=>!byLease.has(x.lease_id));
ok(unreceipted.length<=1,'more than one later Star Trek cycle is unreceipted');
ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later Star Trek task is active');
for(const row of later.filter(x=>byLease.has(x.lease_id))){const c=byLease.get(row.lease_id),j=trek.find(x=>x.id===row.task_id);ok(c.task_ids?.length===1&&c.task_ids[0]===row.task_id&&j?.status==='resolved','later receipted Star Trek cycle drifted')}
const resolved=trek.filter(x=>x.status==='resolved').length, queued=trek.filter(x=>x.status==='queued').length;
ok(resolved>=RESOLVED_FLOOR,'Star Trek resolved floor regressed');
if(later.length===0)same({total:trek.length,queued,resolved,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length},{total:2228,queued:1826,resolved:401,blocked:0,rejected:1,in_flight:0},'White Rabbit terminal queue drifted');
const latest=receipts.at(-1), registry=read('data/ESTATE-REGISTRY.json'), estate=registry.estates.find(x=>x.id==='star-trek'), registryQueued=queued+unreceipted.length;
ok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(registryQueued.toLocaleString('en-US')+' tasks remain queued'),'Star Trek registry phase gate drifted');
const baseline=read('data/review/adapter-sdk/BASELINE.json');
ok(baseline.inputs?.estate_registry?.sha256===sha(fs.readFileSync('data/ESTATE-REGISTRY.json')),'adapter baseline registry binding drifted');
const pc=receipt.prior_custody;
ok(sha(fs.readFileSync(pc.korax_receipt_path))===pc.korax_receipt_file_sha256&&read(pc.korax_receipt_path).receipt_sha256===pc.korax_receipt_identity&&sha(fs.readFileSync(pc.korax_checker_path))===pc.korax_checker_sha256,'White Rabbit lost Korax custody');
ok(sha(fs.readFileSync(pc.kor_receipt_path))===pc.kor_receipt_file_sha256&&read(pc.kor_receipt_path).receipt_sha256===pc.kor_receipt_identity&&sha(fs.readFileSync(pc.kor_checker_path))===pc.kor_checker_sha256,'White Rabbit lost Kor custody');
ok(sha(fs.readFileSync(pc.koloth_receipt_path))===pc.koloth_receipt_file_sha256&&read(pc.koloth_receipt_path).receipt_sha256===pc.koloth_receipt_identity&&sha(fs.readFileSync(pc.koloth_checker_path))===pc.koloth_checker_sha256,'White Rabbit lost Koloth custody');
ok(sha(fs.readFileSync(pc.kaz_receipt_path))===pc.kaz_receipt_file_sha256&&read(pc.kaz_receipt_path).receipt_sha256===pc.kaz_receipt_identity&&sha(fs.readFileSync(pc.kaz_checker_path))===pc.kaz_checker_sha256,'White Rabbit lost Kaz custody');
ok(sha(fs.readFileSync(pc.guardian_receipt_path))===pc.guardian_receipt_file_sha256&&read(pc.guardian_receipt_path).receipt_sha256===pc.guardian_receipt_identity&&sha(fs.readFileSync(pc.guardian_checker_path))===pc.guardian_checker_sha256,'White Rabbit lost Guardian custody');
ok(sha(fs.readFileSync(pc.landru_receipt_path))===pc.landru_receipt_file_sha256&&read(pc.landru_receipt_path).receipt_sha256===pc.landru_receipt_identity&&sha(fs.readFileSync(pc.landru_checker_path))===pc.landru_checker_sha256,'White Rabbit lost Landru custody');
ok(sha(fs.readFileSync(pc.curzon_receipt_path))===pc.curzon_receipt_file_sha256&&read(pc.curzon_receipt_path).receipt_sha256===pc.curzon_receipt_identity&&sha(fs.readFileSync(pc.curzon_checker_path))===pc.curzon_checker_sha256,'White Rabbit lost Curzon custody');
ok(sha(fs.readFileSync(pc.armus_receipt_path))===pc.armus_receipt_file_sha256&&read(pc.armus_receipt_path).receipt_sha256===pc.armus_receipt_identity&&sha(fs.readFileSync(pc.armus_checker_path))===pc.armus_checker_sha256&&sha(fs.readFileSync(pc.armus_historical_checker_path))===pc.armus_historical_checker_sha256,'White Rabbit lost Armus custody');
ok(sha(fs.readFileSync(pc.m5_receipt_path))===pc.m5_receipt_file_sha256&&read(pc.m5_receipt_path).receipt_sha256===pc.m5_receipt_identity&&sha(fs.readFileSync(pc.m5_checker_path))===pc.m5_checker_sha256&&sha(fs.readFileSync(pc.m5_previous_wrapper_path))===pc.m5_previous_wrapper_sha256&&sha(fs.readFileSync(pc.m5_historical_checker_path))===pc.m5_historical_checker_sha256&&sha(fs.readFileSync(pc.m5_composability_receipt_path))===pc.m5_composability_receipt_file_sha256&&read(pc.m5_composability_receipt_path).receipt_sha256===pc.m5_composability_receipt_identity,'White Rabbit lost M-5 custody');
const execution=structuredClone(receipt.execution), qualificationIdentity=execution.qualification_identity;delete execution.qualification_identity;
ok(qualificationIdentity===sha(sj(execution)),'White Rabbit qualification identity drifted');
ok(receipt.execution?.publication_run===PUBLICATION_RUN&&receipt.execution?.publication_job===PUBLICATION_JOB&&receipt.execution?.candidate_commit===CANDIDATE&&receipt.execution?.candidate_tree===TREE&&receipt.execution?.candidate_path_ledger_sha256===PATH_SHA&&receipt.execution?.independent_review_identity===REVIEW_ID&&receipt.execution?.independent_review_file_sha256===REVIEW_FILE,'White Rabbit execution custody drifted');
ok(read('package.json').scripts?.['star-trek:white-rabbit-cycle:check']==='node scripts/star-trek-white-rabbit-cycle.mjs','White Rabbit checker route drifted');
ok(receipt.boundary?.queued_mode_hint_promoted===false&&receipt.boundary?.other_white_rabbit_performers_conflated===false&&receipt.boundary?.physical_performance_attributed===false&&receipt.boundary?.vocal_transformation_measured===false&&receipt.boundary?.role_specific_maker_attributed===false&&receipt.boundary?.outside_human_dependency===false&&receipt.boundary?.owner_physical_action_required===false&&receipt.boundary?.additional_lease_issued===false,'White Rabbit authority boundary drifted');
ok(fs.readFileSync('sitemap.xml','utf8').includes('records/UC-1370/'),'White Rabbit permanent route missing');
console.log('star-trek-white-rabbit-cycle: PASS — exact animated White Rabbit voice custody, separate exact character and public-domain performer media, separate William Blackburn live-action physical portrayal, no physical-performance transfer, reviewed waterline closure, immutable Korax and prior-cycle custody, and later-cycle bounds are intact');
`;
fs.writeFileSync(CHECKER_PATH, checkerSource);
const checkerSha = fileSha(CHECKER_PATH);

const receiptBody = {
  version: 1,
  transaction: 'STAR-TREK-CYCLE-WHITE-RABBIT',
  generated_at: reviewedAt,
  canonical_parent: MAIN,
  task: {
    id: TASK,
    performer: PERFORMER,
    role: ROLE,
    production: 'Once Upon a Planet',
    year: '1973',
    source: SOURCE,
    source_fingerprint: FINGERPRINT,
    source_receipts: task.source_receipts,
    queued_mode_hint: task.performance_modes,
    adjudicated_kind: 'voice',
    performance_mode: 'voice-only',
    appearance: 'White Rabbit, animated 2269 appearance',
    distinct_prior_physical_portrayal: 'William Blackburn, live-action White Rabbit',
    physical_performance: 'not attributed to James Doohan',
    maker_attribution: 'unresolved',
    animation_maker_attribution: 'unresolved',
    character_design_maker_attribution: 'unresolved',
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
  canonical: { wall_id: WALL, record: card, record_sha256: sha(pretty(card)) },
  media: {
    still: 'verified',
    still_path: STILL_PATH,
    still_origin: STILL_SOURCE,
    still_sha256: STILL_SHA,
    portrait: 'verified',
    portrait_path: PORTRAIT_PATH,
    portrait_origin: PORTRAIT_SOURCE,
    portrait_author: 'NASA',
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
    prior_cycle_id: KORAX_CYCLE_ID,
    outcome: cycle.outcome,
    reviewed_at: reviewedAt,
  },
  qualification: {
    checker_path: CHECKER_PATH,
    denominator: 2228,
    resolved_floor: 401,
    checker_sha256: checkerSha,
  },
  boundary: {
    queued_mode_hint_promoted: false,
    other_white_rabbit_performers_conflated: false,
    physical_performance_attributed: false,
    vocal_transformation_measured: false,
    role_specific_maker_attributed: false,
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
run('validate permanent White Rabbit cycle', process.execPath, [CHECKER_PATH]);
run('validate immutable Korax cycle', process.execPath, [KORAX_CHECKER_PATH]);
run('validate immutable Kor cycle', process.execPath, [KOR_CHECKER_PATH]);
run('validate immutable Koloth cycle', process.execPath, [KOLOTH_CHECKER_PATH]);
run('validate immutable Kaz cycle', process.execPath, [KAZ_CHECKER_PATH]);
run('validate immutable Guardian cycle', process.execPath, [GUARDIAN_CHECKER_PATH]);
run('validate immutable Landru cycle', process.execPath, [LANDRU_CHECKER_PATH]);
run('validate immutable Curzon cycle', process.execPath, [CURZON_CHECKER_PATH]);
run('validate immutable Armus cycle', process.execPath, [ARMUS_CHECKER_PATH]);
run('validate immutable M-5 cycle', process.execPath, [M5_CHECKER_PATH]);
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
  korax_checker_sha256: KORAX_CHECKER_SHA,
  kor_checker_sha256: KOR_CHECKER_SHA,
  koloth_checker_sha256: KOLOTH_CHECKER_SHA,
  kaz_checker_sha256: KAZ_CHECKER_SHA,
  guardian_checker_sha256: GUARDIAN_CHECKER_SHA,
  landru_checker_sha256: LANDRU_CHECKER_SHA,
  curzon_checker_sha256: CURZON_CHECKER_SHA,
  armus_checker_sha256: ARMUS_CHECKER_SHA,
  m5_checker_sha256: M5_CHECKER_SHA,
  queue: queueAfter,
};
write(outPath, summary);
console.log(JSON.stringify(summary, null, 2));
