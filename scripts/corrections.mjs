#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CORRECTION_VERSION = 1;
export const EVENT_ORDER = ["intake", "triaged", "evidence-reviewed", "dispositioned", "history-published"];
const TERMINAL_STATUSES = new Set(["resolved", "rejected", "withdrawn"]);
const TERMINAL_OUTCOMES = new Set(["accepted", "rejected", "insufficient-evidence", "withdrawn"]);
const HASH_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const DEFAULT_OUTPUT = "data/review/corrections/BASELINE.json";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function requireObject(value, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return {};
  }
  return value;
}
function requireString(value, label, errors) {
  const text = String(value || "").trim();
  if (!text) errors.push(`${label} is required`);
  return text;
}
function requireDate(value, label, errors) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) errors.push(`${label} must be an ISO date/time`);
  return timestamp;
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

export function validateCorrectionCase(raw, { expectedCaseType = null } = {}) {
  const errors = [];
  const row = requireObject(raw, "correction case", errors);
  const id = requireString(row.id, "correction case id", errors);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`${id || "correction case"} has unsafe id`);
  if (!new Set(["real", "exercise"]).has(row.case_type)) errors.push(`${id}.case_type is invalid`);
  if (expectedCaseType && row.case_type !== expectedCaseType) errors.push(`${id} must be ${expectedCaseType}`);
  if (!new Set(["open", "triage", "review", "resolved", "rejected", "withdrawn"]).has(row.status)) errors.push(`${id}.status is invalid`);
  const openedAt = requireDate(row.opened_at, `${id}.opened_at`, errors);

  const target = requireObject(row.target, `${id}.target`, errors);
  requireString(target.record_id, `${id}.target.record_id`, errors);
  requireString(target.field_path, `${id}.target.field_path`, errors);
  if (!COMMIT_RE.test(String(target.target_head || ""))) errors.push(`${id}.target.target_head must be a full commit SHA`);
  if (!HASH_RE.test(String(target.current_value_sha256 || ""))) errors.push(`${id}.target.current_value_sha256 must be SHA-256`);

  const claim = requireObject(row.claim, `${id}.claim`, errors);
  requireString(claim.summary, `${id}.claim.summary`, errors);
  requireString(claim.proposed_correction, `${id}.claim.proposed_correction`, errors);
  const privacy = requireObject(row.privacy, `${id}.privacy`, errors);
  if (privacy.private_personal_data_included !== false) errors.push(`${id} includes private personal data`);
  if (privacy.public_evidence_only !== true) errors.push(`${id} is not limited to public evidence`);

  const evidenceIds = new Set();
  for (const [index, evidence] of (Array.isArray(row.evidence) ? row.evidence : []).entries()) {
    const item = requireObject(evidence, `${id}.evidence[${index}]`, errors);
    const evidenceId = requireString(item.id, `${id}.evidence[${index}].id`, errors);
    if (evidenceIds.has(evidenceId)) errors.push(`${id} has duplicate evidence ${evidenceId}`);
    evidenceIds.add(evidenceId);
    if (!HASH_RE.test(String(item.sha256 || ""))) errors.push(`${id}.${evidenceId}.sha256 is invalid`);
    else if (sha256(String(item.value || "")) !== item.sha256) errors.push(`${id}.${evidenceId} value hash drifted`);
  }
  if (!evidenceIds.size) errors.push(`${id} has no evidence`);

  const events = Array.isArray(row.events) ? row.events : [];
  if (!events.length) errors.push(`${id} has no events`);
  let previousAt = openedAt;
  const kinds = [];
  for (const [index, event] of events.entries()) {
    const item = requireObject(event, `${id}.events[${index}]`, errors);
    kinds.push(item.kind);
    const at = requireDate(item.at, `${id}.events[${index}].at`, errors);
    if (Number.isFinite(at) && Number.isFinite(previousAt) && at < previousAt) errors.push(`${id} events are not chronological`);
    previousAt = at;
    requireString(item.actor, `${id}.events[${index}].actor`, errors);
    requireString(item.note, `${id}.events[${index}].note`, errors);
    for (const evidenceId of item.evidence_ids || []) if (!evidenceIds.has(evidenceId)) errors.push(`${id} event references unknown evidence ${evidenceId}`);
  }
  const kindIndexes = kinds.map((kind) => EVENT_ORDER.indexOf(kind));
  if (kindIndexes.some((value) => value < 0)) errors.push(`${id} contains an unknown event kind`);
  if (kindIndexes.some((value, index) => index && value <= kindIndexes[index - 1])) errors.push(`${id} event kinds are not strictly ordered`);
  if (kinds[0] !== "intake") errors.push(`${id} must begin with intake`);

  const reporter = events.find((event) => event.kind === "intake")?.actor;
  const reviewer = events.find((event) => event.kind === "evidence-reviewed")?.actor;
  const decider = events.find((event) => event.kind === "dispositioned")?.actor;
  if (reporter && reviewer && reporter === reviewer) errors.push(`${id} reporter self-reviewed`);
  if (reporter && decider && reporter === decider) errors.push(`${id} reporter self-adjudicated`);

  const disposition = requireObject(row.disposition, `${id}.disposition`, errors);
  if (!new Set(["accepted", "rejected", "insufficient-evidence", "withdrawn", "pending"]).has(disposition.outcome)) errors.push(`${id}.disposition.outcome is invalid`);
  requireString(disposition.reason, `${id}.disposition.reason`, errors);
  const terminal = TERMINAL_STATUSES.has(row.status);
  if (terminal && !TERMINAL_OUTCOMES.has(disposition.outcome)) errors.push(`${id} terminal status has a nonterminal outcome`);
  if (!terminal && disposition.outcome !== "pending") errors.push(`${id} nonterminal status has a terminal outcome`);
  if (terminal) {
    requireString(disposition.decided_by, `${id}.disposition.decided_by`, errors);
    if (!new Set(["second-desk", "owner"]).has(disposition.decided_role)) errors.push(`${id} terminal disposition lacks second-desk or owner authority`);
    const decidedAt = requireDate(disposition.decided_at, `${id}.disposition.decided_at`, errors);
    if (Number.isFinite(decidedAt) && Number.isFinite(openedAt) && decidedAt < openedAt) errors.push(`${id} was decided before opening`);
    if (!kinds.includes("dispositioned")) errors.push(`${id} terminal case lacks a disposition event`);
  }
  if (disposition.history_public && !kinds.includes("history-published")) errors.push(`${id} claims public history without a history event`);

  const boundary = requireObject(row.boundary, `${id}.boundary`, errors);
  if (boundary.canonical_authority !== false) errors.push(`${id} correction ledger acquired canonical authority`);
  if (boundary.exercise_can_mutate_canonical !== false) errors.push(`${id} exercise mutation boundary drifted`);
  if (boundary.reporter_can_self_adjudicate !== false) errors.push(`${id} reporter self-adjudication boundary drifted`);
  if (row.case_type === "exercise") {
    if (disposition.canonical_mutation !== false) errors.push(`${id} exercise mutated canonical state`);
    if (!String(target.record_id || "").startsWith("EXERCISE-")) errors.push(`${id} exercise targets a non-exercise record`);
  }

  return errors;
}

export function validateCorrectionLedger(doc, { expectedCaseType = null } = {}) {
  const errors = [];
  if (doc?.version !== CORRECTION_VERSION) errors.push("correction ledger version must be 1");
  if (doc?.schema !== "schema/correction.schema.json") errors.push("correction ledger schema path drifted");
  requireString(doc?.semantics, "correction ledger semantics", errors);
  if (!Array.isArray(doc?.cases)) errors.push("correction ledger needs cases[]");
  const ids = new Set();
  for (const row of doc?.cases || []) {
    if (ids.has(row.id)) errors.push(`duplicate correction case ${row.id}`);
    ids.add(row.id);
    errors.push(...validateCorrectionCase(row, { expectedCaseType }));
  }
  return errors;
}

export function buildCorrectionBaseline({ production, productionRaw, exercise, exerciseRaw, issueTemplateRaw }) {
  const errors = [
    ...validateCorrectionLedger(production, { expectedCaseType: "real" }),
    ...validateCorrectionLedger(exercise, { expectedCaseType: "exercise" })
  ];
  if (errors.length) throw new Error(errors.join("\n"));
  const exerciseCases = exercise.cases || [];
  if (exerciseCases.length !== 1) throw new Error(`controlled exercise denominator must be 1, found ${exerciseCases.length}`);
  const exerciseCase = exerciseCases[0];
  const requiredEvents = EVENT_ORDER;
  if (JSON.stringify(exerciseCase.events.map((row) => row.kind)) !== JSON.stringify(requiredEvents)) {
    throw new Error("controlled exercise did not complete the exact event chain");
  }
  if (exerciseCase.status !== "resolved" || exerciseCase.disposition.outcome !== "accepted" || exerciseCase.disposition.history_public !== true) {
    throw new Error("controlled exercise is not terminal and publicly receipted");
  }

  const realCases = production.cases || [];
  const resolvedReal = realCases.filter((row) => TERMINAL_STATUSES.has(row.status));
  const closeDurations = resolvedReal.map((row) => (Date.parse(row.disposition.decided_at) - Date.parse(row.opened_at)) / 86_400_000);
  const firstResponseDurations = realCases.map((row) => {
    const response = row.events.find((event) => event.kind === "triaged");
    return response ? (Date.parse(response.at) - Date.parse(row.opened_at)) / 86_400_000 : null;
  }).filter(Number.isFinite);

  return {
    version: 1,
    operation: "public-trust-corrections-baseline",
    generated_at: exerciseCase.events.at(-1).at,
    inputs: {
      production_ledger: { path: "data/CORRECTIONS.json", sha256: sha256(productionRaw) },
      controlled_exercise: { path: "data/review/corrections/controlled-exercise-001.json", sha256: sha256(exerciseRaw) },
      issue_template: { path: ".github/ISSUE_TEMPLATE/correction.yml", sha256: sha256(issueTemplateRaw) }
    },
    production: {
      admitted_cases: realCases.length,
      open_cases: realCases.filter((row) => !TERMINAL_STATUSES.has(row.status)).length,
      terminal_cases: resolvedReal.length,
      median_close_days: closeDurations.length ? round(median(closeDurations)) : null,
      maximum_first_response_days: firstResponseDurations.length ? round(Math.max(...firstResponseDurations)) : null,
      empty_ledger_semantics: realCases.length ? null : "No admitted real correction case exists; this is not a zero-day response or an error-free archive claim."
    },
    exercise: {
      id: exerciseCase.id,
      status: exerciseCase.status,
      outcome: exerciseCase.disposition.outcome,
      event_chain: exerciseCase.events.map((row) => row.kind),
      independent_review: exerciseCase.events.find((row) => row.kind === "intake").actor !== exerciseCase.events.find((row) => row.kind === "evidence-reviewed").actor,
      public_history: exerciseCase.disposition.history_public,
      canonical_mutation: exerciseCase.disposition.canonical_mutation
    },
    boundary: {
      controlled_exercise_is_not_public_demand: true,
      controlled_exercise_is_not_canonical_authority: true,
      production_ledger_mutated_by_exercise: false,
      correction_metric_populated: realCases.length > 0,
      roadmap_milestone_completed: false,
      live_publication_mutated: false
    }
  };
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function readJsonWithRaw(root, relative) {
  const file = path.join(root, relative);
  const raw = readFileSync(file);
  return { value: JSON.parse(raw), raw };
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args.shift() || "check";
  const root = path.resolve(option(args, "--root", "."));
  const output = option(args, "--output", DEFAULT_OUTPUT);
  const production = readJsonWithRaw(root, "data/CORRECTIONS.json");
  const exercise = readJsonWithRaw(root, "data/review/corrections/controlled-exercise-001.json");
  const issueTemplateRaw = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/correction.yml"));
  const baseline = buildCorrectionBaseline({
    production: production.value,
    productionRaw: production.raw,
    exercise: exercise.value,
    exerciseRaw: exercise.raw,
    issueTemplateRaw
  });
  const bytes = stableJson(baseline);
  const outputPath = path.join(root, output);

  if (command === "write") {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
    console.log(`corrections: wrote ${output}; production=${baseline.production.admitted_cases}; exercise=${baseline.exercise.status}`);
  } else if (command === "check") {
    if (!existsSync(outputPath)) throw new Error(`${output} is missing; run corrections:write`);
    if (readFileSync(outputPath, "utf8") !== bytes) throw new Error(`${output} is stale; run corrections:write`);
    console.log("corrections: PASS — production ledger and controlled exercise are current");
  } else if (command === "status") {
    console.log(JSON.stringify(baseline, null, 2));
  } else {
    throw new Error("usage: corrections.mjs write|check|status [--root path] [--output path]");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`corrections: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
