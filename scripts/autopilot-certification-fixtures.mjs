#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  certifyScope,
  emptyCertifications,
  producerFingerprint,
  resolveScopeReadiness,
  runScopeChecks,
  snapshotReadiness,
  validateCertifications,
} from "./lib/autopilot.mjs";

const root = await mkdtemp(join(tmpdir(), "undercast-autopilot-cert-"));
try {
  await mkdir(join(root, "scripts/lib"), { recursive: true });
  await writeFile(join(root, "scripts/census.mjs"), "export const producer = 1;\n");
  await writeFile(join(root, "scripts/lib/census-core.mjs"), "export const parser = 1;\n");

  const scope = {
    id: "star-trek",
    label: "Star Trek",
    status: "active",
    coverage_match: { franchise: "Star Trek" },
    refresh: { executable: "node", args: ["scripts/census.mjs", "star-trek"], cadence_days: 7 },
    certification: {
      producer_files: ["scripts/census.mjs", "scripts/lib/census-core.mjs"],
      checks: [{ label: "fixture", executable: process.execPath, args: ["-e", "process.exit(0)"] }],
      require_manifest_receipts: true,
    },
  };
  const scopes = { version: 1, scopes: [scope] };
  const coverage = [{
    franchise: "Star Trek", category: "Ferengi", character: "Brunt", performer: "Jeffrey Combs",
    source: "https://memory-alpha.fandom.com/wiki/Brunt", role_on_wall: false,
  }];
  const manifest = { observations: [{
    franchise: "Star Trek", source: coverage[0].source, pageid: 10, revision: 20,
    content_sha256: "a".repeat(64), timestamp: "2026-07-21T00:00:00Z",
  }] };

  const empty = emptyCertifications();
  validateCertifications(empty);
  const missing = await resolveScopeReadiness({ scopesDoc: scopes, certificationsDoc: empty, coverage, manifest, root });
  assert.equal(missing.readiness[0].effective_status, "paused", "an active declaration without a certificate cannot lease work");
  assert.equal(missing.readiness[0].certification, "missing");

  const pausedScopes = structuredClone(scopes);
  pausedScopes.scopes[0].status = "paused";
  const declaredPaused = await resolveScopeReadiness({ scopesDoc: pausedScopes, certificationsDoc: empty, coverage, manifest, root });
  assert.equal(declaredPaused.readiness[0].reasons[0], "scope_declared_paused");

  const certified = await certifyScope({
    scopesDoc: scopes,
    certificationsDoc: empty,
    scopeId: "star-trek",
    certifiedBy: "second-desk",
    coverage,
    manifest,
    coverageSha256: "1".repeat(64),
    manifestSha256: "2".repeat(64),
    root,
    cwd: root,
    now: "2026-07-21T12:00:00Z",
  });
  assert.equal(certified.certificate.checks[0].status, "passed");
  validateCertifications(certified.certifications);

  const ready = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certified.certifications,
    coverage,
    manifest,
    coverageSha256: "1".repeat(64),
    manifestSha256: "2".repeat(64),
    root,
  });
  assert.equal(ready.readiness[0].effective_status, "active");
  assert.match(ready.readiness[0].lease_token, /^[0-9a-f]{64}$/);
  assert.equal(ready.readiness[0].snapshot_details.complete_receipts, 1);

  const changedScopeCoverage = coverage.map((row) => ({ ...row, category: "Individuals" }));
  const changedSnapshot = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certified.certifications,
    coverage: changedScopeCoverage,
    manifest,
    coverageSha256: "3".repeat(64),
    manifestSha256: "2".repeat(64),
    root,
  });
  assert.notEqual(changedSnapshot.readiness[0].lease_token, ready.readiness[0].lease_token, "a changed scope census invalidates an outstanding lease token");

  const wallProjectionChanged = coverage.map((row) => ({ ...row, performer_on_wall: true, role_on_wall: true, wall_ids: ["UC-999"] }));
  const wallProjectionSnapshot = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certified.certifications,
    coverage: wallProjectionChanged,
    manifest,
    root,
  });
  assert.equal(wallProjectionSnapshot.readiness[0].lease_token, ready.readiness[0].lease_token, "derived wall-coverage changes do not stale the source lease that produced them");

  const unrelatedCoverage = [...coverage, {
    franchise: "Doctor Who", category: "Daleks", character: "Dalek", performer: "Nicholas Briggs",
    source: "https://tardis.fandom.com/wiki/Dalek",
  }];
  const unrelatedSnapshot = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certified.certifications,
    coverage: unrelatedCoverage,
    manifest,
    coverageSha256: "4".repeat(64),
    manifestSha256: "2".repeat(64),
    root,
  });
  assert.equal(unrelatedSnapshot.readiness[0].lease_token, ready.readiness[0].lease_token, "another franchise cannot invalidate this scope's lease");

  const reorderedSnapshot = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certified.certifications,
    coverage: [...coverage].reverse(),
    manifest,
    root,
  });
  assert.equal(reorderedSnapshot.readiness[0].lease_token, ready.readiness[0].lease_token, "row order does not change a scope lease token");

  const changedManifest = { observations: [{ ...manifest.observations[0], revision: 21, content_sha256: "b".repeat(64) }] };
  const changedManifestSnapshot = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certified.certifications,
    coverage,
    manifest: changedManifest,
    root,
  });
  assert.notEqual(changedManifestSnapshot.readiness[0].lease_token, ready.readiness[0].lease_token, "changed scope evidence invalidates an outstanding lease token");


  const preservingScope = structuredClone(scope);
  preservingScope.certification.require_source_snapshot = true;
  const preservingScopes = { version: 1, scopes: [preservingScope] };
  const preservingSnapshot = snapshotReadiness(preservingScope, coverage, manifest);
  await assert.rejects(() => certifyScope({
    scopesDoc: preservingScopes, certificationsDoc: empty, scopeId: "star-trek", certifiedBy: "second-desk",
    coverage, manifest, root, cwd: root, now: "2026-07-21T12:00:00Z",
  }), /no published source snapshot/, "certification fails closed until exact source revisions are published");
  const preservation = {
    version: 1, updated_at: "2026-07-21T11:00:00Z",
    history_guard: { baseline_manifest_sha256: "9".repeat(64), status: "awaiting-independent-copy", precondition_met: false, destructive_rewrite_authorized: false },
    snapshots: [{
      id: "preservation-fixture", status: "pending", created_at: "2026-07-21T11:00:00Z",
      repository_commit: "8".repeat(40), census_manifest_sha256: "7".repeat(64), baseline_manifest_sha256: "9".repeat(64),
      scopes: { "star-trek": { manifest_sha256: preservingSnapshot.manifest_sha256 } },
      public_release: { tag: "preservation-fixture", assets: [
        { kind: "source-bag", name: "sources.tar.gz", url: "https://example.test/sources.tar.gz", sha256: "6".repeat(64), bytes: 10 },
        { kind: "repository-snapshot", name: "repo.tar.gz", url: "https://example.test/repo.tar.gz", sha256: "5".repeat(64), bytes: 20 },
      ] },
      independent_copies: [],
    }],
  };
  const preservationCertified = await certifyScope({
    scopesDoc: preservingScopes, certificationsDoc: empty, scopeId: "star-trek", certifiedBy: "second-desk",
    coverage, manifest, preservation, root, cwd: root, now: "2026-07-21T12:00:00Z",
  });
  assert.equal(preservationCertified.certificate.snapshot.source_snapshot_id, "preservation-fixture");
  const preservationReady = await resolveScopeReadiness({
    scopesDoc: preservingScopes, certificationsDoc: preservationCertified.certifications, coverage, manifest, preservation, root,
  });
  assert.equal(preservationReady.readiness[0].lease_status, "ready");
  assert.match(preservationReady.readiness[0].lease_token, /^[0-9a-f]{64}$/);
  const noCurrentPreservation = await resolveScopeReadiness({
    scopesDoc: preservingScopes, certificationsDoc: preservationCertified.certifications, coverage, manifest: changedManifest, preservation, root,
  });
  assert.equal(noCurrentPreservation.readiness[0].effective_status, "active", "producer remains certified after a source refresh");
  assert.equal(noCurrentPreservation.readiness[0].lease_token, undefined, "new work is blocked until the refreshed exact revisions are archived");
  assert.ok(noCurrentPreservation.readiness[0].reasons.includes("source_snapshot_missing"));

  await writeFile(join(root, "scripts/lib/census-core.mjs"), "export const parser = 2;\n");
  const stale = await resolveScopeReadiness({ scopesDoc: scopes, certificationsDoc: certified.certifications, coverage, manifest, root });
  assert.equal(stale.readiness[0].effective_status, "paused", "producer changes invalidate certification");
  assert.ok(stale.readiness[0].reasons.includes("producer_changed"));
  await writeFile(join(root, "scripts/lib/census-core.mjs"), "export const parser = 1;\n");

  const missingReceipt = snapshotReadiness(scope, coverage, { observations: [] });
  assert.equal(missingReceipt.ready, false);
  assert.ok(missingReceipt.reasons.includes("manifest_receipts_incomplete"));

  const noReceiptScope = structuredClone(scope);
  noReceiptScope.certification.require_manifest_receipts = false;
  const optionalReceipt = snapshotReadiness(noReceiptScope, coverage, { observations: [] });
  assert.equal(optionalReceipt.ready, true, "category-membership adapters may explicitly defer page-receipt completeness while remaining paused for review");

  const contractChanged = structuredClone(scopes);
  contractChanged.scopes[0].refresh.cadence_days = 14;
  const staleContract = await resolveScopeReadiness({ scopesDoc: contractChanged, certificationsDoc: certified.certifications, coverage, manifest, root });
  assert.ok(staleContract.readiness[0].reasons.includes("scope_contract_changed"));

  const fingerprint = await producerFingerprint(scope, { root });
  assert.equal(fingerprint.producer_files.length, 2);
  await assert.rejects(() => producerFingerprint({ ...scope, certification: { ...scope.certification, producer_files: ["../secret"] } }, { root }), /unsafe producer file path/);

  const failingScope = structuredClone(scope);
  failingScope.certification.checks = [{ label: "fails closed", executable: process.execPath, args: ["-e", "process.exit(7)"] }];
  assert.throws(() => runScopeChecks(failingScope, { cwd: root }), /failed with exit 7/);

  const duplicate = structuredClone(certified.certifications);
  duplicate.certifications.push(structuredClone(duplicate.certifications[0]));
  assert.throws(() => validateCertifications(duplicate), /duplicate certification/);

  console.log("PASS — scope certification, producer drift, snapshot receipts, and lease-token fixtures");
} finally {
  await rm(root, { recursive: true, force: true });
}
