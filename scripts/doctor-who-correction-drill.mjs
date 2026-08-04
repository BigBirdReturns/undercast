#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { stable, validateCorrectionLedger } from "./corrections.mjs";
import { collapseCoverage, normalize as canonicalNormalize, sourceFingerprint as canonicalSourceFingerprint, sourceKey, validateState } from "./lib/autopilot-model.mjs";
import { validateRoadmapState } from "./lib/roadmap.mjs";
import { leaseGroups as canonicalLeaseGroups, parseJsonl } from "./lib/waterline.mjs";

const BASE_SHA = "ae699cdd24d62ab4c5e0c81722d7d688152c54e1";
const DRILL_AT = "2026-08-03T00:24:00.000-07:00";
const WALL_ID = "UC-1345";
const COMMANDER_TASK_ID = "ap_6dfcb7b9254c26dc3f4b46b8";
const SLITE_TASK_ID = "ap_0606b27614b2d76b29e1f789";
const LEASE_ID = "lease_51e3223a4810f3681aff9df4";
const CYCLE_ID = "cycle_93fcbfd214892eaf81d55fa3";
const CASE_ID = "correction-exercise-doctor-who-001";
const MILESTONE_ID = "adapter-sdk-and-second-gold-shard";
const SCOPE_ID = "doctor-who";
const DOCTOR_FRANCHISE = canonicalNormalize("Doctor Who");

const IDENTITY_SHA256 = "86845b0347983d9284d82d35ac7e0243ff3dba60ac714733231d700e34c7f53c";
const HISTORICAL_PILOT_RECEIPT_SHA256 = "9ed078b768191a80845bab6ce221ea335960e3a3efeee95235d94a76cd8205eb";
const DRILL_LEDGER_SHA256 = "19716a18783c169380f78aae7dcbb27c9ef8987b21565de0b6613f3c1ba17127";
const RECEIPT_SHA256 = "5045a6111a5a4b4affa5004502a5a4fea7420fd858125265602167a83e8e90fd";
const SCOPE_REPAIR_RECEIPT_SHA256 = "ea03a497d1e35533e9c91765e3aa0f0b4536e827dc767c763c35b506c95eed6f";
const SCOPE_REPAIR_CODE_SHA256 = "cd4dfab241e22841e83f3edfb88883bacc78b33afbbef78e852d8a982fb686ac";
const SCOPE_REPAIR_CODE_COMMIT = "f2d3f048a4ead24915ca9d2d92a05fa806829842";
const SCOPE_REPAIR_CODE_GIT_OBJECT = "ecc3f75b732ec0fc3cfb4f3ecdf3b322f5be31e5";

const PILOT_MEDIA_BINDING_SCOPE = "doctor-who/UC-1345";
const PILOT_MEDIA_ITEM_IDS = ["ma_ee364d31319f0943c9c4f8ce", "ma_f8ee1f03ec2173d75f6f85ea"];
const PILOT_MEDIA_FACETS_SHA256 = "d8f69833e561b9a01754d9ee906d30255f4c45ef1894ef289e2e12bc1ffc363b";
const HISTORICAL_GLOBAL_MEDIA_SHA256 = "36810c36bbe43f98c556fcd2c151522f7ac7af70357afb02ee1a711bb12831e3";

const COMMANDER_SOURCE = {
  source: "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)",
  pageid: 246488,
  revision: 3330636,
  content_sha256: "2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966",
  source_fingerprint: "f272dd90028ca998792a461c1547a334d58f7976484ff7ee2d299306763e0879",
};
const SLITE_SOURCE = {
  source: "https://tardis.fandom.com/wiki/Slite",
  pageid: 246485,
  revision: 3416320,
  content_sha256: "eae385ba9d21bd3238a3280dd7de4d076e8c2a496eff8d6dd7d384217bbf8e50",
  source_fingerprint: "19f2b03bb123656a2363e10c284762561e2593f9307a0ca6e8ba20206239d8c8",
};
const HISTORICAL_CERTIFICATION = {
  source_snapshot_id: "preservation-doctor-who-169391a8bf64",
  manifest_sha256: "96202b4c128a3729fb7cf3e52b4c36f32a25a156c0df92d1aa379de99fb58f00",
  source_archive_sha256: "1526b095c31c046e92de020854058088c970c42d8c9cf400179f1368c16c0211",
  rows: 316,
  sources: 298,
  complete_receipts: 298,
};
const HISTORICAL_GIT_OBJECTS = {
  "data/AUTOPILOT.json": "e82c427dd2465d325c7d6d62c31f1356443c6f4b",
  "data/AUTOPILOT-CERTIFICATIONS.json": "aa1da6145b44493d4568f11e7bcb8e59c78d1db9",
  "data/AUTOPILOT-SCOPES.json": "820a3f56866b095219e42288a680446c0ba69e6e",
  "data/journal/autopilot.jsonl": "5675cf41bb033c4c102a60f12fbe43faea8583a8",
  "data/WATERLINE.json": "823a0a2c7a3e95c679b0ba8b180070f7a45ed2f1",
  "data/WATERLINE-STATE.json": "38ddb3a53f792450cef3a009c1c58f1c936f6551",
  "data/specimens.json": "5ee0420e216d73e46657599e9d5944a9996e55ac",
  "data/SOURCES.json": "508d76af0c992b08c2e4a398e165f788a0814187",
  "data/MEDIA-AUDIT.json": "81e56bb6e25476d2ea815d4569e47ab3a4beb71a",
  "data/CORRECTIONS.json": "a08ce1f8a35f87992924a885ab48ff24d083e6a9",
  "data/ROADMAP.json": "566fe8db6b46e1c811ece05dc10043bf596e1d44",
  "data/ROADMAP-STATE.json": "1a5e143d7673d0919b21f20372b0e3ba3a23c451",
  "preservation/SNAPSHOTS.json": "5f24f3e630d456c62c5839b40d59572ef44fba86",
  "data/review/adapter-sdk/doctor-who-pilot-cycle-001.json": "d1f86c10c3fc370b78a4818dd55facfff11891b3",
};
const HISTORICAL_INPUT_SHA256 = {
  production: "2597365c8679740fb146275689e7b8d8485dbd3cf08ca9a79a4760b250623d03",
  specimens: "2b0a74f71b1768377f43ce45f923d917448950638cf8eb834e05783eee2f6256",
  sources: "03f8e2b5defea40b1d0014fedf7a2a36694b3acf745614bf92d7df3dbd9606d7",
  audit: HISTORICAL_GLOBAL_MEDIA_SHA256,
};

const PATHS = {
  checker: "scripts/doctor-who-correction-drill.mjs",
  ledger: "data/review/corrections/controlled-exercise-002-doctor-who.json",
  receipt: "data/review/adapter-sdk/doctor-who-correction-drill-001.json",
  scopeRepair: "data/review/adapter-sdk/doctor-who-correction-drill-001-scope-custody.json",
  pilot: "data/review/adapter-sdk/doctor-who-pilot-cycle-001.json",
  production: "data/CORRECTIONS.json",
  correctionBaseline: "data/review/corrections/BASELINE.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  audit: "data/MEDIA-AUDIT.json",
  coverage: "data/CENSUS-COVERAGE.json",
  manifest: "data/CENSUS-MANIFEST.json",
  autopilot: "data/AUTOPILOT.json",
  autopilotJournal: "data/journal/autopilot.jsonl",
  certifications: "data/AUTOPILOT-CERTIFICATIONS.json",
  scopes: "data/AUTOPILOT-SCOPES.json",
  snapshots: "preservation/SNAPSHOTS.json",
  waterline: "data/WATERLINE.json",
  waterlineState: "data/WATERLINE-STATE.json",
  roadmap: "data/ROADMAP.json",
  roadmapState: "data/ROADMAP-STATE.json",
};

const ACTIVE_JOB_STATUSES = new Set(["leased", "drafted", "merged"]);
const readBytes = (file) => fs.readFileSync(file);
const read = (file) => JSON.parse(readBytes(file));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stableJson = (value) => JSON.stringify(stable(value));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const isSha256 = (value) => /^[0-9a-f]{64}$/.test(String(value || ""));
const isGitObject = (value) => /^[0-9a-f]{40}$/.test(String(value || ""));
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const sameSet = (left, right) =>
  Array.isArray(left) && Array.isArray(right) &&
  left.length === right.length && left.every((value) => right.includes(value));

function receiptHash(document) {
  const clone = structuredClone(document);
  delete clone.receipt_sha256;
  return sha(`${stableJson(clone)}\n`);
}

function expectFailure(fn, pattern, label) {
  let message = "";
  try { fn(); }
  catch (error) { message = String(error?.message || error); }
  assert(pattern.test(message), `${label} did not fail closed (${message || "no error"})`);
}

function runGitText(args, { allowFail = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    if (allowFail) return { ok: false, stdout: "", stderr: result.error.message };
    fail(`git ${args.join(" ")} could not start: ${result.error.message}`);
  }
  const ok = result.status === 0;
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  if (!ok && !allowFail) {
    fail(`git ${args.join(" ")} failed: ${stderr || stdout || `status ${result.status}`}`);
  }
  return { ok, stdout, stderr };
}

function runGitBytes(args) {
  const result = spawnSync("git", args, {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) fail(`git ${args.join(" ")} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = Buffer.from(result.stderr || []).toString("utf8").trim();
    fail(`git ${args.join(" ")} failed: ${stderr || `status ${result.status}`}`);
  }
  return Buffer.from(result.stdout || []);
}

const exactFetchPause = (milliseconds) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
const isRetryableExactFetchError = (detail) =>
  /shallow file has changed|shallow\.lock|index\.lock|packed-refs\.lock|cannot lock ref|another git process/i.test(String(detail || ""));

function fetchExactCommitWithRetry(commit, label) {
  let detail = "unknown git error";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const fetched = runGitText([
      "-c", "gc.auto=0",
      "-c", "maintenance.auto=false",
      "-c", "fetch.writeCommitGraph=false",
      "fetch", "--no-tags", "--depth=1", "origin", commit,
    ], { allowFail: true });
    if (fetched.ok || runGitText(["cat-file", "-e", `${commit}^{commit}`], { allowFail: true }).ok) return;
    detail = fetched.stderr || fetched.stdout || detail;
    if (!isRetryableExactFetchError(detail) || attempt === 5) break;
    exactFetchPause(attempt * 250);
  }
  fail(`${label} commit ${commit} is unavailable after bounded exact-fetch retries: ${detail}`);
}

assert(isRetryableExactFetchError("fatal: shallow file has changed since we read it"), "shallow-file race is not classified as retryable");
assert(!isRetryableExactFetchError("fatal: repository not found"), "substantive fetch failure became retryable");

function ensureHistoricalCommit() {
  if (runGitText(["cat-file", "-e", `${BASE_SHA}^{commit}`], { allowFail: true }).ok) return;
  fetchExactCommitWithRetry(BASE_SHA, "historical drill");
  assert(
    runGitText(["cat-file", "-e", `${BASE_SHA}^{commit}`], { allowFail: true }).ok,
    `historical drill commit ${BASE_SHA} did not resolve after exact fetch`,
  );
}

function historicalBlobAtPath(path) {
  const resolved = runGitText(["rev-parse", `${BASE_SHA}:${path}`]);
  assert(isGitObject(resolved.stdout), `historical blob for ${path} is malformed`);
  assert(
    runGitText(["cat-file", "-e", `${resolved.stdout}^{blob}`], { allowFail: true }).ok,
    `historical blob for ${path} does not exist`,
  );
  return resolved.stdout;
}

function historicalBytes(path) {
  return runGitBytes(["show", `${BASE_SHA}:${path}`]);
}

function historicalJson(path) {
  try { return JSON.parse(historicalBytes(path).toString("utf8")); }
  catch (error) { fail(`historical ${path} is not valid JSON: ${error.message}`); }
}

function ensureExactCommit(commit, label) {
  if (runGitText(["cat-file", "-e", `${commit}^{commit}`], { allowFail: true }).ok) return;
  fetchExactCommitWithRetry(commit, label);
  assert(runGitText(["cat-file", "-e", `${commit}^{commit}`], { allowFail: true }).ok, `${label} commit ${commit} did not resolve after exact fetch`);
}

function exactBlobAtCommitPath(commit, path, label) {
  ensureExactCommit(commit, label);
  const resolved = runGitText(["rev-parse", `${commit}:${path}`]);
  assert(isGitObject(resolved.stdout), `${label} blob for ${path} is malformed`);
  assert(runGitText(["cat-file", "-e", `${resolved.stdout}^{blob}`], { allowFail: true }).ok, `${label} blob for ${path} does not exist`);
  return resolved.stdout;
}

function exactBytesAtCommitPath(commit, path, label) {
  exactBlobAtCommitPath(commit, path, label);
  return runGitBytes(["show", `${commit}:${path}`]);
}

function assertHistoricalGitObjects(receiptedObjects) {
  assert(receiptedObjects && typeof receiptedObjects === "object", "historical Git-object receipt is missing");
  ensureHistoricalCommit();
  const expectedPaths = Object.keys(HISTORICAL_GIT_OBJECTS);
  assert(sameSet(Object.keys(receiptedObjects), expectedPaths), "historical Git-object path denominator drifted");
  for (const [path, expectedObjectId] of Object.entries(HISTORICAL_GIT_OBJECTS)) {
    assert(isGitObject(receiptedObjects[path]), `historical Git object for ${path} is malformed`);
    assert(receiptedObjects[path] === expectedObjectId, `historical Git object receipt drifted for ${path}`);
    assert(
      historicalBlobAtPath(path) === expectedObjectId,
      `historical Git object is not bound to ${BASE_SHA}:${path}`,
    );
  }
}

function assertExactObject(actual, expected, label) {
  assert(actual && typeof actual === "object" && !Array.isArray(actual), `${label} is missing`);
  for (const [key, value] of Object.entries(expected)) {
    assert(actual[key] === value, `${label} drifted at ${key}`);
  }
}

function assertHttpsSourceUrl(value, label) {
  assert(typeof value === "string", `${label} is invalid`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} is not a parseable URL`);
  }
  assert(parsed.protocol === "https:", `${label} must use HTTPS`);
  assert(parsed.hostname, `${label} hostname is missing`);
  assert(parsed.username === "", `${label} must not carry credentials`);
  assert(parsed.password === "", `${label} must not carry credentials`);
  return parsed;
}

function sourceReceiptIdentities(task) {
  assert(Array.isArray(task.sources) && task.sources.length > 0, `${task.id} has no current source URLs`);
  assert(Array.isArray(task.source_receipts) && task.source_receipts.length > 0, `${task.id} has no current source receipts`);
  const sourceKeys = new Set();
  for (const source of task.sources) {
    assertHttpsSourceUrl(source, `${task.id} source URL`);
    sourceKeys.add(sourceKey(source));
  }
  assert(sourceKeys.size === task.sources.length, `${task.id} has duplicate normalized source URLs`);
  const receiptSourceKeys = new Set();
  const identities = new Set();
  for (const sourceReceipt of task.source_receipts) {
    assertHttpsSourceUrl(sourceReceipt.source, `${task.id} source receipt URL`);
    assert(isPositiveInteger(sourceReceipt.pageid), `${task.id} page id is invalid`);
    assert(isPositiveInteger(sourceReceipt.revision), `${task.id} revision is invalid`);
    assert(isSha256(sourceReceipt.content_sha256), `${task.id} source-content hash is invalid`);
    receiptSourceKeys.add(sourceKey(sourceReceipt.source));
    identities.add([
      sourceKey(sourceReceipt.source),
      sourceReceipt.pageid,
      sourceReceipt.revision,
      sourceReceipt.content_sha256,
    ].join("\u0000"));
  }
  assert(
    sameSet([...sourceKeys].sort(), [...receiptSourceKeys].sort()),
    `${task.id} current source URLs and receipt URLs disagree`,
  );
  assert(
    task.source_fingerprint === canonicalSourceFingerprint(task),
    `${task.id} source fingerprint does not match canonical source custody`,
  );
  return identities;
}

function isCanonicalDoctorTask(task) {
  const franchiseMatches = canonicalNormalize(task.franchise) === DOCTOR_FRANCHISE;
  const scopeMatches = task.scope === SCOPE_ID;
  assert(
    scopeMatches === franchiseMatches,
    `${task.id} Doctor Who scope/franchise membership disagrees`,
  );
  return franchiseMatches;
}

const CANONICAL_REOPEN_REASONS = new Set([
  "coverage_returned",
  "retry_due",
  "source_changed",
  "source_identity_cleared",
]);
const RETIREMENT_RELEASE_REASONS = new Set(["coverage_returned", "source_changed"]);

function doctorTaskLifecycle(journal) {
  const byTask = new Map();
  for (const row of journal || []) {
    if (!["task.retired", "task.reopened"].includes(row?.op)) continue;
    if (row.scope !== SCOPE_ID) continue;
    assert(String(row.task_id || "").trim(), `${row.op} Doctor Who lifecycle event lacks task identity`);
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, []);
    byTask.get(row.task_id).push(row);
  }
  return byTask;
}

function validateDoctorLifecycleIdentity(row, task) {
  assert(task.scope === row.scope, `${task.id} ${row.op} scope disagrees with its durable job`);
  assert(
    canonicalNormalize(task.performer) === canonicalNormalize(row.performer),
    `${task.id} ${row.op} performer disagrees with its durable job`,
  );
  assert(
    canonicalNormalize(task.character) === canonicalNormalize(row.character),
    `${task.id} ${row.op} role disagrees with its durable job`,
  );
}

function validateDoctorTaskLifecycle(rows, expectedSet, actualById) {
  assert(Array.isArray(rows) && rows.length > 0, "Doctor Who lifecycle replay received no rows");
  const taskId = rows[0].task_id;
  const task = actualById.get(taskId);
  assert(task, `${taskId} Doctor Who lifecycle lacks a durable Autopilot job`);
  let previous = null;
  let activeRetirement = null;

  for (const row of rows) {
    assert(row.task_id === taskId, `${taskId} lifecycle replay crossed task identity`);
    const at = Date.parse(row.at || "");
    assert(Number.isFinite(at), `${taskId} ${row.op} has an invalid timestamp`);
    if (previous) {
      const previousAt = Date.parse(previous.at || "");
      assert(at > previousAt, `${taskId} lifecycle timestamps must increase in append order`);
    }
    validateDoctorLifecycleIdentity(row, task);

    if (row.op === "task.retired") {
      activeRetirement = row;
    } else {
      assert(
        CANONICAL_REOPEN_REASONS.has(row.reason),
        `${taskId} Doctor Who reopen has unsupported reason ${row.reason || "<missing>"}`,
      );
      if (activeRetirement) {
        assert(
          RETIREMENT_RELEASE_REASONS.has(row.reason),
          `${taskId} reopen reason ${row.reason} cannot release a retirement`,
        );
        activeRetirement = null;
      }
    }
    previous = row;
  }

  const latest = rows.at(-1);
  if (latest.op === "task.reopened") {
    assert(expectedSet.has(taskId), `${taskId} latest Doctor Who reopen lacks current canonical coverage`);
    assert(task.status !== "retired", `${taskId} latest Doctor Who reopen still points to a retired task`);
    assert(
      task.outcome?.kind !== "not-in-latest-coverage",
      `${taskId} latest Doctor Who reopen retained the retirement outcome`,
    );
    assert(
      task.outcome?.retired_at === undefined,
      `${taskId} latest Doctor Who reopen retained retired_at custody`,
    );
  }
  return { latest, activeRetirement };
}

function validateCanonicalDoctorTaskSet(jobs, coverage, scopesDoc, manifest, journal = []) {
  const expectedTasks = collapseCoverage(coverage, scopesDoc, manifest).filter(isCanonicalDoctorTask);
  assert(expectedTasks.length > 0, "canonical Doctor Who task denominator is empty");
  const expectedIds = expectedTasks.map((task) => task.id).sort();
  const expectedSet = new Set(expectedIds);
  const actualTasks = (jobs || []).filter(isCanonicalDoctorTask);
  const actualById = new Map(actualTasks.map((task) => [task.id, task]));
  const currentTasks = actualTasks.filter((task) => task.status !== "retired");
  const retainedRetiredTasks = actualTasks.filter((task) => task.status === "retired");
  const currentIds = currentTasks.map((task) => task.id).sort();
  const currentSet = new Set(currentIds);
  const missing = expectedIds.filter((id) => !currentSet.has(id));
  const extra = currentIds.filter((id) => !expectedSet.has(id));
  const coveredRetiredIds = retainedRetiredTasks
    .filter((task) => expectedSet.has(task.id))
    .map((task) => task.id)
    .sort();
  assert(
    coveredRetiredIds.length === 0,
    `retired Doctor Who tasks remain in current canonical coverage: ${coveredRetiredIds.join(",")}`,
  );
  assert(
    sameSet(currentIds, expectedIds),
    `current non-retired Doctor Who task denominator disagrees with canonical census coverage; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}`,
  );

  const lifecycleByTask = doctorTaskLifecycle(journal);
  const latestReopens = [];
  const unreopenedRetirements = [];
  for (const rows of lifecycleByTask.values()) {
    const lifecycle = validateDoctorTaskLifecycle(rows, expectedSet, actualById);
    if (lifecycle.latest.op === "task.reopened") latestReopens.push(lifecycle.latest);
    if (lifecycle.activeRetirement) unreopenedRetirements.push(lifecycle.activeRetirement);
  }

  const unreopenedById = new Map(unreopenedRetirements.map((row) => [row.task_id, row]));
  for (const retirement of unreopenedRetirements) {
    assert(
      !expectedSet.has(retirement.task_id),
      `${retirement.task_id} has an unreopened retirement but remains in current canonical coverage`,
    );
    const task = actualById.get(retirement.task_id);
    assert(
      task,
      `${retirement.task_id} has an unreopened Doctor Who retirement but is missing from durable Autopilot state`,
    );
    assert(task.status === "retired", `${task.id} unreopened retirement is not retained as retired`);
    assert(task.outcome?.kind === "not-in-latest-coverage", `${task.id} retained retirement lacks the canonical sync outcome`);
    assert(task.outcome?.retired_at === retirement.at, `${task.id} retained retirement timestamp disagrees with its latest journal lifecycle`);
    assert(!task.lease, `${task.id} retained retirement still carries a lease`);
  }
  for (const task of retainedRetiredTasks) {
    assert(
      unreopenedById.has(task.id),
      `${task.id} retained retirement is not backed by the latest unreopened journal lifecycle`,
    );
  }
  return { expectedTasks, currentTasks, retainedRetiredTasks, latestReopens, unreopenedRetirements };
}

function validateLiveDoctorSourceCustody(jobs) {
  const tasks = (jobs || []).filter((task) =>
    isCanonicalDoctorTask(task) && !["rejected", "retired"].includes(task.status)
  );
  assert(tasks.length > 0, "live Doctor Who source-custody denominator is empty");
  const identitiesByTask = new Map();
  for (const task of tasks) {
    assert(!identitiesByTask.has(task.id), `duplicate live Doctor Who task id ${task.id}`);
    identitiesByTask.set(task.id, sourceReceiptIdentities(task));
  }
  return { tasks, identitiesByTask };
}

function validateHistoricalDoctorLeaseJournal(journal, config, state) {
  const groups = canonicalLeaseGroups(journal, "doctor-who");
  assert(groups.length === 1, `historical Doctor Who journal contains ${groups.length} lease groups`);
  const group = groups[0];
  assert(group.lease_id === LEASE_ID, "historical Doctor Who journal lease identity drifted");
  assert(sameSet(group.task_ids || [], [COMMANDER_TASK_ID]), "historical Doctor Who journal task set drifted");
  const unreceipted = unreceiptedJournalLeaseGroups(config, state, journal)
    .filter((entry) => entry.scope_id === "doctor-who");
  assert(unreceipted.length === 0, "historical Doctor Who journal contains an unreceipted lease group");
  return { groups, unreceipted };
}

function validateDoctorScopeCustody(scope, certification, snapshotsDoc) {
  assert(scope && ["active", "paused", "retired"].includes(scope.status), "Doctor Who scope registry entry is missing or invalid");
  if (scope.status === "retired") return { status: "retired", certification: certification || null };
  if (certification) {
    assert(isSha256(certification.producer_sha256) && isSha256(certification.contract_sha256), "Doctor Who certification hashes are invalid");
    const snapshot = certification.snapshot || {};
    assert(isPositiveInteger(snapshot.rows) && isPositiveInteger(snapshot.sources), "Doctor Who certification denominator is invalid");
    assert(snapshot.complete_receipts === snapshot.sources, "Doctor Who current source receipts are incomplete");
    assert(typeof snapshot.source_snapshot_id === "string" && snapshot.source_snapshot_id.length > 0, "Doctor Who source snapshot id is missing");
    assert(isSha256(snapshot.manifest_sha256) && isSha256(snapshot.source_archive_sha256), "Doctor Who certification snapshot hashes are invalid");
    const preserved = (snapshotsDoc.snapshots || []).find((entry) => entry.id === snapshot.source_snapshot_id);
    assert(preserved, "Doctor Who current preservation snapshot is missing");
    const preservedScope = preserved.scopes?.["doctor-who"];
    assert(preservedScope?.manifest_sha256 === snapshot.manifest_sha256, "Doctor Who certification/preservation manifest custody drifted");
    assert(preservedScope?.complete_receipts === preservedScope?.coverage_sources, "Doctor Who current preservation receipts are incomplete");
    const sourceBag = (preserved.public_release?.assets || []).find((asset) => asset.kind === "source-bag");
    assert(sourceBag?.sha256 === snapshot.source_archive_sha256, "Doctor Who certification/preservation source bag custody drifted");
  } else {
    assert(scope.status === "paused", "active Doctor Who scope lacks reviewed certification");
  }
  if (scope.status === "active") assert(certification, "active Doctor Who scope lacks reviewed certification");
  return { status: scope.status, certification: certification || null };
}

function validateCurrentPilotReceipt(pilot) {
  assert(pilot.task?.id === COMMANDER_TASK_ID && pilot.lease?.id === LEASE_ID, "pilot task or lease identity drifted");
  assert(pilot.task?.source_content_sha256 === COMMANDER_SOURCE.content_sha256, "pilot historical source identity drifted");
  assert(pilot.canonical?.wall_id === WALL_ID, "pilot canonical wall binding drifted");
  assert(pilot.reviewed_cycle?.id === CYCLE_ID, "pilot reviewed-cycle identity drifted");
  assert(pilot.media?.still === null && pilot.media?.portrait === null, "pilot receipt lost its historical media absences");
  assert(pilot.media?.binding_version === 2 && pilot.media?.binding_scope === PILOT_MEDIA_BINDING_SCOPE, "pilot scope-bound media binding drifted");
  assert(sameSet(pilot.media?.pilot_item_ids || [], PILOT_MEDIA_ITEM_IDS), "pilot historical media item identities drifted");
  assert(pilot.media?.pilot_facets_sha256 === PILOT_MEDIA_FACETS_SHA256, "pilot historical media facet receipt drifted");
  assert(pilot.media?.historical_global_audit_snapshot_sha256 === HISTORICAL_GLOBAL_MEDIA_SHA256, "pilot historical global-media custody drifted");
  assert(!Object.hasOwn(pilot.media || {}, "media_audit_sha256"), "deprecated mutable global media binding returned");
  const decoupling = pilot.evidence_correction?.mutable_audit_decoupling;
  assert(decoupling?.previous_global_audit_sha256 === HISTORICAL_GLOBAL_MEDIA_SHA256, "pilot media decoupling lost historical custody");
  assert(decoupling?.corrected_binding_scope === PILOT_MEDIA_BINDING_SCOPE, "pilot media decoupling scope drifted");
  assert(sameSet(decoupling?.corrected_item_ids || [], PILOT_MEDIA_ITEM_IDS), "pilot media decoupling item identities drifted");
  assert(decoupling?.corrected_pilot_facets_sha256 === PILOT_MEDIA_FACETS_SHA256, "pilot media decoupling digest drifted");
  assert(isSha256(pilot.receipt_sha256), "live pilot receipt declared identity is invalid");
  assert(receiptHash(pilot) === pilot.receipt_sha256, "live pilot receipt content identity drifted");
  assert(pilot.boundary?.second_lease_issued === false, "pilot receipt now claims a second lease");
  assert(pilot.boundary?.roadmap_completion_claimed === false, "pilot receipt acquired roadmap completion authority");
}

function validateRoadmapCompletion(roadmap, roadmapState) {
  validateRoadmapState(roadmap, roadmapState);
  const milestone = (roadmap.milestones || []).find((entry) => entry.id === MILESTONE_ID);
  assert(milestone, "adapter SDK milestone definition is missing");
  assert(milestone.seq === 3 && milestone.authority === "second-desk", "adapter SDK milestone authority drifted");
  assert(sameSet(milestone.deps || [], ["star-trek-gold-shard", "operational-reliability"]), "adapter SDK milestone dependencies drifted");

  const receipts = (roadmapState.completed || []).filter((entry) => entry.milestone === MILESTONE_ID);
  assert(receipts.length <= 1, "adapter SDK milestone has duplicate completion receipts");
  if (!receipts.length) return { completed: false, receipt: null };

  const completion = receipts[0];
  assert(Date.parse(completion.completed_at || "") > Date.parse(DRILL_AT), "adapter SDK milestone completion is not a later transaction");
  return { completed: true, receipt: completion };
}

function roadmapFixtureState(reviewedRole, evidence) {
  const state = structuredClone(roadmapState);
  const existing = (state.completed || []).findIndex((entry) => entry.milestone === MILESTONE_ID);
  const prior = existing >= 0 ? state.completed[existing] : null;
  const completion = {
    milestone: MILESTONE_ID,
    completed_at: prior?.completed_at || "2099-01-01T00:00:00.000Z",
    reviewed_by: reviewedRole,
    reviewed_role: reviewedRole,
    evidence,
  };
  if (existing >= 0) state.completed[existing] = completion;
  else state.completed.push(completion);
  return state;
}

function cycleReceiptKey(scopeId, leaseId) { return `${scopeId}\u0000${leaseId}`; }

function unreceiptedJournalLeaseGroups(config, state, journal) {
  const receipted = new Set((state.cycles || []).map((cycle) => cycleReceiptKey(cycle.scope_id, cycle.lease_id)));
  return (config.scopes || []).flatMap((scope) => canonicalLeaseGroups(journal, scope.id))
    .filter((group) => !receipted.has(cycleReceiptKey(group.scope_id, group.lease_id)));
}

function validateActiveLeaseIsolation(jobs, unreceiptedGroups, { doctorWhoAllowed }) {
  const active = (jobs || []).filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  const leaseGroups = new Map();
  const addGroup = (scope, leaseId, members, source) => {
    assert(String(scope || "").trim() && String(leaseId || "").trim(), `${source} lease group lacks scope or lease identity`);
    if (!doctorWhoAllowed) assert(scope !== "doctor-who", `Doctor Who acquired ${source} work before milestone completion: ${leaseId}`);
    const key = `${scope}|${leaseId}`;
    if (!leaseGroups.has(key)) leaseGroups.set(key, []);
    leaseGroups.get(key).push(...members);
  };
  for (const job of active) {
    const leaseId = String(job.lease?.id || "").trim();
    assert(leaseId, `active job ${job.scope}:${job.id} lacks lease identity`);
    addGroup(job.scope, leaseId, [job.id], "active");
  }
  for (const group of unreceiptedGroups || []) {
    addGroup(group.scope_id, group.lease_id, (group.task_ids || []).map((id) => `journal:${id}`), "unreceipted journal");
  }
  assert(leaseGroups.size <= 1, `global one-cycle boundary has multiple active or unreceipted lease groups: ${[...leaseGroups.keys()].join(", ")}`);
  return { active, unreceiptedGroups: unreceiptedGroups || [], leaseGroups };
}

function validateOpenCycles(cycles, activeLeaseState, { doctorWhoAllowed }) {
  const open = (cycles || []).filter((cycle) => !cycle.closed_at || !cycle.reviewed_at);
  const groups = new Map();
  for (const cycle of open) {
    const scope = cycle.scope_id || cycle.scope;
    const leaseId = cycle.lease_id || cycle.lease?.id || "";
    if (!doctorWhoAllowed) {
      assert(scope !== "doctor-who", `Doctor Who acquired an open cycle before milestone completion: ${cycle.id}`);
    }
    const key = `${scope || "<missing>"}|${leaseId || "<missing>"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cycle.id);
  }
  assert(groups.size <= 1, `global one-cycle boundary has multiple open cycle groups: ${[...groups.keys()].join(", ")}`);
  if (groups.size === 1 && activeLeaseState.leaseGroups.size === 1) {
    const [cycleGroup] = groups.keys();
    const [leaseGroup] = activeLeaseState.leaseGroups.keys();
    assert(cycleGroup === leaseGroup, `active lease group ${leaseGroup} disagrees with open cycle group ${cycleGroup}`);
  }
  return { open, groups };
}

const ledgerBytes = readBytes(PATHS.ledger);
const receiptBytes = readBytes(PATHS.receipt);
const pilotBytes = readBytes(PATHS.pilot);
const productionBytes = readBytes(PATHS.production);
const ledger = JSON.parse(ledgerBytes);
const receipt = JSON.parse(receiptBytes);
const scopeRepair = read(PATHS.scopeRepair);
const pilot = JSON.parse(pilotBytes);
const production = JSON.parse(productionBytes);
const correctionBaseline = read(PATHS.correctionBaseline);
const specimens = read(PATHS.specimens);
const sources = read(PATHS.sources);
const audit = read(PATHS.audit);
const coverage = read(PATHS.coverage);
const manifest = read(PATHS.manifest);
const autopilot = read(PATHS.autopilot);
validateState(autopilot);
const autopilotJournal = parseJsonl(fs.readFileSync(PATHS.autopilotJournal, "utf8"));
const certifications = read(PATHS.certifications);
const scopes = read(PATHS.scopes);
const snapshots = read(PATHS.snapshots);
const waterline = read(PATHS.waterline);
const waterlineState = read(PATHS.waterlineState);
const roadmap = read(PATHS.roadmap);
const roadmapState = read(PATHS.roadmapState);

// Immutable controlled exercise.
const ledgerErrors = validateCorrectionLedger(ledger, { expectedCaseType: "exercise" });
assert(ledgerErrors.length === 0, `Doctor Who correction drill violates the generic correction contract:\n${ledgerErrors.join("\n")}`);
assert(ledger.cases.length === 1, "Doctor Who correction drill denominator must be exactly one case");
assert(sha(ledgerBytes) === DRILL_LEDGER_SHA256, "Doctor Who correction drill ledger bytes drifted");
const row = ledger.cases[0];
assert(row.id === CASE_ID, "Doctor Who correction drill case id drifted");
assert(row.status === "rejected" && row.disposition?.outcome === "rejected", "adverse Doctor Who correction was not rejected");
assert(row.target?.record_id === "EXERCISE-UC-1345", "controlled target id drifted");
assert(row.target?.target_head === BASE_SHA, "controlled target head drifted");
assert(row.target?.field_path === "character+media", "controlled target field drifted");
assert(row.target?.current_value_sha256 === IDENTITY_SHA256, "controlled target value hash drifted");
assert(row.disposition?.canonical_mutation === false && row.disposition?.history_public === true, "controlled disposition boundary drifted");
const eventChain = ["intake", "triaged", "evidence-reviewed", "dispositioned", "history-published"];
assert(JSON.stringify(row.events.map((event) => event.kind)) === JSON.stringify(eventChain), "Doctor Who correction drill event chain drifted");
const intakeActor = row.events.find((event) => event.kind === "intake")?.actor;
const reviewerActor = row.events.find((event) => event.kind === "evidence-reviewed")?.actor;
const deciderActor = row.events.find((event) => event.kind === "dispositioned")?.actor;
assert(intakeActor && reviewerActor && deciderActor && intakeActor !== reviewerActor && intakeActor !== deciderActor, "Doctor Who correction drill lost independent review or disposition");
const ledgerText = JSON.stringify(row);
for (const token of [
  "Commander Slite",
  "generic Sontaran",
  COMMANDER_TASK_ID,
  SLITE_TASK_ID,
  COMMANDER_SOURCE.content_sha256,
  SLITE_SOURCE.content_sha256,
  HISTORICAL_CERTIFICATION.source_snapshot_id,
  HISTORICAL_CERTIFICATION.source_archive_sha256,
]) {
  assert(ledgerText.includes(token), `Doctor Who correction drill lacks historical evidence token ${token}`);
}

// Corrected drill receipt and exact historical object recovery.
assert(receipt.version === 2 && receipt.transaction === "DOCTOR-WHO-CORRECTION-DRILL-001", "Doctor Who drill receipt envelope drifted");
assert(receipt.receipt_sha256 === RECEIPT_SHA256, "Doctor Who drill receipt declared hash drifted");
assert(receiptHash(receipt) === RECEIPT_SHA256, "Doctor Who drill receipt content hash drifted");
assert(receipt.generated_at === DRILL_AT && receipt.base_sha === BASE_SHA, "Doctor Who drill historical boundary drifted");
assert(receipt.target?.wall_id === WALL_ID && receipt.target?.identity_sha256 === IDENTITY_SHA256, "Doctor Who drill target receipt drifted");
assert(receipt.inputs?.drill_ledger?.sha256 === DRILL_LEDGER_SHA256, "Doctor Who drill receipt lost ledger custody");
assert(receipt.inputs?.historical_pilot_receipt?.receipt_sha256 === HISTORICAL_PILOT_RECEIPT_SHA256, "Doctor Who drill receipt lost historical pilot custody");
assert(receipt.inputs?.historical_pilot_receipt?.git_object === HISTORICAL_GIT_OBJECTS[PATHS.pilot], "Doctor Who drill receipt lost historical pilot Git-object custody");
assert(receipt.inputs?.historical_production_corrections?.sha256 === HISTORICAL_INPUT_SHA256.production, "historical production-ledger custody drifted");
assert(receipt.inputs?.historical_canonical_specimens?.sha256 === HISTORICAL_INPUT_SHA256.specimens, "historical specimen custody drifted");
assert(receipt.inputs?.historical_canonical_sources?.sha256 === HISTORICAL_INPUT_SHA256.sources, "historical source custody drifted");
assert(receipt.inputs?.historical_media_audit?.sha256 === HISTORICAL_INPUT_SHA256.audit, "historical media custody drifted");
assert(receipt.inputs?.scope_custody_repair?.path === PATHS.scopeRepair, "Doctor Who drill receipt lost scope-repair path custody");
assert(receipt.inputs?.scope_custody_repair?.receipt_sha256 === SCOPE_REPAIR_RECEIPT_SHA256, "Doctor Who drill receipt lost scope-repair identity");
assert(receipt.inputs?.scope_custody_repair?.code_commit === SCOPE_REPAIR_CODE_COMMIT, "Doctor Who drill receipt lost scope-repair code commit");
assert(receipt.inputs?.scope_custody_repair?.code_path === PATHS.checker, "Doctor Who drill receipt lost scope-repair code path");
assert(receipt.inputs?.scope_custody_repair?.code_git_object === SCOPE_REPAIR_CODE_GIT_OBJECT, "Doctor Who drill receipt lost scope-repair code object");
assert(receipt.inputs?.scope_custody_repair?.code_sha256 === SCOPE_REPAIR_CODE_SHA256, "Doctor Who drill receipt lost scope-repair code digest");
const historical = receipt.historical_state || {};
assert(historical.captured_at === DRILL_AT && historical.base_commit === BASE_SHA, "historical snapshot envelope drifted");
assertHistoricalGitObjects(historical.git_objects);

// Recompute the historical claims from the exact base bytes, not from prose.
const historicalAutopilot = historicalJson(PATHS.autopilot);
const historicalAutopilotJournal = parseJsonl(historicalBytes(PATHS.autopilotJournal).toString("utf8"));
const historicalCertifications = historicalJson(PATHS.certifications);
const historicalScopes = historicalJson(PATHS.scopes);
const historicalWaterline = historicalJson(PATHS.waterline);
const historicalWaterlineState = historicalJson(PATHS.waterlineState);
const historicalSpecimens = historicalJson(PATHS.specimens);
const historicalSources = historicalJson(PATHS.sources);
const historicalAudit = historicalJson(PATHS.audit);
const historicalCorrections = historicalJson(PATHS.production);
const historicalRoadmap = historicalJson(PATHS.roadmap);
const historicalRoadmapState = historicalJson(PATHS.roadmapState);
const historicalSnapshots = historicalJson(PATHS.snapshots);
const historicalPilot = historicalJson(PATHS.pilot);

assert(receiptHash(historicalPilot) === HISTORICAL_PILOT_RECEIPT_SHA256, "historical pilot receipt bytes do not match the drill receipt identity");
assert(historicalPilot.receipt_sha256 === HISTORICAL_PILOT_RECEIPT_SHA256, "historical pilot declared identity drifted");
const historicalDoctorJobs = (historicalAutopilot.jobs || []).filter((job) => job.scope === "doctor-who");
const historicalCommander = historicalDoctorJobs.find((job) => job.id === COMMANDER_TASK_ID);
const historicalSlite = historicalDoctorJobs.find((job) => job.id === SLITE_TASK_ID);
assertExactObject(historical.source_custody?.commander, {
  task_id: COMMANDER_TASK_ID,
  ...COMMANDER_SOURCE,
  status: "resolved",
}, "historical Commander receipt");
assertExactObject(historical.source_custody?.slite, {
  task_id: SLITE_TASK_ID,
  ...SLITE_SOURCE,
  status: "queued",
}, "historical Slite receipt");
assert(historicalCommander?.status === "resolved" && sameSet(historicalCommander.wall_ids || [], [WALL_ID]), "historical Commander Autopilot custody drifted");
assert(historicalCommander?.source_fingerprint === COMMANDER_SOURCE.source_fingerprint, "historical Commander fingerprint drifted");
assert((historicalCommander.source_receipts || []).some((entry) =>
  entry.source === COMMANDER_SOURCE.source &&
  entry.pageid === COMMANDER_SOURCE.pageid &&
  entry.revision === COMMANDER_SOURCE.revision &&
  entry.content_sha256 === COMMANDER_SOURCE.content_sha256
), "historical Commander exact source receipt is missing");
assert(historicalSlite?.status === "queued" && !(historicalSlite.wall_ids || []).length, "historical Slite Autopilot custody drifted");
assert(historicalSlite?.source_fingerprint === SLITE_SOURCE.source_fingerprint, "historical Slite fingerprint drifted");
assert((historicalSlite.source_receipts || []).some((entry) =>
  entry.source === SLITE_SOURCE.source &&
  entry.pageid === SLITE_SOURCE.pageid &&
  entry.revision === SLITE_SOURCE.revision &&
  entry.content_sha256 === SLITE_SOURCE.content_sha256
), "historical Slite exact source receipt is missing");
const historicalQueued = historicalDoctorJobs.filter((job) => job.status === "queued").length;
const historicalResolved = historicalDoctorJobs.filter((job) => job.status === "resolved").length;
const historicalDoctorInFlight = historicalDoctorJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
const historicalGlobalInFlight = (historicalAutopilot.jobs || []).filter((job) => ACTIVE_JOB_STATUSES.has(job.status)).length;
assertExactObject(historical.autopilot, {
  doctor_who_total: historicalDoctorJobs.length,
  doctor_who_queued: historicalQueued,
  doctor_who_resolved: historicalResolved,
  doctor_who_in_flight: historicalDoctorInFlight,
  global_in_flight: historicalGlobalInFlight,
}, "historical Autopilot snapshot");
assert(historicalDoctorJobs.length === 316 && historicalQueued === 315 && historicalResolved === 1 && historicalDoctorInFlight === 0 && historicalGlobalInFlight === 0, "historical queue denominator drifted");

const historicalScope = (historicalScopes.scopes || []).find((entry) => entry.id === "doctor-who");
assert(historicalScope?.status === "active", "Doctor Who was not active at the drill boundary");
const historicalCertification = (historicalCertifications.certifications || []).find((entry) => entry.scope_id === "doctor-who");
assert(historicalCertification, "historical Doctor Who certification is missing");
assertExactObject(historical.source_custody?.certification, {
  scope_id: "doctor-who",
  ...HISTORICAL_CERTIFICATION,
}, "historical Doctor Who certification receipt");
assertExactObject(historicalCertification.snapshot, HISTORICAL_CERTIFICATION, "historical Doctor Who certification state");
const historicalPreservation = (historicalSnapshots.snapshots || []).find((entry) => entry.id === HISTORICAL_CERTIFICATION.source_snapshot_id);
assert(historicalPreservation, "historical Doctor Who preservation snapshot is missing");
const historicalPreservedScope = historicalPreservation.scopes?.["doctor-who"];
assert(historicalPreservedScope?.manifest_sha256 === HISTORICAL_CERTIFICATION.manifest_sha256, "historical certification/preservation manifest custody drifted");
assert(historicalPreservedScope?.coverage_sources === HISTORICAL_CERTIFICATION.sources, "historical preservation source denominator drifted");
assert(historicalPreservedScope?.complete_receipts === HISTORICAL_CERTIFICATION.complete_receipts, "historical preservation receipt denominator drifted");
const historicalSourceBag = (historicalPreservation.public_release?.assets || []).find((asset) => asset.kind === "source-bag");
assert(historicalSourceBag?.sha256 === HISTORICAL_CERTIFICATION.source_archive_sha256, "historical source archive custody drifted");

assert(historicalWaterline.operations?.one_cycle_at_a_time === true, "historical one-cycle policy drifted");
const historicalDoctorLeaseState = validateHistoricalDoctorLeaseJournal(
  historicalAutopilotJournal,
  historicalWaterline,
  historicalWaterlineState,
);
const historicalPilotCycles = (historicalWaterlineState.cycles || []).filter((cycle) => cycle.scope_id === "doctor-who" && cycle.lease_id === LEASE_ID);
assert(historicalPilotCycles.length === 1 && historicalPilotCycles[0].id === CYCLE_ID, "historical pilot cycle identity drifted");
assert(historicalPilotCycles[0].closed_at && historicalPilotCycles[0].reviewed_at, "historical pilot cycle was not closed and reviewed");
const historicalOpenCycles = (historicalWaterlineState.cycles || []).filter((cycle) => !cycle.closed_at || !cycle.reviewed_at);
assertExactObject(historical.waterline, {
  one_cycle_at_a_time: true,
  open_or_unreviewed_cycles: historicalOpenCycles.length,
  reviewed_cycle_id: CYCLE_ID,
  reviewed_lease_id: LEASE_ID,
  historical_doctor_lease_groups: historicalDoctorLeaseState.groups.length,
  historical_doctor_unreceipted_lease_groups: historicalDoctorLeaseState.unreceipted.length,
}, "historical waterline snapshot");
assert(historicalOpenCycles.length === 0, "historical open-cycle denominator drifted");
assert(receipt.result?.second_lease_issued_at_drill === (historicalDoctorLeaseState.groups.length > 1), "historical second-lease result is not journal-derived");

const historicalWall = (historicalSpecimens || []).find((entry) => entry.id === WALL_ID);
assert(historicalWall?.actor === "Dan Starkey" && historicalWall?.character === "Commander (The Sontarans)" && historicalWall?.universe === "Doctor Who", "historical canonical identity drifted");
const historicalSource = (historicalSources || []).find((entry) => entry.id === WALL_ID);
assert(historicalSource && historicalSource.still === null && historicalSource.portrait === null, "historical canonical media absence drifted");
const historicalPilotItems = (historicalAudit.items || []).filter((entry) => entry.wall_id === WALL_ID);
assert(historicalPilotItems.length === 2 && historicalPilotItems.every((entry) => entry.status === "absent"), "historical media-audit absence drifted");
assert((historicalCorrections.cases || []).length === 0, "historical production correction denominator drifted");
assert(historical.production_corrections?.admitted_real_cases_at_drill === 0 && historical.production_corrections?.exercise_case_published_only === true, "historical correction receipt drifted");
const historicalMilestone = (historicalRoadmap.milestones || []).find((entry) => entry.id === MILESTONE_ID);
assert(historicalMilestone?.authority === "second-desk", "historical roadmap authority drifted");
assert(!(historicalRoadmapState.completed || []).some((entry) => entry.milestone === MILESTONE_ID), "historical roadmap completion drifted");
assert(historical.roadmap?.milestone === MILESTONE_ID && historical.roadmap?.completed_at_drill === false, "historical roadmap receipt drifted");

assert(receipt.result?.status === "rejected" && receipt.result?.outcome === "rejected", "Doctor Who drill result drifted");
assert(JSON.stringify(receipt.result?.event_chain) === JSON.stringify(eventChain), "Doctor Who drill result event chain drifted");
for (const flag of [
  "canonical_mutation",
  "production_case_created",
  "public_demand_counted",
  "commander_slite_conflation_adopted",
  "generic_sontaran_image_used",
  "performer_portrait_substituted_for_character",
  "second_lease_issued_at_drill",
  "roadmap_completion_claimed_at_drill",
]) {
  assert(receipt.result?.[flag] === false, `Doctor Who drill historical boundary drifted at ${flag}`);
}
assert(receipt.result?.independent_review === true && receipt.result?.public_history === true, "Doctor Who drill review/history receipt drifted");

// Scope-repair receipt remains immutable evidence, not a live checker pin.
assert(scopeRepair.version === 1 && scopeRepair.transaction === "DOCTOR-WHO-CORRECTION-DRILL-SCOPE-CUSTODY-001", "scope-custody receipt identity drifted");
assert(scopeRepair.receipt_sha256 === SCOPE_REPAIR_RECEIPT_SHA256, "scope-custody receipt declared hash drifted");
assert(receiptHash(scopeRepair) === SCOPE_REPAIR_RECEIPT_SHA256, "scope-custody receipt content hash drifted");
assert(scopeRepair.code?.path === PATHS.checker, "scope-custody receipt code path drifted");
assert(scopeRepair.code?.sha256 === SCOPE_REPAIR_CODE_SHA256, "scope-custody historical code identity drifted");
assert(exactBlobAtCommitPath(SCOPE_REPAIR_CODE_COMMIT, PATHS.checker, "scope-custody repair") === SCOPE_REPAIR_CODE_GIT_OBJECT, "scope-custody repair code object is not bound to its exact commit/path");
assert(sha(exactBytesAtCommitPath(SCOPE_REPAIR_CODE_COMMIT, PATHS.checker, "scope-custody repair")) === SCOPE_REPAIR_CODE_SHA256, "scope-custody repair code bytes do not match the receipt digest");
for (const flag of [
  "historical_drill_receipt_immutable",
  "current_pilot_self_hash_required",
  "exact_pilot_facets_required",
  "current_doctor_who_zero_in_flight_required",
  "unrelated_single_cycle_allowed",
  "multiple_active_cycles_refused",
  "Doctor_Who_active_cycle_refused",
  "adversarial_self_proof_embedded",
]) {
  assert(scopeRepair.repair?.[flag] === true, `scope-custody repair drifted at ${flag}`);
}
assert(scopeRepair.boundary && Object.values(scopeRepair.boundary).every((value) => value === false), "scope-custody repair acquired mutation authority");
assert(receipt.repairs?.scope_custody?.historical_receipt_is_not_a_live_code_pin === true, "scope-custody receipt became a live code pin");
assert(receipt.repairs?.historical_git_object_custody?.review_thread === "PRRT_kwDOTQMkzs6V7QkM", "historical-object review custody drifted");
assert(receipt.repairs?.historical_git_object_custody?.method.includes("<base_commit>:<path>"), "historical-object resolution method drifted");
assert(receipt.repairs?.roadmap_authority?.review_thread === "PRRT_kwDOTQMkzs6V8ht_", "roadmap-authority review custody drifted");
assert(sameSet(receipt.repairs?.roadmap_authority?.accepted_completion_roles || [], ["second-desk", "owner"]), "roadmap-authority completion roles drifted");
assert(receipt.repairs?.journal_lease_custody?.review_thread === "PRRT_kwDOTQMkzs6V8tIT", "journal-lease review custody drifted");
assert(receipt.repairs?.scope_repair_code_custody?.review_thread === "PRRT_kwDOTQMkzs6V8tIV", "scope-repair code review custody drifted");
assert(receipt.repairs?.roadmap_evidence_contract?.review_thread === "PRRT_kwDOTQMkzs6V8tIX", "roadmap-evidence review custody drifted");
assert(receipt.repairs?.historical_journal_lease_custody?.review_thread === "PRRT_kwDOTQMkzs6WB-Jl", "historical journal review custody drifted");
assert(receipt.repairs?.scope_retirement?.review_thread === "PRRT_kwDOTQMkzs6WB-Jq", "scope-retirement review custody drifted");
assert(sameSet(receipt.repairs?.scope_retirement?.accepted_statuses || [], ["active", "paused", "retired"]), "scope-retirement status lattice drifted");
assert(receipt.repairs?.composite_pilot_future_safety?.review_thread === "PRRT_kwDOTQMkzs6WCqoa", "composite-pilot review custody drifted");
assert(receipt.repairs?.composite_pilot_future_safety?.historical_state_commit === "04551b140022c7b733b0290e10c7e40905aabc76", "composite-pilot historical commit drifted");
assert(receipt.repairs?.composite_pilot_future_safety?.live_state_pins_removed === true, "composite-pilot live pins returned");
assert(receipt.repairs?.composite_scope_retirement?.review_thread === "PRRT_kwDOTQMkzs6WCqo3", "composite-retirement review custody drifted");
assert(receipt.repairs?.composite_scope_retirement?.current_certificate_required === false, "retired scope reacquired certification requirement");
assert(receipt.repairs?.composite_activation_future_safety?.review_thread === "PRRT_kwDOTQMkzs6WE1h8", "composite-activation review custody drifted");
assert(receipt.repairs?.composite_activation_future_safety?.activation_state_commit === "79362e21d9d526f1310467574e69fe909eb80adb", "activation-state historical commit drifted");
assert(receipt.repairs?.composite_activation_future_safety?.activation_state_git_object === "178e51eecfddf759b97fcaf29741df7736e68a70", "activation-state historical object drifted");
assert(receipt.repairs?.composite_activation_future_safety?.reviewed_code_commit === "9e5f39d22df254136fdc4a7b34d93ebd17bf1172", "activation reviewed-code commit drifted");
assert(receipt.repairs?.composite_activation_future_safety?.live_source_fingerprint_refresh_allowed === true, "activation live fingerprint pin returned");
assert(receipt.repairs?.composite_activation_future_safety?.live_source_url_refresh_allowed === true, "activation live source URL pin returned");
assert(receipt.repairs?.canonical_source_refresh_custody?.review_thread === "PRRT_kwDOTQMkzs6WFaGD", "canonical source-refresh review custody drifted");
assert(receipt.repairs?.canonical_source_refresh_custody?.current_source_urls_equal_receipted_urls === true, "source URL/receipt binding was disabled");
assert(receipt.repairs?.canonical_source_refresh_custody?.current_fingerprint_recomputed === true, "canonical source fingerprint recomputation was disabled");
assert(receipt.repairs?.canonical_source_refresh_custody?.stale_receipt_fixture_fails_closed === true, "stale source-receipt refusal disappeared");
assert(receipt.repairs?.canonical_source_refresh_custody?.forged_fingerprint_fixture_fails_closed === true, "forged source-fingerprint refusal disappeared");
assert(receipt.repairs?.estate_wide_source_custody?.review_thread === "PRRT_kwDOTQMkzs6WFnp9", "estate-wide source-custody review binding drifted");
assert(receipt.repairs?.estate_wide_source_custody?.all_live_tasks_validated === true, "estate-wide source-custody validation was disabled");
assert(receipt.repairs?.estate_wide_source_custody?.adversarial_task_id === "ap_0045a0e77c9d85b7771ebdc3", "Mezz adversarial task identity drifted");
assert(receipt.repairs?.estate_wide_source_custody?.stale_non_pilot_receipt_fixture_fails_closed === true, "non-pilot stale source-receipt refusal disappeared");
assert(receipt.repairs?.shallow_history_fetch_race_safety?.maximum_attempts === 5, "historical exact-fetch retry bound drifted");
assert(receipt.repairs?.shallow_history_fetch_race_safety?.post_failure_object_visibility_accepted === true, "historical fetch lost post-failure object recheck");
assert(receipt.repairs?.shallow_history_fetch_race_safety?.substantive_fetch_failures_remain_terminal === true, "substantive historical fetch failures became retryable");
assert(sameSet(receipt.repairs?.canonical_autopilot_state_custody?.review_threads || [], ["PRRT_kwDOTQMkzs6WF_sJ", "PRRT_kwDOTQMkzs6WF_sM", "PRRT_kwDOTQMkzs6WF_sP"]), "canonical Autopilot review-thread custody drifted");
assert(receipt.repairs?.canonical_autopilot_state_custody?.validator === "scripts/lib/autopilot-model.mjs#validateState", "canonical Autopilot validator binding drifted");
assert(receipt.repairs?.canonical_autopilot_state_custody?.duplicate_performer_role_identities_refused === true, "duplicate performer-role identity refusal disappeared");
assert(receipt.repairs?.canonical_autopilot_state_custody?.unsupported_task_statuses_refused === true, "unsupported task-status refusal disappeared");
assert(receipt.repairs?.canonical_autopilot_state_custody?.retired_historical_pilot_excluded_from_live_source_custody === true, "retired historical pilot returned to live source custody");
assert(receipt.repairs?.https_source_url_custody?.review_thread === "PRRT_kwDOTQMkzs6WGa4N", "HTTPS source-custody review binding drifted");
assert(receipt.repairs?.https_source_url_custody?.allowed_protocol === "https:", "Doctor Who source protocol custody drifted");
assert(receipt.repairs?.https_source_url_custody?.task_sources_parseable === true, "Doctor Who task-source URL parsing was disabled");
assert(receipt.repairs?.https_source_url_custody?.receipt_sources_parseable === true, "Doctor Who receipt-source URL parsing was disabled");
assert(receipt.repairs?.https_source_url_custody?.malformed_matching_source_fixture_fails_closed === true, "matching malformed source fixture disappeared");
assert(receipt.repairs?.https_source_url_custody?.non_https_matching_source_fixture_fails_closed === true, "matching non-HTTPS source fixture disappeared");
assert(receipt.repairs?.canonical_scope_membership_custody?.review_thread === "PRRT_kwDOTQMkzs6WHikt", "canonical scope-membership review binding drifted");
assert(receipt.repairs?.canonical_scope_membership_custody?.canonical_normalizer === "scripts/lib/autopilot-model.mjs#normalize", "canonical scope-membership normalizer drifted");
assert(receipt.repairs?.canonical_scope_membership_custody?.all_jobs_checked === true, "scope-membership denominator stopped covering all tasks");
assert(receipt.repairs?.canonical_scope_membership_custody?.scope_franchise_mismatch_fixture_fails_closed === true, "scope/franchise escape fixture disappeared");
assert(receipt.repairs?.normalized_cross_task_receipt_identity?.review_thread === "PRRT_kwDOTQMkzs6WHikz", "cross-task receipt-identity review binding drifted");
assert(receipt.repairs?.normalized_cross_task_receipt_identity?.canonicalizer === "scripts/lib/autopilot-model.mjs#sourceKey", "cross-task receipt canonicalizer drifted");
assert(receipt.repairs?.normalized_cross_task_receipt_identity?.syntactic_url_variant_fixture_fails_closed === true, "canonical URL-variant collision fixture disappeared");
assert(receipt.repairs?.retirement_refresh_fixture_decoupling?.review_thread === "PRRT_kwDOTQMkzs6WH3M7", "retirement/refresh fixture review binding drifted");
assert(receipt.repairs?.retirement_refresh_fixture_decoupling?.refresh_fixture_status === "resolved", "certified-refresh fixture status drifted");
assert(receipt.repairs?.retirement_refresh_fixture_decoupling?.actual_retired_world_checked_separately === true, "retired world stopped being checked separately");
assert(receipt.repairs?.retirement_refresh_fixture_decoupling?.stale_receipt_fixture_remains_active_after_retirement === true, "stale-receipt fixture became retirement-dependent");
assert(receipt.repairs?.retirement_refresh_fixture_decoupling?.forged_fingerprint_fixture_remains_active_after_retirement === true, "forged-fingerprint fixture became retirement-dependent");
assert(sameSet(receipt.repairs?.canonical_task_set_custody?.review_threads || [], ["PRRT_kwDOTQMkzs6WJSKr", "PRRT_kwDOTQMkzs6WJHVk", "PRRT_kwDOTQMkzs6WJ7tK", "PRRT_kwDOTQMkzs6WKLNx", "PRRT_kwDOTQMkzs6WKZdv"]), "canonical task-set review bindings drifted");
assert(receipt.repairs?.canonical_task_set_custody?.canonical_constructor === "scripts/lib/autopilot-model.mjs#collapseCoverage", "canonical task constructor drifted");
assert(receipt.repairs?.canonical_task_set_custody?.comparison === "current canonical Doctor Who coverage equals the non-retired task-id set; sync-retained retired jobs are validated separately", "canonical task-set comparison drifted");
assert(receipt.repairs?.canonical_task_set_custody?.deleted_task_fixture_id === "ap_0045a0e77c9d85b7771ebdc3", "deleted-task fixture identity drifted");
assert(receipt.repairs?.canonical_task_set_custody?.deleted_task_fixture_fails_closed === true, "deleted-task refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.live_exact_set_recomputed === true, "live canonical task-set recomputation was disabled");
assert(receipt.repairs?.canonical_task_set_custody?.retained_retired_tasks_excluded_from_current_set === true, "retained retired tasks returned to the current coverage set");
assert(receipt.repairs?.canonical_task_set_custody?.retained_retired_tasks_require_sync_outcome === true, "retained retirement lost canonical sync-outcome custody");
assert(receipt.repairs?.canonical_task_set_custody?.retained_retired_tasks_require_matching_journal_event === true, "retained retirement lost journal custody");
assert(receipt.repairs?.canonical_task_set_custody?.retained_retired_fixture_id === "ap_6dfcb7b9254c26dc3f4b46b8", "retained-retirement fixture identity drifted");
assert(receipt.repairs?.canonical_task_set_custody?.retained_retired_fixture_passes === true, "canonical retained-retirement fixture stopped passing");
assert(receipt.repairs?.canonical_task_set_custody?.covered_retired_fixture_fails_closed === true, "covered retired task refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.missing_retirement_event_fixture_fails_closed === true, "missing retirement-event refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.journal_lifecycle_order === "append-order", "retirement lifecycle stopped using journal order");
assert(sameSet(receipt.repairs?.canonical_task_set_custody?.journal_lifecycle_ops || [], ["task.retired", "task.reopened"]), "retirement lifecycle operation set drifted");
assert(receipt.repairs?.canonical_task_set_custody?.unreopened_retirement_requires_retained_job === true, "unreopened retirement presence custody disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.deleted_retired_job_fixture_fails_closed === true, "deleted retired-job refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.later_reopen_releases_retirement_presence === true, "later reopen stopped releasing retirement presence custody");
assert(receipt.repairs?.canonical_task_set_custody?.reopened_retirement_fixture_passes === true, "reopened retirement fixture stopped passing");
assert(sameSet(receipt.repairs?.canonical_task_set_custody?.canonical_reopen_reasons || [], ["coverage_returned", "retry_due", "source_changed", "source_identity_cleared"]), "canonical reopen reason set drifted");
assert(sameSet(receipt.repairs?.canonical_task_set_custody?.retirement_release_reasons || [], ["coverage_returned", "source_changed"]), "retirement-release reason set drifted");
assert(receipt.repairs?.canonical_task_set_custody?.latest_reopen_requires_valid_timestamp === true, "latest reopen timestamp custody disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.latest_reopen_requires_current_coverage === true, "latest reopen coverage custody disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.latest_reopen_requires_live_nonretired_job === true, "latest reopen live-job custody disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.latest_reopen_identity_bound === true, "latest reopen identity custody disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.retirement_release_requires_monotonic_time === true, "retirement-release chronology custody disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.malformed_reopen_fixture_fails_closed === true, "malformed reopen refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.unknown_reopen_reason_fixture_fails_closed === true, "unknown reopen-reason refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.forged_reopen_identity_fixture_fails_closed === true, "forged reopen-identity refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.wrong_retirement_release_reason_fixture_fails_closed === true, "wrong retirement-release reason refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.non_monotonic_reopen_fixture_fails_closed === true, "non-monotonic reopen refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.orphan_reopen_fixture_fails_closed === true, "orphan reopen refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.every_reopen_replayed_before_final_state === true, "full reopen replay disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.active_unreleased_retirement_state_machine === true, "active retirement state machine disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.per_task_lifecycle_timestamp_order === "strictly-increasing", "lifecycle timestamp order drifted");
assert(receipt.repairs?.canonical_task_set_custody?.latest_reopen_rejects_stale_retirement_outcome === true, "stale reopened outcome refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.compound_malformed_then_retry_fixture_fails_closed === true, "compound malformed-reopen refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.compound_non_monotonic_then_retry_fixture_fails_closed === true, "compound chronology refusal disappeared");
assert(receipt.repairs?.canonical_task_set_custody?.compound_wrong_release_then_valid_latest_fixture_fails_closed === true, "compound release-reason refusal disappeared");

for (const flag of [
  "historical_drill_result_is_immutable",
  "live_production_corrections_may_grow",
  "later_reviewed_pilot_receipt_repairs_may_advance",
  "later_certified_source_revisions_may_supersede_drill_receipts",
  "later_bounded_autopilot_cycles_may_run",
  "later_exact_media_may_replace_historical_absence",
  "scope_pause_or_revocation_may_advance",
  "scope_retirement_may_advance",
  "later_roadmap_completion_requires_separate_reviewed_transaction",
  "later_doctor_who_cycles_require_milestone_completion",
]) {
  assert(receipt.future_change_policy?.[flag] === true, `future-change policy drifted at ${flag}`);
}
assert(receipt.qualification?.checker === PATHS.checker, "Doctor Who drill checker binding drifted");
assert(receipt.qualification?.command === "npm run doctor-who:correction-drill:check", "Doctor Who drill command binding drifted");
assert(receipt.qualification?.canonical_gate_binding === "autopilot:fixtures", "Doctor Who drill gate binding drifted");
assert(receipt.qualification?.historical_snapshot_resolved_from_base_paths === true, "historical path resolution qualification drifted");
assert(receipt.qualification?.scope_custody_receipt_composed === true, "scope-custody composition qualification drifted");
assert(receipt.qualification?.canonical_roadmap_authority_lattice_reused === true, "canonical roadmap-authority qualification drifted");
assert(receipt.qualification?.canonical_waterline_journal_lease_groups_reused === true, "canonical journal-lease qualification drifted");
assert(receipt.qualification?.scope_repair_code_resolved_from_commit_path === true, "scope-repair code qualification drifted");
assert(receipt.qualification?.canonical_roadmap_state_validator_reused === true, "canonical roadmap-state qualification drifted");
assert(receipt.qualification?.historical_no_second_lease_recomputed_from_journal === true, "historical journal qualification drifted");
assert(receipt.qualification?.canonical_scope_retirement_preserved === true, "scope-retirement qualification drifted");
assert(receipt.qualification?.pilot_checker_historicalized_at_exact_commit === true, "pilot-checker historicalization qualification drifted");
assert(receipt.qualification?.retirement_passes_composite_autopilot_fixtures === true, "composite retirement qualification drifted");
assert(receipt.qualification?.activation_checker_historical_source_and_code_binding === true, "activation historicalization qualification drifted");
assert(receipt.qualification?.canonical_source_refresh_custody_reused === true, "canonical source-refresh qualification drifted");
assert(receipt.qualification?.estate_wide_source_custody_enforced === true, "estate-wide source-custody qualification drifted");
assert(receipt.qualification?.shallow_checkout_exact_fetch_retry === true, "shallow-checkout exact-fetch qualification drifted");
assert(receipt.qualification?.canonical_autopilot_state_validator_reused === true, "canonical Autopilot state qualification drifted");
assert(receipt.qualification?.retired_historical_pilot_allowed === true, "retired historical pilot qualification drifted");
assert(receipt.qualification?.https_source_url_custody_enforced === true, "HTTPS source URL qualification drifted");
assert(receipt.qualification?.canonical_scope_membership_enforced === true, "canonical scope-membership qualification drifted");
assert(receipt.qualification?.normalized_cross_task_receipt_identity_enforced === true, "normalized cross-task receipt qualification drifted");
assert(receipt.qualification?.retirement_refresh_fixture_decoupled === true, "retirement/refresh fixture qualification drifted");
assert(receipt.qualification?.canonical_task_set_custody_enforced === true, "canonical task-set qualification drifted");
assert(receipt.qualification?.canonical_retired_task_retention_preserved === true, "canonical retained-retirement qualification drifted");
assert(receipt.qualification?.journal_retirement_presence_custody_enforced === true, "journal retirement-presence qualification drifted");
assert(receipt.qualification?.canonical_reopen_release_custody_enforced === true, "canonical reopen-release qualification drifted");
assert(receipt.qualification?.full_reopen_lifecycle_replay_enforced === true, "full reopen-lifecycle qualification drifted");
assert(receipt.qualification?.live_state_validated_without_freezing_future_operations === true, "future-safe qualification drifted");
assert(receipt.qualification?.new_workflow_added === false, "Doctor Who drill claims a permanent workflow");
assert(!/<[^>\n]*(?:TODO|TBD|PLACEHOLDER)[^>\n]*>/i.test(JSON.stringify(receipt)), "Doctor Who drill receipt contains an unresolved template placeholder");

// Live pilot and canonical identity. The old cycle facts remain historical;
// current exact media may advance under the generic media contracts.
validateCurrentPilotReceipt(pilot);
const wall = (specimens || []).find((entry) => entry.id === WALL_ID);
assert(wall?.actor === "Dan Starkey" && wall?.character === "Commander (The Sontarans)" && wall?.universe === "Doctor Who" && wall?.kind === "voice" && wall?.transform === 2, "UC-1345 canonical identity drifted");
const currentSource = (sources || []).find((entry) => entry.id === WALL_ID);
assert(currentSource, "UC-1345 source row is missing");
const currentPilotItems = (audit.items || []).filter((entry) => entry.wall_id === WALL_ID);
assert(currentPilotItems.length === 2, "UC-1345 must retain exactly two media facets");
assert(sameSet(currentPilotItems.map((entry) => entry.side), ["portrait", "still"]), "UC-1345 media sides drifted");
for (const item of currentPilotItems) {
  assert(item.scope === "doctor-who", `UC-1345 ${item.side} escaped Doctor Who media scope`);
  if (item.side === "portrait") assert(item.expected_subject === "Dan Starkey", "UC-1345 portrait subject drifted");
  if (item.side === "still") assert(item.expected_subject === "Commander (The Sontarans)", "UC-1345 still subject drifted");
}

// Live source revisions may advance; only subject identity and complete current
// source custody are permanent.
const commanderTask = (autopilot.jobs || []).find((job) => job.id === COMMANDER_TASK_ID);
const sliteTask = (autopilot.jobs || []).find((job) => job.id === SLITE_TASK_ID);
assert(commanderTask?.scope === "doctor-who" && commanderTask?.performer === "Dan Starkey" && commanderTask?.character === "Commander (The Sontarans)", "Commander obligation identity drifted");
assert(Array.isArray(commanderTask.wall_ids) && commanderTask.wall_ids.includes(WALL_ID), "Commander obligation lost UC-1345");
assert(sliteTask?.scope === "doctor-who" && sliteTask?.performer === "Dan Starkey" && sliteTask?.character === "Slite", "distinct Slite obligation identity drifted");
assert(!(sliteTask.wall_ids || []).includes(WALL_ID), "distinct Slite obligation was conflated with UC-1345");
validateCanonicalDoctorTaskSet(autopilot.jobs || [], coverage, scopes, manifest, autopilotJournal);
const liveDoctorSourceCustody = validateLiveDoctorSourceCustody(autopilot.jobs || []);
const commanderReceipts = liveDoctorSourceCustody.identitiesByTask.get(COMMANDER_TASK_ID);
const sliteReceipts = liveDoctorSourceCustody.identitiesByTask.get(SLITE_TASK_ID);
assert(sliteReceipts, "Slite escaped the live Doctor Who source-custody denominator");
if (commanderTask.status === "retired") {
  assert(!commanderReceipts, "retired Commander remained in the live source-custody denominator");
} else {
  assert(commanderReceipts, "live Commander escaped the Doctor Who source-custody denominator");
  assert(![...commanderReceipts].some((identity) => sliteReceipts.has(identity)), "Commander and Slite collapsed onto one current source receipt");
}

const doctorScope = (scopes.scopes || []).find((entry) => entry.id === "doctor-who");
const doctorCertification = (certifications.certifications || []).find((entry) => entry.scope_id === "doctor-who");
validateDoctorScopeCustody(doctorScope, doctorCertification, snapshots);

// Live correction intake may grow, provided the generic baseline is regenerated.
const productionErrors = validateCorrectionLedger(production, { expectedCaseType: "real" });
assert(productionErrors.length === 0, `production correction ledger is invalid:\n${productionErrors.join("\n")}`);
assert(!(production.cases || []).some((entry) =>
  entry.id === CASE_ID || entry.case_type === "exercise" || entry.target?.record_id === "EXERCISE-UC-1345"
), "controlled Doctor Who exercise leaked into the production correction ledger");
assert(correctionBaseline.inputs?.production_ledger?.sha256 === sha(productionBytes), "generic correction baseline no longer binds the live production ledger");
assert(correctionBaseline.production?.admitted_cases === (production.cases || []).length, "generic correction baseline production denominator is stale");
assert(correctionBaseline.boundary?.controlled_exercise_is_not_public_demand === true, "controlled work began counting as public demand");
assert(correctionBaseline.boundary?.controlled_exercise_is_not_canonical_authority === true, "controlled work acquired canonical authority");
assert(correctionBaseline.boundary?.production_ledger_mutated_by_exercise === false, "controlled work claims production mutation");

// Current one-cycle custody composes the scope repair with a later, separately
// reviewed roadmap completion. Before completion Doctor Who remains held; after
// completion it may run under the same single-group law.
assert(waterline.operations?.one_cycle_at_a_time === true, "global one-cycle policy is disabled");
const roadmapCompletion = validateRoadmapCompletion(roadmap, roadmapState);
const unreceiptedLeaseGroups = unreceiptedJournalLeaseGroups(waterline, waterlineState, autopilotJournal);
const activeLeaseState = validateActiveLeaseIsolation(autopilot.jobs || [], unreceiptedLeaseGroups, {
  doctorWhoAllowed: roadmapCompletion.completed,
});
validateOpenCycles(waterlineState.cycles || [], activeLeaseState, {
  doctorWhoAllowed: roadmapCompletion.completed,
});

// Embedded adversarial proofs for the permanent future-safe boundary.
validateActiveLeaseIsolation([
  { id: "fixture-star", scope: "star-trek", status: "leased", lease: { id: "lease_fixture" } },
  { id: "fixture-doctor-queued", scope: "doctor-who", status: "queued" },
], [], { doctorWhoAllowed: false });
expectFailure(
  () => validateActiveLeaseIsolation([
    { id: "fixture-star-a", scope: "star-trek", status: "leased", lease: { id: "lease_a" } },
    { id: "fixture-star-b", scope: "star-trek", status: "drafted", lease: { id: "lease_b" } },
  ], [], { doctorWhoAllowed: false }),
  /multiple active or unreceipted lease groups/,
  "concurrent lease groups",
);
expectFailure(
  () => validateActiveLeaseIsolation([
    { id: "fixture-doctor", scope: "doctor-who", status: "leased", lease: { id: "lease_doctor" } },
  ], [], { doctorWhoAllowed: false }),
  /before milestone completion/,
  "premature Doctor Who cycle",
);
validateActiveLeaseIsolation([
  { id: "fixture-doctor", scope: "doctor-who", status: "leased", lease: { id: "lease_doctor" } },
], [], { doctorWhoAllowed: true });
for (const evidenceType of ["report", "snapshot", "metric"]) {
  const ownerRoadmapCompletion = validateRoadmapCompletion(roadmap, roadmapFixtureState("owner", [
    { type: evidenceType, value: `fixture-owner-${evidenceType}` },
  ]));
  assert(ownerRoadmapCompletion.completed === true, `owner-reviewed completion with ${evidenceType} evidence was rejected`);
}
expectFailure(
  () => validateRoadmapCompletion(roadmap, roadmapFixtureState("machine", [
    { type: "report", value: "fixture-machine-report" },
  ])),
  /cannot close/,
  "machine-reviewed second-desk milestone completion",
);
validateActiveLeaseIsolation([
  { id: "fixture-same", scope: "star-trek", status: "leased", lease: { id: "lease_same" } },
], [{ scope_id: "star-trek", lease_id: "lease_same", task_ids: ["fixture-same"] }], { doctorWhoAllowed: false });
expectFailure(
  () => validateActiveLeaseIsolation([
    { id: "fixture-new", scope: "star-trek", status: "leased", lease: { id: "lease_new" } },
  ], [{ scope_id: "star-trek", lease_id: "lease_unreceipted", task_ids: ["fixture-resolved"] }], { doctorWhoAllowed: false }),
  /multiple active or unreceipted lease groups/,
  "unreceipted journal lease plus new active lease",
);
validateDoctorScopeCustody({ id: "doctor-who", status: "retired" }, null, { snapshots: [] });
expectFailure(
  () => validateHistoricalDoctorLeaseJournal([
    ...historicalAutopilotJournal,
    {
      op: "lease.claimed",
      scope: "doctor-who",
      lease_id: "lease_fixture_second",
      task_id: SLITE_TASK_ID,
      at: DRILL_AT,
    },
  ], historicalWaterline, historicalWaterlineState),
  /contains 2 lease groups/,
  "historical second Doctor Who lease",
);
const validSourceRefreshFixture = structuredClone(commanderTask);
const validRefreshUrl = "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)?refresh=certified";
const validRefreshReceipt = {
  ...structuredClone(validSourceRefreshFixture.source_receipts[0]),
  source: validRefreshUrl,
  revision: Number(validSourceRefreshFixture.source_receipts[0].revision) + 1,
  content_sha256: "1".repeat(64),
};
validSourceRefreshFixture.sources = [validRefreshUrl];
validSourceRefreshFixture.source_receipts = [validRefreshReceipt];
validSourceRefreshFixture.source_fingerprint = canonicalSourceFingerprint(validSourceRefreshFixture);
sourceReceiptIdentities(validSourceRefreshFixture);

const staleSourceReceiptFixture = structuredClone(validSourceRefreshFixture);
staleSourceReceiptFixture.source_receipts = structuredClone(commanderTask.source_receipts);
staleSourceReceiptFixture.source_fingerprint = canonicalSourceFingerprint(staleSourceReceiptFixture);
expectFailure(
  () => sourceReceiptIdentities(staleSourceReceiptFixture),
  /current source URLs and receipt URLs disagree/,
  "certified refresh with stale source receipts",
);

const forgedSourceFingerprintFixture = structuredClone(validSourceRefreshFixture);
forgedSourceFingerprintFixture.source_fingerprint = "0".repeat(64);
expectFailure(
  () => sourceReceiptIdentities(forgedSourceFingerprintFixture),
  /source fingerprint does not match canonical source custody/,
  "certified refresh with forged source fingerprint",
);
const mezzTask = (autopilot.jobs || []).find((task) => task.id === "ap_0045a0e77c9d85b7771ebdc3");
assert(mezzTask, "Mezz adversarial source-custody fixture task is missing");
const deletedMezzState = structuredClone(autopilot);
deletedMezzState.jobs = deletedMezzState.jobs.filter((task) => task.id !== "ap_0045a0e77c9d85b7771ebdc3");
validateState(deletedMezzState);
expectFailure(
  () => validateCanonicalDoctorTaskSet(deletedMezzState.jobs, coverage, scopes, manifest, autopilotJournal),
  /task denominator disagrees with canonical census coverage/,
  "deleted Doctor Who task",
);

const staleMezzTask = structuredClone(mezzTask);
staleMezzTask.sources = ["https://tardis.fandom.com/wiki/Unrelated_Mezz_Fixture"];
staleMezzTask.source_fingerprint = canonicalSourceFingerprint(staleMezzTask);
const staleMezzEstate = (autopilot.jobs || []).map((task) =>
  task.id === staleMezzTask.id ? staleMezzTask : task
);
expectFailure(
  () => validateLiveDoctorSourceCustody(staleMezzEstate),
  /current source URLs and receipt URLs disagree/,
  "non-pilot Doctor Who task with stale source receipts",
);
const nonUrlMezzTask = structuredClone(mezzTask);
nonUrlMezzTask.sources = ["not-a-url"];
nonUrlMezzTask.source_receipts = nonUrlMezzTask.source_receipts.map((sourceReceipt) => ({
  ...sourceReceipt,
  source: "not-a-url",
}));
nonUrlMezzTask.source_fingerprint = canonicalSourceFingerprint(nonUrlMezzTask);
const nonUrlMezzEstate = (autopilot.jobs || []).map((task) =>
  task.id === nonUrlMezzTask.id ? nonUrlMezzTask : task
);
expectFailure(
  () => validateLiveDoctorSourceCustody(nonUrlMezzEstate),
  /not a parseable URL/,
  "matching non-URL Doctor Who task and receipt sources",
);
const httpMezzTask = structuredClone(mezzTask);
httpMezzTask.sources = ["http://tardis.fandom.com/wiki/Mezz_HTTP_Fixture"];
httpMezzTask.source_receipts = httpMezzTask.source_receipts.map((sourceReceipt) => ({
  ...sourceReceipt,
  source: "http://tardis.fandom.com/wiki/Mezz_HTTP_Fixture",
}));
httpMezzTask.source_fingerprint = canonicalSourceFingerprint(httpMezzTask);
const httpMezzEstate = (autopilot.jobs || []).map((task) =>
  task.id === httpMezzTask.id ? httpMezzTask : task
);
expectFailure(
  () => validateLiveDoctorSourceCustody(httpMezzEstate),
  /must use HTTPS/,
  "matching HTTP Doctor Who task and receipt sources",
);
const escapedDoctorScopeTask = structuredClone(mezzTask);
escapedDoctorScopeTask.scope = "star-trek";
escapedDoctorScopeTask.sources = [];
escapedDoctorScopeTask.source_receipts = [];
escapedDoctorScopeTask.source_fingerprint = canonicalSourceFingerprint(escapedDoctorScopeTask);
const escapedDoctorScopeEstate = (autopilot.jobs || []).map((task) =>
  task.id === escapedDoctorScopeTask.id ? escapedDoctorScopeTask : task
);
expectFailure(
  () => validateLiveDoctorSourceCustody(escapedDoctorScopeEstate),
  /Doctor Who scope\/franchise membership disagrees/,
  "Doctor Who task escaping custody through a mutable scope change",
);

const canonicalCollisionSlite = structuredClone(sliteTask);
const canonicalCollisionReceipt = structuredClone(commanderTask.source_receipts[0]);
const equivalentCommanderUrl = `${canonicalCollisionReceipt.source}/`;
canonicalCollisionSlite.sources = [equivalentCommanderUrl];
canonicalCollisionSlite.source_receipts = [{
  ...canonicalCollisionReceipt,
  source: equivalentCommanderUrl,
}];
canonicalCollisionSlite.source_fingerprint = canonicalSourceFingerprint(canonicalCollisionSlite);
const canonicalCollisionCommanderReceipts = sourceReceiptIdentities(commanderTask);
const canonicalCollisionSliteReceipts = sourceReceiptIdentities(canonicalCollisionSlite);
expectFailure(
  () => {
    assert(
      ![...canonicalCollisionCommanderReceipts].some((identity) => canonicalCollisionSliteReceipts.has(identity)),
      "canonical URL variants collapsed onto one current source receipt",
    );
  },
  /canonical URL variants collapsed onto one current source receipt/,
  "syntactic URL variants for one canonical receipt",
);

const duplicateIdentityState = structuredClone(autopilot);
const duplicateIdentityMezz = duplicateIdentityState.jobs.find((task) => task.id === "ap_0045a0e77c9d85b7771ebdc3");
duplicateIdentityMezz.franchise = commanderTask.franchise;
duplicateIdentityMezz.character = commanderTask.character;
duplicateIdentityMezz.performer = commanderTask.performer;
duplicateIdentityMezz.source_fingerprint = canonicalSourceFingerprint(duplicateIdentityMezz);
expectFailure(
  () => validateState(duplicateIdentityState),
  /does not match its performer-role identity|duplicate task identity/,
  "duplicate performer-role identity",
);

const invalidStatusState = structuredClone(autopilot);
invalidStatusState.jobs.find((task) => task.id === "ap_0045a0e77c9d85b7771ebdc3").status = "archived";
expectFailure(
  () => validateState(invalidStatusState),
  /invalid status archived/,
  "unsupported Doctor Who task status",
);

const retiredCommanderAt = "2026-08-03T22:41:04.000Z";
const retiredCommanderCoverage = coverage.filter((row) => !(
  canonicalNormalize(row.franchise) === DOCTOR_FRANCHISE &&
  canonicalNormalize(row.performer) === canonicalNormalize(commanderTask.performer) &&
  canonicalNormalize(row.character) === canonicalNormalize(commanderTask.character)
));
const retiredCommanderState = structuredClone(autopilot);
const retiredCommanderJob = retiredCommanderState.jobs.find((task) => task.id === COMMANDER_TASK_ID);
retiredCommanderJob.status = "retired";
retiredCommanderJob.outcome = { kind: "not-in-latest-coverage", retired_at: retiredCommanderAt };
delete retiredCommanderJob.lease;
const retiredCommanderJournal = [
  ...autopilotJournal.filter((row) => !(
    ["task.retired", "task.reopened"].includes(row?.op) &&
    row.task_id === COMMANDER_TASK_ID &&
    row.scope === SCOPE_ID
  )),
  {
    op: "task.retired",
    task_id: retiredCommanderJob.id,
    at: retiredCommanderAt,
    scope: retiredCommanderJob.scope,
    performer: retiredCommanderJob.performer,
    character: retiredCommanderJob.character,
  },
];
validateState(retiredCommanderState);
const retiredCommanderTaskSet = validateCanonicalDoctorTaskSet(
  retiredCommanderState.jobs,
  retiredCommanderCoverage,
  scopes,
  manifest,
  retiredCommanderJournal,
);
assert(
  retiredCommanderTaskSet.retainedRetiredTasks.some((task) => task.id === COMMANDER_TASK_ID),
  "sync-retained Commander was not preserved outside current coverage",
);
const retiredCommanderCustody = validateLiveDoctorSourceCustody(retiredCommanderState.jobs);
assert(!retiredCommanderCustody.identitiesByTask.has(COMMANDER_TASK_ID), "retired Commander remained in live source custody");
assert(retiredCommanderCustody.identitiesByTask.has(SLITE_TASK_ID), "Slite disappeared when Commander retired");
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    retiredCommanderState.jobs,
    coverage,
    scopes,
    manifest,
    retiredCommanderJournal,
  ),
  /retired Doctor Who tasks remain in current canonical coverage/,
  "retired Commander still represented by current coverage",
);
const missingRetirementReceiptCommanderJournal = autopilotJournal.filter((row) => !(
  ["task.retired", "task.reopened"].includes(row?.op) &&
  row.task_id === COMMANDER_TASK_ID &&
  row.scope === SCOPE_ID
));
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    retiredCommanderState.jobs,
    retiredCommanderCoverage,
    scopes,
    manifest,
    missingRetirementReceiptCommanderJournal,
  ),
  /not backed by the latest unreopened journal lifecycle/,
  "retained retired Commander without its sync journal receipt",
);
const deletedRetiredCommanderState = structuredClone(retiredCommanderState);
deletedRetiredCommanderState.jobs = deletedRetiredCommanderState.jobs.filter((task) => task.id !== COMMANDER_TASK_ID);
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    deletedRetiredCommanderState.jobs,
    retiredCommanderCoverage,
    scopes,
    manifest,
    retiredCommanderJournal,
  ),
  /Doctor Who lifecycle lacks a durable Autopilot job/,
  "deleted sync-retained Commander",
);

const reopenedCommanderAt = "2026-08-03T22:42:04.000Z";
const reopenedCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: reopenedCommanderAt,
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "coverage_returned",
  },
];
const reopenedCommanderTaskSet = validateCanonicalDoctorTaskSet(
  autopilot.jobs,
  coverage,
  scopes,
  manifest,
  reopenedCommanderJournal,
);
assert(
  !reopenedCommanderTaskSet.unreopenedRetirements.some((row) => row.task_id === COMMANDER_TASK_ID),
  "a later task.reopened event failed to release Commander retirement presence custody",
);
assert(
  reopenedCommanderTaskSet.latestReopens.some((row) => row.task_id === COMMANDER_TASK_ID),
  "canonical reopened Commander disappeared from latest lifecycle custody",
);

const malformedReopenedCommanderJournal = [
  ...retiredCommanderJournal,
  { op: "task.reopened", task_id: commanderTask.id, scope: commanderTask.scope },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    malformedReopenedCommanderJournal,
  ),
  /task.reopened has an invalid timestamp/,
  "malformed Doctor Who reopen",
);

const unknownReasonReopenedCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: reopenedCommanderAt,
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "forged_release",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    unknownReasonReopenedCommanderJournal,
  ),
  /Doctor Who reopen has unsupported reason/,
  "unknown Doctor Who reopen reason",
);

const forgedIdentityReopenedCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: reopenedCommanderAt,
    scope: commanderTask.scope,
    performer: "Forged Performer",
    character: commanderTask.character,
    reason: "coverage_returned",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    forgedIdentityReopenedCommanderJournal,
  ),
  /task.reopened performer disagrees with its durable job/,
  "forged Doctor Who reopen identity",
);

const wrongReleaseReasonCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: reopenedCommanderAt,
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "retry_due",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    wrongReleaseReasonCommanderJournal,
  ),
  /cannot release a retirement/,
  "non-release Doctor Who reopen reason",
);

const nonMonotonicReopenedCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: retiredCommanderAt,
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "coverage_returned",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    nonMonotonicReopenedCommanderJournal,
  ),
  /lifecycle timestamps must increase in append order/,
  "non-monotonic Doctor Who reopen",
);

expectFailure(
  () => validateCanonicalDoctorTaskSet(
    deletedRetiredCommanderState.jobs,
    retiredCommanderCoverage,
    scopes,
    manifest,
    reopenedCommanderJournal,
  ),
  /Doctor Who lifecycle lacks a durable Autopilot job/,
  "orphan Doctor Who reopen without a covered live task",
);
const compoundMalformedThenRetryCommanderJournal = [
  ...retiredCommanderJournal,
  { op: "task.reopened", task_id: commanderTask.id, scope: commanderTask.scope },
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: "2026-08-03T22:43:04.000Z",
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "retry_due",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    compoundMalformedThenRetryCommanderJournal,
  ),
  /task.reopened has an invalid timestamp/,
  "later valid reopen concealing an earlier malformed reopen",
);

const compoundNonMonotonicThenRetryCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: retiredCommanderAt,
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "coverage_returned",
  },
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: "2026-08-03T22:43:04.000Z",
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "retry_due",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    compoundNonMonotonicThenRetryCommanderJournal,
  ),
  /lifecycle timestamps must increase in append order/,
  "later retry reopen concealing a non-monotonic retirement release",
);

const compoundWrongReleaseThenValidCommanderJournal = [
  ...retiredCommanderJournal,
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: reopenedCommanderAt,
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "retry_due",
  },
  {
    op: "task.reopened",
    task_id: commanderTask.id,
    at: "2026-08-03T22:43:04.000Z",
    scope: commanderTask.scope,
    performer: commanderTask.performer,
    character: commanderTask.character,
    reason: "coverage_returned",
  },
];
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    autopilot.jobs,
    coverage,
    scopes,
    manifest,
    compoundWrongReleaseThenValidCommanderJournal,
  ),
  /cannot release a retirement/,
  "later valid reopen concealing a non-release retirement reason",
);

const staleReopenedCommanderState = structuredClone(autopilot);
const staleReopenedCommanderJob = staleReopenedCommanderState.jobs.find((task) => task.id === COMMANDER_TASK_ID);
staleReopenedCommanderJob.outcome = { kind: "not-in-latest-coverage", retired_at: retiredCommanderAt };
validateState(staleReopenedCommanderState);
expectFailure(
  () => validateCanonicalDoctorTaskSet(
    staleReopenedCommanderState.jobs,
    coverage,
    scopes,
    manifest,
    reopenedCommanderJournal,
  ),
  /retained the retirement outcome/,
  "latest reopen retaining stale retirement outcome custody",
);
const badHistoricalObjects = { ...HISTORICAL_GIT_OBJECTS, [PATHS.sources]: "0".repeat(40) };
expectFailure(
  () => assertHistoricalGitObjects(badHistoricalObjects),
  /receipt drifted/,
  "historical object substitution",
);
const badPilot = structuredClone(pilot);
badPilot.canonical.wall_id = "UC-999999";
badPilot.receipt_sha256 = receiptHash(badPilot);
expectFailure(
  () => validateCurrentPilotReceipt(badPilot),
  /canonical wall binding drifted/,
  "current pilot identity substitution",
);

console.log(
  "doctor-who-correction-drill: PASS — exact base:path Git-object custody, reconstructed drill-time evidence, Commander/Slite separation, scope-bound pilot proof, one unrelated active lease group, future certified refreshes and corrections, and separately reviewed roadmap completion",
);
