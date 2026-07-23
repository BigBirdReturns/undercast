import { createHash } from "node:crypto";

export const AUTOPILOT_VERSION = 1;
export const ACTIVE_STATUSES = new Set(["queued", "leased", "drafted", "merged", "blocked", "attention"]);
export const TERMINAL_STATUSES = new Set(["resolved", "rejected", "retired"]);

const PERSONISH = /^[A-ZÀ-Þ][A-Za-zÀ-ž'.\-]*(?:\s+(?:[A-ZÀ-Þ][A-Za-zÀ-ž'.\-]*|(?:de|del|della|di|du|la|le|van|von|der|den|da|dos|das|bin|ibn|al)))+$/;
const ENTITY_TOKENS = /\b(?:doctor|dalek|cyber|legion|virus|paradigm|security service|intelligence division|mainframe|warrior|rutan host|live hand|creature shop|production team|puppet troupe|orchestra|ensemble|corps|army|species)\b/i;

export function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-zA-Z0-9']+/g, " ")
    .trim()
    .toLowerCase();
}

export function slug(value) {
  return normalize(value).replace(/\s+/g, "-") || "unscoped";
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableTaskId(row) {
  const identity = [row.franchise, row.character, row.performer].map(normalize).join("|");
  if (identity === "||") throw new Error("cannot address an empty coverage identity");
  return `ap_${sha256(identity).slice(0, 24)}`;
}

export function sourceKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch { return String(value || "").trim(); }
}

export function sourceFingerprint(task) {
  return sha256(JSON.stringify({
    categories: [...(task.categories || [])].sort(),
    modes: [...(task.performance_modes || [])].sort(),
    sources: [...(task.sources || [])].map(sourceKey).sort(),
    receipts: [...(task.source_receipts || [])]
      .map((receipt) => [sourceKey(receipt.source), receipt.pageid || 0, receipt.revision || 0, receipt.content_sha256 || ""].join("|"))
      .sort(),
  }));
}

export function emptyState() {
  return {
    version: AUTOPILOT_VERSION,
    source: {
      coverage_path: "data/CENSUS-COVERAGE.json",
      coverage_sha256: "",
      scopes_path: "data/AUTOPILOT-SCOPES.json",
      certifications_path: "data/AUTOPILOT-CERTIFICATIONS.json",
      manifest_path: "data/CENSUS-MANIFEST.json",
      drafts_path: "data/drafts.json",
      specimens_path: "data/specimens.json",
      growth_rejections_path: "data/journal/rejections.jsonl",
    },
    updated_at: "",
    jobs: [],
  };
}

export function normalizeScopes(doc = { scopes: [] }) {
  const scopes = Array.isArray(doc) ? doc : doc.scopes;
  if (!Array.isArray(scopes)) throw new Error("AUTOPILOT-SCOPES must contain a scopes array");
  const byId = new Map();
  for (const scope of scopes) {
    if (!scope || typeof scope !== "object") throw new Error("scope rows must be objects");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scope.id || "")) throw new Error(`invalid scope id: ${scope.id || "<missing>"}`);
    if (!scope.label || !scope.coverage_match?.franchise) throw new Error(`scope ${scope.id} needs label and coverage_match.franchise`);
    if (byId.has(scope.id)) throw new Error(`duplicate scope id: ${scope.id}`);
    const status = scope.status || "active";
    if (!["active", "paused", "retired"].includes(status)) throw new Error(`scope ${scope.id} has invalid status ${status}`);
    byId.set(scope.id, {
      id: scope.id,
      label: String(scope.label),
      status,
      priority: Number.isFinite(scope.priority) ? Number(scope.priority) : 0,
      franchise: normalize(scope.coverage_match.franchise),
    });
  }
  return byId;
}

function scopeFor(row, scopeMap) {
  if (row.scope_id && scopeMap.has(row.scope_id)) return scopeMap.get(row.scope_id);
  const franchise = normalize(row.franchise);
  return [...scopeMap.values()].find((scope) => scope.franchise === franchise)
    || { id: slug(row.scope_id || row.franchise), label: row.franchise || "Unscoped", status: "paused", priority: 0 };
}

function identityDisposition(row) {
  const performer = String(row.performer || "").trim();
  const character = String(row.character || "").trim();
  if (!performer) return { queueable: false, code: "missing_performer", note: "coverage row has no performer identity" };
  if (!character || character === "—") return { queueable: false, code: "missing_role", note: "source names a performer but no specific role" };
  if (!PERSONISH.test(performer) || ENTITY_TOKENS.test(performer)) {
    return { queueable: false, code: "performer_identity_review", note: "performer field is not safely person-shaped; repair or adjudicate the source extraction before drafting" };
  }
  return { queueable: true };
}

function jobPriority(job, performerTaskCount, scopePriority) {
  const modes = new Set(job.performance_modes || []);
  let score = scopePriority;
  if (job.performer_on_wall) score += 200;
  if (modes.has("physical-prosthetic")) score += 80;
  else if (modes.has("physical-and-voice")) score += 70;
  else if (modes.has("voice-animation")) score += 40;
  score += Math.min(100, Math.max(0, performerTaskCount - 1) * 10);
  return score;
}

function receiptsBySource(manifest = { observations: [] }) {
  const observations = Array.isArray(manifest) ? manifest : manifest?.observations;
  if (!Array.isArray(observations)) throw new Error("CENSUS-MANIFEST must contain an observations array");
  const bySource = new Map();
  for (const row of observations) {
    if (!row?.source) continue;
    const receipt = {
      source: String(row.source),
      ...(Number.isInteger(row.pageid) ? { pageid: row.pageid } : {}),
      ...(Number.isInteger(row.revision) ? { revision: row.revision } : {}),
      ...(row.timestamp ? { timestamp: String(row.timestamp) } : {}),
      ...(/^[0-9a-f]{64}$/i.test(row.content_sha256 || "") ? { content_sha256: String(row.content_sha256).toLowerCase() } : {}),
    };
    const key = sourceKey(row.source);
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(receipt);
  }
  return bySource;
}

export function collapseCoverage(coverage, scopesDoc, manifest = { observations: [] }) {
  if (!Array.isArray(coverage)) throw new Error("CENSUS-COVERAGE must be an array");
  const scopeMap = normalizeScopes(scopesDoc);
  const manifestReceipts = receiptsBySource(manifest);
  const jobs = new Map();
  for (const row of coverage) {
    if (!row || typeof row !== "object") throw new Error("coverage rows must be objects");
    if (!row.franchise || !row.performer) continue;
    const id = stableTaskId(row);
    const scope = scopeFor(row, scopeMap);
    if (!jobs.has(id)) {
      jobs.set(id, {
        id,
        scope: scope.id,
        scope_status: scope.status,
        franchise: String(row.franchise),
        character: String(row.character || ""),
        performer: String(row.performer || ""),
        categories: [],
        performance_modes: [],
        sources: [],
        source_receipts: [],
        performer_on_wall: false,
        role_on_wall: false,
        wall_ids: [],
        scope_priority: scope.priority,
      });
    }
    const job = jobs.get(id);
    if (row.category) job.categories.push(String(row.category));
    if (row.performance_mode) job.performance_modes.push(String(row.performance_mode));
    if (row.source) {
      job.sources.push(String(row.source));
      job.source_receipts.push(...(manifestReceipts.get(sourceKey(row.source)) || []));
    }
    job.performer_on_wall ||= Boolean(row.performer_on_wall);
    job.role_on_wall ||= Boolean(row.role_on_wall);
    if (Array.isArray(row.wall_ids)) job.wall_ids.push(...row.wall_ids.map(String));
  }

  const counts = new Map();
  for (const job of jobs.values()) {
    if (job.role_on_wall) continue;
    const key = normalize(job.performer);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (const job of jobs.values()) {
    job.categories = [...new Set(job.categories)].sort();
    job.performance_modes = [...new Set(job.performance_modes)].sort();
    job.sources = [...new Set(job.sources)].sort();
    job.source_receipts = [...new Map(job.source_receipts.map((receipt) => [JSON.stringify(receipt), receipt])).values()]
      .sort((a, b) => sourceKey(a.source).localeCompare(sourceKey(b.source)) || (a.revision || 0) - (b.revision || 0));
    job.wall_ids = [...new Set(job.wall_ids)].sort();
    const disposition = identityDisposition(job);
    const scopeActive = job.scope_status === "active";
    job.queueable = disposition.queueable && scopeActive;
    if (!disposition.queueable) job.source_review = { code: disposition.code, note: disposition.note };
    else if (!scopeActive) job.source_review = { code: "scope_inactive", note: `scope ${job.scope} is ${job.scope_status}` };
    job.source_fingerprint = sourceFingerprint(job);
    job.priority = jobPriority(job, counts.get(normalize(job.performer)) || 1, job.scope_priority);
    delete job.scope_priority;
  }
  return [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function comparableState(state) {
  const clone = copyJson(state);
  delete clone.updated_at;
  return JSON.stringify(clone);
}

export function event(op, task, at, extra = {}) {
  return { op, task_id: task.id, at, scope: task.scope, performer: task.performer, character: task.character, ...extra };
}

export function validateState(state) {
  if (!state || state.version !== AUTOPILOT_VERSION) throw new Error(`AUTOPILOT state must be version ${AUTOPILOT_VERSION}`);
  if (!state.source || typeof state.source !== "object") throw new Error("AUTOPILOT state needs source metadata");
  if (!Array.isArray(state.jobs)) throw new Error("AUTOPILOT jobs must be an array");
  const ids = new Set();
  const identities = new Set();
  for (const job of state.jobs) {
    if (!/^ap_[0-9a-f]{24}$/.test(job.id || "")) throw new Error(`invalid task id ${job.id || "<missing>"}`);
    if (ids.has(job.id)) throw new Error(`duplicate task id ${job.id}`);
    ids.add(job.id);
    const expected = stableTaskId(job);
    if (expected !== job.id) throw new Error(`task ${job.id} does not match its performer-role identity (${expected})`);
    const identity = [normalize(job.franchise), normalize(job.character), normalize(job.performer)].join("|");
    if (identities.has(identity)) throw new Error(`duplicate task identity ${identity}`);
    identities.add(identity);
    if (![...ACTIVE_STATUSES, ...TERMINAL_STATUSES].includes(job.status)) throw new Error(`task ${job.id} has invalid status ${job.status}`);
    if (!Number.isInteger(job.attempts) || job.attempts < 0) throw new Error(`task ${job.id} has invalid attempts`);
    if (job.status === "leased") {
      if (!job.lease?.id || !job.lease?.agent || !Number.isFinite(Date.parse(job.lease.expires_at))) throw new Error(`task ${job.id} has an invalid lease`);
      if (!/^[0-9a-f]{64}$/i.test(job.lease.readiness_token || "")) throw new Error(`task ${job.id} has an invalid lease readiness token`);
      const selection = job.lease.selection;
      if (!selection || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selection.profile_id || "")) throw new Error(`task ${job.id} lease lacks a valid capability profile`);
      if (!/^[0-9a-f]{64}$/i.test(selection.policy_sha256 || "")) throw new Error(`task ${job.id} lease lacks a valid capability-policy receipt`);
      if (!["priority-compatible", "reviewed-task"].includes(selection.strategy)) throw new Error(`task ${job.id} lease has an invalid capability selection strategy`);
      if (selection.strategy === "reviewed-task" && selection.requested_task_id !== job.id) throw new Error(`task ${job.id} reviewed selection does not bind its exact task id`);
      if (selection.strategy === "priority-compatible" && selection.requested_task_id != null) throw new Error(`task ${job.id} priority selection unexpectedly names an exact task`);
      if (!String(selection.basis || "").trim() || String(selection.basis).trim().length < 12) throw new Error(`task ${job.id} lease lacks a specific capability selection basis`);
      for (const key of ["profile_capabilities", "required_capabilities"]) {
        if (!Array.isArray(selection[key]) || new Set(selection[key]).size !== selection[key].length || selection[key].some((value) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))) {
          throw new Error(`task ${job.id} lease has invalid ${key}`);
        }
      }
      if (!Array.isArray(selection.requirement_reasons)) throw new Error(`task ${job.id} lease lacks capability requirement reasons`);
    } else if (job.lease) {
      throw new Error(`task ${job.id} carries a lease outside leased status`);
    }
    if (["resolved", "merged"].includes(job.status) && !job.role_on_wall) throw new Error(`task ${job.id} is ${job.status} without wall coverage`);
    if (job.status === "queued" && !job.queueable) throw new Error(`task ${job.id} is queued despite an unresolved source identity`);
    if (job.status === "drafted") {
      if (job.outcome?.kind !== "draft" || !job.outcome?.lease_id) throw new Error(`task ${job.id} has an invalid drafted receipt`);
      if (!/^[0-9a-f]{64}$/i.test(job.outcome.readiness_token || "")) throw new Error(`task ${job.id} drafted receipt has an invalid readiness token`);
      if (job.outcome.source_fingerprint !== job.source_fingerprint) throw new Error(`task ${job.id} drafted receipt has a stale source fingerprint`);
    }
    if (job.status === "merged") {
      if (job.outcome?.kind !== "merged" || !job.outcome?.lease_id) throw new Error(`task ${job.id} has an invalid merged receipt`);
      if (!/^[0-9a-f]{64}$/i.test(job.outcome.readiness_token || "")) throw new Error(`task ${job.id} merged receipt has an invalid readiness token`);
      if (job.outcome.source_fingerprint !== job.source_fingerprint) throw new Error(`task ${job.id} merged receipt has a stale source fingerprint`);
      if (!Array.isArray(job.wall_ids) || !job.wall_ids.length) throw new Error(`task ${job.id} is merged without wall IDs`);
    }
    if (job.status === "resolved" && job.outcome?.kind === "audited-wall") {
      if (!/^[0-9a-f]{64}$/i.test(job.outcome.review_sha256 || "")) throw new Error(`task ${job.id} has an invalid media review digest`);
      if (!/^[0-9a-f]{64}$/i.test(job.outcome.media_review?.corpus_sha256 || "")) throw new Error(`task ${job.id} has an invalid media corpus receipt`);
      if (!Array.isArray(job.outcome.media_review?.records) || !job.outcome.media_review.records.length) throw new Error(`task ${job.id} has no media review records`);
    }
    if (job.source_fingerprint !== sourceFingerprint(job)) throw new Error(`task ${job.id} has stale source_fingerprint`);
  }
  return true;
}
