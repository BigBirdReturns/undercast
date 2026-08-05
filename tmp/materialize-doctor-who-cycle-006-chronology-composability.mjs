#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const BASE_MAIN = "f5e6919cfcb0491e2a62c64935a6d689b66b27c1";
const ORIGINAL_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology.json";
const ORIGINAL_CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology.mjs";
const CANDIDATE_JOURNAL_PATH = "data/journal/candidates.jsonl";
const PACKAGE_PATH = "package.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-006-chronology-composable.mjs";
const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-006-candidate-chronology-composability.json";
const SCRIPT_NAME = "doctor-who:cycle-006:chronology:check";
const CORRECTED_AT = "2026-08-05T18:40:00.000Z";

const ORIGINAL_RECEIPT_BLOB = "ea74fde73e01b3e3f0e61b2f1e272f7908d3a87b";
const ORIGINAL_RECEIPT_FILE_SHA256 = "7ec46d2f4117c7005e05ef190d446d3a9b4062dd83dc3b1d432594785b12169c";
const ORIGINAL_RECEIPT_DECLARED_SHA256 = "e8bc8fbeb9cdad1f0951d2c3e92f16f6c1bb24d19783133766453127a32a8fb7";
const ORIGINAL_CHECKER_BLOB = "ca00f693f2717d4329cdae75ba33724914fd0f9b";
const ORIGINAL_CHECKER_SHA256 = "6f3001a95a5079cd009a731377eee72c824e1daeadcbe3f8f8d083c06833788c";
const CANDIDATE_JOURNAL_BLOB = "473fa5f9726b93201bc7c62c3b2505523882e9f3";
const CANDIDATE_JOURNAL_SHA256 = "60283147d8645e3061963b34e9b5985c5da90c37793f9806877a837424034de0";
const PACKAGE_BLOB = "0dcbbb7102cd895b741e9183dbd0bcc3b06e02b8";
const PACKAGE_SHA256 = "649af87701cb2fd455505978f7f67656bbc8b13e890ecfb199c29d79819c3cc0";
const PACKAGE_SHA256_AFTER = "633275f311583c40cf7a9c81220819837d8b3d8dfa6e73e39205c292c180a38d";
const CHECKER_SHA256 = "250c819c85121658ab903418f1ee9e89315f112581442ad02ef1ba1aee1b67d1";
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
const BOUNDARY = {
  future_candidate_journal_appends_permitted: true,
  future_package_extensions_permitted: true,
  historical_candidate_journal_pinned_at_floor: true,
  historical_package_pinned_at_floor: true,
  original_chronology_checker_immutable: true,
  original_chronology_receipt_immutable: true,
  task_lease_queue_media_mutated: false,
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
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const exactBase = (path, blob, digest) => {
  const bytes = fs.readFileSync(path);
  if (gitBlob(bytes) !== blob || sha(bytes) !== digest) throw new Error(`${path} base custody drifted`);
  return bytes;
};

if (!process.env.CHECKER_PAYLOAD) throw new Error("CHECKER_PAYLOAD is required");
const originalReceiptBytes = exactBase(ORIGINAL_RECEIPT_PATH, ORIGINAL_RECEIPT_BLOB, ORIGINAL_RECEIPT_FILE_SHA256);
const originalCheckerBytes = exactBase(ORIGINAL_CHECKER_PATH, ORIGINAL_CHECKER_BLOB, ORIGINAL_CHECKER_SHA256);
const candidateBytes = exactBase(CANDIDATE_JOURNAL_PATH, CANDIDATE_JOURNAL_BLOB, CANDIDATE_JOURNAL_SHA256);
const packageBytes = exactBase(PACKAGE_PATH, PACKAGE_BLOB, PACKAGE_SHA256);
void originalCheckerBytes;
void candidateBytes;
const originalReceipt = JSON.parse(originalReceiptBytes);
if (originalReceipt.receipt_sha256 !== ORIGINAL_RECEIPT_DECLARED_SHA256) throw new Error("original chronology receipt identity drifted");

const checkerBytes = fs.readFileSync(process.env.CHECKER_PAYLOAD);
if (sha(checkerBytes) !== CHECKER_SHA256) throw new Error("composable checker payload drifted");
fs.mkdirSync("scripts", { recursive: true });
fs.writeFileSync(CHECKER_PATH, checkerBytes);

const packageDoc = JSON.parse(packageBytes);
if (packageDoc.scripts?.[SCRIPT_NAME] !== `node ${ORIGINAL_CHECKER_PATH}`) throw new Error("historical package mapping drifted");
if (!packageDoc.scripts?.["autopilot:fixtures"]?.includes(`npm run ${SCRIPT_NAME}`)) throw new Error("chronology fixture registration drifted");
packageDoc.scripts[SCRIPT_NAME] = `node ${CHECKER_PATH}`;
fs.writeFileSync(PACKAGE_PATH, `${JSON.stringify(packageDoc, null, 2)}\n`);
const packageAfter = fs.readFileSync(PACKAGE_PATH);
if (sha(packageAfter) !== PACKAGE_SHA256_AFTER) throw new Error("composable package digest drifted");

const receiptBody = {
  version: 1,
  transaction: "DOCTOR-WHO-CYCLE-006-CANDIDATE-CHRONOLOGY-COMPOSABILITY-001",
  base_main: BASE_MAIN,
  corrected_at: CORRECTED_AT,
  custody: {
    original_receipt_path: ORIGINAL_RECEIPT_PATH,
    original_receipt_blob: ORIGINAL_RECEIPT_BLOB,
    original_receipt_file_sha256: ORIGINAL_RECEIPT_FILE_SHA256,
    original_receipt_declared_sha256: ORIGINAL_RECEIPT_DECLARED_SHA256,
    original_checker_path: ORIGINAL_CHECKER_PATH,
    original_checker_blob: ORIGINAL_CHECKER_BLOB,
    original_checker_sha256: ORIGINAL_CHECKER_SHA256,
    candidate_journal_floor_blob: CANDIDATE_JOURNAL_BLOB,
    candidate_journal_floor_sha256: CANDIDATE_JOURNAL_SHA256,
    package_floor_blob: PACKAGE_BLOB,
    package_floor_sha256: PACKAGE_SHA256,
    package_sha256_after: PACKAGE_SHA256_AFTER,
  },
  fixtures: EXPECTED_FIXTURES,
  boundary: BOUNDARY,
  qualification: {
    checker_path: CHECKER_PATH,
    checker_sha256: CHECKER_SHA256,
    command: `npm run ${SCRIPT_NAME}`,
    complete_repository_gate_required: true,
  },
};
const receipt = { ...receiptBody, receipt_sha256: sha(Buffer.from(stablePretty(receiptBody))) };
fs.mkdirSync("data/review/adapter-sdk", { recursive: true });
fs.writeFileSync(RECEIPT_PATH, stablePretty(receipt));
