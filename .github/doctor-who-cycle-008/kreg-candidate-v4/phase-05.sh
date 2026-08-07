#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
ROOT="$PWD" PAYLOAD="$PAYLOAD_OUT" PRODUCT="$PRODUCT_OUT" python3 - <<'PY'
import hashlib, json, os, pathlib, stat, subprocess
root=pathlib.Path(os.environ['ROOT'])
payload=pathlib.Path(os.environ['PAYLOAD'])
product=pathlib.Path(os.environ['PRODUCT'])
delta=json.loads((payload/'delta-manifest.json').read_text())
exact=json.loads((payload/'candidate-file-manifest.json').read_text())
expected=(payload/'expected-paths.txt').read_text().splitlines()
assert [r['path'] for r in delta['files']]==expected
assert [r['path'] for r in exact['files']]==expected
exact_by={r['path']:r for r in exact['files']}
for row in delta['files']:
    rel=pathlib.PurePosixPath(row['path'])
    assert not rel.is_absolute() and '..' not in rel.parts
    assert not row['path'].startswith(('.github/','tmp/','records/'))
    assert 'cycle-008' not in row['path'] and 'waterline' not in row['path']
    base=root/rel
    patch=payload/row['delta_path']
    out=product/rel
    out.parent.mkdir(parents=True,exist_ok=True)
    if row['kind']=='patch':
        assert base.is_file()
        data=base.read_bytes()
        assert len(data)==row['base_bytes']
        assert hashlib.sha256(data).hexdigest()==row['base_sha256']
        assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()==row['base_git_blob']
        subprocess.run(['zstd','--quiet','--decompress',f'--patch-from={base}',str(patch),'-o',str(out),'-f'],check=True)
    else:
        assert row['kind']=='full' and not base.exists()
        subprocess.run(['zstd','--quiet','--decompress',str(patch),'-o',str(out),'-f'],check=True)
    data=out.read_bytes(); exact_row=exact_by[row['path']]
    assert len(data)==row['product_bytes']==exact_row['bytes']
    assert hashlib.sha256(data).hexdigest()==row['product_sha256']==exact_row['sha256']
    assert hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()==row['product_git_blob']==exact_row['git_blob']
    out.chmod(int(row['mode'],8)&0o7777)
assert len([p for p in product.rglob('*') if p.is_file()])==40
PY
test "$(sha256sum "$PRODUCT_OUT/images/uc-1353-still.jpg" | awk '{print $1}')" = 5d19f72cbe08648568c84469287dfcd14a9c0789156cd3d740edf4c1c5bb0622
