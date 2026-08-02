#!/usr/bin/env python3
import runpy
import subprocess
from pathlib import Path

CORE = Path("scripts/apply-doctor-who-activation-001-core.py")
TARGET = Path("scripts/doctor-who-activation.mjs")

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

subprocess.run(["git", "rm", "--quiet", str(CORE)], check=True)
print("activation patch applied with exact journal-event timestamp recovery")
