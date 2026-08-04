#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-003-jask.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-003.mjs";
const TASK_ID = "ap_1beb8875beacd81ac087f460";
const LEASE_ID = "lease_e91baa4db7271a278c867ac9";
const WALL_ID = "UC-1348";
const SOURCE = "https://tardis.fandom.com/wiki/Jask_(The_End_of_Time)";
const CAST_SOURCE = "https://doctorwhoworlduk.com/xmas2009a";
const SOURCE_FINGERPRINT = "22154e6c65c4c8adae66b6c153685344397f7341c7c097c45f792f0a181966f7";
const SOURCE_PAGE_ID = 40473;
const SOURCE_REVISION = 3197261;
const SOURCE_TIMESTAMP = "2021-11-15T18:09:03Z";
const SOURCE_CONTENT_SHA256 = "cf1f7564468de41a5df52fa9bac1418f5cf32b3bddb76bcb508cb63ee851a8be";
const REVIEWED_AT = "2026-08-04T01:39:57.000Z";
const CYCLE_ID = "cycle_d329cc10b79ec2e1edf1a42d";
const CYCLE_EVENT_ID = "waterline_64ddb39f00e01ec887761d28";
const EXPECTED_MEDIA_ITEM_IDS = [
  "ma_0240e57f232507fecbdf79a4",
  "ma_ca836f81862d50b47e16016a"
];
const EXPECTED_MEDIA_FACETS_SHA256 = "6de016163f0f05cc27c1d4d31e2a7226b7fead4036a1d726a934ccfb962e24b6";
const PORTRAIT_SRC = "images/uc-1348-portrait.jpg";
const PORTRAIT_SHA256 = "6ee6c78d48f5ea533d60945988d2cf148312deaff2688d34796c44f931e9121b";
const PORTRAIT_SOURCE_SHA256 = "f3263902fc3488fc24991a569cb7152d3629dc1bd5c900f74970e30bc376891e";
const PORTRAIT_METADATA_SHA256 = "ff82fb019d52125f25dc25c9d9fdcae4cffb4cbe07902d2920faa44b56a1b687";
const PORTRAIT_ORIGIN = "https://commons.wikimedia.org/wiki/File:Dan_Starkey_by_Gage_Skidmore.jpg";
const PORTRAIT_AUTHOR = "Gage Skidmore";
const PORTRAIT_LICENSE = "CC BY-SA 3.0";
const PORTRAIT_COMMONS_PAGEID = 49252093;
const PORTRAIT_PREPARATION = {
  "artifact_id": 8875619657,
  "artifact_sha256": "467800cb773a9033d3a836f4604aaa1911232a51e3cc9af081f254eede18e0b5",
  "workflow_job": 91853582624,
  "workflow_run": 30864593885
};
const EXPECTED_HISTORICAL_QUEUE = {
  "in_flight": 0,
  "queued": 313,
  "resolved": 3,
  "total": 316
};
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stable(value));
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readJsonl = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const exact = (actual, expected, label) => { if (stableJson(actual) !== stableJson(expected)) fail(label + " drifted"); };

const receipt = read(RECEIPT_PATH);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
if (receipt.receipt_sha256 !== sha(JSON.stringify(stable(receiptBody), null, 2) + "\n")) fail("cycle 003 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-003-JASK") fail("cycle 003 transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 003 checker hash drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("cycle 003 receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const mediaManifest = read("data/media-manifest.json");
const greddReceipt = read("data/review/adapter-sdk/doctor-who-cycle-002-gredd.json");

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved") fail("Jask task is not resolved");
if (job.performer !== "Dan Starkey" || job.character !== "Jask (The End of Time)") fail("Jask task identity drifted");
if (stableJson(job.performance_modes) !== stableJson(["unresolved"])) fail("Jask queued mode hint drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Jask source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Jask source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Jask wall binding drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.actor !== "Dan Starkey" || wall.character !== "Jask (The End of Time)" || wall.production !== "The End of Time" || wall.universe !== "Doctor Who" || wall.kind !== undefined || wall.transform !== 5 || wall.years !== "2010" || wall.designer !== "—" || wall.link !== SOURCE) fail("Jask canonical physical record drifted");
if (wall.still !== undefined) fail("Jask acquired unsupported character still bytes");
if (!wall.portrait || wall.portrait.src !== PORTRAIT_SRC || wall.portrait.kind !== "free" || wall.portrait.origin !== PORTRAIT_ORIGIN || wall.portrait.author !== PORTRAIT_AUTHOR || wall.portrait.license !== PORTRAIT_LICENSE) fail("Jask portrait custody drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE)) fail("Jask lost exact performance evidence");
if (!(wall.references || []).some((row) => row.claim === "production" && row.source === CAST_SOURCE)) fail("Jask lost production cast evidence");

const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Jask (The End of Time)" || sourceRow.universe !== "Doctor Who" || sourceRow.still !== null || !sourceRow.portrait || sourceRow.portrait.src !== PORTRAIT_SRC || sourceRow.portrait.origin !== PORTRAIT_ORIGIN || sourceRow.fetched_at !== "2026-08-04") fail("Jask source ledger drifted");
const manifestAsset = mediaManifest.assets?.[PORTRAIT_SRC];
if (!manifestAsset || manifestAsset.sha256 !== PORTRAIT_SHA256 || manifestAsset.location !== "release" || manifestAsset.id !== WALL_ID || manifestAsset.side !== "portrait") fail("Jask release media receipt drifted");
if (sha(fs.readFileSync(PORTRAIT_SRC)) !== PORTRAIT_SHA256) fail("Jask portrait bytes drifted");
for (const row of specimens) {
  if (row.id === WALL_ID) continue;
  for (const side of ["portrait", "still"]) {
    const src = row[side]?.src;
    if (src && fs.existsSync(src) && sha(fs.readFileSync(src)) === PORTRAIT_SHA256) fail("Jask portrait bytes were duplicated onto " + row.id + " " + side);
  }
}

const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
const portraitFacet = facets.find((row) => row.side === "portrait");
const stillFacet = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portraitFacet || portraitFacet.scope !== "doctor-who" || portraitFacet.status !== "verified" || portraitFacet.asset?.sha256 !== PORTRAIT_SHA256 || !stillFacet || stillFacet.scope !== "doctor-who" || stillFacet.status !== "absent" || stillFacet.asset !== null) fail("Jask media facets do not preserve verified portrait and honest still absence");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Jask media item identities");
const facetReceipt = facets.map((row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims }));
if (sha(JSON.stringify(stable(facetReceipt), null, 2) + "\n") !== EXPECTED_MEDIA_FACETS_SHA256) fail("Jask media facet digest drifted");
if (!stillFacet.risk_codes?.includes("source-declared-absent")) fail("Jask still absence lost its explicit risk code");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Doctor Who claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 3) fail("cycle 003 review boundary does not contain exactly three Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Jask (The End of Time)" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 003 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 003 claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 003 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 003 reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("cycle 003 receipt ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("cycle 003 journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("cycle 003 journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "cycle 003 historical queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 3) fail("current Doctor Who denominator or terminal cycle state drifted");
if (!receipt.boundary || receipt.boundary.fourth_lease_issued !== false || receipt.boundary.generic_sontaran_image_used !== false || receipt.boundary.existing_dan_starkey_portrait_duplicated !== false || receipt.boundary.independent_portrait_adopted !== true || receipt.boundary.portrait_treated_as_character_evidence !== false || receipt.boundary.portrait_sha256 !== PORTRAIT_SHA256 || receipt.boundary.portrait_metadata_sha256 !== PORTRAIT_METADATA_SHA256 || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_census_mutated !== false || receipt.boundary.roadmap_completion_claimed !== false) fail("cycle 003 boundary drifted");
if (receipt.isolation.non_doctor_jobs_sha256_before !== receipt.isolation.non_doctor_jobs_sha256_after || receipt.isolation.star_trek_jobs_sha256_before !== receipt.isolation.star_trek_jobs_sha256_after || receipt.isolation.coverage_delta?.changed_rows !== 1 || receipt.isolation.coverage_delta?.before?.role_on_wall !== false || receipt.isolation.coverage_delta?.after?.role_on_wall !== true || stableJson(receipt.isolation.coverage_delta?.after?.wall_ids) !== stableJson([WALL_ID]) || receipt.isolation.manifest_sha256_before !== receipt.isolation.manifest_sha256_after) fail("cycle 003 isolation receipt drifted");
if (receipt.task.queued_mode_hint !== "unresolved" || receipt.task.adjudicated_kind !== "face" || receipt.task.adjudicated_performance_mode !== "physical-prosthetic") fail("cycle 003 mode adjudication drifted");
exact(receipt.media.preparation, PORTRAIT_PREPARATION, "cycle 003 portrait preparation custody");
if (receipt.media.portrait_source_sha256 !== PORTRAIT_SOURCE_SHA256 || receipt.media.portrait_metadata_sha256 !== PORTRAIT_METADATA_SHA256 || receipt.media.portrait_commons_pageid !== PORTRAIT_COMMONS_PAGEID) fail("cycle 003 portrait source custody drifted");
if (greddReceipt.receipt_sha256 !== receipt.prior_custody.gredd_cycle_receipt_declared_sha256 || greddReceipt.reviewed_cycle?.id !== receipt.prior_custody.gredd_cycle_id) fail("cycle 003 lost Gredd prior-cycle custody");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256, PORTRAIT_SHA256, PORTRAIT_METADATA_SHA256, PORTRAIT_PREPARATION.workflow_run, PORTRAIT_PREPARATION.workflow_job, PORTRAIT_PREPARATION.artifact_id, PORTRAIT_PREPARATION.artifact_sha256]) if (!evidenceText.includes(String(token))) fail("cycle 003 evidence lacks exact token " + token);
console.log("doctor-who-cycle-003: PASS — exact Jask claim, physical-prosthetic adjudication, source, canonical record, independent portrait, honest still absence, cycle, receipt, and historical three-claim custody are intact");
