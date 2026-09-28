import { test, expect } from "@playwright/test";
import type { AccountRole } from "../helpers/env";
import { EXPECTED, ROLE_ROLES, type MatrixRole } from "./route-access.expected";

/**
 * Every guarded top-level route, opened in a real browser as each of the seven seeded
 * roles, asserting it either loads or bounces to /me.
 *
 * THE EXPECTATIONS LIVE IN `route-access.expected.ts`, not here. They used to be a
 * hand-copied mirror of `src/lib/permissions.ts` inside this file, and they drifted: when
 * the training grants landed, `/training` deliberately moved from "staff or instructor" to
 * "admin or instructor", the server and the console and the phone all moved together, and
 * this table did not. `src/lib/route-matrix-agrees.test.ts` now asks the REAL `canAccess`
 * the same questions and fails in about a second when the two disagree, so this suite can
 * go back to testing what only it can test: that the browser actually redirects.
 */

const ROUTES = Object.keys(EXPECTED);

for (const role of Object.keys(ROLE_ROLES) as AccountRole[]) {
  test.describe(`Route access (${role})`, () => {
    test.use({ storageState: `.auth/${role}.json` });

    for (const route of ROUTES) {
      const allowed = EXPECTED[route]!(ROLE_ROLES[role as MatrixRole]);
      test(`${role} ${allowed ? "can" : "cannot"} open ${route}`, async ({
        page,
      }) => {
        await page.goto(route);
        if (allowed) {
          await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
          // Allowed routes must stay on (or under) the requested path, not bounce to /me.
          await expect(page).toHaveURL(
            new RegExp(`${route.replace(/\//g, "\\/")}(/|$|\\?)`),
            { timeout: 15_000 },
          );
        } else {
          // guardRoute redirects denied users to /me.
          await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
        }
      });
    }
  });
}
