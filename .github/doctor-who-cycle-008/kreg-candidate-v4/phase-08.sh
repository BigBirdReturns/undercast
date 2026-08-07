#!/usr/bin/env bash
set -euo pipefail
cd "$WORKTREE"
set -euo pipefail
test -z "$(git status --porcelain)"
npm run gate 2>&1 | tee "$OUT/complete-gate.log"
test -z "$(git status --porcelain)"
git diff --check HEAD^
