#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { SourceMetadataCache } from "./lib/card-backfill-source-cache.mjs";

const root = await mkdtemp(join(tmpdir(), "card-backfill-amortization-collect-"));
const collector = fileURLToPath(new URL("./card-backfill-amortization-collect.mjs", import.meta.url));
try {
  const shards = join(root, "shards");
  const out = join(root, "out");
  const batch = "a".repeat(64);
  const namespace = "fixture-policy-v3-r1-json-v1";
  const url = "https://example.test/w/api.php?action=query&format=json&titles=K9";
  const body = Buffer.from('{"query":{"pages":[{"title":"K9"}]}}');

  for (const [shard, cachedAt] of [["01", "2026-07-30T00:00:00.000Z"], ["02", "2026-07-30T00:00:01.000Z"]]) {
    const shardRoot = join(shards, `shard-${shard}`);
    const cache = new SourceMetadataCache({ writeRoot: join(shardRoot, "source-cache-delta"), namespace });
    await cache.put({ url, contentType: "application/json", bytes: body, cachedAt });
    await writeFile(join(shardRoot, "source-telemetry.json"), JSON.stringify({
      version: 1,
      lane: "card-backfill-source-amortization-telemetry",
      batch_sha256: batch,
      shard_id: shard,
      items: [{ obligation_id: `UC-${shard}/still`, elapsed_ms: 1, network_requests: 1, network_bytes: body.length, cache_hits: 0, cache_misses: 1 }],
      canonical_mutation: false,
    }, null, 2) + "\n");
  }

  execFileSync(process.execPath, [collector,
    "--shards-root", shards,
    "--out", out,
    "--batch-sha", batch,
    "--now", "2026-07-30T00:01:00.000Z",
  ], { stdio: "inherit" });

  const receipt = JSON.parse(await readFile(join(out, "AMORTIZATION.json"), "utf8"));
  const index = JSON.parse(await readFile(join(out, "source-cache-delta", "INDEX.json"), "utf8"));
  assert.equal(receipt.telemetry_files, 2);
  assert.equal(receipt.cache_delta_entries, 1, "same request key must become one reusable cache entry");
  assert.equal(receipt.duplicate_request_keys_are_merged_semantically, true);
  assert.equal(index.counts.entries, 1);
  assert.equal(index.counts.already_present, 1);
  assert.equal(receipt.canonical_mutation, false);
  console.log("card-backfill amortization collector fixtures: PASS — timestamp-only duplicate request keys merge to one entry");
} finally {
  await rm(root, { recursive: true, force: true });
}
