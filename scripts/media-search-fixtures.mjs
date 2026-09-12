#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync,readFileSync } from "node:fs";
import { mkdir,mkdtemp,rm,writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { attemptsByFacet,buildMediaPlan,classifyMediaCandidate } from "./lib/media-search.mjs";
import { indexMediaRejections,matchMediaRejection,validateMediaRejections } from "./lib/media-rejections.mjs";

const digest=(file)=>createHash("sha256").update(readFileSync(file)).digest("hex");
const policy={missing_retry_days:30,attention_retry_days:7,nonfree_portrait_retry_days:180,verified_portrait_retry_days:365,verified_still_retry_days:730};
const specimens=[{id:"UC-1",actor:"Actor One",character:"Role One",still:null,portrait:{src:"p.jpg",kind:"copyright",origin:"https://example.fandom.com/p"}},{id:"UC-2",actor:"Actor Two",character:"Role Two",still:{src:"s.jpg",kind:"still",origin:"https://example.test/s"},portrait:{src:"p2.jpg",kind:"free",origin:"https://commons.wikimedia.org/p2"}}];
const plan=buildMediaPlan({specimens,sources:[],auditItems:[],attempts:new Map(),now:"2026-07-24T00:00:00.000Z",policy,limit:10});
assert.equal(plan[0].wall_id,"UC-1");assert.equal(plan[0].side,"still");assert(plan.some(row=>row.reason==="portrait-source-upgrade"));
const attempts=attemptsByFacet([JSON.stringify({op:"media-search.attempted",wall_id:"UC-1",side:"still",at:"2026-07-23T00:00:00.000Z"})]);
const deferred=buildMediaPlan({specimens,sources:[],auditItems:[],attempts,now:"2026-07-24T00:00:00.000Z",policy,limit:10});assert(!deferred.some(row=>row.wall_id==="UC-1"&&row.side==="still"));

const document=JSON.parse(readFileSync("data/MEDIA-REJECTIONS.json","utf8"));
validateMediaRejections(document);
assert.equal(document.rules.length,144);
assert.deepEqual(document.denominator,{rules:144,collect_001:71,uc_media_audit_1:73});
for(const ledger of document.source_ledgers)assert.equal(digest(ledger.path),ledger.sha256,`${ledger.path} evidence hash drift`);
const rejectionIndex=indexMediaRejections(document);
const campaignRule=document.rules.find(row=>row.decision==="UC-MEDIA-AUDIT-1"&&row.source_locator);
assert(campaignRule);
const byHash=matchMediaRejection(rejectionIndex,{wallId:"UC-999999",side:"still",sha256:campaignRule.asset_sha256});
assert.equal(byHash?.match,"asset_sha256");
const byLocator=matchMediaRejection(rejectionIndex,{wallId:campaignRule.wall_id,side:campaignRule.side,origin:`${campaignRule.source_locator}#fragment`,sha256:"0".repeat(64)});
assert.equal(byLocator?.match,"source_locator");
assert.equal(matchMediaRejection(rejectionIndex,{wallId:"UC-999999",side:campaignRule.side,origin:campaignRule.source_locator,sha256:"0".repeat(64)}),null);
const rejected=classifyMediaCandidate({item:{wall_id:campaignRule.wall_id,side:campaignRule.side},old:null,proposed:{src:"candidate.jpg",origin:campaignRule.source_locator},candidateSha:"0".repeat(64),baselineSha:null,rejectionIndex});
assert.equal(rejected.status,"rejected");assert.equal(rejected.rejection.rule_id,campaignRule.rule_id);
const replacement=classifyMediaCandidate({item:{wall_id:campaignRule.wall_id,side:campaignRule.side},old:null,proposed:{src:"replacement.jpg",origin:"https://example.test/replacement"},candidateSha:"1".repeat(64),baselineSha:null,rejectionIndex});
assert.equal(replacement.status,"candidate");
for(const id of ["UC-1211","UC-833","UC-872","UC-883"])assert(!document.rules.some(row=>row.wall_id===id&&row.side==="portrait"&&row.decision==="UC-MEDIA-AUDIT-1"),`${id} verified exception was incorrectly blocked`);
const reconciliation=JSON.parse(readFileSync("data/review/estate-debt/UC-MEDIA-AUDIT-1-RECONCILIATION.json","utf8"));
assert.deepEqual(reconciliation.dispositions,{reviewed_attention_rows:77,remains_unpublished:72,verified_replacement:1,same_asset_verified:4,blocked_rules_written:73});
assert.throws(()=>validateMediaRejections({...document,denominator:{...document.denominator,rules:143}}),/denominator\.rules/);

const fixtureRoot=await mkdtemp(path.join(tmpdir(),"undercast-media-rejection-"));
try{
  const baseline=path.join(fixtureRoot,"baseline"),candidate=path.join(fixtureRoot,"candidate"),out=path.join(fixtureRoot,"out");
  await mkdir(path.join(baseline,"data"),{recursive:true});await mkdir(path.join(candidate,"data"),{recursive:true});await mkdir(path.join(candidate,"images"),{recursive:true});
  const baseRecord={id:campaignRule.wall_id,actor:campaignRule.expected_subject,character:"Fixture role",portrait:null,still:null};
  const candidateAsset={src:"images/candidate.jpg",kind:"copyright",origin:campaignRule.source_locator};
  await writeFile(path.join(baseline,"data/specimens.json"),JSON.stringify([baseRecord]));
  await writeFile(path.join(baseline,"data/media-manifest.json"),JSON.stringify({assets:{}}));
  await writeFile(path.join(baseline,"data/MEDIA-REJECTIONS.json"),JSON.stringify(document));
  await writeFile(path.join(candidate,"data/specimens.json"),JSON.stringify([{...baseRecord,portrait:candidateAsset}]));
  await writeFile(path.join(candidate,"images/candidate.jpg"),"fixture candidate bytes");
  const planPath=path.join(fixtureRoot,"plan.json"),journal=path.join(fixtureRoot,"journal.jsonl"),latest=path.join(fixtureRoot,"latest.json");
  await writeFile(planPath,JSON.stringify({candidates:[{wall_id:campaignRule.wall_id,side:"portrait",expected_subject:campaignRule.expected_subject,reason:"missing-evidence"}]}));
  const run=spawnSync(process.execPath,["scripts/media-search-report.mjs","--baseline",baseline,"--candidate",candidate,"--plan",planPath,"--out",out,"--journal",journal,"--latest",latest,"--run-id","fixture"],{cwd:process.cwd(),encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(readFileSync(path.join(out,"report.json"),"utf8"));
  assert.equal(report.counts.rejected,1);assert.equal(report.results[0].rejection.rule_id,campaignRule.rule_id);
  assert.equal(existsSync(path.join(out,"images/candidate.jpg")),false,"rejected bytes entered candidate artifact");
  const event=JSON.parse(readFileSync(journal,"utf8").trim());assert.equal(event.result,"rejected");assert.equal(event.rejection_rule_id,campaignRule.rule_id);
}finally{await rm(fixtureRoot,{recursive:true,force:true});}
console.log("media search fixtures: PASS — cadence, 144 exact rejections, artifact exclusion and journal receipts are fail-closed");
