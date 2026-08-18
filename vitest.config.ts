import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The exam importer runs in the browser, where bundlers resolve mammoth
      // to its browser build (the node build rejects { arrayBuffer } input).
      // Use the same build in tests so the docx parsing path is exercised.
      mammoth: fileURLToPath(
        new URL("./node_modules/mammoth/mammoth.browser.js", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Real-database tests run via `npm run test:integration` instead.
    exclude: ["**/*.integration.test.ts"],
  },
});
