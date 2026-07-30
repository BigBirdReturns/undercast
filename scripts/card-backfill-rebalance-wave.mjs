#!/usr/bin/env node
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildRetrievalPlan } from "./lib/card-backfill-cohort.mjs";
import {
  amortizationPlanDigest,
  amortizedWaveDigest,
  balanceObligations,
  canonicalJson,
} from "./lib/card-backfill-amortization.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function integerOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
async function exists(path) { try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }

const root = resolve(option("--plan-root"));
const workersPerBatch = integerOption("--workers-per-batch", 4);
const modelPath = resolve(option("--model", ".github/card-backfill/performance/COST-MODEL.json"));
const now = option("--now", new Date().toISOString());
const model = await exists(modelPath) ? await readJson(modelPath) : null;
const wave = await readJson(join(root, "wave.json"));
const selectionWaveSha256 = wave.wave_sha256;
const discoverMatrix = { include: [] };
const batchReceipts = [];

for (const summary of wave.batches || []) {
  const batchRoot = join(root, "batches", summary.batch_sha256);
  const batch = await readJson(join(batchRoot, "batch.json"));
  const workerCount = Math.max(1, Math.min(workersPerBatch, batch.selected_count));
  const shards = balanceObligations(batch.obligations, workerCount, model);
  const oldShards = join(batchRoot, "shards");
  await rm(oldShards, { recursive: true, force: true });
  const covered = [];
  const shardReceipts = [];
  for (const shard of shards) {
    const shardId = String(shard.index + 1).padStart(2, "0");
    const shardBatch = { ...batch, obligations: shard.obligations, selected_count: shard.obligations.length };
    const relativePlan = `batches/${batch.batch_sha256}/shards/shard-${shardId}/retrieval-plan.json`;
    await writeJson(join(root, relativePlan), buildRetrievalPlan(shardBatch, now));
    await writeFile(join(root, `batches/${batch.batch_sha256}/shards/shard-${shardId}/retrieval-facets.txt`), shard.obligations.map((row) => row.obligation_id).join(",") + "\n");
    discoverMatrix.include.push({
      batch_sha256: batch.batch_sha256,
      batch_index: batch.wave_batch_index,
      shard_id: shardId,
      count: shard.obligations.length,
      predicted_cost_ms: shard.predicted_cost,
      plan_path: relativePlan,
    });
    const obligationIds = shard.obligations.map((row) => row.obligation_id);
    shardReceipts.push({ shard_id: shardId, predicted_cost_ms: shard.predicted_cost, obligation_ids: obligationIds });
    covered.push(...obligationIds);
  }
  const expected = batch.obligations.map((row) => row.obligation_id).sort();
  if (canonicalJson([...covered].sort()) !== canonicalJson(expected)) throw new Error(`rebalance coverage drift ${batch.batch_sha256}`);
  batchReceipts.push({
    batch_sha256: batch.batch_sha256,
    selected_count: batch.selected_count,
    workers: shards.length,
    predicted_tail_ms: Math.max(...shards.map((shard) => shard.predicted_cost)),
    shards: shardReceipts,
  });
}

await writeJson(join(root, "discover-matrix.json"), discoverMatrix);
const planBase = {
  version: 1,
  lane: "card-backfill-amortized-wave-plan",
  generated_at: now,
  selection_wave_sha256: selectionWaveSha256,
  source_policy_id: wave.source_policy_id,
  scheduling_algorithm: "deterministic-longest-processing-time",
  cost_model_sha256: model?.model_sha256 || null,
  historical_observations: model?.observation_count || 0,
  discovery_jobs: discoverMatrix.include.length,
  batches: batchReceipts,
  canonical_mutation: false,
};
const amortizationPlanSha256 = amortizationPlanDigest(planBase);
const boundWave = {
  ...wave,
  selection_wave_sha256: selectionWaveSha256,
  amortization_plan_sha256: amortizationPlanSha256,
  cost_model_sha256: model?.model_sha256 || null,
  scheduling_algorithm: "deterministic-longest-processing-time",
};
boundWave.wave_sha256 = amortizedWaveDigest(boundWave);
const receipt = {
  ...planBase,
  wave_sha256: boundWave.wave_sha256,
  amortization_plan_sha256: amortizationPlanSha256,
};
await writeJson(join(root, "wave.json"), boundWave);
await writeJson(join(root, "amortization-plan.json"), receipt);
console.log(`PASS — rebalanced ${boundWave.selected_count} obligations into ${discoverMatrix.include.length} deterministic LPT shard(s)`);
console.log(`MODEL — observations=${receipt.historical_observations} sha=${receipt.cost_model_sha256 || "bootstrap-defaults"}`);
console.log(`BINDING — selection_wave=${selectionWaveSha256} amortization_plan=${amortizationPlanSha256} wave=${boundWave.wave_sha256}`);
