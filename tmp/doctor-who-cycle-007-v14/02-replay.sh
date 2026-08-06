# Reconstruct the reviewed candidate while injecting only the already-reviewed random lease ID.
FINALIZER_RUN_ID="$GITHUB_RUN_ID"
git worktree add --detach "$REPLAY" "$REVIEWED_MAIN"
cd "$REPLAY"
git checkout -B agent/doctor-who-cycle-007-exact-replay-v14 "$REVIEWED_MAIN"
npm ci
export EXACT_MAIN="$REVIEWED_MAIN"
export AUTHORIZED_HEAD="$ORIGINAL_CARRIER_HEAD"
export AUTOPILOT_FIXED_LEASE_ID="$REVIEWED_LEASE_ID"
export GITHUB_RUN_ID="$CANDIDATE_RUN"

node --input-type=module <<'NODE'
import fs from 'node:fs';
const path = 'scripts/lib/autopilot-actions.mjs';
let source = fs.readFileSync(path, 'utf8');
const before = 'function makeLeaseId(agent, now) {\n  return `lease_${sha256(`${agent}|${now}|${randomBytes(16).toString("hex")}`).slice(0, 24)}`;\n}';
const after = 'function makeLeaseId(agent, now) {\n  const fixed = process.env.AUTOPILOT_FIXED_LEASE_ID || "";\n  if (fixed) {\n    if (!/^lease_[0-9a-f]{24}$/.test(fixed)) throw new Error("AUTOPILOT_FIXED_LEASE_ID is invalid");\n    return fixed;\n  }\n  return `lease_${sha256(`${agent}|${now}|${randomBytes(16).toString("hex")}`).slice(0, 24)}`;\n}';
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`lease generator anchor cardinality drifted: ${count}`);
source = source.replace(before, after);
fs.writeFileSync(path, source);
NODE
node --check scripts/lib/autopilot-actions.mjs
bash "$CYCLE_ASSET_DIR/01-prepare.sh"
bash "$CYCLE_ASSET_DIR/02-materialize.sh"
git checkout -- scripts/lib/autopilot-actions.mjs
unset AUTOPILOT_FIXED_LEASE_ID
export GITHUB_RUN_ID="$FINALIZER_RUN_ID"
cmp "$CYCLE_CONTEXT" "$DIAGNOSTICS_ROOT/context.json"

cp "$DIAGNOSTICS_ROOT/expected-candidate-paths.txt" "$OUT/expected-candidate-paths.txt"
{ git diff --name-only; git ls-files --others --exclude-standard; } | LC_ALL=C sort > "$OUT/replay-candidate-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/replay-candidate-paths.txt"
git add --pathspec-from-file="$OUT/expected-candidate-paths.txt"
git diff --cached --name-only | LC_ALL=C sort > "$OUT/replay-staged-paths.txt"
diff -u "$OUT/expected-candidate-paths.txt" "$OUT/replay-staged-paths.txt"
test -z "$(git diff --name-only)"
test -z "$(git ls-files --others --exclude-standard)"
git ls-files -s --stage | awk 'NR==FNR{wanted[$0]=1;next} {for (path in wanted) if ($0 ~ ("\\t" path "$") ) print}' \
  "$OUT/expected-candidate-paths.txt" - > "$OUT/replay-index.tsv"

replay_tree="$(git write-tree)"
printf '%s\n' "$replay_tree" > "$OUT/replay-tree.txt"
test "$replay_tree" = "$REVIEWED_CANDIDATE_TREE"
export GIT_AUTHOR_NAME='github-actions[bot]'
export GIT_AUTHOR_EMAIL='41898282+github-actions[bot]@users.noreply.github.com'
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
export GIT_AUTHOR_DATE='1785975531 +0000'
export GIT_COMMITTER_DATE='1785975531 +0000'
replay_commit="$(printf '%s\n' 'Doctor Who: stage cycle 007 Kragar candidate' | git commit-tree "$replay_tree" -p "$REVIEWED_MAIN")"
printf '%s\n' "$replay_commit" > "$OUT/replay-commit.txt"
test "$replay_commit" = "$REVIEWED_CANDIDATE_COMMIT"
git reset --hard "$replay_commit"
test "$(git rev-parse HEAD)" = "$REVIEWED_CANDIDATE_COMMIT"
test "$(git rev-parse 'HEAD^{tree}')" = "$REVIEWED_CANDIDATE_TREE"
test -z "$(git status --porcelain)"
git diff --binary "$REVIEWED_MAIN"..HEAD > "$OUT/reviewed-candidate.diff"
git bundle create "$OUT/reviewed-candidate.bundle" HEAD "^$REVIEWED_MAIN"
git cat-file -p HEAD > "$OUT/reviewed-candidate-commit-object.txt"
