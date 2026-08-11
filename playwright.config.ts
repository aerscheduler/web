import { defineConfig, devices } from "@playwright/test";
import { assertLocalApiTarget } from "./e2e/helpers/env";

assertLocalApiTarget();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      // Pure helpers (no browser, no API). Kept under e2e/ so we do not add a second
      // runner just for onboarding source/track math.
      name: "unit",
      testMatch: /intent-logic\.spec\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/owner.json",
      },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /intent-logic\.spec\.ts/],
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 5173",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_API_PROXY: process.env.VITE_API_PROXY ?? "http://127.0.0.1:5001",
        },
      },
});
