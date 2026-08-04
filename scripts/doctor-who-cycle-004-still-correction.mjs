#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE_MAIN = "39a58f2c5538da1adb7657623ee300dbca54a82d";
const CYCLE004_MERGE = "efdce8dec82fb803fd165d7af0c1a6c77e3eecb8";
const ORIGINAL_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json";
const ORIGINAL_CHECKER_PATH = "scripts/doctor-who-cycle-004.mjs";
const CORRECTION_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-004-still-correction.mjs";
const TASK_ID = "ap_2dd55dca3530b84be1ad24a0";
const WALL_ID = "UC-1349";
const CYCLE_ID = "cycle_341356246d968c63327c8b92";
const LEASE_ID = "lease_98e79928efb4d7ab202ca2fd";
const STILL_ITEM_ID = "ma_63bc53de4b7221c09b86cb2d";
const STILL_SRC = "images/uc-1349-still.jpg";
const STILL_ORIGIN = "https://tardis.fandom.com/wiki/File:Jask_(The_Sontaran_Ordeal).jpg";
const STILL_SHA256 = "091d13a9af3beec58e059338435b7aa6aa6ec1f25125fd713d67f32af935b66e";
const STILL_BYTES = 43824;
const SOURCE_IMAGE_SHA256 = "ed306bb55b5531ea0269fb9884e20030c8b8445cd4a1f7a1dbda55c4ac876b42";
const ORIGINAL_RECEIPT_FILE_SHA256 = "532594926e2ebe3b213a0ce59608c0e0b9e32f000fb75cb16c73e8b0137ca3cf";
const ORIGINAL_RECEIPT_DECLARED_SHA256 = "95599028ecf635be649030a53a3fe830cc2daae2052e2ecd8a3226c3b5d41a17";
const ORIGINAL_CHECKER_SHA256 = "429589f88f244bee23456d261f13fccc4be12c70565a0b825a32848bc77a71d3";
const BEFORE_FACETS_SHA256 = "a66406eb21b3fc8023280c0ca0e7305603979662fb85124ae34b58e9006b305c";
const AFTER_FACETS_SHA256 = "7571368da9fec6bb9a801c4b58a06ef9649ecf1315eab0e2c43ecf8916c7a179";
const BEFORE_STILL_FACET_SHA256 = "f187f3728bcdbf94ae2a0fc227dfb6ae1733e076a0142a122849170ee7f16a12";
const AFTER_STILL_FACET_SHA256 = "f012b3342ce3965d6d683c99ca23684f0c3e74739b8441412ed8e8c2c7bc89da";
const MEDIA_EVENT_IDS = ["maj_eb5c521e99c161c12de2b1db", "maj_222b0e4f34206a78f49e7745"];
const UNCHANGED_SHA256 = {
  "data/AUTOPILOT.json": "f6554501d2308303f32f54cb9f7d0d2070bbb72946c3a0a3065c44e3120e1de6",
  "data/WATERLINE-STATE.json": "fe06182b69334f4a9a401ee00c65549a0c9788687d24ad9799fd191d7a416414",
  "data/ROADMAP-STATE.json": "c010ca3dd05f3b826417d39b3306d76b662c0ba6caf0eb73dfc2440599dac77a",
  "data/CENSUS-COVERAGE.json": "41c22b666c0bb3be6cd12efbe64c26434ce5f2165955de23401cd933aed67dbf",
  "data/CENSUS-MANIFEST.json": "a0ad45c8ab9921265e9bd8d199e6d9ee83ee82aa82a673c6ae891fe7cea190fd",
  "data/journal/autopilot.jsonl": "0678c66e765608d768a8227943fdff42e914bfe1809ceda9bb73f621b041c96d",
  "data/journal/waterline.jsonl": "44f3add27dbc053c039aa86dea57766c509bd83f3bcdb3b746d97523bfe6746d"
};
const CANDIDATE = process.env.CYCLE004_STILL_CORRECTION_CANDIDATE === "1";
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const readJsonl = (path) => fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const exact = (actual, expected, message) => { if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) fail(message); };
const facetReceipt = (row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims });

assert(sha(fs.readFileSync(ORIGINAL_RECEIPT_PATH)) === ORIGINAL_RECEIPT_FILE_SHA256, "original cycle-004 receipt bytes changed");
assert(sha(fs.readFileSync(ORIGINAL_CHECKER_PATH)) === ORIGINAL_CHECKER_SHA256, "original cycle-004 checker bytes changed");
const original = read(ORIGINAL_RECEIPT_PATH);
const originalBody = structuredClone(original); delete originalBody.receipt_sha256;
assert(original.receipt_sha256 === ORIGINAL_RECEIPT_DECLARED_SHA256, "original cycle-004 declared receipt SHA changed");
assert(original.receipt_sha256 === sha(Buffer.from(stablePretty(originalBody))), "original cycle-004 receipt no longer self-hashes");
assert(original.qualification?.checker_sha256 === ORIGINAL_CHECKER_SHA256, "original cycle-004 checker binding changed");
assert(original.reviewed_cycle?.id === CYCLE_ID && original.lease?.id === LEASE_ID, "original cycle-004 cycle or lease identity changed");
assert(original.media?.statuses?.still === "absent" && original.media?.facets_sha256 === BEFORE_FACETS_SHA256, "original cycle-004 honest-absence history changed");
const originalStill = original.media?.facets?.find((row) => row.side === "still");
assert(originalStill?.id === STILL_ITEM_ID && originalStill.status === "absent" && originalStill.asset === null, "original cycle-004 still receipt changed");

if (process.env.SKIP_IMMUTABLE_GIT_CHECK !== "1" && fs.existsSync(".git")) {
  try {
    execFileSync("git", ["cat-file", "-e", `${CYCLE004_MERGE}^{commit}`], { stdio: "ignore" });
    for (const [path, expected] of [[ORIGINAL_RECEIPT_PATH, ORIGINAL_RECEIPT_FILE_SHA256], [ORIGINAL_CHECKER_PATH, ORIGINAL_CHECKER_SHA256]]) {
      const bytes = execFileSync("git", ["show", `${CYCLE004_MERGE}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
      assert(sha(bytes) === expected, `immutable ${path} differs at cycle-004 merge`);
    }
  } catch (error) {
    fail(`immutable cycle-004 Git custody unavailable: ${error.message}`);
  }
}

for (const [path, expected] of Object.entries(UNCHANGED_SHA256)) assert(sha(fs.readFileSync(path)) === expected, `${path} changed during still correction`);
const autopilot = read("data/AUTOPILOT.json");
const job = autopilot.jobs.find((row) => row.id === TASK_ID);
assert(job?.status === "resolved" && JSON.stringify(job.wall_ids) === JSON.stringify([WALL_ID]), "Jask task was reopened or rebound");
assert(job.outcome?.media_review?.records?.[0]?.still?.disposition === "absent", "historical task media review was rewritten instead of corrected separately");
const doctorJobs = autopilot.jobs.filter((row) => row.scope === "doctor-who");
assert(doctorJobs.length === 316 && doctorJobs.filter((row) => row.status === "queued").length === 312 && doctorJobs.filter((row) => row.status === "resolved").length === 4, "Doctor Who queue denominator changed");
assert(autopilot.jobs.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length === 0, "still correction left active corpus work");
const claimCount = readJsonl("data/journal/autopilot.jsonl").filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who").length;
assert(claimCount === 4, "still correction issued or removed a Doctor Who lease");
const waterline = read("data/WATERLINE-STATE.json");
const cycle = waterline.cycles.find((row) => row.id === CYCLE_ID);
assert(cycle?.lease_id === LEASE_ID && cycle.outcome === "completed" && cycle.task_statuses?.[TASK_ID] === "resolved", "reviewed cycle-004 was reopened or replaced");

const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const wall = specimens.find((row) => row.id === WALL_ID);
const sourceRow = sources.find((row) => row.id === WALL_ID);
const expectedStill = { src: STILL_SRC, kind: "still", origin: STILL_ORIGIN, pin: true, focus: { x: "center", y: "center" } };
exact(wall?.still, expectedStill, "canonical Jask still binding drifted");
exact(sourceRow?.still, expectedStill, "Jask source-ledger still binding drifted");
assert(wall?.kind === "voice" && wall.actor === "Dan Starkey" && wall.character === "Jask (The Sontaran Ordeal)", "Jask voice record changed during media correction");
assert(sha(fs.readFileSync(STILL_SRC)) === STILL_SHA256 && fs.statSync(STILL_SRC).size === STILL_BYTES, "Jask still bytes drifted");

const manifest = read("data/media-manifest.json");
const manifestAsset = manifest.assets?.[STILL_SRC];
assert(manifestAsset?.id === WALL_ID && manifestAsset.side === "still" && manifestAsset.kind === "still", "Jask still manifest identity drifted");
assert(manifestAsset.sha256 === STILL_SHA256 && manifestAsset.bytes === STILL_BYTES && manifestAsset.w === 597 && manifestAsset.h === 402, "Jask still manifest byte receipt drifted");
assert(manifestAsset.asset === "uc-1349-still-091d13a9.jpg" && manifestAsset.release === "media-0003" && manifestAsset.location === "release", "Jask still release custody drifted");

const audit = read("data/MEDIA-AUDIT.json");
const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side)).map(facetReceipt);
assert(facets.length === 2, "Jask media facet denominator changed");
assert(sha(Buffer.from(stablePretty(facets))) === AFTER_FACETS_SHA256, "corrected Jask facet digest drifted");
const still = facets.find((row) => row.side === "still");
assert(sha(Buffer.from(stablePretty(still))) === AFTER_STILL_FACET_SHA256, "corrected Jask still facet drifted");
assert(still.status === "verified" && still.asset?.sha256 === STILL_SHA256 && still.asset?.origin === STILL_ORIGIN, "Jask still is not verified exact-source media");
assert(still.risk_codes.length === 0 && still.claims?.identity?.state === "enforced" && still.claims.identity.value === "expected" && still.claims?.presentation?.state === "enforced" && still.claims.presentation.value === "character-depiction", "Jask still consensus drifted");
assert(still.votes?.length === 2 && still.votes.every((vote) => vote.reviewer === "chatgpt-second-desk" && vote.role === "second-desk" && vote.enforced === true && vote.asset_sha256 === STILL_SHA256), "Jask still review votes drifted");
const events = readJsonl("data/journal/media-audit.jsonl").filter((row) => MEDIA_EVENT_IDS.includes(row.id));
exact(events.map((row) => row.id).sort(), [...MEDIA_EVENT_IDS].sort(), "Jask still media journal custody drifted");
assert(events.every((row) => row.item_id === STILL_ITEM_ID && row.wall_id === WALL_ID && row.asset_sha256 === STILL_SHA256 && row.op === "media-audit.enforced"), "Jask still journal event semantics drifted");

if (CANDIDATE) {
  console.log("doctor-who-cycle-004-still-correction: CANDIDATE PASS — exact Jask still is verified without reopening the task or issuing a lease");
  process.exit(0);
}

assert(fs.existsSync(CORRECTION_RECEIPT_PATH), "Jask still correction receipt is absent");
const correction = read(CORRECTION_RECEIPT_PATH);
const correctionBody = structuredClone(correction); delete correctionBody.receipt_sha256;
assert(correction.receipt_sha256 === sha(Buffer.from(stablePretty(correctionBody))), "Jask still correction receipt hash drifted");
assert(correction.transaction === "DOCTOR-WHO-CYCLE-004-JASK-AUDIO-STILL-CORRECTION-001", "Jask still correction transaction drifted");
assert(correction.base_main === BASE_MAIN && correction.prior_cycle.receipt_declared_sha256 === ORIGINAL_RECEIPT_DECLARED_SHA256 && correction.prior_cycle.receipt_file_sha256 === ORIGINAL_RECEIPT_FILE_SHA256 && correction.prior_cycle.checker_sha256 === ORIGINAL_CHECKER_SHA256, "Jask still correction lost original-cycle custody");
assert(correction.media.before.facets_sha256 === BEFORE_FACETS_SHA256 && correction.media.before.still_facet_sha256 === BEFORE_STILL_FACET_SHA256 && correction.media.after.facets_sha256 === AFTER_FACETS_SHA256 && correction.media.after.still_facet_sha256 === AFTER_STILL_FACET_SHA256, "Jask still correction before/after custody drifted");
assert(correction.media.after.asset.sha256 === STILL_SHA256 && correction.media.source.source_image_sha256 === SOURCE_IMAGE_SHA256, "Jask still correction source or derivative custody drifted");
assert(correction.qualification?.checker === CHECKER_PATH && correction.qualification.checker_sha256 === sha(fs.readFileSync(CHECKER_PATH)), "Jask still correction checker binding drifted");
assert(correction.boundary?.task_reopened === false && correction.boundary?.lease_issued === false && correction.boundary?.reviewed_cycle_replaced === false && correction.boundary?.generic_sontaran_substitution === false && correction.boundary?.original_cycle_receipt_rewritten === false && correction.boundary?.roadmap_completion_claimed === false, "Jask still correction boundary drifted");
for (const [path, expected] of Object.entries(UNCHANGED_SHA256)) assert(correction.unchanged[path] === expected, `Jask still correction receipt lost unchanged hash ${path}`);
const evidence = JSON.stringify(correction.execution || {});
for (const token of [correction.execution.workflow_run, correction.execution.workflow_job, correction.execution.artifact_id, correction.execution.artifact_sha256, correction.execution.candidate_commit, correction.execution.candidate_gate_sha256, correction.execution.verification_workflow_run, correction.execution.verification_workflow_job, correction.execution.verification_artifact_id, correction.execution.verification_artifact_sha256, STILL_SHA256, SOURCE_IMAGE_SHA256]) assert(evidence.includes(String(token)) || JSON.stringify(correction).includes(String(token)), `Jask still correction evidence lacks ${token}`);
assert(!/<[^>\n]+>/.test(JSON.stringify(correction)), "Jask still correction receipt contains a template placeholder");
console.log("doctor-who-cycle-004-still-correction: PASS — immutable cycle-004 absence history and exact post-merge Jask still correction are both intact");
