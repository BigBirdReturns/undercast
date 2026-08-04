#!/usr/bin/env bash
set -euo pipefail

base=c340dc710e423a86b2ad3afa3fcf38a2751e8eb7
archive_sha=0bd47b05ae713e7f0acbd9ec1e27bc3e3c170fd4a4b014a18e3e571261bcaac5
path_list_sha=44fd408e77b19c6fec848f17c8521ab5cd44ec8c722ccede3bd1208473b20284
evidence="${EVIDENCE:-${RUNNER_TEMP:-/tmp}/rd-wave03-materialization}"
repo="$(pwd)"
mkdir -p "$evidence"

[[ "${GITHUB_REF_NAME:-}" == main ]]
git cat-file -e "$base^{commit}"
git merge-base --is-ancestor "$base" HEAD
expected_transport_paths=(
  ".github/workflows/rd-wave03-main-push.yml"
  "tmp/rd-wave03-package.part-01"
  "tmp/rd-wave03-package.part-02"
  "tmp/rd-wave03-package.part-03"
  "tmp/rd-wave03-package.part-04"
  "tmp/rd-wave03-package.part-05"
  "tmp/rd-wave03-materialize.sh"
  "tmp/rd-wave03.trigger"
)
mapfile -t transport_delta < <(git diff --name-only "$base" HEAD | LC_ALL=C sort)
mapfile -t expected_transport_paths < <(printf '%s\n' "${expected_transport_paths[@]}" | LC_ALL=C sort)
[[ "$(printf '%s\n' "${transport_delta[@]}")" == "$(printf '%s\n' "${expected_transport_paths[@]}")" ]]

cat tmp/rd-wave03-package.part-* | base64 --decode > "$evidence/package.tar.gz"
[[ "$(sha256sum "$evidence/package.tar.gz" | awk '{print $1}')" == "$archive_sha" ]]
mapfile -t archive_paths < <(tar -tzf "$evidence/package.tar.gz" | LC_ALL=C sort)
[[ "${#archive_paths[@]}" -eq 39 ]]
[[ "$(printf '%s\n' "${archive_paths[@]}" | sha256sum | awk '{print $1}')" == "$path_list_sha" ]]
! printf '%s\n' "${archive_paths[@]}" | grep -Eq '(^/|(^|/)\.\.(/|$))'

payload="$evidence/payload"
mkdir -p "$payload"
tar -xzf "$evidence/package.tar.gz" -C "$payload"

git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
printf 'lane\tbranch\tbase\tcommit\tpath_count\n' > "$evidence/materialization.tsv"

for lid in 01 02 03 04 05 06; do
  lane="RD-$lid"
  compact="rd$lid"
  lower="rd-$lid"
  branch="agent/ssc-${compact}-wave03-intake"
  paths=(
    "data/research/residual-denominator/wave-03/$lower/protocol.json"
    "schema/rd-wave03-${compact}-intake.schema.json"
    "scripts/rd-wave03-${compact}-build.mjs"
    "scripts/rd-wave03-${compact}-validate.mjs"
    "test/rd-wave03-${compact}-adversarial.mjs"
    "docs/research/residual-denominator/wave-03/$lane.md"
  )
  case "$lid" in
    01|05|06) paths+=("data/research/residual-denominator/wave-03/$lower/field-matrix.json") ;;
  esac
  mapfile -t paths < <(printf '%s\n' "${paths[@]}" | LC_ALL=C sort)

  [[ -z "$(git ls-remote --heads origin "refs/heads/$branch")" ]]
  worktree="$evidence/worktree-$compact"
  git worktree add --detach "$worktree" "$base"
  for path in "${paths[@]}"; do
    [[ -f "$payload/$path" ]]
    mkdir -p "$worktree/$(dirname "$path")"
    cp "$payload/$path" "$worktree/$path"
  done
  (
    cd "$worktree"
    mapfile -t status_paths < <(git status --porcelain=v1 --untracked-files=all | cut -c4- | LC_ALL=C sort)
    [[ "$(printf '%s\n' "${status_paths[@]}")" == "$(printf '%s\n' "${paths[@]}")" ]]
    git add -- "${paths[@]}"
    mapfile -t staged < <(git diff --cached --name-only --diff-filter=ACMRTUXB | LC_ALL=C sort)
    [[ "$(printf '%s\n' "${staged[@]}")" == "$(printf '%s\n' "${paths[@]}")" ]]
    git commit --no-verify -m "research: $lane Wave-03 fixed intake package"
    commit="$(git rev-parse HEAD)"
    [[ "$(git show -s --format=%P "$commit")" == "$base" ]]
    mapfile -t changed < <(git diff-tree --no-commit-id --name-only -r "$commit" | LC_ALL=C sort)
    [[ "$(printf '%s\n' "${changed[@]}")" == "$(printf '%s\n' "${paths[@]}")" ]]
    git push "--force-with-lease=refs/heads/$branch:" origin "HEAD:refs/heads/$branch"
    remote="$(git ls-remote --heads origin "refs/heads/$branch" | awk '{print $1}')"
    [[ "$remote" == "$commit" ]]
    printf '%s\t%s\t%s\t%s\t%s\n' "$lane" "$branch" "$base" "$commit" "${#paths[@]}" >> "$evidence/materialization.tsv"
  )
  git worktree remove --force "$worktree"
done

git worktree prune
cat > "$evidence/authority.txt" <<'EOF'
outside_human_dependency=false
external_contacts=0
external_reviews=0
classes_closed=0
evidence_admissions=0
publication_effect=none
adoption_effect=none
graph_effect=none
EOF
cat "$evidence/materialization.tsv"
