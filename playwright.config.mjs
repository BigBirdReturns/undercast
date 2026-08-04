import { defineConfig, devices } from "@playwright/test";

const journey = testMatch => ({ testMatch });

export default defineConfig({
  testDir: "./tests/rendered",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173/undercast",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "chromium-desktop", testMatch: /site\.spec\.mjs/, use: { ...devices["Desktop Chrome"] } },
    { name: "ux-chromium-desktop", ...journey(/ux-journeys\.spec\.mjs/), use: { ...devices["Desktop Chrome"] } },
    { name: "ux-firefox-desktop", ...journey(/ux-journeys\.spec\.mjs/), use: { ...devices["Desktop Firefox"] } },
    { name: "ux-webkit-desktop", ...journey(/ux-journeys\.spec\.mjs/), use: { ...devices["Desktop Safari"] } },
    { name: "ux-chromium-mobile", ...journey(/ux-journeys\.spec\.mjs/), use: { ...devices["Pixel 5"] } },
    { name: "ux-webkit-mobile", ...journey(/ux-journeys\.spec\.mjs/), use: { ...devices["iPhone 13"] } }
  ],
  webServer: {
    command: "node scripts/build-record-pages.mjs && node scripts/serve-test.mjs",
    url: "http://127.0.0.1:4173/undercast/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
