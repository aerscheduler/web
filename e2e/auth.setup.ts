import { test as setup, expect } from "@playwright/test";
import { ACCOUNTS, assertApiHealthy, type AccountRole } from "./helpers/env";
import { uiLogin, cleanupE2eReservations } from "./helpers/api";
import { assertTestOrgEntitled } from "./helpers/subscription";
import fs from "node:fs";
import path from "node:path";

const ROLES = Object.keys(ACCOUNTS) as AccountRole[];

setup("authenticate all roles + cleanup", async ({ page, request }) => {
  await assertApiHealthy();
  await assertTestOrgEntitled(request);
  await cleanupE2eReservations(request);

  const dir = path.join(process.cwd(), ".auth");
  fs.mkdirSync(dir, { recursive: true });

  for (const role of ROLES) {
    await uiLogin(page, ACCOUNTS[role]);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    await page.context().storageState({ path: path.join(dir, `${role}.json`) });
    // Clear session for next role: go login and wipe storage via new context is hard;
    // use logout if present, else clear cookies + localStorage.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();
    await page.goto("/login");
  }
});
