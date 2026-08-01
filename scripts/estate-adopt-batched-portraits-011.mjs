#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  ruling: "data/review/estate-debt/COLLECT-011-BATCHED-PORTRAIT-SECOND-DESK-RULING.json",
  census: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-011-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-011-PUBLICATION.json",
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
  const temporary = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, absolutePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
function manifestEntry(manifest, filename, key) {
  const matches = (manifest.files || []).filter((row) => row?.path === filename);
  assert(matches.length === 1, `${key} manifest must contain one ${filename} entry; found ${matches.length}`);
  return matches[0];
}
function validateBinding(binding, key) {
  assert(binding && typeof binding === "object" && !Array.isArray(binding), `${key} proposed binding is missing`);
  assert(new Set(["copyright", "free"]).has(binding.kind), `${key} portrait kind is invalid`);
  assert(/^images\/uc-\d+-portrait-[0-9a-f]{12}\.(?:jpg|jpeg|png|webp)$/i.test(binding.src || ""), `${key} destination is not versioned portrait media`);
  assert(/^https?:\/\//.test(binding.origin || ""), `${key} origin must be HTTP(S)`);
  if (binding.kind === "free") {
    assert(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(binding.origin), `${key} free media must cite an exact Commons File page`);
    assert(typeof binding.author === "string" && binding.author.trim(), `${key} free media lacks author custody`);
    assert(typeof binding.license === "string" && binding.license.trim(), `${key} free media lacks license custody`);
    assert(Number.isInteger(binding.year), `${key} free media lacks an integer year`);
  }
  assert(binding.pin === true, `${key} binding is not pinned`);
  assert(new Set(["left", "center", "right"]).has(binding.focus?.x), `${key} focus.x is invalid`);
  assert(new Set(["top", "upper", "center", "lower", "bottom"]).has(binding.focus?.y), `${key} focus.y is invalid`);
}
function validateRuling(ruling) {
  assert(ruling?.version === 1, "COLLECT-011 ruling version drifted");
  assert(ruling.transaction === "COLLECT-011" && ruling.operation === "batched-amortized-portrait-second-desk-reconciliation", "COLLECT-011 ruling identity drifted");
  assert(ruling.status === "authorized", "COLLECT-011 ruling is not authorized");
  assert(ruling.defect?.evidence_standard_changed === false && ruling.defect?.packet_evidence_rewritten === false && ruling.defect?.canonical_mutation === false, "COLLECT-011 ruling escaped its evidence-only boundary");
  assert(ruling.denominator?.remaining_batched_amortized_portraits === 4 && ruling.denominator?.reviewed === 4 && ruling.denominator?.authorized === 4 && ruling.denominator?.blocked === 0, "COLLECT-011 denominator drifted");
  assert(ruling.denominator?.remaining_after_successful_adoption === 1, "COLLECT-011 remaining denominator drifted");
  const expected = ["UC-1004/portrait", "UC-518/portrait", "UC-526/portrait", "UC-625/portrait"];
  assert(sameJson([...ruling.authorized_obligations].sort(), expected), "COLLECT-011 authorized set drifted");
  assert(Array.isArray(ruling.decisions) && ruling.decisions.length === 4, "COLLECT-011 decisions[] must contain four rows");
  const seen = new Set();
  const totals = { complete_pairs: 0, missing_still: 0, missing_portrait: 0, missing_both: 0 };
  for (const decision of ruling.decisions) {
    const key = decision.obligation_id;
    assert(expected.includes(key) && !seen.has(key), `invalid or duplicate COLLECT-011 decision ${key}`);
    seen.add(key);
    assert(decision.side === "portrait" && decision.status === "authorized-batched-second-desk", `${key} is not terminally authorized portrait media`);
    assert(decision.packet?.candidate_mime === "image/jpeg", `${key} candidate MIME drifted`);
    for (const hash of [decision.packet?.manifest_sha256, decision.packet?.review_sha256, decision.packet?.candidate_sha256, decision.packet?.visual_decision_sha256]) {
      assert(/^[0-9a-f]{64}$/.test(hash || ""), `${key} contains a malformed SHA-256`);
    }
    for (const blob of [decision.packet?.manifest_git_blob, decision.packet?.review_git_blob]) {
      assert(/^[0-9a-f]{40}$/.test(blob || ""), `${key} contains a malformed Git blob id`);
    }
    assert(decision.review?.independent_from_discovery === true && decision.review?.identity === "expected" && decision.review?.presentation === "neutral-human", `${key} second-desk semantics drifted`);
    assert(decision.review?.deterministic_wall_crop === true, `${key} lacks deterministic crop custody`);
    assert(Array.isArray(decision.review?.candidate_repository_matches) && decision.review.candidate_repository_matches.length === 0, `${key} candidate duplicate screen did not pass`);
    assert(Array.isArray(decision.review?.wall_crop_repository_matches) && decision.review.wall_crop_repository_matches.length === 0, `${key} wall-crop duplicate screen did not pass`);
    assert(decision.current?.exact_null === true && decision.current?.destination_exists === false, `${key} is not exact-current-null`);
    validateBinding(decision.proposed_binding, key);
    for (const field of Object.keys(totals)) {
      assert(Number.isInteger(decision.quality_effect?.[field]), `${key} quality effect ${field} is missing`);
      totals[field] += decision.quality_effect[field];
    }
  }
  assert(sameJson(totals, ruling.quality_effect_if_adopted), "COLLECT-011 quality denominator differs from row effects");
  return ruling;
}

async function inspectTransaction({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [rulingDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.ruling, "COLLECT-011 ruling"),
    readDoc(resolvedRoot, DEFAULTS.census, "COLLECT-005 census"),
    readDoc(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readDoc(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readDoc(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const ruling = validateRuling(rulingDoc.value);
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(census.transaction === "COLLECT-005" && census.counts?.packet_review_incompatible === 16, "COLLECT-005 incompatible denominator drifted");
  assert(ledger.cumulative?.canonical_adoptions === 50 && ledger.cumulative?.remaining_for_canonical_review === 5, "ledger is not at the paid COLLECT-010 boundary");
  assert(ledger.cumulative?.stills === 48 && ledger.cumulative?.portraits === 2 && ledger.cumulative?.visitor_visible_media_improvements === 50, "COLLECT-010 media accounting drifted");
  assert(ledger.next_batch_contract?.batch === 7 && ledger.next_batch_contract?.prior_canonical_adoptions === 50, "ledger next-batch contract is not batch 7");
  assert(ledger.next_batch_contract?.requires_batched_amortized_second_desk === true, "ledger does not authorize batched-amortized second-desk work");
  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const censusByKey = new Map(census.packets.map((row) => [row.obligation_id, row]));
  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const contexts = [];

  for (const decision of ruling.decisions) {
    const key = decision.obligation_id;
    assert(!adopted.has(key), `${key} is already paid`);
    const row = censusByKey.get(key);
    assert(row && row.lane === "packet-review-incompatible" && row.packet_generation === "batched-amortized", `${key} census lane drifted`);
    assert(row.record_id === decision.record_id && row.side === "portrait", `${key} census identity drifted`);
    assert(row.actor === decision.actor && row.character === decision.character, `${key} census actor or character drifted`);
    assert(row.manifest_path === decision.packet.manifest_path && row.manifest_sha256 === decision.packet.manifest_sha256, `${key} manifest custody differs from census`);
    assert(row.candidate_path === decision.packet.candidate_path && row.candidate_sha256 === decision.packet.candidate_sha256, `${key} candidate custody differs from census`);
    assert(row.suggested_destination_path === decision.proposed_binding.src, `${key} destination differs from census`);
    assert(row.suggested_origin === decision.proposed_binding.origin && sameJson(row.suggested_focus, decision.proposed_binding.focus), `${key} origin or focus differs from census`);

    const manifestDoc = await readDoc(resolvedRoot, decision.packet.manifest_path, `${key} manifest`);
    const reviewDoc = await readDoc(resolvedRoot, decision.packet.review_path, `${key} review`);
    const candidateResolved = resolveInside(resolvedRoot, decision.packet.candidate_path, `${key} candidate`);
    const destination = resolveInside(resolvedRoot, decision.proposed_binding.src, `${key} destination`);
    const candidateBytes = await readFile(candidateResolved.absolute);
    assert(manifestDoc.sha256 === decision.packet.manifest_sha256 && manifestDoc.git_blob === decision.packet.manifest_git_blob, `${key} manifest bytes drifted`);
    assert(reviewDoc.sha256 === decision.packet.review_sha256 && reviewDoc.git_blob === decision.packet.review_git_blob, `${key} review bytes drifted`);
    assert(sha256(candidateBytes) === decision.packet.candidate_sha256, `${key} candidate bytes drifted`);

    const manifest = manifestDoc.value;
    const review = reviewDoc.value;
    assert(manifest.record_id === decision.record_id && manifest.side === "portrait" && manifest.disposition === "reviewed-evidence-candidate" && manifest.canonical_mutation === false, `${key} manifest identity drifted`);
    const candidateEntry = manifestEntry(manifest, path.posix.basename(decision.packet.candidate_path), key);
    const reviewEntry = manifestEntry(manifest, path.posix.basename(decision.packet.review_path), key);
    assert(candidateEntry.sha256 === decision.packet.candidate_sha256 && candidateEntry.bytes === candidateBytes.length, `${key} manifest does not bind candidate bytes`);
    assert(reviewEntry.sha256 === decision.packet.review_sha256 && reviewEntry.bytes === reviewDoc.bytes.length, `${key} manifest does not bind review bytes`);

    assert(review.record_id === decision.record_id && review.side === "portrait" && review.disposition === "reviewed-evidence-candidate", `${key} review identity drifted`);
    assert(review.canonical_mutation === false && review.permanent_evidence_publication_candidate === true, `${key} review escaped evidence-only custody`);
    assert(review.visual_adjudication?.status === "accepted" && review.visual_adjudication?.independent_from_discovery === true, `${key} independent visual adjudication did not pass`);
    assert(review.visual_adjudication?.identity?.value === "expected" && review.visual_adjudication?.presentation?.value === "neutral-human", `${key} identity or presentation ruling drifted`);
    assert(review.visual_adjudication?.decision_sha256 === decision.packet.visual_decision_sha256, `${key} visual decision hash drifted`);
    assert(review.render_contract?.canonical_mutation === false && review.render_contract?.wall_width === 1246 && review.render_contract?.wall_height === 1000, `${key} deterministic crop contract drifted`);
    assert(review.render_result?.candidate?.path === path.posix.basename(decision.packet.candidate_path) && review.render_result?.candidate?.sha256 === decision.packet.candidate_sha256, `${key} rendered candidate custody drifted`);
    assert(Array.isArray(review.render_result?.candidate?.repository_matches) && review.render_result.candidate.repository_matches.length === 0, `${key} rendered candidate has repository matches`);
    assert(review.render_result?.wall_crop?.path === "card-crop-preview.jpg" && Array.isArray(review.render_result?.wall_crop?.repository_matches) && review.render_result.wall_crop.repository_matches.length === 0, `${key} wall-crop duplicate custody drifted`);
    assert(Array.isArray(review.duplicate_scan?.items) && review.duplicate_scan.items.length >= 3 && review.duplicate_scan.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0), `${key} duplicate scan did not pass`);
    const sourceBinding = review.selected_source;
    const intended = decision.proposed_binding;
    assert(sourceBinding?.origin === intended.origin && sourceBinding?.kind === intended.kind, `${key} source provenance differs from ruling`);
    if (intended.kind === "free") {
      assert(sourceBinding.author === intended.author && sourceBinding.license === intended.license && sourceBinding.year === intended.year, `${key} free-media attribution differs from retained review`);
    }

    const specimen = specimenById.get(decision.record_id);
    const source = sourceById.get(decision.record_id);
    assert(specimen && source, `${key} canonical record is missing`);
    assert(specimen.actor === decision.actor && source.actor === decision.actor, `${key} actor drifted`);
    assert(specimen.character === decision.character && source.character === decision.character, `${key} character drifted`);
    const specimenCurrent = specimen.portrait ?? null;
    const sourceCurrent = source.portrait ?? null;
    const destinationExists = await exists(destination.absolute);
    const specimenStill = specimen.still ?? null;
    const sourceStill = source.still ?? null;
    assert(Boolean(specimenStill?.src) === decision.current.other_side_present, `${key} specimen opposite-side state drifted`);
    assert(Boolean(sourceStill?.src) === decision.current.other_side_present, `${key} source opposite-side state drifted`);
    assert(sameJson(specimenStill, sourceStill), `${key} opposite-side canonical rows differ`);
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
    contexts.push({ key, recordId: decision.record_id, side: "portrait", decision, row, specimen, source, candidateBytes, destination, intended, state });
  }
  assert(contexts.length === 4, `expected four COLLECT-011 contexts, found ${contexts.length}`);
  return { resolvedRoot, rulingDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc, ruling, census, ledger, contexts };
}

async function applyTransaction({ inspection, now = new Date().toISOString(), reportPath = null }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  const specimenById = new Map(inspection.specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(inspection.sourcesDoc.value.map((row) => [row.id, row]));
  for (const context of pending) {
    await mkdir(path.dirname(context.destination.absolute), { recursive: true });
    await writeFile(context.destination.absolute, context.candidateBytes, { flag: "wx" });
    specimenById.get(context.recordId).portrait = context.intended;
    const source = sourceById.get(context.recordId);
    source.portrait = context.intended;
    source.fetched_at = String(now).slice(0, 10);
  }
  if (pending.length) {
    await atomicWrite(inspection.specimensDoc.absolute, jsonLike(inspection.specimensDoc.bytes, inspection.specimensDoc.value));
    await atomicWrite(inspection.sourcesDoc.absolute, jsonLike(inspection.sourcesDoc.bytes, inspection.sourcesDoc.value));
  }
  const report = {
    version: 1,
    transaction: "COLLECT-011",
    operation: "batched-portrait-canonical-adoption-apply",
    generated_at: now,
    counts: {
      authorized: inspection.contexts.length,
      adopted: pending.length,
      already_adopted: inspection.contexts.length - pending.length,
      portraits: inspection.contexts.length,
    },
    adoptions: inspection.contexts.map((context) => ({
      obligation_id: context.key,
      state: context.state === "pending" ? "adopted" : "already-adopted",
      destination_path: context.destination.safe,
      candidate_sha256: context.decision.packet.candidate_sha256,
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
  assert(pending.length === 0, `COLLECT-011 still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    assert(sha256(await readFile(context.destination.absolute)) === context.decision.packet.candidate_sha256, `${context.key} destination bytes drifted`);
    assert(sameJson(context.specimen.portrait, context.intended), `${context.key} specimen binding drifted`);
    assert(sameJson(context.source.portrait, context.intended), `${context.key} source binding drifted`);
  }
  const [beforeDoc, afterDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readDoc(inspection.resolvedRoot, DEFAULTS.quality, "post-adoption quality"),
  ]);
  const before = beforeDoc.value.metrics;
  const after = afterDoc.value.metrics;
  assert(beforeDoc.value.total === 1313 && afterDoc.value.total === 1313, "quality denominator drifted");
  assert(before.complete_pairs === 728 && before.missing_still === 340 && before.missing_portrait === 354 && before.missing_both === 109, "pre-adoption quality is not the paid COLLECT-010 state");
  assert(after.complete_pairs === 730, "complete pairs did not reach 730");
  assert(after.missing_still === 340, "missing stills changed");
  assert(after.missing_portrait === 350, "missing portraits did not reach 350");
  assert(after.missing_both === 107, "missing-both count did not reach 107");
  assert(after.complete_pair_ratio === round6(730 / 1313), "complete-pair ratio is not exact");
  assert(after.complete_pairs === before.complete_pairs + 2, "complete-pair delta is not +2");
  assert(after.missing_still === before.missing_still, "missing-still delta is not zero");
  assert(after.missing_portrait === before.missing_portrait - 4, "missing-portrait delta is not -4");
  assert(after.missing_both === before.missing_both - 2, "missing-both delta is not -2");
  assert(sameJson(beforeDoc.value.baseline, afterDoc.value.baseline), "quality baseline changed");
  return {
    before_doc: beforeDoc,
    after_doc: afterDoc,
    before,
    after,
    deltas: { complete_pairs: 2, missing_still: 0, missing_portrait: -4, missing_both: -2 },
  };
}

async function promoteTransaction({ inspection, beforeQualityPath, authorizedParent, gatedTree, workflowRun, now }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "authorized parent is malformed");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "gated tree is malformed");
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const receiptResolved = resolveInside(inspection.resolvedRoot, DEFAULTS.receipt, "COLLECT-011 receipt");
  assert(!(await exists(receiptResolved.absolute)), "COLLECT-011 receipt already exists");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const adoptionRows = inspection.contexts.map((context) => ({
    record_id: context.recordId,
    side: "portrait",
    canonical_path: context.destination.safe,
    canonical_sha256: context.decision.packet.candidate_sha256,
    image_origin: context.intended.origin,
    packet_manifest: context.decision.packet.manifest_path,
    packet_manifest_sha256: context.decision.packet.manifest_sha256,
    ruling_decision: context.key,
  }));
  const receipt = {
    version: 1,
    transaction: "COLLECT-011",
    batch: 7,
    operation: "batched-amortized-portrait-canonical-media-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    ruling: {
      path: inspection.rulingDoc.safe,
      sha256: inspection.rulingDoc.sha256,
      git_blob: inspection.rulingDoc.git_blob,
      reviewed: 4,
      authorized: 4,
      blocked: 0,
    },
    authorization: {
      authorized_parent: authorizedParent,
      gated_tree: gatedTree,
      workflow_run: Number(workflowRun),
      exact_head_publication_lease_required: true,
    },
    counts: {
      canonical_adoptions: 4,
      cumulative_canonical_adoptions: 54,
      imported_packets_remaining_for_adoption_review: 1,
      stills: 0,
      portraits: 4,
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
      visitor_visible_media_improvements: 4,
      arbitrary_batch_size_used: false,
      complete_batched_portrait_lane_exhausted: true,
      deferred_distinct_media_debt: 1,
      discovery_performed: false,
      packet_evidence_rewritten: false,
      review_authority_added: false,
      source_policy_created: false,
      supervisor_created: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      next_authorized_work: "resolve only UC-338/still with a byte-distinct David Brierly-era K9 image",
    },
  };

  const ledger = inspection.ledger;
  ledger.recorded_at = now;
  ledger.batches.push({
    transaction: "COLLECT-011",
    batch: 7,
    status: "paid",
    receipt: DEFAULTS.receipt,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: 4,
    obligations: inspection.contexts.map((context) => context.key),
    quality_delta: { complete_pairs: 2, missing_still: 0, missing_portrait: -4, missing_both: -2 },
  });
  for (const context of inspection.contexts) {
    ledger.adopted_obligations.push({
      obligation_id: context.key,
      transaction: "COLLECT-011",
      batch: 7,
      canonical_path: context.destination.safe,
      canonical_sha256: context.decision.packet.candidate_sha256,
    });
  }
  ledger.cumulative = {
    canonical_adoptions: 54,
    remaining_for_canonical_review: 1,
    stills: 48,
    portraits: 6,
    visitor_visible_media_improvements: 54,
  };
  ledger.next_batch_contract = {
    batch: 8,
    prior_canonical_adoptions: 54,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 54,
    expected_remaining_after_full_batch: 1,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_distinct_era_media: true,
    census: DEFAULTS.census,
    remaining_lane_counts: {
      distinct_media_debt: 1
    }
  };

  await atomicWrite(receiptResolved.absolute, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
  await atomicWrite(inspection.ledgerDoc.absolute, jsonLike(inspection.ledgerDoc.bytes, ledger));
  await validateCanonicalAdoptionLedger({ root: inspection.resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { receipt: receiptResolved.safe, ledger: DEFAULTS.ledger, canonical_adoptions: 54, remaining: 1 };
}

async function reconcilePublication({ root = process.cwd(), adoptionHead, adoptionTree, gatedTree, workflowRun, reconciliationParent, now }) {
  const resolvedRoot = path.resolve(root);
  for (const [label, value] of Object.entries({ adoptionHead, adoptionTree, gatedTree, reconciliationParent })) {
    assert(/^[0-9a-f]{40}$/.test(value || ""), `${label} is malformed`);
  }
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const [receiptDoc, ledgerDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.receipt, "COLLECT-011 receipt"),
    readDoc(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
  ]);
  const receipt = receiptDoc.value;
  const ledger = ledgerDoc.value;
  assert(receipt.transaction === "COLLECT-011" && receipt.batch === 7 && receipt.status === "paid", "COLLECT-011 receipt identity drifted");
  assert(receipt.authorization?.workflow_run === Number(workflowRun), "COLLECT-011 workflow run drifted");
  assert(receipt.authorization?.gated_tree === gatedTree, "COLLECT-011 gated tree drifted");
  const batch = exactRow(ledger.batches, (row) => row.transaction === "COLLECT-011" && row.batch === 7, "COLLECT-011 ledger batch");
  assert(batch.status === "paid" && batch.receipt === DEFAULTS.receipt && batch.adoption_count === 4, "COLLECT-011 ledger batch drifted");
  assert(batch.published_head === null || batch.published_head === adoptionHead, "COLLECT-011 published head conflicts");
  batch.published_head = adoptionHead;
  batch.receipt_git_blob = receiptDoc.git_blob;
  ledger.recorded_at = now;
  const publication = {
    version: 1,
    transaction: "COLLECT-011",
    batch: 7,
    operation: "batched-portrait-publication-reconciliation",
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
      canonical_adoptions: 54,
      remaining_for_canonical_review: 1,
      visitor_visible_media_improvements: 54,
      complete_pairs: 730,
      missing_stills: 340,
      missing_portraits: 350,
      missing_both: 107,
    },
    residual_estate: {
      distinct_media_debt: ["UC-338/still"]
    },
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      adoption_receipt_rewritten: false,
      only_publication_custody_reconciled: true,
    },
  };
  const publicationResolved = resolveInside(resolvedRoot, DEFAULTS.publication, "COLLECT-011 publication");
  await atomicWrite(ledgerDoc.absolute, jsonLike(ledgerDoc.bytes, ledger));
  await atomicWrite(publicationResolved.absolute, Buffer.from(`${JSON.stringify(publication, null, 2)}\n`, "utf8"));
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 54, remaining: 1 };
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
    const result = await applyTransaction({
      inspection,
      now: option("--now", new Date().toISOString()),
      reportPath: option("--report"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (has("--validate")) {
    const result = await validateAdopted({ inspection, beforeQualityPath: option("--before-quality") });
    console.log(JSON.stringify({ transaction: "COLLECT-011", status: "validated", adoptions: 4, quality: result.deltas }, null, 2));
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
    transaction: "COLLECT-011",
    authorized: inspection.contexts.length,
    pending: inspection.contexts.filter((context) => context.state === "pending").length,
    already_adopted: inspection.contexts.filter((context) => context.state === "already-adopted").length,
    portraits: inspection.contexts.length,
    prior_canonical_adoptions: inspection.ledger.cumulative.canonical_adoptions,
    expected_cumulative_after: 54,
    expected_remaining_after: 1,
    expected_quality: { complete_pairs: 2, missing_still: 0, missing_portrait: -4, missing_both: -2 },
    obligations: inspection.contexts.map((context) => context.key),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-011 adoption failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
