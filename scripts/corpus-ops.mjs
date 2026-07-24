#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { jobCounts,auditCounts,nextOperation,readJson,requireFile,validateCollectionMode,validateEstateRegistry,evaluateProtectedChanges } from "./lib/corpus-ops.mjs";

const args=process.argv.slice(2),command=args[0]||"status";
const option=(name,fallback=null)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const jsonOut=args.includes("--json");
const mode=readJson("data/COLLECTION-MODE.json"),registry=readJson("data/ESTATE-REGISTRY.json"),scopes=readJson("data/AUTOPILOT-SCOPES.json");
const autopilot=readJson("data/AUTOPILOT.json"),audit=readJson("data/MEDIA-AUDIT.json");

function waterline(scope){
  const run=spawnSync(process.execPath,["scripts/waterline.mjs","status","--scope",scope,"--json"],{encoding:"utf8"});
  if(run.status!==0)return null;
  try{return JSON.parse(run.stdout);}catch{return null;}
}
function output(value){if(jsonOut)console.log(JSON.stringify(value,null,2));else if(typeof value==="string")console.log(value);else console.log(JSON.stringify(value,null,2));}
function validate(){
  const errors=[...validateCollectionMode(mode),...validateEstateRegistry(registry,scopes)];
  for(const path of ["docs/COLLECTION-OPERATIONS.md","scripts/media-search-plan.mjs","scripts/media-search-prepare.mjs","scripts/media-search-report.mjs",".github/workflows/collection-policy.yml"])requireFile(path,errors);
  const nightly=readFileSync(".github/workflows/nightly.yml","utf8");
  if(/grow\.mjs|ANTHROPIC_API_KEY|data\/specimens\.json/.test(nightly))errors.push("nightly workflow still contains a direct canonical-growth path");
  const retrieve=readFileSync(".github/workflows/retrieve.yml","utf8");
  if(!/media-search-plan\.mjs/.test(retrieve)||!/git worktree add/.test(retrieve))errors.push("retrieve workflow is not staged candidate search");
  if(/git add[^\n]*(?:data\/specimens\.json|data\/SOURCES\.json|images\/)/.test(retrieve))errors.push("rolling media search stages canonical media directly");
  const autopilotWorkflow=readFileSync(".github/workflows/autopilot.yml","utf8");
  if(!/refresh --due/.test(autopilotWorkflow)||!/autopilot -- sync/.test(autopilotWorkflow))errors.push("certified source refresh loop is missing");
  const gate=readFileSync("scripts/gate.mjs","utf8");
  if(!/collection-mode/.test(gate))errors.push("canonical gate omits collection-only validation");
  if(errors.length){for(const error of errors)console.error(`corpus-ops: ${error}`);process.exit(1);}
  output({status:"PASS",mode:mode.mode,estates:registry.estates.length,active:registry.estates.filter(row=>row.state==="active-corpus").map(row=>row.id)});
}
function status(){
  const rows=registry.estates.slice().sort((a,b)=>b.priority-a.priority).map(estate=>({id:estate.id,label:estate.label,state:estate.state,scope:estate.autopilot_scope,jobs:estate.autopilot_scope?jobCounts(autopilot.jobs,estate.autopilot_scope):null,media:estate.autopilot_scope?auditCounts(audit.items,estate.autopilot_scope):null,next_gate:estate.next_gate}));
  const active=rows.find(row=>row.state==="active-corpus"||row.state==="gold-reference");
  const wl=active?.scope?waterline(active.scope):null;
  output({mode:mode.mode,product_contract:mode.product_contract,active_scope:active?.scope||null,waterline:wl?{phase:wl.phase,claim_allowed:wl.claim_allowed}:null,estates:rows});
}
function next(){
  const active=registry.estates.find(row=>["active-corpus","gold-reference"].includes(row.state));
  const wl=active?.autopilot_scope?waterline(active.autopilot_scope):null;
  output(nextOperation({registry,jobs:autopilot.jobs,audit:audit.items,claimAllowed:wl?.claim_allowed}));
}
function checkPr(){
  const base=option("--base");if(!base)throw new Error("check-pr requires --base SHA");
  const eventPath=option("--event",process.env.GITHUB_EVENT_PATH);const event=eventPath?JSON.parse(readFileSync(eventPath,"utf8")):{};
  const diff=spawnSync("git",["diff","--name-only",`${base}...HEAD`],{encoding:"utf8"});if(diff.status!==0)throw new Error(diff.stderr||"git diff failed");
  const decision=spawnSync("git",["diff","--unified=0",`${base}...HEAD`,"--","docs/DECISIONS.md"],{encoding:"utf8"});
  const labels=(event.pull_request?.labels||[]).map(row=>row.name),body=event.pull_request?.body||"";
  const result=evaluateProtectedChanges({files:diff.stdout.trim().split(/\r?\n/).filter(Boolean),labels,body,decisionDiff:decision.stdout,mode});
  output(result);if(!result.ok)process.exit(2);
}

try{
  if(command==="validate")validate();else if(command==="status")status();else if(command==="next")next();else if(command==="check-pr")checkPr();else throw new Error(`unknown corpus command ${command}`);
}catch(error){console.error(`corpus-ops: ${error instanceof Error?error.message:String(error)}`);process.exit(1);}
