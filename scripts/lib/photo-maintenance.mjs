// Apply named, source-bound and display-bound decisions in an isolated worktree.
// This prepares a normal reviewed change; it never commits, pushes or deploys.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,textDigest,fingerprint,photoPath,preparationIndex,validateActivePreparations,validateComposition,PHOTO_INDEX} from './photo-preparations.mjs';
import {indexMediaRejections,matchMediaRejection} from './media-rejections.mjs';
import {withPhotoWriter,promotePhotoStage,hasPhotoTransaction} from './photo-stage-transaction.mjs';
const ownRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>JSON.parse(fs.readFileSync(p));
const json=v=>JSON.stringify(v,null,2)+'\n';
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});const t=p+'.photo-tmp';fs.writeFileSync(t,json(v));fs.renameSync(t,p);};
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
const text=v=>Array.isArray(v)?v.map(text).join('\n'):v&&typeof v==='object'?Object.values(v).map(text).join('\n'):typeof v==='string'?v.replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[s])):'';
export function validateReview({plan,source,prepared,display,run,records,rejections}){
 assert.equal(source.run_id,plan.run_id);assert.equal(prepared.run_id,plan.run_id);assert.equal(display.run_id,plan.run_id);
 assert.equal(source.reviewer_kind,'agent');assert.equal(display.reviewer_kind,'agent');
 for(const r of [source,display])assert(typeof r.reviewer==='string'&&r.reviewer.trim().length>=3,'explicit agent reviewer required');
 assert.equal(prepared.source_review_sha256,textDigest(fs.readFileSync(photoPath(run,'source-review.json'))),'source review changed after preparation');
 assert.equal(display.prepared_sha256,textDigest(fs.readFileSync(photoPath(run,'prepared.json'))),'display review is stale');
 const facets=new Map(plan.facets.map(f=>[`${f.id}/${f.side}`,f]));
 assert.equal(source.selections.length,facets.size);assert.equal(new Set(source.selections.map(s=>`${s.id}/${s.side}`)).size,facets.size,'duplicate source review');
 for(const s of source.selections){assert(facets.has(`${s.id}/${s.side}`));assert(['select','keep','defer','reject'].includes(s.action),'unresolved source decision');assert(s.reason?.trim().length>=12,'source decision rationale required');}
 const selected=source.selections.filter(s=>s.action==='select');assert.equal(prepared.changes.length,selected.length,'prepared selection coverage drift');
 assert.equal(display.decisions.length,selected.length);assert.equal(new Set(display.decisions.map(d=>d.candidate_key)).size,selected.length,'duplicate display review');
 const changes=[];
 for(const row of prepared.changes){
  const review=selected.find(r=>r.candidate_key===row.candidate_key);assert(review,'unselected prepared candidate');
  assert.equal(review.id,row.id);assert.equal(review.side,row.side);
  const decision=display.decisions.find(d=>d.candidate_key===row.candidate_key);assert(decision&&['approve','reject'].includes(decision.decision),'unresolved display approval');
  assert.equal(decision.display_sha256,row.display_sha256);assert.equal(decision.recipe_sha256,fingerprint(row.operations));assert(decision.note?.trim().length>=12,'display review rationale required');
  const current=records.find(r=>r.id===row.id);assert(current,'staged records must enter canonical collection through the existing ingestion process first');
  assert.equal(fingerprint(current),row.record_sha256,'record changed since candidate preparation');
  assert.equal(row.record_sha256,facets.get(`${row.id}/${row.side}`)?.record_sha256);
  assert.deepEqual(current[row.side]||null,row.before||null,'stale image binding');
  const raw=fs.readFileSync(photoPath(run,row.source_path)),image=fs.readFileSync(photoPath(run,row.display_path));
  assert.equal(digest(raw),row.source_sha256);assert.equal(digest(image),row.display_sha256);
  assert.equal(row.after.src,`images/photo-${row.display_sha256.slice(0,16)}${path.extname(row.display_path)}`,'display path not content-addressed');
  assert(/^images\/photo-[a-f0-9]{16}\.(jpg|png|webp)$/.test(row.after.src),'unsupported published image type');
  assert.equal(row.reviewer_kind,'agent');assert.equal(row.actor,current.actor);assert.equal(row.character,current.character);
  assert.equal(row.candidate_key,fingerprint(Object.fromEntries(['id','side','record_sha256','source_sha256','origin'].map(k=>[k,row[k]]))),'candidate binding changed');
  assert(row.operations.length&&row.operations.every(o=>['crop','lanczos-resize','jpeg-encode','identity-copy'].includes(o.operation)),'unreviewed operation');
  assert.equal(row.after.origin,row.origin);assert.equal(row.after.fit,review.fit);assert.deepEqual(row.after.focus,review.focus);
  assert(['cover','contain'].includes(row.after.fit));assert(row.after.processing?.endsWith('No generated detail.'));
  for(const value of Object.values(row.after.focus))assert(['center','top','bottom','upper','lower','left','right'].includes(value)||(Number.isInteger(value)&&value>=0&&value<=100),'unsafe focus');
  assert(!matchMediaRejection(rejections,{wallId:row.id,side:row.side,origin:row.origin,sha256:row.source_sha256}),'source is rejected');
  assert(!matchMediaRejection(rejections,{wallId:row.id,side:row.side,origin:row.origin,sha256:row.display_sha256}),'derivative is rejected');
  assert(review.evidence?.length,'documentary identity evidence required');
  for(const ev of review.evidence){
   const doc=row.documents.find(d=>d.sha256===ev.document_sha256);assert(doc,'unknown source snapshot');
   const bytes=fs.readFileSync(photoPath(run,doc.path));assert.equal(digest(bytes),doc.sha256);
   assert(ev.quote?.length>=12&&text(JSON.parse(bytes)).includes(ev.quote),'documentary quote does not exist in retained bytes');
  }
  if(decision.decision==='approve'){validateComposition(row,decision,plan.composition_review===true);changes.push(row);}
 }
 return changes;
}
async function stageLocked(argv,{sandbox=false}={}){
 const option=(k,defaultValue)=>{const i=argv.indexOf(k);return i<0?defaultValue:argv[i+1];};
 const root=path.resolve(option('--root',ownRoot)),run=path.resolve(option('--run',''));
 assert(root!==run&&!run.startsWith(root+path.sep),'run must be outside checkout');
 const plan=read(photoPath(run,'plan.json')),source=read(photoPath(run,'source-review.json')),prepared=read(photoPath(run,'prepared.json')),display=read(photoPath(run,'display-review.json'));
 assert(/^[a-f0-9]{20}$/.test(plan.run_id),'invalid run ID');
 assert.equal(display.prepared_sha256,textDigest(fs.readFileSync(photoPath(run,'prepared.json'))),'display review is stale');
 const directory=`data/review/photo-${plan.run_id}`,ledgerPath=directory+'/changes.json';
 const records=read(photoPath(root,'data/specimens.json')),sources=read(photoPath(root,'data/SOURCES.json'));
 const index=preparationIndex(root);
 if(index.ledgers.includes(ledgerPath)){
  const prior=read(photoPath(root,ledgerPath));
  assert.equal(prior.source_review.sha256,textDigest(fs.readFileSync(photoPath(run,'source-review.json'))));assert.equal(prior.display_review.sha256,textDigest(fs.readFileSync(photoPath(run,'display-review.json'))));
  for(const row of prior.changes)assert.deepEqual(records.find(r=>r.id===row.id)?.[row.side],row.after,'staged batch was superseded; do not reapply it');
  validateStagedTree(root);return {state:'already-staged',run_id:plan.run_id,changes:0,canonical_writes:0};
 }
 if(!sandbox){const branch=git(root,'branch','--show-current');assert(branch&&!['main','master'].includes(branch),'stage only into a named isolated branch');}
 assert.equal(git(root,'status','--porcelain','--untracked-files=all'),'','stage requires a clean isolated checkout');
 const rejectionIndex=indexMediaRejections(read(photoPath(root,'data/MEDIA-REJECTIONS.json')));
 const changes=validateReview({plan,source,prepared,display,run,records,rejections:rejectionIndex});
 if(!changes.length)return {state:'review-complete-no-media-change',run_id:plan.run_id,changes:0,canonical_writes:0};
 const python=process.env.PHOTO_PYTHON||'python3';
 const replay=spawnSync(python,[path.join(root,'scripts/replay-photo-preparations.py'),'--run',run],{cwd:root,encoding:'utf8'});
 assert.equal(replay.status,0,replay.stderr||replay.stdout||'source replay failed');
 for(const row of changes)if(row.before)assert.equal(digest(fs.readFileSync(photoPath(root,row.before.src))),row.before_sha256,'current source bytes changed');
 const original=structuredClone(records),owned=photoPath(root,directory);fs.mkdirSync(owned,{recursive:false});
 const copied=[];
 const retain=(relative,bytes)=>{const target=photoPath(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target))assert.equal(digest(fs.readFileSync(target)),digest(bytes),'refuse replacing retained bytes');else fs.writeFileSync(target,bytes);copied.push(relative);};
 for(const row of changes){
  const sourcePath=directory+'/source-bytes/'+path.basename(row.source_path);retain(sourcePath,fs.readFileSync(photoPath(run,row.source_path)));
  retain(row.after.src,fs.readFileSync(photoPath(run,row.display_path)));row.source_path=sourcePath;
  for(const doc of row.documents){const next=directory+'/documents/'+doc.sha256+'.capture';retain(next,fs.readFileSync(photoPath(run,doc.path)));doc.path=next;delete doc.text;}
  row.identity_basis='Explicit documentary source/file/production review; visual review addresses presentation, not facial identity.';
  row.reviewed_by=source.reviewer;row.reviewer_kind='agent';
  records.find(r=>r.id===row.id)[row.side]=structuredClone(row.after);
  const s=sources.find(r=>r.id===row.id);assert(s,'missing canonical source ledger');s[row.side]=structuredClone(row.after);s.fetched_at=new Date().toISOString().slice(0,10);
 }
 for(const name of ['plan.json','source-review.json','display-review.json'])retain(directory+'/'+name,Buffer.from(fs.readFileSync(photoPath(run,name),'utf8').replace(/\r\n/g,'\n')));
 const ledger={version:2,composition_review:plan.composition_review===true,run_id:plan.run_id,base_commit:plan.base_commit,reviewer_kind:'agent',source_review:{path:directory+'/source-review.json',sha256:textDigest(fs.readFileSync(photoPath(run,'source-review.json')))},display_review:{path:directory+'/display-review.json',sha256:textDigest(fs.readFileSync(photoPath(run,'display-review.json')))},changes};
 write(photoPath(root,ledgerPath),ledger);index.ledgers.push(ledgerPath);write(photoPath(root,PHOTO_INDEX),index);
 const nonMedia=r=>Object.fromEntries(Object.entries(r).filter(([key])=>!['still','portrait'].includes(key)));
 assert.deepEqual(records.map(nonMedia),original.map(nonMedia),'photo work changed non-media fields');
 write(photoPath(root,'data/specimens.json'),records);write(photoPath(root,'data/SOURCES.json'),sources);
 const logs=[];const execute=(script,args=[])=>{const p=spawnSync(process.execPath,[path.join(root,script),...args],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});logs.push({script,args,status:p.status,stdout:p.stdout,stderr:p.stderr});write(photoPath(run,'stage-checks.json'),logs);assert.equal(p.status,0,p.stderr||p.stdout);};
 execute('scripts/media-audit.mjs',['sync']);
 const audit=read(photoPath(root,'data/MEDIA-AUDIT.json'));
 const votes=changes.flatMap(row=>{
  const item=audit.items.find(r=>r.wall_id===row.id&&r.side===row.side);assert(item&&item.asset.sha256===row.display_sha256);
  return ['identity','presentation'].map(namespace=>({item_id:item.id,namespace,value:namespace==='identity'?'expected':row.side==='portrait'?'neutral-human':'character-depiction',asset_sha256:row.display_sha256,note:namespace==='identity'?row.source_review.reason:display.decisions.find(d=>d.candidate_key===row.candidate_key).note,reviewer_kind:'agent',evidence:[{type:'source',value:row.origin},{type:'preparation-ledger',value:ledgerPath+'#'+row.id+'/'+row.side},{type:'asset-sha256',value:row.display_sha256},{type:'source-bytes-sha256',value:row.source_sha256}]}));
 });
 const resolution={version:2,reviewed_by:source.reviewer,reviewed_role:'second-desk',reviewed_at:new Date().toISOString(),votes};write(photoPath(root,directory+'/resolutions.json'),resolution);
 execute('scripts/media-audit.mjs',['resolve','--input',directory+'/resolutions.json']);
 execute('scripts/shard.mjs');execute('scripts/validate.mjs');
 const result={state:'staged-not-published',run_id:plan.run_id,changes:changes.length,ledger:ledgerPath,originals_retained:true,non_media_parity:true,required_next:'Full canonical gate, actual-photo browser acceptance, reviewed merge and public readback'};
 if(!sandbox)write(photoPath(run,'staged.json'),result);return result;
}

function validateStagedTree(root){
 const records=read(photoPath(root,'data/specimens.json'));
 validateActivePreparations(root,records);
 for(const [script,args] of [['scripts/media-audit.mjs',['validate']],['scripts/validate.mjs',[]]]){
  const result=spawnSync(process.execPath,[path.join(root,script),...args],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
  assert.equal(result.status,0,result.stderr||result.stdout||'staged-tree validation failed');
 }
}

export async function stage(argv){
 const option=(name,fallback)=>{const i=argv.indexOf(name);return i<0?fallback:argv[i+1];};
 const root=path.resolve(option('--root',ownRoot)),run=path.resolve(option('--run',''));
 assert.equal(path.resolve(git(root,'rev-parse','--show-toplevel')),root,'stage root must be the checkout root');
 assert(root!==run&&!run.startsWith(root+path.sep),'run must be outside checkout');
 return withPhotoWriter(root,argv.includes('--recover'),async()=>{
  const id=read(photoPath(run,'plan.json')).run_id;
  assert(/^[a-f0-9]{20}$/.test(id),'invalid run ID');
  if(!hasPhotoTransaction(root)&&preparationIndex(root).ledgers.includes(`data/review/photo-${id}/changes.json`))return stageLocked(argv);
  const branch=git(root,'branch','--show-current');assert(branch&&!['main','master'].includes(branch),'stage only into a named isolated branch');
  return promotePhotoStage({root,run,prepare:tree=>stageLocked(['--root',tree,'--run',run],{sandbox:true}),validate:validateStagedTree});
 });
}
