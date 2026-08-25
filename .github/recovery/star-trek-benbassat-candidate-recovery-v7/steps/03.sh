#!/usr/bin/env bash
set -Eeuo pipefail
npm run sync:sources | tee "$OUT/sources-sync.log"
python3 "$LIFECYCLE" stamp-sources
npm run media:audit -- sync --scope star-trek | tee "$OUT/media-sync.log"
npm run media:audit -- gate --scope star-trek | tee "$OUT/media-gate-before-complete.log"

npm run credits | tee "$OUT/precomplete-credits.log"
node scripts/census.mjs | tee "$OUT/precomplete-census.log"
npm run build:ferengi | tee "$OUT/precomplete-build-ferengi.log"
npm run build:species | tee "$OUT/precomplete-build-species.log"
npm run build:changelings | tee "$OUT/precomplete-build-changelings.log"
node scripts/shard.mjs | tee "$OUT/precomplete-shard.log"
npm run build:contract | tee "$OUT/precomplete-build-contract.log"
npm run build:site | tee "$OUT/precomplete-build-site.log"
node scripts/validate.mjs | tee "$OUT/precomplete-validate.log"

command="node scripts/autopilot.mjs complete --input '$OUT/media-review.json'"
printf '%s\n' "$command" > "$OUT/complete-command.txt"
bash -lc "$command" | tee "$OUT/complete.log"
node - <<'NODE'
const fs=require('fs'); const state=JSON.parse(fs.readFileSync('data/AUTOPILOT.json')); const trek=state.jobs.filter(x=>x.scope==='star-trek'); const task=trek.find(x=>x.id===process.env.TASK_ID); const counts={total:trek.length,queued:trek.filter(x=>x.status==='queued').length,resolved:trek.filter(x=>x.status==='resolved').length,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length}; if(!task||task.status!=='resolved'||JSON.stringify(task.wall_ids)!=='["UC-1397"]'||task.outcome?.kind!=='audited-wall'||task.lease!=null||task.outcome?.media_review?.lease_id!==process.env.EXPECTED_LEASE) throw Error('post-merge media review did not preserve the originating Benbassat lease receipt'); if(JSON.stringify(counts)!==JSON.stringify({total:2228,queued:1797,resolved:429,blocked:0,rejected:2,in_flight:0})) throw Error('resolved queue drifted: '+JSON.stringify(counts)); fs.writeFileSync(process.env.OUT+'/resolved-state.json',JSON.stringify({task,counts},null,2)+'\n');
NODE

