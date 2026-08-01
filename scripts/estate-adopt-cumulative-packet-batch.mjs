#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  plan: "data/review/estate-debt/COLLECT-004-CANONICAL-ADOPTION-PLAN.json",
  importReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  correctionReceipt: "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-004-CANONICAL-ADOPTION.json",
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const round6 = (value) => Number(Number(value).toFixed(6));
const keyFor = (id, side) => `${id}/${side}`;
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function has(name) { return args.includes(name); }
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  return value;
}
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  assert(text && !path.isAbsolute(text) && !text.split("/").includes(".."), `${label} must be repository-relative`);
  return text;
}
function resolveInside(root, relativePath, label = "path") {
  const safe = safeRelative(relativePath, label);
  const absolute = path.resolve(root, safe);
  assert(absolute === root || absolute.startsWith(`${root}${path.sep}`), `${label} escapes repository root`);
  return { safe, absolute };
}
async function exists(absolutePath) { try { await access(absolutePath); return true; } catch { return false; } }
async function readJson(root, relativePath, label = relativePath) {
  const resolved = resolveInside(root, relativePath, label);
  const bytes = await readFile(resolved.absolute);
  try { return { ...resolved, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) }; }
  catch (error) { fail(`cannot parse ${resolved.safe}: ${error.message}`); }
}
async function readJsonAny(filePath, label) {
  const absolute = path.resolve(filePath);
  const bytes = await readFile(absolute);
  try { return { absolute, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) }; }
  catch (error) { fail(`cannot parse ${label}: ${error.message}`); }
}
function exactRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected exactly one row, found ${matches.length}`);
  return matches[0];
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function parseChecksums(text, label) {
  const result = new Map();
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    assert(match, `${label}:${index + 1} is not a SHA-256 row`);
    const name = match[2].trim().replace(/^\.\//, "");
    assert(name && !result.has(name), `${label} repeats ${name}`);
    result.set(name, match[1].toLowerCase());
  }
  assert(result.size, `${label} is empty`);
  return result;
}
function assertJpeg(bytes, label) {
  assert(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label} is not a complete JPEG`);
}
function acceptedIdentity(value) {
  return /^(?:expected-subject(?:$|-)|expected-subjects$)/.test(String(value || ""));
}
function acceptedPresentation(value) {
  const typed = String(value || "");
  return /(?:^|-)character-depiction$/.test(typed)
    || /^(?:two|three)-role-character-composite$/.test(typed);
}
function acceptedDisposition(value) {
  return new Set(["reviewed-evidence-candidate", "reviewed-evidence-ready-for-canonical-consideration"]).has(value);
}
function cropPassed(review) {
  if (String(review?.crop_ruling || "").startsWith("pass")) return true;
  return Array.isArray(review?.notes) && review.notes.some((note) => /(?:wall|card)[ -]?crop/i.test(String(note)));
}
function validateImage(image, label) {
  assert(image && typeof image === "object" && !Array.isArray(image), `${label} must be an object`);
  assert(image.kind === "still", `${label}.kind must be still`);
  assert(/^https?:\/\//.test(image.origin || ""), `${label}.origin must be HTTP(S)`);
  assert(image.pin === true, `${label}.pin must be true`);
  assert(new Set(["left", "center", "right"]).has(image.focus?.x), `${label}.focus.x is invalid`);
  assert(new Set(["top", "upper", "center", "lower", "bottom"]).has(image.focus?.y), `${label}.focus.y is invalid`);
}
function intendedImage(row) { return { src: row.destination_path, ...row.image }; }

function validatePlan(plan) {
  assert(plan?.version === 1, "COLLECT-004 plan version must be 1");
  assert(plan.transaction === "COLLECT-004" && plan.batch === 2, "plan is not COLLECT-004 batch 2");
  assert(plan.operation === "bounded-canonical-media-adoption" && plan.status === "authorized", "COLLECT-004 plan is not authorized");
  assert(plan.boundary?.canonical_mutation === true, "COLLECT-004 must authorize canonical mutation");
  assert(plan.boundary?.discovery_permitted === false, "COLLECT-004 may not perform discovery");
  assert(plan.boundary?.new_source_policy_permitted === false, "COLLECT-004 may not create source policy");
  assert(plan.boundary?.new_supervisor_permitted === false, "COLLECT-004 may not create a supervisor");
  assert(plan.quality_contract?.baseline_reset_permitted === false, "COLLECT-004 may not reset the quality baseline");
  assert(Array.isArray(plan.adoptions) && plan.adoptions.length === 5, "COLLECT-004 requires exactly five adoptions");
  assert(plan.boundary.adoption_count === 5, "COLLECT-004 denominator drifted");
  const keys = new Set();
  const destinations = new Set();
  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    assert(/^UC-\d+\/still$/.test(key), `invalid adoption ${key}`);
    assert(!keys.has(key), `duplicate adoption ${key}`);
    keys.add(key);
    for (const field of ["packet_root", "manifest_path", "checksum_path", "candidate_path", "destination_path"]) safeRelative(row[field], `${key}.${field}`);
    assert(/^data\/review\/card-backfill\/UC-\d+$/.test(row.packet_root), `${key} packet root is not permanent evidence`);
    assert(row.manifest_path.startsWith(`${row.packet_root}/`) && row.checksum_path.startsWith(`${row.packet_root}/`) && row.candidate_path.startsWith(`${row.packet_root}/`), `${key} packet path escapes its root`);
    assert(/^[0-9a-f]{64}$/.test(row.manifest_sha256 || ""), `${key} manifest hash is malformed`);
    assert(/^[0-9a-f]{64}$/.test(row.candidate_sha256 || ""), `${key} candidate hash is malformed`);
    assert(row.candidate_mime === "image/jpeg", `${key} candidate must be JPEG`);
    assert(/^images\/uc-\d+-still-[0-9a-f]{12}\.jpg$/.test(row.destination_path), `${key} destination is not versioned`);
    assert(row.destination_path.includes(row.candidate_sha256.slice(0, 12)), `${key} destination lacks candidate hash prefix`);
    assert(!destinations.has(row.destination_path), `duplicate destination ${row.destination_path}`);
    destinations.add(row.destination_path);
    assert(row.actor && row.character, `${key} lacks identity`);
    validateImage(row.image, `${key}.image`);
    assert(row.correction?.ledger && row.correction?.invalid_path && /^[0-9a-f]{64}$/.test(row.correction.invalid_sha256 || ""), `${key} lacks correction custody`);
    assert(row.correction.invalid_path !== row.destination_path, `${key} would overwrite historical invalid bytes`);
  }
  return plan;
}

async function inspectTransaction({ root = process.cwd(), planPath = DEFAULTS.plan } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [planDoc, importDoc, correctionDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readJson(resolvedRoot, planPath, "COLLECT-004 plan"),
    readJson(resolvedRoot, DEFAULTS.importReceipt, "COLLECT-002 receipt"),
    readJson(resolvedRoot, DEFAULTS.correctionReceipt, "COLLECT-001 correction receipt"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readJson(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readJson(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const plan = validatePlan(planDoc.value);
  const ledger = ledgerDoc.value;
  assert(importDoc.value?.transaction === "COLLECT-002" && importDoc.value?.counts?.packets === plan.custody.imported_packet_denominator, "COLLECT-002 denominator drifted");
  assert(importDoc.value?.source?.head_sha === plan.custody.source_head, "COLLECT-002 source head drifted");
  assert(correctionDoc.value?.transaction === "COLLECT-001", "correction receipt is not COLLECT-001");
  assert(ledger.cumulative?.canonical_adoptions === plan.custody.prior_canonical_adoptions, "prior cumulative adoption count drifted");
  assert(ledger.cumulative?.remaining_for_canonical_review === plan.custody.prior_remaining_for_review, "prior remaining count drifted");
  const priorAdoptions = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const contexts = [];

  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    assert(!priorAdoptions.has(key), `${key} was already paid in an earlier batch`);
    const imported = exactRow(importDoc.value.packets || [], (item) => item.obligation_id === key, `${key} imported packet`);
    assert(imported.root === row.packet_root && imported.manifest_path === row.manifest_path && imported.manifest_sha256 === row.manifest_sha256, `${key} imported packet custody drifted`);
    const corrected = exactRow(correctionDoc.value.obligations || [], (item) => item.id === row.record_id && item.side === row.side, `${key} correction obligation`);
    assert(corrected.ledger === row.correction.ledger, `${key} correction ledger drifted`);
    assert(corrected.preserved_path === row.correction.invalid_path && corrected.sha256 === row.correction.invalid_sha256 && corrected.preserved_asset?.sha256 === row.correction.invalid_sha256, `${key} historical invalid custody drifted`);

    const manifestDoc = await readJson(resolvedRoot, row.manifest_path, `${key} manifest`);
    assert(manifestDoc.sha256 === row.manifest_sha256, `${key} manifest bytes drifted`);
    const manifest = manifestDoc.value;
    assert(manifest.record_id === row.record_id && manifest.side === row.side, `${key} manifest identity drifted`);
    assert(manifest.actor === row.actor && manifest.character === row.character, `${key} filed identity differs from packet`);
    if (row.production && manifest.production) assert(manifest.production === row.production, `${key} production differs from packet`);
    assert(manifest.canonical_mutation === false, `${key} packet is not evidence-only`);
    assert(manifest.reviewed_by && manifest.reviewed_role, `${key} lacks independent review custody`);
    assert(acceptedDisposition(manifest.disposition), `${key} packet disposition is not adoption-ready`);
    assert(acceptedIdentity(manifest.exact_subject_review?.identity), `${key} exact-subject identity ruling is not typed as expected-subject*`);
    assert(acceptedPresentation(manifest.exact_subject_review?.presentation), `${key} presentation is not a typed *character-depiction`);
    assert(cropPassed(manifest.exact_subject_review), `${key} lacks passing card-crop custody`);
    assert(manifest.candidate?.path === path.posix.basename(row.candidate_path), `${key} candidate path drifted`);
    assert(manifest.candidate?.sha256 === row.candidate_sha256 && manifest.candidate?.mime === row.candidate_mime, `${key} candidate receipt drifted`);

    const checksumBytes = await readFile(resolveInside(resolvedRoot, row.checksum_path, `${key} checksums`).absolute);
    const checksums = parseChecksums(checksumBytes.toString("utf8"), row.checksum_path);
    assert(checksums.get(path.posix.basename(row.manifest_path)) === row.manifest_sha256, `${key} checksum ledger does not bind manifest`);
    assert(checksums.get(path.posix.basename(row.candidate_path)) === row.candidate_sha256, `${key} checksum ledger does not bind candidate`);
    const candidate = resolveInside(resolvedRoot, row.candidate_path, `${key} candidate`);
    const candidateBytes = await readFile(candidate.absolute);
    assert(sha256(candidateBytes) === row.candidate_sha256, `${key} candidate bytes drifted`);
    assertJpeg(candidateBytes, `${key} candidate`);
    const duplicate = await readJson(resolvedRoot, `${row.packet_root}/duplicate-scan.json`, `${key} duplicate scan`);
    assert(String(duplicate.value?.status || "").toLowerCase() === "pass", `${key} duplicate scan did not pass`);
    const invalid = resolveInside(resolvedRoot, row.correction.invalid_path, `${key} historical invalid asset`);
    const invalidBytes = await readFile(invalid.absolute);
    assert(sha256(invalidBytes) === row.correction.invalid_sha256, `${key} historical invalid bytes drifted`);

    const specimen = exactRow(specimensDoc.value, (item) => item.id === row.record_id, `${key} specimen`);
    const source = exactRow(sourcesDoc.value, (item) => item.id === row.record_id, `${key} source`);
    const intended = intendedImage(row);
    const destination = resolveInside(resolvedRoot, row.destination_path, `${key} destination`);
    const destinationExists = await exists(destination.absolute);
    const specimenCurrent = specimen[row.side] ?? null;
    const sourceCurrent = source[row.side] ?? null;
    let state;
    if (specimenCurrent === null && sourceCurrent === null) {
      assert(!destinationExists, `${key} versioned destination already exists before adoption`);
      state = "pending";
    } else {
      assert(sameJson(specimenCurrent, intended) && sameJson(sourceCurrent, intended), `${key} current binding is neither null nor the exact planned adoption`);
      assert(destinationExists, `${key} exact adopted destination is missing`);
      const destinationBytes = await readFile(destination.absolute);
      assert(sha256(destinationBytes) === row.candidate_sha256, `${key} adopted destination bytes drifted`);
      state = "already-adopted";
    }
    contexts.push({ key, row, manifest, candidateBytes, destination, state, intended });
  }
  return { root: resolvedRoot, plan, planDoc, importDoc, correctionDoc, ledgerDoc, specimensDoc, sourcesDoc, contexts };
}

async function atomicWrite(entries) {
  const prepared = [];
  for (const [index, entry] of entries.entries()) {
    await mkdir(path.dirname(entry.absolute), { recursive: true });
    const temporary = `${entry.absolute}.collect-${process.pid}-${index}.tmp`;
    const backup = `${entry.absolute}.collect-${process.pid}-${index}.bak`;
    await writeFile(temporary, entry.bytes);
    prepared.push({ ...entry, temporary, backup, existed: await exists(entry.absolute) });
  }
  const installed = [];
  try {
    for (const entry of prepared) {
      if (entry.existed) await rename(entry.absolute, entry.backup);
      await rename(entry.temporary, entry.absolute);
      installed.push(entry);
    }
    for (const entry of installed) if (entry.existed) await rm(entry.backup, { force: true });
  } catch (error) {
    for (const entry of installed.reverse()) {
      await rm(entry.absolute, { force: true }).catch(() => {});
      if (entry.existed) await rename(entry.backup, entry.absolute).catch(() => {});
    }
    for (const entry of prepared) await rm(entry.temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function applyTransaction({ inspection, now, reportPath }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  const date = String(now || new Date().toISOString()).slice(0, 10);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), "adoption date must be ISO-8601");
  const specimens = structuredClone(inspection.specimensDoc.value);
  const sources = structuredClone(inspection.sourcesDoc.value);
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  const entries = [];
  for (const context of pending) {
    specimenById.get(context.row.record_id)[context.row.side] = context.intended;
    const source = sourceById.get(context.row.record_id);
    source[context.row.side] = context.intended;
    source.fetched_at = date;
    entries.push({ absolute: context.destination.absolute, bytes: context.candidateBytes });
  }
  if (pending.length) {
    entries.push({ absolute: inspection.specimensDoc.absolute, bytes: jsonBytes(specimens) });
    entries.push({ absolute: inspection.sourcesDoc.absolute, bytes: jsonBytes(sources) });
    await atomicWrite(entries);
  }
  const report = {
    version: 1,
    transaction: inspection.plan.transaction,
    batch: inspection.plan.batch,
    operation: "bounded-canonical-media-adoption-apply",
    generated_at: now,
    counts: { authorized: inspection.contexts.length, adopted: pending.length, already_adopted: inspection.contexts.length - pending.length },
    adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, state: context.state === "pending" ? "adopted" : "already-adopted", destination_path: context.row.destination_path, candidate_sha256: context.row.candidate_sha256 })),
    boundary: { discovery_performed: false, historical_invalid_bytes_retained: true, quality_baseline_reset: false, complete_gate_required_before_receipt: true, canonical_mutation: pending.length > 0 },
  };
  if (reportPath) {
    const absolute = path.resolve(reportPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, jsonBytes(report));
  }
  return report;
}

function assertMetric(actual, expected, label) { assert(Number(actual) === Number(expected), `${label}: expected ${expected}, found ${actual}`); }
async function validateQuality({ inspection, beforeQualityPath }) {
  assert(beforeQualityPath, "--before-quality is required");
  const [beforeDoc, afterDoc] = await Promise.all([readJsonAny(beforeQualityPath, "pre-adoption quality"), readJson(inspection.root, DEFAULTS.quality, "current quality")]);
  const before = inspection.plan.quality_contract.before;
  const expected = inspection.plan.quality_contract.expected_after;
  assertMetric(beforeDoc.value.total, before.total, "pre-adoption total");
  for (const [key, value] of Object.entries(before)) if (key !== "total") assertMetric(beforeDoc.value.metrics?.[key], value, `pre-adoption ${key}`);
  assertMetric(afterDoc.value.total, expected.total, "post-adoption total");
  for (const [key, value] of Object.entries(expected)) if (key !== "total") assertMetric(afterDoc.value.metrics?.[key], value, `post-adoption ${key}`);
  assertMetric(afterDoc.value.metrics.complete_pairs - beforeDoc.value.metrics.complete_pairs, inspection.plan.quality_contract.exact_complete_pair_delta, "complete-pair delta");
  assertMetric(afterDoc.value.metrics.missing_still - beforeDoc.value.metrics.missing_still, inspection.plan.quality_contract.exact_missing_still_delta, "missing-still delta");
  assertMetric(afterDoc.value.metrics.missing_both - beforeDoc.value.metrics.missing_both, inspection.plan.quality_contract.exact_missing_both_delta, "missing-both delta");
  assert(sameJson(afterDoc.value.baseline, beforeDoc.value.baseline), "quality baseline changed during adoption");
  assert(round6(afterDoc.value.metrics.complete_pair_ratio) === round6(expected.complete_pair_ratio), "complete-pair ratio rounding drifted");
  return { before: beforeDoc.value, after: afterDoc.value, before_sha256: beforeDoc.sha256, after_sha256: afterDoc.sha256, deltas: { complete_pairs: 5, missing_still: -5, missing_both: 0 } };
}
async function validateAdopted({ inspection, beforeQualityPath }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  assert(pending.length === 0, `${inspection.plan.transaction} still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    const bytes = await readFile(context.destination.absolute);
    assert(sha256(bytes) === context.row.candidate_sha256, `${context.key} canonical bytes drifted`);
    const invalid = await readFile(resolveInside(inspection.root, context.row.correction.invalid_path).absolute);
    assert(sha256(invalid) === context.row.correction.invalid_sha256, `${context.key} historical invalid bytes were not retained`);
  }
  return validateQuality({ inspection, beforeQualityPath });
}

async function promoteReceiptAndLedger({ inspection, beforeQualityPath, receiptPath, ledgerPath, now, authorizedParent, gatedTree, workflowRun }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "--authorized-parent must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "--gated-tree must be a full tree SHA");
  assert(/^\d+$/.test(String(workflowRun || "")), "--workflow-run must be numeric");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const ledger = structuredClone(inspection.ledgerDoc.value);
  const receiptDestination = resolveInside(inspection.root, receiptPath || DEFAULTS.receipt, "COLLECT-004 receipt");
  const ledgerDestination = resolveInside(inspection.root, ledgerPath || DEFAULTS.ledger, "canonical adoption ledger");
  assert(!(await exists(receiptDestination.absolute)), `${receiptDestination.safe} already exists`);
  const obligations = inspection.contexts.map((context) => context.key);
  const receipt = {
    version: 1,
    transaction: inspection.plan.transaction,
    batch: inspection.plan.batch,
    operation: inspection.plan.operation,
    status: "paid",
    recorded_at: now,
    product_alignment: inspection.plan.product_alignment,
    authorization: { authorized_parent: authorizedParent, gated_tree: gatedTree, workflow_run: Number(workflowRun), exact_head_publication_lease_required: true },
    custody: {
      plan: { path: inspection.planDoc.safe, sha256: inspection.planDoc.sha256 },
      packet_import_receipt: { path: inspection.importDoc.safe, sha256: inspection.importDoc.sha256, source_head: inspection.importDoc.value.source.head_sha, source_snapshot_sha256: inspection.importDoc.value.source.snapshot_sha256 },
      correction_receipt: { path: inspection.correctionDoc.safe, sha256: inspection.correctionDoc.sha256 },
      prior_cumulative_ledger: { path: inspection.ledgerDoc.safe, sha256: inspection.ledgerDoc.sha256, canonical_adoptions: inspection.plan.custody.prior_canonical_adoptions },
    },
    counts: {
      canonical_adoptions: inspection.contexts.length,
      cumulative_canonical_adoptions: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
      imported_packets_remaining_for_adoption_review: inspection.plan.cumulative_contract.expected_remaining_for_review_after,
      stills: inspection.contexts.length,
      portraits: 0,
    },
    quality: { before_sha256: quality.before_sha256, after_sha256: quality.after_sha256, before: quality.before.metrics, after: quality.after.metrics, deltas: quality.deltas, baseline_unchanged: true },
    adoptions: inspection.contexts.map((context) => ({ record_id: context.row.record_id, side: context.row.side, trust_state: inspection.plan.boundary.trust_state, canonical_path: context.row.destination_path, canonical_sha256: context.row.candidate_sha256, image_origin: context.row.image.origin, packet_manifest: context.row.manifest_path, packet_manifest_sha256: context.row.manifest_sha256, correction_ledger: context.row.correction.ledger, historical_invalid_path: context.row.correction.invalid_path, historical_invalid_sha256: context.row.correction.invalid_sha256 })),
    boundary: { visitor_visible_media_improvements: inspection.contexts.length, discovery_performed: false, source_policy_created: false, supervisor_created: false, historical_invalid_bytes_retained: true, quality_baseline_reset: false, canonical_mutation: true, manual_continue_required: false, next_authorized_work: "continue cumulative bounded adoption from 10 paid packets and 45 remaining" },
  };

  ledger.recorded_at = now;
  ledger.cumulative = {
    canonical_adoptions: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
    remaining_for_canonical_review: inspection.plan.cumulative_contract.expected_remaining_for_review_after,
    stills: inspection.plan.cumulative_contract.expected_stills_after,
    portraits: inspection.plan.cumulative_contract.expected_portraits_after,
    visitor_visible_media_improvements: inspection.plan.cumulative_contract.expected_visitor_visible_media_improvements_after,
  };
  ledger.batches.push({
    transaction: inspection.plan.transaction,
    batch: inspection.plan.batch,
    status: "paid",
    receipt: receiptDestination.safe,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: inspection.contexts.length,
    obligations,
    quality_delta: { complete_pairs: 5, missing_still: -5, missing_portrait: 0, missing_both: 0 },
  });
  for (const context of inspection.contexts) ledger.adopted_obligations.push({ obligation_id: context.key, transaction: inspection.plan.transaction, batch: inspection.plan.batch, canonical_path: context.row.destination_path, canonical_sha256: context.row.candidate_sha256 });
  ledger.next_batch_contract = {
    batch: inspection.plan.batch + 1,
    prior_canonical_adoptions: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
    maximum_new_adoptions: 5,
    expected_cumulative_after_full_batch: inspection.plan.cumulative_contract.expected_canonical_adoptions_after + 5,
    expected_remaining_after_full_batch: inspection.plan.cumulative_contract.expected_remaining_for_review_after - 5,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
  };
  await atomicWrite([{ absolute: receiptDestination.absolute, bytes: jsonBytes(receipt) }, { absolute: ledgerDestination.absolute, bytes: jsonBytes(ledger) }]);
  const validation = await validateCanonicalAdoptionLedger({ root: inspection.root, ledgerPath: ledgerDestination.safe });
  assert(validation.canonical_adoptions === inspection.plan.cumulative_contract.expected_canonical_adoptions_after, "cumulative ledger did not reach expected adoption count");
  assert(validation.remaining_for_canonical_review === inspection.plan.cumulative_contract.expected_remaining_for_review_after, "cumulative ledger did not reach expected remaining count");
  return { receipt, ledger, validation, receipt_path: receiptDestination.safe, ledger_path: ledgerDestination.safe };
}

async function runFixtures() {
  assert(acceptedIdentity("expected-subject"), "expected-subject must pass");
  assert(acceptedIdentity("expected-subject-set"), "expected-subject-set must pass");
  assert(acceptedIdentity("expected-subjects"), "permanent expected-subjects enum must pass");
  assert(!acceptedIdentity("probable-subject"), "probable-subject must fail");
  assert(acceptedPresentation("character-depiction"), "character-depiction must pass");
  assert(acceptedPresentation("two-role-character-depiction"), "two-role character depiction must pass");
  assert(acceptedPresentation("three-role-character-depiction"), "three-role character depiction must pass");
  assert(acceptedPresentation("two-role-character-composite"), "permanent two-role character composite must pass");
  assert(acceptedPresentation("three-role-character-composite"), "permanent three-role character composite must pass");
  assert(!acceptedPresentation("performer-portrait"), "performer portrait must fail the still lane");
  assert(cropPassed({ crop_ruling: "pass-three-panel-center" }), "typed crop pass must pass");
  assert(cropPassed({ notes: ["The wall crop retains every required face."] }), "retained wall-crop note must pass");
  const root = await mkdtemp(path.join(os.tmpdir(), "collect-004-semantic-fixture-"));
  try {
    await writeFile(path.join(root, "ok"), "ok");
    console.log("COLLECT-004 fixtures: PASS — multi-role typed identity and presentation variants are admitted while probable identity and portrait substitution remain rejected");
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function main() {
  if (has("--fixtures")) return runFixtures();
  const modes = ["--write", "--validate", "--promote"].filter(has);
  assert(modes.length <= 1, `choose at most one mode, found ${modes.join(", ")}`);
  const inspection = await inspectTransaction({ root: option("--root", "."), planPath: option("--plan", DEFAULTS.plan) });
  const pending = inspection.contexts.filter((context) => context.state === "pending").length;
  if (has("--write")) {
    const report = await applyTransaction({ inspection, now: option("--now", new Date().toISOString()), reportPath: option("--report", null) });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (has("--validate")) {
    const quality = await validateAdopted({ inspection, beforeQualityPath: option("--before-quality", null) });
    console.log(JSON.stringify({ transaction: inspection.plan.transaction, batch: inspection.plan.batch, status: "validated", adoptions: inspection.contexts.length, cumulative_after: inspection.plan.cumulative_contract.expected_canonical_adoptions_after, quality: quality.deltas }, null, 2));
    return;
  }
  if (has("--promote")) {
    const result = await promoteReceiptAndLedger({
      inspection,
      beforeQualityPath: option("--before-quality", null),
      receiptPath: option("--receipt", DEFAULTS.receipt),
      ledgerPath: option("--ledger", DEFAULTS.ledger),
      now: option("--now", new Date().toISOString()),
      authorizedParent: option("--authorized-parent", null),
      gatedTree: option("--gated-tree", null),
      workflowRun: option("--workflow-run", null),
    });
    console.log(JSON.stringify({ transaction: inspection.plan.transaction, batch: inspection.plan.batch, status: "paid-receipt-and-ledger-written", receipt: result.receipt_path, ledger: result.ledger_path, cumulative_adoptions: result.validation.canonical_adoptions, remaining: result.validation.remaining_for_canonical_review }, null, 2));
    return;
  }
  console.log(JSON.stringify({ transaction: inspection.plan.transaction, batch: inspection.plan.batch, authorized: inspection.contexts.length, pending, already_adopted: inspection.contexts.length - pending, prior_cumulative_adoptions: inspection.plan.custody.prior_canonical_adoptions, expected_cumulative_after: inspection.plan.cumulative_contract.expected_canonical_adoptions_after, expected_remaining_after: inspection.plan.cumulative_contract.expected_remaining_for_review_after, adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, state: context.state, destination_path: context.row.destination_path })) }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-004 cumulative adoption: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
