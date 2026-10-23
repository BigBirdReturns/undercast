// One maintained index of prepared display assets, including immutable old batches.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const PHOTO_INDEX='data/PHOTO-PREPARATIONS.json';
export const textDigest=b=>digest(Buffer.from(b.toString('utf8').replace(/\r\n/g,'\n')));
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const fingerprint=v=>digest(Buffer.from(JSON.stringify(stable(v))));
export function photoPath(root,relative){
 assert.equal(typeof relative,'string');assert(relative&&!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.split('/').includes('..'),'unsafe photo path');
 const base=path.resolve(root),target=path.resolve(base,relative);assert(target.startsWith(base+path.sep),'photo path escapes checkout');
 let p=target;while(p!==base){if(fs.existsSync(p))assert(!fs.lstatSync(p).isSymbolicLink(),'photo symlink refused');p=path.dirname(p);}return target;
}
export function preparationIndex(root){
 const document=JSON.parse(fs.readFileSync(photoPath(root,PHOTO_INDEX)));
 assert.equal(document.version,1);assert(Array.isArray(document.ledgers));assert.equal(new Set(document.ledgers).size,document.ledgers.length,'duplicate preparation ledger');
 for(const p of document.ledgers)assert(/^data\/review\/[a-z0-9][a-z0-9-]*\/changes\.json$/.test(p),'unsafe preparation ledger path');
 return document;
}
export function preparationRows(root){
 return preparationIndex(root).ledgers.flatMap(ledger=>{
  const doc=JSON.parse(fs.readFileSync(photoPath(root,ledger)));assert(Array.isArray(doc.changes),'missing preparation changes');
  return doc.changes.map(row=>({...row,ledger}));
 });
}
export function validateBatchReviews(document,source,display){
 assert.equal(source.run_id,document.run_id);assert.equal(display.run_id,document.run_id);
 for(const review of [source,display]){assert.equal(review.reviewer_kind,'agent');assert(review.reviewer?.trim().length>=3,'explicit retained reviewer required');}
 for(const row of document.changes){
  const chosen=source.selections.filter(s=>s.candidate_key===row.candidate_key&&s.action==='select');
  assert.equal(chosen.length,1,'prepared image lacks one exact source selection');assert.equal(chosen[0].id,row.id);assert.equal(chosen[0].side,row.side);
  assert.deepEqual(row.source_review,chosen[0],'retained source decision differs from prepared image');
  assert.equal(row.candidate_key,fingerprint(Object.fromEntries(['id','side','record_sha256','source_sha256','origin'].map(k=>[k,row[k]]))),'prepared source identity drift');
  const approved=display.decisions.filter(d=>d.candidate_key===row.candidate_key&&d.decision==='approve');
  assert.equal(approved.length,1,'prepared image lacks one exact display approval');assert.equal(approved[0].display_sha256,row.display_sha256);assert.equal(approved[0].recipe_sha256,fingerprint(row.operations),'approved recipe changed');
  assert(approved[0].note?.trim().length>=12,'display judgment missing');
 }
}
export function preparationInputs(root){
 const index=preparationIndex(root),files=new Set([PHOTO_INDEX,...index.ledgers]);
 for(const ledger of index.ledgers){
  const doc=JSON.parse(fs.readFileSync(photoPath(root,ledger)));
  // Legacy batches retain their already-qualified publication dependency boundary.
  // Reusable batches bind exact reviews, documentary snapshots and parent bytes.
  if(doc.version!==2)continue;
  for(const key of ['source_review','display_review']){
   const r=doc[key];assert(r&&r.path&&r.sha256,'review binding missing');
   assert.equal(textDigest(fs.readFileSync(photoPath(root,r.path))),r.sha256,'review bytes changed');files.add(r.path);
  }
  validateBatchReviews(doc,JSON.parse(fs.readFileSync(photoPath(root,doc.source_review.path))),JSON.parse(fs.readFileSync(photoPath(root,doc.display_review.path))));
  const prefix=path.posix.dirname(ledger)+'/';
  for(const row of doc.changes){
   assert(row.source_path.startsWith(prefix+'source-bytes/'),'parent outside owned batch');files.add(row.source_path);
   assert.equal(digest(fs.readFileSync(photoPath(root,row.source_path))),row.source_sha256,'prepared parent changed');
   for(const d of row.documents||[]){assert(d.path.startsWith(prefix+'documents/'),'document outside owned batch');assert.equal(digest(fs.readFileSync(photoPath(root,d.path))),d.sha256,'document changed');files.add(d.path);}
  }
 }
 return [...files].sort();
}
export function validateActivePreparations(root,records){
 const index=preparationIndex(root),roots=index.ledgers.map(p=>path.posix.dirname(p)+'/source-bytes/');
 const entries=new Map(preparationRows(root).filter(r=>r.after).map(r=>[`${r.id}/${r.side}`,r]));
 preparationInputs(root);
 for(const record of records)for(const side of ['still','portrait'])if(record[side]?.processing){
  const row=entries.get(`${record.id}/${side}`);assert(row,`missing preparation ${record.id}/${side}`);assert.deepEqual(record[side],row.after,`mismatched preparation ${record.id}/${side}`);
  assert(roots.some(prefix=>row.source_path.startsWith(prefix)),'parent outside registered preparation roots');
  assert.equal(digest(fs.readFileSync(photoPath(root,row.source_path))),row.source_sha256,'parent bytes changed');
  assert.equal(digest(fs.readFileSync(photoPath(root,row.after.src))),row.display_sha256,'display bytes changed');
  assert(row.operations?.length&&row.operations.every(op=>['crop','lanczos-resize','opencv-fastNlMeansDenoisingColored','jpeg-encode','identity-copy'].includes(op.operation)),'unrecognized preparation operation');
 }
 return entries;
}
