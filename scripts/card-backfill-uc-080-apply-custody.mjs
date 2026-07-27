#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONTROL=process.env.CONTROL||'.github/CARD-BACKFILL-UC-080-APPLY.json';
const DEST=process.env.DEST||'data/review/card-backfill/UC-080';
const sha=value=>createHash('sha256').update(value).digest('hex');
const control=JSON.parse(await readFile(CONTROL,'utf8'));
if(control.record_id!=='UC-080'||!Array.isArray(control.failed_apply_checkpoints)||control.failed_apply_checkpoints.length!==1)throw new Error('UC-080 apply-failure custody drift');
const manifestPath=join(DEST,'manifest.json');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
manifest.custody={...manifest.custody,failed_apply_checkpoints:control.failed_apply_checkpoints};
await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
const names=(await readdir(DEST)).filter(name=>name!=='SHA256SUMS').sort();
const sums=[];
for(const name of names)sums.push(`${sha(await readFile(join(DEST,name)))}  ${name}`);
await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
console.log(`PASS — retained ${control.failed_apply_checkpoints.length} UC-080 apply-failure checkpoint and refreshed ${sums.length} checksums`);
console.log(`manifest ${sha(await readFile(manifestPath))}`);
console.log(`sums ${sha(await readFile(join(DEST,'SHA256SUMS')))}`);
