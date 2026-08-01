#!/usr/bin/env bash
set -euo pipefail

SOURCE="scripts/estate-run-collect014.sh"
TEMP="/tmp/estate-run-collect014-v2-exec.sh"
SELF="scripts/estate-run-collect014-v2.sh"

test -e "$SOURCE"
test -e "$SELF"

python3 - "$SOURCE" "$TEMP" <<'PY'
from pathlib import Path
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text(encoding="utf-8")


def replace_one(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    text = text.replace(old, new)


replace_one(
    'AUDITOR="scripts/estate-audit-pr88-direct-only-014.py"\n',
    '',
    'retired auditor variable',
)
replace_one(
    'test -e "$AUDITOR"\n',
    'test ! -e "scripts/estate-audit-pr88-direct-only-014.py"\n',
    'retired auditor custody',
)
replace_one(
    'test ! -e "$AUDIT_REPORT"\n',
    'test -e "$AUDIT_REPORT"\n',
    'published audit report custody',
)
replace_one(
    'test ! -e "$SOURCE_OUTPUT"\n',
    'test -e "$SOURCE_OUTPUT"\n'
    'test -e "$SOURCE_OUTPUT/MANIFEST.json"\n'
    'test ! -e "$SOURCE_MANIFEST"\n'
    'test ! -e "$CROP_ROOT"\n',
    'published audit estate custody',
)
replace_one(
    'python3 -m py_compile "$AUDITOR"\n',
    '',
    'retired auditor compilation',
)

start_marker = 'NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"\npython3 "$AUDITOR"'
end_line = 'test "$(node -p "require(\'./$AUDIT_REPORT\').status")" = "authorized"\n'
start = text.find(start_marker)
if start < 0:
    raise SystemExit('published-audit replacement start was not found')
end = text.find(end_line, start)
if end < 0:
    raise SystemExit('published-audit replacement end was not found')
end += len(end_line)
replacement = '''NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
test "$(node -p "require('./$AUDIT_REPORT').transaction")" = "COLLECT-014"
test "$(node -p "require('./$AUDIT_REPORT').operation")" = "pr88-direct-only-current-head-reconciliation"
test "$(node -p "require('./$AUDIT_REPORT').status")" = "authorized"
test "$(node -p "require('./$AUDIT_REPORT').authorization.source_pull_request")" = "88"
test "$(node -p "require('./$AUDIT_REPORT').authorization.source_head")" = "$SOURCE_HEAD"
test "$(node -p "require('./$AUDIT_REPORT').denominator.direct_only_objects")" = "9"
test "$(node -p "require('./$AUDIT_REPORT').denominator.reviewed")" = "9"
test "$(node -p "require('./$AUDIT_REPORT').denominator.authorized")" = "9"
test "$(node -p "require('./$AUDIT_REPORT').denominator.blocked")" = "0"
test "$(node -p "require('./$AUDIT_REPORT').quality_effect_if_authorized_set_is_adopted.complete_pairs")" = "9"
test "$(node -p "require('./$AUDIT_REPORT').quality_effect_if_authorized_set_is_adopted.missing_still")" = "-7"
test "$(node -p "require('./$AUDIT_REPORT').quality_effect_if_authorized_set_is_adopted.missing_portrait")" = "-2"
test "$(node -p "require('./$AUDIT_REPORT').quality_effect_if_authorized_set_is_adopted.missing_both")" = "0"
test "$(node -p "require('./$SOURCE_OUTPUT/MANIFEST.json').source_pull_request")" = "88"
test "$(node -p "require('./$SOURCE_OUTPUT/MANIFEST.json').source_head")" = "$SOURCE_HEAD"
test "$(node -p "require('./$SOURCE_OUTPUT/MANIFEST.json').counts.obligation_packets")" = "9"
'''
text = text[:start] + replacement + text[end:]

replace_one(
    "for (const required of ['data/specimens.json','data/SOURCES.json',process.argv[5],process.argv[6],process.argv[7],process.argv[8]]) {",
    "for (const required of ['data/specimens.json','data/SOURCES.json',process.argv[6],process.argv[7],process.argv[8]]) {",
    'candidate required-path denominator',
)
replace_one(
    'git rm "$AUDITOR" "$EXECUTOR" "$RUNNER"',
    'git rm "$EXECUTOR" "$RUNNER" "scripts/estate-run-collect014-v2.sh"',
    'final executor cleanup',
)
replace_one(
    'EXPECTED_FINAL_PATHS="$(printf \'%s\\n%s\\n%s\\n%s\\n\' "$AUDITOR" "$EXECUTOR" "$PUBLICATION" "$RUNNER" | sort)"',
    'EXPECTED_FINAL_PATHS="$(printf \'%s\\n%s\\n%s\\n%s\\n\' "$EXECUTOR" "$PUBLICATION" "$RUNNER" "scripts/estate-run-collect014-v2.sh" | sort)"',
    'final path denominator',
)
replace_one(
    'The auditor, executor, and runner retired themselves.',
    'The executor, original runner, and V2 wrapper retired themselves. The evidence auditor retired when its immutable custody commit published.',
    'final report cleanup sentence',
)

target.write_text(text, encoding="utf-8")
target.chmod(0o700)
PY

bash "$TEMP"
