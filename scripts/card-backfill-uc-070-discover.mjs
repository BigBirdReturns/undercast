#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-070.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-070';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g,' ').trim().toLowerCase();
const slug=value=>norm(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'unknown';
const esc=value=>String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function extensionFor(mime){return mime==='image/jpeg'?'jpg':mime==='image/png'?'png':mime==='image/webp'?'webp':'bin'}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
function addCandidate(list,seen,candidate){if(!candidate?.url||!candidate?.source_page)return;let url;try{url=new URL(candidate.url,candidate.source_page).href.replace(/&amp;/g,'&')}catch{return}if(!/^https?:/.test(url)||seen.has(url))return;seen.add(url);list.push({...candidate,url})}
function candidateScore(row,source){const local=norm([row.alt,row.context,row.url].join(' '));let score=0;if(local.includes('davy jones'))score+=120;if(local.includes('bill nighy'))score+=80;if(local.includes("dead man's chest"))score+=35;if(local.includes('pirates of the caribbean'))score+=25;if(/tentacle|cephalopod|flying dutchman|captain|performance capture/.test(local))score+=15;if(row.kind==='metadata'&&source.key==='ilm-dead-mans-chest')score+=90;if(source.provider==='Industrial Light & Magic')score+=15;if(source.provider==='Disney Movies')score+=10;if(row.width>=1600||row.height>=1000)score+=16;else if(row.width>=900||row.height>=600)score+=9;if(/logo|icon|avatar|author|newsletter|advert|banner|favicon|sprite|placeholder|tracking|pixel|poster|cover|merch|toy|lego|game|animation still|trailer card|play button/.test(local))score-=180;if(/bill nighy unmasked|imocap suit|motion capture suit|behind the scenes/.test(local))score-=90;return score}
function isExactLocalContext(row,source){const local=norm([row.alt,row.context,row.url].join(' '));if(local.includes('davy jones'))return true;if(local.includes('bill nighy')&&(local.includes('pirates')||local.includes("dead man's chest")))return true;return row.kind==='metadata'&&source.key==='ilm-dead-mans-chest';}

async function inspectPage(context,source){
  const page=await context.newPage();
  try{
    const navigation=await page.goto(source.source_page,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForTimeout(1500);
    for(let index=0;index<6;index++){await page.mouse.wheel(0,1700);await page.waitForTimeout(250)}
    const body=await page.locator('body').innerText().catch(()=>''),html=await page.content(),hay=norm(body+' '+html);
    const missing=(source.required_terms||[]).filter(term=>!hay.includes(norm(term)));
    const screenshot=`pages/${source.key}.png`;
    await mkdir(join(OUT,'pages'),{recursive:true});
    await page.screenshot({path:join(OUT,screenshot),fullPage:true,animations:'disabled'});
    const images=await page.evaluate(()=>{
      const absolute=value=>{try{return new URL(value,document.baseURI).href}catch{return''}};
      const rows=[];
      for(const selector of['meta[property="og:image"]','meta[property="og:image:secure_url"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]'])for(const meta of document.querySelectorAll(selector))rows.push({url:absolute(meta.content),alt:'',width:0,height:0,context:'',kind:'metadata'});
      for(const image of document.images){
        const values=[image.currentSrc,image.src,image.dataset.src,image.dataset.lazySrc,image.dataset.original,image.dataset.image,image.getAttribute('data-lazy-src')].filter(Boolean);
        for(const source of image.closest('picture')?.querySelectorAll('source')||[])for(const part of String(source.srcset||'').split(',')){const value=part.trim().split(/\s+/)[0];if(value)values.push(value)}
        for(const part of String(image.srcset||image.dataset.srcset||'').split(',')){const value=part.trim().split(/\s+/)[0];if(value)values.push(value)}
        const figure=image.closest('figure');
        const scope=image.closest('figure,li,article,section,[class*="gallery"],[class*="slide"],[class*="carousel"]');
        const nearby=[image.alt,image.title,figure?.querySelector('figcaption')?.textContent,image.closest('[aria-label]')?.getAttribute('aria-label'),scope?.textContent?.slice(0,1400),image.parentElement?.textContent?.slice(0,700)].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,2200);
        for(const value of values)rows.push({url:absolute(value),alt:image.alt||'',width:image.naturalWidth||image.width||0,height:image.naturalHeight||image.height||0,context:nearby,kind:'dom-image'});
      }
      for(const element of document.querySelectorAll('*')){
        const background=getComputedStyle(element).backgroundImage;
        for(const match of String(background||'').matchAll(/url\(["']?([^"')]+)["']?\)/g)){
          const scope=element.closest('figure,li,article,section,[class*="gallery"],[class*="slide"],[class*="carousel"]');
          rows.push({url:absolute(match[1]),alt:'',width:0,height:0,context:[element.getAttribute('aria-label'),scope?.textContent?.slice(0,1400),element.textContent?.slice(0,600)].filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,2200),kind:'background-image'});
        }
      }
      return rows;
    });
    return{status:'loaded',http_status:navigation?.status()||null,title:await page.title(),resolved_url:page.url(),required_terms_missing:missing,body_text:body.slice(0,12000),screenshot,images};
  }catch(error){return{status:'error',error:error.message,images:[]}}finally{await page.close()}
}

async function download(context,candidate,index){
  let response;
  try{response=await context.request.get(candidate.url,{headers:{'User-Agent':UA,Referer:candidate.source_page,Accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.2'},timeout:60000,failOnStatusCode:false})}catch(error){return{...candidate,download_error:error.message}}
  if(!response.ok())return{...candidate,download_error:`HTTP ${response.status()}`};
  const bytes=Buffer.from(await response.body()),mime=signatureMime(bytes);
  if(bytes.length<12000||mime==='unknown')return{...candidate,download_error:`unusable ${bytes.length} ${mime}`};
  const local=`candidates/${String(index).padStart(2,'0')}-${slug(candidate.source_key)}-${slug(candidate.provider)}.${extensionFor(mime)}`,path=join(OUT,local);
  await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
  let dimensions={width:0,height:0};try{dimensions=identify(path)}catch{}
  if(dimensions.width<500||dimensions.height<300)return{...candidate,local,mime,bytes:bytes.length,sha256:sha(bytes),...dimensions,download_error:'image below 500x300 floor'};
  return{...candidate,local,mime,bytes:bytes.length,sha256:sha(bytes),...dimensions,resolved_url:response.url()||candidate.url};
}

const control=await readJson(CONTROL);
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-070','UC-070 control scope drift');
assert(control.actor==='Bill Nighy'&&control.character==='Davy Jones'&&control.side==='still','UC-070 identity boundary drift');
assert(control.selector_artifact?.artifact_id===8636606479&&control.selector_artifact?.head_sha==='a793cd5ef8a8349caa1995a82dcc912707fa4d9d','UC-070 selector custody drift');
assert(Array.isArray(control.sources)&&control.sources.length===4,'UC-070 source set drift');
await mkdir(OUT,{recursive:true});
const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({userAgent:UA,viewport:{width:1440,height:1100},locale:'en-US'});
try{
  const pageEvidence={},raw=[],seenUrls=new Set();
  for(const source of control.sources){
    const page=await inspectPage(context,source);pageEvidence[source.key]=page;
    if(page.status!=='loaded'||page.required_terms_missing?.length)continue;
    for(const image of page.images||[]){
      if(!isExactLocalContext(image,source))continue;
      const score=candidateScore(image,source);if(score<70)continue;
      addCandidate(raw,seenUrls,{provider:source.provider,source_key:source.key,source_page:source.source_page,label:image.alt||`${source.provider} Davy Jones image`,url:image.url,source_score:score,source_note:source.candidate_rule,local_context:image.context,kind:image.kind});
    }
  }
  assert(pageEvidence['disney-dead-mans-chest']?.status==='loaded'&&!pageEvidence['disney-dead-mans-chest']?.required_terms_missing?.length,'Disney Dead Man\'s Chest source boundary failed');
  assert(['ilm-dead-mans-chest','ilm-animation-history','ilm-about'].some(key=>pageEvidence[key]?.status==='loaded'&&!pageEvidence[key]?.required_terms_missing?.length),'No ILM source boundary survived');
  raw.sort((a,b)=>b.source_score-a.source_score||a.source_key.localeCompare(b.source_key)||a.url.localeCompare(b.url));
  const downloaded=[],seenHashes=new Set();
  for(const candidate of raw.slice(0,Number(control.max_candidates||48))){
    const row=await download(context,candidate,downloaded.length+1);
    if(row.sha256&&seenHashes.has(row.sha256))continue;
    if(row.sha256)seenHashes.add(row.sha256);
    if(row.sha256)row.repository_matches=repository.get(row.sha256)||[];
    downloaded.push(row);
  }
  const usable=downloaded.filter(row=>row.local&&!row.download_error);
  assert(usable.length>=2,`UC-070 orbit produced only ${usable.length} usable exact-context candidates`);
  const thumbs=[];let number=0;
  for(const row of usable){
    const path=join(OUT,'thumbs',`${String(++number).padStart(2,'0')}.jpg`);await mkdir(dirname(path),{recursive:true});
    magick(join(OUT,row.local),'-auto-orient','-thumbnail','380x300>','-background','#171512','-gravity','center','-extent','380x300','-fill','white','-undercolor','#171512cc','-gravity','south','-pointsize','12','-annotate','+0+4',`${String(number).padStart(2,'0')} ${row.source_key} ${row.width}x${row.height}`,'-strip','-quality','88',path);thumbs.push(path);
  }
  const contact=join(OUT,'contact-sheet.jpg');execFileSync('montage',[...thumbs,'-tile','4x','-geometry','380x300+10+10','-background','#e8e3d9',contact],{stdio:'inherit'});
  const manifest={version:1,lane:'card-backfill',record_id:'UC-070',actor:'Bill Nighy',character:'Davy Jones',production:'Pirates of the Caribbean',year:2006,side:'still',expected_subject:'Davy Jones',generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),selector_artifact:control.selector_artifact,repository_hash_count:repository.size,page_evidence:pageEvidence,candidates:downloaded,usable_candidate_count:usable.length,contact_sheet:{path:'contact-sheet.jpg',...identify(contact)},disposition:'candidate-only-pending-visual-selection',canonical_mutation:false};
  await writeJson(join(OUT,'manifest.json'),manifest);
  await writeJson(join(OUT,'summary.json'),{record_id:'UC-070',actor:'Bill Nighy',character:'Davy Jones',usable_candidate_count:usable.length,providers:[...new Set(usable.map(row=>row.provider))],candidates:usable.map(({local,provider,source_key,source_page,url,sha256,width,height,bytes,mime,repository_matches,source_score,local_context})=>({local,provider,source_key,source_page,url,sha256,width,height,bytes,mime,repository_matches,source_score,local_context}))});
  const cards=downloaded.map((row,index)=>`<article>${row.local&&!row.download_error?`<img src="${esc(row.local)}" alt="">`:`<div class="bad">${esc(row.download_error||'no image')}</div>`}<h2>${index+1} · ${esc(row.provider)} · ${esc(row.source_key)}</h2><p>${esc(row.label)}</p><p>${row.width||0}×${row.height||0} · score ${row.source_score||0}</p><p>${row.repository_matches?.length?`duplicate: ${esc(row.repository_matches.join(', '))}`:'no exact canonical duplicate'}</p><p>${esc(row.local_context||'')}</p><a href="${esc(row.source_page)}">source page</a><code>${esc(row.sha256||'')}</code></article>`).join('');
  await writeFile(join(OUT,'review.html'),`<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.sheet{max-width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}article{background:white;padding:10px}article img,.bad{width:100%;height:340px;object-fit:contain;background:#171512;color:white}.bad{display:grid;place-items:center}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-070 · Bill Nighy / Davy Jones official-source orbit</h1><p>Candidate-only. Approve only the finished live-action-film Davy Jones. Reject Bill Nighy unmasked or in the Imocap suit, other Pirates characters, ship-only imagery, posters, logos, animation/game/LEGO imagery, and unrelated namesakes.</p><img class="sheet" src="contact-sheet.jpg"><div class="grid">${cards}</div>`);
  console.log(`UC-070 discovery: ${usable.length} usable exact-context candidate(s) from ${[...new Set(usable.map(row=>row.provider))].join(', ')}`);
  console.log(`contact ${contact}`);
  console.log(`artifact ${OUT}`);
}finally{await browser.close()}
