import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * "Whichever comes first": an inspection counted on the meter AND the calendar.
 *
 * The shape most recurring ADs are written in, and the shape of an ordinary oil change.
 * Three layers used to prevent it, all silently: the create endpoint deleted whichever
 * clock lost an if/else-if, the due computation returned on the hour clock and never read
 * the calendar, and the nightly sweep filtered on `remindHours: null` so a combined
 * template was never swept at all.
 *
 * This drives the console the way a mechanic would: pick the third interval option, fill
 * both clocks, and check the console says what the server stored.
 */

const PREFIX = "E2E-COMBINED-";

async function ownerHeaders(request: APIRequestContext) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

async function cleanupE2eTemplates(request: APIRequestContext) {
  const { base, headers } = await ownerHeaders(request);
  const list = await request.get(`${base}/maintenance/reminders/templates`, { headers });
  if (!list.ok()) return;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  for (const item of items) {
    if (!String(item.name ?? "").startsWith(PREFIX) || item.id == null) continue;
    await request.delete(`${base}/maintenance/reminders/templates/${item.id}`, { headers, data: {} });
  }
}

test.describe("Combined maintenance intervals", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eTemplates(request);
  });

  test("creating one keeps BOTH clocks and says so on the setup list", async ({ page, request }) => {
    await cleanupE2eTemplates(request);
    const name = `${PREFIX}${Date.now()}`;

    await page.goto("/maintenance");
    await page.getByRole("button", { name: "Add inspections" }).click();

    await page.getByRole("button", { name: /^Recurring/ }).click();
    await page.getByRole("button", { name: "Whichever comes first" }).click();

    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Every (hours)").fill("50");
    await page.getByLabel("Warn me (hours out)").fill("5");
    await page.getByLabel("or every (days)").fill("122");
    await page.getByLabel("Warn me (days out)").fill("14");

    // One tail is enough; the interval is what is under test, not the fan-out.
    const firstTail = page.getByTestId("add-inspections-tails").getByRole("button").first();
    if (await firstTail.count()) await firstTail.click();

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Inspection added.")).toBeVisible({ timeout: 20_000 });

    // What the SERVER stored. The old create endpoint answered 200 and dropped one clock.
    const { base, headers } = await ownerHeaders(request);
    const list = await request.get(`${base}/maintenance/reminders/templates`, { headers });
    const body = await list.json();
    const items = Array.isArray(body) ? body : (body.data ?? []);
    const stored = items.find((t: { name?: string }) => t.name === name);

    expect(stored, "template was not created").toBeTruthy();
    expect(stored.remindHours).toBe(500); // deci-hours: 50.0
    expect(stored.remindHoursBefore).toBe(50);
    expect(stored.hourBasedOn).toBe("tach");
    expect(stored.remindDays).toBe(122);
    expect(stored.remindDaysBefore).toBe(14);
    expect(stored.remindDate).toBeNull();

    // And what the console says about it: one line naming both clocks.
    await page.goto("/maintenance");
    await page.getByRole("button", { name: "Set up" }).click();
    await expect(page.getByText("Whichever comes first", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    // .first(): the interval phrasing is shared by any other 50-hour/4-month rule the org
    // already has, and the assertion is about the WORDING, not which row carries it.
    await expect(
      page.getByText("Every 50.0 hours tach or 4 months, whichever comes first", { exact: false }).first(),
    ).toBeVisible();
  });

  test("the calendar clock can be the one that comes due, and the sign-off still asks for the meter", async ({
    page,
    request,
  }) => {
    const { base, headers } = await ownerHeaders(request);
    const name = `${PREFIX}CAL-${Date.now()}`;

    // A tail to hang it on.
    const resources = await request.get(`${base}/resources`, { headers });
    const list = (await resources.json()).data ?? [];
    const plane = list.find((r: { type?: { plane?: unknown } }) => r.type?.plane);
    expect(plane, "no aircraft seeded").toBeTruthy();

    // 400 days into a 365-day clock, 5.0 hours into a 100.0-hour one: the calendar binds.
    const startDate = new Date(Date.now() - 400 * 86_400_000).toISOString();
    const created = await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindHours: 1000,
        remindHoursBefore: 100,
        hourBasedOn: "tach",
        remindDays: 365,
        remindDaysBefore: 30,
        templateResources: [{ id: plane.id, startHour: (plane.type.plane.tachTime ?? 1000) - 50, startDate }],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    await page.goto("/maintenance");
    await page.getByRole("button", { name: "All inspections" }).click();

    const row = page.locator("li").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 20_000 });
    // The calendar side is the headline; the meter side rides along.
    await expect(row.getByText("Overdue")).toBeVisible();
    await expect(row.getByText(/days over/)).toBeVisible();
    await expect(row.getByText(/also .* hrs on tach/)).toBeVisible();

    // Signing off must still collect a meter reading, or the hour clock restarts from
    // nothing and never counts again. `due.kind` here is "days", which is what the old
    // check keyed on.
    await row.getByRole("button", { name: "Sign off" }).click();
    await expect(page.getByLabel(/reading when the work was done/)).toBeVisible();
  });
});
