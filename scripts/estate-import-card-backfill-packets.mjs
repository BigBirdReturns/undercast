#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKET_ROOT = "data/review/card-backfill";
const RECEIPT_DEFAULT = "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json";
const PACKET_MANIFEST_RE = /^data\/review\/card-backfill\/(UC-\d+)\/manifest\.json$/;
const BATCH_RE = /^data\/review\/card-backfill\/batches\/([a-f0-9]{64})\.json$/;
const ALLOWED_MODES = new Set(["100644", "100755"]);
const CHECKSUM_NAMES = new Set(["checksums.sha256", "SHA256SUMS"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function stableJson(value) { return `${JSON.stringify(sortValue(value), null, 2)}\n`; }
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  if (!text || path.isAbsolute(text) || text.split("/").includes("..")) throw new Error(`${label} must be a safe repository-relative path`);
  return text;
}
function runGit(root, args, options = {}) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: options.binary ? null : "utf8", maxBuffer: options.maxBuffer || 512 * 1024 * 1024 });
  } catch (error) {
    const stderr = error.stderr?.toString?.().trim();
    const stdout = error.stdout?.toString?.().trim();
    throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout || error.message}`);
  }
}
function requireSha(value, label) {
  if (!/^[a-f0-9]{40}$/i.test(value || "")) throw new Error(`${label} must be a full 40-character Git commit SHA`);
  return value.toLowerCase();
}
function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${label}: ${error.message}`); }
}
function parseTree(raw) {
  const map = new Map();
  for (const segment of raw.toString("utf8").split("\0").filter(Boolean)) {
    const tab = segment.indexOf("\t");
    if (tab < 0) throw new Error(`cannot parse git tree entry ${segment}`);
    const [mode, type, oid] = segment.slice(0, tab).split(" ");
    const repoPath = safeRelative(segment.slice(tab + 1), "tree path");
    if (map.has(repoPath)) throw new Error(`duplicate Git tree path ${repoPath}`);
    map.set(repoPath, { mode, type, oid, path: repoPath });
  }
  return map;
}
function blobReader(root) {
  const cache = new Map();
  return (entry) => {
    if (!entry || entry.type !== "blob") throw new Error(`cannot read non-blob tree entry ${entry?.path || "<missing>"}`);
    if (!cache.has(entry.oid)) cache.set(entry.oid, runGit(root, ["cat-file", "blob", entry.oid], { binary: true }));
    return cache.get(entry.oid);
  };
}
function relativeWithin(rootPath, repoPath) {
  if (!repoPath.startsWith(`${rootPath}/`)) throw new Error(`${repoPath} is outside ${rootPath}`);
  return repoPath.slice(rootPath.length + 1);
}
function canonicalBoundary(manifest, label) {
  if (Object.hasOwn(manifest, "canonical_mutation")) {
    if (manifest.canonical_mutation !== false) throw new Error(`${label} permits canonical mutation`);
    return "canonical_mutation=false";
  }
  if (Object.hasOwn(manifest.review_boundary || {}, "canonical_mutation_permitted")) {
    if (manifest.review_boundary.canonical_mutation_permitted !== false) throw new Error(`${label} permits canonical mutation`);
    return "review_boundary.canonical_mutation_permitted=false";
  }
  throw new Error(`${label} lacks an explicit no-canonical-mutation boundary`);
}
function parseChecksumLedger(bytes, label) {
  const rows = [];
  for (const [index, raw] of bytes.toString("utf8").split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) throw new Error(`${label}:${index + 1} is not a SHA-256 ledger row`);
    const name = safeRelative(match[2].trim(), `${label}:${index + 1} path`);
    if (name.includes("/")) throw new Error(`${label}:${index + 1} must name a direct packet file`);
    rows.push({ sha256: match[1].toLowerCase(), name });
  }
  const names = new Set();
  for (const row of rows) {
    if (names.has(row.name)) throw new Error(`${label} repeats ${row.name}`);
    names.add(row.name);
  }
  if (!rows.length) throw new Error(`${label} is empty`);
  return rows;
}
async function walkWorkingFiles(root, relativeRoot, out = []) {
  const absolute = path.join(root, relativeRoot);
  let entries;
  try { entries = await readdir(absolute, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return out; throw error; }
  for (const entry of entries) {
    const rel = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) await walkWorkingFiles(root, rel, out);
    else if (entry.isFile()) out.push(rel.replaceAll("\\", "/"));
    else throw new Error(`target packet contains unsupported filesystem entry ${rel}`);
  }
  return out;
}
async function workingReceipt(root, repoPath) {
  const bytes = await readFile(path.join(root, repoPath));
  return { sha256: sha256(bytes), bytes: bytes.length };
}

export function inspectPacketSnapshot({ root = process.cwd(), sourceSha, expectedPackets = null } = {}) {
  const resolvedRoot = path.resolve(root);
  const pinnedSource = requireSha(sourceSha, "source SHA");
  runGit(resolvedRoot, ["cat-file", "-e", `${pinnedSource}^{commit}`]);
  const tree = parseTree(runGit(resolvedRoot, ["ls-tree", "-r", "-z", pinnedSource, "--", PACKET_ROOT], { binary: true }));
  const readBlob = blobReader(resolvedRoot);
  const manifestPaths = [...tree.keys()].filter((repoPath) => PACKET_MANIFEST_RE.test(repoPath)).sort();
  if (!manifestPaths.length) throw new Error(`source ${pinnedSource} contains no permanent packet manifests`);
  if (expectedPackets != null && manifestPaths.length !== expectedPackets) throw new Error(`packet denominator drifted: expected ${expectedPackets}, found ${manifestPaths.length}`);

  const obligations = new Set();
  const packets = [];
  const byObligation = new Map();
  for (const manifestPath of manifestPaths) {
    const match = manifestPath.match(PACKET_MANIFEST_RE);
    const rootPath = manifestPath.slice(0, -"/manifest.json".length);
    const packetEntries = [...tree.values()].filter((entry) => entry.path.startsWith(`${rootPath}/`)).sort((a, b) => a.path.localeCompare(b.path));
    if (!packetEntries.length) throw new Error(`${rootPath} is empty`);
    for (const entry of packetEntries) {
      if (entry.type !== "blob" || !ALLOWED_MODES.has(entry.mode)) throw new Error(`${entry.path} is not a regular packet file`);
      const rel = relativeWithin(rootPath, entry.path);
      if (rel.includes("/")) throw new Error(`${rootPath} contains nested packet path ${rel}`);
    }
    const manifestEntry = tree.get(manifestPath);
    const manifestBytes = readBlob(manifestEntry);
    const manifest = parseJson(manifestBytes, manifestPath);
    const recordId = manifest.record_id || manifest.record?.id;
    const side = manifest.side || manifest.record?.side;
    if (recordId !== match[1]) throw new Error(`${manifestPath} record id ${recordId} differs from its directory`);
    if (!new Set(["still", "portrait"]).has(side)) throw new Error(`${manifestPath} has invalid side ${side}`);
    const obligationId = `${recordId}/${side}`;
    if (obligations.has(obligationId)) throw new Error(`duplicate packet obligation ${obligationId}`);
    obligations.add(obligationId);
    const boundary = canonicalBoundary(manifest, manifestPath);

    const checksumEntries = packetEntries.filter((entry) => CHECKSUM_NAMES.has(path.posix.basename(entry.path)));
    if (checksumEntries.length !== 1) throw new Error(`${rootPath} must contain exactly one checksum ledger`);
    const checksumEntry = checksumEntries[0];
    const checksumName = path.posix.basename(checksumEntry.path);
    const ledgerRows = parseChecksumLedger(readBlob(checksumEntry), checksumEntry.path);
    const ledgerNames = new Set(ledgerRows.map((row) => row.name));
    const expectedLedgerNames = packetEntries.map((entry) => path.posix.basename(entry.path)).filter((name) => name !== checksumName).sort();
    if (JSON.stringify([...ledgerNames].sort()) !== JSON.stringify(expectedLedgerNames)) throw new Error(`${checksumEntry.path} does not cover the exact packet file set`);

    const files = [];
    for (const entry of packetEntries) {
      const bytes = readBlob(entry);
      const name = path.posix.basename(entry.path);
      const receipt = { path: entry.path, name, mode: entry.mode, bytes: bytes.length, sha256: sha256(bytes), git_blob: entry.oid };
      if (name !== checksumName) {
        const ledger = ledgerRows.find((row) => row.name === name);
        if (!ledger || ledger.sha256 !== receipt.sha256) throw new Error(`${checksumEntry.path} hash mismatch for ${name}`);
      }
      files.push(receipt);
    }

    if (!files.some((file) => file.name === "review.json") || !files.some((file) => file.name === "review.md")) throw new Error(`${rootPath} lacks permanent review custody`);
    if (!files.some((file) => file.name === "card-crop-preview.jpg")) throw new Error(`${rootPath} lacks a card-crop preview`);
    if (!files.some((file) => new RegExp(`^${recordId.toLowerCase()}-${side}-candidate\\.(jpg|jpeg|png|webp)$`).test(file.name))) throw new Error(`${rootPath} lacks its deterministic candidate`);
    if (Array.isArray(manifest.files)) {
      for (const declared of manifest.files) {
        const declaredName = safeRelative(declared.path, `${manifestPath} declared file`);
        if (declaredName.includes("/")) throw new Error(`${manifestPath} declares nested file ${declaredName}`);
        const actual = files.find((file) => file.name === declaredName);
        if (!actual) throw new Error(`${manifestPath} declares missing file ${declaredName}`);
        if (actual.sha256 !== String(declared.sha256 || "").toLowerCase() || actual.bytes !== declared.bytes) throw new Error(`${manifestPath} receipt drift for ${declaredName}`);
      }
    }
    const packetTree = files.map(({ name, mode, bytes, sha256 }) => ({ name, mode, bytes, sha256 }));
    const packet = {
      obligation_id: obligationId,
      record_id: recordId,
      side,
      root: rootPath,
      manifest_path: manifestPath,
      manifest_git_blob: manifestEntry.oid,
      manifest_sha256: sha256(manifestBytes),
      declared_packet_sha256: /^[a-f0-9]{64}$/i.test(manifest.packet_sha256 || "") ? manifest.packet_sha256.toLowerCase() : null,
      packet_tree_sha256: sha256(Buffer.from(stableJson(packetTree))),
      checksum_ledger: checksumName,
      canonical_boundary: boundary,
      file_count: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      files,
    };
    packets.push(packet);
    byObligation.set(obligationId, packet);
  }

  const batchPaths = [...tree.keys()].filter((repoPath) => BATCH_RE.test(repoPath)).sort();
  const batches = [];
  const batched = new Map();
  for (const batchPath of batchPaths) {
    const id = batchPath.match(BATCH_RE)[1];
    const entry = tree.get(batchPath);
    if (entry.type !== "blob" || !ALLOWED_MODES.has(entry.mode)) throw new Error(`${batchPath} is not a regular file`);
    const bytes = readBlob(entry);
    const batch = parseJson(bytes, batchPath);
    if (batch.publication_batch_sha256 !== id) throw new Error(`${batchPath} publication id differs from filename`);
    if (batch.canonical_mutation !== false) throw new Error(`${batchPath} permits canonical mutation`);
    if (!Array.isArray(batch.materialized_packets) || batch.counts?.materialized !== batch.materialized_packets.length) throw new Error(`${batchPath} materialized count is stale`);
    for (const row of batch.materialized_packets) {
      const obligationId = row.obligation_id || `${row.record_id}/${row.side}`;
      const packet = byObligation.get(obligationId);
      if (!packet) throw new Error(`${batchPath} references missing packet ${obligationId}`);
      if (!packet.declared_packet_sha256) throw new Error(`${batchPath} references legacy packet without packet_sha256 ${obligationId}`);
      if (packet.declared_packet_sha256 !== String(row.packet_sha256 || "").toLowerCase()) throw new Error(`${batchPath} packet digest drift for ${obligationId}`);
      if (batched.has(obligationId)) throw new Error(`${obligationId} appears in multiple permanent batches`);
      batched.set(obligationId, id);
    }
    batches.push({
      publication_batch_sha256: id,
      path: batchPath,
      git_blob: entry.oid,
      sha256: sha256(bytes),
      bytes: bytes.length,
      materialized: batch.materialized_packets.length,
      obligations: batch.materialized_packets.map((row) => row.obligation_id || `${row.record_id}/${row.side}`).sort(),
    });
  }

  for (const packet of packets) {
    packet.publication_batch_sha256 = batched.get(packet.obligation_id) || null;
    if (packet.declared_packet_sha256 && !packet.publication_batch_sha256) throw new Error(`${packet.obligation_id} has a packet_sha256 but no permanent batch receipt`);
  }
  const serialPackets = packets.filter((packet) => !packet.publication_batch_sha256).length;
  const batchedPackets = packets.length - serialPackets;
  const importPaths = [...packets.flatMap((packet) => packet.files.map((file) => file.path)), ...batches.map((batch) => batch.path)].sort();
  const importPathDigest = sha256(Buffer.from(stableJson(importPaths.map((repoPath) => {
    const entry = tree.get(repoPath);
    const bytes = readBlob(entry);
    return { path: repoPath, mode: entry.mode, bytes: bytes.length, sha256: sha256(bytes) };
  }))));
  const snapshot = {
    source_sha: pinnedSource,
    packets: packets.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true })),
    batches,
    counts: {
      packets: packets.length,
      serial_packets: serialPackets,
      batched_packets: batchedPackets,
      batches: batches.length,
      files: importPaths.length,
      bytes: packets.reduce((sum, packet) => sum + packet.bytes, 0) + batches.reduce((sum, batch) => sum + batch.bytes, 0),
    },
    import_paths: importPaths,
    import_path_digest: importPathDigest,
  };
  snapshot.snapshot_sha256 = sha256(Buffer.from(stableJson({
    source_sha: snapshot.source_sha,
    counts: snapshot.counts,
    import_path_digest: snapshot.import_path_digest,
    packets: snapshot.packets.map((packet) => ({ obligation_id: packet.obligation_id, packet_tree_sha256: packet.packet_tree_sha256, declared_packet_sha256: packet.declared_packet_sha256, publication_batch_sha256: packet.publication_batch_sha256 })),
    batches: snapshot.batches.map((batch) => ({ publication_batch_sha256: batch.publication_batch_sha256, sha256: batch.sha256, obligations: batch.obligations })),
  })));
  return snapshot;
}

async function verifyTargetConflicts(root, snapshot) {
  const sourcePathSet = new Set(snapshot.import_paths);
  for (const packet of snapshot.packets) {
    const existing = await walkWorkingFiles(root, packet.root);
    for (const repoPath of existing) if (!sourcePathSet.has(repoPath)) throw new Error(`target contains extra packet file ${repoPath}`);
  }
  const sourceReceipt = new Map(snapshot.packets.flatMap((packet) => packet.files.map((file) => [file.path, file])).concat(snapshot.batches.map((batch) => [batch.path, batch])));
  let identical = 0;
  for (const repoPath of snapshot.import_paths) {
    try {
      const actual = await workingReceipt(root, repoPath);
      const expected = sourceReceipt.get(repoPath);
      if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error(`target path ${repoPath} conflicts with source packet estate`);
      identical++;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return identical;
}
async function verifyImportedWorkingTree(root, snapshot) {
  const sourceReceipt = new Map(snapshot.packets.flatMap((packet) => packet.files.map((file) => [file.path, file])).concat(snapshot.batches.map((batch) => [batch.path, batch])));
  for (const repoPath of snapshot.import_paths) {
    const actual = await workingReceipt(root, repoPath);
    const expected = sourceReceipt.get(repoPath);
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error(`imported path ${repoPath} differs from source snapshot`);
  }
}

export async function importPacketSnapshot({
  root = process.cwd(),
  sourceSha,
  targetParent,
  expectedPackets = 55,
  sourcePr = 129,
  receiptPath = RECEIPT_DEFAULT,
  write = false,
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = path.resolve(root);
  const pinnedTarget = requireSha(targetParent, "target parent");
  const currentHead = runGit(resolvedRoot, ["rev-parse", "HEAD"]).trim().toLowerCase();
  if (currentHead !== pinnedTarget) throw new Error(`target checkout drifted: expected ${pinnedTarget}, found ${currentHead}`);
  const snapshot = inspectPacketSnapshot({ root: resolvedRoot, sourceSha, expectedPackets });
  const identicalBefore = await verifyTargetConflicts(resolvedRoot, snapshot);
  if (write) {
    const roots = snapshot.packets.map((packet) => packet.root);
    const batchPaths = snapshot.batches.map((batch) => batch.path);
    runGit(resolvedRoot, ["checkout", snapshot.source_sha, "--", ...roots, ...batchPaths]);
    await verifyImportedWorkingTree(resolvedRoot, snapshot);
  }
  const receiptSafe = safeRelative(receiptPath, "import receipt path");
  const receipt = {
    version: 1,
    transaction: "COLLECT-002",
    operation: "card-backfill-permanent-packet-estate-import",
    generated_at: now,
    mode: write ? "write" : "dry-run",
    source: {
      pull_request: sourcePr,
      head_sha: snapshot.source_sha,
      snapshot_sha256: snapshot.snapshot_sha256,
      import_path_digest: snapshot.import_path_digest,
    },
    target: {
      authorized_parent: pinnedTarget,
      branch_role: "main-based-consolidation",
    },
    counts: { ...snapshot.counts, identical_paths_before_import: identicalBefore, paths_new_or_imported: snapshot.counts.files - identicalBefore },
    boundaries: {
      canonical_mutation: false,
      canonical_media_paths_imported: 0,
      specimens_mutated: false,
      sources_mutated: false,
      media_audit_mutated: false,
      staging_imported: false,
      workflows_imported: false,
      caches_imported: false,
      source_branch_execution_state_imported: false,
      full_repository_gate_required: true,
      exact_head_publication_lease_required: true,
    },
    packets: snapshot.packets.map(({ files, ...packet }) => ({ ...packet, file_receipt_sha256: sha256(Buffer.from(stableJson(files.map(({ path, mode, bytes, sha256 }) => ({ path, mode, bytes, sha256 }))))) })),
    batches: snapshot.batches,
  };
  receipt.receipt_sha256 = sha256(Buffer.from(stableJson({ ...receipt, receipt_sha256: undefined })));
  if (write) {
    await mkdir(path.dirname(path.join(resolvedRoot, receiptSafe)), { recursive: true });
    await writeFile(path.join(resolvedRoot, receiptSafe), jsonBytes(receipt));
  }
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
  const result = await importPacketSnapshot({
    root: path.resolve(option(argv, "--root", ".")),
    sourceSha: option(argv, "--source-sha"),
    targetParent: option(argv, "--target-parent"),
    expectedPackets: Number(option(argv, "--expected-packets", "55")),
    sourcePr: Number(option(argv, "--source-pr", "129")),
    receiptPath: option(argv, "--receipt", RECEIPT_DEFAULT),
    write: argv.includes("--write"),
    now: option(argv, "--now", new Date().toISOString()),
  });
  console.log(JSON.stringify({ transaction: result.transaction, operation: result.operation, mode: result.mode, source: result.source, target: result.target, counts: result.counts, boundaries: result.boundaries, receipt_sha256: result.receipt_sha256 }, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`packet estate import failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
