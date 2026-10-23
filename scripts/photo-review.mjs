#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {indexMediaRejections,matchMediaRejection} from './lib/media-rejections.mjs';
const command=process.argv[2];
if(command==='classify'){
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 const index=indexMediaRejections(JSON.parse(fs.readFileSync(path.join(input.root,'data/MEDIA-REJECTIONS.json'))));
 console.log(JSON.stringify(input.candidates.map(c=>{const r=matchMediaRejection(index,{wallId:c.id,side:c.side,origin:c.origin,sha256:c.source_sha256});return {candidate_key:c.candidate_key,rejection:r?{rule_id:r.rule.rule_id,ruling:r.rule.ruling,match:r.match}:null};})));
}else if(command==='stage'){
 const {stage}=await import('./lib/photo-maintenance.mjs');
 console.log(JSON.stringify(await stage(process.argv.slice(3))));
}else throw new Error('use classify or stage');
