#!/usr/bin/env bash
set -euo pipefail

carrier_head="$(git rev-parse HEAD)"
git fetch --filter=blob:none --no-tags origin main
test "$(git rev-parse FETCH_HEAD)" = "$EXPECTED_MAIN"
git checkout --detach "$EXPECTED_MAIN"
node scripts/star-trek-kol-tai-cycle.mjs
node scripts/thesis-rails.mjs next --json > /tmp/kukulkan-next-v2.json

phase="$(jq -r .phase /tmp/kukulkan-next-v2.json)"
test "$phase" = ready-for-one-cycle
TASK_ID="$(jq -r .candidate.task_id /tmp/kukulkan-next-v2.json)"
TASK_FINGERPRINT="$(jq -r .candidate.source_fingerprint /tmp/kukulkan-next-v2.json)"
test "$(jq -r .candidate.character /tmp/kukulkan-next-v2.json)" = "$TARGET_CHARACTER"
test "$(jq -r .candidate.performer /tmp/kukulkan-next-v2.json)" = "$TARGET_PERFORMER"
test "$(jq -r '.candidate.performance_modes | length' /tmp/kukulkan-next-v2.json)" = 1
test "$(jq -r .candidate.performance_modes[0] /tmp/kukulkan-next-v2.json)" = voice-animation
test "$(jq -r '.candidate.sources | length' /tmp/kukulkan-next-v2.json)" = 1
test "$(jq -r .candidate.sources[0] /tmp/kukulkan-next-v2.json)" = "$TARGET_SOURCE"

task="$(jq -c --arg id "$TASK_ID" '.jobs[] | select(.id==$id)' data/AUTOPILOT.json)"
test -n "$task"
test "$(jq -r .status <<<"$task")" = queued
test "$(jq -r .source_fingerprint <<<"$task")" = "$TASK_FINGERPRINT"
test "$(jq -r .character <<<"$task")" = "$TARGET_CHARACTER"
test "$(jq -r .performer <<<"$task")" = "$TARGET_PERFORMER"
test "$(jq -r '.performance_modes | length' <<<"$task")" = 1
test "$(jq -r .performance_modes[0] <<<"$task")" = voice-animation
test "$(jq -r '.sources | length' <<<"$task")" = 1
test "$(jq -r .sources[0] <<<"$task")" = "$TARGET_SOURCE"
test "$(jq -r '.source_receipts | length' <<<"$task")" = 1
TASK_PRIORITY="$(jq -r .priority <<<"$task")"
TASK_REVISION="$(jq -r .source_receipts[0].revision <<<"$task")"
TASK_CONTENT_SHA256="$(jq -r .source_receipts[0].content_sha256 <<<"$task")"

WALL_ID="$(python3 - <<'PY'
import json,re
rows=json.load(open('data/specimens.json'))
values=[]
def walk(value):
    if isinstance(value,dict):
        for item in value.values(): walk(item)
    elif isinstance(value,list):
        for item in value: walk(item)
    elif isinstance(value,str):
        match=re.fullmatch(r'UC-(\d+)',value)
        if match: values.append(int(match.group(1)))
walk(rows)
print(f'UC-{max(values)+1}')
PY
)"
test "$WALL_ID" = UC-1390
export TASK_ID TASK_FINGERPRINT TASK_PRIORITY TASK_REVISION TASK_CONTENT_SHA256 WALL_ID
printf 'TASK_ID=%s\nTASK_FINGERPRINT=%s\nTASK_PRIORITY=%s\nTASK_REVISION=%s\nTASK_CONTENT_SHA256=%s\nWALL_ID=%s\n' \
  "$TASK_ID" "$TASK_FINGERPRINT" "$TASK_PRIORITY" "$TASK_REVISION" "$TASK_CONTENT_SHA256" "$WALL_ID" >> "$GITHUB_ENV"

# Publish an observable, non-mutating locator from the exact canonical parent.
git checkout -B "$RESULT_BRANCH"
rm -rf transport/kukulkan-probe-v2
mkdir -p transport/kukulkan-probe-v2
jq -n \
  --argjson version 2 \
  --arg transaction STAR-TREK-KUKULKAN-PROBE-RUN-START-V2 \
  --arg status started \
  --argjson run_id "$GITHUB_RUN_ID" \
  --arg head_sha "$carrier_head" \
  --arg canonical_parent "$EXPECTED_MAIN" \
  --arg task_id "$TASK_ID" \
  --arg source_fingerprint "$TASK_FINGERPRINT" \
  --arg character "$TARGET_CHARACTER" \
  --arg performer "$TARGET_PERFORMER" \
  --arg wall_id "$WALL_ID" \
  '{version:$version,transaction:$transaction,status:$status,run_id:$run_id,head_sha:$head_sha,canonical_parent:$canonical_parent,task_id:$task_id,source_fingerprint:$source_fingerprint,character:$character,performer:$performer,wall_id:$wall_id,canonical_mutation:false,lease_taken:false}' \
  > transport/kukulkan-probe-v2/run-start.json
git config user.name undercast-star-trek-kukulkan-probe
git config user.email star-trek-kukulkan-probe@users.noreply.github.com
git add transport/kukulkan-probe-v2/run-start.json
git commit -m 'Kukulkan: publish live-bound probe locator v2'
git push --force origin "HEAD:refs/heads/${RESULT_BRANCH}"
git checkout --detach "$EXPECTED_MAIN"

# Recover the proven v4 source/media block and insert only the role generalizer.
gh api "/repos/${GITHUB_REPOSITORY}/contents/.github/workflows/star-trek-kol-tai-repair-v4.yml?ref=${V4_WORKFLOW_COMMIT}" --jq .content \
  | tr -d '\n' | base64 -d > /tmp/star-trek-kol-tai-repair-v4.yml
test -s /tmp/star-trek-kol-tai-repair-v4.yml
python3 -m pip install --disable-pip-version-check --no-input PyYAML==6.0.2
python3 - <<'PY'
from pathlib import Path
import yaml

source = Path('/tmp/star-trek-kol-tai-repair-v4.yml')
workflow = yaml.safe_load(source.read_text())
steps = workflow['jobs']['repair']['steps']
name = 'Regenerate exact Kol-Tai source and media from frozen custody'
matches = [step for step in steps if step.get('name') == name]
if len(matches) != 1 or not isinstance(matches[0].get('run'), str):
    raise SystemExit(f'source run block drifted: {matches}')
text = matches[0]['run'].rstrip() + '\n'
old_test = 'test "$(jq -r .candidate.character /tmp/kol-tai-next-v4.json)" = \'Kol-Tai\''
new_test = 'test "$(jq -r .candidate.character /tmp/kol-tai-next-v4.json)" = "$TARGET_CHARACTER"'
if text.count(old_test) != 1:
    raise SystemExit(f'candidate character assertion drifted: {text.count(old_test)}')
text = text.replace(old_test, new_test, 1)
marker = '          python3 /tmp/build-kol-tai-prep-v4.py\n'
insertion = (
    '          export BUILDER_PATH=/tmp/build-kol-tai-prep-v4.py\n'
    '          python3 /tmp/generalize-doohan-builder-v1.py /tmp/build-kol-tai-prep-v4.py\n'
    + marker
)
if text.count(marker) != 1:
    raise SystemExit(f'builder execution marker drifted: {text.count(marker)}')
text = text.replace(marker, insertion, 1)
Path('/tmp/kukulkan-source-run-v2.sh').write_text(text)
PY
chmod +x /tmp/kukulkan-source-run-v2.sh
grep -F 'generalize-doohan-builder-v1.py' /tmp/kukulkan-source-run-v2.sh >/dev/null

SOURCE_HEAD="$BUILDER_SOURCE_HEAD" bash /tmp/kukulkan-source-run-v2.sh
cp /tmp/kukulkan-next-v2.json /tmp/kol-tai-prep-v4/thesis-next.json
jq -e --arg id "$TASK_ID" --arg parent "$EXPECTED_MAIN" --arg character "$TARGET_CHARACTER" --arg wall "$WALL_ID" '.task_id==$id and .canonical_parent==$parent and .character==$character and .wall_id==$wall and .maker_attribution=="unresolved" and .media_review.verdict=="pass" and (.facets|length)==2 and .source_collision==false and .byte_collision==false and .cross_facet_substitution==false' /tmp/kol-tai-prep-v4/media-preparation.json >/dev/null
jq -e --arg id "$TASK_ID" --arg source "$TARGET_SOURCE" --arg fp "$TASK_FINGERPRINT" '.id==$id and .source_fingerprint==$fp and .sources==[$source] and .performance_modes==["voice-animation"] and .status=="queued"' /tmp/kol-tai-prep-v4/task.json >/dev/null
jq -e '.performance_mode=="voice-only" and .maker_attribution=="unresolved" and .kol_tai_role_not_conflated==true and .karl_four_role_not_conflated==true and .physical_performance=="not attributed to James Doohan"' /tmp/kol-tai-prep-v4/source-receipt.json >/dev/null

jq -n \
  --arg status prepared \
  --arg task_id "$TASK_ID" \
  --arg source_fingerprint "$TASK_FINGERPRINT" \
  --arg wall_id "$WALL_ID" \
  --arg source_receipt_sha256 "$(jq -r .receipt_sha256 /tmp/kol-tai-prep-v4/source-receipt.json)" \
  --arg facets_sha256 "$(jq -r .facets_sha256 /tmp/kol-tai-prep-v4/media-preparation.json)" \
  '{status:$status,task_id:$task_id,source_fingerprint:$source_fingerprint,wall_id:$wall_id,source_receipt_sha256:$source_receipt_sha256,facets_sha256:$facets_sha256}' \
  > /tmp/kol-tai-prep-v4/kukulkan-probe-prep-v2.json
