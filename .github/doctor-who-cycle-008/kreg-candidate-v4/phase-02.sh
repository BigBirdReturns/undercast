#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
verify_part() {
  local path="$1" expected_bytes="$2" expected_sha="$3"
  test "$(wc -c < "$path")" = "$expected_bytes"
  test "$(sha256sum "$path" | awk '{print $1}')" = "$expected_sha"
  test "$(LC_ALL=C tr -d 'A-Za-z0-9+/=\n' < "$path" | wc -c)" = "0"
}
verify_part "${DELTA_PREFIX}00.b64" 12320 d0f7debad507fb2130333215dddeb71a8ce11eb5cb331ab34bf531d97b9d6768
verify_part "${DELTA_PREFIX}01.b64" 12320 156ff5023acdff4b9e78f9993cadac1c6b688d62b94d33046dde0bfa62a30530
verify_part "${DELTA_PREFIX}02.b64" 12320 c295c068a34b68193918a3703537094cb07d477883a41eececa026c7df1f3e3a
verify_part "${DELTA_PREFIX}03.b64" 12320 a8187b0d2b0082e4e5d9f0ee77721dcf96fe0cf70abb297f5786e8e649a7218f
verify_part "${DELTA_PREFIX}04.b64" 12320 c271978c420217ce958185747767e1f6a0fc9eac2f127e3e79244bfce8d86eba
verify_part "${DELTA_PREFIX}05.b64" 12320 e0e46b026b94a9f039e56f7b1b23536cefcd0f1771385404ee3a61b9ce880799
verify_part "${DELTA_PREFIX}06.b64" 12320 7c2a3e47ea63315bf12c367c8ffe24c8de4cbb01de00b850608ca2021aa31daa
verify_part "${DELTA_PREFIX}07.b64" 12320 c128f6d9941eddeaba1b62e2a124a726765ab6cce4ba6774da23f33e085b6f99
verify_part "${DELTA_PREFIX}08.b64" 12320 9c8258ce6c125950bd888d3d3db4aed382cbeb2531351cbee7cba212e5b8fee8
verify_part "${DELTA_PREFIX}09.b64" 12243 8cbbfb25b143dd55d01f2d9ebab127e6f6c3f214cd81bf92da8e943b0f06b9f6
verify_part "${DELTA_PREFIX}10.b64" 12243 466cf45153852e948fb77a66090bf37349c70a4a4d1c67405bf66abaaf5a8a78
verify_part "${DELTA_PREFIX}11.b64" 12191 8825c1b09918c1dc6c31de4dc4d2859df1706c0ae7adc541a73c660f604f6bd3
cat "${DELTA_PREFIX}00.b64" "${DELTA_PREFIX}01.b64" "${DELTA_PREFIX}02.b64" "${DELTA_PREFIX}03.b64" "${DELTA_PREFIX}04.b64" "${DELTA_PREFIX}05.b64" "${DELTA_PREFIX}06.b64" "${DELTA_PREFIX}07.b64" "${DELTA_PREFIX}08.b64" "${DELTA_PREFIX}09.b64" "${DELTA_PREFIX}10.b64" "${DELTA_PREFIX}11.b64" > "$OUT/product-delta.tar.xz.b64"
test "$(wc -c < "$OUT/product-delta.tar.xz.b64")" = "$DELTA_B64_BYTES"
test "$(sha256sum "$OUT/product-delta.tar.xz.b64" | awk '{print $1}')" = "$DELTA_B64_SHA256"
base64 --decode "$OUT/product-delta.tar.xz.b64" > "$OUT/product-delta.tar.xz"
test "$(wc -c < "$OUT/product-delta.tar.xz")" = "$DELTA_XZ_BYTES"
test "$(sha256sum "$OUT/product-delta.tar.xz" | awk '{print $1}')" = "$DELTA_XZ_SHA256"
xz --decompress --stdout "$OUT/product-delta.tar.xz" > "$OUT/product-delta.tar"
test "$(wc -c < "$OUT/product-delta.tar")" = "$DELTA_TAR_BYTES"
test "$(sha256sum "$OUT/product-delta.tar" | awk '{print $1}')" = "$DELTA_TAR_SHA256"
ARCHIVE="$OUT/product-delta.tar" TARGET="$PAYLOAD_OUT" python3 - <<'PY'
import os, pathlib, tarfile
archive=pathlib.Path(os.environ['ARCHIVE'])
target=pathlib.Path(os.environ['TARGET'])
expected=[
    'candidate-file-manifest.json','delta-manifest.json','expected-paths.txt','settlement.json',
    *[f'patches/{i:02d}.zst' for i in range(40)],
]
with tarfile.open(archive,'r:') as tf:
    members=tf.getmembers(); names=[m.name for m in members]
    if names != expected or len(names) != len(set(names)):
        raise SystemExit(f'delta member drift: {names!r}')
    if sum(m.size for m in members) > 2_000_000:
        raise SystemExit('delta expansion denominator exceeded')
    for m in members:
        p=pathlib.PurePosixPath(m.name)
        if p.is_absolute() or '..' in p.parts or not m.isfile() or m.issym() or m.islnk():
            raise SystemExit(f'unsafe delta member: {m.name}')
    tf.extractall(target)
PY
test "$(sha256sum "$PAYLOAD_OUT/delta-manifest.json" | awk '{print $1}')" = "$DELTA_MANIFEST_SHA256"
test "$(sha256sum "$PAYLOAD_OUT/settlement.json" | awk '{print $1}')" = "$SETTLEMENT_SHA256"
test "$(sha256sum "$PAYLOAD_OUT/expected-paths.txt" | awk '{print $1}')" = "$EXPECTED_PATHS_SHA256"
test "$(sha256sum "$PAYLOAD_OUT/candidate-file-manifest.json" | awk '{print $1}')" = "$FILE_MANIFEST_SHA256"
PAYLOAD_OUT="$PAYLOAD_OUT" FLOOR_MAIN="$FLOOR_MAIN" SOURCE_BUILD_MAIN="$SOURCE_BUILD_MAIN" python3 - <<'PY'
import hashlib, json, os, pathlib
root=pathlib.Path(os.environ['PAYLOAD_OUT'])
expected=(root/'expected-paths.txt').read_text().splitlines()
assert len(expected)==40 and expected==sorted(expected) and len(set(expected))==40
delta=json.loads((root/'delta-manifest.json').read_text())
files=json.loads((root/'candidate-file-manifest.json').read_text())
settlement=json.loads((root/'settlement.json').read_text())
receipt=settlement.pop('receipt_sha256')
body=(json.dumps(settlement,indent=2,sort_keys=True)+'\n').encode()
assert hashlib.sha256(body).hexdigest()==receipt=='47b21045328377d9e4b40711f333cf8509608b48b9a09b700bafff26bc67fb9c'
assert delta['version']==2 and delta['algorithm']=='zstd-patch-from-v1' and delta['count']==40
assert files['version']==1 and files['count']==40
assert [r['path'] for r in delta['files']]==expected
assert [r['path'] for r in files['files']]==expected
by_path={r['path']:r for r in files['files']}
for i,row in enumerate(delta['files']):
    assert row['index']==i and row['delta_path']==f'patches/{i:02d}.zst'
    patch=(root/row['delta_path']).read_bytes()
    assert len(patch)==row['delta_bytes']
    assert hashlib.sha256(patch).hexdigest()==row['delta_sha256']
    exact=by_path[row['path']]
    assert (row['product_bytes'],row['product_sha256'],row['product_git_blob']) == (exact['bytes'],exact['sha256'],exact['git_blob'])
    assert row['kind'] in {'patch','full'} and row['mode'] in {'100644','100664'}
assert settlement['transaction']=='DOCTOR-WHO-CYCLE-008-KREG-CANDIDATE-V4-DELTA'
assert settlement['floor_main']==os.environ['FLOOR_MAIN']
assert settlement['source_build_main']==os.environ['SOURCE_BUILD_MAIN']
assert settlement['task']=={
  'id':'ap_469d79ea29fd7f877395d20f','lease_id':'lease_e65f837070361eacbb1abd46',
  'wall_id':'UC-1353','performer':'Dan Starkey','role':'Kreg','performance_mode':'voice',
  'production':'The Great Sontaran War',
}
assert settlement['queue']['before']=={'total':316,'queued':309,'resolved':7,'in_flight':0}
assert settlement['queue']['after']=={'total':316,'queued':308,'resolved':8,'in_flight':0}
assert settlement['product']['path_count']==40
assert settlement['boundary']=={
  'candidate_only':True,'repository_refs_written':False,'canonical_record_created':False,
  'queue_mutated':False,'cycle_receipt_written':False,'waterline_event_written':False,
  'product_published':False,'product_merge_authority':False,'ninth_lease_authorized':False,
  'outside_human_dependency':False,
}
PY
