#!/usr/bin/env node
// Actual photographic acceptance for an explicit run, locally or on the public site.
// Local release mirrors are checked against immutable hashes; live mode never routes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {build} from './publication.mjs';
import {digest,photoPath} from './lib/photo-preparations.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const root=path.resolve(option('--root',fileURLToPath(new URL('../',import.meta.url)))),run=path.resolve(option('--run',''));
assert(args.includes('--run'),'--run required');
const read=p=>JSON.parse(fs.readFileSync(photoPath(root,p)));
const plan=JSON.parse(fs.readFileSync(photoPath(run,'plan.json'))),records=read('data/specimens.json');
const ids=new Set(plan.records.map(r=>r.id)),scope=records.filter(r=>ids.has(r.id));assert.equal(scope.length,ids.size);
const manifests=read('data/media-manifest.json').assets,live=read('data/media-live.json').urls;
const hashes=new Map(read('data/MEDIA-AUDIT.json').items.filter(i=>i.asset).map(i=>[i.asset.src,i.asset.sha256]));
const types={'.html':'text/html','.json':'application/json','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const external=new Map(Object.entries(manifests).filter(([,m])=>m.location==='release').map(([p,m])=>[m.url,{p,m}]));
const supplied=option('--base-url',null);let server,base,identity,browser;
const buildParent=fs.mkdtempSync(path.join(run,'acceptance-build-'));
const output=path.join(buildParent,'site');
try{
 identity=build(root,output);
 if(supplied){
  const u=new URL(supplied);assert.equal(u.protocol,'https:');base=u.href.endsWith('/')?u.href:u.href+'/';
  const r=await fetch(new URL('release.json',base));assert(r.ok);const release=await r.json();assert.equal(release.payload_sha256,identity.payload_sha256,'served release differs from qualified local payload');
 }else{
  server=http.createServer((req,res)=>{try{let rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/undercast(?=\/|$)/,'').replace(/^\//,'');if(!rel||rel.endsWith('/'))rel+='index.html';const p=photoPath(output,rel);res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));}catch{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}/undercast/`;
 }
 browser=await chromium.launch({headless:true});const observations=[],errors=[];let byteChecks=0;
 const routing=async context=>{if(supplied)return;await context.route('**/*',route=>{const url=route.request().url();if(new URL(url).hostname==='127.0.0.1')return route.continue();const asset=external.get(url);if(!asset)return route.abort();const b=fs.readFileSync(photoPath(root,asset.p));assert.equal(digest(b),asset.m.sha256);return route.fulfill({status:200,body:b,contentType:types[path.extname(asset.p)]||'image/jpeg'});});};
 const sourceUrl=a=>live[a.src]||new URL(a.src,base).href;
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});await routing(context);const page=await context.newPage();let decoded=0,reveals=0;
  page.on('requestfailed',r=>errors.push({url:r.url(),failure:r.failure()?.errorText}));
  for(const record of scope){
   await page.goto(base+'index.html?q='+encodeURIComponent(record.actor)+'#'+record.id,{waitUntil:'domcontentloaded'});
   const card=page.locator(`article.cast[data-uid="${record.id}"]`);await card.waitFor();
   for(const side of ['still','portrait']){
    const asset=record[side],face=card.locator(side==='still'?'.front':'.back');
    if(side==='portrait'){await card.locator('.front [data-flip]').focus();await page.keyboard.press('Enter');assert.equal(await card.getAttribute('data-flipped'),'true');reveals++;}
    const images=face.locator('img.shot');assert.equal(await images.count(),asset?1:0);
    if(asset){
     const im=images.first();await im.evaluate(async e=>{e.loading='eager';await e.decode();});
     const state=await im.evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{src:e.src,width:r.width,height:r.height,natural:e.naturalWidth,fit:s.objectFit};});
     assert(state.natural>0);assert.equal(state.src,sourceUrl(asset));assert.equal(state.fit,asset.fit||'cover');assert(Math.abs(state.height-state.width*.75)<1.1,'image is not constrained to its real crop box');decoded++;
     let bytes;if(!supplied&&external.has(sourceUrl(asset)))bytes=fs.readFileSync(photoPath(root,asset.src));else{const response=await context.request.get(sourceUrl(asset));assert(response.ok());bytes=await response.body();}assert.equal(digest(bytes),hashes.get(asset.src),'displayed bytes differ from accepted source');byteChecks++;
    }
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await card.screenshot({path:path.join(run,`${supplied?'live':'local'}-${width}-${record.id}.png`)});
  }
  observations.push({width,records:scope.length,decoded,reveals,overflow:false});await context.close();
 }
 const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:1000}});await routing(context);const page=await context.newPage();
 for(const record of scope){
  await page.goto(base+`records/${record.id}/`,{waitUntil:'load'});
  for(const side of ['still','portrait'])if(record[side]){
   const media=page.locator(side==='portrait'?'.record-image.is-portrait .record-media':'.record-image:not(.is-portrait) .record-media');
   assert.equal(await media.count(),1);const actual=await media.evaluate(e=>({src:e.data||e.src,fit:getComputedStyle(e).objectFit}));
   assert.equal(actual.src,sourceUrl(record[side]));assert.equal(actual.fit,record[side].fit||'cover');
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 await context.close();assert.equal(errors.length,0,JSON.stringify(errors));
 const result={pass:true,mode:supplied?'real-public-requests':'local-compiled-site-and-hash-checked-originals',payload_sha256:identity.payload_sha256,records:scope.map(r=>r.id),byte_checks:byteChecks,observations,nojs_records:scope.length,request_failures:errors,checked_at:new Date().toISOString()};
 fs.writeFileSync(path.join(run,supplied?'live-acceptance.json':'local-acceptance.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
