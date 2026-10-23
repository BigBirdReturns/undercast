#!/usr/bin/env node
// Hermetic desk mechanics. This fixture is not an archival subject review.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {pathToFileURL}from'node:url';import{chromium}from'@playwright/test';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'photo-desk-'));
const template=fs.readFileSync('scripts/photo_variants.py','utf8').match(/HTML=r'''([\s\S]*?)'''\nif __name__/)[1];
const photo='data:image/jpeg;base64,'+fs.readFileSync('images/uc-001-portrait.jpg').toString('base64');
const facet={id:'UC-FIXTURE',side:'portrait',before:{fit:'cover'},record_sha256:'fixture'};
const source={version:1,run_id:'fixture-run',reviewer:'',reviewer_kind:'agent',selections:[{...facet,action:'pending',candidate_key:null,reason:'',fit:'contain',focus:{x:50,y:50},evidence:[]}]};
const candidate={id:facet.id,side:facet.side,candidate_key:'fixture-candidate',origin:'https://example.test/photo',source_dimensions:[553,553],preview:photo,documents:[{sha256:'fixture-document',title:'Fixture evidence',text:'Documentary fixture text naming the intended subject. </script><script>window.injected=true</script>'}]};
const data={plan:{run_id:'fixture-run',composition_review:true,facets:[facet]},source,prepared:null,display:null,items:[{facet,record:{character:'Fixture role',actor:'Fixture performer'},current:facet.before,current_preview:photo,candidates:[candidate]}]};
fs.writeFileSync(path.join(temp,'review.html'),template.replace('__DATA__',JSON.stringify(data).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026')));
let browser;try{browser=await chromium.launch({headless:true});
for(const width of[1440,390]){
 const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(temp,'review.html')).href);assert.equal(await page.evaluate(()=>window.injected),undefined);
 await page.getByLabel('Source candidate',{exact:true}).selectOption('fixture-candidate');
 await page.getByLabel('Protected source region',{exact:true}).fill('140, 100, 400, 400');
 await page.getByLabel('Decision rationale',{exact:true}).fill('Fixture composition preserves the declared region in both image shapes.');
 await page.getByLabel('Exact supporting passage',{exact:true}).fill('Documentary fixture text naming the intended subject.');
 await page.getByRole('button',{name:'Export source decisions'}).click();assert.match(await page.locator('#message').innerText(),/reviewer required/);
 await page.locator('#reviewer').fill('fixture-agent');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export source decisions'}).click();const d=await download;const file=path.join(temp,'review-'+width+'.json');await d.saveAs(file);const review=JSON.parse(fs.readFileSync(file));
 assert.equal(review.selections[0].action,'select');assert.deepEqual(review.selections[0].composition.protected_region_px,[140,100,400,400]);assert.equal(review.reviewer,'fixture-agent');
 await page.getByLabel('Protected source region',{exact:true}).fill('0, 0, 553, 553');await page.getByRole('button',{name:'Export source decisions'}).click();assert.match(await page.locator('#message').innerText(),/composition bounds/);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'desk overflow');assert.deepEqual(errors,[]);
 console.log(`PASS photo desk ${width}: actual browser export, attribution, region bounds, escaping, no overflow`);await context.close();
}
}finally{if(browser)await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
