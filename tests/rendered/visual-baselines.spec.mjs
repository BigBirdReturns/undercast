import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const fixture = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests", "rendered", "fixtures", "visual-records.json"), "utf8"),
);
const specimens = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "specimens.json"), "utf8"));
const byId = new Map(specimens.map(record => [record.id, record]));
const imageFixture = fs.readFileSync(path.join(ROOT, "images", "uc-035-portrait.jpg"));
const stateEntries = Object.entries(fixture.states);

test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

const hasMedia = (record, field) => Boolean(record?.[field]?.src);
const isVoice = record =>
  record?.kind === "voice" ||
  record?.mode === "voice" ||
  record?.modality === "voice" ||
  record?.voice_only === true;

function validateFixture() {
  const ids = new Set();
  for (const [state, value] of stateEntries) {
    const record = byId.get(value.id);
    if (!record) throw new Error(`${state} visual fixture ${value.id} is absent from canonical specimens`);
    if (ids.has(value.id)) throw new Error(`visual fixture ${value.id} is reused across states`);
    ids.add(value.id);
    const portrait = hasMedia(record, "portrait");
    const still = hasMedia(record, "still");
    if (state === "complete-media" && (!portrait || !still || isVoice(record))) {
      throw new Error(`${value.id} no longer satisfies complete-media`);
    }
    if (state === "partial-media" && (portrait === still || isVoice(record))) {
      throw new Error(`${value.id} no longer satisfies partial-media`);
    }
    if (state === "voice-only" && !isVoice(record)) {
      throw new Error(`${value.id} no longer satisfies voice-only`);
    }
    if (state === "all-media-absent" && (portrait || still || isVoice(record))) {
      throw new Error(`${value.id} no longer satisfies all-media-absent`);
    }
  }
}

validateFixture();

const sitePath = pathname => `/undercast/${String(pathname).replace(/^\//, "")}`;

async function stabilize(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    scrollTo(0, 0);
  });
}

async function openStable(page, pathname, selector) {
  await page.goto(sitePath(pathname), { waitUntil: "domcontentloaded" });
  if (selector) await expect(page.locator(selector).first()).toBeVisible();
  await stabilize(page);
}

const screenshot = {
  animations: "disabled",
  caret: "hide",
  scale: "css",
  maxDiffPixelRatio: 0.001,
  maskColor: "#777777",
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.route("**/*", route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "fonts.googleapis.com") {
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    }
    if (url.hostname === "fonts.gstatic.com") {
      return route.fulfill({ status: 200, contentType: "font/woff2", body: Buffer.alloc(0) });
    }
    if (
      request.resourceType() === "image" &&
      (
        url.hostname === "github.com" ||
        url.hostname === "release-assets.githubusercontent.com" ||
        (["127.0.0.1", "localhost"].includes(url.hostname) && /\/images\/.+\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname))
      )
    ) {
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: imageFixture });
    }
    if (request.resourceType() === "image" && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: imageFixture });
    }
    return route.continue();
  });
});

test("wall root", async ({ page }) => {
  await openStable(page, "index.html", "#grid .cast-shell");
  await expect(page).toHaveScreenshot("wall-root.png", {
    ...screenshot,
    mask: [page.locator("#grid"), page.locator("#result-status"), page.locator("#count")],
  });
});

test("recognition root", async ({ page }) => {
  await openStable(page, "recognition.html#UC-001", "#record-title");
  await expect(page).toHaveScreenshot("recognition-root.png", {
    ...screenshot,
    mask: [
      page.locator(".uc-association-line"),
      page.locator(".uc-title"),
      page.locator(".uc-role"),
      page.locator(".uc-pair"),
      page.locator(".uc-dossier"),
    ],
  });
});

test("coverage root", async ({ page }) => {
  await openStable(page, "coverage.html", "#rows tr");
  await expect(page).toHaveScreenshot("coverage-root.png", {
    ...screenshot,
    mask: [page.locator("#benchmark"), page.locator("#metrics"), page.locator(".table-wrap")],
  });
});

test("constellation root", async ({ page }) => {
  await openStable(page, "constellation.html?id=constellation%3Aevery-ferengi-performer", ".person-row");
  await expect(page).toHaveScreenshot("constellation-root.png", {
    ...screenshot,
    mask: [page.locator("#metrics"), page.locator("#map"), page.locator(".ledger")],
  });
});

test("not-found root", async ({ page }) => {
  await openStable(page, "404.html", "#recovery");
  await expect(page).toHaveScreenshot("not-found-root.png", screenshot);
});

for (const [state, value] of stateEntries) {
  test(`permanent record ${state}`, async ({ page }) => {
    await openStable(page, `records/${value.id}/`, "#record-main");
    await expect(page).toHaveScreenshot(`record-${state}.png`, screenshot);
  });
}
