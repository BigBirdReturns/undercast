#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  deriveWaterlineStatus,
  emptyWaterlineState,
  leaseGroups,
  makeAccountingReceipt,
  makeCycleReceipt,
  makeDrillReceipt,
  makeIncidentEvent,
  makeMetricsReceipt,
  validateWaterlineState,
} from "./lib/waterline.mjs";

const config = {
  version: 1,
  scopes: [{ id: "star-trek", label: "Star Trek", roadmap_milestone: "star-trek-gold-shard", required_closed_cycles: 3, max_tasks_per_cycle: 8, minimum_resolved_per_cycle: 1 }],
  operations: { required_drills: ["repository-restore", "publication-rollback"], slo_targets: { build_minutes_p95: 20, source_freshness_p95_days: 14, rights_response_sla_days: 14 } },
};
const roadmapState = { completed: [{ milestone: "trusted-foundation" }] };
const preservation = { history_guard: { precondition_met: true, status: "offsite-verified" } };
const media = (status = "verified") => ({ source: { item_set_sha256: "a".repeat(64) }, items: [{ id: "m1", scope: "star-trek", status }, { id: "m2", scope: "star-trek", status: "absent" }] });
const job = (id, status = "resolved") => ({ id, scope: "star-trek", status, source_fingerprint: "b".repeat(64), wall_ids: status === "resolved" ? ["UC-1"] : [] });
const journalFor = (lease, ids) => ids.map((id) => ({ op: "lease.claimed", task_id: id, at: "2026-07-22T00:00:00Z", scope: "star-trek", lease_id: lease, readiness_token: "c".repeat(64) }));
let state = emptyWaterlineState();
validateWaterlineState(state, config);

let status = deriveWaterlineStatus({ config, state, mediaAudit: media("review"), autopilot: { jobs: [job("ap_1", "queued")] }, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 8 });
assert.equal(status.phase, "baseline-review");
assert.equal(status.claim_allowed, false);
assert.ok(status.claim_reasons.includes("media_debt_open"));

status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: [job("ap_1", "queued")] }, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 9 });
assert.ok(status.claim_reasons.includes("requested_batch_exceeds_capacity"));
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: [job("ap_1", "queued")] }, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 8 });
assert.equal(status.phase, "ready-for-cycle");
assert.equal(status.claim_allowed, true);

const leaseEvents = journalFor("lease_one", ["ap_1"]);
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: [job("ap_1", "leased")] }, autopilotJournal: leaseEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 8 });
assert.equal(status.phase, "cycle-in-flight");
assert.equal(status.claim_allowed, false);
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: [job("ap_1", "resolved")] }, autopilotJournal: leaseEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 8 });
assert.equal(status.phase, "receipt-required");

const cycleInput = { version: 1, scope_id: "star-trek", lease_id: "lease_one", outcome: "completed", reviewed_by: "second-desk", reviewed_role: "second-desk", reviewed_at: "2026-07-22T02:00:00Z", note: "Restart-safe cycle completed from durable state.", evidence: [{ type: "workflow-run", value: "1" }, { type: "commit", value: "abc" }, { type: "restart-proof", value: "resumed from persisted lease" }] };
const cycle = makeCycleReceipt(cycleInput, { config, state, autopilot: { jobs: [job("ap_1", "resolved")] }, mediaAudit: media(), groups: leaseGroups(leaseEvents, "star-trek") });
state.cycles.push(cycle);
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: [job("ap_1", "resolved")] }, autopilotJournal: leaseEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 8 });
assert.equal(status.claim_allowed, true);
assert.equal(status.cycles.successful_receipts, 1);
assert.throws(() => makeCycleReceipt(cycleInput, { config, state, autopilot: { jobs: [job("ap_1", "resolved")] }, mediaAudit: media(), groups: leaseGroups(leaseEvents, "star-trek") }), /already receipted/);
assert.throws(() => makeCycleReceipt({ ...cycleInput, lease_id: "missing" }, { config, state, autopilot: { jobs: [] }, mediaAudit: media(), groups: [] }), /unknown lease/);

for (const [index, lease] of ["lease_two", "lease_three"].entries()) {
  const id = `ap_${index + 2}`;
  const events = journalFor(lease, [id]);
  const receipt = makeCycleReceipt({ ...cycleInput, lease_id: lease, reviewed_at: `2026-07-22T0${index + 3}:00:00Z` }, { config, state, autopilot: { jobs: [job(id, "resolved")] }, mediaAudit: media(), groups: leaseGroups(events, "star-trek") });
  state.cycles.push(receipt);
}
const allJobs = [job("ap_1"), job("ap_2"), job("ap_3")];
const accounting = makeAccountingReceipt({ scope_id: "star-trek", counts: { eligible: 0, filed: 3, blocked: 0, excluded: 0, unresolved: 0 }, reviewed_by: "second-desk", reviewed_role: "second-desk", reviewed_at: "2026-07-22T06:00:00Z", note: "All durable tasks accounted for.", evidence: [{ type: "report", value: "accounting.json" }, { type: "workflow-run", value: "2" }] }, { autopilot: { jobs: allJobs } });
state.accounting.push(accounting);
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: allJobs }, autopilotJournal: [...leaseEvents, ...journalFor("lease_two", ["ap_2"]), ...journalFor("lease_three", ["ap_3"])], roadmapState, preservation, scopeId: "star-trek" });
assert.equal(status.evidence_readiness.star_trek_gold_shard, true);
assert.equal(status.evidence_readiness.operational_reliability, false);

for (const kind of config.operations.required_drills) state.drills.push(makeDrillReceipt({ kind, passed: true, reviewed_by: "second-desk", reviewed_role: "second-desk", reviewed_at: "2026-07-22T07:00:00Z", note: `${kind} passed from a fresh checkout.`, evidence: [{ type: "workflow-run", value: kind }] }, config));
const metricResult = makeMetricsReceipt({ metrics: { build_minutes_p95: 12, cost_per_verified_record_usd: 1.25, source_freshness_p95_days: 7, rights_response_sla_days: 10 }, reviewed_by: "second-desk", reviewed_role: "second-desk", reviewed_at: "2026-07-22T08:00:00Z", note: "Measured operating baselines.", evidence: [{ type: "report", value: "metrics.json" }] }, state.metrics);
state.metrics = metricResult.metrics;
state.metric_receipts.push(metricResult.receipt);
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: allJobs }, autopilotJournal: [...leaseEvents, ...journalFor("lease_two", ["ap_2"]), ...journalFor("lease_three", ["ap_3"])], roadmapState, preservation, scopeId: "star-trek" });
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.deepEqual(status.natural_unlocks_when_receipted, ["adapter-sdk-and-second-gold-shard", "public-trust-and-corrections"]);

state.incidents.push(makeIncidentEvent({ incident_id: "inc-1", status: "open", severity: "high", at: "2026-07-22T09:00:00Z", recorded_by: "operator", recorded_role: "operator", note: "Publication correctness incident under investigation.", evidence: [{ type: "workflow-run", value: "3" }] }, state.incidents));
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: allJobs }, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(status.phase, "incident-stop");
assert.equal(status.claim_allowed, false);
assert.throws(() => makeIncidentEvent({ incident_id: "inc-1", status: "closed", severity: "high", at: "2026-07-22T10:00:00Z", recorded_by: "operator", recorded_role: "operator", note: "Attempted unreviewed closure.", evidence: [{ type: "report", value: "incident.json" }] }, state.incidents), /second-desk or owner/);
state.incidents.push(makeIncidentEvent({ incident_id: "inc-1", status: "closed", severity: "high", at: "2026-07-22T10:00:00Z", recorded_by: "second-desk", recorded_role: "second-desk", note: "Correctness restored and independently verified.", evidence: [{ type: "workflow-run", value: "4" }] }, state.incidents));
status = deriveWaterlineStatus({ config, state, mediaAudit: media(), autopilot: { jobs: allJobs }, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(status.claim_allowed, true);

console.log("PASS — rolling gold cycles, receipts, drills, metrics, incident authority, stop/reopen, and natural unlocks");
