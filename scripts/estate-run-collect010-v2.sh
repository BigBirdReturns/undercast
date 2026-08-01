#!/usr/bin/env bash
set -euo pipefail

SOURCE="scripts/estate-run-collect010.sh"
TEMP="/tmp/estate-run-collect010-v2-exec.sh"

test -e "$SOURCE"

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

fixture_marker = 'test ! -e "$PUBLICATION"\n\ngh pr comment'
if text.count(fixture_marker) != 1:
    raise SystemExit(f"expected one pre-transaction fixture insertion point, found {text.count(fixture_marker)}")
fixture_patch = r'''test ! -e "$PUBLICATION"

# UC-040 is entering the paid set in this transaction. Repair rendered fixtures
# so they select an actually still-present/portrait-missing record from the
# exact candidate tree rather than preserving a stale absence assertion.
python3 - <<'PY_RENDERED_FIXTURE'
from pathlib import Path

path = Path('tests/rendered/site.spec.mjs')
source = path.read_text(encoding='utf-8')

anchor = 'const jpeg=await readFile(new URL("../../images/uc-035-portrait.jpg",import.meta.url));\n'
insertion = anchor + '''const renderedFixtureSpecimens=JSON.parse(await readFile(new URL("../../data/specimens.json",import.meta.url),"utf8"));
const missingPortraitFixture=renderedFixtureSpecimens.find(record=>record?.still?.src&&!record?.portrait?.src);
if(!missingPortraitFixture) throw new Error("rendered absence fixtures require one still-present, portrait-missing record");
'''
if source.count(anchor) != 1:
    raise SystemExit(f'rendered fixture import anchor expected one match, found {source.count(anchor)}')
source = source.replace(anchor, insertion)

old_record = '''    await page.route("**/releases/download/**",route=>route.abort());
    await open(page,"records/UC-040/");'''
new_record = '''    await page.route("**/releases/download/**",route=>route.abort());
    await open(page,`records/${missingPortraitFixture.id}/`);'''
if source.count(old_record) != 1:
    raise SystemExit(f'load-failure fixture expected one UC-040 block, found {source.count(old_record)}')
source = source.replace(old_record, new_record)

old_recognition = '''    await open(page,"recognition.html#UC-040");
    await expect(page.getByRole("heading",{name:"Zathras",exact:true}).first()).toBeVisible();'''
new_recognition = '''    await open(page,`recognition.html#${missingPortraitFixture.id}`);
    await expect(page.getByRole("heading",{name:missingPortraitFixture.character,exact:true}).first()).toBeVisible();'''
if source.count(old_recognition) != 1:
    raise SystemExit(f'full-bleed recognition fixture expected one UC-040 block, found {source.count(old_recognition)}')
source = source.replace(old_recognition, new_recognition)

old_permanent = '    await open(page,"records/UC-040/");'
new_permanent = '    await open(page,`records/${missingPortraitFixture.id}/`);'
if source.count(old_permanent) != 1:
    raise SystemExit(f'full-bleed permanent fixture expected one remaining UC-040 path, found {source.count(old_permanent)}')
source = source.replace(old_permanent, new_permanent)

path.write_text(source, encoding='utf-8')
PY_RENDERED_FIXTURE

gh pr comment'''
text = text.replace(fixture_marker, fixture_patch)

old_unexpected = "const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file));"
new_unexpected = "const unexpected = paths.filter((file) => !file.startsWith('data/') && !file.startsWith('records/') && !expectedImages.includes(file) && file !== 'tests/rendered/site.spec.mjs');"
if text.count(old_unexpected) != 1:
    raise SystemExit(f"expected one candidate-boundary predicate, found {text.count(old_unexpected)}")
text = text.replace(old_unexpected, new_unexpected)

old_required = "if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json')) throw new Error('canonical ledgers were not changed');"
new_required = "if (!paths.includes('data/specimens.json') || !paths.includes('data/SOURCES.json') || !paths.includes('tests/rendered/site.spec.mjs')) throw new Error('canonical ledgers or rendered absence fixture were not changed');"
if text.count(old_required) != 1:
    raise SystemExit(f"expected one candidate-required-path assertion, found {text.count(old_required)}")
text = text.replace(old_required, new_required)

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
