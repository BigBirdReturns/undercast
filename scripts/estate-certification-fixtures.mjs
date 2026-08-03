#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const readRaw = (file) => readFileSync(file);
const readJson = (file) => JSON.parse(readRaw(file));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sorted = (values) => [...values].sort();
const same = (left, right, label) => assert.deepEqual(sorted(left), sorted(right), label);

const registry = readJson("data/ESTATE-REGISTRY.json");
const scopesDoc = readJson("data/AUTOPILOT-SCOPES.json");
const certificationsDoc = readJson("data/AUTOPILOT-CERTIFICATIONS.json");
const adaptersDoc = readJson("data/CENSUS-ADAPTERS.json");
const coverage = readJson("data/CENSUS-COVERAGE.json");
const manifest = readJson("data/CENSUS-MANIFEST.json");
const doctorReport = readJson("data/review/adapter-sdk/doctor-who-semantic-001.json");
const activationReport = readJson("data/review/adapter-sdk/doctor-who-activation-001.json");

const estates = new Map(registry.estates.map((row) => [row.id, row]));
const scopes = new Map(scopesDoc.scopes.map((row) => [row.id, row]));
const certifications = new Map(certificationsDoc.certifications.map((row) => [row.scope_id, row]));
const adapters = new Map(adaptersDoc.adapters.map((row) => [row.estate_id, row]));

assert.equal(estates.size, registry.estates.length, "estate IDs must be unique");
assert.equal(scopes.size, scopesDoc.scopes.length, "scope IDs must be unique");
assert.equal(certifications.size, certificationsDoc.certifications.length, "certification scope IDs must be unique");
assert.ok(registry.state_order.indexOf("certified-paused") < registry.state_order.indexOf("active-corpus"), "certified-paused must precede active-corpus");

for (const estate of registry.estates) {
  if (!["certified-paused", "active-corpus", "gold-reference"].includes(estate.state)) continue;
  assert.ok(estate.autopilot_scope, `${estate.id} ${estate.state} estate lacks an Autopilot scope`);
  assert.ok(scopes.has(estate.autopilot_scope), `${estate.id} references an unknown Autopilot scope`);
  assert.ok(certifications.has(estate.autopilot_scope), `${estate.id} ${estate.state} estate lacks a certification receipt`);
  if (estate.state === "certified-paused") {
    assert.equal(scopes.get(estate.autopilot_scope).status, "paused", `${estate.id} certified-paused estate acquired lease authority`);
  }
}

const estate = estates.get("doctor-who");
const scope = scopes.get("doctor-who");
const certificate = certifications.get("doctor-who");
const adapter = adapters.get("doctor-who");

assert.ok(estate && scope && certificate && adapter, "Doctor Who cross-ledger custody is incomplete");
assert.equal(estate.state, "active-corpus");
assert.equal(estate.autopilot_scope, "doctor-who");
assert.equal(scope.status, "active");
assert.equal(adapter.id, "doctor-who-v1");
assert.equal(adapter.certification_effect, false, "adapter registration acquired certification authority");
assert.equal(doctorReport.boundary.estate_activated, false, "semantic report claims activation");
assert.equal(doctorReport.boundary.luna_lease_issued, false, "semantic report claims a lease");
assert.equal(doctorReport.boundary.canonical_specimen_mutated, false, "semantic report claims canonical mutation");
assert.equal(doctorReport.extraction.rejected_nonempty_trusted_fields, 0, "trusted performer fields were silently discarded");
assert.equal(activationReport.decision.code, "doctor-who-activated-one-bounded-pilot", "Doctor Who activation receipt is missing");
assert.equal(activationReport.lease.task_count, 1, "Doctor Who activation issued more than one pilot task");
assert.equal(activationReport.lease.agent, "luna", "Doctor Who activation lease is not assigned to Luna");
assert.equal(activationReport.queue.paused_before_activation.total, certificate.snapshot.rows, "activation receipt lost the paused denominator");
assert.equal(activationReport.queue.active_before_lease.claimable, certificate.snapshot.rows, "activation did not expose the complete queue");
assert.equal(activationReport.queue.after_lease.statuses.leased, 1, "activation did not retain exactly one leased task");
assert.equal(activationReport.isolation.star_trek_changes, 0, "Doctor Who activation changed Star Trek state");
assert.equal(activationReport.isolation.non_doctor_changes, 0, "Doctor Who activation changed another scope");
assert.equal(activationReport.waterline.claim_allowed_after_claim, false, "Doctor Who activation left a second lease claimable");
assert.equal(activationReport.boundary.canonical_adoption_performed, false, "activation receipt claims canonical adoption");
assert.equal(activationReport.boundary.media_review_performed, false, "activation receipt claims media closure");

same(certificate.producer_files, adapter.producer_files, "certificate producer files drifted from the registered adapter");
assert.ok(certificate.checks.length >= 2 && certificate.checks.every((row) => row.status === "passed"), "Doctor Who certificate lacks passed producer checks");
assert.equal(certificate.snapshot.coverage_file_sha256, sha256(readRaw("data/CENSUS-COVERAGE.json")), "certificate coverage file hash is stale");
assert.equal(certificate.snapshot.manifest_file_sha256, sha256(readRaw("data/CENSUS-MANIFEST.json")), "certificate manifest file hash is stale");

const doctorCoverage = coverage.filter((row) => row.franchise === "Doctor Who");
const doctorObservations = (manifest.observations || []).filter((row) => row.franchise === "Doctor Who");
const creditedReceipts = new Set(doctorObservations
  .filter((row) => row.disposition === "credited")
  .map((row) => [row.source, row.pageid, row.revision, row.content_sha256].join("\u0000")));
const modeCounts = Object.fromEntries([...new Set(doctorCoverage.map((row) => row.performance_mode || "unresolved"))]
  .sort()
  .map((mode) => [mode, doctorCoverage.filter((row) => (row.performance_mode || "unresolved") === mode).length]));
const filedRoles = doctorCoverage.filter((row) => row.role_on_wall === true);
const missingRoles = doctorCoverage.filter((row) => row.role_on_wall !== true);

assert.equal(certificate.snapshot.rows, doctorCoverage.length, "certificate row denominator drifted from Doctor Who coverage");
assert.equal(certificate.snapshot.sources, creditedReceipts.size, "certificate source denominator drifted from credited receipts");
assert.equal(certificate.snapshot.complete_receipts, creditedReceipts.size, "Doctor Who certificate contains incomplete source receipts");
assert.equal(doctorReport.extraction.exact_performer_role_credits, doctorCoverage.length, "semantic receipt and coverage disagree");
assert.equal(doctorReport.extraction.credited_pages, creditedReceipts.size, "semantic receipt and credited source denominator disagree");
assert.deepEqual(doctorReport.extraction.performance_modes, modeCounts, "performance-mode custody drifted");
assert.equal(doctorReport.extraction.missing_roles, certificate.snapshot.rows, "semantic receipt lost the original missing-role denominator");
assert.equal(filedRoles.length + missingRoles.length, certificate.snapshot.rows, "filed-plus-missing role accounting drifted");
assert.equal(doctorReport.extraction.missing_roles - missingRoles.length, filedRoles.length, "paid Doctor Who role delta drifted");
assert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), "estate next gate does not carry the current role denominator");
assert.ok(estate.next_gate.includes(activationReport.lease.lease_id), "estate next gate does not name the only authorized pilot lease");

console.log(`PASS — Doctor Who is active-corpus with ${certificate.snapshot.rows} exact certified roles, ${certificate.snapshot.complete_receipts} complete source receipts, ${filedRoles.length} filed role(s), and ${missingRoles.length} remaining role obligation(s)`);
