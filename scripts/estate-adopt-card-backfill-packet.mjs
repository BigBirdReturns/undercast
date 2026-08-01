#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_RECORD = "UC-046";
const DEFAULT_SIDE = "still";
const DEFAULT_PACKET_ROOT = "data/review/card-backfill/UC-046";
const DEFAULT_EXPECTED_SHA = "3047a7e99a5fbbb293bc67cf4731acfa56434adae90b342d9d100b0a669d8196";
const DEFAULT_RECEIPT = "data/review/estate-debt/COLLECT-003-UC-046-STILL-ADOPTION.json";
const DEFAULT_CANDIDATE_RECEIPT = "/tmp/COLLECT-003-UC-046-STILL-CANDIDATE.json";
const SPECIMENS_PATH = "data/specimens.json";
const SOURCES_PATH = "data/SOURCES.json";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function stableJson(value) { return `${JSON.stringify(sortValue(value), null, 2)}\n`; }
function digestObject(value) {
  const copy = structuredClone(value);
  delete copy.receipt_sha256;
  return sha256(Buffer.from(stableJson(copy)));
}
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  if (!text || path.isAbsolute(text) || text.split("/").includes("..")) throw new Error(`${label} must be a safe repository-relative path`);
  return text;
}
function requireSha(value, label, length = 64) {
  const pattern = new RegExp(`^[a-f0-9]{${length}}$`, "i");
  if (!pattern.test(value || "")) throw new Error(`${label} must be a ${length}-character hexadecimal SHA`);
  return String(value).toLowerCase();
}
async function readJson(root, repoPath) {
  const bytes = await readFile(path.join(root, safeRelative(repoPath, "JSON path")));
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${repoPath}: ${error.message}`); }
}
async function writeJson(root, repoPath, value) {
  const safe = safeRelative(repoPath, "JSON path");
  await mkdir(path.dirname(path.join(root, safe)), { recursive: true });
  await writeFile(path.join(root, safe), jsonBytes(value));
}
function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
function oneRow(rows, recordId, label) {
  if (!Array.isArray(rows)) throw new Error(`${label} must be an array`);
  const matches = rows.filter((row) => row?.id === recordId);
  if (matches.length !== 1) throw new Error(`${label} must contain exactly one ${recordId} row; found ${matches.length}`);
  return matches[0];
}
function canonicalPath(recordId, side, candidatePath) {
  const ext = path.posix.extname(candidatePath).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) throw new Error(`unsupported candidate extension ${ext}`);
  const normalized = ext === ".jpeg" ? ".jpg" : ext;
  return `images/${recordId.toLowerCase()}-${side}${normalized}`;
}
function expectedBinding({ canonicalImagePath, side, manifest }) {
  const sourcePage = manifest.source?.source_page || manifest.source?.page;
  if (!sourcePage || !/^https?:\/\//.test(sourcePage)) throw new Error("packet manifest lacks an absolute source page");
  return {
    src: canonicalImagePath,
    kind: side,
    origin: sourcePage,
    pin: true,
  };
}
async function optionalFileReceipt(root, repoPath) {
  try {
    const bytes = await readFile(path.join(root, repoPath));
    return { exists: true, bytes: bytes.length, sha256: sha256(bytes) };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, bytes: 0, sha256: null };
    throw error;
  }
}
function assertReceiptDigest(receipt, label) {
  if (receipt.receipt_sha256 !== digestObject(receipt)) throw new Error(`${label} receipt digest is stale`);
}

export async function inspectAdoptionCandidate({
  root = process.cwd(),
  recordId = DEFAULT_RECORD,
  side = DEFAULT_SIDE,
  packetRoot = DEFAULT_PACKET_ROOT,
  expectedSha = DEFAULT_EXPECTED_SHA,
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (!/^UC-\d+$/.test(recordId)) throw new Error(`invalid record id ${recordId}`);
  if (!new Set(["still", "portrait"]).has(side)) throw new Error(`invalid side ${side}`);
  const packetRootSafe = safeRelative(packetRoot, "packet root");
  const manifestPath = `${packetRootSafe}/manifest.json`;
  const manifest = await readJson(resolvedRoot, manifestPath);
  if ((manifest.record_id || manifest.record?.id) !== recordId) throw new Error(`${manifestPath} does not bind ${recordId}`);
  if ((manifest.side || manifest.record?.side) !== side) throw new Error(`${manifestPath} does not bind ${side}`);
  if (manifest.canonical_mutation !== false && manifest.review_boundary?.canonical_mutation_permitted !== false) throw new Error(`${manifestPath} lacks an evidence-only boundary`);
  const candidateName = safeRelative(manifest.candidate?.path || manifest.composition?.file, "packet candidate path");
  if (candidateName.includes("/")) throw new Error(`${manifestPath} candidate must be a direct packet file`);
  const candidatePath = `${packetRootSafe}/${candidateName}`;
  const candidateBytes = await readFile(path.join(resolvedRoot, candidatePath));
  const actualCandidateSha = sha256(candidateBytes);
  const pinnedCandidateSha = requireSha(expectedSha, "expected candidate SHA");
  if (actualCandidateSha !== pinnedCandidateSha) throw new Error(`candidate SHA mismatch: expected ${pinnedCandidateSha}, found ${actualCandidateSha}`);
  if (manifest.candidate?.sha256 && String(manifest.candidate.sha256).toLowerCase() !== actualCandidateSha) throw new Error(`${manifestPath} candidate SHA drifted`);
  if (manifest.candidate?.bytes != null && manifest.candidate.bytes !== candidateBytes.length) throw new Error(`${manifestPath} candidate byte count drifted`);
  const review = manifest.exact_subject_review || {};
  if (review.identity !== "expected-subject") throw new Error(`${manifestPath} lacks expected-subject review`);
  if (!new Set(["pass", "pass-east-focus", "crop-pass"]).has(review.crop_ruling)) throw new Error(`${manifestPath} lacks a passing crop ruling`);
  if (manifest.duplicate_scan?.status !== "pass") throw new Error(`${manifestPath} lacks a passing duplicate scan`);

  const specimens = await readJson(resolvedRoot, SPECIMENS_PATH);
  const sources = await readJson(resolvedRoot, SOURCES_PATH);
  const specimen = oneRow(specimens, recordId, SPECIMENS_PATH);
  const source = oneRow(sources, recordId, SOURCES_PATH);
  if (specimen[side] != null) throw new Error(`${recordId}/${side} specimen binding is already active`);
  if (source[side] != null) throw new Error(`${recordId}/${side} source binding is already active`);
  if (specimen.actor !== (manifest.actor || manifest.record?.actor)) throw new Error(`${recordId} actor differs between specimen and packet`);
  if (specimen.character !== (manifest.character || manifest.record?.character)) throw new Error(`${recordId} character differs between specimen and packet`);

  const canonicalImagePath = canonicalPath(recordId, side, candidatePath);
  const currentImage = await optionalFileReceipt(resolvedRoot, canonicalImagePath);
  if (currentImage.exists && currentImage.sha256 !== actualCandidateSha) throw new Error(`${canonicalImagePath} contains different historical bytes`);
  for (const row of specimens) {
    if (row?.id === recordId) continue;
    for (const mediaSide of ["still", "portrait"]) {
      if (row?.[mediaSide]?.src === canonicalImagePath || row?.[mediaSide] === canonicalImagePath) throw new Error(`${canonicalImagePath} is actively bound to ${row.id}/${mediaSide}`);
    }
  }
  const binding = expectedBinding({ canonicalImagePath, side, manifest });
  return {
    root: resolvedRoot,
    record_id: recordId,
    side,
    actor: manifest.actor || manifest.record?.actor,
    character: manifest.character || manifest.record?.character,
    production: manifest.production || manifest.record?.production,
    packet_root: packetRootSafe,
    manifest_path: manifestPath,
    manifest_sha256: sha256(await readFile(path.join(resolvedRoot, manifestPath))),
    candidate_path: candidatePath,
    candidate_sha256: actualCandidateSha,
    candidate_bytes: candidateBytes.length,
    candidate_width: manifest.candidate?.width || manifest.composition?.geometry?.width || null,
    candidate_height: manifest.candidate?.height || manifest.composition?.geometry?.height || null,
    canonical_image_path: canonicalImagePath,
    canonical_image_before: currentImage,
    binding,
    source: {
      provider: manifest.source?.provider || manifest.source?.publisher || null,
      page: binding.origin,
      author: manifest.source?.author || manifest.source?.image_credit || null,
      license: manifest.source?.license || null,
    },
    review: {
      identity: review.identity,
      presentation: review.presentation || null,
      crop_ruling: review.crop_ruling,
      duplicate_status: manifest.duplicate_scan.status,
    },
  };
}

export async function writeAdoptionCandidate({
  root = process.cwd(),
  recordId = DEFAULT_RECORD,
  side = DEFAULT_SIDE,
  packetRoot = DEFAULT_PACKET_ROOT,
  expectedSha = DEFAULT_EXPECTED_SHA,
  authorizedParent = null,
  candidateReceiptPath = DEFAULT_CANDIDATE_RECEIPT,
  now = new Date().toISOString(),
} = {}) {
  const candidate = await inspectAdoptionCandidate({ root, recordId, side, packetRoot, expectedSha });
  const currentHead = git(candidate.root, ["rev-parse", "HEAD"]).toLowerCase();
  const pinnedParent = authorizedParent ? requireSha(authorizedParent, "authorized parent", 40) : currentHead;
  if (currentHead !== pinnedParent) throw new Error(`target checkout drifted: expected ${pinnedParent}, found ${currentHead}`);

  const specimens = await readJson(candidate.root, SPECIMENS_PATH);
  const sources = await readJson(candidate.root, SOURCES_PATH);
  const specimen = oneRow(specimens, recordId, SPECIMENS_PATH);
  const source = oneRow(sources, recordId, SOURCES_PATH);
  await mkdir(path.dirname(path.join(candidate.root, candidate.canonical_image_path)), { recursive: true });
  if (!candidate.canonical_image_before.exists) await copyFile(path.join(candidate.root, candidate.candidate_path), path.join(candidate.root, candidate.canonical_image_path));
  const writtenImage = await optionalFileReceipt(candidate.root, candidate.canonical_image_path);
  if (!writtenImage.exists || writtenImage.sha256 !== candidate.candidate_sha256 || writtenImage.bytes !== candidate.candidate_bytes) throw new Error("canonical candidate bytes differ from the packet candidate");
  specimen[side] = structuredClone(candidate.binding);
  source[side] = structuredClone(candidate.binding);
  source.fetched_at = now.slice(0, 10);
  await writeJson(candidate.root, SPECIMENS_PATH, specimens);
  await writeJson(candidate.root, SOURCES_PATH, sources);

  const receipt = {
    version: 1,
    transaction: "COLLECT-003",
    operation: "canonical-media-adoption-candidate",
    status: "candidate-unpromoted",
    generated_at: now,
    authorized_parent: pinnedParent,
    record: {
      id: candidate.record_id,
      side: candidate.side,
      actor: candidate.actor,
      character: candidate.character,
      production: candidate.production,
    },
    packet: {
      root: candidate.packet_root,
      manifest_path: candidate.manifest_path,
      manifest_sha256: candidate.manifest_sha256,
    },
    candidate: {
      path: candidate.candidate_path,
      sha256: candidate.candidate_sha256,
      bytes: candidate.candidate_bytes,
      width: candidate.candidate_width,
      height: candidate.candidate_height,
    },
    canonical: {
      image_path: candidate.canonical_image_path,
      image_existed_before: candidate.canonical_image_before.exists,
      image_sha256_before: candidate.canonical_image_before.sha256,
      binding: candidate.binding,
    },
    source: candidate.source,
    review: candidate.review,
    boundaries: {
      previous_specimen_binding: null,
      previous_source_binding: null,
      overwrite_active_binding: false,
      smoke_required: true,
      rendered_browser_required: true,
      acceptance_receipt_promoted: false,
      publication_authorized: false,
    },
  };
  receipt.receipt_sha256 = digestObject(receipt);
  const candidateReceiptAbsolute = path.isAbsolute(candidateReceiptPath) ? candidateReceiptPath : path.join(candidate.root, safeRelative(candidateReceiptPath, "candidate receipt path"));
  await mkdir(path.dirname(candidateReceiptAbsolute), { recursive: true });
  await writeFile(candidateReceiptAbsolute, jsonBytes(receipt));
  return receipt;
}

export async function validateAdoptionState({
  root = process.cwd(),
  recordId = DEFAULT_RECORD,
  side = DEFAULT_SIDE,
  packetRoot = DEFAULT_PACKET_ROOT,
  expectedSha = DEFAULT_EXPECTED_SHA,
  candidateReceiptPath = null,
  receiptPath = null,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const packetRootSafe = safeRelative(packetRoot, "packet root");
  const manifest = await readJson(resolvedRoot, `${packetRootSafe}/manifest.json`);
  const candidateName = safeRelative(manifest.candidate?.path || manifest.composition?.file, "packet candidate path");
  const candidatePath = `${packetRootSafe}/${candidateName}`;
  const candidateBytes = await readFile(path.join(resolvedRoot, candidatePath));
  const candidateSha = sha256(candidateBytes);
  if (candidateSha !== requireSha(expectedSha, "expected candidate SHA")) throw new Error("packet candidate SHA drifted during validation");
  const canonicalImagePath = canonicalPath(recordId, side, candidatePath);
  const canonicalBytes = await readFile(path.join(resolvedRoot, canonicalImagePath));
  if (sha256(canonicalBytes) !== candidateSha || canonicalBytes.length !== candidateBytes.length) throw new Error("canonical image differs from the packet candidate");
  const expected = expectedBinding({ canonicalImagePath, side, manifest });
  const specimens = await readJson(resolvedRoot, SPECIMENS_PATH);
  const sources = await readJson(resolvedRoot, SOURCES_PATH);
  const specimen = oneRow(specimens, recordId, SPECIMENS_PATH);
  const source = oneRow(sources, recordId, SOURCES_PATH);
  if (stableJson(specimen[side]) !== stableJson(expected)) throw new Error("specimen binding differs from the packet-derived canonical binding");
  if (stableJson(source[side]) !== stableJson(expected)) throw new Error("source binding differs from the packet-derived canonical binding");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.fetched_at || "")) throw new Error("source binding lacks a canonical fetched_at date");

  let candidateReceipt = null;
  if (candidateReceiptPath) {
    const absolute = path.isAbsolute(candidateReceiptPath) ? candidateReceiptPath : path.join(resolvedRoot, safeRelative(candidateReceiptPath, "candidate receipt path"));
    candidateReceipt = JSON.parse(await readFile(absolute, "utf8"));
    if (candidateReceipt.status !== "candidate-unpromoted" || candidateReceipt.record?.id !== recordId || candidateReceipt.record?.side !== side) throw new Error("candidate receipt identity is invalid");
    assertReceiptDigest(candidateReceipt, "candidate");
  }
  let receipt = null;
  if (receiptPath) {
    receipt = await readJson(resolvedRoot, receiptPath);
    if (receipt.status !== "accepted-after-complete-smoke" || receipt.record?.id !== recordId || receipt.record?.side !== side) throw new Error("acceptance receipt identity is invalid");
    if (receipt.candidate?.sha256 !== candidateSha || receipt.canonical?.image_path !== canonicalImagePath) throw new Error("acceptance receipt candidate custody drifted");
    if (receipt.smoke?.complete_canonical_gate_passed !== true || receipt.smoke?.rendered_browser_required !== true || receipt.smoke?.receipt_created_after_smoke !== true) throw new Error("acceptance receipt lacks smoke-before-promotion custody");
    assertReceiptDigest(receipt, "acceptance");
  }
  return {
    state: "valid",
    record_id: recordId,
    side,
    candidate_sha256: candidateSha,
    canonical_image_path: canonicalImagePath,
    canonical_image_bytes: canonicalBytes.length,
    candidate_receipt: candidateReceipt?.receipt_sha256 || null,
    acceptance_receipt: receipt?.receipt_sha256 || null,
  };
}

function metricDelta(before, after, key) {
  const a = Number(before?.metrics?.[key]);
  const b = Number(after?.metrics?.[key]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`quality metric ${key} is missing`);
  return Number((b - a).toFixed(6));
}

export async function promoteAdoptionReceipt({
  root = process.cwd(),
  candidateReceiptPath = DEFAULT_CANDIDATE_RECEIPT,
  receiptPath = DEFAULT_RECEIPT,
  qualityBeforePath,
  qualityAfterPath = "data/quality.json",
  workflowRun,
  candidateTree,
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (!qualityBeforePath) throw new Error("quality-before path is required for promotion");
  if (!workflowRun || !/^\d+$/.test(String(workflowRun))) throw new Error("workflow run must be numeric");
  const gatedCandidateTree = requireSha(candidateTree, "candidate tree", 40);
  const candidateReceiptAbsolute = path.isAbsolute(candidateReceiptPath) ? candidateReceiptPath : path.join(resolvedRoot, safeRelative(candidateReceiptPath, "candidate receipt path"));
  const candidate = JSON.parse(await readFile(candidateReceiptAbsolute, "utf8"));
  if (candidate.status !== "candidate-unpromoted") throw new Error("candidate receipt has already been promoted or is invalid");
  assertReceiptDigest(candidate, "candidate");
  await validateAdoptionState({
    root: resolvedRoot,
    recordId: candidate.record.id,
    side: candidate.record.side,
    packetRoot: candidate.packet.root,
    expectedSha: candidate.candidate.sha256,
    candidateReceiptPath,
  });
  const qualityBeforeAbsolute = path.isAbsolute(qualityBeforePath) ? qualityBeforePath : path.join(resolvedRoot, safeRelative(qualityBeforePath, "quality-before path"));
  const qualityAfterAbsolute = path.isAbsolute(qualityAfterPath) ? qualityAfterPath : path.join(resolvedRoot, safeRelative(qualityAfterPath, "quality-after path"));
  const qualityBefore = JSON.parse(await readFile(qualityBeforeAbsolute, "utf8"));
  const qualityAfter = JSON.parse(await readFile(qualityAfterAbsolute, "utf8"));
  const deltas = {
    complete_pairs: metricDelta(qualityBefore, qualityAfter, "complete_pairs"),
    complete_pair_ratio: metricDelta(qualityBefore, qualityAfter, "complete_pair_ratio"),
    missing_still: metricDelta(qualityBefore, qualityAfter, "missing_still"),
    missing_portrait: metricDelta(qualityBefore, qualityAfter, "missing_portrait"),
    missing_both: metricDelta(qualityBefore, qualityAfter, "missing_both"),
  };
  if (deltas.complete_pairs !== 1 || deltas.missing_still !== -1 || deltas.missing_portrait !== 0 || deltas.missing_both !== 0) {
    throw new Error(`UC-046 adoption produced an unexpected quality delta: ${JSON.stringify(deltas)}`);
  }
  const receipt = {
    version: 1,
    transaction: "COLLECT-003",
    operation: "canonical-media-adoption",
    status: "accepted-after-complete-smoke",
    accepted_at: now,
    authorized_parent: candidate.authorized_parent,
    record: candidate.record,
    packet: candidate.packet,
    candidate: candidate.candidate,
    canonical: {
      ...candidate.canonical,
      specimen_path: SPECIMENS_PATH,
      sources_path: SOURCES_PATH,
      fetched_at: now.slice(0, 10),
    },
    source: candidate.source,
    review: candidate.review,
    smoke: {
      workflow_run: Number(workflowRun),
      gated_candidate_tree: gatedCandidateTree,
      complete_canonical_gate_passed: true,
      rendered_browser_required: true,
      receipt_created_after_smoke: true,
      post_smoke_target_validation_passed: true,
    },
    quality: {
      before: {
        total: qualityBefore.total,
        metrics: qualityBefore.metrics,
      },
      after: {
        total: qualityAfter.total,
        metrics: qualityAfter.metrics,
      },
      delta: deltas,
      measured_from_generated_truth: true,
    },
    boundaries: {
      overwrite_active_binding: false,
      acceptance_receipt_existed_in_candidate_tree: false,
      canonical_media_adopted: 1,
      packet_count_inference: false,
      exact_head_publication_lease_required: true,
      merge_to_main_claimed: false,
      deployment_claimed: false,
    },
  };
  receipt.receipt_sha256 = digestObject(receipt);
  await writeJson(resolvedRoot, receiptPath, receipt);
  return receipt;
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
  const recordId = option(argv, "--record", DEFAULT_RECORD);
  const side = option(argv, "--side", DEFAULT_SIDE);
  const packetRoot = option(argv, "--packet-root", DEFAULT_PACKET_ROOT);
  const expectedSha = option(argv, "--expected-sha", DEFAULT_EXPECTED_SHA);
  const now = option(argv, "--now", new Date().toISOString());
  let result;
  if (argv.includes("--write")) {
    result = await writeAdoptionCandidate({
      root,
      recordId,
      side,
      packetRoot,
      expectedSha,
      authorizedParent: option(argv, "--authorized-parent"),
      candidateReceiptPath: option(argv, "--candidate-receipt", DEFAULT_CANDIDATE_RECEIPT),
      now,
    });
  } else if (argv.includes("--promote")) {
    result = await promoteAdoptionReceipt({
      root,
      candidateReceiptPath: option(argv, "--candidate-receipt", DEFAULT_CANDIDATE_RECEIPT),
      receiptPath: option(argv, "--receipt", DEFAULT_RECEIPT),
      qualityBeforePath: option(argv, "--quality-before"),
      qualityAfterPath: option(argv, "--quality-after", "data/quality.json"),
      workflowRun: option(argv, "--workflow-run"),
      candidateTree: option(argv, "--candidate-tree"),
      now,
    });
  } else if (argv.includes("--validate")) {
    result = await validateAdoptionState({
      root,
      recordId,
      side,
      packetRoot,
      expectedSha,
      candidateReceiptPath: option(argv, "--candidate-receipt"),
      receiptPath: option(argv, "--receipt"),
    });
  } else {
    result = await inspectAdoptionCandidate({ root, recordId, side, packetRoot, expectedSha });
  }
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`card-backfill adoption failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
