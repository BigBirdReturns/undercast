#!/usr/bin/env bash
set -euo pipefail
node "$FINALIZER" 2>&1 | tee /tmp/doctor-who-cycle-005-finalize.log
npm run doctor-who:cycle-005:check
npm run doctor-who:cycle-004:check
npm run doctor-who:cycle-003:check
npm run doctor-who:cycle-002:check
npm run doctor-who:pilot-cycle:check
npm run doctor-who:correction-drill:check
npm run star-trek:enwright-cycle:check
node scripts/autopilot.mjs validate
node scripts/media-audit.mjs gate --scope doctor-who
node scripts/waterline.mjs validate --scope doctor-who
