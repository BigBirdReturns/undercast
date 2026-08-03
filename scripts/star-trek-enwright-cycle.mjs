#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = "data/review/star-trek-enwright-cycle.json";
const CHECKER_PATH = "scripts/star-trek-enwright-cycle.mjs";
const TASK_ID = "ap_fddff4a188eb5eb9fbefd86f";
const LEASE_ID = "lease_e6c0541e10146179ad56a867";
const WALL_ID = "UC-1346";
const SOURCE = "https://memory-alpha.fandom.com/wiki/Enwright";
const SOURCE_FINGERPRINT = "38b7babe85514b981b80e98ea4858c220d7d365a40fe8f858560308b02474cd7";
const SOURCE_PAGE_ID = 9185;
const SOURCE_REVISION = 3163894;
const SOURCE_TIMESTAMP = "2024-05-31T19:56:03Z";
const SOURCE_CONTENT_SHA256 = "221c1c1103f158aadb5617bd990461fc1f33502f49c9d4b5ee0c8fc3f08b4bc5";
const CLAIMED_AT = "2026-08-03T02:58:28-07:00";
const REVIEWED_AT = "2026-08-03T16:25:36.000Z";
const CYCLE_ID = "cycle_9cdab3104f46a978639c5051";
const CYCLE_EVENT_ID = "waterline_e2a6e62d50fc17fb626d1d2b";
const HISTORICAL_CLAIM_COUNT = 71;
const EXPECTED_MEDIA_ITEM_IDS = [
  "ma_1a62b0bc09fa89818436200f",
  "ma_51703594e740f6caf1726091"
];
const EXPECTED_MEDIA_FACETS_SHA256 = "904b385841cbcca8353d90b5434d4c6b43b0bb202ead1fe0bb0c73f64b7cc938";
const EXPECTED_HISTORICAL_QUEUE = {
  "in_flight": 0,
  "statuses": {
    "queued": 1836,
    "rejected": 1,
    "resolved": 391
  },
  "total": 2228
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
if (receipt.receipt_sha256 !== sha(JSON.stringify(stable(receiptBody)) + "\n")) fail("Enwright receipt hash drifted");
if (receipt.transaction !== "STAR-TREK-CYCLE-ENWRIGHT") fail("Enwright transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("Enwright checker hash drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("Enwright receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const coverage = read("data/CENSUS-COVERAGE.json");

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "star-trek" || job.status !== "resolved") fail("Enwright task is not resolved");
if (job.performer !== "James Doohan" || job.character !== "Enwright") fail("Enwright task identity drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Enwright source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Enwright source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Enwright wall binding drifted");

const card = specimens.find((row) => row.id === WALL_ID);
if (!card || card.actor !== "James Doohan" || card.character !== "Enwright" || card.production !== "Star Trek: The Original Series \"The Ultimate Computer\"" || card.universe !== "Star Trek" || card.years !== "1968" || card.kind !== "voice" || card.transform !== 2 || card.designer !== "—" || card.link !== SOURCE) fail("Enwright canonical identity drifted");
const source = sources.find((row) => row.id === WALL_ID);
if (!source || source.actor !== "James Doohan" || source.character !== "Enwright" || source.universe !== "Star Trek") fail("Enwright source identity drifted");

exact(receipt.media.item_ids, EXPECTED_MEDIA_ITEM_IDS, "Enwright historical media item identities");
if (sha(JSON.stringify(stable(receipt.media.facets), null, 2) + "\n") !== EXPECTED_MEDIA_FACETS_SHA256) fail("Enwright historical media facet digest drifted");
if (!receipt.media.facets.every((row) => row.scope === "star-trek" && row.status === "absent" && row.asset === null)) fail("Enwright historical media receipt lost honest absence");
const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
if (facets.length !== 2 || !facets.every((row) => row.scope === "star-trek" && ["verified", "absent"].includes(row.status))) fail("Enwright current media facets are not terminal");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Enwright current media item identities");
const coverageRow = coverage.find((row) => row.franchise === "Star Trek" && row.category === "Individuals" && row.character === "Enwright" && row.performer === "James Doohan" && row.performance_mode === "physical-prosthetic" && row.source === SOURCE);
if (!coverageRow || coverageRow.role_on_wall !== true || stableJson(coverageRow.wall_ids) !== stableJson([WALL_ID])) fail("Enwright census coverage binding drifted");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "star-trek");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Star Trek claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== HISTORICAL_CLAIM_COUNT) fail("Enwright review-boundary claim denominator drifted");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== CLAIMED_AT || claim.performer !== "James Doohan" || claim.character !== "Enwright" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "priority-compatible") fail("Enwright claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("Enwright claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("Enwright lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "star-trek" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("Enwright reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("Enwright cycle ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "star-trek" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("Enwright journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("Enwright journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "Enwright historical queue receipt");
const trek = autopilot.jobs.filter((row) => row.scope === "star-trek");
if (trek.length < 2228 || trek.filter((row) => row.status === "resolved").length < 391) fail("current Star Trek denominator or resolved floor regressed");
if (receipt.task.queued_mode_hint !== "physical-prosthetic" || receipt.task.adjudicated_kind !== "voice") fail("Enwright modality correction drifted");
if (!receipt.boundary || receipt.boundary.additional_lease_issued !== false || receipt.boundary.queued_mode_hint_promoted !== false || receipt.boundary.unseen_body_or_prosthetic_claimed !== false || receipt.boundary.generic_character_image_used !== false || receipt.boundary.existing_james_doohan_portrait_duplicated !== false || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_manifest_mutated !== false || receipt.boundary.coverage_projection_changed_exactly_for_enwright !== true || receipt.boundary.roadmap_completion_claimed !== false) fail("Enwright boundary drifted");
const isolation = receipt.isolation;
if (isolation.non_trek_jobs_semantic_sha256_before !== isolation.non_trek_jobs_semantic_sha256_after || isolation.doctor_who_jobs_semantic_sha256_before !== isolation.doctor_who_jobs_semantic_sha256_after || isolation.other_trek_jobs_semantic_sha256_before !== isolation.other_trek_jobs_semantic_sha256_after || isolation.manifest_sha256_before !== isolation.manifest_sha256_after || isolation.roadmap_sha256_before !== isolation.roadmap_sha256_after) fail("Enwright semantic isolation receipt drifted");
if (isolation.coverage_projection?.changed_rows !== 1 || isolation.coverage_projection?.before?.role_on_wall !== false || stableJson(isolation.coverage_projection?.before?.wall_ids) !== stableJson([]) || isolation.coverage_projection?.after?.role_on_wall !== true || stableJson(isolation.coverage_projection?.after?.wall_ids) !== stableJson([WALL_ID]) || isolation.coverage_projection?.before_sha256 === isolation.coverage_projection?.after_sha256) fail("Enwright authorized coverage delta drifted");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, receipt.prior_custody.claim_publication.workflow_free_product, receipt.prior_custody.claim_publication.merge_commit, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256]) if (!evidenceText.includes(String(token))) fail("Enwright evidence lacks exact token " + token);
console.log("star-trek-enwright-cycle: PASS — exact persisted lease, voice-only modality correction, source, canonical, media, queue, cycle, and publication custody are intact");
