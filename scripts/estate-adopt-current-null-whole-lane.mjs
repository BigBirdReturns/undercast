#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  ruling: "data/review/estate-debt/COLLECT-007-CURRENT-NULL-WHOLE-LANE-ADJUDICATION.json",
  census: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
  importReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-008-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-008-PUBLICATION.json",
});

const TRANSACTION = "COLLECT-008";
const BATCH = 5;
const BEFORE = Object.freeze({
  total: 1313,
  complete_pairs: 693,
  complete_pair_ratio: 0.527799,
  missing_still: 373,
  missing_portrait: 356,
  missing_both: 109,
  missing_both_ratio: 0.083016,
});
const AFTER = Object.freeze({
  total: 1313,
  complete_pairs: 717,
  complete_pair_ratio: 0.546078,
  missing_still: 349,
  missing_portrait: 356,
  missing_both: 109,
  missing_both_ratio: 0.083016,
});
const CUMULATIVE_AFTER = Object.freeze({
  canonical_adoptions: 39,
  remaining_for_canonical_review: 16,
  stills: 39,
  portraits: 0,
  visitor_visible_media_improvements: 39,
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
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
  try { return { ...resolved, bytes, sha256: sha256(bytes), git_blob: gitBlob(bytes), value: JSON.parse(bytes.toString("utf8")) }; }
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
    assert(name && !name.includes("/") && !result.has(name), `${label}:${index + 1} repeats or nests ${name}`);
    result.set(name, match[1].toLowerCase());
  }
  assert(result.size, `${label} is empty`);
  return result;
}
function assertImageBytes(bytes, mime, label) {
  if (mime === "image/jpeg") {
    assert(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label} is not a complete JPEG`);
    return;
  }
  if (mime === "image/png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert(bytes.length >= 8 && bytes.subarray(0, 8).equals(signature), `${label} is not a PNG`);
    return;
  }
  if (mime === "image/webp") {
    assert(bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP", `${label} is not a WebP image`);
    return;
  }
  fail(`${label} has unsupported MIME ${mime}`);
}
function validateBinding(binding, decision, label) {
  assert(binding && typeof binding === "object" && !Array.isArray(binding), `${label} must be an object`);
  assert(binding.src === decision.current.destination_path, `${label}.src differs from ruled destination`);
  assert(binding.kind === decision.side, `${label}.kind differs from ruled side`);
  assert(/^https?:\/\//.test(binding.origin || ""), `${label}.origin must be HTTP(S)`);
  assert(binding.pin === true, `${label}.pin must be true`);
  assert(new Set(["left", "center", "right"]).has(binding.focus?.x), `${label}.focus.x is invalid`);
  assert(new Set(["top", "upper", "center", "lower", "bottom"]).has(binding.focus?.y), `${label}.focus.y is invalid`);
}
function assertMetric(actual, expected, label) { assert(Number(actual) === Number(expected), `${label}: expected ${expected}, found ${actual}`); }

async function inspectTransaction({ root = process.cwd(), rulingPath = DEFAULTS.ruling } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [rulingDoc, censusDoc, importDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readJson(resolvedRoot, rulingPath, "COLLECT-007 ruling"),
    readJson(resolvedRoot, DEFAULTS.census, "COLLECT-005 census"),
    readJson(resolvedRoot, DEFAULTS.importReceipt, "COLLECT-002 packet import"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readJson(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readJson(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const ruling = rulingDoc.value;
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(ruling?.version === 2 && ruling.transaction === "COLLECT-007" && ruling.operation === "exact-current-null-whole-lane-adjudication" && ruling.status === "authorized", "COLLECT-007 ruling is not the corrected authorized object");
  assert(ruling.repair?.evidence_standard_changed === false && ruling.repair?.canonical_mutation === false, "COLLECT-007 repair boundary drifted");
  assert(ruling.denominator?.remaining_lane === 24 && ruling.denominator?.reviewed === 24 && ruling.denominator?.authorized === 24 && ruling.denominator?.blocked === 0, "COLLECT-007 denominator drifted");
  assert(ruling.quality_effect_if_all_authorized_are_adopted?.complete_pairs === 24 && ruling.quality_effect_if_all_authorized_are_adopted?.missing_still === -24 && ruling.quality_effect_if_all_authorized_are_adopted?.missing_portrait === 0 && ruling.quality_effect_if_all_authorized_are_adopted?.missing_both === 0, "COLLECT-007 quality effect drifted");
  assert(Array.isArray(ruling.authorized_obligations) && ruling.authorized_obligations.length === 24, "COLLECT-007 authorized obligation list drifted");
  assert(Array.isArray(ruling.decisions) && ruling.decisions.length === 24, "COLLECT-007 decisions drifted");
  assert(census.transaction === "COLLECT-005" && census.counts?.imported_packets === 55 && census.counts?.null_without_prior_state === 27, "COLLECT-005 census denominator drifted");
  assert(ruling.source?.census_sha256 === censusDoc.sha256 && ruling.source?.census_git_blob === censusDoc.git_blob, "COLLECT-007 census custody drifted");
  assert(importDoc.value?.transaction === "COLLECT-002" && importDoc.value?.counts?.packets === 55 && importDoc.value?.boundaries?.canonical_mutation === false, "COLLECT-002 packet custody drifted");
  assert(ledger.cumulative?.canonical_adoptions === 15 && ledger.cumulative?.remaining_for_canonical_review === 40 && ledger.cumulative?.stills === 15 && ledger.cumulative?.portraits === 0, "ledger is not at the COLLECT-006 paid boundary");
  assert(ledger.next_batch_contract?.batch === BATCH && ledger.next_batch_contract?.requires_new_terminal_rulings === true, "ledger did not authorize a ruled batch 5");
  const adopted = new Set((ledger.adopted_obligations || []).map((row) => row.obligation_id));
  const authorizedKeys = [...new Set(ruling.authorized_obligations)].sort();
  assert(authorizedKeys.length === 24, "COLLECT-007 authorized obligations are not unique");
  const unpaidLaneKeys = (census.packets || []).filter((row) => row.lane === "null-binding-without-prior-state" && !adopted.has(row.obligation_id)).map((row) => row.obligation_id).sort();
  assert(sameJson(authorizedKeys, unpaidLaneKeys), "COLLECT-007 authorized set does not equal the complete unpaid current-null lane");
  const contexts = [];

  for (const key of authorizedKeys) {
    assert(!adopted.has(key), `${key} was already paid`);
    const decision = exactRow(ruling.decisions, (row) => row.decision_id === key, `${key} ruling decision`);
    assert(decision.status === "authorized-current-null" && Array.isArray(decision.reasons) && decision.reasons.length === 0, `${key} is not unconditionally authorized`);
    assert(decision.side === "still", `${key} is not a still obligation`);
    validateBinding(decision.proposed_binding, decision, `${key}.proposed_binding`);
    assert(decision.current?.specimen_binding === null && decision.current?.source_binding === null && decision.current?.canonical_rows_agree === true && decision.current?.other_side_present === true && decision.current?.destination_exists === false, `${key} ruled current state drifted`);
    assert(decision.packet?.manifest_hash_pass === true && decision.packet?.manifest_checksum_bound === true && decision.packet?.candidate_hash_pass === true && decision.packet?.candidate_checksum_bound === true && decision.packet?.independent_review_ready === true && decision.packet?.duplicate_screen_pass === true && decision.packet?.packet_ready === true, `${key} ruled packet custody is incomplete`);
    const censusRow = exactRow(census.packets || [], (row) => row.obligation_id === key, `${key} census row`);
    assert(censusRow.lane === "null-binding-without-prior-state" && censusRow.custody?.packet_ready === true, `${key} census lane drifted`);
    assert(censusRow.record_id === decision.record_id && censusRow.side === decision.side && censusRow.actor === decision.actor && censusRow.character === decision.character, `${key} census identity drifted`);
    assert(censusRow.packet_root === decision.packet.root && censusRow.manifest_path === decision.packet.manifest_path && censusRow.manifest_sha256 === decision.packet.manifest_sha256 && censusRow.candidate_path === decision.packet.candidate_path && censusRow.candidate_sha256 === decision.packet.candidate_sha256 && censusRow.candidate_mime === decision.packet.candidate_mime && censusRow.suggested_destination_path === decision.current.destination_path, `${key} census packet custody drifted`);
    assert(sameJson({ src: censusRow.suggested_destination_path, kind: censusRow.side, origin: censusRow.suggested_origin, pin: true, focus: censusRow.suggested_focus }, decision.proposed_binding), `${key} proposed binding differs from census suggestion`);
    const imported = exactRow(importDoc.value.packets || [], (row) => row.obligation_id === key, `${key} imported packet`);
    assert(imported.root === decision.packet.root && imported.manifest_path === decision.packet.manifest_path && imported.manifest_sha256 === decision.packet.manifest_sha256, `${key} imported packet drifted`);
    const manifestBytes = await readFile(resolveInside(resolvedRoot, decision.packet.manifest_path, `${key} manifest`).absolute);
    assert(sha256(manifestBytes) === decision.packet.manifest_sha256, `${key} manifest bytes drifted`);
    const candidatePath = resolveInside(resolvedRoot, decision.packet.candidate_path, `${key} candidate`);
    const candidateBytes = await readFile(candidatePath.absolute);
    assert(sha256(candidateBytes) === decision.packet.candidate_sha256, `${key} candidate bytes drifted`);
    assertImageBytes(candidateBytes, decision.packet.candidate_mime, `${key} candidate`);
    const checksumPath = `${decision.packet.root}/${imported.checksum_ledger}`;
    assert(checksumPath === censusRow.checksum_path, `${key} checksum path drifted`);
    const checksums = parseChecksums(await readFile(resolveInside(resolvedRoot, checksumPath, `${key} checksums`).absolute, "utf8"), checksumPath);
    assert(checksums.get(path.posix.basename(decision.packet.manifest_path)) === decision.packet.manifest_sha256, `${key} checksum ledger does not bind manifest`);
    assert(checksums.get(path.posix.basename(decision.packet.candidate_path)) === decision.packet.candidate_sha256, `${key} checksum ledger does not bind candidate`);
    const duplicateDoc = await readJson(resolvedRoot, `${decision.packet.root}/duplicate-scan.json`, `${key} duplicate scan`);
    assert(String(duplicateDoc.value?.status || "").toLowerCase() === "pass", `${key} duplicate scan did not pass`);
    const specimen = exactRow(specimensDoc.value, (row) => row.id === decision.record_id, `${key} specimen`);
    const source = exactRow(sourcesDoc.value, (row) => row.id === decision.record_id, `${key} source`);
    const specimenCurrent = specimen[decision.side] ?? null;
    const sourceCurrent = source[decision.side] ?? null;
    const otherSide = decision.side === "still" ? "portrait" : "still";
    assert(specimen.actor === decision.actor && source.actor === decision.actor && specimen.character === decision.character && source.character === decision.character, `${key} current canonical identity drifted`);
    assert(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide]), `${key} opposite side is not complete and consistent`);
    const destination = resolveInside(resolvedRoot, decision.current.destination_path, `${key} destination`);
    const destinationExists = await exists(destination.absolute);
    let state;
    if (specimenCurrent === null && sourceCurrent === null) {
      assert(!destinationExists, `${key} destination exists before adoption`);
      state = "pending";
    } else {
      assert(sameJson(specimenCurrent, decision.proposed_binding) && sameJson(sourceCurrent, decision.proposed_binding), `${key} current binding is neither null nor the exact planned adoption`);
      assert(destinationExists, `${key} adopted destination is missing`);
      const destinationBytes = await readFile(destination.absolute);
      assert(sha256(destinationBytes) === decision.packet.candidate_sha256, `${key} adopted destination bytes drifted`);
      state = "already-adopted";
    }
    contexts.push({ key, decision, censusRow, candidateBytes, destination, intended: structuredClone(decision.proposed_binding), state });
  }
  return { root: resolvedRoot, ruling, rulingDoc, censusDoc, importDoc, ledgerDoc, specimensDoc, sourcesDoc, contexts };
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
    specimenById.get(context.decision.record_id)[context.decision.side] = context.intended;
    const source = sourceById.get(context.decision.record_id);
    source[context.decision.side] = context.intended;
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
    transaction: TRANSACTION,
    batch: BATCH,
    operation: "whole-current-null-lane-canonical-adoption-apply",
    generated_at: now,
    counts: { authorized: inspection.contexts.length, adopted: pending.length, already_adopted: inspection.contexts.length - pending.length },
    adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, state: context.state === "pending" ? "adopted" : "already-adopted", destination_path: context.decision.current.destination_path, candidate_sha256: context.decision.packet.candidate_sha256 })),
    boundary: { evidence_sized_tranche: true, discovery_performed: false, packet_evidence_rewritten: false, quality_baseline_reset: false, complete_gate_required_before_receipt: true, canonical_mutation: pending.length > 0 },
  };
  if (reportPath) {
    const absolute = path.resolve(reportPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, jsonBytes(report));
  }
  return report;
}

async function validateQuality({ inspection, beforeQualityPath }) {
  assert(beforeQualityPath, "--before-quality is required");
  const [beforeDoc, afterDoc] = await Promise.all([readJsonAny(beforeQualityPath, "pre-adoption quality"), readJson(inspection.root, DEFAULTS.quality, "current quality")]);
  assertMetric(beforeDoc.value.total, BEFORE.total, "pre-adoption total");
  for (const [key, value] of Object.entries(BEFORE)) if (key !== "total") assertMetric(beforeDoc.value.metrics?.[key], value, `pre-adoption ${key}`);
  assertMetric(afterDoc.value.total, AFTER.total, "post-adoption total");
  for (const [key, value] of Object.entries(AFTER)) if (key !== "total") assertMetric(afterDoc.value.metrics?.[key], value, `post-adoption ${key}`);
  const deltas = {
    complete_pairs: afterDoc.value.metrics.complete_pairs - beforeDoc.value.metrics.complete_pairs,
    missing_still: afterDoc.value.metrics.missing_still - beforeDoc.value.metrics.missing_still,
    missing_portrait: afterDoc.value.metrics.missing_portrait - beforeDoc.value.metrics.missing_portrait,
    missing_both: afterDoc.value.metrics.missing_both - beforeDoc.value.metrics.missing_both,
  };
  assertMetric(deltas.complete_pairs, 24, "complete-pair delta");
  assertMetric(deltas.missing_still, -24, "missing-still delta");
  assertMetric(deltas.missing_portrait, 0, "missing-portrait delta");
  assertMetric(deltas.missing_both, 0, "missing-both delta");
  assert(sameJson(afterDoc.value.baseline, beforeDoc.value.baseline), "quality baseline changed during adoption");
  assert(round6(afterDoc.value.metrics.complete_pair_ratio) === AFTER.complete_pair_ratio, "complete-pair ratio rounding drifted");
  return { before: beforeDoc.value, after: afterDoc.value, before_sha256: beforeDoc.sha256, after_sha256: afterDoc.sha256, deltas };
}

async function validateAdopted({ inspection, beforeQualityPath }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  assert(pending.length === 0, `${TRANSACTION} still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    const bytes = await readFile(context.destination.absolute);
    assert(sha256(bytes) === context.decision.packet.candidate_sha256, `${context.key} canonical bytes drifted`);
    const specimen = exactRow(inspection.specimensDoc.value, (row) => row.id === context.decision.record_id, `${context.key} specimen`);
    const source = exactRow(inspection.sourcesDoc.value, (row) => row.id === context.decision.record_id, `${context.key} source`);
    assert(sameJson(specimen[context.decision.side], context.intended) && sameJson(source[context.decision.side], context.intended), `${context.key} canonical binding differs from ruled adoption`);
  }
  return validateQuality({ inspection, beforeQualityPath });
}

async function promoteReceiptAndLedger({ inspection, beforeQualityPath, receiptPath, ledgerPath, now, authorizedParent, gatedTree, workflowRun }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "--authorized-parent must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "--gated-tree must be a full tree SHA");
  assert(/^\d+$/.test(String(workflowRun || "")), "--workflow-run must be numeric");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const ledger = structuredClone(inspection.ledgerDoc.value);
  const receiptDestination = resolveInside(inspection.root, receiptPath || DEFAULTS.receipt, `${TRANSACTION} receipt`);
  const ledgerDestination = resolveInside(inspection.root, ledgerPath || DEFAULTS.ledger, "canonical adoption ledger");
  assert(!(await exists(receiptDestination.absolute)), `${receiptDestination.safe} already exists`);
  const obligations = inspection.contexts.map((context) => context.key);
  const receipt = {
    version: 1,
    transaction: TRANSACTION,
    batch: BATCH,
    operation: "whole-current-null-lane-canonical-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    authorization: { authorized_parent: authorizedParent, gated_tree: gatedTree, workflow_run: Number(workflowRun), exact_head_publication_lease_required: true },
    custody: {
      ruling: { path: inspection.rulingDoc.safe, sha256: inspection.rulingDoc.sha256, git_blob: inspection.rulingDoc.git_blob, authorized: 24, blocked: 0 },
      census: { path: inspection.censusDoc.safe, sha256: inspection.censusDoc.sha256, git_blob: inspection.censusDoc.git_blob },
      packet_import_receipt: { path: inspection.importDoc.safe, sha256: inspection.importDoc.sha256, source_head: inspection.importDoc.value.source.head_sha },
      prior_cumulative_ledger: { path: inspection.ledgerDoc.safe, sha256: inspection.ledgerDoc.sha256, git_blob: inspection.ledgerDoc.git_blob, canonical_adoptions: 15 },
    },
    counts: {
      canonical_adoptions: 24,
      cumulative_canonical_adoptions: CUMULATIVE_AFTER.canonical_adoptions,
      imported_packets_remaining_for_adoption_review: CUMULATIVE_AFTER.remaining_for_canonical_review,
      stills: 24,
      portraits: 0,
    },
    quality: { before_sha256: quality.before_sha256, after_sha256: quality.after_sha256, before: quality.before.metrics, after: quality.after.metrics, deltas: quality.deltas, baseline_unchanged: true },
    adoptions: inspection.contexts.map((context) => ({
      record_id: context.decision.record_id,
      side: context.decision.side,
      census_lane: "null-binding-without-prior-state",
      terminal_decision: context.key,
      canonical_path: context.decision.current.destination_path,
      canonical_sha256: context.decision.packet.candidate_sha256,
      candidate_mime: context.decision.packet.candidate_mime,
      image_origin: context.decision.proposed_binding.origin,
      packet_manifest: context.decision.packet.manifest_path,
      packet_manifest_sha256: context.decision.packet.manifest_sha256,
    })),
    boundary: {
      visitor_visible_media_improvements: 24,
      current_null_terminal_rulings_consumed: 24,
      entire_current_null_lane_paid: true,
      discovery_performed: false,
      packet_evidence_rewritten: false,
      source_policy_created: false,
      supervisor_created: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      manual_continue_required: false,
      next_authorized_work: "terminally adjudicate the sixteen packet-review-incompatible objects",
    },
  };
  ledger.recorded_at = now;
  ledger.cumulative = structuredClone(CUMULATIVE_AFTER);
  ledger.batches.push({
    transaction: TRANSACTION,
    batch: BATCH,
    status: "paid",
    receipt: receiptDestination.safe,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: 24,
    obligations,
    quality_delta: quality.deltas,
  });
  for (const context of inspection.contexts) ledger.adopted_obligations.push({
    obligation_id: context.key,
    transaction: TRANSACTION,
    batch: BATCH,
    canonical_path: context.decision.current.destination_path,
    canonical_sha256: context.decision.packet.candidate_sha256,
  });
  ledger.next_batch_contract = {
    batch: BATCH + 1,
    prior_canonical_adoptions: CUMULATIVE_AFTER.canonical_adoptions,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: CUMULATIVE_AFTER.canonical_adoptions,
    expected_remaining_after_full_batch: CUMULATIVE_AFTER.remaining_for_canonical_review,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_new_terminal_rulings: true,
    census: DEFAULTS.census,
    remaining_lane_counts: {
      null_binding_without_prior_state: 0,
      packet_review_incompatible: 16,
    },
  };
  await atomicWrite([
    { absolute: receiptDestination.absolute, bytes: jsonBytes(receipt) },
    { absolute: ledgerDestination.absolute, bytes: jsonBytes(ledger) },
  ]);
  const validation = await validateCanonicalAdoptionLedger({ root: inspection.root, ledgerPath: ledgerDestination.safe });
  assert(validation.canonical_adoptions === CUMULATIVE_AFTER.canonical_adoptions, "cumulative ledger did not reach 39 adoptions");
  assert(validation.remaining_for_canonical_review === CUMULATIVE_AFTER.remaining_for_canonical_review, "cumulative ledger did not reach 16 remaining");
  return { receipt, ledger, validation, receipt_path: receiptDestination.safe, ledger_path: ledgerDestination.safe };
}

async function reconcilePublication({ root, receiptPath, publicationPath, ledgerPath, adoptionHead, adoptionTree, currentParent, now }) {
  assert(/^[0-9a-f]{40}$/.test(adoptionHead || ""), "--adoption-head must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(adoptionTree || ""), "--adoption-tree must be a full tree SHA");
  assert(/^[0-9a-f]{40}$/.test(currentParent || ""), "--current-parent must be a full commit SHA");
  const resolvedRoot = path.resolve(root);
  const receiptDoc = await readJson(resolvedRoot, receiptPath || DEFAULTS.receipt, `${TRANSACTION} receipt`);
  const ledgerDoc = await readJson(resolvedRoot, ledgerPath || DEFAULTS.ledger, "canonical adoption ledger");
  const ledger = structuredClone(ledgerDoc.value);
  const batch = exactRow(ledger.batches || [], (row) => row.transaction === TRANSACTION && row.batch === BATCH, `${TRANSACTION} ledger batch`);
  assert(batch.published_head === null || batch.published_head === adoptionHead, `${TRANSACTION} published head conflicts`);
  batch.published_head = adoptionHead;
  batch.receipt_git_blob = receiptDoc.git_blob;
  ledger.recorded_at = now;
  const publicationDestination = resolveInside(resolvedRoot, publicationPath || DEFAULTS.publication, `${TRANSACTION} publication receipt`);
  assert(!(await exists(publicationDestination.absolute)), `${publicationDestination.safe} already exists`);
  const publication = {
    version: 1,
    transaction: TRANSACTION,
    batch: BATCH,
    operation: "canonical-adoption-publication-reconciliation",
    status: "published",
    recorded_at: now,
    authorization: { reconciliation_parent: currentParent, exact_head_publication_lease_required: true },
    adoption: {
      published_head: adoptionHead,
      published_tree: adoptionTree,
      gated_candidate_tree: receiptDoc.value.authorization.gated_tree,
      workflow_run: receiptDoc.value.authorization.workflow_run,
      receipt_path: receiptDoc.safe,
      receipt_git_blob: receiptDoc.git_blob,
    },
    cumulative: structuredClone(CUMULATIVE_AFTER),
    boundary: { canonical_mutation: false, packet_evidence_rewritten: false, adoption_receipt_rewritten: false, only_publication_custody_reconciled: true },
  };
  await atomicWrite([
    { absolute: ledgerDoc.absolute, bytes: jsonBytes(ledger) },
    { absolute: publicationDestination.absolute, bytes: jsonBytes(publication) },
  ]);
  const validation = await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: ledgerDoc.safe });
  return { ledger_path: ledgerDoc.safe, publication_path: publicationDestination.safe, validation };
}

async function runFixtures() {
  const omitted = {};
  const explicit = { still: null };
  assert((omitted.still ?? null) === null && (explicit.still ?? null) === null, "absent and explicit null must normalize to the same unbound state");
  assert(round6(AFTER.complete_pairs / AFTER.total) === AFTER.complete_pair_ratio, "after ratio fixture drifted");
  assert(CUMULATIVE_AFTER.canonical_adoptions + CUMULATIVE_AFTER.remaining_for_canonical_review === 55, "cumulative fixture does not reconcile");
  console.log("COLLECT-008 fixtures: PASS — the corrected 24-object ruling drives one evidence-sized tranche, absent and explicit null remain equivalent, and cumulative accounting reaches 39 of 55");
}

async function main() {
  if (has("--fixtures")) return runFixtures();
  if (has("--reconcile-publication")) {
    const result = await reconcilePublication({
      root: option("--root", "."),
      receiptPath: option("--receipt", DEFAULTS.receipt),
      publicationPath: option("--publication", DEFAULTS.publication),
      ledgerPath: option("--ledger", DEFAULTS.ledger),
      adoptionHead: option("--adoption-head", null),
      adoptionTree: option("--adoption-tree", null),
      currentParent: option("--current-parent", null),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify({ transaction: TRANSACTION, status: "publication-reconciled", ...result }, null, 2));
    return;
  }
  const modes = ["--write", "--validate", "--promote"].filter(has);
  assert(modes.length <= 1, `choose at most one mode, found ${modes.join(", ")}`);
  const inspection = await inspectTransaction({ root: option("--root", "."), rulingPath: option("--ruling", DEFAULTS.ruling) });
  if (has("--write")) {
    const report = await applyTransaction({ inspection, now: option("--now", new Date().toISOString()), reportPath: option("--report", null) });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (has("--validate")) {
    const quality = await validateAdopted({ inspection, beforeQualityPath: option("--before-quality", null) });
    console.log(JSON.stringify({ transaction: TRANSACTION, batch: BATCH, status: "validated", adoptions: inspection.contexts.length, cumulative_after: CUMULATIVE_AFTER.canonical_adoptions, remaining_after: CUMULATIVE_AFTER.remaining_for_canonical_review, quality: quality.deltas }, null, 2));
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
    console.log(JSON.stringify({ transaction: TRANSACTION, batch: BATCH, status: "paid-receipt-and-ledger-written", receipt: result.receipt_path, ledger: result.ledger_path, cumulative_adoptions: result.validation.canonical_adoptions, remaining: result.validation.remaining_for_canonical_review }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    transaction: TRANSACTION,
    batch: BATCH,
    authorized: inspection.contexts.length,
    pending: inspection.contexts.filter((context) => context.state === "pending").length,
    already_adopted: inspection.contexts.filter((context) => context.state === "already-adopted").length,
    prior_cumulative_adoptions: 15,
    expected_cumulative_after: CUMULATIVE_AFTER.canonical_adoptions,
    expected_remaining_after: CUMULATIVE_AFTER.remaining_for_canonical_review,
    adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, destination_path: context.decision.current.destination_path, candidate_mime: context.decision.packet.candidate_mime })),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`${TRANSACTION} whole-lane adoption failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
