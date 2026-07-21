import {
  AUTOPILOT_VERSION,
  collapseCoverage,
  comparableState,
  copyJson,
  emptyState,
  event,
  normalize,
  validateState,
} from "./autopilot-model.mjs";

function draftIdentity(draft) {
  return [draft.actor, draft.character, draft.production].map(normalize).join("|");
}

function reopenForSourceChange(job, incoming, now, events) {
  if (job.source_fingerprint === incoming.source_fingerprint) return;
  if (["rejected", "blocked", "attention", "retired"].includes(job.status)) {
    job.status = incoming.queueable ? "queued" : "attention";
    delete job.outcome;
    delete job.next_retry_at;
    events.push(event("task.reopened", job, now, { reason: "source_changed" }));
  }
}

export function expireLeases(state, now = new Date().toISOString()) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error(`invalid now timestamp: ${now}`);
  const events = [];
  for (const job of state.jobs || []) {
    if (job.status !== "leased" || !job.lease) continue;
    const expires = Date.parse(job.lease.expires_at);
    if (!Number.isFinite(expires)) throw new Error(`task ${job.id} has invalid lease expiry`);
    if (expires <= nowMs) {
      const leaseId = job.lease.id;
      job.status = job.queueable ? "queued" : "attention";
      delete job.lease;
      events.push(event("lease.expired", job, now, { lease_id: leaseId }));
    }
  }
  return events;
}

function wallIdsFromSpecimens(job, specimens) {
  const performer = normalize(job.performer);
  const character = normalize(job.character);
  const ids = [];
  for (const specimen of specimens || []) {
    if (!specimen || typeof specimen !== "object") continue;
    const people = [specimen.actor, ...(specimen.aliases || [])].map(normalize);
    if (!people.includes(performer)) continue;
    const roles = [specimen.character, ...(specimen.performances || []).map((item) => item?.character)].map(normalize);
    if (roles.includes(character) && specimen.id) ids.push(String(specimen.id));
  }
  return [...new Set(ids)].sort();
}

function pendingDraftsByTask(drafts) {
  if (!Array.isArray(drafts)) throw new Error("data/drafts.json must be an array");
  const byTask = new Map();
  for (const draft of drafts) {
    const taskId = draft?._autopilot?.task_id;
    if (!taskId) continue;
    if (byTask.has(taskId)) throw new Error(`data/drafts.json contains duplicate autopilot task ${taskId}`);
    byTask.set(taskId, draft);
  }
  return byTask;
}

function latestGrowthRejection(job, growthRejections, submittedAt) {
  const floor = Date.parse(submittedAt || "");
  return (growthRejections || [])
    .filter((row) => row?.op === "draft.reject"
      && normalize(row.actor_name) === normalize(job.performer)
      && normalize(row.character) === normalize(job.character)
      && (!Number.isFinite(floor) || Date.parse(row.ts || row.at || "") >= floor))
    .sort((a, b) => Date.parse(b.ts || b.at || "") - Date.parse(a.ts || a.at || ""))[0] || null;
}

function readinessToken(scope, tokens) {
  if (tokens instanceof Map) return tokens.get(scope) || "";
  return String(tokens?.[scope] || "");
}

function staleAutopilotReceipt(job, tokens) {
  if (!["drafted", "merged"].includes(job.status) && !["draft", "merged"].includes(job.outcome?.kind)) return null;
  const expected = readinessToken(job.scope, tokens);
  if (!expected || job.outcome?.readiness_token !== expected) return "readiness_token_changed";
  if (job.outcome?.source_fingerprint !== job.source_fingerprint) return "source_fingerprint_changed";
  return null;
}

function mergeDraftReceipt(job, wallIds, now, events) {
  const ids = [...new Set(wallIds || [])].sort();
  if (job.status !== "merged" || JSON.stringify(job.wall_ids) !== JSON.stringify(ids)) {
    events.push(event("task.merged", job, now, { wall_ids: ids }));
  }
  job.status = "merged";
  job.wall_ids = ids;
  job.outcome = {
    kind: "merged",
    merged_at: job.outcome?.merged_at || now,
    submitted_at: job.outcome?.submitted_at || now,
    submitted_by: job.outcome?.submitted_by || "reconciled",
    lease_id: job.outcome?.lease_id || "",
    readiness_token: job.outcome?.readiness_token || "",
    source_fingerprint: job.outcome?.source_fingerprint || job.source_fingerprint,
    wall_ids: ids,
  };
  delete job.lease;
  delete job.next_retry_at;
}

function applyDraftFeedback(job, { pendingDrafts, growthRejections, readinessTokens, now }, events) {
  const pendingDraft = pendingDrafts.get(job.id);
  const pending = Boolean(pendingDraft);
  if (pending && job.status !== "resolved") {
    const metadata = pendingDraft?._autopilot || {};
    const expectedToken = readinessToken(job.scope, readinessTokens);
    const staleReason = metadata.source_fingerprint !== job.source_fingerprint
      ? "source_fingerprint_changed"
      : !expectedToken || metadata.readiness_token !== expectedToken
        ? "readiness_token_changed"
        : null;
    if (staleReason) {
      job.status = "attention";
      job.outcome = {
        kind: "stale-draft",
        observed_at: now,
        reason: staleReason,
        lease_id: metadata.lease_id || job.outcome?.lease_id || "",
        note: "the pending draft was authored against a producer or census snapshot that is no longer current",
      };
      delete job.lease;
      delete job.next_retry_at;
      events.push(event("task.attention", job, now, { reason: staleReason }));
      return;
    }
    if (job.status !== "drafted") events.push(event("draft.detected", job, now));
    job.status = "drafted";
    job.outcome = {
      kind: "draft",
      submitted_at: job.outcome?.submitted_at || metadata.submitted_at || now,
      submitted_by: job.outcome?.submitted_by || metadata.submitted_by || "reconciled",
      draft_identity: job.outcome?.draft_identity || draftIdentity(pendingDraft),
      lease_id: job.outcome?.lease_id || metadata.lease_id || "",
      readiness_token: metadata.readiness_token,
      source_fingerprint: metadata.source_fingerprint,
    };
    delete job.lease;
    delete job.next_retry_at;
    return;
  }
  if (job.status !== "drafted" || pending || job.role_on_wall) return;
  const staleReason = staleAutopilotReceipt(job, readinessTokens);
  if (staleReason) {
    job.status = "attention";
    job.outcome = {
      kind: "stale-draft",
      observed_at: now,
      reason: staleReason,
      lease_id: job.outcome?.lease_id || "",
      note: "the consumed draft no longer matches the certified producer and source snapshot",
    };
    events.push(event("task.attention", job, now, { reason: staleReason }));
    return;
  }

  const rejection = latestGrowthRejection(job, growthRejections, job.outcome?.submitted_at);
  if (!rejection) {
    job.status = "attention";
    job.outcome = {
      kind: "draft-consumed-without-receipt",
      observed_at: now,
      note: "the tagged draft is no longer pending, no exact wall record exists, and grow.mjs left no matching rejection receipt",
    };
    events.push(event("task.attention", job, now, { reason: "draft_consumed_without_receipt" }));
    return;
  }

  const reason = String(rejection.reason || "grow.mjs rejected the draft");
  if (/unverified on Wikipedia/i.test(reason)) {
    job.status = "blocked";
    job.outcome = {
      kind: "growth-rejection",
      reason,
      decided_at: rejection.ts || rejection.at || now,
      decided_by: rejection.actor || "grow.mjs",
      source_fingerprint: job.source_fingerprint,
      until_source_changes: true,
    };
    events.push(event("task.blocked", job, now, { reason: "growth_gate_rejection" }));
  } else {
    job.status = "attention";
    job.outcome = {
      kind: "growth-rejection",
      reason,
      decided_at: rejection.ts || rejection.at || now,
      decided_by: rejection.actor || "grow.mjs",
      source_fingerprint: job.source_fingerprint,
    };
    events.push(event("task.attention", job, now, { reason: "growth_gate_rejection" }));
  }
}

export function syncState({ coverage, scopes, manifest = { observations: [] }, state = emptyState(), coverageSha256, sourcePaths = {}, drafts = [], specimens = [], growthRejections = [], readinessTokens = {}, now = new Date().toISOString() }) {
  if (!Array.isArray(specimens)) throw new Error("data/specimens.json must be an array");
  if (!Array.isArray(growthRejections)) throw new Error("growth rejection journal must be an array");
  const pendingDrafts = pendingDraftsByTask(drafts);
  const before = comparableState(state);
  const next = copyJson(state);
  if (next.version !== AUTOPILOT_VERSION) throw new Error(`unsupported AUTOPILOT version ${next.version}`);
  if (!Array.isArray(next.jobs)) next.jobs = [];
  const events = expireLeases(next, now);
  const incoming = collapseCoverage(coverage, scopes, manifest);
  const oldById = new Map(next.jobs.map((job) => [job.id, job]));
  const incomingIds = new Set();
  const merged = [];

  for (const fresh of incoming) {
    const directWallIds = wallIdsFromSpecimens(fresh, specimens);
    if (directWallIds.length) {
      fresh.performer_on_wall = true;
      fresh.role_on_wall = true;
      fresh.wall_ids = [...new Set([...(fresh.wall_ids || []), ...directWallIds])].sort();
    }
    incomingIds.add(fresh.id);
    const old = oldById.get(fresh.id);
    if (!old) {
      const hasPendingDraft = pendingDrafts.has(fresh.id);
      const status = hasPendingDraft ? (fresh.queueable ? "queued" : "attention") : fresh.role_on_wall ? "resolved" : fresh.queueable ? "queued" : "attention";
      const job = {
        ...fresh,
        status,
        attempts: 0,
        first_seen_at: now,
        last_seen_coverage_sha256: coverageSha256,
      };
      if (status === "resolved") job.outcome = { kind: "wall", resolved_at: now, wall_ids: fresh.wall_ids };
      else if (status === "attention") job.outcome = { kind: "source-review", ...fresh.source_review, observed_at: now };
      events.push(event("task.created", job, now, { status: job.status }));
      applyDraftFeedback(job, { pendingDrafts, growthRejections, readinessTokens, now }, events);
      if (fresh.role_on_wall && job.status === "drafted") mergeDraftReceipt(job, fresh.wall_ids, now, events);
      merged.push(job);
      continue;
    }

    const job = { ...old };
    reopenForSourceChange(job, fresh, now, events);
    Object.assign(job, fresh, {
      first_seen_at: old.first_seen_at || now,
      attempts: Number.isInteger(old.attempts) ? old.attempts : 0,
      last_seen_coverage_sha256: coverageSha256,
    });

    const staleReason = staleAutopilotReceipt(job, readinessTokens);
    if (staleReason) {
      job.status = "attention";
      job.outcome = {
        kind: fresh.role_on_wall ? "stale-merged-result" : "stale-draft",
        observed_at: now,
        reason: staleReason,
        wall_ids: fresh.wall_ids || [],
        lease_id: old.outcome?.lease_id || "",
        note: "the autonomous result was created under a producer or census snapshot that is no longer current",
      };
      delete job.lease;
      delete job.next_retry_at;
      events.push(event("task.attention", job, now, { reason: staleReason }));
      merged.push(job);
      continue;
    }

    if (fresh.role_on_wall) {
      const needsMediaReview = ["drafted", "merged"].includes(job.status) || ["draft", "merged"].includes(job.outcome?.kind);
      if (needsMediaReview) {
        mergeDraftReceipt(job, fresh.wall_ids, now, events);
      } else {
        if (job.status !== "resolved" || JSON.stringify(job.wall_ids) !== JSON.stringify(fresh.wall_ids)) {
          events.push(event("task.resolved", job, now, { wall_ids: fresh.wall_ids }));
        }
        job.status = "resolved";
        job.outcome = job.outcome?.kind === "audited-wall"
          ? { ...job.outcome, wall_ids: fresh.wall_ids }
          : { kind: "wall", resolved_at: job.outcome?.resolved_at || now, wall_ids: fresh.wall_ids };
      }
      delete job.lease;
      delete job.next_retry_at;
    } else if (job.status === "retired") {
      job.status = fresh.queueable ? "queued" : "attention";
      job.outcome = fresh.queueable
        ? { kind: "coverage-returned", observed_at: now }
        : { kind: "source-review", ...fresh.source_review, observed_at: now };
      events.push(event("task.reopened", job, now, { reason: "coverage_returned" }));
    } else if (!fresh.queueable && !["rejected", "drafted"].includes(job.status)) {
      job.status = "attention";
      job.outcome = { kind: "source-review", ...fresh.source_review, observed_at: job.outcome?.observed_at || now };
      delete job.lease;
    } else if (fresh.queueable && job.status === "attention" && job.outcome?.kind === "source-review") {
      job.status = "queued";
      delete job.outcome;
      events.push(event("task.reopened", job, now, { reason: "source_identity_cleared" }));
    } else if (job.status === "blocked" && job.next_retry_at && Date.parse(job.next_retry_at) <= Date.parse(now)) {
      job.status = "queued";
      delete job.next_retry_at;
      delete job.outcome;
      events.push(event("task.reopened", job, now, { reason: "retry_due" }));
    } else if (["resolved", "merged"].includes(job.status) && !fresh.role_on_wall) {
      job.status = "attention";
      job.outcome = { kind: "coverage-regression", observed_at: now, note: "task was resolved previously but the current coverage no longer maps it to a wall record" };
      events.push(event("task.attention", job, now, { reason: "coverage_regression" }));
    }
    applyDraftFeedback(job, { pendingDrafts, growthRejections, readinessTokens, now }, events);
    merged.push(job);
  }

  for (const old of next.jobs) {
    if (incomingIds.has(old.id)) continue;
    const job = { ...old };
    if (job.status !== "retired") {
      job.status = "retired";
      job.outcome = { kind: "not-in-latest-coverage", retired_at: now };
      delete job.lease;
      events.push(event("task.retired", job, now));
    }
    merged.push(job);
  }

  next.source = {
    ...(next.source || {}),
    ...sourcePaths,
    coverage_path: next.source?.coverage_path || "data/CENSUS-COVERAGE.json",
    coverage_sha256: coverageSha256,
    scopes_path: next.source?.scopes_path || "data/AUTOPILOT-SCOPES.json",
    certifications_path: next.source?.certifications_path || "data/AUTOPILOT-CERTIFICATIONS.json",
    manifest_path: next.source?.manifest_path || "data/CENSUS-MANIFEST.json",
    drafts_path: next.source?.drafts_path || "data/drafts.json",
    specimens_path: next.source?.specimens_path || "data/specimens.json",
    growth_rejections_path: next.source?.growth_rejections_path || "data/journal/rejections.jsonl",
  };
  next.jobs = merged.sort((a, b) => a.id.localeCompare(b.id));
  validateState(next);
  const changed = before !== comparableState(next);
  if (changed) next.updated_at = now;
  return { state: next, events, changed };
}
