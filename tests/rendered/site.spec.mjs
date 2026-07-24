import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const sitePath=path=>`/undercast/${String(path).replace(/^\//,"")}`;
const open=(page,path)=>page.goto(sitePath(path),{waitUntil:"domcontentloaded"});
const pixel=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xh9WAAAAAElFTkSuQmCC","base64");
const jpeg=await readFile(new URL("../../images/uc-035-portrait.jpg",import.meta.url));
const waitForWall=async page=>expect(page.locator("#result-status")).toContainText(/specimens? match/);
const channels=color=>(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const luminance=color=>{
  const values=channels(color).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return .2126*values[0]+.7152*values[1]+.0722*values[2];
};
const contrast=(a,b)=>{
  const [lighter,darker]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (lighter+.05)/(darker+.05);
};
const expectContrast=async(page,selector,background)=>{
  const samples=await page.locator(selector).evaluateAll((nodes,forced)=>nodes.filter(node=>{
    const style=getComputedStyle(node),rect=node.getBoundingClientRect();
    return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0;
  }).map(node=>{
    let current=node,bg=forced;
    while(!bg&&current){
      const candidate=getComputedStyle(current).backgroundColor;
      if(candidate&&!/rgba?\([^)]*,\s*0\s*\)$/.test(candidate)&&candidate!=="transparent") bg=candidate;
      current=current.parentElement;
    }
    return {text:node.textContent.trim().slice(0,50),fg:getComputedStyle(node).color,bg:bg||"rgb(255, 255, 255)"};
  }),background);
  expect(samples.length,`${selector} rendered samples`).toBeGreaterThan(0);
  for(const sample of samples) expect(contrast(sample.fg,sample.bg),`${selector} “${sample.text}” ${sample.fg} on ${sample.bg}`).toBeGreaterThanOrEqual(4.5);
};
const captureConsoleErrors=page=>{
  const errors=[];
  page.on("console",message=>{ if(message.type()==="error") errors.push(message.text()); });
  return errors;
};

test.beforeEach(async({page})=>{
  await page.route("**/*",route=>{
    const request=route.request(),url=new URL(request.url());
    // keep the suite hermetic: external images -> 1x1, Google Fonts -> empty (fallback
    // fonts render fine for behaviour tests, and the run no longer depends on network).
    if(url.hostname==="fonts.googleapis.com") return route.fulfill({status:200,contentType:"text/css",body:""});
    if(url.hostname==="fonts.gstatic.com") return route.fulfill({status:200,contentType:"font/woff2",body:Buffer.alloc(0)});
    if(url.hostname==="github.com"&&url.pathname.includes("/releases/download/")) return route.fulfill({status:200,contentType:"image/jpeg",body:jpeg});
    if(url.hostname==="release-assets.githubusercontent.com") return route.fulfill({status:200,contentType:"image/jpeg",body:jpeg});
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

  const first=articles.first();
  const frontControl=first.getByRole("button",{name:/Reveal the performer for/});
  await expect(frontControl).toHaveAttribute("aria-pressed","false");
  await frontControl.focus();
  await page.keyboard.press("Enter");
  const backControl=first.getByRole("button",{name:/Return to/});
  await expect(backControl).toBeFocused();
  await expect(backControl).toHaveAttribute("aria-pressed","true");
  await expect(first.locator(".front")).toHaveAttribute("aria-hidden","true");
  await expect(first.locator(".back")).toHaveAttribute("aria-hidden","false");
  const story=first.locator(".back .reveal");
  await expect(story).toBeVisible();
  await expect(story).toHaveCSS("display","block");
  await page.keyboard.press("Enter");
  await expect(frontControl).toBeFocused();
  await expect(frontControl).toHaveAttribute("aria-pressed","false");

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

test("archive navigation stays complete, consistent, and inside every viewport",async({page})=>{
  const surfaces=[
    {path:"index.html",ready:"#result-status",align:".controls",current:1},
    {path:"recognition.html#UC-001",ready:"#record-title",align:".uc-record",current:1},
    {path:"coverage.html",ready:"#rows tr",align:".eyebrow",current:1},
    {path:"constellation.html",ready:".person-row",align:".hero",current:0},
    {path:"records/UC-001/",ready:"#record-main",align:".record-meta",current:1},
    {path:"404.html",ready:"#recovery",align:".kicker",current:0}
  ];
  const core=["Browse","Coverage","Makers","About"];
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const surface of surfaces){
      await open(page,surface.path);
      await expect(page.locator(surface.ready).first()).toBeVisible();
      const nav=page.getByRole("navigation",{name:"Archive navigation",exact:true});
      await expect(nav).toBeVisible();
      for(const label of core) await expect(nav.getByRole("link",{name:label,exact:true})).toBeVisible();
      await expect(nav.getByRole("link",{name:"Constellations",exact:true})).toHaveCount(0);
      const browseTarget=await nav.getByRole("link",{name:"Browse",exact:true}).evaluate(link=>new URL(link.href).hash);
      expect(browseTarget,`${surface.path} Browse destination`).toBe("#archive");
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(surface.current);
      const targets=await nav.locator("a,button").evaluateAll(nodes=>nodes.filter(node=>{
        const style=getComputedStyle(node),rect=node.getBoundingClientRect();
        return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0;
      }).map(node=>{
        const rect=node.getBoundingClientRect();
        return {label:node.textContent.trim(),width:rect.width,height:rect.height};
      }));
      for(const target of targets){
        expect(target.width,`${surface.path} ${target.label} target width at ${viewport.width}px`).toBeGreaterThanOrEqual(24);
        expect(target.height,`${surface.path} ${target.label} target height at ${viewport.width}px`).toBeGreaterThanOrEqual(24);
      }
      const overflow=await page.locator(".site-shell").evaluate(shell=>{
        const viewportWidth=document.documentElement.clientWidth;
        const visible=[shell,...shell.querySelectorAll("a,button")].filter(node=>{
          const style=getComputedStyle(node),rect=node.getBoundingClientRect();
          return style.display!=="none"&&style.visibility!=="hidden"&&rect.width>0&&rect.height>0;
        });
        return visible.map(node=>{
          const rect=node.getBoundingClientRect();
          return {text:node.textContent.trim(),left:rect.left,right:rect.right};
        }).filter(item=>item.left < -1 || item.right > viewportWidth + 1);
      });
      expect(overflow,`${surface.path} at ${viewport.width}px`).toEqual([]);
      const alignment=await page.locator(".site-brand").evaluate((brand,selector)=>{
        const content=document.querySelector(selector);
        return Math.abs(brand.getBoundingClientRect().left-content.getBoundingClientRect().left);
      },surface.align);
      expect(alignment,`${surface.path} shell/content alignment at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test("wall search, current decade, flip semantics, and partial failure are honest",async({page})=>{
  await open(page,"index.html");
  await waitForWall(page);
  await page.getByRole("searchbox",{name:"Search a character, a performer, or a production",exact:true}).fill("Borg Queen");
  // three Borg Queens since UC-1178 (Annie Wersching, PIC) joined Krige and Thompson
  await expect(page.locator("#result-status")).toHaveText("3 specimens match; 3 shown.");
  await expect(page.locator(".cast-shell")).toHaveCount(3);
  await expect(page.locator(".looplink")).toHaveCount(3);

  await page.getByRole("searchbox",{name:"Search a character, a performer, or a production",exact:true}).fill("");
  await page.getByRole("button",{name:"20s",exact:true}).click();
  await expect(page.locator("#result-status")).toHaveText("89 specimens match; 89 shown.");

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

test("mobile typed search reaches matching cards without a reveal-bypassing lobby",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page,"index.html");
  await waitForWall(page);
  await expect(page.locator(".featured-block, #featuredRow, .feat")).toHaveCount(0);
  await page.getByRole("link",{name:/Explore all specimens/}).click();
  await page.getByRole("searchbox",{name:"Search a character, a performer, or a production",exact:true}).fill("Garak");
  const first=page.locator(".cast-shell").first();
  await expect(first).toBeVisible();
  await expect(first).toContainText("Garak");
  const top=await first.evaluate(node=>node.getBoundingClientRect().top);
  expect(top).toBeLessThan(844);
});

test("homepage Morn hero flips on click and keyboard, keeping focus on the one button",async({page})=>{
  await open(page,"index.html");
  const card=page.locator("#mornCard");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-flipped","false");
  await expect(card).toHaveAttribute("aria-pressed","false");
  await expect(card).not.toHaveAttribute("aria-label",/Mark Allen Shepherd/);
  await expect(page.locator("#reveal-title")).not.toContainText("Mark Allen Shepherd");
  await page.setViewportSize({width:390,height:844});
  const cue=page.locator(".hero-turn");
  await expect(cue).toBeVisible();
  const cueGeometry=await cue.evaluate(node=>{
    const cueRect=node.getBoundingClientRect(),cardRect=node.closest(".hero-card").getBoundingClientRect();
    return {inside:cueRect.top>=cardRect.top&&cueRect.right<=cardRect.right&&cueRect.bottom<=cardRect.bottom,top:cueRect.top};
  });
  expect(cueGeometry.inside).toBeTruthy();
  expect(cueGeometry.top).toBeLessThan(844);
  // click flips to the performer, and the state is reflected visibly + accessibly
  await card.click();
  await expect(card).toHaveAttribute("data-flipped","true");
  await expect(card).toHaveAttribute("aria-pressed","true");
  await expect(card).toHaveAttribute("aria-label",/Mark Allen Shepherd/);
  await expect(page.locator(".hero-turn")).toHaveText(/back to the character/i);
  // keyboard: one persistent button — Space and Enter each toggle it, focus never leaves it
  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveAttribute("data-flipped","false");
  await expect(card).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("data-flipped","true");
  await expect(card).toBeFocused();
  // the retired seam is not here either — no slider in the hero
  await expect(page.locator("#mornCard input[type=range], .landing-reveal .uc-wipe-frame")).toHaveCount(0);
});

test.describe("homepage without JavaScript",()=>{
  test.use({javaScriptEnabled:false});
  test("hides every dead discovery control and offers durable archive paths",async({page})=>{
    await open(page,"index.html");
    await expect(page.locator("#mornCard")).toBeHidden(); // JS-gated: no dead control
    for(const selector of [".lenses","#q","#sort","#random","#grid","#makerChips"]){
      await expect(page.locator(selector)).toBeHidden();
    }
    await expect(page.getByRole("heading",{name:"The interactive wall needs JavaScript."})).toBeVisible();
    await expect(page.locator('a[href="./records/UC-001/"]')).toHaveCount(2); // hero + archive fallbacks
    await expect(page.locator('.nojs-archive a[href="./records/UC-001/"]')).toBeVisible();
    await expect(page.locator('.nojs-archive a[href="./data/archive.json"]')).toBeVisible();
    expect(await page.locator("#archive").evaluate(node=>node.innerText)).not.toContain("0 records on file");
  });
});

test.describe("depth surfaces without JavaScript",()=>{
  test.use({javaScriptEnabled:false});

  test("retires dead controls and loading shells at desktop and mobile sizes",async({page})=>{
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
      await page.setViewportSize(viewport);

      await open(page,"recognition.html#UC-035");
      await expect(page.getByRole("heading",{name:"The records are still here."})).toBeVisible();
      await expect(page.locator("#record-view .uc-loading")).toBeHidden();
      await expect(page.locator("#connections-nav:visible,#theme:visible")).toHaveCount(0);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(page.locator('#record-view a[href="./records/UC-001/"]')).toBeVisible();
      await expect(page.locator('button:visible,input:visible,select:visible')).toHaveCount(0);

      await open(page,"coverage.html");
      await expect(page.getByRole("heading",{name:"The filed coverage remains available."})).toBeVisible();
      for(const selector of ["#benchmark",".filters","#metrics",".table-wrap"]){
        await expect(page.locator(selector)).toBeHidden();
      }
      for(const href of ["data/CENSUS-COVERAGE.json","data/CENSUS-SUMMARY.json","data/CENSUS-FERENGI-TEST.json"]){
        await expect(page.locator(`a[href="${href}"]`)).toBeVisible();
      }
      await expect(page.locator('button:visible,input:visible,select:visible')).toHaveCount(0);

      await open(page,"constellation.html?id=constellation%3Aevery-ferengi-performer");
      await expect(page.getByRole("heading",{name:"No relationship path has been inferred."})).toBeVisible();
      for(const selector of ["#summary","#constellation","#metrics","#map",".ledger"]){
        await expect(page.locator(selector)).toBeHidden();
      }
      await expect(page.locator('a[href="data/constellations.json"]')).toBeVisible();
      await expect(page.locator('button:visible,input:visible,select:visible')).toHaveCount(0);
    }
  });
});

test.describe("permanent records without JavaScript",()=>{
  test.use({javaScriptEnabled:false});

  test("renders filed Release images from a narrowly pinned GitHub host",async({page})=>{
    await open(page,"records/UC-001/");
    const policy=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(policy).toContain("object-src 'self' https://github.com https://release-assets.githubusercontent.com");
    expect(policy).not.toContain("object-src https:");
    await expect(page.locator(".record-media")).toHaveCount(2);
    await expect(page.locator(".record-media").first()).toBeVisible();
    for(const fallback of await page.locator(".record-absence.load-failed").all()) await expect(fallback).toBeHidden();
  });

  test("distinguishes a filed image load failure from evidence not on file",async({page})=>{
    await page.route("**/releases/download/**",route=>route.abort());
    await open(page,"records/UC-040/");
    const failed=page.locator(".record-absence.load-failed");
    const notFiled=page.locator(".record-absence.not-filed");
    await expect(failed).toBeVisible();
    await expect(failed).toHaveAttribute("aria-label",/could not be loaded/);
    await expect(notFiled).toBeVisible();
    await expect(notFiled).toHaveAttribute("aria-label",/not on file/);
    const geometry=await failed.evaluate(node=>{
      const well=node.closest(".record-image").getBoundingClientRect(),fallback=node.getBoundingClientRect();
      return {well:[well.top,well.right,well.bottom,well.left],fallback:[fallback.top,fallback.right,fallback.bottom,fallback.left]};
    });
    for(let edge=0;edge<4;edge++) expect(Math.abs(geometry.well[edge]-geometry.fallback[edge])).toBeLessThanOrEqual(1);
  });

  test("preserves curated focus and fails honestly for a committed local image",async({page})=>{
    await open(page,"records/UC-035/");
    const portrait=page.locator('.record-image[data-focus-y="upper"] .record-media');
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveCSS("object-position","50% 28%");

    await page.unrouteAll({behavior:"wait"});
    // the portrait now serves from GitHub Releases under a content-addressed
    // name — abort it wherever it lives, not just at the legacy local path.
    await page.route("**/uc-035-portrait*",route=>route.abort());
    await open(page,"records/UC-035/?failed-local=1");
    const fallback=page.locator('.record-image[data-focus-y="upper"] .record-absence.load-failed');
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("aria-label",/filed evidence is temporarily unavailable/);
  });
});

test("small archival labels retain WCAG AA contrast on every display surface",async({page})=>{
  await open(page,"recognition.html#UC-001");
  await expect(page.getByRole("heading",{name:"Morn",exact:true}).first()).toBeVisible();
  for(const selector of [".uc-tagline",".uc-kicker",".uc-caption-prov",".uc-footer",".uc-theme"]) await expectContrast(page,selector);
  await page.locator("#theme").click();
  for(const selector of [".uc-tagline",".uc-kicker",".uc-caption-prov",".uc-footer",".uc-theme"]) await expectContrast(page,selector);

  await open(page,"coverage.html");
  await expect(page.locator("#rows tr").first()).toBeVisible();
  // the full-canon scope made "892-IV natives" the default category, which shows
  // the scope-snapshot box; the .benchmark-status span only renders on the
  // benchmark's own category — select it before sampling its contrast.
  await page.locator("#category").selectOption("Ferengi");
  await expect(page.locator(".benchmark-status")).toBeVisible();
  for(const selector of [".eyebrow",".benchmark-kicker",".benchmark-status",".filters label",".metrics span","th",".mode,.gap"]) await expectContrast(page,selector);

  await open(page,"constellation.html");
  await expect(page.locator(".person-row").first()).toBeVisible();
  const texture=await page.locator("body").evaluate(node=>({
    paper:getComputedStyle(document.documentElement).backgroundColor,
    image:getComputedStyle(node).backgroundImage,
    size:getComputedStyle(node).backgroundSize
  }));
  expect(texture.paper).toBe("rgb(233, 228, 216)");
  expect(texture.image).toContain("rgba(32, 31, 27, 0.08)");
  expect(texture.size).toBe("17px 17px");
  for(const selector of [".eyebrow",".hero-side label",".scope-note",".node:not(.person-node) .node-type"]) await expectContrast(page,selector,"rgb(217, 212, 201)");
  await expectContrast(page,".person-no","rgb(41, 42, 39)");

  await open(page,"records/UC-001/");
  for(const selector of [".record-meta",".record-kicker",".record-sub",".record-row span",".record-source"]) await expectContrast(page,selector);
});

test("Recognition shows side-by-side plates, not a comparison seam",async({page})=>{
  await open(page,"recognition.html#UC-001");
  await expect(page.getByRole("heading",{name:"Morn",exact:true}).first()).toBeVisible();
  await expect(page.locator('#pair [data-plate="still"]')).toBeVisible();
  await expect(page.locator('#pair [data-plate="portrait"]')).toBeVisible();
  // the retired comparison seam must be gone entirely
  await expect(page.getByRole("button",{name:"Compare in one frame",exact:true})).toHaveCount(0);
  await expect(page.locator("#comparison-stage, .uc-wipe-frame")).toHaveCount(0);
  await expect(page.getByRole("slider")).toHaveCount(0);
});

test("Recognition plates keep the character/person pair across breakpoints",async({page})=>{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await open(page,`recognition.html?layout=${viewport.width}x${viewport.height}#UC-035`);
    await expect(page.getByRole("heading",{name:"The Borg Queen",exact:true}).first()).toBeVisible();
    await expect(page.locator('#pair [data-plate]')).toHaveCount(2);
    await expect(page.locator("#comparison-stage, .uc-wipe-frame")).toHaveCount(0);
  }
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
      const image=well.querySelector(".record-absence");
      const rect=node=>{
        const box=node.getBoundingClientRect();
        return {top:box.top,right:box.right,bottom:box.bottom,left:box.left};
      };
      return {well:rect(well),image:rect(image)};
    });
    await expect(page.locator(".record-image.absent .record-absence")).toHaveAttribute("aria-label",/not on file/);
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
  await open(page,"coverage.html?franchise=Star+Trek&category=Klingons&mode=physical-any");
  await expect(page.locator("#rows tr").first()).toBeVisible();
  await expect(page.locator("#benchmark")).toContainText("KLINGONS SOURCE SNAPSHOT · Star Trek");
  await expect(page.locator("#benchmark")).toContainText("191 named performer-role credits across 173 performers");
  await expect(page.locator("#benchmark")).not.toContainText("FERENGI BENCHMARK");

  await open(page,"coverage.html?franchise=Star+Trek&category=Ferengi&mode=physical-any");
  await expect(page.locator("#rows tr").first()).toBeVisible();
  await expect(page.locator(".record-links a",{hasText:"interactive"}).first()).toBeVisible();
  await expect(page.getByRole("link",{name:"compare",exact:true})).toHaveCount(0);
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

test("Constellation mobile rows keep visual, reading, heading, and focus order aligned",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await open(page,"constellation.html?id=constellation%3Aevery-ferengi-performer");
  const rows=page.locator(".person-row");
  await expect(rows.first()).toBeVisible();
  const mobileOrder=await rows.evaluateAll(nodes=>nodes.map(row=>{
    const focusables=[...row.querySelectorAll("a")];
    const headings=[...row.querySelectorAll("h2,h3")];
    const person=row.querySelector(".person-node");
    const roleTops=[...row.querySelectorAll(".role-stack .node")].map(node=>node.getBoundingClientRect().top);
    return {
      personFirst:focusables[0]===person,
      headings:[...headings].map(node=>node.tagName),
      visualFirst:roleTops.every(top=>person.getBoundingClientRect().top<=top)
    };
  }));
  expect(mobileOrder.every(row=>row.personFirst&&row.headings[0]==="H2"&&row.headings.slice(1).every(tag=>tag==="H3")&&row.visualFirst)).toBeTruthy();

  const firstRow=rows.first();
  await firstRow.locator(".person-node").focus();
  await page.keyboard.press("Tab");
  await expect(firstRow.locator(".role-stack .node").first()).toBeFocused();

  await page.setViewportSize({width:1280,height:900});
  await expect(firstRow).toBeVisible();
  const desktopOrder=await firstRow.evaluate(row=>{
    const trek=row.querySelector(".role-stack-trek").getBoundingClientRect();
    const person=row.querySelector(".person-node").getBoundingClientRect();
    const elsewhere=row.querySelector(".role-stack-elsewhere").getBoundingClientRect();
    return trek.right<person.left&&person.right<elsewhere.left;
  });
  expect(desktopOrder).toBeTruthy();
});

test("all canonical sitemap routes resolve and merged aliases stay out",async({request})=>{
  test.setTimeout(120_000);
  const sitemapResponse=await request.get(sitePath("sitemap.xml"));
  expect(sitemapResponse.ok()).toBeTruthy();
  const xml=await sitemapResponse.text();
  const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>new URL(match[1]).pathname);
  expect(urls).toHaveLength(1252); // 1247 record pages + 5 top-level pages
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

test("Ferengi URL preserves the makers anchor and shows only exact displayed roles plus the complete source ledger",async({page})=>{
  await open(page,"index.html?shelf=Star+Trek&species=Ferengi#makers");
  await waitForWall(page);
  await expect(page).toHaveURL(/shelf=Star\+Trek&species=Ferengi#makers$/);
  await expect(page.getByRole("button",{name:"Star Trek",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"Ferengi",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#result-status")).toHaveText("14 specimens match; 14 shown.");
  const names=await page.locator(".charname").allTextContents();
  expect(names).toEqual(["Quark","Rom","Nog","Quark (mirror)","Brunt (mirror)","Nog (mirror)","Ishka","Bok / Gral / Prak","Krax","DaiMon Lurin","Grimp","Leck","Pel","Berik"]);
  expect(names).not.toContain("Weyoun");
  expect(names).not.toContain("Neelix");
  await expect(page.locator("#speciesContext")).toContainText("70 captured named credits");
  await expect(page.locator("#speciesContext")).toContainText("16 additional performances on file");
  await expect(page.locator("#speciesLedger > li")).toHaveCount(70);
  await expect(page.locator("#makers")).toBeInViewport();
});
