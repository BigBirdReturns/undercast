#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  ruling: "data/review/estate-debt/COLLECT-007-CURRENT-NULL-WHOLE-LANE-ADJUDICATION.json",
  census: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-008-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-008-PUBLICATION.json",
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
const keyFor = (id, side) => `${id}/${side}`;
const round6 = (value) => Number(Number(value).toFixed(6));
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
async function readJsonAny(filePath, label = filePath) {
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
function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)"/);
  if (!match) return 2;
  if (match[1].includes("\t")) return "\t";
  return Math.min(10, Math.max(1, match[1].length));
}
function jsonLike(originalBytes, value) {
  return Buffer.from(`${JSON.stringify(value, null, detectIndent(originalBytes.toString("utf8")))}\n`, "utf8");
}
async function atomicWrite(absolutePath, bytes) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temp = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temp, bytes, { flag: "wx" });
    await rename(temp, absolutePath);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}
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
function validateImageBinding(binding, key) {
  assert(binding && typeof binding === "object" && !Array.isArray(binding), `${key} proposed binding is missing`);
  assert(binding.kind === "still", `${key} proposed binding kind must be still`);
  assert(/^https?:\/\//.test(binding.origin || ""), `${key} proposed origin must be HTTP(S)`);
  assert(binding.pin === true, `${key} proposed binding must be pinned`);
  assert(new Set(["left", "center", "right"]).has(binding.focus?.x), `${key} focus.x is invalid`);
  assert(new Set(["top", "upper", "center", "lower", "bottom"]).has(binding.focus?.y), `${key} focus.y is invalid`);
}
function validateRuling(ruling) {
  assert(ruling?.version === 2, "COLLECT-007 ruling version must be 2");
  assert(ruling.transaction === "COLLECT-007" && ruling.operation === "exact-current-null-whole-lane-adjudication", "unexpected COLLECT-007 ruling identity");
  assert(ruling.status === "authorized", "COLLECT-007 ruling is not authorized");
  assert(ruling.denominator?.reviewed === 24 && ruling.denominator?.authorized === 24 && ruling.denominator?.blocked === 0, "COLLECT-007 denominator drifted");
  assert(ruling.quality_effect_if_all_authorized_are_adopted?.complete_pairs === 24, "COLLECT-007 complete-pair effect drifted");
  assert(ruling.quality_effect_if_all_authorized_are_adopted?.missing_still === -24, "COLLECT-007 missing-still effect drifted");
  assert(ruling.boundary?.canonical_mutation === false && ruling.boundary?.packet_evidence_rewritten === false, "COLLECT-007 escaped its ruling boundary");
  assert(Array.isArray(ruling.decisions) && ruling.decisions.length === 24, "COLLECT-007 decisions[] must contain 24 rows");
  const decisionKeys = new Set();
  for (const row of ruling.decisions) {
    const key = row.decision_id;
    assert(/^UC-\d+\/still$/.test(key || ""), `invalid COLLECT-007 decision ${key}`);
    assert(!decisionKeys.has(key), `duplicate COLLECT-007 decision ${key}`);
    decisionKeys.add(key);
    assert(row.status === "authorized-current-null" && Array.isArray(row.reasons) && row.reasons.length === 0, `${key} is not terminally authorized`);
    assert(row.side === "still", `${key} is not a still adoption`);
    assert(row.packet?.packet_ready === true && row.packet?.candidate_hash_pass === true && row.packet?.manifest_hash_pass === true, `${key} packet is not ready`);
    assert(row.packet?.candidate_checksum_bound === true && row.packet?.manifest_checksum_bound === true, `${key} packet is not checksum-bound`);
    assert(row.packet?.independent_review_ready === true && row.packet?.duplicate_screen_pass === true, `${key} review custody is incomplete`);
    assert(row.current?.specimen_binding === null && row.current?.source_binding === null && row.current?.canonical_rows_agree === true, `${key} current ruling is not exact-null`);
    assert(row.current?.other_side_present === true && row.current?.destination_exists === false, `${key} current destination or opposite side drifted`);
    validateImageBinding(row.proposed_binding, key);
    assert(row.quality_effect?.complete_pairs === 1 && row.quality_effect?.missing_still === -1 && row.quality_effect?.missing_portrait === 0 && row.quality_effect?.missing_both === 0, `${key} quality effect drifted`);
  }
  assert(sameJson([...decisionKeys].sort(), [...ruling.authorized_obligations].sort()), "COLLECT-007 authorized obligation set drifted");
  return ruling;
}

async function inspectTransaction({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [rulingDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readJson(resolvedRoot, DEFAULTS.ruling, "COLLECT-007 ruling"),
    readJson(resolvedRoot, DEFAULTS.census, "COLLECT-005 census"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readJson(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readJson(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const ruling = validateRuling(rulingDoc.value);
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(ruling.source?.census_sha256 === censusDoc.sha256 && ruling.source?.census_git_blob === censusDoc.git_blob, "COLLECT-007 census custody drifted");
  assert(ruling.source?.ledger_sha256 === ledgerDoc.sha256 && ruling.source?.ledger_git_blob === ledgerDoc.git_blob, "COLLECT-007 prior-ledger custody drifted");
  assert(ledger.cumulative?.canonical_adoptions === 15 && ledger.cumulative?.remaining_for_canonical_review === 40, "ledger is not at the COLLECT-006 paid boundary");
  assert(ledger.next_batch_contract?.batch === 5 && ledger.next_batch_contract?.requires_new_terminal_rulings === true, "ledger did not require terminal rulings for batch 5");
  assert(census.transaction === "COLLECT-005" && census.counts?.imported_packets === 55, "COLLECT-005 census identity drifted");
  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const censusByKey = new Map(census.packets.map((row) => [row.obligation_id, row]));
  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const contexts = [];

  for (const decision of ruling.decisions) {
    const key = decision.decision_id;
    assert(!adopted.has(key), `${key} was already paid`);
    const [recordId, side] = key.split("/");
    const specimen = specimenById.get(recordId);
    const source = sourceById.get(recordId);
    assert(specimen && source, `${key} canonical record is missing`);
    assert(specimen.actor === decision.actor && source.actor === decision.actor, `${key} actor drifted`);
    assert(specimen.character === decision.character && source.character === decision.character, `${key} character drifted`);
    const otherSide = side === "still" ? "portrait" : "still";
    assert(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide]), `${key} opposite side is incomplete`);

    const censusRow = censusByKey.get(key);
    assert(censusRow && censusRow.lane === "null-binding-without-prior-state", `${key} census lane drifted`);
    assert(censusRow.manifest_path === decision.packet.manifest_path && censusRow.manifest_sha256 === decision.packet.manifest_sha256, `${key} manifest custody drifted`);
    assert(censusRow.candidate_path === decision.packet.candidate_path && censusRow.candidate_sha256 === decision.packet.candidate_sha256, `${key} candidate custody drifted`);
    assert(censusRow.suggested_destination_path === decision.current.destination_path, `${key} destination custody drifted`);
    assert(sameJson(censusRow.suggested_focus, decision.proposed_binding.focus) && censusRow.suggested_origin === decision.proposed_binding.origin, `${key} proposed binding drifted from census`);

    const manifestResolved = resolveInside(resolvedRoot, censusRow.manifest_path, `${key} manifest`);
    const candidateResolved = resolveInside(resolvedRoot, censusRow.candidate_path, `${key} candidate`);
    const checksumResolved = resolveInside(resolvedRoot, censusRow.checksum_path, `${key} checksum ledger`);
    const destination = resolveInside(resolvedRoot, decision.current.destination_path, `${key} destination`);
    const [manifestBytes, candidateBytes, checksumBytes] = await Promise.all([
      readFile(manifestResolved.absolute),
      readFile(candidateResolved.absolute),
      readFile(checksumResolved.absolute),
    ]);
    assert(sha256(manifestBytes) === decision.packet.manifest_sha256, `${key} manifest bytes drifted`);
    assert(sha256(candidateBytes) === decision.packet.candidate_sha256, `${key} candidate bytes drifted`);
    const checksums = parseChecksums(checksumBytes.toString("utf8"), checksumResolved.safe);
    assert(checksums.get(path.posix.basename(censusRow.manifest_path)) === decision.packet.manifest_sha256, `${key} manifest is not checksum-bound`);
    assert(checksums.get(path.posix.basename(censusRow.candidate_path)) === decision.packet.candidate_sha256, `${key} candidate is not checksum-bound`);

    const specimenCurrent = specimen[side] ?? null;
    const sourceCurrent = source[side] ?? null;
    const intended = { src: decision.current.destination_path, ...decision.proposed_binding };
    const destinationExists = await exists(destination.absolute);
    let state;
    if (specimenCurrent === null && sourceCurrent === null) {
      assert(!destinationExists, `${key} destination exists before adoption`);
      state = "pending";
    } else {
      assert(sameJson(specimenCurrent, intended) && sameJson(sourceCurrent, intended), `${key} current binding is neither null nor the exact intended adoption`);
      assert(destinationExists, `${key} adopted destination is missing`);
      assert(sha256(await readFile(destination.absolute)) === decision.packet.candidate_sha256, `${key} adopted destination bytes drifted`);
      state = "already-adopted";
    }
    contexts.push({ key, recordId, side, decision, censusRow, specimen, source, candidateBytes, destination, intended, state });
  }
  assert(contexts.length === 24, `expected 24 COLLECT-008 contexts, found ${contexts.length}`);
  return { resolvedRoot, rulingDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc, ruling, census, ledger, contexts };
}

async function applyTransaction({ inspection, now = new Date().toISOString(), reportPath = null }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  const specimenById = new Map(inspection.specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(inspection.sourcesDoc.value.map((row) => [row.id, row]));
  for (const context of pending) {
    await mkdir(path.dirname(context.destination.absolute), { recursive: true });
    await writeFile(context.destination.absolute, context.candidateBytes, { flag: "wx" });
    specimenById.get(context.recordId)[context.side] = context.intended;
    const source = sourceById.get(context.recordId);
    source[context.side] = context.intended;
    source.fetched_at = String(now).slice(0, 10);
  }
  if (pending.length) {
    await atomicWrite(inspection.specimensDoc.absolute, jsonLike(inspection.specimensDoc.bytes, inspection.specimensDoc.value));
    await atomicWrite(inspection.sourcesDoc.absolute, jsonLike(inspection.sourcesDoc.bytes, inspection.sourcesDoc.value));
  }
  const report = {
    version: 1,
    transaction: "COLLECT-008",
    operation: "whole-current-null-lane-canonical-adoption-apply",
    generated_at: now,
    counts: { authorized: inspection.contexts.length, adopted: pending.length, already_adopted: inspection.contexts.length - pending.length },
    adoptions: inspection.contexts.map((context) => ({
      obligation_id: context.key,
      state: context.state === "pending" ? "adopted" : "already-adopted",
      destination_path: context.destination.safe,
      candidate_sha256: context.decision.packet.candidate_sha256,
    })),
    boundary: {
      discovery_performed: false,
      packet_evidence_rewritten: false,
      arbitrary_batch_size_used: false,
      quality_baseline_reset: false,
      complete_gate_required_before_receipt: true,
      canonical_mutation: pending.length > 0,
    },
  };
  if (reportPath) await atomicWrite(path.resolve(reportPath), Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8"));
  return report;
}

async function validateAdopted({ inspection, beforeQualityPath }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  assert(pending.length === 0, `COLLECT-008 still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    const destinationBytes = await readFile(context.destination.absolute);
    assert(sha256(destinationBytes) === context.decision.packet.candidate_sha256, `${context.key} destination bytes drifted`);
    assert(sameJson(context.specimen[context.side], context.intended), `${context.key} specimen binding drifted`);
    assert(sameJson(context.source[context.side], context.intended), `${context.key} source binding drifted`);
  }
  const [beforeDoc, afterDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readJson(inspection.resolvedRoot, DEFAULTS.quality, "post-adoption quality"),
  ]);
  const before = beforeDoc.value.metrics;
  const after = afterDoc.value.metrics;
  assert(beforeDoc.value.total === 1313 && afterDoc.value.total === 1313, "quality denominator drifted");
  assert(after.complete_pairs === before.complete_pairs + 24, "complete-pair delta is not +24");
  assert(after.missing_still === before.missing_still - 24, "missing-still delta is not -24");
  assert(after.missing_portrait === before.missing_portrait, "missing portraits changed");
  assert(after.missing_both === before.missing_both, "missing-both count changed");
  assert(after.complete_pair_ratio === round6(after.complete_pairs / afterDoc.value.total), "complete-pair ratio is not exact");
  assert(sameJson(beforeDoc.value.baseline, afterDoc.value.baseline), "quality baseline changed");
  return {
    before_doc: beforeDoc,
    after_doc: afterDoc,
    before,
    after,
    deltas: { complete_pairs: 24, missing_still: -24, missing_portrait: 0, missing_both: 0 },
  };
}

async function promoteTransaction({ inspection, beforeQualityPath, authorizedParent, gatedTree, workflowRun, now }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "authorized parent is malformed");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "gated tree is malformed");
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const receiptResolved = resolveInside(inspection.resolvedRoot, DEFAULTS.receipt, "COLLECT-008 receipt");
  assert(!(await exists(receiptResolved.absolute)), "COLLECT-008 receipt already exists");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const adoptionRows = inspection.contexts.map((context) => ({
    record_id: context.recordId,
    side: context.side,
    canonical_path: context.destination.safe,
    canonical_sha256: context.decision.packet.candidate_sha256,
    image_origin: context.intended.origin,
    packet_manifest: context.decision.packet.manifest_path,
    packet_manifest_sha256: context.decision.packet.manifest_sha256,
    ruling_decision: context.key,
  }));
  const receipt = {
    version: 1,
    transaction: "COLLECT-008",
    batch: 5,
    operation: "whole-current-null-lane-canonical-media-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    ruling: {
      path: inspection.rulingDoc.safe,
      sha256: inspection.rulingDoc.sha256,
      git_blob: inspection.rulingDoc.git_blob,
      reviewed: 24,
      authorized: 24,
      blocked: 0,
    },
    authorization: {
      authorized_parent: authorizedParent,
      gated_tree: gatedTree,
      workflow_run: Number(workflowRun),
      exact_head_publication_lease_required: true,
    },
    counts: {
      canonical_adoptions: 24,
      cumulative_canonical_adoptions: 39,
      imported_packets_remaining_for_adoption_review: 16,
      stills: 24,
      portraits: 0,
    },
    quality: {
      before_sha256: quality.before_doc.sha256,
      after_sha256: quality.after_doc.sha256,
      before: quality.before,
      after: quality.after,
      deltas: quality.deltas,
      baseline_unchanged: true,
    },
    adoptions: adoptionRows,
    boundary: {
      visitor_visible_media_improvements: 24,
      arbitrary_batch_size_used: false,
      complete_authorized_lane_exhausted: true,
      discovery_performed: false,
      packet_evidence_rewritten: false,
      source_policy_created: false,
      supervisor_created: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      next_authorized_work: "normalize or terminally reject all 16 packet-review-incompatible objects",
    },
  };

  const ledger = inspection.ledger;
  ledger.recorded_at = now;
  ledger.batches.push({
    transaction: "COLLECT-008",
    batch: 5,
    status: "paid",
    receipt: DEFAULTS.receipt,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: 24,
    obligations: inspection.contexts.map((context) => context.key),
    quality_delta: { complete_pairs: 24, missing_still: -24, missing_portrait: 0, missing_both: 0 },
  });
  for (const context of inspection.contexts) {
    ledger.adopted_obligations.push({
      obligation_id: context.key,
      transaction: "COLLECT-008",
      batch: 5,
      canonical_path: context.destination.safe,
      canonical_sha256: context.decision.packet.candidate_sha256,
    });
  }
  ledger.cumulative = {
    canonical_adoptions: 39,
    remaining_for_canonical_review: 16,
    stills: 39,
    portraits: 0,
    visitor_visible_media_improvements: 39,
  };
  ledger.next_batch_contract = {
    batch: 6,
    prior_canonical_adoptions: 39,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 39,
    expected_remaining_after_full_batch: 16,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_packet_review_normalization_or_terminal_rejection: true,
    census: DEFAULTS.census,
    remaining_lane_counts: { null_binding_without_prior_state: 0, packet_review_incompatible: 16 },
  };

  await atomicWrite(receiptResolved.absolute, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
  await atomicWrite(inspection.ledgerDoc.absolute, jsonLike(inspection.ledgerDoc.bytes, ledger));
  await validateCanonicalAdoptionLedger({ root: inspection.resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { receipt: receiptResolved.safe, ledger: DEFAULTS.ledger, cumulative_adoptions: 39, remaining: 16 };
}

async function reconcilePublication({ root = process.cwd(), adoptionHead, adoptionTree, gatedTree, workflowRun, reconciliationParent, now }) {
  const resolvedRoot = path.resolve(root);
  for (const [label, value] of Object.entries({ adoptionHead, adoptionTree, gatedTree, reconciliationParent })) {
    assert(/^[0-9a-f]{40}$/.test(value || ""), `${label} is malformed`);
  }
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const [receiptDoc, ledgerDoc] = await Promise.all([
    readJson(resolvedRoot, DEFAULTS.receipt, "COLLECT-008 receipt"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
  ]);
  const receipt = receiptDoc.value;
  const ledger = ledgerDoc.value;
  assert(receipt.transaction === "COLLECT-008" && receipt.batch === 5 && receipt.status === "paid", "COLLECT-008 receipt identity drifted");
  assert(receipt.authorization?.workflow_run === Number(workflowRun), "COLLECT-008 workflow run drifted");
  assert(receipt.authorization?.gated_tree === gatedTree, "COLLECT-008 gated tree drifted");
  const batch = exactRow(ledger.batches, (row) => row.transaction === "COLLECT-008" && row.batch === 5, "COLLECT-008 ledger batch");
  assert(batch.status === "paid" && batch.receipt === DEFAULTS.receipt && batch.adoption_count === 24, "COLLECT-008 ledger batch drifted");
  assert(batch.published_head === null || batch.published_head === adoptionHead, "COLLECT-008 published head conflicts");
  batch.published_head = adoptionHead;
  batch.receipt_git_blob = receiptDoc.git_blob;
  ledger.recorded_at = now;
  const publication = {
    version: 1,
    transaction: "COLLECT-008",
    batch: 5,
    operation: "whole-current-null-lane-publication-reconciliation",
    status: "published",
    recorded_at: now,
    authorization: {
      reconciliation_parent: reconciliationParent,
      exact_head_publication_lease_required: true,
    },
    adoption: {
      published_head: adoptionHead,
      published_tree: adoptionTree,
      gated_candidate_tree: gatedTree,
      workflow_run: Number(workflowRun),
      receipt_path: DEFAULTS.receipt,
      receipt_git_blob: receiptDoc.git_blob,
    },
    cumulative: {
      canonical_adoptions: 39,
      remaining_for_canonical_review: 16,
      visitor_visible_media_improvements: 39,
      complete_pairs: 717,
      missing_stills: 349,
    },
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      adoption_receipt_rewritten: false,
      only_publication_custody_reconciled: true,
    },
  };
  const publicationResolved = resolveInside(resolvedRoot, DEFAULTS.publication, "COLLECT-008 publication");
  await atomicWrite(ledgerDoc.absolute, jsonLike(ledgerDoc.bytes, ledger));
  await atomicWrite(publicationResolved.absolute, Buffer.from(`${JSON.stringify(publication, null, 2)}\n`, "utf8"));
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 39, remaining: 16 };
}

async function main() {
  const root = path.resolve(option("--root", "."));
  if (has("--reconcile")) {
    const result = await reconcilePublication({
      root,
      adoptionHead: option("--adoption-head"),
      adoptionTree: option("--adoption-tree"),
      gatedTree: option("--gated-tree"),
      workflowRun: option("--workflow-run"),
      reconciliationParent: option("--reconciliation-parent"),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const inspection = await inspectTransaction({ root });
  if (has("--write")) {
    const report = await applyTransaction({ inspection, now: option("--now", new Date().toISOString()), reportPath: option("--report", null) });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (has("--validate")) {
    const result = await validateAdopted({ inspection, beforeQualityPath: option("--before-quality") });
    console.log(JSON.stringify({ transaction: "COLLECT-008", status: "validated", adoptions: 24, quality: result.deltas }, null, 2));
    return;
  }
  if (has("--promote")) {
    const result = await promoteTransaction({
      inspection,
      beforeQualityPath: option("--before-quality"),
      authorizedParent: option("--authorized-parent"),
      gatedTree: option("--gated-tree"),
      workflowRun: option("--workflow-run"),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify({
    transaction: "COLLECT-008",
    authorized: inspection.contexts.length,
    pending: inspection.contexts.filter((context) => context.state === "pending").length,
    already_adopted: inspection.contexts.filter((context) => context.state === "already-adopted").length,
    prior_canonical_adoptions: inspection.ledger.cumulative.canonical_adoptions,
    expected_cumulative_after: 39,
    expected_remaining_after: 16,
    expected_quality: { complete_pairs: 24, missing_still: -24, missing_portrait: 0, missing_both: 0 },
    obligations: inspection.contexts.map((context) => context.key),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-008 executor failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
