import { createHash } from "node:crypto";

export const WATERLINE_VERSION = 1;
export const METRIC_KEYS = [
  "build_minutes_p95",
  "cost_per_verified_record_usd",
  "source_freshness_p95_days",
  "rights_response_sla_days",
];
const REVIEW_ROLES = new Set(["second-desk", "owner"]);
const INCIDENT_ROLES = new Set(["machine", "operator", "reviewer", "second-desk", "owner"]);
const ACTIVE_JOB_STATUSES = new Set(["leased", "drafted", "merged"]);
const CLOSED_CYCLE_STATUSES = new Set(["resolved", "rejected", "blocked", "retired"]);
const COMPLETE_MEDIA_STATUSES = new Set(["verified", "absent"]);
const BLOCKING_INCIDENT_SEVERITIES = new Set(["critical", "high"]);

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function stableJson(value) { return JSON.stringify(stable(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function emptyWaterlineState() {
  return {
    version: WATERLINE_VERSION,
    updated_at: "",
    cycles: [],
    drills: [],
    accounting: [],
    metrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, null])),
    metric_receipts: [],
    incidents: [],
  };
}
function requireString(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}
function requireDate(value, label) {
  if (!Number.isFinite(Date.parse(value || ""))) throw new Error(`${label} must be an ISO date/time`);
  return String(value);
}
function requireEvidence(value, label = "evidence") {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array`);
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`${label}[${index}] must be an object`);
    return { type: requireString(row.type, `${label}[${index}].type`), value: requireString(row.value, `${label}[${index}].value`) };
  });
}
function requireReview(input) {
  const reviewed_by = requireString(input.reviewed_by, "reviewed_by");
  const reviewed_role = requireString(input.reviewed_role, "reviewed_role");
  if (!REVIEW_ROLES.has(reviewed_role)) throw new Error("reviewed_role must be second-desk or owner");
  const reviewed_at = requireDate(input.reviewed_at, "reviewed_at");
  return { reviewed_by, reviewed_role, reviewed_at };
}
function ensureUnique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = row?.[key];
    if (!value || seen.has(value)) throw new Error(`${label} contains a missing or duplicate ${key}: ${value || "<missing>"}`);
    seen.add(value);
  }
}
function validateIncidentEvents(rows) {
  const previousById = new Map();
  for (const row of rows) {
    const incidentId = requireString(row.incident_id, "incident_id");
    if (!["open", "closed"].includes(row.status)) throw new Error(`incident ${incidentId} status must be open or closed`);
    if (!["low", "medium", "high", "critical"].includes(row.severity)) throw new Error(`incident ${incidentId} severity is invalid`);
    requireDate(row.at, `incident ${incidentId}.at`);
    requireString(row.recorded_by, `incident ${incidentId}.recorded_by`);
    const role = requireString(row.recorded_role, `incident ${incidentId}.recorded_role`);
    if (!INCIDENT_ROLES.has(role)) throw new Error(`incident ${incidentId} recorded_role is invalid`);
    requireEvidence(row.evidence, `incident ${incidentId}.evidence`);
    const previous = previousById.get(incidentId);
    if (previous && Date.parse(row.at) < Date.parse(previous.at)) throw new Error(`incident ${incidentId} events are out of order`);
    if (row.status === "closed") {
      if (!previous || previous.status !== "open") throw new Error(`incident ${incidentId} cannot close without an open event`);
      if (row.severity !== previous.severity) throw new Error(`incident ${incidentId} close severity must match the open event`);
      if (BLOCKING_INCIDENT_SEVERITIES.has(previous.severity) && !REVIEW_ROLES.has(role)) throw new Error(`closing ${previous.severity} incident ${incidentId} requires second-desk or owner authority`);
    }
    if (previous?.status === "open" && BLOCKING_INCIDENT_SEVERITIES.has(previous.severity) && row.status === "open" && !BLOCKING_INCIDENT_SEVERITIES.has(row.severity) && !REVIEW_ROLES.has(role)) {
      throw new Error(`downgrading ${previous.severity} incident ${incidentId} requires second-desk or owner authority`);
    }
    previousById.set(incidentId, row);
  }
  return true;
}

export function validateWaterlineConfig(doc) {
  if (!doc || doc.version !== WATERLINE_VERSION || !Array.isArray(doc.scopes) || !doc.operations) throw new Error(`WATERLINE config must be version ${WATERLINE_VERSION} with scopes[] and operations`);
  ensureUnique(doc.scopes, "id", "WATERLINE scopes");
  for (const scope of doc.scopes) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scope.id || "")) throw new Error(`invalid waterline scope id ${scope.id || "<missing>"}`);
    requireString(scope.label, `scope ${scope.id}.label`);
    requireString(scope.roadmap_milestone, `scope ${scope.id}.roadmap_milestone`);
    for (const key of ["required_closed_cycles", "max_tasks_per_cycle", "minimum_resolved_per_cycle"]) {
      if (!Number.isInteger(scope[key]) || scope[key] < 0) throw new Error(`scope ${scope.id}.${key} must be a non-negative integer`);
    }
    if (scope.required_closed_cycles < 1 || scope.max_tasks_per_cycle < 1 || scope.max_tasks_per_cycle > 50) throw new Error(`scope ${scope.id} has invalid cycle bounds`);
  }
  if (!Array.isArray(doc.operations.required_drills) || !doc.operations.required_drills.length) throw new Error("operations.required_drills must be non-empty");
  if (new Set(doc.operations.required_drills).size !== doc.operations.required_drills.length) throw new Error("operations.required_drills contains duplicates");
  const targets = doc.operations.slo_targets || {};
  for (const [key, value] of Object.entries(targets)) if (!Number.isFinite(value) || value <= 0) throw new Error(`operations.slo_targets.${key} must be positive`);
  return true;
}

export function validateWaterlineState(doc, config) {
  validateWaterlineConfig(config);
  if (!doc || doc.version !== WATERLINE_VERSION) throw new Error(`WATERLINE state must be version ${WATERLINE_VERSION}`);
  for (const key of ["cycles", "drills", "accounting", "metric_receipts", "incidents"]) if (!Array.isArray(doc[key])) throw new Error(`WATERLINE state needs ${key}[]`);
  ensureUnique(doc.cycles, "id", "cycle receipts");
  ensureUnique(doc.cycles, "lease_id", "cycle receipts");
  ensureUnique(doc.drills, "id", "drill receipts");
  ensureUnique(doc.accounting, "id", "accounting receipts");
  ensureUnique(doc.metric_receipts, "id", "metric receipts");
  ensureUnique(doc.incidents, "event_id", "incident events");
  if (!doc.metrics || typeof doc.metrics !== "object" || Array.isArray(doc.metrics)) throw new Error("WATERLINE state needs metrics{}");
  for (const key of METRIC_KEYS) {
    const value = doc.metrics[key];
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`metrics.${key} must be null or non-negative`);
  }
  for (const cycle of doc.cycles) {
    if (!/^cycle_[0-9a-f]{24}$/.test(cycle.id || "")) throw new Error(`invalid cycle receipt id ${cycle.id || "<missing>"}`);
    if (!/^(completed|aborted)$/.test(cycle.outcome || "")) throw new Error(`cycle ${cycle.id} has invalid outcome`);
    if (!Array.isArray(cycle.task_ids) || !cycle.task_ids.length || new Set(cycle.task_ids).size !== cycle.task_ids.length) throw new Error(`cycle ${cycle.id} needs unique task_ids`);
    requireReview(cycle);
    requireEvidence(cycle.evidence, `cycle ${cycle.id}.evidence`);
  }
  for (const drill of doc.drills) {
    if (!config.operations.required_drills.includes(drill.kind)) throw new Error(`unknown drill kind ${drill.kind}`);
    if (drill.passed !== true && drill.passed !== false) throw new Error(`drill ${drill.id} needs passed boolean`);
    requireReview(drill);
  }
  validateIncidentEvents(doc.incidents);
  return true;
}

export function parseJsonl(text) {
  const rows = [];
  for (const [index, line] of String(text || "").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); }
    catch (error) { throw new Error(`journal line ${index + 1} is invalid JSON (${error.message})`); }
  }
  return rows;
}

export function jobSetDigest(autopilot, scopeId) {
  const rows = (autopilot.jobs || []).filter((job) => job.scope === scopeId).map((job) => ({
    id: job.id,
    status: job.status,
    source_fingerprint: job.source_fingerprint,
    wall_ids: [...(job.wall_ids || [])].sort(),
  })).sort((a, b) => a.id.localeCompare(b.id));
  return sha256(stableJson(rows));
}
export function mediaSummary(mediaAudit, scopeId) {
  const rows = (mediaAudit.items || []).filter((item) => item.scope === scopeId);
  const counts = { verified: 0, absent: 0, review: 0, attention: 0 };
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const complete = rows.filter((row) => COMPLETE_MEDIA_STATUSES.has(row.status)).length;
  return { total: rows.length, complete, debt: rows.length - complete, counts, item_set_sha256: mediaAudit.source?.item_set_sha256 || sha256(stableJson(rows.map((row) => row.id).sort())) };
}
export function leaseGroups(events, scopeId) {
  const groups = new Map();
  for (const row of events || []) {
    if (row.op !== "lease.claimed" || row.scope !== scopeId || !row.lease_id || !row.task_id) continue;
    if (!groups.has(row.lease_id)) groups.set(row.lease_id, { lease_id: row.lease_id, scope_id: scopeId, claimed_at: row.at, readiness_token: row.readiness_token || null, task_ids: [] });
    const group = groups.get(row.lease_id);
    group.task_ids.push(row.task_id);
    if (!group.claimed_at || Date.parse(row.at) < Date.parse(group.claimed_at)) group.claimed_at = row.at;
  }
  return [...groups.values()].map((group) => ({ ...group, task_ids: [...new Set(group.task_ids)].sort() })).sort((a, b) => Date.parse(a.claimed_at) - Date.parse(b.claimed_at));
}
function latestIncidents(events) {
  const byId = new Map();
  for (const row of events || []) {
    const previous = byId.get(row.incident_id);
    if (!previous || Date.parse(row.at) >= Date.parse(previous.at)) byId.set(row.incident_id, row);
  }
  return [...byId.values()];
}
function hasEvidenceType(evidence, type) { return (evidence || []).some((row) => row.type === type); }
function completedMilestones(roadmapState) { return new Set((roadmapState.completed || []).map((row) => row.milestone)); }

export function deriveWaterlineStatus({ config, state, mediaAudit, autopilot, autopilotJournal = [], roadmapState, preservation, scopeId, requestedTasks = 0 }) {
  validateWaterlineState(state, config);
  const scope = config.scopes.find((row) => row.id === scopeId);
  if (!scope) throw new Error(`unknown waterline scope ${scopeId}`);
  const media = mediaSummary(mediaAudit, scopeId);
  const jobs = (autopilot.jobs || []).filter((job) => job.scope === scopeId);
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const inFlight = jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));
  const groups = leaseGroups(autopilotJournal, scopeId);
  const cycleByLease = new Map(state.cycles.filter((row) => row.scope_id === scopeId).map((row) => [row.lease_id, row]));
  const unreceipted = groups.filter((group) => !cycleByLease.has(group.lease_id));
  const successfulCycles = state.cycles.filter((row) => row.scope_id === scopeId && row.outcome === "completed");
  const incidents = latestIncidents(state.incidents);
  const blockingIncidents = incidents.filter((row) => row.status === "open" && BLOCKING_INCIDENT_SEVERITIES.has(row.severity));
  const preservationReady = preservation?.history_guard?.precondition_met === true && preservation?.history_guard?.status === "offsite-verified";
  const foundationComplete = completedMilestones(roadmapState).has("trusted-foundation");
  const accounting = [...state.accounting].reverse().find((row) => row.scope_id === scopeId) || null;
  const currentJobDigest = jobSetDigest(autopilot, scopeId);
  const accountingCurrent = Boolean(accounting && accounting.job_set_sha256 === currentJobDigest);
  const claimReasons = [];
  if (!foundationComplete) claimReasons.push("trusted_foundation_incomplete");
  if (!preservationReady) claimReasons.push("preservation_not_offsite_verified");
  if (media.total === 0) claimReasons.push("media_baseline_missing");
  else if (media.debt > 0) claimReasons.push("media_debt_open");
  if (inFlight.length) claimReasons.push("cycle_in_flight");
  if (unreceipted.length) claimReasons.push("cycle_receipt_required");
  if (blockingIncidents.length) claimReasons.push("blocking_incident_open");
  if (requestedTasks && requestedTasks > scope.max_tasks_per_cycle) claimReasons.push("requested_batch_exceeds_capacity");

  let phase = "ready-for-cycle";
  if (blockingIncidents.length) phase = "incident-stop";
  else if (inFlight.length) phase = "cycle-in-flight";
  else if (media.debt > 0) phase = groups.length ? "media-catch-up" : "baseline-review";
  else if (unreceipted.length) phase = "receipt-required";

  const latestPassedDrills = new Map();
  for (const row of state.drills) if (row.passed) latestPassedDrills.set(row.kind, row);
  const missingDrills = config.operations.required_drills.filter((kind) => !latestPassedDrills.has(kind));
  const missingMetrics = METRIC_KEYS.filter((key) => state.metrics[key] === null);
  const targetFailures = [];
  for (const [key, target] of Object.entries(config.operations.slo_targets || {})) {
    const value = state.metrics[key];
    if (value !== null && value > target) targetFailures.push({ metric: key, value, target });
  }
  const goldEvidenceReady = media.total > 0 && media.debt === 0 && successfulCycles.length >= scope.required_closed_cycles && accountingCurrent && !blockingIncidents.length;
  const operationsEvidenceReady = missingDrills.length === 0 && missingMetrics.length === 0 && targetFailures.length === 0 && !blockingIncidents.length;
  return {
    version: WATERLINE_VERSION,
    scope_id: scopeId,
    phase,
    claim_allowed: claimReasons.length === 0,
    claim_reasons: claimReasons,
    capacity: { requested_tasks: requestedTasks || null, max_tasks_per_cycle: scope.max_tasks_per_cycle },
    media,
    jobs: {
      total: jobs.length,
      in_flight: inFlight.length,
      statuses: Object.fromEntries([...new Set(jobs.map((job) => job.status))].sort().map((status) => [status, jobs.filter((job) => job.status === status).length])),
      job_set_sha256: currentJobDigest,
    },
    cycles: {
      observed_leases: groups.length,
      successful_receipts: successfulCycles.length,
      required_successful_receipts: scope.required_closed_cycles,
      unreceipted: unreceipted.map((group) => ({ ...group, task_statuses: Object.fromEntries(group.task_ids.map((id) => [id, jobById.get(id)?.status || "missing"])) })),
    },
    incidents: { blocking_open: blockingIncidents },
    preservation_ready: preservationReady,
    foundation_complete: foundationComplete,
    accounting: { present: Boolean(accounting), current: accountingCurrent, receipt: accounting },
    evidence_readiness: {
      star_trek_gold_shard: goldEvidenceReady,
      operational_reliability: operationsEvidenceReady,
      missing_drills: missingDrills,
      missing_metrics: missingMetrics,
      slo_target_failures: targetFailures,
    },
    natural_unlocks_when_receipted: goldEvidenceReady && operationsEvidenceReady ? ["adapter-sdk-and-second-gold-shard", "public-trust-and-corrections"] : [],
  };
}

export function makeCycleReceipt(input, context) {
  const review = requireReview(input);
  const evidence = requireEvidence(input.evidence);
  const group = context.groups.find((row) => row.lease_id === input.lease_id && row.scope_id === input.scope_id);
  if (!group) throw new Error(`unknown lease ${input.lease_id} for ${input.scope_id}`);
  if (context.state.cycles.some((row) => row.lease_id === input.lease_id)) throw new Error(`lease ${input.lease_id} is already receipted`);
  const jobs = new Map((context.autopilot.jobs || []).map((job) => [job.id, job]));
  const statuses = Object.fromEntries(group.task_ids.map((id) => [id, jobs.get(id)?.status || "missing"]));
  if (Object.values(statuses).some((status) => ACTIVE_JOB_STATUSES.has(status))) throw new Error(`lease ${input.lease_id} still has active work`);
  const outcome = requireString(input.outcome, "outcome");
  if (!["completed", "aborted"].includes(outcome)) throw new Error("outcome must be completed or aborted");
  if (outcome === "completed") {
    for (const [id, status] of Object.entries(statuses)) if (!CLOSED_CYCLE_STATUSES.has(status)) throw new Error(`completed cycle task ${id} is ${status}`);
    const resolved = Object.values(statuses).filter((status) => status === "resolved").length;
    const scope = context.config.scopes.find((row) => row.id === input.scope_id);
    if (resolved < scope.minimum_resolved_per_cycle) throw new Error(`completed cycle needs at least ${scope.minimum_resolved_per_cycle} resolved task(s)`);
    const media = mediaSummary(context.mediaAudit, input.scope_id);
    if (!media.total || media.debt) throw new Error("completed cycle requires the current media baseline to be complete");
    for (const type of ["workflow-run", "commit", "restart-proof"]) if (!hasEvidenceType(evidence, type)) throw new Error(`completed cycle evidence needs ${type}`);
  } else if (!hasEvidenceType(evidence, "incident")) throw new Error("aborted cycle evidence needs incident");
  const body = {
    scope_id: input.scope_id,
    lease_id: input.lease_id,
    outcome,
    claimed_at: group.claimed_at,
    closed_at: review.reviewed_at,
    readiness_token: group.readiness_token,
    task_ids: group.task_ids,
    task_statuses: statuses,
    media_item_set_sha256: mediaSummary(context.mediaAudit, input.scope_id).item_set_sha256,
    job_set_sha256: jobSetDigest(context.autopilot, input.scope_id),
    note: requireString(input.note, "note"),
    evidence,
    ...review,
  };
  return { id: `cycle_${sha256(stableJson(body)).slice(0, 24)}`, ...body };
}

export function makeDrillReceipt(input, config) {
  const review = requireReview(input);
  const kind = requireString(input.kind, "kind");
  if (!config.operations.required_drills.includes(kind)) throw new Error(`unknown required drill ${kind}`);
  const body = { kind, passed: input.passed === true, note: requireString(input.note, "note"), evidence: requireEvidence(input.evidence), ...review };
  return { id: `drill_${sha256(stableJson(body)).slice(0, 24)}`, ...body };
}
export function makeMetricsReceipt(input, currentMetrics) {
  const review = requireReview(input);
  const metrics = { ...currentMetrics };
  let changed = 0;
  for (const key of METRIC_KEYS) {
    if (!(key in (input.metrics || {}))) continue;
    const value = input.metrics[key];
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`metrics.${key} must be null or non-negative`);
    metrics[key] = value;
    changed++;
  }
  if (!changed) throw new Error("metrics receipt changes no known metric");
  const body = { metrics: input.metrics, note: requireString(input.note, "note"), evidence: requireEvidence(input.evidence), ...review };
  return { receipt: { id: `metrics_${sha256(stableJson(body)).slice(0, 24)}`, ...body }, metrics };
}
export function makeAccountingReceipt(input, context) {
  const review = requireReview(input);
  const keys = ["eligible", "filed", "blocked", "excluded", "unresolved"];
  const counts = {};
  for (const key of keys) {
    const value = input.counts?.[key];
    if (!Number.isInteger(value) || value < 0) throw new Error(`counts.${key} must be a non-negative integer`);
    counts[key] = value;
  }
  const denominator = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const jobs = (context.autopilot.jobs || []).filter((job) => job.scope === input.scope_id);
  if (denominator !== jobs.length) throw new Error(`accounting denominator ${denominator} does not match ${jobs.length} durable tasks`);
  const evidence = requireEvidence(input.evidence);
  for (const type of ["report", "workflow-run"]) if (!hasEvidenceType(evidence, type)) throw new Error(`accounting evidence needs ${type}`);
  const body = { scope_id: input.scope_id, counts, denominator, job_set_sha256: jobSetDigest(context.autopilot, input.scope_id), note: requireString(input.note, "note"), evidence, ...review };
  return { id: `accounting_${sha256(stableJson(body)).slice(0, 24)}`, ...body };
}
export function makeIncidentEvent(input, existingEvents = []) {
  const incident_id = requireString(input.incident_id, "incident_id");
  const status = requireString(input.status, "status");
  if (!["open", "closed"].includes(status)) throw new Error("incident status must be open or closed");
  const severity = requireString(input.severity, "severity");
  if (!["low", "medium", "high", "critical"].includes(severity)) throw new Error("incident severity is invalid");
  const at = requireDate(input.at, "at");
  const body = {
    incident_id,
    status,
    severity,
    at,
    recorded_by: requireString(input.recorded_by, "recorded_by"),
    recorded_role: requireString(input.recorded_role, "recorded_role"),
    note: requireString(input.note, "note"),
    evidence: requireEvidence(input.evidence),
  };
  const event = { event_id: `incident_${sha256(stableJson(body)).slice(0, 24)}`, ...body };
  validateIncidentEvents([...existingEvents, event]);
  return event;
}
