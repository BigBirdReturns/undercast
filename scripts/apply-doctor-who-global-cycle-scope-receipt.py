#!/usr/bin/env python3
import hashlib
import json
import os
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
    '''function completedMilestones(roadmapState) { return new Set((roadmapState.completed || []).map((row) => row.milestone)); }

export function deriveWaterlineStatus''',
    '''function completedMilestones(roadmapState) { return new Set((roadmapState.completed || []).map((row) => row.milestone)); }
function cycleReceiptKey(scopeId, leaseId) { return `${scopeId}\\u0000${leaseId}`; }

export function deriveWaterlineStatus''',
    "scope-plus-lease receipt key",
)
replace_once(
    waterline,
    '''  const groups = leaseGroups(autopilotJournal, scopeId);
  const scopeCycles = state.cycles.filter((row) => row.scope_id === scopeId);
  const cycleByLease = new Map(scopeCycles.map((row) => [row.lease_id, row]));
  const unreceipted = groups.filter((group) => !cycleByLease.has(group.lease_id));
''',
    '''  const groups = leaseGroups(autopilotJournal, scopeId);
  const cycleReceiptKeys = new Set(state.cycles.map((row) => cycleReceiptKey(row.scope_id, row.lease_id)));
  const scopeCycles = state.cycles.filter((row) => row.scope_id === scopeId);
  const unreceipted = groups.filter((group) => !cycleReceiptKeys.has(cycleReceiptKey(group.scope_id, group.lease_id)));
''',
    "same-scope exact receipt matching",
)
replace_once(
    waterline,
    '''  const otherScopeInFlight = allJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && job.scope !== scopeId);
  const cycleReceiptByLease = new Map(state.cycles.map((row) => [row.lease_id, row]));
  const otherScopeUnreceipted = config.scopes
    .filter((row) => row.id !== scopeId)
    .flatMap((row) => leaseGroups(autopilotJournal, row.id))
    .filter((group) => !cycleReceiptByLease.has(group.lease_id))
''',
    '''  const otherScopeInFlight = allJobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && job.scope !== scopeId);
  const otherScopeUnreceipted = config.scopes
    .filter((row) => row.id !== scopeId)
    .flatMap((row) => leaseGroups(autopilotJournal, row.id))
    .filter((group) => !cycleReceiptKeys.has(cycleReceiptKey(group.scope_id, group.lease_id)))
''',
    "cross-scope exact receipt matching",
)

fixtures = Path("scripts/waterline-fixtures.mjs")
fixture_anchor = '''assert.equal(terminalCrossScopeStatus.cycles.other_scope_unreceipted.length, 1);
assert.equal(terminalCrossScopeStatus.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");
const receiptedDoctorState = structuredClone(bootstrapState);
'''
fixture_replacement = '''assert.equal(terminalCrossScopeStatus.cycles.other_scope_unreceipted.length, 1);
assert.equal(terminalCrossScopeStatus.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");
const collidingReceiptEvents = [{ ...doctorEvents[0], scope: "star-trek", task_id: "ap_star_collision" }];
const collidingScopeState = structuredClone(bootstrapState);
collidingScopeState.cycles.push(makeCycleReceipt({
  version: 1,
  scope_id: "star-trek",
  lease_id: "lease_doctor",
  outcome: "aborted",
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T16:55:00Z",
  note: "A receipt from another scope deliberately collides on lease ID and must not release Doctor Who custody.",
  evidence: [{ type: "incident", value: "cross-scope-lease-id-collision" }],
}, {
  config: bootstrapConfig,
  state: collidingScopeState,
  autopilot: { jobs: [job("ap_star_collision", "resolved")] },
  mediaAudit: media(),
  groups: leaseGroups(collidingReceiptEvents, "star-trek"),
}));
const collidingReceiptStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: collidingScopeState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("resolved")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(collidingReceiptStatus.phase, "other-cycle-receipt-required");
assert.equal(collidingReceiptStatus.claim_allowed, false);
assert.ok(collidingReceiptStatus.claim_reasons.includes("other_scope_cycle_receipt_required"));
assert.equal(collidingReceiptStatus.cycles.other_scope_unreceipted.length, 1);
assert.equal(collidingReceiptStatus.cycles.other_scope_unreceipted[0].scope_id, "doctor-who");
assert.equal(collidingReceiptStatus.cycles.other_scope_unreceipted[0].lease_id, "lease_doctor");
const receiptedDoctorState = structuredClone(bootstrapState);
'''
replace_once(fixtures, fixture_anchor, fixture_replacement, "collision fixture")
replace_once(
    fixtures,
    '''console.log("PASS — rolling gold cycles, first-pilot bootstrap, global single-cycle custody through reviewed receipt, drills, metrics, incident authority, stop/reopen, and natural unlocks");
''',
    '''console.log("PASS — rolling gold cycles, scope-bound receipts, first-pilot bootstrap, global single-cycle custody through reviewed receipt, drills, metrics, incident authority, stop/reopen, and natural unlocks");
''',
    "fixture success summary",
)

checker = Path("scripts/doctor-who-activation.mjs")
checker_anchor = '''  assert.equal(terminal.cycles.other_scope_unreceipted.length, 1);
  assert.equal(terminal.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");

  const receiptedState = structuredClone(state);
'''
checker_replacement = '''  assert.equal(terminal.cycles.other_scope_unreceipted.length, 1);
  assert.equal(terminal.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");

  const collidingReceiptEvents = [{ ...doctorEvents[0], scope: "star-trek", task_id: "ap_star_collision" }];
  const collidingScopeState = structuredClone(state);
  collidingScopeState.cycles.push(makeCycleReceipt({
    version: 1,
    scope_id: "star-trek",
    lease_id: "lease_doctor",
    outcome: "aborted",
    reviewed_by: "second-desk",
    reviewed_role: "second-desk",
    reviewed_at: "2026-08-02T16:55:00Z",
    note: "A receipt from another scope deliberately collides on lease ID and must not release Doctor Who custody.",
    evidence: [{ type: "incident", value: "cross-scope-lease-id-collision" }],
  }, {
    config,
    state: collidingScopeState,
    autopilot: { jobs: [{ ...starJob, id: "ap_star_collision", status: "resolved" }] },
    mediaAudit: starMedia,
    groups: leaseGroups(collidingReceiptEvents, "star-trek"),
  }));
  const collidingReceipt = deriveWaterlineStatus({
    config,
    state: collidingScopeState,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("resolved")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(collidingReceipt.phase, "other-cycle-receipt-required");
  assert.equal(collidingReceipt.claim_allowed, false);
  assert.ok(collidingReceipt.claim_reasons.includes("other_scope_cycle_receipt_required"));
  assert.equal(collidingReceipt.cycles.other_scope_unreceipted.length, 1);
  assert.equal(collidingReceipt.cycles.other_scope_unreceipted[0].scope_id, "doctor-who");
  assert.equal(collidingReceipt.cycles.other_scope_unreceipted[0].lease_id, "lease_doctor");

  const receiptedState = structuredClone(state);
'''
replace_once(checker, checker_anchor, checker_replacement, "checker collision proof")
replace_once(
    checker,
    '''    terminal_unreceipted: {
      phase: terminal.phase,
      claim_allowed: terminal.claim_allowed,
      blocker: "other_scope_cycle_receipt_required",
      other_scope_unreceipted: terminal.cycles.other_scope_unreceipted.length,
    },
    receipted: {
''',
    '''    terminal_unreceipted: {
      phase: terminal.phase,
      claim_allowed: terminal.claim_allowed,
      blocker: "other_scope_cycle_receipt_required",
      other_scope_unreceipted: terminal.cycles.other_scope_unreceipted.length,
    },
    mismatched_scope_receipt: {
      phase: collidingReceipt.phase,
      claim_allowed: collidingReceipt.claim_allowed,
      blocker: "other_scope_cycle_receipt_required",
      other_scope_unreceipted: collidingReceipt.cycles.other_scope_unreceipted.length,
      required_scope_id: collidingReceipt.cycles.other_scope_unreceipted[0].scope_id,
      colliding_lease_id: collidingReceipt.cycles.other_scope_unreceipted[0].lease_id,
    },
    receipted: {
''',
    "checker collision result",
)
replace_once(
    checker,
    '''  assert.equal(report.global_cycle_custody?.repair?.review_comment_id, 3700209880);
''',
    '''  assert.equal(report.global_cycle_custody?.repair?.review_comment_id, 3700334878);
  assert.equal(report.global_cycle_custody?.receipt_match_key, "scope_id+lease_id");
''',
    "latest review and exact key binding",
)

docs = Path("docs/AUTOPILOT.md")
replace_once(
    docs,
    '''The first lease closes the exception immediately. Global one-cycle custody then blocks every scope from issuing another lease while any task is active and after terminal task handling until that exact lease has a durable reviewed waterline receipt. The pilot must proceed through submission or explicit blocking, canonical adoption where applicable, exact-subject media review or honest absence, and the reviewed cycle receipt before any scope can claim more work.
''',
    '''The first lease closes the exception immediately. Global one-cycle custody then blocks every scope from issuing another lease while any task is active and after terminal task handling until that exact lease has a durable reviewed waterline receipt. Receipt matching is exact on both `scope_id` and `lease_id`; a receipt from another scope with a colliding lease identifier cannot release custody. The pilot must proceed through submission or explicit blocking, canonical adoption where applicable, exact-subject media review or honest absence, and the reviewed cycle receipt before any scope can claim more work.
''',
    "scope-bound receipt documentation",
)

checker_text = checker.read_text()
receipt_path = Path("data/review/adapter-sdk/doctor-who-activation-001.json")
report = json.loads(receipt_path.read_text())
report["global_cycle_custody"] = {
    "code_sha256": {
        "scripts/doctor-who-activation.mjs": hashlib.sha256(checker_text.encode()).hexdigest(),
        "scripts/lib/waterline.mjs": hashlib.sha256(waterline.read_bytes()).hexdigest(),
        "scripts/waterline-fixtures.mjs": hashlib.sha256(fixtures.read_bytes()).hexdigest(),
    },
    "expected_transitions": {
        "active": {
            "blocker": "other_scope_cycle_in_flight",
            "claim_allowed": False,
            "other_scope_unreceipted": 1,
            "phase": "other-cycle-in-flight",
        },
        "mismatched_scope_receipt": {
            "blocker": "other_scope_cycle_receipt_required",
            "claim_allowed": False,
            "colliding_lease_id": "lease_doctor",
            "other_scope_unreceipted": 1,
            "phase": "other-cycle-receipt-required",
            "required_scope_id": "doctor-who",
        },
        "receipted": {
            "claim_allowed": True,
            "other_scope_unreceipted": 0,
        },
        "terminal_unreceipted": {
            "blocker": "other_scope_cycle_receipt_required",
            "claim_allowed": False,
            "other_scope_unreceipted": 1,
            "phase": "other-cycle-receipt-required",
        },
    },
    "receipt_match_key": "scope_id+lease_id",
    "repair": {
        "base_main": os.environ["CURRENT_MAIN"],
        "launcher_head": os.environ["AUTHORIZED_HEAD"],
        "review_comment_id": 3700334878,
        "workflow_run": os.environ["GITHUB_RUN_ID"],
    },
    "status": "behaviorally-recomputed",
    "verification_method": "permanent-checker-recomputes-active-terminal-unreceipted-mismatched-scope-and-receipted-transitions",
}
replace_once(
    checker,
    '''    "permanent-checker-recomputes-active-terminal-unreceipted-and-receipted-transitions",
''',
    '''    "permanent-checker-recomputes-active-terminal-unreceipted-mismatched-scope-and-receipted-transitions",
''',
    "verification method expansion",
)
checker_text = checker.read_text()
report["global_cycle_custody"]["code_sha256"]["scripts/doctor-who-activation.mjs"] = hashlib.sha256(checker_text.encode()).hexdigest()
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

print("global cycle receipts now require an exact scope-plus-lease match")
