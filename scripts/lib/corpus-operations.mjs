import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const REQUIRED_LOOPS = Object.freeze([
  "incident-and-correction",
  "source-refresh",
  "bounded-growth",
  "media-improvement",
  "lead-harvest",
  "estate-induction",
]);

export const REQUIRED_ALLOWED_CLASSES = Object.freeze([
  "corpus-addition",
  "source-refresh",
  "evidence-improvement",
  "media-search",
  "media-correction",
  "correction",
  "rights",
  "preservation",
  "adapter-build",
  "adapter-certification",
  "operations",
  "security",
  "accessibility",
  "performance",
]);

export function readJson(root, relativePath, fallback = null) {
  const file = path.join(root, relativePath);
  if (!existsSync(file)) {
    if (fallback !== null) return fallback;
    throw new Error(`missing required corpus-operations input ${relativePath}`);
  }
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new Error(`cannot parse ${relativePath}: ${error.message}`); }
}

export function readText(root, relativePath, fallback = "") {
  const file = path.join(root, relativePath);
  return existsSync(file) ? readFileSync(file, "utf8") : fallback;
}

export function loadCorpusOperations(root = process.cwd()) {
  return {
    operations: readJson(root, "data/CORPUS-OPERATIONS.json"),
    operationsState: readJson(root, "data/CORPUS-OPERATIONS-STATE.json"),
    registry: readJson(root, "data/ESTATE-REGISTRY.json"),
    scopes: readJson(root, "data/AUTOPILOT-SCOPES.json"),
    certifications: readJson(root, "data/AUTOPILOT-CERTIFICATIONS.json", { version: 1, certifications: [] }),
    autopilot: readJson(root, "data/AUTOPILOT.json", { version: 1, jobs: [] }),
    mediaAudit: readJson(root, "data/MEDIA-AUDIT.json", { version: 2, items: [] }),
    mediaSearch: readJson(root, "data/MEDIA-SEARCH-STATE.json", { version: 1, attempts: [] }),
    waterline: readJson(root, "data/WATERLINE-STATE.json", { version: 1, cycles: [], incidents: [] }),
    roadmap: readJson(root, "data/ROADMAP-STATE.json", { version: 1, completed: [] }),
    workflows: {
      nightly: readText(root, ".github/workflows/nightly.yml"),
      retrieve: readText(root, ".github/workflows/retrieve.yml"),
      autopilot: readText(root, ".github/workflows/autopilot.yml"),
    },
  };
}

function duplicates(values) {
  const seen = new Set();
  const duplicate = new Set();
  for (const value of values) seen.has(value) ? duplicate.add(value) : seen.add(value);
  return [...duplicate].sort();
}

export function validateCorpusOperations(context) {
  const errors = [];
  const { operations, operationsState, registry, scopes, certifications, mediaSearch, workflows } = context;

  if (operations?.version !== 1 || operations?.mode !== "collection-only") errors.push("CORPUS-OPERATIONS must be version 1 in collection-only mode");
  if (operations?.schema !== "schema/corpus-operations.schema.json") errors.push("CORPUS-OPERATIONS schema path drifted");
  if (operations?.product_freeze?.status !== "active") errors.push("collection-only product freeze is not active");
  const allowed = new Set(operations?.product_freeze?.allowed_change_classes || []);
  for (const value of REQUIRED_ALLOWED_CLASSES) if (!allowed.has(value)) errors.push(`product freeze is missing allowed change class ${value}`);
  if (!(operations?.product_freeze?.owner_decision_required || []).length) errors.push("product freeze has no owner-decision boundary");

  const loopIds = (operations?.loops || []).map((row) => row.id);
  for (const id of REQUIRED_LOOPS) if (!loopIds.includes(id)) errors.push(`missing corpus loop ${id}`);
  for (const id of duplicates(loopIds)) errors.push(`duplicate corpus loop ${id}`);
  if ((operations?.quality_policy?.max_growth_lease || 0) > 8) errors.push("max growth lease exceeds the waterline ceiling of 8");
  for (const key of ["never_overwrite_verified_media_automatically", "candidate_media_is_noncanonical", "media_promotion_requires_hash_bound_review", "unknown_is_null_not_zero", "source_failure_may_not_publish_zero"]) {
    if (operations?.quality_policy?.[key] !== true) errors.push(`quality policy ${key} must remain true`);
  }

  if (operationsState?.version !== 1 || operationsState?.mode !== operations?.mode) errors.push("CORPUS-OPERATIONS-STATE does not match the active mode");
  for (const exception of operationsState?.exceptions || []) {
    if (!exception?.id || !exception?.change_class || !exception?.reviewed_by || !exception?.expires_at) errors.push("product exception lacks durable reviewed fields");
    if (!Number.isFinite(Date.parse(exception?.expires_at || ""))) errors.push(`product exception ${exception?.id || "unknown"} has invalid expiry`);
  }

  const stages = new Set(operations?.estate_pipeline?.stages || []);
  const estates = registry?.estates || [];
  const estateIds = estates.map((row) => row.id);
  for (const id of duplicates(estateIds)) errors.push(`duplicate estate ${id}`);
  for (const estate of estates) {
    if (!stages.has(estate.stage)) errors.push(`${estate.id} has unknown estate stage ${estate.stage}`);
    if (!Array.isArray(estate.sources) || !estate.sources.length) errors.push(`${estate.id} has no source system`);
    for (const source of estate.sources || []) if (!/^https:\/\//.test(source)) errors.push(`${estate.id} has non-HTTPS source ${source}`);
    if (estate.stage === "active" && !estate.scope_id) errors.push(`${estate.id} is active without an Autopilot scope`);
  }

  const scopeRows = scopes?.scopes || [];
  const estateByScope = new Map(estates.filter((row) => row.scope_id).map((row) => [row.scope_id, row]));
  for (const scope of scopeRows) {
    const estate = estateByScope.get(scope.id);
    if (!estate) errors.push(`Autopilot scope ${scope.id} is absent from ESTATE-REGISTRY`);
    if (scope.status === "active" && estate?.stage !== "active") errors.push(`active scope ${scope.id} is not active in ESTATE-REGISTRY`);
    if (scope.status !== "active" && estate?.stage === "active") errors.push(`paused scope ${scope.id} is incorrectly active in ESTATE-REGISTRY`);
  }
  const activeScopes = scopeRows.filter((row) => row.status === "active");
  if (activeScopes.length > (operations?.estate_pipeline?.parallel_active_estates || 0)) errors.push(`active scope count ${activeScopes.length} exceeds collection-only ceiling`);
  const certified = new Set((certifications?.certifications || []).map((row) => row.scope_id));
  for (const scope of activeScopes) if (!certified.has(scope.id)) errors.push(`active scope ${scope.id} lacks a producer certification`);

  if (mediaSearch?.version !== 1 || !Array.isArray(mediaSearch?.attempts)) errors.push("MEDIA-SEARCH-STATE must be version 1 with attempts[]");

  if (!/scripts\/ingest\.mjs/.test(workflows?.nightly || "")) errors.push("nightly workflow no longer harvests leads");
  if (/ANTHROPIC_API_KEY|scripts\/grow\.mjs/.test(workflows?.nightly || "")) errors.push("nightly workflow bypasses Autopilot with direct model growth");
  if (!/scripts\/media-search\.mjs/.test(workflows?.retrieve || "")) errors.push("retrieve workflow does not use noncanonical media search");
  if (/run:\s*node scripts\/retrieve\.mjs/.test(workflows?.retrieve || "")) errors.push("retrieve workflow directly mutates canonical media");
  if (!/upload-artifact/.test(workflows?.retrieve || "")) errors.push("retrieve workflow does not retain candidate bytes as an artifact");
  if (!/autopilot -- refresh --due/.test(workflows?.autopilot || "")) errors.push("Autopilot workflow lost certified due-scope refresh");

  return errors;
}

export function summarizeJobs(autopilot, scopeId) {
  const jobs = (autopilot?.jobs || []).filter((row) => row.scope === scopeId);
  const statuses = {};
  for (const row of jobs) statuses[row.status] = (statuses[row.status] || 0) + 1;
  const inFlight = ["leased", "drafted", "merged"].reduce((sum, status) => sum + (statuses[status] || 0), 0);
  return { total: jobs.length, statuses, in_flight: inFlight };
}

export function summarizeMedia(mediaAudit, scopeId) {
  const items = (mediaAudit?.items || []).filter((row) => row.scope === scopeId);
  const statuses = {};
  for (const item of items) statuses[item.status] = (statuses[item.status] || 0) + 1;
  const debt = items.filter((row) => !["verified", "absent"].includes(row.status)).length;
  return { total: items.length, statuses, debt };
}

function incidentOpen(row) {
  return !["closed", "resolved", "dismissed"].includes(String(row?.status || "open").toLowerCase());
}

export function summarizeWaterline(waterline, scopeId) {
  const cycles = (waterline?.cycles || []).filter((row) => row.scope_id === scopeId);
  const incidents = (waterline?.incidents || []).filter(incidentOpen);
  return {
    successful_cycles: cycles.filter((row) => row.outcome === "completed").length,
    aborted_cycles: cycles.filter((row) => row.outcome === "aborted").length,
    blocking_incidents: incidents.filter((row) => ["high", "critical"].includes(String(row.severity || "").toLowerCase())).length,
  };
}

export function completedMilestones(roadmap) {
  return new Set((roadmap?.completed || []).map((row) => row.milestone));
}

export function sourceRefreshDue({ scope, certification, now = new Date() }) {
  const cadence = Number(scope?.refresh?.cadence_days || 0);
  const certifiedAt = Date.parse(certification?.certified_at || "");
  if (!cadence || !Number.isFinite(certifiedAt)) return false;
  return now.getTime() >= certifiedAt + cadence * 86_400_000;
}

export function nextEstate(context) {
  const required = context.operations?.estate_pipeline?.next_estate_requires_completed_milestones || [];
  const complete = completedMilestones(context.roadmap);
  const missing = required.filter((id) => !complete.has(id));
  const candidates = (context.registry?.estates || [])
    .filter((row) => !["active", "retired"].includes(row.stage))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return { authorized: missing.length === 0, missing_milestones: missing, estate: candidates[0] || null };
}

export function deriveCorpusStatus(context, { now = new Date(), waterlineStatus = null } = {}) {
  const errors = validateCorpusOperations(context);
  const activeScope = (context.scopes?.scopes || []).find((row) => row.status === "active") || null;
  const scopeId = activeScope?.id || null;
  const certification = (context.certifications?.certifications || []).find((row) => row.scope_id === scopeId) || null;
  const jobs = summarizeJobs(context.autopilot, scopeId);
  const media = summarizeMedia(context.mediaAudit, scopeId);
  const waterline = summarizeWaterline(context.waterline, scopeId);
  const due = activeScope ? sourceRefreshDue({ scope: activeScope, certification, now }) : false;
  const claimAllowed = waterlineStatus?.claim_allowed === true;
  const estate = nextEstate(context);

  let operation = "idle";
  let reason = "No governed work is currently available.";
  if (errors.length) { operation = "contract-repair"; reason = "The collection-only contract is invalid."; }
  else if (waterline.blocking_incidents) { operation = "incident-and-correction"; reason = "A high or critical incident blocks normal collection work."; }
  else if (media.debt) { operation = "media-catch-up"; reason = `${media.debt} active-scope media facets require review or remediation.`; }
  else if (jobs.in_flight) { operation = "finish-current-cycle"; reason = `${jobs.in_flight} Autopilot task(s) remain in flight.`; }
  else if (due) { operation = "source-refresh"; reason = `${activeScope.label} is due for its certified source refresh.`; }
  else if (claimAllowed && (jobs.statuses.queued || 0) > 0) { operation = "bounded-growth"; reason = "The waterline authorizes one bounded capability-compatible lease."; }
  else if ((jobs.statuses.queued || 0) > 0) { operation = "waterline-blocked"; reason = "Work is queued, but the rolling waterline does not authorize a new lease."; }
  else { operation = "media-improvement"; reason = "No claimable task is ready; continue noncanonical media and evidence improvement attempts."; }

  return {
    version: 1,
    mode: context.operations?.mode || null,
    valid: errors.length === 0,
    errors,
    active_scope: scopeId,
    source_refresh_due: due,
    jobs,
    media,
    waterline: { ...waterline, claim_allowed: claimAllowed },
    current_operation: operation,
    reason,
    parallel_safe_work: ["lead-harvest", "media-improvement"],
    next_estate: estate,
  };
}
