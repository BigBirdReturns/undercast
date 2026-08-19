#!/usr/bin/env bash
set -euo pipefail

test -s /tmp/generalize-doohan-builder-v3.py
cp /tmp/generalize-doohan-builder-v3.py /tmp/generalize-doohan-builder-v1.py
chmod +x /tmp/kukulkan-probe-prep-v3.sh
exec /tmp/kukulkan-probe-prep-v3.sh
