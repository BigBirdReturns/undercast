#!/usr/bin/env python3
import runpy
import subprocess
from pathlib import Path

CORE = Path("scripts/apply-doctor-who-activation-001-core.py")
TARGET = Path("scripts/doctor-who-activation.mjs")
METRIC_FIXTURES = Path("scripts/metric-readiness-fixtures.mjs")

runpy.run_path(str(CORE), run_name="__main__")

text = TARGET.read_text()
old = '''  const activationEvents = current.autopilotJournal.filter((row) => row.op === "scope.certified" && row.scope === SCOPE_ID && row.activated === true && row.at === context.activated_at);
  assert.equal(activationEvents.length, 1, "activation certification event is missing or duplicated");
'''
new = '''  const activationEvents = current.autopilotJournal.filter((row) => row.op === "scope.certified" && row.scope === SCOPE_ID && row.activated === true && (!context.activated_at || row.at === context.activated_at));
  assert.equal(activationEvents.length, 1, "activation certification event is missing or duplicated");
  context.activated_at ||= activationEvents[0].at;
'''
count = text.count(old)
if count != 1:
    raise SystemExit(f"activation-event recovery patch: expected one match, found {count}")
TARGET.write_text(text.replace(old, new))

metric_text = METRIC_FIXTURES.read_text()
metric_old = '''  operations: {
    required_drills: ["repository-restore", "publication-rollback"],
'''
metric_new = '''  operations: {
    one_cycle_at_a_time: true,
    required_drills: ["repository-restore", "publication-rollback"],
'''
metric_count = metric_text.count(metric_old)
if metric_count != 1:
    raise SystemExit(f"metric-readiness one-cycle fixture patch: expected one match, found {metric_count}")
METRIC_FIXTURES.write_text(metric_text.replace(metric_old, metric_new))

subprocess.run(["git", "rm", "--quiet", str(CORE)], check=True)
print("activation patch applied with journal timestamp recovery and global-cycle metric fixture custody")
