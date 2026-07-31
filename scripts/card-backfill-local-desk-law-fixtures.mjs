#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) { return readFile(path, "utf8"); }
async function json(path) { return JSON.parse(await text(path)); }

const ACTIVE_WORKFLOW = ".github/workflows/card-backfill-amortized-wave.yml";
const RETIRED_WORKFLOW = ".github/workflows/card-backfill-source-v2-autonomous.yml";
const ACTIVE_REDUCER = "scripts/card-backfill-wave-reduce-amortized.mjs";
const LOCAL_ADJUDICATOR = "scripts/card-backfill-local-adjudicate.mjs";
const CLOUD_ADJUDICATOR = "scripts/card-backfill-machine-adjudicate.mjs";

const [lessons, control, amortization, activation, packageJson, activeWorkflow, retiredWorkflow, autonomousDoc, cohortsDoc, amortizationDoc] = await Promise.all([
  json(".github/CARD-BACKFILL-LESSONS.json"),
  json(".github/CARD-BACKFILL-COHORT.json"),
  json(".github/CARD-BACKFILL-AMORTIZATION.json"),
  json(".github/CARD-BACKFILL-AMORTIZATION-ACTIVE.json"),
  json("package.json"),
  text(ACTIVE_WORKFLOW),
  text(RETIRED_WORKFLOW),
  text("docs/CARD-BACKFILL-AUTONOMOUS.md"),
  text("docs/CARD-BACKFILL-COHORTS.md"),
  text("docs/CARD-BACKFILL-AMORTIZATION.md"),
]);

const activePolicy = lessons.policies.find((row) => row.policy_id === lessons.active_policy_id);
assert(activePolicy, "active policy must exist");
assert.equal(activePolicy.workflow, ACTIVE_WORKFLOW);
assert.equal(lessons.invariants.active_workflow_matches_production, true);
assert.equal(lessons.invariants.dormant_cloud_adjudicator_is_not_an_active_guard, true);
for (const lesson of lessons.lessons) {
  for (const guard of lesson.enforcement || []) {
    assert.notEqual(guard.path, RETIRED_WORKFLOW, `${lesson.id} must not guard the retired workflow`);
    assert.notEqual(guard.path, CLOUD_ADJUDICATOR, `${lesson.id} must not guard dormant cloud adjudication`);
  }
}
const cbl23 = lessons.lessons.find((row) => row.id === "CBL-023");
const cbl24 = lessons.lessons.find((row) => row.id === "CBL-024");
assert(cbl23.enforcement.some((guard) => guard.path === ACTIVE_WORKFLOW && guard.all.includes("max-parallel: 16")));
assert(cbl24.enforcement.some((guard) => guard.path === ACTIVE_REDUCER && guard.all.includes("mutationHead")));
assert(cbl24.enforcement.some((guard) => guard.path === ACTIVE_WORKFLOW && guard.all.includes("Commit one exact amortized reduction")));

assert.equal(control.denominator.completed_packet_unit, "record/side");
assert.match(control.denominator.selector_compatibility, /opposite facet/);
assert.equal(control.autonomous_campaign.workflow, ACTIVE_WORKFLOW);
assert.equal(control.autonomous_campaign.supervisor_workflow, ".github/workflows/card-backfill-supervisor.yml");
assert.equal(control.autonomous_campaign.successor_dispatch_owner, "card-backfill-supervisor");
assert.equal(control.autonomous_campaign.machine_second_desk.provider, "repository-local");
assert.equal(control.autonomous_campaign.machine_second_desk.implementation, LOCAL_ADJUDICATOR);
assert.equal(control.autonomous_campaign.machine_second_desk.cloud_inference_required, false);
assert(!("primary_model" in control.autonomous_campaign.machine_second_desk));
assert(!("fallback_model" in control.autonomous_campaign.machine_second_desk));
assert(!("default_branch_schedule" in control.autonomous_campaign));
assert.equal(control.invariants.cloud_inference_is_not_a_campaign_dependency, true);
assert.equal(control.invariants.one_supervisor_owns_successor_routing, true);

assert.equal(amortization.runtime.discovery_runtime_omits_local_desk_packages, true);
assert.equal(amortization.runtime.repository_local_second_desk_runs_at_the_assembly_boundary, true);
assert.equal(amortization.runtime.opencv_cascade_data_is_verified_before_adjudication, true);
assert.equal(amortization.runtime.cloud_model_token_required, false);
assert(!("model_token_is_injected_at_the_assembly_boundary" in amortization.runtime));
assert.equal(amortization.control_loop.successor_routing_owner, "card-backfill-supervisor");
assert.equal(amortization.invariants.no_cloud_inference_dependency, true);

assert.equal(activation.workflow, ACTIVE_WORKFLOW);
assert.equal(activation.supervisor_workflow, ".github/workflows/card-backfill-supervisor.yml");
assert.equal(activation.manual_continue_required, false);

assert.match(activeWorkflow, /name: card-backfill-amortized-wave/);
assert.match(activeWorkflow, /max-parallel: 16/);
assert.match(activeWorkflow, /profile: discovery/);
assert.match(activeWorkflow, /profile: local-desk/);
assert.match(activeWorkflow, /card-backfill-local-adjudicate\.mjs/);
assert.match(activeWorkflow, /card-backfill-wave-reduce-amortized\.mjs/);
assert.match(activeWorkflow, /Commit one exact amortized reduction/);
assert(!activeWorkflow.includes("models: read"));
assert(!activeWorkflow.includes("card-backfill-machine-adjudicate.mjs"));
assert(!activeWorkflow.includes("\n  continue:\n"), "only the supervisor may route the successor");

assert.match(retiredWorkflow, /retired/i);
assert(!retiredWorkflow.includes("\n  push:\n"));
assert(!retiredWorkflow.includes("models: read"));

assert.equal(packageJson.scripts["card-backfill:wave:reduce"], "node scripts/card-backfill-wave-reduce-amortized.mjs");
assert.equal(packageJson.scripts["card-backfill:local-desk-law:fixtures"], "node scripts/card-backfill-local-desk-law-fixtures.mjs");

assert.match(autonomousDoc, /production workflow is `.github\/workflows\/card-backfill-amortized-wave\.yml`/i);
assert.match(autonomousDoc, /manual-only as an explicit retirement receipt/i);
assert.match(autonomousDoc, /repository-local independent second desk/i);
assert.match(autonomousDoc, /card-backfill-wave-reduce-amortized\.mjs/);
assert.match(cohortsDoc, /repository-local independent second desk/i);
assert.match(cohortsDoc, /--amortization-plan/);
assert.match(cohortsDoc, /--mutation-head/);
assert.match(amortizationDoc, /lean discovery runtime/i);
assert.match(amortizationDoc, /No cloud-model token is required/);
assert(!amortizationDoc.includes("missing model token"));

console.log("card-backfill local-desk law fixtures: PASS — active law, workflow, runtime, reducer, commands, and docs all name one supervisor-owned repository-local lane");
