import { sha256 } from './autopilot-model.mjs';

export const AUTOPILOT_CAPABILITY_VERSION = 1;
const REVIEW_ROLES = new Set(['second-desk', 'owner']);
const PROFILE_STATUSES = new Set(['active', 'paused', 'retired']);
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function stableCapabilityJson(value) {
  return JSON.stringify(stable(value));
}

function requireString(value, label) {
  if (!String(value || '').trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}

function requireIso(value, label) {
  if (!Number.isFinite(Date.parse(value || ''))) throw new Error(`${label} must be an ISO timestamp`);
  return String(value);
}

function requireReviewed(row, label) {
  requireString(row.reviewed_by, `${label}.reviewed_by`);
  const role = requireString(row.reviewed_role, `${label}.reviewed_role`);
  if (!REVIEW_ROLES.has(role)) throw new Error(`${label}.reviewed_role must be second-desk or owner`);
  requireIso(row.reviewed_at, `${label}.reviewed_at`);
}

function uniqueSafeIds(values, label, known = null) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const result = [];
  const seen = new Set();
  for (const [index, raw] of values.entries()) {
    const value = requireString(raw, `${label}[${index}]`);
    if (!SAFE_ID.test(value)) throw new Error(`${label}[${index}] has invalid capability id ${value}`);
    if (seen.has(value)) throw new Error(`${label} contains duplicate ${value}`);
    if (known && !known.has(value)) throw new Error(`${label} references unknown capability ${value}`);
    seen.add(value);
    result.push(value);
  }
  return result.sort();
}

function evidenceRows(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array`);
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${label}[${index}] must be an object`);
    return {
      type: requireString(row.type, `${label}[${index}].type`),
      value: requireString(row.value, `${label}[${index}].value`),
    };
  });
}

export function validateCapabilityPolicy(doc) {
  if (!doc || doc.version !== AUTOPILOT_CAPABILITY_VERSION) throw new Error(`AUTOPILOT-CAPABILITIES must be version ${AUTOPILOT_CAPABILITY_VERSION}`);
  for (const key of ['capabilities', 'profiles', 'rules', 'task_overrides']) {
    if (!Array.isArray(doc[key])) throw new Error(`AUTOPILOT-CAPABILITIES needs ${key}[]`);
  }

  const capabilityIds = new Set();
  for (const [index, row] of doc.capabilities.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`capabilities[${index}] must be an object`);
    const id = requireString(row.id, `capabilities[${index}].id`);
    if (!SAFE_ID.test(id)) throw new Error(`invalid capability id ${id}`);
    if (capabilityIds.has(id)) throw new Error(`duplicate capability ${id}`);
    capabilityIds.add(id);
    requireString(row.description, `capability ${id}.description`);
  }

  const profileIds = new Set();
  for (const [index, row] of doc.profiles.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`profiles[${index}] must be an object`);
    const id = requireString(row.id, `profiles[${index}].id`);
    if (!SAFE_ID.test(id)) throw new Error(`invalid capability profile id ${id}`);
    if (profileIds.has(id)) throw new Error(`duplicate capability profile ${id}`);
    profileIds.add(id);
    requireString(row.label, `profile ${id}.label`);
    const status = requireString(row.status, `profile ${id}.status`);
    if (!PROFILE_STATUSES.has(status)) throw new Error(`profile ${id} has invalid status ${status}`);
    uniqueSafeIds(row.capabilities, `profile ${id}.capabilities`, capabilityIds);
    requireString(row.note, `profile ${id}.note`);
    requireReviewed(row, `profile ${id}`);
  }
  if (!doc.profiles.some((row) => row.status === 'active')) throw new Error('AUTOPILOT-CAPABILITIES needs at least one active profile');

  const ruleIds = new Set();
  for (const [index, row] of doc.rules.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`rules[${index}] must be an object`);
    const id = requireString(row.id, `rules[${index}].id`);
    if (!SAFE_ID.test(id)) throw new Error(`invalid capability rule id ${id}`);
    if (ruleIds.has(id)) throw new Error(`duplicate capability rule ${id}`);
    ruleIds.add(id);
    if (!row.match || typeof row.match !== 'object' || Array.isArray(row.match)) throw new Error(`rule ${id}.match must be an object`);
    const modes = uniqueSafeIds(row.match.performance_modes_any, `rule ${id}.match.performance_modes_any`);
    if (!modes.length) throw new Error(`rule ${id} needs at least one performance mode`);
    uniqueSafeIds(row.requires, `rule ${id}.requires`, capabilityIds);
    requireString(row.reason, `rule ${id}.reason`);
    requireReviewed(row, `rule ${id}`);
  }

  const overrideIds = new Set();
  for (const [index, row] of doc.task_overrides.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`task_overrides[${index}] must be an object`);
    const id = requireString(row.task_id, `task_overrides[${index}].task_id`);
    if (!/^ap_[0-9a-f]{24}$/.test(id)) throw new Error(`invalid capability task override ${id}`);
    if (overrideIds.has(id)) throw new Error(`duplicate capability task override ${id}`);
    overrideIds.add(id);
    if (!/^[0-9a-f]{64}$/i.test(row.source_fingerprint || '')) throw new Error(`task override ${id} needs source_fingerprint`);
    uniqueSafeIds(row.requires, `task override ${id}.requires`, capabilityIds);
    requireString(row.reason, `task override ${id}.reason`);
    evidenceRows(row.evidence, `task override ${id}.evidence`);
    requireReviewed(row, `task override ${id}`);
  }
  return true;
}

export function capabilityPolicySha256(doc) {
  validateCapabilityPolicy(doc);
  return sha256(stableCapabilityJson(doc));
}

export function resolveCapabilityProfile(doc, profileId, { requireActive = true } = {}) {
  validateCapabilityPolicy(doc);
  const id = requireString(profileId, 'capability profile id');
  const row = doc.profiles.find((profile) => profile.id === id);
  if (!row) throw new Error(`unknown capability profile ${id}`);
  if (requireActive && row.status !== 'active') throw new Error(`capability profile ${id} is ${row.status}; activate it through reviewed policy before leasing`);
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    capabilities: [...row.capabilities].sort(),
    policy_sha256: capabilityPolicySha256(doc),
    reviewed_by: row.reviewed_by,
    reviewed_role: row.reviewed_role,
    reviewed_at: row.reviewed_at,
  };
}

function ruleMatches(job, rule) {
  const modes = new Set(job.performance_modes || []);
  return rule.match.performance_modes_any.some((mode) => modes.has(mode));
}

export function taskCapabilityRequirement(job, doc) {
  validateCapabilityPolicy(doc);
  const required = new Set();
  const reasons = [];
  for (const rule of doc.rules) {
    if (!ruleMatches(job, rule)) continue;
    for (const capability of rule.requires) required.add(capability);
    reasons.push({ kind: 'rule', id: rule.id, reason: rule.reason });
  }
  const override = doc.task_overrides.find((row) => row.task_id === job.id) || null;
  let attention = null;
  if (override) {
    if (override.source_fingerprint !== job.source_fingerprint) {
      attention = {
        code: 'stale-task-capability-review',
        note: `task ${job.id} source fingerprint changed; capability override must be reviewed again`,
        expected_source_fingerprint: override.source_fingerprint,
        current_source_fingerprint: job.source_fingerprint,
      };
    } else {
      for (const capability of override.requires) required.add(capability);
      reasons.push({ kind: 'task-override', id: override.task_id, reason: override.reason, evidence: override.evidence });
    }
  }
  return { required_capabilities: [...required].sort(), reasons, attention };
}

export function evaluateTaskCapability(job, doc, profile) {
  const requirement = taskCapabilityRequirement(job, doc);
  const available = new Set(profile.capabilities || []);
  const missing_capabilities = requirement.required_capabilities.filter((capability) => !available.has(capability));
  return {
    task: job,
    profile_id: profile.id,
    compatible: !requirement.attention && missing_capabilities.length === 0,
    required_capabilities: requirement.required_capabilities,
    missing_capabilities,
    reasons: requirement.reasons,
    attention: requirement.attention,
  };
}

function queueOrder(a, b) {
  return b.priority - a.priority || a.scope.localeCompare(b.scope) || a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character);
}

export function rankCapabilityCandidates({ state, scope, policy, profileId }) {
  const profile = resolveCapabilityProfile(policy, profileId);
  const evaluations = state.jobs
    .filter((job) => job.status === 'queued' && (!scope || job.scope === scope))
    .sort(queueOrder)
    .map((job) => evaluateTaskCapability(job, policy, profile));
  return {
    profile,
    policy_sha256: profile.policy_sha256,
    compatible: evaluations.filter((row) => row.compatible),
    incompatible: evaluations.filter((row) => !row.compatible),
  };
}
