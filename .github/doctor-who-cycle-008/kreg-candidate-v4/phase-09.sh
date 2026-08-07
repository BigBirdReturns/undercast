#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
base_sha="$PR_BASE_SHA"
candidate_commit="$(cat "$OUT/candidate-commit.txt")"
candidate_tree="$(cat "$OUT/candidate-tree.txt")"
git -C "$WORKTREE" diff --binary "$base_sha" "$candidate_commit" > "$OUT/candidate.patch"
git -C "$WORKTREE" branch -f cycle008-kreg-candidate-v4 "$candidate_commit"
git -C "$WORKTREE" bundle create "$OUT/candidate.bundle" cycle008-kreg-candidate-v4 ^"$base_sha"
cp "$PAYLOAD_OUT/expected-paths.txt" "$OUT/expected-product-paths.txt"
cp "$PAYLOAD_OUT/candidate-file-manifest.json" "$OUT/candidate-file-manifest.json"
cp "$PAYLOAD_OUT/delta-manifest.json" "$OUT/delta-manifest.json"
cp "$PAYLOAD_OUT/settlement.json" "$OUT/settlement.json"
PRODUCT="$PRODUCT_OUT" EXPECTED="$PAYLOAD_OUT/expected-paths.txt" ARCHIVE="$OUT/candidate-product.tar.gz" python3 - <<'PY'
import gzip, os, pathlib, tarfile
product=pathlib.Path(os.environ['PRODUCT'])
expected=pathlib.Path(os.environ['EXPECTED']).read_text().splitlines()
archive=pathlib.Path(os.environ['ARCHIVE'])
with archive.open('wb') as raw:
    with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=9) as gz:
        with tarfile.open(fileobj=gz,mode='w') as tf:
            for rel in expected:
                path=product/rel
                info=tf.gettarinfo(str(path),arcname=rel)
                info.uid=info.gid=0; info.uname=info.gname=''; info.mtime=0
                with path.open('rb') as source: tf.addfile(info,source)
PY
BASE="$base_sha" COMMIT="$candidate_commit" TREE="$candidate_tree" OUT="$OUT" python3 - <<'PY'
import hashlib, json, os, pathlib
out=pathlib.Path(os.environ['OUT'])
def h(name): return hashlib.sha256((out/name).read_bytes()).hexdigest()
receipt={
  'version':1,
  'transaction':'DOCTOR-WHO-CYCLE-008-KREG-CANDIDATE-V4-QUALIFICATION',
  'base_main':os.environ['BASE'],
  'source_build_main':'3228efd6ede786586352b1b990a94d16ab02d5f9',
  'carrier_head':os.environ['GITHUB_SHA'],
  'workflow_run':int(os.environ['GITHUB_RUN_ID']),
  'workflow_attempt':int(os.environ['GITHUB_RUN_ATTEMPT']),
  'candidate':{
    'commit':os.environ['COMMIT'],'tree':os.environ['TREE'],'paths':40,
    'expected_paths_sha256':h('expected-product-paths.txt'),
    'file_manifest_sha256':h('candidate-file-manifest.json'),
    'delta_manifest_sha256':h('delta-manifest.json'),
    'product_archive_sha256':h('candidate-product.tar.gz'),
    'patch_sha256':h('candidate.patch'),'bundle_sha256':h('candidate.bundle'),
  },
  'task':{'id':'ap_469d79ea29fd7f877395d20f','lease_id':'lease_e65f837070361eacbb1abd46','wall_id':'UC-1353','performer':'Dan Starkey','role':'Kreg','mode':'voice'},
  'queue':{'before':{'queued':309,'resolved':7,'in_flight':0},'after':{'queued':308,'resolved':8,'in_flight':0}},
  'media':{'sha256':'5d19f72cbe08648568c84469287dfcd14a9c0789156cd3d740edf4c1c5bb0622','bytes':67113,'width':1053,'height':805},
  'boundary':{'candidate_only':True,'repository_ref_created':False,'product_published':False,'product_merged':False,'cycle_receipt_written':False,'waterline_event_written':False,'ninth_lease_authorized':False,'outside_human_dependency':False},
}
body=(json.dumps(receipt,indent=2,sort_keys=True)+'\n').encode()
receipt['receipt_sha256']=hashlib.sha256(body).hexdigest()
final=(json.dumps(receipt,indent=2,sort_keys=True)+'\n').encode()
(out/'candidate-receipt.json').write_bytes(final)
(out/'candidate-receipt.file.sha256').write_text(f"{hashlib.sha256(final).hexdigest()}  candidate-receipt.json\n")
PY
