#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-008-kreg.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-008.mjs";
const PRIOR_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-007-kragar.json";
const PRIOR_CHECKER_PATH = "scripts/doctor-who-cycle-007.mjs";
const TASK_ID = "ap_469d79ea29fd7f877395d20f";
const LEASE_ID = "lease_e65f837070361eacbb1abd46";
const WALL_ID = "UC-1353";
const SOURCE_URL = "https://tardis.fandom.com/wiki/Kreg";
const SOURCE_FINGERPRINT = "e9d2d5a601e8ca061ac0bf3ffb9148537772e92ef267f23e703a9250b1d9fda4";
const SOURCE_RECEIPT = {"source": "https://tardis.fandom.com/wiki/Kreg", "pageid": 300765, "revision": 3851642, "timestamp": "2026-07-28T09:20:48Z", "content_sha256": "c1333a4eb91b2989d380cdcffee9d22da968a82aef43ba39a2541fb52f8bc0a9"};
const PRODUCTION_SOURCE = "https://www.bigfinish.com/releases/v/torchwood-the-great-sontaran-war-2409";
const MEDIA_SHA256 = "5d19f72cbe08648568c84469287dfcd14a9c0789156cd3d740edf4c1c5bb0622";
const MEDIA_BYTES = 67113;
const MEDIA_ORIGIN = "https://tardis.fandom.com/wiki/File:Kree.jpg";
const MEDIA_FILE_PAGE_ID = 387498;
const REVIEWED_AT = "2026-08-07T20:42:01.000Z";
const CANDIDATE_ACCEPTED_AT = "2026-08-07T01:33:00.000Z";
const CANDIDATE_EVENT_ID = "jr_H6RVNFev45NChGwKoHfnoK";
const CYCLE_ID = "cycle_89daa03cca72b8522c76725c";
const CYCLE_EVENT_ID = "waterline_c8728b08f159f11e16ec8baa";
const PRIOR_CYCLE_ID = "cycle_540222fb1378fa680a43d080";
const PRIOR_RECEIPT_FILE_SHA256 = "f90e7114d721c3714dbe69e860caebd5f49306ad529eb54f05d22fcee0baaa23";
const PRIOR_RECEIPT_SHA256 = "37ad6eeaf6fdeaa8cabdd25a0c527df4028d05a2f0e542fa53bf6fdb508ba88e";
const PRIOR_CHECKER_SHA256 = "cbf9bc0979b409a1fd7460aedacb0025c152615cbbf1bdb457c09cb871e3f1b5";
const REVIEW_IDENTITY = "f8740ca65cc7d409e36e8631de444b413c7e309174179e9ef778ff895816af64";
const CANDIDATE_TREE = "6a0a3e7043faf511974597b5670ccb8c688994f5";
const EXPECTED_QUEUE = { total: 316, queued: 308, resolved: 8, in_flight: 0 };
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stable(value));
const stablePretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readJsonl = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const exact = (actual, expected, label) => { if (stableJson(actual) !== stableJson(expected)) fail(label + " drifted"); };

const receipt = read(RECEIPT_PATH);
const receiptBody = structuredClone(receipt); delete receiptBody.receipt_sha256;
if (receipt.receipt_sha256 !== sha(stablePretty(receiptBody))) fail("cycle 008 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-008-KREG" || receipt.version !== 1) fail("cycle 008 receipt identity drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 008 checker hash drifted");
if (/<[^>\n]+>|\$\{\{/.test(JSON.stringify(receipt))) fail("cycle 008 receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const candidates = readJsonl("data/journal/candidates.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const manifest = read("data/media-manifest.json");
const registry = read("data/ESTATE-REGISTRY.json");
const baseline = read("data/review/adapter-sdk/BASELINE.json");

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved" || job.performer !== "Dan Starkey" || job.character !== "Kreg") fail("Kreg task identity or status drifted");
exact(job.performance_modes, ["voice"], "Kreg performance mode");
exact(job.sources, [SOURCE_URL], "Kreg source set");
exact(job.source_receipts, [SOURCE_RECEIPT], "Kreg source receipt");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Kreg source fingerprint or wall binding drifted");

const acceptance = candidates.filter((row) => row.id === CANDIDATE_EVENT_ID && row.op === "draft.accept" && row.specimen === WALL_ID);
if (acceptance.length !== 1 || acceptance[0].ts !== CANDIDATE_ACCEPTED_AT || acceptance[0].actor_name !== "Dan Starkey" || acceptance[0].character !== "Kreg") fail("Kreg candidate acceptance drifted");
const acceptanceBody = structuredClone(acceptance[0]); delete acceptanceBody.id;
const acceptanceId = "jr_" + crypto.createHash("sha256").update(acceptance[0].actor + "|" + JSON.stringify(acceptanceBody)).digest("base64url").slice(0, 22);
if (acceptanceId !== CANDIDATE_EVENT_ID) fail("Kreg candidate acceptance is not content-addressed");
if (!(Date.parse(receipt.lease.claimed_at) < Date.parse(CANDIDATE_ACCEPTED_AT) && Date.parse(CANDIDATE_ACCEPTED_AT) < Date.parse(REVIEWED_AT))) fail("Kreg candidate chronology drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.kind !== "voice" || wall.actor !== "Dan Starkey" || wall.character !== "Kreg" || wall.production !== "The Great Sontaran War" || wall.years !== "2021" || wall.designer !== "Big Finish Productions" || wall.transform !== 2 || wall.link !== SOURCE_URL) fail("Kreg canonical voice record drifted");
if (wall.portrait !== undefined) fail("Kreg acquired an unauthorized portrait");
if (wall.still?.src !== "images/uc-1353-still.jpg" || wall.still?.origin !== MEDIA_ORIGIN || wall.still?.kind !== "still" || wall.still?.pin !== true) fail("Kreg still binding drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE_URL)) fail("Kreg lost performance evidence");
if (!(wall.references || []).some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE)) fail("Kreg lost production evidence");
if (receipt.canonical.record_sha256 !== sha(stablePretty(wall))) fail("Kreg canonical receipt digest drifted");

const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Kreg" || sourceRow.portrait !== null || sourceRow.still?.src !== "images/uc-1353-still.jpg") fail("Kreg source ledger drifted");
const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a,b) => a.side.localeCompare(b.side));
const portrait = facets.find((row) => row.side === "portrait");
const still = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portrait || portrait.status !== "absent" || portrait.asset !== null || !still || still.status !== "verified" || still.asset?.sha256 !== MEDIA_SHA256) fail("Kreg media facets drifted");
if (!still.votes?.some((row) => row.namespace === "identity" && row.value === "expected" && row.enforced === true)) fail("Kreg identity vote drifted");
if (!still.votes?.some((row) => row.namespace === "presentation" && row.value === "character-depiction" && row.enforced === true)) fail("Kreg presentation vote drifted");
if (receipt.media.facets_sha256 !== sha(stablePretty(facets))) fail("Kreg media facet receipt drifted");
const asset = manifest.assets?.["images/uc-1353-still.jpg"];
if (!asset || asset.sha256 !== MEDIA_SHA256 || asset.bytes !== MEDIA_BYTES || asset.location !== "release" || asset.id !== WALL_ID || asset.side !== "still") fail("Kreg media manifest drifted");
if (sha(fs.readFileSync("images/uc-1353-still.jpg")) !== MEDIA_SHA256 || fs.statSync("images/uc-1353-still.jpg").size !== MEDIA_BYTES) fail("Kreg still bytes drifted");
if (receipt.media.still_file_pageid !== MEDIA_FILE_PAGE_ID || receipt.media.still_origin !== MEDIA_ORIGIN) fail("Kreg file-page custody drifted");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
const historicalClaims = claims.filter((row) => Number.isFinite(Date.parse(row.at || "")) && Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 8) fail("cycle 008 boundary does not contain exactly eight Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Kreg" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 008 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 008 claim is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 008 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 008 reviewed waterline receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(stableJson(cycleBody)).slice(0, 24)) fail("cycle 008 waterline receipt is not content-addressed");
const events = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (events.length !== 1 || events[0].id !== CYCLE_EVENT_ID || events[0].receipt_id !== CYCLE_ID || events[0].outcome !== "completed") fail("cycle 008 waterline journal drifted");
const eventBody = structuredClone(events[0]); delete eventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(stableJson(eventBody)).slice(0, 24)) fail("cycle 008 waterline event is not content-addressed");

exact(receipt.queue.after, EXPECTED_QUEUE, "cycle 008 queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased","drafted","merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 8) fail("current Doctor Who denominator or terminal state drifted");
if (receipt.boundary?.eighth_doctor_who_lease_is_this_cycle !== true || receipt.boundary?.ninth_lease_issued !== false || receipt.boundary?.cycle_009_authorized !== false || receipt.boundary?.portrait_adopted !== false || receipt.boundary?.portrait_status !== "absent" || receipt.boundary?.exact_character_still_adopted !== true || receipt.boundary?.still_sha256 !== MEDIA_SHA256 || receipt.boundary?.outside_human_dependency !== false || receipt.boundary?.owner_physical_action_required !== false) fail("cycle 008 boundary drifted");
if (receipt.execution?.independent_review_identity !== REVIEW_IDENTITY || receipt.execution?.candidate_tree !== CANDIDATE_TREE) fail("cycle 008 candidate review custody drifted");

const priorReceipt = read(PRIOR_RECEIPT_PATH);
if (sha(fs.readFileSync(PRIOR_RECEIPT_PATH)) !== PRIOR_RECEIPT_FILE_SHA256 || priorReceipt.receipt_sha256 !== PRIOR_RECEIPT_SHA256 || priorReceipt.reviewed_cycle?.id !== PRIOR_CYCLE_ID || sha(fs.readFileSync(PRIOR_CHECKER_PATH)) !== PRIOR_CHECKER_SHA256) fail("cycle 008 lost exact cycle 007 custody");
if (receipt.prior_custody?.cycle_007_receipt_file_sha256 !== PRIOR_RECEIPT_FILE_SHA256 || receipt.prior_custody?.cycle_007_receipt_declared_sha256 !== PRIOR_RECEIPT_SHA256 || receipt.prior_custody?.cycle_007_checker_sha256 !== PRIOR_CHECKER_SHA256 || receipt.prior_custody?.cycle_007_id !== PRIOR_CYCLE_ID) fail("cycle 008 prior-custody receipt drifted");

const doctorEstate = registry.estates.find((row) => row.id === "doctor-who");
if (!doctorEstate?.next_gate.includes(CYCLE_ID) || !doctorEstate.next_gate.includes("308 tasks remain queued")) fail("cycle 008 estate handoff drifted");
if (baseline.inputs?.estate_registry?.path !== "data/ESTATE-REGISTRY.json" || baseline.inputs.estate_registry.sha256 !== sha(fs.readFileSync("data/ESTATE-REGISTRY.json"))) fail("cycle 008 adapter baseline drifted");

const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [TASK_ID, LEASE_ID, WALL_ID, SOURCE_FINGERPRINT, "c1333a4eb91b2989d380cdcffee9d22da968a82aef43ba39a2541fb52f8bc0a9", MEDIA_SHA256, REVIEW_IDENTITY, CANDIDATE_TREE, PRIOR_RECEIPT_SHA256, PRIOR_CHECKER_SHA256, CANDIDATE_EVENT_ID]) if (!evidenceText.includes(String(token)) && !JSON.stringify(receipt).includes(String(token))) fail("cycle 008 evidence lacks exact token " + token);
console.log("doctor-who-cycle-008: PASS — exact Kreg voice claim, source, canonical record, source-assigned still, honest portrait absence, reviewed cycle, queue, and prior-cycle custody are intact");
