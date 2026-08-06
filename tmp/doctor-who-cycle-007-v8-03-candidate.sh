#!/usr/bin/env bash
set -euo pipefail
: "${EXACT_MAIN:?}" "${OUT:?}"

cat > "$OUT/expected-candidate-paths.txt" <<'PATHS'
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
data/search/c.json
data/search/d.json
data/search/e.json
data/search/h.json
data/search/i.json
data/search/j.json
data/search/k.json
data/search/manifest.json
data/search/n.json
data/search/p.json
data/search/r.json
data/search/s.json
data/search/t.json
data/search/w.json
data/shard-manifest.json
data/shards/0001.json
data/species.json
data/specimens.json
images/uc-1352-still.jpg
sitemap.xml
tests/rendered/site.spec.mjs
PATHS
LC_ALL=C sort -o "$OUT/expected-candidate-paths.txt" "$OUT/expected-candidate-paths.txt"
{ git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort > "$OUT/actual-candidate-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/actual-candidate-paths.txt"

git add --pathspec-from-file="$OUT/expected-candidate-paths.txt"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/pre-gate-candidate-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/pre-gate-candidate-paths.txt"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
test -z "$(git diff --cached --name-only | grep '^\.github/workflows/' || true)"

npm run gate 2>&1 | tee "$OUT/candidate-gate.log"
sha256sum "$OUT/candidate-gate.log" | awk '{print $1}' > "$OUT/candidate-gate.sha256"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/post-gate-candidate-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/post-gate-candidate-paths.txt"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -m 'Doctor Who: stage cycle 007 Kragar candidate'
git rev-parse HEAD > "$OUT/candidate-commit.txt"
git rev-parse 'HEAD^{tree}' > "$OUT/candidate-tree.txt"
git diff --name-only "$EXACT_MAIN"...HEAD | LC_ALL=C sort > "$OUT/candidate-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/candidate-paths.txt"
git show --stat --oneline --decorate HEAD > "$OUT/candidate-stat.txt"
test -z "$(git status --porcelain)"
