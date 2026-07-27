#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-077-TARGETED.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-077-targeted';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/[^a-zA-Z0-9']+/g,' ').trim().toLowerCase();
const slug=value=>norm(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'unknown';
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function extensionFor(mime){return mime==='image/jpeg'?'jpg':mime==='image/png'?'png':mime==='image/webp'?'webp':'bin'}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
function cleanUrl(value,base){if(!value)return'';let text=String(value).replace(/\\u002F/g,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&');try{return new URL(text,base).href}catch{return''}}
function variants(url){const rows=[];const push=(value,kind)=>{if(value&&!rows.some(row=>row.url===value))rows.push({url:value,kind})};push(url,'page-delivery');try{const parsed=new URL(url),noQuery=new URL(url);noQuery.search='';push(noQuery.href,'unparameterized');if(parsed.hostname==='m.media-amazon.com'&&/_V1_/.test(parsed.pathname))push(parsed.href.replace(/_V1_[^/]*\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i,'_V1_.jpg'),'imdb-original-probe');for(const width of[2400,2048,1600,1200]){if(/\/resize\/\d+x\d+!/.test(parsed.pathname))push(parsed.href.replace(/\/resize\/\d+x\d+!/i,`/resize/${width}x${Math.round(width*0.75)}!`),`brightspot-width-${width}`)}}catch{}return rows}
async function inspectTarget(context,target){
  const page=await context.newPage();
  try{
    const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForTimeout(1200);
    for(const label of['CONTINUE','Accept','I Accept','Agree']){
      const button=page.getByRole('button',{name:new RegExp(`^${label}$`,'i')});
      if(await button.count().catch(()=>0)){
        await button.first().click({timeout:1500}).catch(()=>{});
        await page.waitForTimeout(500);
      }
    }
    await page.evaluate(()=>{
      for(const img of document.querySelectorAll('img')){
        for(const attr of['data-src','data-lazy-src','data-original','data-image','data-url']){
          const value=img.getAttribute(attr);
          if(value&&!img.src)img.src=value;
        }
        const srcset=img.getAttribute('data-srcset');
        if(srcset&&!img.srcset)img.srcset=srcset;
      }
      for(const source of document.querySelectorAll('source')){
        const srcset=source.getAttribute('data-srcset');
        if(srcset&&!source.srcset)source.srcset=srcset;
      }
    }).catch(()=>{});
    for(let i=0;i<10;i++){
      await page.mouse.wheel(0,1600);
      await page.waitForTimeout(350);
    }
    const body=await page.locator('body').innerText().catch(()=>''),
      html=await page.content(),
      title=await page.title(),
      hay=norm(body+' '+html),
      missing=target.required_terms.filter(term=>!hay.includes(norm(term)));
    const screenshot=`pages/${target.key}.png`;
    await mkdir(join(OUT,'pages'),{recursive:true});
    await page.screenshot({path:join(OUT,screenshot),fullPage:true});
    const extracted=await page.evaluate(({phrase})=>{
      const absolute=value=>{try{return new URL(value,document.baseURI).href}catch{return''}};
      const phraseNorm=String(phrase||'').toLowerCase();
      const rows=[];
      const add=(url,label,context,origin)=>{
        url=absolute(url);
        if(url)rows.push({url,label:label||'',context:(context||'').replace(/\s+/g,' ').slice(0,2500),origin});
      };
      const attrs=node=>{
        if(!node)return;
        for(const attr of node.attributes||[]){
          if(!/(?:src|image|url|poster)/i.test(attr.name))continue;
          for(const part of String(attr.value||'').split(',')){
            const value=part.trim().split(/\s+/)[0];
            if(value)add(value,node.getAttribute('alt')||'',node.closest('figure')?.textContent||node.parentElement?.textContent||document.title,`attr:${attr.name}`);
          }
        }
      };
      const candidates=[...document.querySelectorAll('figcaption,p,div,span,h1,h2,h3')]
        .filter(node=>String(node.textContent||'').toLowerCase().includes(phraseNorm));
      for(const match of candidates){
        let current=match;
        for(let depth=0;depth<7&&current;depth++,current=current.parentElement){
          for(const node of current.querySelectorAll('img,source,video,meta,link')){
            attrs(node);
            if(node.tagName==='IMG')add(node.currentSrc||node.src,node.alt||'',current.textContent||document.title,'nearby-img');
            if(node.tagName==='SOURCE'){
              for(const part of String(node.srcset||node.getAttribute('data-srcset')||'').split(',')){
                const value=part.trim().split(/\s+/)[0];
                if(value)add(value,'',current.textContent||document.title,'nearby-source');
              }
            }
          }
          const style=getComputedStyle(current).backgroundImage;
          for(const found of String(style||'').matchAll(/url\(["']?([^"')]+)["']?\)/g))add(found[1],'',current.textContent||document.title,'nearby-background');
          const outer=current.outerHTML||'';
          for(const found of outer.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi))add(found[0],'',current.textContent||document.title,'nearby-html');
        }
      }
      for(const entry of performance.getEntriesByType('resource')){
        const url=String(entry.name||'');
        if(/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)&&(/young|franken|boyle|monster|brightspotcdn|tcm|media-amazon/i.test(url)))add(url,'',document.title,'performance-resource');
      }
      return rows;
    },{phrase:target.caption_phrase});
    const rows=[],seen=new Set();
    for(const row of extracted){
      const url=cleanUrl(row.url,page.url());
      if(!/^https?:\/\//.test(url)||seen.has(url)||/(?:logo|icon|sprite|favicon|pixel|tracking|avatar|badge|rating|privacy|cookie)/i.test(url))continue;
      seen.add(url);
      rows.push({...row,url});
    }
    return{
      evidence:{
        status:'loaded',
        http_status:response?.status()||null,
        title,
        resolved_url:page.url(),
        required_terms:target.required_terms,
        required_terms_missing:missing,
        body_text:body.slice(0,20000),
        screenshot,
        caption_phrase:target.caption_phrase,
        matched_contexts:extracted.slice(0,50).map(row=>row.context)
      },
      rows
    };
  }catch(error){
    return{evidence:{status:'error',error:error.message,required_terms:target.required_terms,required_terms_missing:target.required_terms,caption_phrase:target.caption_phrase},rows:[]};
  }finally{
    await page.close();
  }
}
async function download(context,target,row,variant,index){let response;try{response=await context.request.get(variant.url,{headers:{'User-Agent':UA,Referer:target.url,Accept:'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2'},timeout:60000,failOnStatusCode:false})}catch(error){return{target_key:target.key,provider:target.provider,source_page:target.url,probe_url:variant.url,probe_kind:variant.kind,origin:row.origin,local_context:row.context||'',download_error:error.message}}if(!response.ok())return{target_key:target.key,provider:target.provider,source_page:target.url,probe_url:variant.url,probe_kind:variant.kind,origin:row.origin,local_context:row.context||'',download_error:`HTTP ${response.status()}`};const bytes=Buffer.from(await response.body()),mime=signatureMime(bytes);if(bytes.length<12000||mime==='unknown')return{target_key:target.key,provider:target.provider,source_page:target.url,probe_url:variant.url,probe_kind:variant.kind,origin:row.origin,local_context:row.context||'',download_error:`unusable ${bytes.length} ${mime}`};const local=`candidates/${String(index).padStart(3,'0')}-${slug(target.key)}-${slug(row.origin)}.${extensionFor(mime)}`,path=join(OUT,local);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);let dimensions={width:0,height:0};try{dimensions=identify(path)}catch{}if(dimensions.width<300||dimensions.height<200)return{target_key:target.key,provider:target.provider,source_page:target.url,probe_url:variant.url,probe_kind:variant.kind,resolved_url:response.url()||variant.url,origin:row.origin,local_context:row.context||'',local,mime,bytes:bytes.length,sha256:sha(bytes),...dimensions,download_error:'image below 300x200 floor'};return{target_key:target.key,provider:target.provider,source_page:target.url,probe_url:variant.url,probe_kind:variant.kind,resolved_url:response.url()||variant.url,origin:row.origin,label:row.label||'',local_context:row.context||'',local,mime,bytes:bytes.length,sha256:sha(bytes),...dimensions}}

const control=await readJson(CONTROL);
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-077','UC-077 targeted scope drift');
assert(control.actor==='Peter Boyle'&&control.character==='The Monster'&&control.side==='still','UC-077 targeted identity drift');
assert(control.broad_discovery_artifact?.artifact_id===8642315578&&control.broad_discovery_artifact?.head_sha==='6a224b49b9cf17111dc8d4877d2fb08c3bb1c136','UC-077 broad discovery custody drift');
assert(control.targets?.length===3,'UC-077 targeted source denominator drift');
await mkdir(OUT,{recursive:true});const repository=await repositoryHashes();assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const browser=await chromium.launch({headless:true});const context=await browser.newContext({userAgent:UA,viewport:{width:1440,height:1100},locale:'en-US'});
try{const page_evidence={},page_screenshots=[],attempted=[],candidates=[],seenHashes=new Set();let index=0;for(const target of control.targets){const inspected=await inspectTarget(context,target);page_evidence[target.key]=inspected.evidence;if(inspected.evidence?.screenshot){const bytes=await readFile(join(OUT,inspected.evidence.screenshot));page_screenshots.push({target_key:target.key,provider:target.provider,path:inspected.evidence.screenshot,sha256:sha(bytes)})}if(target.strict)assert(inspected.evidence.status==='loaded'&&inspected.evidence.required_terms_missing.length===0,`${target.key} required evidence failed: ${inspected.evidence.required_terms_missing.join(', ')}`);for(const row of inspected.rows){if(candidates.length>=control.max_candidates)break;for(const variant of variants(row.url)){if(candidates.length>=control.max_candidates)break;const result=await download(context,target,row,variant,++index);attempted.push(result);if(!result.sha256||result.download_error)continue;if(seenHashes.has(result.sha256)){result.visual_byte_duplicate=true;continue}seenHashes.add(result.sha256);result.repository_matches=repository.get(result.sha256)||[];candidates.push(result)}}}assert(candidates.length>=1,'UC-077 targeted orbit produced no usable candidate');candidates.sort((a,b)=>(b.width*b.height-a.width*a.height)||a.target_key.localeCompare(b.target_key)||a.local.localeCompare(b.local));const thumbs=[];for(let position=0;position<candidates.length;position++){const row=candidates[position],thumb=join(OUT,'thumbs',`${String(position+1).padStart(2,'0')}.jpg`);await mkdir(dirname(thumb),{recursive:true});magick(join(OUT,row.local),'-auto-orient','-thumbnail','480x360>','-background','#171512','-gravity','center','-extent','480x360','-fill','white','-undercolor','#171512cc','-gravity','south','-pointsize','13','-annotate','+0+5',`${String(position+1).padStart(2,'0')} ${row.target_key} ${row.width}x${row.height}`,'-strip','-quality','88',thumb);thumbs.push(thumb)}const contact=join(OUT,'contact-sheet.jpg');execFileSync('montage',[...thumbs,'-tile','3x','-geometry','480x360+10+10','-background','#e8e3d9',contact],{stdio:'inherit'});const manifest={version:1,lane:'card-backfill',record_id:'UC-077',actor:'Peter Boyle',character:'The Monster',production:'Young Frankenstein',year:1974,side:'still',expected_subject:'The Monster',generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),broad_discovery_artifact:control.broad_discovery_artifact,repository_hash_count:repository.size,page_evidence,page_screenshots,attempted,candidates,candidate_count:candidates.length,contact_sheet:{path:'contact-sheet.jpg',...identify(contact)},disposition:'candidate-only-pending-visual-selection',canonical_mutation:false};await writeJson(join(OUT,'manifest.json'),manifest);await writeJson(join(OUT,'summary.json'),{record_id:'UC-077',actor:'Peter Boyle',character:'The Monster',candidate_count:candidates.length,candidates:candidates.map(({target_key,provider,source_page,probe_url,probe_kind,resolved_url,origin,label,local_context,local,mime,bytes,sha256,width,height,repository_matches})=>({target_key,provider,source_page,probe_url,probe_kind,resolved_url,origin,label,local_context,local,mime,bytes,sha256,width,height,repository_matches}))});console.log(`UC-077 targeted discovery complete: ${candidates.length} candidate(s)`);console.log(`manifest ${sha(await readFile(join(OUT,'manifest.json')))}`);console.log(`contact ${sha(await readFile(contact))}`);console.log(`artifact ${OUT}`)}finally{await browser.close()}
