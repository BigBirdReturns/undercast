#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  rebaseQualityAfterKnownCorrections,
  validateQualityBaselineCustody,
} from "./estate-quality-baseline.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const root = await mkdtemp(path.join(tmpdir(), "undercast-quality-reset-"));

try {
  await mkdir(path.join(root, "data", "review", "estate-debt"), { recursive: true });
  const specimens = Buffer.from('[{"id":"UC-1"}]\n');
  const sources = Buffer.from('[{"id":"UC-1"}]\n');
  await writeFile(path.join(root, "data", "specimens.json"), specimens);
  await writeFile(path.join(root, "data", "SOURCES.json"), sources);

  const baselineV1 = {
    version: 1,
    minimum_complete_pair_ratio: 0.54,
    maximum_missing_both_ratio: 0.12,
    minimum_known_maker_ratio: 0.53,
    minimum_claim_evidence_ratio: 0.01,
  };
  const beforeMetrics = {
    complete_pairs: 60,
    complete_pair_ratio: 0.6,
    missing_still: 20,
    missing_portrait: 20,
    missing_both: 10,
    missing_both_ratio: 0.1,
    known_makers: 70,
    known_maker_ratio: 0.7,
    records_with_claim_evidence: 50,
    claim_evidence_ratio: 0.5,
  };
  const afterMetrics = {
    complete_pairs: 20,
    complete_pair_ratio: 0.2,
    missing_still: 50,
    missing_portrait: 51,
    missing_both: 31,
    missing_both_ratio: 0.31,
    known_makers: 70,
    known_maker_ratio: 0.7,
    records_with_claim_evidence: 50,
    claim_evidence_ratio: 0.5,
  };
  const beforeQuality = { version: 1, generated_from: "a".repeat(64), total: 100, metrics: beforeMetrics, baseline: baselineV1 };
  const afterQuality = { version: 1, generated_from: "b".repeat(64), total: 100, metrics: afterMetrics, baseline: baselineV1 };
  const beforePath = path.join(root, "before-quality.json");
  await writeFile(beforePath, json(beforeQuality));
  await writeFile(path.join(root, "data", "quality-baseline.json"), json(baselineV1));
  await writeFile(path.join(root, "data", "quality.json"), json(afterQuality));

  const correction = {
    version: 1,
    transaction: "COLLECT-001",
    operation: "known-invalid-media-binding-nullification",
    mode: "write",
    source: {
      specimens: { after_sha256: sha256(specimens) },
      sources: { after_sha256: sha256(sources) },
    },
    denominator: { obligations: 61, collected: 61, already_collected: 0 },
  };
  const correctionPath = path.join(root, "data", "review", "estate-debt", "COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json");
  await writeFile(correctionPath, json(correction));

  const dryRun = await rebaseQualityAfterKnownCorrections({ root, beforeQualityPath: beforePath, write: false, now: "2026-07-31T00:00:00.000Z" });
  assert.equal(dryRun.receipt.authorized_delta.corrected_bindings, 61);
  assert.equal(dryRun.receipt.authorized_delta.complete_pairs_removed, 40);
  assert.equal(dryRun.receipt.authorized_delta.missing_both_added, 21);
  assert.equal(dryRun.receipt.authorized_delta.missing_sides_added, 61);
  assert.equal(dryRun.baseline.minimum_complete_pair_ratio, 0.2);
  assert.equal(dryRun.baseline.maximum_missing_both_ratio, 0.31);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, "data", "quality-baseline.json"), "utf8")), baselineV1, "dry-run must not change baseline");

  const applied = await rebaseQualityAfterKnownCorrections({ root, beforeQualityPath: beforePath, write: true, now: "2026-07-31T00:00:00.000Z" });
  const baselineV2 = JSON.parse(await readFile(path.join(root, "data", "quality-baseline.json"), "utf8"));
  assert.deepEqual(baselineV2, applied.baseline);
  assert.equal(baselineV2.version, 2);
  assert.equal(baselineV2.minimum_known_maker_ratio, baselineV1.minimum_known_maker_ratio);
  assert.equal(baselineV2.minimum_claim_evidence_ratio, baselineV1.minimum_claim_evidence_ratio);

  afterQuality.baseline = baselineV2;
  await writeFile(path.join(root, "data", "quality.json"), json(afterQuality));
  const validated = await validateQualityBaselineCustody({ root });
  assert.equal(validated.mode, "receipted-v2");

  const improvedQuality = JSON.parse(JSON.stringify(afterQuality));
  improvedQuality.metrics.complete_pairs = 21;
  improvedQuality.metrics.complete_pair_ratio = 0.21;
  improvedQuality.metrics.missing_both = 30;
  improvedQuality.metrics.missing_both_ratio = 0.3;
  await writeFile(path.join(root, "data", "quality.json"), json(improvedQuality));
  await validateQualityBaselineCustody({ root });

  const regressedQuality = JSON.parse(JSON.stringify(afterQuality));
  regressedQuality.metrics.complete_pairs = 19;
  regressedQuality.metrics.complete_pair_ratio = 0.19;
  await writeFile(path.join(root, "data", "quality.json"), json(regressedQuality));
  await assert.rejects(() => validateQualityBaselineCustody({ root }), /complete image-pair ratio fell below/);

  await writeFile(path.join(root, "data", "quality.json"), json(afterQuality));
  correction.denominator.collected = 60;
  await writeFile(correctionPath, json(correction));
  await assert.rejects(() => validateQualityBaselineCustody({ root }), /report hash differs/);

  console.log("PASS — zero-margin quality reset, exact 61-binding delta, unchanged non-media floors, future improvement, future regression, and receipt tamper rejection");
} finally {
  await rm(root, { recursive: true, force: true });
}
