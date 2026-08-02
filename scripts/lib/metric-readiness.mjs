import { METRIC_KEYS } from "./waterline.mjs";

export const METRIC_READINESS_MODES = new Set(["required", "when-observed"]);
const NATURAL_UNLOCKS = ["adapter-sdk-and-second-gold-shard", "public-trust-and-corrections"];

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}

export function validateMetricReadinessConfig(config) {
  const policies = requireObject(config?.operations?.metric_readiness, "operations.metric_readiness");
  const policyKeys = Object.keys(policies).sort();
  const expectedKeys = [...METRIC_KEYS].sort();
  if (JSON.stringify(policyKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`operations.metric_readiness must define exactly ${expectedKeys.join(", ")}`);
  }
  for (const key of METRIC_KEYS) {
    const policy = requireObject(policies[key], `operations.metric_readiness.${key}`);
    const mode = requireString(policy.mode, `operations.metric_readiness.${key}.mode`);
    if (!METRIC_READINESS_MODES.has(mode)) throw new Error(`operations.metric_readiness.${key}.mode is invalid`);
    if (mode === "when-observed") requireString(policy.observation_source, `operations.metric_readiness.${key}.observation_source`);
  }
  for (const key of Object.keys(config.operations.slo_targets || {})) {
    if (!METRIC_KEYS.includes(key)) throw new Error(`operations.slo_targets contains unknown metric ${key}`);
  }
  return true;
}

export function metricObservationCountsFromLedgers({ costLedger, rightsLedger }) {
  requireObject(costLedger, "cost ledger");
  requireObject(rightsLedger, "rights ledger");
  if (costLedger.version !== 1 || !Array.isArray(costLedger.observations)) throw new Error("cost ledger must be version 1 with observations[]");
  if (rightsLedger.version !== 1 || !Array.isArray(rightsLedger.cases)) throw new Error("rights ledger must be version 1 with cases[]");
  return {
    cost_per_verified_record_usd: costLedger.observations.length,
    rights_response_sla_days: rightsLedger.cases.length,
  };
}

export function applyMetricReadinessPolicy(status, { config, state, observationCounts = {} }) {
  validateMetricReadinessConfig(config);
  requireObject(status, "waterline status");
  requireObject(status.evidence_readiness, "waterline status evidence_readiness");
  requireObject(state?.metrics, "waterline state metrics");

  const metricStates = {};
  const missingRequired = [];
  const measurementDue = [];
  const unobservedNonblocking = [];
  const ledgerRegressions = [];

  for (const key of METRIC_KEYS) {
    const value = state.metrics[key];
    const policy = config.operations.metric_readiness[key];
    if (policy.mode === "required") {
      if (value === null) {
        missingRequired.push(key);
        metricStates[key] = { mode: policy.mode, status: "missing-required", value, observation_count: null };
      } else {
        metricStates[key] = { mode: policy.mode, status: "measured", value, observation_count: null };
      }
      continue;
    }

    const count = requireCount(observationCounts[key], `observation count for ${key}`);
    if (value === null && count === 0) {
      unobservedNonblocking.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "unobserved-nonblocking",
        value,
        observation_count: count,
        observation_source: policy.observation_source,
      };
    } else if (value === null) {
      measurementDue.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measurement-due",
        value,
        observation_count: count,
        observation_source: policy.observation_source,
      };
    } else if (count === 0) {
      ledgerRegressions.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measured-without-observation-custody",
        value,
        observation_count: count,
        observation_source: policy.observation_source,
      };
    } else {
      metricStates[key] = {
        mode: policy.mode,
        status: "measured",
        value,
        observation_count: count,
        observation_source: policy.observation_source,
      };
    }
  }

  const targetFailures = [];
  for (const [key, target] of Object.entries(config.operations.slo_targets || {})) {
    const value = state.metrics[key];
    if (value !== null && value > target) targetFailures.push({ metric: key, value, target });
  }

  const missingMetrics = [...missingRequired, ...measurementDue, ...ledgerRegressions];
  const blockingIncident = Boolean(status.incidents?.blocking_open?.length);
  const operationsReady = status.evidence_readiness.missing_drills.length === 0
    && missingMetrics.length === 0
    && targetFailures.length === 0
    && !blockingIncident;

  const next = structuredClone(status);
  next.evidence_readiness = {
    ...next.evidence_readiness,
    operational_reliability: operationsReady,
    missing_metrics: missingMetrics,
    missing_required_metrics: missingRequired,
    measurement_due_metrics: measurementDue,
    unobserved_nonblocking_metrics: unobservedNonblocking,
    metric_ledger_regressions: ledgerRegressions,
    metric_states: metricStates,
    slo_target_failures: targetFailures,
  };
  next.natural_unlocks_when_receipted = next.evidence_readiness.star_trek_gold_shard && operationsReady
    ? [...NATURAL_UNLOCKS]
    : [];
  return next;
}
