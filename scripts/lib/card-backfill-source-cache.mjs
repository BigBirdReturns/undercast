import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export const CARD_BACKFILL_SOURCE_CACHE_VERSION = 1;
export const CARD_BACKFILL_SOURCE_CACHE_LANE = "card-backfill-source-json-cache-entry";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function cacheRequestKey({ namespace, url, accept = "application/json" }) {
  if (!namespace || !url) throw new Error("cache namespace and url are required");
  return sha256(`${namespace}\nGET\n${String(url)}\n${String(accept).toLowerCase()}`);
}

export function isCacheableJsonRequest(input, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  if (method !== "GET") return false;
  const url = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
  const headers = new Headers(init.headers || (typeof input === "object" ? input.headers : undefined));
  const accept = String(headers.get("accept") || "").toLowerCase();
  return accept.includes("application/json") || /\/(?:w\/)?api\.php(?:\?|$)/i.test(url);
}

function entryPath(root, key) {
  return join(resolve(root), "entries", `${key}.json`);
}

async function exists(path) {
  try { return (await stat(path)).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function validateEntry(entry, { namespace = null, key = null } = {}) {
  if (entry?.version !== CARD_BACKFILL_SOURCE_CACHE_VERSION || entry?.lane !== CARD_BACKFILL_SOURCE_CACHE_LANE) throw new Error("invalid source-cache entry identity");
  if (!entry.namespace || !entry.requested_url || !entry.body_base64 || !/^[0-9a-f]{64}$/i.test(entry.body_sha256 || "") || !Number.isFinite(Date.parse(entry.cached_at || ""))) throw new Error("incomplete source-cache entry");
  if (namespace && entry.namespace !== namespace) throw new Error("source-cache namespace drift");
  const computedKey = cacheRequestKey({ namespace: entry.namespace, url: entry.requested_url, accept: entry.accept });
  if (key && computedKey !== key) throw new Error("source-cache request key drift");
  const bytes = Buffer.from(entry.body_base64, "base64");
  if (sha256(bytes) !== entry.body_sha256 || bytes.length !== entry.bytes) throw new Error("source-cache body custody drift");
  return { entry, bytes, key: computedKey };
}

export class SourceMetadataCache {
  constructor({ readRoot = null, writeRoot = null, namespace, maximumEntryBytes = 2_000_000, maximumAgeMs = 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    if (!namespace) throw new Error("source-cache namespace is required");
    this.readRoot = readRoot ? resolve(readRoot) : null;
    this.writeRoot = writeRoot ? resolve(writeRoot) : null;
    this.namespace = namespace;
    this.maximumEntryBytes = maximumEntryBytes;
    this.maximumAgeMs = maximumAgeMs;
    this.now = now;
    this.stats = { hits: 0, misses: 0, writes: 0, rejected_writes: 0, read_errors: 0, expired: 0 };
  }

  async get(url, accept = "application/json") {
    const key = cacheRequestKey({ namespace: this.namespace, url, accept });
    const roots = [...new Set([this.writeRoot, this.readRoot].filter(Boolean))];
    for (const root of roots) {
      const path = entryPath(root, key);
      if (!(await exists(path))) continue;
      try {
        const entry = JSON.parse(await readFile(path, "utf8"));
        const validated = validateEntry(entry, { namespace: this.namespace, key });
        if (this.maximumAgeMs >= 0 && this.now() - Date.parse(entry.cached_at) > this.maximumAgeMs) {
          this.stats.expired += 1;
          continue;
        }
        this.stats.hits += 1;
        return { ...validated, path, cache_hit: true };
      } catch {
        this.stats.read_errors += 1;
      }
    }
    this.stats.misses += 1;
    return null;
  }

  async put({ url, accept = "application/json", resolvedUrl = null, status = 200, contentType = "application/json", bytes, cachedAt = new Date().toISOString() }) {
    if (!this.writeRoot) return null;
    const body = Buffer.from(bytes);
    if (!body.length || body.length > this.maximumEntryBytes || status < 200 || status >= 300 || !/json/i.test(contentType)) {
      this.stats.rejected_writes += 1;
      return null;
    }
    const key = cacheRequestKey({ namespace: this.namespace, url, accept });
    const path = entryPath(this.writeRoot, key);
    const entry = {
      version: CARD_BACKFILL_SOURCE_CACHE_VERSION,
      lane: CARD_BACKFILL_SOURCE_CACHE_LANE,
      namespace: this.namespace,
      request_key: key,
      requested_url: String(url),
      resolved_url: String(resolvedUrl || url),
      accept: String(accept).toLowerCase(),
      status,
      content_type: contentType,
      bytes: body.length,
      body_sha256: sha256(body),
      body_base64: body.toString("base64"),
      cached_at: cachedAt,
      canonical_mutation: false,
    };
    validateEntry(entry, { namespace: this.namespace, key });
    await mkdir(dirname(path), { recursive: true });
    if (await exists(path)) {
      const prior = JSON.parse(await readFile(path, "utf8"));
      const validated = validateEntry(prior, { namespace: this.namespace, key });
      if (validated.entry.body_sha256 !== entry.body_sha256) throw new Error(`source-cache collision for ${key}`);
      return { key, path, entry: prior, already_present: true };
    }
    await writeFile(path, JSON.stringify(entry, null, 2) + "\n");
    this.stats.writes += 1;
    return { key, path, entry, already_present: false };
  }

  snapshot() {
    return { ...this.stats, namespace: this.namespace, canonical_mutation: false };
  }
}

async function findEntryFiles(root, current = root, out = []) {
  let entries = [];
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return out; throw error; }
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await findEntryFiles(root, path, out);
    else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "INDEX.json") out.push(path);
  }
  return out;
}

export async function mergeSourceCacheDeltas({ inputRoot, outputRoot, now = new Date().toISOString() }) {
  const sourceRoot = resolve(inputRoot);
  const destinationRoot = resolve(outputRoot);
  await mkdir(join(destinationRoot, "entries"), { recursive: true });
  const files = await findEntryFiles(sourceRoot);
  let added = 0, alreadyPresent = 0, refreshed = 0, ignored = 0;
  const namespaces = new Set();
  for (const file of files.sort()) {
    let parsed;
    try { parsed = JSON.parse(await readFile(file, "utf8")); }
    catch { ignored += 1; continue; }
    if (parsed?.lane !== CARD_BACKFILL_SOURCE_CACHE_LANE) { ignored += 1; continue; }
    const validated = validateEntry(parsed);
    namespaces.add(parsed.namespace);
    const destination = entryPath(destinationRoot, validated.key);
    if (await exists(destination)) {
      const prior = validateEntry(JSON.parse(await readFile(destination, "utf8")), { key: validated.key });
      if (prior.entry.body_sha256 === parsed.body_sha256) {
        alreadyPresent += 1;
        continue;
      }
      const priorAt = Date.parse(prior.entry.cached_at);
      const incomingAt = Date.parse(parsed.cached_at);
      if (incomingAt === priorAt) throw new Error(`source-cache same-time content collision ${validated.key}`);
      if (incomingAt < priorAt) { alreadyPresent += 1; continue; }
      await copyFile(file, destination);
      refreshed += 1;
      continue;
    }
    await copyFile(file, destination);
    added += 1;
  }
  const mergedFiles = await findEntryFiles(destinationRoot);
  const rows = [];
  for (const file of mergedFiles.sort()) {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (parsed?.lane !== CARD_BACKFILL_SOURCE_CACHE_LANE) continue;
    const validated = validateEntry(parsed);
    rows.push({ key: validated.key, namespace: parsed.namespace, body_sha256: parsed.body_sha256, bytes: parsed.bytes });
  }
  const indexBody = {
    version: 1,
    lane: "card-backfill-source-json-cache-index",
    updated_at: now,
    counts: { entries: rows.length, added, refreshed, already_present: alreadyPresent, ignored },
    namespaces: [...new Set(rows.map((row) => row.namespace))].sort(),
    entries_sha256: sha256(JSON.stringify(rows)),
    canonical_mutation: false,
  };
  await writeFile(join(destinationRoot, "INDEX.json"), JSON.stringify(indexBody, null, 2) + "\n");
  return indexBody;
}
