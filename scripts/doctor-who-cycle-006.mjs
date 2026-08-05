#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-kayste.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-006.mjs";
const TASK_ID = "ap_c8e74653ac0877837814db21";
const LEASE_ID = "lease_476aaf782c8417a4372eb6be";
const WALL_ID = "UC-1351";
const SOURCE = "https://tardis.fandom.com/wiki/Kayste";
const PRODUCTION_SOURCE = "https://tardis.fandom.com/wiki/Terror_of_the_Sontarans_(audio_story)";
const SOURCE_FINGERPRINT = "5a28fd22ffbd22398bd63338896f32f83edc5b88dc9248e3045fb5e5e85f82e2";
const SOURCE_PAGE_ID = 184657;
const SOURCE_REVISION = 2593000;
const SOURCE_TIMESTAMP = "2018-12-01T22:00:55Z";
const SOURCE_CONTENT_SHA256 = "3ff314fbae95a13aead70ca7934692859d27e1ab57d7289b608692dd44bf06e2";
const REVIEWED_AT = "2026-08-05T15:34:05.000Z";
const CYCLE_ID = "cycle_4ee0abebffec084feda08162";
const CYCLE_EVENT_ID = "waterline_ffe10aada51276be5ee2f6c5";
const EXPECTED_MEDIA_ITEM_IDS = [
  "ma_8f1959c57f5f558491ca3545",
  "ma_2e71ffbcd84c4bb5bad954c4"
];
const EXPECTED_MEDIA_FACETS_SHA256 = "586f371f7cdfdac7951e1cea65c1db9b4122b9ac48192225236981679feeb94a";
const PORTRAIT_SRC = "images/uc-1351-portrait.jpg";
const PORTRAIT_SHA256 = "fb8b502322d70d59c670095d45e05f6daa6f7b546bb806d86eb2eac673b58c3e";
const PORTRAIT_SOURCE_SHA256 = "efba431abf95c92d66b91d01b29dc34e2237f7211fb1118e27dd92f48eea4d21";
const PORTRAIT_ORIGIN = "https://commons.wikimedia.org/wiki/File:Dan_Starkey_(27229445610).jpg";
const PORTRAIT_FILE_PAGEID = 76686103;
const PORTRAIT_SOURCE_DIMENSIONS = {
  "height": 3744,
  "width": 5616
};
const PORTRAIT_DIMENSIONS = {
  "height": 600,
  "width": 420
};
const PORTRAIT_BYTES = 48063;
const PORTRAIT_VERIFICATION = {
  "attested_main": "2b3562191104ba90ecb9b56c5a83598d339a6271",
  "current_main": "30b7bd2628c7228c9abfd350eb776eb0d6eb8090",
  "media_artifact_id": 8909395297,
  "media_artifact_sha256": "63438fedf66432d459f0f8fa4343244ee650230de95218ff5648f7da4c8f2ed2",
  "media_run": 30951744686,
  "rebind_artifact_id": 8923596451,
  "rebind_artifact_sha256": "ed643af1abba44695f402caa297e83406cf26d4f666ca7a46e5ee72111a6db9c",
  "rebind_receipt_sha256": "b762eedb46fec55d1fb00002b557160c191ae75fcc4f745c2a8712f96798e41b",
  "rebind_run": 30989625719,
  "selection_artifact_id": 8908947768,
  "selection_artifact_sha256": "15f153e93224d75d3168664ba1c55ebf42c61e864280aded3e3c571c5cde4413",
  "selection_run": 30950611825,
  "verification_json_sha256": "3bcce671b24450635f1176dce6e2be067a7760d3a8b778e29ebd05deef162d7d"
};
const EXPECTED_HISTORICAL_QUEUE = {
  "in_flight": 0,
  "queued": 310,
  "resolved": 6,
  "total": 316
};
const CYCLE004_STILL_CHECKER_PATH = "scripts/doctor-who-cycle-004-still-correction.mjs";
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json";
const CYCLE004_STILL_CHECKER_SHA256_AFTER = "31df003f52705fa94f74bf06158dfa8813752be4547d87593a664f1a0f3d88a4";
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 = "a4690fdeb9f73d9a427802a0f04201673efa35809cac3e890932fce14b1eeb1d";
const CYCLE005_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-005-kaarsh.json";
const CYCLE005_RECEIPT_SHA256 = "4aca70c6bb35adda79fc1af407986fdac1cef74c188167a3fdcff8a740da8328";
const CYCLE005_ID = "cycle_77498692970990f4ee98405e";
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
if (receipt.receipt_sha256 !== sha(stablePretty(receiptBody))) fail("cycle 006 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-006-KAYSTE") fail("cycle 006 transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 006 checker hash drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("cycle 006 receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const mediaManifest = read("data/media-manifest.json");
const cycle004Receipt = read("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json");
const cycle004StillCorrection = read("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json");
const cycle004StillComposability = read(CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH);
const cycle005Receipt = read(CYCLE005_RECEIPT_PATH);

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved") fail("Kayste task is not resolved");
if (job.performer !== "Dan Starkey" || job.character !== "Kayste") fail("Kayste task identity drifted");
if (stableJson(job.performance_modes) !== stableJson(["voice"])) fail("Kayste voice mode drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Kayste source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Kayste source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Kayste wall binding drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.actor !== "Dan Starkey" || wall.character !== "Kayste" || wall.production !== "Terror of the Sontarans" || wall.universe !== "Doctor Who" || wall.kind !== "voice" || wall.transform !== 2 || wall.years !== "2015" || wall.designer !== "Big Finish Productions" || wall.link !== SOURCE) fail("Kayste canonical voice record drifted");
if (wall.still !== undefined) fail("Kayste acquired unauthorized character-still bytes");
if (!wall.portrait || wall.portrait.src !== PORTRAIT_SRC || wall.portrait.kind !== "free" || wall.portrait.origin !== PORTRAIT_ORIGIN || wall.portrait.pin !== true) fail("Kayste performer portrait custody drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE)) fail("Kayste lost exact performance evidence");
if (!(wall.references || []).some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE)) fail("Kayste lost production evidence");

const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Kayste" || sourceRow.universe !== "Doctor Who" || sourceRow.still !== null || !sourceRow.portrait || sourceRow.portrait.src !== PORTRAIT_SRC || sourceRow.portrait.origin !== PORTRAIT_ORIGIN || sourceRow.fetched_at !== "2026-08-05") fail("Kayste source ledger drifted");
const manifestAsset = mediaManifest.assets?.[PORTRAIT_SRC];
if (!manifestAsset || manifestAsset.sha256 !== PORTRAIT_SHA256 || manifestAsset.location !== "release" || manifestAsset.id !== WALL_ID || manifestAsset.side !== "portrait" || manifestAsset.bytes !== PORTRAIT_BYTES) fail("Kayste release portrait receipt drifted");
if (sha(fs.readFileSync(PORTRAIT_SRC)) !== PORTRAIT_SHA256) fail("Kayste portrait bytes drifted");
for (const row of specimens) {
  if (row.id === WALL_ID) continue;
  for (const side of ["still", "portrait"]) {
    const src = row[side]?.src;
    if (src && fs.existsSync(src) && sha(fs.readFileSync(src)) === PORTRAIT_SHA256) fail("Kayste portrait bytes were duplicated onto " + row.id + " " + side);
  }
}

const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
const portraitFacet = facets.find((row) => row.side === "portrait");
const stillFacet = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portraitFacet || portraitFacet.scope !== "doctor-who" || portraitFacet.status !== "verified" || portraitFacet.asset?.sha256 !== PORTRAIT_SHA256 || portraitFacet.expected_subject !== "Dan Starkey" || !stillFacet || stillFacet.scope !== "doctor-who" || stillFacet.status !== "absent" || stillFacet.asset !== null || stillFacet.expected_subject !== "Kayste") fail("Kayste media facets do not preserve a verified performer portrait and honest character-still absence");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Kayste media item identities");
const facetReceipt = facets.map((row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims }));
if (sha(stablePretty(facetReceipt)) !== EXPECTED_MEDIA_FACETS_SHA256) fail("Kayste media facet digest drifted");
if (!portraitFacet.votes?.some((row) => row.namespace === "identity" && row.value === "expected" && row.enforced === true)) fail("Kayste portrait lost enforced identity custody");
if (!portraitFacet.votes?.some((row) => row.namespace === "presentation" && row.value === "neutral-human" && row.enforced === true)) fail("Kayste portrait lost enforced presentation custody");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Doctor Who claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 6) fail("cycle 006 review boundary does not contain exactly six Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Kayste" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 006 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 006 claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 006 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 006 reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("cycle 006 receipt ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("cycle 006 journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("cycle 006 journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "cycle 006 historical queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 6) fail("current Doctor Who denominator or terminal cycle state drifted");
if (!receipt.boundary || receipt.boundary.sixth_doctor_who_lease_is_this_cycle !== true || receipt.boundary.seventh_lease_issued !== false || receipt.boundary.generic_sontaran_image_used !== false || receipt.boundary.existing_dan_starkey_portrait_duplicated !== false || receipt.boundary.portrait_adopted !== true || receipt.boundary.portrait_status !== "verified" || receipt.boundary.still_adopted !== false || receipt.boundary.still_status !== "absent" || receipt.boundary.exact_performer_portrait_adopted !== true || receipt.boundary.portrait_treated_as_performer_evidence !== true || receipt.boundary.performer_portrait_never_character_evidence !== true || receipt.boundary.portrait_sha256 !== PORTRAIT_SHA256 || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_census_mutated !== false || receipt.boundary.roadmap_completion_claimed !== false) fail("cycle 006 boundary drifted");
if (receipt.isolation.non_doctor_jobs_sha256_before !== receipt.isolation.non_doctor_jobs_sha256_after || receipt.isolation.star_trek_jobs_sha256_before !== receipt.isolation.star_trek_jobs_sha256_after || receipt.isolation.coverage_delta?.changed_rows !== 1 || receipt.isolation.coverage_delta?.before?.role_on_wall !== false || receipt.isolation.coverage_delta?.after?.role_on_wall !== true || stableJson(receipt.isolation.coverage_delta?.after?.wall_ids) !== stableJson([WALL_ID]) || receipt.isolation.manifest_sha256_before !== receipt.isolation.manifest_sha256_after) fail("cycle 006 isolation receipt drifted");
if (receipt.task.queued_mode_hint !== "voice" || receipt.task.adjudicated_kind !== "voice" || receipt.task.adjudicated_performance_mode !== "voice") fail("cycle 006 mode custody drifted");
exact(receipt.media.verification, PORTRAIT_VERIFICATION, "cycle 006 portrait verification custody");
if (receipt.media.portrait_source_sha256 !== PORTRAIT_SOURCE_SHA256 || receipt.media.portrait_file_pageid !== PORTRAIT_FILE_PAGEID || stableJson(receipt.media.portrait_source_dimensions) !== stableJson(PORTRAIT_SOURCE_DIMENSIONS) || stableJson(receipt.media.portrait_dimensions) !== stableJson(PORTRAIT_DIMENSIONS)) fail("cycle 006 portrait source custody drifted");
if (cycle004Receipt.receipt_sha256 !== receipt.prior_custody.cycle_004_receipt_declared_sha256 || cycle004Receipt.reviewed_cycle?.id !== receipt.prior_custody.cycle_004_id) fail("cycle 006 lost cycle 004 custody");
if (cycle004StillCorrection.receipt_sha256 !== receipt.prior_custody.cycle_004_still_correction_receipt_sha256) fail("cycle 006 lost cycle 004 still-correction custody");
const cycle004StillComposabilityBody = structuredClone(cycle004StillComposability); delete cycle004StillComposabilityBody.receipt_sha256;
if (cycle004StillComposability.receipt_sha256 !== CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 || cycle004StillComposability.receipt_sha256 !== sha(stablePretty(cycle004StillComposabilityBody)) || sha(fs.readFileSync(CYCLE004_STILL_CHECKER_PATH)) !== CYCLE004_STILL_CHECKER_SHA256_AFTER) fail("cycle 006 lost cycle-004 still-correction composability custody");
if (cycle005Receipt.receipt_sha256 !== CYCLE005_RECEIPT_SHA256 || cycle005Receipt.reviewed_cycle?.id !== CYCLE005_ID || receipt.prior_custody.cycle_005_receipt_declared_sha256 !== CYCLE005_RECEIPT_SHA256 || receipt.prior_custody.cycle_005_id !== CYCLE005_ID) fail("cycle 006 lost cycle 005 custody");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256, PORTRAIT_SHA256, PORTRAIT_SOURCE_SHA256, PORTRAIT_VERIFICATION.selection_run, PORTRAIT_VERIFICATION.selection_artifact_id, PORTRAIT_VERIFICATION.selection_artifact_sha256, PORTRAIT_VERIFICATION.media_run, PORTRAIT_VERIFICATION.media_artifact_id, PORTRAIT_VERIFICATION.media_artifact_sha256, PORTRAIT_VERIFICATION.rebind_run, PORTRAIT_VERIFICATION.rebind_artifact_id, PORTRAIT_VERIFICATION.rebind_artifact_sha256, PORTRAIT_VERIFICATION.rebind_receipt_sha256, PORTRAIT_VERIFICATION.attested_main, PORTRAIT_VERIFICATION.current_main, CYCLE005_RECEIPT_SHA256]) if (!evidenceText.includes(String(token))) fail("cycle 006 evidence lacks exact token " + token);
console.log("doctor-who-cycle-006: PASS — exact Kayste voice claim, source, canonical record, verified performer portrait, honest character-still absence, reviewed cycle, and cycle-005 custody are intact");
