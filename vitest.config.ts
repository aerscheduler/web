import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Unit tests only, and only under `src/`.
 *
 * `e2e/` belongs to Playwright (`npm run test:e2e`). Without this include, vitest
 * collects those specs too, fails to load every one of them, and `npm test` reports
 * nineteen broken suites that were never its to run.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
