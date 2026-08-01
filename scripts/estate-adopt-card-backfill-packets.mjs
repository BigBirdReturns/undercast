#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = Object.freeze({
  plan: "data/review/estate-debt/COLLECT-003-CANONICAL-ADOPTION-PLAN.json",
  packetImportReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  correctionReceipt: "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-003-CANONICAL-ADOPTION.json",
});

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function has(name) { return args.includes(name); }
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const keyFor = (recordId, side) => `${recordId}/${side}`;
const round6 = (value) => Number(Number(value).toFixed(6));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  assert(text && !path.isAbsolute(text) && !text.split("/").includes(".."), `${label} must be a safe repository-relative path`);
  return text;
}
function resolveInside(root, relativePath, label = "path") {
  const safe = safeRelative(relativePath, label);
  const absolute = path.resolve(root, safe);
  const prefix = `${path.resolve(root)}${path.sep}`;
  assert(absolute === path.resolve(root) || absolute.startsWith(prefix), `${label} escapes repository root`);
  return { safe, absolute };
}
async function exists(absolutePath) {
  try { await access(absolutePath); return true; }
  catch { return false; }
}
async function readJson(root, relativePath, label = relativePath) {
  const { safe, absolute } = resolveInside(root, relativePath, label);
  const bytes = await readFile(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${safe}: ${error.message}`); }
  return { path: safe, absolute, bytes, sha256: sha256(bytes), value };
}
async function readJsonAny(value, label) {
  const absolute = path.resolve(value);
  const bytes = await readFile(absolute);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${label}: ${error.message}`); }
  return { path: absolute, absolute, bytes, sha256: sha256(bytes), value: parsed };
}
function parseChecksumLedger(text, label) {
  const entries = new Map();
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    assert(match, `${label}:${index + 1} is not a SHA-256 ledger row`);
    const hash = match[1].toLowerCase();
    const file = match[2].trim().replace(/^\.\//, "");
    assert(file && !entries.has(file), `${label} has duplicate or empty path ${file}`);
    entries.set(file, hash);
  }
  assert(entries.size > 0, `${label} is empty`);
  return entries;
}
function validateImageShape(image, label) {
  assert(image && typeof image === "object" && !Array.isArray(image), `${label} must be an object`);
  assert(image.kind === "still", `${label}.kind must be still`);
  assert(/^https?:\/\//.test(image.origin || ""), `${label}.origin must be HTTP(S)`);
  assert(image.pin === true, `${label}.pin must be true`);
  assert(image.focus && new Set(["left", "center", "right"]).has(image.focus.x), `${label}.focus.x is invalid`);
  assert(image.focus && new Set(["top", "upper", "center", "lower", "bottom"]).has(image.focus.y), `${label}.focus.y is invalid`);
}
function validatePlan(plan) {
  assert(plan?.version === 1, "COLLECT-003 plan version must be 1");
  assert(plan.transaction === "COLLECT-003", "plan transaction must be COLLECT-003");
  assert(plan.operation === "bounded-canonical-media-adoption", "unexpected COLLECT-003 operation");
  assert(plan.status === "authorized", "COLLECT-003 plan is not authorized");
  assert(plan.boundary?.canonical_mutation === true, "COLLECT-003 must explicitly authorize canonical mutation");
  assert(plan.boundary?.discovery_permitted === false, "COLLECT-003 may not open discovery");
  assert(plan.boundary?.new_source_policy_permitted === false, "COLLECT-003 may not create a source policy");
  assert(plan.boundary?.new_supervisor_permitted === false, "COLLECT-003 may not create a supervisor");
  assert(plan.quality_contract?.baseline_reset_permitted === false, "COLLECT-003 may not reset the quality baseline");
  assert(Array.isArray(plan.adoptions), "COLLECT-003 plan lacks adoptions[]");
  assert(plan.adoptions.length === plan.boundary.adoption_count, "COLLECT-003 adoption denominator drifted");
  assert(plan.adoptions.length === 5, `COLLECT-003 requires exactly five adoptions, found ${plan.adoptions.length}`);
  const keys = new Set();
  const destinations = new Set();
  for (const row of plan.adoptions) {
    assert(/^UC-\d+$/.test(row.record_id || ""), `invalid record id ${row.record_id}`);
    assert(row.side === "still", `${row.record_id} must adopt the still side`);
    const key = keyFor(row.record_id, row.side);
    assert(!keys.has(key), `duplicate adoption ${key}`);
    keys.add(key);
    for (const field of ["packet_root", "manifest_path", "checksum_path", "candidate_path", "destination_path"]) safeRelative(row[field], `${key}.${field}`);
    assert(row.manifest_path.startsWith(`${row.packet_root}/`), `${key} manifest escapes packet root`);
    assert(row.checksum_path.startsWith(`${row.packet_root}/`), `${key} checksum ledger escapes packet root`);
    assert(row.candidate_path.startsWith(`${row.packet_root}/`), `${key} candidate escapes packet root`);
    assert(/^data\/review\/card-backfill\/UC-\d+$/.test(row.packet_root), `${key} packet root is not permanent card-backfill evidence`);
    assert(/^images\/uc-\d+-still-[0-9a-f]{12}\.jpg$/.test(row.destination_path), `${key} destination is not content-versioned`);
    assert(row.destination_path.includes(row.candidate_sha256.slice(0, 12)), `${key} destination does not contain candidate hash prefix`);
    assert(!destinations.has(row.destination_path), `duplicate destination ${row.destination_path}`);
    destinations.add(row.destination_path);
    assert(/^[0-9a-f]{64}$/.test(row.manifest_sha256 || ""), `${key} manifest hash is invalid`);
    assert(/^[0-9a-f]{64}$/.test(row.candidate_sha256 || ""), `${key} candidate hash is invalid`);
    assert(row.candidate_mime === "image/jpeg", `${key} first adoption batch accepts JPEG only`);
    assert(row.actor && row.character, `${key} lacks filed identity`);
    validateImageShape(row.image, `${key}.image`);
    assert(row.correction?.ledger && row.correction?.invalid_path && row.correction?.invalid_sha256, `${key} lacks correction custody`);
    safeRelative(row.correction.ledger, `${key}.correction.ledger`);
    safeRelative(row.correction.invalid_path, `${key}.correction.invalid_path`);
    assert(/^[0-9a-f]{64}$/.test(row.correction.invalid_sha256), `${key} invalid historical hash is malformed`);
    assert(row.correction.invalid_path !== row.destination_path, `${key} would overwrite historical invalid bytes`);
  }
  return plan;
}
function findExactlyOne(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected exactly one row, found ${matches.length}`);
  return matches[0];
}
function imageFor(row) {
  return { src: row.destination_path, ...row.image };
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function acceptedDisposition(value) {
  return new Set(["reviewed-evidence-candidate", "reviewed-evidence-ready-for-canonical-consideration"]).has(value);
}
function acceptedPresentation(value) {
  return value === "character-depiction" || value === "collective-character-depiction";
}
function assertJpeg(bytes, label) {
  assert(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9, `${label} is not a complete JPEG byte stream`);
}

async function inspectTransaction({
  root,
  planPath = DEFAULTS.plan,
  specimensPath = DEFAULTS.specimens,
  sourcesPath = DEFAULTS.sources,
  packetImportReceiptPath = DEFAULTS.packetImportReceipt,
  correctionReceiptPath = DEFAULTS.correctionReceipt,
} = {}) {
  const resolvedRoot = path.resolve(root || process.cwd());
  const [planDoc, specimensDoc, sourcesDoc, importDoc, correctionDoc] = await Promise.all([
    readJson(resolvedRoot, planPath, "COLLECT-003 plan"),
    readJson(resolvedRoot, specimensPath, "specimens"),
    readJson(resolvedRoot, sourcesPath, "SOURCES"),
    readJson(resolvedRoot, packetImportReceiptPath, "COLLECT-002 receipt"),
    readJson(resolvedRoot, correctionReceiptPath, "COLLECT-001 correction receipt"),
  ]);
  const plan = validatePlan(planDoc.value);
  assert(Array.isArray(specimensDoc.value), "specimens must be an array");
  assert(Array.isArray(sourcesDoc.value), "SOURCES must be an array");
  assert(importDoc.value?.transaction === "COLLECT-002", "packet import receipt is not COLLECT-002");
  assert(importDoc.value?.counts?.packets === plan.custody.imported_packet_denominator, "COLLECT-002 packet denominator drifted");
  assert(importDoc.value?.source?.head_sha === plan.custody.source_head, "COLLECT-002 source head drifted");
  assert(importDoc.value?.boundaries?.canonical_mutation === false, "COLLECT-002 receipt does not preserve evidence-only custody");
  assert(Array.isArray(importDoc.value.packets), "COLLECT-002 receipt lacks packets[]");
  assert(correctionDoc.value?.transaction === "COLLECT-001", "correction receipt is not COLLECT-001");
  assert(Array.isArray(correctionDoc.value.obligations), "COLLECT-001 correction receipt lacks obligations[]");

  const contexts = [];
  for (const row of plan.adoptions) {
    const key = keyFor(row.record_id, row.side);
    const imported = findExactlyOne(importDoc.value.packets, (packet) => packet.obligation_id === key, `${key} imported packet`);
    assert(imported.root === row.packet_root, `${key} imported root drifted`);
    assert(imported.manifest_path === row.manifest_path, `${key} imported manifest path drifted`);
    assert(imported.manifest_sha256 === row.manifest_sha256, `${key} imported manifest hash drifted`);

    const corrected = findExactlyOne(correctionDoc.value.obligations, (item) => item.id === row.record_id && item.side === row.side, `${key} correction obligation`);
    assert(corrected.ledger === row.correction.ledger, `${key} correction ledger drifted`);
    assert(corrected.preserved_path === row.correction.invalid_path, `${key} historical invalid path drifted`);
    assert(corrected.sha256 === row.correction.invalid_sha256, `${key} historical invalid hash drifted`);
    assert(corrected.preserved_asset?.sha256 === row.correction.invalid_sha256, `${key} correction receipt lost preserved asset hash`);

    const manifestDoc = await readJson(resolvedRoot, row.manifest_path, `${key} manifest`);
    assert(manifestDoc.sha256 === row.manifest_sha256, `${key} manifest bytes drifted`);
    const manifest = manifestDoc.value;
    assert(manifest.record_id === row.record_id, `${key} manifest record drifted`);
    assert(manifest.side === row.side, `${key} manifest side drifted`);
    assert(manifest.actor === row.actor, `${key} manifest actor drifted`);
    assert(manifest.character === row.character, `${key} manifest character drifted`);
    if (row.production && manifest.production) assert(manifest.production === row.production, `${key} manifest production drifted`);
    assert(manifest.canonical_mutation === false, `${key} packet was not evidence-only`);
    assert(acceptedDisposition(manifest.disposition), `${key} packet disposition ${manifest.disposition} is not adoption-ready`);
    assert(manifest.reviewed_by && manifest.reviewed_role, `${key} lacks independent review custody`);
    assert(manifest.exact_subject_review?.identity === "expected-subject", `${key} lacks exact-subject identity ruling`);
    assert(acceptedPresentation(manifest.exact_subject_review?.presentation), `${key} presentation ruling is not a character depiction`);
    assert(manifest.crop_preview?.path && manifest.crop_preview?.sha256, `${key} lacks retained card-crop proof`);
    const cropPass = String(manifest.exact_subject_review?.crop_ruling || "").startsWith("pass")
      || (Array.isArray(manifest.exact_subject_review?.notes) && manifest.exact_subject_review.notes.some((note) => /(?:wall|card)[ -]?crop/i.test(note)));
    assert(cropPass, `${key} lacks a passing card-crop ruling`);
    assert(manifest.candidate?.path === path.posix.basename(row.candidate_path), `${key} candidate path drifted`);
    assert(manifest.candidate?.sha256 === row.candidate_sha256, `${key} candidate hash drifted in manifest`);
    assert(manifest.candidate?.mime === row.candidate_mime, `${key} candidate MIME drifted`);

    const checksumAbsolute = resolveInside(resolvedRoot, row.checksum_path, `${key} checksum ledger`).absolute;
    const checksumBytes = await readFile(checksumAbsolute);
    const checksums = parseChecksumLedger(checksumBytes.toString("utf8"), row.checksum_path);
    assert(checksums.get(path.posix.basename(row.manifest_path)) === row.manifest_sha256, `${key} checksum ledger does not bind manifest`);
    assert(checksums.get(path.posix.basename(row.candidate_path)) === row.candidate_sha256, `${key} checksum ledger does not bind candidate`);

    const candidateAbsolute = resolveInside(resolvedRoot, row.candidate_path, `${key} candidate`).absolute;
    const candidateBytes = await readFile(candidateAbsolute);
    assert(sha256(candidateBytes) === row.candidate_sha256, `${key} candidate bytes drifted`);
    assertJpeg(candidateBytes, `${key} candidate`);

    const duplicatePath = `${row.packet_root}/duplicate-scan.json`;
    const duplicateDoc = await readJson(resolvedRoot, duplicatePath, `${key} duplicate scan`);
    assert(String(duplicateDoc.value?.status || "").toLowerCase() === "pass", `${key} duplicate scan did not pass`);

    const invalidAbsolute = resolveInside(resolvedRoot, row.correction.invalid_path, `${key} historical invalid asset`).absolute;
    const invalidBytes = await readFile(invalidAbsolute);
    assert(sha256(invalidBytes) === row.correction.invalid_sha256, `${key} historical invalid bytes drifted or were removed`);

    const specimen = findExactlyOne(specimensDoc.value, (item) => item.id === row.record_id, `${key} specimen`);
    const source = findExactlyOne(sourcesDoc.value, (item) => item.id === row.record_id, `${key} source row`);
    assert(specimen.actor === row.actor && source.actor === row.actor, `${key} actor differs from filed record`);
    assert(specimen.character === row.character && source.character === row.character, `${key} character differs from filed record`);
    if (row.production) assert(specimen.production === row.production, `${key} specimen production differs from plan`);
    assert(source.universe === specimen.universe, `${key} universe differs between specimen and source ledger`);
    assert(sameJson(specimen[row.side], source[row.side]), `${key} current binding differs between specimen and source ledger`);
    const otherSide = row.side === "still" ? "portrait" : "still";
    assert(specimen[otherSide]?.src && source[otherSide]?.src, `${key} does not retain the other image side required for the quality delta`);
    assert(sameJson(specimen[otherSide], source[otherSide]), `${key} other side differs between specimen and source ledger`);

    const intendedImage = imageFor(row);
    const current = specimen[row.side] ?? null;
    const alreadyAdopted = sameJson(current, intendedImage);
    assert(current === null || alreadyAdopted, `${key} current binding is neither null nor the exact adopted binding`);

    const destination = resolveInside(resolvedRoot, row.destination_path, `${key} destination`);
    const destinationExists = await exists(destination.absolute);
    if (destinationExists) {
      const destinationBytes = await readFile(destination.absolute);
      assert(sha256(destinationBytes) === row.candidate_sha256, `${key} destination exists with different bytes`);
      assertJpeg(destinationBytes, `${key} destination`);
    }
    assert(!alreadyAdopted || destinationExists, `${key} binding claims an adopted destination that does not exist`);

    contexts.push({
      row,
      key,
      imported,
      corrected,
      manifest,
      manifestSha256: manifestDoc.sha256,
      candidateBytes,
      invalidBytes,
      specimen,
      source,
      intendedImage,
      destination,
      destinationExists,
      state: alreadyAdopted ? "already-adopted" : "pending",
    });
  }

  return {
    root: resolvedRoot,
    planDoc,
    plan,
    specimensDoc,
    sourcesDoc,
    importDoc,
    correctionDoc,
    contexts,
  };
}

async function atomicWrite(entries) {
  const token = `${process.pid}-${Date.now()}`;
  const prepared = [];
  for (const entry of entries) {
    await mkdir(path.dirname(entry.absolute), { recursive: true });
    const temporary = `${entry.absolute}.tmp.${token}`;
    await writeFile(temporary, entry.bytes);
    prepared.push({
      ...entry,
      temporary,
      backup: `${entry.absolute}.bak.${token}`,
      existed: await exists(entry.absolute),
    });
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
    const specimen = specimenById.get(context.row.record_id);
    const source = sourceById.get(context.row.record_id);
    specimen[context.row.side] = context.intendedImage;
    source[context.row.side] = context.intendedImage;
    source.fetched_at = date;
    if (!context.destinationExists) entries.push({ absolute: context.destination.absolute, bytes: context.candidateBytes });
  }
  if (pending.length) {
    const specimensBytes = jsonBytes(specimens);
    const sourcesBytes = jsonBytes(sources);
    entries.push({ absolute: inspection.specimensDoc.absolute, bytes: specimensBytes });
    entries.push({ absolute: inspection.sourcesDoc.absolute, bytes: sourcesBytes });
    await atomicWrite(entries);
  }

  const report = {
    version: 1,
    transaction: "COLLECT-003",
    operation: "bounded-canonical-media-adoption-apply",
    generated_at: now,
    mode: "write",
    plan: { path: inspection.planDoc.path, sha256: inspection.planDoc.sha256 },
    source: {
      specimens: {
        path: inspection.specimensDoc.path,
        before_sha256: inspection.specimensDoc.sha256,
        after_sha256: pending.length ? sha256(jsonBytes(specimens)) : inspection.specimensDoc.sha256,
      },
      sources: {
        path: inspection.sourcesDoc.path,
        before_sha256: inspection.sourcesDoc.sha256,
        after_sha256: pending.length ? sha256(jsonBytes(sources)) : inspection.sourcesDoc.sha256,
      },
    },
    counts: {
      authorized: inspection.contexts.length,
      adopted: pending.length,
      already_adopted: inspection.contexts.length - pending.length,
    },
    adoptions: inspection.contexts.map((context) => ({
      record_id: context.row.record_id,
      side: context.row.side,
      packet_manifest: context.row.manifest_path,
      manifest_sha256: context.row.manifest_sha256,
      candidate_path: context.row.candidate_path,
      candidate_sha256: context.row.candidate_sha256,
      destination_path: context.row.destination_path,
      historical_invalid_path: context.row.correction.invalid_path,
      historical_invalid_sha256: context.row.correction.invalid_sha256,
      state: context.state === "pending" ? "adopted" : "already-adopted",
    })),
    boundary: {
      discovery_performed: false,
      new_source_policy_created: false,
      new_supervisor_created: false,
      historical_invalid_bytes_retained: true,
      quality_baseline_reset: false,
      complete_gate_required_before_receipt: true,
      canonical_mutation: pending.length > 0,
    },
  };
  if (reportPath) {
    const absolute = path.resolve(reportPath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, jsonBytes(report));
  }
  return report;
}

function assertMetric(actual, expected, label) {
  assert(Number(actual) === Number(expected), `${label}: expected ${expected}, found ${actual}`);
}
async function validateQuality({ root, plan, beforeQualityPath, qualityPath = DEFAULTS.quality }) {
  assert(beforeQualityPath, "--before-quality is required for quality validation");
  const [beforeDoc, afterDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readJson(root, qualityPath, "current quality"),
  ]);
  const before = plan.quality_contract.before;
  const expected = plan.quality_contract.expected_after;
  assertMetric(beforeDoc.value.total, before.total, "pre-adoption total");
  for (const [key, value] of Object.entries(before)) {
    if (key === "total") continue;
    assertMetric(beforeDoc.value.metrics?.[key], value, `pre-adoption ${key}`);
  }
  assertMetric(afterDoc.value.total, expected.total, "post-adoption total");
  for (const [key, value] of Object.entries(expected)) {
    if (key === "total") continue;
    assertMetric(afterDoc.value.metrics?.[key], value, `post-adoption ${key}`);
  }
  assertMetric(afterDoc.value.metrics.complete_pairs - beforeDoc.value.metrics.complete_pairs, plan.quality_contract.exact_complete_pair_delta, "complete-pair delta");
  assertMetric(afterDoc.value.metrics.missing_still - beforeDoc.value.metrics.missing_still, plan.quality_contract.exact_missing_still_delta, "missing-still delta");
  assertMetric(afterDoc.value.metrics.missing_both - beforeDoc.value.metrics.missing_both, plan.quality_contract.exact_missing_both_delta, "missing-both delta");
  assert(sameJson(afterDoc.value.baseline, beforeDoc.value.baseline), "quality baseline changed during adoption");
  assert(round6(afterDoc.value.metrics.complete_pair_ratio) === round6(expected.complete_pair_ratio), "complete-pair ratio rounding drifted");
  return {
    before: beforeDoc.value,
    after: afterDoc.value,
    before_sha256: beforeDoc.sha256,
    after_sha256: afterDoc.sha256,
    deltas: {
      complete_pairs: afterDoc.value.metrics.complete_pairs - beforeDoc.value.metrics.complete_pairs,
      missing_still: afterDoc.value.metrics.missing_still - beforeDoc.value.metrics.missing_still,
      missing_both: afterDoc.value.metrics.missing_both - beforeDoc.value.metrics.missing_both,
    },
  };
}

async function validateAdopted({ inspection, beforeQualityPath, qualityPath }) {
  const pending = inspection.contexts.filter((context) => context.state === "pending");
  assert(pending.length === 0, `COLLECT-003 still has ${pending.length} pending adoption(s)`);
  for (const context of inspection.contexts) {
    const destinationBytes = await readFile(context.destination.absolute);
    assert(sha256(destinationBytes) === context.row.candidate_sha256, `${context.key} adopted bytes drifted`);
    const invalidBytes = await readFile(resolveInside(inspection.root, context.row.correction.invalid_path).absolute);
    assert(sha256(invalidBytes) === context.row.correction.invalid_sha256, `${context.key} historical invalid bytes were not retained`);
  }
  const quality = await validateQuality({
    root: inspection.root,
    plan: inspection.plan,
    beforeQualityPath,
    qualityPath,
  });
  return { quality };
}

function adoptionReceipt({ inspection, quality, now, authorizedParent, gatedTree, workflowRun }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "--authorized-parent must be a full commit SHA");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "--gated-tree must be a full tree SHA");
  assert(/^\d+$/.test(String(workflowRun || "")), "--workflow-run must be numeric");
  return {
    version: 1,
    transaction: "COLLECT-003",
    operation: "bounded-canonical-media-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: inspection.plan.product_alignment,
    authorization: {
      authorized_parent: authorizedParent,
      gated_tree: gatedTree,
      workflow_run: Number(workflowRun),
      exact_head_publication_lease_required: true,
    },
    custody: {
      plan: { path: inspection.planDoc.path, sha256: inspection.planDoc.sha256 },
      packet_import_receipt: {
        path: inspection.importDoc.path,
        sha256: inspection.importDoc.sha256,
        source_head: inspection.importDoc.value.source.head_sha,
        source_snapshot_sha256: inspection.importDoc.value.source.snapshot_sha256,
      },
      correction_receipt: { path: inspection.correctionDoc.path, sha256: inspection.correctionDoc.sha256 },
    },
    counts: {
      canonical_adoptions: inspection.contexts.length,
      stills: inspection.contexts.length,
      portraits: 0,
      imported_packets_remaining_for_adoption_review: inspection.plan.custody.imported_packet_denominator - inspection.contexts.length,
    },
    quality: {
      before_sha256: quality.before_sha256,
      after_sha256: quality.after_sha256,
      before: quality.before.metrics,
      after: quality.after.metrics,
      deltas: quality.deltas,
      baseline_unchanged: true,
    },
    adoptions: inspection.contexts.map((context) => ({
      record_id: context.row.record_id,
      side: context.row.side,
      trust_state: inspection.plan.boundary.trust_state,
      canonical_path: context.row.destination_path,
      canonical_sha256: context.row.candidate_sha256,
      image_origin: context.row.image.origin,
      packet_manifest: context.row.manifest_path,
      packet_manifest_sha256: context.row.manifest_sha256,
      correction_ledger: context.row.correction.ledger,
      historical_invalid_path: context.row.correction.invalid_path,
      historical_invalid_sha256: context.row.correction.invalid_sha256,
    })),
    boundary: {
      visitor_visible_media_improvements: inspection.contexts.length,
      discovery_performed: false,
      source_policy_created: false,
      supervisor_created: false,
      historical_invalid_bytes_retained: true,
      quality_baseline_reset: false,
      canonical_mutation: true,
      manual_continue_required: false,
      next_authorized_work: "continue bounded adoption from the retained 55-packet estate, then retire paid packet-production debt",
    },
  };
}

async function writeReceipt({ inspection, beforeQualityPath, receiptPath, now, authorizedParent, gatedTree, workflowRun }) {
  const { quality } = await validateAdopted({ inspection, beforeQualityPath });
  const receipt = adoptionReceipt({ inspection, quality, now, authorizedParent, gatedTree, workflowRun });
  const destination = resolveInside(inspection.root, receiptPath || DEFAULTS.receipt, "COLLECT-003 receipt");
  if (await exists(destination.absolute)) {
    const existingBytes = await readFile(destination.absolute);
    const existing = JSON.parse(existingBytes.toString("utf8"));
    assert(existing.transaction === "COLLECT-003" && existing.status === "paid", "existing COLLECT-003 receipt is not paid");
    assert(existing.custody?.plan?.sha256 === inspection.planDoc.sha256, "existing COLLECT-003 receipt plan hash drifted");
    assert(existing.counts?.canonical_adoptions === inspection.contexts.length, "existing COLLECT-003 receipt adoption count drifted");
    assert(existing.quality?.before_sha256 === quality.before_sha256, "existing COLLECT-003 receipt before-quality hash drifted");
    assert(existing.quality?.after_sha256 === quality.after_sha256, "existing COLLECT-003 receipt after-quality hash drifted");
    return { receipt: existing, path: destination.safe, sha256: sha256(existingBytes) };
  }
  await mkdir(path.dirname(destination.absolute), { recursive: true });
  await writeFile(destination.absolute, jsonBytes(receipt));
  return { receipt, path: destination.safe, sha256: sha256(jsonBytes(receipt)) };
}

async function validateReceipt({ inspection, beforeQualityPath, receiptPath }) {
  const { quality } = await validateAdopted({ inspection, beforeQualityPath });
  const receiptDoc = await readJson(inspection.root, receiptPath || DEFAULTS.receipt, "COLLECT-003 receipt");
  const receipt = receiptDoc.value;
  assert(receipt.transaction === "COLLECT-003" && receipt.status === "paid", "COLLECT-003 receipt is not paid");
  assert(receipt.custody?.plan?.sha256 === inspection.planDoc.sha256, "COLLECT-003 receipt plan hash drifted");
  assert(receipt.counts?.canonical_adoptions === inspection.contexts.length, "COLLECT-003 receipt adoption count drifted");
  assert(receipt.quality?.before_sha256 === quality.before_sha256, "COLLECT-003 receipt before-quality hash drifted");
  assert(receipt.quality?.after_sha256 === quality.after_sha256, "COLLECT-003 receipt after-quality hash drifted");
  for (const context of inspection.contexts) {
    const row = findExactlyOne(receipt.adoptions || [], (item) => item.record_id === context.row.record_id && item.side === context.row.side, `${context.key} receipt adoption`);
    assert(row.canonical_path === context.row.destination_path, `${context.key} receipt path drifted`);
    assert(row.canonical_sha256 === context.row.candidate_sha256, `${context.key} receipt hash drifted`);
  }
  return { receipt, path: receiptDoc.path, sha256: receiptDoc.sha256, quality };
}

async function makeFixture(root) {
  const write = async (relative, bytes) => {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
  };
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
  const invalid = Buffer.from("invalid historical image");
  const candidateHash = sha256(jpeg);
  const invalidHash = sha256(invalid);
  const adoptions = [];
  const specimens = [];
  const sources = [];
  const packets = [];
  const obligations = [];
  for (let index = 1; index <= 5; index++) {
    const id = `UC-${String(index).padStart(3, "0")}`;
    const rootPath = `data/review/card-backfill/${id}`;
    const manifest = {
      version: 1,
      record_id: id,
      actor: `Actor ${index}`,
      character: `Character ${index}`,
      production: `Production ${index}`,
      side: "still",
      reviewed_by: "fixture-second-desk",
      reviewed_role: "second-desk",
      disposition: "reviewed-evidence-candidate",
      canonical_mutation: false,
      candidate: { path: `${id.toLowerCase()}-still-candidate.jpg`, mime: "image/jpeg", sha256: candidateHash },
      crop_preview: { path: "card-crop-preview.jpg", sha256: "a".repeat(64) },
      exact_subject_review: { identity: "expected-subject", presentation: "character-depiction", crop_ruling: "pass" },
    };
    const manifestBytes = jsonBytes(manifest);
    const manifestHash = sha256(manifestBytes);
    const candidateName = manifest.candidate.path;
    await write(`${rootPath}/manifest.json`, manifestBytes);
    await write(`${rootPath}/${candidateName}`, jpeg);
    await write(`${rootPath}/duplicate-scan.json`, jsonBytes({ status: "pass" }));
    await write(`${rootPath}/SHA256SUMS`, Buffer.from(`${manifestHash}  manifest.json\n${candidateHash}  ${candidateName}\n`));
    await write(`images/${id.toLowerCase()}-still-old.jpg`, invalid);
    const destination = `images/${id.toLowerCase()}-still-${candidateHash.slice(0, 12)}.jpg`;
    adoptions.push({
      record_id: id,
      actor: `Actor ${index}`,
      character: `Character ${index}`,
      production: `Production ${index}`,
      side: "still",
      packet_root: rootPath,
      manifest_path: `${rootPath}/manifest.json`,
      manifest_sha256: manifestHash,
      checksum_path: `${rootPath}/SHA256SUMS`,
      candidate_path: `${rootPath}/${candidateName}`,
      candidate_sha256: candidateHash,
      candidate_mime: "image/jpeg",
      destination_path: destination,
      image: { kind: "still", origin: `https://example.test/${id}`, pin: true, focus: { x: "center", y: "center" } },
      correction: { ledger: "data/review/fixture-correction.json", invalid_path: `images/${id.toLowerCase()}-still-old.jpg`, invalid_sha256: invalidHash },
      rationale: "fixture",
    });
    const portrait = { src: `images/${id.toLowerCase()}-portrait.jpg`, kind: "free", origin: `https://example.test/${id}/portrait` };
    await write(portrait.src, jpeg);
    specimens.push({ id, actor: `Actor ${index}`, character: `Character ${index}`, production: `Production ${index}`, universe: "Film", years: "2000", designer: "Maker", transform: 3, knownFor: "Known", reveal: "Reveal", link: `https://example.test/${id}/actor`, still: null, portrait });
    sources.push({ id, actor: `Actor ${index}`, character: `Character ${index}`, universe: "Film", still: null, portrait, fetched_at: "2026-01-01" });
    packets.push({ obligation_id: `${id}/still`, root: rootPath, manifest_path: `${rootPath}/manifest.json`, manifest_sha256: manifestHash });
    obligations.push({ id, side: "still", ledger: "data/review/fixture-correction.json", preserved_path: `images/${id.toLowerCase()}-still-old.jpg`, sha256: invalidHash, preserved_asset: { sha256: invalidHash } });
  }
  const plan = {
    version: 1,
    transaction: "COLLECT-003",
    operation: "bounded-canonical-media-adoption",
    status: "authorized",
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    custody: { source_head: "1".repeat(40), imported_packet_denominator: 55 },
    boundary: { adoption_count: 5, trust_state: "frontier-certified", canonical_mutation: true, discovery_permitted: false, new_source_policy_permitted: false, new_supervisor_permitted: false },
    quality_contract: {
      before: { total: 5, complete_pairs: 0, complete_pair_ratio: 0, missing_still: 5, missing_both: 0, missing_both_ratio: 0 },
      expected_after: { total: 5, complete_pairs: 5, complete_pair_ratio: 1, missing_still: 0, missing_both: 0, missing_both_ratio: 0 },
      exact_complete_pair_delta: 5,
      exact_missing_still_delta: -5,
      exact_missing_both_delta: 0,
      baseline_reset_permitted: false,
    },
    adoptions,
  };
  await write(DEFAULTS.plan, jsonBytes(plan));
  await write(DEFAULTS.specimens, jsonBytes(specimens));
  await write(DEFAULTS.sources, jsonBytes(sources));
  await write(DEFAULTS.packetImportReceipt, jsonBytes({ transaction: "COLLECT-002", source: { head_sha: "1".repeat(40), snapshot_sha256: "2".repeat(64) }, counts: { packets: 55 }, boundaries: { canonical_mutation: false }, packets }));
  await write(DEFAULTS.correctionReceipt, jsonBytes({ transaction: "COLLECT-001", obligations }));
  await write("data/review/fixture-correction.json", jsonBytes({ version: 1 }));
  const beforeQuality = { total: 5, metrics: { complete_pairs: 0, complete_pair_ratio: 0, missing_still: 5, missing_both: 0, missing_both_ratio: 0 }, baseline: { version: 1 } };
  await write(DEFAULTS.quality, jsonBytes(beforeQuality));
  return { candidateHash, beforeQuality };
}

async function runFixtures() {
  const root = await mkdtemp(path.join(os.tmpdir(), "collect-003-fixture-"));
  try {
    const fixture = await makeFixture(root);
    const first = await inspectTransaction({ root });
    assert(first.contexts.every((context) => context.state === "pending"), "fixture preflight did not find five pending adoptions");
    const beforePath = path.join(root, "before-quality.json");
    await writeFile(beforePath, jsonBytes(fixture.beforeQuality));
    await applyTransaction({ inspection: first, now: "2026-08-01T08:30:00Z", reportPath: path.join(root, "apply.json") });
    await writeFile(path.join(root, DEFAULTS.quality), jsonBytes({ total: 5, metrics: { complete_pairs: 5, complete_pair_ratio: 1, missing_still: 0, missing_both: 0, missing_both_ratio: 0 }, baseline: { version: 1 } }));
    const adopted = await inspectTransaction({ root });
    assert(adopted.contexts.every((context) => context.state === "already-adopted"), "fixture adoption was not idempotent");
    await validateAdopted({ inspection: adopted, beforeQualityPath: beforePath });

    const driftCandidate = adopted.plan.adoptions[0].candidate_path;
    await writeFile(path.join(root, driftCandidate), Buffer.from("drift"));
    await inspectTransaction({ root }).then(() => { throw new Error("candidate drift did not fail closed"); }, () => {});
    await writeFile(path.join(root, driftCandidate), adopted.contexts[0].candidateBytes);

    const specimensDoc = await readJson(root, DEFAULTS.specimens);
    specimensDoc.value[0].still = { src: "images/unrelated.jpg", kind: "still", origin: "https://example.test/unrelated" };
    const sourcesDoc = await readJson(root, DEFAULTS.sources);
    sourcesDoc.value[0].still = specimensDoc.value[0].still;
    await writeFile(specimensDoc.absolute, jsonBytes(specimensDoc.value));
    await writeFile(sourcesDoc.absolute, jsonBytes(sourcesDoc.value));
    await inspectTransaction({ root }).then(() => { throw new Error("unexpected current binding did not fail closed"); }, () => {});

    console.log("COLLECT-003 fixtures: PASS — exact packet custody adopts five null bindings, remains idempotent, and candidate drift plus unexpected current bindings fail closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  if (has("--fixtures")) return runFixtures();
  const modes = ["--write", "--validate", "--write-receipt", "--validate-receipt"].filter(has);
  assert(modes.length <= 1, `choose at most one transaction mode, found ${modes.join(", ")}`);
  const root = path.resolve(option("--root", "."));
  const inspection = await inspectTransaction({
    root,
    planPath: option("--plan", DEFAULTS.plan),
    specimensPath: option("--specimens", DEFAULTS.specimens),
    sourcesPath: option("--sources", DEFAULTS.sources),
    packetImportReceiptPath: option("--packet-import-receipt", DEFAULTS.packetImportReceipt),
    correctionReceiptPath: option("--correction-receipt", DEFAULTS.correctionReceipt),
  });
  const pending = inspection.contexts.filter((context) => context.state === "pending").length;
  const alreadyAdopted = inspection.contexts.length - pending;

  if (has("--write")) {
    const report = await applyTransaction({
      inspection,
      now: option("--now", new Date().toISOString()),
      reportPath: option("--report", null),
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (has("--validate")) {
    const result = await validateAdopted({
      inspection,
      beforeQualityPath: option("--before-quality", null),
      qualityPath: option("--quality", DEFAULTS.quality),
    });
    console.log(JSON.stringify({ transaction: "COLLECT-003", status: "validated", adoptions: inspection.contexts.length, quality: result.quality.deltas, canonical_mutation: true }, null, 2));
    return;
  }
  if (has("--write-receipt")) {
    const result = await writeReceipt({
      inspection,
      beforeQualityPath: option("--before-quality", null),
      receiptPath: option("--receipt", DEFAULTS.receipt),
      now: option("--now", new Date().toISOString()),
      authorizedParent: option("--authorized-parent", null),
      gatedTree: option("--gated-tree", null),
      workflowRun: option("--workflow-run", null),
    });
    console.log(JSON.stringify({ transaction: "COLLECT-003", status: "receipt-written", path: result.path, sha256: result.sha256, canonical_adoptions: result.receipt.counts.canonical_adoptions }, null, 2));
    return;
  }
  if (has("--validate-receipt")) {
    const result = await validateReceipt({
      inspection,
      beforeQualityPath: option("--before-quality", null),
      receiptPath: option("--receipt", DEFAULTS.receipt),
    });
    console.log(JSON.stringify({ transaction: "COLLECT-003", status: "receipt-valid", path: result.path, sha256: result.sha256, canonical_adoptions: result.receipt.counts.canonical_adoptions }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    transaction: "COLLECT-003",
    operation: inspection.plan.operation,
    authorized: inspection.contexts.length,
    pending,
    already_adopted: alreadyAdopted,
    adoptions: inspection.contexts.map((context) => ({ record_id: context.row.record_id, side: context.row.side, state: context.state, destination_path: context.row.destination_path })),
    boundary: inspection.plan.boundary,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-003 canonical adoption: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
}
