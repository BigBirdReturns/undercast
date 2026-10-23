#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promotePhotoStage,withPhotoWriter,hasPhotoTransaction} from './lib/photo-stage-transaction.mjs';
const git=(r,...a)=>execFileSync('git',a,{cwd:r,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const put=(r,p,s)=>{fs.mkdirSync(path.dirname(path.join(r,p)),{recursive:true});fs.writeFileSync(path.join(r,p),s);};
const get=(r,p)=>fs.readFileSync(path.join(r,p),'utf8');
async function prepare(tree){
 put(tree,'data/a.json','new-a\n');put(tree,'data/b.json','new-b\n');put(tree,'images/new.jpg','new-image\n');
 return {state:'staged-not-published',changes:1,run_id:'fixture'};
}
async function validate(tree){assert.equal(get(tree,'data/a.json'),'new-a\n');assert.equal(get(tree,'data/b.json'),'new-b\n');assert.equal(get(tree,'images/new.jpg'),'new-image\n');}
if(process.argv[2]==='--crash-child'){
 const [root,run]=process.argv.slice(3);
 await withPhotoWriter(root,false,()=>promotePhotoStage({root,run,prepare,validate,hooks:{written:i=>{if(i===0)process.kill(process.pid,'SIGKILL');}}}));
 throw Error('crash was not injected');
}
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'undercast-stage-recovery-fixture-'));let count=0;
function fixture(){
 const directory=path.join(parent,String(count++)),root=path.join(directory,'checkout'),run=path.join(directory,'run');fs.mkdirSync(root,{recursive:true});fs.mkdirSync(run);
 git(root,'init','-q','-b','fixture');git(root,'config','user.name','Photo recovery fixture');git(root,'config','user.email','fixture@example.invalid');
 put(root,'data/a.json','old-a\n');put(root,'data/b.json','old-b\n');git(root,'add','.');git(root,'commit','-qm','fixture base');
 for(const n of ['plan','source-review','prepared','display-review'])put(run,n+'.json','{}\n');
 return {root,run,prepare,validate};
}
const unchanged=x=>{assert.equal(get(x.root,'data/a.json'),'old-a\n');assert.equal(git(x.root,'status','--porcelain'),'');};
const fail=()=>{throw Error('injected failure');};
try{
 let x=fixture();await assert.rejects(()=>promotePhotoStage({...x,prepare:async tree=>{await prepare(tree);fail();}}),/injected/);unchanged(x);assert(!hasPhotoTransaction(x.root));console.log('PASS preparation failure leaves requested checkout byte-clean');
 x=fixture();await assert.rejects(()=>promotePhotoStage({...x,validate:fail}),/injected/);unchanged(x);assert(!hasPhotoTransaction(x.root));console.log('PASS downstream audit/projection failure cannot reach requested checkout');
 x=fixture();await assert.rejects(()=>promotePhotoStage({...x,hooks:{prepared:()=>put(x.root,'data/a.json','external edit\n')}}),/checkout changed/);assert.equal(get(x.root,'data/a.json'),'external edit\n');assert(!hasPhotoTransaction(x.root));console.log('PASS concurrent unrelated edit during preparation is preserved');
 x=fixture();await assert.rejects(()=>promotePhotoStage({...x,hooks:{written:i=>{if(i===0)fail();}}}),/injected/);assert(hasPhotoTransaction(x.root));assert(!fs.existsSync(path.join(x.run,'staged.json')));
 let rootChecks=0;await promotePhotoStage({...x,prepare:()=>{throw Error('must reuse exact prepared set');},validate:async tree=>{rootChecks++;await validate(tree);}});assert.equal(rootChecks,1);assert(!hasPhotoTransaction(x.root));console.log('PASS interrupted promotion resumes exact remaining files and validates before success');
 x=fixture();await assert.rejects(()=>promotePhotoStage({...x,hooks:{written:()=>fail()}}),/injected/);put(x.root,'data/b.json','external edit\n');await assert.rejects(()=>promotePhotoStage(x),/intervening edit/);assert.equal(get(x.root,'data/b.json'),'external edit\n');console.log('PASS recovery refuses intervening edits instead of overwriting them');
 x=fixture();await assert.rejects(()=>promotePhotoStage({...x,hooks:{written:()=>fail()}}),/injected/);put(x.run,'display-review.json','{"changed":true}\n');await assert.rejects(()=>promotePhotoStage(x),/reviewed input changed/);console.log('PASS recovery refuses changed reviews');
 x=fixture();await assert.rejects(()=>promotePhotoStage({...x,hooks:{written:()=>fail()}}),/injected/);put(x.root,'data/b.json.photo-write','new-');await promotePhotoStage(x);assert(!fs.existsSync(path.join(x.root,'data/b.json.photo-write')));console.log('PASS interrupted temporary file write resumes without residual files');
 x=fixture();let attempts=0;await assert.rejects(()=>promotePhotoStage({...x,validate:async tree=>{if(tree===x.root){attempts++;fail();}await validate(tree);}}),/injected/);assert(!fs.existsSync(path.join(x.run,'staged.json')));await promotePhotoStage({...x,validate:async tree=>{attempts++;await validate(tree);}});assert.equal(attempts,2);console.log('PASS final validation failure stays recoverable and retry reruns checks');
 x=fixture();const dead=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--crash-child',x.root,x.run],{encoding:'utf8'});assert(dead.signal==='SIGKILL'||dead.status!==0);assert(hasPhotoTransaction(x.root));await assert.rejects(()=>withPhotoWriter(x.root,false,()=>promotePhotoStage(x)),/writer already holds/);
 await withPhotoWriter(x.root,true,()=>promotePhotoStage(x));await validate(x.root);assert(!fs.existsSync(path.join(x.root,'.git/photo-maintenance.lock')));console.log('PASS real killed worker leaves recoverable journal; --recover verifies dead owner and completes');
 x=fixture();put(x.root,'.git/photo-maintenance.lock',JSON.stringify({pid:process.pid,hostname:os.hostname()}));await assert.rejects(()=>withPhotoWriter(x.root,true,()=>promotePhotoStage(x)),/still alive/);unchanged(x);console.log('PASS recovery cannot steal a live writer lock');
 console.log(`photo staging recovery fixtures: PASS ${count}; no network, models or user-worktree writes`);
}finally{fs.rmSync(parent,{recursive:true,force:true});}
