import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      mammoth: fileURLToPath(
        new URL("./node_modules/mammoth/mammoth.browser.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    // Real network + short window-expiry sleeps.
    testTimeout: 15_000,
  },
});
