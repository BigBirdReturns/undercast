#!/usr/bin/env bash
set -Eeuo pipefail
cat .github/recovery/star-trek-maryl-cycle-v1/part-*.mjs > /tmp/star-trek-maryl-cycle-v1.mjs
sha256sum -c .github/recovery/star-trek-maryl-cycle-v1/helper.sha256
node --check /tmp/star-trek-maryl-cycle-v1.mjs
