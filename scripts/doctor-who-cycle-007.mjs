#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-007-kragar.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-007.mjs";
const TASK_ID = "ap_ffea809b980b468b33fa462c";
const LEASE_ID = "lease_acb2309e7fb477769749751c";
const WALL_ID = "UC-1352";
const SOURCE = "https://tardis.fandom.com/wiki/Kragar";
const PRODUCTION_SOURCE = "https://www.doctorwho.tv/stories/the-halloween-apocalypse";
const SOURCE_FINGERPRINT = "8baf724d7501a98347e50b135dbe732586da3f3954908394122d5b31cbd734d1";
const SOURCE_PAGE_ID = 301280;
const SOURCE_REVISION = 3711733;
const SOURCE_TIMESTAMP = "2024-02-17T17:54:11Z";
const SOURCE_CONTENT_SHA256 = "6f57112817f92b445ae7f32223f3d4e095c11f2c1702bab84eca4eccc17d8428";
const REVIEWED_AT = "2026-08-05T21:05:00.000Z";
const CYCLE_ID = "cycle_540222fb1378fa680a43d080";
const CYCLE_EVENT_ID = "waterline_ec49c3ec232365c8a2125777";
const EXPECTED_MEDIA_ITEM_IDS = [
  "ma_7f040366f3c7db3db72d0237",
  "ma_a9eaf46904df457124649520"
];
const EXPECTED_MEDIA_FACETS_SHA256 = "409f6b380f827d8529046b4ca5398d8fb5a64f1158652a596b346500b234d596";
const STILL_SRC = "images/uc-1352-still.jpg";
const STILL_SHA256 = "f6f32eb1c51445838ba27ae449548d9bb581b04bb2b321a5789f7f285872d409";
const STILL_SOURCE_SHA256 = "904ad4b1493f14b7e7df8413bb95bbc312decf2d5d398b26a285dec122f62e70";
const STILL_ORIGIN = "https://tardis.fandom.com/wiki/File:Hologram_Kragar.jpg";
const STILL_FILE_PAGEID = 301279;
const STILL_SOURCE_DIMENSIONS = {
  "height": 302,
  "width": 502
};
const STILL_DIMENSIONS = {
  "height": 302,
  "width": 502
};
const STILL_BYTES = 15719;
const STILL_VERIFICATION = {
  "current_main": "014dbd3a4d9d4e82c0832d4c14f08cfff5138a58",
  "media_review_artifact_id": 8939289391,
  "media_review_artifact_sha256": "92a881f1524cae077de70cb50c5058e5f549d5ebebbb20db872d156faba64bc2",
  "media_review_job": 92379848771,
  "media_review_receipt_sha256": "a65573d2cf2c47be7a491965d842f89471aab5309b51772ec96b5514e02fa3ba",
  "media_review_run": 31027579331,
  "preflight_artifact_id": 8937962169,
  "preflight_artifact_sha256": "54e6b52d80390c1c97255e7daf7be0f9dc0adabb303366731562bd0ddc1673d4",
  "preflight_run": 31024339060,
  "selection_artifact_id": 8937524867,
  "selection_artifact_sha256": "18fd72083fbe773aec74e23cbcac1ab82c7bc920fb267b9ef06bc23b6009e2e2",
  "selection_run": 31023209453,
  "verification_json_sha256": "b6fdf900f0aff6f96911ff3c9d9a2906889caf93475e077c6233bcf28b13b886"
};
const EXPECTED_HISTORICAL_QUEUE = {
  "in_flight": 0,
  "queued": 309,
  "resolved": 7,
  "total": 316
};
const CYCLE006_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-kayste.json";
const CYCLE006_RECEIPT_FILE_SHA256 = "27c77be0f661e9a8465651e953cfb0dcb321cddd59654c263635945fa5191032";
const CYCLE006_RECEIPT_SHA256 = "d0a45a782e41756e4fd18440b6dab8ec9879feb01d949dc8d1f9efe9e7165faa";
const CYCLE006_ID = "cycle_4ee0abebffec084feda08162";
const CYCLE006_CHECKER_PATH = "scripts/doctor-who-cycle-006.mjs";
const CYCLE006_CHECKER_SHA256 = "fba8081197b36076ce3832d05ac58623c2265de78442741a4691575f387b852f";
const CYCLE006_CHRONOLOGY_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology.json";
const CYCLE006_CHRONOLOGY_RECEIPT_FILE_SHA256 = "7ec46d2f4117c7005e05ef190d446d3a9b4062dd83dc3b1d432594785b12169c";
const CYCLE006_CHRONOLOGY_RECEIPT_SHA256 = "e8bc8fbeb9cdad1f0951d2c3e92f16f6c1bb24d19783133766453127a32a8fb7";
const CYCLE006_CHRONOLOGY_CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology.mjs";
const CYCLE006_CHRONOLOGY_CHECKER_SHA256 = "6f3001a95a5079cd009a731377eee72c824e1daeadcbe3f8f8d083c06833788c";
const CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology-composability.json";
const CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_FILE_SHA256 = "713c6a93581aea0b0aa7f9fe146bd00032b1658163d0b27ba9dec8ca375d8522";
const CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_SHA256 = "2ff7a24de77cf8480593ee3b4c2234258af092e208f3c120ba23bb3eb05b26f6";
const CYCLE006_CHRONOLOGY_COMPOSABILITY_CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology-composable.mjs";
const CYCLE006_CHRONOLOGY_COMPOSABILITY_CHECKER_SHA256 = "d0dc13f8da17e3a531c979d7287d26d5a0d711f8ec0e95f1903ed3e815b08275";
const ACCEPTED_AT = "2026-08-05T20:58:00.000Z";
const EXPECTED_CANDIDATE_EVENT_ID = "jr_GQ50YmqPKVvy64leDFRIqE";
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stable(value));
const stablePretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readJsonl = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const exact = (actual, expected, label) => { if (stableJson(actual) !== stableJson(expected)) fail(label + " drifted"); };

const receipt = read(RECEIPT_PATH);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
if (receipt.receipt_sha256 !== sha(stablePretty(receiptBody))) fail("cycle 007 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-007-KRAGAR") fail("cycle 007 transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 007 checker hash drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("cycle 007 receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const mediaManifest = read("data/media-manifest.json");
const candidateJournal = readJsonl("data/journal/candidates.jsonl");
const cycle006ChronologyReceipt = read(CYCLE006_CHRONOLOGY_RECEIPT_PATH);
const cycle006ChronologyComposableReceipt = read(CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_PATH);
const cycle004Receipt = read("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json");
const cycle004StillCorrection = read("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json");
const cycle006Receipt = read(CYCLE006_RECEIPT_PATH);

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved") fail("Kragar task is not resolved");
if (job.performer !== "Dan Starkey" || job.character !== "Kragar") fail("Kragar task identity drifted");
if (stableJson(job.performance_modes) !== stableJson(["unresolved"])) fail("Kragar queued-mode hint drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Kragar source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Kragar source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Kragar wall binding drifted");

const candidateEvents = candidateJournal.filter((row) => row.op === "draft.accept" && row.specimen === WALL_ID);
if (candidateEvents.length !== 1) fail("Kragar candidate acceptance is missing or duplicated");
const candidateEvent = candidateEvents[0];
const candidateBody = structuredClone(candidateEvent);
delete candidateBody.id;
const candidateId = "jr_" + crypto.createHash("sha256").update(candidateEvent.actor + "|" + JSON.stringify(candidateBody)).digest("base64url").slice(0, 22);
if (candidateEvent.id !== EXPECTED_CANDIDATE_EVENT_ID || candidateEvent.id !== candidateId) fail("Kragar candidate acceptance is not content-addressed");
if (candidateEvent.ts !== ACCEPTED_AT || Date.parse(candidateEvent.ts) <= Date.parse(receipt.lease.claimed_at) || Date.parse(candidateEvent.ts) >= Date.parse(REVIEWED_AT)) fail("Kragar candidate chronology drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.actor !== "Dan Starkey" || wall.character !== "Kragar" || wall.production !== "The Halloween Apocalypse" || wall.universe !== "Doctor Who" || wall.kind !== "face" || wall.transform !== 5 || wall.years !== "2021" || wall.designer !== "Ray Holman / Claire Pritchard-Jones" || wall.link !== SOURCE) fail("Kragar canonical physical-prosthetic record drifted");
if (wall.portrait !== undefined) fail("Kragar acquired unauthorized performer portrait bytes");
if (!wall.still || wall.still.src !== STILL_SRC || wall.still.kind !== "still" || wall.still.origin !== STILL_ORIGIN || wall.still.pin !== true) fail("Kragar still custody drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE)) fail("Kragar lost exact performance evidence");
if (!(wall.references || []).some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE)) fail("Kragar lost production evidence");

const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Kragar" || sourceRow.universe !== "Doctor Who" || sourceRow.portrait !== null || !sourceRow.still || sourceRow.still.src !== STILL_SRC || sourceRow.still.origin !== STILL_ORIGIN || sourceRow.fetched_at !== "2026-08-05") fail("Kragar source ledger drifted");
const manifestAsset = mediaManifest.assets?.[STILL_SRC];
if (!manifestAsset || manifestAsset.sha256 !== STILL_SHA256 || manifestAsset.location !== "release" || manifestAsset.id !== WALL_ID || manifestAsset.side !== "still" || manifestAsset.bytes !== STILL_BYTES) fail("Kragar release media receipt drifted");
if (sha(fs.readFileSync(STILL_SRC)) !== STILL_SHA256) fail("Kragar still bytes drifted");
for (const row of specimens) {
  if (row.id === WALL_ID) continue;
  for (const side of ["portrait", "still"]) {
    const src = row[side]?.src;
    if (src && fs.existsSync(src) && sha(fs.readFileSync(src)) === STILL_SHA256) fail("Kragar still bytes were duplicated onto " + row.id + " " + side);
  }
}

const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
const portraitFacet = facets.find((row) => row.side === "portrait");
const stillFacet = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portraitFacet || portraitFacet.scope !== "doctor-who" || portraitFacet.status !== "absent" || portraitFacet.asset !== null || !stillFacet || stillFacet.scope !== "doctor-who" || stillFacet.status !== "verified" || stillFacet.asset?.sha256 !== STILL_SHA256) fail("Kragar media facets do not preserve honest portrait absence and verified exact still");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Kragar media item identities");
const facetReceipt = facets.map((row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims }));
if (sha(stablePretty(facetReceipt)) !== EXPECTED_MEDIA_FACETS_SHA256) fail("Kragar media facet digest drifted");
if (!stillFacet.votes?.some((row) => row.namespace === "identity" && row.value === "expected" && row.enforced === true)) fail("Kragar still lost enforced identity custody");
if (!stillFacet.votes?.some((row) => row.namespace === "presentation" && row.value === "character-depiction" && row.enforced === true)) fail("Kragar still lost enforced presentation custody");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Doctor Who claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 7) fail("cycle 007 review boundary does not contain exactly seven Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Kragar" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 007 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 007 claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 007 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 007 reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("cycle 007 receipt ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("cycle 007 journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("cycle 007 journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "cycle 007 historical queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 7) fail("current Doctor Who denominator or terminal cycle state drifted");
if (!receipt.boundary || receipt.boundary.seventh_doctor_who_lease_is_this_cycle !== true || receipt.boundary.eighth_lease_issued !== false || receipt.boundary.generic_sontaran_image_used !== false || receipt.boundary.existing_dan_starkey_portrait_duplicated !== false || receipt.boundary.portrait_adopted !== false || receipt.boundary.portrait_status !== "absent" || receipt.boundary.exact_character_still_adopted !== true || receipt.boundary.still_treated_as_character_evidence !== true || receipt.boundary.still_sha256 !== STILL_SHA256 || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_census_mutated !== false || receipt.boundary.roadmap_completion_claimed !== false) fail("cycle 007 boundary drifted");
if (receipt.isolation.non_doctor_jobs_sha256_before !== receipt.isolation.non_doctor_jobs_sha256_after || receipt.isolation.star_trek_jobs_sha256_before !== receipt.isolation.star_trek_jobs_sha256_after || receipt.isolation.coverage_delta?.changed_rows !== 1 || receipt.isolation.coverage_delta?.before?.role_on_wall !== false || receipt.isolation.coverage_delta?.after?.role_on_wall !== true || stableJson(receipt.isolation.coverage_delta?.after?.wall_ids) !== stableJson([WALL_ID]) || receipt.isolation.manifest_sha256_before !== receipt.isolation.manifest_sha256_after) fail("cycle 007 isolation receipt drifted");
if (receipt.task.queued_mode_hint !== "unresolved" || receipt.task.adjudicated_kind !== "face" || receipt.task.adjudicated_performance_mode !== "physical-prosthetic") fail("cycle 007 mode custody drifted");
exact(receipt.media.verification, STILL_VERIFICATION, "cycle 007 still verification custody");
if (receipt.media.still_source_sha256 !== STILL_SOURCE_SHA256 || receipt.media.still_file_pageid !== STILL_FILE_PAGEID || stableJson(receipt.media.still_source_dimensions) !== stableJson(STILL_SOURCE_DIMENSIONS) || stableJson(receipt.media.still_dimensions) !== stableJson(STILL_DIMENSIONS)) fail("cycle 007 still source custody drifted");
if (cycle004Receipt.receipt_sha256 !== receipt.prior_custody.cycle_004_receipt_declared_sha256 || cycle004Receipt.reviewed_cycle?.id !== receipt.prior_custody.cycle_004_id) fail("cycle 007 lost cycle 004 custody");
if (cycle004StillCorrection.receipt_sha256 !== receipt.prior_custody.cycle_004_still_correction_receipt_sha256) fail("cycle 007 lost cycle 004 still-correction custody");
if (sha(fs.readFileSync(CYCLE006_RECEIPT_PATH)) !== CYCLE006_RECEIPT_FILE_SHA256 || cycle006Receipt.receipt_sha256 !== CYCLE006_RECEIPT_SHA256 || cycle006Receipt.reviewed_cycle?.id !== CYCLE006_ID || receipt.prior_custody.cycle_006_receipt_file_sha256 !== CYCLE006_RECEIPT_FILE_SHA256 || receipt.prior_custody.cycle_006_receipt_declared_sha256 !== CYCLE006_RECEIPT_SHA256 || receipt.prior_custody.cycle_006_id !== CYCLE006_ID || receipt.prior_custody.cycle_006_checker_sha256 !== CYCLE006_CHECKER_SHA256 || sha(fs.readFileSync(CYCLE006_CHECKER_PATH)) !== CYCLE006_CHECKER_SHA256) fail("cycle 007 lost exact cycle 006 custody");
const chronologyBody = structuredClone(cycle006ChronologyReceipt);
delete chronologyBody.receipt_sha256;
if (sha(fs.readFileSync(CYCLE006_CHRONOLOGY_RECEIPT_PATH)) !== CYCLE006_CHRONOLOGY_RECEIPT_FILE_SHA256 || cycle006ChronologyReceipt.receipt_sha256 !== CYCLE006_CHRONOLOGY_RECEIPT_SHA256 || cycle006ChronologyReceipt.receipt_sha256 !== sha(stablePretty(chronologyBody)) || sha(fs.readFileSync(CYCLE006_CHRONOLOGY_CHECKER_PATH)) !== CYCLE006_CHRONOLOGY_CHECKER_SHA256 || receipt.prior_custody.cycle_006_chronology_receipt_file_sha256 !== CYCLE006_CHRONOLOGY_RECEIPT_FILE_SHA256 || receipt.prior_custody.cycle_006_chronology_receipt_sha256 !== CYCLE006_CHRONOLOGY_RECEIPT_SHA256 || receipt.prior_custody.cycle_006_chronology_checker_sha256 !== CYCLE006_CHRONOLOGY_CHECKER_SHA256) fail("cycle 007 lost cycle 006 chronology custody");
const composabilityBody = structuredClone(cycle006ChronologyComposableReceipt);
delete composabilityBody.receipt_sha256;
if (sha(fs.readFileSync(CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_PATH)) !== CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_FILE_SHA256 || cycle006ChronologyComposableReceipt.receipt_sha256 !== CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_SHA256 || cycle006ChronologyComposableReceipt.receipt_sha256 !== sha(stablePretty(composabilityBody)) || sha(fs.readFileSync(CYCLE006_CHRONOLOGY_COMPOSABILITY_CHECKER_PATH)) !== CYCLE006_CHRONOLOGY_COMPOSABILITY_CHECKER_SHA256 || receipt.prior_custody.cycle_006_chronology_composability_receipt_file_sha256 !== CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_FILE_SHA256 || receipt.prior_custody.cycle_006_chronology_composability_receipt_sha256 !== CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_SHA256 || receipt.prior_custody.cycle_006_chronology_composability_checker_sha256 !== CYCLE006_CHRONOLOGY_COMPOSABILITY_CHECKER_SHA256) fail("cycle 007 lost cycle 006 chronology composability custody");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256, STILL_SHA256, STILL_SOURCE_SHA256, STILL_VERIFICATION.selection_run, STILL_VERIFICATION.selection_artifact_id, STILL_VERIFICATION.selection_artifact_sha256, STILL_VERIFICATION.preflight_run, STILL_VERIFICATION.preflight_artifact_id, STILL_VERIFICATION.preflight_artifact_sha256, STILL_VERIFICATION.media_review_run, STILL_VERIFICATION.media_review_job, STILL_VERIFICATION.media_review_artifact_id, STILL_VERIFICATION.media_review_artifact_sha256, STILL_VERIFICATION.media_review_receipt_sha256, CYCLE006_RECEIPT_SHA256, CYCLE006_CHECKER_SHA256, CYCLE006_CHRONOLOGY_RECEIPT_FILE_SHA256, CYCLE006_CHRONOLOGY_RECEIPT_SHA256, CYCLE006_CHRONOLOGY_CHECKER_SHA256, CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_FILE_SHA256, CYCLE006_CHRONOLOGY_COMPOSABILITY_RECEIPT_SHA256, CYCLE006_CHRONOLOGY_COMPOSABILITY_CHECKER_SHA256, ACCEPTED_AT, EXPECTED_CANDIDATE_EVENT_ID]) if (!evidenceText.includes(String(token))) fail("cycle 007 evidence lacks exact token " + token);
console.log("doctor-who-cycle-007: PASS — exact Kragar physical-prosthetic claim, source, canonical record, exact verified still, honest portrait absence, cycle, receipt, and historical seven-claim custody are intact");
