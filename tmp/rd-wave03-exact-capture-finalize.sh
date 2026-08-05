#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
repo="BigBirdReturns/undercast"
artifact_id=8937114139
artifact_run=31021882771
artifact_name=rd-wave03-exact-capture-supervisor-v3-31021882771
artifact_sha256=862f20b9b168fa70cd7ba3d57f1e84bf43f0738a68155d7b60a571e6720e50a5
artifact_head=db452902f9eb7257a912905af21b545440d75438
base_sha=45fc33aa8de8c01f03f006c5c01765dd1929385f
base_branch=agent/ssc-rd-wave03-exact-capture-finalizer-v3-base-20260805
helper_path=tmp/rd-wave03-exact-capture-finalize.sh
workflow_path=.github/workflows/rd-wave03-exact-capture-finalizer.yml
target_branch=agent/ssc-rd-wave03-exact-capture-product-20260805
settlement_name="rd-wave03-exact-capture-final-${GITHUB_RUN_ID}"
root="${EVIDENCE:?EVIDENCE is required}"
package="$root/package"
supervisor="$root/supervisor"
worktree="$root/worktree"
settlement="$root/settlement"

fail() { printf 'FINALIZER ERROR: %s\n' "$*" >&2; exit 1; }

safe_extract_zip() {
  python3 - "$1" "$2" <<'PY'
import pathlib, sys, zipfile
src=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(src) as zf:
    for info in zf.infolist():
        target=(out/info.filename).resolve()
        if out.resolve() not in target.parents and target != out.resolve():
            raise SystemExit(f'unsafe archive member {info.filename}')
    zf.extractall(out)
PY
}

verify_capture() {
  python3 - "$supervisor" "$settlement/capture-ledger.json" <<'PY'
import hashlib, json, pathlib, sys
root=pathlib.Path(sys.argv[1]); receipt=json.loads((root/'capture/receipt.json').read_text())
assert receipt['schema_version']==1
assert receipt['capture_id']=='RD-W03-XCAP-01'
assert receipt['workflow_run_id']=='31021882771'
assert receipt['exact_product_head']=='db452902f9eb7257a912905af21b545440d75438'
assert receipt['authority']=={
  'adoption_effect':'none','external_contacts':0,'external_reviews':0,'graph_effect':'none',
  'merge_authority':False,'outside_human_dependency':False,'physical_user_action_required':False,
  'publication_effect':'none'
}
assert receipt['object_count']==9
assert receipt['summary']=={
  'successful':9,'failed':0,'unchanged':0,'drifted':9,
  'evidence_admissions':0,'chronology_resolved':0,'classes_closed':0
}
expected_routes=[
 'RD01-OFF-001','RD02-OFF-004','RD04-OFF-004','RD04-OFF-005',
 'RD05-OFF-001','RD05-OFF-002','RD05-OFF-003','RD05-OFF-005','RD05-OFF-007'
]
assert [r['source_route_id'] for r in receipt['objects']]==expected_routes
rows=[]
for row in receipt['objects']:
    data=(root/'capture'/row['relative_path']).read_bytes()
    assert row['ok'] is True
    assert row['attempt_count']==1 and row['followups_spawned']==0
    assert row['http_status']==200
    assert row['body_drift'] is True
    assert row['evidence_admitted'] is False and row['classes_closed']==0
    assert row['chronology']=={'status':'unresolved','event_date':None,'capture_time_is_event_time':False}
    assert len(data)==row['bytes']
    assert hashlib.sha256(data).hexdigest()==row['body_sha256']
    final_host=__import__('urllib.parse').parse.urlparse(row['final_url']).hostname
    allowed=final_host.removeprefix('www.')
    requested=__import__('urllib.parse').parse.urlparse(row['requested_url']).hostname.removeprefix('www.')
    assert allowed==requested
    rows.append({
      'capture_object_id':row['capture_object_id'], 'source_route_id':row['source_route_id'],
      'lane_id':row['lane_id'], 'unit_id':row['unit_id'], 'event_class':row['event_class'],
      'requested_url':row['requested_url'], 'final_url':row['final_url'],
      'content_type':row['content_type'], 'bytes':row['bytes'], 'body_sha256':row['body_sha256'],
      'initial_bytes':row['initial_bytes'], 'initial_body_sha256':row['initial_body_sha256'],
      'body_drift':row['body_drift'], 'started_at':row['started_at'], 'finished_at':row['finished_at']
    })
out={'schema_version':1,'artifact_run_id':31021882771,'artifact_head':'db452902f9eb7257a912905af21b545440d75438','objects':rows,
     'object_count':9,'unchanged':0,'drifted':9,'evidence_admissions':0,'chronology_resolved':0,'classes_closed':0}
pathlib.Path(sys.argv[2]).write_text(json.dumps(out,sort_keys=True,indent=2)+'\n')
PY
}

verify_carrier() {
  test "${GITHUB_EVENT_NAME}" = pull_request
  test "${PR_BASE_REF:?}" = "$base_branch"
  test "${PR_BASE_SHA:?}" = "$base_sha"
  test "$(git rev-parse HEAD)" = "${PR_HEAD_SHA:?}"
  mapfile -t commits < <(git rev-list --reverse "$base_sha..$PR_HEAD_SHA")
  test "${#commits[@]}" -eq 2
  test "$(git show -s --format=%P "${commits[0]}")" = "$base_sha"
  test "$(git show -s --format=%P "${commits[1]}")" = "${commits[0]}"
  test "${commits[1]}" = "$PR_HEAD_SHA"
  test "$(git diff-tree --no-commit-id --name-only -r "${commits[0]}")" = "$helper_path"
  test "$(git diff-tree --no-commit-id --name-only -r "${commits[1]}")" = "$workflow_path"
  mapfile -t actual < <(git diff --name-only "$base_sha" "$PR_HEAD_SHA" | LC_ALL=C sort)
  printf '%s\n' "$workflow_path" "$helper_path" | LC_ALL=C sort > "$root/expected-carrier-paths.txt"
  printf '%s\n' "${actual[@]}" > "$root/actual-carrier-paths.txt"
  diff -u "$root/expected-carrier-paths.txt" "$root/actual-carrier-paths.txt"
  printf 'base=%s\nhead=%s\nhelper_commit=%s\nworkflow_commit=%s\n' "$base_sha" "$PR_HEAD_SHA" "${commits[0]}" "${commits[1]}" > "$root/carrier.txt"
}

case "$mode" in
verify)
  mkdir -p "$root" "$settlement"
  exec > >(tee "$root/finalizer.log") 2>&1
  printf 'carrier_preflight\n' > "$root/stage.txt"
  verify_carrier

  printf 'artifact_recovery\n' > "$root/stage.txt"
  meta="$root/artifact-metadata.json"
  zip="$root/supervisor-artifact.zip"
  gh api "repos/$repo/actions/artifacts/$artifact_id" > "$meta"
  python3 - "$meta" <<PY
import json, pathlib, sys
m=json.loads(pathlib.Path(sys.argv[1]).read_text())
assert m['id']==$artifact_id
assert m['name']=='$artifact_name'
assert m['expired'] is False
assert m['digest']=='sha256:$artifact_sha256'
assert m['workflow_run']['id']==$artifact_run
assert m['workflow_run']['head_sha']=='$artifact_head'
PY
  gh api "repos/$repo/actions/artifacts/$artifact_id/zip" > "$zip"
  echo "$artifact_sha256  $zip" | sha256sum -c -
  safe_extract_zip "$zip" "$supervisor"
  test "$(cat "$supervisor/current-main.txt")" = "$base_sha"
  test "$(cat "$supervisor/stage.txt")" = exact_byte_capture
  echo '1571616c7ba50f882b96516444eca574ae5b0cb85319ececc1690a634bdf3051  '"$supervisor/generator.py" | sha256sum -c -
  echo '2d434f85999df1452bacaf49a23d5ad6c96dcc09bf155fafa8198fae4c20d860  '"$supervisor/generator.py.gz" | sha256sum -c -
  echo '98b7ab0fc93b9e9a9c021b16c166c6cf00d1f207501e66f57ec3d5944d4ae538  '"$supervisor/schema.json" | sha256sum -c -
  test "$(find "$supervisor/artifacts" -name receipt.json -type f | wc -l)" -eq 6
  test "$(find "$supervisor/capture/objects" -type f | wc -l)" -eq 9

  unset GH_TOKEN GITHUB_TOKEN
  printf 'capture_verification\n' > "$root/stage.txt"
  verify_capture

  printf 'package_regeneration\n' > "$root/stage.txt"
  python3 -m venv "$root/venv"
  "$root/venv/bin/pip" install --disable-pip-version-check --no-input 'jsonschema==4.25.1'
  env -u GH_TOKEN -u GITHUB_TOKEN "$root/venv/bin/python" "$supervisor/generator.py" --artifacts "$supervisor/artifacts" --schema "$supervisor/schema.json" --out "$package" | tee "$root/generation.json"
  test "$(find "$package" -type f | wc -l)" -eq 6
  echo '325375c3613d2a91185e8d8bb00345180528b4b5fb1acf8f9a03685a039b39a3  '"$package/data/research/residual-denominator/wave-03/exact-capture/protocol.json" | sha256sum -c -
  echo '78a5297c7ae6ef83449baa03604e85365f9cfcf965c20790e1a87403088feb10  '"$package/data/research/residual-denominator/wave-03/exact-capture/manifest.json" | sha256sum -c -
  echo 'cbe209520d8156380b6fb0567ecff4f7da5dedea97a8c7cef61c02fea4dc96c0  '"$package/docs/research/residual-denominator/wave-03/RD-EXACT-CAPTURE.md" | sha256sum -c -
  echo '98b7ab0fc93b9e9a9c021b16c166c6cf00d1f207501e66f57ec3d5944d4ae538  '"$package/schema/rd-wave03-exact-capture.schema.json" | sha256sum -c -
  echo '8e7bc968d2cce0aa85d72c4f8f50347e7aaa41b54d0fad17d625cdc8cca550d5  '"$package/scripts/rd-wave03-exact-capture.mjs" | sha256sum -c -
  echo '24f91af3bf51e298cbc8ae3e0e904711001b66f23f80936bfd438c90e64d905c  '"$package/test/rd-wave03-exact-capture-adversarial.mjs" | sha256sum -c -
  node --check "$package/scripts/rd-wave03-exact-capture.mjs"
  node --check "$package/test/rd-wave03-exact-capture-adversarial.mjs"
  node "$package/scripts/rd-wave03-exact-capture.mjs" --check
  node "$package/test/rd-wave03-exact-capture-adversarial.mjs"
  node "$package/scripts/rd-wave03-exact-capture.mjs" --verify-receipt "$supervisor/capture/receipt.json"

  printf 'current_main_gate\n' > "$root/stage.txt"
  git config --local --unset-all http.https://github.com/.extraheader >/dev/null 2>&1 || true
  git remote set-url origin https://github.com/BigBirdReturns/undercast.git
  git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
  test "$(git rev-parse refs/remotes/origin/main)" = "$base_sha"
  rm -rf "$worktree"
  git worktree add --detach "$worktree" "$base_sha"
  git -C "$worktree" config user.name github-actions[bot]
  git -C "$worktree" config user.email 41898282+github-actions[bot]@users.noreply.github.com
  python3 - "$package/data/research/residual-denominator/wave-03/exact-capture/protocol.json" > "$root/product-paths.txt" <<'PY'
import json,pathlib,sys
print('\n'.join(sorted(json.loads(pathlib.Path(sys.argv[1]).read_text())['permanent_paths'])))
PY
  test "$(wc -l < "$root/product-paths.txt")" -eq 6
  while IFS= read -r p; do
    test ! -e "$worktree/$p"
    mkdir -p "$worktree/$(dirname "$p")"
    cp "$package/$p" "$worktree/$p"
  done < "$root/product-paths.txt"
  mapfile -t changed < <(git -C "$worktree" status --porcelain=v1 --untracked-files=all | cut -c4- | LC_ALL=C sort)
  test "$(printf '%s\n' "${changed[@]}")" = "$(cat "$root/product-paths.txt")"
  git -C "$worktree" add --pathspec-from-file="$root/product-paths.txt"
  git -C "$worktree" commit --no-verify -m 'research: RD-W03 exact-capture nine current official objects'
  product_head="$(git -C "$worktree" rev-parse HEAD)"
  test "$(git -C "$worktree" show -s --format=%P "$product_head")" = "$base_sha"
  git -C "$worktree" diff-tree --no-commit-id --name-only -r "$product_head" | LC_ALL=C sort > "$root/committed-paths.txt"
  diff -u "$root/product-paths.txt" "$root/committed-paths.txt"
  ! grep -Eiq '(^|/)(tmp|transport|carrier|materializer|controller|trigger)(/|\.|-|$)' "$root/committed-paths.txt"
  cd "$worktree"
  npm ci
  npx playwright install --with-deps chromium
  npm run gate
  node scripts/rd-wave03-exact-capture.mjs --check
  node test/rd-wave03-exact-capture-adversarial.mjs
  test -z "$(git status --porcelain=v1 --untracked-files=all)"
  git branch -f rd-wave03-exact-capture-product "$product_head"
  git bundle create "$settlement/product.bundle" refs/heads/rd-wave03-exact-capture-product "^$base_sha"
  cd "$GITHUB_WORKSPACE"
  git bundle verify "$settlement/product.bundle"

  printf 'settlement_packaging\n' > "$root/stage.txt"
  cp -a "$package" "$settlement/package"
  cp -a "$supervisor/capture" "$settlement/capture"
  cp "$meta" "$settlement/supervisor-artifact-metadata.json"
  cp "$root/capture-ledger.json" "$settlement/capture-ledger.json"
  cp "$root/product-paths.txt" "$settlement/product-paths.txt"
  printf '%s\n' "$product_head" > "$settlement/product-head.txt"
  printf '%s\n' "$base_sha" > "$settlement/product-parent.txt"
  python3 - "$settlement" <<'PY'
import hashlib,json,os,pathlib,sys
r=pathlib.Path(sys.argv[1]); capture=json.loads((r/'capture/receipt.json').read_text())
package_hashes={}
for p in sorted((r/'package').rglob('*')):
    if p.is_file(): package_hashes[str(p.relative_to(r/'package'))]=hashlib.sha256(p.read_bytes()).hexdigest()
receipt={
 'schema_version':1,'transaction_id':'RD-W03-EXACT-CAPTURE-FINAL-01',
 'finalizer_run_id':int(os.environ['GITHUB_RUN_ID']),'finalizer_head':os.environ['PR_HEAD_SHA'],
 'supervisor_run_id':31021882771,'supervisor_artifact_id':8937114139,
 'supervisor_artifact_sha256':'862f20b9b168fa70cd7ba3d57f1e84bf43f0738a68155d7b60a571e6720e50a5',
 'supervisor_head':'db452902f9eb7257a912905af21b545440d75438',
 'product_parent':'45fc33aa8de8c01f03f006c5c01765dd1929385f',
 'product_head':(r/'product-head.txt').read_text().strip(),'product_path_count':6,
 'package_sha256':package_hashes,'route_observations':710,'selected_capture_objects':9,'refused_observations':701,
 'successful_captures':9,'failed_captures':0,'unchanged_from_intake':0,'drifted_from_intake':9,
 'capture_receipt_sha256':hashlib.sha256((r/'capture/receipt.json').read_bytes()).hexdigest(),
 'complete_current_main_gate':'passed','adversarial_refusals':35,'credential_free_source_capture':True,
 'source_requests_repeated_by_finalizer':False,'evidence_admissions':0,'chronology_resolved':0,'classes_closed':0,
 'external_contacts':0,'external_reviews':0,'outside_human_dependency':False,
 'publication_effect':'none','adoption_effect':'none','graph_effect':'none','merge_authority':False
}
(r/'finalizer-receipt.json').write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n')
PY
  (cd "$settlement" && find . -type f ! -name SHA256SUMS -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > SHA256SUMS)
  printf 'complete\n' > "$root/stage.txt"
  ;;

publish)
  test -d "$root/settlement"
  cd "$root/settlement"
  sha256sum -c SHA256SUMS
  python3 - finalizer-receipt.json <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert r['schema_version']==1 and r['transaction_id']=='RD-W03-EXACT-CAPTURE-FINAL-01'
assert r['supervisor_artifact_id']==8937114139
assert r['supervisor_artifact_sha256']=='862f20b9b168fa70cd7ba3d57f1e84bf43f0738a68155d7b60a571e6720e50a5'
assert r['product_parent']=='45fc33aa8de8c01f03f006c5c01765dd1929385f'
assert r['product_path_count']==6 and r['route_observations']==710 and r['selected_capture_objects']==9 and r['refused_observations']==701
assert r['successful_captures']==9 and r['failed_captures']==0 and r['unchanged_from_intake']==0 and r['drifted_from_intake']==9
assert r['complete_current_main_gate']=='passed' and r['adversarial_refusals']==35
assert r['source_requests_repeated_by_finalizer'] is False
assert r['evidence_admissions']==r['chronology_resolved']==r['classes_closed']==0
assert r['external_contacts']==r['external_reviews']==0 and r['outside_human_dependency'] is False
assert r['publication_effect']==r['adoption_effect']==r['graph_effect']=='none' and r['merge_authority'] is False
PY
  product_head="$(cat product-head.txt)"
  product_parent="$(cat product-parent.txt)"
  test "$product_parent" = "$base_sha"
  test "$(git ls-remote --heads origin refs/heads/main | awk '{print $1}')" = "$base_sha"
  git bundle verify product.bundle
  git fetch product.bundle refs/heads/rd-wave03-exact-capture-product:refs/remotes/settlement/product
  test "$(git rev-parse refs/remotes/settlement/product)" = "$product_head"
  test "$(git show -s --format=%P "$product_head")" = "$base_sha"
  git diff-tree --no-commit-id --name-only -r "$product_head" | LC_ALL=C sort > actual-product-paths.txt
  diff -u product-paths.txt actual-product-paths.txt
  existing="$(git ls-remote --heads origin "refs/heads/$target_branch" | awk '{print $1}')"
  test -z "$existing" || test "$existing" = "$product_head"
  if test -z "$existing"; then git push origin "$product_head:refs/heads/$target_branch"; fi
  test "$(git ls-remote --heads origin "refs/heads/$target_branch" | awk '{print $1}')" = "$product_head"
  ;;
*) fail 'usage: finalizer verify|publish' ;;
esac
