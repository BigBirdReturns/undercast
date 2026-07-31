#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { mergeSourceCacheDeltas } from "./lib/card-backfill-source-cache.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
async function exists(path) { try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function walk(root, current = root, out = []) {
  let rows = [];
  try { rows = await readdir(current, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return out; throw error; }
  for (const row of rows) {
    const path = join(current, row.name);
    if (row.isDirectory()) await walk(root, path, out);
    else if (row.isFile()) out.push(path);
  }
  return out;
}
async function copyExact(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  if (await exists(destination)) {
    if (sha256(await readFile(source)) !== sha256(await readFile(destination))) throw new Error(`amortization artifact collision ${destination}`);
    return false;
  }
  await copyFile(source, destination);
  return true;
}

const shardsRoot = resolve(option("--shards-root"));
const out = resolve(option("--out"));
const batchSha = option("--batch-sha");
const now = option("--now", new Date().toISOString());
if (!batchSha || !/^[0-9a-f]{64}$/i.test(batchSha)) throw new Error("batch-sha must be a full SHA-256 digest");
const files = await walk(shardsRoot);
let telemetryCount = 0;
const observedShards = new Set();
for (const file of files.sort()) {
  if (basename(file) !== "source-telemetry.json") continue;
  const value = JSON.parse(await readFile(file, "utf8"));
  if (value.lane !== "card-backfill-source-amortization-telemetry" || value.batch_sha256 !== batchSha) throw new Error(`telemetry custody drift ${file}`);
  const shard = String(value.shard_id || "unknown").padStart(2, "0");
  if (observedShards.has(shard)) throw new Error(`duplicate telemetry shard ${batchSha}/${shard}`);
  observedShards.add(shard);
  if (await copyExact(file, join(out, "telemetry", `${batchSha}-${shard}.json`))) telemetryCount += 1;
}

// Request-key collisions are expected when separate shards consult the same page.
// Apply the cache's own deterministic merge law instead of comparing timestamped
// entry JSON byte-for-byte: identical bodies are idempotent; a newer differing
// body is a refresh; same-time differing bodies fail closed.
const cacheIndex = await mergeSourceCacheDeltas({
  inputRoot: shardsRoot,
  outputRoot: join(out, "source-cache-delta"),
  now,
});
const cacheCount = Number(cacheIndex.counts?.entries || 0);

const receipt = {
  version: 1,
  lane: "card-backfill-amortization-artifact",
  batch_sha256: batchSha,
  telemetry_files: telemetryCount,
  cache_delta_entries: cacheCount,
  cache_merge_counts: cacheIndex.counts,
  cache_entries_sha256: cacheIndex.entries_sha256,
  cache_namespaces: cacheIndex.namespaces,
  shard_ids: [...observedShards].sort(),
  duplicate_request_keys_are_merged_semantically: true,
  rediscovery: false,
  canonical_mutation: false,
};
await mkdir(out, { recursive: true });
await writeFile(join(out, "AMORTIZATION.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(`PASS — collected amortization state for ${batchSha}: telemetry=${telemetryCount} cache_delta=${cacheCount} refreshed=${cacheIndex.counts?.refreshed || 0}`);
