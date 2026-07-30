#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalJson, sha256 } from "./lib/card-backfill-cohort.mjs";
import { hashFile, writeChecksumLedger } from "./lib/card-backfill-packet.mjs";

const args=process.argv.slice(2);
function option(name,fallback=null){const i=args.indexOf(name);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith("--"))throw new Error(`${name} requires a value`);return value;}
async function readJson(path){return JSON.parse(await readFile(path,"utf8"));}
async function writeJson(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+"\n");}

async function finalizePacket({sourceDir,destination,decision,adjudicator,expectedPresentation}){
  await rm(destination,{recursive:true,force:true});await cp(sourceDir,destination,{recursive:true});
  const reviewPath=join(destination,"review.json"),review=await readJson(reviewPath);
  const accepted=decision.disposition==="accept";
  review.disposition=accepted?"reviewed-evidence-candidate":"quarantine";
  review.quarantine_reasons=accepted?[]:[...(review.quarantine_reasons||[]),decision.reason||"visual-adjudication-rejected"];
  review.visual_adjudication={
    status:accepted?"accepted":"rejected",
    adjudicator,
    independent_from_discovery:true,
    identity:{value:decision.identity,note:decision.identity_note||decision.note,evidence:decision.evidence||[]},
    presentation:{value:decision.presentation,note:decision.presentation_note||decision.note,evidence:decision.evidence||[]},
    expected_presentation:expectedPresentation,
    decided_at:decision.decided_at||null,
  };
  review.permanent_evidence_publication_candidate=accepted;
  review.canonical_mutation=false;
  await writeJson(reviewPath,review);
  await writeJson(join(destination,"adjudication-receipt.json"),{
    version:1,
    record_id:review.record_id,
    side:review.side,
    batch_sha256:review.batch_sha256,
    disposition:decision.disposition,
    identity:decision.identity,
    presentation:decision.presentation,
    note:decision.note,
    evidence:decision.evidence||[],
    adjudicator,
    independent_from_discovery:true,
    canonical_mutation:false,
  });
  await rm(join(destination,"manifest.json"),{force:true});await rm(join(destination,"checksums.sha256"),{force:true});
  const names=[];for(const entry of await readdir(destination,{withFileTypes:true}))if(entry.isFile()&&!['manifest.json','checksums.sha256'].includes(entry.name))names.push(entry.name);
  const files=[];for(const name of names.sort())files.push({path:name,sha256:await hashFile(join(destination,name)),bytes:(await stat(join(destination,name))).size});
  const manifest={version:1,campaign_id:review.campaign_id,record_id:review.record_id,side:review.side,disposition:review.disposition,files,packet_sha256:sha256(canonicalJson(files)),canonical_mutation:false};
  await writeJson(join(destination,"manifest.json"),manifest);
  const checksum=await writeChecksumLedger(destination,[...names,"manifest.json"]);
  return {record_id:review.record_id,side:review.side,disposition:review.disposition,path:destination,packet_sha256:manifest.packet_sha256,checksum_ledger_sha256:checksum.sha256};
}

async function main(){
  const candidates=resolve(option("--candidates")),decisions=await readJson(resolve(option("--decisions"))),control=await readJson(option("--control",".github/CARD-BACKFILL-COHORT.json")),out=resolve(option("--out","card-backfill-cohort-adjudicated"));
  const batchResult=await readJson(join(candidates,"batch-result.json"));
  if(decisions.version!==1||decisions.batch_sha256!==batchResult.batch_sha256)throw new Error("decision batch custody mismatch");
  const adjudicator=decisions.adjudicator||{};
  if(!adjudicator.id||!['machine','person'].includes(adjudicator.kind)||adjudicator.independent_from_discovery!==true)throw new Error("adjudicator must be identified, qualified as machine/person, and independent from discovery");
  const pending=batchResult.results.filter(row=>row.disposition==="candidate-pending-independent-visual-adjudication"),decisionByKey=new Map();
  for(const decision of decisions.decisions||[]){const key=`${decision.record_id}/${decision.side}`;if(decisionByKey.has(key))throw new Error(`duplicate decision ${key}`);decisionByKey.set(key,decision);}
  if(decisionByKey.size!==pending.length)throw new Error(`decisions must cover every pending candidate exactly once: expected ${pending.length}, got ${decisionByKey.size}`);
  await rm(out,{recursive:true,force:true});await mkdir(join(out,"permanent"),{recursive:true});await mkdir(join(out,"quarantine"),{recursive:true});
  const results=[];
  for(const row of batchResult.results){
    if(row.disposition!=="candidate-pending-independent-visual-adjudication"){
      await writeJson(join(out,"quarantine",`${row.record_id}-${row.side}.json`),{...row,carried_from_candidate_batch:true,canonical_mutation:false});
      results.push({...row,final_disposition:"quarantine",reason:"pre-adjudication-quarantine"});continue;
    }
    const key=`${row.record_id}/${row.side}`,decision=decisionByKey.get(key);
    if(!decision)throw new Error(`missing decision ${key}`);
    if(!['accept','reject'].includes(decision.disposition))throw new Error(`invalid decision disposition ${key}`);
    const review=await readJson(join(candidates,row.packet_path,"review.json"));
    const expectedPresentation=review.visual_adjudication?.required_presentation_value;
    if(decision.disposition==="accept"){
      if(decision.identity!=="expected")throw new Error(`accepted identity must be expected for ${key}`);
      if(decision.presentation!==expectedPresentation)throw new Error(`accepted presentation must be ${expectedPresentation} for ${key}`);
      if(!String(decision.note||"").trim())throw new Error(`accepted decision requires a note for ${key}`);
    }else if(!String(decision.reason||decision.note||"").trim())throw new Error(`rejected decision requires a reason for ${key}`);
    const bucket=decision.disposition==="accept"?"permanent":"quarantine",destination=join(out,bucket,row.record_id);
    const finalized=await finalizePacket({sourceDir:join(candidates,row.packet_path),destination,decision,adjudicator,expectedPresentation});
    results.push({...row,final_disposition:finalized.disposition,final_packet_path:`${bucket}/${row.record_id}`,final_packet_sha256:finalized.packet_sha256,final_checksum_ledger_sha256:finalized.checksum_ledger_sha256});
  }
  const accepted=results.filter(row=>row.final_disposition==="reviewed-evidence-candidate").length,rejected=results.length-accepted,min=Number(control.batch?.minimum||20),max=Number(control.batch?.maximum||50);
  if(accepted<min)throw new Error(`accepted packet count ${accepted} is below permanent batch minimum ${min}`);
  if(accepted>max)throw new Error(`accepted packet count ${accepted} exceeds permanent batch maximum ${max}`);
  const receipt={version:1,generated_at:new Date().toISOString(),campaign_id:batchResult.campaign_id,estate_sha256:batchResult.estate_sha256,batch_sha256:batchResult.batch_sha256,cohort_key:batchResult.cohort_key,adjudicator,counts:{selected:results.length,accepted,rejected},results,result_sha256:sha256(canonicalJson(results)),canonical_mutation:false};
  await writeJson(join(out,"batch-publication-receipt.json"),receipt);
  await writeFile(join(out,"summary.txt"),[`campaign=${receipt.campaign_id}`,`batch_sha256=${receipt.batch_sha256}`,`accepted=${accepted}`,`rejected_or_quarantined=${rejected}`,`result_sha256=${receipt.result_sha256}`,`canonical_mutation=false`].join("\n")+"\n");
  console.log(`PASS — adjudicated ${results.length} packet(s): ${accepted} permanent evidence candidate(s), ${rejected} quarantine(s)`);
  console.log(`OUTPUT — ${out}`);
}
main().catch(error=>{console.error(`card-backfill adjudicate: ${error.message}`);process.exit(1);});
