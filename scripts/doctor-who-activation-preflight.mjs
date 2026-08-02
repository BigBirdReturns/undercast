#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyState,
  resolveScopeReadiness,
  syncState,
} from "./lib/autopilot.mjs";
import {
  scopePreservationReceipt,
  validateSnapshotRegistry,
} from "./lib/preservation.mjs";

export const PREFLIGHT_VERSION = 1;
export const DEFAULT_OUTPUT = "data/review/adapter-sdk/doctor-who-activation-preflight-001.json";
const SCOPE_ID = "doctor-who";

const clone = (value) => structuredClone(value);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function readInput(root, relative) {
  const raw = readFileSync(path.join(root, relative));
  return { raw, value: JSON.parse(raw.toString("utf8")) };
}

function statusCounts(jobs) {
  const counts = {};
  for (const job of jobs) counts[job.status] = (counts[job.status] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function queueSummary(jobs) {
  const claimable = jobs.filter((job) => job.status === "queued" && job.queueable).length;
  return {
    total: jobs.length,
    claimable,
    statuses: statusCounts(jobs),
    source_review: jobs.filter((job) => job.status === "attention" && job.outcome?.kind === "source-review").length,
    resolved: jobs.filter((job) => ["resolved", "merged"].includes(job.status)).length,
  };
}

function jobProjection(job) {
  return {
    id: job.id,
    scope: job.scope,
    scope_status: job.scope_status,
    franchise: job.franchise,
    character: job.character,
    performer: job.performer,
    categories: job.categories,
    performance_modes: job.performance_modes,
    sources: job.sources,
    source_fingerprint: job.source_fingerprint,
    queueable: job.queueable,
    status: job.status,
    priority: job.priority,
    performer_on_wall: job.performer_on_wall,
    role_on_wall: job.role_on_wall,
    wall_ids: job.wall_ids,
    source_review: job.source_review || null,
  };
}

function projectionDigest(jobs) {
  const rows = jobs.map(jobProjection).sort((left, right) => left.id.localeCompare(right.id));
  return sha256(Buffer.from(stableJson(rows)));
}

function readinessTokens(readiness) {
  return Object.fromEntries(readiness
    .filter((row) => row.effective_status === "active" && /^[0-9a-f]{64}$/i.test(row.lease_token || ""))
    .map((row) => [row.scope_id, row.lease_token]));
}

function isolatedSync({ coverage, manifest, scopes, readiness, coverageSha256, specimens, now }) {
  return syncState({
    coverage,
    scopes,
    manifest,
    state: emptyState(),
    coverageSha256,
    sourcePaths: {
      coverage_path: "data/CENSUS-COVERAGE.json",
      scopes_path: "data/AUTOPILOT-SCOPES.json",
      certifications_path: "data/AUTOPILOT-CERTIFICATIONS.json",
      manifest_path: "data/CENSUS-MANIFEST.json",
      specimens_path: "data/specimens.json",
    },
    drafts: [],
    specimens,
    growthRejections: [],
    readinessTokens: readinessTokens(readiness),
    now,
  }).state;
}

export async function buildActivationPreflight({
  registry,
  scopesDoc,
  certificationsDoc,
  coverage,
  manifest,
  preservation,
  specimens,
  inputHashes,
  root = process.cwd(),
} = {}) {
  const estate = registry.estates.find((row) => row.id === SCOPE_ID);
  const canonicalScope = scopesDoc.scopes.find((row) => row.id === SCOPE_ID);
  const certificate = certificationsDoc.certifications.find((row) => row.scope_id === SCOPE_ID);
  assert.ok(estate, "Doctor Who estate registry row is missing");
  assert.ok(canonicalScope, "Doctor Who Autopilot scope is missing");
  assert.ok(certificate, "Doctor Who certification receipt is missing");
  assert.equal(estate.state, "certified-paused", "Doctor Who estate is not certified-paused");
  assert.equal(canonicalScope.status, "paused", "Doctor Who canonical scope is already active");

  const now = certificate.certified_at;
  const coverageSha256 = inputHashes["data/CENSUS-COVERAGE.json"];
  const manifestSha256 = inputHashes["data/CENSUS-MANIFEST.json"];

  const canonicalScopes = clone(scopesDoc);
  const canonicalReadiness = await resolveScopeReadiness({
    scopesDoc: canonicalScopes,
    certificationsDoc,
    coverage,
    manifest,
    coverageSha256,
    manifestSha256,
    preservation,
    root,
    now,
  });
  const canonicalDoctor = canonicalReadiness.readiness.find((row) => row.scope_id === SCOPE_ID);
  assert.ok(canonicalDoctor, "Doctor Who canonical readiness row is missing");
  assert.equal(canonicalDoctor.effective_status, "paused", "canonical Doctor Who scope became active during preflight");
  assert.ok(canonicalDoctor.reasons.includes("scope_declared_paused"), "canonical pause reason is missing");

  const simulatedScopes = clone(scopesDoc);
  simulatedScopes.scopes.find((row) => row.id === SCOPE_ID).status = "active";
  const simulatedReadiness = await resolveScopeReadiness({
    scopesDoc: simulatedScopes,
    certificationsDoc,
    coverage,
    manifest,
    coverageSha256,
    manifestSha256,
    preservation,
    root,
    now,
  });
  const simulatedDoctor = simulatedReadiness.readiness.find((row) => row.scope_id === SCOPE_ID);
  assert.ok(simulatedDoctor, "Doctor Who simulated readiness row is missing");

  const canonicalState = isolatedSync({
    coverage,
    manifest,
    scopes: canonicalReadiness.effectiveScopes,
    readiness: canonicalReadiness.readiness,
    coverageSha256,
    specimens,
    now,
  });
  const simulatedState = isolatedSync({
    coverage,
    manifest,
    scopes: simulatedReadiness.effectiveScopes,
    readiness: simulatedReadiness.readiness,
    coverageSha256,
    specimens,
    now,
  });

  const canonicalDoctorJobs = canonicalState.jobs.filter((job) => job.scope === SCOPE_ID);
  const simulatedDoctorJobs = simulatedState.jobs.filter((job) => job.scope === SCOPE_ID);
  const canonicalOtherJobs = canonicalState.jobs.filter((job) => job.scope !== SCOPE_ID);
  const simulatedOtherJobs = simulatedState.jobs.filter((job) => job.scope !== SCOPE_ID);
  const canonicalStarTrekJobs = canonicalState.jobs.filter((job) => job.scope === "star-trek");
  const simulatedStarTrekJobs = simulatedState.jobs.filter((job) => job.scope === "star-trek");

  const canonicalOtherDigest = projectionDigest(canonicalOtherJobs);
  const simulatedOtherDigest = projectionDigest(simulatedOtherJobs);
  const canonicalStarTrekDigest = projectionDigest(canonicalStarTrekJobs);
  const simulatedStarTrekDigest = projectionDigest(simulatedStarTrekJobs);
  assert.equal(simulatedOtherDigest, canonicalOtherDigest, "Doctor Who activation simulation changed another scope");
  assert.equal(simulatedStarTrekDigest, canonicalStarTrekDigest, "Doctor Who activation simulation changed Star Trek custody");

  const canonicalQueue = queueSummary(canonicalDoctorJobs);
  const simulatedQueue = queueSummary(simulatedDoctorJobs);
  assert.equal(canonicalQueue.total, certificate.snapshot.rows, "canonical Doctor Who queue denominator drifted from the certificate");
  assert.equal(simulatedQueue.total, certificate.snapshot.rows, "simulated Doctor Who queue denominator drifted from the certificate");
  assert.equal(canonicalQueue.claimable, 0, "paused Doctor Who scope contains claimable work");

  validateSnapshotRegistry(preservation);
  const manifestScopeHash = simulatedDoctor.snapshot_details?.manifest_sha256 || certificate.snapshot.manifest_sha256;
  const preservationReceipt = scopePreservationReceipt(preservation, SCOPE_ID, manifestScopeHash);
  const sourceSnapshotRequired = canonicalScope.certification?.require_source_snapshot === true;

  const blockers = [];
  if (simulatedDoctor.effective_status !== "active" || simulatedDoctor.lease_status !== "ready") {
    blockers.push(...simulatedDoctor.reasons.map((reason) => `simulated_readiness:${reason}`));
  }
  if (simulatedQueue.claimable !== certificate.snapshot.rows) blockers.push("claimable_denominator_incomplete");
  if (!sourceSnapshotRequired) blockers.push("source_snapshot_contract_not_required");
  if (!preservationReceipt) blockers.push("current_source_snapshot_missing");

  const decision = blockers.length
    ? {
        status: "blocked",
        code: "source-preservation-before-activation",
        blockers: [...new Set(blockers)].sort(),
        next_gate: "Require a current Doctor Who source snapshot, publish the 298-source preservation receipt, re-certify the changed producer contract while paused, then rerun this isolated activation preflight.",
      }
    : {
        status: "ready-for-separate-activation",
        code: "queue-and-preservation-preflight-passed",
        blockers: [],
        next_gate: "Run a separately authorized activation and one bounded Luna lease; do not combine activation with canonical adoption or media closure.",
      };

  return {
    version: PREFLIGHT_VERSION,
    transaction: "DOCTOR-WHO-ACTIVATION-PREFLIGHT-001",
    operation: "isolated-certified-scope-activation-simulation",
    generated_at: now,
    inputs: Object.fromEntries(Object.entries(inputHashes).sort(([left], [right]) => left.localeCompare(right)).map(([file, hash]) => [file, { path: file, sha256: hash }])),
    current: {
      estate_state: estate.state,
      scope_status: canonicalScope.status,
      effective_status: canonicalDoctor.effective_status,
      lease_status: canonicalDoctor.lease_status || "blocked",
      reasons: [...canonicalDoctor.reasons].sort(),
      queue: canonicalQueue,
    },
    simulated_active: {
      declared_status: "active",
      effective_status: simulatedDoctor.effective_status,
      certification: simulatedDoctor.certification,
      snapshot: simulatedDoctor.snapshot,
      preservation: simulatedDoctor.preservation || "unknown",
      lease_status: simulatedDoctor.lease_status || "blocked",
      lease_token_present: /^[0-9a-f]{64}$/i.test(simulatedDoctor.lease_token || ""),
      reasons: [...simulatedDoctor.reasons].sort(),
      queue: simulatedQueue,
      claimable_delta: simulatedQueue.claimable - canonicalQueue.claimable,
    },
    isolation: {
      non_doctor_job_count: canonicalOtherJobs.length,
      non_doctor_job_sha256_before: canonicalOtherDigest,
      non_doctor_job_sha256_after: simulatedOtherDigest,
      non_doctor_changes: canonicalOtherDigest === simulatedOtherDigest ? 0 : 1,
      star_trek_job_count: canonicalStarTrekJobs.length,
      star_trek_job_sha256_before: canonicalStarTrekDigest,
      star_trek_job_sha256_after: simulatedStarTrekDigest,
      star_trek_changes: canonicalStarTrekDigest === simulatedStarTrekDigest ? 0 : 1,
    },
    preservation: {
      require_source_snapshot: sourceSnapshotRequired,
      current_scope_manifest_sha256: manifestScopeHash,
      matching_receipt_present: Boolean(preservationReceipt),
      snapshot_id: preservationReceipt?.snapshot.id || null,
      snapshot_status: preservationReceipt?.snapshot.status || null,
      source_archive_sha256: preservationReceipt?.snapshot.public_release.assets.find((asset) => asset.kind === "source-bag")?.sha256 || null,
    },
    boundary: {
      canonical_scope_mutated: false,
      canonical_autopilot_state_mutated: false,
      real_lease_issued: false,
      canonical_specimen_mutated: false,
      estate_activation_authorized: false,
      simulation_uses_empty_isolated_state: true,
    },
    decision,
  };
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function loadAndBuild(root) {
  const files = [
    "data/ESTATE-REGISTRY.json",
    "data/AUTOPILOT-SCOPES.json",
    "data/AUTOPILOT-CERTIFICATIONS.json",
    "data/CENSUS-COVERAGE.json",
    "data/CENSUS-MANIFEST.json",
    "preservation/SNAPSHOTS.json",
    "data/specimens.json",
  ];
  const inputs = Object.fromEntries(files.map((file) => [file, readInput(root, file)]));
  const inputHashes = Object.fromEntries(files.map((file) => [file, sha256(inputs[file].raw)]));
  return buildActivationPreflight({
    registry: inputs["data/ESTATE-REGISTRY.json"].value,
    scopesDoc: inputs["data/AUTOPILOT-SCOPES.json"].value,
    certificationsDoc: inputs["data/AUTOPILOT-CERTIFICATIONS.json"].value,
    coverage: inputs["data/CENSUS-COVERAGE.json"].value,
    manifest: inputs["data/CENSUS-MANIFEST.json"].value,
    preservation: inputs["preservation/SNAPSHOTS.json"].value,
    specimens: inputs["data/specimens.json"].value,
    inputHashes,
    root,
  });
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args.shift() || "check";
  const root = path.resolve(option(args, "--root", "."));
  const output = option(args, "--output", DEFAULT_OUTPUT);
  const report = await loadAndBuild(root);
  const bytes = stableJson(report);
  const outputPath = path.join(root, output);

  if (command === "write") {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
    console.log(`activation-preflight: wrote ${output}; current=${report.current.queue.claimable}; simulated=${report.simulated_active.queue.claimable}; decision=${report.decision.code}`);
  } else if (command === "check") {
    if (!existsSync(outputPath)) throw new Error(`${output} is missing; run activation-preflight:write`);
    if (readFileSync(outputPath, "utf8") !== bytes) throw new Error(`${output} is stale; run activation-preflight:write`);
    console.log(`activation-preflight: PASS — ${report.current.queue.total} Doctor Who obligations remain paused; simulated claimable=${report.simulated_active.queue.claimable}; decision=${report.decision.code}`);
  } else if (command === "status") {
    process.stdout.write(bytes);
  } else {
    throw new Error("usage: doctor-who-activation-preflight.mjs write|check|status [--root path] [--output path]");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`activation-preflight: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
