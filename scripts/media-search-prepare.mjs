#!/usr/bin/env node
import { readFileSync,writeFileSync } from "node:fs";
import { maskUnselectedFacets } from "./lib/media-search.mjs";
const args=process.argv.slice(2),option=(name,required=true)=>{const i=args.indexOf(name);if(i<0){if(required)throw new Error(`${name} required`);return null;}if(!args[i+1]||args[i+1].startsWith("--"))throw new Error(`${name} requires a value`);return args[i+1];},flag=name=>args.includes(name);
const plan=JSON.parse(readFileSync(option("--plan"),"utf8")),specimens=JSON.parse(readFileSync("data/specimens.json","utf8")),sources=JSON.parse(readFileSync("data/SOURCES.json","utf8"));
const byId=new Map(specimens.map(row=>[row.id,row])),sourceById=new Map(sources.map(row=>[row.id,row]));
for(const item of plan.candidates||[]){const record=byId.get(item.wall_id);if(!record)throw new Error(`missing ${item.wall_id}`);record[item.side]=null;const source=sourceById.get(item.wall_id);if(source)source[item.side]=null;}
let restore=[];if(flag("--mask-unselected")){restore=maskUnselectedFacets({specimens,sources,candidates:plan.candidates||[]});const restoreOut=option("--restore-out");writeFileSync(restoreOut,JSON.stringify({version:1,restore},null,2)+"\n");}
writeFileSync("data/specimens.json",JSON.stringify(specimens,null,1)+"\n");writeFileSync("data/SOURCES.json",JSON.stringify(sources,null,1)+"\n");
const ids=[...new Set((plan.candidates||[]).map(row=>row.wall_id))];const out=option("--ids-out");writeFileSync(out,ids.join(","));console.log(`prepared ${plan.candidates.length} facet(s) across ${ids.length} record(s); masked ${restore.length} unselected null facet(s)`);
