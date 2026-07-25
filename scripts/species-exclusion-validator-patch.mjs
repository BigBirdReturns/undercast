#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const path="scripts/validate.mjs";
let text=await readFile(path,"utf8");
function replaceOnce(before,after,label){
  const count=text.split(before).length-1;
  if(count!==1)throw new Error(`${label}: expected one exact fragment, found ${count}`);
  text=text.replace(before,after);
}
replaceOnce(
  'if (existsSync("data/species.json") && existsSync("data/CENSUS-COVERAGE.json") && existsSync("data/CENSUS-UNRESOLVED.json")) {',
  'if (existsSync("data/species.json") && existsSync("data/CENSUS-COVERAGE.json") && existsSync("data/CENSUS-UNRESOLVED.json") && existsSync("data/CENSUS-EXCLUSIONS.json")) {',
  "species validator prerequisites"
);
replaceOnce(
  '  const unresolved = load("data/CENSUS-UNRESOLVED.json");\n  const index = existsSync("data/index.json") ? load("data/index.json") : [];',
  '  const unresolved = load("data/CENSUS-UNRESOLVED.json");\n  const exclusionsEnvelope = load("data/CENSUS-EXCLUSIONS.json");\n  const exclusions = Array.isArray(exclusionsEnvelope) ? exclusionsEnvelope : (exclusionsEnvelope.records || []);\n  const exclusionKey = (row) => [row.franchise, row.category, row.character, row.performer].map(normalizeCensusKey).join("|");\n  const excludedKeys = new Set(exclusions.filter((row) => row.performer).map(exclusionKey));\n  const index = existsSync("data/index.json") ? load("data/index.json") : [];',
  "species validator exclusion input"
);
replaceOnce(
  '    const dispositionCounts = { "primary-card": 0, "additional-performance": 0, unfiled: 0 };',
  '    const dispositionCounts = { "primary-card": 0, "additional-performance": 0, unfiled: 0, excluded: 0 };',
  "species validator disposition counts"
);
replaceOnce(
  '      const expectedStatus = !exact.role_on_wall ? "unfiled" : primaryKeys.has(dispositionKey(row)) ? "primary-card" : "additional-performance";',
  '      const excluded = excludedKeys.has(exclusionKey({ franchise: taxon.franchise, category: taxon.source_category, character: row.character, performer: row.performer }));\n      const expectedStatus = excluded ? "excluded" : !exact.role_on_wall ? "unfiled" : primaryKeys.has(dispositionKey(row)) ? "primary-card" : "additional-performance";',
  "species validator expected disposition"
);
replaceOnce(
  '    if (taxon.counts?.primary_card_credits !== dispositionCounts["primary-card"] || taxon.counts?.additional_performance_credits !== dispositionCounts["additional-performance"] || taxon.counts?.unfiled_named_credits !== dispositionCounts.unfiled)\n      fail("species.navigation_integrity", `${taxon.label} role disposition counts drifted`);',
  '    if (taxon.counts?.primary_card_credits !== dispositionCounts["primary-card"] || taxon.counts?.additional_performance_credits !== dispositionCounts["additional-performance"] || taxon.counts?.unfiled_named_credits !== dispositionCounts.unfiled || taxon.counts?.excluded_named_credits !== dispositionCounts.excluded)\n      fail("species.navigation_integrity", `${taxon.label} role disposition counts drifted`);',
  "species validator disposition totals"
);
replaceOnce(
  '} else skip("species.navigation_integrity", "species or census projections missing — run node scripts/shard.mjs");',
  '} else skip("species.navigation_integrity", "species, census, or exclusion projections missing — run node scripts/shard.mjs");',
  "species validator skip message"
);
await writeFile(path,text);
console.log("patched archive species-navigation validator for explicit reviewed exclusions");
