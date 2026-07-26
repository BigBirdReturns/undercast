#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const OUT=process.env.OUT||'/tmp/card-backfill-next-selection';
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const num=id=>Number(String(id||'').match(/\d+/)?.[0]||Number.MAX_SAFE_INTEGER);
const audit=await readJson('data/MEDIA-AUDIT.json');
const specimens=await readJson('data/specimens.json');
const byId=new Map(specimens.map(r=>[r.id,r]));
const complete=new Set();
try{for(const e of await readdir('data/review/card-backfill',{withFileTypes:true})){if(!e.isDirectory())continue;try{const r=await readJson(join('data/review/card-backfill',e.name,'review.json'));if(r.record_id)complete.add(r.record_id)}catch{}}}catch{}
const rows=[];
for(const item of audit.items||[]){if(item.scope!=='sitewide'||item.status!=='absent'||!['still','portrait'].includes(item.side)||complete.has(item.wall_id))continue;const r=byId.get(item.wall_id);if(!r)continue;rows.push({wall_id:item.wall_id,side:item.side,audit_id:item.id,actor:r.actor,character:r.character,production:r.production,universe:r.universe,years:r.years||'',expected_subject:item.expected_subject,references:r.references||[]})}
rows.sort((a,b)=>num(a.wall_id)-num(b.wall_id)||(a.side==='still'?-1:1));
if(!rows.length)throw new Error('No open sitewide absence');
const queue=rows.slice(0,40),selected=queue[0];
await mkdir(OUT,{recursive:true});
await writeFile(join(OUT,'queue.json'),JSON.stringify({generated_at:new Date().toISOString(),completed_evidence_ids:[...complete].sort(),total_open_absent:rows.length,selected,queue},null,2)+'\n');
await writeFile(join(OUT,'selected.json'),JSON.stringify(selected,null,2)+'\n');
await writeFile(join(OUT,'summary.txt'),`selected=${selected.wall_id}:${selected.side}\nactor=${selected.actor}\ncharacter=${selected.character}\nproduction=${selected.production}\nexpected_subject=${selected.expected_subject}\ntotal_open_absent=${rows.length}\ncompleted_packets=${complete.size}\n`);
console.log(`SELECTED ${selected.wall_id} ${selected.side} — ${selected.character} / ${selected.actor}`);
