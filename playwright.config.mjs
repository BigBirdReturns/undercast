import { defineConfig, devices } from "@playwright/test";

const journey = testMatch => ({ testMatch });
const uxDesktopJourney = journey(/(?:ux-journeys|recovery-journeys)\.spec\.mjs/);
const uxMobileJourney = journey(/(?:ux-journeys|recovery-journeys|mobile-density)\.spec\.mjs/);

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
    { name: "ux-chromium-desktop", ...uxDesktopJourney, use: { ...devices["Desktop Chrome"] } },
    { name: "ux-firefox-desktop", ...uxDesktopJourney, use: { ...devices["Desktop Firefox"] } },
    { name: "ux-webkit-desktop", ...uxDesktopJourney, use: { ...devices["Desktop Safari"] } },
    { name: "ux-chromium-mobile", ...uxMobileJourney, use: { ...devices["Pixel 5"] } },
    { name: "ux-webkit-mobile", ...uxMobileJourney, use: { ...devices["iPhone 13"] } },
    { name: "ux-visual-chromium", ...journey(/visual-baselines\.spec\.mjs/), use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", locale: "en-US", timezoneId: "UTC" } }
  ],
  webServer: {
    command: "node scripts/build-record-pages.mjs && node scripts/serve-test.mjs",
    url: "http://127.0.0.1:4173/undercast/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
