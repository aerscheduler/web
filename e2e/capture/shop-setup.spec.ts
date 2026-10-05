import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { uiLogin } from "../helpers/api";

/**
 * NOT A TEST. Screenshots of the "Set up your shop" callout on Open jobs, for an organization
 * that already flies (Murray's situation), in a LOCAL organization built from the preview
 * accounts (seed-onboarding-preview.sql). Clears that organization's labor rate first, so the
 * callout shows.
 *
 *   CAPTURE=1 SHOT_DIR=... SHOP_SETUP_ORG=<id> SHOP_SETUP_OWNER=... SHOP_SETUP_TECH=... \
 *     PLAYWRIGHT_BASE_URL=http://localhost:5383 PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/capture/shop-setup --project=chromium --no-deps --reporter=line
 */

const OUT = process.env.SHOT_DIR ?? "/Users/tony/Documents/Personal/AerScheduler/_local/maintenance-shop/shop-setup-shots";
const ORG = Number(process.env.SHOP_SETUP_ORG ?? 14434);
const OWNER = process.env.SHOP_SETUP_OWNER ?? "preview-4@aerscheduler.com";
const TECH = process.env.SHOP_SETUP_TECH ?? "preview-6@aerscheduler.com";

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

function sql(statement: string) {
  const env = fs.readFileSync(path.resolve(process.cwd(), "../server/.env"), "utf8");
  const url = /^DATABASE_URL=(.*)$/m.exec(env)![1].replace(/"/g, "").replace(/\?.*$/, "");
  execFileSync("/opt/homebrew/opt/postgresql@16/bin/psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-c", statement]);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function signedIn(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto("/login");
  await context.addCookies([{ name: "aer_consent", value: "denied", url: page.url() }]);
  await uiLogin(page, email);
  return page;
}

test("captures the Set up your shop callout", async ({ browser }) => {
  sql(`UPDATE work_order_settings SET "laborRateCents" = NULL WHERE "FK_organizationId" = ${ORG};`);

  const owner = await signedIn(browser, OWNER);
  await owner.goto("/maintenance?view=work-orders");
  const callout = owner.getByTestId("shop-setup-callout");
  await expect(callout).toBeVisible();
  await shot(owner, "01-open-jobs-callout");
  await callout.getByRole("link").click();
  await expect(owner).toHaveURL(/tab=shop-rates/);
  await shot(owner, "02-settings-shop-rates");
  await owner.goto("/settings?tab=sales-tax");
  await shot(owner, "03-settings-sales-tax");

  const tech = await signedIn(browser, TECH);
  await tech.goto("/maintenance?view=work-orders");
  await expect(tech.getByText("The shop isn't set up yet")).toBeVisible();
  await expect(tech.getByText("No open jobs match these filters.")).toHaveCount(0);
  await shot(tech, "04-technician-no-labor-rate");
});

test("captures the shop rate field tooltips", async ({ browser }) => {
  const owner = await signedIn(browser, OWNER);
  await owner.goto("/settings?tab=shop-rates");
  const names = ["About Labor rate per hour", "About Markup on parts", "About Markup on outside work"];
  const hints = names.map((name) => owner.getByRole("button", { name }));
  for (const h of hints) await expect(h).toBeVisible();
  const n = hints.length;
  for (let i = 0; i < n; i++) {
    await hints[i].hover();
    await owner.waitForTimeout(600);
    await shot(owner, `05-tooltip-${i}`);
    await owner.mouse.move(0, 0);
    await owner.waitForTimeout(300);
  }
});
