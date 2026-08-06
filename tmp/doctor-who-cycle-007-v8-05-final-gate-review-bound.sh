#!/usr/bin/env bash
set -euo pipefail
: "${EXACT_MAIN:?}" "${OUT:?}"

cat > "$OUT/expected-finalizer-paths.txt" <<'PATHS'
data/ESTATE-REGISTRY.json
data/WATERLINE-STATE.json
data/journal/waterline.jsonl
data/review/adapter-sdk/BASELINE.json
data/review/adapter-sdk/doctor-who-cycle-007-kragar-independent-candidate-review.json
data/review/adapter-sdk/doctor-who-cycle-007-kragar.json
docs/AUTOPILOT.md
package.json
scripts/doctor-who-cycle-007.mjs
PATHS
LC_ALL=C sort -o "$OUT/expected-finalizer-paths.txt" "$OUT/expected-finalizer-paths.txt"
{ git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort > "$OUT/actual-finalizer-paths.txt"
diff -u "$OUT/expected-finalizer-paths.txt" "$OUT/actual-finalizer-paths.txt"

git add --pathspec-from-file="$OUT/expected-finalizer-paths.txt"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/pre-gate-finalizer-paths.txt"
diff -u "$OUT/expected-finalizer-paths.txt" "$OUT/pre-gate-finalizer-paths.txt"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
test -z "$(git diff --cached --name-only | grep '^\.github/workflows/' || true)"

npm run gate 2>&1 | tee "$OUT/final-gate.log"
sha256sum "$OUT/final-gate.log" | awk '{print $1}' > "$OUT/final-gate.sha256"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/post-gate-finalizer-paths.txt"
diff -u "$OUT/expected-finalizer-paths.txt" "$OUT/post-gate-finalizer-paths.txt"

git commit -m 'Doctor Who: complete reviewed cycle 007 for Kragar'
git rev-parse HEAD > "$OUT/final-commit.txt"
git rev-parse 'HEAD^{tree}' > "$OUT/final-tree.txt"
test "$(git show -s --format=%P HEAD)" = "$(cat "$OUT/candidate-commit.txt")"
cat "$OUT/expected-candidate-paths.txt" "$OUT/expected-finalizer-paths.txt" | LC_ALL=C sort -u > "$OUT/expected-final-paths.txt"
git diff --name-only "$EXACT_MAIN"...HEAD | LC_ALL=C sort > "$OUT/final-paths.txt"
diff -u "$OUT/expected-final-paths.txt" "$OUT/final-paths.txt"
test -z "$(grep '^\.github/workflows/' "$OUT/final-paths.txt" || true)"
git show --stat --oneline --decorate HEAD > "$OUT/final-stat.txt"
git format-patch --stdout "$EXACT_MAIN"..HEAD > "$OUT/doctor-who-cycle-007.patch"
git bundle create "$OUT/doctor-who-cycle-007.bundle" HEAD "^$EXACT_MAIN"
sha256sum data/review/adapter-sdk/doctor-who-cycle-007-kragar.json scripts/doctor-who-cycle-007.mjs "$OUT/doctor-who-cycle-007.patch" "$OUT/doctor-who-cycle-007.bundle" > "$OUT/final-product.sha256"
node scripts/doctor-who-cycle-007.mjs | tee "$OUT/cycle-007-check.log"
test -z "$(git status --porcelain)"
