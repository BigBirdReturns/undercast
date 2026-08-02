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
    '''  ensureUnique(doc.cycles, "id", "cycle receipts");
  ensureUnique(doc.cycles, "lease_id", "cycle receipts");
  ensureUnique(doc.drills, "id", "drill receipts");
''',
    '''  ensureUnique(doc.cycles, "id", "cycle receipts");
  const cycleReceiptKeys = new Set();
  for (const cycle of doc.cycles) {
    const scopeId = requireString(cycle.scope_id, `cycle ${cycle.id || "<missing>"}.scope_id`);
    const leaseId = requireString(cycle.lease_id, `cycle ${cycle.id || "<missing>"}.lease_id`);
    if (!config.scopes.some((row) => row.id === scopeId)) throw new Error(`cycle ${cycle.id || "<missing>"} references unknown scope ${scopeId}`);
    const key = cycleReceiptKey(scopeId, leaseId);
    if (cycleReceiptKeys.has(key)) throw new Error(`cycle receipts contain duplicate scope/lease ${scopeId}/${leaseId}`);
    cycleReceiptKeys.add(key);
  }
  ensureUnique(doc.drills, "id", "drill receipts");
''',
    "composite cycle uniqueness validation",
)
replace_once(
    waterline,
    '''  if (context.state.cycles.some((row) => row.lease_id === input.lease_id)) throw new Error(`lease ${input.lease_id} is already receipted`);
''',
    '''  const inputReceiptKey = cycleReceiptKey(input.scope_id, input.lease_id);
  if (context.state.cycles.some((row) => cycleReceiptKey(row.scope_id, row.lease_id) === inputReceiptKey)) throw new Error(`lease ${input.scope_id}/${input.lease_id} is already receipted`);
''',
    "composite duplicate receipt refusal",
)

fixtures = Path("scripts/waterline-fixtures.mjs")
replace_once(
    fixtures,
    '''const receiptedDoctorState = structuredClone(bootstrapState);
receiptedDoctorState.cycles.push(makeCycleReceipt({
''',
    '''const receiptedDoctorState = structuredClone(collidingScopeState);
receiptedDoctorState.cycles.push(makeCycleReceipt({
''',
    "fixture release starts from collision state",
)
replace_once(
    fixtures,
    '''const releasedCrossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: receiptedDoctorState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("resolved")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(releasedCrossScopeStatus.claim_allowed, true);
assert.equal(releasedCrossScopeStatus.cycles.other_scope_unreceipted.length, 0);

console.log("PASS — rolling gold cycles, scope-bound receipts, first-pilot bootstrap, global single-cycle custody through reviewed receipt, drills, metrics, incident authority, stop/reopen, and natural unlocks");
''',
    '''assert.equal(receiptedDoctorState.cycles.length, 2);
assert.ok(receiptedDoctorState.cycles.some((row) => row.scope_id === "star-trek" && row.lease_id === "lease_doctor"));
assert.ok(receiptedDoctorState.cycles.some((row) => row.scope_id === "doctor-who" && row.lease_id === "lease_doctor"));
validateWaterlineState(receiptedDoctorState, bootstrapConfig);
assert.throws(() => makeCycleReceipt({
  version: 1,
  scope_id: "doctor-who",
  lease_id: "lease_doctor",
  outcome: "aborted",
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T17:01:00Z",
  note: "The exact composite receipt may not be duplicated.",
  evidence: [{ type: "incident", value: "duplicate-exact-cycle-receipt" }],
}, {
  config: bootstrapConfig,
  state: receiptedDoctorState,
  autopilot: { jobs: [doctorJob("resolved")] },
  mediaAudit: doctorMedia,
  groups: leaseGroups(doctorEvents, "doctor-who"),
}), /doctor-who\\/lease_doctor is already receipted/);
const releasedCrossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: receiptedDoctorState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("resolved")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(releasedCrossScopeStatus.claim_allowed, true);
assert.equal(releasedCrossScopeStatus.cycles.other_scope_unreceipted.length, 0);

console.log("PASS — rolling gold cycles, composite receipt uniqueness, collision recovery, first-pilot bootstrap, global single-cycle custody through reviewed receipt, drills, metrics, incident authority, stop/reopen, and natural unlocks");
''',
    "fixture composite collision recovery proof",
)

checker = Path("scripts/doctor-who-activation.mjs")
replace_once(
    checker,
    '''  const receiptedState = structuredClone(state);
  receiptedState.cycles.push(makeCycleReceipt({
''',
    '''  const receiptedState = structuredClone(collidingScopeState);
  receiptedState.cycles.push(makeCycleReceipt({
''',
    "checker release starts from collision state",
)
replace_once(
    checker,
    '''  const receipted = deriveWaterlineStatus({
    config,
    state: receiptedState,
''',
    '''  assert.equal(receiptedState.cycles.length, 2);
  assert.ok(receiptedState.cycles.some((row) => row.scope_id === "star-trek" && row.lease_id === "lease_doctor"));
  assert.ok(receiptedState.cycles.some((row) => row.scope_id === "doctor-who" && row.lease_id === "lease_doctor"));
  validateWaterlineState(receiptedState, config);
  assert.throws(() => makeCycleReceipt({
    version: 1,
    scope_id: "doctor-who",
    lease_id: "lease_doctor",
    outcome: "aborted",
    reviewed_by: "second-desk",
    reviewed_role: "second-desk",
    reviewed_at: "2026-08-02T17:01:00Z",
    note: "The exact composite receipt may not be duplicated.",
    evidence: [{ type: "incident", value: "duplicate-exact-cycle-receipt" }],
  }, {
    config,
    state: receiptedState,
    autopilot: { jobs: [doctorJob("resolved")] },
    mediaAudit: doctorMedia,
    groups: leaseGroups(doctorEvents, "doctor-who"),
  }), /doctor-who\\/lease_doctor is already receipted/);
  const receipted = deriveWaterlineStatus({
    config,
    state: receiptedState,
''',
    "checker composite collision recovery proof",
)
replace_once(
    checker,
    '''    receipted: {
      claim_allowed: receipted.claim_allowed,
      other_scope_unreceipted: receipted.cycles.other_scope_unreceipted.length,
    },
''',
    '''    receipted: {
      claim_allowed: receipted.claim_allowed,
      other_scope_unreceipted: receipted.cycles.other_scope_unreceipted.length,
      cycle_receipt_count: receiptedState.cycles.length,
      colliding_scope_receipt_preserved: receiptedState.cycles.some((row) => row.scope_id === "star-trek" && row.lease_id === "lease_doctor"),
      exact_scope_receipt_present: receiptedState.cycles.some((row) => row.scope_id === "doctor-who" && row.lease_id === "lease_doctor"),
    },
''',
    "checker receipt coexistence result",
)
replace_once(
    checker,
    '''    "permanent-checker-recomputes-active-terminal-unreceipted-mismatched-scope-and-receipted-transitions",
''',
    '''    "permanent-checker-recomputes-active-terminal-unreceipted-mismatched-scope-collision-recovery-and-receipted-transitions",
''',
    "verification method collision recovery",
)
replace_once(
    checker,
    '''  assert.equal(report.global_cycle_custody?.repair?.review_comment_id, 3700334878);
''',
    '''  assert.equal(report.global_cycle_custody?.repair?.review_comment_id, 3700382887);
''',
    "latest review comment binding",
)

replace_once(
    Path("docs/AUTOPILOT.md"),
    '''Receipt matching is exact on both `scope_id` and `lease_id`; a receipt from another scope with a colliding lease identifier cannot release custody. The pilot must proceed through submission or explicit blocking, canonical adoption where applicable, exact-subject media review or honest absence, and the reviewed cycle receipt before any scope can claim more work.
''',
    '''Receipt matching, state uniqueness, and duplicate refusal are exact on both `scope_id` and `lease_id`. A receipt from another scope with a colliding lease identifier cannot release custody, but it may coexist with the later exact receipt for the required scope; only a duplicate of the same scope-and-lease composite is refused. The pilot must proceed through submission or explicit blocking, canonical adoption where applicable, exact-subject media review or honest absence, and the reviewed cycle receipt before any scope can claim more work.
''',
    "composite receipt documentation",
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
            "colliding_scope_receipt_preserved": True,
            "cycle_receipt_count": 2,
            "exact_scope_receipt_present": True,
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
        "review_comment_id": 3700382887,
        "workflow_run": os.environ["GITHUB_RUN_ID"],
    },
    "status": "behaviorally-recomputed",
    "verification_method": "permanent-checker-recomputes-active-terminal-unreceipted-mismatched-scope-collision-recovery-and-receipted-transitions",
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

print("cycle receipt validation, creation, lookup, and collision recovery now share one composite identity")
