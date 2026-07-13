import { test, expect } from "@playwright/test";

const sitePath=path=>`/undercast/${String(path).replace(/^\//,"")}`;
const open=(page,path)=>page.goto(sitePath(path),{waitUntil:"domcontentloaded"});
const waitForWall=async page=>expect(page.locator("#result-status")).toContainText(/specimens? match/);
const captureConsoleErrors=page=>{
  const errors=[];
  page.on("console",message=>{ if(message.type()==="error") errors.push(message.text()); });
  return errors;
};

test.beforeEach(async({page})=>{
  const pixel=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xh9WAAAAAElFTkSuQmCC","base64");
  await page.route("**/*",route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.resourceType()==="image"&&url.hostname!=="127.0.0.1") return route.fulfill({status:200,contentType:"image/png",body:pixel});
    return route.continue();
  });
});

test("wall controls execute, announce, and survive browser history",async({page})=>{
  const errors=captureConsoleErrors(page);
  await open(page,"index.html?shelf=Star+Trek");
  await waitForWall(page);
  await expect(page.getByRole("button",{name:"Star Trek",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"20s",exact:true})).toBeVisible();

  const articles=page.locator("article.cast");
  await expect(articles).toHaveCount(120);
  const labels=await articles.evaluateAll(nodes=>nodes.map(node=>node.getAttribute("aria-label")));
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels.every(Boolean)).toBeTruthy();

  await page.getByRole("button",{name:"Pull a random specimen",exact:true}).click();
  await expect(page).toHaveURL(/#UC-\d+$/);
  const focused=page.locator("article.cast:focus");
  await expect(focused).toHaveCount(1);
  await expect(focused).toHaveAttribute("data-flipped","true");
  await expect(page.locator("#result-status")).toContainText(/^Opened .+ specimen UC-\d+/);

  await page.goBack();
  await waitForWall(page);
  await expect(page).toHaveURL(/shelf=Star\+Trek/);
  await expect(page.getByRole("button",{name:"Star Trek",exact:true})).toHaveAttribute("aria-pressed","true");
  expect(errors).toEqual([]);
});

test("wall search, current decade, flip semantics, and partial failure are honest",async({page})=>{
  await open(page,"index.html");
  await waitForWall(page);
  await page.getByRole("searchbox",{name:"Search the index",exact:true}).fill("Borg Queen");
  await expect(page.locator("#result-status")).toHaveText("2 specimens match; 2 shown.");
  await expect(page.locator(".cast-shell")).toHaveCount(2);
  await expect(page.locator(".looplink")).toHaveCount(2);

  await page.getByRole("searchbox",{name:"Search the index",exact:true}).fill("");
  await page.getByRole("button",{name:"20s",exact:true}).click();
  await expect(page.locator("#result-status")).toHaveText("79 specimens match; 79 shown.");

  const firstArticle=page.locator("article.cast").first();
  const character=await firstArticle.locator(".charname").textContent();
  await firstArticle.getByRole("button",{name:new RegExp(`Reveal the performer for ${character}`)}).click();
  await expect(firstArticle).toHaveAttribute("data-flipped","true");

  await page.unrouteAll({behavior:"ignoreErrors"});
  await page.route("**/data/shards/0001.json*",route=>route.abort());
  await open(page,"index.html?sort=actor");
  await expect(page.getByText("Couldn't load this page completely.",{exact:false})).toBeVisible();
  await expect(page.locator(".cast-shell")).toHaveCount(0);
});

test("Recognition comparison moves a clip, never the image geometry",async({page})=>{
  await open(page,"recognition.html#UC-035");
  await expect(page.getByRole("heading",{name:"The Borg Queen",exact:true}).first()).toBeVisible();
  await page.getByRole("button",{name:"Compare in one frame",exact:true}).click();
  const slider=page.getByRole("slider",{name:"Move the comparison seam between character and performer",exact:true});
  const geometry=async()=>page.locator(".uc-wipe-layer").evaluateAll(nodes=>nodes.map(node=>{
    const image=node.querySelector("img");
    const layer=node.getBoundingClientRect(),photo=image.getBoundingClientRect();
    return {layer:[layer.x,layer.y,layer.width,layer.height],photo:[photo.x,photo.y,photo.width,photo.height],clip:getComputedStyle(node).clipPath};
  }));
  const balanced=await geometry();
  expect(balanced[0].layer).toEqual(balanced[1].layer);
  expect(balanced[0].photo).toEqual(balanced[1].photo);
  await slider.press("Home");
  const left=await geometry();
  expect(left.map(row=>row.layer)).toEqual(balanced.map(row=>row.layer));
  expect(left.map(row=>row.photo)).toEqual(balanced.map(row=>row.photo));
  expect(left[0].clip).not.toBe(balanced[0].clip);
  await slider.press("End");
  const right=await geometry();
  expect(right.map(row=>row.layer)).toEqual(balanced.map(row=>row.layer));
  expect(right.map(row=>row.photo)).toEqual(balanced.map(row=>row.photo));
});

test("UC-035 comparison portrait is not a low-resolution sliver",async({page})=>{
  await open(page,"recognition.html#UC-035");
  await expect(page.getByRole("heading",{name:"The Borg Queen",exact:true}).first()).toBeVisible();
  const source=await page.evaluate(()=>RECORDS.get("UC-035").portrait.src);
  const dimensions=await page.evaluate(src=>new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});
    image.onerror=()=>reject(new Error(`Could not load ${src}`));
    image.src=new URL(src,location.href).href;
  }),source);
  expect(dimensions.width).toBeGreaterThanOrEqual(600);
  expect(dimensions.height/dimensions.width).toBeLessThanOrEqual(1.6);
});

test("Recognition and permanent-record missing portraits stay full-bleed",async({page})=>{
  const measure=async()=>page.locator('[data-plate="portrait"] .uc-image-well.is-absence').evaluate(well=>{
    const absence=well.querySelector(".uc-absence");
    const inner=well.querySelector(".uc-absence-inner");
    const image=[...inner.querySelectorAll("img")].find(node=>getComputedStyle(node).display!=="none");
    const rect=node=>{
      const box=node.getBoundingClientRect();
      return {top:box.top,right:box.right,bottom:box.bottom,left:box.left,width:box.width,height:box.height};
    };
    const style=getComputedStyle(inner);
    return {
      well:rect(well),
      absence:rect(absence),
      inner:rect(inner),
      image:rect(image),
      border:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],
      padding:getComputedStyle(absence).padding
    };
  });
  const expectFullBleed=metrics=>{
    expect(metrics.border).toEqual(["0px","0px","0px","0px"]);
    expect(metrics.padding).toBe("0px");
    for(const edge of ["top","right","bottom","left"]){
      expect(Math.abs(metrics.absence[edge]-metrics.well[edge])).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.inner[edge]-metrics.absence[edge])).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.image[edge]-metrics.inner[edge])).toBeLessThanOrEqual(1);
    }
  };

  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await open(page,"recognition.html#UC-040");
    await expect(page.getByRole("heading",{name:"Zathras",exact:true}).first()).toBeVisible();
    await expect(page.locator('[data-plate="portrait"] .uc-absence')).toHaveAttribute("aria-label",/not on file/);
    expectFullBleed(await measure());

    await open(page,"records/UC-040/");
    const permanent=await page.locator(".record-image.absent").evaluate(well=>{
      const image=well.querySelector("img");
      const rect=node=>{
        const box=node.getBoundingClientRect();
        return {top:box.top,right:box.right,bottom:box.bottom,left:box.left};
      };
      return {well:rect(well),image:rect(image),padding:getComputedStyle(image).padding};
    });
    await expect(page.locator(".record-image.absent img")).toHaveAttribute("alt",/not on file/);
    expect(permanent.padding).toBe("0px");
    for(const edge of ["top","right","bottom","left"]){
      expect(Math.abs(permanent.image[edge]-permanent.well[edge])).toBeLessThanOrEqual(1);
    }
  }
});

test("Recognition renders role evidence, voice truth, narrow pairs, and local connection failure",async({page})=>{
  await open(page,"recognition.html#UC-019");
  await expect(page.getByRole("heading",{name:"Quark",exact:true}).first()).toBeVisible();
  await expect(page.getByText("Filed performance",{exact:true})).toHaveCount(3);
  await expect(page.getByText("Bractor",{exact:true})).toBeVisible();

  await open(page,"recognition.html#UC-115");
  await expect(page.getByText("Voice performance",{exact:true}).first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText("this face moves into view");
  await expect(page.getByRole("button",{name:"Compare in one frame",exact:true})).toHaveCount(0);

  await page.setViewportSize({width:390,height:844});
  await open(page,"recognition.html#UC-035");
  await expect(page.getByRole("heading",{name:"The Borg Queen",exact:true}).first()).toBeVisible();
  expect(await page.locator("#pair").evaluate(node=>getComputedStyle(node).gridTemplateColumns)).not.toContain(" ");

  await page.setViewportSize({width:1280,height:900});
  await open(page,"recognition.html#UC-035");
  await expect(page.getByRole("heading",{name:"The Borg Queen",exact:true}).first()).toBeVisible();
  const failureTarget=await page.evaluate(()=>{
    const position=INDEX.findIndex(entry=>entry.id==="UC-035");
    const candidate=buildConnectionPlan(INDEX[position],position).flatMap(rail=>rail.entries)[0];
    RECORDS.delete(candidate.id);
    SHARDS.delete(candidate.sh);
    return {file:MANIFEST.shards[candidate.sh].file};
  });
  await page.route(`**/data/${failureTarget.file}*`,route=>route.abort());
  await page.route("**/data/specimens.json*",route=>route.abort());
  await page.evaluate(()=>{ canonicalPromise=null; });
  await page.evaluate(()=>showRecord("UC-035"));
  await expect(page.getByText("Connections could not be loaded. The record above remains available.",{exact:true})).toBeVisible();
});

test("coverage and constellation preserve human-searchable, unique evidence",async({page})=>{
  await open(page,"coverage.html?franchise=Star+Trek&category=Ferengi&mode=physical-any");
  await expect(page.locator("#rows tr").first()).toBeVisible();
  await page.locator("#query").fill("Max Grodenchik");
  await expect(page.locator("#rows")).toContainText("Max Grodénchik");

  await open(page,"constellation.html?id=constellation%3Aevery-ferengi-performer");
  await expect(page.locator(".person-row").first()).toBeVisible();
  const identity=await page.locator(".role-stack .node").evaluateAll(nodes=>({
    ids:nodes.map(node=>node.id),
    bok:nodes.filter(node=>node.dataset.node==="character:ferengi-bok").map(node=>node.getAttribute("href"))
  }));
  expect(new Set(identity.ids).size).toBe(identity.ids.length);
  expect(identity.bok.length).toBeGreaterThan(1);
  expect(new Set(identity.bok).size).toBe(identity.bok.length);
  expect(identity.bok.every(href=>href.includes("edge="))).toBeTruthy();

  await open(page,"constellation.html?id=constellation%3Ads9-changeling-performers");
  await expect(page.getByRole("heading",{name:"Every filed DS9 Changeling performer",exact:true})).toBeVisible();
  await expect(page.locator("#metrics")).toContainText("11people");
  await expect(page.locator("#metrics")).toContainText("14credited roles");
  await expect(page.locator("#metrics")).toContainText("3wall records");
  await expect(page.locator("#map")).toContainText("William Frankfather");
  await expect(page.locator("#map")).toContainText("Tami Peterson");
  await expect(page.locator("#edges")).toContainText("Changeling trio — second male Founder");
});

test("all canonical sitemap routes resolve and merged aliases stay out",async({request})=>{
  test.setTimeout(120_000);
  const sitemapResponse=await request.get(sitePath("sitemap.xml"));
  expect(sitemapResponse.ok()).toBeTruthy();
  const xml=await sitemapResponse.text();
  const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>new URL(match[1]).pathname);
  expect(urls).toHaveLength(1083);
  expect(urls.some(path=>path.includes("/records/UC-257/"))).toBeFalsy();
  for(let offset=0;offset<urls.length;offset+=40){
    const batch=urls.slice(offset,offset+40);
    const responses=await Promise.all(batch.map(path=>request.get(sitePath(path.replace(/^\/undercast\//,"")))));
    const failures=responses.map((response,index)=>response.ok()?null:`${batch[index]} → ${response.status()}`).filter(Boolean);
    expect(failures).toEqual([]);
  }
  const alias=await request.get(sitePath("records/UC-257/"));
  expect(alias.ok()).toBeTruthy();
  expect(await alias.text()).toContain("recognition.html#UC-959");
});
