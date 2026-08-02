#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveScopeReadiness } from "./lib/autopilot.mjs";
import { deriveWaterlineStatus, validateWaterlineConfig, validateWaterlineState } from "./lib/waterline.mjs";

export const ACTIVATION_VERSION = 1;
export const DEFAULT_OUTPUT = "data/review/adapter-sdk/doctor-who-activation-001.json";
const SCOPE_ID = "doctor-who";

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
  const activationEvents = current.autopilotJournal.filter((row) => row.op === "scope.certified" && row.scope === SCOPE_ID && row.activated === true && row.at === context.activated_at);
  assert.equal(activationEvents.length, 1, "activation certification event is missing or duplicated");

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
  assert.ok(Object.values(report.boundary).every((value) => value === false), "activation boundary contains an unauthorized payment");

  const current = await loadCurrent(root);
  const events = current.autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === SCOPE_ID && row.lease_id === report.lease.lease_id);
  assert.equal(events.length, 1, "reported activation lease event is missing or duplicated");
  assert.equal(events[0].task_id, report.lease.task.id);
  assert.equal(events[0].agent, report.lease.agent);
  const activationEvents = current.autopilotJournal.filter((row) => row.op === "scope.certified" && row.scope === SCOPE_ID && row.activated === true && row.at === report.activation.activated_at);
  assert.equal(activationEvents.length, 1, "reported activation event is missing or duplicated");
  const job = current.autopilot.jobs.find((row) => row.id === report.lease.task.id);
  assert.ok(job, "reported pilot task is missing from durable Autopilot state");
  assert.equal(job.source_fingerprint, report.lease.task.source_fingerprint, "reported pilot task source changed");
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
    console.log(`activation: PASS — ${report.source_custody.roles} Doctor Who roles active; one Luna task leased; second claim blocked`);
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
