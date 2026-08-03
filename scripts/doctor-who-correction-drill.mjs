#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { stable, validateCorrectionLedger } from "./corrections.mjs";

const BASE_SHA = "ae699cdd24d62ab4c5e0c81722d7d688152c54e1";
const WALL_ID = "UC-1345";
const TASK_ID = "ap_6dfcb7b9254c26dc3f4b46b8";
const SLITE_TASK_ID = "ap_0606b27614b2d76b29e1f789";
const LEASE_ID = "lease_51e3223a4810f3681aff9df4";
const CYCLE_ID = "cycle_93fcbfd214892eaf81d55fa3";
const CASE_ID = "correction-exercise-doctor-who-001";
const TRANSACTION_ID = "DOCTOR-WHO-CORRECTION-DRILL-001";
const ROADMAP_MILESTONE = "adapter-sdk-and-second-gold-shard";
const IDENTITY_SHA256 = "86845b0347983d9284d82d35ac7e0243ff3dba60ac714733231d700e34c7f53c";
const HISTORICAL_PILOT_RECEIPT_SHA256 = "9ed078b768191a80845bab6ce221ea335960e3a3efeee95235d94a76cd8205eb";
const PILOT_MEDIA_BINDING_SCOPE = "doctor-who/UC-1345";
const PILOT_MEDIA_ITEM_IDS = ["ma_ee364d31319f0943c9c4f8ce", "ma_f8ee1f03ec2173d75f6f85ea"];
const PILOT_MEDIA_FACETS_SHA256 = "d8f69833e561b9a01754d9ee906d30255f4c45ef1894ef289e2e12bc1ffc363b";
const SCOPE_REPAIR_TRANSACTION = "DOCTOR-WHO-CORRECTION-DRILL-SCOPE-CUSTODY-001";
const SCOPE_REPAIR_BASE_SHA = "e8f5cb652daa5ed325bc84d85d41412e7c4d44c3";
const FAILED_CLAIM_RUN = 30801441270;
const FAILED_CLAIM_JOB = 91646681213;
const FAILED_CLAIM_ARTIFACT_ID = 8850976176;
const FAILED_CLAIM_ARTIFACT_SHA256 = "612c0aac4ca41db3101bb0a72fe1701528f036ec9bf78da091bca70fa4496d5b";
const SOURCE_URL = "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)";
const SOURCE_FINGERPRINT = "f272dd90028ca998792a461c1547a334d58f7976484ff7ee2d299306763e0879";
const SOURCE_CONTENT_SHA256 = "2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966";
const SLITE_SOURCE_URL = "https://tardis.fandom.com/wiki/Slite";
const SLITE_SOURCE_FINGERPRINT = "19f2b03bb123656a2363e10c284762561e2593f9307a0ca6e8ba20206239d8c8";
const SLITE_SOURCE_CONTENT_SHA256 = "eae385ba9d21bd3238a3280dd7de4d076e8c2a496eff8d6dd7d384217bbf8e50";
const SOURCE_SNAPSHOT_ID = "preservation-doctor-who-169391a8bf64";
const SOURCE_MANIFEST_SHA256 = "96202b4c128a3729fb7cf3e52b4c36f32a25a156c0df92d1aa379de99fb58f00";
const SOURCE_ARCHIVE_SHA256 = "1526b095c31c046e92de020854058088c970c42d8c9cf400179f1368c16c0211";
const PRODUCTION_CORRECTIONS_SHA256 = "2597365c8679740fb146275689e7b8d8485dbd3cf08ca9a79a4760b250623d03";
const SPECIMENS_SHA256 = "2b0a74f71b1768377f43ce45f923d917448950638cf8eb834e05783eee2f6256";
const SOURCES_SHA256 = "03f8e2b5defea40b1d0014fedf7a2a36694b3acf745614bf92d7df3dbd9606d7";
const MEDIA_AUDIT_SHA256 = "36810c36bbe43f98c556fcd2c151522f7ac7af70357afb02ee1a711bb12831e3";
const DRILL_LEDGER_SHA256 = "19716a18783c169380f78aae7dcbb27c9ef8987b21565de0b6613f3c1ba17127";
const RECEIPT_SHA256 = "2853b5f7d6a502dc8c404316656444ef9b4004f5c810886228ccb4961a8c7890";

const PATHS = {
  ledger: "data/review/corrections/controlled-exercise-002-doctor-who.json",
  receipt: "data/review/adapter-sdk/doctor-who-correction-drill-001.json",
  pilot: "data/review/adapter-sdk/doctor-who-pilot-cycle-001.json",
  production: "data/CORRECTIONS.json",
  baseline: "data/review/corrections/BASELINE.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  audit: "data/MEDIA-AUDIT.json",
  autopilot: "data/AUTOPILOT.json",
  certifications: "data/AUTOPILOT-CERTIFICATIONS.json",
  preservation: "preservation/SNAPSHOTS.json",
  waterline: "data/WATERLINE.json",
  waterlineState: "data/WATERLINE-STATE.json",
  roadmap: "data/ROADMAP.json",
  roadmapState: "data/ROADMAP-STATE.json",
  scopeRepair: "data/review/adapter-sdk/doctor-who-correction-drill-001-scope-custody.json",
};

const readBytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(readBytes(file));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(stable(value));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const sameSet = (left, right) =>
  left.length === right.length && left.every((value) => right.includes(value));

const ACTIVE_JOB_STATUSES = new Set(["leased", "drafted", "merged"]);
const rehashReceipt = (doc) => {
  const clone = structuredClone(doc);
  delete clone.receipt_sha256;
  doc.receipt_sha256 = sha(`${stableJson(clone)}\n`);
  return doc;
};
const expectFailure = (fn, pattern, label) => {
  let message = "";
  try { fn(); }
  catch (error) { message = String(error?.message || error); }
  assert(pattern.test(message), `${label} did not fail closed (${message || "no error"})`);
};
const pilotFacetReceipt = (items) => [...items]
  .sort((left, right) => left.side.localeCompare(right.side))
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
const validateCurrentPilotReceipt = (pilotDoc, items) => {
  assert(pilotDoc.task?.id === TASK_ID && pilotDoc.lease?.id === LEASE_ID, "pilot task or lease identity drifted");
  assert(pilotDoc.task?.source_content_sha256 === SOURCE_CONTENT_SHA256, "pilot source-content identity drifted");
  assert(pilotDoc.canonical?.wall_id === WALL_ID, "pilot canonical wall binding drifted");
  assert(pilotDoc.media?.still === null && pilotDoc.media?.portrait === null, "pilot receipt no longer preserves both media absences");
  assert(pilotDoc.media?.binding_version === 2 && pilotDoc.media?.binding_scope === PILOT_MEDIA_BINDING_SCOPE, "pilot scope-bound media binding drifted");
  assert(sameSet(pilotDoc.media?.pilot_item_ids || [], PILOT_MEDIA_ITEM_IDS), "pilot media item identities drifted");
  assert(pilotDoc.media?.pilot_facets_sha256 === PILOT_MEDIA_FACETS_SHA256, "pilot media facet receipt drifted");
  assert(pilotDoc.media?.historical_global_audit_snapshot_sha256 === MEDIA_AUDIT_SHA256, "pilot historical global media snapshot drifted");
  assert(!Object.hasOwn(pilotDoc.media || {}, "media_audit_sha256"), "deprecated mutable global media binding returned");
  const facets = pilotFacetReceipt(items);
  assert(sha(`${stableJson(facets)}\n`) === PILOT_MEDIA_FACETS_SHA256, "current exact pilot media facets drifted");
  const decoupling = pilotDoc.evidence_correction?.mutable_audit_decoupling;
  assert(decoupling?.previous_global_audit_sha256 === MEDIA_AUDIT_SHA256, "pilot media decoupling lost historical custody");
  assert(decoupling?.corrected_binding_scope === PILOT_MEDIA_BINDING_SCOPE, "pilot media decoupling scope drifted");
  assert(sameSet(decoupling?.corrected_item_ids || [], PILOT_MEDIA_ITEM_IDS), "pilot media decoupling item ids drifted");
  assert(decoupling?.corrected_pilot_facets_sha256 === PILOT_MEDIA_FACETS_SHA256, "pilot media decoupling digest drifted");
  const clone = structuredClone(pilotDoc);
  delete clone.receipt_sha256;
  assert(pilotDoc.receipt_sha256 === sha(`${stableJson(clone)}\n`), "current pilot receipt self-hash drifted");
  assert(pilotDoc.boundary?.second_lease_issued === false, "pilot receipt now claims a second lease");
  assert(pilotDoc.boundary?.roadmap_completion_claimed === false, "pilot receipt acquired roadmap completion authority");
  return true;
};
const validateActiveLeaseIsolation = (jobs) => {
  const active = (jobs || []).filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  const leaseGroups = new Set();
  for (const job of active) {
    assert(job.scope !== "doctor-who", `Doctor Who acquired active work around the historical correction drill: ${job.id}`);
    assert(String(job.lease?.id || "").trim(), `active job ${job.scope}:${job.id} lacks lease identity`);
    leaseGroups.add(`${job.scope}|${job.lease.id}`);
  }
  assert(leaseGroups.size <= 1, `global one-cycle boundary has multiple active lease groups: ${[...leaseGroups].join(", ")}`);
  return { active_jobs: active.length, lease_groups: [...leaseGroups] };
};

const ledgerBytes = readBytes(PATHS.ledger);
const ledger = JSON.parse(ledgerBytes);
const receipt = read(PATHS.receipt);
const pilot = read(PATHS.pilot);
const production = read(PATHS.production);
const baseline = read(PATHS.baseline);
const specimens = read(PATHS.specimens);
const sources = read(PATHS.sources);
const audit = read(PATHS.audit);
const autopilot = read(PATHS.autopilot);
const certifications = read(PATHS.certifications);
const preservation = read(PATHS.preservation);
const waterline = read(PATHS.waterline);
const waterlineState = read(PATHS.waterlineState);
const roadmap = read(PATHS.roadmap);
const roadmapState = read(PATHS.roadmapState);
const scopeRepair = read(PATHS.scopeRepair);

const ledgerErrors = validateCorrectionLedger(ledger, { expectedCaseType: "exercise" });
assert(ledgerErrors.length === 0, `Doctor Who correction drill violates the generic correction contract:\n${ledgerErrors.join("\n")}`);
assert(ledger.cases.length === 1, "Doctor Who correction drill denominator must be exactly one case");
assert(sha(ledgerBytes) === DRILL_LEDGER_SHA256, "Doctor Who correction drill ledger bytes drifted");

const row = ledger.cases[0];
assert(row.id === CASE_ID, "Doctor Who correction drill case id drifted");
assert(row.status === "rejected" && row.disposition?.outcome === "rejected", "adverse Doctor Who correction was not rejected");
assert(row.target?.record_id === "EXERCISE-UC-1345", "controlled target id drifted");
assert(row.target?.target_head === BASE_SHA, "controlled target head drifted");
assert(row.target?.field_path === "character+media", "controlled target field drifted");
assert(row.target?.current_value_sha256 === IDENTITY_SHA256, "controlled target value hash drifted");
assert(row.disposition?.canonical_mutation === false && row.disposition?.history_public === true, "controlled disposition boundary drifted");

const expectedEventChain = ["intake", "triaged", "evidence-reviewed", "dispositioned", "history-published"];
assert(JSON.stringify(row.events.map((event) => event.kind)) === JSON.stringify(expectedEventChain), "Doctor Who correction drill event chain drifted");
const intakeActor = row.events.find((event) => event.kind === "intake")?.actor;
const reviewerActor = row.events.find((event) => event.kind === "evidence-reviewed")?.actor;
const deciderActor = row.events.find((event) => event.kind === "dispositioned")?.actor;
assert(intakeActor && reviewerActor && deciderActor && intakeActor !== reviewerActor && intakeActor !== deciderActor, "Doctor Who correction drill lost independent review or disposition");

const claimText = `${row.claim?.summary || ""}\n${row.claim?.proposed_correction || ""}`;
const evidenceText = (row.evidence || []).map((entry) => `${entry.id}: ${entry.value}`).join("\n");
const dispositionText = String(row.disposition?.reason || "");
for (const token of [
  "Commander Slite",
  "generic Sontaran",
  TASK_ID,
  SLITE_TASK_ID,
  SOURCE_CONTENT_SHA256,
  SLITE_SOURCE_CONTENT_SHA256,
  SOURCE_SNAPSHOT_ID,
  SOURCE_MANIFEST_SHA256,
  SOURCE_ARCHIVE_SHA256,
]) {
  assert(`${claimText}\n${evidenceText}\n${dispositionText}`.includes(token), `Doctor Who correction drill lacks exact token ${token}`);
}
assert(/separate tasks and source receipts/i.test(dispositionText), "rejection does not preserve the distinct Commander and Slite obligations");
assert(/generic Sontaran image would misidentify/i.test(dispositionText), "rejection does not explain the generic-image error");

const productionErrors = validateCorrectionLedger(production, { expectedCaseType: "real" });
assert(productionErrors.length === 0, `live production correction ledger is invalid:\n${productionErrors.join("\n")}`);
const productionLeak = (production.cases || []).some((entry) =>
  entry.case_type === "exercise" ||
  entry.id === CASE_ID ||
  entry.target?.record_id === "EXERCISE-UC-1345"
);
assert(!productionLeak, "controlled Doctor Who exercise leaked into the live production correction ledger");
assert(baseline.boundary?.controlled_exercise_is_not_public_demand === true, "generic correction boundary began counting controlled work as public demand");
assert(baseline.boundary?.controlled_exercise_is_not_canonical_authority === true, "generic correction exercise acquired canonical authority");
assert(baseline.boundary?.production_ledger_mutated_by_exercise === false, "generic correction baseline says the exercise mutated production");
assert(baseline.boundary?.roadmap_milestone_completed === false, "generic correction baseline acquired roadmap completion authority");

const wall = specimens.find((entry) => entry.id === WALL_ID);
assert(wall, "UC-1345 is missing");
assert(
  wall.actor === "Dan Starkey" &&
  wall.character === "Commander (The Sontarans)" &&
  wall.universe === "Doctor Who" &&
  wall.kind === "voice" &&
  wall.transform === 2,
  "UC-1345 canonical identity drifted"
);

const source = sources.find((entry) => entry.id === WALL_ID);
assert(source, "UC-1345 source row is missing");
assert(Object.hasOwn(source, "still") && source.still === null, "audio-only Commander acquired a character still");
assert(Object.hasOwn(source, "portrait") && source.portrait === null, "pilot acquired an unbound performer portrait");

const identity = {
  actor: wall.actor,
  character: wall.character,
  id: wall.id,
  kind: wall.kind,
  media: { portrait: source.portrait, still: source.still },
  transform: wall.transform,
  universe: wall.universe,
};
assert(sha(`${stableJson(identity)}\n`) === IDENTITY_SHA256, "UC-1345 normalized identity hash drifted");

const pilotItems = (audit.items || []).filter((entry) => entry.wall_id === WALL_ID);
assert(pilotItems.length === 2, "UC-1345 must retain exactly two media facets");
assert(new Set(pilotItems.map((entry) => entry.side)).size === 2, "UC-1345 media sides drifted");
assert(pilotItems.every((entry) => entry.status === "absent"), "UC-1345 media debt is no longer honestly absent");

validateCurrentPilotReceipt(pilot, pilotItems);

const doctor = (autopilot.jobs || []).filter((job) => job.scope === "doctor-who");
const task = doctor.find((job) => job.id === TASK_ID);
const slite = doctor.find((job) => job.id === SLITE_TASK_ID);
const taskReceipt = task?.source_receipts?.find((entry) => entry.source === SOURCE_URL);
const sliteReceipt = slite?.source_receipts?.find((entry) => entry.source === SLITE_SOURCE_URL);

assert(task?.status === "resolved" && Array.isArray(task.wall_ids) && task.wall_ids.length === 1 && task.wall_ids[0] === WALL_ID, "Doctor Who pilot task terminal custody drifted");
assert(task.performer === "Dan Starkey" && task.character === "Commander (The Sontarans)", "Commander task subject drifted");
assert(task.source_fingerprint === SOURCE_FINGERPRINT, "Commander task source fingerprint drifted");
assert(
  taskReceipt?.pageid === 246488 &&
  taskReceipt?.revision === 3330636 &&
  taskReceipt?.content_sha256 === SOURCE_CONTENT_SHA256,
  "Commander task lost its certified exact-source receipt"
);

assert(slite, "distinct Slite task is missing");
assert(slite.performer === "Dan Starkey" && slite.character === "Slite", "Slite task subject drifted");
assert(Array.isArray(slite.performance_modes) && slite.performance_modes.includes("voice"), "Slite task voice mode drifted");
assert(slite.source_fingerprint === SLITE_SOURCE_FINGERPRINT, "Slite task source fingerprint drifted");
assert(
  sliteReceipt?.pageid === 246485 &&
  sliteReceipt?.revision === 3416320 &&
  sliteReceipt?.content_sha256 === SLITE_SOURCE_CONTENT_SHA256,
  "Slite task lost its certified exact-source receipt"
);
assert(task.id !== slite.id && taskReceipt.source !== sliteReceipt.source && taskReceipt.content_sha256 !== sliteReceipt.content_sha256, "Commander and Slite collapsed into one source obligation");
assert(!Array.isArray(slite.wall_ids) || !slite.wall_ids.includes(WALL_ID), "Slite task was incorrectly resolved to UC-1345");
assert(!new Set(["leased", "drafted", "merged"]).has(slite.status), "Slite acquired an active lease around the correction drill");

const inFlight = doctor.filter((job) => ["leased", "drafted", "merged"].includes(job.status)).length;
assert(doctor.length === 316 && inFlight === 0, "Doctor Who denominator or terminal one-cycle state drifted");
assert(doctor.filter((job) => job.status === "resolved").length >= 1, "Doctor Who lost the resolved pilot floor");

validateActiveLeaseIsolation(autopilot.jobs || []);

assert(waterline.operations?.one_cycle_at_a_time === true, "waterline no longer requires one cycle at a time");
const doctorWaterline = (waterline.scopes || []).find((entry) => entry.id === "doctor-who");
assert(
  doctorWaterline?.roadmap_milestone === ROADMAP_MILESTONE &&
  doctorWaterline?.required_closed_cycles === 1 &&
  doctorWaterline?.max_tasks_per_cycle === 1 &&
  doctorWaterline?.minimum_resolved_per_cycle === 1,
  "Doctor Who waterline contract drifted"
);
const openDoctorCycles = (waterlineState.cycles || []).filter((cycle) =>
  cycle.scope_id === "doctor-who" && (!cycle.closed_at || !cycle.reviewed_at)
);
assert(openDoctorCycles.length === 0, "an unclosed or unreviewed Doctor Who cycle exists around the correction drill");
const pilotCycles = (waterlineState.cycles || []).filter((cycle) => cycle.scope_id === "doctor-who" && cycle.lease_id === LEASE_ID);
assert(
  pilotCycles.length === 1 &&
  pilotCycles[0].id === CYCLE_ID &&
  pilotCycles[0].outcome === "completed" &&
  pilotCycles[0].task_statuses?.[TASK_ID] === "resolved",
  "reviewed Doctor Who pilot cycle custody drifted"
);

const certification = (certifications.certifications || []).find((entry) => entry.scope_id === "doctor-who");
assert(certification, "Doctor Who certification is missing");
assert(certification.snapshot?.rows >= 316, "Doctor Who certified row denominator regressed");
assert(certification.snapshot?.sources >= 298, "Doctor Who certified source denominator regressed");
assert(certification.snapshot?.complete_receipts === certification.snapshot?.sources, "Doctor Who certification lost complete source receipts");
const certifiedSnapshot = (preservation.snapshots || []).find((entry) => entry.id === certification.snapshot?.source_snapshot_id);
assert(certifiedSnapshot, "current Doctor Who certification points to a missing preservation snapshot");
const certifiedScope = certifiedSnapshot.scopes?.["doctor-who"];
assert(certifiedScope?.complete_receipts === certifiedScope?.coverage_sources, "current certified Doctor Who preservation scope is incomplete");
assert(certifiedScope?.manifest_sha256 === certification.snapshot?.manifest_sha256, "current Doctor Who certification and preservation manifest disagree");
const certifiedSourceBag = certifiedSnapshot.public_release?.assets?.find((asset) => asset.kind === "source-bag");
assert(certifiedSourceBag?.sha256 === certification.snapshot?.source_archive_sha256, "current Doctor Who certification and source archive disagree");

const historicalSnapshot = (preservation.snapshots || []).find((entry) => entry.id === SOURCE_SNAPSHOT_ID);
assert(historicalSnapshot, "historical Doctor Who source snapshot is missing");
assert(new Set(["pending", "verified"]).has(historicalSnapshot.status), "historical Doctor Who source snapshot has an invalid status");
const historicalScope = historicalSnapshot.scopes?.["doctor-who"];
assert(
  historicalScope?.coverage_sources === 298 &&
  historicalScope?.complete_receipts === 298 &&
  historicalScope?.manifest_sha256 === SOURCE_MANIFEST_SHA256,
  "historical Doctor Who preservation scope drifted"
);
const historicalSourceBag = historicalSnapshot.public_release?.assets?.find((asset) => asset.kind === "source-bag");
assert(historicalSourceBag?.sha256 === SOURCE_ARCHIVE_SHA256, "historical Doctor Who source archive drifted");

const milestone = (roadmap.milestones || []).find((entry) => entry.id === ROADMAP_MILESTONE);
assert(milestone, "Doctor Who roadmap milestone definition is missing");
assert(milestone.seq === 3 && milestone.authority === "second-desk", "Doctor Who roadmap authority drifted");
assert(sameSet(milestone.deps || [], ["star-trek-gold-shard", "operational-reliability"]), "Doctor Who roadmap dependencies drifted");
const milestoneCompletion = (roadmapState.completed || []).find((entry) => entry.milestone === ROADMAP_MILESTONE);
assert(!milestoneCompletion, "the correction drill cannot close adapter-sdk-and-second-gold-shard; a separate reviewed completion transaction must amend this guard");

assert(receipt.transaction === TRANSACTION_ID, "Doctor Who drill receipt transaction drifted");
assert(receipt.base_sha === BASE_SHA, "Doctor Who drill receipt base drifted");
assert(receipt.target?.identity_sha256 === IDENTITY_SHA256, "Doctor Who drill receipt target identity drifted");
assert(receipt.target?.source_content_sha256 === SOURCE_CONTENT_SHA256, "Doctor Who drill receipt source identity drifted");
assert(receipt.inputs?.pilot_receipt?.receipt_sha256 === HISTORICAL_PILOT_RECEIPT_SHA256, "Doctor Who drill receipt lost historical pilot custody");
assert(receipt.inputs?.drill_ledger?.sha256 === DRILL_LEDGER_SHA256, "Doctor Who drill receipt lost ledger custody");
assert(receipt.inputs?.production_corrections?.historical_sha256 === PRODUCTION_CORRECTIONS_SHA256, "Doctor Who drill receipt lost historical production-ledger custody");
assert(receipt.inputs?.production_corrections?.admitted_cases_at_drill === 0 && receipt.inputs?.production_corrections?.live_growth_permitted === true, "Doctor Who drill receipt freezes or misstates the production ledger");
assert(receipt.inputs?.canonical_specimens?.historical_sha256 === SPECIMENS_SHA256, "Doctor Who drill receipt lost historical specimen custody");
assert(receipt.inputs?.canonical_sources?.historical_sha256 === SOURCES_SHA256, "Doctor Who drill receipt lost historical source custody");
assert(receipt.inputs?.media_audit?.historical_sha256 === MEDIA_AUDIT_SHA256, "Doctor Who drill receipt lost historical media custody");
assert(receipt.inputs?.autopilot?.commander_task_id === TASK_ID && receipt.inputs?.autopilot?.slite_task_id === SLITE_TASK_ID, "Doctor Who drill receipt lost distinct task custody");
assert(receipt.inputs?.source_certification?.historical_snapshot_id === SOURCE_SNAPSHOT_ID, "Doctor Who drill receipt lost source snapshot custody");
assert(receipt.inputs?.source_certification?.manifest_sha256 === SOURCE_MANIFEST_SHA256, "Doctor Who drill receipt lost source manifest custody");
assert(receipt.inputs?.source_certification?.source_archive_sha256 === SOURCE_ARCHIVE_SHA256, "Doctor Who drill receipt lost source archive custody");
assert(receipt.inputs?.waterline?.policy_path === PATHS.waterline && receipt.inputs?.waterline?.state_path === PATHS.waterlineState, "Doctor Who drill receipt lost waterline custody");
assert(receipt.inputs?.roadmap?.milestone === ROADMAP_MILESTONE && receipt.inputs?.roadmap?.definition_path === PATHS.roadmap && receipt.inputs?.roadmap?.state_path === PATHS.roadmapState, "Doctor Who drill receipt lost roadmap custody");

const expectedCommanderCustody = {
  task_id: TASK_ID,
  character: "Commander (The Sontarans)",
  source: SOURCE_URL,
  pageid: 246488,
  revision: 3330636,
  content_sha256: SOURCE_CONTENT_SHA256,
  source_fingerprint: SOURCE_FINGERPRINT,
  status_at_drill: "resolved",
};
const expectedSliteCustody = {
  task_id: SLITE_TASK_ID,
  character: "Slite",
  source: SLITE_SOURCE_URL,
  pageid: 246485,
  revision: 3416320,
  content_sha256: SLITE_SOURCE_CONTENT_SHA256,
  source_fingerprint: SLITE_SOURCE_FINGERPRINT,
  status_at_drill: "queued",
};
assert(JSON.stringify(receipt.source_custody?.commander) === JSON.stringify(expectedCommanderCustody), "Doctor Who drill receipt Commander source custody drifted");
assert(JSON.stringify(receipt.source_custody?.slite) === JSON.stringify(expectedSliteCustody), "Doctor Who drill receipt Slite source custody drifted");
assert(
  receipt.source_custody?.historical_snapshot?.id === SOURCE_SNAPSHOT_ID &&
  receipt.source_custody?.historical_snapshot?.manifest_sha256 === SOURCE_MANIFEST_SHA256 &&
  receipt.source_custody?.historical_snapshot?.source_archive_sha256 === SOURCE_ARCHIVE_SHA256,
  "Doctor Who drill receipt historical preservation custody drifted"
);

assert(JSON.stringify(receipt.result?.event_chain) === JSON.stringify(expectedEventChain), "Doctor Who drill receipt event chain drifted");
assert(receipt.result?.status === "rejected" && receipt.result?.outcome === "rejected", "Doctor Who drill receipt no longer records rejection");
for (const flag of [
  "canonical_mutation",
  "production_case_created",
  "public_demand_counted",
  "commander_slite_conflation_adopted",
  "generic_sontaran_image_used",
  "performer_portrait_substituted_for_character",
  "second_lease_issued",
  "roadmap_completion_claimed",
]) {
  assert(receipt.result?.[flag] === false, `Doctor Who drill boundary drifted at ${flag}`);
}
assert(receipt.result?.independent_review === true && receipt.result?.public_history === true, "Doctor Who drill review/history receipt drifted");
assert(
  receipt.queue?.doctor_who_total === 316 &&
  receipt.queue?.doctor_who_queued === 315 &&
  receipt.queue?.doctor_who_resolved === 1 &&
  receipt.queue?.doctor_who_in_flight === 0 &&
  receipt.queue?.global_in_flight === 0,
  "Doctor Who drill queue receipt drifted"
);
assert(
  receipt.global_one_cycle?.one_cycle_at_a_time === true &&
  receipt.global_one_cycle?.doctor_who_max_tasks_per_cycle === 1 &&
  receipt.global_one_cycle?.active_jobs_at_drill === 0 &&
  receipt.global_one_cycle?.open_waterline_cycles_at_drill === 0,
  "Doctor Who drill global one-cycle receipt drifted"
);
assert(
  receipt.roadmap?.milestone === ROADMAP_MILESTONE &&
  receipt.roadmap?.authority === "second-desk" &&
  receipt.roadmap?.status_at_drill === "open" &&
  receipt.roadmap?.separate_completion_transaction_required === true,
  "Doctor Who drill roadmap boundary receipt drifted"
);
assert(receipt.qualification?.checker === "scripts/doctor-who-correction-drill.mjs", "Doctor Who drill checker binding drifted");
assert(receipt.qualification?.command === "npm run doctor-who:correction-drill:check", "Doctor Who drill command binding drifted");
assert(receipt.qualification?.canonical_gate_binding === "autopilot:fixtures", "Doctor Who drill canonical-gate binding drifted");
assert(receipt.qualification?.generic_correction_contract_reused === true, "Doctor Who drill stopped reusing the generic correction contract");
assert(
  sameSet(receipt.qualification?.review_findings_paid || [], [
    "live-production-ledger-growth-permitted",
    "certified-distinct-source-tasks-bound",
    "global-one-cycle-state-bound",
    "roadmap-authority-bound",
    "pilot-receipt-content-recomputed",
  ]),
  "Doctor Who drill review-finding receipt drifted"
);
assert(receipt.qualification?.new_workflow_added === false, "Doctor Who drill receipt claims a permanent workflow");

const receiptClone = structuredClone(receipt);
delete receiptClone.receipt_sha256;
assert(receipt.receipt_sha256 === RECEIPT_SHA256, "Doctor Who drill receipt declared hash drifted");
assert(sha(`${stableJson(receiptClone)}\n`) === RECEIPT_SHA256, "Doctor Who drill receipt content hash drifted");
assert(!/<[^>\n]+>/.test(JSON.stringify(receipt)), "Doctor Who drill receipt contains a template placeholder");

assert(scopeRepair.version === 1 && scopeRepair.transaction === SCOPE_REPAIR_TRANSACTION, "Doctor Who drill scope-repair identity drifted");
assert(scopeRepair.base_main_sha === SCOPE_REPAIR_BASE_SHA, "Doctor Who drill scope-repair base drifted");
assert(scopeRepair.failed_claim?.run === FAILED_CLAIM_RUN && scopeRepair.failed_claim?.job === FAILED_CLAIM_JOB, "Doctor Who drill failed-claim run custody drifted");
assert(scopeRepair.failed_claim?.artifact_id === FAILED_CLAIM_ARTIFACT_ID && scopeRepair.failed_claim?.artifact_sha256 === FAILED_CLAIM_ARTIFACT_SHA256, "Doctor Who drill failed-claim artifact custody drifted");
assert(scopeRepair.repair?.historical_drill_receipt_immutable === true, "Doctor Who drill historical receipt was not preserved");
assert(scopeRepair.repair?.current_pilot_self_hash_required === true, "Doctor Who drill current-pilot self-hash repair missing");
assert(scopeRepair.repair?.exact_pilot_facets_required === true, "Doctor Who drill exact-facet repair missing");
assert(scopeRepair.repair?.unrelated_single_cycle_allowed === true, "Doctor Who drill unrelated-cycle isolation missing");
assert(scopeRepair.repair?.multiple_active_cycles_refused === true, "Doctor Who drill multiple-cycle refusal missing");
assert(scopeRepair.code?.path === PATHS.scopeRepair.replace("data/review/adapter-sdk/doctor-who-correction-drill-001-scope-custody.json", "scripts/doctor-who-correction-drill.mjs"), "Doctor Who drill repair code path drifted");
assert(scopeRepair.code?.sha256 === "cd4dfab241e22841e83f3edfb88883bacc78b33afbbef78e852d8a982fb686ac", "Doctor Who drill historical repair code hash drifted");
const scopeRepairClone = structuredClone(scopeRepair);
delete scopeRepairClone.receipt_sha256;
assert(scopeRepair.receipt_sha256 === sha(`${stableJson(scopeRepairClone)}\n`), "Doctor Who drill scope-repair receipt hash drifted");

validateActiveLeaseIsolation([
  { id: "fixture-star-one", scope: "star-trek", status: "leased", lease: { id: "lease_fixture_one" } },
  { id: "fixture-doctor-queued", scope: "doctor-who", status: "queued" },
]);
expectFailure(
  () => validateActiveLeaseIsolation([
    { id: "fixture-star-one", scope: "star-trek", status: "leased", lease: { id: "lease_fixture_one" } },
    { id: "fixture-star-two", scope: "star-trek", status: "drafted", lease: { id: "lease_fixture_two" } },
  ]),
  /multiple active lease groups/,
  "multiple active lease groups",
);
expectFailure(
  () => validateActiveLeaseIsolation([
    { id: "fixture-doctor-active", scope: "doctor-who", status: "leased", lease: { id: "lease_fixture_doctor" } },
  ]),
  /Doctor Who acquired active work/,
  "Doctor Who active-work isolation",
);
const sourceDrift = structuredClone(pilot);
sourceDrift.task.source_content_sha256 = "0".repeat(64);
rehashReceipt(sourceDrift);
expectFailure(
  () => validateCurrentPilotReceipt(sourceDrift, pilotItems),
  /source-content identity drifted/,
  "current pilot source drift",
);
const legacyBinding = structuredClone(pilot);
legacyBinding.media = {
  still: null,
  portrait: null,
  dispositions: { still: "absent", portrait: "absent" },
  media_audit_sha256: MEDIA_AUDIT_SHA256,
};
rehashReceipt(legacyBinding);
expectFailure(
  () => validateCurrentPilotReceipt(legacyBinding, pilotItems),
  /scope-bound media binding drifted/,
  "legacy mutable media binding",
);

console.log("doctor-who-correction-drill: PASS — historical drill custody, exact Commander/Slite separation, scope-bound current pilot proof, one unrelated active cycle allowed, concurrent lease groups refused, and roadmap completion reserved");
