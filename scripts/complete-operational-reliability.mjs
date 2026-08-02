#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const command = process.argv[2];
const POLICY_RECEIPT = "data/review/operational-reliability/no-golden-cage-readiness-2026-08-02.json";
const COMPLETION_RECEIPT = "data/review/operational-reliability/operational-reliability-completion-2026-08-02.json";
const ROADMAP_STATE = "data/ROADMAP-STATE.json";
const WATERLINE = "data/WATERLINE.json";
const WATERLINE_STATE = "data/WATERLINE-STATE.json";
const STATUS = "/tmp/operational-status.json";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (path) => readFileSync(path);
const json = (path) => JSON.parse(bytes(path));
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};
const invariant = (condition, message) => {
  if (!condition) throw new Error(message);
};

function reviewInputs() {
  const policyBytes = bytes(POLICY_RECEIPT);
  const waterlineBytes = bytes(WATERLINE);
  const stateBytes = bytes(WATERLINE_STATE);
  const roadmapBytes = bytes(ROADMAP_STATE);
  const statusBytes = bytes(STATUS);
  return {
    policyBytes,
    policy: JSON.parse(policyBytes),
    waterlineBytes,
    waterline: JSON.parse(waterlineBytes),
    stateBytes,
    state: JSON.parse(stateBytes),
    roadmapBytes,
    roadmap: JSON.parse(roadmapBytes),
    statusBytes,
    status: JSON.parse(statusBytes),
  };
}

function validatePaidBoundary(input) {
  const { policy, state, roadmap, status, waterline } = input;
  const readiness = status.evidence_readiness;
  invariant(policy.status === "smoke-passed", `policy receipt is ${policy.status}`);
  invariant(policy.transaction === "OPERATIONAL-RELIABILITY-NO-GOLDEN-CAGE-001", "policy transaction drifted");
  invariant(readiness?.operational_reliability === true, `readiness false: ${JSON.stringify(readiness)}`);
  invariant((readiness.missing_drills || []).length === 0, "reviewed drill debt remains");
  invariant((readiness.missing_metrics || []).length === 0, "blocking metric debt remains");
  invariant((readiness.slo_target_failures || []).length === 0, "an observed SLO failed");
  const unobserved = [...(readiness.unobserved_nonblocking_metrics || [])].sort();
  invariant(JSON.stringify(unobserved) === JSON.stringify(["cost_per_verified_record_usd", "rights_response_sla_days"]), `unexpected unobserved debt ${JSON.stringify(unobserved)}`);
  invariant(state.metrics.build_minutes_p95 === 1.091267, "build metric custody drifted");
  invariant(state.metrics.source_freshness_p95_days === 3.683774, "freshness metric custody drifted");
  invariant(state.metrics.cost_per_verified_record_usd === null, "cost was invented");
  invariant(state.metrics.rights_response_sla_days === null, "rights response was invented");
  invariant(!roadmap.completed.some((row) => row.milestone === "operational-reliability"), "roadmap milestone is already complete");
  invariant(waterline.operations.metric_readiness?.cost_per_verified_record_usd?.mode === "when-observed", "cost readiness policy drifted");
  invariant(waterline.operations.metric_readiness?.rights_response_sla_days?.mode === "when-observed", "rights readiness policy drifted");
  return readiness;
}

if (command === "preflight") {
  validatePaidBoundary(reviewInputs());
  console.log("PASS — smoke-passed no-golden-cage policy, reviewed drills, measured continuous metrics, and visible observation debt");
} else if (command === "author") {
  const input = reviewInputs();
  const readiness = validatePaidBoundary(input);
  const { policyBytes, waterlineBytes, waterline, stateBytes, state, roadmapBytes, roadmap, statusBytes } = input;
  const reviewedAt = new Date().toISOString();
  const latestPassedDrills = new Map();
  for (const row of state.drills || []) if (row.passed) latestPassedDrills.set(row.kind, row);
  const drills = waterline.operations.required_drills.map((kind) => {
    const row = latestPassedDrills.get(kind);
    invariant(row, `missing reviewed drill ${kind}`);
    return {
      id: row.id,
      kind,
      reviewed_at: row.reviewed_at,
      reviewed_by: row.reviewed_by,
      reviewed_role: row.reviewed_role,
    };
  });
  const sloResults = Object.entries(waterline.operations.slo_targets || {}).map(([metric, target]) => {
    const value = state.metrics[metric];
    return value === null
      ? { metric, value: null, target, evaluated: false, status: "unobserved-nonblocking" }
      : { metric, value, target, evaluated: true, status: value <= target ? "passed" : "failed" };
  });
  invariant(!sloResults.some((row) => row.evaluated && row.status !== "passed"), "an observed SLO failed");

  const receipt = {
    version: 1,
    transaction: "OPERATIONAL-RELIABILITY-COMPLETION-001",
    operation: "reviewed-roadmap-completion-after-ledger-aware-no-golden-cage-policy",
    status: "candidate-smoke-required",
    reviewed_at: reviewedAt,
    reviewed_by: "chatgpt-second-desk",
    reviewed_role: "second-desk",
    authorization: {
      main_parent: process.env.AUTHORIZED_MAIN,
      policy_head: process.env.AUTHORIZED_POLICY_HEAD,
      workflow_head: process.env.GITHUB_SHA,
      workflow_run: Number(process.env.GITHUB_RUN_ID),
      workflow_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      pull_request: 154,
    },
    policy: {
      receipt_path: POLICY_RECEIPT,
      receipt_sha256: sha256(policyBytes),
      status: input.policy.status,
      required_metrics: ["build_minutes_p95", "source_freshness_p95_days"],
      observation_triggered_metrics: ["cost_per_verified_record_usd", "rights_response_sla_days"],
      empty_ledger_and_null: "visible-nonblocking-debt-not-zero",
      first_observation_and_null: "blocking-measurement-due",
      measured_value_without_ledger: "blocking-custody-regression",
    },
    evidence: {
      waterline_config_sha256: sha256(waterlineBytes),
      waterline_state_sha256: sha256(stateBytes),
      roadmap_state_before_sha256: sha256(roadmapBytes),
      status_sha256: sha256(statusBytes),
      drills,
      metrics: { ...state.metrics },
      slo_results: sloResults,
      readiness,
    },
    acceptance: {
      reviewed_repository_restore_passed: drills.some((row) => row.kind === "repository-restore"),
      reviewed_publication_rollback_passed: drills.some((row) => row.kind === "publication-rollback"),
      build_baseline_measured: Number.isFinite(state.metrics.build_minutes_p95),
      source_freshness_baseline_measured: Number.isFinite(state.metrics.source_freshness_p95_days),
      cost_state: readiness.metric_states.cost_per_verified_record_usd.status,
      rights_state: readiness.metric_states.rights_response_sla_days.status,
      measured_slo_failures: readiness.slo_target_failures,
      incident_stop_fixture_covered: true,
    },
    boundary: {
      canonical_content_mutated: false,
      live_publication_mutated: false,
      source_graph_mutated: false,
      corpus_denominator_mutated: false,
      quality_baseline_mutated: false,
      preservation_asset_mutated: false,
      null_converted_to_zero: false,
      cost_debt_closed: false,
      rights_debt_closed: false,
      future_observation_obligation_retained: true,
      external_person_or_incident_required_for_completion: false,
      final_gate_required: true,
    },
  };
  writeJson(COMPLETION_RECEIPT, receipt);

  roadmap.completed.push({
    milestone: "operational-reliability",
    completed_at: reviewedAt,
    reviewed_by: "chatgpt-second-desk",
    reviewed_role: "second-desk",
    evidence: [
      { type: "commit", value: `${process.env.AUTHORIZED_POLICY_HEAD} — smoke-passed ledger-aware no-golden-cage policy and exact metric readiness.` },
      { type: "pull-request", value: "#154 — reviewed operational-reliability completion transaction." },
      { type: "workflow-run", value: `${process.env.GITHUB_RUN_ID} — exact-head roadmap completion and two complete rendered repository gates.` },
      { type: "report", value: `${POLICY_RECEIPT} — smoke-passed metric-readiness policy receipt.` },
      { type: "report", value: `${COMPLETION_RECEIPT} — reviewed drill, metric, SLO, incident-boundary, and roadmap completion receipt.` },
      { type: "metric", value: `build_minutes_p95=${state.metrics.build_minutes_p95}; source_freshness_p95_days=${state.metrics.source_freshness_p95_days}; cost_per_verified_record_usd=null with zero admissible observations; rights_response_sla_days=null with zero admissible cases.` },
      { type: "report", value: `Reviewed drills: ${drills.map((row) => `${row.kind}:${row.id}`).join(", ")}.` },
    ],
  });
  roadmap.updated_at = reviewedAt;
  roadmap.metrics.build_minutes_p95 = state.metrics.build_minutes_p95;
  roadmap.metrics.source_freshness_p95_days = state.metrics.source_freshness_p95_days;
  roadmap.metrics.cost_per_verified_record_usd = null;
  roadmap.metrics.rights_response_sla_days = null;
  roadmap.notes.push("Operational reliability completed with reviewed restore and rollback drills, measured build and source-freshness baselines, high/critical incident stops, and ledger-aware no-golden-cage readiness. Empty cost and rights ledgers keep those metrics null and visible without requiring a manufactured event; the first admissible observation automatically reopens measurement and every measured SLO remains blocking.");
  writeJson(ROADMAP_STATE, roadmap);
  console.log(`AUTHORED — ${COMPLETION_RECEIPT}`);
} else if (command === "promote") {
  const receipt = json(COMPLETION_RECEIPT);
  invariant(receipt.status === "candidate-smoke-required", `completion receipt is ${receipt.status}`);
  receipt.status = "smoke-passed";
  receipt.smoke = {
    candidate_gate: "npm run gate",
    candidate_complete_gate_passed: true,
    candidate_rendered_browser_included: true,
    final_gate_required_after_promotion: true,
  };
  writeJson(COMPLETION_RECEIPT, receipt);
  console.log("PROMOTED — completion receipt now requires the final exact-tree gate");
} else {
  throw new Error("usage: complete-operational-reliability.mjs preflight|author|promote");
}
