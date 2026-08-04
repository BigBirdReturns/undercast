#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveScopeReadiness, validateState } from "./lib/autopilot.mjs";
import { collapseCoverage, normalize as canonicalNormalize, sourceFingerprint as canonicalSourceFingerprint, sourceKey } from "./lib/autopilot-model.mjs";
import {
  deriveWaterlineStatus,
  emptyWaterlineState,
  leaseGroups,
  makeCycleReceipt,
  validateWaterlineConfig,
  validateWaterlineState,
} from "./lib/waterline.mjs";

export const ACTIVATION_VERSION = 1;
export const DEFAULT_OUTPUT = "data/review/adapter-sdk/doctor-who-activation-001.json";
const SCOPE_ID = "doctor-who";
const DOCTOR_FRANCHISE = canonicalNormalize("Doctor Who");
const ACTIVATION_STATE_HISTORY_SHA = "79362e21d9d526f1310467574e69fe909eb80adb";
const ACTIVATION_STATE_AUTOPILOT_PATH = "data/AUTOPILOT.json";
const ACTIVATION_STATE_AUTOPILOT_BLOB = "178e51eecfddf759b97fcaf29741df7736e68a70";
const ACTIVATION_CODE_HISTORY_SHA = "9e5f39d22df254136fdc4a7b34d93ebd17bf1172";
const ACTIVATION_CODE_OBJECTS = {
  "scripts/doctor-who-activation.mjs": "254c4a4d9551be99e8e529dfe7bb937b04140e84",
  "scripts/lib/waterline.mjs": "4c0cc1787c92caeb56c5031884e2579098a88b1a",
  "scripts/waterline-fixtures.mjs": "81ec4d168f01aff0f09514d70d73bf5d4f077ffb",
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const readJson = (root, file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const readBytes = (root, file) => readFileSync(path.join(root, file));
const readJsonl = (root, file) => readFileSync(path.join(root, file), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const digestJobs = (jobs) => sha256(Buffer.from(JSON.stringify([...jobs].sort((a, b) => a.id.localeCompare(b.id)))));
const queueSummary = (jobs) => {
  const statuses = {};
  for (const job of jobs) statuses[job.status] = (statuses[job.status] || 0) + 1;
  return {
    total: jobs.length,
    claimable: jobs.filter((job) => job.status === "queued" && job.queueable).length,
    statuses: Object.fromEntries(Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b))),
  };
};

function runGitText(args, { allowFail = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    if (allowFail) return { ok: false, stdout: "", stderr: result.error.message };
    throw result.error;
  }
  const ok = result.status === 0;
  const stdout = String(result.stdout || "").trim();
  const stderr = String(result.stderr || "").trim();
  if (!ok && !allowFail) throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout || `status ${result.status}`}`);
  return { ok, stdout, stderr };
}

function runGitBytes(args) {
  const result = spawnSync("git", args, {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.from(result.stderr || []).toString("utf8").trim();
    throw new Error(`git ${args.join(" ")} failed: ${stderr || `status ${result.status}`}`);
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
  assert.fail(`${label} commit ${commit} is unavailable after bounded exact-fetch retries: ${detail}`);
}

assert.equal(isRetryableExactFetchError("fatal: shallow file has changed since we read it"), true, "shallow-file race is not classified as retryable");
assert.equal(isRetryableExactFetchError("fatal: repository not found"), false, "substantive fetch failure became retryable");

function ensureHistoricalCommit(commit, label) {
  if (runGitText(["cat-file", "-e", `${commit}^{commit}`], { allowFail: true }).ok) return;
  fetchExactCommitWithRetry(commit, label);
  assert.ok(runGitText(["cat-file", "-e", `${commit}^{commit}`], { allowFail: true }).ok, `${label} commit ${commit} did not resolve after exact fetch`);
}

function exactHistoricalBytes(commit, file, expectedObject, label) {
  ensureHistoricalCommit(commit, label);
  const object = runGitText(["rev-parse", `${commit}:${file}`]).stdout;
  assert.equal(object, expectedObject, `${label} Git object drifted for ${file}`);
  assert.ok(runGitText(["cat-file", "-e", `${object}^{blob}`], { allowFail: true }).ok, `${label} object for ${file} is not a blob`);
  return runGitBytes(["show", `${commit}:${file}`]);
}

function historicalActivationTask(taskId) {
  const bytes = exactHistoricalBytes(
    ACTIVATION_STATE_HISTORY_SHA,
    ACTIVATION_STATE_AUTOPILOT_PATH,
    ACTIVATION_STATE_AUTOPILOT_BLOB,
    "activation-state history",
  );
  const document = JSON.parse(bytes.toString("utf8"));
  const job = (document.jobs || []).find((row) => row.id === taskId);
  assert.ok(job, `activation-state history lacks task ${taskId}`);
  return job;
}

function assertHttpsSourceUrl(value, label) {
  assert.equal(typeof value, "string", `${label} is invalid`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    assert.fail(`${label} is not a parseable URL`);
  }
  assert.equal(parsed.protocol, "https:", `${label} must use HTTPS`);
  assert.ok(parsed.hostname, `${label} hostname is missing`);
  assert.equal(parsed.username, "", `${label} must not carry credentials`);
  assert.equal(parsed.password, "", `${label} must not carry credentials`);
  return parsed;
}

function validateLiveSourceCustody(task) {
  assert.ok(Array.isArray(task.sources) && task.sources.length > 0, `${task.id} has no current source URLs`);
  assert.ok(Array.isArray(task.source_receipts) && task.source_receipts.length > 0, `${task.id} has no current source receipts`);
  const sourceKeys = new Set();
  for (const source of task.sources) {
    assertHttpsSourceUrl(source, `${task.id} source URL`);
    const key = sourceKey(source);
    sourceKeys.add(key);
  }
  assert.equal(sourceKeys.size, task.sources.length, `${task.id} has duplicate normalized source URLs`);
  const receiptKeys = new Set();
  for (const receipt of task.source_receipts) {
    assertHttpsSourceUrl(receipt.source, `${task.id} source receipt URL`);
    assert.ok(Number.isInteger(receipt.pageid) && receipt.pageid > 0, `${task.id} source receipt page id is invalid`);
    assert.ok(Number.isInteger(receipt.revision) && receipt.revision > 0, `${task.id} source receipt revision is invalid`);
    assert.match(String(receipt.content_sha256 || ""), /^[0-9a-f]{64}$/, `${task.id} source receipt content hash is invalid`);
    receiptKeys.add(sourceKey(receipt.source));
  }
  assert.deepEqual(
    [...sourceKeys].sort(),
    [...receiptKeys].sort(),
    `${task.id} current source URLs and receipt URLs disagree`,
  );
  assert.equal(
    task.source_fingerprint,
    canonicalSourceFingerprint(task),
    `${task.id} source fingerprint does not match canonical source custody`,
  );
  return true;
}

function isCanonicalDoctorTask(task) {
  const franchiseMatches = canonicalNormalize(task.franchise) === DOCTOR_FRANCHISE;
  const scopeMatches = task.scope === SCOPE_ID;
  assert.equal(
    scopeMatches,
    franchiseMatches,
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
    assert.ok(String(row.task_id || "").trim(), `${row.op} Doctor Who lifecycle event lacks task identity`);
    if (!byTask.has(row.task_id)) byTask.set(row.task_id, []);
    byTask.get(row.task_id).push(row);
  }
  return byTask;
}

function validateDoctorLifecycleIdentity(row, task) {
  assert.equal(task.scope, row.scope, `${task.id} ${row.op} scope disagrees with its durable job`);
  assert.equal(
    canonicalNormalize(task.performer),
    canonicalNormalize(row.performer),
    `${task.id} ${row.op} performer disagrees with its durable job`,
  );
  assert.equal(
    canonicalNormalize(task.character),
    canonicalNormalize(row.character),
    `${task.id} ${row.op} role disagrees with its durable job`,
  );
}

function validateDoctorTaskLifecycle(rows, expectedSet, actualById) {
  assert.ok(Array.isArray(rows) && rows.length > 0, "Doctor Who lifecycle replay received no rows");
  const taskId = rows[0].task_id;
  const task = actualById.get(taskId);
  assert.ok(task, `${taskId} Doctor Who lifecycle lacks a durable Autopilot job`);
  let previous = null;
  let activeRetirement = null;

  for (const row of rows) {
    assert.equal(row.task_id, taskId, `${taskId} lifecycle replay crossed task identity`);
    const at = Date.parse(row.at || "");
    assert.ok(Number.isFinite(at), `${taskId} ${row.op} has an invalid timestamp`);
    if (previous) {
      const previousAt = Date.parse(previous.at || "");
      assert.ok(at > previousAt, `${taskId} lifecycle timestamps must increase in append order`);
    }
    validateDoctorLifecycleIdentity(row, task);

    if (row.op === "task.retired") {
      activeRetirement = row;
    } else {
      assert.ok(
        CANONICAL_REOPEN_REASONS.has(row.reason),
        `${taskId} Doctor Who reopen has unsupported reason ${row.reason || "<missing>"}`,
      );
      if (activeRetirement) {
        assert.ok(
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
    assert.ok(expectedSet.has(taskId), `${taskId} latest Doctor Who reopen lacks current canonical coverage`);
    assert.notEqual(task.status, "retired", `${taskId} latest Doctor Who reopen still points to a retired task`);
    assert.notEqual(
      task.outcome?.kind,
      "not-in-latest-coverage",
      `${taskId} latest Doctor Who reopen retained the retirement outcome`,
    );
    assert.equal(
      task.outcome?.retired_at,
      undefined,
      `${taskId} latest Doctor Who reopen retained retired_at custody`,
    );
  }
  return { latest, activeRetirement };
}

function validateCanonicalDoctorTaskSet(jobs, coverage, scopesDoc, manifest, journal = []) {
  const expectedTasks = collapseCoverage(coverage, scopesDoc, manifest).filter(isCanonicalDoctorTask);
  assert.ok(expectedTasks.length > 0, "canonical Doctor Who task denominator is empty");
  const expectedIds = expectedTasks.map((task) => task.id).sort();
  const expectedSet = new Set(expectedIds);
  const actualTasks = (jobs || []).filter(isCanonicalDoctorTask);
  const actualById = new Map(actualTasks.map((task) => [task.id, task]));
  const currentTasks = actualTasks.filter((task) => task.status !== "retired");
  const retainedRetiredTasks = actualTasks.filter((task) => task.status === "retired");
  const currentIds = currentTasks.map((task) => task.id).sort();
  const coveredRetiredIds = retainedRetiredTasks
    .filter((task) => expectedSet.has(task.id))
    .map((task) => task.id)
    .sort();
  assert.deepEqual(
    coveredRetiredIds,
    [],
    "retired Doctor Who tasks remain in current canonical coverage",
  );
  assert.deepEqual(
    currentIds,
    expectedIds,
    "current non-retired Doctor Who task denominator disagrees with canonical census coverage",
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
    assert.ok(
      !expectedSet.has(retirement.task_id),
      `${retirement.task_id} has an unreopened retirement but remains in current canonical coverage`,
    );
    const task = actualById.get(retirement.task_id);
    assert.ok(
      task,
      `${retirement.task_id} has an unreopened Doctor Who retirement but is missing from durable Autopilot state`,
    );
    assert.equal(task.status, "retired", `${task.id} unreopened retirement is not retained as retired`);
    assert.equal(task.outcome?.kind, "not-in-latest-coverage", `${task.id} retained retirement lacks the canonical sync outcome`);
    assert.equal(task.outcome?.retired_at, retirement.at, `${task.id} retained retirement timestamp disagrees with its latest journal lifecycle`);
    assert.ok(!task.lease, `${task.id} retained retirement still carries a lease`);
  }
  for (const task of retainedRetiredTasks) {
    assert.ok(
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
  assert.ok(tasks.length > 0, "live Doctor Who source-custody denominator is empty");
  const ids = new Set();
  for (const task of tasks) {
    assert.ok(!ids.has(task.id), `duplicate live Doctor Who task id ${task.id}`);
    ids.add(task.id);
    validateLiveSourceCustody(task);
  }
  return tasks;
}

function validateActivationTaskCustody(reportLease, historicalJob, liveJob) {
  const task = reportLease.task;
  assert.equal(historicalJob.scope, SCOPE_ID, "historical activation task escaped Doctor Who scope");
  assert.equal(historicalJob.status, "leased", "historical activation task was not leased");
  assert.equal(historicalJob.lease?.id, reportLease.lease_id, "historical activation lease identity drifted");
  assert.equal(historicalJob.lease?.agent, reportLease.agent, "historical activation lease agent drifted");
  assert.equal(historicalJob.performer, task.performer, "historical activation performer drifted");
  assert.equal(historicalJob.character, task.character, "historical activation character drifted");
  assert.deepEqual(historicalJob.sources, task.sources, "historical activation source URLs drifted");
  assert.equal(historicalJob.source_fingerprint, task.source_fingerprint, "historical activation source fingerprint drifted");
  assert.ok(liveJob, "reported pilot task is missing from durable Autopilot state");
  assert.equal(liveJob.scope, SCOPE_ID, "live pilot task escaped Doctor Who scope");
  if (liveJob.status === "retired") return { status: "retired" };
  assert.notEqual(liveJob.status, "rejected", "historical pilot task was rejected instead of lawfully retired");
  assert.equal(liveJob.performer, task.performer, "live pilot performer identity drifted");
  assert.equal(liveJob.character, task.character, "live pilot character identity drifted");
  validateLiveSourceCustody(liveJob);
  return { status: liveJob.status };
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function loadCurrent(root) {
  const registry = readJson(root, "data/ESTATE-REGISTRY.json");
  const scopesDoc = readJson(root, "data/AUTOPILOT-SCOPES.json");
  const certificationsDoc = readJson(root, "data/AUTOPILOT-CERTIFICATIONS.json");
  const coverage = readJson(root, "data/CENSUS-COVERAGE.json");
  const manifest = readJson(root, "data/CENSUS-MANIFEST.json");
  const preservation = readJson(root, "preservation/SNAPSHOTS.json");
  const autopilot = readJson(root, "data/AUTOPILOT.json");
  validateState(autopilot);
  const autopilotJournal = readJsonl(root, "data/journal/autopilot.jsonl");
  const waterlineConfig = readJson(root, "data/WATERLINE.json");
  const waterlineState = readJson(root, "data/WATERLINE-STATE.json");
  const mediaAudit = readJson(root, "data/MEDIA-AUDIT.json");
  const roadmapState = readJson(root, "data/ROADMAP-STATE.json");
  validateWaterlineConfig(waterlineConfig);
  validateWaterlineState(waterlineState, waterlineConfig);
  const readinessResult = await resolveScopeReadiness({
    scopesDoc,
    certificationsDoc,
    coverage,
    manifest,
    coverageSha256: sha256(readBytes(root, "data/CENSUS-COVERAGE.json")),
    manifestSha256: sha256(readBytes(root, "data/CENSUS-MANIFEST.json")),
    preservation,
    root,
  });
  return { registry, scopesDoc, certificationsDoc, coverage, manifest, preservation, autopilot, autopilotJournal, waterlineConfig, waterlineState, mediaAudit, roadmapState, readinessResult };
}

function currentActivationState(current) {
  const estate = current.registry.estates.find((row) => row.id === SCOPE_ID);
  const scope = current.scopesDoc.scopes.find((row) => row.id === SCOPE_ID);
  const certificate = current.certificationsDoc.certifications.find((row) => row.scope_id === SCOPE_ID);
  const readiness = current.readinessResult.readiness.find((row) => row.scope_id === SCOPE_ID);
  assert.ok(estate && scope && certificate && readiness, "Doctor Who activation custody is incomplete");
  assert.equal(estate.state, "active-corpus", "Doctor Who estate is not active-corpus");
  assert.equal(scope.status, "active", "Doctor Who scope is not active");
  assert.equal(scope.certification.require_source_snapshot, true, "Doctor Who activation dropped source-snapshot custody");
  assert.equal(certificate.snapshot.rows, 316, "Doctor Who certificate role denominator drifted");
  assert.equal(certificate.snapshot.complete_receipts, 298, "Doctor Who certificate source denominator drifted");
  assert.ok(certificate.snapshot.source_snapshot_id, "Doctor Who certificate lacks source snapshot identity");
  assert.ok(certificate.snapshot.source_archive_sha256, "Doctor Who certificate lacks source archive hash");
  assert.equal(readiness.effective_status, "active", "Doctor Who is not effectively active");
  assert.equal(readiness.lease_status, "ready", "Doctor Who readiness token is unavailable");
  assert.match(readiness.lease_token || "", /^[0-9a-f]{64}$/i, "Doctor Who lease token is invalid");
  const jobs = current.autopilot.jobs.filter((row) => row.scope === SCOPE_ID);
  assert.equal(jobs.length, 316, "Doctor Who Autopilot denominator drifted");
  return { estate, scope, certificate, readiness, jobs };
}

async function buildReceipt(root, context) {
  assert.ok(context && context.transaction === "DOCTOR-WHO-ACTIVATION-001", "activation write needs the exact transaction context");
  assert.ok(context.batch && context.batch.tasks?.length === 1, "activation context must contain exactly one leased task");
  const current = await loadCurrent(root);
  const activation = currentActivationState(current);
  const batch = context.batch;
  const task = batch.tasks[0];
  const currentJob = activation.jobs.find((row) => row.id === task.id);
  assert.ok(currentJob, `leased task ${task.id} is missing from current state`);
  assert.equal(currentJob.status, "leased", "activation task is not leased");
  assert.equal(currentJob.lease?.id, batch.lease_id, "activation lease identity drifted");
  assert.equal(currentJob.lease?.agent, "luna", "activation lease is not assigned to Luna");
  assert.equal(currentJob.source_fingerprint, task.source_fingerprint, "activation task source fingerprint drifted");

  const doctorQueue = queueSummary(activation.jobs);
  assert.equal(context.before.doctor_queue.total, 316);
  assert.equal(context.before.doctor_queue.claimable, 0);
  assert.equal(context.active_before_lease.doctor_queue.total, 316);
  assert.equal(context.active_before_lease.doctor_queue.claimable, 316);
  assert.equal(doctorQueue.total, 316);
  assert.equal(doctorQueue.claimable, 315);
  assert.equal(doctorQueue.statuses.leased, 1);

  const nonDoctorAfter = digestJobs(current.autopilot.jobs.filter((row) => row.scope !== SCOPE_ID));
  const starTrekAfter = digestJobs(current.autopilot.jobs.filter((row) => row.scope === "star-trek"));
  assert.equal(nonDoctorAfter, context.before.non_doctor_jobs_sha256, "Doctor Who activation changed another scope");
  assert.equal(starTrekAfter, context.before.star_trek_jobs_sha256, "Doctor Who activation changed Star Trek state");

  const leaseEvents = current.autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === SCOPE_ID && row.lease_id === batch.lease_id);
  assert.equal(leaseEvents.length, 1, "activation lease must contain exactly one journaled task");
  assert.equal(leaseEvents[0].task_id, task.id, "activation lease event targets another task");
  const activationEvents = current.autopilotJournal.filter((row) => row.op === "scope.certified" && row.scope === SCOPE_ID && row.activated === true && (!context.activated_at || row.at === context.activated_at));
  assert.equal(activationEvents.length, 1, "activation certification event is missing or duplicated");
  context.activated_at ||= activationEvents[0].at;

  const waterline = deriveWaterlineStatus({
    config: current.waterlineConfig,
    state: current.waterlineState,
    mediaAudit: current.mediaAudit,
    autopilot: current.autopilot,
    autopilotJournal: current.autopilotJournal,
    roadmapState: current.roadmapState,
    preservation: current.preservation,
    scopeId: SCOPE_ID,
    requestedTasks: 1,
  });
  assert.equal(waterline.phase, "cycle-in-flight", "first pilot did not close the bootstrap exception");
  assert.equal(waterline.claim_allowed, false, "a second Doctor Who lease remains claimable");
  assert.ok(waterline.claim_reasons.includes("cycle_in_flight"), "waterline lost the active-cycle blocker");
  assert.ok(waterline.claim_reasons.includes("media_baseline_missing"), "waterline lost the post-pilot media blocker");

  const inputFiles = [
    "data/CENSUS-COVERAGE.json",
    "data/CENSUS-MANIFEST.json",
    "data/specimens.json",
    "data/MEDIA-AUDIT.json",
    "preservation/SNAPSHOTS.json",
  ];
  const body = {
    version: ACTIVATION_VERSION,
    transaction: "DOCTOR-WHO-ACTIVATION-001",
    operation: "activate-preserved-scope-and-issue-one-bounded-first-pilot",
    generated_at: context.activated_at,
    execution: {
      base_sha: context.base_sha,
      launcher_head: context.launcher_head,
      workflow_run: context.workflow_run,
    },
    inputs: Object.fromEntries(inputFiles.map((file) => [file, { path: file, sha256: sha256(readBytes(root, file)) }])),
    activation: {
      estate_state: activation.estate.state,
      declared_scope_status: activation.scope.status,
      effective_scope_status: activation.readiness.effective_status,
      certification: activation.readiness.certification,
      snapshot: activation.readiness.snapshot,
      preservation: activation.readiness.preservation,
      lease_status: activation.readiness.lease_status,
      lease_token_sha256: sha256(activation.readiness.lease_token),
      activated_at: context.activated_at,
    },
    source_custody: {
      roles: activation.certificate.snapshot.rows,
      sources: activation.certificate.snapshot.sources,
      complete_receipts: activation.certificate.snapshot.complete_receipts,
      source_snapshot_id: activation.certificate.snapshot.source_snapshot_id,
      source_archive_sha256: activation.certificate.snapshot.source_archive_sha256,
      manifest_sha256: activation.certificate.snapshot.manifest_sha256,
    },
    queue: {
      paused_before_activation: context.before.doctor_queue,
      active_before_lease: context.active_before_lease.doctor_queue,
      after_lease: doctorQueue,
    },
    lease: {
      lease_id: batch.lease_id,
      agent: batch.agent,
      claimed_at: batch.claimed_at,
      expires_at: batch.expires_at,
      task_count: batch.tasks.length,
      capability_profile: batch.selection.profile_id,
      capability_policy_sha256: batch.selection.policy_sha256,
      selection_strategy: batch.selection.strategy,
      selection_basis: batch.selection.basis,
      task: {
        id: task.id,
        performer: task.performer,
        character: task.character,
        performance_modes: task.performance_modes,
        required_capabilities: task.required_capabilities,
        source_fingerprint: task.source_fingerprint,
        sources: task.sources,
      },
    },
    isolation: {
      non_doctor_jobs_sha256_before: context.before.non_doctor_jobs_sha256,
      non_doctor_jobs_sha256_after: nonDoctorAfter,
      non_doctor_changes: context.before.non_doctor_jobs_sha256 === nonDoctorAfter ? 0 : 1,
      star_trek_jobs_sha256_before: context.before.star_trek_jobs_sha256,
      star_trek_jobs_sha256_after: starTrekAfter,
      star_trek_changes: context.before.star_trek_jobs_sha256 === starTrekAfter ? 0 : 1,
    },
    waterline: {
      phase_after_claim: waterline.phase,
      claim_allowed_after_claim: waterline.claim_allowed,
      claim_reasons_after_claim: waterline.claim_reasons,
      global_other_scope_in_flight: waterline.jobs.other_scope_in_flight,
      initial_pilot: waterline.capacity.initial_pilot,
    },
    boundary: {
      canonical_specimen_mutated: false,
      canonical_sources_mutated: false,
      census_coverage_mutated: false,
      census_manifest_mutated: false,
      media_audit_mutated: false,
      draft_submitted: false,
      canonical_adoption_performed: false,
      media_review_performed: false,
      additional_lease_authorized: false,
    },
    decision: {
      status: "active-pilot-in-flight",
      code: "doctor-who-activated-one-bounded-pilot",
      next_gate: "Submit or explicitly block the one leased task, then pay canonical adoption, exact-subject media review or honest absence, and a reviewed cycle receipt before any second lease.",
    },
  };
  return { ...body, receipt_sha256: sha256(Buffer.from(stableJson(body))) };
}


function verifyGlobalCycleCustodyContract() {
  const config = {
    version: 1,
    scopes: [
      {
        id: "star-trek",
        label: "Star Trek",
        roadmap_milestone: "star-trek-gold-shard",
        required_closed_cycles: 3,
        max_tasks_per_cycle: 8,
        minimum_resolved_per_cycle: 1,
      },
      {
        id: "doctor-who",
        label: "Doctor Who",
        roadmap_milestone: "adapter-sdk-and-second-gold-shard",
        required_closed_cycles: 1,
        max_tasks_per_cycle: 1,
        minimum_resolved_per_cycle: 1,
        initial_pilot: { allow_without_media_baseline: true, max_tasks: 1 },
      },
    ],
    operations: {
      one_cycle_at_a_time: true,
      required_drills: ["repository-restore", "publication-rollback"],
      slo_targets: {
        build_minutes_p95: 20,
        source_freshness_p95_days: 14,
        rights_response_sla_days: 14,
      },
    },
  };
  const state = emptyWaterlineState();
  validateWaterlineState(state, config);
  const roadmapState = { completed: [{ milestone: "trusted-foundation" }] };
  const preservation = { history_guard: { precondition_met: true, status: "offsite-verified" } };
  const starMedia = {
    source: { item_set_sha256: "a".repeat(64) },
    items: [
      { id: "m1", scope: "star-trek", status: "verified" },
      { id: "m2", scope: "star-trek", status: "absent" },
    ],
  };
  const doctorMedia = { source: { item_set_sha256: "e".repeat(64) }, items: [] };
  const starJob = {
    id: "ap_star",
    scope: "star-trek",
    status: "queued",
    source_fingerprint: "b".repeat(64),
    wall_ids: [],
  };
  const doctorJob = (status) => ({
    id: "ap_doctor",
    scope: "doctor-who",
    status,
    source_fingerprint: "d".repeat(64),
    wall_ids: [],
  });
  const doctorEvents = [{
    op: "lease.claimed",
    task_id: "ap_doctor",
    at: "2026-08-02T16:40:00Z",
    scope: "doctor-who",
    lease_id: "lease_doctor",
    readiness_token: "f".repeat(64),
  }];

  const active = deriveWaterlineStatus({
    config,
    state,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("leased")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(active.phase, "other-cycle-in-flight");
  assert.equal(active.claim_allowed, false);
  assert.ok(active.claim_reasons.includes("other_scope_cycle_in_flight"));
  assert.equal(active.cycles.other_scope_unreceipted.length, 1);

  const terminal = deriveWaterlineStatus({
    config,
    state,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("resolved")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(terminal.phase, "other-cycle-receipt-required");
  assert.equal(terminal.claim_allowed, false);
  assert.ok(terminal.claim_reasons.includes("other_scope_cycle_receipt_required"));
  assert.equal(terminal.cycles.other_scope_unreceipted.length, 1);
  assert.equal(terminal.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");

  const collidingReceiptEvents = [{ ...doctorEvents[0], scope: "star-trek", task_id: "ap_star_collision" }];
  const collidingScopeState = structuredClone(state);
  collidingScopeState.cycles.push(makeCycleReceipt({
    version: 1,
    scope_id: "star-trek",
    lease_id: "lease_doctor",
    outcome: "aborted",
    reviewed_by: "second-desk",
    reviewed_role: "second-desk",
    reviewed_at: "2026-08-02T16:55:00Z",
    note: "A receipt from another scope deliberately collides on lease ID and must not release Doctor Who custody.",
    evidence: [{ type: "incident", value: "cross-scope-lease-id-collision" }],
  }, {
    config,
    state: collidingScopeState,
    autopilot: { jobs: [{ ...starJob, id: "ap_star_collision", status: "resolved" }] },
    mediaAudit: starMedia,
    groups: leaseGroups(collidingReceiptEvents, "star-trek"),
  }));
  const collidingReceipt = deriveWaterlineStatus({
    config,
    state: collidingScopeState,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("resolved")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(collidingReceipt.phase, "other-cycle-receipt-required");
  assert.equal(collidingReceipt.claim_allowed, false);
  assert.ok(collidingReceipt.claim_reasons.includes("other_scope_cycle_receipt_required"));
  assert.equal(collidingReceipt.cycles.other_scope_unreceipted.length, 1);
  assert.equal(collidingReceipt.cycles.other_scope_unreceipted[0].scope_id, "doctor-who");
  assert.equal(collidingReceipt.cycles.other_scope_unreceipted[0].lease_id, "lease_doctor");

  const receiptedState = structuredClone(collidingScopeState);
  receiptedState.cycles.push(makeCycleReceipt({
    version: 1,
    scope_id: "doctor-who",
    lease_id: "lease_doctor",
    outcome: "aborted",
    reviewed_by: "second-desk",
    reviewed_role: "second-desk",
    reviewed_at: "2026-08-02T17:00:00Z",
    note: "The first pilot closed without canonical adoption; its incident and honest absence are separately receipted.",
    evidence: [{ type: "incident", value: "doctor-who-first-pilot-blocked" }],
  }, {
    config,
    state: receiptedState,
    autopilot: { jobs: [doctorJob("resolved")] },
    mediaAudit: doctorMedia,
    groups: leaseGroups(doctorEvents, "doctor-who"),
  }));
  assert.equal(receiptedState.cycles.length, 2);
  assert.ok(receiptedState.cycles.some((row) => row.scope_id === "star-trek" && row.lease_id === "lease_doctor"));
  assert.ok(receiptedState.cycles.some((row) => row.scope_id === "doctor-who" && row.lease_id === "lease_doctor"));
  validateWaterlineState(receiptedState, config);
  assert.throws(() => makeCycleReceipt({
    version: 1,
    scope_id: "doctor-who",
    lease_id: "lease_doctor",
    outcome: "aborted",
    reviewed_by: "second-desk",
    reviewed_role: "second-desk",
    reviewed_at: "2026-08-02T17:01:00Z",
    note: "The exact composite receipt may not be duplicated.",
    evidence: [{ type: "incident", value: "duplicate-exact-cycle-receipt" }],
  }, {
    config,
    state: receiptedState,
    autopilot: { jobs: [doctorJob("resolved")] },
    mediaAudit: doctorMedia,
    groups: leaseGroups(doctorEvents, "doctor-who"),
  }), /doctor-who\/lease_doctor is already receipted/);
  const receipted = deriveWaterlineStatus({
    config,
    state: receiptedState,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("resolved")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(receipted.claim_allowed, true);
  assert.equal(receipted.cycles.other_scope_unreceipted.length, 0);

  return {
    active: {
      phase: active.phase,
      claim_allowed: active.claim_allowed,
      blocker: "other_scope_cycle_in_flight",
      other_scope_unreceipted: active.cycles.other_scope_unreceipted.length,
    },
    terminal_unreceipted: {
      phase: terminal.phase,
      claim_allowed: terminal.claim_allowed,
      blocker: "other_scope_cycle_receipt_required",
      other_scope_unreceipted: terminal.cycles.other_scope_unreceipted.length,
    },
    mismatched_scope_receipt: {
      phase: collidingReceipt.phase,
      claim_allowed: collidingReceipt.claim_allowed,
      blocker: "other_scope_cycle_receipt_required",
      other_scope_unreceipted: collidingReceipt.cycles.other_scope_unreceipted.length,
      required_scope_id: collidingReceipt.cycles.other_scope_unreceipted[0].scope_id,
      colliding_lease_id: collidingReceipt.cycles.other_scope_unreceipted[0].lease_id,
    },
    receipted: {
      claim_allowed: receipted.claim_allowed,
      other_scope_unreceipted: receipted.cycles.other_scope_unreceipted.length,
      cycle_receipt_count: receiptedState.cycles.length,
      colliding_scope_receipt_preserved: receiptedState.cycles.some((row) => row.scope_id === "star-trek" && row.lease_id === "lease_doctor"),
      exact_scope_receipt_present: receiptedState.cycles.some((row) => row.scope_id === "doctor-who" && row.lease_id === "lease_doctor"),
    },
  };
}

async function checkReceipt(root, report) {
  assert.equal(report.version, ACTIVATION_VERSION);
  assert.equal(report.transaction, "DOCTOR-WHO-ACTIVATION-001");
  const { receipt_sha256, ...body } = report;
  assert.equal(receipt_sha256, sha256(Buffer.from(stableJson(body))), "activation receipt hash is stale");
  assert.equal(report.source_custody.roles, 316);
  assert.equal(report.source_custody.complete_receipts, 298);
  assert.equal(report.queue.paused_before_activation.claimable, 0);
  assert.equal(report.queue.active_before_lease.claimable, 316);
  assert.equal(report.queue.after_lease.statuses.leased, 1);
  assert.equal(report.queue.after_lease.claimable, 315);
  assert.equal(report.lease.task_count, 1);
  assert.equal(report.lease.agent, "luna");
  assert.equal(report.lease.capability_profile, "text-vision");
  assert.equal(report.isolation.non_doctor_changes, 0);
  assert.equal(report.isolation.star_trek_changes, 0);
  assert.equal(report.waterline.claim_allowed_after_claim, false);
  assert.ok(report.waterline.claim_reasons_after_claim.includes("cycle_in_flight"));
  assert.ok(report.waterline.claim_reasons_after_claim.includes("media_baseline_missing"));
  const recomputedGlobalCycle = verifyGlobalCycleCustodyContract();
  assert.equal(report.global_cycle_custody?.status, "behaviorally-recomputed");
  assert.equal(
    report.global_cycle_custody?.verification_method,
    "permanent-checker-recomputes-active-terminal-unreceipted-mismatched-scope-collision-recovery-and-receipted-transitions",
  );
  assert.match(report.global_cycle_custody?.repair?.workflow_run || "", /^[0-9]+$/);
  assert.match(report.global_cycle_custody?.repair?.base_main || "", /^[0-9a-f]{40}$/);
  assert.match(report.global_cycle_custody?.repair?.launcher_head || "", /^[0-9a-f]{40}$/);
  assert.equal(report.global_cycle_custody?.repair?.review_comment_id, 3700382887);
  assert.equal(report.global_cycle_custody?.receipt_match_key, "scope_id+lease_id");
  const requiredCodeFiles = [
    "scripts/doctor-who-activation.mjs",
    "scripts/lib/waterline.mjs",
    "scripts/waterline-fixtures.mjs",
  ];
  assert.deepEqual(Object.keys(report.global_cycle_custody?.code_sha256 || {}).sort(), [...requiredCodeFiles].sort());
for (const file of requiredCodeFiles) {
  const reviewedBytes = exactHistoricalBytes(
    ACTIVATION_CODE_HISTORY_SHA,
    file,
    ACTIVATION_CODE_OBJECTS[file],
    "activation reviewed-code history",
  );
  assert.equal(
    report.global_cycle_custody.code_sha256[file],
    sha256(reviewedBytes),
    `${file} no longer matches the reviewed historical global-cycle custody proof`,
  );
}
  assert.deepEqual(report.global_cycle_custody?.expected_transitions, recomputedGlobalCycle);
  assert.ok(Object.values(report.boundary).every((value) => value === false), "activation boundary contains an unauthorized payment");

  const current = await loadCurrent(root);
  const events = current.autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === SCOPE_ID && row.lease_id === report.lease.lease_id);
  assert.equal(events.length, 1, "reported activation lease event is missing or duplicated");
  assert.equal(events[0].task_id, report.lease.task.id);
  assert.equal(events[0].agent, report.lease.agent);
  const activationEvents = current.autopilotJournal.filter((row) => row.op === "scope.certified" && row.scope === SCOPE_ID && row.activated === true && row.at === report.activation.activated_at);
  assert.equal(activationEvents.length, 1, "reported activation event is missing or duplicated");
validateCanonicalDoctorTaskSet(current.autopilot.jobs || [], current.coverage, current.scopesDoc, current.manifest, current.autopilotJournal);
const liveDoctorSourceTasks = validateLiveDoctorSourceCustody(current.autopilot.jobs || []);
const job = current.autopilot.jobs.find((row) => row.id === report.lease.task.id);
const historicalJob = historicalActivationTask(report.lease.task.id);
validateActivationTaskCustody(report.lease, historicalJob, job);
const certifiedRefreshFixture = structuredClone(job);
// Certified-refresh adversarial proofs exercise live source custody even
// when the actual historical pilot has lawfully moved to retired.
certifiedRefreshFixture.status = "resolved";
delete certifiedRefreshFixture.lease;
assert.notEqual(certifiedRefreshFixture.status, "retired", "certified-refresh fixture inherited lawful retirement");
const certifiedRefreshUrl = "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)?refresh=certified";
const certifiedRefreshReceipt = {
  ...structuredClone(certifiedRefreshFixture.source_receipts[0]),
  source: certifiedRefreshUrl,
  revision: Number(certifiedRefreshFixture.source_receipts[0].revision) + 1,
  content_sha256: "1".repeat(64),
};
certifiedRefreshFixture.sources = [certifiedRefreshUrl];
certifiedRefreshFixture.source_receipts = [certifiedRefreshReceipt];
certifiedRefreshFixture.source_fingerprint = canonicalSourceFingerprint(certifiedRefreshFixture);
validateActivationTaskCustody(report.lease, historicalJob, certifiedRefreshFixture);

const staleReceiptFixture = structuredClone(certifiedRefreshFixture);
staleReceiptFixture.source_receipts = structuredClone(job.source_receipts);
staleReceiptFixture.source_fingerprint = canonicalSourceFingerprint(staleReceiptFixture);
assert.throws(
  () => validateActivationTaskCustody(report.lease, historicalJob, staleReceiptFixture),
  /current source URLs and receipt URLs disagree/,
  "source refresh with stale receipts did not fail closed",
);

const forgedFingerprintFixture = structuredClone(certifiedRefreshFixture);
forgedFingerprintFixture.source_fingerprint = "0".repeat(64);
assert.throws(
  () => validateActivationTaskCustody(report.lease, historicalJob, forgedFingerprintFixture),
  /source fingerprint does not match canonical source custody/,
  "source refresh with forged fingerprint did not fail closed",
);
const mezzTask = (current.autopilot.jobs || []).find((task) => task.id === "ap_0045a0e77c9d85b7771ebdc3");
assert.ok(mezzTask, "Mezz adversarial source-custody fixture task is missing");
const deletedMezzState = structuredClone(current.autopilot);
deletedMezzState.jobs = deletedMezzState.jobs.filter((task) => task.id !== "ap_0045a0e77c9d85b7771ebdc3");
assert.doesNotThrow(
  () => validateState(deletedMezzState),
  "canonical state validator unexpectedly detects a deleted task without coverage custody",
);
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    deletedMezzState.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    current.autopilotJournal,
  ),
  /task denominator disagrees with canonical census coverage/,
  "deleted Doctor Who task did not fail canonical coverage custody",
);

const staleMezz = structuredClone(mezzTask);
staleMezz.sources = ["https://tardis.fandom.com/wiki/Unrelated_Mezz_Fixture"];
staleMezz.source_fingerprint = canonicalSourceFingerprint(staleMezz);
const staleMezzJobs = (current.autopilot.jobs || []).map((task) =>
  task.id === staleMezz.id ? staleMezz : task
);
assert.throws(
  () => validateLiveDoctorSourceCustody(staleMezzJobs),
  /current source URLs and receipt URLs disagree/,
  "non-pilot Doctor Who task with stale source receipts did not fail closed",
);

const nonUrlMezz = structuredClone(mezzTask);
nonUrlMezz.sources = ["not-a-url"];
nonUrlMezz.source_receipts = nonUrlMezz.source_receipts.map((receipt) => ({
  ...receipt,
  source: "not-a-url",
}));
nonUrlMezz.source_fingerprint = canonicalSourceFingerprint(nonUrlMezz);
const nonUrlMezzJobs = (current.autopilot.jobs || []).map((task) =>
  task.id === nonUrlMezz.id ? nonUrlMezz : task
);
assert.throws(
  () => validateLiveDoctorSourceCustody(nonUrlMezzJobs),
  /not a parseable URL/,
  "matching non-URL Doctor Who task and receipt sources did not fail closed",
);

const httpMezz = structuredClone(mezzTask);
httpMezz.sources = ["http://tardis.fandom.com/wiki/Mezz_HTTP_Fixture"];
httpMezz.source_receipts = httpMezz.source_receipts.map((receipt) => ({
  ...receipt,
  source: "http://tardis.fandom.com/wiki/Mezz_HTTP_Fixture",
}));
httpMezz.source_fingerprint = canonicalSourceFingerprint(httpMezz);
const httpMezzJobs = (current.autopilot.jobs || []).map((task) =>
  task.id === httpMezz.id ? httpMezz : task
);
assert.throws(
  () => validateLiveDoctorSourceCustody(httpMezzJobs),
  /must use HTTPS/,
  "matching HTTP Doctor Who task and receipt sources did not fail closed",
);

const escapedDoctorScopeTask = structuredClone(mezzTask);
escapedDoctorScopeTask.scope = "star-trek";
escapedDoctorScopeTask.sources = [];
escapedDoctorScopeTask.source_receipts = [];
escapedDoctorScopeTask.source_fingerprint = canonicalSourceFingerprint(escapedDoctorScopeTask);
const escapedDoctorScopeJobs = (current.autopilot.jobs || []).map((task) =>
  task.id === escapedDoctorScopeTask.id ? escapedDoctorScopeTask : task
);
assert.throws(
  () => validateLiveDoctorSourceCustody(escapedDoctorScopeJobs),
  /Doctor Who scope\/franchise membership disagrees/,
  "Doctor Who task escaped source custody through a mutable scope change",
);

const duplicateIdentityState = structuredClone(current.autopilot);
const duplicateIdentityMezz = duplicateIdentityState.jobs.find((task) => task.id === "ap_0045a0e77c9d85b7771ebdc3");
assert.ok(duplicateIdentityMezz, "Mezz duplicate-identity fixture task is missing");
duplicateIdentityMezz.franchise = job.franchise;
duplicateIdentityMezz.character = job.character;
duplicateIdentityMezz.performer = job.performer;
duplicateIdentityMezz.source_fingerprint = canonicalSourceFingerprint(duplicateIdentityMezz);
assert.throws(
  () => validateState(duplicateIdentityState),
  /does not match its performer-role identity|duplicate task identity/,
  "duplicate performer-role identity did not fail canonical validation",
);

const invalidStatusState = structuredClone(current.autopilot);
invalidStatusState.jobs.find((task) => task.id === "ap_0045a0e77c9d85b7771ebdc3").status = "archived";
assert.throws(
  () => validateState(invalidStatusState),
  /invalid status archived/,
  "unsupported Doctor Who task status did not fail canonical validation",
);

const retiredPilotAt = "2026-08-03T22:41:04.000Z";
const retiredPilotCoverage = current.coverage.filter((row) => !(
  canonicalNormalize(row.franchise) === DOCTOR_FRANCHISE &&
  canonicalNormalize(row.performer) === canonicalNormalize(job.performer) &&
  canonicalNormalize(row.character) === canonicalNormalize(job.character)
));
const retiredPilotState = structuredClone(current.autopilot);
const retiredPilotJob = retiredPilotState.jobs.find((task) => task.id === report.lease.task.id);
retiredPilotJob.status = "retired";
retiredPilotJob.outcome = { kind: "not-in-latest-coverage", retired_at: retiredPilotAt };
delete retiredPilotJob.lease;
const retiredPilotJournal = [
  ...current.autopilotJournal.filter((row) => !(
    ["task.retired", "task.reopened"].includes(row?.op) &&
    row.task_id === report.lease.task.id &&
    row.scope === SCOPE_ID
  )),
  {
    op: "task.retired",
    task_id: retiredPilotJob.id,
    at: retiredPilotAt,
    scope: retiredPilotJob.scope,
    performer: retiredPilotJob.performer,
    character: retiredPilotJob.character,
  },
];
validateState(retiredPilotState);
const retiredPilotTaskSet = validateCanonicalDoctorTaskSet(
  retiredPilotState.jobs,
  retiredPilotCoverage,
  current.scopesDoc,
  current.manifest,
  retiredPilotJournal,
);
assert.ok(
  retiredPilotTaskSet.retainedRetiredTasks.some((task) => task.id === report.lease.task.id),
  "sync-retained historical pilot was not preserved outside current coverage",
);
const retiredPilotSourceTasks = validateLiveDoctorSourceCustody(retiredPilotState.jobs);
assert.ok(
  !retiredPilotSourceTasks.some((task) => task.id === report.lease.task.id),
  "retired historical pilot remained in the live source-custody denominator",
);
assert.deepEqual(
  validateActivationTaskCustody(report.lease, historicalJob, retiredPilotJob),
  { status: "retired" },
  "lawfully retired historical pilot task was rejected",
);
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    retiredPilotState.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    retiredPilotJournal,
  ),
  /retired Doctor Who tasks remain in current canonical coverage/,
  "retired task still represented by current coverage did not fail closed",
);
const missingRetirementReceiptPilotJournal = current.autopilotJournal.filter((row) => !(
  ["task.retired", "task.reopened"].includes(row?.op) &&
  row.task_id === report.lease.task.id &&
  row.scope === SCOPE_ID
));
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    retiredPilotState.jobs,
    retiredPilotCoverage,
    current.scopesDoc,
    current.manifest,
    missingRetirementReceiptPilotJournal,
  ),
  /not backed by the latest unreopened journal lifecycle/,
  "retained retired task without its sync journal receipt did not fail closed",
);
const deletedRetiredPilotState = structuredClone(retiredPilotState);
deletedRetiredPilotState.jobs = deletedRetiredPilotState.jobs.filter((task) => task.id !== report.lease.task.id);
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    deletedRetiredPilotState.jobs,
    retiredPilotCoverage,
    current.scopesDoc,
    current.manifest,
    retiredPilotJournal,
  ),
  /Doctor Who lifecycle lacks a durable Autopilot job/,
  "deleted sync-retained historical pilot did not fail journal lifecycle custody",
);

const reopenedPilotAt = "2026-08-03T22:42:04.000Z";
const reopenedPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: reopenedPilotAt,
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "coverage_returned",
  },
];
const reopenedPilotTaskSet = validateCanonicalDoctorTaskSet(
  current.autopilot.jobs,
  current.coverage,
  current.scopesDoc,
  current.manifest,
  reopenedPilotJournal,
);
assert.ok(
  !reopenedPilotTaskSet.unreopenedRetirements.some((row) => row.task_id === report.lease.task.id),
  "a later task.reopened event failed to release historical retirement presence custody",
);
assert.ok(
  reopenedPilotTaskSet.latestReopens.some((row) => row.task_id === report.lease.task.id),
  "canonical reopened pilot disappeared from latest lifecycle custody",
);

const malformedReopenedPilotJournal = [
  ...retiredPilotJournal,
  { op: "task.reopened", task_id: job.id, scope: job.scope },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    malformedReopenedPilotJournal,
  ),
  /task.reopened has an invalid timestamp/,
  "malformed Doctor Who reopen released retirement custody",
);

const unknownReasonReopenedPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: reopenedPilotAt,
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "forged_release",
  },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    unknownReasonReopenedPilotJournal,
  ),
  /Doctor Who reopen has unsupported reason/,
  "unknown Doctor Who reopen reason released retirement custody",
);

const forgedIdentityReopenedPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: reopenedPilotAt,
    scope: job.scope,
    performer: "Forged Performer",
    character: job.character,
    reason: "coverage_returned",
  },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    forgedIdentityReopenedPilotJournal,
  ),
  /task.reopened performer disagrees with its durable job/,
  "forged Doctor Who reopen identity released retirement custody",
);

const wrongReleaseReasonPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: reopenedPilotAt,
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "retry_due",
  },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    wrongReleaseReasonPilotJournal,
  ),
  /cannot release a retirement/,
  "non-release Doctor Who reopen reason released retirement custody",
);

const nonMonotonicReopenedPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: retiredPilotAt,
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "coverage_returned",
  },
];
let nonMonotonicReopenError = "";
try {
  validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    nonMonotonicReopenedPilotJournal,
  );
} catch (error) {
  nonMonotonicReopenError = String(error?.message || error);
}
assert.match(
  nonMonotonicReopenError,
  /lifecycle timestamps must increase in append order/,
  `non-monotonic Doctor Who reopen error mismatch (${nonMonotonicReopenError || "no error"})`,
);

assert.throws(
  () => validateCanonicalDoctorTaskSet(
    deletedRetiredPilotState.jobs,
    retiredPilotCoverage,
    current.scopesDoc,
    current.manifest,
    reopenedPilotJournal,
  ),
  /Doctor Who lifecycle lacks a durable Autopilot job/,
  "orphan Doctor Who reopen released retirement custody without a covered live task",
);
const compoundMalformedThenRetryPilotJournal = [
  ...retiredPilotJournal,
  { op: "task.reopened", task_id: job.id, scope: job.scope },
  {
    op: "task.reopened",
    task_id: job.id,
    at: "2026-08-03T22:43:04.000Z",
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "retry_due",
  },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    compoundMalformedThenRetryPilotJournal,
  ),
  /task.reopened has an invalid timestamp/,
  "a later valid reopen concealed an earlier malformed reopen",
);

const compoundNonMonotonicThenRetryPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: retiredPilotAt,
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "coverage_returned",
  },
  {
    op: "task.reopened",
    task_id: job.id,
    at: "2026-08-03T22:43:04.000Z",
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "retry_due",
  },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    compoundNonMonotonicThenRetryPilotJournal,
  ),
  /lifecycle timestamps must increase in append order/,
  "a later retry reopen concealed a non-monotonic retirement release",
);

const compoundWrongReleaseThenValidPilotJournal = [
  ...retiredPilotJournal,
  {
    op: "task.reopened",
    task_id: job.id,
    at: reopenedPilotAt,
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "retry_due",
  },
  {
    op: "task.reopened",
    task_id: job.id,
    at: "2026-08-03T22:43:04.000Z",
    scope: job.scope,
    performer: job.performer,
    character: job.character,
    reason: "coverage_returned",
  },
];
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    current.autopilot.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    compoundWrongReleaseThenValidPilotJournal,
  ),
  /cannot release a retirement/,
  "a later valid reopen concealed a non-release retirement reason",
);

const staleReopenedPilotState = structuredClone(current.autopilot);
const staleReopenedPilotJob = staleReopenedPilotState.jobs.find((task) => task.id === job.id);
staleReopenedPilotJob.outcome = { kind: "not-in-latest-coverage", retired_at: retiredPilotAt };
validateState(staleReopenedPilotState);
assert.throws(
  () => validateCanonicalDoctorTaskSet(
    staleReopenedPilotState.jobs,
    current.coverage,
    current.scopesDoc,
    current.manifest,
    reopenedPilotJournal,
  ),
  /retained the retirement outcome/,
  "a latest reopen retained stale retirement outcome custody",
);

  return true;
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args.shift() || "check";
  const root = path.resolve(option(args, "--root", "."));
  const output = option(args, "--output", DEFAULT_OUTPUT);
  const outputPath = path.join(root, output);
  if (command === "write") {
    const contextPath = option(args, "--context");
    if (!contextPath) throw new Error("write requires --context");
    const report = await buildReceipt(root, JSON.parse(readFileSync(path.resolve(contextPath), "utf8")));
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, stableJson(report));
    console.log(`activation: wrote ${output}; lease=${report.lease.lease_id}; task=${report.lease.task.id}; queued=${report.queue.after_lease.claimable}`);
  } else if (command === "check") {
    if (!existsSync(outputPath)) throw new Error(`${output} is missing`);
    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    await checkReceipt(root, report);
    console.log(`activation: PASS — ${report.source_custody.roles} Doctor Who activation roles historically bound; one Luna task leased at activation; live certified source refreshes allowed; second claim blocked`);
  } else if (command === "status") {
    if (!existsSync(outputPath)) throw new Error(`${output} is missing`);
    process.stdout.write(readFileSync(outputPath, "utf8"));
  } else {
    throw new Error("usage: doctor-who-activation.mjs write|check|status [--context path] [--root path] [--output path]");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`activation: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
