import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";

async function tokenFor(request: APIRequestContext, email: string) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(auth.ok(), `auth failed for ${email}`).toBeTruthy();
  return (await auth.json()).auth.accessToken as string;
}

async function bookablePlane(request: APIRequestContext, headers: Record<string, string>) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const resources = await request.get(`${base}/resources`, { headers });
  expect(resources.ok()).toBeTruthy();
  const resBody = await resources.json();
  const items = Array.isArray(resBody) ? resBody : (resBody.data ?? []);
  let plane: { id: number } | null = null;
  for (const row of items) {
    if (!row?.type?.plane || row.type.plane.grounded) continue;
    if (row.type.plane.tailNumber === "N172TS") return row;
    if (!plane) plane = row;
  }
  expect(plane, "need a bookable plane").toBeTruthy();
  return plane!;
}

async function orgUserByEmail(
  request: APIRequestContext,
  headers: Record<string, string>,
  email: string,
) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const orgUsers = await request.get(`${base}/orgUsers`, { headers });
  expect(orgUsers.ok()).toBeTruthy();
  const usersBody = await orgUsers.json();
  const users = Array.isArray(usersBody) ? usersBody : (usersBody.data ?? []);
  return users.find((u: { user?: { email?: string } }) => u?.user?.email === email) ?? null;
}

async function createWindowedReservation(
  request: APIRequestContext,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  const base = apiProxyTarget().replace(/\/$/, "");
  let created: Awaited<ReturnType<typeof request.post>> | null = null;
  for (let dayOffset = 2; dayOffset <= 10; dayOffset++) {
    const probe = new Date(Date.now() + dayOffset * 864e5);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const start = new Date(`${ymd}T10:00:00-06:00`);
    const end = new Date(start.getTime() + 3600_000);
    created = await request.post(`${base}/reservations/`, {
      headers,
      data: { ...body, start: start.toISOString(), end: end.toISOString(), timeZoneName: "America/Denver" },
    });
    if (created.status() < 300) return created;
  }
  return created!;
}

test.describe("Invoice privacy on the calendar and offline package payment", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("student and renter GET do not receive another person's rate override", async ({
    request,
  }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    const ownerToken = await tokenFor(request, ACCOUNTS.owner);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    const plane = await bookablePlane(request, ownerHeaders);
    const student = await orgUserByEmail(request, ownerHeaders, ACCOUNTS.student);
    const renter = await orgUserByEmail(request, ownerHeaders, ACCOUNTS.renter);
    expect(student, "need test student").toBeTruthy();

    const notes = `E2E-invoice-privacy-${Date.now()}`;
    const created = await createWindowedReservation(request, ownerHeaders, {
      title: "E2E rate privacy",
      type: "solo",
      notes,
      resource: { id: plane.id },
      personnel: {
        students: [{ id: student.id }],
      },
    });
    expect(created.status(), await created.text()).toBeLessThan(300);
    const reservationId = ((await created.json()).data ?? {}).id as number;
    expect(reservationId).toBeTruthy();

    const overridden = await request.post(`${base}/reservations/${reservationId}/paymentOverrides`, {
      headers: ownerHeaders,
      data: { paymentOverrides: { resourceRateOverride: 12345 } },
    });
    expect(overridden.ok(), await overridden.text()).toBeTruthy();
    const ownerRow = ((await overridden.json()).data ?? {}) as {
      paymentOverrides?: { resourceRateOverride?: number } | null;
      invoices?: unknown[];
    };
    expect(ownerRow.paymentOverrides?.resourceRateOverride).toBe(12345);

    const studentToken = await tokenFor(request, ACCOUNTS.student);
    const studentGet = await request.get(`${base}/reservations/${reservationId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(studentGet.ok(), await studentGet.text()).toBeTruthy();
    const studentRow = ((await studentGet.json()).data ?? {}) as {
      paymentOverrides?: unknown;
      invoices?: Array<{ total?: number; stripePaymentLink?: string }>;
      prepaidInvoice?: unknown;
    };
    expect(studentRow.paymentOverrides).toBeNull();
    for (const invoice of studentRow.invoices ?? []) {
      expect(invoice.stripePaymentLink ?? null).toBeNull();
    }

    if (renter) {
      const renterToken = await tokenFor(request, ACCOUNTS.renter);
      const renterGet = await request.get(`${base}/reservations/${reservationId}`, {
        headers: { Authorization: `Bearer ${renterToken}` },
      });
      expect(renterGet.ok(), await renterGet.text()).toBeTruthy();
      const renterRow = ((await renterGet.json()).data ?? {}) as {
        paymentOverrides?: unknown;
        prepaidInvoice?: unknown;
        invoices?: Array<{ total?: number }>;
      };
      expect(renterRow.paymentOverrides).toBeNull();
      expect(renterRow.prepaidInvoice ?? null).toBeNull();
      expect(renterRow.invoices ?? []).toEqual([]);
    }

    const studentOffline = await request.post(
      `${base}/reservations/${reservationId}/prepaid/record-offline`,
      {
        headers: { Authorization: `Bearer ${studentToken}` },
        data: { method: "check" },
      },
    );
    expect(studentOffline.status()).toBe(403);
  });

  test("owner sees missing-package banner, can send invoice, and can record a check", async ({
    page,
    request,
  }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    const ownerToken = await tokenFor(request, ACCOUNTS.owner);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    const plane = await bookablePlane(request, ownerHeaders);
    const student = await orgUserByEmail(request, ownerHeaders, ACCOUNTS.student);
    expect(student, "need test student").toBeTruthy();

    const notes = `E2E-package-missing-${Date.now()}`;
    const created = await createWindowedReservation(request, ownerHeaders, {
      title: "E2E package missing",
      type: "solo",
      notes,
      resource: { id: plane.id },
      personnel: { students: [{ id: student.id }] },
    });
    expect(created.status(), await created.text()).toBeLessThan(300);
    const reservation = ((await created.json()).data ?? {}) as { id: number };
    const reservationId = reservation.id;

    await page.route(`**/api/reservations/${reservationId}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      const res = await route.fetch();
      const body = await res.json();
      const row = body.data ?? body;
      row.collectionStyle = "prepaid_fixed";
      row.prepaidInvoice = null;
      row.ledgerEntries = [];
      row.invoices = [];
      await route.fulfill({
        status: res.status(),
        headers: { ...res.headers(), "content-type": "application/json" },
        body: JSON.stringify({ ...body, data: row }),
      });
    });

    await page.route(`**/api/reservations/${reservationId}/prepaid/ensure`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: reservationId,
            collectionStyle: "prepaid_fixed",
            prepaidInvoice: {
              id: 9001,
              total: 4900,
              paidAt: null,
              voidedAt: null,
              stripePaymentLink: "https://invoice.stripe.test/e2e-pay",
            },
          },
        }),
      });
    });

    await page.goto(`/schedule/reservations/${reservationId}`);
    await expect(page.getByTestId("package-payment-missing")).toContainText(
      "Invoice did not go out",
      { timeout: 20_000 },
    );
    await expect(page.getByRole("button", { name: "Send invoice" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record check" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record cash" })).toBeVisible();

    await page.getByRole("button", { name: "Send invoice" }).click();
    await expect(page.getByText("Invoice sent")).toBeVisible({ timeout: 10_000 });
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("owner records a check on an unpaid package from the booking", async ({ page, request }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    const ownerToken = await tokenFor(request, ACCOUNTS.owner);
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };
    const plane = await bookablePlane(request, ownerHeaders);
    const student = await orgUserByEmail(request, ownerHeaders, ACCOUNTS.student);
    expect(student, "need test student").toBeTruthy();

    const notes = `E2E-package-check-${Date.now()}`;
    const created = await createWindowedReservation(request, ownerHeaders, {
      title: "E2E package check",
      type: "solo",
      notes,
      resource: { id: plane.id },
      personnel: { students: [{ id: student.id }] },
    });
    expect(created.status(), await created.text()).toBeLessThan(300);
    const reservationId = ((await created.json()).data ?? {}).id as number;
    let recorded = false;

    await page.route(`**/api/reservations/${reservationId}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      try {
        const res = await route.fetch();
        const body = await res.json();
        const row = body.data ?? body;
        row.collectionStyle = "prepaid_fixed";
        row.prepaidInvoice = {
          id: 9002,
          total: 4900,
          paidAt: recorded ? "2026-09-06T12:00:00.000Z" : null,
          voidedAt: null,
          stripePaymentLink: recorded ? null : "https://invoice.stripe.test/e2e-unpaid",
        };
        await route.fulfill({
          status: res.status(),
          headers: { ...res.headers(), "content-type": "application/json" },
          body: JSON.stringify({ ...body, data: row }),
        });
      } catch {
        // Page closed while a refetch was in flight.
      }
    });

    await page.route(
      `**/api/reservations/${reservationId}/prepaid/record-offline`,
      async (route) => {
        const posted = route.request().postDataJSON() as { method?: string };
        expect(posted.method).toBe("check");
        recorded = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              id: reservationId,
              collectionStyle: "prepaid_fixed",
              prepaidInvoice: {
                id: 9002,
                total: 4900,
                paidAt: "2026-09-06T12:00:00.000Z",
                voidedAt: null,
              },
            },
          }),
        });
      },
    );

    await page.goto(`/schedule/reservations/${reservationId}`);
    await expect(page.getByTestId("package-payment-callout")).toContainText("Collect payment", {
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Record check" }).click();
    await expect(page.getByText("Recorded check.")).toBeVisible({
      timeout: 10_000,
    });
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("wedged approve toast points at the booking so the desk can send or record payment", async ({
    page,
  }) => {
    await page.route("**/api/booking-requests", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: 88001,
              status: "pending",
              source: "member",
              reservationType: "guest",
              start: new Date(Date.now() + 2 * 864e5).toISOString(),
              end: new Date(Date.now() + 2 * 864e5 + 3600_000).toISOString(),
              createdAt: new Date().toISOString(),
              guestName: "E2E Wedge Guest",
              notes: "E2E wedged approve",
              resource: null,
              requestedBy: null,
            },
          ],
        }),
      });
    });

    await page.route("**/api/booking-requests/88001/approve", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Could not create the package invoice.",
          reservation: { id: 77001 },
        }),
      });
    });

    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);
    await page.getByRole("button", { name: /Booking requests/i }).click();
    await expect(page.getByRole("button", { name: /^Approve$/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /^Approve$/i }).first().click();
    await expect(
      page.getByText(/The booking is on the calendar/i),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Open booking" }).click();
    await expect(page).toHaveURL(/\/schedule\/reservations\/77001/);
  });
});
