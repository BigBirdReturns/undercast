    'window.addEventListener("hashchange",function(){ if(!handlingPopstate) focusSpecimen(location.hash.replace(/^#/,"")); });',
    'window.addEventListener("hashchange",function(){ if(handlingPopstate)return;const id=specimenHashId();if(id)focusSpecimen(id);else scrollToNamedHash(); });',
)
replace_once(
    'index.html',
    '''    if(location.hash) await focusSpecimen(location.hash.replace(/^#/,""));\n    else applyRestoredWallPosition();\n''',
    '''    const specimenId=specimenHashId();\n    if(specimenId) await focusSpecimen(specimenId);\n    else { applyRestoredWallPosition();scrollToNamedHash(); }\n''',
)
replace_once(
    'index.html',
    '''  try{\n    const projection=await fetch("./data/species.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;});\n    const byId=new Map(INDEX.map(function(entry){return [entry.id,entry];}));\n    for(const taxon of projection?.taxa||[]) for(const record of taxon.records||[]){\n      const entry=byId.get(record.id);if(!entry) continue;\n      entry.sp=[...new Set([...(entry.sp||[]),taxon.label])].sort();hydrate(entry);\n    }\n  }catch(_){}\n''',
    '''  try{\n    const projection=await fetch("./data/species.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null;});\n    if(projection&&Array.isArray(projection.taxa)) SPECIES_PROJECTION=projection;\n    const byId=new Map(INDEX.map(function(entry){return [entry.id,entry];}));\n    for(const taxon of SPECIES_PROJECTION.taxa||[]){\n      if(!Array.isArray(taxon.wall_records)) throw new Error("species projection lacks exact wall records");\n      for(const record of taxon.wall_records){\n        const entry=byId.get(record.id);if(!entry) continue;\n        entry.sp=[...new Set([...(entry.sp||[]),taxon.label])].sort();hydrate(entry);\n      }\n    }\n  }catch(_){SPECIES_PROJECTION={taxa:[]};}\n''',
)
replace_once(
    'index.html',
    '''  if(location.hash) await focusSpecimen(location.hash.replace(/^#/,""));\n  else applyRestoredWallPosition();\n''',
    '''  const specimenId=specimenHashId();\n  if(specimenId) await focusSpecimen(specimenId);\n  else { applyRestoredWallPosition();scrollToNamedHash(); }\n''',
)

# ---- Executable regression contract ----
write('scripts/species-fixtures.mjs', r'''#!/usr/bin/env node
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
assert.equal(taxon.counts.named_credits,70);
assert.equal(taxon.counts.filed_role_credits,32);
assert.equal(taxon.counts.primary_card_credits,16);
assert.equal(taxon.counts.primary_card_records,14);
assert.equal(taxon.counts.additional_performance_credits,16);
assert.equal(taxon.counts.unfiled_named_credits,38);
assert.equal(taxon.credits.length,70);
assert.equal(taxon.counts.primary_card_credits+taxon.counts.additional_performance_credits+taxon.counts.unfiled_named_credits,taxon.counts.named_credits);

const expected=["UC-019","UC-030","UC-031","UC-298","UC-675","UC-677","UC-678","UC-679","UC-680","UC-887","UC-1117","UC-1161","UC-1229","UC-1278"];
assert.deepEqual(taxon.wall_records.map(row=>row.id),expected,"wall facet contains only exact displayed Ferengi roles");
const indexById=new Map(index.map(row=>[row.id,row]));
const actual=index.filter(row=>(row.sp||[]).includes("Ferengi")).map(row=>row.id);
assert.deepEqual(actual,expected,"lean wall index uses exact primary-role Ferengi membership");
for(const wrong of ["UC-004","UC-021","UC-110","UC-262","UC-378"]) assert.ok(!(indexById.get(wrong)?.sp||[]).includes("Ferengi"),`${wrong} may not inherit Ferengi from an additional performance`);

const specimenById=new Map(specimens.map(row=>[row.id,row]));
for(const id of ["UC-678","UC-679"]){
  const row=specimenById.get(id);
  assert.equal(row.universe,"Star Trek",`${id} belongs on the Star Trek shelf`);
  assert.notEqual(row.kind,"voice",`${id} is a physical Ferengi performance, not a voice-only card`);
}
const lurin=coverage.find(row=>row.franchise==="Star Trek"&&row.category==="Ferengi"&&normalize(row.performer)===normalize("Mike Gomez")&&normalize(row.character)===normalize("Lurin"));
assert.ok(lurin?.role_on_wall,"Lurin source role is filed by the DaiMon Lurin card");
assert.deepEqual(lurin.wall_ids,["UC-677"]);
const lurinLedger=taxon.credits.find(row=>normalize(row.performer)===normalize("Mike Gomez")&&normalize(row.character)===normalize("Lurin"));
assert.equal(lurinLedger?.status,"primary-card");
assert.deepEqual(lurinLedger.wall_ids,["UC-677"]);
assert.equal(taxon.credits.filter(row=>row.status==="primary-card").length,16);
assert.equal(taxon.credits.filter(row=>row.status==="additional-performance").length,16);
assert.equal(taxon.credits.filter(row=>row.status==="unfiled").length,38);
console.log("PASS — Ferengi wall roles, complete credit ledger, rank alias, and Star Trek shelf are exact");
''')

package_path=ROOT/'package.json'
package=json.loads(package_path.read_text())
package['scripts']['species:fixtures']='node scripts/species-fixtures.mjs'
package_path.write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n')

replace_once(
    'scripts/gate.mjs',
    '  { id: "archive", label: "Validate archive invariants", action: () => runNodeScript("Archive invariants", "scripts/validate.mjs") },\n',
    '  { id: "archive", label: "Validate archive invariants", action: () => runNodeScript("Archive invariants", "scripts/validate.mjs") },\n  { id: "species-fixtures", label: "Validate exact species wall and role-ledger semantics", action: () => runNpmScript("Species fixtures", "species:fixtures") },\n',
)

# Rendered regression for the exact reported URL.
test_path='tests/rendered/site.spec.mjs'
test=read(test_path)
append=r'''

