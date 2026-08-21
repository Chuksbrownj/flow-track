import { defineConfig } from "@playwright/test";

/**
 * Runs the load-test spec against the LIVE Vercel deployment (no local
 * server). The spec creates and cleans up its own test data in the real
 * database, so this exercises the real serverless functions and their
 * concurrency limits.
 *
 * Run with:
 *   npx playwright test --config=playwright.live.config.ts e2e/load-test.spec.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(load-test|reopen-finished)\.spec\.ts/,
  timeout: 1_800_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "https://flow-track-gilt.vercel.app",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
});
