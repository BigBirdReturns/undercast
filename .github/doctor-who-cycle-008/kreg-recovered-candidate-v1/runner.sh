#!/usr/bin/env bash
set -euo pipefail

set -euo pipefail
mkdir -p "$OUT"/{diagnostics,evidence,payload,product,receipt}
test "$BASE_SHA" = "$EXACT_BASE"
test "$(git rev-parse HEAD)" = "$HEAD_SHA"
test "$(git show -s --format=%P HEAD)" = "$EXACT_BASE"
test "$(git rev-list --count "$EXACT_BASE"..HEAD)" = "1"
test "$(git merge-base "$EXACT_BASE" HEAD)" = "$EXACT_BASE"
printf '%s\n%s\n%s\n' ".github/doctor-who-cycle-008/kreg-recovered-candidate-v1/delta.tar.xz.b64" ".github/doctor-who-cycle-008/kreg-recovered-candidate-v1/runner.sh" ".github/workflows/doctor-who-cycle-008-kreg-recovered-candidate-v1.yml" | LC_ALL=C sort > "$OUT/expected-carrier-paths.txt"
git diff --name-only "$EXACT_BASE"...HEAD | LC_ALL=C sort > "$OUT/actual-carrier-paths.txt"
diff -u "$OUT/expected-carrier-paths.txt" "$OUT/actual-carrier-paths.txt"
git diff --name-status "$EXACT_BASE"...HEAD > "$OUT/carrier-name-status.txt"
test "$(awk '$1=="A"{n++} END{print n+0}' "$OUT/carrier-name-status.txt")" = "3"
test "$(wc -l < "$OUT/carrier-name-status.txt")" = "3"
gh api "/repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER" > "$OUT/evidence/carrier-pr.json"
gh api "/repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER/files?per_page=100" > "$OUT/evidence/carrier-pr-files.json"
ROOT="$OUT" HEAD_SHA="$HEAD_SHA" python3 - <<'PY'
import json, os
from pathlib import Path
root=Path(os.environ['ROOT'])
pr=json.loads((root/'evidence/carrier-pr.json').read_text())
files=json.loads((root/'evidence/carrier-pr-files.json').read_text())
assert pr['state']=='open' and pr['draft'] is True and pr['merged'] is False
assert pr['base']['ref']=='main' and pr['base']['sha']==os.environ['EXACT_BASE']
assert pr['head']['ref']==os.environ['AUTHORIZED_BRANCH'] and pr['head']['sha']==os.environ['HEAD_SHA']
assert pr['commits']==1 and pr['changed_files']==3
assert sorted(f['filename'] for f in files)==(root/'expected-carrier-paths.txt').read_text().splitlines()
assert all(f['status']=='added' for f in files)
PY
git fetch --no-tags --filter=blob:none origin "+refs/heads/main:refs/remotes/origin/main"
test "$(git rev-parse refs/remotes/origin/main)" = "$EXACT_BASE"
test -z "$(git status --porcelain)"


set -euo pipefail
test "$(sha256sum "$PAYLOAD/meta/candidate-file-manifest.json" | awk '{print $1}')" = "$FILE_MANIFEST_SHA256"
test "$(sha256sum "$PAYLOAD/meta/delta-manifest.json" | awk '{print $1}')" = "$DELTA_MANIFEST_SHA256"
test "$(sha256sum "$PAYLOAD/meta/expected-paths.txt" | awk '{print $1}')" = "$EXPECTED_PATHS_SHA256"
test "$(sha256sum "$PAYLOAD/meta/settlement.json" | awk '{print $1}')" = "$SETTLEMENT_SHA256"
ROOT="$PAYLOAD" python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
root=Path(os.environ['ROOT'])
expected=(root/'meta/expected-paths.txt').read_text().splitlines()
assert len(expected)==40 and expected==sorted(expected) and len(set(expected))==40
exact=json.loads((root/'meta/candidate-file-manifest.json').read_text())
delta=json.loads((root/'meta/delta-manifest.json').read_text())
settlement=json.loads((root/'meta/settlement.json').read_text())
assert exact['count']==delta['count']==40
assert [r['path'] for r in exact['files']]==expected
assert [r['path'] for r in delta['files']]==expected
assert settlement['task']['id']==os.environ['TASK_ID']
assert settlement['task']['lease_id']==os.environ['LEASE_ID']
assert settlement['task']['wall_id']==os.environ['WALL_ID']
assert settlement['queue']['before']=={'total':316,'queued':309,'resolved':7,'in_flight':0}
assert settlement['queue']['after']=={'total':316,'queued':308,'resolved':8,'in_flight':0}
for row in delta['files'][:38]:
    patch=root/row['delta_path']
    data=patch.read_bytes()
    assert len(data)==row['delta_bytes']
    assert hashlib.sha256(data).hexdigest()==row['delta_sha256']
PY


set -euo pipefail
bind() {
  local label="$1" run="$2" job="$3" job_name="$4" artifact="$5" artifact_name="$6" digest="$7" head="$8"
  gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$run" > "$OUT/evidence/$label-run.json"
  gh api "/repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?per_page=100" > "$OUT/evidence/$label-jobs.json"
  gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact" > "$OUT/evidence/$label-artifact.json"
  jq -e --argjson id "$run" --arg head "$head" '.id==$id and .status=="completed" and .conclusion=="success" and .event=="pull_request" and .head_sha==$head' "$OUT/evidence/$label-run.json" >/dev/null
  jq -e --argjson id "$job" --arg name "$job_name" 'any(.jobs[]; .id==$id and .name==$name and .status=="completed" and .conclusion=="success")' "$OUT/evidence/$label-jobs.json" >/dev/null
  jq -e --argjson id "$artifact" --arg name "$artifact_name" --arg digest "sha256:$digest" --argjson run "$run" '.id==$id and .name==$name and .digest==$digest and .expired==false and .workflow_run.id==$run' "$OUT/evidence/$label-artifact.json" >/dev/null
}
bind preflight 31088359558 92573114327 preflight 8962423257 doctor-who-cycle-008-preflight-v3-31088359558 38c606f921bdd06f3285967b37194dc50cc558bba43c115aee5d88045f9d445c e44f5578c31bccd9e9271af12d16171f592870ad
bind census 31110331798 92646143078 census 8971420444 doctor-who-cycle-008-kreg-media-recovery-v11-single-deletion-census-31110331798 75dab09bac152256ba5b9f471b244af1916b509d453e60adbc39d5aa7503905c 56a927b3c8b10587e934921138beff1a5d5b49e0
bind review 31110923065 92648203918 review 8971625526 doctor-who-cycle-008-kreg-independent-media-review-v1-31110923065 3e9d57566cddd961074a7f46839b565bb797d86958993f555cb5add9f5982b5c 88ef52960f8aa06541677abb891fa4cf1f41669a
bind observer 31112660901 92654179738 observe 8972359020 doctor-who-cycle-008-kreg-media-prepublish-v1-observer-31112660901 40a7726498b5d2030b732c78a4da51e5da821fb622c6cc4e616489f48962d339 9ffea597467c5475c40328770f9ac42b030b9105
gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/8971625526/zip" > "$OUT/evidence/review.zip"
gh api "/repos/$GITHUB_REPOSITORY/actions/artifacts/8972359020/zip" > "$OUT/evidence/observer.zip"
ROOT="$OUT/evidence" python3 - <<'PY'
import hashlib, json, os, pathlib, stat, zipfile
root=pathlib.Path(os.environ['ROOT'])
def extract(name):
    archive=root/f'{name}.zip'; target=root/name; target.mkdir()
    with zipfile.ZipFile(archive) as zf:
        seen=set()
        for info in zf.infolist():
            p=pathlib.PurePosixPath(info.filename)
            mode=(info.external_attr>>16)&0o170000
            if p.is_absolute() or '..' in p.parts or info.filename in seen or mode==stat.S_IFLNK:
                raise SystemExit(f'unsafe ZIP member: {info.filename}')
            seen.add(info.filename)
            if info.is_dir(): continue
            dest=target.joinpath(*p.parts); dest.parent.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(zf.read(info))
    return target
review_root=extract('review'); observer_root=extract('observer')
reviews=list(review_root.rglob('independent-media-review.json'))
pubs=list(observer_root.rglob('publication-receipt.json'))
assert len(reviews)==len(pubs)==1
assert hashlib.sha256(reviews[0].read_bytes()).hexdigest()=='39140972d669d408ebc3022d4dc329e0039dd67f252055500ded8d26c5c2edb8'
assert hashlib.sha256(pubs[0].read_bytes()).hexdigest()=='8e3f7adb78015a0d4ad4219247d30f2950d15ad80416f488986f36ecbb9ac1bb'
review=json.loads(reviews[0].read_text())
assert review['verdict']=='approved-for-separate-cycle-candidate'
assert review['task']=={'id':os.environ['TASK_ID'],'performance_mode':'voice','performer':'Dan Starkey','role':'Kreg'}
assert review['media']['sha256']==os.environ['STILL_SHA256'] and review['media']['status']=='verified'
assert review['portrait']['status']=='absent'
pub=json.loads(pubs[0].read_text())
assert pub['asset']['id']==504051495 and pub['asset']['sha256']==os.environ['STILL_SHA256']
assert pub['boundary']['release_asset_published'] is True and pub['boundary']['corpus_mutated'] is False
PY
curl --fail --location --silent --show-error \
  https://github.com/BigBirdReturns/undercast/releases/download/media-0003/uc-1353-still-5d19f72c.jpg \
  -o "$OUT/evidence/served-kreg.jpg"
test "$(wc -c < "$OUT/evidence/served-kreg.jpg")" = "67113"
test "$(sha256sum "$OUT/evidence/served-kreg.jpg" | awk '{print $1}')" = "$STILL_SHA256"


set -euo pipefail
git diff --name-only "$FLOOR_MAIN"..."$EXACT_BASE" | LC_ALL=C sort > "$OUT/floor-to-base-paths.txt"
comm -12 "$OUT/floor-to-base-paths.txt" "$PAYLOAD/meta/expected-paths.txt" > "$OUT/main-product-overlap.txt"
test ! -s "$OUT/main-product-overlap.txt"
rm -rf "$PRODUCT" "$WORKTREE"
mkdir -p "$PRODUCT"
git worktree add --detach "$WORKTREE" "$EXACT_BASE"
ROOT="$WORKTREE" PAYLOAD="$PAYLOAD" PRODUCT="$PRODUCT" EVIDENCE_IMAGE="$OUT/evidence/served-kreg.jpg" python3 - <<'PY'
import hashlib, json, os, pathlib, subprocess
root=pathlib.Path(os.environ['ROOT'])
payload=pathlib.Path(os.environ['PAYLOAD'])
product=pathlib.Path(os.environ['PRODUCT'])
delta=json.loads((payload/'meta/delta-manifest.json').read_text())
exact=json.loads((payload/'meta/candidate-file-manifest.json').read_text())
exact_by={r['path']:r for r in exact['files']}
for row in delta['files'][:38]:
    rel=pathlib.PurePosixPath(row['path']); base=root/rel; patch=payload/row['delta_path']; out=product/rel
    assert base.is_file(); data=base.read_bytes()
    assert len(data)==row['base_bytes'] and hashlib.sha256(data).hexdigest()==row['base_sha256']
    out.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['zstd','--quiet','--decompress',f'--patch-from={base}',str(patch),'-o',str(out),'-f'],check=True)
    data=out.read_bytes(); target=exact_by[row['path']]
    assert len(data)==target['bytes'] and hashlib.sha256(data).hexdigest()==target['sha256']
image=pathlib.Path(os.environ['EVIDENCE_IMAGE']); out=product/'images/uc-1353-still.jpg'
out.parent.mkdir(parents=True,exist_ok=True); out.write_bytes(image.read_bytes())
specimens=json.loads((product/'data/specimens.json').read_text())
tombstones=json.loads((root/'data/tombstones.json').read_text())
origin='https://bigbirdreturns.github.io/undercast'
urls=[f'{origin}/',f'{origin}/recognition.html',f'{origin}/coverage.html',f'{origin}/constellation.html']
urls += [f"{origin}/records/{row['id']}/" for row in specimens]
urls += [f"{origin}/records/{row['id']}/" for row in tombstones.get('records',[]) if row.get('status')!='merged']
def esc(value):
    return str(value).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;').replace("'",'&apos;')
sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(f'  <url><loc>{esc(url)}</loc></url>' for url in urls) + '\n</urlset>\n'
(product/'sitemap.xml').write_text(sitemap)
for row in exact['files']:
    path=product/row['path']; data=path.read_bytes()
    assert len(data)==row['bytes'], row['path']
    assert hashlib.sha256(data).hexdigest()==row['sha256'], row['path']
    blob=hashlib.sha1(f"blob {len(data)}\0".encode()+data).hexdigest()
    assert blob==row['git_blob'], (row['path'],blob,row['git_blob'])
    path.chmod(0o644)
assert len([p for p in product.rglob('*') if p.is_file()])==40
PY
while IFS= read -r path; do
  mkdir -p "$WORKTREE/$(dirname "$path")"
  cp "$PRODUCT/$path" "$WORKTREE/$path"
done < "$PAYLOAD/meta/expected-paths.txt"
git -C "$WORKTREE" add -N --pathspec-from-file="$PAYLOAD/meta/expected-paths.txt"
git -C "$WORKTREE" diff --name-only "$EXACT_BASE" | LC_ALL=C sort > "$OUT/overlay-paths.txt"
diff -u "$PAYLOAD/meta/expected-paths.txt" "$OUT/overlay-paths.txt"
git -C "$WORKTREE" diff --check
git -C "$WORKTREE" config user.name 'Undercast Autopilot'
git -C "$WORKTREE" config user.email 'autopilot@undercast.invalid'
git -C "$WORKTREE" add --pathspec-from-file="$PAYLOAD/meta/expected-paths.txt"
export GIT_AUTHOR_DATE='2026-08-07T16:30:00Z'
export GIT_COMMITTER_DATE='2026-08-07T16:30:00Z'
git -C "$WORKTREE" commit -m 'Doctor Who: materialize recovered reviewed cycle 008 Kreg candidate'
candidate="$(git -C "$WORKTREE" rev-parse HEAD)"
test "$(git -C "$WORKTREE" show -s --format=%P HEAD)" = "$EXACT_BASE"
git -C "$WORKTREE" diff-tree --no-commit-id --name-only -r HEAD | LC_ALL=C sort > "$OUT/candidate-paths.txt"
diff -u "$PAYLOAD/meta/expected-paths.txt" "$OUT/candidate-paths.txt"
WORKTREE="$WORKTREE" COMMIT="$candidate" MANIFEST="$PAYLOAD/meta/candidate-file-manifest.json" python3 - <<'PY'
import json, os, subprocess
for row in json.load(open(os.environ['MANIFEST']))['files']:
    blob=subprocess.check_output(['git','-C',os.environ['WORKTREE'],'rev-parse',f"{os.environ['COMMIT']}:{row['path']}"],text=True).strip()
    assert blob==row['git_blob'], (row['path'],blob,row['git_blob'])
PY
printf '%s\n' "$candidate" > "$OUT/candidate-commit.txt"
git -C "$WORKTREE" rev-parse 'HEAD^{tree}' > "$OUT/candidate-tree.txt"
test -z "$(git -C "$WORKTREE" status --porcelain)"


set -euo pipefail
cd "$WORKTREE"
npm ci
npx playwright install --with-deps chromium
test -z "$(git status --porcelain)"
npm run gate 2>&1 | tee "$OUT/complete-gate.log"
test -z "$(git status --porcelain)"
git diff --check HEAD^


set -euo pipefail
base="$EXACT_BASE"
candidate="$(cat "$OUT/candidate-commit.txt")"
tree="$(cat "$OUT/candidate-tree.txt")"
git -C "$WORKTREE" diff --binary "$base" "$candidate" > "$OUT/candidate.patch"
git -C "$WORKTREE" branch -f cycle008-kreg-recovered-candidate "$candidate"
git -C "$WORKTREE" bundle create "$OUT/candidate.bundle" cycle008-kreg-recovered-candidate ^"$base"
cp "$PAYLOAD/meta/"*.json "$OUT/"
cp "$PAYLOAD/meta/expected-paths.txt" "$OUT/expected-product-paths.txt"
PRODUCT="$PRODUCT" EXPECTED="$PAYLOAD/meta/expected-paths.txt" ARCHIVE="$OUT/candidate-product.tar.gz" python3 - <<'PY'
import gzip, os, pathlib, tarfile
product=pathlib.Path(os.environ['PRODUCT']); expected=pathlib.Path(os.environ['EXPECTED']).read_text().splitlines()
with open(os.environ['ARCHIVE'],'wb') as raw:
    with gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0,compresslevel=9) as gz:
        with tarfile.open(fileobj=gz,mode='w') as tf:
            for rel in expected:
                path=product/rel; info=tf.gettarinfo(str(path),arcname=rel)
                info.uid=info.gid=0; info.uname=info.gname=''; info.mtime=0; info.mode=0o644
                with path.open('rb') as source: tf.addfile(info,source)
PY
BASE="$base" COMMIT="$candidate" TREE="$tree" ROOT="$OUT" python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
root=Path(os.environ['ROOT'])
def h(name): return hashlib.sha256((root/name).read_bytes()).hexdigest()
receipt={
  'version':1,
  'transaction':'DOCTOR-WHO-CYCLE-008-KREG-RECOVERED-CANDIDATE-V1',
  'base_main':os.environ['BASE'],
  'carrier_head':os.environ['GITHUB_SHA'],
  'workflow_run':int(os.environ['GITHUB_RUN_ID']),
  'workflow_attempt':int(os.environ['GITHUB_RUN_ATTEMPT']),
  'candidate':{'commit':os.environ['COMMIT'],'tree':os.environ['TREE'],'paths':40,'expected_paths_sha256':h('expected-product-paths.txt'),'file_manifest_sha256':h('candidate-file-manifest.json'),'delta_manifest_sha256':h('delta-manifest.json'),'product_archive_sha256':h('candidate-product.tar.gz'),'patch_sha256':h('candidate.patch'),'bundle_sha256':h('candidate.bundle')},
  'recovery':{'complete_zstd_patches':38,'still_source':'independent-media-review-artifact-8971625526','sitemap_source':'deterministic-build-contract','all_product_hashes_match':True},
  'task':{'id':os.environ['TASK_ID'],'lease_id':os.environ['LEASE_ID'],'wall_id':os.environ['WALL_ID'],'performer':'Dan Starkey','role':'Kreg','mode':'voice'},
  'queue':{'before':{'queued':309,'resolved':7,'in_flight':0},'after':{'queued':308,'resolved':8,'in_flight':0}},
  'media':{'sha256':os.environ['STILL_SHA256'],'bytes':67113,'width':1053,'height':805},
  'boundary':{'candidate_only':True,'repository_ref_created':False,'product_published':False,'product_merged':False,'cycle_receipt_written':False,'waterline_event_written':False,'ninth_lease_authorized':False,'outside_human_dependency':False},
}
canonical=json.dumps(receipt,sort_keys=True,separators=(',',':')).encode()
receipt['identity']=hashlib.sha256(canonical).hexdigest()
final=(json.dumps(receipt,indent=2,sort_keys=True)+'\n').encode()
(root/'candidate-receipt.json').write_bytes(final)
(root/'candidate-receipt.file.sha256').write_text(f"{hashlib.sha256(final).hexdigest()}  candidate-receipt.json\n")
PY
find "$OUT" -maxdepth 1 -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > "$OUT/SHA256SUMS.pre"
sha256sum "$OUT/SHA256SUMS.pre" > "$OUT/SHA256SUMS"


set -euo pipefail
git fetch --no-tags --filter=blob:none origin "+refs/heads/main:refs/remotes/origin/main"
test "$(git rev-parse refs/remotes/origin/main)" = "$EXACT_BASE"
test -z "$(git status --porcelain)"


# Remove the detached worktree before artifact upload.
git worktree remove --force "$WORKTREE"
rm -rf "$PRODUCT"
