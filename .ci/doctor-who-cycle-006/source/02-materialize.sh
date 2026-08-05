#!/usr/bin/env bash
set -euo pipefail
node "$MATERIALIZER" 2>&1 | tee /tmp/doctor-who-cycle-005-materialize.log
test -s "$CYCLE_CONTEXT"

readarray -t custody < <(node --input-type=module <<'NODE'
import fs from 'node:fs';
const context = JSON.parse(fs.readFileSync(process.env.CYCLE_CONTEXT, 'utf8'));
console.log(context.canonical.wall_id);
console.log(context.media.still_src);
console.log(context.media.still_sha256);
console.log(context.media.verification.artifact_sha256);
console.log(context.timestamps.source_fetched_at);
console.log(context.task.adjudicated_performance_mode);
NODE
)
wall_id="${custody[0]}"
still_path="${custody[1]}"
still_sha256="${custody[2]}"
verification_artifact_sha256="${custody[3]}"
source_fetched_at="${custody[4]}"
adjudicated_mode="${custody[5]}"
test "$wall_id" = "UC-1350"
test "$still_path" = "images/uc-1350-still.jpg"
test "$still_sha256" = "ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad"
test "$verification_artifact_sha256" = "36e441d5b56a8e0bff8d3932426e29c2f49d747d3bc4834917729a8fe1f34c4a"
test "$adjudicated_mode" = "voice"
[[ "$source_fetched_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
test -f "$still_path"
test "$(sha256sum "$still_path" | awk '{print $1}')" = "$still_sha256"
identify -format '%w %h\n' "$still_path" | tee /tmp/doctor-who-cycle-005-still-dimensions.txt
test "$(cat /tmp/doctor-who-cycle-005-still-dimensions.txt)" = "640 373"
cp "$still_path" /tmp/doctor-who-cycle-005-still.jpg
cp "$CYCLE_ASSET_DIR/kaarsh-still-verification.json" /tmp/doctor-who-cycle-005-still-verification.json
sha256sum "$still_path" > /tmp/doctor-who-cycle-005-still.sha256
printf '%s\n' "$still_path" > /tmp/doctor-who-cycle-005-still-path.txt
printf '%s\n' "$wall_id" > /tmp/doctor-who-cycle-005-wall-id.txt
printf '%s\n' "$source_fetched_at" > /tmp/doctor-who-cycle-005-source-fetched-at.txt
echo "STILL_PATH=$still_path" >> "$GITHUB_ENV"
echo "STILL_SHA256=$still_sha256" >> "$GITHUB_ENV"
echo "WALL_ID=$wall_id" >> "$GITHUB_ENV"

node scripts/autopilot.mjs validate
node scripts/media-audit.mjs gate --scope doctor-who
node scripts/waterline.mjs validate --scope doctor-who
npm run doctor-who:pilot-cycle:check
npm run doctor-who:correction-drill:check
npm run doctor-who:cycle-002:check
npm run doctor-who:cycle-003:check
CYCLE004_STILL_COMPOSABILITY_CANDIDATE=1 npm run doctor-who:cycle-004:check
npm run star-trek:enwright-cycle:check
echo "wall_id=$wall_id" >> "$GITHUB_STEP_SUMMARY"
echo "still_sha256=$still_sha256" >> "$GITHUB_STEP_SUMMARY"
echo "adjudicated_mode=$adjudicated_mode" >> "$GITHUB_STEP_SUMMARY"
