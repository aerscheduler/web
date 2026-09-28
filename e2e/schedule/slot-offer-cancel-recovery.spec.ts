import { test, expect } from "@playwright/test";
import { ACCOUNTS, RENTER2_EMAIL } from "../helpers/env";
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
    // THE SECOND RENTER. A recovery candidate has to be SEATABLE (`canHoldStandby`:
    // instructor, student or renter), allowed to book the booking's TYPE
    // (`roleCanCreateReservationType`, which for `rental` means renter), and not already on
    // the booking. This used to be the admin, noted as "Admin can book rental, so they are a
    // valid recovery candidate", which was true until `canHoldStandby` landed: standby ends
    // with the member ON the booking and a desk role is never crew, so an owner, admin or
    // dispatcher is refused, and `ReservationStandby` hides the card for the same set.
    //
    // With one renter in the school no candidate could exist at all, so the seed grew a
    // second one (`test-renter2`) rather than bending the booking into a type that does not
    // exercise the same path.
    const standbyCandidateId = await orgUserIdForEmail(
      request,
      owner.headers,
      RENTER2_EMAIL,
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
        orgUserId: standbyCandidateId,
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
          o.offeredTo?.id === standbyCandidateId,
      );
      if (offer) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(
      offer,
      "expected cancel_recovery offer to the standby candidate",
    ).toBeTruthy();
    expect(offer.FK_sourceReservationId ?? offer.sourceReservation?.id).toBeTruthy();

    // ACCEPTED BY WHOEVER IT WAS OFFERED TO. An offer belongs to one member, so this only
    // ever worked because the admin used to be the standby candidate as well.
    const candidate = await authAs(request, RENTER2_EMAIL);
    const accept = await request.post(`${base}/slot-offers/${offer.id}/accept`, {
      headers: candidate.headers,
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
    //Seatable and rental-capable, for the reason in the first test.
    const standbyCandidateId = await orgUserIdForEmail(
      request,
      owner.headers,
      RENTER2_EMAIL,
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
        orgUserId: standbyCandidateId,
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
          (o.offeredTo?.id === standbyCandidateId ||
            o.FK_offeredToOrgUserId === standbyCandidateId),
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

  test("Pending offers sheet opens on schedule", async ({ page, request }) => {
    // ITS OWN PENDING OFFER. The button only renders when one exists
    // (`routes/_authed/schedule.tsx`: `(pendingOffersQ.data?.length ?? 0) > 0`), and this
    // test used to rely on one left behind by the tests above. They clean up after
    // themselves, so it was asserting a button that nothing had arranged to be there.
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    priorPolicy = await ensureOfferPolicyForE2e(request, owner.headers);

    const plane = await findBookablePlane(request, owner.headers);
    const renterId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.renter);
    const standbyCandidateId = await orgUserIdForEmail(request, owner.headers, RENTER2_EMAIL);
    const { start, end } = await findFreeHourSlot(request, owner.headers, plane.id);

    const created = await request.post(`${base}/reservations/`, {
      headers: owner.headers,
      data: {
        title: "E2E Slot Pending Source",
        type: "rental",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZoneName: "America/Denver",
        notes: `${marker}-pending`,
        resource: { id: plane.id },
        location: plane.location?.id ? { id: plane.location.id } : undefined,
        personnel: { renters: [{ id: renterId }] },
      },
    });
    expect(created.status(), await created.text()).toBeLessThan(300);
    const reservationId = ((await created.json()).data ?? {}).id as number;

    const standby = await request.post(`${base}/standby`, {
      headers: owner.headers,
      data: { kind: "on_reservation", orgUserId: standbyCandidateId, watchedReservationId: reservationId },
    });
    expect(standby.status(), await standby.text()).toBe(201);

    const cancelled = await request.delete(`${base}/reservations/${reservationId}`, {
      headers: owner.headers,
      data: { reason: "E2E pending offers sheet", category: "booked_in_error" },
    });
    expect([200, 204]).toContain(cancelled.status());

    // The cancel hook is fire-and-forget, so wait for the offer before loading the page.
    let offerId: number | null = null;
    for (let i = 0; i < 20; i++) {
      const list = await request.get(`${base}/slot-offers`, { headers: owner.headers });
      const body = await list.json();
      const items = Array.isArray(body) ? body : (body.data ?? []);
      const found = items.find((o: any) => o.status === "pending" && o.offeredTo?.id === standbyCandidateId);
      if (found) {
        offerId = found.id as number;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    expect(offerId, "expected a pending offer before opening the sheet").toBeTruthy();

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
