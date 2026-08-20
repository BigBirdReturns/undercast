#!/usr/bin/env bash
set -euo pipefail

PREP_JOB="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100" --jq '.jobs[] | select(.name=="unitkukulkan-probe-v2") | .id' | head -n1)"
test -n "$PREP_JOB"
export PREP_JOB

template_meta="$(gh api "/repos/${GITHUB_REPOSITORY}/actions/artifacts/${TEMPLATE_ARTIFACT_ID}")"
test "$(jq -r .expired <<<"$template_meta")" = false
test "$(jq -r .name <<<"$template_meta")" = star-trek-kol-tai-controller-source-v4
test "$(jq -r .workflow_run.id <<<"$template_meta")" = "$TEMPLATE_RUN"
test "$(jq -r .digest <<<"$template_meta")" = "sha256:${TEMPLATE_ARTIFACT_DIGEST}"

rm -rf /tmp/kol-tai-controller-template /tmp/kukulkan-controller-v2
mkdir -p /tmp/kol-tai-controller-template
gh run download "$TEMPLATE_RUN" -n star-trek-kol-tai-controller-source-v4 -D /tmp/kol-tai-controller-template

gh api "/repos/${GITHUB_REPOSITORY}/contents/.github/recovery/transform-kol-tai-controller-v1.base.py?ref=${BUILDER_SOURCE_HEAD}" --jq .content \
  | tr -d '\n' | base64 -d > /tmp/transform-kukulkan-controller-v2.py
test -s /tmp/transform-kukulkan-controller-v2.py
export TRANSFORM_PATH=/tmp/transform-kukulkan-controller-v2.py
python3 /tmp/patch-next-doohan-transform-v1.py /tmp/transform-kukulkan-controller-v2.py

# The inherited transform applies formatted replacements sequentially. Keep
# the decrement map in descending source order so 1,807 becomes 1,806 once,
# while 1,806 becomes 1,805 once, without a cascading double decrement.
python3 - <<'PY'
from pathlib import Path

path = Path('/tmp/transform-kukulkan-controller-v2.py')
text = path.read_text()
old = """formatted_map = {
    '1,807': '1,806', '1,806': '1,805',
}
"""
new = """formatted_map = {
    '1,806': '1,805', '1,807': '1,806',
}
"""
if text.count(old) != 1:
    raise SystemExit(f'Kukulkan formatted queue map marker drifted: {text.count(old)}')
path.write_text(text.replace(old, new, 1))
PY

python3 -m py_compile /tmp/transform-kukulkan-controller-v2.py

export TEMPLATE_ROOT=/tmp/kol-tai-controller-template
export PREP_ROOT=/tmp/kol-tai-prep-v4
export OUTPUT_ROOT=/tmp/kukulkan-controller-v2
export TEMPLATE_ARTIFACT_ID TEMPLATE_ARTIFACT_DIGEST PREP_ARTIFACT_ID PREP_ARTIFACT_DIGEST PREP_RUN PREP_JOB EXPECTED_MAIN
python3 /tmp/transform-kukulkan-controller-v2.py

# The controller generator preserves evidence text exactly, but its template
# serializes selected values inside single-quoted JavaScript literals. Escape
# only strings actually present in the sealed preparation JSON, then rebuild
# the controller manifest so its byte and hash ledger remains controlling.
python3 - <<'PY'
from pathlib import Path
import hashlib
import json

root = Path('/tmp/kukulkan-controller-v2')
prep = Path('/tmp/kol-tai-prep-v4')
programs = root / 'programs'

values = set()
def collect(value):
    if isinstance(value, dict):
        for item in value.values():
            collect(item)
    elif isinstance(value, list):
        for item in value:
            collect(item)
    elif isinstance(value, str) and "'" in value:
        values.add(value)

for name in ('task.json', 'source-receipt.json', 'media-preparation.json', 'episode-receipts.json'):
    matches = list(prep.rglob(name))
    if len(matches) != 1:
        raise SystemExit(f'{name}: expected one sealed preparation file, found {matches}')
    collect(json.loads(matches[0].read_text()))

replacements = []
for raw in sorted(values, key=len, reverse=True):
    escaped = raw.replace('\\', '\\\\').replace("'", "\\'")
    if raw != escaped:
        replacements.append((raw, escaped))

changed = {}
for path in sorted(programs.glob('*.mjs')):
    text = path.read_text()
    count = 0
    for raw, escaped in replacements:
        occurrences = text.count(raw)
        if occurrences:
            text = text.replace(raw, escaped)
            count += occurrences
    path.write_text(text)
    changed[path.name] = count

if not any(changed.values()):
    raise SystemExit('Kukulkan JavaScript evidence escaping made no changes')

manifest_path = root / 'controller-source-manifest.json'
manifest = json.loads(manifest_path.read_text())
for row in manifest.get('files', []):
    path = programs / row['file']
    if not path.is_file():
        raise SystemExit(f'missing controller program during manifest rebuild: {path}')
    row['bytes'] = path.stat().st_size
    row['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
manifest['javascript_evidence_escaping'] = {
    'status': 'applied',
    'source': 'sealed preparation JSON strings containing ASCII apostrophes',
    'files': changed,
}
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(manifest['javascript_evidence_escaping'], indent=2))
PY

chmod +x /tmp/kukulkan-controller-v2/programs/*
bash -n /tmp/kukulkan-controller-v2/programs/unitkukulkan-controller.sh
node --check /tmp/kukulkan-controller-v2/programs/unitkukulkan-stage.mjs
node --check /tmp/kukulkan-controller-v2/programs/unitkukulkan-review.mjs
node --check /tmp/kukulkan-controller-v2/programs/unitkukulkan-prior-phase.mjs
node --check /tmp/kukulkan-controller-v2/programs/unitkukulkan-finalize.mjs

grep -R -F 'Star Trek: publish Kukulkan cycle' /tmp/kukulkan-controller-v2/programs >/dev/null
grep -R -F 'UC-1390' /tmp/kukulkan-controller-v2/programs >/dev/null
grep -R -F 'kol_tai_role_not_conflated' /tmp/kukulkan-controller-v2/programs >/dev/null
grep -R -F '1,806 tasks remain queued' /tmp/kukulkan-controller-v2/programs/unitkukulkan-prior-phase.mjs >/dev/null
grep -R -F '1,805 tasks remain queued' /tmp/kukulkan-controller-v2/programs/unitkukulkan-finalize.mjs >/dev/null
if grep -R -E 'ap_9e3a49dc256ff237dd30611b|0476f56a4959105661f22140254bf364c76c4ace7ac513c111233c75e99cf9d2|UC-1389|uc-1389-' /tmp/kukulkan-controller-v2/programs; then
  echo 'Kukulkan controller retained current-product residue' >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
import hashlib
import json

root = Path('/tmp/kukulkan-controller-v2')
manifest_path = root / 'controller-source-manifest.json'
manifest = json.loads(manifest_path.read_text())
if manifest.get('canonical_parent') != 'af8c0891b38275889bc90ca76af763ce6dd9b59c':
    raise SystemExit('controller canonical parent drifted')
if len(manifest.get('files', [])) != 5:
    raise SystemExit('controller file cardinality drifted')
if manifest.get('javascript_evidence_escaping', {}).get('status') != 'applied':
    raise SystemExit('controller JavaScript evidence escaping receipt missing')
for row in manifest['files']:
    path = root / 'programs' / row['file']
    if not path.is_file():
        raise SystemExit(f'missing controller program: {path}')
    if path.stat().st_size != row['bytes']:
        raise SystemExit(f'controller byte drift: {path.name}')
    if hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
        raise SystemExit(f'controller hash drift: {path.name}')
PY

jq -n \
  --arg status generated \
  --arg task_id "$TASK_ID" \
  --arg source_fingerprint "$TASK_FINGERPRINT" \
  --arg wall_id "$WALL_ID" \
  --arg manifest_sha256 "$(sha256sum /tmp/kukulkan-controller-v2/controller-source-manifest.json | cut -d' ' -f1)" \
  '{status:$status,task_id:$task_id,source_fingerprint:$source_fingerprint,wall_id:$wall_id,manifest_sha256:$manifest_sha256}' \
  > /tmp/kukulkan-controller-v2/kukulkan-controller-probe-v2.json
