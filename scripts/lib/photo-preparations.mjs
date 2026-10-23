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
