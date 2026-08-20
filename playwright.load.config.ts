import { defineConfig } from "@playwright/test";

/**
 * Config for the 200-trainee browser load test. The production server is
 * started separately (`npm run build && npx next start`) and reused here, so
 * the test itself only drives browsers.
 *
 * Run with: npx playwright test --config=playwright.load.config.ts e2e/load-test.spec.ts
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /load-test\.spec\.ts/,
  timeout: 1_800_000,
  expect: { timeout: 30_000 },
  // The spec runs its own internal concurrency pool.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next start -p 3000",
    url: "http://localhost:3000",
    timeout: 60_000,
    reuseExistingServer: true,
  },
});
