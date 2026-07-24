#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateSpeciesProjection,validateSurfaceSources,wallSpeciesById } from "./lib/site-sweep.mjs";
const load=path=>JSON.parse(readFileSync(path,"utf8"));
const projection=load("data/species.json"),index=load("data/index.json"),specimens=load("data/specimens.json");
const errors=[...validateSpeciesProjection({projection,index,specimens}),...validateSurfaceSources()];
if(errors.length){for(const error of errors)console.error(`site-sweep: ${error}`);process.exit(1);}
console.log(`site-sweep: PASS — ${index.length} wall records, ${wallSpeciesById(projection).size} exact species-tagged records, five root surfaces plus permanent records, canonical absence plates enforced`);
