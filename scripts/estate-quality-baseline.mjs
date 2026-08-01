#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASELINE = "data/quality-baseline.json";
const DEFAULT_QUALITY = "data/quality.json";
const DEFAULT_CORRECTION_REPORT = "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json";
const DEFAULT_RESET_RECEIPT = "data/review/estate-debt/COLLECT-001-QUALITY-BASELINE-RESET.json";
const DEFAULT_SPECIMENS = "data/specimens.json";
const DEFAULT_SOURCES = "data/SOURCES.json";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  if (!text || path.isAbsolute(text) || text.split("/").includes("..")) throw new Error(`${label} must be a safe repository-relative path`);
  return text;
}

async function readJsonFile(absolute, label) {
  const bytes = await readFile(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${label}: ${error.message}`); }
  return { absolute, bytes, sha256: sha256(bytes), value };
}

async function readRepoJson(root, relative, label = relative) {
  const safe = safeRelative(relative, label);
  return { path: safe, ...(await readJsonFile(path.join(root, safe), label)) };
}

function metrics(value, label) {
  const row = value?.metrics;
  const fields = [
    "complete_pairs", "complete_pair_ratio", "missing_still", "missing_portrait",
    "missing_both", "missing_both_ratio", "known_makers", "known_maker_ratio",
    "records_with_claim_evidence", "claim_evidence_ratio",
  ];
  if (!row || !fields.every((field) => Number.isFinite(row[field]))) throw new Error(`${label} lacks complete quality metrics`);
  return Object.fromEntries(fields.map((field) => [field, row[field]]));
}

function sameJson(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function exactRatio(count, total) { return Number((count / total).toFixed(6)); }

async function exists(absolute) {
  try { await access(absolute); return true; }
  catch { return false; }
}

async function atomicJsonTransaction(entries) {
  const token = `${process.pid}-${Date.now()}`;
  const prepared = [];
  for (const entry of entries) {
    await mkdir(path.dirname(entry.absolute), { recursive: true });
    const temp = `${entry.absolute}.tmp.${token}`;
    const backup = `${entry.absolute}.bak.${token}`;
    const existed = await exists(entry.absolute);
    await writeFile(temp, jsonBytes(entry.value));
    prepared.push({ ...entry, temp, backup, existed, backupReady: false, installed: false });
  }
  try {
    for (const entry of prepared) {
      if (entry.existed) { await rename(entry.absolute, entry.backup); entry.backupReady = true; }
      await rename(entry.temp, entry.absolute);
      entry.installed = true;
    }
    for (const entry of prepared) if (entry.backupReady) await rm(entry.backup, { force: true });
  } catch (error) {
    for (const entry of prepared.reverse()) {
      if (entry.installed) await rm(entry.absolute, { force: true }).catch(() => {});
      if (entry.backupReady) await rename(entry.backup, entry.absolute).catch(() => {});
      await rm(entry.temp, { force: true }).catch(() => {});
    }
    throw error;
  }
}

function validateNumericBaseline(baseline) {
  for (const key of ["minimum_complete_pair_ratio", "maximum_missing_both_ratio", "minimum_known_maker_ratio", "minimum_claim_evidence_ratio"]) {
    if (!Number.isFinite(baseline?.[key])) throw new Error(`quality baseline lacks numeric ${key}`);
  }
}

export async function validateQualityBaselineCustody({
  root = process.cwd(),
  baselinePath = DEFAULT_BASELINE,
  qualityPath = DEFAULT_QUALITY,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const baseline = await readRepoJson(resolvedRoot, baselinePath, "quality baseline");
  const quality = await readRepoJson(resolvedRoot, qualityPath, "quality projection");
  validateNumericBaseline(baseline.value);
  const currentMetrics = metrics(quality.value, "quality projection");
  if (!sameJson(quality.value.baseline, baseline.value)) throw new Error("quality projection does not embed the exact current baseline");
  if (currentMetrics.complete_pair_ratio < baseline.value.minimum_complete_pair_ratio) throw new Error("complete image-pair ratio fell below the receipted corrected floor");
  if (currentMetrics.missing_both_ratio > baseline.value.maximum_missing_both_ratio) throw new Error("fully unillustrated ratio exceeded the receipted corrected ceiling");
  if (currentMetrics.known_maker_ratio < baseline.value.minimum_known_maker_ratio) throw new Error("known-maker ratio fell below baseline");
  if (currentMetrics.claim_evidence_ratio < baseline.value.minimum_claim_evidence_ratio) throw new Error("claim-evidence ratio fell below baseline");

  if (baseline.value.version === 1) {
    return { mode: "legacy-v1", baseline: baseline.value, metrics: currentMetrics };
  }
  if (baseline.value.version !== 2) throw new Error(`unsupported quality baseline version ${baseline.value.version}`);
  const receiptPath = safeRelative(baseline.value.reset_receipt, "quality baseline reset_receipt");
  const receipt = await readRepoJson(resolvedRoot, receiptPath, "quality baseline reset receipt");
  if (receipt.value.version !== 1 || receipt.value.transaction !== "COLLECT-001" || receipt.value.operation !== "truth-correction-quality-rebaseline") {
    throw new Error("quality baseline reset receipt has an unsupported identity");
  }
  if (!sameJson(receipt.value.new_baseline, baseline.value)) throw new Error("quality baseline differs from its reset receipt");
  const correctionPath = safeRelative(receipt.value.correction_report?.path, "correction report path");
  const correction = await readRepoJson(resolvedRoot, correctionPath, "known-media correction report");
  if (correction.sha256 !== receipt.value.correction_report.sha256) throw new Error("known-media correction report hash differs from the quality reset receipt");
  if (correction.value.transaction !== "COLLECT-001" || correction.value.operation !== "known-invalid-media-binding-nullification") throw new Error("quality reset cites the wrong correction transaction");
  if (correction.value.denominator?.obligations !== 61 || correction.value.denominator?.collected !== 61) throw new Error("quality reset requires exactly 61 collected current-main corrections");
  const delta = receipt.value.authorized_delta || {};
  if (!Number.isInteger(delta.complete_pairs_removed) || !Number.isInteger(delta.missing_both_added) || delta.complete_pairs_removed + delta.missing_both_added !== 61) {
    throw new Error("quality reset delta does not reconcile to 61 corrected bindings");
  }
  if (baseline.value.minimum_complete_pair_ratio !== receipt.value.after_metrics.complete_pair_ratio) throw new Error("complete-pair floor is not exact corrected truth");
  if (baseline.value.maximum_missing_both_ratio !== receipt.value.after_metrics.missing_both_ratio) throw new Error("missing-both ceiling is not exact corrected truth");
  if (baseline.value.minimum_known_maker_ratio !== receipt.value.previous_baseline.minimum_known_maker_ratio) throw new Error("quality reset changed the maker floor");
  if (baseline.value.minimum_claim_evidence_ratio !== receipt.value.previous_baseline.minimum_claim_evidence_ratio) throw new Error("quality reset changed the claim-evidence floor");
  return { mode: "receipted-v2", baseline: baseline.value, metrics: currentMetrics, receipt: receipt.value };
}

export async function rebaseQualityAfterKnownCorrections({
  root = process.cwd(),
  beforeQualityPath,
  baselinePath = DEFAULT_BASELINE,
  qualityPath = DEFAULT_QUALITY,
  correctionReportPath = DEFAULT_CORRECTION_REPORT,
  receiptPath = DEFAULT_RESET_RECEIPT,
  specimensPath = DEFAULT_SPECIMENS,
  sourcesPath = DEFAULT_SOURCES,
  write = false,
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = path.resolve(root);
  const baseline = await readRepoJson(resolvedRoot, baselinePath, "quality baseline");
  if (baseline.value.version === 2) return validateQualityBaselineCustody({ root: resolvedRoot, baselinePath, qualityPath });
  if (baseline.value.version !== 1) throw new Error(`quality baseline must begin at version 1, found ${baseline.value.version}`);
  validateNumericBaseline(baseline.value);
  if (!beforeQualityPath) throw new Error("quality rebaseline requires --before-quality");
  const beforeAbsolute = path.isAbsolute(beforeQualityPath) ? beforeQualityPath : path.join(resolvedRoot, safeRelative(beforeQualityPath, "before quality path"));
  const before = await readJsonFile(beforeAbsolute, "pre-correction quality projection");
  const after = await readRepoJson(resolvedRoot, qualityPath, "corrected quality projection");
  const correction = await readRepoJson(resolvedRoot, correctionReportPath, "known-media correction report");
  const specimensBytes = await readFile(path.join(resolvedRoot, safeRelative(specimensPath, "specimens path")));
  const sourcesBytes = await readFile(path.join(resolvedRoot, safeRelative(sourcesPath, "sources path")));

  if (correction.value.transaction !== "COLLECT-001" || correction.value.operation !== "known-invalid-media-binding-nullification" || correction.value.mode !== "write") throw new Error("quality rebaseline requires the written COLLECT-001 correction report");
  if (correction.value.denominator?.obligations !== 61 || correction.value.denominator?.collected !== 61 || correction.value.denominator?.already_collected !== 0) throw new Error("quality rebaseline requires exactly 61 freshly collected corrections");
  if (sha256(specimensBytes) !== correction.value.source?.specimens?.after_sha256) throw new Error("current specimens bytes differ from the correction report");
  if (sha256(sourcesBytes) !== correction.value.source?.sources?.after_sha256) throw new Error("current SOURCES bytes differ from the correction report");
  if (before.value.total !== after.value.total || after.value.total < 1) throw new Error("quality rebaseline changed the catalog denominator");
  const beforeMetrics = metrics(before.value, "pre-correction quality projection");
  const afterMetrics = metrics(after.value, "corrected quality projection");
  const completePairsRemoved = beforeMetrics.complete_pairs - afterMetrics.complete_pairs;
  const missingBothAdded = afterMetrics.missing_both - beforeMetrics.missing_both;
  const missingSidesAdded = (afterMetrics.missing_still - beforeMetrics.missing_still) + (afterMetrics.missing_portrait - beforeMetrics.missing_portrait);
  if (!Number.isInteger(completePairsRemoved) || !Number.isInteger(missingBothAdded) || completePairsRemoved < 0 || missingBothAdded < 0) throw new Error("quality correction deltas are not monotonic nullifications");
  if (completePairsRemoved + missingBothAdded !== 61 || missingSidesAdded !== 61) throw new Error(`quality correction deltas do not reconcile to 61 bindings: pairs=${completePairsRemoved}, both=${missingBothAdded}, sides=${missingSidesAdded}`);
  if (beforeMetrics.known_makers !== afterMetrics.known_makers || beforeMetrics.records_with_claim_evidence !== afterMetrics.records_with_claim_evidence) throw new Error("media corrections changed non-media quality counts");
  if (afterMetrics.complete_pair_ratio !== exactRatio(afterMetrics.complete_pairs, after.value.total) || afterMetrics.missing_both_ratio !== exactRatio(afterMetrics.missing_both, after.value.total)) throw new Error("corrected quality ratios are not deterministic");

  const receiptSafe = safeRelative(receiptPath, "quality reset receipt path");
  const newBaseline = {
    version: 2,
    minimum_complete_pair_ratio: afterMetrics.complete_pair_ratio,
    maximum_missing_both_ratio: afterMetrics.missing_both_ratio,
    minimum_known_maker_ratio: baseline.value.minimum_known_maker_ratio,
    minimum_claim_evidence_ratio: baseline.value.minimum_claim_evidence_ratio,
    reset_receipt: receiptSafe,
    reset_reason: "Exact reset to the truth-corrected state after 61 proven-wrong current-main media bindings were nulled; no regression margin was added.",
  };
  const receipt = {
    version: 1,
    transaction: "COLLECT-001",
    operation: "truth-correction-quality-rebaseline",
    generated_at: now,
    correction_report: { path: correction.path, sha256: correction.sha256 },
    previous_quality: { sha256: before.sha256, total: before.value.total },
    corrected_quality_before_reset: { path: after.path, sha256: after.sha256, total: after.value.total },
    previous_baseline: baseline.value,
    new_baseline: newBaseline,
    before_metrics: beforeMetrics,
    after_metrics: afterMetrics,
    authorized_delta: {
      corrected_bindings: 61,
      complete_pairs_removed: completePairsRemoved,
      missing_both_added: missingBothAdded,
      missing_sides_added: missingSidesAdded,
    },
    invariants: {
      exact_corrected_state_becomes_floor: true,
      no_margin_added: true,
      maker_floor_unchanged: true,
      claim_evidence_floor_unchanged: true,
      future_pair_removal_fails_closed: true,
      future_missing_both_increase_fails_closed: true,
    },
  };
  if (write) {
    await atomicJsonTransaction([
      { absolute: path.join(resolvedRoot, receiptSafe), value: receipt },
      { absolute: baseline.absolute, value: newBaseline },
    ]);
  }
  return { mode: write ? "write" : "dry-run", baseline: newBaseline, receipt };
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export async function main(argv = process.argv.slice(2)) {
  const root = path.resolve(option(argv, "--root", "."));
  const write = argv.includes("--write");
  const validateOnly = argv.includes("--validate");
  const result = validateOnly
    ? await validateQualityBaselineCustody({ root })
    : await rebaseQualityAfterKnownCorrections({
      root,
      beforeQualityPath: option(argv, "--before-quality"),
      write,
      now: option(argv, "--now", new Date().toISOString()),
    });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`quality baseline custody failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
