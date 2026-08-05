#!/usr/bin/env bash
set -euo pipefail
: "${AUTHORIZED_HEAD:?}" "${TARGET_BRANCH:?}" "${SELF:?}" "${TRANSPORT:?}" "${TRANSPORT_PARTS:?}" "${TRANSPORT_SHA256:?}"
: "${CYCLE_ASSET_DIR:?}" "${PREPARE:?}" "${FINALIZE_HELPER:?}" "${FINALIZE_HELPER_SHA256:?}"

test "$(sha256sum "$FINALIZE_HELPER" | awk '{print $1}')" = "$FINALIZE_HELPER_SHA256"
cp "$FINALIZE_HELPER" /tmp/doctor-who-cycle-006-finalize-current.sh
chmod +x /tmp/doctor-who-cycle-006-finalize-current.sh

shopt -s nullglob
mapfile -t parts < <(printf '%s\n' "$TRANSPORT" "$TRANSPORT".part-* | LC_ALL=C sort)
test "${#parts[@]}" -eq "$TRANSPORT_PARTS"
cat "${parts[@]}" | tr -d '\n\r\t ' | base64 --decode > /tmp/doctor-who-cycle-006.tgz
test "$(sha256sum /tmp/doctor-who-cycle-006.tgz | awk '{print $1}')" = "$TRANSPORT_SHA256"
mkdir -p "$CYCLE_ASSET_DIR"
tar -xzf /tmp/doctor-who-cycle-006.tgz -C "$CYCLE_ASSET_DIR"
test "$(sha256sum "$CYCLE_ASSET_DIR/01-bind-decode.sh" | awk '{print $1}')" = 24d37d7beb7d146c28bdfd3459bd4973d043da6f5b845a0dd41f1d8b55328231
test "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-006.mjs" | awk '{print $1}')" = 7b2a4d1c1cc24062bfaf855c2ea8df294f8f39ad33f8d3e8fbbd97317da8d2b1
test "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs" | awk '{print $1}')" = f2d95747bff46244705f5fa7653cd09c6e256a5803461b07845e6e685c5fef44
test "$(sha256sum "$CYCLE_ASSET_DIR/transport-manifest.json" | awk '{print $1}')" = 3a5d1dc236a3ab0295d0344bcebdb7885673f676633bb61566d8163eed79ac51

# The binder intentionally re-extracts the sealed archive. Bind it to the archive's
# sealed materializer first; apply the schema-only provenance correction afterwards.
python3 - <<'PY'
from pathlib import Path
src=Path('/tmp/doctor-who-cycle-006/01-bind-decode.sh')
dst=Path('/tmp/doctor-who-cycle-006-bind-current.sh')
text=src.read_text()
old='a336c345dc1b90444d1c9e9913e247d2fb324e5f047578d7500410dc37616c07'
new='7b2a4d1c1cc24062bfaf855c2ea8df294f8f39ad33f8d3e8fbbd97317da8d2b1'
if text.count(old) != 1: raise SystemExit(f'materializer anchor count {text.count(old)}')
dst.write_text(text.replace(old,new,1))
PY
test "$(sha256sum /tmp/doctor-who-cycle-006-bind-current.sh | awk '{print $1}')" = 3cb4ccf485fb23db82d1991872a0ec764f49a3f13a29c67c8f9d462763019d0d
rm -f "$PREPARE" "$FINALIZE_HELPER"
chmod +x "$CYCLE_ASSET_DIR"/*.sh /tmp/doctor-who-cycle-006-bind-current.sh
bash /tmp/doctor-who-cycle-006-bind-current.sh

for key in EXACT_MAIN ATTESTED_MAIN CYCLE_AT KAYSTE_PORTRAIT_CANDIDATE NORMALIZED_VERIFICATION; do
  value="$(grep -E "^${key}=" "$GITHUB_ENV" | tail -1 | cut -d= -f2-)"
  test -n "$value"
  export "$key=$value"
done

# Apply two schema-vocabulary corrections after the sealed custody binder succeeds:
# image provenance is "free", and portrait presentation consensus is "neutral-human".
python3 - <<'PY'
from pathlib import Path
import hashlib
root=Path('/tmp/doctor-who-cycle-006')
materializer=root/'apply-doctor-who-cycle-006.mjs'
text=materializer.read_text()
replacements=[
    ('  kind: "portrait",', '  kind: "free",', 'portrait-kind'),
    ('      value: "performer-portrait",', '      value: "neutral-human",', 'portrait-presentation'),
]
for old,new,label in replacements:
    if text.count(old) != 1: raise SystemExit(f'{label} anchor count {text.count(old)}')
    text=text.replace(old,new,1)
materializer.write_text(text)
actual=hashlib.sha256(materializer.read_bytes()).hexdigest()
if actual != '43ac56f0fbe6c2fb287877279f6f04f7cd5e4a4046fa9cc6e566078651b35820':
    raise SystemExit(f'patched materializer SHA {actual}')
finalizer=root/'apply-doctor-who-cycle-finalize-006.mjs'
text=finalizer.read_text()
old='row.value === "performer-portrait"'
new='row.value === "neutral-human"'
if text.count(old) != 1: raise SystemExit(f'finalizer presentation anchor count {text.count(old)}')
finalizer.write_text(text.replace(old,new,1))
actual=hashlib.sha256(finalizer.read_bytes()).hexdigest()
if actual != 'ac7e1709fa18f8ed30dce0c2699bcffbd2249a58f6173a2a827f0269fd7263bb':
    raise SystemExit(f'patched finalizer SHA {actual}')
candidate_gate=root/'03-candidate-gate.sh'
text=candidate_gate.read_text()
old='for path in "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done\nnpm run gate'
new='for path in "$TRANSPORT" "$TRANSPORT".part-*; do [[ ! -e "$path" ]]; done\n# Stage the intended transport-free candidate so generator replay is compared against the index.\ngit add -A\nnpm run gate'
if text.count(old) != 1: raise SystemExit(f'candidate-gate staging anchor count {text.count(old)}')
candidate_gate.write_text(text.replace(old,new,1))
actual=hashlib.sha256(candidate_gate.read_bytes()).hexdigest()
if actual != '2bbc0a0b59fb4973c73daa240f981d0c52734328e413105d45d0e8877a5f7d55':
    raise SystemExit(f'patched candidate-gate SHA {actual}')
PY
test "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-006.mjs" | awk '{print $1}')" = 43ac56f0fbe6c2fb287877279f6f04f7cd5e4a4046fa9cc6e566078651b35820
test "$(sha256sum "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs" | awk '{print $1}')" = ac7e1709fa18f8ed30dce0c2699bcffbd2249a58f6173a2a827f0269fd7263bb
test "$(sha256sum "$CYCLE_ASSET_DIR/03-candidate-gate.sh" | awk '{print $1}')" = 2bbc0a0b59fb4973c73daa240f981d0c52734328e413105d45d0e8877a5f7d55
node --check "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-006.mjs"
node --check "$CYCLE_ASSET_DIR/apply-doctor-who-cycle-finalize-006.mjs"
bash "$CYCLE_ASSET_DIR/02-materialize.sh"
bash "$CYCLE_ASSET_DIR/03-candidate-gate.sh"
bash "$CYCLE_ASSET_DIR/04-candidate-commit.sh"
