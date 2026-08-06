# Integrate only reviewed candidate bytes over the disjoint current publication main.
git worktree add --detach "$INTEGRATION" "$CURRENT_MAIN"
cd "$INTEGRATION"
git checkout -B agent/doctor-who-cycle-007-integrated-product-v14 "$CURRENT_MAIN"
comm -12 "$OUT/current-main-drift-paths.txt" "$OUT/expected-candidate-paths.txt" > "$OUT/candidate-overlap.txt"
test ! -s "$OUT/candidate-overlap.txt"
git apply --binary "$OUT/reviewed-candidate.diff"
{ git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort > "$OUT/integrated-candidate-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/integrated-candidate-paths.txt"

npm ci
npx playwright install --with-deps chromium
git add --pathspec-from-file="$OUT/expected-candidate-paths.txt"
npm run gate 2>&1 | tee "$OUT/integrated-candidate-gate.log"
sha256sum "$OUT/integrated-candidate-gate.log" | awk '{print $1}' > "$OUT/integrated-candidate-gate.sha256"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/integrated-candidate-staged-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/integrated-candidate-staged-paths.txt"

# Bind this finalization run/job, then write the reviewed receipt.
gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?per_page=100" > "$OUT/finalization-jobs.json"
WORKFLOW_JOB="$(jq -r '.jobs[] | select(.name == "finalize") | .id' "$OUT/finalization-jobs.json")"
test "$WORKFLOW_JOB" -gt 0
export WORKFLOW_JOB
export CANDIDATE_COMMIT="$REVIEWED_CANDIDATE_COMMIT"
export CANDIDATE_GATE_SHA256="$REVIEWED_CANDIDATE_GATE_SHA256"
export CANDIDATE_ARTIFACT_NAME CANDIDATE_ARTIFACT_ID CANDIDATE_ARTIFACT_SHA256
bash "$CYCLE_ASSET_DIR/04-finalize.sh"

cat > "$OUT/expected-finalizer-paths.txt" <<'PATHS'
data/ESTATE-REGISTRY.json
data/WATERLINE-STATE.json
data/journal/waterline.jsonl
data/review/adapter-sdk/BASELINE.json
data/review/adapter-sdk/doctor-who-cycle-007-kragar.json
docs/AUTOPILOT.md
package.json
scripts/doctor-who-cycle-007.mjs
PATHS
LC_ALL=C sort -o "$OUT/expected-finalizer-paths.txt" "$OUT/expected-finalizer-paths.txt"
{ git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort > "$OUT/actual-finalizer-paths.txt"
diff -u "$OUT/expected-finalizer-paths.txt" "$OUT/actual-finalizer-paths.txt"
git add --pathspec-from-file="$OUT/expected-finalizer-paths.txt"
cat "$OUT/expected-candidate-paths.txt" "$OUT/expected-finalizer-paths.txt" | LC_ALL=C sort -u > "$OUT/expected-final-paths.txt"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/pre-gate-final-paths.txt"
diff -u "$OUT/expected-final-paths.txt" "$OUT/pre-gate-final-paths.txt"
test -z "$(grep '^\.github/workflows/' "$OUT/pre-gate-final-paths.txt" || true)"

npm run gate 2>&1 | tee "$OUT/final-gate.log"
sha256sum "$OUT/final-gate.log" | awk '{print $1}' > "$OUT/final-gate.sha256"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/post-gate-final-paths.txt"
diff -u "$OUT/expected-final-paths.txt" "$OUT/post-gate-final-paths.txt"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -m 'Doctor Who: complete reviewed cycle 007 for Kragar'
git rev-parse HEAD > "$OUT/integrated-final-commit.txt"
git rev-parse 'HEAD^{tree}' > "$OUT/integrated-final-tree.txt"
test "$(git show -s --format=%P HEAD)" = "$CURRENT_MAIN"
git diff --name-only "$CURRENT_MAIN"...HEAD | LC_ALL=C sort > "$OUT/integrated-final-paths.txt"
diff -u "$OUT/expected-final-paths.txt" "$OUT/integrated-final-paths.txt"
node scripts/doctor-who-cycle-007.mjs | tee "$OUT/cycle-007-check.log"

git format-patch --stdout "$CURRENT_MAIN"..HEAD > "$OUT/doctor-who-cycle-007-current-main.patch"
git bundle create "$OUT/doctor-who-cycle-007-current-main.bundle" HEAD "^$CURRENT_MAIN"
git diff --binary "$CURRENT_MAIN"..HEAD > "$OUT/doctor-who-cycle-007-current-main.diff"
git show --stat --oneline --decorate HEAD > "$OUT/integrated-final-stat.txt"
sha256sum \
  data/review/adapter-sdk/doctor-who-cycle-007-kragar.json \
  scripts/doctor-who-cycle-007.mjs \
  "$OUT/doctor-who-cycle-007-current-main.patch" \
  "$OUT/doctor-who-cycle-007-current-main.bundle" \
  > "$OUT/final-product.sha256"
test -z "$(git status --porcelain)"
