import { defineConfig, devices } from "@playwright/test";
import { assertLocalApiTarget } from "./e2e/helpers/env";

assertLocalApiTarget();

const e2eStack = process.env.E2E_STACK === "1";
const webPort = process.env.E2E_WEB_PORT ?? "5173";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${webPort}`;

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
      //`e2e/capture/` is screenshot capture for the documentation, not tests. It writes files,
      //it builds fixtures as it goes, and a failure there means a missing picture rather than a
      //broken product, so it is out of the ordinary run and opted into deliberately:
      //  CAPTURE=1 npx playwright test e2e/capture
      testIgnore: process.env.CAPTURE
        ? [/auth\.setup\.ts/, /intent-logic\.spec\.ts/]
        : [/auth\.setup\.ts/, /intent-logic\.spec\.ts/, /e2e\/capture\//],
    },
  ],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: `npm run dev -- --host 127.0.0.1 --port ${webPort}`,
        url: baseURL,
        reuseExistingServer: e2eStack ? false : !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_API_PROXY:
            process.env.VITE_API_PROXY ?? "http://127.0.0.1:5001",
        },
      },
});
