import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const specimens = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "specimens.json"), "utf8"));
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2WzW4QAAAABJRU5ErkJggg==",
  "base64",
);
const jpeg = fs.readFileSync(path.join(ROOT, "images", "uc-035-portrait.jpg"));

test.setTimeout(120_000);

const sitePath = pathname => `/undercast/${String(pathname).replace(/^\//, "")}`;
const open = (page, pathname) => page.goto(sitePath(pathname), { waitUntil: "domcontentloaded" });
const waitForWall = async page => {
  await expect(page.locator("#grid")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#grid .cast-shell").first()).toBeVisible();
};

test.beforeEach(async ({ page }) => {
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
      (url.hostname === "github.com" || url.hostname === "release-assets.githubusercontent.com")
    ) {
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpeg });
    }
    if (request.resourceType() === "image" && !["127.0.0.1", "localhost"].includes(url.hostname)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: pixel });
    }
    return route.continue();
  });
});

test("failed index falls back to canonical specimens", async ({ page }) => {
  await page.route("**/data/index.json*", route => route.abort("failed"));
  await open(page, "index.html");
  await waitForWall(page);
  await expect(page.getByText("Couldn't load the roster.", { exact: true })).toHaveCount(0);
  expect(specimens.length).toBeGreaterThan(0);
});

test("failed index and canonical fallback recover through in-page retry", async ({ page }) => {
  let failSources = true;
  const maybeFail = route => failSources ? route.abort("failed") : route.fallback();
  await page.route("**/data/index.json*", maybeFail);
  await page.route("**/data/specimens.json*", maybeFail);

  await open(page, "index.html");
  await expect(page.getByText("Couldn't load the roster.", { exact: true })).toBeVisible();
  await expect(page.locator("#grid .cast-shell")).toHaveCount(0);
  await expect(page.locator("#retryBoot")).toBeVisible();

  failSources = false;
  await page.locator("#retryBoot").click();
  await waitForWall(page);
  await expect(page.getByText("Couldn't load the roster.", { exact: true })).toHaveCount(0);
});

test("failed shard refuses partial filtered truth and recovers", async ({ page }) => {
  let failShard = true;
  await page.route(
    "**/data/shards/0001.json*",
    route => failShard ? route.abort("failed") : route.fallback(),
  );

  await open(page, "index.html?sort=actor");
  await expect(page.getByText("Couldn't load this page completely.", { exact: false })).toBeVisible();
  await expect(page.locator("#grid .cast-shell")).toHaveCount(0);
  await expect(page.locator("#retryBtn")).toBeVisible();

  failShard = false;
  await page.locator("#retryBtn").click();
  await waitForWall(page);
  await expect(page.getByText("Couldn't load this page completely.", { exact: false })).toHaveCount(0);
});

test("failed graph projection stays honest and retry reloads it", async ({ page }) => {
  let failGraph = true;
  await page.route(
    "**/data/constellations.json*",
    route => failGraph ? route.abort("failed") : route.fallback(),
  );

  await open(page, "constellation.html?id=constellation%3Aevery-ferengi-performer");
  await expect(page.locator("#empty")).toBeVisible();
  await expect(page.locator("#empty")).toContainText(/graph could not be loaded/i);
  await expect(page.locator(".person-row")).toHaveCount(0);

  failGraph = false;
  await page.locator("#retry").click();
  await expect(page.locator(".person-row").first()).toBeVisible();
  await expect(page.locator("#empty")).toBeHidden();
});

test("offline cited image becomes an honest Recognition fallback and recovers", async ({ page }) => {
  let failImage = true;
  await page.route(
    "**/uc-035-portrait*",
    route => failImage
      ? route.fulfill({ status: 404, contentType: "text/plain", body: "deterministic image failure" })
      : route.fallback(),
  );

  await open(page, "recognition.html#UC-035");
  await expect(page.locator("#record-title")).toBeVisible();
  const plate = page.locator('#pair [data-plate="portrait"]');
  await expect(plate.locator(".uc-image-node.uc-absence")).toBeVisible();
  await expect(plate.locator(".uc-caption-main")).toHaveText("Image could not be loaded.");
  await expect(plate.locator(".uc-note")).toContainText(/filed image could not be retrieved/i);
  await expect(plate.locator(".uc-photo")).toHaveCount(0);

  failImage = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(plate.locator(".uc-photo")).toBeVisible();
  await expect(plate.locator(".uc-image-node.uc-absence")).toHaveCount(0);
  await expect(plate.locator(".uc-note")).toHaveCount(0);
});
