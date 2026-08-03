#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-002-gredd.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-002.mjs";
const TASK_ID = "ap_f6ca3d513c7ac0b6b9d67ce1";
const LEASE_ID = "lease_7effc261f7b927266f497b04";
const WALL_ID = "UC-1347";
const SOURCE = "https://tardis.fandom.com/wiki/Gredd";
const OFFICIAL_SOURCE = "https://www.bigfinish.com/releases/v/doctor-who-starlight-robbery-714";
const SOURCE_FINGERPRINT = "4be5cb67c57115c6f679e0c86361206eabd2768c39fb3c1f8326dcd8c120bfd0";
const SOURCE_PAGE_ID = 169772;
const SOURCE_REVISION = 2895150;
const SOURCE_TIMESTAMP = "2020-05-16T12:17:15Z";
const SOURCE_CONTENT_SHA256 = "cd83aeb119ec5ef30deb4cbca2c917d6119a83918fa01832863e5e96b6bc2b2d";
const REVIEWED_AT = "2026-08-03T21:38:57.000Z";
const CYCLE_ID = "cycle_66e8ad8054130ed137cbf984";
const CYCLE_EVENT_ID = "waterline_aea90b986375d9dd92f898d6";
const EXPECTED_MEDIA_ITEM_IDS = [
  "ma_a0421a71ebb9f1804d2867f9",
  "ma_92fc62839a35f9c672387615"
];
const EXPECTED_MEDIA_FACETS_SHA256 = "ccc5e73e9982ed2702e25ea76b7020aba71a2169b1ed48cb1947166096fb3810";
const PORTRAIT_SRC = "images/uc-1347-portrait.jpg";
const PORTRAIT_SHA256 = "bdd46b9538d188a221b5f0121f006e2832f283e51c2b24b5cc86f349b7f0429e";
const SOURCE_PORTRAIT_SHA256 = "270ae6a4f6fa209e95dc454927fdc71824ad14ea4bd927a976e79f8219c3e0ef";
const PORTRAIT_ORIGIN = "https://commons.wikimedia.org/wiki/File:Dan_Starkey_(16135605890).jpg";
const PORTRAIT_AUTHOR = "steve cranston";
const PORTRAIT_LICENSE = "CC BY-SA 2.0";
const EXPECTED_HISTORICAL_QUEUE = {
  "in_flight": 0,
  "queued": 314,
  "resolved": 2,
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
if (receipt.receipt_sha256 !== sha(JSON.stringify(stable(receiptBody), null, 2) + String.fromCharCode(10))) fail("cycle 002 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-002-GREDD") fail("cycle 002 transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 002 checker hash drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("cycle 002 receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const mediaManifest = read("data/media-manifest.json");

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved") fail("Gredd task is not resolved");
if (job.performer !== "Dan Starkey" || job.character !== "Gredd") fail("Gredd task identity drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Gredd source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Gredd source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Gredd wall binding drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.actor !== "Dan Starkey" || wall.character !== "Gredd" || wall.production !== "Starlight Robbery" || wall.universe !== "Doctor Who" || wall.kind !== "voice" || wall.transform !== 2 || wall.years !== "2013" || wall.link !== SOURCE) fail("Gredd canonical record drifted");
if (wall.still !== undefined) fail("Gredd acquired unsupported character still bytes");
if (!wall.portrait || wall.portrait.src !== PORTRAIT_SRC || wall.portrait.kind !== "free" || wall.portrait.origin !== PORTRAIT_ORIGIN || wall.portrait.author !== PORTRAIT_AUTHOR || wall.portrait.license !== PORTRAIT_LICENSE) fail("Gredd portrait custody drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE)) fail("Gredd lost exact performance evidence");
if (!(wall.references || []).some((row) => row.source === OFFICIAL_SOURCE)) fail("Gredd lost official production evidence");
const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Gredd" || sourceRow.universe !== "Doctor Who" || sourceRow.still !== null || !sourceRow.portrait || sourceRow.portrait.src !== PORTRAIT_SRC || sourceRow.portrait.origin !== PORTRAIT_ORIGIN || sourceRow.fetched_at !== "2026-08-03") fail("Gredd source ledger drifted");
const manifestAsset = mediaManifest.assets?.[PORTRAIT_SRC];
if (!manifestAsset || manifestAsset.sha256 !== PORTRAIT_SHA256 || manifestAsset.location !== "release" || manifestAsset.id !== WALL_ID || manifestAsset.side !== "portrait") fail("Gredd release media receipt drifted");

const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side)).map((row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims }));
const portraitFacet = facets.find((row) => row.side === "portrait");
const stillFacet = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portraitFacet || portraitFacet.scope !== "doctor-who" || portraitFacet.status !== "verified" || portraitFacet.asset?.sha256 !== PORTRAIT_SHA256 || !stillFacet || stillFacet.scope !== "doctor-who" || stillFacet.status !== "absent" || stillFacet.asset !== null) fail("Gredd media facets do not preserve verified portrait and honest still absence");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Gredd media item identities");
if (sha(JSON.stringify(stable(facets), null, 2) + String.fromCharCode(10)) !== EXPECTED_MEDIA_FACETS_SHA256) fail("Gredd media facet digest drifted");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Doctor Who claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 2) fail("cycle 002 review boundary does not contain exactly two Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Gredd" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 002 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 002 claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 002 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 002 reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("cycle 002 receipt ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("cycle 002 journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("cycle 002 journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "cycle 002 historical queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 2) fail("current Doctor Who denominator or terminal cycle state drifted");
if (!receipt.boundary || receipt.boundary.third_lease_issued !== false || receipt.boundary.generic_sontaran_image_used !== false || receipt.boundary.existing_dan_starkey_portrait_duplicated !== false || receipt.boundary.reviewed_portrait_derivative_adopted !== true || receipt.boundary.portrait_sha256 !== PORTRAIT_SHA256 || receipt.boundary.source_portrait_sha256 !== SOURCE_PORTRAIT_SHA256 || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_census_mutated !== false || receipt.boundary.roadmap_completion_claimed !== false) fail("cycle 002 boundary drifted");
if (receipt.isolation.non_doctor_jobs_sha256_before !== receipt.isolation.non_doctor_jobs_sha256_after || receipt.isolation.star_trek_jobs_sha256_before !== receipt.isolation.star_trek_jobs_sha256_after || receipt.isolation.coverage_delta?.changed_rows !== 1 || receipt.isolation.coverage_delta?.before?.role_on_wall !== false || receipt.isolation.coverage_delta?.after?.role_on_wall !== true || stableJson(receipt.isolation.coverage_delta?.after?.wall_ids) !== stableJson([WALL_ID]) || receipt.isolation.manifest_sha256_before !== receipt.isolation.manifest_sha256_after) fail("cycle 002 isolation receipt drifted");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256]) if (!evidenceText.includes(String(token))) fail("cycle 002 evidence lacks exact token " + token);
console.log("doctor-who-cycle-002: PASS — exact Gredd claim, source, canonical, verified portrait, honest still absence, cycle, receipt, and historical two-claim custody are intact");
