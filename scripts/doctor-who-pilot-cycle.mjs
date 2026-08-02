#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PILOT_VERSION = 1;
export const DEFAULT_REPORT = "data/review/adapter-sdk/doctor-who-pilot-cycle-001.json";
const TASK_ID = "ap_6dfcb7b9254c26dc3f4b46b8";
const LEASE_ID = "lease_51e3223a4810f3681aff9df4";
const ACTOR = "Dan Starkey";
const CHARACTER = "Commander (The Sontarans)";
const SOURCE = "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const readJson = (root, file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const readJsonl = (root, file) => readFileSync(path.join(root, file), "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function check(root, report) {
  assert.equal(report.version, PILOT_VERSION);
  assert.equal(report.transaction, "DOCTOR-WHO-PILOT-CYCLE-001");
  const { receipt_sha256, ...body } = report;
  assert.equal(receipt_sha256, sha256(Buffer.from(stableJson(body))), "pilot receipt hash is stale");
  assert.equal(report.lease.lease_id, LEASE_ID);
  assert.equal(report.lease.task_id, TASK_ID);
  assert.equal(report.lease.performer, ACTOR);
  assert.equal(report.lease.character, CHARACTER);
  assert.equal(report.lease.source, SOURCE);
  assert.equal(report.canonical.before_count + 1, report.canonical.after_count);
  assert.equal(report.canonical.actor, ACTOR);
  assert.equal(report.canonical.character, CHARACTER);
  assert.equal(report.canonical.production, "Doctor Who: The Sontarans");
  assert.equal(report.canonical.universe, "TV");
  assert.equal(report.canonical.kind, "voice");
  assert.equal(report.canonical.transform_at_cycle, 2);
  assert.equal(report.media.scope, "doctor-who");
  assert.deepEqual(report.media.statuses_at_cycle, { portrait: "absent", still: "absent" });
  assert.equal(report.queue.after.total, 316);
  assert.equal(report.queue.after.queued, 315);
  assert.equal(report.queue.after.resolved, 1);
  assert.equal(report.queue.after.active, 0);
  assert.equal(report.cycle.outcome, "completed");
  assert.equal(report.cycle.task_status, "resolved");
  assert.equal(report.boundary.second_lease_issued, false);
  assert.equal(report.boundary.generic_sontaran_image_used, false);
  assert.equal(report.boundary.existing_dan_starkey_portrait_duplicated, false);
  assert.equal(report.boundary.star_trek_jobs_changed, false);
  assert.equal(report.boundary.other_scope_jobs_changed, false);
  assert.equal(report.decision.code, "doctor-who-first-pilot-cycle-completed");
  assert.match(report.execution.base_main || "", /^[0-9a-f]{40}$/);
  assert.match(report.execution.launcher_head || "", /^[0-9a-f]{40}$/);
  assert.match(report.execution.candidate_commit || "", /^[0-9a-f]{40}$/);
  assert.match(String(report.execution.workflow_run || ""), /^[0-9]+$/);
  assert.equal(
    report.proof.checker_sha256,
    sha256(readFileSync(path.join(root, "scripts/doctor-who-pilot-cycle.mjs"))),
    "pilot checker no longer matches its reviewed receipt",
  );

  const specimens = readJson(root, "data/specimens.json");
  const sources = readJson(root, "data/SOURCES.json");
  const autopilot = readJson(root, "data/AUTOPILOT.json");
  const autopilotJournal = readJsonl(root, "data/journal/autopilot.jsonl");
  const mediaAudit = readJson(root, "data/MEDIA-AUDIT.json");
  const mediaScopesDoc = readJson(root, "data/MEDIA-AUDIT-SCOPES.json");
  const waterline = readJson(root, "data/WATERLINE-STATE.json");
  const registry = readJson(root, "data/ESTATE-REGISTRY.json");

  const card = specimens.find((row) => row.id === report.canonical.wall_id);
  assert.ok(card, "pilot wall record is missing");
  assert.equal(card.actor, ACTOR);
  assert.equal(card.character, CHARACTER);
  assert.equal(card.production, report.canonical.production);
  assert.equal(card.universe, report.canonical.universe);
  assert.equal(card.kind, report.canonical.kind);
  assert.equal(card.link, SOURCE);
  assert.ok(card.references?.some((row) => row.claim === "performance" && row.source === SOURCE), "pilot card lost its exact performance source");

  const source = sources.find((row) => row.id === card.id);
  assert.ok(source, "pilot source ledger row is missing");
  assert.equal(source.actor, ACTOR);
  assert.equal(source.character, CHARACTER);
  assert.ok(Number.isFinite(Date.parse(source.fetched_at || "")), "pilot source ledger lacks a valid fetched_at receipt");

  const job = autopilot.jobs.find((row) => row.id === TASK_ID);
  assert.ok(job, "pilot task is missing from Autopilot");
  assert.equal(job.status, "resolved");
  assert.equal(job.source_fingerprint, report.lease.source_fingerprint);
  assert.ok(job.wall_ids?.includes(card.id), "pilot task lost its wall record");
  const doctorJobs = autopilot.jobs.filter((row) => row.scope === "doctor-who");
  assert.equal(doctorJobs.length, 316, "Doctor Who denominator drifted");
  assert.ok(doctorJobs.filter((row) => row.status === "resolved").length >= 1, "pilot resolution regressed");
  assert.ok(doctorJobs.filter((row) => row.status === "queued").length <= 315, "pilot queue regressed above its post-cycle denominator");
  assert.equal(autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who" && row.lease_id === LEASE_ID).length, 1, "pilot lease event is missing or duplicated");

  const items = mediaAudit.items.filter((row) => row.wall_id === card.id);
  assert.equal(items.length, 2, "pilot record no longer has two media facets");
  assert.deepEqual(items.map((row) => row.side).sort(), ["portrait", "still"]);
  for (const item of items) {
    assert.equal(item.scope, "doctor-who");
    assert.ok(["absent", "verified"].includes(item.status), `pilot ${item.side} media debt reopened`);
  }
  const mediaScopes = Array.isArray(mediaScopesDoc) ? mediaScopesDoc : mediaScopesDoc.scopes;
  const doctorScope = mediaScopes.find((row) => row.id === "doctor-who");
  assert.ok(doctorScope?.match?.wall_ids?.includes(card.id), "pilot card left the Doctor Who media baseline");
  assert.equal(doctorScope.block_new_autopilot_leases_until_complete, true);

  const cycle = waterline.cycles.find((row) => row.id === report.cycle.receipt_id && row.lease_id === LEASE_ID);
  assert.ok(cycle, "reviewed pilot cycle receipt is missing");
  assert.equal(cycle.scope_id, "doctor-who");
  assert.equal(cycle.outcome, "completed");
  assert.equal(cycle.task_statuses[TASK_ID], "resolved");
  assert.equal(cycle.reviewed_role, "second-desk");
  const evidenceTypes = new Set(cycle.evidence.map((row) => row.type));
  for (const type of ["workflow-run", "commit", "restart-proof"]) assert.ok(evidenceTypes.has(type), `pilot cycle receipt lost ${type} evidence`);

  const estate = registry.estates.find((row) => row.id === "doctor-who");
  assert.equal(estate?.state, "active-corpus");
  assert.ok(estate.next_gate.includes(String(doctorJobs.filter((row) => row.status === "queued").length)), "Doctor Who next gate lost the current queue denominator");
  assert.ok(!estate.next_gate.includes("no second lease may issue first"), "Doctor Who next gate still describes the completed pilot as in flight");
  return true;
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args.shift() || "check";
  const root = path.resolve(option(args, "--root", "."));
  const reportPath = path.join(root, option(args, "--report", DEFAULT_REPORT));
  if (!existsSync(reportPath)) throw new Error(`${path.relative(root, reportPath)} is missing`);
  if (command === "check") {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    check(root, report);
    console.log(`pilot-cycle: PASS — ${report.canonical.wall_id} resolved ${report.lease.performer} as ${report.lease.character}; reviewed cycle ${report.cycle.receipt_id} retained`);
  } else if (command === "status") {
    process.stdout.write(readFileSync(reportPath, "utf8"));
  } else {
    throw new Error("usage: doctor-who-pilot-cycle.mjs check|status [--root path] [--report path]");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`pilot-cycle: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
