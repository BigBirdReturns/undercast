#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ORIGINAL_BASE_MAIN = "45fc33aa8de8c01f03f006c5c01765dd1929385f";
const CHRONOLOGY_FLOOR_MAIN = "f5e6919cfcb0491e2a62c64935a6d689b66b27c1";
const ORIGINAL_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology.json";
const ORIGINAL_CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology.mjs";
const CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology-composable.mjs";
const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology-composability.json";
const CANDIDATE_JOURNAL_PATH = "data/journal/candidates.jsonl";
const AUTOPILOT_JOURNAL_PATH = "data/journal/autopilot.jsonl";
const AUTOPILOT_PATH = "data/AUTOPILOT.json";
const WATERLINE_PATH = "data/WATERLINE-STATE.json";
const CYCLE_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-kayste.json";
const CYCLE_CHECKER_PATH = "scripts/doctor-who-cycle-006.mjs";
const PACKAGE_PATH = "package.json";
const SCRIPT_NAME = "doctor-who:cycle-006:chronology:check";

const TASK_ID = "ap_c8e74653ac0877837814db21";
const LEASE_ID = "lease_476aaf782c8417a4372eb6be";
const WALL_ID = "UC-1351";
const CYCLE_ID = "cycle_4ee0abebffec084feda08162";
const CLAIMED_AT = "2026-08-05T15:26:05.000Z";
const ACCEPTED_AT = "2026-08-05T15:28:05.000Z";
const REVIEWED_AT = "2026-08-05T15:34:05.000Z";

const ORIGINAL_RECEIPT_BLOB = "ea74fde73e01b3e3f0e61b2f1e272f7908d3a87b";
const ORIGINAL_RECEIPT_FILE_SHA256 = "7ec46d2f4117c7005e05ef190d446d3a9b4062dd83dc3b1d432594785b12169c";
const ORIGINAL_RECEIPT_DECLARED_SHA256 = "e8bc8fbeb9cdad1f0951d2c3e92f16f6c1bb24d19783133766453127a32a8fb7";
const ORIGINAL_CHECKER_BLOB = "ca00f693f2717d4329cdae75ba33724914fd0f9b";
const ORIGINAL_CHECKER_SHA256 = "6f3001a95a5079cd009a731377eee72c824e1daeadcbe3f8f8d083c06833788c";
const FLOOR_CANDIDATE_JOURNAL_BLOB = "473fa5f9726b93201bc7c62c3b2505523882e9f3";
const FLOOR_CANDIDATE_JOURNAL_SHA256 = "60283147d8645e3061963b34e9b5985c5da90c37793f9806877a837424034de0";
const FLOOR_PACKAGE_BLOB = "0dcbbb7102cd895b741e9183dbd0bcc3b06e02b8";
const FLOOR_PACKAGE_SHA256 = "649af87701cb2fd455505978f7f67656bbc8b13e890ecfb199c29d79819c3cc0";
const COMPOSABLE_PACKAGE_SHA256 = "633275f311583c40cf7a9c81220819837d8b3d8dfa6e73e39205c292c180a38d";
const CYCLE_RECEIPT_FILE_SHA256 = "27c77be0f661e9a8465651e953cfb0dcb321cddd59654c263635945fa5191032";
const CYCLE_RECEIPT_DECLARED_SHA256 = "d0a45a782e41756e4fd18440b6dab8ec9879feb01d949dc8d1f9efe9e7165faa";
const CYCLE_CHECKER_SHA256 = "fba8081197b36076ce3832d05ac58623c2265de78442741a4691575f387b852f";

const EXPECTED_AFTER_EVENT = {
  id: "jr_sgGinhjmC4y-GcVIX1tq-Z",
  ts: ACCEPTED_AT,
  actor: "grow.mjs@0.1",
  op: "draft.accept",
  specimen: WALL_ID,
  actor_name: "Dan Starkey",
  character: "Kayste",
  universe: "Doctor Who",
  production: "Terror of the Sontarans",
  link: "https://tardis.fandom.com/wiki/Kayste",
  verification: "autopilot-source-receipt",
};
const EXPECTED_FIXTURES = {
  acceptance_before_lease_rejected: true,
  active_work_rejected: true,
  bad_content_address_rejected: true,
  denominator_change_rejected: true,
  duplicate_acceptance_rejected: true,
  future_candidate_append_accepted: true,
  future_package_extension_accepted: true,
  future_resolved_cycle_accepted: true,
  missing_acceptance_rejected: true,
  reopened_kayste_rejected: true,
};
const EXPECTED_BOUNDARY = {
  future_candidate_journal_appends_permitted: true,
  future_package_extensions_permitted: true,
  historical_candidate_journal_pinned_at_floor: true,
  historical_package_pinned_at_floor: true,
  original_chronology_checker_immutable: true,
  original_chronology_receipt_immutable: true,
  task_lease_queue_media_mutated: false,
};

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const readJsonl = (path) => fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const exact = (actual, expected, message) => {
  if (stableJson(actual) !== stableJson(expected)) fail(message);
};
const expectFailure = (name, fn, pattern) => {
  let error = null;
  try { fn(); } catch (caught) { error = caught; }
  assert(error && pattern.test(String(error.message || error)), `adversarial fixture did not fail: ${name}`);
};
const parsedTime = (value, label) => {
  const parsed = Date.parse(value || "");
  assert(Number.isFinite(parsed), `${label} is not an RFC3339 timestamp`);
  return parsed;
};
const candidateId = (event) => {
  const body = structuredClone(event);
  delete body.id;
  return "jr_" + crypto.createHash("sha256")
    .update(`${event.actor}|${JSON.stringify(body)}`)
    .digest("base64url")
    .slice(0, 22);
};
const eventAt = (ts) => {
  const event = { ...EXPECTED_AFTER_EVENT, ts };
  event.id = candidateId(event);
  return event;
};

function validateCandidateJournal(rows) {
  const kayste = rows.filter((row) => row.op === "draft.accept" && row.specimen === WALL_ID);
  assert(kayste.length === 1, "Kayste candidate acceptance is missing or duplicated");
  const event = kayste[0];
  assert(event.id === candidateId(event), "Kayste candidate event is not content-addressed");
  assert(parsedTime(event.ts, "Kayste acceptance") > parsedTime(CLAIMED_AT, "Kayste claim"), "Kayste acceptance does not follow the lease claim");
  assert(parsedTime(event.ts, "Kayste acceptance") < parsedTime(REVIEWED_AT, "Kayste review"), "Kayste acceptance does not precede review");
  exact(event, EXPECTED_AFTER_EVENT, "Kayste corrected candidate event drifted");
}

function validatePackage(packageDoc) {
  assert(packageDoc.scripts?.[SCRIPT_NAME] === `node ${CHECKER_PATH}`, "cycle-006 chronology package mapping drifted");
  assert(packageDoc.scripts?.["autopilot:fixtures"]?.includes(`npm run ${SCRIPT_NAME}`), "cycle-006 chronology checker is not composed into Autopilot fixtures");
}

function validateLiveState({ autopilot, autopilotJournal, waterline }) {
  const job = autopilot.jobs.find((row) => row.id === TASK_ID);
  assert(job?.scope === "doctor-who" && job.status === "resolved", "Kayste task was reopened or rebound");
  exact(job.wall_ids, [WALL_ID], "Kayste task wall binding drifted");
  const doctorJobs = autopilot.jobs.filter((row) => row.scope === "doctor-who");
  assert(doctorJobs.length === 316, "Doctor Who denominator changed");
  assert(doctorJobs.filter((row) => row.status === "resolved").length >= 6, "Doctor Who resolved floor regressed below cycle 006");
  assert(doctorJobs.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length === 0, "cycle-006 chronology checker found active Doctor Who work");
  const claims = autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
  const kaysteClaims = claims.filter((row) => row.lease_id === LEASE_ID);
  assert(kaysteClaims.length === 1 && kaysteClaims[0].task_id === TASK_ID && kaysteClaims[0].at === CLAIMED_AT, "Kayste lease claim is missing, duplicated, or rebound");
  const claimBody = structuredClone(kaysteClaims[0]);
  delete claimBody.id;
  assert(kaysteClaims[0].id === `apj_${sha(JSON.stringify(claimBody)).slice(0, 24)}`, "Kayste lease claim is not content-addressed");
  const cycles = waterline.cycles.filter((row) => row.id === CYCLE_ID);
  assert(cycles.length === 1 && cycles[0].lease_id === LEASE_ID && cycles[0].outcome === "completed" && cycles[0].task_statuses?.[TASK_ID] === "resolved" && cycles[0].reviewed_at === REVIEWED_AT, "reviewed cycle 006 was reopened or replaced");
}

assert(sha(fs.readFileSync(ORIGINAL_RECEIPT_PATH)) === ORIGINAL_RECEIPT_FILE_SHA256, "original chronology receipt bytes changed");
assert(sha(fs.readFileSync(ORIGINAL_CHECKER_PATH)) === ORIGINAL_CHECKER_SHA256, "original chronology checker bytes changed");
const original = read(ORIGINAL_RECEIPT_PATH);
const originalBody = structuredClone(original);
delete originalBody.receipt_sha256;
assert(original.receipt_sha256 === ORIGINAL_RECEIPT_DECLARED_SHA256, "original chronology receipt identity changed");
assert(original.receipt_sha256 === sha(Buffer.from(stablePretty(originalBody))), "original chronology receipt no longer self-hashes");
assert(original.base_main === ORIGINAL_BASE_MAIN, "original chronology base main changed");
assert(original.qualification?.checker_path === ORIGINAL_CHECKER_PATH && original.qualification?.checker_sha256 === ORIGINAL_CHECKER_SHA256, "original chronology checker binding changed");
exact(original.after_event, EXPECTED_AFTER_EVENT, "original chronology corrected event changed");
assert(original.task?.task_id === TASK_ID && original.task?.lease_id === LEASE_ID && original.task?.cycle_id === CYCLE_ID && original.task?.wall_id === WALL_ID, "original chronology task boundary changed");

if (process.env.SKIP_IMMUTABLE_GIT_CHECK !== "1" && fs.existsSync(".git")) {
  try {
    execFileSync("git", ["cat-file", "-e", `${CHRONOLOGY_FLOOR_MAIN}^{commit}`], { stdio: "ignore" });
    const immutable = [
      [CANDIDATE_JOURNAL_PATH, FLOOR_CANDIDATE_JOURNAL_BLOB, FLOOR_CANDIDATE_JOURNAL_SHA256],
      [PACKAGE_PATH, FLOOR_PACKAGE_BLOB, FLOOR_PACKAGE_SHA256],
      [ORIGINAL_RECEIPT_PATH, ORIGINAL_RECEIPT_BLOB, ORIGINAL_RECEIPT_FILE_SHA256],
      [ORIGINAL_CHECKER_PATH, ORIGINAL_CHECKER_BLOB, ORIGINAL_CHECKER_SHA256],
    ];
    for (const [path, blob, expectedSha] of immutable) {
      const actualBlob = execFileSync("git", ["rev-parse", `${CHRONOLOGY_FLOOR_MAIN}:${path}`], { encoding: "utf8" }).trim();
      assert(actualBlob === blob, `historical Git blob drifted for ${path}`);
      const bytes = execFileSync("git", ["show", `${CHRONOLOGY_FLOOR_MAIN}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
      assert(sha(bytes) === expectedSha, `historical Git bytes drifted for ${path}`);
    }
    const historicalPackage = JSON.parse(execFileSync("git", ["show", `${CHRONOLOGY_FLOOR_MAIN}:${PACKAGE_PATH}`], { encoding: "utf8" }));
    assert(historicalPackage.scripts?.[SCRIPT_NAME] === `node ${ORIGINAL_CHECKER_PATH}`, "historical package no longer binds the original chronology checker");
  } catch (error) {
    fail(`immutable chronology floor Git custody unavailable: ${error.message}`);
  }
}

const receipt = read(RECEIPT_PATH);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
assert(receipt.transaction === "DOCTOR-WHO-CYCLE-006-CANDIDATE-CHRONOLOGY-COMPOSABILITY-001" && receipt.version === 1, "composability receipt identity drifted");
assert(receipt.receipt_sha256 === sha(Buffer.from(stablePretty(receiptBody))), "composability receipt no longer self-hashes");
assert(receipt.base_main === CHRONOLOGY_FLOOR_MAIN, "composability receipt base main drifted");
assert(receipt.qualification?.checker_path === CHECKER_PATH && receipt.qualification?.checker_sha256 === sha(fs.readFileSync(CHECKER_PATH)), "composable checker binding drifted");
assert(receipt.custody?.original_receipt_file_sha256 === ORIGINAL_RECEIPT_FILE_SHA256 && receipt.custody?.original_receipt_declared_sha256 === ORIGINAL_RECEIPT_DECLARED_SHA256 && receipt.custody?.original_checker_sha256 === ORIGINAL_CHECKER_SHA256, "original chronology custody receipt drifted");
assert(receipt.custody?.candidate_journal_floor_blob === FLOOR_CANDIDATE_JOURNAL_BLOB && receipt.custody?.candidate_journal_floor_sha256 === FLOOR_CANDIDATE_JOURNAL_SHA256, "historical candidate-journal custody drifted");
assert(receipt.custody?.package_floor_blob === FLOOR_PACKAGE_BLOB && receipt.custody?.package_floor_sha256 === FLOOR_PACKAGE_SHA256 && receipt.custody?.package_sha256_after === COMPOSABLE_PACKAGE_SHA256, "historical package custody drifted");
exact(receipt.fixtures, EXPECTED_FIXTURES, "composability fixture receipt drifted");
exact(receipt.boundary, EXPECTED_BOUNDARY, "composability authority boundary drifted");

const candidates = readJsonl(CANDIDATE_JOURNAL_PATH);
const packageDoc = read(PACKAGE_PATH);
const autopilot = read(AUTOPILOT_PATH);
const autopilotJournal = readJsonl(AUTOPILOT_JOURNAL_PATH);
const waterline = read(WATERLINE_PATH);
validateCandidateJournal(candidates);
validatePackage(packageDoc);
validateLiveState({ autopilot, autopilotJournal, waterline });

const cycleReceiptBytes = fs.readFileSync(CYCLE_RECEIPT_PATH);
const cycleReceipt = JSON.parse(cycleReceiptBytes);
const cycleReceiptBody = structuredClone(cycleReceipt);
delete cycleReceiptBody.receipt_sha256;
assert(sha(cycleReceiptBytes) === CYCLE_RECEIPT_FILE_SHA256, "cycle-006 receipt bytes changed");
assert(cycleReceipt.receipt_sha256 === CYCLE_RECEIPT_DECLARED_SHA256 && cycleReceipt.receipt_sha256 === sha(Buffer.from(stablePretty(cycleReceiptBody))), "cycle-006 receipt identity changed");
assert(sha(fs.readFileSync(CYCLE_CHECKER_PATH)) === CYCLE_CHECKER_SHA256, "cycle-006 checker bytes changed");

const futureCandidates = [...candidates, {
  id: "jr_future_candidate_fixture",
  ts: "2099-01-01T00:00:00.000Z",
  actor: "grow.mjs@0.1",
  op: "draft.accept",
  specimen: "UC-FUTURE-FIXTURE",
  actor_name: "Future Performer",
  character: "Future Character",
  universe: "Doctor Who",
  production: "Future Production",
  link: "https://example.invalid/future",
  verification: "autopilot-source-receipt",
}];
validateCandidateJournal(futureCandidates);
const futurePackage = structuredClone(packageDoc);
futurePackage.scripts["future:cycle:fixture"] = "node --version";
futurePackage.scripts["autopilot:fixtures"] += " && npm run future:cycle:fixture";
validatePackage(futurePackage);
const futureAutopilot = structuredClone(autopilot);
let futureWallIndex = 0;
for (const futureJob of futureAutopilot.jobs.filter((row) => row.scope === "doctor-who" && row.status === "queued")) {
  futureWallIndex += 1;
  futureJob.status = "resolved";
  futureJob.wall_ids = [`UC-FUTURE-FIXTURE-${String(futureWallIndex).padStart(3, "0")}`];
}
validateLiveState({ autopilot: futureAutopilot, autopilotJournal, waterline });

const missingAcceptance = candidates.filter((row) => !(row.op === "draft.accept" && row.specimen === WALL_ID));
expectFailure("missing acceptance", () => validateCandidateJournal(missingAcceptance), /missing or duplicated/);
const duplicatedAcceptance = [...candidates, structuredClone(EXPECTED_AFTER_EVENT)];
expectFailure("duplicate acceptance", () => validateCandidateJournal(duplicatedAcceptance), /missing or duplicated/);
const beforeLease = candidates.map((row) => row.op === "draft.accept" && row.specimen === WALL_ID ? eventAt("2026-08-05T15:25:15.148Z") : row);
expectFailure("acceptance before lease", () => validateCandidateJournal(beforeLease), /does not follow/);
const badId = candidates.map((row) => row.op === "draft.accept" && row.specimen === WALL_ID ? { ...row, id: "jr_invalid" } : row);
expectFailure("bad content address", () => validateCandidateJournal(badId), /not content-addressed/);
const reopened = structuredClone(autopilot);
reopened.jobs.find((row) => row.id === TASK_ID).status = "queued";
expectFailure("reopened Kayste", () => validateLiveState({ autopilot: reopened, autopilotJournal, waterline }), /reopened or rebound/);
const active = structuredClone(autopilot);
const activeJob = active.jobs.find((row) => row.scope === "doctor-who" && row.id !== TASK_ID);
assert(activeJob, "active-work fixture lacks a non-Kayste Doctor Who job");
activeJob.status = "leased";
expectFailure("active work", () => validateLiveState({ autopilot: active, autopilotJournal, waterline }), /active Doctor Who work/);
const shortDenominator = structuredClone(autopilot);
shortDenominator.jobs.splice(shortDenominator.jobs.findIndex((row) => row.scope === "doctor-who" && row.id !== TASK_ID), 1);
expectFailure("changed denominator", () => validateLiveState({ autopilot: shortDenominator, autopilotJournal, waterline }), /denominator changed/);

const fixtures = {
  acceptance_before_lease_rejected: true,
  active_work_rejected: true,
  bad_content_address_rejected: true,
  denominator_change_rejected: true,
  duplicate_acceptance_rejected: true,
  future_candidate_append_accepted: true,
  future_package_extension_accepted: true,
  future_resolved_cycle_accepted: true,
  missing_acceptance_rejected: true,
  reopened_kayste_rejected: true,
};
exact(fixtures, EXPECTED_FIXTURES, "live composability fixtures drifted");

console.log("doctor-who cycle 006 candidate chronology composability: PASS");
console.log(JSON.stringify({
  chronology_floor_main: CHRONOLOGY_FLOOR_MAIN,
  original_checker: ORIGINAL_CHECKER_PATH,
  original_receipt: ORIGINAL_RECEIPT_PATH,
  receipt: RECEIPT_PATH,
  task_id: TASK_ID,
  wrapper: CHECKER_PATH,
}, null, 2));
