import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";

/**
 * Confirm a prepaid guest booking, fly it, and see Collect payment until paid.
 * Skips when the test org has no Stripe Connect (isolated stack default).
 */
test.describe("Prepaid package confirm, fly, collect", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("owner sees Collect payment through ramp and guest close-out", async ({
    request,
    page,
  }) => {
    const base = apiProxyTarget().replace(/\/$/, "");
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
    });
    expect(auth.ok()).toBeTruthy();
    const token = (await auth.json()).auth.accessToken as string;
    const headers = { Authorization: `Bearer ${token}` };

    const billingRes = await request.get(`${base}/organizations/billing`, { headers });
    expect(billingRes.ok(), await billingRes.text()).toBeTruthy();
    const billingBody = await billingRes.json();
    const billing = billingBody.data ?? billingBody;
    test.skip(
      !(billing?.stripeEnabled && billing?.stripeAccountId),
      "Test org has no Stripe Connect. Seed organization_billing_settings to run this spec.",
    );

    const resources = await request.get(`${base}/resources`, { headers });
    expect(resources.ok()).toBeTruthy();
    const resBody = await resources.json();
    const items = Array.isArray(resBody) ? resBody : (resBody.data ?? []);
    let plane: { id: number } | null = null;
    for (const r of items) {
      if (!r?.type?.plane || r.type.plane.grounded) continue;
      if (r.type.plane.tailNumber === "N172TS") {
        plane = r;
        break;
      }
      if (!plane) plane = r;
    }
    expect(plane, "need a bookable plane").toBeTruthy();

    const orgUsers = await request.get(`${base}/orgUsers`, { headers });
    expect(orgUsers.ok()).toBeTruthy();
    const usersBody = await orgUsers.json();
    const users = Array.isArray(usersBody) ? usersBody : (usersBody.data ?? []);
    const instructor = users.find((u: { user?: { email?: string } }) => u?.user?.email === ACCOUNTS.instructor);
    expect(instructor, "need test instructor").toBeTruthy();

    const stamp = Date.now();
    const notes = `E2E-prepaid-${stamp}`;
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
        data: {
          title: "E2E Prepaid Guest",
          type: "guest",
          start: start.toISOString(),
          end: end.toISOString(),
          timeZoneName: "America/Denver",
          notes,
          resource: { id: plane!.id },
          collectionStyle: "prepaid_fixed",
          prepaidAmountCents: 19900,
          personnel: {
            instructors: [{ id: instructor.id }],
            guests: [
              {
                name: `E2E Prepaid Guest ${stamp}`,
                email: `e2e-prepaid-${stamp}@example.com`,
              },
            ],
          },
        },
      });
      if (created.status() < 300) break;
    }
    expect(created!.status(), await created!.text()).toBeLessThan(300);
    const createdBody = await created!.json();
    const reservation = createdBody.data ?? createdBody;
    const reservationId = reservation.id as number;
    expect(reservation.prepaidInvoice, "package invoice after confirm").toBeTruthy();
    expect(reservation.prepaidInvoice.paidAt).toBeFalsy();

    await page.goto(`/schedule/reservations/${reservationId}`);
    await expect(page.getByTestId("package-payment-callout")).toContainText("Collect payment", {
      timeout: 20_000,
    });

    const detail = await request.get(`${base}/reservations/${reservationId}`, { headers });
    expect(detail.ok()).toBeTruthy();
    const detailBody = await detail.json();
    const row = detailBody.data ?? detailBody;
    const hobbs = row.resource?.type?.plane?.hobbsTime ?? 0;
    const tach = row.resource?.type?.plane?.tachTime ?? 0;

    const rampOut = await request.post(`${base}/reservations/${reservationId}/rampOut`, {
      headers,
      data: { hobbsTimeOut: hobbs, tachTimeOut: tach },
    });
    expect(rampOut.ok(), await rampOut.text()).toBeTruthy();
    const rampIn = await request.post(`${base}/reservations/${reservationId}/rampIn`, {
      headers,
      data: { hobbsTimeIn: hobbs + 1, tachTimeIn: tach + 1, briefing: 1 },
    });
    expect(rampIn.ok(), await rampIn.text()).toBeTruthy();
    const closeOut = await request.post(
      `${base}/reservations/${reservationId}/confirmReviewGuest`,
      { headers, data: {} },
    );
    expect(closeOut.ok(), await closeOut.text()).toBeTruthy();

    const after = await request.get(`${base}/reservations/${reservationId}`, { headers });
    const afterBody = await after.json();
    const flown = afterBody.data ?? afterBody;
    expect(flown.completedByForGuest).toBeTruthy();
    expect(flown.invoices ?? []).toEqual([]);
    expect(flown.prepaidInvoice?.paidAt).toBeFalsy();

    await page.reload();
    await expect(page.getByTestId("package-payment-callout")).toContainText("Collect payment");
    await expect(page.getByText("This flight has been invoiced.")).toHaveCount(0);
  });
});
