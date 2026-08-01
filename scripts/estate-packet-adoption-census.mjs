#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = Object.freeze({
  importReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  correctionReceipt: "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  mediaAudit: "data/MEDIA-AUDIT.json",
  out: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const keyFor = (id, side) => `${id}/${side}`;
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
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
async function readJson(root, relativePath, label = relativePath, required = true) {
  const resolved = resolveInside(root, relativePath, label);
  let bytes;
  try { bytes = await readFile(resolved.absolute); }
  catch (error) {
    if (!required && error.code === "ENOENT") return null;
    throw error;
  }
  try { return { ...resolved, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) }; }
  catch (error) { fail(`cannot parse ${resolved.safe}: ${error.message}`); }
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
function acceptedIdentity(value) {
  return /^(?:expected-subject(?:$|-)|expected-subjects$)/.test(String(value || ""));
}
function acceptedPresentation(value) {
  const typed = String(value || "");
  return /(?:^|-)character-depiction$/.test(typed)
    || /^(?:two|three)-role-character-composite$/.test(typed);
}
function modernCropPassed(review) {
  if (String(review?.crop_ruling || "").startsWith("pass")) return true;
  return Array.isArray(review?.notes) && review.notes.some((note) => /(?:wall|card)[ -]?crop/i.test(String(note)));
}
function legacyReviewPassed(review) {
  if (!review || review.disposition !== "candidate-reviewed" || !review.reviewed_by || !review.reviewed_role) return false;
  const rulings = Object.values(review.exact_subject_ruling || {});
  if (!rulings.length || rulings.some((value) => !/(?:verified candidate|none)/i.test(String(value)))) return false;
  if (!review.candidate?.visual_ruling || !review.candidate?.wall_crop_ruling) return false;
  return String(review.candidate?.duplicate_scan?.status || "").toLowerCase() === "pass";
}
function mimeExtension(mime, candidateName) {
  const normalized = String(mime || "").toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  const extension = path.posix.extname(String(candidateName || "")).slice(1).toLowerCase();
  return extension || "unknown";
}
function firstUrl(values) {
  for (const value of values) if (/^https?:\/\//.test(String(value || ""))) return String(value);
  return null;
}
function sourceOrigin(manifest, importHead) {
  return firstUrl([
    manifest.source?.source_page,
    manifest.source?.page,
    manifest.source?.page_resolved_url,
    manifest.source?.resolved_page,
    manifest.source?.asset_url,
    manifest.selected_source?.source_page,
    manifest.selected_source?.page_url,
    manifest.selected_source?.url,
    manifest.selected_source?.origin,
    manifest.source_receipt?.page_url,
    manifest.source_receipt?.url,
  ]) || `https://github.com/BigBirdReturns/undercast/blob/${importHead}/${manifest.__manifest_path}`;
}
function auditKey(item) {
  const id = item?.record_id || item?.id || item?.wall_id || item?.record?.id;
  const side = item?.side || item?.facet || item?.kind;
  return id && new Set(["still", "portrait"]).has(side) ? keyFor(id, side) : null;
}
function currentAssetHash(root, asset) {
  return asset?.src && !/^https?:\/\//.test(asset.src)
    ? resolveInside(root, asset.src, "canonical media asset").absolute
    : null;
}
function sortedCounts(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key] ?? "(none)", (counts.get(row[key] ?? "(none)") || 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ key: value, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

async function inspectPacket({ root, imported, importHead, correctionMap, adopted, specimenById, sourceById, auditMap }) {
  const key = imported.obligation_id;
  const manifestDoc = await readJson(root, imported.manifest_path, `${key} manifest`);
  assert(manifestDoc.sha256 === imported.manifest_sha256, `${key} manifest hash drifted from COLLECT-002`);
  const raw = manifestDoc.value;
  raw.__manifest_path = imported.manifest_path;
  const legacy = Boolean(raw.record?.id && raw.composition?.file);
  const batched = Boolean(!legacy && Array.isArray(raw.files) && raw.campaign_id);
  const batchedReviewDoc = batched
    ? await readJson(root, `${imported.root}/review.json`, `${key} batched review`, false)
    : null;
  const batchedReview = batchedReviewDoc?.value || null;
  const recordId = legacy ? raw.record.id : raw.record_id;
  const side = legacy ? raw.record.side : raw.side;
  assert(key === keyFor(recordId, side), `${key} manifest identity drifted`);
  const actor = legacy ? raw.record.actor : batched ? batchedReview?.identity?.actor : raw.actor;
  const character = legacy ? raw.record.character : batched ? batchedReview?.identity?.character : raw.character;
  const production = legacy ? raw.record.production : batched ? batchedReview?.identity?.production : raw.production;
  if (batched && batchedReview?.selected_source) raw.selected_source = batchedReview.selected_source;
  const renderedPermanent = Boolean(!legacy && !batched && !raw.candidate && raw.render?.candidate);
  const candidate = legacy
    ? { path: raw.composition.file, sha256: raw.composition.sha256, mime: raw.composition.mime, width: raw.composition.width, height: raw.composition.height }
    : batched
      ? batchedReview?.render_result?.candidate
      : renderedPermanent
        ? { ...raw.render.candidate, mime: raw.render.candidate.mime || null }
        : raw.candidate;
  assert(candidate?.path && /^[0-9a-f]{64}$/.test(candidate.sha256 || ""), `${key} candidate receipt is malformed`);
  const candidatePath = `${imported.root}/${candidate.path}`;
  const candidateResolved = resolveInside(root, candidatePath, `${key} candidate`);
  const candidateBytes = await readFile(candidateResolved.absolute);
  const candidateHashPass = sha256(candidateBytes) === candidate.sha256;

  const ledgerPath = `${imported.root}/${imported.checksum_ledger}`;
  const checksumBytes = await readFile(resolveInside(root, ledgerPath, `${key} checksum ledger`).absolute);
  const checksums = parseChecksums(checksumBytes.toString("utf8"), ledgerPath);
  const manifestBound = checksums.get(path.posix.basename(imported.manifest_path)) === imported.manifest_sha256;
  const candidateBound = checksums.get(path.posix.basename(candidatePath)) === candidate.sha256;

  const reviewDoc = legacy
    ? await readJson(root, `${imported.root}/review.json`, `${key} legacy review`, false)
    : renderedPermanent
      ? await readJson(root, `${imported.root}/review.json`, `${key} rendered packet review`, false)
      : batchedReviewDoc;
  const modernReview = raw.exact_subject_review || null;
  const renderedReview = renderedPermanent ? reviewDoc?.value || null : null;
  const renderedReviewReady = Boolean(renderedPermanent
    && renderedReview?.disposition === "reviewed-evidence-candidate"
    && renderedReview?.visual_second_desk?.status === "accepted-for-render"
    && renderedReview?.render_result?.candidate?.path === candidate.path
    && renderedReview?.render_result?.candidate?.sha256 === candidate.sha256
    && renderedReview?.render_result?.wall_crop?.path
    && renderedReview?.canonical_mutation === false
    && Array.isArray(renderedReview?.duplicate_scan?.items)
    && renderedReview.duplicate_scan.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0));
  const batchedReviewReady = Boolean(batched
    && batchedReview?.disposition === "reviewed-evidence-candidate"
    && batchedReview?.visual_adjudication?.status === "accepted"
    && batchedReview?.visual_adjudication?.independent_from_discovery === true
    && batchedReview?.visual_adjudication?.identity?.value === "expected"
    && acceptedPresentation(batchedReview?.visual_adjudication?.presentation?.value)
    && batchedReview?.render_result?.candidate?.path === candidate.path
    && batchedReview?.render_result?.candidate?.sha256 === candidate.sha256
    && batchedReview?.render_result?.wall_crop?.path
    && batchedReview?.canonical_mutation === false
    && Array.isArray(batchedReview?.duplicate_scan?.items)
    && batchedReview.duplicate_scan.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0));
  const reviewReady = legacy
    ? legacyReviewPassed(reviewDoc?.value)
    : batched
      ? batchedReviewReady
      : renderedPermanent
        ? renderedReviewReady
        : Boolean(raw.reviewed_by && raw.reviewed_role
          && new Set(["reviewed-evidence-candidate", "reviewed-evidence-ready-for-canonical-consideration"]).has(raw.disposition)
          && acceptedIdentity(modernReview?.identity)
          && acceptedPresentation(modernReview?.presentation)
          && modernCropPassed(modernReview));

  let duplicatePass = false;
  const duplicateDoc = await readJson(root, `${imported.root}/duplicate-scan.json`, `${key} duplicate scan`, false);
  if (duplicateDoc) {
    duplicatePass = String(duplicateDoc.value?.status || "").toLowerCase() === "pass"
      || (Array.isArray(duplicateDoc.value?.items) && duplicateDoc.value.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0));
  } else if (legacy) duplicatePass = String(reviewDoc?.value?.candidate?.duplicate_scan?.status || raw.duplicate_scan?.status || "").toLowerCase() === "pass";
  else if (batched) duplicatePass = batchedReviewReady;
  else if (renderedPermanent) duplicatePass = renderedReviewReady;
  else duplicatePass = String(raw.duplicate_scan?.status || "").toLowerCase() === "pass";

  const specimen = exactRow([...specimenById.values()], (row) => row.id === recordId, `${key} specimen`);
  const source = exactRow([...sourceById.values()], (row) => row.id === recordId, `${key} source`);
  assert(specimen.actor === actor && source.actor === actor, `${key} actor differs from canonical record`);
  assert(specimen.character === character && source.character === character, `${key} character differs from canonical record`);
  const currentSpecimen = specimen[side] ?? null;
  const currentSource = source[side] ?? null;
  const canonicalRowsAgree = sameJson(currentSpecimen, currentSource);
  const current = canonicalRowsAgree ? currentSpecimen : null;
  let currentHash = null;
  let currentHashState = current ? "unreadable" : "null";
  if (current?.src && !/^https?:\/\//.test(current.src)) {
    const absolute = currentAssetHash(root, current);
    if (absolute && await exists(absolute)) {
      currentHash = sha256(await readFile(absolute));
      currentHashState = currentHash === candidate.sha256 ? "candidate-bytes" : "other-bytes";
    } else currentHashState = "missing-local-bytes";
  } else if (current?.src) currentHashState = "remote-binding";

  const otherSide = side === "still" ? "portrait" : "still";
  const otherSpecimen = specimen[otherSide] ?? null;
  const otherSource = source[otherSide] ?? null;
  const otherSidePresent = Boolean(otherSpecimen?.src && otherSource?.src && sameJson(otherSpecimen, otherSource));
  const correction = correctionMap.get(key) || null;
  const audit = auditMap.get(key) || null;
  const extension = mimeExtension(candidate.mime, candidate.path);
  const destinationPath = `images/${recordId.toLowerCase()}-${side}-${candidate.sha256.slice(0, 12)}.${extension}`;
  const destination = resolveInside(root, destinationPath, `${key} destination`);
  const destinationExists = await exists(destination.absolute);
  let destinationHash = null;
  if (destinationExists) destinationHash = sha256(await readFile(destination.absolute));

  const packetReady = candidateHashPass && manifestBound && candidateBound && reviewReady && duplicatePass;
  let lane;
  if (adopted.has(key)) lane = "already-paid";
  else if (!canonicalRowsAgree) lane = "canonical-row-disagreement";
  else if (!packetReady) lane = "packet-review-incompatible";
  else if (currentHashState === "candidate-bytes") lane = "candidate-bytes-already-canonical-unpaid";
  else if (current !== null) lane = "active-binding-comparison-required";
  else if (destinationExists && destinationHash !== candidate.sha256) lane = "destination-collision";
  else if (correction) lane = "correction-null-adoption";
  else if (["absent", "missing", "verified-absence"].includes(String(audit?.status || audit?.state || audit?.disposition || "").toLowerCase())) lane = "clean-absence-adoption";
  else lane = "null-binding-without-prior-state";

  const safeDirect = new Set(["correction-null-adoption", "clean-absence-adoption"]).has(lane)
    && otherSidePresent
    && destinationHash !== candidate.sha256
    && new Set(["jpg", "png", "webp"]).has(extension);
  const qualityEffect = current === null
    ? (otherSidePresent
      ? { complete_pairs: 1, missing_side: -1, missing_both: 0 }
      : { complete_pairs: 0, missing_side: -1, missing_both: -1 })
    : { complete_pairs: 0, missing_side: 0, missing_both: 0 };

  return {
    obligation_id: key,
    record_id: recordId,
    side,
    actor,
    character,
    production: production || null,
    packet_generation: legacy ? "legacy-serial" : batched ? "batched-amortized" : renderedPermanent ? "rendered-permanent" : "normalized",
    packet_root: imported.root,
    manifest_path: imported.manifest_path,
    manifest_sha256: imported.manifest_sha256,
    checksum_path: ledgerPath,
    candidate_path: candidatePath,
    candidate_sha256: candidate.sha256,
    candidate_mime: candidate.mime,
    candidate_extension: extension,
    candidate_width: candidate.width || null,
    candidate_height: candidate.height || null,
    suggested_destination_path: destinationPath,
    suggested_origin: sourceOrigin(raw, importHead),
    suggested_focus: { x: "center", y: /north|upper/i.test(String(raw.crop_preview?.gravity || "")) ? "upper" : "center" },
    custody: {
      candidate_hash_pass: candidateHashPass,
      manifest_checksum_bound: manifestBound,
      candidate_checksum_bound: candidateBound,
      independent_review_ready: reviewReady,
      duplicate_screen_pass: duplicatePass,
      packet_ready: packetReady,
    },
    current: {
      canonical_rows_agree: canonicalRowsAgree,
      binding: current,
      hash_state: currentHashState,
      sha256: currentHash,
      other_side: otherSide,
      other_side_present: otherSidePresent,
      destination_exists: destinationExists,
      destination_sha256: destinationHash,
    },
    correction: correction ? {
      ledger: correction.ledger,
      invalid_path: correction.preserved_path,
      invalid_sha256: correction.sha256,
      historical_bytes_retained: correction.preserved_asset?.sha256 === correction.sha256,
    } : null,
    media_audit: audit ? {
      status: audit.status || audit.state || audit.disposition || null,
      reason: audit.reason || audit.ruling || null,
    } : null,
    lane,
    safe_direct_adoption: safeDirect,
    quality_effect: qualityEffect,
  };
}

export async function buildCensus({ root = process.cwd(), now = new Date().toISOString() } = {}) {
  const resolvedRoot = path.resolve(root);
  const [importDoc, correctionDoc, ledgerDoc, specimensDoc, sourcesDoc, auditDoc] = await Promise.all([
    readJson(resolvedRoot, DEFAULTS.importReceipt, "COLLECT-002 receipt"),
    readJson(resolvedRoot, DEFAULTS.correctionReceipt, "COLLECT-001 correction receipt"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readJson(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readJson(resolvedRoot, DEFAULTS.sources, "SOURCES"),
    readJson(resolvedRoot, DEFAULTS.mediaAudit, "media audit", false),
  ]);
  assert(importDoc.value?.transaction === "COLLECT-002" && importDoc.value?.counts?.packets === 55, "COLLECT-002 packet estate drifted");
  assert(correctionDoc.value?.transaction === "COLLECT-001", "correction receipt is not COLLECT-001");
  const adopted = new Set((ledgerDoc.value.adopted_obligations || []).map((row) => row.obligation_id));
  assert(adopted.size === ledgerDoc.value.cumulative?.canonical_adoptions, "adoption ledger unique count drifted");
  const correctionMap = new Map((correctionDoc.value.obligations || []).map((row) => [keyFor(row.id, row.side), row]));
  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const auditItems = Array.isArray(auditDoc?.value?.items) ? auditDoc.value.items : [];
  const auditMap = new Map(auditItems.map((item) => [auditKey(item), item]).filter(([key]) => key));
  const rows = [];
  for (const imported of importDoc.value.packets) {
    rows.push(await inspectPacket({
      root: resolvedRoot,
      imported,
      importHead: importDoc.value.source.head_sha,
      correctionMap,
      adopted,
      specimenById,
      sourceById,
      auditMap,
    }));
  }
  rows.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  const open = rows.filter((row) => row.lane !== "already-paid");
  const safe = open.filter((row) => row.safe_direct_adoption);
  const quality = safe.reduce((sum, row) => ({
    complete_pairs: sum.complete_pairs + row.quality_effect.complete_pairs,
    missing_side: sum.missing_side + row.quality_effect.missing_side,
    missing_both: sum.missing_both + row.quality_effect.missing_both,
  }), { complete_pairs: 0, missing_side: 0, missing_both: 0 });
  const tranches = new Map();
  for (const row of safe) {
    const tranche = `${row.side}::${row.candidate_extension}::${row.lane}`;
    const list = tranches.get(tranche) || [];
    list.push(row.obligation_id);
    tranches.set(tranche, list);
  }
  return {
    version: 1,
    transaction: "COLLECT-005",
    operation: "retained-packet-adoption-census",
    generated_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    source: {
      packet_import_receipt: DEFAULTS.importReceipt,
      packet_import_sha256: importDoc.sha256,
      packet_source_head: importDoc.value.source.head_sha,
      adoption_ledger: DEFAULTS.ledger,
      adoption_ledger_sha256: ledgerDoc.sha256,
      canonical_adoptions_before: adopted.size,
      remaining_before: importDoc.value.counts.packets - adopted.size,
    },
    counts: {
      imported_packets: rows.length,
      already_paid: rows.length - open.length,
      open_packets: open.length,
      safe_direct_adoptions: safe.length,
      correction_null_adoptions: open.filter((row) => row.lane === "correction-null-adoption").length,
      clean_absence_adoptions: open.filter((row) => row.lane === "clean-absence-adoption").length,
      null_without_prior_state: open.filter((row) => row.lane === "null-binding-without-prior-state").length,
      active_binding_comparisons: open.filter((row) => row.lane === "active-binding-comparison-required").length,
      candidate_bytes_already_canonical_unpaid: open.filter((row) => row.lane === "candidate-bytes-already-canonical-unpaid").length,
      packet_review_incompatible: open.filter((row) => row.lane === "packet-review-incompatible").length,
      canonical_row_disagreements: open.filter((row) => row.lane === "canonical-row-disagreement").length,
      destination_collisions: open.filter((row) => row.lane === "destination-collision").length,
    },
    safe_direct_quality_effect: quality,
    summary: {
      lane: sortedCounts(open, "lane"),
      side: sortedCounts(open, "side"),
      packet_generation: sortedCounts(open, "packet_generation"),
      candidate_extension: sortedCounts(open, "candidate_extension"),
    },
    safe_tranches: [...tranches.entries()]
      .map(([tranche, obligations]) => ({ tranche, count: obligations.length, obligations }))
      .sort((a, b) => b.count - a.count || a.tranche.localeCompare(b.tranche)),
    recommended_next_batch: safe
      .sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }))
      .map((row) => row.obligation_id),
    packets: rows,
    boundary: {
      canonical_mutation: false,
      discovery_performed: false,
      source_policy_created: false,
      supervisor_created: false,
      packet_evidence_rewritten: false,
      packet_count_inference: false,
    },
  };
}

async function main() {
  const root = path.resolve(option("--root", "."));
  const census = await buildCensus({ root, now: option("--now", new Date().toISOString()) });
  if (has("--write")) {
    const out = resolveInside(root, option("--out", DEFAULTS.out), "census output");
    await mkdir(path.dirname(out.absolute), { recursive: true });
    await writeFile(out.absolute, jsonBytes(census));
  }
  console.log(JSON.stringify({
    transaction: census.transaction,
    counts: census.counts,
    safe_tranches: census.safe_tranches,
    recommended_next_batch: census.recommended_next_batch,
    canonical_mutation: false,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`packet adoption census failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
