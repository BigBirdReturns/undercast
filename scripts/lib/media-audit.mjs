import { createHash } from "node:crypto";

export const MEDIA_AUDIT_VERSION = 2;

export const REVIEWER_ROLES = Object.freeze({
  machine: { weight: 1, rank: 0 },
  reviewer: { weight: 1, rank: 1 },
  "second-desk": { weight: 2, rank: 2 },
  owner: { weight: 3, rank: 3 },
});

export const CLAIM_VALUES = Object.freeze({
  identity: new Set(["expected", "wrong", "ambiguous"]),
  portrait: new Set(["neutral-human", "role-depiction", "group", "non-person", "ambiguous"]),
  still: new Set(["character-depiction", "non-performance", "ambiguous"]),
});

export const POSITIVE_VALUE = Object.freeze({
  identity: "expected",
  portrait: "neutral-human",
  still: "character-depiction",
});

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const stableJson = (value) => `${JSON.stringify(sortValue(value), null, 2)}\n`;
export const copyJson = (value) => JSON.parse(JSON.stringify(value));

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

export function normalize(value) {
  return String(value || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
}

export function mediaItemId(scope, wallId, side) {
  return `ma_${sha256(`${scope}|${wallId}|${side}`).slice(0, 24)}`;
}

export function roleWeight(role) {
  const row = REVIEWER_ROLES[role];
  if (!row) throw new Error(`unknown media-audit reviewer role ${role}`);
  return row.weight;
}

export function validateVote(vote, item = null) {
  if (!vote || typeof vote !== "object" || Array.isArray(vote)) throw new Error("media-audit vote must be an object");
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(vote.reviewer || "")) throw new Error("media-audit vote needs a safe reviewer id");
  if (!REVIEWER_ROLES[vote.role]) throw new Error(`media-audit vote has unknown role ${vote.role}`);
  if (!["identity", "presentation"].includes(vote.namespace)) throw new Error(`media-audit vote has unknown namespace ${vote.namespace}`);
  const allowed = vote.namespace === "presentation" && item ? CLAIM_VALUES[item.side] : CLAIM_VALUES[vote.namespace];
  if (!allowed?.has(vote.value)) throw new Error(`media-audit vote ${vote.namespace} has unsupported value ${vote.value}`);
  if (!String(vote.note || "").trim() || String(vote.note).trim().length < 12) throw new Error("media-audit vote needs a specific note of at least 12 characters");
  if (!/^[0-9a-f]{64}$/i.test(vote.asset_sha256 || "")) throw new Error("media-audit vote needs the reviewed asset SHA-256");
  if (!Number.isFinite(Date.parse(vote.at || ""))) throw new Error("media-audit vote needs an ISO timestamp");
  if (vote.enforced === true && REVIEWER_ROLES[vote.role].rank < REVIEWER_ROLES["second-desk"].rank) {
    throw new Error("only second-desk or owner votes may be enforced");
  }
  if (item && vote.asset_sha256.toLowerCase() !== item.asset?.sha256) throw new Error(`vote for ${item.id} targets a stale asset`);
  return true;
}

export function currentVotes(votes = []) {
  const byReviewerNamespace = new Map();
  for (const vote of votes) byReviewerNamespace.set(`${vote.reviewer}|${vote.namespace}`, vote);
  return [...byReviewerNamespace.values()].sort((a, b) => a.namespace.localeCompare(b.namespace) || a.reviewer.localeCompare(b.reviewer));
}

export function consensus(votes, namespace, side) {
  const scoped = currentVotes(votes).filter((vote) => vote.namespace === namespace);
  if (!scoped.length) return { state: "none", value: null, support: 0, reviewers: 0, human_reviewers: 0, competing: [] };
  const groups = new Map();
  for (const vote of scoped) {
    if (!groups.has(vote.value)) groups.set(vote.value, { value: vote.value, support: 0, reviewers: new Set(), human: new Set(), enforced: [] });
    const group = groups.get(vote.value);
    group.support += roleWeight(vote.role);
    group.reviewers.add(vote.reviewer);
    if (vote.role !== "machine") group.human.add(vote.reviewer);
    if (vote.enforced === true) group.enforced.push(vote);
  }
  const rows = [...groups.values()].sort((a, b) => b.support - a.support || b.reviewers.size - a.reviewers.size || a.value.localeCompare(b.value));
  const enforced = rows.filter((row) => row.enforced.length);
  if (enforced.length > 1) {
    return { state: "contested", value: null, support: enforced.reduce((n, row) => n + row.support, 0), reviewers: new Set(enforced.flatMap((row) => [...row.reviewers])).size, human_reviewers: new Set(enforced.flatMap((row) => [...row.human])).size, competing: enforced.map((row) => row.value) };
  }
  if (enforced.length === 1) {
    const row = enforced[0];
    return { state: "enforced", value: row.value, support: row.support, reviewers: row.reviewers.size, human_reviewers: row.human.size, competing: rows.filter((other) => other.value !== row.value).map((other) => other.value) };
  }
  if (rows.length > 1) {
    const [top, second] = rows;
    // A unanimous majority may become solid even when an obsolete minority remains,
    // but a close split is explicitly tracked as contested.
    if (top.support - second.support < 3 || top.reviewers.size < 2) {
      return { state: "contested", value: null, support: top.support, reviewers: top.reviewers.size, human_reviewers: top.human.size, competing: rows.map((row) => row.value) };
    }
  }
  const top = rows[0];
  let state = "weak";
  if (top.support >= 3 && top.reviewers.size >= 2 && top.human.size >= 1) state = "solid";
  else if (top.support >= 2 || top.reviewers.size >= 2) state = "active";
  return { state, value: top.value, support: top.support, reviewers: top.reviewers.size, human_reviewers: top.human.size, competing: rows.slice(1).map((row) => row.value) };
}

export function deriveItem(item) {
  if (!item.asset) return { ...item, status: item.source_fetched_at ? "absent" : "attention", claims: { identity: null, presentation: null } };
  const identity = consensus(item.votes || [], "identity", item.side);
  const presentation = consensus(item.votes || [], "presentation", item.side);
  const positivePresentation = POSITIVE_VALUE[item.side];
  const completeState = (row) => ["solid", "enforced"].includes(row.state);
  const identityPositive = completeState(identity) && identity.value === POSITIVE_VALUE.identity;
  const presentationPositive = completeState(presentation) && presentation.value === positivePresentation;
  const negative = [identity, presentation].some((row, index) => {
    const positive = index === 0 ? POSITIVE_VALUE.identity : positivePresentation;
    return ["active", "solid", "enforced", "contested"].includes(row.state) && (row.state === "contested" || row.value !== positive);
  });
  const status = identityPositive && presentationPositive ? "verified" : negative ? "attention" : "review";
  return { ...item, status, claims: { identity, presentation } };
}

export function validateState(state) {
  if (!state || state.version !== MEDIA_AUDIT_VERSION) throw new Error(`media-audit state must be version ${MEDIA_AUDIT_VERSION}`);
  if (!state.source || !["specimens_sha256", "sources_sha256", "media_manifest_sha256", "item_set_sha256"].every((key) => /^[0-9a-f]{64}$/i.test(state.source[key] || ""))) {
    throw new Error("media-audit state has invalid source receipts");
  }
  if (!Array.isArray(state.items)) throw new Error("media-audit state needs items[]");
  const ids = new Set();
  for (const raw of state.items) {
    if (ids.has(raw.id)) throw new Error(`duplicate media-audit item ${raw.id}`);
    ids.add(raw.id);
    if (raw.id !== mediaItemId(raw.scope, raw.wall_id, raw.side)) throw new Error(`media-audit item ${raw.id} has unstable identity`);
    if (!['still','portrait'].includes(raw.side)) throw new Error(`media-audit item ${raw.id} has invalid side`);
    if (!String(raw.expected_subject || "").trim()) throw new Error(`media-audit item ${raw.id} lacks expected_subject`);
    if (!Array.isArray(raw.risk_codes) || !Array.isArray(raw.votes)) throw new Error(`media-audit item ${raw.id} needs risk_codes and votes arrays`);
    if (raw.asset) {
      if (!String(raw.asset.src || "").trim() || !/^[0-9a-f]{64}$/i.test(raw.asset.sha256 || "") || !Number.isInteger(raw.asset.bytes) || raw.asset.bytes < 1) throw new Error(`media-audit item ${raw.id} has invalid asset receipt`);
      for (const vote of raw.votes) validateVote(vote, raw);
    } else {
      if (raw.votes.length) throw new Error(`absent media-audit item ${raw.id} may not carry visual votes`);
      if (raw.status === "absent" && !raw.source_fetched_at) throw new Error(`absent media-audit item ${raw.id} lacks a source receipt`);
    }
    const derived = deriveItem(raw);
    if (raw.status !== derived.status || JSON.stringify(raw.claims) !== JSON.stringify(derived.claims)) throw new Error(`media-audit item ${raw.id} has stale derived consensus`);
  }
  const setHash = sha256(stableJson(state.items.map((item) => ({ id: item.id, scope: item.scope, wall_id: item.wall_id, side: item.side, expected_subject: item.expected_subject, asset: item.asset, risk_codes: item.risk_codes }))));
  if (setHash !== state.source.item_set_sha256) throw new Error("media-audit state item-set receipt does not match items");
  return true;
}

export function summarize(state, scope = null) {
  const items = state.items.filter((item) => !scope || item.scope === scope);
  const counts = { total: items.length, available: 0, absent: 0, review: 0, attention: 0, verified: 0 };
  const sides = {};
  const consensusStates = {};
  for (const item of items) {
    if (!sides[item.side]) sides[item.side] = { total: 0, available: 0, absent: 0, review: 0, attention: 0, verified: 0 };
    sides[item.side].total++;
    counts[item.status]++;
    sides[item.side][item.status]++;
    if (item.asset) { counts.available++; sides[item.side].available++; }
    for (const row of Object.values(item.claims || {}).filter(Boolean)) consensusStates[row.state] = (consensusStates[row.state] || 0) + 1;
  }
  const complete = counts.verified + counts.absent;
  return { scope, ...counts, complete, completion_ratio: items.length ? complete / items.length : 0, sides, consensus_states: consensusStates };
}

export function trackerRows(state, { scope = null, reviewer = null, namespace = null, includeVerified = false } = {}) {
  const rows = state.items.filter((item) => (!scope || item.scope === scope) && (includeVerified || !["verified", "absent"].includes(item.status)))
    .filter((item) => !reviewer || !currentVotes(item.votes).some((vote) => vote.reviewer === reviewer && (!namespace || vote.namespace === namespace)))
    .map((item) => ({
      item,
      priority: (item.status === "attention" ? 10_000 : 0) + item.risk_codes.length * 100 + (item.side === "portrait" ? 25 : 0),
    }))
    .sort((a, b) => b.priority - a.priority || a.item.wall_id.localeCompare(b.item.wall_id) || a.item.side.localeCompare(b.item.side));
  return rows.map((row) => row.item);
}

export function applyVotes(state, votes, { now = new Date().toISOString() } = {}) {
  const next = copyJson(state);
  const byId = new Map(next.items.map((item) => [item.id, item]));
  const events = [];
  const seen = new Set();
  for (const input of votes) {
    const item = byId.get(input.item_id);
    if (!item) throw new Error(`unknown media-audit item ${input.item_id}`);
    const key = `${input.item_id}|${input.reviewer}|${input.namespace}`;
    if (seen.has(key)) throw new Error(`duplicate media-audit vote ${key}`);
    seen.add(key);
    if (!item.asset) throw new Error(`cannot vote on absent media-audit item ${item.id}`);
    const vote = {
      reviewer: input.reviewer,
      role: input.role,
      namespace: input.namespace,
      value: input.value,
      note: String(input.note || "").trim(),
      evidence: Array.isArray(input.evidence) ? input.evidence : [],
      enforced: input.enforced === true,
      at: input.at || now,
      asset_sha256: item.asset.sha256,
    };
    validateVote(vote, item);
    item.votes = currentVotes([...(item.votes || []).filter((old) => !(old.reviewer === vote.reviewer && old.namespace === vote.namespace)), vote]);
    const derived = deriveItem(item);
    item.status = derived.status;
    item.claims = derived.claims;
    events.push({
      version: MEDIA_AUDIT_VERSION,
      op: vote.enforced ? "media-audit.enforced" : "media-audit.voted",
      at: vote.at,
      item_id: item.id,
      scope: item.scope,
      wall_id: item.wall_id,
      side: item.side,
      asset_sha256: item.asset.sha256,
      reviewer: vote.reviewer,
      role: vote.role,
      namespace: vote.namespace,
      value: vote.value,
      note: vote.note,
      consensus: item.claims[vote.namespace],
      status: item.status,
    });
  }
  next.updated_at = now;
  next.items.sort((a, b) => a.scope.localeCompare(b.scope) || a.wall_id.localeCompare(b.wall_id) || a.side.localeCompare(b.side));
  validateState(next);
  return { state: next, events };
}

export function makePacket(state, items, { reviewer, role, namespace = null, now = new Date().toISOString() } = {}) {
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(reviewer || "")) throw new Error("packet needs a safe reviewer id");
  if (!REVIEWER_ROLES[role]) throw new Error(`packet has unknown reviewer role ${role}`);
  if (namespace && !["identity", "presentation"].includes(namespace)) throw new Error("packet namespace must be identity or presentation");
  const body = {
    version: MEDIA_AUDIT_VERSION,
    reviewer,
    role,
    namespace,
    issued_at: now,
    source: copyJson(state.source),
    items: items.map((item) => ({
      item_id: item.id,
      scope: item.scope,
      wall_id: item.wall_id,
      side: item.side,
      actor: item.actor,
      character: item.character,
      expected_subject: item.expected_subject,
      asset: item.asset,
      risk_codes: item.risk_codes,
      status: item.status,
      claims: item.claims,
      allowed_values: namespace === "identity" ? [...CLAIM_VALUES.identity] : namespace === "presentation" ? [...CLAIM_VALUES[item.side]] : { identity: [...CLAIM_VALUES.identity], presentation: [...CLAIM_VALUES[item.side]] },
    })),
  };
  return { ...body, packet_id: `map_${sha256(stableJson(body)).slice(0, 24)}` };
}

export function validatePacket(packet, state) {
  if (!packet || packet.version !== MEDIA_AUDIT_VERSION || !packet.packet_id || !Array.isArray(packet.items)) throw new Error("invalid media-audit packet");
  for (const key of ["specimens_sha256", "sources_sha256", "media_manifest_sha256", "item_set_sha256"]) {
    if (packet.source?.[key] !== state.source[key]) throw new Error(`media-audit packet is stale (${key})`);
  }
  const byId = new Map(state.items.map((item) => [item.id, item]));
  for (const row of packet.items) {
    const item = byId.get(row.item_id);
    if (!item || item.asset?.sha256 !== row.asset?.sha256) throw new Error(`media-audit packet item ${row.item_id} is stale`);
  }
  return true;
}
