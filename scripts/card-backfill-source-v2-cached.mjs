#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";
import { SourceMetadataCache, isCacheableJsonRequest } from "./lib/card-backfill-source-cache.mjs";

const raw = process.argv.slice(2);
function option(name, fallback = null) {
  const index = raw.indexOf(name);
  if (index < 0) return fallback;
  const value = raw[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function numeric(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

const wrapperOptions = new Set([
  "--cache-root", "--cache-write-root", "--cache-namespace", "--cache-stats-out", "--telemetry-out",
  "--network-delay-ms", "--cache-max-age-ms", "--batch-sha", "--shard-id", "--source-script",
]);
const forwarded = [];
for (let index = 0; index < raw.length; index += 1) {
  const arg = raw[index];
  if (wrapperOptions.has(arg)) { index += 1; continue; }
  if (arg === "--delay-ms") { index += 1; continue; }
  forwarded.push(arg);
}
forwarded.push("--delay-ms", "0");

const cacheRoot = option("--cache-root", null);
const cacheWriteRoot = option("--cache-write-root", null);
const policyId = CARD_BACKFILL_SOURCE_POLICY_V2.policy_id || `card-backfill-policy-v${CARD_BACKFILL_SOURCE_POLICY_V2.version}`;
const policyRevision = CARD_BACKFILL_SOURCE_POLICY_V2.revision ?? 0;
const cacheNamespace = option("--cache-namespace", `${policyId}-r${policyRevision}-json-v1`);
const statsPath = option("--cache-stats-out", null);
const telemetryPath = option("--telemetry-out", null);
const batchSha = option("--batch-sha", null);
const shardId = option("--shard-id", null);
const networkDelayMs = numeric("--network-delay-ms", 350);
const cacheMaximumAgeMs = numeric("--cache-max-age-ms", 24 * 60 * 60 * 1000);
const sourceScript = resolve(option("--source-script", new URL("./card-backfill-source-v2.mjs", import.meta.url).pathname));
const planPath = option("--plan", null);
const plan = planPath ? JSON.parse(readFileSync(resolve(planPath), "utf8")) : { candidates: [] };
const ordered = (plan.candidates || []).map((row) => row.obligation_id || `${row.wall_id}/${row.side}`);

const cache = new SourceMetadataCache({ readRoot: cacheRoot, writeRoot: cacheWriteRoot, namespace: cacheNamespace, maximumAgeMs: cacheMaximumAgeMs });
const nativeFetch = globalThis.fetch.bind(globalThis);
const lastNetworkAt = new Map();
const startedAt = performance.now();
let firstFetchAt = null;
let currentIndex = 0;
const items = new Map();
const aggregate = { network_requests: 0, network_bytes: 0, cache_hits: 0, cache_misses: 0, cache_writes: 0 };

function currentId() { return ordered[currentIndex] || `unbound-${currentIndex + 1}`; }
function currentTelemetry() {
  const id = currentId();
  if (!items.has(id)) items.set(id, { obligation_id: id, started_at_ms: performance.now(), network_requests: 0, network_bytes: 0, cache_hits: 0, cache_misses: 0, cache_writes: 0 });
  return items.get(id);
}
async function throttle(url) {
  if (!networkDelayMs) return;
  let host = "unknown";
  try { host = new URL(String(url)).host || host; } catch {}
  const prior = lastNetworkAt.get(host) || 0;
  const wait = Math.max(0, networkDelayMs - (Date.now() - prior));
  if (wait) await new Promise((resolvePromise) => setTimeout(resolvePromise, wait));
  lastNetworkAt.set(host, Date.now());
}

async function cachedFetch(input, init = {}) {
  if (firstFetchAt === null) firstFetchAt = performance.now();
  const url = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
  const headers = new Headers(init.headers || (typeof input === "object" ? input.headers : undefined));
  const accept = headers.get("accept") || "application/json";
  const item = currentTelemetry();
  if (isCacheableJsonRequest(input, init)) {
    const hit = await cache.get(url, accept);
    if (hit) {
      item.cache_hits += 1; aggregate.cache_hits += 1;
      return new Response(hit.bytes, { status: hit.entry.status, headers: { "content-type": hit.entry.content_type, "x-undercast-source-cache": "hit" } });
    }
    item.cache_misses += 1; aggregate.cache_misses += 1;
  }
  await throttle(url);
  const response = await nativeFetch(input, init);
  item.network_requests += 1; aggregate.network_requests += 1;
  if (isCacheableJsonRequest(input, init)) {
    const clone = response.clone();
    const bytes = Buffer.from(await clone.arrayBuffer());
    item.network_bytes += bytes.length; aggregate.network_bytes += bytes.length;
    const write = await cache.put({
      url,
      accept,
      resolvedUrl: response.url || url,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      bytes,
    });
    if (write && !write.already_present) { item.cache_writes += 1; aggregate.cache_writes += 1; }
  }
  return response;
}
globalThis.fetch = cachedFetch;

const nativeLog = console.log.bind(console);
console.log = (...values) => {
  nativeLog(...values);
  const text = values.map(String).join(" ");
  const match = text.match(/^(?:CANDIDATE|MISS)\s+(UC-\d+\/(?:still|portrait))\b/);
  if (!match) return;
  const id = match[1];
  const item = items.get(id) || currentTelemetry();
  item.completed_at_ms = performance.now();
  item.elapsed_ms = Math.max(1, Math.round(item.completed_at_ms - item.started_at_ms));
  item.result = text.startsWith("CANDIDATE") ? "candidate" : "not-found";
  currentIndex = Math.min(currentIndex + 1, ordered.length);
};

let written = false;
function writeReceipts() {
  if (written) return;
  written = true;
  const cacheStats = cache.snapshot();
  const completed = [...items.values()].map((row) => ({
    obligation_id: row.obligation_id,
    elapsed_ms: row.elapsed_ms || Math.max(1, Math.round(performance.now() - row.started_at_ms)),
    network_requests: row.network_requests,
    network_bytes: row.network_bytes,
    cache_hits: row.cache_hits,
    cache_misses: row.cache_misses,
    cache_writes: row.cache_writes,
    result: row.result || "interrupted",
  }));
  const receipt = {
    version: 1,
    lane: "card-backfill-source-amortization-telemetry",
    batch_sha256: batchSha,
    shard_id: shardId,
    source_policy_id: policyId,
    source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version,
    source_policy_revision: policyRevision,
    cache_namespace: cacheNamespace,
    cache_maximum_age_ms: cacheMaximumAgeMs,
    setup_ms: Math.max(0, Math.round((firstFetchAt ?? performance.now()) - startedAt)),
    elapsed_ms: Math.max(1, Math.round(performance.now() - startedAt)),
    counts: { planned: ordered.length, observed: completed.length, ...aggregate },
    estimated_network_delay_saved_ms: aggregate.cache_hits * networkDelayMs,
    items: completed,
    cache: cacheStats,
    rediscovery: false,
    canonical_mutation: false,
  };
  for (const [path, value] of [[statsPath, { ...cacheStats, network: aggregate, canonical_mutation: false }], [telemetryPath, receipt]]) {
    if (!path) continue;
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(resolve(path), JSON.stringify(value, null, 2) + "\n");
  }
}
process.on("beforeExit", writeReceipts);
process.on("exit", writeReceipts);

process.argv = [process.argv[0], sourceScript, ...forwarded];
nativeLog(`AMORTIZE cache_namespace=${cacheNamespace} cache_max_age_ms=${cacheMaximumAgeMs} network_delay_on_miss_ms=${networkDelayMs} metadata_cache=${Boolean(cacheRoot || cacheWriteRoot)}`);
await import(pathToFileURL(sourceScript).href);
