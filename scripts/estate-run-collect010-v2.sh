#!/usr/bin/env bash
set -euo pipefail

SOURCE="scripts/estate-run-collect010.sh"
TEMP="/tmp/estate-run-collect010-v2-exec.sh"

test -e "$SOURCE"
test -e "data/review/estate-debt/COLLECT-010-RENDERED-FIXTURE-REPAIR.json"
test "$(node -p "require('./data/review/estate-debt/COLLECT-010-RENDERED-FIXTURE-REPAIR.json').boundary.test_expectation_weakened")" = "false"

python3 - "$SOURCE" "$TEMP" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")

for stale_check in (
    'test -e "$ADOPTION_WORKFLOW"\n',
    'test -e "$OBSOLETE_AUDIT_WORKFLOW"\n',
):
    count = text.count(stale_check)
    if count != 1:
        raise SystemExit(f"expected one stale-workflow custody check, found {count}: {stale_check.strip()}")
    text = text.replace(stale_check, "")

start_marker = "# The paid adoption commit retires both the mutation workflow and the obsolete\n"
end_marker = "git diff --cached --check\n"
start = text.find(start_marker)
if start < 0:
    raise SystemExit("COLLECT-010 workflow-retirement block start was not found")
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit("COLLECT-010 workflow-retirement block end was not found")

replacement = '''# Workflow files were retired by owner-side cleanup before launch because the
# Actions token cannot mutate workflow definitions. The paid adoption commit
# therefore stages only the receipt and cumulative ledger beyond the already
# smoke-passed candidate tree.
git add -- "$RECEIPT" "$LEDGER"
PROMOTION_PATHS="$(git diff --cached --name-only "$(cat /tmp/COLLECT-010-candidate.tree)" | sort)"
EXPECTED_PROMOTION_PATHS="$(printf '%s\\n%s\\n' "$LEDGER" "$RECEIPT" | sort)"
test "$PROMOTION_PATHS" = "$EXPECTED_PROMOTION_PATHS"
'''
text = text[:start] + replacement + text[end:]

old_rm = 'git rm "$EXECUTOR" "$RUNNER"'
new_rm = 'git rm "$EXECUTOR" "$RUNNER" "scripts/estate-run-collect010-v2.sh"'
if text.count(old_rm) != 1:
    raise SystemExit(f"expected one final executor cleanup line, found {text.count(old_rm)}")
text = text.replace(old_rm, new_rm)

old_expected = 'EXPECTED_FINAL_PATHS="$(printf \'%s\\n%s\\n%s\\n%s\\n\' "$EXECUTOR" "$LEDGER" "$PUBLICATION" "$RUNNER" | sort)"'
new_expected = 'EXPECTED_FINAL_PATHS="$(printf \'%s\\n%s\\n%s\\n%s\\n%s\\n\' "$EXECUTOR" "$LEDGER" "$PUBLICATION" "$RUNNER" "scripts/estate-run-collect010-v2.sh" | sort)"'
if text.count(old_expected) != 1:
    raise SystemExit(f"expected one final-path denominator, found {text.count(old_expected)}")
text = text.replace(old_expected, new_expected)

old_report = "The mutation workflow, obsolete incompatible classifier, executor, and runner retired themselves. Four batched-amortized portraits and one distinct-era K9 still remain."
new_report = "The executor, original runner, and V2 wrapper retired themselves. Superseded workflows were removed before launch. Four batched-amortized portraits and one distinct-era K9 still remain."
if text.count(old_report) != 1:
    raise SystemExit(f"expected one cleanup report sentence, found {text.count(old_report)}")
text = text.replace(old_report, new_report)

target.write_text(text, encoding="utf-8")
target.chmod(0o700)
PY

bash "$TEMP"
