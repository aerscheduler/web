import { test, expect, type APIRequestContext } from "@playwright/test";
import { authAs, dismissCookieBanner, firstPlane, type Auth } from "../helpers/airworthiness";

/**
 * Calendar months, end to end.
 *
 * A calendar month is not 30 days and it is not an anniversary. 14 CFR 91.409(a) requires an
 * annual "within the preceding 12 calendar months", which runs to the END of the month: signed
 * any day in February 2026, it is good through 28 February 2027. Stored as 365 days it came due
 * on 15 February, up to a month early, which grounds an aeroplane that is legally airworthy.
 *
 * These drive the console because the failure this replaces was invisible from the API: the
 * number 365 is a perfectly good number, and only the words beside it were wrong.
 */

const PREFIX = "E2E-MONTHS-";

async function cleanup(request: APIRequestContext, auth: Auth) {
  const list = await request.get(`${auth.base}/maintenance/reminders/templates`, { headers: auth.headers });
  if (!list.ok()) return;
  const body = await list.json();
  for (const item of Array.isArray(body) ? body : (body.data ?? [])) {
    if (!String(item.name ?? "").startsWith(PREFIX) || item.id == null) continue;
    await request
      .delete(`${auth.base}/maintenance/reminders/templates/${item.id}`, { headers: auth.headers, data: {} })
      .catch(() => undefined);
  }
}

test.describe("Calendar month intervals", () => {
  test.afterAll(async ({ request }) => {
    await cleanup(request, await authAs(request, "owner"));
  });

  test("an annual comes due at the end of the month, not 365 days later", async ({ request }) => {
    const auth = await authAs(request, "owner");
    const plane = await firstPlane(request, auth);
    const name = `${PREFIX}ANNUAL-${Date.now()}`;

    const created = await request.post(`${auth.base}/maintenance/reminders/templates`, {
      headers: auth.headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindMonths: 12,
        remindDaysBefore: 30,
        // Mid-February, the case where the two answers differ by 13 days.
        templateResources: [{ id: plane.id, startDate: "2026-02-15T16:00:00.000Z" }],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const template = (await created.json()).data;

    expect(template.remindMonths).toBe(12);
    // The day figure is kept beside it for builds already in the field. It is a label, and
    // nothing computes the due date from it.
    expect(template.remindDays, "the derived approximation older clients read").toBe(365);

    const list = await request.get(
      `${auth.base}/maintenance/reminders?resolved=false&q=${encodeURIComponent(name)}`,
      { headers: auth.headers }
    );
    const row = ((await list.json()).data ?? []).find(
      (r: { template?: { name?: string } }) => r.template?.name === name
    );
    expect(row, "the reminder should exist").toBeTruthy();

    // THE ASSERTION THE WHOLE CHANGE IS FOR. 365 days would be 2027-02-15.
    const dueAt = new Date(row.due.dueAt);
    const inSchoolZone = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(dueAt);
    expect(inSchoolZone, "an annual signed in February is good to the end of February").toBe(
      "2027-02-28"
    );
  });

  test("the console offers days, weeks and months, and opens on months", async ({ page }) => {
    await page.goto("/maintenance?view=templates");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /Add inspections/i }).first().click();
    await page.getByRole("button", { name: /^Recurring/ }).click();

    // Months by default, because almost every calendar inspection in aviation is written in
    // calendar months and 365 days is the answer that is quietly wrong.
    await expect(page.locator("#insp-every-unit")).toHaveText("months");
    // And the number beside it matches the unit. It was 100, the meter clock's default, so the
    // form opened reading "Every 100 months".
    await expect(page.locator("#insp-every")).toHaveValue("12");
    await expect(page.getByText(/A calendar month runs to the END of the month/)).toBeVisible();

    await page.locator("#insp-every-unit").click();
    for (const unit of ["days", "weeks", "months"]) {
      await expect(page.getByRole("option", { name: unit, exact: true })).toBeVisible();
    }
  });

  test("weeks are stored as days, and read back as weeks", async ({ request }) => {
    // A week is exactly seven days, always, so it needs no column of its own. What it needs is
    // to come back out of the database as weeks rather than as "every 14 days".
    const auth = await authAs(request, "owner");
    const plane = await firstPlane(request, auth);
    const name = `${PREFIX}WEEKS-${Date.now()}`;

    const created = await request.post(`${auth.base}/maintenance/reminders/templates`, {
      headers: auth.headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 14,
        remindDaysBefore: 3,
        templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const template = (await created.json()).data;
    expect(template.remindDays).toBe(14);
    expect(template.remindMonths, "weeks are not months").toBeNull();
  });

  test("the AVIATES presets are real calendar months now", async ({ request }) => {
    const auth = await authAs(request, "owner");
    const res = await request.get(`${auth.base}/maintenance/reminders/presets`, { headers: auth.headers });
    expect(res.ok()).toBeTruthy();
    const presets = (await res.json()).data ?? [];

    const byId = (id: string) => presets.find((p: { id: string }) => p.id === id);

    // The five the regulations write in calendar months.
    for (const [id, months] of [
      ["annual", 12],
      ["transponder", 24],
      ["elt", 12],
      ["pitot-static", 24],
      ["elt-battery", 24],
    ] as const) {
      const preset = byId(id);
      expect(preset, `preset ${id} should exist`).toBeTruthy();
      expect(preset.payload.remindMonths, `${id} should be ${months} calendar months`).toBe(months);
      expect(preset.payload.remindDays, `${id} should not carry a hand-written day count`).toBeUndefined();
    }

    // And the one that genuinely is a day count stays one.
    expect(byId("vor").payload.remindDays).toBe(30);
    expect(byId("vor").payload.remindMonths).toBeUndefined();
  });

  test("an existing day interval can be moved onto calendar months", async ({ request }) => {
    // The migration deliberately backfills nothing, so this PATCH is the ONLY way a school
    // converts an annual it already has. Editing an interval was not supported at all before
    // this change, and a template with compliance records against it cannot be deleted and
    // recreated: the record's foreign key is RESTRICT, on purpose.
    const auth = await authAs(request, "owner");
    const plane = await firstPlane(request, auth);
    const name = `${PREFIX}CONVERT-${Date.now()}`;

    const created = await request.post(`${auth.base}/maintenance/reminders/templates`, {
      headers: auth.headers,
      data: {
        name,
        repeat: true,
        ground: false,
        remindDays: 365,
        remindDaysBefore: 30,
        templateResources: [{ id: plane.id, startDate: "2026-02-15T16:00:00.000Z" }],
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const id = (await created.json()).data.id;

    const patched = await request.patch(`${auth.base}/maintenance/reminders/templates/${id}`, {
      headers: auth.headers,
      data: { remindMonths: 12, remindDaysBefore: 30 },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();

    const after = await request.get(`${auth.base}/maintenance/reminders/templates`, { headers: auth.headers });
    const row = ((await after.json()).data ?? []).find((t: { id: number }) => t.id === id);
    expect(row.remindMonths).toBe(12);

    // And back again. Sending only days must CLEAR the months, or the edit saves and changes
    // nothing because months keeps winning in the arithmetic.
    const reverted = await request.patch(`${auth.base}/maintenance/reminders/templates/${id}`, {
      headers: auth.headers,
      data: { remindDays: 400, remindDaysBefore: 30 },
    });
    expect(reverted.ok(), await reverted.text()).toBeTruthy();

    const final = await request.get(`${auth.base}/maintenance/reminders/templates`, { headers: auth.headers });
    const finalRow = ((await final.json()).data ?? []).find((t: { id: number }) => t.id === id);
    expect(finalRow.remindDays).toBe(400);
    expect(finalRow.remindMonths, "months must be cleared when days are set").toBeNull();
  });

  test("a nonsense month interval is refused rather than stored", async ({ request }) => {
    const auth = await authAs(request, "owner");
    const plane = await firstPlane(request, auth);

    for (const remindMonths of [0, -1, 1000]) {
      const res = await request.post(`${auth.base}/maintenance/reminders/templates`, {
        headers: auth.headers,
        data: {
          name: `${PREFIX}BAD-${remindMonths}`,
          repeat: true,
          remindMonths,
          remindDaysBefore: 30,
          templateResources: [{ id: plane.id, startDate: new Date().toISOString() }],
        },
      });
      expect(res.status(), `remindMonths ${remindMonths} should be refused`).toBe(400);
    }

    // And it cannot be both an interval and a one-off.
    const both = await request.post(`${auth.base}/maintenance/reminders/templates`, {
      headers: auth.headers,
      data: {
        name: `${PREFIX}BAD-BOTH`,
        repeat: true,
        remindMonths: 12,
        remindDate: "2027-01-01T00:00:00.000Z",
        remindDaysBefore: 30,
        templateResources: [{ id: plane.id }],
      },
    });
    expect(both.status()).toBe(400);
  });
});
