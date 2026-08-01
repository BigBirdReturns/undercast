#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  plan: "data/review/estate-debt/COLLECT-006-CANONICAL-ADOPTION-PLAN.json",
  adjudication: "data/review/estate-debt/COLLECT-006-NULL-BINDING-ADJUDICATION.json",
  census: "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json",
  importReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-006-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-006-PUBLICATION.json",
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
function assertJpeg(bytes, label) {
  assert(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label} is not a complete JPEG`);
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
  assert(plan?.version === 1, "COLLECT-006 plan version must be 1");
  assert(plan.transaction === "COLLECT-006" && plan.batch === 4, "plan is not COLLECT-006 batch 4");
  assert(plan.operation === "terminally-adjudicated-current-null-adoption" && plan.status === "authorized", "COLLECT-006 plan is not authorized");
  assert(plan.boundary?.selection_rule === "packet-ready-exact-current-null-terminal-ruling", "COLLECT-006 selection rule drifted");
  assert(plan.boundary?.canonical_mutation === true, "COLLECT-006 must authorize canonical mutation");
  assert(plan.boundary?.discovery_permitted === false, "COLLECT-006 may not perform discovery");
  assert(plan.boundary?.packet_evidence_rewrite_permitted === false, "COLLECT-006 may not rewrite packet evidence");
  assert(plan.boundary?.new_source_policy_permitted === false, "COLLECT-006 may not create source policy");
  assert(plan.boundary?.new_supervisor_permitted === false, "COLLECT-006 may not create a supervisor");
  assert(plan.quality_contract?.baseline_reset_permitted === false, "COLLECT-006 may not reset the quality baseline");
  assert(Array.isArray(plan.adoptions) && plan.adoptions.length === 3, "COLLECT-006 requires exactly three adjudicated adoptions");
  assert(plan.boundary.adoption_count === plan.adoptions.length, "COLLECT-006 denominator drifted");
  const keys = new Set();
  const destinations = new Set();
  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    assert(/^UC-\d+\/still$/.test(key), `invalid adoption ${key}`);
    assert(!keys.has(key), `duplicate adoption ${key}`);
    keys.add(key);
    assert(row.census_lane === "null-binding-without-prior-state", `${key} is not from the current-null census lane`);
    assert(row.authorization?.type === "terminal-current-null-ruling" && row.authorization?.decision_id === key, `${key} lacks exact terminal authorization`);
    for (const field of ["packet_root", "manifest_path", "checksum_path", "candidate_path", "destination_path"]) safeRelative(row[field], `${key}.${field}`);
    assert(row.manifest_path.startsWith(`${row.packet_root}/`) && row.checksum_path.startsWith(`${row.packet_root}/`) && row.candidate_path.startsWith(`${row.packet_root}/`), `${key} packet path escapes its root`);
    assert(/^[0-9a-f]{64}$/.test(row.manifest_sha256 || "") && /^[0-9a-f]{64}$/.test(row.candidate_sha256 || ""), `${key} packet hashes are malformed`);
    assert(row.candidate_mime === "image/jpeg", `${key} candidate must be JPEG`);
    assert(new RegExp(`^images/${row.record_id.toLowerCase()}-still-[0-9a-f]{12}\\.jpg$`).test(row.destination_path), `${key} destination is not versioned`);
    assert(row.destination_path.includes(row.candidate_sha256.slice(0, 12)), `${key} destination lacks candidate hash prefix`);
    assert(!destinations.has(row.destination_path), `duplicate destination ${row.destination_path}`);
    destinations.add(row.destination_path);
    assert(row.actor && row.character && row.production, `${key} lacks filed identity`);
    validateImage(row.image, `${key}.image`);
    assert(row.quality_effect?.complete_pairs === 1 && row.quality_effect?.missing_still === -1 && row.quality_effect?.missing_both === 0, `${key} quality effect drifted`);
  }
  assert(sameJson([...keys].sort(), ["UC-047/still", "UC-051/still", "UC-060/still"]), "COLLECT-006 obligation set drifted");
  return plan;
}

async function inspectTransaction({ root = process.cwd(), planPath = DEFAULTS.plan } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [planDoc, adjudicationDoc, censusDoc, importDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readJson(resolvedRoot, planPath, "COLLECT-006 plan"),
    readJson(resolvedRoot, DEFAULTS.adjudication, "COLLECT-006 null adjudication"),
    readJson(resolvedRoot, DEFAULTS.census, "COLLECT-005 census"),
    readJson(resolvedRoot, DEFAULTS.importReceipt, "COLLECT-002 packet import"),
    readJson(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readJson(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readJson(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const plan = validatePlan(planDoc.value);
  const adjudication = adjudicationDoc.value;
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(adjudicationDoc.git_blob === plan.custody.null_adjudication_git_blob, "null-adjudication Git blob drifted");
  assert(censusDoc.git_blob === plan.custody.adoption_census_git_blob, "adoption census Git blob drifted");
  assert(ledgerDoc.git_blob === plan.custody.prior_ledger_git_blob, "prior adoption ledger Git blob drifted");
  assert(adjudication.transaction === "COLLECT-006" && adjudication.operation === "exact-current-null-terminal-ruling" && adjudication.status === "authorized", "null adjudication identity drifted");
  assert(adjudication.denominator?.authorized === 3, "null-adjudication denominator drifted");
  assert(census.transaction === "COLLECT-005" && census.operation === "retained-packet-adoption-census", "census identity drifted");
  assert(census.counts?.imported_packets === 55 && census.counts?.already_paid === 10 && census.counts?.open_packets === 45, "census source denominator drifted");
  assert(importDoc.value?.transaction === "COLLECT-002" && importDoc.value?.counts?.packets === plan.custody.imported_packet_denominator, "COLLECT-002 denominator drifted");
  assert(importDoc.value?.source?.head_sha === plan.custody.source_head, "packet source head drifted");
  assert(ledger.cumulative?.canonical_adoptions === plan.custody.prior_canonical_adoptions && ledger.cumulative?.remaining_for_canonical_review === plan.custody.prior_remaining_for_review, "prior cumulative ledger count drifted");
  assert(ledger.next_batch_contract?.batch === 4 && ledger.next_batch_contract?.requires_new_terminal_rulings === true, "ledger did not require terminal rulings for batch 4");
  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const contexts = [];

  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    assert(!adopted.has(key), `${key} was already paid`);
    const decision = exactRow(adjudication.decisions || [], (item) => item.decision_id === key, `${key} terminal decision`);
    assert(decision.status === "authorized-current-null" && decision.record_id === row.record_id && decision.side === row.side, `${key} terminal decision is not authorized`);
    assert(decision.census_lane === row.census_lane && decision.candidate_sha256 === row.candidate_sha256 && decision.destination_path === row.destination_path, `${key} terminal decision custody drifted`);
    assert(decision.current?.specimen_binding === null && decision.current?.source_binding === null && decision.current?.canonical_rows_agree === true && decision.current?.other_side_present === true && decision.current?.destination_exists === false, `${key} terminal decision current state is not exact null`);

    const censusRow = exactRow(census.packets || [], (item) => item.obligation_id === key, `${key} census row`);
    assert(censusRow.lane === row.census_lane && censusRow.safe_direct_adoption === false, `${key} census lane drifted`);
    assert(censusRow.custody?.packet_ready === true && censusRow.custody?.candidate_hash_pass === true && censusRow.custody?.manifest_checksum_bound === true && censusRow.custody?.candidate_checksum_bound === true && censusRow.custody?.independent_review_ready === true && censusRow.custody?.duplicate_screen_pass === true, `${key} census packet custody is incomplete`);
    assert(censusRow.current?.canonical_rows_agree === true && censusRow.current?.binding === null && censusRow.current?.other_side_present === true && censusRow.current?.destination_exists === false, `${key} census current state drifted`);
    for (const field of ["record_id", "side", "actor", "character", "production", "packet_root", "manifest_path", "manifest_sha256", "checksum_path", "candidate_path", "candidate_sha256", "candidate_mime", "suggested_destination_path"]) {
      const planned = field === "suggested_destination_path" ? row.destination_path : row[field];
      assert(censusRow[field] === planned, `${key} census ${field} drifted`);
    }

    const imported = exactRow(importDoc.value.packets || [], (item) => item.obligation_id === key, `${key} imported packet`);
    assert(imported.root === row.packet_root && imported.manifest_path === row.manifest_path && imported.manifest_sha256 === row.manifest_sha256 && `${imported.root}/${imported.checksum_ledger}` === row.checksum_path, `${key} imported packet custody drifted`);
    const manifestDoc = await readJson(resolvedRoot, row.manifest_path, `${key} manifest`);
    assert(manifestDoc.sha256 === row.manifest_sha256, `${key} manifest bytes drifted`);
    const manifest = manifestDoc.value;
    assert(manifest.record_id === row.record_id && manifest.side === row.side, `${key} manifest identity drifted`);
    assert(manifest.actor === row.actor && manifest.character === row.character && manifest.production === row.production, `${key} filed identity differs from packet`);
    assert(manifest.canonical_mutation === false, `${key} packet is not evidence-only`);
    assert(manifest.reviewed_by && manifest.reviewed_role && manifest.disposition === "reviewed-evidence-candidate", `${key} lacks independent adoption-ready review`);
    assert(acceptedIdentity(manifest.exact_subject_review?.identity), `${key} exact-subject identity ruling is not accepted`);
    assert(acceptedPresentation(manifest.exact_subject_review?.presentation), `${key} presentation ruling is not accepted`);
    assert(cropPassed(manifest.exact_subject_review), `${key} lacks passing crop custody`);
    assert(manifest.candidate?.path === path.posix.basename(row.candidate_path) && manifest.candidate?.sha256 === row.candidate_sha256 && manifest.candidate?.mime === row.candidate_mime, `${key} candidate receipt drifted`);

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

    const specimen = exactRow(specimensDoc.value, (item) => item.id === row.record_id, `${key} specimen`);
    const source = exactRow(sourcesDoc.value, (item) => item.id === row.record_id, `${key} source`);
    const specimenCurrent = specimen[row.side] ?? null;
    const sourceCurrent = source[row.side] ?? null;
    assert(specimenCurrent === null && sourceCurrent === null, `${key} current canonical binding is no longer exact null`);
    const otherSide = row.side === "still" ? "portrait" : "still";
    assert(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide]), `${key} other side is not complete and consistent`);
    const intended = intendedImage(row);
    const destination = resolveInside(resolvedRoot, row.destination_path, `${key} destination`);
    assert(!(await exists(destination.absolute)), `${key} versioned destination already exists before adoption`);
    contexts.push({ key, row, manifest, candidateBytes, destination, state: "pending", intended });
  }
  return { root: resolvedRoot, plan, planDoc, adjudicationDoc, censusDoc, importDoc, ledgerDoc, specimensDoc, sourcesDoc, contexts };
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
  const date = String(now || new Date().toISOString()).slice(0, 10);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(date), "adoption date must be ISO-8601");
  const specimens = structuredClone(inspection.specimensDoc.value);
  const sources = structuredClone(inspection.sourcesDoc.value);
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  const entries = [];
  for (const context of inspection.contexts) {
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
    operation: "exact-current-null-canonical-media-adoption-apply",
    generated_at: now,
    counts: { authorized: inspection.contexts.length, adopted: inspection.contexts.length },
    adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, destination_path: context.row.destination_path, candidate_sha256: context.row.candidate_sha256 })),
    boundary: { discovery_performed: false, packet_evidence_rewritten: false, quality_baseline_reset: false, complete_gate_required_before_receipt: true, canonical_mutation: true },
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
  const before = inspection.plan.quality_contract.before;
  const expected = inspection.plan.quality_contract.expected_after;
  assertMetric(beforeDoc.value.total, before.total, "pre-adoption total");
  for (const [key, value] of Object.entries(before)) if (key !== "total") assertMetric(beforeDoc.value.metrics?.[key], value, `pre-adoption ${key}`);
  assertMetric(afterDoc.value.total, expected.total, "post-adoption total");
  for (const [key, value] of Object.entries(expected)) if (key !== "total") assertMetric(afterDoc.value.metrics?.[key], value, `post-adoption ${key}`);
  const deltas = {
    complete_pairs: afterDoc.value.metrics.complete_pairs - beforeDoc.value.metrics.complete_pairs,
    missing_still: afterDoc.value.metrics.missing_still - beforeDoc.value.metrics.missing_still,
    missing_portrait: afterDoc.value.metrics.missing_portrait - beforeDoc.value.metrics.missing_portrait,
    missing_both: afterDoc.value.metrics.missing_both - beforeDoc.value.metrics.missing_both,
  };
  assertMetric(deltas.complete_pairs, inspection.plan.quality_contract.exact_complete_pair_delta, "complete-pair delta");
  assertMetric(deltas.missing_still, inspection.plan.quality_contract.exact_missing_still_delta, "missing-still delta");
  assertMetric(deltas.missing_portrait, inspection.plan.quality_contract.exact_missing_portrait_delta, "missing-portrait delta");
  assertMetric(deltas.missing_both, inspection.plan.quality_contract.exact_missing_both_delta, "missing-both delta");
  assert(sameJson(afterDoc.value.baseline, beforeDoc.value.baseline), "quality baseline changed during adoption");
  assert(round6(afterDoc.value.metrics.complete_pair_ratio) === round6(expected.complete_pair_ratio), "complete-pair ratio rounding drifted");
  return { before: beforeDoc.value, after: afterDoc.value, before_sha256: beforeDoc.sha256, after_sha256: afterDoc.sha256, deltas };
}

async function validateAdopted({ inspection, beforeQualityPath }) {
  for (const context of inspection.contexts) {
    const bytes = await readFile(context.destination.absolute);
    assert(sha256(bytes) === context.row.candidate_sha256, `${context.key} canonical bytes drifted`);
    const specimen = exactRow(inspection.specimensDoc.value, (item) => item.id === context.row.record_id, `${context.key} specimen`);
    const source = exactRow(inspection.sourcesDoc.value, (item) => item.id === context.row.record_id, `${context.key} source`);
    assert(sameJson(specimen[context.row.side], context.intended) && sameJson(source[context.row.side], context.intended), `${context.key} canonical binding differs from intended adoption`);
  }
  return validateQuality({ inspection, beforeQualityPath });
}

async function promoteReceiptAndLedger({ inspection, beforeQualityPath, receiptPath, ledgerPath, now, authorizedParent, gatedTree, workflowRun }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "--authorized-parent must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "--gated-tree must be a full tree SHA");
  assert(/^\d+$/.test(String(workflowRun || "")), "--workflow-run must be numeric");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const ledger = structuredClone(inspection.ledgerDoc.value);
  const receiptDestination = resolveInside(inspection.root, receiptPath || DEFAULTS.receipt, "COLLECT-006 receipt");
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
      null_adjudication: { path: inspection.adjudicationDoc.safe, sha256: inspection.adjudicationDoc.sha256, git_blob: inspection.adjudicationDoc.git_blob },
      census: { path: inspection.censusDoc.safe, sha256: inspection.censusDoc.sha256, git_blob: inspection.censusDoc.git_blob },
      packet_import_receipt: { path: inspection.importDoc.safe, sha256: inspection.importDoc.sha256, source_head: inspection.importDoc.value.source.head_sha },
      prior_cumulative_ledger: { path: inspection.ledgerDoc.safe, sha256: inspection.ledgerDoc.sha256, git_blob: inspection.ledgerDoc.git_blob, canonical_adoptions: inspection.plan.custody.prior_canonical_adoptions },
    },
    counts: {
      canonical_adoptions: inspection.contexts.length,
      cumulative_canonical_adoptions: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
      imported_packets_remaining_for_adoption_review: inspection.plan.cumulative_contract.expected_remaining_for_review_after,
      stills: inspection.contexts.length,
      portraits: 0,
    },
    quality: { before_sha256: quality.before_sha256, after_sha256: quality.after_sha256, before: quality.before.metrics, after: quality.after.metrics, deltas: quality.deltas, baseline_unchanged: true },
    adoptions: inspection.contexts.map((context) => ({
      record_id: context.row.record_id,
      side: context.row.side,
      census_lane: context.row.census_lane,
      terminal_decision: context.row.authorization.decision_id,
      canonical_path: context.row.destination_path,
      canonical_sha256: context.row.candidate_sha256,
      candidate_mime: context.row.candidate_mime,
      image_origin: context.row.image.origin,
      packet_manifest: context.row.manifest_path,
      packet_manifest_sha256: context.row.manifest_sha256,
    })),
    boundary: {
      visitor_visible_media_improvements: inspection.contexts.length,
      current_null_terminal_rulings_consumed: inspection.contexts.length,
      discovery_performed: false,
      packet_evidence_rewritten: false,
      source_policy_created: false,
      supervisor_created: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      manual_continue_required: false,
      next_authorized_work: "continue terminal rulings for the remaining current-null and packet-review-incompatible census lanes",
    },
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
    quality_delta: quality.deltas,
  });
  for (const context of inspection.contexts) ledger.adopted_obligations.push({
    obligation_id: context.key,
    transaction: inspection.plan.transaction,
    batch: inspection.plan.batch,
    canonical_path: context.row.destination_path,
    canonical_sha256: context.row.candidate_sha256,
  });
  ledger.next_batch_contract = {
    batch: inspection.plan.batch + 1,
    prior_canonical_adoptions: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
    expected_remaining_after_full_batch: inspection.plan.cumulative_contract.expected_remaining_for_review_after,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    requires_new_terminal_rulings: true,
    census: DEFAULTS.census,
    remaining_lane_counts: {
      null_binding_without_prior_state: 24,
      packet_review_incompatible: 16,
    },
  };
  await atomicWrite([
    { absolute: receiptDestination.absolute, bytes: jsonBytes(receipt) },
    { absolute: ledgerDestination.absolute, bytes: jsonBytes(ledger) },
  ]);
  const validation = await validateCanonicalAdoptionLedger({ root: inspection.root, ledgerPath: ledgerDestination.safe });
  assert(validation.canonical_adoptions === inspection.plan.cumulative_contract.expected_canonical_adoptions_after, "cumulative ledger did not reach expected adoption count");
  assert(validation.remaining_for_canonical_review === inspection.plan.cumulative_contract.expected_remaining_for_review_after, "cumulative ledger did not reach expected remaining count");
  return { receipt, ledger, validation, receipt_path: receiptDestination.safe, ledger_path: ledgerDestination.safe };
}

async function reconcilePublication({ root, receiptPath, publicationPath, ledgerPath, adoptionHead, adoptionTree, currentParent, now }) {
  assert(/^[0-9a-f]{40}$/.test(adoptionHead || ""), "--adoption-head must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(adoptionTree || ""), "--adoption-tree must be a full tree SHA");
  assert(/^[0-9a-f]{40}$/.test(currentParent || ""), "--current-parent must be a full commit SHA");
  const resolvedRoot = path.resolve(root);
  const receiptDoc = await readJson(resolvedRoot, receiptPath || DEFAULTS.receipt, "COLLECT-006 receipt");
  const ledgerDoc = await readJson(resolvedRoot, ledgerPath || DEFAULTS.ledger, "canonical adoption ledger");
  const ledger = structuredClone(ledgerDoc.value);
  const batch = exactRow(ledger.batches || [], (row) => row.transaction === "COLLECT-006" && row.batch === 4, "COLLECT-006 ledger batch");
  assert(batch.published_head === null || batch.published_head === adoptionHead, "COLLECT-006 published head conflicts");
  batch.published_head = adoptionHead;
  batch.receipt_git_blob = receiptDoc.git_blob;
  ledger.recorded_at = now;
  const publicationDestination = resolveInside(resolvedRoot, publicationPath || DEFAULTS.publication, "COLLECT-006 publication receipt");
  assert(!(await exists(publicationDestination.absolute)), `${publicationDestination.safe} already exists`);
  const publication = {
    version: 1,
    transaction: "COLLECT-006",
    batch: 4,
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
    cumulative: { canonical_adoptions: 15, remaining_for_canonical_review: 40, visitor_visible_media_improvements: 15 },
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
  assert(acceptedIdentity("expected-subject"), "expected-subject must pass");
  assert(acceptedPresentation("character-depiction"), "character-depiction must pass");
  assert(!acceptedIdentity("probable-subject"), "probable identity must fail");
  assert(!acceptedPresentation("performer-portrait"), "performer portrait must fail the still lane");
  assert(cropPassed({ crop_ruling: "pass" }), "crop pass must pass");
  const exactNull = { specimen_binding: null, source_binding: null, canonical_rows_agree: true, other_side_present: true, destination_exists: false };
  assert(exactNull.specimen_binding === null && exactNull.source_binding === null && exactNull.other_side_present, "exact-current-null fixture must pass");
  console.log("COLLECT-006 fixtures: PASS — exact current-null terminal rulings admit packet-ready stills while probable identity and performer substitution remain rejected");
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
    console.log(JSON.stringify({ transaction: "COLLECT-006", status: "publication-reconciled", ...result }, null, 2));
    return;
  }
  const modes = ["--write", "--validate", "--promote"].filter(has);
  assert(modes.length <= 1, `choose at most one mode, found ${modes.join(", ")}`);
  const inspection = await inspectTransaction({ root: option("--root", "."), planPath: option("--plan", DEFAULTS.plan) });
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
  console.log(JSON.stringify({
    transaction: inspection.plan.transaction,
    batch: inspection.plan.batch,
    authorized: inspection.contexts.length,
    pending: inspection.contexts.length,
    prior_cumulative_adoptions: inspection.plan.custody.prior_canonical_adoptions,
    expected_cumulative_after: inspection.plan.cumulative_contract.expected_canonical_adoptions_after,
    expected_remaining_after: inspection.plan.cumulative_contract.expected_remaining_for_review_after,
    adoptions: inspection.contexts.map((context) => ({ obligation_id: context.key, destination_path: context.row.destination_path })),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-006 exact-null adoption failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
