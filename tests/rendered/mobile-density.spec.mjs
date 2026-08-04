import { test, expect } from "@playwright/test";

const sitePath = pathname => `/undercast/${String(pathname).replace(/^\//, "")}`;
const open = (page, pathname) => page.goto(sitePath(pathname), { waitUntil: "domcontentloaded" });
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==",
  "base64",
);

const expectNoDocumentOverflow = async (page, label) => {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.width, `${label} document width`).toBeLessThanOrEqual(dimensions.viewport + 1);
};

const expectMinimumHeight = async (locator, minimum, label) => {
  const box = await locator.boundingBox();
  expect(box, `${label} bounding box`).not.toBeNull();
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(minimum);
};

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
    if (request.resourceType() === "image" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      return route.fulfill({ status: 200, contentType: "image/png", body: pixel });
    }
    return route.continue();
  });
});

test("Coverage keeps table semantics while presenting mobile-readable row cards", async ({ page }) => {
  await open(page, "coverage.html");
  const firstRow = page.locator("#rows tr").first();
  await expect(firstRow).toBeVisible();

  await expect(page.getByRole("table", { name: "Performer and designed role coverage", exact: true })).toBeVisible();
  await expect(firstRow).toHaveCSS("display", "grid");
  const labels = await firstRow.locator('[role="cell"]').evaluateAll(cells => cells.map(cell => cell.dataset.label));
  expect(labels).toEqual(["Performer", "Designed role", "Mode", "Archive", "Evidence"]);

  const selects = page.locator(".filters select");
  const first = await selects.nth(0).boundingBox();
  const second = await selects.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(first.width).toBeGreaterThan(300);
  expect(second.y).toBeGreaterThan(first.y + first.height);
  await expectMinimumHeight(selects.first(), 44, "Coverage filter");
  await expectMinimumHeight(page.locator(".site-nav a").first(), 44, "Coverage primary navigation target");
  await expectNoDocumentOverflow(page, "Coverage");
});

test("wall facets collapse into a deliberate mobile disclosure and retain active state", async ({ page }) => {
  await open(page, "index.html");
  await waitForWall(page);

  const disclosure = page.locator("#filterDisclosure");
  const summary = disclosure.locator(":scope > summary");
  await expect(summary).toBeVisible();
  await expect(disclosure).not.toHaveAttribute("open", "");
  await expect(page.locator("#filterSummary")).toHaveText("All shelves, decades, and species");
  await expectMinimumHeight(summary, 44, "wall filter disclosure");

  await summary.click();
  await expect(disclosure).toHaveAttribute("open", "");
  await expectMinimumHeight(page.locator("#chips .chip").first(), 44, "wall shelf facet");
  await expectNoDocumentOverflow(page, "wall with open facets");

  await open(page, "index.html?species=Ferengi#archive");
  await waitForWall(page);
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(page.locator("#filterSummary")).toContainText("Ferengi");
  await expect(page.getByRole("button", { name: "Ferengi", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expectNoDocumentOverflow(page, "filtered wall");
});

test("Recognition exposes a sticky in-record map without replacing the record hash", async ({ page }) => {
  await open(page, "recognition.html#UC-001");
  await expect(page.locator("#record-title")).toBeVisible();

  const recordMap = page.getByRole("navigation", { name: "Within this record", exact: true });
  await expect(recordMap).toBeVisible();
  const work = recordMap.getByRole("button", { name: "Work", exact: true });
  await expectMinimumHeight(work, 44, "Recognition record-map target");
  await work.click();
  await expect(page.locator("#record-work")).toBeInViewport();
  expect(new URL(page.url()).hash).toBe("#UC-001");

  const paths = recordMap.getByRole("button", { name: "Paths", exact: true });
  await paths.click();
  await expect(page.locator("#connections")).toBeInViewport();
  expect(new URL(page.url()).hash).toBe("#UC-001");
  await expectNoDocumentOverflow(page, "Recognition");
});

test("Constellation role stacks use mobile disclosure and open a deep-linked edge", async ({ page }) => {
  const constellation = "constellation:every-ferengi-performer";
  await open(page, `constellation.html?id=${encodeURIComponent(constellation)}`);
  await expect(page.locator(".person-row").first()).toBeVisible();

  const groups = page.locator("details.role-group");
  await expect(groups.first()).toBeVisible();
  await expect(page.locator("details.role-group[open]")).toHaveCount(0);
  const firstSummary = groups.first().locator(":scope > summary");
  await expectMinimumHeight(firstSummary, 44, "Constellation role disclosure");
  await firstSummary.click();
  await expect(groups.first()).toHaveAttribute("open", "");
  const firstEdge = groups.first().locator("[data-edge]").first();
  await expect(firstEdge).toBeVisible();
  const edgeId = await firstEdge.getAttribute("data-edge");
  expect(edgeId).toBeTruthy();
  await expectNoDocumentOverflow(page, "expanded Constellation");

  await open(page, `constellation.html?id=${encodeURIComponent(constellation)}&edge=${encodeURIComponent(edgeId)}`);
  const selected = page.locator('[data-selected="true"][data-edge]').first();
  await expect(selected).toHaveAttribute("data-edge", edgeId);
  await expect(selected).toBeVisible();
  await expect(selected.locator("xpath=ancestor::details[1]")).toHaveAttribute("open", "");
  await expectNoDocumentOverflow(page, "deep-linked Constellation");
});
