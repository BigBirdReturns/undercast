import { randomBytes } from "node:crypto";
import {
  AUTOPILOT_VERSION,
  copyJson,
  event,
  normalize,
  sha256,
  sourceKey,
  validateState,
} from "./autopilot-model.mjs";
import { expireLeases } from "./autopilot-sync.mjs";

function makeLeaseId(agent, now) {
  return `lease_${sha256(`${agent}|${now}|${randomBytes(16).toString("hex")}`).slice(0, 24)}`;
}

export function claimTasks({ state, agent, scope, limit = 8, leaseMinutes = 120, allowInflight = false, now = new Date().toISOString() }) {
  if (!agent || !/^[a-zA-Z0-9._-]{2,64}$/.test(agent)) throw new Error("--agent must be 2-64 safe characters");
  const boundedLimit = Number(limit);
  const boundedMinutes = Number(leaseMinutes);
  if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 50) throw new Error("claim limit must be an integer from 1 to 50");
  if (!Number.isFinite(boundedMinutes) || boundedMinutes < 5 || boundedMinutes > 24 * 60) throw new Error("lease minutes must be from 5 to 1440");
  const next = copyJson(state);
  const events = expireLeases(next, now);
  const inFlight = next.jobs.filter((job) => ["leased", "drafted", "merged"].includes(job.status) && (!scope || job.scope === scope));
  if (!allowInflight && inFlight.length) {
    return { state: next, batch: null, reason: "inflight", in_flight: inFlight.map((job) => job.id), events, changed: events.length > 0 };
  }
  const claimable = next.jobs
    .filter((job) => job.status === "queued" && (!scope || job.scope === scope))
    .sort((a, b) => b.priority - a.priority || a.scope.localeCompare(b.scope) || a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));
  const selected = claimable.slice(0, boundedLimit);
  if (!selected.length) return { state: next, batch: null, reason: "empty", in_flight: [], events, changed: events.length > 0 };
  const leaseId = makeLeaseId(agent, now);
  const expiresAt = new Date(Date.parse(now) + boundedMinutes * 60_000).toISOString();
  const ids = new Set(selected.map((job) => job.id));
  for (const job of next.jobs) {
    if (!ids.has(job.id)) continue;
    job.status = "leased";
    job.attempts = (job.attempts || 0) + 1;
    job.lease = { id: leaseId, agent, claimed_at: now, expires_at: expiresAt };
    events.push(event("lease.claimed", job, now, { lease_id: leaseId, agent, expires_at: expiresAt }));
  }
  next.updated_at = now;
  validateState(next);
  const batch = {
    version: AUTOPILOT_VERSION,
    lease_id: leaseId,
    agent,
    claimed_at: now,
    expires_at: expiresAt,
    tasks: selected.map((job) => ({
      id: job.id,
      scope: job.scope,
      franchise: job.franchise,
      category: job.categories,
      character: job.character,
      performer: job.performer,
      performance_modes: job.performance_modes,
      sources: job.sources,
      source_receipts: job.source_receipts || [],
      performer_on_wall: job.performer_on_wall,
      priority: job.priority,
      attempt: job.attempts || 1,
    })),
  };
  return { state: next, batch, events, changed: true };
}

function httpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch { return ""; }
}

function validateDraft(job, draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw new Error(`task ${job.id}: draft decision needs a draft object`);
  const requiredStrings = ["character", "actor", "production", "universe", "years", "designer", "knownFor", "reveal"];
  for (const key of requiredStrings) if (!String(draft[key] || "").trim()) throw new Error(`task ${job.id}: draft.${key} is required`);
  if (normalize(draft.actor) !== normalize(job.performer)) throw new Error(`task ${job.id}: draft actor must match leased performer ${job.performer}`);
  if (normalize(draft.character) !== normalize(job.character)) throw new Error(`task ${job.id}: draft character must match leased role ${job.character}`);
  if (!Number.isInteger(Number(draft.transform)) || Number(draft.transform) < 1 || Number(draft.transform) > 5) throw new Error(`task ${job.id}: draft.transform must be 1-5`);
  if (draft.kind && !["face", "voice"].includes(draft.kind)) throw new Error(`task ${job.id}: draft.kind must be face or voice`);
  if (!Array.isArray(draft.references) || !draft.references.length) throw new Error(`task ${job.id}: draft.references must contain claim-level evidence`);
  const referenceSources = draft.references.map((ref) => ref?.source).filter(httpsUrl).map(normalizedUrl);
  const taskSources = job.sources.map(normalizedUrl);
  if (!referenceSources.some((source) => taskSources.includes(source))) {
    throw new Error(`task ${job.id}: at least one reference must cite the census source for this exact performer-role claim`);
  }
  if (!draft.references.some((ref) => ref?.claim === "performance" && httpsUrl(ref?.source))) {
    throw new Error(`task ${job.id}: a performance reference is required`);
  }
}

function validateEvidence(job, result) {
  if (!Array.isArray(result.evidence) || !result.evidence.length) throw new Error(`task ${job.id}: ${result.decision} needs evidence`);
  for (const [index, item] of result.evidence.entries()) {
    if (!item || typeof item !== "object" || !httpsUrl(item.source)) throw new Error(`task ${job.id}: evidence[${index}].source must be HTTPS`);
    if (!String(item.label || "").trim()) throw new Error(`task ${job.id}: evidence[${index}].label is required`);
  }
}

function draftIdentity(draft) {
  return [draft.actor, draft.character, draft.production].map(normalize).join("|");
}

export function submitResults({ state, batch, resultsDoc, drafts = [], now = new Date().toISOString() }) {
  if (!batch || batch.version !== AUTOPILOT_VERSION || !batch.lease_id || !Array.isArray(batch.tasks)) throw new Error("invalid batch file");
  if (!resultsDoc || resultsDoc.version !== AUTOPILOT_VERSION || resultsDoc.lease_id !== batch.lease_id) throw new Error("results lease_id/version does not match batch");
  if (resultsDoc.agent !== batch.agent) throw new Error("results agent does not match batch");
  if (!Array.isArray(resultsDoc.results)) throw new Error("results must be an array");
  const expected = new Set(batch.tasks.map((task) => task.id));
  const seen = new Set();
  for (const result of resultsDoc.results) {
    if (!result?.task_id || !expected.has(result.task_id)) throw new Error(`result targets a task outside lease ${batch.lease_id}: ${result?.task_id || "<missing>"}`);
    if (seen.has(result.task_id)) throw new Error(`duplicate result for task ${result.task_id}`);
    seen.add(result.task_id);
  }
  const missing = [...expected].filter((id) => !seen.has(id));
  if (missing.length) throw new Error(`lease submission is incomplete; missing ${missing.join(", ")}`);

  const next = copyJson(state);
  const nextDrafts = copyJson(drafts);
  if (!Array.isArray(nextDrafts)) throw new Error("data/drafts.json must be an array");
  const jobs = new Map(next.jobs.map((job) => [job.id, job]));
  const existingDrafts = new Map(nextDrafts.map((draft, index) => [draftIdentity(draft), index]));
  const events = [];

  for (const result of resultsDoc.results) {
    const job = jobs.get(result.task_id);
    if (!job || job.status !== "leased" || job.lease?.id !== batch.lease_id || job.lease?.agent !== batch.agent) {
      throw new Error(`task ${result.task_id} is no longer leased to ${batch.agent}/${batch.lease_id}`);
    }
    const decision = result.decision;
    if (decision === "draft") {
      validateDraft(job, result.draft);
      const row = { ...result.draft, _autopilot: { task_id: job.id, lease_id: batch.lease_id, submitted_by: batch.agent, submitted_at: now } };
      const key = draftIdentity(row);
      if (!existingDrafts.has(key)) {
        nextDrafts.push(row);
        existingDrafts.set(key, nextDrafts.length - 1);
      } else {
        const index = existingDrafts.get(key);
        nextDrafts[index] = { ...nextDrafts[index], _autopilot: row._autopilot };
      }
      job.status = "drafted";
      job.outcome = { kind: "draft", submitted_at: now, submitted_by: batch.agent, draft_identity: key, lease_id: batch.lease_id };
      events.push(event("task.drafted", job, now, { lease_id: batch.lease_id, agent: batch.agent }));
    } else if (decision === "reject") {
      if (!String(result.reason || "").trim() || String(result.reason).trim().length < 12) throw new Error(`task ${job.id}: rejection needs a specific reason`);
      validateEvidence(job, result);
      job.status = "rejected";
      job.outcome = { kind: "rejection", reason: String(result.reason).trim(), evidence: result.evidence, decided_at: now, decided_by: batch.agent, source_fingerprint: job.source_fingerprint };
      events.push(event("task.rejected", job, now, { lease_id: batch.lease_id, agent: batch.agent }));
    } else if (decision === "blocked") {
      if (!String(result.reason || "").trim() || String(result.reason).trim().length < 12) throw new Error(`task ${job.id}: blocked result needs a specific reason`);
      validateEvidence(job, result);
      const retry = result.retry_after ? new Date(result.retry_after).toISOString() : null;
      if (!retry && result.until_source_changes !== true) throw new Error(`task ${job.id}: blocked result needs retry_after or until_source_changes:true`);
      if (retry && Date.parse(retry) <= Date.parse(now)) throw new Error(`task ${job.id}: retry_after must be in the future`);
      job.status = "blocked";
      job.outcome = { kind: "blocked", reason: String(result.reason).trim(), evidence: result.evidence, decided_at: now, decided_by: batch.agent, source_fingerprint: job.source_fingerprint, until_source_changes: result.until_source_changes === true };
      if (retry) job.next_retry_at = retry;
      events.push(event("task.blocked", job, now, { lease_id: batch.lease_id, agent: batch.agent, retry_after: retry || "source-change" }));
    } else {
      throw new Error(`task ${job.id}: unsupported decision ${decision}`);
    }
    delete job.lease;
  }

  next.updated_at = now;
  next.jobs = [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id));
  validateState(next);
  return { state: next, drafts: nextDrafts, events, changed: true };
}

function validateMediaFacet(job, ledger, report, kind) {
  const asset = ledger[kind];
  const expectedSubject = kind === "still" ? job.character : job.performer;
  if (!report || typeof report !== "object") throw new Error(`task ${job.id}/${ledger.id}: ${kind} review is required`);
  if (!String(report.note || "").trim() || String(report.note).trim().length < 12) {
    throw new Error(`task ${job.id}/${ledger.id}: ${kind} review needs a specific visual note`);
  }
  if (asset == null) {
    if (report.disposition !== "absent") throw new Error(`task ${job.id}/${ledger.id}: ${kind} is absent in SOURCES and must be reported absent`);
    return { disposition: "absent", note: String(report.note).trim() };
  }
  if (report.disposition !== "verified") throw new Error(`task ${job.id}/${ledger.id}: available ${kind} must be visually verified`);
  if (normalize(report.subject) !== normalize(expectedSubject)) {
    throw new Error(`task ${job.id}/${ledger.id}: ${kind} subject must be ${expectedSubject}`);
  }
  if (!httpsUrl(report.source) || sourceKey(report.source) !== sourceKey(asset.origin)) {
    throw new Error(`task ${job.id}/${ledger.id}: ${kind} review source must match SOURCES origin`);
  }
  return {
    disposition: "verified",
    subject: expectedSubject,
    source: String(report.source),
    note: String(report.note).trim(),
  };
}

export function completeReviews({ state, reviewDoc, sourceLedger, corpusSha256, now = new Date().toISOString() }) {
  if (!reviewDoc || reviewDoc.version !== AUTOPILOT_VERSION) throw new Error("invalid media review document version");
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(reviewDoc.reviewed_by || "")) throw new Error("media review needs reviewed_by");
  if (!reviewDoc.lease_id) throw new Error("media review needs the originating lease_id");
  if (!Array.isArray(reviewDoc.reviews) || !reviewDoc.reviews.length) throw new Error("media review needs a reviews array");
  if (!Array.isArray(sourceLedger)) throw new Error("data/SOURCES.json must be an array");
  if (!/^[0-9a-f]{64}$/i.test(corpusSha256 || "")) throw new Error("media review needs a corpus SHA-256 receipt");

  const next = copyJson(state);
  const jobs = new Map(next.jobs.map((job) => [job.id, job]));
  const ledgerById = new Map(sourceLedger.map((row) => [row?.id, row]));
  const seen = new Set();
  const events = [];

  for (const review of reviewDoc.reviews) {
    if (!review?.task_id || seen.has(review.task_id)) throw new Error(`duplicate or missing media review task ${review?.task_id || "<missing>"}`);
    seen.add(review.task_id);
    const job = jobs.get(review.task_id);
    if (!job) throw new Error(`unknown media review task ${review.task_id}`);
    if (job.status !== "merged" || !job.role_on_wall) throw new Error(`task ${job.id} is not awaiting post-merge media review`);
    if (job.outcome?.lease_id !== reviewDoc.lease_id) throw new Error(`task ${job.id} does not belong to lease ${reviewDoc.lease_id}`);
    if (!Array.isArray(review.records)) throw new Error(`task ${job.id}: records must be an array`);
    const expectedIds = new Set(job.wall_ids || []);
    if (!expectedIds.size) throw new Error(`task ${job.id}: merged task has no wall IDs to review`);
    const suppliedIds = new Set(review.records.map((record) => record?.wall_id));
    if (suppliedIds.size !== review.records.length) throw new Error(`task ${job.id}: duplicate wall_id in media review`);
    const missing = [...expectedIds].filter((id) => !suppliedIds.has(id));
    const extra = [...suppliedIds].filter((id) => !expectedIds.has(id));
    if (missing.length || extra.length) throw new Error(`task ${job.id}: media review wall IDs mismatch (missing ${missing.join(",") || "none"}; extra ${extra.join(",") || "none"})`);

    const records = [];
    for (const record of review.records) {
      const ledger = ledgerById.get(record.wall_id);
      if (!ledger) throw new Error(`task ${job.id}: SOURCES has no row for ${record.wall_id}`);
      if (!ledger.fetched_at) throw new Error(`task ${job.id}/${record.wall_id}: SOURCES lacks fetched_at`);
      if (normalize(ledger.actor) !== normalize(job.performer) || normalize(ledger.character) !== normalize(job.character)) {
        throw new Error(`task ${job.id}/${record.wall_id}: SOURCES identity does not match performer-role`);
      }
      records.push({
        wall_id: record.wall_id,
        fetched_at: ledger.fetched_at,
        still: validateMediaFacet(job, ledger, record.still, "still"),
        portrait: validateMediaFacet(job, ledger, record.portrait, "portrait"),
      });
    }

    const reviewReceipt = {
      reviewed_by: reviewDoc.reviewed_by,
      reviewed_at: now,
      lease_id: reviewDoc.lease_id,
      corpus_sha256: corpusSha256.toLowerCase(),
      records,
    };
    const reviewSha = sha256(JSON.stringify(reviewReceipt));
    job.status = "resolved";
    job.outcome = { kind: "audited-wall", resolved_at: now, wall_ids: job.wall_ids, media_review: reviewReceipt, review_sha256: reviewSha };
    events.push(event("task.media-verified", job, now, { lease_id: reviewDoc.lease_id, reviewed_by: reviewDoc.reviewed_by, wall_ids: job.wall_ids, review_sha256: reviewSha }));
  }

  next.updated_at = now;
  next.jobs = [...jobs.values()].sort((a, b) => a.id.localeCompare(b.id));
  validateState(next);
  return { state: next, events, changed: true };
}

export function requeueTask({ state, taskId, reason, now = new Date().toISOString() }) {
  if (!String(reason || "").trim()) throw new Error("requeue requires --reason");
  const next = copyJson(state);
  const job = next.jobs.find((item) => item.id === taskId);
  if (!job) throw new Error(`unknown task ${taskId}`);
  if (job.role_on_wall) throw new Error(`task ${taskId} is already resolved on the wall`);
  job.status = job.queueable ? "queued" : "attention";
  delete job.lease;
  delete job.next_retry_at;
  job.outcome = { kind: "manual-requeue", reason: String(reason).trim(), at: now };
  next.updated_at = now;
  validateState(next);
  return { state: next, events: [event("task.requeued", job, now, { reason: String(reason).trim() })] };
}

export function statusSummary(state, { scope, now = new Date().toISOString() } = {}) {
  const jobs = (state.jobs || []).filter((job) => !scope || job.scope === scope);
  const statuses = {};
  const scopes = {};
  for (const job of jobs) {
    statuses[job.status] = (statuses[job.status] || 0) + 1;
    scopes[job.scope] ||= { total: 0, statuses: {} };
    scopes[job.scope].total++;
    scopes[job.scope].statuses[job.status] = (scopes[job.scope].statuses[job.status] || 0) + 1;
  }
  const claimable = jobs.filter((job) => job.status === "queued").length;
  const inFlight = jobs.filter((job) => ["leased", "drafted", "merged"].includes(job.status)).length;
  const expired = jobs.filter((job) => job.status === "leased" && Date.parse(job.lease?.expires_at) <= Date.parse(now)).length;
  return {
    version: state.version,
    updated_at: state.updated_at,
    coverage_sha256: state.source?.coverage_sha256 || "",
    total: jobs.length,
    claimable,
    in_flight: inFlight,
    expired_leases: expired,
    statuses,
    scopes,
  };
}
