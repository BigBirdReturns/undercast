#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const command=process.argv[2]||"validate";
const RECORD_ID="UC-1317";
const TASK_ID="ap_bf7d8f79aca6834cb250ca88";
const SOURCE="https://memory-alpha.fandom.com/wiki/Nandi";
const SOURCE_REVISION=3484697;
const SOURCE_SHA256="64d66289f3d6ed5ad78e94004557a0de6d5b7fbc7e4c1477892868c419c10744";
const REASON="Memory Alpha's retained Nandi revision notes that Melissa Villaseñor's initial credit for the role was later removed. Grey Griffin remains the retained credited performer, filed as UC-1285.";
const REVIEW_PATH="data/review/ferengi-gold/nandi-withdrawn-credit-2026-07-25.json";
const ACCOUNTING_REPORT="data/review/star-trek-five-way-accounting-2026-07-25.json";
const ACCOUNTING_RECEIPT="data/review/ferengi-gold/accounting-after-nandi-correction.json";
const normalize=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const sha256=value=>createHash("sha256").update(value).digest("hex");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value,space=1)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,space)+"\n");};
const creditKey=row=>[row.franchise,row.category,row.character,row.performer].map(normalize).join("|");
const targetKey=creditKey({franchise:"Star Trek",category:"Ferengi",character:"Nandi",performer:"Melissa Villasenor"});
function replaceOnce(text,before,after,label){
  const count=text.split(before).length-1;
  if(count!==1)throw new Error(`${label}: expected one exact source fragment, found ${count}`);
  return text.replace(before,after);
}
async function patchText(path,mutator){const before=await readFile(path,"utf8");const after=mutator(before);if(after===before)throw new Error(`${path}: patch made no change`);await writeFile(path,after);}
async function appendAutopilotEvent(event){
  const path="data/journal/autopilot.jsonl";
  const body={version:1,...event};
  const id=`apj_${sha256(JSON.stringify(body)).slice(0,24)}`;
  const text=await readFile(path,"utf8");
  if(text.includes(`\"id\":\"${id}\"`))return;
  await writeFile(path,text.replace(/\s*$/,"\n")+JSON.stringify({id,...body})+"\n");
}

async function patchProjectionContracts(){
  await patchText("scripts/build-species.mjs",text=>{
    text=replaceOnce(text,
      'const paths={coverage:"data/CENSUS-COVERAGE.json",unresolved:"data/CENSUS-UNRESOLVED.json",vocabulary:"data/vocabularies/species.json",specimens:"data/specimens.json"};',
      'const paths={coverage:"data/CENSUS-COVERAGE.json",unresolved:"data/CENSUS-UNRESOLVED.json",vocabulary:"data/vocabularies/species.json",exclusions:"data/CENSUS-EXCLUSIONS.json",specimens:"data/specimens.json"};',"species input paths");
    text=replaceOnce(text,
      'const [coverageInput,unresolvedInput,vocabularyInput,specimensInput]=await Promise.all(Object.values(paths).map(read));\nconst coverage=coverageInput.json;\nconst unresolved=unresolvedInput.json;\nconst vocabulary=vocabularyInput.json;\nconst specimens=specimensInput.json;',
      'const [coverageInput,unresolvedInput,vocabularyInput,exclusionsInput,specimensInput]=await Promise.all(Object.values(paths).map(read));\nconst coverage=coverageInput.json;\nconst unresolved=unresolvedInput.json;\nconst vocabulary=vocabularyInput.json;\nconst exclusionsEnvelope=exclusionsInput.json;\nconst exclusions=Array.isArray(exclusionsEnvelope)?exclusionsEnvelope:(exclusionsEnvelope.records||[]);\nconst specimens=specimensInput.json;\nconst exclusionKey=row=>[row.franchise,row.category,row.character,row.performer].map(value=>normalize(value)).join("|");\nconst excludedKeys=new Set(exclusions.filter(row=>row.performer).map(exclusionKey));',"species exclusion inputs");
    text=replaceOnce(text,
      '  const creditRows=credits.map(credit=>{\n    const key=creditKey(credit);\n    const wallIds=[...(credit.wall_ids||[])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));\n    const status=!credit.role_on_wall?"unfiled":primaryKeys.has(key)?"primary-card":"additional-performance";\n    return {character:credit.character,performer:credit.performer,performance_mode:credit.performance_mode,\n      source:credit.source,status,wall_ids:wallIds};\n  }).sort((a,b)=>a.character.localeCompare(b.character)||a.performer.localeCompare(b.performer));',
      '  const creditRows=credits.map(credit=>{\n    const key=creditKey(credit);\n    const excluded=excludedKeys.has(exclusionKey({franchise:taxon.franchise,category:taxon.source_category,character:credit.character,performer:credit.performer}));\n    if(excluded&&credit.role_on_wall) throw new Error(`${taxon.key} excluded credit remains mapped to a wall record: ${credit.character} / ${credit.performer}`);\n    const wallIds=[...(credit.wall_ids||[])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));\n    const status=excluded?"excluded":!credit.role_on_wall?"unfiled":primaryKeys.has(key)?"primary-card":"additional-performance";\n    return {character:credit.character,performer:credit.performer,performance_mode:credit.performance_mode,\n      source:credit.source,status,wall_ids:wallIds};\n  }).sort((a,b)=>a.character.localeCompare(b.character)||a.performer.localeCompare(b.performer));',"species credit dispositions");
    text=replaceOnce(text,
      '  const primaryCount=creditRows.filter(row=>row.status==="primary-card").length;\n  const additionalCount=creditRows.filter(row=>row.status==="additional-performance").length;\n  const unfiledCount=creditRows.filter(row=>row.status==="unfiled").length;\n  if(primaryCount+additionalCount+unfiledCount!==credits.length) throw new Error(`${taxon.key} role disposition accounting drift`);',
      '  const primaryCount=creditRows.filter(row=>row.status==="primary-card").length;\n  const additionalCount=creditRows.filter(row=>row.status==="additional-performance").length;\n  const unfiledCount=creditRows.filter(row=>row.status==="unfiled").length;\n  const excludedCount=creditRows.filter(row=>row.status==="excluded").length;\n  if(primaryCount+additionalCount+unfiledCount+excludedCount!==credits.length) throw new Error(`${taxon.key} role disposition accounting drift`);',"species disposition counts");
    text=replaceOnce(text,
      '      unresolved_characters:unknowns.length,filed_role_credits:credits.filter(row=>row.role_on_wall).length,\n      filed_records:filed.length,primary_card_credits:primaryCount,primary_card_records:wallRecords.length,\n      additional_performance_credits:additionalCount,unfiled_named_credits:unfiledCount},',
      '      unresolved_characters:unknowns.length,filed_role_credits:creditRows.filter(row=>row.status==="primary-card"||row.status==="additional-performance").length,\n      filed_records:filed.length,primary_card_credits:primaryCount,primary_card_records:wallRecords.length,\n      additional_performance_credits:additionalCount,unfiled_named_credits:unfiledCount,excluded_named_credits:excludedCount},',"species count output");
    text=replaceOnce(text,
      'const sourceInputs=[coverageInput,unresolvedInput,vocabularyInput,specimensInput];',
      'const sourceInputs=[coverageInput,unresolvedInput,vocabularyInput,exclusionsInput,specimensInput];',"species generated inputs");
    text=replaceOnce(text,
      'semantics:"Exact source-category role projection. The wall facet contains only records whose displayed primary role is in the taxon; additional filed performances and unfiled named credits remain visible in the complete role ledger. Counts describe the captured community-wiki scope, not all licensed media."',
      'semantics:"Exact source-category role projection. The wall facet contains only records whose displayed primary role is in the taxon; additional filed performances, reviewed exclusions and unfiled named credits remain visible in the complete role ledger. Counts describe the captured community-wiki scope, not all licensed media."',"species semantics");
    return text;
  });

  const schema=await readJson("schema/species.schema.json");
  const generated=schema.properties.generated_from;
  if(!generated.required.includes("exclusions"))generated.required.splice(generated.required.indexOf("specimens"),0,"exclusions");
  generated.properties.exclusions={"$ref":"#/$defs/input"};
  const counts=schema.$defs.counts;
  if(!counts.required.includes("excluded_named_credits"))counts.required.push("excluded_named_credits");
  counts.properties.excluded_named_credits={type:"integer",minimum:0};
  const statuses=schema.$defs.taxonomyCredit.properties.status.enum;
  if(!statuses.includes("excluded"))statuses.push("excluded");
  await writeJson("schema/species.schema.json",schema,2);

  await patchText("scripts/lib/site-sweep.mjs",text=>replaceOnce(text,
    '["primary-card","additional-performance","unfiled"]',
    '["primary-card","additional-performance","unfiled","excluded"]',"site sweep species statuses"));

  await patchText("scripts/species-fixtures.mjs",text=>{
    text=replaceOnce(text,
      'assert.equal(taxon.counts.unfiled_named_credits,statusCount("unfiled"));\nassert.equal(\n  taxon.counts.primary_card_credits+taxon.counts.additional_performance_credits+taxon.counts.unfiled_named_credits,',
      'assert.equal(taxon.counts.unfiled_named_credits,statusCount("unfiled"));\nassert.equal(taxon.counts.excluded_named_credits,statusCount("excluded"));\nassert.equal(\n  taxon.counts.primary_card_credits+taxon.counts.additional_performance_credits+taxon.counts.unfiled_named_credits+taxon.counts.excluded_named_credits,',"species fixture disposition counts");
    text=replaceOnce(text,
      'assert.equal(Boolean(source.role_on_wall),credit.status!=="unfiled",`${credit.performer} — ${credit.character} filing status agrees across projections`);',
      'assert.equal(Boolean(source.role_on_wall),["primary-card","additional-performance"].includes(credit.status),`${credit.performer} — ${credit.character} filing status agrees across projections`);',"species fixture filing semantics");
    text=replaceOnce(text,
      'console.log(`PASS — Ferengi ledger is exact and saturation-safe: ${taxon.counts.primary_card_records} cards, ${taxon.counts.unfiled_named_credits} named credits still unfiled`);',
      'console.log(`PASS — Ferengi ledger is exact and saturation-safe: ${taxon.counts.primary_card_records} cards, ${taxon.counts.unfiled_named_credits} eligible named credits still unfiled, ${taxon.counts.excluded_named_credits} reviewed exclusions`);',"species fixture output");
    return text;
  });

  await patchText("index.html",text=>{
    text=replaceOnce(text,
      'const statusLabel={"primary-card":"illustrated primary role","additional-performance":"additional performance on file",unfiled:"not yet a dedicated card"};',
      'const statusLabel={"primary-card":"illustrated primary role","additional-performance":"additional performance on file",unfiled:"not yet a dedicated card",excluded:"reviewed exclusion — no card should be filed"};',"public exclusion label");
    text=replaceOnce(text,
      '<span><b>${esc(c.unfiled_named_credits)}</b> unfiled named credits</span><span><b>${esc(c.unresolved_characters)}</b> source pages without a named performer</span>',
      '<span><b>${esc(c.unfiled_named_credits)}</b> eligible named credits still unfiled</span><span><b>${esc(c.excluded_named_credits||0)}</b> reviewed exclusions</span><span><b>${esc(c.unresolved_characters)}</b> source pages without a named performer</span>',"public species counts");
    text=replaceOnce(text,
      'including additional roles and work not yet given its own card.',
      'including additional roles, reviewed exclusions, and work not yet given its own card.',"public species scope note");
    return text;
  });

  await patchText("scripts/star-trek-species-gold.mjs",text=>{
    text=replaceOnce(text,
      '  const unfiled=Number(taxon.counts?.unfiled_named_credits||0);\n  const exclusions=Number(entry.reviewed_category_exclusions||0);\n  const eligibleUnfiled=Math.max(0,unfiled-exclusions);',
      '  const unfiled=Number(taxon.counts?.unfiled_named_credits||0);\n  const exclusions=Number(taxon.counts?.excluded_named_credits||0);\n  const plannedExclusions=Number(entry.reviewed_category_exclusions||0);\n  const eligibleUnfiled=unfiled;',"gold exclusion counts");
    text=replaceOnce(text,
      '    unfiled_named_credits:unfiled,reviewed_category_exclusions:exclusions,eligible_unfiled_named_credits:eligibleUnfiled,',
      '    unfiled_named_credits:unfiled,reviewed_category_exclusions:exclusions,planned_category_exclusions:plannedExclusions,eligible_unfiled_named_credits:eligibleUnfiled,',"gold exclusion output");
    text=replaceOnce(text,
      '    if(row.error)errors.push(`${row.entry?.id||"unknown"}: ${row.error}`);',
      '    if(row.error)errors.push(`${row.entry?.id||"unknown"}: ${row.error}`);\n    if(row.reviewed_category_exclusions!==row.planned_category_exclusions)errors.push(`${row.label} exclusion count ${row.reviewed_category_exclusions} does not match planned ${row.planned_category_exclusions}`);',"gold exclusion validation");
    return text;
  });
}

async function applyCorrection(){
  const now=new Date().toISOString();
  const [specimens,sources,media,tombstones,exclusions,autopilot,plan]=await Promise.all([
    readJson("data/specimens.json"),readJson("data/SOURCES.json"),readJson("data/MEDIA-AUDIT.json"),readJson("data/tombstones.json"),readJson("data/CENSUS-EXCLUSIONS.json"),readJson("data/AUTOPILOT.json"),readJson("data/STAR-TREK-GOLD.json")
  ]);
  const record=specimens.find(row=>row.id===RECORD_ID);
  if(!record||normalize(record.actor)!=="melissa villasenor"||normalize(record.character)!=="nandi")throw new Error(`${RECORD_ID} is not the expected Melissa Villaseñor / Nandi record`);
  const job=autopilot.jobs.find(row=>row.id===TASK_ID);
  if(!job||normalize(job.performer)!=="melissa villasenor"||normalize(job.character)!=="nandi")throw new Error(`${TASK_ID} is not the expected Melissa Villaseñor / Nandi task`);
  const receipt=(job.source_receipts||[]).find(row=>row.source===SOURCE&&Number(row.revision)===SOURCE_REVISION);
  if(!receipt||receipt.content_sha256!==SOURCE_SHA256)throw new Error(`${TASK_ID} lacks the exact retained Nandi revision receipt`);
  if((tombstones.records||[]).some(row=>row.id===RECORD_ID))throw new Error(`${RECORD_ID} already has a tombstone`);
  const exclusionRows=Array.isArray(exclusions)?exclusions:exclusions.records;
  if(exclusionRows.some(row=>creditKey(row)===targetKey))throw new Error("Melissa Villaseñor / Nandi exclusion already exists");

  const nextSpecimens=specimens.filter(row=>row.id!==RECORD_ID);
  const nextSources=sources.filter(row=>row.id!==RECORD_ID);
  media.items=(media.items||[]).filter(row=>row.wall_id!==RECORD_ID);
  tombstones.records.push({id:RECORD_ID,status:"removed",actor:"Melissa Villasenor",character:"Nandi",reason:REASON,source:SOURCE});
  tombstones.records.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  exclusionRows.push({franchise:"Star Trek",category:"Ferengi",character:"Nandi",performer:"Melissa Villasenor",reason:REASON,source:SOURCE});
  exclusionRows.sort((a,b)=>creditKey(a).localeCompare(creditKey(b)));
  job.status="rejected";
  job.performer_on_wall=false;
  job.role_on_wall=false;
  job.wall_ids=[];
  job.outcome={kind:"reviewed-exclusion",decided_at:now,decided_by:"chatgpt-second-desk",reason:REASON,source:SOURCE,source_fingerprint:job.source_fingerprint};
  delete job.lease;delete job.next_retry_at;
  const ferengi=(plan.sequence||[]).find(row=>row.id==="ferengi");
  if(!ferengi)throw new Error("Star Trek gold plan lacks Ferengi");
  ferengi.reviewed_category_exclusions=2;
  ferengi.note="The reviewed eligible Ferengi card catalog is filed. Torrot / Jeri Ryan and the withdrawn Nandi / Melissa Villaseñor credit remain explicit exclusions; media completion is the active gold blocker.";

  await Promise.all([
    writeJson("data/specimens.json",nextSpecimens,1),writeJson("data/SOURCES.json",nextSources,1),writeJson("data/MEDIA-AUDIT.json",media,2),
    writeJson("data/tombstones.json",tombstones,2),writeJson("data/CENSUS-EXCLUSIONS.json",exclusions,1),writeJson("data/AUTOPILOT.json",autopilot,2),writeJson("data/STAR-TREK-GOLD.json",plan,2)
  ]);
  await rm("images/uc-1317-portrait.jpg",{force:true});
  await appendAutopilotEvent({op:"task.rejected",task_id:TASK_ID,at:now,scope:"star-trek",performer:"Melissa Villasenor",character:"Nandi",reason:"withdrawn_source_credit",source:SOURCE,source_revision:SOURCE_REVISION,source_content_sha256:SOURCE_SHA256});
  await patchProjectionContracts();
  await writeJson(REVIEW_PATH,{version:1,scope:"star-trek",species:"Ferengi",record_id:RECORD_ID,task_id:TASK_ID,disposition:"excluded",decided_at:now,decided_by:"chatgpt-second-desk",reason:REASON,source:{url:SOURCE,pageid:275861,revision:SOURCE_REVISION,timestamp:"2026-06-10T22:38:01Z",content_sha256:SOURCE_SHA256,evidence_line:"While originally credited upon the initial release of the episode, Villasenor's credit for the role was later removed."},retained_record:"UC-1285",removed_asset:record.portrait||null},2);
  console.log(`corrected ${RECORD_ID}; rejected ${TASK_ID}; retained Grey Griffin / Nandi as UC-1285`);
}

async function writeAccounting(){
  const state=await readJson("data/AUTOPILOT.json");
  const jobs=(state.jobs||[]).filter(job=>job.scope==="star-trek").sort((a,b)=>a.id.localeCompare(b.id));
  if(jobs.some(job=>["leased","drafted","merged"].includes(job.status)))throw new Error("accounting refused while Star Trek work is in flight");
  const disposition=job=>job.status==="resolved"?"filed":job.status==="blocked"?"blocked":["rejected","retired"].includes(job.status)?"excluded":"unresolved";
  const rows=jobs.map(job=>({task_id:job.id,performer:job.performer,character:job.character,durable_status:job.status,disposition:disposition(job),wall_ids:job.wall_ids||[],source_fingerprint:job.source_fingerprint,note:disposition(job)==="unresolved"?"Queued or attention work remains unresolved pending task-level filing; queueability is not itself an eligibility ruling.":null}));
  const counts={eligible:0,filed:0,blocked:0,excluded:0,unresolved:0};for(const row of rows)counts[row.disposition]++;
  const report={version:1,scope_id:"star-trek",generated_at:new Date().toISOString(),semantics:{eligible:"Task-level eligibility has been positively established but the role is not yet filed.",filed:"The exact performer-role is represented by a resolved canonical wall record.",blocked:"Required evidence or runtime capability is unavailable; the task remains visible for retry.",excluded:"A reviewed rejection or retirement removes the task from the eligible corpus without erasing history.",unresolved:"No final eligibility disposition exists yet. Queued and attention work remains unresolved rather than being presumed eligible."},denominator:jobs.length,counts,rows};
  await writeJson(ACCOUNTING_REPORT,report,2);
  await writeJson(ACCOUNTING_RECEIPT,{scope_id:"star-trek",counts,note:"Every durable Star Trek task is assigned exactly once after correcting the withdrawn Melissa Villaseñor / Nandi credit. The rejected task and removed UC-1317 record remain visible in durable history; no later species was activated.",evidence:[{type:"report",value:`${ACCOUNTING_REPORT} — ${jobs.length} exact task rows after the Ferengi Nandi correction.`},{type:"workflow-run",value:`GitHub Actions run ${process.env.GITHUB_RUN_ID||"local"} — exact-revision Nandi correction and complete canonical gate.`}],reviewed_by:"chatgpt-second-desk",reviewed_role:"second-desk",reviewed_at:new Date().toISOString()},2);
  console.log(JSON.stringify({denominator:jobs.length,counts},null,2));
}

async function validateCorrection(){
  const [specimens,sources,media,tombstones,exclusions,autopilot,species,plan]=await Promise.all([
    readJson("data/specimens.json"),readJson("data/SOURCES.json"),readJson("data/MEDIA-AUDIT.json"),readJson("data/tombstones.json"),readJson("data/CENSUS-EXCLUSIONS.json"),readJson("data/AUTOPILOT.json"),readJson("data/species.json"),readJson("data/STAR-TREK-GOLD.json")
  ]);
  if(specimens.some(row=>row.id===RECORD_ID)||sources.some(row=>row.id===RECORD_ID)||(media.items||[]).some(row=>row.wall_id===RECORD_ID))throw new Error(`${RECORD_ID} remains in a live canonical surface`);
  const tomb=(tombstones.records||[]).find(row=>row.id===RECORD_ID);if(tomb?.status!=="removed"||tomb.source!==SOURCE)throw new Error(`${RECORD_ID} correction tombstone is missing`);
  const exclusionRows=Array.isArray(exclusions)?exclusions:exclusions.records;if(!exclusionRows.some(row=>creditKey(row)===targetKey))throw new Error("withdrawn Nandi credit lacks exact exclusion");
  const job=(autopilot.jobs||[]).find(row=>row.id===TASK_ID);if(job?.status!=="rejected"||job.role_on_wall||(job.wall_ids||[]).length)throw new Error(`${TASK_ID} is not durably rejected`);
  const taxon=(species.taxa||[]).find(row=>row.key==="species:star-trek:ferengi");if(!taxon)throw new Error("Ferengi projection missing");
  const credit=(taxon.credits||[]).find(row=>normalize(row.performer)==="melissa villasenor"&&normalize(row.character)==="nandi");if(credit?.status!=="excluded")throw new Error("public Ferengi ledger does not mark Melissa Villaseñor / Nandi excluded");
  if(taxon.counts?.unfiled_named_credits!==0||taxon.counts?.excluded_named_credits!==2)throw new Error(`Ferengi counts are not exact: unfiled=${taxon.counts?.unfiled_named_credits} excluded=${taxon.counts?.excluded_named_credits}`);
  const ferengi=(plan.sequence||[]).find(row=>row.id==="ferengi");if(ferengi?.state!=="active"||ferengi.reviewed_category_exclusions!==2)throw new Error("Ferengi gold plan drifted");
  console.log(`PASS — ${RECORD_ID} is tombstoned, ${TASK_ID} is rejected, Ferengi has 0 eligible unfiled credits and 2 reviewed exclusions`);
}

if(command==="apply")await applyCorrection();
else if(command==="accounting")await writeAccounting();
else if(command==="validate")await validateCorrection();
else throw new Error("unknown command; use apply, accounting, or validate");
