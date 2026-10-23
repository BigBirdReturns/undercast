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
  validateComposition(row,approved[0],document.composition_review===true);
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

// Source identity and visual composition have independent, hash-bound claims.
// These constraints describe a reviewer-marked region, never a face detector vote.
const namedPosition={left:0,top:0,upper:28,center:50,lower:72,right:100,bottom:100};
const position=(a,axis,fallback)=>{
 const value=a.focus?.[axis]??fallback;const number=typeof value==='number'?value:namedPosition[value];
 assert(Number.isFinite(number)&&number>=0&&number<=100,'invalid composition focus');return number/100;
};
export function frameComposition(row,width,height,actual=null){
 const c=row.composition;assert(c,'composition contract missing');
 const [w,h]=row.display_dimensions;assert([w,h,width,height].every(n=>Number.isFinite(n)&&n>0),'invalid frame dimensions');
 const asset=row.after,fit=actual?.fit||asset.fit||'cover';assert(['cover','contain'].includes(fit));
 const p=actual?.position?.split(/\s+/).map(v=>Number.parseFloat(v)/100);
 if(p)assert(p.length===2&&actual.position.split(/\s+/).every(v=>/^\d+(?:\.\d+)?%$/.test(v)),'unexpected actual focal position');
 const fx=p?p[0]:position(asset,'x',50),fy=p?p[1]:position(asset,'y',28);
 assert.equal(fit,asset.fit||'cover','actual fit differs from reviewed fit');
 assert(Math.abs(fx-position(asset,'x',50))<1e-6&&Math.abs(fy-position(asset,'y',28))<1e-6,'actual focus differs from approved composition');
 const scale=(fit==='contain'?Math.min:Math.max)(width/w,height/h),ox=(width-w*scale)*fx,oy=(height-h*scale)*fy;
 const [x0,y0,x1,y1]=c.display_region_px;
 const region=[ox+x0*scale,oy+y0*scale,ox+x1*scale,oy+y1*scale];
 const margin=c.min_margin_fraction,max=c.max_height_fraction;
 assert(region[0]>=width*margin-1e-6&&region[1]>=height*margin-1e-6&&region[2]<=width*(1-margin)+1e-6&&region[3]<=height*(1-margin)+1e-6,'protected subject region clipped or required margin lost');
 assert((region[3]-region[1])/height<=max+1e-6,'protected region exceeds reviewed frame occupancy; image too tight');
 return {frame:[width,height],region,region_height_fraction:(region[3]-region[1])/height,pass:true};
}
export function validateComposition(row,decision=null,required=false){
 if(!required&&!row.composition_required&&!row.composition)return [];
 assert(row.composition&&row.source_review?.composition,'explicit source and display composition required');
 const c=row.composition,s=row.source_review.composition;
 assert.equal(c.version,1);assert.equal(c.max_height_fraction,s.max_height_fraction);assert.equal(c.min_margin_fraction,s.min_margin_fraction);
 assert(Number.isFinite(c.max_height_fraction)&&c.max_height_fraction>=.1&&c.max_height_fraction<=1);
 assert(Number.isFinite(c.min_margin_fraction)&&c.min_margin_fraction>=0&&c.min_margin_fraction<=.2);
 let [w,h]=row.source_dimensions;let r=s.protected_region_px?.slice();
 assert(Array.isArray(r)&&r.length===4&&r.every(Number.isFinite),'four finite protected-region coordinates required');
 const inside=()=>assert(r[0]>=0&&r[1]>=0&&r[2]>r[0]&&r[3]>r[1]&&r[2]<=w&&r[3]<=h,'protected region outside retained pixels');inside();
 for(const op of row.operations){
  if(op.operation==='crop'){const [l,t,right,b]=op.box_px;r=[r[0]-l,r[1]-t,r[2]-l,r[3]-t];w=right-l;h=b-t;inside();}
  else if(op.operation==='lanczos-resize'){const [nw,nh]=op.size;r=r.map((v,i)=>v*(i%2?nh/h:nw/w));w=nw;h=nh;}
 }
 assert.deepEqual([w,h],row.display_dimensions,'composition dimensions differ from preparation');
 assert(Array.isArray(c.display_region_px)&&c.display_region_px.length===4&&r.every((v,i)=>Math.abs(v-c.display_region_px[i])<1e-6),'source region transformed differently');
 if(decision)assert.equal(decision.composition_sha256,fingerprint(c),'display approval is not bound to composition');
 return [[320,240],[320,400]].map(([w,h])=>frameComposition(row,w,h));
}
