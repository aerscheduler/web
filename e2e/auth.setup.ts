import { test as setup, expect } from "@playwright/test";
import { ACCOUNTS, assertApiHealthy, type AccountRole } from "./helpers/env";
import { uiLogin, cleanupE2eReservations } from "./helpers/api";
import { assertTestOrgEntitled } from "./helpers/subscription";
import fs from "node:fs";
import path from "node:path";

const ROLES = Object.keys(ACCOUNTS) as AccountRole[];

// ONE UI LOGIN PER ROLE, SERIALLY, and it is the slowest thing in the suite. Budgeted per
// role rather than as a flat number, because a flat one silently becomes too small the day
// somebody adds an account, and the failure then reads as a broken login rather than as a
// budget that was outgrown.
//
// Keep `ACCOUNTS` to identities that MANY specs need. An account that one spec needs should
// log in inside that spec (see `RENTER2_EMAIL`), or every run pays for it.
setup.setTimeout(30_000 * Object.keys(ACCOUNTS).length);

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
