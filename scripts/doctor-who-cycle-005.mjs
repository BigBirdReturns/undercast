#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-005-kaarsh.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-005.mjs";
const TASK_ID = "ap_ed7221a03fdd4679379e23f8";
const LEASE_ID = "lease_cabb72cee8a697c2cf81744d";
const WALL_ID = "UC-1350";
const SOURCE = "https://tardis.fandom.com/wiki/Kaarsh";
const PRODUCTION_SOURCE = "https://tardis.fandom.com/wiki/The_Gunpowder_Plot_(video_game)";
const SOURCE_FINGERPRINT = "ba3075acf7a348064e8e11359afa0ecc35fa231f8867e8c9496e101884366d43";
const SOURCE_PAGE_ID = 89948;
const SOURCE_REVISION = 2331498;
const SOURCE_TIMESTAMP = "2017-06-05T17:53:32Z";
const SOURCE_CONTENT_SHA256 = "a656f352afef65b58a8945b08b0fbf869c6943a932125643cb60e236ff7cd3d4";
const REVIEWED_AT = "2026-08-04T20:21:08.000Z";
const CYCLE_ID = "cycle_77498692970990f4ee98405e";
const CYCLE_EVENT_ID = "waterline_675af87f7add6f4ed8d72f2f";
const EXPECTED_MEDIA_ITEM_IDS = [
  "ma_e702aa01b1d58288923e3cd3",
  "ma_7cc179f5b670091a75d06694"
];
const EXPECTED_MEDIA_FACETS_SHA256 = "c05febd73730712122bcb1755612bc78335dfe98a48d09c5a5dbeb5e6ae78004";
const STILL_SRC = "images/uc-1350-still.jpg";
const STILL_SHA256 = "ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad";
const STILL_SOURCE_SHA256 = "e1300bbbea2f5bde0cfb6596b30e37f97018299bedf131514001e0ed996492da";
const STILL_ORIGIN = "https://tardis.fandom.com/wiki/File:Kaarsh.jpg";
const STILL_FILE_PAGEID = 91567;
const STILL_SOURCE_DIMENSIONS = {
  "height": 454,
  "width": 778
};
const STILL_DIMENSIONS = {
  "height": 373,
  "width": 640
};
const STILL_BYTES = 41459;
const STILL_VERIFICATION = {
  "artifact_id": 8882817870,
  "artifact_sha256": "36e441d5b56a8e0bff8d3932426e29c2f49d747d3bc4834917729a8fe1f34c4a",
  "attested_main": "3b07edf7768478dba1e94ddda8471748aef34e50",
  "current_main": "c202745f3713017acd5a6118178c075ad59326bd",
  "drift_policy": {
    "allowed_paths": [
      ".github/workflows/apply-collection-mode.yml",
      ".github/workflows/collection-policy.yml",
      ".github/workflows/ux-02a-script-runner.yml",
      ".github/workflows/validate.yml",
      "data/MEDIA-SEARCH-LATEST.json",
      "data/journal/media-search.jsonl",
      "scripts/gate-fixtures.mjs"
    ],
    "observed_paths": [
      ".github/workflows/apply-collection-mode.yml",
      ".github/workflows/collection-policy.yml",
      ".github/workflows/ux-02a-script-runner.yml",
      ".github/workflows/validate.yml",
      "data/MEDIA-SEARCH-LATEST.json",
      "data/journal/media-search.jsonl",
      "scripts/gate-fixtures.mjs"
    ],
    "policy": "strict-path-allowlist"
  },
  "preflight_artifact_sha256": "bcf901d245e86e29dace2c3b890e6992948445f18d6e7abb6444413e31bb9d65",
  "preflight_run": 30884868963,
  "verification_json_sha256": "6059f44be171c9a30ecc87e8c0e5a4eccb059f1a315bad5d5a2d29998f24c04b",
  "workflow_job": 91914756059,
  "workflow_run": 30885200254
};
const EXPECTED_HISTORICAL_QUEUE = {
  "in_flight": 0,
  "queued": 311,
  "resolved": 5,
  "total": 316
};
const CYCLE004_STILL_CHECKER_PATH = "scripts/doctor-who-cycle-004-still-correction.mjs";
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json";
const CYCLE004_STILL_CHECKER_SHA256_BEFORE = "1e21cd5424c713db6bee1855af91622225661f29d6afc873186bf6e0f3b8f3ec";
const CYCLE004_STILL_CHECKER_SHA256_AFTER = "31df003f52705fa94f74bf06158dfa8813752be4547d87593a664f1a0f3d88a4";
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 = "a4690fdeb9f73d9a427802a0f04201673efa35809cac3e890932fce14b1eeb1d";
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
if (receipt.receipt_sha256 !== sha(stablePretty(receiptBody))) fail("cycle 005 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-005-KAARSH") fail("cycle 005 transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 005 checker hash drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("cycle 005 receipt contains a template placeholder");

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

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved") fail("Kaarsh task is not resolved");
if (job.performer !== "Dan Starkey" || job.character !== "Kaarsh") fail("Kaarsh task identity drifted");
if (stableJson(job.performance_modes) !== stableJson(["voice"])) fail("Kaarsh voice mode drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Kaarsh source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Kaarsh source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Kaarsh wall binding drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.actor !== "Dan Starkey" || wall.character !== "Kaarsh" || wall.production !== "The Gunpowder Plot" || wall.universe !== "Doctor Who" || wall.kind !== "voice" || wall.transform !== 2 || wall.years !== "2011" || wall.designer !== "Sumo Digital" || wall.link !== SOURCE) fail("Kaarsh canonical voice record drifted");
if (wall.portrait !== undefined) fail("Kaarsh acquired unauthorized performer portrait bytes");
if (!wall.still || wall.still.src !== STILL_SRC || wall.still.kind !== "still" || wall.still.origin !== STILL_ORIGIN || wall.still.pin !== true) fail("Kaarsh still custody drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE)) fail("Kaarsh lost exact performance evidence");
if (!(wall.references || []).some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE)) fail("Kaarsh lost production evidence");

const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Kaarsh" || sourceRow.universe !== "Doctor Who" || sourceRow.portrait !== null || !sourceRow.still || sourceRow.still.src !== STILL_SRC || sourceRow.still.origin !== STILL_ORIGIN || sourceRow.fetched_at !== "2026-08-04") fail("Kaarsh source ledger drifted");
const manifestAsset = mediaManifest.assets?.[STILL_SRC];
if (!manifestAsset || manifestAsset.sha256 !== STILL_SHA256 || manifestAsset.location !== "release" || manifestAsset.id !== WALL_ID || manifestAsset.side !== "still" || manifestAsset.bytes !== STILL_BYTES) fail("Kaarsh release media receipt drifted");
if (sha(fs.readFileSync(STILL_SRC)) !== STILL_SHA256) fail("Kaarsh still bytes drifted");
for (const row of specimens) {
  if (row.id === WALL_ID) continue;
  for (const side of ["portrait", "still"]) {
    const src = row[side]?.src;
    if (src && fs.existsSync(src) && sha(fs.readFileSync(src)) === STILL_SHA256) fail("Kaarsh still bytes were duplicated onto " + row.id + " " + side);
  }
}

const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
const portraitFacet = facets.find((row) => row.side === "portrait");
const stillFacet = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portraitFacet || portraitFacet.scope !== "doctor-who" || portraitFacet.status !== "absent" || portraitFacet.asset !== null || !stillFacet || stillFacet.scope !== "doctor-who" || stillFacet.status !== "verified" || stillFacet.asset?.sha256 !== STILL_SHA256) fail("Kaarsh media facets do not preserve honest portrait absence and verified exact still");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Kaarsh media item identities");
const facetReceipt = facets.map((row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims }));
if (sha(stablePretty(facetReceipt)) !== EXPECTED_MEDIA_FACETS_SHA256) fail("Kaarsh media facet digest drifted");
if (!stillFacet.votes?.some((row) => row.namespace === "identity" && row.value === "expected" && row.enforced === true)) fail("Kaarsh still lost enforced identity custody");
if (!stillFacet.votes?.some((row) => row.namespace === "presentation" && row.value === "character-depiction" && row.enforced === true)) fail("Kaarsh still lost enforced presentation custody");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Doctor Who claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 5) fail("cycle 005 review boundary does not contain exactly five Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Kaarsh" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 005 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 005 claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 005 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 005 reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("cycle 005 receipt ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("cycle 005 journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("cycle 005 journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "cycle 005 historical queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 5) fail("current Doctor Who denominator or terminal cycle state drifted");
if (!receipt.boundary || receipt.boundary.fifth_doctor_who_lease_is_this_cycle !== true || receipt.boundary.sixth_lease_issued !== false || receipt.boundary.generic_sontaran_image_used !== false || receipt.boundary.existing_dan_starkey_portrait_duplicated !== false || receipt.boundary.portrait_adopted !== false || receipt.boundary.portrait_status !== "absent" || receipt.boundary.exact_character_still_adopted !== true || receipt.boundary.still_treated_as_character_evidence !== true || receipt.boundary.still_sha256 !== STILL_SHA256 || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_census_mutated !== false || receipt.boundary.roadmap_completion_claimed !== false) fail("cycle 005 boundary drifted");
if (receipt.isolation.non_doctor_jobs_sha256_before !== receipt.isolation.non_doctor_jobs_sha256_after || receipt.isolation.star_trek_jobs_sha256_before !== receipt.isolation.star_trek_jobs_sha256_after || receipt.isolation.coverage_delta?.changed_rows !== 1 || receipt.isolation.coverage_delta?.before?.role_on_wall !== false || receipt.isolation.coverage_delta?.after?.role_on_wall !== true || stableJson(receipt.isolation.coverage_delta?.after?.wall_ids) !== stableJson([WALL_ID]) || receipt.isolation.manifest_sha256_before !== receipt.isolation.manifest_sha256_after) fail("cycle 005 isolation receipt drifted");
if (receipt.task.queued_mode_hint !== "voice" || receipt.task.adjudicated_kind !== "voice" || receipt.task.adjudicated_performance_mode !== "voice") fail("cycle 005 mode custody drifted");
exact(receipt.media.verification, STILL_VERIFICATION, "cycle 005 still verification custody");
if (receipt.media.still_source_sha256 !== STILL_SOURCE_SHA256 || receipt.media.still_file_pageid !== STILL_FILE_PAGEID || stableJson(receipt.media.still_source_dimensions) !== stableJson(STILL_SOURCE_DIMENSIONS) || stableJson(receipt.media.still_dimensions) !== stableJson(STILL_DIMENSIONS)) fail("cycle 005 still source custody drifted");
if (cycle004Receipt.receipt_sha256 !== receipt.prior_custody.cycle_004_receipt_declared_sha256 || cycle004Receipt.reviewed_cycle?.id !== receipt.prior_custody.cycle_004_id) fail("cycle 005 lost cycle 004 custody");
if (cycle004StillCorrection.receipt_sha256 !== receipt.prior_custody.cycle_004_still_correction_receipt_sha256) fail("cycle 005 lost cycle 004 still-correction custody");
const cycle004StillComposabilityBody = structuredClone(cycle004StillComposability); delete cycle004StillComposabilityBody.receipt_sha256;
if (cycle004StillComposability.receipt_sha256 !== CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 || cycle004StillComposability.receipt_sha256 !== sha(stablePretty(cycle004StillComposabilityBody))) fail("cycle 005 lost cycle-004 still-correction composability receipt custody");
if (sha(fs.readFileSync(CYCLE004_STILL_CHECKER_PATH)) !== CYCLE004_STILL_CHECKER_SHA256_AFTER || cycle004StillComposability.historical_custody?.original_correction_checker_sha256 !== CYCLE004_STILL_CHECKER_SHA256_BEFORE || cycle004StillComposability.qualification?.checker_sha256 !== CYCLE004_STILL_CHECKER_SHA256_AFTER) fail("cycle 005 lost cycle-004 still-correction checker transition custody");
if (receipt.prior_custody.cycle_004_still_composability_receipt_sha256 !== CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 || receipt.prior_custody.cycle_004_still_checker_sha256_before !== CYCLE004_STILL_CHECKER_SHA256_BEFORE || receipt.prior_custody.cycle_004_still_checker_sha256_after !== CYCLE004_STILL_CHECKER_SHA256_AFTER) fail("cycle 005 receipt lost cycle-004 still-correction composability binding");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256, STILL_SHA256, STILL_SOURCE_SHA256, STILL_VERIFICATION.workflow_run, STILL_VERIFICATION.workflow_job, STILL_VERIFICATION.artifact_id, STILL_VERIFICATION.artifact_sha256, STILL_VERIFICATION.preflight_run, STILL_VERIFICATION.preflight_artifact_sha256, CYCLE004_STILL_CHECKER_SHA256_BEFORE, CYCLE004_STILL_CHECKER_SHA256_AFTER]) if (!evidenceText.includes(String(token))) fail("cycle 005 evidence lacks exact token " + token);
console.log("doctor-who-cycle-005: PASS — exact Kaarsh voice claim, source, canonical record, verified still, reviewed cycle, and cycle-004 checker composability custody are intact");
