#!/usr/bin/env bash
set -Eeuo pipefail
label="${1:?usage: census-refresh.sh LABEL live-first|project-only}"
strategy="${2:?usage: census-refresh.sh LABEL live-first|project-only}"
: "${OUT:?OUT required}"; : "${TASK_ID:?TASK_ID required}"; : "${WALL_ID:?WALL_ID required}"; : "${EXPECTED_PERFORMER:?EXPECTED_PERFORMER required}"; : "${EXPECTED_CHARACTER:?EXPECTED_CHARACTER required}"
max_attempts="${CENSUS_MAX_ATTEMPTS:-3}"; delay_seconds="${CENSUS_RETRY_DELAY_SECONDS:-12}"
receipt="$OUT/${label}-census-refresh.json"; attempts_jsonl="$OUT/${label}-census-attempts.jsonl"; before="$OUT/${label}-census-source-before.sha256"; after="$OUT/${label}-census-source-after.sha256"
: > "$attempts_jsonl"
source_files=(data/CENSUS.json data/CENSUS-UNRESOLVED.json data/CENSUS-MANIFEST.json)
for path in "${source_files[@]}"; do test -f "$path"; done
sha256sum "${source_files[@]}" > "$before"
append_attempt(){ python3 - "$attempts_jsonl" "$1" "$2" "$3" "$4" "$5" "$6" <<'PY'
from pathlib import Path
import json,sys
row={'attempt':int(sys.argv[2]),'exit_code':int(sys.argv[3]),'log':sys.argv[4],'classification':sys.argv[5],'started_at':sys.argv[6],'ended_at':sys.argv[7]}
with Path(sys.argv[1]).open('a',encoding='utf-8') as f:f.write(json.dumps(row,sort_keys=True)+'\n')
PY
}
unchanged(){ sha256sum -c "$before" >/dev/null; }
live_success=false; fallback=false; mode=''
if test "$strategy" = live-first; then
  for attempt in $(seq 1 "$max_attempts"); do
    log="$OUT/${label}-census-live-attempt-${attempt}.log"; started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    set +e; node scripts/census.mjs star-trek 2>&1 | tee "$log"; code="${PIPESTATUS[0]}"; set -e
    ended="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if test "$code" = 0; then append_attempt "$attempt" "$code" "$(basename "$log")" live-refresh-success "$started" "$ended"; cp "$log" "$OUT/${label}-census.log"; live_success=true; mode=live-refresh; break; fi
    if grep -Eq 'returned no pages; refusing to publish a false zero|census source unavailable after 3 attempts|fetch failed|AbortError|TimeoutError|ETIMEDOUT|ECONNRESET|HTTPError' "$log"; then class=recognized-source-unavailability; else class=unrecognized-census-failure; fi
    append_attempt "$attempt" "$code" "$(basename "$log")" "$class" "$started" "$ended"
    test "$class" = recognized-source-unavailability || { echo 'non-source census failure' >&2; exit "$code"; }
    unchanged
    if test "$attempt" -lt "$max_attempts"; then sleep "$((attempt * delay_seconds))"; fi
  done
  if test "$live_success" != true; then fallback=true; mode=frozen-project-only; fi
elif test "$strategy" = project-only; then fallback=true; mode=project-only
else echo "unknown census strategy: $strategy" >&2; exit 2; fi
if test "$fallback" = true; then log="$OUT/${label}-census-project-only.log"; node scripts/census.mjs --project-only 2>&1 | tee "$log"; cp "$log" "$OUT/${label}-census.log"; unchanged; fi
sha256sum "${source_files[@]}" > "$after"
export CENSUS_LABEL="$label"
node - <<'NODE'
const fs=require('fs');const rows=JSON.parse(fs.readFileSync('data/CENSUS-COVERAGE.json','utf8')).filter(r=>r.performer===process.env.EXPECTED_PERFORMER&&r.character===process.env.EXPECTED_CHARACTER);if(rows.length!==1)throw Error(`coverage cardinality ${rows.length}`);const row=rows[0];if(row.role_on_wall!==true||JSON.stringify(row.wall_ids)!==JSON.stringify([process.env.WALL_ID]))throw Error(`coverage drift ${JSON.stringify(row)}`);fs.writeFileSync(`${process.env.OUT}/${process.env.CENSUS_LABEL}-census-coverage.json`,JSON.stringify(row,null,2)+'\n');
NODE
export CENSUS_MODE="$mode" CENSUS_STRATEGY="$strategy" CENSUS_LIVE_SUCCESS="$live_success" CENSUS_FALLBACK="$fallback" CENSUS_ATTEMPTS_JSONL="$attempts_jsonl" CENSUS_SOURCE_BEFORE="$before" CENSUS_SOURCE_AFTER="$after" CENSUS_RECEIPT="$receipt"
python3 - <<'PY'
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json,os
out=Path(os.environ['OUT']);label=os.environ['CENSUS_LABEL']
def hashes(path):
 r={}
 for line in Path(path).read_text().splitlines():
  d,n=line.split(None,1);r[n.strip()]=d
 return r
attempts=[json.loads(x) for x in Path(os.environ['CENSUS_ATTEMPTS_JSONL']).read_text().splitlines() if x.strip()];before=hashes(os.environ['CENSUS_SOURCE_BEFORE']);after=hashes(os.environ['CENSUS_SOURCE_AFTER']);mode=os.environ['CENSUS_MODE']
r={'version':1,'transaction':'STAR-TREK-BENBASSAT-CENSUS-REFRESH-V1','label':label,'completed_at':datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z'),'success':True,'strategy':os.environ['CENSUS_STRATEGY'],'mode':mode,'live_refresh_succeeded':os.environ['CENSUS_LIVE_SUCCESS']=='true','fallback_used':os.environ['CENSUS_FALLBACK']=='true','fallback_reason':'recognized-source-unavailability' if mode=='frozen-project-only' else None,'attempts':attempts,'source_snapshot_before':before,'source_snapshot_after':after,'source_snapshot_unchanged':before==after,'coverage':json.loads((out/f'{label}-census-coverage.json').read_text()),'task_id':os.environ['TASK_ID'],'wall_id':os.environ['WALL_ID'],'canonical_mutation':False,'lease_mutation':False};r['receipt_sha256']=hashlib.sha256(json.dumps(r,sort_keys=True,separators=(',',':')).encode()).hexdigest();Path(os.environ['CENSUS_RECEIPT']).write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n')
PY
jq -e --arg task "$TASK_ID" --arg wall "$WALL_ID" '.success==true and .task_id==$task and .wall_id==$wall and .coverage.role_on_wall==true and .coverage.wall_ids==[$wall] and .canonical_mutation==false and .lease_mutation==false and (.mode=="live-refresh" or (.mode=="frozen-project-only" and .fallback_reason=="recognized-source-unavailability" and .source_snapshot_unchanged==true) or (.mode=="project-only" and .source_snapshot_unchanged==true))' "$receipt" >/dev/null
