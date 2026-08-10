import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  apiBase,
  authAs,
  ensureOfferPolicyForE2e,
  findBookablePlane,
  findFreeHourSlot,
  orgUserIdForEmail,
  restoreOfferPolicy,
  withdrawPendingOffers,
} from "../helpers/slot-offers";

/**
 * Cancel recovery: cancel a booking that someone is watching → pending SlotOffer
 * → accept books a replacement. Desk withdraw stops the chain.
 *
 * API-first (same style as api-lifecycle.spec.ts) so CI asserts the contract even
 * when the board UI is in flux. One light UI check that Pending offers opens.
 */
test.describe("Slot offer cancel recovery", () => {
  let priorPolicy: Record<string, unknown> | null = null;
  const marker = `E2E-slot-${Date.now()}`;

  test.afterAll(async ({ request }) => {
    try {
      const owner = await authAs(request, ACCOUNTS.owner);
      await withdrawPendingOffers(request, owner.headers, "E2E");
      if (priorPolicy) {
        await restoreOfferPolicy(request, owner.headers, priorPolicy);
      }
      await cleanupE2eReservations(request);
    } catch (err) {
      console.warn("slot-offer afterAll cleanup:", err);
    }
  });

  test("cancel with on_reservation standby → offer → accept books", async ({
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    priorPolicy = await ensureOfferPolicyForE2e(request, owner.headers);

    const plane = await findBookablePlane(request, owner.headers);
    // Prefer renter on the booking: test-student is often grounded for unpaid invoices
    // in the local seed, which blocks create and flunks this suite for unrelated reasons.
    const renterId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.renter,
    );
    // Admin can book rental, so they are a valid recovery candidate.
    const adminId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.admin,
    );

    const { start, end } = await findFreeHourSlot(
      request,
      owner.headers,
      plane.id,
    );
    const created = await request.post(`${base}/reservations/`, {
      headers: owner.headers,
      data: {
        title: `E2E Slot Cancel Source`,
        type: "rental",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZoneName: "America/Denver",
        notes: marker,
        resource: { id: plane.id },
        location: plane.location?.id ? { id: plane.location.id } : undefined,
        personnel: { renters: [{ id: renterId }] },
      },
    });
    expect(created.status(), await created.text()).toBeLessThan(300);
    const reservationId = ((await created.json()).data ?? {}).id as number;
    expect(reservationId).toBeTruthy();

    const standby = await request.post(`${base}/standby`, {
      headers: owner.headers,
      data: {
        kind: "on_reservation",
        orgUserId: adminId,
        watchedReservationId: reservationId,
      },
    });
    expect(standby.status(), await standby.text()).toBe(201);
    const interestId = ((await standby.json()).data ?? {}).id as number;

    const cancelled = await request.delete(`${base}/reservations/${reservationId}`, {
      headers: owner.headers,
      data: { reason: "E2E cancel recovery", category: "booked_in_error" },
    });
    expect([200, 204]).toContain(cancelled.status());

    // Cancel hook is fire-and-forget; poll briefly for the pending offer.
    let offer: any = null;
    for (let i = 0; i < 15; i++) {
      const list = await request.get(`${base}/slot-offers`, {
        headers: owner.headers,
      });
      expect(list.ok()).toBeTruthy();
      const body = await list.json();
      const items = Array.isArray(body) ? body : (body.data ?? []);
      offer = items.find(
        (o: any) =>
          o.status === "pending" &&
          o.trigger === "cancel_recovery" &&
          o.offeredTo?.id === adminId,
      );
      if (offer) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(
      offer,
      "expected cancel_recovery offer to the standby admin",
    ).toBeTruthy();
    expect(offer.FK_sourceReservationId ?? offer.sourceReservation?.id).toBeTruthy();

    const admin = await authAs(request, ACCOUNTS.admin);
    const accept = await request.post(`${base}/slot-offers/${offer.id}/accept`, {
      headers: admin.headers,
    });
    expect(accept.ok(), await accept.text()).toBeTruthy();
    const acceptBody = await accept.json();
    const accepted = acceptBody.data ?? acceptBody;
    expect(accepted.status).toBe("accepted");
    const resultingId =
      accepted.resultingReservation?.id ??
      accepted.FK_resultingReservationId ??
      null;
    expect(resultingId, "accept should mint a reservation").toBeTruthy();

    const booked = await request.get(`${base}/reservations/${resultingId}`, {
      headers: owner.headers,
    });
    expect(booked.ok()).toBeTruthy();
    const bookedData = (await booked.json()).data ?? {};
    expect(bookedData.cancelledAt).toBeFalsy();

    // Cleanup resulting booking + leftover interest if still active.
    await request.delete(`${base}/reservations/${resultingId}`, {
      headers: owner.headers,
      data: { reason: "E2E cleanup", category: "booked_in_error" },
    });
    if (interestId) {
      await request.delete(`${base}/standby/${interestId}`, {
        headers: owner.headers,
      });
    }
  });

  test("desk withdraw frees the chain without booking", async ({ request }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    if (!priorPolicy) {
      priorPolicy = await ensureOfferPolicyForE2e(request, owner.headers);
    }

    const plane = await findBookablePlane(request, owner.headers);
    const renterId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.renter,
    );
    const adminId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.admin,
    );
    const { start, end } = await findFreeHourSlot(
      request,
      owner.headers,
      plane.id,
    );

    const created = await request.post(`${base}/reservations/`, {
      headers: owner.headers,
      data: {
        title: `E2E Slot Withdraw Source`,
        type: "rental",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZoneName: "America/Denver",
        notes: `${marker}-withdraw`,
        resource: { id: plane.id },
        location: plane.location?.id ? { id: plane.location.id } : undefined,
        personnel: { renters: [{ id: renterId }] },
      },
    });
    expect(created.status(), await created.text()).toBeLessThan(300);
    const reservationId = ((await created.json()).data ?? {}).id as number;

    await request.post(`${base}/standby`, {
      headers: owner.headers,
      data: {
        kind: "on_reservation",
        orgUserId: adminId,
        watchedReservationId: reservationId,
      },
    });

    await request.delete(`${base}/reservations/${reservationId}`, {
      headers: owner.headers,
      data: { reason: "E2E withdraw path", category: "booked_in_error" },
    });

    let offerId: number | null = null;
    for (let i = 0; i < 15; i++) {
      const list = await request.get(`${base}/slot-offers`, {
        headers: owner.headers,
      });
      const body = await list.json();
      const items = Array.isArray(body) ? body : (body.data ?? []);
      const hit = items.find(
        (o: any) =>
          o.status === "pending" &&
          o.trigger === "cancel_recovery" &&
          (o.offeredTo?.id === adminId ||
            o.FK_offeredToOrgUserId === adminId),
      );
      if (hit) {
        offerId = hit.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(offerId, "pending offer for withdraw").toBeTruthy();

    const withdrawn = await request.post(
      `${base}/slot-offers/${offerId}/withdraw`,
      { headers: owner.headers },
    );
    expect(withdrawn.ok(), await withdrawn.text()).toBeTruthy();

    const after = await request.get(`${base}/slot-offers`, {
      headers: owner.headers,
    });
    const afterBody = await after.json();
    const afterItems = Array.isArray(afterBody) ? afterBody : (afterBody.data ?? []);
    const stillPending = afterItems.find((o: any) => o.id === offerId);
    expect(stillPending).toBeFalsy();
  });

  test("Pending offers sheet opens on schedule", async ({ page }) => {
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);
    const pending = page.getByRole("button", { name: /Pending offers/i });
    await expect(pending).toBeVisible({ timeout: 30_000 });
    await pending.click();
    await expect(
      page.getByText(/Pending offers|No pending|offer|standby|Cancel|Desk|AerScheduler AI/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
