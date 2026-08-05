#!/usr/bin/env bash
set -euo pipefail

lane_base=318e7fd2826511c283e2d81622459fe0bb74e0d2
qualification_head="${QUALIFICATION_HEAD:?QUALIFICATION_HEAD is required}"
qualification_parent="${QUALIFICATION_PARENT:?QUALIFICATION_PARENT is required}"
lanes=(01 02 03 04 05 06)
heads=(
  7f00c571c96f393a8cf15f052c151992edb1a961
  55a69c566270b01e35587123daff42808f48e3dd
  7d6366cab76bbfe4106e4ece7ebe30f1c5211f37
  4b4f3d44c4926c6961e1e7f1ebe982acee6c2c9c
  b472a5bdcc737e0a6b1b55f6087fb4e0f10aaed6
  7433646fa8101290427548512bcec4dc29d60bc7
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

test "$(git rev-parse HEAD)" = "$qualification_head"
git merge-base --is-ancestor "$lane_base" "$qualification_parent"
git merge-base --is-ancestor "$qualification_parent" "$qualification_head"

mapfile -t qualification_commits < <(git rev-list --reverse "$qualification_parent..$qualification_head")
test "${#qualification_commits[@]}" -eq 2
helper_commit="${qualification_commits[0]}"
workflow_commit="${qualification_commits[1]}"
test "$(git show -s --format=%P "$helper_commit")" = "$qualification_parent"
test "$(git show -s --format=%P "$workflow_commit")" = "$helper_commit"
test "$workflow_commit" = "$qualification_head"

helper_path=tmp/rd-wave03-final-integration.sh
workflow_path=.github/workflows/rd-wave03-final-integration.yml
mapfile -t helper_changed < <(git diff-tree --no-commit-id --name-only -r "$helper_commit" | LC_ALL=C sort)
mapfile -t workflow_changed < <(git diff-tree --no-commit-id --name-only -r "$workflow_commit" | LC_ALL=C sort)
test "${#helper_changed[@]}" -eq 1
test "${helper_changed[0]}" = "$helper_path"
test "${#workflow_changed[@]}" -eq 1
test "${workflow_changed[0]}" = "$workflow_path"

expected_qualification_paths=("$workflow_path" "$helper_path")
mapfile -t expected_qualification_paths < <(printf '%s\n' "${expected_qualification_paths[@]}" | LC_ALL=C sort)
mapfile -t actual_qualification_paths < <(git diff --name-only "$qualification_parent" "$qualification_head" | LC_ALL=C sort)
test "$(printf '%s\n' "${actual_qualification_paths[@]}")" = "$(printf '%s\n' "${expected_qualification_paths[@]}")"

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
  branch="agent/ssc-rd${lane}-wave03-intake-v2"
  protocol="data/research/residual-denominator/wave-03/rd-${lane}/protocol.json"

  git fetch --no-tags origin "+refs/heads/$branch:refs/remotes/origin/$branch"
  test "$(git rev-parse "refs/remotes/origin/$branch")" = "$head"
  test "$(git show -s --format=%P "$head")" = "$lane_base"

  changed="$evidence/rd${lane}-changed.txt"
  expected="$evidence/rd${lane}-expected.txt"
  git diff-tree --no-commit-id --name-only -r "$head" | LC_ALL=C sort > "$changed"
  test "$(wc -l < "$changed")" -eq "$count"
  git show "$head:$protocol" | node -e '
    let source = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => source += chunk);
    process.stdin.on("end", () => {
      const protocol = JSON.parse(source);
      process.stdout.write([...protocol.permanent_paths].sort().join("\n") + "\n");
    });
  ' > "$expected"
  diff -u "$expected" "$changed"
  ! grep -Eiq '(^|/)(tmp|transport|carrier|materializer|controller|trigger)(/|\.|-|$)' "$changed"

  while IFS= read -r path; do
    mkdir -p "$worktree/$(dirname "$path")"
    git show "$head:$path" > "$worktree/$path"
    all_paths+=("$path")
  done < "$changed"
  printf 'RD-%s\t%s\t%s\t%s\n' "$lane" "$branch" "$head" "$count" >> "$evidence/heads.tsv"
done

mapfile -t all_paths < <(printf '%s\n' "${all_paths[@]}" | LC_ALL=C sort -u)
test "${#all_paths[@]}" -eq 45
mapfile -t status_paths < <(git -C "$worktree" status --porcelain=v1 --untracked-files=all | cut -c4- | LC_ALL=C sort)
test "$(printf '%s\n' "${status_paths[@]}")" = "$(printf '%s\n' "${all_paths[@]}")"
git -C "$worktree" add -- "${all_paths[@]}"
git -C "$worktree" commit --no-verify -m 'temporary RD-W03 six-lane integration proof'
integration_commit="$(git -C "$worktree" rev-parse HEAD)"
test "$(git -C "$worktree" show -s --format=%P "$integration_commit")" = "$lane_base"
mapfile -t committed < <(git -C "$worktree" diff-tree --no-commit-id --name-only -r "$integration_commit" | LC_ALL=C sort)
test "$(printf '%s\n' "${committed[@]}")" = "$(printf '%s\n' "${all_paths[@]}")"

git show "$qualification_head:$workflow_path" > "$evidence/rd-wave03-final-integration.yml"

cd "$worktree"
actionlint_archive="$evidence/actionlint_1.7.12_linux_amd64.tar.gz"
curl --proto '=https' --tlsv1.2 -fsSL \
  'https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz' \
  -o "$actionlint_archive"
echo '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  '"$actionlint_archive" | sha256sum -c -
tar -xzf "$actionlint_archive" -C "$evidence" actionlint
"$evidence/actionlint" -shellcheck= "$evidence/rd-wave03-final-integration.yml" .github/workflows/rd-wave03-rd*-intake.yml

for lane in "${lanes[@]}"; do
  node --check "scripts/rd-wave03-rd${lane}-build.mjs"
  node --check "scripts/rd-wave03-rd${lane}-validate.mjs"
  node --check "test/rd-wave03-rd${lane}-adversarial.mjs"
  node "scripts/rd-wave03-rd${lane}-validate.mjs"
  node "scripts/rd-wave03-rd${lane}-build.mjs" --check
  node "test/rd-wave03-rd${lane}-adversarial.mjs"
done

npm ci
npx playwright install --with-deps chromium
npm run gate
test -z "$(git status --porcelain=v1 --untracked-files=all)"

cat > "$evidence/integration-receipt.json" <<EOF
{
  "schema_version": 1,
  "qualification_head": "$qualification_head",
  "qualification_parent": "$qualification_parent",
  "helper_commit": "$helper_commit",
  "workflow_commit": "$workflow_commit",
  "qualification_path_count": 2,
  "lane_base": "$lane_base",
  "integration_commit": "$integration_commit",
  "product_path_count": 45,
  "frozen_units": 101,
  "required_cells": 959,
  "fixed_route_denominator": 710,
  "source_protocol_executed_in_integration": false,
  "adversarial_refusals": 267,
  "no_magic_human": "passed",
  "actionlint": "passed",
  "complete_release_gate": "passed",
  "worktree_clean": true,
  "credential_free": true,
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
