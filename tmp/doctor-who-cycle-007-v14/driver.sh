#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/01-bind.sh"
source "$SCRIPT_DIR/02-replay.sh"
source "$SCRIPT_DIR/03-integrate.sh"
source "$SCRIPT_DIR/04-handoff.sh"
