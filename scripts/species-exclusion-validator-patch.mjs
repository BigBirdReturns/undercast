#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

async function patch(path,changes){
  let text=await readFile(path,"utf8");
  for(const {before,after,label} of changes){
    const count=text.split(before).length-1;
    if(count!==1)throw new Error(`${path} ${label}: expected one exact fragment, found ${count}`);
    text=text.replace(before,after);
  }
  await writeFile(path,text);
}

await patch("scripts/validate.mjs",[
  {
    before:'if (existsSync("data/species.json") && existsSync("data/CENSUS-COVERAGE.json") && existsSync("data/CENSUS-UNRESOLVED.json")) {',
    after:'if (existsSync("data/species.json") && existsSync("data/CENSUS-COVERAGE.json") && existsSync("data/CENSUS-UNRESOLVED.json") && existsSync("data/CENSUS-EXCLUSIONS.json")) {',
    label:"species validator prerequisites"
  },
  {
    before:'  const unresolved = load("data/CENSUS-UNRESOLVED.json");\n  const index = existsSync("data/index.json") ? load("data/index.json") : [];',
    after:'  const unresolved = load("data/CENSUS-UNRESOLVED.json");\n  const exclusionsEnvelope = load("data/CENSUS-EXCLUSIONS.json");\n  const exclusions = Array.isArray(exclusionsEnvelope) ? exclusionsEnvelope : (exclusionsEnvelope.records || []);\n  const exclusionKey = (row) => [row.franchise, row.category, row.character, row.performer].map(normalizeCensusKey).join("|");\n  const excludedKeys = new Set(exclusions.filter((row) => row.performer).map(exclusionKey));\n  const index = existsSync("data/index.json") ? load("data/index.json") : [];',
    label:"species validator exclusion input"
  },
  {
    before:'    const dispositionCounts = { "primary-card": 0, "additional-performance": 0, unfiled: 0 };',
    after:'    const dispositionCounts = { "primary-card": 0, "additional-performance": 0, unfiled: 0, excluded: 0 };',
    label:"species validator disposition counts"
  },
  {
    before:'      const expectedStatus = !exact.role_on_wall ? "unfiled" : primaryKeys.has(dispositionKey(row)) ? "primary-card" : "additional-performance";',
    after:'      const excluded = excludedKeys.has(exclusionKey({ franchise: taxon.franchise, category: taxon.source_category, character: row.character, performer: row.performer }));\n      const expectedStatus = excluded ? "excluded" : !exact.role_on_wall ? "unfiled" : primaryKeys.has(dispositionKey(row)) ? "primary-card" : "additional-performance";',
    label:"species validator expected disposition"
  },
  {
    before:'    if (taxon.counts?.primary_card_credits !== dispositionCounts["primary-card"] || taxon.counts?.additional_performance_credits !== dispositionCounts["additional-performance"] || taxon.counts?.unfiled_named_credits !== dispositionCounts.unfiled)\n      fail("species.navigation_integrity", `${taxon.label} role disposition counts drifted`);',
    after:'    if (taxon.counts?.primary_card_credits !== dispositionCounts["primary-card"] || taxon.counts?.additional_performance_credits !== dispositionCounts["additional-performance"] || taxon.counts?.unfiled_named_credits !== dispositionCounts.unfiled || taxon.counts?.excluded_named_credits !== dispositionCounts.excluded)\n      fail("species.navigation_integrity", `${taxon.label} role disposition counts drifted`);',
    label:"species validator disposition totals"
  },
  {
    before:'} else skip("species.navigation_integrity", "species or census projections missing — run node scripts/shard.mjs");',
    after:'} else skip("species.navigation_integrity", "species, census, or exclusion projections missing — run node scripts/shard.mjs");',
    label:"species validator skip message"
  }
]);

await patch("tests/rendered/site.spec.mjs",[
  {
    before:'  const canonicalRecordCount=JSON.parse(await readFile(new URL("../../data/specimens.json",import.meta.url),"utf8")).length;\n  expect(urls).toHaveLength(canonicalRecordCount+5);',
    after:'  const canonicalRecordCount=JSON.parse(await readFile(new URL("../../data/specimens.json",import.meta.url),"utf8")).length;\n  const tombstones=JSON.parse(await readFile(new URL("../../data/tombstones.json",import.meta.url),"utf8"));\n  const publicRemovedCount=(tombstones.records||[]).filter(row=>row.status!=="merged").length;\n  expect(urls).toHaveLength(canonicalRecordCount+4+publicRemovedCount);',
    label:"public sitemap route count"
  }
]);

console.log("patched exclusion-aware archive validation and public removed-tombstone route counting");
