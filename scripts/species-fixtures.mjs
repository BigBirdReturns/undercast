#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const read=async path=>JSON.parse(await readFile(path,"utf8"));
const [species,index,specimens,coverage]=await Promise.all([
  read("data/species.json"),read("data/index.json"),read("data/specimens.json"),read("data/CENSUS-COVERAGE.json")
]);
assert.equal(species.version,2);
const taxon=species.taxa.find(row=>row.key==="species:star-trek:ferengi");
assert.ok(taxon,"Ferengi taxon exists");

const statusCount=status=>taxon.credits.filter(row=>row.status===status).length;
assert.equal(taxon.counts.named_credits,taxon.credits.length,"named credit count matches the complete ledger");
assert.equal(taxon.counts.primary_card_credits,statusCount("primary-card"));
assert.equal(taxon.counts.additional_performance_credits,statusCount("additional-performance"));
assert.equal(taxon.counts.unfiled_named_credits,statusCount("unfiled"));
assert.equal(
  taxon.counts.primary_card_credits+taxon.counts.additional_performance_credits+taxon.counts.unfiled_named_credits,
  taxon.counts.named_credits,
  "every named credit is classified exactly once"
);

const expected=taxon.wall_records.map(row=>row.id);
assert.equal(new Set(expected).size,expected.length,"Ferengi wall records are unique");
const actual=index.filter(row=>(row.sp||[]).includes("Ferengi")).map(row=>row.id);
assert.deepEqual(actual,expected,"lean wall index uses the generated exact primary-role Ferengi membership");
assert.equal(taxon.counts.primary_card_records,expected.length);

const primaryWallIds=[...new Set(taxon.credits.filter(row=>row.status==="primary-card").flatMap(row=>row.wall_ids||[]))];
assert.deepEqual([...primaryWallIds].sort(),[...expected].sort(),"every and only primary-card Ferengi record appears on the wall");
const indexById=new Map(index.map(row=>[row.id,row]));
for(const id of new Set(taxon.credits.filter(row=>row.status==="additional-performance").flatMap(row=>row.wall_ids||[]))){
  if(!primaryWallIds.includes(id)) assert.ok(!(indexById.get(id)?.sp||[]).includes("Ferengi"),`${id} may not inherit Ferengi from an additional performance alone`);
}

const specimenById=new Map(specimens.map(row=>[row.id,row]));
for(const id of expected){
  const specimen=specimenById.get(id);
  assert.ok(specimen,`${id} exists in the canonical roster`);
  assert.equal(specimen.universe,"Star Trek",`${id} belongs on the Star Trek shelf`);
  const credit=taxon.credits.find(row=>row.status==="primary-card"&&(row.wall_ids||[]).includes(id));
  assert.ok(credit,`${id} has a primary Ferengi credit`);
  assert.equal(normalize(credit.performer),normalize(specimen.actor),`${id} performer matches its primary credit`);
  assert.equal(normalize(credit.character),normalize(specimen.character),`${id} displayed role matches its primary credit`);
}

for(const credit of taxon.credits){
  const source=coverage.find(row=>row.franchise==="Star Trek"&&row.category==="Ferengi"&&normalize(row.performer)===normalize(credit.performer)&&normalize(row.character)===normalize(credit.character));
  assert.ok(source,`${credit.performer} — ${credit.character} remains in exact census coverage`);
  assert.deepEqual([...(source.wall_ids||[])].sort(),[...(credit.wall_ids||[])].sort(),`${credit.performer} — ${credit.character} wall IDs agree across projections`);
  assert.equal(Boolean(source.role_on_wall),credit.status!=="unfiled",`${credit.performer} — ${credit.character} filing status agrees across projections`);
}

console.log(`PASS — Ferengi ledger is exact and saturation-safe: ${taxon.counts.primary_card_records} cards, ${taxon.counts.unfiled_named_credits} named credits still unfiled`);
