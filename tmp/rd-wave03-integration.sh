#!/usr/bin/env bash
set -euo pipefail

lane_base=318e7fd2826511c283e2d81622459fe0bb74e0d2
controller_generation=v2
lanes=(01 02 03 04 05 06)
heads=(
  6899a2d09c8ddd62a62ce22fc59557ea6fddf84b
  134e7811419d20443134fe565bf4cf69af70fa45
  b0700020c4c84e0ec355a76861c9a788b04a89eb
  1db75a178f4da96d22109902e3d5a9ff79a6080f
  6f1e9f6ea6b14753d30161d55c3facc3a466bc66
  9acd031d7bfc3d0f343525e65b17a5140ee46f43
)
counts=(8 7 7 7 8 8)
evidence="${EVIDENCE:-${RUNNER_TEMP:-/tmp}/rd-wave03-integration}"
worktree="${RUNNER_TEMP:-/tmp}/rd-wave03-integration-worktree"
mkdir -p "$evidence"
exec > >(tee "$evidence/integration.log") 2>&1
cleanup() {
  git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  git worktree prune >/dev/null 2>&1 || true
}
trap cleanup EXIT

[[ "${GITHUB_REF_NAME:-}" == main ]]
controller_parent="$(git show -s --format=%P "$GITHUB_SHA")"
[[ -n "$controller_parent" && "$controller_parent" != *" "* ]]
git merge-base --is-ancestor "$lane_base" "$controller_parent"
expected_controller=(
  .github/workflows/rd-wave03-hosted-executor.yml
  tmp/rd-wave03-integration.sh
)
mapfile -t actual_controller < <(git diff --name-only "$controller_parent" "$GITHUB_SHA" | LC_ALL=C sort)
[[ "$(printf '%s\n' "${actual_controller[@]}")" == "$(printf '%s\n' "${expected_controller[@]}")" ]]

rm -rf "$worktree"
git worktree add --detach "$worktree" "$lane_base"
git -C "$worktree" config user.name github-actions[bot]
git -C "$worktree" config user.email 41898282+github-actions[bot]@users.noreply.github.com
all_paths=()
printf 'lane\tbranch\thead\tpaths\n' > "$evidence/heads.tsv"

for i in "${!lanes[@]}"; do
  lane="${lanes[$i]}"
  head="${heads[$i]}"
  count="${counts[$i]}"
  branch="agent/ssc-rd${lane}-wave03-intake"
  protocol="data/research/residual-denominator/wave-03/rd-${lane}/protocol.json"

  git fetch --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  [[ "$(git rev-parse "refs/remotes/origin/$branch")" == "$head" ]]
  [[ "$(git show -s --format=%P "$head")" == "$lane_base" ]]

  changed="$evidence/rd${lane}-changed.txt"
  expected="$evidence/rd${lane}-expected.txt"
  git diff-tree --no-commit-id --name-only -r "$head" | LC_ALL=C sort > "$changed"
  [[ "$(wc -l < "$changed")" -eq "$count" ]]
  git show "$head:$protocol" | node -e '
    let source="";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => source += chunk);
    process.stdin.on("end", () => {
      const protocol = JSON.parse(source);
      process.stdout.write([...protocol.permanent_paths].sort().join("\n") + "\n");
    });
  ' > "$expected"
  diff -u "$expected" "$changed"
  ! grep -Eq '(^|/)(tmp|transport|carrier|materializer|controller|trigger)(/|\.|-|$)' "$changed"

  while IFS= read -r path; do
    mkdir -p "$worktree/$(dirname "$path")"
    git show "$head:$path" > "$worktree/$path"
    all_paths+=("$path")
  done < "$changed"
  printf 'RD-%s\t%s\t%s\t%s\n' "$lane" "$branch" "$head" "$count" >> "$evidence/heads.tsv"
done

mapfile -t all_paths < <(printf '%s\n' "${all_paths[@]}" | LC_ALL=C sort -u)
[[ "${#all_paths[@]}" -eq 45 ]]
mapfile -t status_paths < <(git -C "$worktree" status --porcelain=v1 --untracked-files=all | cut -c4- | LC_ALL=C sort)
[[ "$(printf '%s\n' "${status_paths[@]}")" == "$(printf '%s\n' "${all_paths[@]}")" ]]
git -C "$worktree" add -- "${all_paths[@]}"
git -C "$worktree" commit --no-verify -m 'temporary RD-W03 six-lane integration proof'
integration_commit="$(git -C "$worktree" rev-parse HEAD)"
[[ "$(git -C "$worktree" show -s --format=%P "$integration_commit")" == "$lane_base" ]]
mapfile -t committed < <(git -C "$worktree" diff-tree --no-commit-id --name-only -r "$integration_commit" | LC_ALL=C sort)
[[ "$(printf '%s\n' "${committed[@]}")" == "$(printf '%s\n' "${all_paths[@]}")" ]]

git show "$GITHUB_SHA:.github/workflows/rd-wave03-hosted-executor.yml" > "$evidence/rd-wave03-hosted-executor.yml"

cd "$worktree"
actionlint_archive="$evidence/actionlint_1.7.12_linux_amd64.tar.gz"
curl --proto '=https' --tlsv1.2 -fsSL \
  'https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz' \
  -o "$actionlint_archive"
echo '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  '"$actionlint_archive" | sha256sum -c -
tar -xzf "$actionlint_archive" -C "$evidence" actionlint
"$evidence/actionlint" -shellcheck= "$evidence/rd-wave03-hosted-executor.yml" .github/workflows/rd-wave03-rd*-intake.yml
for i in "${!lanes[@]}"; do
  lane="${lanes[$i]}"
  head="${heads[$i]}"
  lane_out="$evidence/rd${lane}"
  node --check "scripts/rd-wave03-rd${lane}-build.mjs"
  node --check "scripts/rd-wave03-rd${lane}-validate.mjs"
  node --check "test/rd-wave03-rd${lane}-adversarial.mjs"
  node "scripts/rd-wave03-rd${lane}-validate.mjs"
  node "scripts/rd-wave03-rd${lane}-build.mjs" --check
  node "test/rd-wave03-rd${lane}-adversarial.mjs"
  GITHUB_SHA="$head" node "scripts/rd-wave03-rd${lane}-build.mjs" --execute --out "$lane_out"
  node "scripts/rd-wave03-rd${lane}-build.mjs" --verify-receipt "$lane_out/receipt.json"
done
npm ci
npx playwright install --with-deps chromium
npm run gate
[[ -z "$(git status --porcelain=v1 --untracked-files=all)" ]]

cat > "$evidence/integration-receipt.json" <<EOF
{
  "lane_base": "$lane_base",
  "controller_parent": "$controller_parent",
  "controller_generation": "$controller_generation",
  "controller_sha": "$GITHUB_SHA",
  "integration_commit": "$integration_commit",
  "path_count": 45,
  "frozen_units": 101,
  "required_cells": 959,
  "fixed_routes": 710,
  "adversarial_refusals": 267,
  "no_magic_human": "passed",
  "complete_release_gate": "passed",
  "worktree_clean": true,
  "external_contacts": 0,
  "external_reviews": 0,
  "outside_human_dependency": false,
  "classes_closed": 0,
  "evidence_admissions": 0,
  "publication_effect": "none",
  "adoption_effect": "none",
  "graph_effect": "none"
}
EOF
cat "$evidence/integration-receipt.json"
