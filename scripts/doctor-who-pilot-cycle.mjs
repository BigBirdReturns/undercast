#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';

const TASK_ID = 'ap_6dfcb7b9254c26dc3f4b46b8';
const LEASE_ID = 'lease_51e3223a4810f3681aff9df4';
const OLD_CYCLE_ID = 'cycle_6a43df725e8b67cfdf2d43c1';
const CORRECTED_CYCLE_ID = 'cycle_93fcbfd214892eaf81d55fa3';
const SOURCE_URL = 'https://tardis.fandom.com/wiki/Commander_(The_Sontarans)';
const SOURCE_FINGERPRINT = 'f272dd90028ca998792a461c1547a334d58f7976484ff7ee2d299306763e0879';
const SOURCE_CONTENT_SHA256 = '2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966';
const PILOT_CLAIMED_AT = '2026-08-02T12:46:10-07:00';
const PILOT_REVIEWED_AT = '2026-08-02T17:50:14-07:00';
const PILOT_EXPIRES_AT = '2026-08-03T19:46:10.000Z';
const PILOT_READINESS_TOKEN = '282a013eb9ce501b80a2e548b78f48915cb3e1e21df3c25c664382fcf975046e';
const PILOT_CAPABILITY_PROFILE = 'text-vision';
const PILOT_CAPABILITY_POLICY_SHA256 = '07fcbefca2326ec964a2a8ca3bdb29924976bbe4c906d6ef5cc019a1b1889c19';
const PILOT_SELECTION_STRATEGY = 'priority-compatible';
const PILOT_SELECTION_BASIS = 'Highest-priority queued tasks compatible with the reviewed capability profile.';
const PILOT_CLAIM_EVENT_ID = 'apj_83ac485c5c4495fddc17ca56';
const WORKFLOW_RUN = 30775406860;
const WORKFLOW_JOB = 91569879972;
const ARTIFACT_NAME = 'doctor-who-pilot-cycle-001-30775406860';
const ARTIFACT_ID = 8841923422;
const ARTIFACT_SHA256 = '5419ee3d63af85ce664f5465ac1091fcd3c51e74c3c2335581516e23aa7aa493';
const PILOT_BASE = '75fd0a46d8201aae092df39cc6eabdbb48226cd7';
const PILOT_LAUNCHER = '2f6447ebdc1ed190b0ea5183303df7770885a4dc';
const PILOT_PRODUCT = 'bbbc407054b72c3a8af20557c8a5261a6321105f';
const PILOT_MERGE = '546cce8f8f64ec481a41d91a643e4ded943b653f';
const REVIEW_COMMENT_ID = 3701437097;
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readJsonl = (file) => fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stable(value));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };

const receipt = read('data/review/adapter-sdk/doctor-who-pilot-cycle-001.json');
const autopilot = read('data/AUTOPILOT.json');
const autopilotJournal = readJsonl('data/journal/autopilot.jsonl');
const specimens = read('data/specimens.json');
const sources = read('data/SOURCES.json');
const auditBytes = fs.readFileSync('data/MEDIA-AUDIT.json');
const audit = JSON.parse(auditBytes);
const waterline = read('data/WATERLINE-STATE.json');
const journal = readJsonl('data/journal/waterline.jsonl');

const cycles = waterline.cycles.filter((row) => row.scope_id === 'doctor-who' && row.lease_id === LEASE_ID);
if (cycles.length !== 1) fail('pilot must have exactly one Doctor Who cycle receipt');
const cycle = cycles[0];
if (cycle.id !== CORRECTED_CYCLE_ID || cycle.id === OLD_CYCLE_ID) fail('pilot cycle content identity is not corrected');
const cycleBody = structuredClone(cycle);
delete cycleBody.id;
if (cycle.id !== 'cycle_' + sha(stableJson(cycleBody)).slice(0, 24)) fail('pilot cycle content-addressed id drifted');
if (cycle.outcome !== 'completed' || cycle.task_ids.length !== 1 || cycle.task_ids[0] !== TASK_ID || cycle.task_statuses?.[TASK_ID] !== 'resolved') fail('pilot cycle terminal custody drifted');
if (cycle.claimed_at !== PILOT_CLAIMED_AT || cycle.reviewed_by !== 'chatgpt-second-desk' || cycle.reviewed_role !== 'second-desk' || cycle.reviewed_at !== PILOT_REVIEWED_AT || cycle.closed_at !== PILOT_REVIEWED_AT) fail('pilot cycle review or transaction boundary drifted');

const evidenceTypes = new Set((cycle.evidence || []).map((row) => row.type));
for (const required of ['workflow-run', 'commit', 'restart-proof']) {
  if (!evidenceTypes.has(required)) fail('pilot cycle evidence lacks ' + required);
}
const evidenceText = (cycle.evidence || []).map((row) => row.type + ': ' + row.value).join('\n');
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
if (/<[^>\n]+>/.test(evidenceText)) fail('pilot cycle evidence still contains a template placeholder');

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

const boundaryStart = Date.parse(cycle.claimed_at);
const boundaryEnd = Date.parse(cycle.reviewed_at);
const doctorClaims = autopilotJournal.filter((row) => row.op === 'lease.claimed' && row.scope === 'doctor-who');
for (const row of doctorClaims) {
  if (!Number.isFinite(Date.parse(row.at || ''))) fail('Doctor Who immutable lease claim has an invalid timestamp');
}
const boundaryClaims = doctorClaims.filter((row) => {
  const at = Date.parse(row.at);
  return at >= boundaryStart && at <= boundaryEnd;
});
if (boundaryClaims.length !== 1) fail('pilot reviewed boundary must contain exactly one Doctor Who lease claim');
const claim = boundaryClaims[0];
const claimBody = structuredClone(claim);
delete claimBody.id;
if (claim.version !== 1 || claim.id !== PILOT_CLAIM_EVENT_ID || claim.id !== 'apj_' + sha(JSON.stringify(claimBody)).slice(0, 24)) fail('pilot immutable lease claim content identity drifted');
if (claim.lease_id !== LEASE_ID || claim.task_id !== TASK_ID || claim.at !== cycle.claimed_at) fail('pilot immutable lease claim identity drifted');
if (claim.performer !== 'Dan Starkey' || claim.character !== 'Commander (The Sontarans)') fail('pilot immutable lease claim subject drifted');
if (claim.agent !== 'luna' || claim.agent !== receipt.lease?.agent || claim.expires_at !== PILOT_EXPIRES_AT || claim.readiness_token !== PILOT_READINESS_TOKEN) fail('pilot immutable lease claim operator or readiness custody drifted');
if (claim.capability_profile !== PILOT_CAPABILITY_PROFILE || claim.capability_policy_sha256 !== PILOT_CAPABILITY_POLICY_SHA256 || JSON.stringify(claim.required_capabilities) !== '[]' || claim.selection_strategy !== PILOT_SELECTION_STRATEGY || claim.selection_basis !== PILOT_SELECTION_BASIS) fail('pilot immutable lease claim capability custody drifted');
const exactLeaseClaims = doctorClaims.filter((row) => row.lease_id === LEASE_ID);
if (exactLeaseClaims.length !== 1) fail('pilot lease must have exactly one immutable claim event');

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
if (receipt.receipt_sha256 !== sha(JSON.stringify(stable(receiptClone)) + '\n')) fail('pilot receipt hash drifted');
if (receipt.version !== 1 || receipt.transaction !== 'DOCTOR-WHO-PILOT-CYCLE-001' || receipt.generated_at !== PILOT_REVIEWED_AT) fail('pilot permanent receipt envelope drifted');
if (receipt.base_sha !== PILOT_BASE || receipt.launcher_head !== PILOT_LAUNCHER) fail('pilot permanent restart envelope drifted');

const expectedTask = {
  id: TASK_ID,
  performer: 'Dan Starkey',
  character: 'Commander (The Sontarans)',
  mode: 'voice',
  source: SOURCE_URL,
  source_fingerprint: SOURCE_FINGERPRINT,
  source_content_sha256: SOURCE_CONTENT_SHA256,
  status: 'resolved',
};
for (const [key, value] of Object.entries(expectedTask)) {
  if (receipt.task?.[key] !== value) fail('pilot permanent task identity drifted at ' + key);
}
if (receipt.lease?.id !== LEASE_ID || receipt.lease?.agent !== 'luna' || receipt.lease?.outcome !== 'completed') fail('pilot permanent lease identity drifted');
if (receipt.canonical?.wall_id !== wallId || receipt.canonical?.universe !== wall.universe || receipt.canonical?.transform !== wall.transform || receipt.canonical?.kind !== wall.kind) fail('pilot permanent canonical identity drifted');
if (receipt.media?.still !== null || receipt.media?.portrait !== null || receipt.media?.dispositions?.still !== 'absent' || receipt.media?.dispositions?.portrait !== 'absent') fail('pilot permanent media disposition drifted');
if (receipt.reviewed_cycle?.id !== cycle.id || receipt.reviewed_cycle?.reviewed_at !== cycle.reviewed_at || receipt.reviewed_cycle?.reviewed_by !== cycle.reviewed_by || receipt.reviewed_cycle?.reviewed_role !== cycle.reviewed_role || receipt.reviewed_cycle?.outcome !== cycle.outcome) fail('pilot permanent receipt cycle binding drifted');
if (receipt.queue?.total !== doctor.length || receipt.queue?.queued !== queued || receipt.queue?.resolved !== resolved || receipt.queue?.in_flight !== inFlight) fail('pilot permanent queue receipt drifted');
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
if (qualification.persisted_lease_base_sha !== receipt.base_sha || qualification.launcher_head_sha !== receipt.launcher_head || qualification.source_content_sha256 !== receipt.task.source_content_sha256) fail('pilot permanent duplicated qualification identity drifted');

const correction = receipt.evidence_correction || {};
if (correction.previous_cycle_id !== OLD_CYCLE_ID || correction.corrected_cycle_id !== cycle.id || correction.corrected_journal_event_id !== event.id || !String(correction.finding || '').includes(String(REVIEW_COMMENT_ID))) fail('pilot evidence-correction receipt drifted');
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail('pilot permanent receipt still contains a template placeholder');
const boundary = receipt.boundary || {};
for (const key of ['second_lease_issued', 'generic_character_image_used', 'duplicate_portrait_bytes_used', 'unrelated_scope_mutated', 'roadmap_completion_claimed']) {
  if (boundary[key] !== false) fail('pilot boundary drifted at ' + key);
}

console.log('doctor-who-pilot-cycle: PASS — exact cycle evidence, content-addressed state and journal custody, one immutable in-boundary lease, one source-bound voice role, two honest media absences, and no second lease');
