#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    path.write_text(text.replace(old, new))


waterline = Path("scripts/lib/waterline.mjs")
replace_once(
    waterline,
    '''  const media = mediaSummary(mediaAudit, scopeId);
  const jobs = (autopilot.jobs || []).filter((job) => job.scope === scopeId);
  const jobById = new Map(jobs.map((job) => [job.id, job]));
''',
    '''  const media = mediaSummary(mediaAudit, scopeId);
  const allJobs = autopilot.jobs || [];
  const jobs = allJobs.filter((job) => job.scope === scopeId);
  const allJobById = new Map(allJobs.map((job) => [job.id, job]));
  const jobById = new Map(jobs.map((job) => [job.id, job]));
''',
    "global job index",
)
replace_once(
    waterline,
    '''  const otherScopeInFlight = (autopilot.jobs || []).filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && job.scope !== scopeId);
''',
    '''  const otherScopeInFlight = allJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && job.scope !== scopeId);
  const cycleReceiptByLease = new Map(state.cycles.map((row) => [row.lease_id, row]));
  const otherScopeUnreceipted = config.scopes
    .filter((row) => row.id !== scopeId)
    .flatMap((row) => leaseGroups(autopilotJournal, row.id))
    .filter((group) => !cycleReceiptByLease.has(group.lease_id))
    .map((group) => ({
      ...group,
      task_statuses: Object.fromEntries(group.task_ids.map((id) => [id, allJobById.get(id)?.status || "missing"])),
    }));
''',
    "other-scope open-cycle custody",
)
replace_once(
    waterline,
    '''  if (config.operations.one_cycle_at_a_time === true && otherScopeInFlight.length) claimReasons.push("other_scope_cycle_in_flight");
  if (unreceipted.length) claimReasons.push("cycle_receipt_required");
''',
    '''  if (config.operations.one_cycle_at_a_time === true && otherScopeInFlight.length) claimReasons.push("other_scope_cycle_in_flight");
  else if (config.operations.one_cycle_at_a_time === true && otherScopeUnreceipted.length) claimReasons.push("other_scope_cycle_receipt_required");
  if (unreceipted.length) claimReasons.push("cycle_receipt_required");
''',
    "other-scope receipt blocker",
)
replace_once(
    waterline,
    '''  else if (config.operations.one_cycle_at_a_time === true && otherScopeInFlight.length) phase = "other-cycle-in-flight";
  else if (media.total === 0 && groups.length) phase = "pilot-closure-required";
''',
    '''  else if (config.operations.one_cycle_at_a_time === true && otherScopeInFlight.length) phase = "other-cycle-in-flight";
  else if (config.operations.one_cycle_at_a_time === true && otherScopeUnreceipted.length) phase = "other-cycle-receipt-required";
  else if (media.total === 0 && groups.length) phase = "pilot-closure-required";
''',
    "other-scope receipt phase",
)
replace_once(
    waterline,
    '''      required_successful_receipts: scope.required_closed_cycles,
      unreceipted: unreceipted.map((group) => ({ ...group, task_statuses: Object.fromEntries(group.task_ids.map((id) => [id, jobById.get(id)?.status || "missing"])) })),
''',
    '''      required_successful_receipts: scope.required_closed_cycles,
      other_scope_unreceipted: otherScopeUnreceipted,
      unreceipted: unreceipted.map((group) => ({ ...group, task_statuses: Object.fromEntries(group.task_ids.map((id) => [id, jobById.get(id)?.status || "missing"])) })),
''',
    "other-scope receipt evidence",
)

fixtures = Path("scripts/waterline-fixtures.mjs")
replace_once(
    fixtures,
    '''const crossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("leased")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(crossScopeStatus.phase, "other-cycle-in-flight");
assert.equal(crossScopeStatus.claim_allowed, false);
assert.ok(crossScopeStatus.claim_reasons.includes("other_scope_cycle_in_flight"));
assert.equal(crossScopeStatus.jobs.other_scope_in_flight.length, 1);

console.log("PASS — rolling gold cycles, first-pilot bootstrap, global single-cycle custody, receipts, drills, metrics, incident authority, stop/reopen, and natural unlocks");
''',
    '''const crossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("leased")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(crossScopeStatus.phase, "other-cycle-in-flight");
assert.equal(crossScopeStatus.claim_allowed, false);
assert.ok(crossScopeStatus.claim_reasons.includes("other_scope_cycle_in_flight"));
assert.equal(crossScopeStatus.jobs.other_scope_in_flight.length, 1);
const terminalCrossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("resolved")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(terminalCrossScopeStatus.phase, "other-cycle-receipt-required");
assert.equal(terminalCrossScopeStatus.claim_allowed, false);
assert.ok(terminalCrossScopeStatus.claim_reasons.includes("other_scope_cycle_receipt_required"));
assert.equal(terminalCrossScopeStatus.cycles.other_scope_unreceipted.length, 1);
assert.equal(terminalCrossScopeStatus.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");
const receiptedDoctorState = structuredClone(bootstrapState);
receiptedDoctorState.cycles.push(makeCycleReceipt({
  version: 1,
  scope_id: "doctor-who",
  lease_id: "lease_doctor",
  outcome: "aborted",
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T17:00:00Z",
  note: "The first pilot closed without canonical adoption; its incident and honest absence are separately receipted.",
  evidence: [{ type: "incident", value: "doctor-who-first-pilot-blocked" }],
}, {
  config: bootstrapConfig,
  state: receiptedDoctorState,
  autopilot: { jobs: [doctorJob("resolved")] },
  mediaAudit: doctorMedia,
  groups: leaseGroups(doctorEvents, "doctor-who"),
}));
const releasedCrossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: receiptedDoctorState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("resolved")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(releasedCrossScopeStatus.claim_allowed, true);
assert.equal(releasedCrossScopeStatus.cycles.other_scope_unreceipted.length, 0);

console.log("PASS — rolling gold cycles, first-pilot bootstrap, global single-cycle custody through reviewed receipt, drills, metrics, incident authority, stop/reopen, and natural unlocks");
''',
    "terminal other-scope cycle fixture",
)

docs = Path("docs/AUTOPILOT.md")
replace_once(
    docs,
    '''The first lease closes the exception immediately. Global one-cycle custody then blocks every scope from issuing another lease while any task is leased, drafted, or awaiting canonical/media closure. The pilot must proceed through submission, canonical adoption, exact-subject media review or honest absence, and a reviewed waterline receipt before the second shard can claim more work.
''',
    '''The first lease closes the exception immediately. Global one-cycle custody then blocks every scope from issuing another lease while any task is active and after terminal task handling until that exact lease has a durable reviewed waterline receipt. The pilot must proceed through submission or explicit blocking, canonical adoption where applicable, exact-subject media review or honest absence, and the reviewed cycle receipt before any scope can claim more work.
''',
    "global-cycle documentation",
)

activation_checker = Path("scripts/doctor-who-activation.mjs")
replace_once(
    activation_checker,
    '''  assert.ok(report.waterline.claim_reasons_after_claim.includes("media_baseline_missing"));
  assert.ok(Object.values(report.boundary).every((value) => value === false), "activation boundary contains an unauthorized payment");
''',
    '''  assert.ok(report.waterline.claim_reasons_after_claim.includes("media_baseline_missing"));
  assert.equal(report.global_cycle_custody?.status, "smoke-passed");
  assert.equal(report.global_cycle_custody?.other_scope_active_work_blocked, true);
  assert.equal(report.global_cycle_custody?.other_scope_terminal_unreceipted_blocked, true);
  assert.equal(report.global_cycle_custody?.global_claim_release_requires_cycle_receipt, true);
  assert.equal(report.global_cycle_custody?.candidate_complete_gate_passed, true);
  assert.equal(report.global_cycle_custody?.final_complete_gate_passed, true);
  assert.ok(Object.values(report.boundary).every((value) => value === false), "activation boundary contains an unauthorized payment");
''',
    "activation receipt global-cycle assertions",
)

receipt_path = Path("data/review/adapter-sdk/doctor-who-activation-001.json")
report = json.loads(receipt_path.read_text())
report["global_cycle_custody"] = {
    "candidate_complete_gate_passed": True,
    "final_complete_gate_passed": True,
    "global_claim_release_requires_cycle_receipt": True,
    "other_scope_active_work_blocked": True,
    "other_scope_terminal_unreceipted_blocked": True,
    "status": "smoke-passed",
}
report.pop("receipt_sha256", None)


def stable(value):
    if isinstance(value, list):
        return [stable(item) for item in value]
    if isinstance(value, dict):
        return {key: stable(value[key]) for key in sorted(value)}
    return value


def stable_json(value):
    return json.dumps(stable(value), ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n"

report["receipt_sha256"] = hashlib.sha256(stable_json(report).encode()).hexdigest()
receipt_path.write_text(stable_json(report))

print("global one-cycle custody now remains closed through the reviewed lease receipt")
