#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const BASE_MAIN = "45fc33aa8de8c01f03f006c5c01765dd1929385f";
const CANDIDATE_PATH = "data/journal/candidates.jsonl";
const PACKAGE_PATH = "package.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology.mjs";
const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology.json";
const CYCLE_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-kayste.json";
const CYCLE_CHECKER_PATH = "scripts/doctor-who-cycle-006.mjs";
const SCRIPT_NAME = "doctor-who:cycle-006:chronology:check";
const TASK_ID = "ap_c8e74653ac0877837814db21";
const LEASE_ID = "lease_476aaf782c8417a4372eb6be";
const WALL_ID = "UC-1351";
const CYCLE_ID = "cycle_4ee0abebffec084feda08162";
const CLAIMED_AT = "2026-08-05T15:26:05.000Z";
const ACCEPTED_AT = "2026-08-05T15:28:05.000Z";
const REVIEWED_AT = "2026-08-05T15:34:05.000Z";
const CORRECTED_AT = "2026-08-05T17:22:17.000Z";
const EXPECTED_CANDIDATE_BLOB = "58ba9b52db34158f421152f4cfcc34fa9f77b145";
const EXPECTED_PACKAGE_BLOB = "5448242912fdbcf9516deb9a287464e74126fb73";
const EXPECTED_NEW_CHECKER_SHA256 = "6f3001a95a5079cd009a731377eee72c824e1daeadcbe3f8f8d083c06833788c";
const EXPECTED_CYCLE_RECEIPT_FILE_SHA256 = "27c77be0f661e9a8465651e953cfb0dcb321cddd59654c263635945fa5191032";
const EXPECTED_CYCLE_RECEIPT_INTERNAL_SHA256 = "d0a45a782e41756e4fd18440b6dab8ec9879feb01d949dc8d1f9efe9e7165faa";
const EXPECTED_CYCLE_CHECKER_SHA256 = "fba8081197b36076ce3832d05ac58623c2265de78442741a4691575f387b852f";
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
const BOUNDARY = {
  candidate_event_retimed: true,
  canonical_record_mutated: false,
  cycle_receipt_mutated: false,
  lease_mutated: false,
  media_mutated: false,
  queue_mutated: false,
  source_receipt_mutated: false,
  task_mutated: false,
};
const FIXTURES = {
  acceptance_after_review_rejected: true,
  acceptance_before_lease_rejected: true,
  bad_content_address_rejected: true,
  duplicate_acceptance_rejected: true,
  missing_acceptance_rejected: true,
};
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const gitBlob = (value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return crypto.createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
};
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stablePretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const exact = (actual, expected, label) => {
  if (JSON.stringify(stable(actual)) !== JSON.stringify(stable(expected))) throw new Error(`${label} drifted`);
};

if (!process.env.CHECKER_PAYLOAD) throw new Error("CHECKER_PAYLOAD is required");
const candidateBefore = fs.readFileSync(CANDIDATE_PATH);
if (gitBlob(candidateBefore) !== EXPECTED_CANDIDATE_BLOB) throw new Error("candidate journal base blob drifted");
const lines = candidateBefore.toString("utf8").split(/\r?\n/).filter(Boolean);
const parsed = lines.map((line) => JSON.parse(line));
const matches = parsed.map((row, index) => ({ row, index })).filter(({ row }) => row.op === "draft.accept" && row.specimen === WALL_ID);
if (matches.length !== 1) throw new Error("Kayste candidate acceptance cardinality drifted before repair");
exact(matches[0].row, BEFORE_EVENT, "pre-repair Kayste candidate event");
lines[matches[0].index] = JSON.stringify(AFTER_EVENT);
fs.writeFileSync(CANDIDATE_PATH, lines.join("\n") + "\n");
const candidateAfter = fs.readFileSync(CANDIDATE_PATH);

const checker = fs.readFileSync(process.env.CHECKER_PAYLOAD);
if (sha(checker) !== EXPECTED_NEW_CHECKER_SHA256) throw new Error("chronology checker payload digest drifted");
fs.mkdirSync("scripts", { recursive: true });
fs.writeFileSync(CHECKER_PATH, checker);

const packageBefore = fs.readFileSync(PACKAGE_PATH);
if (gitBlob(packageBefore) !== EXPECTED_PACKAGE_BLOB) throw new Error("package base blob drifted");
const pkg = JSON.parse(packageBefore);
const fixtureMarker = `npm run ${SCRIPT_NAME}`;
if (pkg.scripts?.[SCRIPT_NAME] !== undefined || pkg.scripts?.["autopilot:fixtures"]?.includes(fixtureMarker)) throw new Error("chronology checker is already registered");
if (!pkg.scripts?.["autopilot:fixtures"]?.endsWith("npm run doctor-who:cycle-006:check")) throw new Error("autopilot fixture tail drifted");
pkg.scripts["autopilot:fixtures"] += ` && ${fixtureMarker}`;
pkg.scripts[SCRIPT_NAME] = `node ${CHECKER_PATH}`;
fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + "\n");
const packageAfter = fs.readFileSync(PACKAGE_PATH);

const cycleReceiptBytes = fs.readFileSync(CYCLE_RECEIPT_PATH);
const cycleReceipt = JSON.parse(cycleReceiptBytes);
const cycleCheckerBytes = fs.readFileSync(CYCLE_CHECKER_PATH);
if (sha(cycleReceiptBytes) !== EXPECTED_CYCLE_RECEIPT_FILE_SHA256) throw new Error("cycle 006 receipt file drifted before correction");
if (cycleReceipt.receipt_sha256 !== EXPECTED_CYCLE_RECEIPT_INTERNAL_SHA256) throw new Error("cycle 006 internal receipt drifted before correction");
if (sha(cycleCheckerBytes) !== EXPECTED_CYCLE_CHECKER_SHA256) throw new Error("cycle 006 checker drifted before correction");
if (cycleReceipt.lease?.id !== LEASE_ID || cycleReceipt.lease?.claimed_at !== CLAIMED_AT || cycleReceipt.generated_at !== REVIEWED_AT) throw new Error("cycle 006 chronology anchors drifted before correction");
exact(cycleReceipt.queue?.after, EXPECTED_QUEUE, "cycle 006 queue");

const receipt = {
  transaction: "DOCTOR-WHO-CYCLE-006-CANDIDATE-CHRONOLOGY-CORRECTION",
  version: 1,
  base_main: BASE_MAIN,
  corrected_at: CORRECTED_AT,
  task: {
    cycle_id: CYCLE_ID,
    lease_id: LEASE_ID,
    task_id: TASK_ID,
    wall_id: WALL_ID,
  },
  timeline: {
    accepted_at_after: ACCEPTED_AT,
    accepted_at_before: BEFORE_EVENT.ts,
    claimed_at: CLAIMED_AT,
    reviewed_at: REVIEWED_AT,
  },
  before_event: BEFORE_EVENT,
  after_event: AFTER_EVENT,
  custody: {
    candidate_journal_git_blob_before: EXPECTED_CANDIDATE_BLOB,
    candidate_journal_sha256_before: sha(candidateBefore),
    candidate_journal_sha256_after: sha(candidateAfter),
    package_git_blob_before: EXPECTED_PACKAGE_BLOB,
    package_sha256_before: sha(packageBefore),
    package_sha256_after: sha(packageAfter),
    cycle_receipt_file_sha256: EXPECTED_CYCLE_RECEIPT_FILE_SHA256,
    cycle_receipt_internal_sha256: EXPECTED_CYCLE_RECEIPT_INTERNAL_SHA256,
    cycle_checker_sha256: EXPECTED_CYCLE_CHECKER_SHA256,
  },
  qualification: {
    checker_path: CHECKER_PATH,
    checker_sha256: EXPECTED_NEW_CHECKER_SHA256,
    complete_repository_gate_required: true,
    receipt_path: RECEIPT_PATH,
  },
  fixtures: FIXTURES,
  boundary: BOUNDARY,
};
receipt.receipt_sha256 = sha(stablePretty(receipt));
fs.mkdirSync("data/review/adapter-sdk", { recursive: true });
fs.writeFileSync(RECEIPT_PATH, stablePretty(receipt));
