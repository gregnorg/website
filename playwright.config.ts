import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./output/browser-results",
  workers: 1,
  timeout: 60000,
  globalTimeout: 300000,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
