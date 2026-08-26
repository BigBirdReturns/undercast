#!/usr/bin/env bash
set -Eeuo pipefail
python3 "$LIFECYCLE" prepare
command="node scripts/autopilot.mjs submit --batch '$BATCH' --input '$OUT/results.json'"
printf '%s\n' "$command" > "$OUT/submit-command.txt"
bash -lc "$command" | tee "$OUT/submit.log"
node - <<'NODE'
const fs=require('fs'); const state=JSON.parse(fs.readFileSync('data/AUTOPILOT.json')); const task=state.jobs.find(x=>x.id===process.env.TASK_ID); const drafts=JSON.parse(fs.readFileSync('data/drafts.json')); fs.writeFileSync(process.env.OUT+'/post-submit-state.json',JSON.stringify({task,drafts},null,2)+'\n'); if(!task||task.status!=='drafted'||task.lease!=null||task.outcome?.lease_id!==process.env.EXPECTED_LEASE) throw Error('native submit did not persist the originating Benbassat lease in the draft outcome'); if(drafts.length!==1||drafts[0]?._autopilot?.task_id!==process.env.TASK_ID||drafts[0]?._autopilot?.lease_id!==process.env.EXPECTED_LEASE) throw Error('bounded draft ledger mismatch');
NODE

command="node scripts/grow.mjs --drafts"
printf '%s\n' "$command" > "$OUT/grow-command.txt"
bash -lc "$command" | tee "$OUT/grow.log"
node - <<'NODE'
const fs=require('fs'); const specimens=JSON.parse(fs.readFileSync('data/specimens.json')); const drafts=JSON.parse(fs.readFileSync('data/drafts.json')); const rows=specimens.filter(x=>x.id===process.env.WALL_ID); fs.writeFileSync(process.env.OUT+'/post-grow-state.json',JSON.stringify({rows,drafts},null,2)+'\n'); if(rows.length!==1||rows[0].actor!==process.env.EXPECTED_PERFORMER||rows[0].character!==process.env.EXPECTED_CHARACTER||rows[0].production!=='Võx'||rows[0].years!=='2023'||rows[0].kind!=='voice') throw Error('grow did not create the corrected Benbassat episode record'); if('still' in rows[0]||'portrait' in rows[0]) throw Error('grow violated honest media absence'); if(drafts.length!==0) throw Error('grow did not consume the bounded draft');
NODE

command="node scripts/autopilot.mjs sync --scope star-trek"
printf '%s\n' "$command" > "$OUT/sync-command.txt"
bash -lc "$command" | tee "$OUT/autopilot-sync.log"
node - <<'NODE'
const fs=require('fs'); const state=JSON.parse(fs.readFileSync('data/AUTOPILOT.json')); const task=state.jobs.find(x=>x.id===process.env.TASK_ID); fs.writeFileSync(process.env.OUT+'/post-sync-state.json',JSON.stringify({task},null,2)+'\n'); if(!task||task.status!=='merged'||JSON.stringify(task.wall_ids)!=='["UC-1397"]'||task.lease!=null||task.outcome?.lease_id!==process.env.EXPECTED_LEASE) throw Error('Benbassat did not reconcile to merged under the original outcome lease');
NODE
python3 "$LIFECYCLE" postgrow
