import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {buildWebsiteProfile} from '../../scripts/build-website-profile.mjs';

// These are layout/behavior tests. Remote images are deliberately stubbed;
// media identity is checked separately against the unchanged archive manifests.
test.describe.configure({mode:'serial'});
const profiles=['field-guide','reading-room'].map(id=>JSON.parse(fs.readFileSync(`config/sites/${id}.json`)));
const specimens=JSON.parse(fs.readFileSync('data/specimens.json'));
const tombstones=JSON.parse(fs.readFileSync('data/tombstones.json')).records;
const voice=specimens.find(row=>row.kind==='voice');
const jpeg=fs.readFileSync('images/uc-035-portrait.jpg');
const mediaLive=JSON.parse(fs.readFileSync('data/media-live.json')).urls;
let temp,server,origin;
const roots=new Map();
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.jsonld':'application/ld+json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const open=(page,profile,route)=>page.goto(origin+new URL(profile.base_url).pathname+route,{waitUntil:'domcontentloaded'});
const waitWall=async page=>expect(page.locator('#result-status')).toContainText(/specimens? match/);
const shellFor=(page,id)=>page.locator(`[data-uid="${id}"]`).locator('xpath=ancestor::div[contains(@class,"cast-shell")]');
const fit=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);

test.beforeAll(async()=>{
  test.setTimeout(120000);
  fs.mkdirSync('.ci/profiles',{recursive:true});temp=fs.mkdtempSync(path.resolve('.ci/profiles/browser-'));
  for(const profile of profiles){const root=path.join(temp,profile.id);buildWebsiteProfile(process.cwd(),`config/sites/${profile.id}.json`,root);roots.set(new URL(profile.base_url).pathname,root);}
  const mounts=[...roots].sort((a,b)=>b[0].length-a[0].length);
  server=createServer((req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const [prefix,root]=mounts.find(([prefix])=>pathname.startsWith(prefix))||[];
      if(!root)throw new Error('unknown mount');
      let file=path.resolve(root,pathname.slice(prefix.length)||'index.html');
      if(file!==root&&!file.startsWith(root+path.sep))throw new Error('unsafe path');
      if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
      let status=200;
      if(!fs.existsSync(file)){file=path.join(root,'404.html');status=404;}
      res.writeHead(status,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
      fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(400);res.end('Bad request');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(temp)fs.rmSync(temp,{recursive:true,force:true});});
test.beforeEach(async({page})=>{
  await page.route('https://**/*',route=>route.request().resourceType()==='image'||route.request().resourceType()==='document'?route.fulfill({status:200,contentType:'image/jpeg',body:jpeg}):route.abort());
});
for(const profile of profiles){
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
    test(`${profile.id} ${viewport.width}: settings, evidence and keyboard flip`,async({page})=>{
      await page.setViewportSize(viewport);await open(page,profile,'index.html?q=Morn');await waitWall(page);
      const shell=shellFor(page,'UC-001');await expect(shell.locator('[data-evidence-state="verified"]')).toHaveCount(2);
      await expect(shell).toContainText('1 claim reference on file');
      await expect(page.locator('.site-wordmark')).toHaveText(profile.brand.name);
      await expect(page.locator('.site-tagline')).toHaveText(profile.brand.tagline);
      expect(await page.locator('.site-nav>a').allTextContents()).toEqual(profile.navigation.map(row=>row.label));
      await expect(page.locator('html')).toHaveAttribute('data-theme','light');
      expect(await page.locator('#grid').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(viewport.width===390?1:profile.id==='field-guide'?4:3);
      const card=page.locator('[data-uid="UC-001"]');const flip=card.locator('.front [data-flip]');await flip.focus();await page.keyboard.press('Enter');
      await expect(card).toHaveAttribute('data-flipped','true');await expect(card.locator('.back [data-flip]')).toBeFocused();
      await card.locator('.back-body').evaluate(node=>{node.scrollTop=node.scrollHeight;});
      expect(await card.evaluate(node=>{const name=node.querySelector('.back-head .actor').getBoundingClientRect(),face=node.querySelector('.back').getBoundingClientRect();return name.top>=face.top&&name.bottom<=face.bottom;})).toBe(true);
      await page.keyboard.press('Enter');await expect(card).toHaveAttribute('data-flipped','false');
      if(viewport.width===390){const menu=page.locator('.site-nav-toggle');await menu.focus();await page.keyboard.press('Enter');await expect(menu).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(menu).toHaveAttribute('aria-expanded','false');await expect(menu).toBeFocused();}
      await fit(page);
    });
  }
  test(`${profile.id}: all surfaces retain shared fonts and correct base paths`,async({page})=>{
    test.setTimeout(120000);
    const routes=['index.html?q=Morn','recognition.html#UC-001','coverage.html','constellation.html','records/UC-001/','404.html'];
    for(const width of [1440,390])for(const route of routes){
      await page.setViewportSize({width,height:1000});await open(page,profile,route);
      if(route.startsWith('recognition'))await expect(page.locator('#record-title')).toHaveText('Morn');
      await page.evaluate(()=>document.fonts.ready);
      await expect(page.locator('.site-wordmark')).toHaveText(profile.brand.name);
      expect(await page.locator('h1').first().evaluate(node=>getComputedStyle(node).fontFamily)).toContain('Fraunces');
      expect(await page.locator('.site-wordmark').evaluate(node=>getComputedStyle(node).fontFamily)).toContain('Space Mono');
      expect(await page.evaluate(()=>[...document.fonts].some(face=>face.family==='Fraunces'&&face.status==='loaded'))).toBe(true);
      await fit(page);
    }
  });
  test(`${profile.id}: absent, unverified, voice and failed-image states stay distinct`,async({page})=>{
    await open(page,profile,'index.html?q=Darkness');await waitWall(page);const shell=shellFor(page,'UC-049');
    await expect(shell.locator('[data-evidence-side="still"]')).toHaveAttribute('data-evidence-state','absent');
    await expect(shell.locator('[data-evidence-side="portrait"]')).toHaveAttribute('data-evidence-state','verified');
    await expect(shell).toContainText('Claim references: not on file');
    await expect(shell.locator('picture.absence-plate')).toHaveCount(1);
    await page.locator('[data-theme-toggle]').click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(shell.locator('picture.absence-plate source')).toHaveAttribute('media','all');
    const audit=JSON.parse(fs.readFileSync('data/MEDIA-AUDIT.json'));
    const pending=specimens.find(record=>record.portrait?.src&&!(record.references||[]).length&&audit.items.some(item=>item.wall_id===record.id&&item.side==='portrait'&&item.status==='review'&&item.asset?.src===record.portrait.src));
    expect(pending,'a real unresolved-portrait fixture must remain available').toBeTruthy();
    await open(page,profile,'index.html?q='+encodeURIComponent(pending.actor));await waitWall(page);
    await expect(shellFor(page,pending.id).locator('[data-evidence-side="portrait"]')).toHaveAttribute('data-evidence-state','unverified');
    await expect(shellFor(page,pending.id)).toContainText('Claim references: not on file');

    await open(page,profile,`records/${voice.id}/`);await expect(page.locator('.record-sub')).toHaveText('Voice performance');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.route('**/images/uc-001-still.jpg',route=>route.abort());
    await page.route(mediaLive['images/uc-001-still.jpg'],route=>route.abort());
    await open(page,profile,'index.html?q=Morn');await waitWall(page);
    await expect(page.locator('[data-uid="UC-001"] .front .absence-offline')).toBeVisible();
    await expect(shellFor(page,'UC-001').locator('[data-evidence-side="still"]')).toHaveAttribute('data-evidence-state','verified');
  });
  test(`${profile.id}: no-JavaScript records, tombstones and recovery remain usable`,async({browser})=>{
    test.setTimeout(90000);
    const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
    const page=await context.newPage();await page.route('https://**/*',route=>route.abort());
    try{
      await open(page,profile,'records/UC-001/');await expect(page.locator('[data-evidence-state="verified"]')).toHaveCount(2);
      await expect(page.locator('#evidence')).toContainText('1 claim reference on file');
      for(const row of profile.navigation)await expect(page.locator('.site-nav>a').filter({hasText:row.label}).first()).toBeVisible();
      await expect(page.locator('[data-theme-toggle]')).toBeHidden();await fit(page);
      await open(page,profile,'records/UC-049/');await expect(page.locator('[data-evidence-side="still"]')).toHaveAttribute('data-evidence-state','absent');
      for(const row of tombstones){await open(page,profile,`records/${row.id}/`);await expect(page.locator('#record-main')).toContainText(row.reason);if(row.status==='merged')await expect(page.locator('a[href="../'+row.successor+'/"]')).toBeVisible();await fit(page);}
      await open(page,profile,'missing/deep/route');await expect(page.locator('#recovery')).toContainText('This route is not on file.');
      await expect(page.locator('a[href$="index.html#archive"]').first()).toBeVisible();await fit(page);
    }finally{await context.close();}
  });
}
