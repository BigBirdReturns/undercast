#!/usr/bin/env bash
set -euo pipefail
test "$(wc -c < "$DELTA_ARCHIVE")" = "$DELTA_XZ_BYTES"
test "$(sha256sum "$DELTA_ARCHIVE" | awk '{print $1}')" = "$DELTA_XZ_SHA256"
cp "$DELTA_ARCHIVE" "$OUT/product-delta.tar.xz"
xz --decompress --stdout "$DELTA_ARCHIVE" > "$OUT/product-delta.tar"
test "$(wc -c < "$OUT/product-delta.tar")" = "$DELTA_TAR_BYTES"
test "$(sha256sum "$OUT/product-delta.tar" | awk '{print $1}')" = "$DELTA_TAR_SHA256"
ARCHIVE="$OUT/product-delta.tar" TARGET="$PAYLOAD_OUT" python3 - <<'PY2'
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
    if sum(m.size for m in members) > 3_000_000:
        raise SystemExit('delta expansion denominator exceeded')
    for m in members:
        p=pathlib.PurePosixPath(m.name)
        if p.is_absolute() or '..' in p.parts or not m.isfile() or m.issym() or m.islnk():
            raise SystemExit(f'unsafe delta member: {m.name}')
    tf.extractall(target)
PY2
test "$(sha256sum "$PAYLOAD_OUT/delta-manifest.json" | awk '{print $1}')" = "$DELTA_MANIFEST_SHA256"
test "$(sha256sum "$PAYLOAD_OUT/settlement.json" | awk '{print $1}')" = "$SETTLEMENT_SHA256"
test "$(sha256sum "$PAYLOAD_OUT/expected-paths.txt" | awk '{print $1}')" = "$EXPECTED_PATHS_SHA256"
test "$(sha256sum "$PAYLOAD_OUT/candidate-file-manifest.json" | awk '{print $1}')" = "$FILE_MANIFEST_SHA256"
PAYLOAD_OUT="$PAYLOAD_OUT" FLOOR_MAIN="$FLOOR_MAIN" SOURCE_BUILD_MAIN="$SOURCE_BUILD_MAIN" python3 - <<'PY2'
import hashlib, json, os, pathlib
root=pathlib.Path(os.environ['PAYLOAD_OUT'])
expected=(root/'expected-paths.txt').read_text().splitlines()
assert len(expected)==40 and expected==sorted(expected) and len(set(expected))==40
delta=json.loads((root/'delta-manifest.json').read_text())
files=json.loads((root/'candidate-file-manifest.json').read_text())
settlement=json.loads((root/'settlement.json').read_text())
receipt=settlement.pop('receipt_sha256')
body=(json.dumps(settlement,indent=2,sort_keys=True)+'\n').encode()
assert hashlib.sha256(body).hexdigest()==receipt=='0295ae53ac021e0b312ca669bdcbad70aafb048ed30b91a060b8fa0b2cfbce4a'
assert delta['version']==3 and delta['algorithm']=='zstd-patch-from-source-build' and delta['count']==40
assert delta['source_build_main']==os.environ['SOURCE_BUILD_MAIN']
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
assert settlement['transaction']=='DOCTOR-WHO-CYCLE-008-KREG-CANDIDATE-V5G-DELTA'
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
assert settlement['product']['product_archive_sha256']=='6aa5da92ab49a7c0429c8481a4bec4a957abd9339cae58b0f6fd61e4a06fb705'
assert settlement['boundary']=={
  'candidate_only':True,'repository_refs_written':False,'canonical_record_created':False,
  'queue_mutated':False,'cycle_receipt_written':False,'waterline_event_written':False,
  'product_published':False,'product_merge_authority':False,'ninth_lease_authorized':False,
  'outside_human_dependency':False,
}
PY2
