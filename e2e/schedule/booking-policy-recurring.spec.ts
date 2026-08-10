import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "../helpers/env";
import { cleanupE2eReservations, uiLogin } from "../helpers/api";
import {
  countUpcomingForMember,
  ownerAuth,
  postWeeklySeries,
  readBookingPolicy,
  restoreBookingPolicy,
  setMaxFutureBookings,
  type BookingPolicySnapshot,
} from "../helpers/booking-policy";
import {
  findBookablePlane,
  futureDenverSlot,
  orgUserIdForEmail,
} from "../helpers/slot-offers";

/**
 * Max upcoming bookings and repeating series.
 *
 * API asserts the server refuses a series that would blow the cap and accepts one
 * that still fits. UI asserts the Custom repeat dialog caps "After N" at the school
 * limit so the form cannot offer a series the API will refuse.
 */
test.describe("Booking policy - recurring vs max upcoming", () => {
  let priorPolicy: BookingPolicySnapshot | null = null;

  test.afterAll(async ({ request }) => {
    try {
      const owner = await ownerAuth(request);
      if (priorPolicy) {
        await restoreBookingPolicy(request, owner.headers, priorPolicy);
      }
      await cleanupE2eReservations(request);
    } catch (err) {
      console.warn("booking-policy afterAll cleanup:", err);
    }
  });

  test("API refuses a series over the upcoming cap, accepts one that fits", async ({
    request,
  }) => {
    const owner = await ownerAuth(request);
    priorPolicy = await setMaxFutureBookings(request, owner.headers, null);
    await cleanupE2eReservations(request);

    const plane = await findBookablePlane(request, owner.headers);
    const renterId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.renter,
    );
    const existing = await countUpcomingForMember(
      request,
      owner.headers,
      renterId,
    );
    // Room for exactly one more booking; a series of 2 must fail.
    const cap = existing + 1;
    await setMaxFutureBookings(request, owner.headers, cap);

    const marker = `E2E-recurring-cap-${Date.now()}`;
    // Cap check runs before clash checks, so any future wall-clock works here.
    const probe = futureDenverSlot(5);
    const tooMany = await postWeeklySeries(request, owner.headers, {
      resourceId: plane.id,
      renterId,
      start: probe.start,
      end: probe.end,
      count: 2,
      notes: `${marker}-over`,
    });
    expect(tooMany.status, JSON.stringify(tooMany.body)).toBe(400);
    expect(String(tooMany.body?.message ?? "")).toMatch(
      /repeat would create|school limit|upcoming/i,
    );

    // Walk days until we land an open slot (board may already be busy at 10:00).
    let fits: Awaited<ReturnType<typeof postWeeklySeries>> | null = null;
    let lastBody = "";
    for (let daysOut = 3; daysOut <= 28; daysOut++) {
      const slot = futureDenverSlot(daysOut);
      // Try 10:00 and 14:00 local to dodge common lesson hours.
      for (const hourOffset of [0, 4]) {
        const start = new Date(slot.start.getTime() + hourOffset * 3600_000);
        const end = new Date(start.getTime() + 3600_000);
        const res = await postWeeklySeries(request, owner.headers, {
          resourceId: plane.id,
          renterId,
          start,
          end,
          count: 1,
          notes: `${marker}-ok-${daysOut}-${hourOffset}`,
        });
        if (res.status === 201) {
          fits = res;
          break;
        }
        lastBody = JSON.stringify(res.body);
        const msg = String(res.body?.message ?? "");
        // Cap refusal here would mean our existing-count math is wrong.
        expect(msg).not.toMatch(/school limit|repeat would create/i);
        if (!/already booked|conflict|clash/i.test(msg)) {
          expect(res.status, lastBody).toBe(201);
        }
      }
      if (fits) break;
    }
    expect(fits, `no free hour for a 1-booking series; last=${lastBody}`).toBeTruthy();
    expect(fits!.body?.data?.occurrences ?? 1).toBeGreaterThanOrEqual(1);
  });

  test("Custom repeat dialog caps After N at the school limit", async ({
    page,
    request,
  }) => {
    const owner = await ownerAuth(request);
    if (!priorPolicy) {
      priorPolicy = await readBookingPolicy(request);
    }
    await setMaxFutureBookings(request, owner.headers, 3);

    // Re-login so the console session picks up bookingPolicy from the API patch.
    await page.goto("/login");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await uiLogin(page, ACCOUNTS.owner, TEST_PASSWORD);

    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);

    await page.getByRole("button", { name: /^Create$/i }).click();
    await page.getByRole("menuitem", { name: /New reservation/i }).click();
    await expect(page.getByText(/New reservation/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("Repeat", { exact: true }).click();
    await page.getByRole("option", { name: /Custom/i }).click();

    await expect(page.getByRole("heading", { name: /Custom repeat/i })).toBeVisible();
    await expect(page.getByText(/school upcoming-booking limit/i)).toBeVisible();

    const countInput = page.getByLabel("Number of bookings");
    await expect(countInput).toBeVisible();
    await countInput.fill("20");
    await expect(countInput).toHaveValue("3");

    await page.getByRole("button", { name: /^Done$/i }).click();
    await expect(page.getByText(/3 bookings/i).first()).toBeVisible();
  });
});
