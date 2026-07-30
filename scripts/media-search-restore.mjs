#!/usr/bin/env node
import { readFileSync,writeFileSync } from "node:fs";
import { restoreMaskedFacets } from "./lib/media-search.mjs";
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw new Error(`${name} required`);return args[i+1];};
const receipt=JSON.parse(readFileSync(option("--receipt"),"utf8")),specimens=JSON.parse(readFileSync("data/specimens.json","utf8")),sources=JSON.parse(readFileSync("data/SOURCES.json","utf8"));
restoreMaskedFacets({specimens,sources,restore:receipt.restore||[]});
writeFileSync("data/specimens.json",JSON.stringify(specimens,null,2)+"\n");writeFileSync("data/SOURCES.json",JSON.stringify(sources,null,2)+"\n");
console.log(`restored ${(receipt.restore||[]).length} unselected cohort facet(s)`);
