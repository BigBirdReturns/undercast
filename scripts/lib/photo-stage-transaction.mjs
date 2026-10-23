// Prepare with the existing photo/audit/projection code in a disposable tree.
// Only a validated, hash-bound file set may enter the requested checkout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {digest,photoPath,textDigest} from './photo-preparations.mjs';

const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const rawGit=(root,...args)=>execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
const gitPath=(root,name)=>path.resolve(root,git(root,'rev-parse','--git-path',name));
const hashFile=file=>fs.existsSync(file)?digest(fs.readFileSync(file)):null;
const read=file=>JSON.parse(fs.readFileSync(file));
function durableFile(file,bytes){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const tmp=file+'.photo-write';
 assert(!fs.existsSync(tmp)||(!fs.lstatSync(tmp).isSymbolicLink()&&fs.lstatSync(tmp).isFile()),'unsafe transaction temporary file');
 const fd=fs.openSync(tmp,'w');
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(tmp,file);
 // Windows does not support fsync on a directory handle.
 if(process.platform!=='win32'){const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
}
const save=(file,value)=>durableFile(file,Buffer.from(JSON.stringify(value,null,2)+'\n'));
const inputs=run=>Object.fromEntries(['plan.json','source-review.json','prepared.json','display-review.json'].map(p=>[p,textDigest(fs.readFileSync(photoPath(run,p)))]));
const changedPaths=root=>[...new Set([
 ...rawGit(root,'diff','--name-only','-z','HEAD').toString().split('\0'),
 ...rawGit(root,'ls-files','--others','--exclude-standard','-z').toString().split('\0')
].filter(Boolean))].sort();

export async function withPhotoWriter(root,recover,fn){
 const file=gitPath(root,'photo-maintenance.lock');
 if(recover&&fs.existsSync(file)){
  const original=fs.readFileSync(file),owner=JSON.parse(original);
  assert(owner.hostname===os.hostname()&&Number.isInteger(owner.pid),'cannot recover a foreign or unidentified writer lock');
  let dead=false;try{process.kill(owner.pid,0);}catch(error){if(error.code==='ESRCH')dead=true;else throw error;}
  assert(dead,'photo staging writer is still alive');
  assert(fs.readFileSync(file).equals(original),'writer lock changed during recovery');
  fs.unlinkSync(file);
 }
 let fd;try{fd=fs.openSync(file,'wx');}catch(error){if(error.code==='EEXIST')throw new Error('Photo staging writer already holds this checkout; after a stopped worker use stage --recover');throw error;}
 const token=randomUUID();
 try{
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,hostname:os.hostname(),token,started_at:new Date().toISOString()}));fs.fsyncSync(fd);
  return await fn();
 }finally{
  fs.closeSync(fd);
  if(fs.existsSync(file)&&read(file).token===token)fs.unlinkSync(file);
 }
}

// hooks are only injectable by tests importing this function, never a CLI bypass.
export async function promotePhotoStage({root,run,prepare,validate,hooks={}}){
 const journal=gitPath(root,'photo-maintenance-transaction.json');
 let txn;
 if(fs.existsSync(journal)){
  txn=read(journal);
  assert.equal(txn.version,1);assert.equal(txn.root,root);assert.equal(txn.run,run,'another photo run needs recovery first');
  assert.equal(txn.head,git(root,'rev-parse','HEAD'),'checkout HEAD changed during interrupted staging');
  assert.deepEqual(txn.inputs,inputs(run),'reviewed input changed during interrupted staging');
 }else{
  assert.equal(git(root,'status','--porcelain','--untracked-files=all'),'','stage requires a clean isolated checkout');
  const head=git(root,'rev-parse','HEAD');
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'undercast-photo-stage-')),tree=path.join(parent,'tree');
  const requestedInputs=inputs(run);
  let added=false;
  try{
   git(root,'worktree','add','--detach',tree,head);added=true;
   const result=await prepare(tree);
   if(result.changes===0)return result;
   await validate(tree);
   assert.deepEqual(inputs(run),requestedInputs,'review inputs changed while preparing');
   await hooks.prepared?.(tree);
   assert.equal(git(root,'rev-parse','HEAD'),head,'checkout HEAD changed while preparing');
   assert.equal(git(root,'status','--porcelain','--untracked-files=all'),'','checkout changed while preparing; no promotion');
   const files=changedPaths(tree);
   if(!files.length)return result;
   assert(files.every(p=>/^(?:data|images)\//.test(p)),'photo staging wrote outside data/images');
   const storage=gitPath(root,'photo-maintenance-objects');fs.mkdirSync(storage,{recursive:true});
   txn={version:1,root,run,head,inputs:requestedInputs,result,files:[]};
   for(const relative of files){
    const next=photoPath(tree,relative),prior=photoPath(root,relative);
    assert(fs.existsSync(next)&&fs.lstatSync(next).isFile(),'photo staging must not delete files or add symlinks');
    assert(!fs.existsSync(prior+'.photo-write'),'transaction temporary path already exists');
    const bytes=fs.readFileSync(next),after=digest(bytes),object=path.join(storage,after);
    if(fs.existsSync(object))assert.equal(hashFile(object),after,'corrupt retained transaction object');else durableFile(object,bytes);
    txn.files.push({path:relative,before:hashFile(prior),after});
   }
   // The full validated write set is durable before the first canonical write.
   save(journal,txn);
  }finally{
   if(added)git(root,'worktree','remove','--force',tree);
   fs.rmSync(parent,{recursive:true,force:true});
  }
 }
 assert(Array.isArray(txn.files)&&txn.files.length>0);
 assert.equal(new Set(txn.files.map(f=>f.path)).size,txn.files.length,'duplicate transaction path');
 const allowed=new Set(txn.files.flatMap(f=>[f.path,f.path+'.photo-write']));
 assert(changedPaths(root).every(p=>allowed.has(p)),'unrelated checkout changes block recovery');
 // Check the entire batch before writing any remainder. Never overwrite an edit
 // that is neither the recorded predecessor nor the exact prepared successor.
 for(const f of txn.files){
  assert(/^(?:data|images)\//.test(f.path));assert(/^[a-f0-9]{64}$/.test(f.after));
  const target=photoPath(root,f.path),actual=hashFile(target);
  assert(actual===f.before||actual===f.after,`intervening edit blocks photo recovery: ${f.path}`);
  const object=gitPath(root,'photo-maintenance-objects/'+f.after);
  assert.equal(hashFile(object),f.after,'retained successor bytes changed');
  const temporary=photoPath(root,f.path+'.photo-write');
  if(fs.existsSync(temporary)){
   const partial=fs.readFileSync(temporary),full=fs.readFileSync(object);
   assert(partial.length<=full.length&&full.subarray(0,partial.length).equals(partial),`intervening temporary edit blocks recovery: ${f.path}`);
  }
 }
 for(const [index,f] of txn.files.entries()){
  const target=photoPath(root,f.path);
  if(hashFile(target)!==f.after||fs.existsSync(target+'.photo-write'))durableFile(target,fs.readFileSync(gitPath(root,'photo-maintenance-objects/'+f.after)));
  await hooks.written?.(index,f);
 }
 await validate(root);
 await hooks.validated?.();
 // Success is recorded only after current-tree audit and projection validation.
 save(photoPath(run,'staged.json'),txn.result);
 fs.unlinkSync(journal);
 return txn.result;
}

export function hasPhotoTransaction(root){return fs.existsSync(gitPath(root,'photo-maintenance-transaction.json'));}
