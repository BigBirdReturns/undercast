import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { METRIC_KEYS, normalizeMetricObservationSource } from "./waterline.mjs";
import {
  measureCostPerVerifiedRecord,
  measureRightsResponse,
} from "../operational-metrics.mjs";

export const METRIC_READINESS_MODES = new Set(["required", "when-observed"]);
const NATURAL_UNLOCKS = ["adapter-sdk-and-second-gold-shard", "public-trust-and-corrections"];
const OBSERVATION_METRICS = Object.freeze({
  cost_per_verified_record_usd: "cost",
  rights_response_sla_days: "rights",
});

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

function requireMetricValue(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
  return value;
}

function requireHash(value, label) {
  const text = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) throw new Error(`${label} must be a sha256`);
  return text;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactBytes(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new Error(`${label} must be exact Buffer or UTF-8 string bytes`);
}

export function validateMetricReadinessConfig(config) {
  const policies = requireObject(config?.operations?.metric_readiness, "operations.metric_readiness");
  const policyKeys = Object.keys(policies).sort();
  const expectedKeys = [...METRIC_KEYS].sort();
  if (JSON.stringify(policyKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`operations.metric_readiness must define exactly ${expectedKeys.join(", ")}`);
  }
  const observationSources = new Set();
  for (const key of METRIC_KEYS) {
    const policy = requireObject(policies[key], `operations.metric_readiness.${key}`);
    const mode = requireString(policy.mode, `operations.metric_readiness.${key}.mode`);
    if (!METRIC_READINESS_MODES.has(mode)) throw new Error(`operations.metric_readiness.${key}.mode is invalid`);
    if (mode === "when-observed") {
      const source = normalizeMetricObservationSource(policy.observation_source, `operations.metric_readiness.${key}.observation_source`);
      if (!OBSERVATION_METRICS[key]) throw new Error(`no validated observation adapter exists for ${key}`);
      if (observationSources.has(source)) throw new Error(`observation source ${source} is assigned to multiple metrics`);
      observationSources.add(source);
    } else if (policy.observation_source != null) {
      throw new Error(`required metric ${key} cannot declare observation_source`);
    }
  }
  for (const key of Object.keys(config.operations.slo_targets || {})) {
    if (!METRIC_KEYS.includes(key)) throw new Error(`operations.slo_targets contains unknown metric ${key}`);
  }
  return true;
}

export function resolveMetricObservationSources(config, { root = ".", overrides = {} } = {}) {
  validateMetricReadinessConfig(config);
  const result = {};
  for (const [metric] of Object.entries(OBSERVATION_METRICS)) {
    const policy = config.operations.metric_readiness[metric];
    if (policy.mode !== "when-observed") throw new Error(`${metric} must remain when-observed`);
    const source = normalizeMetricObservationSource(policy.observation_source, `${metric}.observation_source`);
    const configuredPath = resolve(root, source);
    const override = overrides[metric];
    if (override != null) {
      const overrideSource = normalizeMetricObservationSource(override, `${metric} override`);
      const overridePath = resolve(root, overrideSource);
      if (overridePath !== configuredPath) {
        throw new Error(`${metric} override ${overridePath} does not match configured observation source ${configuredPath}`);
      }
    }
    result[metric] = { source, path: configuredPath };
  }
  return result;
}

export function metricObservationSnapshotsFromLedgers({
  costLedger,
  costLedgerBytes,
  costSource,
  rightsLedger,
  rightsLedgerBytes,
  rightsSource,
}) {
  const costMeasurement = measureCostPerVerifiedRecord(costLedger);
  const rightsMeasurement = measureRightsResponse(rightsLedger);
  const snapshots = {
    cost_per_verified_record_usd: {
      source: normalizeMetricObservationSource(costSource, "cost observation source"),
      sha256: sha256(exactBytes(costLedgerBytes, "cost ledger bytes")),
      population: requireCount(costMeasurement.population, "cost observation population"),
      value: costMeasurement.value,
      measurement_status: costMeasurement.status,
    },
    rights_response_sla_days: {
      source: normalizeMetricObservationSource(rightsSource, "rights observation source"),
      sha256: sha256(exactBytes(rightsLedgerBytes, "rights ledger bytes")),
      population: requireCount(rightsMeasurement.population, "rights observation population"),
      value: rightsMeasurement.value,
      measurement_status: rightsMeasurement.status,
    },
  };
  for (const [metric, snapshot] of Object.entries(snapshots)) {
    const expectedStatus = snapshot.population === 0 ? "no-observations" : "measured";
    if (snapshot.measurement_status !== expectedStatus) {
      throw new Error(`${metric} ledger status ${snapshot.measurement_status} disagrees with population ${snapshot.population}`);
    }
    if (snapshot.population === 0 && snapshot.value !== null) {
      throw new Error(`${metric} empty ledger must have null measurement value`);
    }
    if (snapshot.population > 0) requireMetricValue(snapshot.value, `${metric} ledger measurement value`);
  }
  return snapshots;
}

function validatedSnapshot(value, metric, policy) {
  const snapshot = requireObject(value, `observation snapshot for ${metric}`);
  const source = normalizeMetricObservationSource(snapshot.source, `observation snapshot for ${metric}.source`);
  const configuredSource = normalizeMetricObservationSource(policy.observation_source, `configured observation source for ${metric}`);
  if (source !== configuredSource) {
    throw new Error(`${metric} snapshot source ${source} does not match configured source ${configuredSource}`);
  }
  const population = requireCount(snapshot.population, `observation snapshot for ${metric}.population`);
  const measurementStatus = requireString(snapshot.measurement_status, `observation snapshot for ${metric}.measurement_status`);
  const expectedStatus = population === 0 ? "no-observations" : "measured";
  if (measurementStatus !== expectedStatus) throw new Error(`${metric} snapshot status ${measurementStatus} disagrees with population ${population}`);
  const measuredValue = snapshot.value;
  if (population === 0 && measuredValue !== null) throw new Error(`${metric} empty snapshot must have null measurement value`);
  if (population > 0) requireMetricValue(measuredValue, `observation snapshot for ${metric}.value`);
  return {
    source,
    sha256: requireHash(snapshot.sha256, `observation snapshot for ${metric}.sha256`),
    population,
    value: measuredValue,
    measurement_status: measurementStatus,
  };
}

function latestMetricReceipt(state, metric) {
  const receipts = state.metric_receipts;
  if (!Array.isArray(receipts)) throw new Error("waterline state metric_receipts must be an array");
  return [...receipts].reverse().find((row) => Object.prototype.hasOwnProperty.call(row?.metrics || {}, metric)) || null;
}

function bindingFor(receipt, metric) {
  const binding = receipt?.observation_bindings?.[metric];
  if (!binding) return null;
  const population = requireCount(binding.population, `${receipt.id}.${metric}.population`);
  const boundValue = binding.value;
  if (population === 0 && boundValue !== null) throw new Error(`${receipt.id}.${metric} empty binding must have null value`);
  if (population > 0) requireMetricValue(boundValue, `${receipt.id}.${metric}.value`);
  return {
    source: normalizeMetricObservationSource(binding.source, `${receipt.id}.${metric}.source`),
    sha256: requireHash(binding.sha256, `${receipt.id}.${metric}.sha256`),
    population,
    value: boundValue,
  };
}

export function applyMetricReadinessPolicy(status, { config, state, observationSnapshots = {} }) {
  validateMetricReadinessConfig(config);
  requireObject(status, "waterline status");
  requireObject(status.evidence_readiness, "waterline status evidence_readiness");
  requireObject(state?.metrics, "waterline state metrics");

  const metricStates = {};
  const missingRequired = [];
  const measurementDue = [];
  const unobservedNonblocking = [];
  const ledgerRegressions = [];
  const staleMeasurements = [];

  for (const key of METRIC_KEYS) {
    const value = state.metrics[key];
    const policy = config.operations.metric_readiness[key];
    if (policy.mode === "required") {
      if (value === null) {
        missingRequired.push(key);
        metricStates[key] = { mode: policy.mode, status: "missing-required", value, observation_snapshot: null };
      } else {
        metricStates[key] = { mode: policy.mode, status: "measured", value, observation_snapshot: null };
      }
      continue;
    }

    const snapshot = validatedSnapshot(observationSnapshots[key], key, policy);
    if (value === null && snapshot.population === 0) {
      unobservedNonblocking.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "unobserved-nonblocking",
        value,
        observation_snapshot: snapshot,
      };
      continue;
    }
    if (value === null) {
      measurementDue.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measurement-due",
        value,
        observation_snapshot: snapshot,
      };
      continue;
    }

    const receipt = latestMetricReceipt(state, key);
    const binding = bindingFor(receipt, key);
    if (!binding) {
      ledgerRegressions.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measured-without-observation-binding",
        value,
        receipt_id: receipt?.id || null,
        observation_snapshot: snapshot,
        observation_binding: null,
      };
      continue;
    }
    if (binding.source !== snapshot.source) {
      ledgerRegressions.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measured-against-wrong-ledger",
        value,
        receipt_id: receipt.id,
        observation_snapshot: snapshot,
        observation_binding: binding,
      };
      continue;
    }
    if (binding.sha256 !== snapshot.sha256 || binding.population !== snapshot.population) {
      staleMeasurements.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measurement-stale-after-ledger-change",
        value,
        receipt_id: receipt.id,
        observation_snapshot: snapshot,
        observation_binding: binding,
      };
      continue;
    }
    if (binding.value !== snapshot.value || value !== snapshot.value) {
      ledgerRegressions.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measured-value-does-not-match-ledger",
        value,
        receipt_id: receipt.id,
        observation_snapshot: snapshot,
        observation_binding: binding,
      };
      continue;
    }
    metricStates[key] = {
      mode: policy.mode,
      status: "measured",
      value,
      receipt_id: receipt.id,
      observation_snapshot: snapshot,
      observation_binding: binding,
    };
  }

  const targetFailures = [];
  for (const [key, target] of Object.entries(config.operations.slo_targets || {})) {
    const value = state.metrics[key];
    if (value !== null && value > target) targetFailures.push({ metric: key, value, target });
  }

  const missingMetrics = [...missingRequired, ...measurementDue, ...ledgerRegressions, ...staleMeasurements];
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
    stale_metric_measurements: staleMeasurements,
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
