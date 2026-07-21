#!/usr/bin/env node
/**
 * Receipt one independently stored preservation bundle after the remote provider
 * reports the exact uploaded byte count and sha256. This command never uploads;
 * it records a verified provider receipt and advances only the gates the receipt
 * actually proves.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { validateSnapshotRegistry } from './lib/preservation.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
  return value;
}
const registryPath = option('registry', 'preservation/SNAPSHOTS.json');
const snapshotId = option('snapshot');
const provider = option('provider');
const fileId = option('file-id');
const name = option('name');
const kind = option('kind');
const digest = option('sha256');
const rawBytes = option('bytes');
const webUrl = option('url');
const verifiedAt = option('verified-at', new Date().toISOString());
if (!snapshotId || !provider || !fileId || !name || !kind || !digest || rawBytes === null) {
  throw new Error('preserve-offsite requires --snapshot, --provider, --file-id, --name, --kind, --sha256, and --bytes');
}
if (!['public-bundle', 'originals-bag'].includes(kind)) throw new Error('--kind must be public-bundle or originals-bag');
if (!/^[0-9a-f]{64}$/i.test(digest)) throw new Error('--sha256 must be a 64-hex digest reported by the independent provider');
const bytes = Number(rawBytes);
if (!Number.isInteger(bytes) || bytes < 1) throw new Error('--bytes must be a positive integer reported by the independent provider');
if (!Number.isFinite(Date.parse(verifiedAt))) throw new Error('--verified-at must be an ISO timestamp');

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
validateSnapshotRegistry(registry);
const snapshot = registry.snapshots.find((row) => row.id === snapshotId);
if (!snapshot) throw new Error(`unknown preservation snapshot ${snapshotId}`);
if (snapshot.status === 'superseded') throw new Error(`snapshot ${snapshotId} is superseded; refusing to attach new preservation bytes`);
const receipt = {
  kind,
  provider,
  file_id: fileId,
  name,
  sha256: digest.toLowerCase(),
  bytes,
  verified_at: new Date(verifiedAt).toISOString(),
};
if (webUrl) receipt.url = webUrl;
snapshot.independent_copies ||= [];
const prior = snapshot.independent_copies.findIndex((row) => row.provider === provider && row.file_id === fileId);
if (prior >= 0) snapshot.independent_copies[prior] = receipt;
else snapshot.independent_copies.push(receipt);
snapshot.independent_copies.sort((a, b) => a.kind.localeCompare(b.kind) || a.provider.localeCompare(b.provider) || a.file_id.localeCompare(b.file_id));

// A current public bundle independently stored outside GitHub makes the source
// and repository snapshot verified. Original-image survival is a separate global
// history guard because later source snapshots need not re-copy the same 1 GB bag.
if (snapshot.independent_copies.some((row) => row.kind === 'public-bundle')) snapshot.status = 'verified';
const originalsCopy = registry.snapshots.find((row) => row.baseline_manifest_sha256 === registry.history_guard.baseline_manifest_sha256
  && row.independent_copies?.some((copy) => copy.kind === 'originals-bag'));
if (originalsCopy) {
  registry.history_guard.status = 'offsite-verified';
  registry.history_guard.precondition_met = true;
  registry.history_guard.verified_snapshot = originalsCopy.id;
  registry.history_guard.verified_at = originalsCopy.independent_copies.find((copy) => copy.kind === 'originals-bag').verified_at;
  registry.history_guard.note = 'A hash-verified pre-R1 originals BagIt bundle exists outside GitHub. This satisfies the preservation precondition only; destructive history rewrite remains a separate owner decision and is not authorized.';
}
registry.history_guard.destructive_rewrite_authorized = false;
registry.updated_at = new Date().toISOString();
validateSnapshotRegistry(registry);
await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n');
console.log(`receipted ${kind} for ${snapshot.id} at ${provider}; snapshot=${snapshot.status}; history-guard=${registry.history_guard.status}`);
