#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  sha256,
  stable,
  stableJson,
  validateWaterlineState,
} from './lib/waterline.mjs';

const ROOT = process.cwd();
const TASK_ID = 'ap_6dfcb7b9254c26dc3f4b46b8';
const LEASE_ID = 'lease_51e3223a4810f3681aff9df4';
const OLD_CYCLE_ID = 'cycle_6a43df725e8b67cfdf2d43c1';
const REVIEWED_AT = '2026-08-02T17:50:14-07:00';
const WORKFLOW_RUN = 30775406860;
const WORKFLOW_JOB = 91569879972;
const ARTIFACT_NAME = 'doctor-who-pilot-cycle-001-30775406860';
const ARTIFACT_ID = 8841923422;
const ARTIFACT_SHA256 = '5419ee3d63af85ce664f5465ac1091fcd3c51e74c3c2335581516e23aa7aa493';
const PILOT_BASE = '75fd0a46d8201aae092df39cc6eabdbb48226cd7';
const PILOT_LAUNCHER = '2f6447ebdc1ed190b0ea5183303df7770885a4dc';
const PILOT_PRODUCT = 'bbbc407054b72c3a8af20557c8a5261a6321105f';
const PILOT_MERGE = '546cce8f8f64ec481a41d91a643e4ded943b653f';
const SOURCE_FINGERPRINT = 'f272dd90028ca998792a461c1547a334d58f7976484ff7ee2d299306763e0879';
const SOURCE_CONTENT_SHA256 = '2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966';
const REVIEW_COMMENT_ID = 3701437097;
const REPAIR_AT = process.env.REPAIR_AT;
const EXACT_MAIN = process.env.EXACT_MAIN;

if (!REPAIR_AT || !Number.isFinite(Date.parse(REPAIR_AT))) {
  throw new Error('REPAIR_AT must be an exact ISO date/time');
}
if (!/^[0-9a-f]{40}$/.test(EXACT_MAIN || '')) {
  throw new Error('EXACT_MAIN must be an exact commit SHA');
}

const abs = (file) => path.isAbsolute(file) ? file : path.join(ROOT, file);
const read = (file) => fs.readFileSync(abs(file), 'utf8');
const readJson = (file) => JSON.parse(read(file));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(abs(file)), { recursive: true });
  fs.writeFileSync(abs(file), text);
};
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const receiptSha256 = (value) => {
  const clone = structuredClone(value);
  delete clone.receipt_sha256;
  return sha256(`${JSON.stringify(stable(clone))}\n`);
};
const fail = (message) => { throw new Error(message); };

const statePath = 'data/WATERLINE-STATE.json';
const configPath = 'data/WATERLINE.json';
const journalPath = 'data/journal/waterline.jsonl';
const receiptPath = 'data/review/adapter-sdk/doctor-who-pilot-cycle-001.json';
const docsPath = 'docs/AUTOPILOT.md';
const checkerPath = 'scripts/doctor-who-pilot-cycle.mjs';

const state = readJson(statePath);
const config = readJson(configPath);
const cycleMatches = state.cycles
  .map((row, index) => ({ row, index }))
  .filter(({ row }) => row.scope_id === 'doctor-who' && row.lease_id === LEASE_ID);

if (cycleMatches.length !== 1) {
  fail(`expected one Doctor Who cycle for ${LEASE_ID}, found ${cycleMatches.length}`);
}
const { row: oldCycle, index: cycleIndex } = cycleMatches[0];
if (oldCycle.id !== OLD_CYCLE_ID) fail(`unexpected pre-correction cycle id ${oldCycle.id}`);
if (oldCycle.outcome !== 'completed') fail(`pilot cycle outcome drifted: ${oldCycle.outcome}`);
if (oldCycle.reviewed_at !== REVIEWED_AT || oldCycle.closed_at !== REVIEWED_AT) {
  fail('pilot cycle review timestamp drifted');
}
if (oldCycle.task_ids.length !== 1 || oldCycle.task_ids[0] !== TASK_ID || oldCycle.task_statuses?.[TASK_ID] !== 'resolved') {
  fail('pilot cycle task custody drifted');
}

const exactEvidence = [
  {
    type: 'workflow-run',
    value: `GitHub Actions run ${WORKFLOW_RUN}, job ${WORKFLOW_JOB} — exact live-lease binding, candidate and product gates, workflow-free publication, and branch-lease push.`,
  },
  {
    type: 'artifact',
    value: `${ARTIFACT_NAME}; artifact id ${ARTIFACT_ID}; sha256:${ARTIFACT_SHA256}.`,
  },
  {
    type: 'commit',
    value: `Workflow-free cycle product ${PILOT_PRODUCT}; merged to main as ${PILOT_MERGE}.`,
  },
  {
    type: 'restart-proof',
    value: `Lease ${LEASE_ID} and task ${TASK_ID} were persisted at exact main parent ${PILOT_BASE}; launcher ${PILOT_LAUNCHER} resumed that durable state under source fingerprint ${SOURCE_FINGERPRINT} and source-content SHA-256 ${SOURCE_CONTENT_SHA256} before run ${WORKFLOW_RUN} completed it.`,
  },
  {
    type: 'review-finding',
    value: `PR #185 review comment ${REVIEW_COMMENT_ID} required replacement of template evidence before any later custody release.`,
  },
];

const cycleBody = structuredClone(oldCycle);
delete cycleBody.id;
cycleBody.evidence = exactEvidence;
const correctedCycle = {
  id: `cycle_${sha256(stableJson(cycleBody)).slice(0, 24)}`,
  ...cycleBody,
};
if (correctedCycle.id === OLD_CYCLE_ID) fail('corrected evidence did not change the content-addressed cycle id');

state.cycles[cycleIndex] = correctedCycle;
state.updated_at = REPAIR_AT;
validateWaterlineState(state, config);
writeJson(statePath, state);

const journalLines = read(journalPath).split(/\r?\n/);
const parsedJournal = journalLines.map((line, index) => {
  if (!line.trim()) return null;
  try { return JSON.parse(line); }
  catch (error) { fail(`waterline journal line ${index + 1} is invalid JSON: ${error.message}`); }
});
const journalMatches = parsedJournal
  .map((row, index) => ({ row, index }))
  .filter(({ row }) => row?.op === 'cycle.receipted' && row.scope === 'doctor-who' && row.lease_id === LEASE_ID);
if (journalMatches.length !== 1) {
  fail(`expected one Doctor Who cycle journal event, found ${journalMatches.length}`);
}
const oldEvent = journalMatches[0].row;
if (oldEvent.receipt_id !== OLD_CYCLE_ID) fail(`unexpected pre-correction journal receipt ${oldEvent.receipt_id}`);
const journalBody = {
  version: 1,
  op: 'cycle.receipted',
  at: correctedCycle.reviewed_at,
  scope: correctedCycle.scope_id,
  lease_id: correctedCycle.lease_id,
  receipt_id: correctedCycle.id,
  outcome: correctedCycle.outcome,
};
const correctedEvent = {
  id: `waterline_${sha256(JSON.stringify(journalBody)).slice(0, 24)}`,
  ...journalBody,
};
journalLines[journalMatches[0].index] = JSON.stringify(correctedEvent);
write(journalPath, `${journalLines.filter((line, index) => line.trim() || index < journalLines.length - 1).join('\n').replace(/\n+$/, '')}\n`);

const receipt = readJson(receiptPath);
if (receipt.task?.id !== TASK_ID || receipt.lease?.id !== LEASE_ID) fail('permanent pilot receipt identity drifted');
if (receipt.reviewed_cycle?.id !== OLD_CYCLE_ID) fail(`permanent receipt points to ${receipt.reviewed_cycle?.id}`);
receipt.reviewed_cycle.id = correctedCycle.id;
receipt.qualification = {
  ...receipt.qualification,
  qualifying_workflow_run: WORKFLOW_RUN,
  qualifying_workflow_job: WORKFLOW_JOB,
  artifact_name: ARTIFACT_NAME,
  artifact_id: ARTIFACT_ID,
  artifact_sha256: ARTIFACT_SHA256,
  workflow_free_product_sha: PILOT_PRODUCT,
  merged_cycle_commit_sha: PILOT_MERGE,
  persisted_lease_base_sha: PILOT_BASE,
  launcher_head_sha: PILOT_LAUNCHER,
  source_content_sha256: SOURCE_CONTENT_SHA256,
  review_comment_id: REVIEW_COMMENT_ID,
};
receipt.evidence_correction = {
  corrected_at: REPAIR_AT,
  repair_base_main_sha: EXACT_MAIN,
  previous_cycle_id: OLD_CYCLE_ID,
  corrected_cycle_id: correctedCycle.id,
  corrected_journal_event_id: correctedEvent.id,
  finding: `PR #185 Codex review comment ${REVIEW_COMMENT_ID}`,
  method: 'Replaced template evidence with exact run, job, artifact, commit, and restart references; then recomputed the content-addressed cycle and journal identities.',
};
receipt.receipt_sha256 = receiptSha256(receipt);
writeJson(receiptPath, receipt);

const docs = read(docsPath);
const oldDocs = "Doctor Who's first active cycle is receipted by `data/review/adapter-sdk/doctor-who-pilot-cycle-001.json`. The exact Dan Starkey voice task resolves to one canonical `Doctor Who` record with both media facets honestly absent. The reviewed cycle receipt is required before the global lock releases; the transaction itself issues no second lease. Run `npm run doctor-who:pilot-cycle:check` to verify the permanent boundary.";
const newDocs = `Doctor Who's first active cycle is receipted by \`data/review/adapter-sdk/doctor-who-pilot-cycle-001.json\`. The exact Dan Starkey voice task resolves to one canonical \`Doctor Who\` record with both media facets honestly absent. The content-addressed reviewed cycle is \`${correctedCycle.id}\`; its release authority is bound to workflow run \`${WORKFLOW_RUN}\`, job \`${WORKFLOW_JOB}\`, artifact \`${ARTIFACT_ID}\` and digest, workflow-free product \`${PILOT_PRODUCT}\`, merge commit \`${PILOT_MERGE}\`, and the persisted-lease restart chain. Run \`npm run doctor-who:pilot-cycle:check\` to reject placeholders, mismatched journal custody, missing exact transaction references, or any second lease.`;
if (docs.split(oldDocs).length !== 2) fail('Doctor Who pilot documentation insertion point drifted');
write(docsPath, docs.replace(oldDocs, newDocs));

const checker = `#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';

const TASK_ID = '${TASK_ID}';
const LEASE_ID = '${LEASE_ID}';
const OLD_CYCLE_ID = '${OLD_CYCLE_ID}';
const CORRECTED_CYCLE_ID = '${correctedCycle.id}';
const SOURCE_FINGERPRINT = '${SOURCE_FINGERPRINT}';
const SOURCE_CONTENT_SHA256 = '${SOURCE_CONTENT_SHA256}';
const WORKFLOW_RUN = ${WORKFLOW_RUN};
const WORKFLOW_JOB = ${WORKFLOW_JOB};
const ARTIFACT_NAME = '${ARTIFACT_NAME}';
const ARTIFACT_ID = ${ARTIFACT_ID};
const ARTIFACT_SHA256 = '${ARTIFACT_SHA256}';
const PILOT_BASE = '${PILOT_BASE}';
const PILOT_LAUNCHER = '${PILOT_LAUNCHER}';
const PILOT_PRODUCT = '${PILOT_PRODUCT}';
const PILOT_MERGE = '${PILOT_MERGE}';
const REVIEW_COMMENT_ID = ${REVIEW_COMMENT_ID};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stable(value));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };

const receipt = read('data/review/adapter-sdk/doctor-who-pilot-cycle-001.json');
const autopilot = read('data/AUTOPILOT.json');
const specimens = read('data/specimens.json');
const sources = read('data/SOURCES.json');
const auditBytes = fs.readFileSync('data/MEDIA-AUDIT.json');
const audit = JSON.parse(auditBytes);
const waterline = read('data/WATERLINE-STATE.json');
const journalText = fs.readFileSync('data/journal/waterline.jsonl', 'utf8');
const journal = journalText.split(/\\r?\\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));

const cycles = waterline.cycles.filter((row) => row.scope_id === 'doctor-who' && row.lease_id === LEASE_ID);
if (cycles.length !== 1) fail('pilot must have exactly one Doctor Who cycle receipt');
const cycle = cycles[0];
if (cycle.id !== CORRECTED_CYCLE_ID || cycle.id === OLD_CYCLE_ID) fail('pilot cycle content identity is not corrected');
const cycleBody = structuredClone(cycle);
delete cycleBody.id;
if (cycle.id !== 'cycle_' + sha(stableJson(cycleBody)).slice(0, 24)) fail('pilot cycle content-addressed id drifted');
if (cycle.outcome !== 'completed' || cycle.task_ids.length !== 1 || cycle.task_ids[0] !== TASK_ID || cycle.task_statuses?.[TASK_ID] !== 'resolved') fail('pilot cycle terminal custody drifted');
if (cycle.reviewed_by !== 'chatgpt-second-desk' || cycle.reviewed_role !== 'second-desk' || cycle.reviewed_at !== '${REVIEWED_AT}' || cycle.closed_at !== '${REVIEWED_AT}') fail('pilot cycle review custody drifted');

const evidenceTypes = new Set((cycle.evidence || []).map((row) => row.type));
for (const required of ['workflow-run', 'commit', 'restart-proof']) {
  if (!evidenceTypes.has(required)) fail('pilot cycle evidence lacks ' + required);
}
const evidenceText = (cycle.evidence || []).map((row) => row.type + ': ' + row.value).join('\\n');
const exactTokens = [
  String(WORKFLOW_RUN),
  String(WORKFLOW_JOB),
  ARTIFACT_NAME,
  String(ARTIFACT_ID),
  ARTIFACT_SHA256,
  PILOT_BASE,
  PILOT_LAUNCHER,
  PILOT_PRODUCT,
  PILOT_MERGE,
  SOURCE_FINGERPRINT,
  SOURCE_CONTENT_SHA256,
  String(REVIEW_COMMENT_ID),
];
for (const token of exactTokens) if (!evidenceText.includes(token)) fail('pilot cycle evidence lacks exact token ' + token);
if (/<[^>\\n]+>/.test(evidenceText)) fail('pilot cycle evidence still contains a template placeholder');

const events = journal.filter((row) => row.op === 'cycle.receipted' && row.scope === 'doctor-who' && row.lease_id === LEASE_ID);
if (events.length !== 1) fail('pilot must have exactly one Doctor Who cycle journal event');
const event = events[0];
if (event.receipt_id !== cycle.id || event.at !== cycle.reviewed_at || event.outcome !== cycle.outcome || event.version !== 1) fail('pilot cycle journal custody drifted');
const eventBody = {
  version: event.version,
  op: event.op,
  at: event.at,
  scope: event.scope,
  lease_id: event.lease_id,
  receipt_id: event.receipt_id,
  outcome: event.outcome,
};
if (event.id !== 'waterline_' + sha(JSON.stringify(eventBody)).slice(0, 24)) fail('pilot cycle journal event id drifted');
if (journal.some((row) => row.receipt_id === OLD_CYCLE_ID)) fail('superseded pilot cycle journal receipt survived');

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== 'doctor-who' || job.status !== 'resolved') fail('pilot task is not resolved');
if (job.source_fingerprint !== SOURCE_FINGERPRINT) fail('pilot source fingerprint drifted');
if (!Array.isArray(job.wall_ids) || job.wall_ids.length !== 1) fail('pilot must resolve to exactly one wall id');
const wallId = job.wall_ids[0];
const wall = specimens.find((row) => row.id === wallId);
if (!wall || wall.actor !== 'Dan Starkey' || wall.character !== 'Commander (The Sontarans)' || wall.universe !== 'Doctor Who' || wall.kind !== 'voice' || wall.transform !== 2) fail('canonical pilot row drifted');
const source = sources.find((row) => row.id === wallId);
if (!source || source.still !== null || source.portrait !== null) fail('audio-only pilot media must remain explicitly null');
const pilotItems = (audit.items || []).filter((row) => row.wall_id === wallId);
if (pilotItems.length !== 2 || !pilotItems.every((row) => row.status === 'absent') || new Set(pilotItems.map((row) => row.side)).size !== 2) fail('both pilot media facets must be honestly absent');

const doctor = autopilot.jobs.filter((row) => row.scope === 'doctor-who');
const queued = doctor.filter((row) => row.status === 'queued').length;
const inFlight = doctor.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length;
const resolved = doctor.filter((row) => row.status === 'resolved').length;
if (doctor.length !== 316 || queued !== 315 || resolved !== 1 || inFlight !== 0) fail('Doctor Who queue denominator or terminal state drifted');

const receiptClone = structuredClone(receipt);
delete receiptClone.receipt_sha256;
if (receipt.receipt_sha256 !== sha(JSON.stringify(stable(receiptClone)) + '\\n')) fail('pilot receipt hash drifted');
if (receipt.task?.id !== TASK_ID || receipt.lease?.id !== LEASE_ID || receipt.canonical?.wall_id !== wallId) fail('pilot receipt identity drifted');
if (receipt.reviewed_cycle?.id !== cycle.id || receipt.reviewed_cycle?.reviewed_at !== cycle.reviewed_at || receipt.reviewed_cycle?.outcome !== cycle.outcome) fail('pilot permanent receipt cycle binding drifted');
if (receipt.media?.media_audit_sha256 !== sha(auditBytes)) fail('pilot media-audit receipt drifted');

const qualification = receipt.qualification || {};
const exactQualification = {
  qualifying_workflow_run: WORKFLOW_RUN,
  qualifying_workflow_job: WORKFLOW_JOB,
  artifact_name: ARTIFACT_NAME,
  artifact_id: ARTIFACT_ID,
  artifact_sha256: ARTIFACT_SHA256,
  workflow_free_product_sha: PILOT_PRODUCT,
  merged_cycle_commit_sha: PILOT_MERGE,
  persisted_lease_base_sha: PILOT_BASE,
  launcher_head_sha: PILOT_LAUNCHER,
  source_content_sha256: SOURCE_CONTENT_SHA256,
  review_comment_id: REVIEW_COMMENT_ID,
};
for (const [key, value] of Object.entries(exactQualification)) {
  if (qualification[key] !== value) fail('pilot permanent qualification drifted at ' + key);
}
const correction = receipt.evidence_correction || {};
if (correction.previous_cycle_id !== OLD_CYCLE_ID || correction.corrected_cycle_id !== cycle.id || correction.corrected_journal_event_id !== event.id || !String(correction.finding || '').includes(String(REVIEW_COMMENT_ID))) fail('pilot evidence-correction receipt drifted');
if (/<[^>\\n]+>/.test(JSON.stringify(receipt))) fail('pilot permanent receipt still contains a template placeholder');
if (receipt.boundary?.second_lease_issued || receipt.boundary?.generic_character_image_used || receipt.boundary?.duplicate_portrait_bytes_used) fail('pilot boundary drifted');

console.log('doctor-who-pilot-cycle: PASS — exact cycle evidence, content-addressed state and journal custody, one source-bound voice role, two honest media absences, and no second lease');
`;
write(checkerPath, checker);

const summary = {
  version: 1,
  transaction: 'DOCTOR-WHO-PILOT-CYCLE-EVIDENCE-CORRECTION',
  corrected_at: REPAIR_AT,
  repair_base_main_sha: EXACT_MAIN,
  task_id: TASK_ID,
  lease_id: LEASE_ID,
  previous_cycle_id: OLD_CYCLE_ID,
  corrected_cycle_id: correctedCycle.id,
  corrected_journal_event_id: correctedEvent.id,
  exact_evidence: {
    workflow_run: WORKFLOW_RUN,
    workflow_job: WORKFLOW_JOB,
    artifact_name: ARTIFACT_NAME,
    artifact_id: ARTIFACT_ID,
    artifact_sha256: ARTIFACT_SHA256,
    workflow_free_product_sha: PILOT_PRODUCT,
    merged_cycle_commit_sha: PILOT_MERGE,
    persisted_lease_base_sha: PILOT_BASE,
    launcher_head_sha: PILOT_LAUNCHER,
    source_fingerprint: SOURCE_FINGERPRINT,
    source_content_sha256: SOURCE_CONTENT_SHA256,
    review_comment_id: REVIEW_COMMENT_ID,
  },
  product_paths: [
    statePath,
    journalPath,
    receiptPath,
    docsPath,
    checkerPath,
  ],
  boundary: {
    media_audit_mutated: false,
    canonical_record_mutated: false,
    source_ledger_mutated: false,
    task_state_mutated: false,
    second_lease_issued: false,
  },
};
writeJson('/tmp/doctor-who-pilot-cycle-evidence-correction.json', summary);
console.log(JSON.stringify(summary, null, 2));
