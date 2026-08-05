#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology.mjs";
const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology.json";
const CANDIDATE_JOURNAL_PATH = "data/journal/candidates.jsonl";
const AUTOPILOT_JOURNAL_PATH = "data/journal/autopilot.jsonl";
const AUTOPILOT_PATH = "data/AUTOPILOT.json";
const CYCLE_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-kayste.json";
const CYCLE_CHECKER_PATH = "scripts/doctor-who-cycle-006.mjs";
const PACKAGE_PATH = "package.json";

const BASE_MAIN = "45fc33aa8de8c01f03f006c5c01765dd1929385f";
const TASK_ID = "ap_c8e74653ac0877837814db21";
const LEASE_ID = "lease_476aaf782c8417a4372eb6be";
const WALL_ID = "UC-1351";
const CYCLE_ID = "cycle_4ee0abebffec084feda08162";
const CLAIMED_AT = "2026-08-05T15:26:05.000Z";
const ACCEPTED_AT = "2026-08-05T15:28:05.000Z";
const REVIEWED_AT = "2026-08-05T15:34:05.000Z";
const ORIGINAL_CYCLE_RECEIPT_FILE_SHA256 = "27c77be0f661e9a8465651e953cfb0dcb321cddd59654c263635945fa5191032";
const ORIGINAL_CYCLE_RECEIPT_INTERNAL_SHA256 = "d0a45a782e41756e4fd18440b6dab8ec9879feb01d949dc8d1f9efe9e7165faa";
const ORIGINAL_CYCLE_CHECKER_SHA256 = "fba8081197b36076ce3832d05ac58623c2265de78442741a4691575f387b852f";
const SCRIPT_NAME = "doctor-who:cycle-006:chronology:check";

const BEFORE_EVENT = {
  id: "jr_WgVJAVjT-Bfq_fvWIY2_eC",
  ts: "2026-08-05T15:25:15.148Z",
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
const AFTER_EVENT = {
  ...BEFORE_EVENT,
  id: "jr_sgGinhjmC4y-GcVIX1tq-Z",
  ts: ACCEPTED_AT,
};
const EXPECTED_QUEUE = { in_flight: 0, queued: 310, resolved: 6, total: 316 };
const EXPECTED_BOUNDARY = {
  candidate_event_retimed: true,
  canonical_record_mutated: false,
  cycle_receipt_mutated: false,
  lease_mutated: false,
  media_mutated: false,
  queue_mutated: false,
  source_receipt_mutated: false,
  task_mutated: false,
};
const EXPECTED_FIXTURES = {
  acceptance_after_review_rejected: true,
  acceptance_before_lease_rejected: true,
  bad_content_address_rejected: true,
  duplicate_acceptance_rejected: true,
  missing_acceptance_rejected: true,
};

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const stablePretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readJsonl = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const exact = (actual, expected, label) => {
  if (stableJson(actual) !== stableJson(expected)) fail(`${label} drifted`);
};
const at = (value, label) => {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) fail(`${label} is not an RFC3339 timestamp`);
  return parsed;
};
const journalId = (event) => {
  const body = structuredClone(event);
  delete body.id;
  return "jr_" + crypto.createHash("sha256")
    .update(`${event.actor}|${JSON.stringify(body)}`)
    .digest("base64url")
    .slice(0, 22);
};
const eventWithTime = (ts) => {
  const event = { ...AFTER_EVENT, ts };
  event.id = journalId(event);
  return event;
};

function validateOrdering(event, claimAt = CLAIMED_AT, reviewedAt = REVIEWED_AT) {
  if (at(event.ts, "Kayste acceptance") <= at(claimAt, "Kayste claim")) fail("Kayste acceptance does not follow the bounded lease claim");
  if (at(event.ts, "Kayste acceptance") >= at(reviewedAt, "Kayste review")) fail("Kayste acceptance does not precede the reviewed cycle receipt");
  return true;
}

function validateCandidateTimeline(rows, claimAt = CLAIMED_AT, reviewedAt = REVIEWED_AT) {
  if (!Array.isArray(rows) || rows.length !== 1) fail("Kayste candidate acceptance cardinality drifted");
  const event = rows[0];
  exact(event, AFTER_EVENT, "Kayste corrected candidate event");
  if (event.id !== journalId(event)) fail("Kayste corrected candidate event is not content-addressed");
  validateOrdering(event, claimAt, reviewedAt);
  return true;
}

const receipt = read(RECEIPT_PATH);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
if (receipt.receipt_sha256 !== sha(stablePretty(receiptBody))) fail("chronology correction receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-006-CANDIDATE-CHRONOLOGY-CORRECTION" || receipt.version !== 1) fail("chronology correction receipt identity drifted");
if (receipt.base_main !== BASE_MAIN) fail("chronology correction base main drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("chronology checker hash drifted");
if (receipt.qualification?.checker_path !== CHECKER_PATH || receipt.qualification?.receipt_path !== RECEIPT_PATH) fail("chronology qualification paths drifted");
if (/<[^>\n]+>/.test(JSON.stringify(receipt))) fail("chronology correction receipt contains a template placeholder");

exact(receipt.before_event, BEFORE_EVENT, "chronology before-event receipt");
exact(receipt.after_event, AFTER_EVENT, "chronology after-event receipt");
exact(receipt.timeline, {
  accepted_at_after: ACCEPTED_AT,
  accepted_at_before: BEFORE_EVENT.ts,
  claimed_at: CLAIMED_AT,
  reviewed_at: REVIEWED_AT,
}, "chronology timeline receipt");
exact(receipt.boundary, EXPECTED_BOUNDARY, "chronology authority boundary");
exact(receipt.fixtures, EXPECTED_FIXTURES, "chronology refusal fixtures");

const candidates = readJsonl(CANDIDATE_JOURNAL_PATH);
const kaysteCandidates = candidates.filter((row) => row.op === "draft.accept" && row.specimen === WALL_ID);
validateCandidateTimeline(kaysteCandidates);
if (candidates.some((row) => stableJson(row) === stableJson(BEFORE_EVENT))) fail("superseded pre-lease Kayste candidate event remains live");

const autopilotJournal = readJsonl(AUTOPILOT_JOURNAL_PATH);
const claims = autopilotJournal.filter((row) => row.op === "lease.claimed" && row.lease_id === LEASE_ID);
if (claims.length !== 1) fail("Kayste lease claim cardinality drifted");
const claim = claims[0];
if (claim.task_id !== TASK_ID || claim.scope !== "doctor-who" || claim.at !== CLAIMED_AT || claim.performer !== "Dan Starkey" || claim.character !== "Kayste") fail("Kayste lease claim identity drifted");
const claimBody = structuredClone(claim);
delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("Kayste lease claim is not content-addressed");

const cycleReceiptBytes = fs.readFileSync(CYCLE_RECEIPT_PATH);
const cycleReceipt = JSON.parse(cycleReceiptBytes);
const cycleReceiptBody = structuredClone(cycleReceipt);
delete cycleReceiptBody.receipt_sha256;
if (sha(cycleReceiptBytes) !== ORIGINAL_CYCLE_RECEIPT_FILE_SHA256) fail("immutable cycle 006 receipt file changed");
if (cycleReceipt.receipt_sha256 !== ORIGINAL_CYCLE_RECEIPT_INTERNAL_SHA256 || cycleReceipt.receipt_sha256 !== sha(stablePretty(cycleReceiptBody))) fail("immutable cycle 006 internal receipt changed");
if (sha(fs.readFileSync(CYCLE_CHECKER_PATH)) !== ORIGINAL_CYCLE_CHECKER_SHA256) fail("immutable cycle 006 checker changed");
if (cycleReceipt.transaction !== "DOCTOR-WHO-CYCLE-006-KAYSTE" || cycleReceipt.lease?.id !== LEASE_ID || cycleReceipt.lease?.claimed_at !== CLAIMED_AT || cycleReceipt.generated_at !== REVIEWED_AT) fail("cycle 006 chronology anchors drifted");
if (cycleReceipt.boundary?.seventh_lease_issued !== false) fail("cycle 006 seventh-lease boundary drifted");
exact(cycleReceipt.queue?.after, EXPECTED_QUEUE, "cycle 006 historical queue");

const autopilot = read(AUTOPILOT_PATH);
const job = (autopilot.jobs || []).find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved" || job.performer !== "Dan Starkey" || job.character !== "Kayste") fail("Kayste task state drifted");
exact(job.wall_ids, [WALL_ID], "Kayste task wall binding");

const packageJson = read(PACKAGE_PATH);
if (packageJson.scripts?.[SCRIPT_NAME] !== `node ${CHECKER_PATH}`) fail("chronology checker package registration drifted");
if (!packageJson.scripts?.["autopilot:fixtures"]?.includes(`npm run ${SCRIPT_NAME}`)) fail("chronology checker is not composed into autopilot fixtures");

if (receipt.custody?.candidate_journal_sha256_after !== sha(fs.readFileSync(CANDIDATE_JOURNAL_PATH))) fail("corrected candidate journal digest drifted");
if (receipt.custody?.package_sha256_after !== sha(fs.readFileSync(PACKAGE_PATH))) fail("corrected package digest drifted");
if (receipt.custody?.cycle_receipt_file_sha256 !== ORIGINAL_CYCLE_RECEIPT_FILE_SHA256 || receipt.custody?.cycle_receipt_internal_sha256 !== ORIGINAL_CYCLE_RECEIPT_INTERNAL_SHA256 || receipt.custody?.cycle_checker_sha256 !== ORIGINAL_CYCLE_CHECKER_SHA256) fail("immutable cycle custody receipt drifted");

const fixture = (fn) => {
  try { fn(); return false; } catch { return true; }
};
const fixtures = {
  acceptance_after_review_rejected: fixture(() => validateOrdering(eventWithTime("2026-08-05T15:35:05.000Z"))),
  acceptance_before_lease_rejected: fixture(() => validateOrdering(eventWithTime(BEFORE_EVENT.ts))),
  bad_content_address_rejected: fixture(() => validateCandidateTimeline([{ ...AFTER_EVENT, id: "jr_invalid" }])),
  duplicate_acceptance_rejected: fixture(() => validateCandidateTimeline([AFTER_EVENT, AFTER_EVENT])),
  missing_acceptance_rejected: fixture(() => validateCandidateTimeline([])),
};
exact(fixtures, EXPECTED_FIXTURES, "live chronology refusal fixtures");

console.log("doctor-who cycle 006 candidate chronology: PASS");
console.log(JSON.stringify({
  accepted_at: AFTER_EVENT.ts,
  base_main: BASE_MAIN,
  lease_id: LEASE_ID,
  receipt: RECEIPT_PATH,
  task_id: TASK_ID,
  wall_id: WALL_ID,
}, null, 2));
