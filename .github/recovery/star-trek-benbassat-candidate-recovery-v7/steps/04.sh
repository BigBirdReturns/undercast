#!/usr/bin/env bash
set -Eeuo pipefail
npm run credits | tee "$OUT/credits.log"
npm run sync:sources | tee "$OUT/sources-sync-after.log"
python3 "$LIFECYCLE" stamp-sources
npm run media:audit -- sync --scope star-trek | tee "$OUT/media-sync-after.log"
npm run media:audit -- gate --scope star-trek | tee "$OUT/media-gate-after.log"
node scripts/census.mjs | tee "$OUT/census.log"
npm run build:ferengi | tee "$OUT/build-ferengi.log"
npm run build:species | tee "$OUT/build-species.log"
npm run build:changelings | tee "$OUT/build-changelings.log"
node scripts/shard.mjs | tee "$OUT/shard.log"
npm run build:contract | tee "$OUT/build-contract.log"
npm run build:site | tee "$OUT/build-site.log"
python3 "$LIFECYCLE" receipt
npm run adapter:write | tee "$OUT/adapter-write.log"
node scripts/validate.mjs | tee "$OUT/repository-validate.log"
node scripts/thesis-rails.mjs validate | tee "$OUT/thesis-validate.log"
node scripts/thesis-rails.mjs next --json > "$OUT/thesis-next.json"
npm run autopilot:fixtures | tee "$OUT/autopilot-fixtures.log"

jq -e --arg task "$TASK_ID" --arg wall "$WALL_ID" --arg lease "$EXPECTED_LEASE" \
  '.transaction == "STAR-TREK-BENBASSAT-CANDIDATE-V3"
   and .status == "candidate-ready-for-independent-review"
   and .task.id == $task and .task.lease_id == $lease
   and .task.status == "resolved" and .task.wall_ids == [$wall]
   and .queue.resolved == 429 and .queue.in_flight == 0
   and .source_review.production == "Star Trek: Picard"
   and .source_review.episode == "Võx"
   and .source_review.performance_mode == "voice-only"
   and .publication_base.commit == env.LIVE_MAIN
   and .publication_base.tree == env.LIVE_TREE
   and .publication_base.kind == "product-neutral-media-search-maintenance"
   and .media.facets.still.status == "absent"
   and .media.facets.portrait.status == "absent"
   and .boundary.off_screen_voiceover == true
   and .boundary.physical_prosthetic_hint_accepted == false
   and .boundary.physical_performance_attributed == false
   and .boundary.prosthetic_performance_attributed == false
   and .boundary.animation_performance_attributed == false
   and .boundary.maker_attribution == "unresolved"
   and .boundary.honest_media_absence == true
   and .boundary.canonical_mutation == false
   and .boundary.additional_lease_issued == false' \
  "$OUT/candidate-receipt.json" >/dev/null

gh api "/repos/${GITHUB_REPOSITORY}/branches/main" > "$OUT/main-after.json"
test "$(jq -r .commit.sha "$OUT/main-after.json")" = "$LIVE_MAIN"
git diff --check

