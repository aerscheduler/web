import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  ownerAuth,
  readBookingPolicy,
  restoreBookingPolicy,
  type BookingPolicySnapshot,
} from "../helpers/booking-policy";
import {
  apiBase,
  authAs,
  findBookablePlane,
  findFreeHourSlot,
  orgUserIdForEmail,
} from "../helpers/slot-offers";

test.describe("Ledger L4 booking gates + L5 statements", () => {
  let priorPolicy: BookingPolicySnapshot | null = null;

  test.afterAll(async ({ request }) => {
    try {
      const owner = await ownerAuth(request);
      if (priorPolicy) {
        await restoreBookingPolicy(request, owner.headers, priorPolicy);
      }
      await cleanupE2eReservations(request);
    } catch (err) {
      console.warn("L4/L5 afterAll cleanup:", err);
    }
  });

  test("API: student self-book is gated; staff bypass; statement math + email", async ({
    request,
  }) => {
    const owner = await ownerAuth(request);
    const student = await authAs(request, ACCOUNTS.student);
    const base = apiBase();
    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    const ledgerOn = (await ledgerSettings.json()).data?.enabled === true;
    if (!ledgerOn) {
      test.skip(true, "ledger mode off — skip L4/L5 API");
      return;
    }

    priorPolicy = await readBookingPolicy(request);

    const plane = await findBookablePlane(request, owner.headers);
    const slot = await findFreeHourSlot(request, owner.headers, plane.id);
    const notes = `E2E-L4-gate-${Date.now()}`;

    const setGates = await request.patch(`${base}/organizations`, {
      headers: owner.headers,
      data: {
        bookingPolicy: {
          requirePaymentMethod: false,
          minimumBalanceCents: 10_000_000,
          balanceMaximumCents: null,
        },
      },
    });
    expect(setGates.ok(), await setGates.text()).toBeTruthy();

    const refused = await request.post(`${base}/reservations/`, {
      headers: student.headers,
      data: {
        title: "E2E L4 solo",
        type: "solo",
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        timeZoneName: "America/Denver",
        notes,
        resource: { id: plane.id },
        personnel: { students: [{ id: studentId }] },
      },
    });
    expect(refused.status(), await refused.text()).toBe(400);
    const refusedBody = await refused.json();
    expect(String(refusedBody.message ?? "")).toMatch(/at least \$100000 credit/i);

    const staffOk = await request.post(`${base}/reservations/`, {
      headers: owner.headers,
      data: {
        title: "E2E L4 staff",
        type: "solo",
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        timeZoneName: "America/Denver",
        notes: `${notes}-staff`,
        resource: { id: plane.id },
        personnel: { students: [{ id: studentId }] },
      },
    });
    expect(staffOk.status(), await staffOk.text()).toBeLessThan(300);

    const invalid = await request.patch(`${base}/organizations`, {
      headers: owner.headers,
      data: { bookingPolicy: { minimumBalanceCents: -5 } },
    });
    expect(invalid.status()).toBe(400);

    const credit = await request.post(`${base}/orgUsers/${studentId}/ledger/entries`, {
      headers: owner.headers,
      data: { type: "cash", amountCents: 2500, memo: `E2E L5 stmt ${Date.now()}` },
    });
    expect(credit.status(), await credit.text()).toBe(201);

    const start = new Date(Date.now() - 864e5).toISOString();
    const end = new Date(Date.now() + 864e5).toISOString();
    const stmt = await request.get(
      `${base}/orgUsers/${studentId}/ledger/statement?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { headers: student.headers },
    );
    expect(stmt.ok(), await stmt.text()).toBeTruthy();
    const stmtBody = await stmt.json();
    expect(stmtBody.data).toMatchObject({
      openingCents: expect.any(Number),
      closingCents: expect.any(Number),
      periodSumCents: expect.any(Number),
    });
    expect(Array.isArray(stmtBody.data.entries)).toBeTruthy();
    const last = stmtBody.data.entries.at(-1);
    if (last) {
      expect(last.runningBalanceCents).toBe(stmtBody.data.closingCents);
    }

    const otherMember = await request.get(
      `${base}/orgUsers/${owner.orgUserId}/ledger/statement?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { headers: student.headers },
    );
    expect(otherMember.status()).toBe(400);

    const emailed = await request.post(
      `${base}/orgUsers/${studentId}/ledger/statement/email`,
      {
        headers: owner.headers,
        data: { start, end },
      },
    );
    expect(emailed.ok(), await emailed.text()).toBeTruthy();
    await expect(emailed.json()).resolves.toMatchObject({
      data: { sent: true, to: expect.stringMatching(/@/) },
    });

    const badRange = await request.get(
      `${base}/orgUsers/${studentId}/ledger/statement?start=2020-01-01T00:00:00.000Z&end=2023-01-02T00:00:00.000Z`,
      { headers: owner.headers },
    );
    expect(badRange.status()).toBe(400);
  });

  test("UI: booking gates in settings; statement on Billing", async ({
    page,
    request,
  }) => {
    const owner = await ownerAuth(request);
    const base = apiBase();
    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    const ledgerOn = (await ledgerSettings.json()).data?.enabled === true;
    if (!ledgerOn) {
      test.skip(true, "ledger mode off — skip L4/L5 UI");
      return;
    }

    await page.goto("/settings?tab=booking-preferences");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.getByText("Minimum credit to self-book", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("Maximum owing to self-book", { exact: true }),
    ).toBeVisible();

    await page.goto("/me/invoices?tab=ledger");
    await expect(page.getByRole("heading", { name: /Billing/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /^Statement$/i })).toBeVisible();
    await page.getByRole("button", { name: /^Statement$/i }).click();
    await expect(page.getByLabel(/^From$/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/^To$/i)).toBeVisible();
    await expect(page.getByText(/Opening/i).first()).toBeVisible();
    await expect(page.getByText(/Closing/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Print$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Email statement$/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("Ledger L5 statement (student)", () => {
  test.use({ storageState: ".auth/student.json" });

  test("student can open their own statement from Billing", async ({ page, request }) => {
    const owner = await ownerAuth(request);
    const base = apiBase();
    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    if ((await ledgerSettings.json()).data?.enabled !== true) {
      test.skip(true, "ledger mode off — skip student statement UI");
      return;
    }

    await page.goto("/me/invoices?tab=ledger");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Billing/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /^Statement$/i })).toBeVisible();
    await page.getByRole("button", { name: /^Statement$/i }).click();
    await expect(page.getByLabel(/^From$/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /^Email statement$/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
