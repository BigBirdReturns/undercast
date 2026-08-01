#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_RECEIPT = "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
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
async function walk(root, relativeRoot, out = []) {
  const absolute = path.join(root, relativeRoot);
  const entries = await readdir(absolute, { withFileTypes: true });
  for (const entry of entries) {
    const relative = `${relativeRoot}/${entry.name}`.replaceAll("\\", "/");
    if (entry.isDirectory()) await walk(root, relative, out);
    else if (entry.isFile()) out.push(relative);
    else throw new Error(`packet estate contains unsupported filesystem entry ${relative}`);
  }
  return out;
}
async function fileReceipt(root, repoPath) {
  const absolute = path.join(root, repoPath);
  const [bytes, info] = await Promise.all([readFile(absolute), stat(absolute)]);
  return { path: repoPath, name: path.posix.basename(repoPath), mode: info.mode & 0o111 ? "100755" : "100644", bytes: bytes.length, sha256: sha256(bytes) };
}
function parseLedger(bytes, label) {
  const rows = [];
  for (const [index, raw] of bytes.toString("utf8").split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!match) throw new Error(`${label}:${index + 1} is not a checksum row`);
    const name = safeRelative(match[2].trim(), `${label}:${index + 1} path`);
    if (name.includes("/")) throw new Error(`${label}:${index + 1} names a nested file`);
    rows.push({ sha256: match[1].toLowerCase(), name });
  }
  return rows;
}

export async function validateImportedPacketEstate({ root = process.cwd(), receiptPath = DEFAULT_RECEIPT, allowAbsent = true } = {}) {
  const resolvedRoot = path.resolve(root);
  const receiptSafe = safeRelative(receiptPath, "packet import receipt path");
  let receiptBytes;
  try { receiptBytes = await readFile(path.join(resolvedRoot, receiptSafe)); }
  catch (error) {
    if (allowAbsent && error.code === "ENOENT") return { state: "absent", receipt_path: receiptSafe };
    throw error;
  }
  let receipt;
  try { receipt = JSON.parse(receiptBytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${receiptSafe}: ${error.message}`); }
  if (receipt.version !== 1 || receipt.transaction !== "COLLECT-002" || receipt.operation !== "card-backfill-permanent-packet-estate-import" || receipt.mode !== "write") throw new Error("packet import receipt has an unsupported identity");
  if (receipt.boundaries?.canonical_mutation !== false || receipt.boundaries?.canonical_media_paths_imported !== 0 || receipt.boundaries?.staging_imported !== false || receipt.boundaries?.workflows_imported !== false) throw new Error("packet import receipt violates the evidence-only boundary");
  if (!/^[a-f0-9]{40}$/i.test(receipt.source?.head_sha || "") || !/^[a-f0-9]{40}$/i.test(receipt.target?.authorized_parent || "")) throw new Error("packet import receipt lacks exact source and target heads");
  const digestInput = structuredClone(receipt);
  delete digestInput.receipt_sha256;
  if (sha256(Buffer.from(stableJson(digestInput))) !== receipt.receipt_sha256) throw new Error("packet import receipt digest is stale");
  if (!Array.isArray(receipt.packets) || !Array.isArray(receipt.batches)) throw new Error("packet import receipt lacks packet and batch arrays");

  const obligations = new Set();
  let packetFiles = 0;
  let packetBytes = 0;
  for (const packet of receipt.packets) {
    if (!/^UC-\d+\/(still|portrait)$/.test(packet.obligation_id || "")) throw new Error(`invalid packet obligation ${packet.obligation_id}`);
    if (obligations.has(packet.obligation_id)) throw new Error(`duplicate imported packet ${packet.obligation_id}`);
    obligations.add(packet.obligation_id);
    const rootPath = safeRelative(packet.root, `${packet.obligation_id} root`);
    if (!/^data\/review\/card-backfill\/UC-\d+$/.test(rootPath)) throw new Error(`${packet.obligation_id} has an invalid packet root`);
    const paths = (await walk(resolvedRoot, rootPath)).sort();
    if (paths.some((repoPath) => repoPath.slice(rootPath.length + 1).includes("/"))) throw new Error(`${packet.obligation_id} contains nested packet files`);
    const files = [];
    for (const repoPath of paths) files.push(await fileReceipt(resolvedRoot, repoPath));
    files.sort((a, b) => a.name.localeCompare(b.name));
    if (files.length !== packet.file_count) throw new Error(`${packet.obligation_id} file count drifted`);
    const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    if (bytes !== packet.bytes) throw new Error(`${packet.obligation_id} byte count drifted`);
    const treeDigest = sha256(Buffer.from(stableJson(files.map(({ name, mode, bytes, sha256 }) => ({ name, mode, bytes, sha256 })))));
    if (treeDigest !== packet.packet_tree_sha256) throw new Error(`${packet.obligation_id} packet tree digest drifted`);
    const ledger = files.find((file) => file.name === packet.checksum_ledger);
    if (!ledger) throw new Error(`${packet.obligation_id} checksum ledger is missing`);
    const ledgerRows = parseLedger(await readFile(path.join(resolvedRoot, ledger.path)), ledger.path);
    const ledgerNames = new Set(ledgerRows.map((row) => row.name));
    const expectedNames = files.map((file) => file.name).filter((name) => name !== ledger.name).sort();
    if (JSON.stringify([...ledgerNames].sort()) !== JSON.stringify(expectedNames)) throw new Error(`${packet.obligation_id} checksum coverage drifted`);
    for (const row of ledgerRows) {
      const current = files.find((file) => file.name === row.name);
      if (!current || current.sha256 !== row.sha256) throw new Error(`${packet.obligation_id} checksum drift for ${row.name}`);
    }
    packetFiles += files.length;
    packetBytes += bytes;
  }

  let batchBytes = 0;
  for (const batch of receipt.batches) {
    const repoPath = safeRelative(batch.path, "publication batch path");
    if (!/^data\/review\/card-backfill\/batches\/[a-f0-9]{64}\.json$/.test(repoPath)) throw new Error(`invalid publication batch path ${repoPath}`);
    const current = await fileReceipt(resolvedRoot, repoPath);
    if (current.sha256 !== batch.sha256 || current.bytes !== batch.bytes) throw new Error(`publication batch drift at ${repoPath}`);
    batchBytes += current.bytes;
  }
  if (receipt.counts?.packets !== receipt.packets.length || receipt.counts?.batches !== receipt.batches.length) throw new Error("packet import count receipt is stale");
  if (receipt.counts?.files !== packetFiles + receipt.batches.length) throw new Error("packet import file count receipt is stale");
  if (receipt.counts?.bytes !== packetBytes + batchBytes) throw new Error("packet import byte count receipt is stale");
  if (receipt.counts?.serial_packets + receipt.counts?.batched_packets !== receipt.counts?.packets) throw new Error("packet generation counts do not reconcile");
  return {
    state: "valid",
    receipt_path: receiptSafe,
    receipt_sha256: sha256(receiptBytes),
    source_head: receipt.source.head_sha,
    authorized_parent: receipt.target.authorized_parent,
    packets: receipt.packets.length,
    serial_packets: receipt.counts.serial_packets,
    batched_packets: receipt.counts.batched_packets,
    batches: receipt.batches.length,
    files: receipt.counts.files,
    bytes: receipt.counts.bytes,
  };
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
export async function main(argv = process.argv.slice(2)) {
  const result = await validateImportedPacketEstate({
    root: path.resolve(option(argv, "--root", ".")),
    receiptPath: option(argv, "--receipt", DEFAULT_RECEIPT),
    allowAbsent: !argv.includes("--require"),
  });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`packet import validation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
