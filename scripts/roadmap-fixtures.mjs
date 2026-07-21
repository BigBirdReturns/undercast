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

const emptyState = {
  version: 1, updated_at: "", completed: [], decisions: [],
  metrics: { demand: null, quality: null }, notes: [],
};

assert.equal(validateRoadmap(roadmap), true);
assert.equal(validatePlaybooks(roadmap, playbooks), true);
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
assert.match(blocked.reasons.join(" "), /missing owner decisions/);
assert.match(blocked.reasons.join(" "), /unmet triggers/);
assert.equal(currentAdoptionStage(roadmap, foundationDone).id, "fan-reference");

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

console.log("PASS — roadmap DAG, exact playbooks, authority, triggers, adoption, and append-only completion receipts");
