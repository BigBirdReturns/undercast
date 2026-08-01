#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  plan: "data/review/estate-debt/COLLECT-005-CANONICAL-ADOPTION-PLAN.json",
  census: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
  importReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  correctionReceipt: "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-005-CANONICAL-ADOPTION.json",
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
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
function acceptedIdentity(value) {
  return /^(?:expected-subject(?:$|-)|expected-subjects$)/.test(String(value || ""));
}
function acceptedPresentation(value) {
  const typed = String(value || "");
  return /(?:^|-)character-depiction$/.test(typed)
    || /^(?:two|three)-role-character-composite$/.test(typed);
}
function cropPassed(review) {
  if (String(review?.crop_ruling || "").startsWith("pass")) return true;
  return Array.isArray(review?.notes) && review.notes.some((note) => /(?:wall|card)[ -]?crop/i.test(String(note)));
}
function assertImage(bytes, mime, label) {
  if (mime === "image/jpeg") {
    assert(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label} is not a complete JPEG`);
    return;
  }
  if (mime === "image/webp") {
    assert(bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP", `${label} is not a WebP container`);
    return;
  }
  fail(`${label} has unsupported mime ${mime}`);
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
function assertMetric(actual, expected, label) { assert(Number(actual) === Number(expected), `${label}: expected ${expected}, found ${actual}`); }

function validatePlan(plan) {
  assert(plan?.version === 1, "COLLECT-005 plan version must be 1");
  assert(plan.transaction === "COLLECT-005" && plan.batch === 3, "plan is not COLLECT-005 batch 3");
  assert(plan.operation === "census-selected-canonical-media-adoption" && plan.status === "authorized", "COLLECT-005 plan is not authorized");
  assert(plan.boundary?.selection_rule === "all-and-only-census-safe-direct-adoptions", "COLLECT-005 selection rule drifted");
  assert(plan.boundary?.arbitrary_batch_size_permitted === false, "COLLECT-005 may not restore an arbitrary batch size");
  assert(plan.boundary?.canonical_mutation === true, "COLLECT-005 must authorize canonical mutation");
  assert(plan.boundary?.discovery_permitted === false, "COLLECT-005 may not perform discovery");
  assert(plan.boundary?.new_source_policy_permitted === false, "COLLECT-005 may not create source policy");
  assert(plan.boundary?.new_supervisor_permitted === false, "COLLECT-005 may not create a supervisor");
  assert(plan.quality_contract?.baseline_reset_permitted === false, "COLLECT-005 may not reset the quality baseline");
  assert(Array.isArray(plan.adoptions) && plan.adoptions.length === 2, "COLLECT-005 requires exactly the two census-safe adoptions");
  assert(plan.boundary.adoption_count === plan.adoptions.length && plan.custody.census_safe_direct_denominator === plan.adoptions.length, "COLLECT-005 safe denominator drifted");
  const keys = new Set();
  const destinations = new Set();
  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    assert(/^UC-\d+\/still$/.test(key), `invalid adoption ${key}`);
    assert(!keys.has(key), `duplicate adoption ${key}`);
    keys.add(key);
    assert(row.census_lane === "correction-null-adoption", `${key} is not in the correction-null census lane`);
    for (const field of ["packet_root", "manifest_path", "checksum_path", "candidate_path", "destination_path"]) safeRelative(row[field], `${key}.${field}`);
    assert(row.manifest_path.startsWith(`${row.packet_root}/`) && row.checksum_path.startsWith(`${row.packet_root}/`) && row.candidate_path.startsWith(`${row.packet_root}/`), `${key} packet path escapes its root`);
    assert(/^[0-9a-f]{64}$/.test(row.manifest_sha256 || "") && /^[0-9a-f]{64}$/.test(row.candidate_sha256 || ""), `${key} packet hashes are malformed`);
    assert(new Set(["image/jpeg", "image/webp"]).has(row.candidate_mime), `${key} candidate mime is unsupported`);
    const extension = row.candidate_mime === "image/jpeg" ? "jpg" : "webp";
    assert(new RegExp(`^images/${row.record_id.toLowerCase()}-still-[0-9a-f]{12}\\.${extension}$`).test(row.destination_path), `${key} destination is not versioned for its mime`);
    assert(row.destination_path.includes(row.candidate_sha256.slice(0, 12)), `${key} destination lacks candidate hash prefix`);
    assert(!destinations.has(row.destination_path), `duplicate destination ${row.destination_path}`);
    destinations.add(row.destination_path);
    assert(row.actor && row.character && row.production, `${key} lacks filed identity`);
    validateImage(row.image, `${key}.image`);
    assert(row.correction?.ledger && row.correction?.invalid_path && /^[0-9a-f]{64}$/.test(row.correction.invalid_sha256 || ""), `${key} lacks correction custody`);
    assert(row.correction.invalid_path !== row.destination_path, `${key} would overwrite historical invalid bytes`);
    assert(row.quality_effect?.complete_pairs === 1 && row.quality_effect?.missing_still === -1 && row.quality_effect?.missing_both === 0, `${key} quality effect drifted`);
  }
  assert(sameJson([...keys].sort(), ["UC-054/still", "UC-125/still"]), "COLLECT-005 obligation set drifted from the census recommendation");
  return plan;
}

async function inspectTransaction({ root = process.cwd(), planPath = DEFAULTS.plan } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [planDoc, censusDoc, importDoc, correctionDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readJson(resolvedRoot, planPath, "COLLECT-005 plan"),
    readJson(resolvedRoot, DEFAULTS.census, "COLLECT-005 census"),
    readJson(resolvedRoot, DEFAULTS.importReceipt, "COLLECT-002 packet import"),
    readJson(resolvedRoot, DEFAULTS.correctionReceipt, "COLLECT-001 correction receipt"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readJson(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readJson(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const plan = validatePlan(planDoc.value);
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(censusDoc.git_blob === plan.custody.adoption_census_git_blob, "adoption census Git blob drifted");
  assert(correctionDoc.git_blob === plan.custody.correction_receipt_git_blob, "correction receipt Git blob drifted");
  assert(ledgerDoc.git_blob === plan.custody.prior_ledger_git_blob, "prior adoption ledger Git blob drifted");
  assert(census.transaction === "COLLECT-005" && census.operation === "retained-packet-adoption-census", "census identity drifted");
  assert(census.counts?.imported_packets === 55 && census.counts?.already_paid === 10 && census.counts?.open_packets === 45, "census denominator drifted");
  assert(census.counts?.safe_direct_adoptions === 2 && census.counts?.correction_null_adoptions === 2, "census safe-direct count drifted");
  assert(sameJson([...census.recommended_next_batch].sort(), plan.adoptions.map((row) => keyFor(row.record_id, row.side)).sort()), "plan differs from census recommendation");
  assert(importDoc.value?.transaction === "COLLECT-002" && importDoc.value?.counts?.packets === plan.custody.imported_packet_denominator, "COLLECT-002 denominator drifted");
  assert(importDoc.value?.source?.head_sha === plan.custody.source_head, "packet source head drifted");
  assert(ledger.cumulative?.canonical_adoptions === plan.custody.prior_canonical_adoptions && ledger.cumulative?.remaining_for_canonical_review === plan.custody.prior_remaining_for_review, "prior cumulative ledger count drifted");
  assert(ledger.next_batch_contract?.batch === 3 && ledger.next_batch_contract?.prior_canonical_adoptions === 10, "ledger did not authorize batch 3 from ten paid adoptions");
  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const contexts = [];

  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    assert(!adopted.has(key), `${key} was already paid`);
    const censusRow = exactRow(census.packets || [], (item) => item.obligation_id === key, `${key} census row`);
    assert(censusRow.safe_direct_adoption === true && censusRow.lane === row.census_lane, `${key} is not census-safe`);
    assert(censusRow.custody?.packet_ready === true && censusRow.custody?.candidate_hash_pass === true && censusRow.custody?.manifest_checksum_bound === true && censusRow.custody?.candidate_checksum_bound === true && censusRow.custody?.independent_review_ready === true && censusRow.custody?.duplicate_screen_pass === true, `${key} census custody is incomplete`);
    assert(censusRow.current?.canonical_rows_agree === true && censusRow.current?.binding === null && censusRow.current?.other_side_present === true && censusRow.current?.destination_exists === false, `${key} census canonical state is not safe-direct`);
    for (const field of ["record_id", "side", "actor", "character", "production", "packet_root", "manifest_path", "manifest_sha256", "checksum_path", "candidate_path", "candidate_sha256", "candidate_mime", "suggested_destination_path"]) {
      const planned = field === "suggested_destination_path" ? row.destination_path : row[field];
      assert(censusRow[field] === planned, `${key} census ${field} drifted`);
    }
    assert(censusRow.correction?.ledger === row.correction.ledger && censusRow.correction?.invalid_path === row.correction.invalid_path && censusRow.correction?.invalid_sha256 === row.correction.invalid_sha256 && censusRow.correction?.historical_bytes_retained === true, `${key} census correction custody drifted`);

    const imported = exactRow(importDoc.value.packets || [], (item) => item.obligation_id === key, `${key} imported packet`);
    assert(imported.root === row.packet_root && imported.manifest_path === row.manifest_path && imported.manifest_sha256 === row.manifest_sha256 && `${imported.root}/${imported.checksum_ledger}` === row.checksum_path, `${key} imported packet custody drifted`);
    const manifestDoc = await readJson(resolvedRoot, row.manifest_path, `${key} manifest`);
    assert(manifestDoc.sha256 === row.manifest_sha256, `${key} manifest bytes drifted`);
    const manifest = manifestDoc.value;
    assert(manifest.record_id === row.record_id && manifest.side === row.side && manifest.actor === row.actor && manifest.character === row.character && manifest.production === row.production, `${key} filed identity differs from the packet`);
    assert(manifest.canonical_mutation === false && manifest.reviewed_by && manifest.reviewed_role, `${key} packet lacks evidence-only independent review custody`);
    assert(new Set(["reviewed-evidence-candidate", "reviewed-evidence-ready-for-canonical-consideration"]).has(manifest.disposition), `${key} packet disposition is not adoption-ready`);
    assert(acceptedIdentity(manifest.exact_subject_review?.identity) && acceptedPresentation(manifest.exact_subject_review?.presentation) && cropPassed(manifest.exact_subject_review), `${key} exact-subject or crop review is not adoption-ready`);
    assert(manifest.candidate?.path === path.posix.basename(row.candidate_path) && manifest.candidate?.sha256 === row.candidate_sha256 && manifest.candidate?.mime === row.candidate_mime, `${key} candidate receipt drifted`);
    const checksumBytes = await readFile(resolveInside(resolvedRoot, row.checksum_path, `${key} checksum ledger`).absolute);
    const checksums = parseChecksums(checksumBytes.toString("utf8"), row.checksum_path);
    assert(checksums.get(path.posix.basename(row.manifest_path)) === row.manifest_sha256, `${key} checksum ledger does not bind the manifest`);
    assert(checksums.get(path.posix.basename(row.candidate_path)) === row.candidate_sha256, `${key} checksum ledger does not bind the candidate`);
    const candidateResolved = resolveInside(resolvedRoot, row.candidate_path, `${key} candidate`);
    const candidateBytes = await readFile(candidateResolved.absolute);
    assert(sha256(candidateBytes) === row.candidate_sha256, `${key} candidate bytes drifted`);
    assertImage(candidateBytes, row.candidate_mime, `${key} candidate`);
    const duplicateDoc = await readJson(resolvedRoot, `${row.packet_root}/duplicate-scan.json`, `${key} duplicate scan`);
    assert(String(duplicateDoc.value?.status || "").toLowerCase() === "pass", `${key} duplicate scan did not pass`);

    const correction = exactRow(correctionDoc.value.obligations || [], (item) => item.id === row.record_id && item.side === row.side, `${key} correction obligation`);
    assert(correction.ledger === row.correction.ledger && correction.preserved_path === row.correction.invalid_path && correction.sha256 === row.correction.invalid_sha256 && correction.preserved_asset?.sha256 === row.correction.invalid_sha256, `${key} correction receipt drifted`);
    const invalidBytes = await readFile(resolveInside(resolvedRoot, row.correction.invalid_path, `${key} historical invalid asset`).absolute);
    assert(sha256(invalidBytes) === row.correction.invalid_sha256, `${key} historical invalid bytes drifted`);

    const specimen = exactRow(specimensDoc.value, (item) => item.id === row.record_id, `${key} specimen`);
    const source = exactRow(sourcesDoc.value, (item) => item.id === row.record_id, `${key} source`);
    assert(specimen.actor === row.actor && source.actor === row.actor && specimen.character === row.character && source.character === row.character, `${key} canonical identity drifted`);
    assert(specimen.portrait?.src && source.portrait?.src && sameJson(specimen.portrait, source.portrait), `${key} other side is not a complete pair anchor`);
    const intended = intendedImage(row);
    const destination = resolveInside(resolvedRoot, row.destination_path, `${key} destination`);
    const destinationExists = await exists(destination.absolute);
    const currentSpecimen = specimen[row.side] ?? null;
    const currentSource = source[row.side] ?? null;
    let state;
    if (currentSpecimen === null && currentSource === null) {
      assert(!destinationExists, `${key} destination already exists before adoption`);
      state = "pending";
    } else {
      assert(sameJson(currentSpecimen, intended) && sameJson(currentSource, intended), `${key} current binding is neither null nor the exact planned adoption`);
      assert(destinationExists, `${key} adopted destination is missing`);
      assert(sha256(await readFile(destination.absolute)) === row.candidate_sha256, `${key} adopted destination bytes drifted`);
      state = "already-adopted";
    }
    contexts.push({ key, row, censusRow, manifest, candidateBytes, destination, intended, state });
  }

  return { root: resolvedRoot, planDoc, plan, censusDoc, importDoc, correctionDoc, ledgerDoc, ledger, specimensDoc, sourcesDoc, contexts };
}

async function atomicWrite(entries) {
  const originals = [];
  const staged = [];
  try {
    for (const entry of entries) {
      await mkdir(path.dirname(entry.absolute), { recursive: true });
      const present = await exists(entry.absolute);
      originals.push({ absolute: entry.absolute, present, bytes: present ? await readFile(entry.absolute) : null });
      const temporary = `${entry.absolute}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
      await writeFile(temporary, entry.bytes);
      staged.push({ temporary, absolute: entry.absolute });
    }
    for (const entry of staged) await rename(entry.temporary, entry.absolute);
  } catch (error) {
    for (const entry of staged) await rm(entry.temporary, { force: true }).catch(() => {});
    for (const original of originals.reverse()) {
      if (original.present) await writeFile(original.absolute, original.bytes);
      else await rm(original.absolute, { force: true });
    }
    throw error;
  }
}

async function applyTransaction({ inspection, now, reportPath = null }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  assert(pending.length === inspection.contexts.length && pending.length === 2, `COLLECT-005 expected two pending adoptions, found ${pending.length}`);
  const specimens = structuredClone(inspection.specimensDoc.value);
  const sources = structuredClone(inspection.sourcesDoc.value);
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  const date = String(now).slice(0, 10);
  const entries = [];
  for (const context of pending) {
    specimenById.get(context.row.record_id)[context.row.side] = context.intended;
    const source = sourceById.get(context.row.record_id);
    source[context.row.side] = context.intended;
    source.fetched_at = date;
    entries.push({ absolute: context.destination.absolute, bytes: context.candidateBytes });
  }
  entries.push({ absolute: inspection.specimensDoc.absolute, bytes: jsonBytes(specimens) });
  entries.push({ absolute: inspection.sourcesDoc.absolute, bytes: jsonBytes(sources) });
  await atomicWrite(entries);
  const report = {
    version: 1,
    transaction: inspection.plan.transaction,
    batch: inspection.plan.batch,
    operation: "census-selected-canonical-media-adoption-apply",
    generated_at: now,
    counts: { authorized: 2, adopted: 2, already_adopted: 0 },
    adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, state: "adopted", destination_path: context.row.destination_path, candidate_sha256: context.row.candidate_sha256 })),
    boundary: { arbitrary_batch_size_used: false, census_safe_denominator: 2, discovery_performed: false, historical_invalid_bytes_retained: true, quality_baseline_reset: false, complete_gate_required_before_receipt: true, canonical_mutation: true },
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
  const [beforeDoc, afterDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readJson(inspection.root, DEFAULTS.quality, "current quality"),
  ]);
  const before = inspection.plan.quality_contract.before;
  const expected = inspection.plan.quality_contract.expected_after;
  assertMetric(beforeDoc.value.total, before.total, "pre-adoption total");
  for (const [key, value] of Object.entries(before)) if (key !== "total") assertMetric(beforeDoc.value.metrics?.[key], value, `pre-adoption ${key}`);
  assertMetric(afterDoc.value.total, expected.total, "post-adoption total");
  for (const [key, value] of Object.entries(expected)) if (key !== "total") assertMetric(afterDoc.value.metrics?.[key], value, `post-adoption ${key}`);
  assertMetric(afterDoc.value.metrics.complete_pairs - beforeDoc.value.metrics.complete_pairs, inspection.plan.quality_contract.exact_complete_pair_delta, "complete-pair delta");
  assertMetric(afterDoc.value.metrics.missing_still - beforeDoc.value.metrics.missing_still, inspection.plan.quality_contract.exact_missing_still_delta, "missing-still delta");
  assertMetric(afterDoc.value.metrics.missing_portrait - beforeDoc.value.metrics.missing_portrait, inspection.plan.quality_contract.exact_missing_portrait_delta, "missing-portrait delta");
  assertMetric(afterDoc.value.metrics.missing_both - beforeDoc.value.metrics.missing_both, inspection.plan.quality_contract.exact_missing_both_delta, "missing-both delta");
  assert(sameJson(afterDoc.value.baseline, beforeDoc.value.baseline), "quality baseline changed during COLLECT-005");
  assert(round6(afterDoc.value.metrics.complete_pair_ratio) === round6(expected.complete_pair_ratio), "complete-pair ratio rounding drifted");
  return {
    before: beforeDoc.value,
    after: afterDoc.value,
    before_sha256: beforeDoc.sha256,
    after_sha256: afterDoc.sha256,
    deltas: { complete_pairs: 2, missing_still: -2, missing_portrait: 0, missing_both: 0 },
  };
}

async function validateAdopted({ inspection, beforeQualityPath }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  assert(pending.length === 0, `COLLECT-005 still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    assert(sha256(await readFile(context.destination.absolute)) === context.row.candidate_sha256, `${context.key} canonical bytes drifted`);
    assert(sha256(await readFile(resolveInside(inspection.root, context.row.correction.invalid_path).absolute)) === context.row.correction.invalid_sha256, `${context.key} historical invalid bytes were not retained`);
  }
  return validateQuality({ inspection, beforeQualityPath });
}

async function promoteReceiptAndLedger({ inspection, beforeQualityPath, receiptPath, ledgerPath, now, authorizedParent, gatedTree, workflowRun }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "--authorized-parent must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "--gated-tree must be a full tree SHA");
  assert(/^\d+$/.test(String(workflowRun || "")), "--workflow-run must be numeric");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const receiptDestination = resolveInside(inspection.root, receiptPath || DEFAULTS.receipt, "COLLECT-005 receipt");
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
      plan: { path: inspection.planDoc.safe, sha256: inspection.planDoc.sha256, git_blob: inspection.planDoc.git_blob },
      census: { path: inspection.censusDoc.safe, sha256: inspection.censusDoc.sha256, git_blob: inspection.censusDoc.git_blob, safe_direct_denominator: 2 },
      packet_import_receipt: { path: inspection.importDoc.safe, sha256: inspection.importDoc.sha256, source_head: inspection.importDoc.value.source.head_sha },
      correction_receipt: { path: inspection.correctionDoc.safe, sha256: inspection.correctionDoc.sha256, git_blob: inspection.correctionDoc.git_blob },
      prior_cumulative_ledger: { path: inspection.ledgerDoc.safe, sha256: inspection.ledgerDoc.sha256, git_blob: inspection.ledgerDoc.git_blob, canonical_adoptions: 10 },
    },
    counts: { canonical_adoptions: 2, cumulative_canonical_adoptions: 12, imported_packets_remaining_for_adoption_review: 43, stills: 2, portraits: 0 },
    quality: { before_sha256: quality.before_sha256, after_sha256: quality.after_sha256, before: quality.before.metrics, after: quality.after.metrics, deltas: quality.deltas, baseline_unchanged: true },
    adoptions: inspection.contexts.map((context) => ({
      record_id: context.row.record_id,
      side: context.row.side,
      census_lane: context.row.census_lane,
      canonical_path: context.row.destination_path,
      canonical_sha256: context.row.candidate_sha256,
      candidate_mime: context.row.candidate_mime,
      image_origin: context.row.image.origin,
      packet_manifest: context.row.manifest_path,
      packet_manifest_sha256: context.row.manifest_sha256,
      correction_ledger: context.row.correction.ledger,
      historical_invalid_path: context.row.correction.invalid_path,
      historical_invalid_sha256: context.row.correction.invalid_sha256,
    })),
    boundary: {
      visitor_visible_media_improvements: 2,
      arbitrary_batch_size_used: false,
      census_safe_denominator_exhausted: true,
      discovery_performed: false,
      source_policy_created: false,
      supervisor_created: false,
      historical_invalid_bytes_retained: true,
      quality_baseline_reset: false,
      canonical_mutation: true,
      manual_continue_required: false,
      next_authorized_work: "issue terminal rulings for the 27 null-without-prior-state and 16 packet-review-incompatible objects before another adoption batch",
    },
  };

  const ledger = structuredClone(inspection.ledgerDoc.value);
  ledger.recorded_at = now;
  ledger.cumulative = { canonical_adoptions: 12, remaining_for_canonical_review: 43, stills: 12, portraits: 0, visitor_visible_media_improvements: 12 };
  ledger.batches.push({
    transaction: "COLLECT-005",
    batch: 3,
    status: "paid",
    receipt: receiptDestination.safe,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: 2,
    obligations,
    quality_delta: { complete_pairs: 2, missing_still: -2, missing_portrait: 0, missing_both: 0 },
  });
  for (const context of inspection.contexts) {
    ledger.adopted_obligations.push({ obligation_id: context.key, transaction: "COLLECT-005", batch: 3, canonical_path: context.row.destination_path, canonical_sha256: context.row.candidate_sha256 });
  }
  ledger.next_batch_contract = {
    batch: 4,
    prior_canonical_adoptions: 12,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 12,
    expected_remaining_after_full_batch: 43,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_new_terminal_rulings: true,
    census: inspection.censusDoc.safe,
    remaining_lane_counts: { null_binding_without_prior_state: 27, packet_review_incompatible: 16 },
  };
  await atomicWrite([
    { absolute: receiptDestination.absolute, bytes: jsonBytes(receipt) },
    { absolute: ledgerDestination.absolute, bytes: jsonBytes(ledger) },
  ]);
  const validation = await validateCanonicalAdoptionLedger({ root: inspection.root, ledgerPath: ledgerDestination.safe });
  assert(validation.canonical_adoptions === 12 && validation.remaining_for_canonical_review === 43, "cumulative ledger did not reach the COLLECT-005 result");
  return { receipt, ledger, validation, receipt_path: receiptDestination.safe, ledger_path: ledgerDestination.safe };
}

function runFixtures() {
  assert(acceptedIdentity("expected-subject"), "expected-subject must pass");
  assert(acceptedIdentity("expected-subjects"), "expected-subjects must pass");
  assert(!acceptedIdentity("probable-subject"), "probable-subject must fail");
  assert(acceptedPresentation("character-depiction"), "character depiction must pass");
  assert(acceptedPresentation("three-role-character-composite"), "three-role composite must pass");
  assert(!acceptedPresentation("performer-portrait"), "performer portrait must fail the still lane");
  assertImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg", "fixture JPEG");
  assertImage(Buffer.from("RIFF0000WEBP", "ascii"), "image/webp", "fixture WebP");
  console.log("COLLECT-005 fixtures: PASS — evidence-sized selection, typed review, JPEG/WebP custody, and arbitrary-batch refusal");
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
    console.log(JSON.stringify({ transaction: "COLLECT-005", batch: 3, status: "validated", adoptions: 2, cumulative_after: 12, remaining_after: 43, quality: quality.deltas }, null, 2));
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
    console.log(JSON.stringify({ transaction: "COLLECT-005", batch: 3, status: "paid-receipt-and-ledger-written", receipt: result.receipt_path, ledger: result.ledger_path, cumulative_adoptions: result.validation.canonical_adoptions, remaining: result.validation.remaining_for_canonical_review }, null, 2));
    return;
  }
  console.log(JSON.stringify({ transaction: "COLLECT-005", batch: 3, authorized: 2, pending, already_adopted: 2 - pending, arbitrary_batch_size: false, census_safe_denominator: 2, expected_cumulative_after: 12, expected_remaining_after: 43, adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, state: context.state, destination_path: context.row.destination_path })) }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-005 census tranche adoption failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
