const POLICY_ID = "no-user-physical-dependency";
const REQUIRED_FORBIDDEN_GATES = [
  "owner-runs-local-command",
  "owner-installs-or-configures-software",
  "owner-uploads-or-transfers-artifact",
  "owner-contacts-or-recruits-external-person",
  "owner-performs-manual-environment-test",
  "owner-signs-or-acknowledges-operational-package",
  "owner-operates-or-actuates-physical-system",
  "owner-visits-mails-or-ships-physical-object",
];
const MILESTONE_FIELDS = [
  "authority",
  "owner_execution_required",
  "physical_action_required",
  "local_machine_action_required",
  "external_contact_required",
  "artifact_transfer_required",
];
const PROHIBITED_ACTION = "contact|email|call|message|recruit|find|invite|visit|mail|ship|sign|acknowledge|upload|download|install|run|execute|configure|deploy|operate|actuate|photograph|record|test|verify|click|open";
const DIRECT_ASSIGNMENT = new RegExp(`\\b(?:owner|project owner|user)\\b[^\\n]{0,120}\\b(?:must|should|needs? to|has to|is required to|will)\\s+(?:${PROHIBITED_ACTION})\\b`, "i");
const DELEGATED_ASSIGNMENT = new RegExp(`\\b(?:ask|tell|have|require)\\s+(?:the\\s+)?(?:owner|project owner|user)\\s+to\\s+(?:${PROHIBITED_ACTION})\\b`, "i");
const NEGATED_BOUNDARY = /\b(?:do not|don't|never|must not|prohibit(?:ed|s)?|without requiring|does not require|not required)\b/i;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const want = [...expected].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(want), `${label} keys must be exactly ${want.join(", ")}; found ${actual.join(", ")}`);
}

function exactStringSet(value, expected, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  invariant(new Set(value).size === value.length, `${label} must not contain duplicates`);
  const actual = [...value].sort();
  const want = [...expected].sort();
  invariant(JSON.stringify(actual) === JSON.stringify(want), `${label} must be exactly ${want.join(", ")}; found ${actual.join(", ")}`);
}

function validatePlaybookAssignments(markdown) {
  for (const [index, raw] of String(markdown || "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || NEGATED_BOUNDARY.test(line)) continue;
    if (DIRECT_ASSIGNMENT.test(line) || DELEGATED_ASSIGNMENT.test(line)) {
      throw new Error(`execution policy forbids owner-assigned physical or local action at playbook line ${index + 1}: ${line}`);
    }
  }
}

export function validateExecutionPolicy(roadmap, policy, playbooks = "") {
  invariant(roadmap && Array.isArray(roadmap.milestones), "execution policy needs a validated roadmap");
  exactKeys(policy, ["version", "id", "status", "roadmap", "playbooks", "governing_document", "principal", "fallbacks", "forbidden_gates", "milestones"], "EXECUTION-POLICY");
  invariant(policy.version === 1, "EXECUTION-POLICY must be version 1");
  invariant(policy.id === POLICY_ID, `EXECUTION-POLICY id must be ${POLICY_ID}`);
  invariant(policy.status === "active", "EXECUTION-POLICY must be active");
  invariant(policy.roadmap === "data/ROADMAP.json", "EXECUTION-POLICY roadmap must be data/ROADMAP.json");
  invariant(policy.playbooks === roadmap.document, `EXECUTION-POLICY playbooks must be ${roadmap.document}`);
  invariant(policy.governing_document === "docs/NO-USER-PHYSICAL-DEPENDENCY.md", "EXECUTION-POLICY governing_document drifted");

  exactKeys(policy.principal, ["id", "allowed_contribution", "physical_action_available", "local_machine_action_available", "external_contact_action_available", "artifact_transfer_action_available"], "EXECUTION-POLICY principal");
  invariant(policy.principal.id === "project-owner", "EXECUTION-POLICY principal.id must be project-owner");
  invariant(policy.principal.allowed_contribution === "conversation-only", "project owner contribution must be conversation-only");
  for (const key of ["physical_action_available", "local_machine_action_available", "external_contact_action_available", "artifact_transfer_action_available"]) {
    invariant(policy.principal[key] === false, `EXECUTION-POLICY principal.${key} must be false`);
  }

  exactKeys(policy.fallbacks, ["automatable_work", "public_network_evidence", "missing_physical_or_external_evidence", "missing_owner_decision", "irreversible_action_without_authority"], "EXECUTION-POLICY fallbacks");
  invariant(policy.fallbacks.automatable_work === "execute-now", "automatable work must execute now");
  invariant(policy.fallbacks.public_network_evidence === "retrieve-and-record", "public network evidence must be retrieved and recorded");
  invariant(policy.fallbacks.missing_physical_or_external_evidence === "record-unproven-and-continue", "missing physical or external evidence must remain unproven without blocking adjacent work");
  invariant(policy.fallbacks.missing_owner_decision === "continue-reversible-work-with-evidence-based-default", "missing owner decisions must not block reversible work");
  invariant(policy.fallbacks.irreversible_action_without_authority === "hold-only-that-action", "missing authority may hold only the irreversible action");

  exactStringSet(policy.forbidden_gates, REQUIRED_FORBIDDEN_GATES, "EXECUTION-POLICY forbidden_gates");

  invariant(policy.milestones && typeof policy.milestones === "object" && !Array.isArray(policy.milestones), "EXECUTION-POLICY milestones must be an object");
  const roadmapById = new Map(roadmap.milestones.map((row) => [row.id, row]));
  const policyIds = Object.keys(policy.milestones).sort();
  const roadmapIds = [...roadmapById.keys()].sort();
  invariant(JSON.stringify(policyIds) === JSON.stringify(roadmapIds), `EXECUTION-POLICY milestone denominator drifted; policy=${policyIds.join(", ")}; roadmap=${roadmapIds.join(", ")}`);
  for (const id of roadmapIds) {
    const row = policy.milestones[id];
    exactKeys(row, MILESTONE_FIELDS, `EXECUTION-POLICY milestone ${id}`);
    invariant(row.authority === roadmapById.get(id).authority, `EXECUTION-POLICY milestone ${id} authority drifted`);
    for (const key of MILESTONE_FIELDS.slice(1)) invariant(row[key] === false, `EXECUTION-POLICY milestone ${id}.${key} must be false`);
  }

  validatePlaybookAssignments(playbooks);
  return true;
}

export function executionBoundary(policy) {
  return {
    policy: policy.id,
    owner_contribution: policy.principal.allowed_contribution,
    owner_execution_required: false,
    unavailable_evidence: policy.fallbacks.missing_physical_or_external_evidence,
    missing_owner_decision: policy.fallbacks.missing_owner_decision,
    irreversible_without_authority: policy.fallbacks.irreversible_action_without_authority,
  };
}
