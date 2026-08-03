#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { snapshotReadiness } from "./lib/autopilot-certification.mjs";

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

function validateWorld({ registryDoc, scopesDocument, certificationsDocument, label }) {
  const estates = new Map(registryDoc.estates.map((row) => [row.id, row]));
  const scopes = new Map(scopesDocument.scopes.map((row) => [row.id, row]));
  const certifications = new Map(certificationsDocument.certifications.map((row) => [row.scope_id, row]));
  const adapters = new Map(adaptersDoc.adapters.map((row) => [row.estate_id, row]));

  assert.equal(estates.size, registryDoc.estates.length, `${label}: estate IDs must be unique`);
  assert.equal(scopes.size, scopesDocument.scopes.length, `${label}: scope IDs must be unique`);
  assert.equal(certifications.size, certificationsDocument.certifications.length, `${label}: certification scope IDs must be unique`);
  assert.ok(registryDoc.state_order.indexOf("certified-paused") < registryDoc.state_order.indexOf("active-corpus"), `${label}: certified-paused must precede active-corpus`);
  assert.ok(registryDoc.state_order.includes("retired"), `${label}: estate registry lacks retired state`);

  for (const estate of registryDoc.estates) {
    const scope = estate.autopilot_scope ? scopes.get(estate.autopilot_scope) : null;
    if (["certified-paused", "active-corpus", "gold-reference"].includes(estate.state)) {
      assert.ok(estate.autopilot_scope, `${label}: ${estate.id} ${estate.state} estate lacks an Autopilot scope`);
      assert.ok(scope, `${label}: ${estate.id} references an unknown Autopilot scope`);
      assert.ok(certifications.has(estate.autopilot_scope), `${label}: ${estate.id} ${estate.state} estate lacks a certification receipt`);
      if (estate.state === "certified-paused") assert.equal(scope.status, "paused", `${label}: ${estate.id} certified-paused estate acquired lease authority`);
    }
    if (estate.state === "retired") {
      assert.ok(estate.autopilot_scope, `${label}: retired ${estate.id} estate lacks its historical scope identity`);
      assert.ok(scope, `${label}: retired ${estate.id} estate references an unknown scope`);
      assert.equal(scope.status, "retired", `${label}: retired ${estate.id} estate has a non-retired scope`);
    }
    if (scope?.status === "retired") assert.equal(estate.state, "retired", `${label}: retired scope ${scope.id} has a non-retired estate`);
  }

  const estate = estates.get("doctor-who");
  const scope = scopes.get("doctor-who");
  const certificate = certifications.get("doctor-who") || null;
  const adapter = adapters.get("doctor-who");

  assert.ok(estate && scope && adapter, `${label}: Doctor Who cross-ledger identity is incomplete`);
  assert.equal(estate.autopilot_scope, "doctor-who", `${label}: Doctor Who scope identity drifted`);
  assert.equal(adapter.id, "doctor-who-v1", `${label}: Doctor Who adapter identity drifted`);
  assert.equal(adapter.certification_effect, false, `${label}: adapter registration acquired certification authority`);
  assert.equal(doctorReport.boundary.estate_activated, false, `${label}: semantic report claims activation`);
  assert.equal(doctorReport.boundary.luna_lease_issued, false, `${label}: semantic report claims a lease`);
  assert.equal(doctorReport.boundary.canonical_specimen_mutated, false, `${label}: semantic report claims canonical mutation`);
  assert.equal(doctorReport.extraction.rejected_nonempty_trusted_fields, 0, `${label}: trusted performer fields were silently discarded`);

  if (estate.state === "retired" || scope.status === "retired") {
    assert.equal(estate.state, "retired", `${label}: Doctor Who retirement is not reflected in the estate registry`);
    assert.equal(scope.status, "retired", `${label}: Doctor Who retirement is not reflected in Autopilot scopes`);
    return { state: "retired", certificate_present: Boolean(certificate), filed: null, missing: null };
  }

  assert.ok(certificate, `${label}: active Doctor Who cross-ledger custody lacks certification`);
  assert.equal(estate.state, "active-corpus", `${label}: Doctor Who estate is not active-corpus`);
  assert.equal(scope.status, "active", `${label}: Doctor Who scope is not active`);
  assert.equal(activationReport.decision.code, "doctor-who-activated-one-bounded-pilot", `${label}: Doctor Who activation receipt is missing`);
  assert.equal(activationReport.lease.task_count, 1, `${label}: Doctor Who activation issued more than one pilot task`);
  assert.equal(activationReport.lease.agent, "luna", `${label}: Doctor Who activation lease is not assigned to Luna`);
  assert.equal(activationReport.queue.paused_before_activation.total, certificate.snapshot.rows, `${label}: activation receipt lost the paused denominator`);
  assert.equal(activationReport.queue.active_before_lease.claimable, certificate.snapshot.rows, `${label}: activation did not expose the complete queue`);
  assert.equal(activationReport.queue.after_lease.statuses.leased, 1, `${label}: activation did not retain exactly one leased task`);
  assert.equal(activationReport.isolation.star_trek_changes, 0, `${label}: Doctor Who activation changed Star Trek state`);
  assert.equal(activationReport.isolation.non_doctor_changes, 0, `${label}: Doctor Who activation changed another scope`);
  assert.equal(activationReport.waterline.claim_allowed_after_claim, false, `${label}: Doctor Who activation left a second lease claimable`);
  assert.equal(activationReport.boundary.canonical_adoption_performed, false, `${label}: activation receipt claims canonical adoption`);
  assert.equal(activationReport.boundary.media_review_performed, false, `${label}: activation receipt claims media closure`);

  same(certificate.producer_files, adapter.producer_files, `${label}: certificate producer files drifted from the registered adapter`);
  assert.ok(certificate.checks.length >= 2 && certificate.checks.every((row) => row.status === "passed"), `${label}: Doctor Who certificate lacks passed producer checks`);
  const currentSnapshot = snapshotReadiness(scope, coverage, manifest, {
    coverageSha256: sha256(readRaw("data/CENSUS-COVERAGE.json")),
    manifestSha256: sha256(readRaw("data/CENSUS-MANIFEST.json")),
  });
  assert.equal(certificate.snapshot.coverage_sha256, currentSnapshot.coverage_sha256, `${label}: certificate scope coverage hash is stale`);
  assert.equal(certificate.snapshot.manifest_sha256, currentSnapshot.manifest_sha256, `${label}: certificate scope manifest hash is stale`);
  assert.match(certificate.snapshot.coverage_file_sha256, /^[0-9a-f]{64}$/, `${label}: certificate historical coverage file hash is invalid`);
  assert.match(certificate.snapshot.manifest_file_sha256, /^[0-9a-f]{64}$/, `${label}: certificate historical manifest file hash is invalid`);

  const doctorCoverage = coverage.filter((row) => row.franchise === "Doctor Who");
  const doctorObservations = (manifest.observations || []).filter((row) => row.franchise === "Doctor Who");
  const creditedReceipts = new Set(doctorObservations
    .filter((row) => row.disposition === "credited")
    .map((row) => [row.source, row.pageid, row.revision, row.content_sha256].join("\\u0000")));
  const modeCounts = Object.fromEntries([...new Set(doctorCoverage.map((row) => row.performance_mode || "unresolved"))]
    .sort()
    .map((mode) => [mode, doctorCoverage.filter((row) => (row.performance_mode || "unresolved") === mode).length]));
  const filedRoles = doctorCoverage.filter((row) => row.role_on_wall === true);
  const missingRoles = doctorCoverage.filter((row) => row.role_on_wall !== true);

  assert.equal(certificate.snapshot.rows, doctorCoverage.length, `${label}: certificate row denominator drifted from Doctor Who coverage`);
  assert.equal(certificate.snapshot.sources, creditedReceipts.size, `${label}: certificate source denominator drifted from credited receipts`);
  assert.equal(certificate.snapshot.complete_receipts, creditedReceipts.size, `${label}: Doctor Who certificate contains incomplete source receipts`);
  assert.equal(doctorReport.extraction.exact_performer_role_credits, doctorCoverage.length, `${label}: semantic receipt and coverage disagree`);
  assert.equal(doctorReport.extraction.credited_pages, creditedReceipts.size, `${label}: semantic receipt and credited source denominator disagree`);
  assert.deepEqual(doctorReport.extraction.performance_modes, modeCounts, `${label}: performance-mode custody drifted`);
  assert.equal(doctorReport.extraction.missing_roles, certificate.snapshot.rows, `${label}: semantic receipt lost the original missing-role denominator`);
  assert.equal(filedRoles.length + missingRoles.length, certificate.snapshot.rows, `${label}: filed-plus-missing role accounting drifted`);
  assert.equal(doctorReport.extraction.missing_roles - missingRoles.length, filedRoles.length, `${label}: paid Doctor Who role delta drifted`);
  assert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), `${label}: estate next gate does not carry the current role denominator`);
  // The activation receipt above retains immutable first-pilot lease custody. The
  // live next gate is operational state and must advance after every later
  // reviewed cycle without being pinned forever to that historical lease ID.
  assert.match(estate.next_gate, /\b(?:terminal|complete|reviewed)\b/i, `${label}: estate next gate lost terminal reviewed-cycle custody`);
  assert.match(estate.next_gate, /(?:\bone\b.*\b(?:task|lease|cycle)\b|before another claim|no second lease)/i, `${label}: estate next gate lost one-cycle isolation`);
  return { state: estate.state, certificate_present: true, filed: filedRoles.length, missing: missingRoles.length, rows: certificate.snapshot.rows, receipts: certificate.snapshot.complete_receipts };
}

const current = validateWorld({ registryDoc: registry, scopesDocument: scopesDoc, certificationsDocument: certificationsDoc, label: "current" });

const retiredRegistry = structuredClone(registry);
const retiredEstate = retiredRegistry.estates.find((row) => row.id === "doctor-who");
retiredEstate.state = "retired";
retiredEstate.next_gate = "Retired by reviewed transaction; no new leases may issue.";
const retiredScopes = structuredClone(scopesDoc);
retiredScopes.scopes.find((row) => row.id === "doctor-who").status = "retired";
const retiredCertifications = structuredClone(certificationsDoc);
retiredCertifications.certifications = retiredCertifications.certifications.filter((row) => row.scope_id !== "doctor-who");
const retired = validateWorld({ registryDoc: retiredRegistry, scopesDocument: retiredScopes, certificationsDocument: retiredCertifications, label: "retired-fixture" });
assert.equal(retired.state, "retired", "retired fixture did not reach retired state");
assert.equal(retired.certificate_present, false, "retired fixture unexpectedly requires a current certificate");

const mismatchedScopes = structuredClone(retiredScopes);
mismatchedScopes.scopes.find((row) => row.id === "doctor-who").status = "active";
assert.throws(
  () => validateWorld({ registryDoc: retiredRegistry, scopesDocument: mismatchedScopes, certificationsDocument: retiredCertifications, label: "retirement-mismatch" }),
  /non-retired scope|not reflected in Autopilot scopes/,
  "retired estate with active scope did not fail closed",
);

console.log(`PASS — Doctor Who composite custody: current ${current.state} with ${current.rows} certified roles and retirement fixture valid without a current certificate`);
