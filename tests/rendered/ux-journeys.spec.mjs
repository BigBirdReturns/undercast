import { test, expect } from "@playwright/test";

const sitePath=path=>`/undercast/${String(path).replace(/^\//,"")}`;
const open=(page,path)=>page.goto(sitePath(path),{waitUntil:"domcontentloaded"});
const pixel=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==","base64");
const waitForWall=async page=>{
  await expect(page.locator("#grid")).toHaveAttribute("aria-busy","false");
  await expect(page.locator("#grid .cast-shell").first()).toBeVisible();
};
const captureConsoleErrors=page=>{
  const errors=[];
  page.on("console",message=>{ if(message.type()==="error") errors.push(message.text()); });
  return errors;
};

test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==="fonts.googleapis.com") return route.fulfill({status:200,contentType:"text/css",body:""});
    if(url.hostname==="fonts.gstatic.com") return route.fulfill({status:200,contentType:"font/woff2",body:Buffer.alloc(0)});
    if(request.resourceType()==="image" || !["127.0.0.1","localhost"].includes(url.hostname)) return route.fulfill({status:200,contentType:"image/png",body:pixel});
    return route.continue();
  });
});

test("wall context survives an explicit record round-trip",async({page})=>{
  test.setTimeout(120_000);
  const errors=captureConsoleErrors(page);
  const state="q=Quark&shelf=Star+Trek&decade=90s&species=Ferengi&maker=Michael+Westmore&lens=face&sort=actor";
  await open(page,`index.html?${state}#archive`);
  await waitForWall(page);

  await expect(page.getByRole("searchbox",{name:"Search a character, a performer, or a production",exact:true})).toHaveValue("Quark");
  await expect(page.getByRole("button",{name:"Star Trek",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"90s",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"Ferengi",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#makerActive")).toContainText("Built by Michael Westmore");
  await expect(page.locator('[data-lens="face"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#sort")).toHaveValue("actor");

  const shell=page.locator('.cast-shell:has([data-uid="UC-019"])');
  const card=shell.locator('article.cast[data-uid="UC-019"]');
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("button",{name:/Reveal the performer for Quark/}).click();
  const full=shell.getByRole("link",{name:"Open the full record for Quark",exact:true});
  await expect(full).toBeVisible();
  await full.click();

  await expect(page.getByRole("heading",{name:"Quark",exact:true}).first()).toBeVisible();
  const back=page.getByRole("link",{name:"Back to your wall",exact:true});
  await expect(back).toBeVisible();
  const returnTarget=await back.getAttribute("href");
  expect(returnTarget).toContain("index.html");
  expect(returnTarget).toContain("q=Quark");
  expect(returnTarget).toContain("species=Ferengi");
  expect(returnTarget).toContain("#UC-019");

  await page.getByRole("button",{name:"Next record",exact:true}).click();
  await expect(back).toBeVisible();
  await back.click();
  await waitForWall(page);

  await expect(page).toHaveURL(new RegExp(`index\\.html\\?${state.replace(/[+]/g,"\\+")}#UC-019$`));
  await expect(page.getByRole("searchbox",{name:"Search a character, a performer, or a production",exact:true})).toHaveValue("Quark");
  await expect(page.locator("#sort")).toHaveValue("actor");
  const restored=page.locator('article.cast[data-uid="UC-019"]');
  await expect(restored).toHaveAttribute("data-flipped","true");
  await expect(restored).toBeFocused();
  await expect(restored).toBeInViewport();
  expect(errors).toEqual([]);
});

test("recognition refuses external and non-wall return targets",async({page})=>{
  for(const target of ["https://example.com/phish","/undercast/coverage.html?franchise=Star+Trek"]){
    await open(page,`recognition.html?return=${encodeURIComponent(target)}#UC-019`);
    await expect(page.getByRole("heading",{name:"Quark",exact:true}).first()).toBeVisible();
    await expect(page.locator("#return-wall")).toHaveCount(0);
  }
});

test("root surfaces orient, expose recovery paths, and avoid viewport overflow",async({page})=>{
  const errors=captureConsoleErrors(page);
  const surfaces=[
    {path:"index.html",ready:"#result-status",current:"Browse",map:"The wall"},
    {path:"recognition.html#UC-001",ready:"#record-title",current:"Recognition Loop",map:"Recognition records"},
    {path:"coverage.html",ready:"#rows tr",current:"Coverage",map:"Coverage & gaps"},
    {path:"constellation.html",ready:".person-row",current:"",map:"Evidence paths"},
    {path:"records/UC-001/",ready:"#record-main",current:"Permanent record",map:"Recognition records"},
    {path:"404.html",ready:"#recovery",current:"",map:""}
  ];
  for(const surface of surfaces){
    await open(page,surface.path);
    await expect(page.locator(surface.ready).first()).toBeVisible();
    const primary=page.getByRole("navigation",{name:"Archive navigation",exact:true});
    const archiveMap=page.getByRole("navigation",{name:"Archive paths",exact:true});
    const compact=await page.evaluate(()=>matchMedia("(max-width: 700px)").matches);
    const toggle=page.locator(".site-nav-toggle");
    if(compact){
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded","false");
      await expect(primary).toBeHidden();
      await toggle.click();
    }
    await expect(primary).toBeVisible();
    await expect(archiveMap).toBeVisible();
    if(surface.current) await expect(primary.getByRole("link",{name:surface.current,exact:true})).toHaveAttribute("aria-current","page");
    if(surface.map) await expect(archiveMap.getByRole("link",{name:surface.map,exact:true})).toHaveAttribute("aria-current",/page|location/);
    else await expect(archiveMap.locator("[aria-current]")).toHaveCount(0);
    await expect(primary.getByRole("link",{name:"Connections",exact:true})).toHaveCount(0);
    await expect(primary.getByRole("link",{name:"Constellations",exact:true})).toHaveCount(0);
    const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
    expect(overflow.width,`${surface.path} page width`).toBeLessThanOrEqual(overflow.viewport+1);
  }
  expect(errors).toEqual([]);
});

test("dark preference, theme persistence, and reduced motion compose",async({page})=>{
  await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});
  await open(page,"index.html");
  await waitForWall(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await expect(page.locator("#mornCard .hero-inner")).toHaveCSS("transition-duration","0s");

  const toggle=page.locator("[data-theme-toggle]");
  await expect(toggle).toContainText("Light");
  if(await page.evaluate(()=>matchMedia("(max-width: 700px)").matches)){
    const menu=page.locator(".site-nav-toggle");
    await expect(menu).toBeVisible();
    if(await menu.getAttribute("aria-expanded")!=="true") await menu.click();
  }
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");

  await open(page,"coverage.html");
  await expect(page.locator("#rows tr").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
  await expect(page.locator("[data-theme-toggle]")).toContainText("Dark");
});

test("mobile archive navigation is compact and keyboard recoverable",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page,"coverage.html");
  await expect(page.locator("#rows tr").first()).toBeVisible();

  const nav=page.getByRole("navigation",{name:"Archive navigation",exact:true});
  const toggle=page.locator(".site-nav-toggle");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label","Open archive menu");
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await expect(nav).toBeHidden();

  await toggle.click();
  await expect(nav).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label","Close archive menu");
  await expect(toggle).toHaveAttribute("aria-expanded","true");
  await expect(nav.getByRole("link",{name:"Coverage",exact:true})).toHaveAttribute("aria-current","page");
  await expect(nav.getByRole("link",{name:"Connections",exact:true})).toHaveCount(0);

  await nav.getByRole("link",{name:"Coverage",exact:true}).focus();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-label","Open archive menu");
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await expect(toggle).toBeFocused();
});

test("archive navigation remains complete without JavaScript",async({browser})=>{
  const baseURL=String(test.info().project.use.baseURL||"http://127.0.0.1:4173");
  const context=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844},baseURL});
  const page=await context.newPage();
  try{
    const surfaces=[
      {path:"coverage.html",current:"Coverage & gaps"},
      {path:"recognition.html",current:"Recognition records"}
    ];
    for(const surface of surfaces){
      await page.goto(sitePath(surface.path),{waitUntil:"domcontentloaded"});
      const nav=page.getByRole("navigation",{name:"Archive navigation",exact:true});
      const archiveMaps=page.getByRole("navigation",{name:"Archive paths",exact:true});
      await expect(nav).toBeVisible();
      for(const label of ["Browse","Recognition Loop","Coverage","Makers","About"]){
        await expect(nav.getByRole("link",{name:label,exact:true})).toBeVisible();
      }
      await expect(nav.getByRole("link",{name:"Connections",exact:true})).toHaveCount(0);
      await expect(archiveMaps).toHaveCount(1);
      await expect(archiveMaps.getByRole("link",{name:surface.current,exact:true})).toHaveAttribute("aria-current","location");
      await expect(page.locator(".site-nav-toggle")).toHaveCount(0);
    }
  }finally{
    await context.close();
  }
});
