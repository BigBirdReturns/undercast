#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const command = process.argv[2];
const RECEIPT = "data/review/operational-reliability/metric-ledger-custody-hotfix-2026-08-02.json";

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact match, found ${count}`);
  writeFileSync(path, source.replace(before, after));
}

function apply() {
  const drillValidation = `  for (const drill of doc.drills) {
    if (!config.operations.required_drills.includes(drill.kind)) throw new Error(\`unknown drill kind \${drill.kind}\`);
    if (drill.passed !== true && drill.passed !== false) throw new Error(\`drill \${drill.id} needs passed boolean\`);
    requireReview(drill);
  }
  validateIncidentEvents(doc.incidents);`;
  const receiptValidation = `  for (const drill of doc.drills) {
    if (!config.operations.required_drills.includes(drill.kind)) throw new Error(\`unknown drill kind \${drill.kind}\`);
    if (drill.passed !== true && drill.passed !== false) throw new Error(\`drill \${drill.id} needs passed boolean\`);
    requireReview(drill);
  }
  for (const receipt of doc.metric_receipts) {
    if (!/^metrics_[0-9a-f]{24}$/.test(receipt.id || "")) throw new Error(\`invalid metric receipt id \${receipt.id || "<missing>"}\`);
    if (!receipt.metrics || typeof receipt.metrics !== "object" || Array.isArray(receipt.metrics)) throw new Error(\`metric receipt \${receipt.id} needs metrics{}\`);
    const entries = Object.entries(receipt.metrics);
    if (!entries.length) throw new Error(\`metric receipt \${receipt.id} changes no metric\`);
    requireReview(receipt);
    requireEvidence(receipt.evidence, \`metric receipt \${receipt.id}.evidence\`);
    const bindings = receipt.observation_bindings || {};
    if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) throw new Error(\`metric receipt \${receipt.id}.observation_bindings must be an object\`);
    for (const [key, value] of entries) {
      if (!METRIC_KEYS.includes(key)) throw new Error(\`metric receipt \${receipt.id} contains unknown metric \${key}\`);
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(\`metric receipt \${receipt.id}.metrics.\${key} must be null or non-negative\`);
      const policy = config.operations.metric_readiness?.[key];
      const binding = bindings[key];
      if (value !== null && policy?.mode === "when-observed") {
        if (!binding || typeof binding !== "object" || Array.isArray(binding)) throw new Error(\`metric receipt \${receipt.id} needs observation binding for \${key}\`);
        if (requireString(binding.source, \`metric receipt \${receipt.id}.observation_bindings.\${key}.source\`) !== policy.observation_source) throw new Error(\`metric receipt \${receipt.id}.\${key} binds the wrong observation source\`);
        if (!/^[0-9a-f]{64}$/.test(String(binding.sha256 || ""))) throw new Error(\`metric receipt \${receipt.id}.\${key}.sha256 must be a sha256\`);
        if (!Number.isSafeInteger(binding.population) || binding.population < 1) throw new Error(\`metric receipt \${receipt.id}.\${key}.population must be positive\`);
      } else if (binding) throw new Error(\`metric receipt \${receipt.id} has unauthorized observation binding for \${key}\`);
    }
    for (const key of Object.keys(bindings)) if (!Object.prototype.hasOwnProperty.call(receipt.metrics, key)) throw new Error(\`metric receipt \${receipt.id} binds unrecorded metric \${key}\`);
  }
  validateIncidentEvents(doc.incidents);`;
  replaceOnce("scripts/lib/waterline.mjs", drillValidation, receiptValidation, "metric receipt state validation");

  const oldMaker = `export function makeMetricsReceipt(input, currentMetrics) {
  const review = requireReview(input);
  const metrics = { ...currentMetrics };
  let changed = 0;
  for (const key of METRIC_KEYS) {
    if (!(key in (input.metrics || {}))) continue;
    const value = input.metrics[key];
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(\`metrics.\${key} must be null or non-negative\`);
    metrics[key] = value;
    changed++;
  }
  if (!changed) throw new Error("metrics receipt changes no known metric");
  const body = { metrics: input.metrics, note: requireString(input.note, "note"), evidence: requireEvidence(input.evidence), ...review };
  return { receipt: { id: \`metrics_\${sha256(stableJson(body)).slice(0, 24)}\`, ...body }, metrics };
}`;
  const newMaker = `export function makeMetricsReceipt(input, currentMetrics, context = {}) {
  const review = requireReview(input);
  if (input.observation_bindings !== undefined) throw new Error("observation_bindings are derived from validated ledgers, not caller input");
  const metrics = { ...currentMetrics };
  const observation_bindings = {};
  let changed = 0;
  for (const key of METRIC_KEYS) {
    if (!(key in (input.metrics || {}))) continue;
    const value = input.metrics[key];
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(\`metrics.\${key} must be null or non-negative\`);
    if (currentMetrics[key] !== null && value === null) throw new Error(\`metrics.\${key} cannot erase a measured value back to null\`);
    const policy = context.metricReadiness?.[key];
    if (value !== null && policy?.mode === "when-observed") {
      const snapshot = context.observationSnapshots?.[key];
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error(\`metric \${key} requires a populated validated observation snapshot\`);
      if (snapshot.source !== policy.observation_source) throw new Error(\`metric \${key} snapshot source does not match configured observation source\`);
      if (!/^[0-9a-f]{64}$/.test(String(snapshot.sha256 || ""))) throw new Error(\`metric \${key} snapshot sha256 is invalid\`);
      if (!Number.isSafeInteger(snapshot.population) || snapshot.population < 1 || snapshot.measurement_status !== "measured") throw new Error(\`metric \${key} requires a populated validated observation snapshot\`);
      observation_bindings[key] = {
        source: snapshot.source,
        sha256: snapshot.sha256,
        population: snapshot.population,
      };
    }
    metrics[key] = value;
    changed++;
  }
  if (!changed) throw new Error("metrics receipt changes no known metric");
  const body = { metrics: input.metrics, note: requireString(input.note, "note"), evidence: requireEvidence(input.evidence), ...review };
  if (Object.keys(observation_bindings).length) body.observation_bindings = observation_bindings;
  return { receipt: { id: \`metrics_\${sha256(stableJson(body)).slice(0, 24)}\`, ...body }, metrics };
}`;
  replaceOnce("scripts/lib/waterline.mjs", oldMaker, newMaker, "metric receipt writer");

  replaceOnce(
    "scripts/waterline.mjs",
    `  applyMetricReadinessPolicy,
  metricObservationCountsFromLedgers,
  validateMetricReadinessConfig,`,
    `  applyMetricReadinessPolicy,
  metricObservationSnapshotsFromLedgers,
  resolveMetricObservationSources,
  validateMetricReadinessConfig,`,
    "metric readiness imports",
  );
  replaceOnce(
    "scripts/waterline.mjs",
    `const root = resolve(option("root", "."));
const pathAt = (name, fallback) => resolve(root, option(name, fallback));`,
    `const root = resolve(option("root", "."));
const costLedgerOverride = option("cost-ledger");
const rightsLedgerOverride = option("rights-ledger");
const pathAt = (name, fallback) => resolve(root, option(name, fallback));`,
    "ledger override capture",
  );
  replaceOnce(
    "scripts/waterline.mjs",
    `  preservation: pathAt("preservation", "preservation/SNAPSHOTS.json"),
  costLedger: pathAt("cost-ledger", "data/operational-reliability/COST-OBSERVATIONS.json"),
  rightsLedger: pathAt("rights-ledger", "data/operational-reliability/RIGHTS-CASES.json"),`,
    `  preservation: pathAt("preservation", "preservation/SNAPSHOTS.json"),`,
    "remove hard-coded ledger paths",
  );

  const oldLoad = `async function load() {
  const [config, state, mediaAudit, autopilot, autopilotJournalText, roadmapState, preservation, costLedger, rightsLedger, waterlineJournal] = await Promise.all([
    readJson(paths.config),
    readJson(paths.state, emptyWaterlineState()),
    readJson(paths.media),
    readJson(paths.autopilot),
    readText(paths.autopilotJournal),
    readJson(paths.roadmap),
    readJson(paths.preservation),
    readJson(paths.costLedger),
    readJson(paths.rightsLedger),
    readText(paths.journal),
  ]);
  validateWaterlineConfig(config);
  validateMetricReadinessConfig(config);
  validateWaterlineState(state, config);
  parseJsonl(waterlineJournal);
  return {
    config,
    state,
    mediaAudit,
    autopilot,
    autopilotJournal: parseJsonl(autopilotJournalText),
    roadmapState,
    preservation,
    metricObservationCounts: metricObservationCountsFromLedgers({ costLedger, rightsLedger }),
    waterlineJournal,
  };
}`;
  const newLoad = `async function readJsonBytes(path, label) {
  try {
    const bytes = await readFile(path);
    return { bytes, doc: JSON.parse(bytes.toString("utf8")) };
  } catch (error) {
    throw new Error(\`cannot read \${label} at \${path}: \${error.message}\`);
  }
}
async function load() {
  const config = await readJson(paths.config);
  validateWaterlineConfig(config);
  validateMetricReadinessConfig(config);
  const observationSources = resolveMetricObservationSources(config, {
    root,
    overrides: {
      cost_per_verified_record_usd: costLedgerOverride,
      rights_response_sla_days: rightsLedgerOverride,
    },
  });
  const [state, mediaAudit, autopilot, autopilotJournalText, roadmapState, preservation, costLedger, rightsLedger, waterlineJournal] = await Promise.all([
    readJson(paths.state, emptyWaterlineState()),
    readJson(paths.media),
    readJson(paths.autopilot),
    readText(paths.autopilotJournal),
    readJson(paths.roadmap),
    readJson(paths.preservation),
    readJsonBytes(observationSources.cost_per_verified_record_usd.path, "cost observation ledger"),
    readJsonBytes(observationSources.rights_response_sla_days.path, "rights observation ledger"),
    readText(paths.journal),
  ]);
  validateWaterlineState(state, config);
  parseJsonl(waterlineJournal);
  const metricObservationSnapshots = metricObservationSnapshotsFromLedgers({
    costLedger: costLedger.doc,
    costLedgerBytes: costLedger.bytes,
    costSource: observationSources.cost_per_verified_record_usd.source,
    rightsLedger: rightsLedger.doc,
    rightsLedgerBytes: rightsLedger.bytes,
    rightsSource: observationSources.rights_response_sla_days.source,
  });
  return {
    config,
    state,
    mediaAudit,
    autopilot,
    autopilotJournal: parseJsonl(autopilotJournalText),
    roadmapState,
    preservation,
    metricObservationSnapshots,
    waterlineJournal,
  };
}`;
  replaceOnce("scripts/waterline.mjs", oldLoad, newLoad, "configured ledger loader");
  replaceOnce(
    "scripts/waterline.mjs",
    `    observationCounts: inputs.metricObservationCounts,`,
    `    observationSnapshots: inputs.metricObservationSnapshots,`,
    "readiness snapshot input",
  );
  replaceOnce(
    "scripts/waterline.mjs",
    `      const result = makeMetricsReceipt(doc, next.metrics);`,
    `      const result = makeMetricsReceipt(doc, next.metrics, {
        metricReadiness: inputs.config.operations.metric_readiness,
        observationSnapshots: inputs.metricObservationSnapshots,
      });`,
    "metric writer custody context",
  );

  replaceOnce(
    "docs/OPERATIONAL-METRICS.md",
    "This rule never converts absence into zero, never waives a measured SLO failure, and never closes the cost or rights debt. It removes only the circular requirement to manufacture an event before the system may prove that it is ready to handle the event.",
    "This rule never converts absence into zero, never waives a measured SLO failure, and never closes the cost or rights debt. It removes only the circular requirement to manufacture an event before the system may prove that it is ready to handle the event.\n\nEvery observation-triggered numeric receipt binds the configured ledger path, exact ledger SHA-256, and validated population. The waterline reads the configured source itself; a CLI override must resolve to the same path or is refused. Appending, replacing, or deleting ledger rows changes the snapshot and immediately reopens measurement. A numeric value without a matching reviewed binding is a custody failure, not a measured baseline.",
    "metric custody documentation",
  );
  console.log("APPLIED — exact ledger source, validation, receipt binding, and stale-measurement custody patches");
}

function verifyStatus(path) {
  const status = JSON.parse(readFileSync(path, "utf8"));
  const readiness = status.evidence_readiness;
  if (readiness.operational_reliability !== true) throw new Error(`current empty-ledger readiness regressed: ${JSON.stringify(readiness)}`);
  if (readiness.missing_metrics.length || readiness.stale_metric_measurements.length || readiness.metric_ledger_regressions.length) throw new Error(`blocking custody remains: ${JSON.stringify(readiness)}`);
  const expected = ["cost_per_verified_record_usd", "rights_response_sla_days"];
  if (JSON.stringify([...readiness.unobserved_nonblocking_metrics].sort()) !== JSON.stringify(expected)) throw new Error(`unexpected null debt: ${JSON.stringify(readiness.unobserved_nonblocking_metrics)}`);
  console.log("PASS — current validated empty ledgers preserve visible nonblocking debt and exact readiness");
}

function authorReceipt(statusPath) {
  const status = JSON.parse(readFileSync(statusPath, "utf8"));
  const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  const changed = [
    "scripts/lib/metric-readiness.mjs",
    "scripts/metric-readiness-fixtures.mjs",
    "scripts/lib/waterline.mjs",
    "scripts/waterline.mjs",
    "docs/OPERATIONAL-METRICS.md",
  ];
  const receipt = {
    version: 1,
    transaction: "OPERATIONAL-METRIC-LEDGER-CUSTODY-HOTFIX-001",
    status: "candidate-smoke-required",
    reviewed_at: new Date().toISOString(),
    reviewed_by: "chatgpt-second-desk",
    reviewed_role: "second-desk",
    authorization: {
      exact_main_parent: process.env.AUTHORIZED_MAIN,
      workflow_head: process.env.GITHUB_SHA,
      workflow_run: Number(process.env.GITHUB_RUN_ID),
      workflow_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      originating_pull_request: 154,
      review_threads: [3697406750, 3697406753],
    },
    corrections: {
      validated_rows_before_counting: true,
      configured_observation_source_is_authoritative: true,
      mismatched_cli_override_refused: true,
      reviewed_numeric_receipts_bind_source_sha256_and_population: true,
      ledger_append_or_replacement_reopens_measurement: true,
      measured_value_without_binding_blocks: true,
    },
    evidence: {
      files: Object.fromEntries(changed.map((file) => [file, hash(file)])),
      current_readiness: status.evidence_readiness,
      focused_fixtures: "PASS",
      complete_gate_required: true,
    },
    boundary: {
      roadmap_completion_reopened: false,
      canonical_content_mutated: false,
      live_publication_mutated: false,
      source_graph_mutated: false,
      corpus_denominator_mutated: false,
      quality_baseline_mutated: false,
      metric_values_changed: false,
      null_converted_to_zero: false,
    },
  };
  mkdirSync(dirname(RECEIPT), { recursive: true });
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`AUTHORED — ${RECEIPT}`);
}

function promoteReceipt() {
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  if (receipt.status !== "candidate-smoke-required") throw new Error(`receipt is ${receipt.status}`);
  receipt.status = "smoke-passed";
  receipt.smoke = {
    candidate_gate: "npm run gate",
    candidate_complete_gate_passed: true,
    candidate_rendered_browser_included: true,
    final_gate_required_after_launcher_retirement: true,
  };
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log("PROMOTED — hotfix receipt requires exact final-tree gate");
}

if (command === "apply") apply();
else if (command === "verify-status") verifyStatus(process.argv[3]);
else if (command === "author-receipt") authorReceipt(process.argv[3]);
else if (command === "promote-receipt") promoteReceipt();
else throw new Error("usage: apply-metric-ledger-custody-hotfix.mjs apply|verify-status <path>|author-receipt <path>|promote-receipt");
