const ID = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const ROLES = new Set(["machine", "second-desk", "owner"]);
const OPS = new Set(["gte", "lte", "eq", "gt", "lt"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function triggerObject(tuple, label, metrics) {
  invariant(Array.isArray(tuple) && tuple.length === 3, `${label} must be [metric, op, value]`);
  const [metric, op, value] = tuple;
  invariant(metrics.has(metric), `${label} references unknown metric ${metric}`);
  invariant(OPS.has(op), `${label} has unsupported operator ${op}`);
  invariant(Number.isFinite(value), `${label} needs a numeric value`);
  return { metric, op, value };
}

function detectCycles(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail = []) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`roadmap dependency cycle: ${[...trail, id].join(" -> ")}`);
    visiting.add(id);
    for (const dep of byId.get(id).deps) visit(dep, [...trail, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const row of rows) visit(row.id);
}

export function validateRoadmap(roadmap) {
  invariant(roadmap?.version === 1, "ROADMAP must be version 1");
  invariant(String(roadmap.document || "").trim(), "ROADMAP needs document");
  invariant(roadmap.horizon?.start && roadmap.horizon?.end, "ROADMAP needs horizon");
  invariant(String(roadmap.north_star || "").trim(), "ROADMAP needs north_star");
  invariant(Array.isArray(roadmap.metrics) && roadmap.metrics.length, "ROADMAP needs metrics");
  invariant(Array.isArray(roadmap.adoption) && roadmap.adoption.length, "ROADMAP needs adoption stages");
  invariant(Array.isArray(roadmap.scale), "ROADMAP scale must be an array");
  invariant(Array.isArray(roadmap.milestones) && roadmap.milestones.length, "ROADMAP needs milestones");

  const metrics = new Set();
  for (const id of roadmap.metrics) {
    invariant(ID.test(id || ""), `invalid metric id ${id || "<missing>"}`);
    invariant(!metrics.has(id), `duplicate metric id ${id}`);
    metrics.add(id);
  }

  const ids = new Set();
  const seqs = new Set();
  for (const row of roadmap.milestones) {
    invariant(ID.test(row.id || ""), `invalid milestone id ${row.id || "<missing>"}`);
    invariant(!ids.has(row.id), `duplicate milestone id ${row.id}`);
    ids.add(row.id);
    invariant(Number.isInteger(row.seq) && row.seq >= 0, `milestone ${row.id} needs seq`);
    invariant(!seqs.has(row.seq), `duplicate milestone seq ${row.seq}`);
    seqs.add(row.seq);
    invariant(String(row.window || "").trim(), `milestone ${row.id} needs window`);
    invariant(ROLES.has(row.authority), `milestone ${row.id} has invalid authority ${row.authority}`);
    invariant(Array.isArray(row.deps), `milestone ${row.id} deps must be an array`);
    invariant(Array.isArray(row.decisions), `milestone ${row.id} decisions must be an array`);
    invariant(Array.isArray(row.triggers), `milestone ${row.id} triggers must be an array`);
    invariant(String(row.guide || "").startsWith(`${roadmap.document}#`), `milestone ${row.id} guide must point into ${roadmap.document}`);
    for (const decision of row.decisions) invariant(ID.test(decision || ""), `milestone ${row.id} has invalid decision id ${decision}`);
    for (const [index, trigger] of row.triggers.entries()) triggerObject(trigger, `milestone ${row.id} trigger[${index}]`, metrics);
  }

  for (const row of roadmap.milestones) {
    for (const dep of row.deps) {
      invariant(ids.has(dep), `milestone ${row.id} depends on unknown milestone ${dep}`);
      invariant(dep !== row.id, `milestone ${row.id} depends on itself`);
    }
  }
  detectCycles(roadmap.milestones);

  const stageIds = new Set();
  const stageOrders = new Set();
  for (const row of roadmap.adoption) {
    invariant(ID.test(row.id || ""), `invalid adoption id ${row.id || "<missing>"}`);
    invariant(!stageIds.has(row.id), `duplicate adoption id ${row.id}`);
    stageIds.add(row.id);
    invariant(Number.isInteger(row.order) && row.order >= 0, `adoption ${row.id} needs order`);
    invariant(!stageOrders.has(row.order), `duplicate adoption order ${row.order}`);
    stageOrders.add(row.order);
    invariant(row.entry == null || ids.has(row.entry), `adoption ${row.id} references unknown entry ${row.entry}`);
  }

  const scaleIds = new Set();
  for (const row of roadmap.scale) {
    invariant(ID.test(row.id || ""), `invalid scale id ${row.id || "<missing>"}`);
    invariant(!scaleIds.has(row.id), `duplicate scale id ${row.id}`);
    scaleIds.add(row.id);
    triggerObject(row.trigger, `scale ${row.id}`, metrics);
  }
  return true;
}

function completionMap(state) {
  return new Map((state.completed || []).map((row) => [row.milestone, row]));
}

function decisionSet(state) {
  return new Set((state.decisions || []).map((row) => row.id));
}

function roleCanClose(authority, reviewerRole) {
  if (authority === "machine") return ROLES.has(reviewerRole);
  if (authority === "second-desk") return reviewerRole === "second-desk" || reviewerRole === "owner";
  return reviewerRole === "owner";
}

export function validateRoadmapState(roadmap, state) {
  validateRoadmap(roadmap);
  invariant(state?.version === 1, "ROADMAP-STATE must be version 1");
  invariant(Array.isArray(state.completed), "ROADMAP-STATE completed must be an array");
  invariant(Array.isArray(state.decisions), "ROADMAP-STATE decisions must be an array");
  invariant(state.metrics && typeof state.metrics === "object" && !Array.isArray(state.metrics), "ROADMAP-STATE metrics must be an object");
  invariant(Array.isArray(state.notes || []), "ROADMAP-STATE notes must be an array");

  const knownMetrics = new Set(roadmap.metrics);
  for (const key of Object.keys(state.metrics)) invariant(knownMetrics.has(key), `ROADMAP-STATE has unknown metric ${key}`);
  for (const key of knownMetrics) {
    const value = state.metrics[key];
    invariant(value == null || Number.isFinite(value), `ROADMAP-STATE metric ${key} must be numeric or null`);
  }

  const decisions = new Set();
  for (const row of state.decisions) {
    invariant(row && ID.test(row.id || ""), `invalid roadmap decision id ${row?.id || "<missing>"}`);
    invariant(!decisions.has(row.id), `duplicate roadmap decision ${row.id}`);
    decisions.add(row.id);
    invariant(String(row.decided_by || "").trim(), `roadmap decision ${row.id} needs decided_by`);
    invariant(Number.isFinite(Date.parse(row.decided_at || "")), `roadmap decision ${row.id} needs decided_at`);
    invariant(String(row.evidence || "").trim(), `roadmap decision ${row.id} needs evidence`);
  }

  const byId = new Map(roadmap.milestones.map((row) => [row.id, row]));
  const completed = new Set();
  for (const row of state.completed) {
    invariant(row && byId.has(row.milestone), `completion references unknown milestone ${row?.milestone || "<missing>"}`);
    invariant(!completed.has(row.milestone), `duplicate milestone completion ${row.milestone}`);
    const milestone = byId.get(row.milestone);
    invariant(Number.isFinite(Date.parse(row.completed_at || "")), `milestone ${row.milestone} needs completed_at`);
    invariant(String(row.reviewed_by || "").trim(), `milestone ${row.milestone} needs reviewed_by`);
    invariant(ROLES.has(row.reviewed_role), `milestone ${row.milestone} has invalid reviewed_role`);
    invariant(roleCanClose(milestone.authority, row.reviewed_role), `${row.reviewed_role} cannot close ${milestone.authority} milestone ${row.milestone}`);
    invariant(Array.isArray(row.evidence) && row.evidence.length, `milestone ${row.milestone} needs evidence`);
    for (const evidence of row.evidence) {
      invariant(evidence && ["commit","pull-request","workflow-run","decision","snapshot","report","metric"].includes(evidence.type), `milestone ${row.milestone} has invalid evidence type`);
      invariant(String(evidence.value || "").trim(), `milestone ${row.milestone} evidence needs value`);
    }
    for (const decision of milestone.decisions) invariant(decisions.has(decision), `milestone ${row.milestone} is complete without required decision ${decision}`);
    for (const dep of milestone.deps) invariant(completed.has(dep), `milestone ${row.milestone} is complete before dependency ${dep}`);
    completed.add(row.milestone);
  }
  return true;
}

export function triggerSatisfied(trigger, metrics = {}) {
  const [metric, op, target] = trigger;
  const value = metrics[metric];
  if (!Number.isFinite(value)) return false;
  if (op === "gte") return value >= target;
  if (op === "lte") return value <= target;
  if (op === "gt") return value > target;
  if (op === "lt") return value < target;
  return value === target;
}

export function deriveMilestoneStates(roadmap, state) {
  validateRoadmapState(roadmap, state);
  const completed = completionMap(state);
  const decisions = decisionSet(state);
  return roadmap.milestones.slice().sort((a,b) => a.seq - b.seq).map((row) => {
    if (completed.has(row.id)) return { ...row, state: "complete", reasons: [] };
    const reasons = [];
    const deps = row.deps.filter((id) => !completed.has(id));
    if (deps.length) reasons.push(`missing dependencies: ${deps.join(", ")}`);
    const missingDecisions = row.decisions.filter((id) => !decisions.has(id));
    if (missingDecisions.length) reasons.push(`missing owner decisions: ${missingDecisions.join(", ")}`);
    const failed = row.triggers.filter((trigger) => !triggerSatisfied(trigger, state.metrics));
    if (failed.length) reasons.push(`unmet triggers: ${failed.map(([m,o,v]) => `${m} ${o} ${v}`).join(", ")}`);
    return { ...row, state: reasons.length ? "blocked" : "ready", reasons };
  });
}

export function nextMilestones(roadmap, state, { limit = 3 } = {}) {
  const count = Number(limit);
  invariant(Number.isInteger(count) && count > 0, "roadmap next limit must be positive");
  return deriveMilestoneStates(roadmap, state).filter((row) => row.state === "ready").slice(0, count);
}

export function currentAdoptionStage(roadmap, state) {
  validateRoadmapState(roadmap, state);
  const complete = completionMap(state);
  return roadmap.adoption.slice().sort((a,b) => a.order - b.order)
    .filter((row) => row.entry == null || complete.has(row.entry)).at(-1);
}

export function firedScaleTriggers(roadmap, state) {
  validateRoadmapState(roadmap, state);
  return roadmap.scale.filter((row) => triggerSatisfied(row.trigger, state.metrics));
}
