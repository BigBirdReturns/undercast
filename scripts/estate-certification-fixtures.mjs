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
assert.equal(estate.state, "certified-paused");
assert.equal(estate.autopilot_scope, "doctor-who");
assert.equal(scope.status, "paused");
assert.equal(adapter.id, "doctor-who-v1");
assert.equal(adapter.certification_effect, false, "adapter registration acquired certification authority");
assert.equal(doctorReport.boundary.estate_activated, false, "semantic report claims activation");
assert.equal(doctorReport.boundary.luna_lease_issued, false, "semantic report claims a lease");
assert.equal(doctorReport.boundary.canonical_specimen_mutated, false, "semantic report claims canonical mutation");
assert.equal(doctorReport.extraction.rejected_nonempty_trusted_fields, 0, "trusted performer fields were silently discarded");

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

assert.equal(certificate.snapshot.rows, doctorCoverage.length, "certificate row denominator drifted from Doctor Who coverage");
assert.equal(certificate.snapshot.sources, creditedReceipts.size, "certificate source denominator drifted from credited receipts");
assert.equal(certificate.snapshot.complete_receipts, creditedReceipts.size, "Doctor Who certificate contains incomplete source receipts");
assert.equal(doctorReport.extraction.exact_performer_role_credits, doctorCoverage.length, "semantic receipt and coverage disagree");
assert.equal(doctorReport.extraction.credited_pages, creditedReceipts.size, "semantic receipt and credited source denominator disagree");
assert.deepEqual(doctorReport.extraction.performance_modes, modeCounts, "performance-mode custody drifted");
assert.equal(doctorReport.extraction.missing_roles, doctorCoverage.filter((row) => !row.role_on_wall).length, "missing-role denominator drifted");
assert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), "estate next gate does not carry the current unpaid role denominator");

console.log(`PASS — Doctor Who is certified-paused with ${certificate.snapshot.rows} exact roles, ${certificate.snapshot.complete_receipts} complete source receipts, and no lease authority`);
