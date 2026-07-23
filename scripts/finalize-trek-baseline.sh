#!/usr/bin/env bash
set -euo pipefail

python - <<'PY'
from pathlib import Path

path = Path('scripts/build-trek-media-campaign.py')
text = path.read_text()

def replace(old, new, count=1):
    global text
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f'expected {count} occurrence(s), found {actual}: {old[:120]!r}')
    text = text.replace(old, new, count)

replace(
'''MANUAL_SIGNALS = {
    172: ("ImageDescription", "Leigh McCloskey at THOTHS Library"),
    336: ("page-title", "B-4"),
    358: ("page-title", "F5"),
    359: ("page-title", "F8"),
    489: ("file-link", "John Schuck / Klingon 23rd ambassador / Star Trek VI"),
    544: ("file-link", "Oh / Tamlyn Tomita / Star Trek: Picard"),
}
''',
'''MANUAL_SIGNALS = {
    172: ("ImageDescription", "Leigh McCloskey at THOTHS Library"),
    336: ("page-title", "B-4"),
    358: ("page-title", "F5"),
    359: ("page-title", "F8"),
    489: ("file-link", "John Schuck / Klingon 23rd ambassador / Star Trek VI"),
    544: ("file-link", "Oh / Tamlyn Tomita / Star Trek: Picard"),
    609: ("page-title", "File:Day (Colonel).jpg"),
}
''')

replace(
'''def source_signal(row, meta):
''',
'''GENERIC_STILL_SIGNALS = {
    compact(value) for value in (
        "the", "doctor", "dr", "commander", "sub-commander", "captain",
        "admiral", "ambassador", "general", "colonel", "major",
        "lieutenant", "senator", "vedek", "kai", "gul", "glinn",
        "legate", "maje", "daimon", "commodore", "administrator",
        "nurse", "mr", "first officer", "officer",
    )
}
RANK_PREFIX = re.compile(
    r"^(?:the|dr\\.?|doctor|sub[- ]?commander|commander|captain|admiral|"
    r"ambassador|general|colonel|major|lieutenant|senator|vedek|kai|gul|"
    r"glinn|legate|maje|daimon|commodore|administrator|nurse|mr\\.?)\\s+",
    re.I,
)


def still_variants(expected_subject):
    values = []
    for component in components(expected_subject):
        candidates = [component]
        candidates.append(re.sub(r"\\s*\\([^)]*\\)\\s*", " ", component).strip())
        candidates.append(re.sub(r",?\\s+son of\\b.*$", "", component, flags=re.I).strip())
        for candidate in list(candidates):
            candidates.append(re.sub(r"\\s*\\([^)]*\\)\\s*", " ", candidate).strip())
            candidates.append(re.sub(r",?\\s+son of\\b.*$", "", candidate, flags=re.I).strip())
        for candidate in list(candidates):
            candidates.append(RANK_PREFIX.sub("", candidate).strip())
        for candidate in candidates:
            if candidate and compact(candidate) not in GENERIC_STILL_SIGNALS and candidate not in values:
                values.append(candidate)
    return values


def source_signal(row, meta):
''')

replace(
'''    variants = []
    for component in components(row["expected_subject"]):
        variants += [
            component,
            re.sub(r"^(?:the|dr\\.?|doctor|commander|captain|admiral|ambassador|general|colonel|major|lieutenant|senator|vedek|kai|gul|glinn|legate|maje|daimon|commodore|administrator|nurse|mr\\.?)\\s+", "", component, flags=re.I),
            re.sub(r"\\s*\\([^)]*\\)\\s*", " ", component),
        ]
    matches = []
    for kind, value in candidates:
        packed = compact(value)
        for variant in variants:
            expected = compact(variant)
            if expected and len(expected) >= 3 and (expected in packed or packed in expected) and min(len(expected), len(packed)) >= 3:
                matches.append((variant, kind, value))
                break
    priority = {"title": 0, "links": 1, "ImageDescription": 2, "categories": 3, "globalusage": 4}
''',
'''    variants = still_variants(row["expected_subject"])
    matches = []
    for kind, value in candidates:
        packed = compact(value)
        if not packed or packed in GENERIC_STILL_SIGNALS:
            continue
        for variant in variants:
            expected = compact(variant)
            if expected and len(expected) >= 3 and (expected in packed or packed in expected) and min(len(expected), len(packed)) >= 3:
                matches.append((variant, kind, value))
                break
    priority = {"title": 0, "ObjectName": 1, "links": 2, "ImageDescription": 3, "categories": 4, "globalusage": 5}
''')

path.write_text(text)
PY

rm -rf /tmp/trek-review /tmp/trek-wikimedia /tmp/trek-fandom
mkdir -p /tmp/trek-review /tmp/trek-wikimedia /tmp/trek-fandom
gh run download 30017783530 -n trek-media-review-export -D /tmp/trek-review
gh run download 30019760354 -n trek-wikimedia-source-metadata -D /tmp/trek-wikimedia
gh run download 30020178341 -n trek-fandom-source-metadata -D /tmp/trek-fandom

python scripts/build-trek-media-campaign.py \
  --review /tmp/trek-review \
  --wikimedia /tmp/trek-wikimedia \
  --fandom /tmp/trek-fandom \
  --out data/review

python - <<'PY'
import json, re
from pathlib import Path

receipt = json.loads(Path('data/review/star-trek-media-source-receipts-2026-07-23.json').read_text())
campaign = json.loads(Path('data/review/star-trek-media-audit-campaign-2026-07-23.json').read_text())
assert receipt['counts'] == {'total': 648, 'verify': 556, 'null': 92}, receipt['counts']
assert len(receipt['rows']) == 648
assert len(campaign['approvals']) == 556
assert len(campaign['remediations']) == 92
assert campaign['expected_result'] == {'total': 744, 'verified': 556, 'absent': 188, 'review': 0, 'attention': 0}

generic = {re.sub(r'[^a-z0-9]+', '', value.lower()) for value in [
    'the','doctor','dr','commander','sub-commander','captain','admiral',
    'ambassador','general','colonel','major','lieutenant','senator','vedek',
    'kai','gul','glinn','legate','maje','daimon','commodore','administrator',
    'nurse','mr','first officer','officer'
]}
approved = [row for row in receipt['rows'] if row['disposition'] == 'verify']
for row in approved:
    signal = row['source_signal']
    packed = re.sub(r'[^a-z0-9]+', '', str(signal['value']).lower())
    if packed in generic:
        raise SystemExit(f"generic identity signal survived for {row['index']}: {signal}")
    meta = row['source_metadata']
    for key in ('pageid','revision','timestamp','sha1','metadata_sha256'):
        if not meta.get(key):
            raise SystemExit(f"missing revision-bound source metadata {key} for {row['index']}")
links = [row for row in approved if row['source_signal']['kind'] == 'links']
assert [(row['index'], row['source_signal']['value']) for row in links] == [(294, 'Elim Garak')], links
manual = {row['index']: row['source_signal'] for row in approved if row['source_signal']['kind'] in {'page-title','file-link'}}
for index in (336, 358, 359, 489, 544, 609):
    assert index in manual, (index, manual)
print('PASS — 648 rulings, 556 revision-bound approvals, 92 reversible nulls, zero generic identity signals')
PY

node --check scripts/media-audit-campaign.mjs
node --check scripts/media-audit-campaign-fixtures.mjs
npm ci
npm run media:audit:campaign:fixtures
npm run media:audit:campaign -- --input data/review/star-trek-media-audit-campaign-2026-07-23.json
node scripts/credits.mjs
node scripts/needs.mjs
node scripts/sync-sources.mjs
npm run media:audit -- sync --now 2026-07-23T17:00:00.000Z
node scripts/shard.mjs
node scripts/build-contract.mjs
npm run media:audit -- validate
npm run media:audit -- gate --scope star-trek
npm run waterline -- status --scope star-trek

python - <<'PY'
import json
from pathlib import Path

roadmap = Path('data/ROADMAP-STATE.json')
doc = json.loads(roadmap.read_text())
doc['metrics']['verified_records'] = 372
doc['metrics']['media_audit_ratio'] = 1
note = 'Star Trek exact-subject baseline closed by the 2026-07-23 hash-bound campaign: 372/372 records and 744/744 facets complete; 556 assets verified and 188 facets honestly absent. This measures the current baseline and does not close star-trek-gold-shard.'
if note not in doc['notes']:
    doc['notes'].append(note)
roadmap.write_text(json.dumps(doc, indent=2) + '\n')

gate = Path('scripts/gate.mjs')
text = gate.read_text()
if 'Media campaign fixtures' not in text:
    old = '{ id: "media-audit", label: "Validate exact-subject media audit tracker", action: () => { runNpmScript("Media audit fixtures", "media:audit:fixtures"); runNpmScript("Media audit state", "media:audit", ["--", "validate"]); runNpmScript("Media audit status", "media:audit", ["--", "status", "--scope", "star-trek"]); } },'
    new = '{ id: "media-audit", label: "Validate exact-subject media audit tracker", action: () => { runNpmScript("Media audit fixtures", "media:audit:fixtures"); runNpmScript("Media campaign fixtures", "media:audit:campaign:fixtures"); runNpmScript("Media audit state", "media:audit", ["--", "validate"]); runNpmScript("Media audit status", "media:audit", ["--", "status", "--scope", "star-trek"]); } },'
    if text.count(old) != 1:
        raise SystemExit('canonical media-audit gate step changed unexpectedly')
    gate.write_text(text.replace(old, new))

media_doc = Path('docs/MEDIA-AUDIT.md')
media_text = media_doc.read_text()
heading = '## Reviewed baseline campaigns'
if heading not in media_text:
    media_text += '''\n\n## Reviewed baseline campaigns\n\nA full-scope campaign may apply many rulings only through `npm run media:audit:campaign -- --input data/review/<campaign>.json`. The campaign must cover every current open facet exactly once, bind every ruling to the current asset and item-set hashes, cite a retained source receipt, and carry second-desk or owner authority. Wrong or ambiguous media is nulled from both canonical mirrors while immutable bytes and former objects remain in `data/journal/media-remediation.jsonl`. Positive identity decisions require revision-bound source metadata and may never be inferred from appearance. All canonical mirrors and journals commit as one rollback-capable transaction.\n'''
    media_doc.write_text(media_text)
PY

node scripts/roadmap.mjs validate
node scripts/shard.mjs
node scripts/build-contract.mjs

rm -f scripts/finalize-trek-baseline.sh

git config user.name 'undercast-media-audit'
git config user.email 'undercast-media-audit@users.noreply.github.com'
git add -A
git diff --cached --check
git commit -m 'Audit: close the Star Trek exact-subject baseline'

npx playwright install --with-deps chromium
npm run gate

git push origin HEAD:agent/trek-media-baseline-closure
