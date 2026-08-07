#!/usr/bin/env bash
set -euo pipefail
rm -rf "$OUT"
mkdir -p "$OUT" "$PAYLOAD_OUT" "$PRODUCT_OUT"
head_sha="$PR_HEAD_SHA"
base_sha="$PR_BASE_SHA"

test "$(git rev-parse HEAD)" = "$head_sha"
test "$PR_HEAD_REF" = "$CARRIER_BRANCH"
test "$(git show -s --format=%P HEAD)" = "$FLOOR_MAIN"
test "$(git rev-list --count "$FLOOR_MAIN"..HEAD)" = "1"
test "$(git merge-base "$FLOOR_MAIN" HEAD)" = "$FLOOR_MAIN"
test -z "$(git rev-list --min-parents=2 "$FLOOR_MAIN"..HEAD)"

cat > "$OUT/expected-carrier-paths.txt" <<'PATHS'
.github/doctor-who-cycle-008/kreg-candidate-v5g/env.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-01.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-02.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-03.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-04.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-05.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-06.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-07.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-08.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-09.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-10.sh
.github/doctor-who-cycle-008/kreg-candidate-v5g/phase-sha256.txt
.github/doctor-who-cycle-008/kreg-candidate-v5g/product-delta.tar.xz
.github/workflows/doctor-who-cycle-008-kreg-candidate-v5g.yml
PATHS
LC_ALL=C sort -c "$OUT/expected-carrier-paths.txt"
test "$(wc -l < "$OUT/expected-carrier-paths.txt")" = "14"
git diff --name-only "$FLOOR_MAIN"...HEAD | LC_ALL=C sort > "$OUT/actual-carrier-paths.txt"
diff -u "$OUT/expected-carrier-paths.txt" "$OUT/actual-carrier-paths.txt"
git diff --name-status "$FLOOR_MAIN"...HEAD | LC_ALL=C sort > "$OUT/actual-carrier-status.txt"
test "$(awk -F '\t' '$1 == "A" { n++ } END { print n + 0 }' "$OUT/actual-carrier-status.txt")" = "14"

git fetch --no-tags --filter=blob:none origin "+refs/heads/main:refs/remotes/origin/main"
live_main="$(git rev-parse refs/remotes/origin/main)"
test "$live_main" = "$base_sha"
git merge-base --is-ancestor "$FLOOR_MAIN" "$base_sha"
git merge-base --is-ancestor "$SOURCE_BUILD_MAIN" "$base_sha"

gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" > "$OUT/pr.json"
gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files?per_page=100" > "$OUT/pr-files.json"
OUT="$OUT" HEAD_SHA="$head_sha" BASE_SHA="$base_sha" python3 - <<'PY2'
import json, os, pathlib
root=pathlib.Path(os.environ['OUT'])
pr=json.loads((root/'pr.json').read_text())
files=json.loads((root/'pr-files.json').read_text())
expected=(root/'expected-carrier-paths.txt').read_text().splitlines()
assert pr['state']=='open' and pr['draft'] is True and pr['merged'] is False
assert pr['head']['repo']['full_name']=='BigBirdReturns/undercast'
assert pr['head']['ref']=='agent/doctor-who-cycle-008-kreg-candidate-v5g'
assert pr['head']['sha']==os.environ['HEAD_SHA']
assert pr['base']['ref']=='main' and pr['base']['sha']==os.environ['BASE_SHA']
assert pr['commits']==1 and pr['changed_files']==len(expected)==14
assert sorted(row['filename'] for row in files)==expected
assert all(row['status']=='added' for row in files)
PY2

cat > "$OUT/product-paths.txt" <<'PATHS'
CREDITS.md
data/AUTOPILOT.json
data/CENSUS-COVERAGE.json
data/CENSUS-FERENGI-TEST.json
data/CENSUS-GAPS.json
data/CENSUS-SUMMARY.json
data/MEDIA-AUDIT.json
data/SOURCES.json
data/archive.json
data/entities.json
data/index.json
data/journal/autopilot.jsonl
data/journal/candidates.jsonl
data/journal/media-audit.jsonl
data/media-live.json
data/media-manifest.json
data/quality.json
data/search/2.json
data/search/a.json
data/search/b.json
data/search/d.json
data/search/f.json
data/search/g.json
data/search/i.json
data/search/j.json
data/search/k.json
data/search/m.json
data/search/manifest.json
data/search/p.json
data/search/r.json
data/search/s.json
data/search/t.json
data/search/u.json
data/search/w.json
data/shard-manifest.json
data/shards/0001.json
data/species.json
data/specimens.json
images/uc-1353-still.jpg
sitemap.xml
PATHS
LC_ALL=C sort -c "$OUT/product-paths.txt"
test "$(wc -l < "$OUT/product-paths.txt")" = "40"

git diff --name-only "$SOURCE_BUILD_MAIN"..."$base_sha" | LC_ALL=C sort > "$OUT/source-to-base-paths.txt"
comm -12 "$OUT/source-to-base-paths.txt" "$OUT/product-paths.txt" > "$OUT/main-product-overlap.txt"
test ! -s "$OUT/main-product-overlap.txt"
git diff --name-only "$FLOOR_MAIN"..."$base_sha" | LC_ALL=C sort > "$OUT/floor-to-base-paths.txt"
comm -12 "$OUT/floor-to-base-paths.txt" "$OUT/expected-carrier-paths.txt" > "$OUT/main-carrier-overlap.txt"
test ! -s "$OUT/main-carrier-overlap.txt"

test -z "$(git status --porcelain)"
printf 'floor_main=%s\nsource_build_main=%s\nbase_main=%s\ncarrier_head=%s\ncarrier_tree=%s\n' "$FLOOR_MAIN" "$SOURCE_BUILD_MAIN" "$base_sha" "$head_sha" "$(git rev-parse 'HEAD^{tree}')" > "$OUT/carrier-identity.txt"
