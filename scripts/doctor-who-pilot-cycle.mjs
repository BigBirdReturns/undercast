#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';

const TASK_ID = 'ap_6dfcb7b9254c26dc3f4b46b8';
const LEASE_ID = 'lease_51e3223a4810f3681aff9df4';
const PILOT_WALL_ID = 'UC-1345';
const PILOT_MEDIA_ITEM_IDS = [
  "ma_ee364d31319f0943c9c4f8ce",
  "ma_f8ee1f03ec2173d75f6f85ea"
];
const PILOT_MEDIA_BINDING_SCOPE = 'doctor-who/UC-1345';
const PILOT_MEDIA_HISTORICAL_GLOBAL_SNAPSHOT_SHA256 = '36810c36bbe43f98c556fcd2c151522f7ac7af70357afb02ee1a711bb12831e3';
const PILOT_MEDIA_BINDING_NOTE = 'The completed pilot is bound only to its exact two media facets; unrelated scope votes may change the global audit without reopening this cycle.';
const OLD_CYCLE_ID = 'cycle_6a43df725e8b67cfdf2d43c1';
const CORRECTED_CYCLE_ID = 'cycle_93fcbfd214892eaf81d55fa3';
const CORRECTED_JOURNAL_EVENT_ID = 'waterline_4f10ff223cf4ff5cd1ccb07a';

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
const PILOT_SPECIMENS_SHA256 = '2b0a74f71b1768377f43ce45f923d917448950638cf8eb834e05783eee2f6256';
const PILOT_SOURCES_SHA256 = '03f8e2b5defea40b1d0014fedf7a2a36694b3acf745614bf92d7df3dbd9606d7';
const PRE_CYCLE_GATE_LOG_SHA256 = '0830e4b3ba4006b61095237fbc6c9db4e00dc869b061a982b353405a691fa4ff';
const PRODUCT_GATE_LOG_SHA256 = '80871b323dbc0bdbd5de1844b961f43cec791d83959f6a155aa00ba94de0bf0b';
const REVIEW_COMMENT_ID = 3701437097;

const EVIDENCE_CORRECTED_AT = '2026-08-02T23:58:53-07:00';
const EVIDENCE_REPAIR_BASE = 'e0e74df6c059f6a702487e07bcd0b4e3dc5e73ef';
const EVIDENCE_METHOD = 'Replaced template evidence with exact run, job, artifact, commit, and restart references; then recomputed the content-addressed cycle and journal identities.';
const MEDIA_BINDING_CORRECTED_AT = '2026-08-03T01:49:25-07:00';
const MEDIA_BINDING_REPAIR_BASE = '2530ed03ce61503eb3b7a458016da4cd9fe56f31';
const MEDIA_BINDING_DISCOVERY_RUN = 30796069007;
const MEDIA_BINDING_METHOD = 'Replaced the mutable sitewide audit-file hash with a content address over the exact two UC-1345 media facets.';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readJsonl = (file) => fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };
const assertExact = (actual, expected, label) => {
  if (stableJson(actual) !== stableJson(expected)) fail(label + ' drifted');
};

const receipt = read('data/review/adapter-sdk/doctor-who-pilot-cycle-001.json');
const autopilot = read('data/AUTOPILOT.json');
const autopilotJournal = readJsonl('data/journal/autopilot.jsonl');
const specimens = read('data/specimens.json');
const sources = read('data/SOURCES.json');
const audit = read('data/MEDIA-AUDIT.json');
const waterline = read('data/WATERLINE-STATE.json');
const waterlineJournal = readJsonl('data/journal/waterline.jsonl');

const cycles = waterline.cycles.filter((row) => row.scope_id === 'doctor-who' && row.lease_id === LEASE_ID);
if (cycles.length !== 1) fail('pilot must have exactly one Doctor Who cycle receipt');
const cycle = cycles[0];
if (cycle.id !== CORRECTED_CYCLE_ID || cycle.id === OLD_CYCLE_ID) fail('pilot cycle content identity is not corrected');
const cycleBody = structuredClone(cycle);
delete cycleBody.id;
if (cycle.id !== 'cycle_' + sha(stableJson(cycleBody)).slice(0, 24)) fail('pilot cycle content-addressed id drifted');
if (cycle.outcome !== 'completed'
  || cycle.task_ids?.length !== 1
  || cycle.task_ids[0] !== TASK_ID
  || cycle.task_statuses?.[TASK_ID] !== 'resolved') {
  fail('pilot cycle terminal custody drifted');
}
if (cycle.claimed_at !== PILOT_CLAIMED_AT
  || cycle.closed_at !== PILOT_REVIEWED_AT
  || cycle.reviewed_at !== PILOT_REVIEWED_AT
  || cycle.reviewed_by !== 'chatgpt-second-desk'
  || cycle.reviewed_role !== 'second-desk'
  || cycle.readiness_token !== PILOT_READINESS_TOKEN) {
  fail('pilot cycle review or transaction boundary drifted');
}

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
for (const token of exactTokens) {
  if (!evidenceText.includes(token)) fail('pilot cycle evidence lacks exact token ' + token);
}
if (/<[^>\n]+>/.test(evidenceText)) fail('pilot cycle evidence still contains a template placeholder');

const cycleEvents = waterlineJournal.filter((row) => row.op === 'cycle.receipted'
  && row.scope === 'doctor-who'
  && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1) fail('pilot must have exactly one Doctor Who cycle journal event');
const expectedCycleEventBody = {
  version: 1,
  op: 'cycle.receipted',
  at: PILOT_REVIEWED_AT,
  scope: 'doctor-who',
  lease_id: LEASE_ID,
  receipt_id: CORRECTED_CYCLE_ID,
  outcome: 'completed',
};
const expectedCycleEvent = { id: CORRECTED_JOURNAL_EVENT_ID, ...expectedCycleEventBody };
assertExact(cycleEvents[0], expectedCycleEvent, 'pilot cycle journal event');
if (CORRECTED_JOURNAL_EVENT_ID !== 'waterline_' + sha(JSON.stringify(expectedCycleEventBody)).slice(0, 24)) {
  fail('pinned pilot cycle journal event id is not content addressed');
}
if (waterlineJournal.some((row) => row.receipt_id === OLD_CYCLE_ID)) {
  fail('superseded pilot cycle journal receipt survived');
}

const doctorClaims = autopilotJournal.filter((row) => row.op === 'lease.claimed' && row.scope === 'doctor-who');
for (const row of doctorClaims) {
  if (!Number.isFinite(Date.parse(row.at || ''))) {
    fail('Doctor Who lease claim has invalid timestamp at ' + String(row.id || '<missing>'));
  }
}
const reviewBoundaryEnd = Date.parse(PILOT_REVIEWED_AT);
const claimsAtOrBeforeFirstReview = doctorClaims.filter((row) => Date.parse(row.at) <= reviewBoundaryEnd);
if (claimsAtOrBeforeFirstReview.length !== 1) {
  fail('the first reviewed Doctor Who cycle must have exactly one claim at or before review');
}

const expectedClaimBody = {
  version: 1,
  op: 'lease.claimed',
  task_id: TASK_ID,
  at: PILOT_CLAIMED_AT,
  scope: 'doctor-who',
  performer: 'Dan Starkey',
  character: 'Commander (The Sontarans)',
  lease_id: LEASE_ID,
  agent: 'luna',
  expires_at: PILOT_EXPIRES_AT,
  readiness_token: PILOT_READINESS_TOKEN,
  capability_profile: PILOT_CAPABILITY_PROFILE,
  capability_policy_sha256: PILOT_CAPABILITY_POLICY_SHA256,
  required_capabilities: [],
  selection_strategy: PILOT_SELECTION_STRATEGY,
  selection_basis: PILOT_SELECTION_BASIS,
};
const expectedClaim = { id: PILOT_CLAIM_EVENT_ID, ...expectedClaimBody };
const claim = claimsAtOrBeforeFirstReview[0];
assertExact(claim, expectedClaim, 'pilot immutable lease claim');
if (PILOT_CLAIM_EVENT_ID !== 'apj_' + sha(JSON.stringify(expectedClaimBody)).slice(0, 24)) {
  fail('pinned pilot lease claim id is not content addressed');
}
const exactPilotLeaseClaims = doctorClaims.filter((row) => row.lease_id === LEASE_ID);
if (exactPilotLeaseClaims.length !== 1) fail('pilot lease must have exactly one immutable claim event');

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== 'doctor-who' || job.status !== 'resolved') fail('pilot task is not resolved');
if (job.source_fingerprint !== SOURCE_FINGERPRINT) fail('pilot source fingerprint drifted');
if (!Array.isArray(job.sources) || job.sources.length !== 1 || job.sources[0] !== SOURCE_URL) {
  fail('pilot task source URL drifted');
}
if (!(job.source_receipts || []).some((row) => row.source === SOURCE_URL
  && row.content_sha256 === SOURCE_CONTENT_SHA256)) {
  fail('pilot task source receipt drifted');
}
if (!Array.isArray(job.wall_ids) || job.wall_ids.length !== 1 || job.wall_ids[0] !== PILOT_WALL_ID) {
  fail('pilot must resolve to the exact wall id');
}

const wall = specimens.find((row) => row.id === PILOT_WALL_ID);
if (!wall
  || wall.actor !== 'Dan Starkey'
  || wall.character !== 'Commander (The Sontarans)'
  || wall.universe !== 'Doctor Who'
  || wall.kind !== 'voice'
  || wall.transform !== 2) {
  fail('canonical pilot row drifted');
}
const source = sources.find((row) => row.id === PILOT_WALL_ID);
if (!source || source.still !== null || source.portrait !== null) {
  fail('audio-only pilot media must remain explicitly null');
}
const pilotItems = (audit.items || []).filter((row) => row.wall_id === PILOT_WALL_ID);
if (pilotItems.length !== 2
  || !pilotItems.every((row) => row.scope === 'doctor-who'
    && row.status === 'absent'
    && row.asset === null)
  || stableJson(pilotItems.map((row) => row.side).sort()) !== stableJson(['portrait', 'still'])) {
  fail('both exact pilot media facets must be honestly absent');
}
const pilotFacetReceipt = [...pilotItems]
  .sort((a, b) => a.side.localeCompare(b.side))
  .map((item) => ({
    id: item.id,
    scope: item.scope,
    wall_id: item.wall_id,
    side: item.side,
    actor: item.actor,
    character: item.character,
    expected_subject: item.expected_subject,
    source_fetched_at: item.source_fetched_at,
    asset: item.asset,
    risk_codes: item.risk_codes,
    votes: item.votes,
    status: item.status,
    claims: item.claims,
  }));
const pilotItemIds = pilotFacetReceipt.map((row) => row.id);
assertExact(pilotItemIds, PILOT_MEDIA_ITEM_IDS, 'pilot media item identities');
const pilotFacetsSha256 = sha(JSON.stringify(stable(pilotFacetReceipt)) + '\n');

const doctor = autopilot.jobs.filter((row) => row.scope === 'doctor-who');
const queued = doctor.filter((row) => row.status === 'queued').length;
const inFlight = doctor.filter((row) => ['leased', 'drafted', 'merged'].includes(row.status)).length;
const resolved = doctor.filter((row) => row.status === 'resolved').length;
if (doctor.length !== 316 || queued !== 315 || resolved !== 1 || inFlight !== 0) {
  fail('Doctor Who queue denominator or terminal state drifted');
}

const expectedQualification = {
  pre_cycle_gate_log_sha256: PRE_CYCLE_GATE_LOG_SHA256,
  exact_product_gate: 'passed',
  product_gate_log_sha256: PRODUCT_GATE_LOG_SHA256,
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
const expectedBoundary = {
  second_lease_issued: false,
  generic_character_image_used: false,
  duplicate_portrait_bytes_used: false,
  unrelated_scope_mutated: false,
  roadmap_completion_claimed: false,
};
const expectedCorrection = {
  corrected_at: EVIDENCE_CORRECTED_AT,
  repair_base_main_sha: EVIDENCE_REPAIR_BASE,
  previous_cycle_id: OLD_CYCLE_ID,
  corrected_cycle_id: CORRECTED_CYCLE_ID,
  corrected_journal_event_id: CORRECTED_JOURNAL_EVENT_ID,
  finding: 'PR #185 Codex review comment ' + REVIEW_COMMENT_ID,
  method: EVIDENCE_METHOD,
  mutable_audit_decoupling: {
    corrected_at: MEDIA_BINDING_CORRECTED_AT,
    repair_base_main_sha: MEDIA_BINDING_REPAIR_BASE,
    discovered_by_workflow_run: MEDIA_BINDING_DISCOVERY_RUN,
    previous_global_audit_sha256: PILOT_MEDIA_HISTORICAL_GLOBAL_SNAPSHOT_SHA256,
    corrected_binding_scope: PILOT_MEDIA_BINDING_SCOPE,
    corrected_item_ids: PILOT_MEDIA_ITEM_IDS,
    corrected_pilot_facets_sha256: pilotFacetsSha256,
    method: MEDIA_BINDING_METHOD,
  },
};
const expectedReceiptPayload = {
  version: 1,
  transaction: 'DOCTOR-WHO-PILOT-CYCLE-001',
  generated_at: PILOT_REVIEWED_AT,
  base_sha: PILOT_BASE,
  launcher_head: PILOT_LAUNCHER,
  task: {
    id: TASK_ID,
    performer: 'Dan Starkey',
    character: 'Commander (The Sontarans)',
    mode: 'voice',
    source: SOURCE_URL,
    source_fingerprint: SOURCE_FINGERPRINT,
    source_content_sha256: SOURCE_CONTENT_SHA256,
    status: 'resolved',
  },
  lease: {
    id: LEASE_ID,
    agent: 'luna',
    outcome: 'completed',
  },
  canonical: {
    wall_id: PILOT_WALL_ID,
    universe: 'Doctor Who',
    transform: 2,
    kind: 'voice',
    specimens_sha256: PILOT_SPECIMENS_SHA256,
    sources_sha256: PILOT_SOURCES_SHA256,
  },
  media: {
    still: null,
    portrait: null,
    dispositions: {
      still: 'absent',
      portrait: 'absent',
    },
    binding_version: 2,
    binding_scope: PILOT_MEDIA_BINDING_SCOPE,
    pilot_item_ids: PILOT_MEDIA_ITEM_IDS,
    pilot_facets_sha256: pilotFacetsSha256,
    historical_global_audit_snapshot_sha256: PILOT_MEDIA_HISTORICAL_GLOBAL_SNAPSHOT_SHA256,
    binding_note: PILOT_MEDIA_BINDING_NOTE,
  },
  queue: {
    total: doctor.length,
    queued,
    resolved,
    in_flight: inFlight,
  },
  reviewed_cycle: {
    id: CORRECTED_CYCLE_ID,
    outcome: 'completed',
    reviewed_by: 'chatgpt-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: PILOT_REVIEWED_AT,
  },
  boundary: expectedBoundary,
  qualification: expectedQualification,
  evidence_correction: expectedCorrection,
};
if (Object.prototype.hasOwnProperty.call(receipt.media || {}, 'media_audit_sha256')) {
  fail('deprecated mutable sitewide media-audit binding survived');
}
const receiptPayload = structuredClone(receipt);
delete receiptPayload.receipt_sha256;
assertExact(receiptPayload, expectedReceiptPayload, 'pilot permanent receipt payload');
if (receipt.receipt_sha256 !== sha(JSON.stringify(stable(receiptPayload)) + '\n')) {
  fail('pilot permanent receipt hash drifted');
}
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) {
  fail('pilot permanent receipt still contains a template placeholder');
}

console.log('doctor-who-pilot-cycle: PASS — exact cycle evidence, content-addressed waterline and claim custody, one immutable first-cycle lease, scope-bound pilot media, two honest absences, and no second lease');
