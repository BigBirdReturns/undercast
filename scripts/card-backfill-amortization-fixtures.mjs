#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  amortizationPlanDigest,
  amortizedWaveDigest,
  balanceObligations,
  buildCostModel,
  canonicalJson,
  estimateObligationCost,
  moduloShardCost,
  validateAmortizationContract,
  validateAmortizedWaveBinding,
} from "./lib/card-backfill-amortization.mjs";
import { SourceMetadataCache, mergeSourceCacheDeltas } from "./lib/card-backfill-source-cache.mjs";
import { reducePerformanceObservations } from "./lib/card-backfill-performance.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = validateAmortizationContract(JSON.parse(await readFile(join(repositoryRoot, ".github/CARD-BACKFILL-AMORTIZATION.json"), "utf8")));
assert.equal(contract.canonical_mutation, false);
assert.equal(contract.cache.maximum_age_hours, 24);

await import("./card-backfill-source-policy-v3-fixtures.mjs");
await import("./card-backfill-source-policy-v4-fixtures.mjs");
await import("./card-backfill-source-policy-v3-live-regressions.mjs");
await import("./card-backfill-local-desk-law-fixtures.mjs");
const imageFeatureFixtureOutput = execFileSync(
  process.env.PYTHON || "python3",
  [join(repositoryRoot, "scripts/card-backfill-image-features-fixtures.py")],
  { cwd: repositoryRoot, encoding: "utf8" },
).trim();
if (imageFeatureFixtureOutput) console.log(imageFeatureFixtureOutput);

const rows = Array.from({ length: 40 }, (_, index) => ({
  obligation_id: `UC-${String(index + 1).padStart(3, "0")}/still`,
  side: "still",
  cohort_key: "still::voice-or-animation::mediawiki-bound-multicandidate-v3::canonical-link-only::character-depiction",
  shape: { side: "still", source_route: "mediawiki-bound-multicandidate-v3", performance_mode: "voice-or-animation" },
}));
const observations = rows.map((row, index) => ({
  obligation_id: row.obligation_id,
  cohort_key: row.cohort_key,
  side: row.side,
  source_route: row.shape.source_route,
  performance_mode: row.shape.performance_mode,
  elapsed_ms: index % 4 === 0 ? 10_000 : 1_000,
  network_requests: index % 4 === 0 ? 20 : 2,
  cache_hits: index % 4 === 0 ? 0 : 2,
}));
const model = buildCostModel({ observations, now: "2026-07-30T00:00:00.000Z" });
const modelAgain = buildCostModel({ observations: [...observations].reverse(), now: "2026-07-31T00:00:00.000Z" });
assert.equal(model.model_sha256, modelAgain.model_sha256, "same retained observations must produce the same cost-model digest");
assert.equal(model.observation_set_sha256, modelAgain.observation_set_sha256);
const modulo = moduloShardCost(rows, 4, model);
const balanced = balanceObligations(rows, 4, model);
const balancedAgain = balanceObligations(rows, 4, model);
assert.deepEqual(balanced, balancedAgain, "cost balancing must be deterministic");
assert.equal(new Set(balanced.flatMap((shard) => shard.obligations.map((row) => row.obligation_id))).size, 40);
assert(Math.max(...balanced.map((shard) => shard.predicted_cost)) < Math.max(...modulo), "LPT balancing must beat modulo on a skewed workload");
assert.equal(estimateObligationCost(rows[0], model), 10_000);
assert.equal(model.observation_count, 40);

const shardPlanBase = {
  version: 1,
  lane: "card-backfill-amortized-wave-plan",
  generated_at: "2026-07-30T00:00:00.000Z",
  selection_wave_sha256: "1".repeat(64),
  source_policy_id: "card-backfill-policy-v3-wave-1",
  scheduling_algorithm: "deterministic-longest-processing-time",
  cost_model_sha256: model.model_sha256,
  historical_observations: 40,
  discovery_jobs: 4,
  batches: [{
    batch_sha256: "2".repeat(64),
    selected_count: 40,
    workers: 4,
    predicted_tail_ms: Math.max(...balanced.map((row) => row.predicted_cost)),
    shards: balanced.map((shard) => ({ shard_id: String(shard.index + 1).padStart(2, "0"), predicted_cost_ms: shard.predicted_cost, obligation_ids: shard.obligations.map((row) => row.obligation_id) })),
  }],
  canonical_mutation: false,
};
const planSha = amortizationPlanDigest(shardPlanBase);
const wave = {
  version: 1,
  lane: "card-backfill-source-v3-wave",
  campaign_id: "fixture",
  estate_sha256: "3".repeat(64),
  source_estate_sha256: "4".repeat(64),
  exclusion_state_sha256: "5".repeat(64),
  source_policy_id: "card-backfill-policy-v3-wave-1",
  source_policy_version: 3,
  source_policy_revision: 1,
  lessons_contract_sha256: "6".repeat(64),
  selection_wave_sha256: shardPlanBase.selection_wave_sha256,
  amortization_plan_sha256: planSha,
  cost_model_sha256: model.model_sha256,
  scheduling_algorithm: "deterministic-longest-processing-time",
  wave_batches: 1,
  selected_count: 40,
  disjoint_obligation_ids: rows.map((row) => row.obligation_id).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  batches: [{ batch_sha256: "2".repeat(64), obligations: rows, artifact_only: true, canonical_mutation: false, source_policy_id: "card-backfill-policy-v3-wave-1", lessons_contract_sha256: "6".repeat(64) }],
  artifact_only: true,
  canonical_mutation: false,
};
wave.wave_sha256 = amortizedWaveDigest(wave);
const plan = { ...shardPlanBase, wave_sha256: wave.wave_sha256, amortization_plan_sha256: planSha };
validateAmortizedWaveBinding(wave, plan);
const brokenPlan = structuredClone(plan);
brokenPlan.batches[0].shards[0].obligation_ids[0] = rows[1].obligation_id;
assert.throws(() => validateAmortizedWaveBinding(wave, brokenPlan), /digest drift|assignment drift/);

const root = await mkdtemp(join(tmpdir(), "card-backfill-amortization-"));
try {
  const deltaA = join(root, "delta-a");
  const deltaB = join(root, "delta-b");
  const deltaC = join(root, "delta-c");
  const merged = join(root, "merged");
  const namespace = "card-backfill-policy-v3-wave-1-r1-json-v1";
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&titles=K9";
  const nowMs = Date.parse("2026-07-30T12:00:00.000Z");
  const first = new SourceMetadataCache({ writeRoot: deltaA, namespace, now: () => nowMs });
  assert.equal(await first.get(url), null);
  await first.put({ url, contentType: "application/json; charset=utf-8", bytes: Buffer.from('{"query":{"pages":[]}}'), cachedAt: "2026-07-30T11:00:00.000Z" });
  assert.equal(first.snapshot().writes, 1);
  await mergeSourceCacheDeltas({ inputRoot: deltaA, outputRoot: merged, now: "2026-07-30T12:01:00.000Z" });
  const second = new SourceMetadataCache({ readRoot: merged, writeRoot: deltaB, namespace, now: () => nowMs });
  const hit = await second.get(url);
  assert(hit?.cache_hit);
  assert.equal(hit.bytes.toString("utf8"), '{"query":{"pages":[]}}');
  assert.equal(second.snapshot().hits, 1);

  const expired = new SourceMetadataCache({ readRoot: merged, writeRoot: deltaC, namespace, maximumAgeMs: 1_000, now: () => nowMs });
  assert.equal(await expired.get(url), null, "expired metadata must return to source transport");
  assert.equal(expired.snapshot().expired, 1);
  await expired.put({ url, contentType: "application/json", bytes: Buffer.from('{"query":{"pages":[{"title":"K9"}]}}'), cachedAt: "2026-07-30T12:00:00.000Z" });
  const refreshed = await mergeSourceCacheDeltas({ inputRoot: deltaC, outputRoot: merged, now: "2026-07-30T12:02:00.000Z" });
  assert.equal(refreshed.counts.refreshed, 1);
  const afterRefresh = new SourceMetadataCache({ readRoot: merged, namespace, now: () => nowMs });
  assert.equal((await afterRefresh.get(url)).bytes.toString("utf8"), '{"query":{"pages":[{"title":"K9"}]}}');
  const index = JSON.parse(await readFile(join(merged, "INDEX.json"), "utf8"));
  assert.equal(index.counts.entries, 1);
  assert.equal(index.canonical_mutation, false);

  const performanceRoot = join(root, "performance");
  const resultsRoot = join(root, "results");
  await mkdir(join(resultsRoot, "one"), { recursive: true });
  const performanceWave = {
    wave_sha256: "9".repeat(64), source_policy_id: "p", source_policy_version: 3, source_policy_revision: 1,
    amortization_plan_sha256: "8".repeat(64), selected_count: 2,
    batches: [{ batch_sha256: "7".repeat(64), cohort_key: "c", obligations: [rows[0], rows[1]] }],
  };
  await import("node:fs/promises").then(({ writeFile }) => writeFile(join(resultsRoot, "one", "source-telemetry.json"), JSON.stringify({
    lane: "card-backfill-source-amortization-telemetry",
    items: [
      { obligation_id: rows[0].obligation_id, elapsed_ms: 1000, network_requests: 1, network_bytes: 100, cache_hits: 0, cache_misses: 1 },
      { obligation_id: rows[1].obligation_id, elapsed_ms: 2000, network_requests: 2, network_bytes: 200, cache_hits: 1, cache_misses: 1 },
    ],
  }) + "\n"));
  const reducedOnce = await reducePerformanceObservations({ wave: performanceWave, resultsRoot, performanceRoot, now: "2026-07-30T13:00:00.000Z" });
  const firstModelBytes = await readFile(join(performanceRoot, "COST-MODEL.json"), "utf8");
  const reducedTwice = await reducePerformanceObservations({ wave: performanceWave, resultsRoot, performanceRoot, now: "2026-07-31T13:00:00.000Z" });
  const secondModelBytes = await readFile(join(performanceRoot, "COST-MODEL.json"), "utf8");
  assert.equal(reducedOnce.model.model_sha256, reducedTwice.model.model_sha256);
  assert.equal(firstModelBytes, secondModelBytes, "replaying the same wave must not churn the cost-model bytes");
} finally {
  await rm(root, { recursive: true, force: true });
}

const files = {
  workflow: await readFile(join(repositoryRoot, ".github/workflows/card-backfill-amortized-wave.yml"), "utf8"),
  stageResume: await readFile(join(repositoryRoot, ".github/workflows/card-backfill-amortized-resume-after-staging.yml"), "utf8"),
  publicationResume: await readFile(join(repositoryRoot, ".github/workflows/card-backfill-source-v2-resume.yml"), "utf8"),
  runtime: await readFile(join(repositoryRoot, ".github/actions/card-backfill-runtime/action.yml"), "utf8"),
  gate: await readFile(join(repositoryRoot, "scripts/gate.mjs"), "utf8"),
};
for (const needle of [
  "actions/cache/restore@v4",
  "actions/cache/save@v4",
  "card-backfill-source-v2-cached.mjs",
  "card-backfill-ready-decision-barrier.mjs",
  "card-backfill-wave-reduce-amortized.mjs",
  "card-backfill-local-adjudicate.mjs",
  "--amortization-plan",
  "rediscovery:false",
]) assert(files.workflow.includes(needle), `amortized workflow guard missing ${needle}`);
assert(files.runtime.includes("profile=\"$REQUESTED_PROFILE\""));
assert(files.runtime.includes("discover) profile=discovery"));
assert(files.runtime.includes("packages+=(imagemagick)"));
assert(files.runtime.includes("opencv-python-headless==4.10.0.84"));
assert(files.runtime.includes("numpy==1.26.4"));
assert(files.runtime.includes("--break-system-packages"));
assert(files.runtime.includes("pinned headless OpenCV"));
assert(!files.runtime.includes("packages+=(python3-opencv)"));
assert(!files.runtime.includes("packages+=(opencv-data)"));
assert(files.runtime.includes("packages+=(tesseract-ocr)"));
assert(files.runtime.includes("lean discovery runtime omits OpenCV, NumPy, cascade data, and Tesseract"));
assert(files.runtime.includes('sudo apt-get install -y "${packages[@]}"'));
assert(!files.workflow.includes("card-backfill-machine-adjudicate.mjs"));
assert(!files.workflow.includes("models: read"));
assert(files.stageResume.includes("card-backfill-amortized-wave.yml"));
assert(files.publicationResume.includes("card-backfill-amortized-wave.yml") && !files.publicationResume.includes("card-backfill-source-v2-autonomous.yml"));
assert(files.gate.includes("Card backfill amortization fixtures"));
assert(await stat(join(repositoryRoot, ".github/CARD-BACKFILL-AMORTIZATION-ACTIVE.json")));

console.log(`card-backfill amortization fixtures: PASS — LPT ${canonicalJson(balanced.map((row) => row.predicted_cost))} beats modulo ${canonicalJson(modulo)}; cache expires and refreshes; shard plan and recovery wiring are digest-bound`);
