#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT=process.env.OUT||'/tmp/card-backfill-uc-071-inspect';
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const [specimens,sources,audit]=await Promise.all([
  readJson('data/specimens.json'),
  readJson('data/SOURCES.json'),
  readJson('data/MEDIA-AUDIT.json')
]);
const record=specimens.find(row=>row.id==='UC-071');
const source=sources.find(row=>row.id==='UC-071');
const auditItems=(audit.items||[]).filter(row=>row.wall_id==='UC-071');
if(!record)throw new Error('UC-071 specimen missing');
if(record.actor!=='Warwick Davis')throw new Error(`UC-071 actor drift: ${record.actor}`);
const target=auditItems.find(row=>row.id==='ma_d14edc5659bf5ae42a4ad6e5');
if(!target||target.side!=='still'||target.status!=='absent')throw new Error('UC-071 selected audit boundary drift');
await mkdir(OUT,{recursive:true});
const context={
  version:1,
  lane:'card-backfill',
  record_id:'UC-071',
  inspected_at:new Date().toISOString(),
  specimen:record,
  source_row:source||null,
  media_audit_items:auditItems,
  selected_audit:target,
  canonical_mutation:false
};
await writeFile(join(OUT,'context.json'),JSON.stringify(context,null,2)+'\n');
const keys=value=>value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value).sort().join(', '):'';
const lines=[
  'record=UC-071',
  `actor=${record.actor}`,
  `character=${record.character}`,
  `production=${record.production}`,
  `specimen_keys=${keys(record)}`,
  `source_keys=${keys(source)}`,
  `audit_items=${auditItems.length}`,
  `selected_audit=${target.id}:${target.side}:${target.status}`,
  'canonical_mutation=false'
];
await writeFile(join(OUT,'summary.txt'),lines.join('\n')+'\n');
console.log(lines.join('\n'));
