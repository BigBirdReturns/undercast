#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  deriveThesisContinuation,
  evaluateThesisRailPullRequest,
  renderThesisContinuationPrompt,
  validateThesisRails,
} from "./lib/thesis-rails.mjs";

const config = JSON.parse(readFileSync(new URL("../data/THESIS-RAILS.json", import.meta.url), "utf8"));
assert.deepEqual(validateThesisRails(config), []);

const registry = {
  estates: [
    { id: "alpha", label: "Alpha", state: "active-corpus", autopilot_scope: "alpha", priority: 100, next_gate: "continue alpha" },
    { id: "beta", label: "Beta", state: "active-corpus", autopilot_scope: "beta", priority: 90, next_gate: "continue beta" },
    { id: "gamma", label: "Gamma", state: "adapter-review", autopilot_scope: "gamma", priority: 80, next_gate: "review gamma adapter" },
  ],
};
const audit = [];
const cleanWaterline = { phase: "ready-for-cycle", claim_allowed: true, claim_reasons: [], media: { debt: 0 }, cycles: { unreceipted: [] }, capacity: { max_tasks_per_cycle: 1 } };
const candidateReports = {
  alpha: { compatible: [{ task_id: "ap_alpha", performer: "A Performer", character: "A Character", priority: 10, performance_modes: ["face"], required_capabilities: ["vision"], sources: ["https://example.test/a"], source_fingerprint: "a".repeat(64) }] },
  beta: { compatible: [{ task_id: "ap_beta", performer: "B Performer", character: "B Character", priority: 9, performance_modes: ["voice"], required_capabilities: [], sources: ["https://example.test/b"], source_fingerprint: "b".repeat(64) }] },
};

function derive({ jobs, items = audit, waterlines = { alpha: cleanWaterline, beta: cleanWaterline }, candidates = candidateReports, localRegistry = registry }) {
  return deriveThesisContinuation({ config, registry: localRegistry, jobs, audit: items, waterlines, candidateReports: candidates });
}

let result = derive({ jobs: [{ id: "ap_alpha", scope: "alpha", status: "leased" }] });
assert.equal(result.phase, "finish-current-cycle");
assert.equal(result.scope_id, "alpha");

result = derive({
  jobs: [{ id: "ap_alpha", scope: "alpha", status: "queued" }],
  waterlines: { alpha: { ...cleanWaterline, cycles: { unreceipted: [{ lease_id: "lease_1" }] } }, beta: cleanWaterline },
});
assert.equal(result.phase, "finish-current-cycle");
assert.match(result.reason, /lack a reviewed receipt/);

result = derive({
  jobs: [{ id: "ap_alpha", scope: "alpha", status: "queued" }],
  items: [{ id: "media_1", scope: "alpha", status: "review" }],
});
assert.equal(result.phase, "close-media-debt");

result = derive({ jobs: [{ id: "ap_alpha", scope: "alpha", status: "queued" }] });
assert.equal(result.phase, "ready-for-one-cycle");
assert.equal(result.candidate.task_id, "ap_alpha");
assert.match(result.next_command, /--limit 1/);

result = derive({
  jobs: [{ id: "ap_alpha", scope: "alpha", status: "queued" }],
  waterlines: { alpha: { ...cleanWaterline, claim_allowed: false, claim_reasons: ["receipt pending"] }, beta: cleanWaterline },
});
assert.equal(result.phase, "inspect-waterline");
assert.equal(result.scope_id, "alpha");

result = derive({
  jobs: [{ id: "ap_alpha", scope: "alpha", status: "resolved" }, { id: "ap_beta", scope: "beta", status: "queued" }],
});
assert.equal(result.phase, "ready-for-one-cycle");
assert.equal(result.scope_id, "beta");

result = derive({
  jobs: [{ id: "ap_alpha", scope: "alpha", status: "resolved" }, { id: "ap_beta", scope: "beta", status: "resolved" }],
});
assert.equal(result.phase, "advance-estate-gate");
assert.equal(result.estate_id, "gamma");

const prompt = renderThesisContinuationPrompt(derive({ jobs: [{ id: "ap_alpha", scope: "alpha", status: "queued" }] }), config);
assert.match(prompt, /A Performer/);
assert.match(prompt, /one candidate\/product lane, one independent review, and one receipt-bearing finalizer/);
assert.match(prompt, /Maker attribution may remain explicitly unresolved/);
assert.match(prompt, /Terminal-Product:/);

const grandfathered = evaluateThesisRailPullRequest({
  config,
  changes: [{ status: "M", path: ".github/workflows/doctor-who-cycle-012-review-transition.yml" }],
  body: "current cycle repair",
});
assert.equal(grandfathered.ok, true);
assert.equal(grandfathered.basis, "grandfathered-current-cycle");

const allowed = evaluateThesisRailPullRequest({
  config,
  changes: [
    { status: "A", path: ".github/workflows/doctor-who-cycle-013-candidate.yml" },
    { status: "A", path: ".github/workflows/doctor-who-cycle-013-review.yml" },
    { status: "A", path: ".github/workflows/doctor-who-cycle-013-finalizer.yml" },
  ],
  body: "Terminal-Product: UC-1358",
});
assert.equal(allowed.ok, true);

const missingProduct = evaluateThesisRailPullRequest({
  config,
  changes: [{ status: "A", path: ".github/workflows/doctor-who-cycle-013-candidate.yml" }],
  body: "candidate only",
});
assert.equal(missingProduct.ok, false);
assert.match(missingProduct.errors.join(" "), /Terminal-Product:/);

const forbidden = evaluateThesisRailPullRequest({
  config,
  changes: [{ status: "A", path: ".github/workflows/doctor-who-cycle-013-review-transition.yml" }],
  body: "Terminal-Product: UC-1358",
});
assert.equal(forbidden.ok, false);
assert.match(forbidden.errors.join(" "), /transition-only/);

const exception = evaluateThesisRailPullRequest({
  config,
  changes: [{ status: "A", path: ".github/workflows/doctor-who-cycle-013-review-transition.yml" }],
  body: "Terminal-Product: UC-1358\nThesis-Rail-Exception: shared finalizer parser defect\nShared-Mechanism-Gap: candidate receipt parser rejects canonical kind\nRetirement-Condition: remove this workflow in the same terminal product",
});
assert.equal(exception.ok, true);
assert.equal(exception.basis, "documented-shared-mechanism-exception");

const tooMany = evaluateThesisRailPullRequest({
  config,
  changes: [1, 2, 3, 4].map((value) => ({ status: "A", path: `.github/workflows/doctor-who-cycle-013-stage-${value}.yml` })),
  body: "Terminal-Product: UC-1358",
});
assert.equal(tooMany.ok, false);
assert.match(tooMany.errors.join(" "), /maximum is 3/);

console.log("PASS — thesis continuation rail fixtures");
