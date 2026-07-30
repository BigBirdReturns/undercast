import { createHash } from "node:crypto";

export const CARD_BACKFILL_AMORTIZATION_VERSION = 1;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}
export function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function natural(left, right) { return String(left).localeCompare(String(right), undefined, { numeric: true }); }
function finitePositive(value, fallback = null) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }

export function validateAmortizationContract(contract) {
  if (contract?.version !== CARD_BACKFILL_AMORTIZATION_VERSION || contract?.lane !== "card-backfill-amortization") throw new Error("invalid amortization contract identity");
  if (contract.canonical_mutation !== false) throw new Error("amortization contract canonical mutation drift");
  if (contract.scheduling?.algorithm !== "deterministic-longest-processing-time") throw new Error("amortization scheduling algorithm drift");
  if (contract.cache?.json_metadata_only !== true || contract.cache?.binary_objects_committed !== false) throw new Error("amortization cache boundary drift");
  if (Number(contract.cache?.maximum_age_hours) !== 24) throw new Error("amortization cache freshness drift");
  if (contract.scheduling?.exact_shard_assignment_is_digest_bound !== true) throw new Error("amortization shard binding drift");
  if (contract.recovery?.rediscovery_after_downstream_failure !== false) throw new Error("amortization recovery drift");
  if (contract.telemetry?.per_obligation_cost_observation !== true || contract.telemetry?.cost_model_is_idempotent_for_same_observation_set !== true) throw new Error("amortization telemetry drift");
  return contract;
}

function observationCost(row) {
  const elapsed = finitePositive(row?.elapsed_ms, 0);
  const network = finitePositive(row?.network_requests, 0);
  const bytes = finitePositive(row?.network_bytes, 0);
  return Math.max(1, elapsed || network * 350 + bytes / 100_000);
}

function aggregate(rows, keyFn) {
  const buckets = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const values = buckets.get(key) || [];
    values.push(observationCost(row));
    buckets.set(key, values);
  }
  const out = {};
  for (const [key, values] of [...buckets.entries()].sort(([a], [b]) => natural(a, b))) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const p75Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1);
    out[key] = {
      observations: sorted.length,
      median_cost: Math.round(median),
      p75_cost: Math.round(sorted[p75Index]),
      mean_cost: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    };
  }
  return out;
}

export function buildCostModel({ observations = [], now = new Date().toISOString() } = {}) {
  const usable = observations.filter((row) => row?.obligation_id && finitePositive(row?.elapsed_ms, null));
  const byObligation = aggregate(usable, (row) => row.obligation_id);
  const byCohort = aggregate(usable, (row) => row.cohort_key);
  const byShape = aggregate(usable, (row) => [row.side, row.source_route, row.performance_mode].filter(Boolean).join("::"));
  const costs = usable.map(observationCost).sort((a, b) => a - b);
  const globalMedian = costs.length ? costs[Math.floor(costs.length / 2)] : 1000;
  const globalP75 = costs.length ? costs[Math.min(costs.length - 1, Math.ceil(costs.length * 0.75) - 1)] : 1000;
  const observationSet = usable.map((row) => ({
    obligation_id: row.obligation_id,
    cohort_key: row.cohort_key || null,
    side: row.side || null,
    source_route: row.source_route || null,
    performance_mode: row.performance_mode || null,
    elapsed_ms: Math.round(Number(row.elapsed_ms)),
    network_requests: Math.round(Number(row.network_requests || 0)),
    network_bytes: Math.round(Number(row.network_bytes || 0)),
    cache_hits: Math.round(Number(row.cache_hits || 0)),
    cache_misses: Math.round(Number(row.cache_misses || 0)),
  })).sort((a, b) => natural(a.obligation_id, b.obligation_id) || natural(a.cohort_key, b.cohort_key));
  const body = {
    version: CARD_BACKFILL_AMORTIZATION_VERSION,
    lane: "card-backfill-cost-model",
    updated_at: now,
    observation_count: usable.length,
    global_median_cost: Math.round(globalMedian),
    global_p75_cost: Math.round(globalP75),
    observation_set_sha256: sha256(canonicalJson(observationSet)),
    by_obligation: byObligation,
    by_cohort: byCohort,
    by_shape: byShape,
    canonical_mutation: false,
  };
  return { ...body, model_sha256: sha256(canonicalJson({ ...body, updated_at: null })) };
}

export function amortizationPlanDigest(plan) {
  const body = {
    version: plan.version,
    lane: plan.lane,
    selection_wave_sha256: plan.selection_wave_sha256,
    source_policy_id: plan.source_policy_id,
    scheduling_algorithm: plan.scheduling_algorithm,
    cost_model_sha256: plan.cost_model_sha256 || null,
    historical_observations: Number(plan.historical_observations || 0),
    discovery_jobs: Number(plan.discovery_jobs || 0),
    batches: plan.batches || [],
    canonical_mutation: false,
  };
  return sha256(canonicalJson(body));
}

export function amortizedWaveDigest(wave) {
  const body = {
    campaign_id: wave.campaign_id,
    estate_sha256: wave.estate_sha256,
    source_estate_sha256: wave.source_estate_sha256,
    exclusion_state_sha256: wave.exclusion_state_sha256,
    source_policy_id: wave.source_policy_id,
    source_policy_version: wave.source_policy_version,
    source_policy_revision: wave.source_policy_revision,
    lessons_contract_sha256: wave.lessons_contract_sha256,
    selection_wave_sha256: wave.selection_wave_sha256,
    amortization_plan_sha256: wave.amortization_plan_sha256,
    cost_model_sha256: wave.cost_model_sha256 || null,
    scheduling_algorithm: wave.scheduling_algorithm,
    batch_sha256s: (wave.batches || []).map((batch) => batch.batch_sha256),
    disjoint_obligation_ids: wave.disjoint_obligation_ids || [],
  };
  return sha256(canonicalJson(body));
}

export function validateAmortizedWaveBinding(wave, plan) {
  if (plan?.version !== 1 || plan?.lane !== "card-backfill-amortized-wave-plan" || plan?.canonical_mutation !== false) throw new Error("invalid amortization plan identity");
  if (!wave?.selection_wave_sha256 || !wave?.amortization_plan_sha256 || wave?.scheduling_algorithm !== "deterministic-longest-processing-time") throw new Error("wave lacks amortization binding");
  const planSha = amortizationPlanDigest(plan);
  if (plan.amortization_plan_sha256 !== planSha || wave.amortization_plan_sha256 !== planSha) throw new Error("amortization plan digest drift");
  if (plan.selection_wave_sha256 !== wave.selection_wave_sha256 || plan.wave_sha256 !== wave.wave_sha256) throw new Error("amortization wave lineage drift");
  if (wave.wave_sha256 !== amortizedWaveDigest(wave)) throw new Error("amortized wave digest drift");
  const planned = (plan.batches || []).flatMap((batch) => (batch.shards || []).flatMap((shard) => shard.obligation_ids || [])).sort(natural);
  const selected = [...(wave.disjoint_obligation_ids || [])].sort(natural);
  if (canonicalJson(planned) !== canonicalJson(selected) || new Set(planned).size !== planned.length) throw new Error("amortization shard assignment drift");
  return { wave, plan };
}

function defaultCost(row) {
  const route = String(row?.shape?.source_route || row?.cohort_key || "");
  const side = String(row?.side || row?.shape?.side || "");
  let cost = side === "portrait" ? 900 : 1300;
  if (/open-web/i.test(route)) cost *= 1.8;
  else if (/commons/i.test(route)) cost *= 1.25;
  else if (/mediawiki/i.test(route)) cost *= 1.45;
  if (/voice-or-animation/i.test(String(row?.shape?.performance_mode || row?.cohort_key || ""))) cost *= 1.15;
  const priorCount = Number(row?.retry_of_attempt_count || row?.prior_attempts?.length || 0);
  if (priorCount > 1) cost *= Math.min(1.5, 1 + priorCount * 0.08);
  return Math.round(cost);
}

export function estimateObligationCost(row, model = null) {
  const exact = finitePositive(model?.by_obligation?.[row.obligation_id]?.p75_cost, null)
    || finitePositive(model?.by_obligation?.[row.obligation_id]?.median_cost, null);
  if (exact) return exact;
  const cohort = finitePositive(model?.by_cohort?.[row.cohort_key]?.p75_cost, null)
    || finitePositive(model?.by_cohort?.[row.cohort_key]?.median_cost, null);
  if (cohort) return cohort;
  const shapeKey = [row.side || row.shape?.side, row.shape?.source_route, row.shape?.performance_mode].filter(Boolean).join("::");
  const shape = finitePositive(model?.by_shape?.[shapeKey]?.p75_cost, null)
    || finitePositive(model?.by_shape?.[shapeKey]?.median_cost, null);
  if (shape) return shape;
  return finitePositive(model?.global_p75_cost, null) || finitePositive(model?.global_median_cost, null) || defaultCost(row);
}

export function balanceObligations(rows, workerCount, model = null) {
  const workers = Number(workerCount);
  if (!Number.isInteger(workers) || workers < 1) throw new Error(`invalid worker count ${workerCount}`);
  const seen = new Set();
  const weighted = (rows || []).map((row) => {
    if (!row?.obligation_id) throw new Error("obligation id is required for balancing");
    if (seen.has(row.obligation_id)) throw new Error(`duplicate obligation ${row.obligation_id}`);
    seen.add(row.obligation_id);
    return { row, cost: estimateObligationCost(row, model) };
  }).sort((a, b) => b.cost - a.cost || natural(a.row.obligation_id, b.row.obligation_id));
  const shards = Array.from({ length: Math.min(workers, Math.max(1, weighted.length)) }, (_, index) => ({ index, predicted_cost: 0, obligations: [] }));
  for (const item of weighted) {
    shards.sort((a, b) => a.predicted_cost - b.predicted_cost || a.obligations.length - b.obligations.length || a.index - b.index);
    const shard = shards[0];
    shard.obligations.push(item.row);
    shard.predicted_cost += item.cost;
  }
  shards.sort((a, b) => a.index - b.index);
  const ids = shards.flatMap((shard) => shard.obligations.map((row) => row.obligation_id));
  if (ids.length !== rows.length || new Set(ids).size !== ids.length) throw new Error("balanced shard coverage drift");
  return shards.map((shard) => ({ ...shard, predicted_cost: Math.round(shard.predicted_cost) }));
}

export function moduloShardCost(rows, workerCount, model = null) {
  const costs = Array.from({ length: workerCount }, () => 0);
  rows.forEach((row, index) => { costs[index % workerCount] += estimateObligationCost(row, model); });
  return costs;
}
