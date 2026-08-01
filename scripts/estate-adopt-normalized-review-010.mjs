#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  vocabularyRuling: "data/review/estate-debt/COLLECT-010-NORMALIZED-REVIEW-VOCABULARY-RULING.json",
  semanticRuling: "data/review/estate-debt/COLLECT-010-PACKET-SEMANTIC-ADAPTER-RULING.json",
  census: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-010-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-010-PUBLICATION.json",
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
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
async function exists(absolutePath) {
  try { await access(absolutePath); return true; }
  catch { return false; }
}
async function readDoc(root, relativePath, label = relativePath) {
  const resolved = resolveInside(root, relativePath, label);
  const bytes = await readFile(resolved.absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`cannot parse ${resolved.safe}: ${error.message}`); }
  return { ...resolved, bytes, value, sha256: sha256(bytes), git_blob: gitBlob(bytes) };
}
async function readJsonAny(filePath, label = filePath) {
  const absolute = path.resolve(filePath);
  const bytes = await readFile(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`cannot parse ${label}: ${error.message}`); }
  return { absolute, bytes, value, sha256: sha256(bytes), git_blob: gitBlob(bytes) };
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function exactRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected one row, found ${matches.length}`);
  return matches[0];
}
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
  const rows = new Map();
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    assert(match, `${label}:${index + 1} is not a SHA-256 row`);
    const name = match[2].trim().replace(/^\.\//, "");
    assert(name && !name.includes("/") && !rows.has(name), `${label}:${index + 1} repeats or nests ${name}`);
    rows.set(name, match[1].toLowerCase());
  }
  assert(rows.size, `${label} is empty`);
  return rows;
}
function validateBinding(binding, side, key) {
  assert(binding && typeof binding === "object" && !Array.isArray(binding), `${key} proposed binding is missing`);
  assert(binding.kind === side, `${key} proposed binding kind drifted`);
  assert(/^images\/uc-\d+-(still|portrait)-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i.test(binding.src || ""), `${key} destination is not versioned media`);
  assert(/^https?:\/\//.test(binding.origin || ""), `${key} origin must be HTTP(S)`);
  assert(binding.pin === true, `${key} binding is not pinned`);
  assert(new Set(["left", "center", "right"]).has(binding.focus?.x), `${key} focus.x is invalid`);
  assert(new Set(["top", "upper", "center", "lower", "bottom"]).has(binding.focus?.y), `${key} focus.y is invalid`);
}

function validateRulings(vocabulary, semantic) {
  assert(vocabulary?.transaction === "COLLECT-010" && vocabulary.operation === "normalized-packet-review-vocabulary-ruling" && vocabulary.status === "authorized", "normalized vocabulary ruling identity drifted");
  assert(vocabulary.denominator?.normalized_packets_reviewed === 12 && vocabulary.denominator?.authorized === 12 && vocabulary.denominator?.remaining_after_successful_adoption === 5, "normalized vocabulary denominator drifted");
  assert(semantic?.transaction === "COLLECT-010" && semantic.operation === "exact-packet-semantic-adapter-reconciliation", "semantic adapter ruling identity drifted");
  assert(semantic.denominator?.authorized_semantic_adapter === 12 && semantic.denominator?.blocked_structural_custody === 4, "semantic adapter denominator drifted");
  assert(semantic.correction?.evidence_standard_changed === false && semantic.boundary?.canonical_mutation === false, "semantic adapter escaped evidence-only boundary");
  const vocabularySet = [...vocabulary.authorized_obligations].sort();
  const semanticSet = [...semantic.authorized_obligations].sort();
  assert(sameJson(vocabularySet, semanticSet), "COLLECT-010 rulings disagree on authorized obligations");
  assert(vocabularySet.length === 12 && new Set(vocabularySet).size === 12, "COLLECT-010 authorized set is not twelve unique obligations");
  const blocked = semantic.blocked_obligations.map((row) => row.obligation_id).sort();
  assert(sameJson(blocked, ["UC-1004/portrait", "UC-518/portrait", "UC-526/portrait", "UC-625/portrait"]), "structural blocker set drifted");
  assert(vocabulary.deferred_obligations?.distinct_era_media?.includes("UC-338/still"), "UC-338 distinct-era debt is missing");
  return vocabularySet;
}

async function inspectTransaction({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [vocabularyDoc, semanticDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.vocabularyRuling, "normalized vocabulary ruling"),
    readDoc(resolvedRoot, DEFAULTS.semanticRuling, "semantic adapter ruling"),
    readDoc(resolvedRoot, DEFAULTS.census, "COLLECT-005 census"),
    readDoc(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readDoc(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readDoc(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const vocabulary = vocabularyDoc.value;
  const semantic = semanticDoc.value;
  const authorizedKeys = validateRulings(vocabulary, semantic);
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(census.transaction === "COLLECT-005" && census.counts?.packet_review_incompatible === 16, "COLLECT-005 incompatible denominator drifted");
  assert(ledger.cumulative?.canonical_adoptions === 38 && ledger.cumulative?.remaining_for_canonical_review === 17, "ledger is not at the paid COLLECT-008 boundary");
  assert(ledger.cumulative?.stills === 38 && ledger.cumulative?.portraits === 0 && ledger.cumulative?.visitor_visible_media_improvements === 38, "paid media type accounting drifted");
  assert(ledger.next_batch_contract?.batch === 6 && ledger.next_batch_contract?.prior_canonical_adoptions === 38, "ledger next-batch contract is not batch 6");
  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const censusByKey = new Map(census.packets.map((row) => [row.obligation_id, row]));
  const semanticByKey = new Map(semantic.decisions.map((row) => [row.obligation_id, row]));
  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const contexts = [];

  for (const key of authorizedKeys) {
    assert(!adopted.has(key), `${key} is already paid`);
    const [recordId, side] = key.split("/");
    const row = censusByKey.get(key);
    const decision = semanticByKey.get(key);
    assert(row && row.lane === "packet-review-incompatible" && row.packet_generation === "normalized", `${key} census lane drifted`);
    assert(decision?.status === "authorized-semantic-adapter", `${key} lacks terminal semantic authorization`);
    assert(decision.packet?.candidate_path === row.candidate_path && decision.packet?.candidate_sha256 === row.candidate_sha256, `${key} candidate custody differs between ruling and census`);
    assert(decision.packet?.manifest_path === row.manifest_path && decision.packet?.manifest_sha256 === row.manifest_sha256, `${key} manifest custody differs between ruling and census`);
    validateBinding(decision.proposed_binding, side, key);
    assert(decision.proposed_binding.src === row.suggested_destination_path, `${key} destination differs from census`);
    assert(decision.proposed_binding.origin === row.suggested_origin && sameJson(decision.proposed_binding.focus, row.suggested_focus), `${key} binding origin or focus differs from census`);

    const specimen = specimenById.get(recordId);
    const source = sourceById.get(recordId);
    assert(specimen && source, `${key} canonical record is missing`);
    assert(specimen.actor === decision.actor && source.actor === decision.actor, `${key} actor drifted`);
    assert(specimen.character === decision.character && source.character === decision.character, `${key} character drifted`);
    const otherSide = side === "still" ? "portrait" : "still";
    assert(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide]), `${key} opposite side is incomplete`);

    const manifestResolved = resolveInside(resolvedRoot, row.manifest_path, `${key} manifest`);
    const candidateResolved = resolveInside(resolvedRoot, row.candidate_path, `${key} candidate`);
    const checksumResolved = resolveInside(resolvedRoot, row.checksum_path, `${key} checksum ledger`);
    const destination = resolveInside(resolvedRoot, decision.proposed_binding.src, `${key} destination`);
    const [manifestBytes, candidateBytes, checksumBytes] = await Promise.all([
      readFile(manifestResolved.absolute),
      readFile(candidateResolved.absolute),
      readFile(checksumResolved.absolute),
    ]);
    assert(sha256(manifestBytes) === row.manifest_sha256, `${key} manifest bytes drifted`);
    assert(sha256(candidateBytes) === row.candidate_sha256, `${key} candidate bytes drifted`);
    const sums = parseChecksums(checksumBytes.toString("utf8"), checksumResolved.safe);
    assert(sums.get(path.posix.basename(row.manifest_path)) === row.manifest_sha256, `${key} manifest is not checksum-bound`);
    assert(sums.get(path.posix.basename(row.candidate_path)) === row.candidate_sha256, `${key} candidate is not checksum-bound`);

    const specimenCurrent = specimen[side] ?? null;
    const sourceCurrent = source[side] ?? null;
    const destinationExists = await exists(destination.absolute);
    let state;
    if (specimenCurrent === null && sourceCurrent === null) {
      assert(!destinationExists, `${key} destination exists before adoption`);
      state = "pending";
    } else {
      assert(sameJson(specimenCurrent, decision.proposed_binding) && sameJson(sourceCurrent, decision.proposed_binding), `${key} current binding is neither null nor the exact intended adoption`);
      assert(destinationExists, `${key} adopted destination is missing`);
      assert(sha256(await readFile(destination.absolute)) === row.candidate_sha256, `${key} adopted destination bytes drifted`);
      state = "already-adopted";
    }
    contexts.push({ key, recordId, side, row, decision, specimen, source, candidateBytes, destination, intended: decision.proposed_binding, state });
  }

  assert(contexts.length === 12, `expected 12 COLLECT-010 contexts, found ${contexts.length}`);
  assert(contexts.filter((row) => row.side === "still").length === 10, "COLLECT-010 still denominator drifted");
  assert(contexts.filter((row) => row.side === "portrait").length === 2, "COLLECT-010 portrait denominator drifted");
  return { resolvedRoot, vocabularyDoc, semanticDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc, vocabulary, semantic, census, ledger, contexts };
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
    transaction: "COLLECT-010",
    operation: "normalized-review-canonical-adoption-apply",
    generated_at: now,
    counts: {
      authorized: inspection.contexts.length,
      adopted: pending.length,
      already_adopted: inspection.contexts.length - pending.length,
      stills: inspection.contexts.filter((row) => row.side === "still").length,
      portraits: inspection.contexts.filter((row) => row.side === "portrait").length,
    },
    adoptions: inspection.contexts.map((context) => ({
      obligation_id: context.key,
      state: context.state === "pending" ? "adopted" : "already-adopted",
      destination_path: context.destination.safe,
      candidate_sha256: context.row.candidate_sha256,
    })),
    boundary: {
      discovery_performed: false,
      packet_evidence_rewritten: false,
      review_authority_added: false,
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
  assert(pending.length === 0, `COLLECT-010 still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    const destinationBytes = await readFile(context.destination.absolute);
    assert(sha256(destinationBytes) === context.row.candidate_sha256, `${context.key} destination bytes drifted`);
    assert(sameJson(context.specimen[context.side], context.intended), `${context.key} specimen binding drifted`);
    assert(sameJson(context.source[context.side], context.intended), `${context.key} source binding drifted`);
  }
  const [beforeDoc, afterDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readDoc(inspection.resolvedRoot, DEFAULTS.quality, "post-adoption quality"),
  ]);
  const before = beforeDoc.value.metrics;
  const after = afterDoc.value.metrics;
  assert(beforeDoc.value.total === 1313 && afterDoc.value.total === 1313, "quality denominator drifted");
  assert(before.complete_pairs === 716 && before.missing_still === 350 && before.missing_portrait === 356 && before.missing_both === 109, "pre-adoption quality is not the paid COLLECT-008 state");
  assert(after.complete_pairs === 728, "complete pairs did not reach 728");
  assert(after.missing_still === 340, "missing stills did not reach 340");
  assert(after.missing_portrait === 354, "missing portraits did not reach 354");
  assert(after.missing_both === 109, "missing-both count changed");
  assert(after.complete_pair_ratio === round6(728 / 1313), "complete-pair ratio is not exact");
  assert(after.complete_pairs === before.complete_pairs + 12, "complete-pair delta is not +12");
  assert(after.missing_still === before.missing_still - 10, "missing-still delta is not -10");
  assert(after.missing_portrait === before.missing_portrait - 2, "missing-portrait delta is not -2");
  assert(after.missing_both === before.missing_both, "missing-both delta is not zero");
  assert(sameJson(beforeDoc.value.baseline, afterDoc.value.baseline), "quality baseline changed");
  return {
    before_doc: beforeDoc,
    after_doc: afterDoc,
    before,
    after,
    deltas: { complete_pairs: 12, missing_still: -10, missing_portrait: -2, missing_both: 0 },
  };
}

async function promoteTransaction({ inspection, beforeQualityPath, authorizedParent, gatedTree, workflowRun, now }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "authorized parent is malformed");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "gated tree is malformed");
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const receiptResolved = resolveInside(inspection.resolvedRoot, DEFAULTS.receipt, "COLLECT-010 receipt");
  assert(!(await exists(receiptResolved.absolute)), "COLLECT-010 receipt already exists");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const adoptionRows = inspection.contexts.map((context) => ({
    record_id: context.recordId,
    side: context.side,
    canonical_path: context.destination.safe,
    canonical_sha256: context.row.candidate_sha256,
    image_origin: context.intended.origin,
    packet_manifest: context.row.manifest_path,
    packet_manifest_sha256: context.row.manifest_sha256,
    ruling_decision: context.key,
  }));
  const receipt = {
    version: 1,
    transaction: "COLLECT-010",
    batch: 6,
    operation: "normalized-review-vocabulary-canonical-media-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    rulings: {
      vocabulary: {
        path: inspection.vocabularyDoc.safe,
        sha256: inspection.vocabularyDoc.sha256,
        git_blob: inspection.vocabularyDoc.git_blob,
      },
      semantic_adapter: {
        path: inspection.semanticDoc.safe,
        sha256: inspection.semanticDoc.sha256,
        git_blob: inspection.semanticDoc.git_blob,
      },
      authorized: 12,
      structural_blockers: 4,
      distinct_media_debt: 1,
    },
    authorization: {
      authorized_parent: authorizedParent,
      gated_tree: gatedTree,
      workflow_run: Number(workflowRun),
      exact_head_publication_lease_required: true,
    },
    counts: {
      canonical_adoptions: 12,
      cumulative_canonical_adoptions: 50,
      imported_packets_remaining_for_adoption_review: 5,
      stills: 10,
      portraits: 2,
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
      visitor_visible_media_improvements: 12,
      arbitrary_batch_size_used: false,
      normalized_authorized_set_exhausted: true,
      deferred_structural_custody: 4,
      deferred_distinct_media_debt: 1,
      discovery_performed: false,
      packet_evidence_rewritten: false,
      review_authority_added: false,
      source_policy_created: false,
      supervisor_created: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      next_authorized_work: "adjudicate four batched-amortized portrait packets and resolve UC-338/still with a byte-distinct era-specific still",
    },
  };

  const ledger = inspection.ledger;
  ledger.recorded_at = now;
  ledger.batches.push({
    transaction: "COLLECT-010",
    batch: 6,
    status: "paid",
    receipt: DEFAULTS.receipt,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: 12,
    obligations: inspection.contexts.map((context) => context.key),
    quality_delta: { complete_pairs: 12, missing_still: -10, missing_portrait: -2, missing_both: 0 },
  });
  for (const context of inspection.contexts) {
    ledger.adopted_obligations.push({
      obligation_id: context.key,
      transaction: "COLLECT-010",
      batch: 6,
      canonical_path: context.destination.safe,
      canonical_sha256: context.row.candidate_sha256,
    });
  }
  ledger.cumulative = {
    canonical_adoptions: 50,
    remaining_for_canonical_review: 5,
    stills: 48,
    portraits: 2,
    visitor_visible_media_improvements: 50,
  };
  ledger.next_batch_contract = {
    batch: 7,
    prior_canonical_adoptions: 50,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 50,
    expected_remaining_after_full_batch: 5,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_batched_amortized_second_desk: true,
    requires_distinct_era_media: true,
    census: DEFAULTS.census,
    remaining_lane_counts: {
      batched_amortized_second_desk: 4,
      distinct_media_debt: 1,
    },
  };

  await atomicWrite(receiptResolved.absolute, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
  await atomicWrite(inspection.ledgerDoc.absolute, jsonLike(inspection.ledgerDoc.bytes, ledger));
  await validateCanonicalAdoptionLedger({ root: inspection.resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { receipt: receiptResolved.safe, ledger: DEFAULTS.ledger, canonical_adoptions: 50, remaining: 5 };
}

async function reconcilePublication({ root = process.cwd(), adoptionHead, adoptionTree, gatedTree, workflowRun, reconciliationParent, now }) {
  const resolvedRoot = path.resolve(root);
  for (const [label, value] of Object.entries({ adoptionHead, adoptionTree, gatedTree, reconciliationParent })) {
    assert(/^[0-9a-f]{40}$/.test(value || ""), `${label} is malformed`);
  }
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const [receiptDoc, ledgerDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.receipt, "COLLECT-010 receipt"),
    readDoc(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
  ]);
  const receipt = receiptDoc.value;
  const ledger = ledgerDoc.value;
  assert(receipt.transaction === "COLLECT-010" && receipt.batch === 6 && receipt.status === "paid", "COLLECT-010 receipt identity drifted");
  assert(receipt.authorization?.workflow_run === Number(workflowRun), "COLLECT-010 workflow run drifted");
  assert(receipt.authorization?.gated_tree === gatedTree, "COLLECT-010 gated tree drifted");
  const batch = exactRow(ledger.batches, (row) => row.transaction === "COLLECT-010" && row.batch === 6, "COLLECT-010 ledger batch");
  assert(batch.status === "paid" && batch.receipt === DEFAULTS.receipt && batch.adoption_count === 12, "COLLECT-010 ledger batch drifted");
  assert(batch.published_head === null || batch.published_head === adoptionHead, "COLLECT-010 published head conflicts");
  batch.published_head = adoptionHead;
  batch.receipt_git_blob = receiptDoc.git_blob;
  ledger.recorded_at = now;
  const publication = {
    version: 1,
    transaction: "COLLECT-010",
    batch: 6,
    operation: "normalized-review-publication-reconciliation",
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
      canonical_adoptions: 50,
      remaining_for_canonical_review: 5,
      visitor_visible_media_improvements: 50,
      complete_pairs: 728,
      missing_stills: 340,
      missing_portraits: 354,
      missing_both: 109,
    },
    residual_estate: {
      batched_amortized_second_desk: ["UC-1004/portrait", "UC-518/portrait", "UC-526/portrait", "UC-625/portrait"],
      distinct_media_debt: ["UC-338/still"],
    },
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      adoption_receipt_rewritten: false,
      only_publication_custody_reconciled: true,
    },
  };
  const publicationResolved = resolveInside(resolvedRoot, DEFAULTS.publication, "COLLECT-010 publication");
  await atomicWrite(ledgerDoc.absolute, jsonLike(ledgerDoc.bytes, ledger));
  await atomicWrite(publicationResolved.absolute, Buffer.from(`${JSON.stringify(publication, null, 2)}\n`, "utf8"));
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 50, remaining: 5 };
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
    console.log(JSON.stringify({ transaction: "COLLECT-010", status: "validated", adoptions: 12, quality: result.deltas }, null, 2));
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
    transaction: "COLLECT-010",
    authorized: inspection.contexts.length,
    pending: inspection.contexts.filter((context) => context.state === "pending").length,
    already_adopted: inspection.contexts.filter((context) => context.state === "already-adopted").length,
    stills: inspection.contexts.filter((context) => context.side === "still").length,
    portraits: inspection.contexts.filter((context) => context.side === "portrait").length,
    prior_canonical_adoptions: inspection.ledger.cumulative.canonical_adoptions,
    expected_cumulative_after: 50,
    expected_remaining_after: 5,
    expected_quality: { complete_pairs: 12, missing_still: -10, missing_portrait: -2, missing_both: 0 },
    obligations: inspection.contexts.map((context) => context.key),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-010 normalized-review executor failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
