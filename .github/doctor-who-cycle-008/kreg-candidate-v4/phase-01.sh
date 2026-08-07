#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
rm -rf "$OUT"
mkdir -p "$OUT" "$PAYLOAD_OUT" "$PRODUCT_OUT"
head_sha="$PR_HEAD_SHA"
base_sha="$PR_BASE_SHA"
test "$(git rev-parse HEAD)" = "$head_sha"
test "$PR_HEAD_REF" = "$CARRIER_BRANCH"
test "$base_sha" = "$FLOOR_MAIN"
test "$(git show -s --format=%P HEAD)" = "$base_sha"
test "$(git rev-list --count "$base_sha"..HEAD)" = "1"
test "$(git merge-base "$base_sha" HEAD)" = "$base_sha"
test -z "$(git rev-list --min-parents=2 "$base_sha"..HEAD)"
{
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-00.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-01.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-02.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-03.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-04.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-05.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-06.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-07.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-08.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-09.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-10.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/payload.part-11.b64'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-01.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-02.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-03.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-04.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-05.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-06.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-07.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-08.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-09.sh'
  printf '%s\n' '.github/doctor-who-cycle-008/kreg-candidate-v4/phase-10.sh'
  printf '%s\n' '.github/workflows/doctor-who-cycle-008-kreg-candidate-v4.yml'
} | LC_ALL=C sort > "$OUT/expected-carrier-paths.txt"
git diff --name-only "$base_sha"...HEAD | LC_ALL=C sort > "$OUT/actual-carrier-paths.txt"
diff -u "$OUT/expected-carrier-paths.txt" "$OUT/actual-carrier-paths.txt"
git fetch --no-tags --filter=blob:none origin "+refs/heads/main:refs/remotes/origin/main"
live_main="$(git rev-parse refs/remotes/origin/main)"
test "$live_main" = "$base_sha"
git diff --name-only "$SOURCE_BUILD_MAIN"..."$base_sha" | LC_ALL=C sort > "$OUT/main-delta-paths.txt"
printf '%s\n' \
  CREDITS.md data/AUTOPILOT.json data/CENSUS-COVERAGE.json data/CENSUS-FERENGI-TEST.json \
  data/CENSUS-GAPS.json data/CENSUS-SUMMARY.json data/MEDIA-AUDIT.json data/SOURCES.json \
  data/archive.json data/entities.json data/index.json data/journal/autopilot.jsonl \
  data/journal/candidates.jsonl data/journal/media-audit.jsonl data/media-live.json \
  data/media-manifest.json data/quality.json data/search/2.json data/search/a.json \
  data/search/b.json data/search/d.json data/search/f.json data/search/g.json \
  data/search/i.json data/search/j.json data/search/k.json data/search/m.json \
  data/search/manifest.json data/search/p.json data/search/r.json data/search/s.json \
  data/search/t.json data/search/u.json data/search/w.json data/shard-manifest.json \
  data/shards/0001.json data/species.json data/specimens.json images/uc-1353-still.jpg sitemap.xml \
  | LC_ALL=C sort > "$OUT/product-paths.txt"
comm -12 "$OUT/main-delta-paths.txt" "$OUT/product-paths.txt" > "$OUT/main-product-overlap.txt"
test ! -s "$OUT/main-product-overlap.txt"
test -z "$(git status --porcelain)"
printf 'floor_main=%s\nsource_build_main=%s\nbase_main=%s\ncarrier_head=%s\ncarrier_tree=%s\n' \
  "$FLOOR_MAIN" "$SOURCE_BUILD_MAIN" "$base_sha" "$head_sha" "$(git rev-parse 'HEAD^{tree}')" \
  > "$OUT/carrier-identity.txt"
