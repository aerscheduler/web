import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Reminder steps (Murray spec 6): the shop sets when an inspection coming due is said, on the
 * rule for every aircraft it covers and on one aircraft for itself. Driven as the organization's
 * owner, through the rule's Edit dialog and the inspection page's Reminders card; checked in what
 * the server stored and what each page then shows.
 */

const PREFIX = "E2E-STEPS-";

async function owner(request: APIRequestContext) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, { data: { email: ACCOUNTS.owner, password: TEST_PASSWORD } });
  expect(auth.ok()).toBeTruthy();
  return { base, headers: { Authorization: `Bearer ${(await auth.json()).auth.accessToken as string}` } };
}

test.use({ storageState: ".auth/owner.json" });

test("the shop sets reminder steps on a rule, and its own on one aircraft", async ({ page, request }) => {
  const { base, headers } = await owner(request);
  // A run that died before its cleanup left its rule behind; its label would match twice.
  const before = await (await request.get(`${base}/maintenance/reminders/templates`, { headers })).json();
  for (const t of before.data ?? []) {
    if (String(t.name ?? "").startsWith(PREFIX)) await request.delete(`${base}/maintenance/reminders/templates/${t.id}`, { headers, data: {} }).catch(() => undefined);
  }
  const planes = await (await request.get(`${base}/resources/planes`, { headers })).json();
  const plane = (planes.data ?? planes)[0];
  const name = `${PREFIX}${Date.now()}`;
  const created = await request.post(`${base}/maintenance/reminders/templates`, {
    headers,
    data: { name, repeat: true, ground: false, remindDays: 365, remindDaysBefore: 30, templateResources: [{ id: plane.id, startDate: new Date().toISOString() }] },
  });
  expect(created.ok()).toBeTruthy();
  const templateId = (await created.json()).data.id as number;

  try {
    await page.goto("/maintenance?view=templates");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: `More for ${name}` }).click();
    await page.getByRole("menuitem", { name: "Edit name, source and reminders" }).click();

    // The shop's list starts on the rule's one old warning; add 60 and 7 days.
    const shopDays = page.locator("#edit-insp-shopDays");
    await shopDays.fill("60");
    await shopDays.press("Enter");
    await shopDays.fill("7");
    await shopDays.press("Enter");
    const saved = page.waitForResponse((r) => r.url().includes(`/maintenance/reminders/templates/${templateId}`) && r.request().method() === "PATCH");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const body = (await saved).request().postDataJSON();
    expect(body.reminderSteps).toEqual({ shopDays: [60, 30, 7] });
    await expect(page.getByText("Inspection updated.")).toBeVisible();
    await expect(page.getByText("Warns 60, 30, 7 days out")).toBeVisible();

    // The aircraft's inspection follows the rule until it has its own.
    const list = await (await request.get(`${base}/maintenance/reminders?resourceId=${plane.id}`, { headers })).json();
    const inspection = (list.data ?? []).find((r: { template?: { id: number } }) => r.template?.id === templateId);
    expect(inspection.steps.shopDays).toEqual([60, 30, 7]);
    await page.goto(`/maintenance/inspections/${inspection.id}`);
    await dismissCookieBanner(page);
    const card = page.locator('[data-doc-shot="inspection-reminders"]');
    await expect(card).toContainText("60, 30 and 7 days before");
    await expect(card).toContainText("The rule's");

    await card.getByRole("button", { name: "Change this aircraft's reminders" }).click();
    const one = page.locator("#aircraft-reminders-shopDays");
    await one.fill("14");
    await one.press("Enter");
    const patched = page.waitForResponse((r) => r.url().endsWith(`/maintenance/reminders/${inspection.id}`) && r.request().method() === "PATCH");
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    expect((await patched).status()).toBe(200);
    await expect(card).toContainText("This aircraft has its own.");
    await expect(card).toContainText("60, 30, 14 and 7 days before");

    const one2 = await (await request.get(`${base}/maintenance/reminders/${inspection.id}`, { headers })).json();
    expect(one2.data.ownSteps).toEqual({ shopDays: [60, 30, 14, 7] });
  } finally {
    await request.delete(`${base}/maintenance/reminders/templates/${templateId}`, { headers, data: {} }).catch(() => undefined);
  }
});
