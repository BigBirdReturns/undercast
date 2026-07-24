#!/usr/bin/env node
import { readFileSync,writeFileSync } from "node:fs";
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw new Error(`${name} required`);return args[i+1];};
const plan=JSON.parse(readFileSync(option("--plan"),"utf8")),specimens=JSON.parse(readFileSync("data/specimens.json","utf8")),sources=JSON.parse(readFileSync("data/SOURCES.json","utf8"));
const byId=new Map(specimens.map(row=>[row.id,row])),sourceById=new Map(sources.map(row=>[row.id,row]));
for(const item of plan.candidates||[]){const record=byId.get(item.wall_id);if(!record)throw new Error(`missing ${item.wall_id}`);record[item.side]=null;const source=sourceById.get(item.wall_id);if(source)source[item.side]=null;}
writeFileSync("data/specimens.json",JSON.stringify(specimens,null,1)+"\n");writeFileSync("data/SOURCES.json",JSON.stringify(sources,null,1)+"\n");
const ids=[...new Set((plan.candidates||[]).map(row=>row.wall_id))];const out=option("--ids-out");writeFileSync(out,ids.join(","));console.log(`prepared ${plan.candidates.length} facet(s) across ${ids.length} record(s)`);
