#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { stable, validateCorrectionLedger } from "./corrections.mjs";

const BASE_SHA = "ae699cdd24d62ab4c5e0c81722d7d688152c54e1";
const WALL_ID = "UC-1345";
const TASK_ID = "ap_6dfcb7b9254c26dc3f4b46b8";
const LEASE_ID = "lease_51e3223a4810f3681aff9df4";
const CASE_ID = "correction-exercise-doctor-who-001";
const IDENTITY_SHA256 = "86845b0347983d9284d82d35ac7e0243ff3dba60ac714733231d700e34c7f53c";
const PILOT_RECEIPT_SHA256 = "9ed078b768191a80845bab6ce221ea335960e3a3efeee95235d94a76cd8205eb";
const SOURCE_CONTENT_SHA256 = "2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966";
const PRODUCTION_CORRECTIONS_SHA256 = "2597365c8679740fb146275689e7b8d8485dbd3cf08ca9a79a4760b250623d03";
const SPECIMENS_SHA256 = "2b0a74f71b1768377f43ce45f923d917448950638cf8eb834e05783eee2f6256";
const SOURCES_SHA256 = "03f8e2b5defea40b1d0014fedf7a2a36694b3acf745614bf92d7df3dbd9606d7";
const MEDIA_AUDIT_SHA256 = "36810c36bbe43f98c556fcd2c151522f7ac7af70357afb02ee1a711bb12831e3";
const DRILL_LEDGER_SHA256 = "148ff57e1f062264112c79d3a75c7f7b8b2cea65f01910766e49bf62789a4351";
const RECEIPT_SHA256 = "ef52602aa10f56042ce35d8fbc70db5473566c561fae354fc2f68614649562a7";

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
};

const readBytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(readBytes(file));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(stable(value));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

const ledgerBytes = readBytes(PATHS.ledger);
const receiptBytes = readBytes(PATHS.receipt);
const pilotBytes = readBytes(PATHS.pilot);
const productionBytes = readBytes(PATHS.production);
const specimensBytes = readBytes(PATHS.specimens);
const sourcesBytes = readBytes(PATHS.sources);
const auditBytes = readBytes(PATHS.audit);

const ledger = JSON.parse(ledgerBytes);
const receipt = JSON.parse(receiptBytes);
const pilot = JSON.parse(pilotBytes);
const production = JSON.parse(productionBytes);
const baseline = read(PATHS.baseline);
const specimens = JSON.parse(specimensBytes);
const sources = JSON.parse(sourcesBytes);
const audit = JSON.parse(auditBytes);
const autopilot = read(PATHS.autopilot);

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
for (const token of ["Commander Slite", "generic Sontaran", SOURCE_CONTENT_SHA256, MEDIA_AUDIT_SHA256]) {
  assert(`${claimText}\n${evidenceText}\n${dispositionText}`.includes(token), `Doctor Who correction drill lacks exact token ${token}`);
}
assert(/distinct from Commander Slite/i.test(evidenceText), "source review does not preserve the Commander Slite distinction");
assert(/generic Sontaran image would misidentify/i.test(dispositionText), "rejection does not explain the generic-image error");

assert(sha(productionBytes) === PRODUCTION_CORRECTIONS_SHA256, "production correction ledger bytes drifted");
assert(Array.isArray(production.cases) && production.cases.length === 0, "controlled Doctor Who drill created a real correction case");
assert(baseline.inputs?.production_ledger?.sha256 === PRODUCTION_CORRECTIONS_SHA256, "generic correction baseline no longer binds the empty production ledger");
assert(baseline.boundary?.controlled_exercise_is_not_public_demand === true, "generic correction boundary began counting controlled work as public demand");
assert(baseline.boundary?.roadmap_milestone_completed === false, "generic correction baseline acquired roadmap completion authority");

assert(sha(specimensBytes) === SPECIMENS_SHA256, "canonical specimens bytes drifted from the completed pilot");
assert(sha(sourcesBytes) === SOURCES_SHA256, "canonical sources bytes drifted from the completed pilot");
assert(sha(auditBytes) === MEDIA_AUDIT_SHA256, "media audit bytes drifted from the completed pilot");

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

assert(pilot.task?.id === TASK_ID && pilot.lease?.id === LEASE_ID, "pilot task or lease identity drifted");
assert(pilot.task?.source_content_sha256 === SOURCE_CONTENT_SHA256, "pilot source-content identity drifted");
assert(pilot.canonical?.wall_id === WALL_ID, "pilot canonical wall binding drifted");
assert(pilot.media?.still === null && pilot.media?.portrait === null, "pilot receipt no longer preserves both media absences");
assert(pilot.receipt_sha256 === PILOT_RECEIPT_SHA256, "pilot receipt content identity drifted");
assert(pilot.boundary?.second_lease_issued === false, "pilot receipt now claims a second lease");
assert(pilot.boundary?.roadmap_completion_claimed === false, "pilot receipt acquired roadmap completion authority");

const doctor = (autopilot.jobs || []).filter((job) => job.scope === "doctor-who");
const task = doctor.find((job) => job.id === TASK_ID);
const queued = doctor.filter((job) => job.status === "queued").length;
const resolved = doctor.filter((job) => job.status === "resolved").length;
const inFlight = doctor.filter((job) => ["leased", "drafted", "merged"].includes(job.status)).length;
assert(task?.status === "resolved" && Array.isArray(task.wall_ids) && task.wall_ids.length === 1 && task.wall_ids[0] === WALL_ID, "Doctor Who pilot task terminal custody drifted");
assert(doctor.length === 316 && queued === 315 && resolved === 1 && inFlight === 0, "Doctor Who queue denominator or one-cycle boundary drifted");

assert(receipt.transaction === "DOCTOR-WHO-CORRECTION-DRILL-001", "Doctor Who drill receipt transaction drifted");
assert(receipt.base_sha === BASE_SHA, "Doctor Who drill receipt base drifted");
assert(receipt.target?.identity_sha256 === IDENTITY_SHA256, "Doctor Who drill receipt target identity drifted");
assert(receipt.target?.source_content_sha256 === SOURCE_CONTENT_SHA256, "Doctor Who drill receipt source identity drifted");
assert(receipt.inputs?.pilot_receipt?.receipt_sha256 === PILOT_RECEIPT_SHA256, "Doctor Who drill receipt lost pilot custody");
assert(receipt.inputs?.drill_ledger?.sha256 === DRILL_LEDGER_SHA256, "Doctor Who drill receipt lost ledger custody");
assert(receipt.inputs?.production_corrections?.sha256 === PRODUCTION_CORRECTIONS_SHA256, "Doctor Who drill receipt lost production-ledger custody");
assert(receipt.inputs?.canonical_specimens?.sha256 === SPECIMENS_SHA256, "Doctor Who drill receipt lost specimen custody");
assert(receipt.inputs?.canonical_sources?.sha256 === SOURCES_SHA256, "Doctor Who drill receipt lost source custody");
assert(receipt.inputs?.media_audit?.sha256 === MEDIA_AUDIT_SHA256, "Doctor Who drill receipt lost media custody");
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
assert(receipt.queue?.total === 316 && receipt.queue?.queued === 315 && receipt.queue?.resolved === 1 && receipt.queue?.in_flight === 0, "Doctor Who drill queue receipt drifted");
assert(receipt.qualification?.checker === "scripts/doctor-who-correction-drill.mjs", "Doctor Who drill checker binding drifted");
assert(receipt.qualification?.command === "npm run doctor-who:correction-drill:check", "Doctor Who drill command binding drifted");
assert(receipt.qualification?.canonical_gate_binding === "autopilot:fixtures", "Doctor Who drill canonical-gate binding drifted");
assert(receipt.qualification?.new_workflow_added === false, "Doctor Who drill receipt claims a permanent workflow");

const receiptClone = structuredClone(receipt);
delete receiptClone.receipt_sha256;
assert(receipt.receipt_sha256 === RECEIPT_SHA256, "Doctor Who drill receipt declared hash drifted");
assert(sha(`${stableJson(receiptClone)}\n`) === RECEIPT_SHA256, "Doctor Who drill receipt content hash drifted");
assert(!/<[^>\n]+>/.test(JSON.stringify(receipt)), "Doctor Who drill receipt contains a template placeholder");

console.log("doctor-who-correction-drill: PASS — exact UC-1345 target, Commander Slite conflation and generic media rejected, public exercise history retained, zero real-case/canonical/queue mutation");
