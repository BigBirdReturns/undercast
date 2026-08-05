#!/usr/bin/env bash
set -euo pipefail
: "${ARTIFACT_ID:?}" "${ARTIFACT_DIGEST:?}" "${CYCLE_ASSET_DIR:?}"
source_finalizer="$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs"
runtime_finalizer="/tmp/apply-doctor-who-cycle-finalize-006.mjs"
final_gate="$CYCLE_ASSET_DIR/06-final-gate-publish.sh"
for finalizer in "$source_finalizer" "$runtime_finalizer"; do
  test "$(sha256sum "$finalizer" | awk '{print $1}')" = ac7e1709fa18f8ed30dce0c2699bcffbd2249a58f6173a2a827f0269fd7263bb
done
test "$(sha256sum "$final_gate" | awk '{print $1}')" = caaa150812462a15487ab9d60beb3406c8f3967e457295c9f3e90de4458e08fe
python3 - "$source_finalizer" "$runtime_finalizer" "$final_gate" <<'PY'
from pathlib import Path
import sys
old='wall.portrait.kind !== "portrait"'
new='wall.portrait.kind !== "free"'
for name in sys.argv[1:3]:
    p=Path(name)
    t=p.read_text()
    if t.count(old) != 1:
        raise SystemExit(f'{p}: checker portrait-kind anchor count {t.count(old)}')
    p.write_text(t.replace(old,new,1))
p=Path(sys.argv[3])
t=p.read_text()
old='for path in "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done\nnpm run gate'
new='for path in "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done\n# Stage the intended receipt-bearing product so generator replay is compared against the index.\ngit add -A\nnpm run gate'
if t.count(old) != 1:
    raise SystemExit(f'{p}: final-gate staging anchor count {t.count(old)}')
p.write_text(t.replace(old,new,1))
PY
for finalizer in "$source_finalizer" "$runtime_finalizer"; do
  test "$(sha256sum "$finalizer" | awk '{print $1}')" = 8f73bbe41c7c714be147d22cabf3453c38b292b783f7567548e250be8912150a
  node --check "$finalizer"
done
test "$(sha256sum "$final_gate" | awk '{print $1}')" = 128a3251afc9d570373905bd6a941421af894ded6d31b2ebc8b86a68a2b7f136
bash -n "$final_gate"
job="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100" --jq '.jobs[]|select(.name=="cycle-006")|.id' | head -1)"
test -n "$job"
export CANDIDATE_COMMIT="$(cat /tmp/doctor-who-cycle-006-candidate-commit.txt)"
export CANDIDATE_GATE_SHA256="$(cat /tmp/doctor-who-cycle-006-candidate-gate.sha256)"
export CANDIDATE_ARTIFACT_NAME="doctor-who-cycle-006-candidate-${GITHUB_RUN_ID}"
export CANDIDATE_ARTIFACT_ID="$ARTIFACT_ID"
export CANDIDATE_ARTIFACT_SHA256="${ARTIFACT_DIGEST#sha256:}"
export WORKFLOW_JOB="$job"
bash "$CYCLE_ASSET_DIR/05-finalize.sh"
bash "$final_gate"
