#!/usr/bin/env bash
set -euo pipefail
set -euo pipefail
git fetch --no-tags --filter=blob:none origin "+refs/heads/main:refs/remotes/origin/main"
test "$(git rev-parse refs/remotes/origin/main)" = "$PR_BASE_SHA"
test -z "$(git status --porcelain)"
