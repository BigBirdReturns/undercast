#!/usr/bin/env node
// Explicit, offline artwork rendering. Ordinary compilation verifies retained bytes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { sha256 } from './lib/preservation.mjs';
const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export function verifySocialPreview(root=ROOT) {
  const read=file=>{const bytes=fs.readFileSync(path.join(root,file));return /\.(?:html|css|json)$/.test(file)?Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')):bytes;};
  const receipt=JSON.parse(read('assets/social-preview.json'));
  assert.equal(receipt.version,1);assert.equal(receipt.record_count_embedded,false);
  assert.equal(receipt.description,'Count-independent UnderCast social preview; artwork is not subject evidence.');
  const expected=['assets/social-preview.html','assets/site-fonts.css','assets/fonts/SOURCES.json','assets/placeholder-light-clean.png',...JSON.parse(read('assets/fonts/SOURCES.json')).fonts.map(row=>row.path)].sort();
  assert.deepEqual(receipt.inputs.map(row=>row.path).sort(),expected,'social preview input set drift');
  for(const row of receipt.inputs){const bytes=read(row.path);assert.equal(bytes.length,row.bytes);assert.equal(sha256(bytes),row.sha256,`social preview source changed: ${row.path}`);}
  const png=read('og.png');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
  assert.equal(png.length,receipt.output.bytes);assert.equal(sha256(png),receipt.output.sha256);assert.equal(receipt.output.path,'og.png');
  const html=read('assets/social-preview.html').toString();assert.ok(!/\b139\b|\b1368\b|specimens on file|specimens\.json/i.test(html),'social artwork must not embed a stale roster count');
  return receipt;
}
async function render() {
  const { chromium }=await import('@playwright/test');
  const paths=['assets/social-preview.html','assets/site-fonts.css','assets/fonts/SOURCES.json','assets/placeholder-light-clean.png',...JSON.parse(fs.readFileSync(path.join(ROOT,'assets/fonts/SOURCES.json'))).fonts.map(row=>row.path)].sort();
  const input=new Map(paths.map(file=>{const bytes=fs.readFileSync(path.join(ROOT,file));return [file,/\.(?:html|css|json)$/.test(file)?Buffer.from(bytes.toString("utf8").replace(/\r\n/g,"\n")):bytes];}));
  const server=createServer((req,res)=>{const file=new URL(req.url,'http://localhost').pathname.slice(1);const bytes=input.get(file);if(!bytes){res.writeHead(404);res.end();return;}const type=file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.png')?'image/png':'application/json';res.writeHead(200,{'content-type':type});res.end(bytes);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:'light'});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/assets/social-preview.html`);await page.evaluate(()=>document.fonts.ready);
    assert.ok(await page.evaluate(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0)),'social asset failed to load');
    const png=await page.screenshot({type:'png',animations:'disabled'});
    fs.writeFileSync(path.join(ROOT,'og.png'),png);
    const receipt={version:1,record_count_embedded:false,description:'Count-independent UnderCast social preview; artwork is not subject evidence.',inputs:[...input].map(([file,bytes])=>({path:file,bytes:bytes.length,sha256:sha256(bytes)})),output:{path:'og.png',bytes:png.length,sha256:sha256(png),width:1200,height:630}};
    fs.writeFileSync(path.join(ROOT,'assets/social-preview.json'),JSON.stringify(receipt,null,2)+'\n');
    verifySocialPreview();console.log(`social preview: ${png.length} bytes; ${receipt.output.sha256}`);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==3||!['--write','--check'].includes(process.argv[2]))throw new Error('use --write or --check');if(process.argv[2]==='--write')await render();else{verifySocialPreview();console.log('social preview source and output binding: PASS');}}
