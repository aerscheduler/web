import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";

/**
 * NOT A TEST. The screenshots for the maintenance-shop write-up.
 *
 * It lives under e2e/capture/ so the ordinary run never picks it up: it writes files, it
 * builds its own fixtures, and a failure here means a missing picture rather than a broken
 * product. Run it deliberately:
 *
 *   CAPTURE=1 VITE_API_PROXY=http://127.0.0.1:5011 \
 *     PLAYWRIGHT_BASE_URL=http://localhost:5179 PLAYWRIGHT_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/capture/maintenance-shop --reporter=line
 *
 * It still ASSERTS at every step, because a screenshot of the wrong screen is worse than no
 * screenshot: it is a picture of something that does not exist, in a document whose whole
 * job is to show what does.
 *
 * The fixtures are named as a real shop would name them, with no E2E prefix, because these
 * pictures are shown to people. They are cleaned up at the end.
 */

const OUT = process.env.SHOT_DIR ?? "/Users/tony/Documents/Personal/AerScheduler/_local/maintenance-shop/shots";
const base = () => apiProxyTarget().replace(/\/$/, "");

type Ctx = { token: string };
const headers = (c: Ctx) => ({ Authorization: `Bearer ${c.token}` });

/**
 * Answer the consent question before the page loads rather than clicking it away after: the
 * banner is drawn on mount and dismissed a frame later, so it sat in the corner of half
 * these captures. `denied` is the choice the product itself calls the privacy-preserving one.
 */
async function withConsentAnswered(page: Page) {
  await page.context().addCookies([{ name: "aer_consent", value: "denied", url: page.url() || "http://localhost:5179" }]);
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.waitForTimeout(700); // let the list settle; a mid-flight skeleton is not the subject
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

let ctx: Ctx;
let shopId = 0;
let ownerUserId: number | undefined;

test.beforeAll(async ({ request }) => {
  const auth = await apiLogin(request, ACCOUNTS.owner);
  ctx = { token: auth.auth.accessToken as string };

  const locations = await request.get(`${base()}/locations`, { headers: headers(ctx) });
  const locationId = ((await locations.json()).data ?? [])[0].id;

  const created = await request.post(`${base()}/resources`, {
    headers: headers(ctx),
    data: {
      location: { id: locationId },
      use: "shop",
      type: {
        plane: {
          tailNumber: "N4521J",
          make: "Piper",
          model: "PA-28-180 Cherokee",
          year: "1968",
          category: "airplane",
          aircraftClass: "single_engine_land",
          meterMode: "hobbs_and_tach",
          hobbsTime: 51330,
          tachTime: 48210,
          fuelCapacity: 5000,
          fuelMeasurement: "gallons",
          cost: { billByHobbsTime: true, wetRate: 0 },
        },
      },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  shopId = (await created.json()).data.id;

  const owner = await request.post(`${base()}/resources/${shopId}/owners`, {
    headers: headers(ctx),
    data: {
      name: "Dale Whitcomb",
      email: "dale.whitcomb@example.com",
      phone: "555-0142",
      title: "Owner",
      isPrimary: true,
    },
  });
  expect(owner.status(), await owner.text()).toBe(201);

  const listed = await request.get(`${base()}/resources/${shopId}/owners`, { headers: headers(ctx) });
  ownerUserId = ((await listed.json()).data ?? [])[0]?.orgUser?.user?.id;
});

test.afterAll(async ({ request }) => {
  if (shopId) await request.delete(`${base()}/resources/${shopId}`, { headers: headers(ctx) }).catch(() => undefined);
  //Archived rather than deleted: a membership carries invoices and history, so the product
  //has no hard delete for one, and neither should its cleanup.
  if (ownerUserId) {
    await request
      .patch(`${base()}/users/${ownerUserId}/orgUser/archive`, { headers: headers(ctx), data: { archived: true } })
      .catch(() => undefined);
  }
});

test("captures the maintenance shop screens", async ({ page }) => {
  await page.goto("/aircraft");
  await withConsentAnswered(page);
  await page.goto("/aircraft");

  // 1. The fleet, unchanged. The point of this one is that nothing moved.
  await expect(page.getByRole("tab", { name: "Fleet" })).toBeVisible();
  await expect(page.getByText("N4521J")).toHaveCount(0);
  await shot(page, "01-fleet-tab");

  // 2. The shop: the same page, a different list.
  await page.getByRole("tab", { name: "In the shop" }).click();
  await expect(page.getByText("N4521J").first()).toBeVisible();
  await shot(page, "02-shop-tab");

  // 3. Adding one. The switch is first because it changes what the rest of the form means.
  await page.getByRole("button", { name: "Add aircraft" }).first().click();
  const addDialog = page.getByRole("dialog");
  await expect(addDialog).toBeVisible();
  await expect(addDialog.getByText("Customer's aircraft").first()).toBeVisible();
  await expect(addDialog.getByText(/Not scheduled, not billed on your plan/)).toBeVisible();
  await shot(page, "03-add-customer-aircraft");
  await page.getByRole("button", { name: "Cancel" }).click();

  // 4. The record page. A customer's aeroplane says so, and has no rate.
  await page.goto(`/aircraft/${shopId}`);
  await expect(page.getByText("Customer's aircraft").first()).toBeVisible();
  await expect(page.getByText("N4521J").first()).toBeVisible();
  await shot(page, "04-record-page");

  // 5. Owners, including what the shop is promised about them.
  await page.goto(`/aircraft/${shopId}?tab=owners`);
  await expect(page.getByText("Dale Whitcomb")).toBeVisible();
  await expect(page.getByText("Not signed up")).toBeVisible();
  await shot(page, "05-owners");

  // 6. The add-an-owner form, and the line that tells the truth about what happens.
  await page.getByRole("button", { name: "Add owner" }).click();
  await expect(page.getByText(/We will not email them/)).toBeVisible();
  await shot(page, "06-add-owner");
  await page.getByRole("button", { name: "Cancel" }).click();

  // 7. The roster: the owner is on it, which is what lets the shop invoice them.
  await page.goto("/people");
  await page.getByPlaceholder(/Search/).first().fill("Whitcomb");
  await expect(page.getByText("Dale Whitcomb").first()).toBeVisible();
  await shot(page, "07-roster");

  // 8. The maintenance hub: the school's own aeroplanes and its customers' in one list,
  // which is the shop's actual workload and the reason any of this exists.
  await page.goto("/maintenance");
  await expect(page.getByText("N4521J").first()).toBeVisible();
  await shot(page, "08-maintenance-hub");

  // 9. The booking type that a customer's aircraft can take, and the only one.
  await page.goto("/schedule");
  await page.getByRole("button", { name: "New reservation" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#res-type").click();
  await page.getByRole("option", { name: "Maintenance" }).click();
  await page.locator("#res-resource").click();
  await expect(page.getByRole("option", { name: /N4521J/ }).first()).toBeVisible();
  await shot(page, "09-maintenance-booking");
});
