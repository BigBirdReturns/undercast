#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateSpeciesProjection,wallSpeciesById } from "./lib/site-sweep.mjs";
const leak={taxa:[{label:"Ferengi",records:[{id:"UC-004",credits:[{character:"Brunt",performer:"Jeffrey Combs"}]}],wall_records:[],credits:[{character:"Brunt",performer:"Jeffrey Combs",status:"additional-performance",wall_ids:["UC-004"]}]}]};
assert.deepEqual([...wallSpeciesById(leak)],[]);
assert(validateSpeciesProjection({projection:leak,index:[{id:"UC-004",sp:["Ferengi"]}],specimens:[{id:"UC-004",actor:"Jeffrey Combs",character:"Weyoun"}]}).some(error=>error.includes("UC-004 wall species")));
const exact={taxa:[{label:"Ferengi",records:[{id:"UC-019",credits:[{character:"Quark",performer:"Armin Shimerman"}]}],wall_records:[{id:"UC-019",credits:[{character:"Quark",performer:"Armin Shimerman"}]}],credits:[{character:"Quark",performer:"Armin Shimerman",status:"primary-card",wall_ids:["UC-019"]}]}]};
assert.deepEqual(validateSpeciesProjection({projection:exact,index:[{id:"UC-019",sp:["Ferengi"]}],specimens:[{id:"UC-019",actor:"Armin Shimerman",character:"Quark"}]}),[]);
console.log("site-sweep fixtures: PASS");
