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
  correction.denominator.collected = 61;
  await writeFile(correctionPath, json(correction));
  await validateQualityBaselineCustody({ root });

  // A later audit nulls five more bindings on top of the receipted v2 floor. The regressed
  // projection fails closed until a chained, receipted reset names the new transaction.
  const specimensV3 = Buffer.from('[{"id":"UC-1"},{"id":"UC-2"}]\n');
  await writeFile(path.join(root, "data", "specimens.json"), specimensV3);
  const correctionV3 = {
    version: 1,
    transaction: "UC-MEDIA-AUDIT-2",
    operation: "known-invalid-media-binding-nullification",
    mode: "write",
    source: {
      specimens: { after_sha256: sha256(specimensV3) },
      sources: { after_sha256: sha256(sources) },
    },
    denominator: { obligations: 5, collected: 5, already_collected: 0 },
  };
  const correctionV3Relative = "data/review/estate-debt/UC-MEDIA-AUDIT-2-KNOWN-MEDIA-CORRECTIONS-APPLY.json";
  const receiptV3Relative = "data/review/estate-debt/UC-MEDIA-AUDIT-2-QUALITY-BASELINE-RESET.json";
  await writeFile(path.join(root, correctionV3Relative), json(correctionV3));
  const chainedMetrics = {
    complete_pairs: 17,
    complete_pair_ratio: 0.17,
    missing_still: 53,
    missing_portrait: 53,
    missing_both: 33,
    missing_both_ratio: 0.33,
    known_makers: 70,
    known_maker_ratio: 0.7,
    records_with_claim_evidence: 50,
    claim_evidence_ratio: 0.5,
  };
  const beforeV3Path = path.join(root, "before-v3-quality.json");
  await writeFile(beforeV3Path, json(afterQuality));
  const chainedQuality = { version: 1, generated_from: "c".repeat(64), total: 100, metrics: chainedMetrics, baseline: baselineV2 };
  await writeFile(path.join(root, "data", "quality.json"), json(chainedQuality));
  await assert.rejects(() => validateQualityBaselineCustody({ root }), /fell below the receipted corrected floor/);
  await assert.rejects(() => rebaseQualityAfterKnownCorrections({ root, beforeQualityPath: beforeV3Path, write: false }), /fell below the receipted corrected floor/, "an unchained call on a receipted baseline only validates");
  const chainArgs = { root, beforeQualityPath: beforeV3Path, chain: true, correctionReportPath: correctionV3Relative, receiptPath: receiptV3Relative, now: "2026-10-22T00:00:00.000Z" };
  await assert.rejects(() => rebaseQualityAfterKnownCorrections({ ...chainArgs, transaction: "COLLECT-001", write: false }), /already carries a reset for COLLECT-001/);
  await assert.rejects(() => rebaseQualityAfterKnownCorrections({ ...chainArgs, transaction: "UC-MEDIA-AUDIT-3", write: false }), /requires the written UC-MEDIA-AUDIT-3 correction report/);
  const chained = await rebaseQualityAfterKnownCorrections({ ...chainArgs, transaction: "UC-MEDIA-AUDIT-2", write: true });
  assert.equal(chained.baseline.version, 3);
  assert.equal(chained.receipt.transaction, "UC-MEDIA-AUDIT-2");
  assert.equal(chained.receipt.authorized_delta.corrected_bindings, 5);
  assert.equal(chained.receipt.authorized_delta.complete_pairs_removed, 3);
  assert.equal(chained.receipt.authorized_delta.missing_both_added, 2);
  assert.equal(chained.receipt.authorized_delta.missing_sides_added, 5);
  assert.deepEqual(chained.receipt.previous_baseline, baselineV2);
  assert.equal(chained.baseline.minimum_complete_pair_ratio, 0.17);
  assert.equal(chained.baseline.maximum_missing_both_ratio, 0.33);
  assert.equal(chained.baseline.minimum_known_maker_ratio, baselineV1.minimum_known_maker_ratio);
  assert.equal(chained.baseline.minimum_claim_evidence_ratio, baselineV1.minimum_claim_evidence_ratio);
  assert.match(chained.baseline.reset_reason, /after 5 proven-wrong/);
  const baselineV3 = JSON.parse(await readFile(path.join(root, "data", "quality-baseline.json"), "utf8"));
  assert.deepEqual(baselineV3, chained.baseline);
  chainedQuality.baseline = baselineV3;
  await writeFile(path.join(root, "data", "quality.json"), json(chainedQuality));
  const validatedV3 = await validateQualityBaselineCustody({ root });
  assert.equal(validatedV3.mode, "receipted-v3");
  assert.deepEqual(validatedV3.lineage, ["COLLECT-001", "UC-MEDIA-AUDIT-2"]);

  // The earlier link stays load-bearing: tampering with the v2 receipt breaks the v3 chain.
  const receiptV2Path = path.join(root, "data", "review", "estate-debt", "COLLECT-001-QUALITY-BASELINE-RESET.json");
  const receiptV2Bytes = await readFile(receiptV2Path);
  const receiptV2 = JSON.parse(receiptV2Bytes.toString("utf8"));
  receiptV2.authorized_delta.corrected_bindings = 60;
  await writeFile(receiptV2Path, json(receiptV2));
  await assert.rejects(() => validateQualityBaselineCustody({ root }), /requires exactly 60 collected|does not reconcile to 60/);
  await writeFile(receiptV2Path, receiptV2Bytes);
  await validateQualityBaselineCustody({ root });

  console.log("PASS — zero-margin quality reset, exact 61-binding delta, unchanged non-media floors, future improvement, future regression, receipt tamper rejection, and a chained second reset with verified lineage");
} finally {
  await rm(root, { recursive: true, force: true });
}
