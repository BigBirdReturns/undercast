#!/usr/bin/env bash
set -euo pipefail
cd "$WORKTREE"
set -euo pipefail
npm ci
npx playwright install --with-deps chromium
