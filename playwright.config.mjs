import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/rendered",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173/undercast",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve-test.mjs",
    url: "http://127.0.0.1:4173/undercast/index.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  }
});
