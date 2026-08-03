#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  currentAdoptionStage,
  deriveMilestoneStates,
  extractPlaybookSection,
  nextMilestones,
  triggerSatisfied,
  validatePlaybooks,
  validateRoadmap,
  validateRoadmapState,
} from "./lib/roadmap.mjs";
import {
  executionBoundaryForMilestone,
  validateExecutionPolicy,
} from "./lib/execution-policy.mjs";

const roadmap = {
  version: 1,
  document: "docs/PLAYBOOK.md",
  horizon: { start: "2026-01-01", end: "2031-01-01" },
  north_star: "A durable evidence-backed recognition event.",
  metrics: ["demand", "quality"],
  adoption: [
    { id: "operator-proof", order: 0, entry: null },
    { id: "fan-reference", order: 1, entry: "foundation" },
  ],
  scale: [{ id: "demand-tooling", trigger: ["demand", "gte", 3] }],
  milestones: [
    {
      id: "foundation", seq: 0, window: "Y1", authority: "second-desk",
      deps: [], decisions: [], triggers: [],
      guide: "docs/PLAYBOOK.md#foundation",
    },
    {
      id: "product", seq: 1, window: "Y2", authority: "owner",
      deps: ["foundation"], decisions: ["product-model"],
      triggers: [["demand", "gte", 3]],
      guide: "docs/PLAYBOOK.md#product",
    },
  ],
};

const playbooks = `# Playbooks

## foundation

Foundation instructions.

### Build sequence

1. Build it.

### Acceptance proof

- Proof.

### Do not

- Skip review.

### Outcome metrics

- quality

## product

Product instructions.

### Build sequence

1. Build product.

### Acceptance proof

- Product proof.

### Do not

- Invent demand.

### Outcome metrics

- demand
`;

function executionPolicyFor(value) {
  return {
    version: 1,
    id: "no-user-physical-dependency",
    status: "active",
    roadmap: "data/ROADMAP.json",
    playbooks: value.document,
    governing_document: "docs/NO-USER-PHYSICAL-DEPENDENCY.md",
    principal: {
      id: "project-owner",
      allowed_contribution: "conversation-only",
      physical_action_available: false,
      local_machine_action_available: false,
      external_contact_action_available: false,
      artifact_transfer_action_available: false,
    },
    fallbacks: {
      automatable_work: "execute-now",
      public_network_evidence: "retrieve-and-record",
      missing_physical_or_external_evidence: "record-unproven-and-continue",
      missing_owner_decision: "continue-reversible-work-with-evidence-based-default",
      irreversible_action_without_authority: "hold-only-that-action",
    },
    forbidden_gates: [
      "owner-runs-local-command",
      "owner-installs-or-configures-software",
      "owner-uploads-or-transfers-artifact",
      "owner-contacts-or-recruits-external-person",
      "owner-performs-manual-environment-test",
      "owner-signs-or-acknowledges-operational-package",
      "owner-operates-or-actuates-physical-system",
      "owner-visits-mails-or-ships-physical-object",
    ],
    milestones: Object.fromEntries(value.milestones.map((row) => {
      const hasDecision = row.decisions.length > 0;
      return [row.id, {
        authority: row.authority,
        owner_execution_required: false,
        physical_action_required: false,
        local_machine_action_required: false,
        external_contact_required: false,
        artifact_transfer_required: false,
        reversible_without_owner_decision: hasDecision,
        reversible_work: hasDecision ? [`prepare isolated ${row.id} fixtures and evidence`] : [],
        held_decisions: [...row.decisions],
        held_actions: hasDecision ? [`ratify or publish ${row.id}`] : [],
      }];
    })),
  };
}

const executionPolicy = executionPolicyFor(roadmap);
const emptyState = {
  version: 1, updated_at: "", completed: [], decisions: [],
  metrics: { demand: null, quality: null }, notes: [],
};

assert.equal(validateRoadmap(roadmap), true);
assert.equal(validatePlaybooks(roadmap, playbooks), true);
assert.equal(validateExecutionPolicy(roadmap, executionPolicy, playbooks), true);
assert.match(extractPlaybookSection(roadmap, playbooks, "foundation"), /^## foundation/);
assert.doesNotMatch(extractPlaybookSection(roadmap, playbooks, "foundation"), /^## product/m);
assert.equal(validateRoadmapState(roadmap, emptyState), true);
assert.equal(nextMilestones(roadmap, emptyState)[0].id, "foundation");
assert.equal(currentAdoptionStage(roadmap, emptyState).id, "operator-proof");
assert.equal(triggerSatisfied(["demand", "gte", 3], { demand: null }), false);
assert.equal(triggerSatisfied(["demand", "gte", 3], { demand: 3 }), true);

const missingPlaybook = playbooks.replace("### Acceptance proof\n\n- Product proof.\n", "");
assert.throws(() => validatePlaybooks(roadmap, missingPlaybook), /playbook product is missing ### Acceptance proof/);

const duplicate = structuredClone(roadmap);
duplicate.milestones.push(structuredClone(duplicate.milestones[0]));
assert.throws(() => validateRoadmap(duplicate), /duplicate milestone id/);

const cycle = structuredClone(roadmap);
cycle.milestones[0].deps = ["product"];
assert.throws(() => validateRoadmap(cycle), /dependency cycle/);

const badGuide = structuredClone(roadmap);
badGuide.milestones[0].guide = "docs/PLAYBOOK.md#wrong";
assert.throws(() => validateRoadmap(badGuide), /guide must be exactly/);

const physicalOwner = structuredClone(executionPolicy);
physicalOwner.milestones.product.physical_action_required = true;
assert.throws(() => validateExecutionPolicy(roadmap, physicalOwner, playbooks), /physical_action_required must be false/);

const missingPolicyMilestone = structuredClone(executionPolicy);
delete missingPolicyMilestone.milestones.product;
assert.throws(() => validateExecutionPolicy(roadmap, missingPolicyMilestone, playbooks), /milestone denominator drifted/);

const authorityDrift = structuredClone(executionPolicy);
authorityDrift.milestones.product.authority = "second-desk";
assert.throws(() => validateExecutionPolicy(roadmap, authorityDrift, playbooks), /authority drifted/);

const reversibleDisabled = structuredClone(executionPolicy);
reversibleDisabled.milestones.product.reversible_without_owner_decision = false;
assert.throws(() => validateExecutionPolicy(roadmap, reversibleDisabled, playbooks), /reversible_without_owner_decision must be true/);

const reversibleMissing = structuredClone(executionPolicy);
reversibleMissing.milestones.product.reversible_work = [];
assert.throws(() => validateExecutionPolicy(roadmap, reversibleMissing, playbooks), /reversible_work must not be empty/);

const heldDecisionDrift = structuredClone(executionPolicy);
heldDecisionDrift.milestones.product.held_decisions = [];
assert.throws(() => validateExecutionPolicy(roadmap, heldDecisionDrift, playbooks), /held_decisions must be exactly product-model/);

for (const instruction of [
  "1. The owner must upload a package.",
  "1. The owner must transfer the artifact.",
  "1. The owner must manually move the package.",
  "1. Ask the project owner to attach the report.",
]) {
  const assigned = playbooks.replace("1. Build product.", instruction);
  assert.throws(() => validateExecutionPolicy(roadmap, executionPolicy, assigned), /forbids owner-assigned/);
}

const refusalBoundary = `${playbooks}\nDo not ask the owner to upload, transfer, move, contact, install, run, or test anything.\n`;
assert.equal(validateExecutionPolicy(roadmap, executionPolicy, refusalBoundary), true);

const machineClose = structuredClone(emptyState);
machineClose.completed = [{
  milestone: "foundation", completed_at: "2027-01-01T00:00:00Z",
  reviewed_by: "luna", reviewed_role: "machine",
  evidence: [{ type: "workflow-run", value: "run-1" }],
}];
assert.throws(() => validateRoadmapState(roadmap, machineClose), /cannot close second-desk milestone/);

const orphanDecision = structuredClone(emptyState);
orphanDecision.decisions = [{
  id: "unrequested-decision", decided_by: "owner",
  decided_at: "2027-01-01T00:00:00Z", evidence: "docs/DECISIONS.md#unrequested",
}];
assert.throws(() => validateRoadmapState(roadmap, orphanDecision), /not required by any milestone/);

const foundationDone = structuredClone(emptyState);
foundationDone.completed = [{
  milestone: "foundation", completed_at: "2027-01-01T00:00:00Z",
  reviewed_by: "reviewer", reviewed_role: "second-desk",
  evidence: [{ type: "workflow-run", value: "run-1" }],
}];
foundationDone.metrics.quality = 1;
assert.equal(validateRoadmapState(roadmap, foundationDone), true);
const blocked = deriveMilestoneStates(roadmap, foundationDone).find((row) => row.id === "product");
assert.equal(blocked.state, "blocked");
assert.match(blocked.reasons.join(" "), /held owner decisions/);
assert.match(blocked.reasons.join(" "), /unmet triggers/);
assert.equal(currentAdoptionStage(roadmap, foundationDone).id, "fan-reference");

const reversible = structuredClone(foundationDone);
reversible.metrics.demand = 3;
const reversibleRow = deriveMilestoneStates(roadmap, reversible).find((row) => row.id === "product");
assert.equal(reversibleRow.state, "reversible");
assert.deepEqual(reversibleRow.missing_decisions, ["product-model"]);
assert.match(reversibleRow.reasons.join(" "), /reversible work remains eligible/);
assert.equal(nextMilestones(roadmap, reversible)[0].id, "product");
const reversibleBoundary = executionBoundaryForMilestone(executionPolicy, "product", {
  state: reversibleRow.state,
  missingDecisions: reversibleRow.missing_decisions,
});
assert.equal(reversibleBoundary.execution_scope, "reversible-only");
assert.equal(reversibleBoundary.reversible_work_eligible, true);
assert.deepEqual(reversibleBoundary.held_decisions, ["product-model"]);
assert.equal(reversibleBoundary.reversible_work.length, 1);
assert.equal(reversibleBoundary.held_actions.length, 1);

const ready = structuredClone(foundationDone);
ready.decisions = [{
  id: "product-model", decided_by: "owner",
  decided_at: "2027-02-01T00:00:00Z",
  evidence: "docs/DECISIONS.md#product-model",
}];
ready.metrics.demand = 3;
assert.equal(deriveMilestoneStates(roadmap, ready).find((row) => row.id === "product").state, "ready");
assert.equal(nextMilestones(roadmap, ready)[0].id, "product");

const skipped = structuredClone(ready);
skipped.completed = [{
  milestone: "product", completed_at: "2027-03-01T00:00:00Z",
  reviewed_by: "owner", reviewed_role: "owner",
  evidence: [{ type: "decision", value: "product-model" }],
}];
assert.throws(() => validateRoadmapState(roadmap, skipped), /complete before dependency foundation/);

const ownerWithoutDecision = structuredClone(foundationDone);
ownerWithoutDecision.completed.push({
  milestone: "product", completed_at: "2027-03-01T00:00:00Z",
  reviewed_by: "owner", reviewed_role: "owner",
  evidence: [{ type: "workflow-run", value: "run-2" }],
});
ownerWithoutDecision.metrics.demand = 3;
assert.throws(() => validateRoadmapState(roadmap, ownerWithoutDecision), /required decision product-model/);

const outOfOrder = structuredClone(ready);
outOfOrder.completed.push({
  milestone: "product", completed_at: "2026-12-01T00:00:00Z",
  reviewed_by: "owner", reviewed_role: "owner",
  evidence: [{ type: "workflow-run", value: "run-2" }],
});
assert.throws(() => validateRoadmapState(roadmap, outOfOrder), /completion receipts must be chronological/);

console.log("PASS — roadmap DAG, exact playbooks, authority, triggers, reversible owner-decision custody, append-only completion receipts, and no owner physical or local execution gates");
