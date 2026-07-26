#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT=process.env.OUT||'/tmp/card-backfill-next-selection';
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const idNum=id=>Number(String(id||'').match(/\d+/)?.[0]||Number.MAX_SAFE_INTEGER);
const [audit,specimens]=await Promise.all([readJson('data/MEDIA-AUDIT.json'),readJson('data/specimens.json')]);
const specimenById=new Map(specimens.map(row=>[row.id,row]));
const completed=new Set();
try{for(const entry of await readdir('data/review/card-backfill',{withFileTypes:true})){if(!entry.isDirectory())continue;try{const review=await readJson(join('data/review/card-backfill',entry.name,'review.json'));const id=review?.record_id||review?.id;if(id)completed.add(id)}catch{}}}catch{}
const rows=[];
for(const item of audit.items||[]){if(item.scope!=='sitewide'||item.status!=='absent'||!['still','portrait'].includes(item.side)||completed.has(item.wall_id))continue;const record=specimenById.get(item.wall_id);if(!record)continue;rows.push({wall_id:item.wall_id,side:item.side,audit_id:item.id,actor:record.actor,character:record.character,production:record.production,universe:record.universe,years:record.years||'',canonical_link:record.link||'',expected_subject:item.expected_subject,source_fetched_at:item.source_fetched_at||null,risk_codes:item.risk_codes||[],references:record.references||[],current_asset:record[item.side]||null})}
rows.sort((a,b)=>idNum(a.wall_id)-idNum(b.wall_id)||(a.side===b.side?0:a.side==='still'?-1:1)||a.wall_id.localeCompare(b.wall_id));
if(!rows.length)throw new Error('No remaining sitewide absent card obligations found');
const queue=rows.slice(0,40),selected=queue[0];
await mkdir(OUT,{recursive:true});
await writeFile(join(OUT,'queue.json'),JSON.stringify({generated_at:new Date().toISOString(),completed_evidence_ids:[...completed].sort(),total_open_absent:rows.length,selected,queue},null,2)+'\n');
await writeFile(join(OUT,'selected.json'),JSON.stringify(selected,null,2)+'\n');
await writeFile(join(OUT,'summary.txt'),[`selected=${selected.wall_id}:${selected.side}`,`actor=${selected.actor}`,`character=${selected.character}`,`production=${selected.production}`,`universe=${selected.universe}`,`expected_subject=${selected.expected_subject}`,`total_open_absent=${rows.length}`,`completed_packets=${completed.size}`].join('\n')+'\n');
console.log(`SELECTED ${selected.wall_id} ${selected.side} — ${selected.character} / ${selected.actor} — ${selected.production}`);
console.log(`OPEN ABSENT ${rows.length}; completed packets ${completed.size}; retained top ${queue.length} -> ${OUT}`);
