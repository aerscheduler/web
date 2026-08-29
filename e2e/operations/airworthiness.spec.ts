import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * Airworthiness Directive tracking, driven the way a mechanic would drive it.
 *
 * TWO THINGS ARE UNDER TEST, and only the second one is really new:
 *
 *   1. A reminder can say which rule it IS. Before this, a shop tracking an AD built an
 *      ordinary reminder and put the number in the name, so nothing could tell an AD from
 *      an oil change.
 *
 *   2. Signing it off keeps a PERMANENT record. Resolving a recurring reminder rolls the
 *      row forward, reusing it for the next cycle, so the fourth sign-off used to leave no
 *      trace of the first three. 14 CFR 91.417 wants the number, the revision, the date and
 *      the time in service kept for the life of the aircraft.
 *
 * The load-bearing assertion is the second test: sign the same rule off TWICE through the
 * console and check two records survive while one live reminder exists. That is the whole
 * feature, and it is invisible from any single screen.
 */

const PREFIX = "E2E-AD-";

async function ownerHeaders(request: APIRequestContext) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Remove this run's fixtures.
 *
 * Compliance records are append-only and their foreign keys are RESTRICT, so a template
 * whose reminder has been signed off CANNOT be deleted, by design. That is the feature
 * working, not a teardown failure, so a refused delete is ignored rather than thrown.
 */
async function cleanup(request: APIRequestContext) {
  const { base, headers } = await ownerHeaders(request);
  const list = await request.get(`${base}/maintenance/reminders/templates`, { headers });
  if (!list.ok()) return;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  for (const item of items) {
    if (!String(item.name ?? "").startsWith(PREFIX) || item.id == null) continue;
    await request
      .delete(`${base}/maintenance/reminders/templates/${item.id}`, { headers, data: {} })
      .catch(() => undefined);
  }
}

/**
 * The consent banner sits bottom-left over the page and swallows clicks near it.
 *
 * Declining rather than accepting: the same choice the product tells people is the
 * privacy-preserving one, and it keeps analytics out of a test run.
 */
async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.count()) await decline.first().click().catch(() => undefined);
}

async function firstPlane(request: APIRequestContext, base: string, headers: Record<string, string>) {
  const resources = await request.get(`${base}/resources`, { headers });
  const list = (await resources.json()).data ?? [];
  const plane = list.find((r: { type?: { plane?: unknown } }) => r.type?.plane);
  expect(plane, "no aircraft seeded").toBeTruthy();
  return plane;
}

test.describe("Airworthiness Directives", () => {
  test.afterAll(async ({ request }) => {
    await cleanup(request);
  });

  test("an AD is refused without its number, and accepted with one", async ({ page, request }) => {
    await cleanup(request);
    const name = `${PREFIX}${Date.now()}`;

    await page.goto("/maintenance");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: "Add inspections" }).click();
    await page.getByRole("button", { name: /^Recurring/ }).click();

    await page.getByLabel("Name").fill(name);
    // The basis picker defaults to the calendar, so the hour labels do not exist until it
    // is switched. Filling "Every (hours)" without this is how the first version of this
    // test failed while the feature was fine.
    await page.getByRole("button", { name: "On the meter" }).click();
    await page.getByLabel("Every (hours)").fill("100");
    await page.getByLabel("Warn me (hours out)").fill("10");

    // Say it is an AD, and leave the number out.
    await page.getByTestId("insp-source-type").click();
    await page.getByRole("option", { name: "Airworthiness Directive" }).click();

    // The console refuses locally rather than letting the request come back 400: an AD
    // that cannot be identified cannot be reported on later.
    await expect(page.getByText("An AD needs its number, or nothing can find it later.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();

    await page.getByLabel("Document number").fill("2015-19-07");
    await page.getByLabel("Revision").fill("2");
    await expect(page.getByText("An AD needs its number, or nothing can find it later.")).toBeHidden();

    // A tail is required too: an inspection tracked against no aircraft is not a thing, so
    // Add stays disabled until one is chosen. Asserting "enabled" before this is what the
    // first version of this test got wrong, and it read as a product bug for a while.
    const firstTail = page.getByTestId("add-inspections-tails").getByRole("button").first();
    await expect(firstTail).toBeVisible();
    await firstTail.click();
    await expect(page.getByRole("button", { name: "Add", exact: true })).toBeEnabled();

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Inspection added.")).toBeVisible({ timeout: 20_000 });

    // What the SERVER stored, not what the form said.
    const { base, headers } = await ownerHeaders(request);
    const list = await request.get(`${base}/maintenance/reminders/templates`, { headers });
    const items = (await list.json()).data ?? [];
    const stored = items.find((t: { name?: string }) => t.name === name);

    expect(stored, "template was not created").toBeTruthy();
    expect(stored.sourceType).toBe("ad");
    expect(stored.sourceRef).toBe("2015-19-07");
    expect(stored.revision).toBe("2");

    // And the AD badge reaches the setup list, so a regulation is distinguishable from an
    // oil change without opening anything.
    await page.goto("/maintenance?view=templates");
    await page.getByPlaceholder(/Search aircraft or inspections/).fill("2015-19-07");
    await expect(page.getByText("2015-19-07 Rev 2").first()).toBeVisible({ timeout: 20_000 });
  });

  /**
   * THE ONE THAT MATTERS. Two sign-offs, two permanent records, one live reminder.
   */
  test("signing off twice keeps two records while the reminder rolls forward", async ({
    page,
    request,
  }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);
    const name = `${PREFIX}TWICE-${Date.now()}`;
    const ref = `E2E-${Date.now()}`;

    // Built through the API: the creation path is covered above, and this test is about
    // what survives the roll-forward.
    const created = await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindHours: 1000,
        remindHoursBefore: 100,
        hourBasedOn: "tach",
        sourceType: "ad",
        sourceRef: ref,
        revision: "1",
        templateResources: [{ id: plane.id, startHour: 10000, startDate: new Date().toISOString() }],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();

    async function signOffOnce(method: string) {
      await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent(name)}`);
      await dismissCookieBanner(page);
      await page.getByRole("button", { name: "Sign off" }).first().click();

      // Opened by default on an AD, because for those the record is the point.
      await expect(page.getByText(/Once signed, this record can/)).toBeVisible();
      await page.getByLabel("What was done").fill(method);
      await page.getByLabel("Certified by").fill("Dale Whitfield");

      await page.getByRole("button", { name: "Sign off", exact: true }).last().click();
      await expect(page.getByText("Signed off.")).toBeVisible({ timeout: 20_000 });
    }

    await signOffOnce("First inspection per paragraph (g)(1). No cracking found.");
    await signOffOnce("Repeat inspection per paragraph (g)(2). Spar cap replaced.");

    // TWO records kept.
    const records = await request.get(`${base}/maintenance/compliance?q=${ref}&limit=50`, { headers });
    expect(records.ok()).toBeTruthy();
    const kept = (await records.json()).data ?? [];
    expect(kept, "the roll-forward ate a compliance record").toHaveLength(2);

    // ONE live reminder: the row was reused, which is exactly what the table survives.
    const reminders = await request.get(`${base}/maintenance/reminders?resolved=false&q=${encodeURIComponent(name)}`, {
      headers,
    });
    const live = ((await reminders.json()).data ?? []).filter(
      (r: { template?: { name?: string } }) => r.template?.name === name,
    );
    expect(live).toHaveLength(1);

    // And both are on the log. The table shows the rule and its document number; the method
    // of compliance is a paragraph and lives in the record panel, so assert on what the
    // list actually renders rather than on text that was never in it.
    await page.goto("/maintenance?view=compliance");
    await dismissCookieBanner(page);
    await page.getByPlaceholder(/Search records/).fill(ref);
    await expect(page.getByText(`${ref} Rev 1`).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`${ref} Rev 1`)).toHaveCount(2);

    // Opening one shows what was actually done, which is the sentence an inspector reads.
    await page.getByText(`${ref} Rev 1`).first().click();
    await expect(page.getByText("Repeat inspection", { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  /**
   * The way the append-only claim could quietly break: an AD is superseded, the template's
   * revision moves on, and a past record starts asserting a revision that did not exist
   * when the mechanic signed.
   */
  test("a superseded revision does not rewrite what was already signed", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);
    const name = `${PREFIX}REV-${Date.now()}`;
    const ref = `E2E-REV-${Date.now()}`;

    const created = await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 365,
        remindDaysBefore: 30,
        sourceType: "ad",
        sourceRef: ref,
        revision: "2",
        templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const templateId = (await created.json()).data.id;

    const reminders = await request.get(`${base}/maintenance/reminders?resolved=false`, { headers });
    const reminder = ((await reminders.json()).data ?? []).find(
      (r: { template?: { name?: string } }) => r.template?.name === name,
    );
    expect(reminder, "no reminder was created for the template").toBeTruthy();

    await request.post(`${base}/maintenance/reminders/${reminder.id}`, {
      headers,
      data: {
        completedAt: new Date().toISOString(),
        methodOfCompliance: "Inspected per revision 2.",
        mechanicName: "Dale Whitfield",
      },
    });

    // The AD is superseded.
    const patched = await request.patch(`${base}/maintenance/reminders/templates/${templateId}`, {
      headers,
      data: { revision: "5" },
    });
    expect(patched.ok(), "a source-only PATCH must save, it used to 200 and write nothing").toBeTruthy();

    const records = await request.get(`${base}/maintenance/compliance?q=${ref}`, { headers });
    const kept = (await records.json()).data ?? [];
    expect(kept).toHaveLength(1);
    expect(kept[0].revision, "the record followed the template instead of standing still").toBe("2");

    const templates = await request.get(`${base}/maintenance/reminders/templates`, { headers });
    const stored = ((await templates.json()).data ?? []).find((t: { id: number }) => t.id === templateId);
    expect(stored.revision).toBe("5");
  });

  /**
   * Correcting a superseded AD from the console, which had no answer at all until now: the
   * document number and revision could be set when the inspection was created and never
   * afterwards, so an AD moving to a new revision meant deleting the inspection and losing
   * every sign-off hanging off it.
   */
  test("a superseded revision can be corrected from the console", async ({ page, request }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);
    const name = `${PREFIX}EDIT-${Date.now()}`;
    const ref = `E2E-EDIT-${Date.now()}`;

    const created = await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 365,
        remindDaysBefore: 30,
        sourceType: "ad",
        sourceRef: ref,
        revision: "2",
        templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const templateId = (await created.json()).data.id;

    await page.goto("/maintenance?view=templates");
    await dismissCookieBanner(page);

    //Addressed by its aria-label rather than by walking the row: the label is unique per
    //inspection, and scoping to a div that "has text" lands on the innermost one, which
    //does not contain the buttons.
    await page.getByRole("button", { name: `Edit ${name}` }).click();

    // Opens carrying what is stored, rather than an empty form that would blank the rest.
    await expect(page.getByLabel("Document number")).toHaveValue(ref);
    await expect(page.getByLabel("Revision")).toHaveValue("2");

    await page.getByLabel("Revision").fill("3");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Inspection updated.")).toBeVisible();

    const templates = await request.get(`${base}/maintenance/reminders/templates`, { headers });
    const stored = ((await templates.json()).data ?? []).find((t: { id: number }) => t.id === templateId);
    expect(stored.revision).toBe("3");
    // The rest of the template survived an edit that only meant to touch the revision.
    expect(stored.sourceRef).toBe(ref);
    expect(stored.name).toBe(name);
  });

  /**
   * The console refuses to turn an inspection into an AD without giving it a number, and so
   * does the server: a PATCH naming only the type used to slip past and leave a template
   * claiming to be an Airworthiness Directive that identified nothing.
   */
  test("an inspection cannot become an AD without a number", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);
    const name = `${PREFIX}NOREF-${Date.now()}`;

    const created = await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 365,
        remindDaysBefore: 30,
        templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const templateId = (await created.json()).data.id;

    const patched = await request.patch(`${base}/maintenance/reminders/templates/${templateId}`, {
      headers,
      data: { sourceType: "ad" },
    });
    const body = await patched.json();
    expect(patched.status()).toBe(400);
    expect(body.message, "a shop reminder became an AD with no number").toMatch(/needs its number/i);

    const templates = await request.get(`${base}/maintenance/reminders/templates`, { headers });
    const stored = ((await templates.json()).data ?? []).find((t: { id: number }) => t.id === templateId);
    expect(stored.sourceType ?? null).toBeNull();
  });

  /**
   * Signing off is one commit, not two. A retry must not add a second permanent record for
   * one piece of work: the record cannot be deleted afterwards to tidy up.
   */
  test("a repeated sign-off is refused rather than duplicated", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);
    const name = `${PREFIX}ONCE-${Date.now()}`;
    const ref = `E2E-ONCE-${Date.now()}`;

    await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 365,
        remindDaysBefore: 30,
        sourceType: "ad",
        sourceRef: ref,
        revision: "1",
        templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
      },
    });

    const reminders = await request.get(`${base}/maintenance/reminders?resolved=false`, { headers });
    const reminder = ((await reminders.json()).data ?? []).find(
      (r: { template?: { name?: string } }) => r.template?.name === name,
    );
    expect(reminder).toBeTruthy();

    const payload = {
      completedAt: new Date().toISOString(),
      methodOfCompliance: "Signed once.",
      mechanicName: "Dale Whitfield",
    };

    const first = await request.post(`${base}/maintenance/reminders/${reminder.id}`, {
      headers,
      data: payload,
    });
    expect(first.ok(), await first.text()).toBeTruthy();

    const second = await request.post(`${base}/maintenance/reminders/${reminder.id}`, {
      headers,
      data: payload,
    });
    expect(second.status()).toBe(400);
    expect((await second.json()).message).toMatch(/already been signed off/i);

    const records = await request.get(`${base}/maintenance/compliance?q=${ref}`, { headers });
    expect((await records.json()).data ?? [], "the retry wrote a second permanent record").toHaveLength(1);
  });

  test("an ordinary inspection signs off with no record, as it always did", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);
    const name = `${PREFIX}PLAIN-${Date.now()}`;

    const created = await request.post(`${base}/maintenance/reminders/templates`, {
      headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 90,
        remindDaysBefore: 7,
        templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
      },
    });
    expect(created.ok()).toBeTruthy();

    const reminders = await request.get(`${base}/maintenance/reminders?resolved=false`, { headers });
    const reminder = ((await reminders.json()).data ?? []).find(
      (r: { template?: { name?: string } }) => r.template?.name === name,
    );
    expect(reminder).toBeTruthy();

    const before = await request.get(`${base}/maintenance/compliance?limit=1`, { headers });
    const beforeTotal = (await before.json()).pagination?.total ?? 0;

    const signed = await request.post(`${base}/maintenance/reminders/${reminder.id}`, {
      headers,
      data: { completedAt: new Date().toISOString() },
    });
    expect(signed.ok()).toBeTruthy();

    // An oil change should not have to name a certificate holder.
    const after = await request.get(`${base}/maintenance/compliance?limit=1`, { headers });
    expect((await after.json()).pagination?.total ?? 0).toBe(beforeTotal);
  });

  test("the airworthiness report lists what was signed, for a technician", async ({ request }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    // A TECHNICIAN, not the owner: the report is filed under fleet precisely so the role
    // built around maintenance can open it. Filed under compliance it would be invisible.
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.technician, password: TEST_PASSWORD },
    });
    expect(auth.ok()).toBeTruthy();
    const headers = { Authorization: `Bearer ${(await auth.json()).auth.accessToken}` };

    const catalog = await request.get(`${base}/reports/catalog`, { headers });
    expect(JSON.stringify(await catalog.json())).toContain("airworthiness");

    const run = await request.post(`${base}/reports/run`, {
      headers,
      data: {
        reportId: "airworthiness",
        startDate: new Date(Date.now() - 400 * 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(run.ok(), await run.text()).toBeTruthy();
    const body = await run.json();
    const rows = body.data?.rows ?? body.rows ?? [];
    // Ungrouped, so each signature is its own line. Grouped by aircraft this collapsed to
    // one row of nulls, which is useless to an inspector.
    expect(Array.isArray(rows)).toBe(true);
    if (rows.length) {
      expect(Object.keys(rows[0])).toEqual(expect.arrayContaining(["resource", "sourceRef", "mechanic"]));
    }
  });
});
