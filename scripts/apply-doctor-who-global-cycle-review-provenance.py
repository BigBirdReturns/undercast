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


checker = Path("scripts/doctor-who-activation.mjs")
replace_once(
    checker,
    'import { deriveWaterlineStatus, validateWaterlineConfig, validateWaterlineState } from "./lib/waterline.mjs";\n',
    '''import {
  deriveWaterlineStatus,
  emptyWaterlineState,
  leaseGroups,
  makeCycleReceipt,
  validateWaterlineConfig,
  validateWaterlineState,
} from "./lib/waterline.mjs";
''',
    "waterline proof imports",
)

proof = r'''
function verifyGlobalCycleCustodyContract() {
  const config = {
    version: 1,
    scopes: [
      {
        id: "star-trek",
        label: "Star Trek",
        roadmap_milestone: "star-trek-gold-shard",
        required_closed_cycles: 3,
        max_tasks_per_cycle: 8,
        minimum_resolved_per_cycle: 1,
      },
      {
        id: "doctor-who",
        label: "Doctor Who",
        roadmap_milestone: "adapter-sdk-and-second-gold-shard",
        required_closed_cycles: 1,
        max_tasks_per_cycle: 1,
        minimum_resolved_per_cycle: 1,
        initial_pilot: { allow_without_media_baseline: true, max_tasks: 1 },
      },
    ],
    operations: {
      one_cycle_at_a_time: true,
      required_drills: ["repository-restore", "publication-rollback"],
      slo_targets: {
        build_minutes_p95: 20,
        source_freshness_p95_days: 14,
        rights_response_sla_days: 14,
      },
    },
  };
  const state = emptyWaterlineState();
  validateWaterlineState(state, config);
  const roadmapState = { completed: [{ milestone: "trusted-foundation" }] };
  const preservation = { history_guard: { precondition_met: true, status: "offsite-verified" } };
  const starMedia = {
    source: { item_set_sha256: "a".repeat(64) },
    items: [
      { id: "m1", scope: "star-trek", status: "verified" },
      { id: "m2", scope: "star-trek", status: "absent" },
    ],
  };
  const doctorMedia = { source: { item_set_sha256: "e".repeat(64) }, items: [] };
  const starJob = {
    id: "ap_star",
    scope: "star-trek",
    status: "queued",
    source_fingerprint: "b".repeat(64),
    wall_ids: [],
  };
  const doctorJob = (status) => ({
    id: "ap_doctor",
    scope: "doctor-who",
    status,
    source_fingerprint: "d".repeat(64),
    wall_ids: [],
  });
  const doctorEvents = [{
    op: "lease.claimed",
    task_id: "ap_doctor",
    at: "2026-08-02T16:40:00Z",
    scope: "doctor-who",
    lease_id: "lease_doctor",
    readiness_token: "f".repeat(64),
  }];

  const active = deriveWaterlineStatus({
    config,
    state,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("leased")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(active.phase, "other-cycle-in-flight");
  assert.equal(active.claim_allowed, false);
  assert.ok(active.claim_reasons.includes("other_scope_cycle_in_flight"));
  assert.equal(active.cycles.other_scope_unreceipted.length, 1);

  const terminal = deriveWaterlineStatus({
    config,
    state,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("resolved")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(terminal.phase, "other-cycle-receipt-required");
  assert.equal(terminal.claim_allowed, false);
  assert.ok(terminal.claim_reasons.includes("other_scope_cycle_receipt_required"));
  assert.equal(terminal.cycles.other_scope_unreceipted.length, 1);
  assert.equal(terminal.cycles.other_scope_unreceipted[0].task_statuses.ap_doctor, "resolved");

  const receiptedState = structuredClone(state);
  receiptedState.cycles.push(makeCycleReceipt({
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
    config,
    state: receiptedState,
    autopilot: { jobs: [doctorJob("resolved")] },
    mediaAudit: doctorMedia,
    groups: leaseGroups(doctorEvents, "doctor-who"),
  }));
  const receipted = deriveWaterlineStatus({
    config,
    state: receiptedState,
    mediaAudit: starMedia,
    autopilot: { jobs: [starJob, doctorJob("resolved")] },
    autopilotJournal: doctorEvents,
    roadmapState,
    preservation,
    scopeId: "star-trek",
    requestedTasks: 1,
  });
  assert.equal(receipted.claim_allowed, true);
  assert.equal(receipted.cycles.other_scope_unreceipted.length, 0);

  return {
    active: {
      phase: active.phase,
      claim_allowed: active.claim_allowed,
      blocker: "other_scope_cycle_in_flight",
      other_scope_unreceipted: active.cycles.other_scope_unreceipted.length,
    },
    terminal_unreceipted: {
      phase: terminal.phase,
      claim_allowed: terminal.claim_allowed,
      blocker: "other_scope_cycle_receipt_required",
      other_scope_unreceipted: terminal.cycles.other_scope_unreceipted.length,
    },
    receipted: {
      claim_allowed: receipted.claim_allowed,
      other_scope_unreceipted: receipted.cycles.other_scope_unreceipted.length,
    },
  };
}
'''
replace_once(
    checker,
    '\nasync function checkReceipt(root, report) {\n',
    f"\n{proof}\nasync function checkReceipt(root, report) {{\n",
    "executable global-cycle proof",
)
replace_once(
    checker,
    '''  assert.equal(report.global_cycle_custody?.status, "smoke-passed");
  assert.equal(report.global_cycle_custody?.other_scope_active_work_blocked, true);
  assert.equal(report.global_cycle_custody?.other_scope_terminal_unreceipted_blocked, true);
  assert.equal(report.global_cycle_custody?.global_claim_release_requires_cycle_receipt, true);
  assert.equal(report.global_cycle_custody?.candidate_complete_gate_passed, true);
  assert.equal(report.global_cycle_custody?.final_complete_gate_passed, true);
''',
    '''  const recomputedGlobalCycle = verifyGlobalCycleCustodyContract();
  assert.equal(report.global_cycle_custody?.status, "behaviorally-recomputed");
  assert.equal(
    report.global_cycle_custody?.verification_method,
    "permanent-checker-recomputes-active-terminal-unreceipted-and-receipted-transitions",
  );
  assert.match(report.global_cycle_custody?.repair?.workflow_run || "", /^[0-9]+$/);
  assert.match(report.global_cycle_custody?.repair?.base_main || "", /^[0-9a-f]{40}$/);
  assert.match(report.global_cycle_custody?.repair?.launcher_head || "", /^[0-9a-f]{40}$/);
  assert.equal(report.global_cycle_custody?.repair?.review_comment_id, 3700209880);
  const requiredCodeFiles = [
    "scripts/doctor-who-activation.mjs",
    "scripts/lib/waterline.mjs",
    "scripts/waterline-fixtures.mjs",
  ];
  assert.deepEqual(Object.keys(report.global_cycle_custody?.code_sha256 || {}).sort(), [...requiredCodeFiles].sort());
  for (const file of requiredCodeFiles) {
    assert.equal(
      report.global_cycle_custody.code_sha256[file],
      sha256(readBytes(root, file)),
      `${file} no longer matches the reviewed global-cycle custody proof`,
    );
  }
  assert.deepEqual(report.global_cycle_custody?.expected_transitions, recomputedGlobalCycle);
''',
    "replace self-asserted gate booleans",
)
checker_text = checker.read_text()

receipt_path = Path("data/review/adapter-sdk/doctor-who-activation-001.json")
report = json.loads(receipt_path.read_text())
report["global_cycle_custody"] = {
    "code_sha256": {
        "scripts/doctor-who-activation.mjs": hashlib.sha256(checker_text.encode()).hexdigest(),
        "scripts/lib/waterline.mjs": hashlib.sha256(Path("scripts/lib/waterline.mjs").read_bytes()).hexdigest(),
        "scripts/waterline-fixtures.mjs": hashlib.sha256(Path("scripts/waterline-fixtures.mjs").read_bytes()).hexdigest(),
    },
    "expected_transitions": {
        "active": {
            "blocker": "other_scope_cycle_in_flight",
            "claim_allowed": False,
            "other_scope_unreceipted": 1,
            "phase": "other-cycle-in-flight",
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
    "repair": {
        "base_main": os.environ["CURRENT_MAIN"],
        "launcher_head": os.environ["AUTHORIZED_HEAD"],
        "review_comment_id": 3700209880,
        "workflow_run": os.environ["GITHUB_RUN_ID"],
    },
    "status": "behaviorally-recomputed",
    "verification_method": "permanent-checker-recomputes-active-terminal-unreceipted-and-receipted-transitions",
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

print("review provenance now binds exact code bytes and executable global-cycle transitions")
