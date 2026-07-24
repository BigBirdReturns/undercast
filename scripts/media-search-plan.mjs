#!/usr/bin/env node
import { readFileSync,writeFileSync } from "node:fs";
import { attemptsByFacet,buildMediaPlan } from "./lib/media-search.mjs";
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const load=path=>JSON.parse(readFileSync(path,"utf8"));
const mode=load("data/COLLECTION-MODE.json"),now=option("--now",new Date().toISOString()),limit=Number(option("--limit",mode.rolling_media_search.batch_limit));
let journal=[];try{journal=readFileSync("data/journal/media-search.jsonl","utf8").split(/\r?\n/);}catch{}
const candidates=buildMediaPlan({specimens:load("data/specimens.json"),sources:load("data/SOURCES.json"),auditItems:load("data/MEDIA-AUDIT.json").items,attempts:attemptsByFacet(journal),now,policy:mode.rolling_media_search,limit});
const plan={version:1,generated_at:now,mode:"candidate-only",canonical_write:false,limit,candidates};
const out=option("--out",null);if(out)writeFileSync(out,JSON.stringify(plan,null,2)+"\n");
console.log(JSON.stringify(plan,null,2));
