import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
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
 * Full click-through for cancel recovery:
 * admin stands by → owner cancels in the sheet → offer lands → admin accepts
 * on /me/schedule?tab=offers; plus desk withdraw from Pending offers.
 *
 * Reservation create still uses the API (same as other schedule e2e) so we do
 * not couple this to the create-reservation form. Everything after that is UI.
 */
test.describe("Slot offer cancel recovery (UI)", () => {
  let priorPolicy: Record<string, unknown> | null = null;
  const marker = `E2E-slot-ui-${Date.now()}`;

  test.afterAll(async ({ request }) => {
    try {
      const owner = await authAs(request, ACCOUNTS.owner);
      await withdrawPendingOffers(request, owner.headers, "E2E");
      if (priorPolicy) {
        await restoreOfferPolicy(request, owner.headers, priorPolicy);
      }
      await cleanupE2eReservations(request);
    } catch (err) {
      console.warn("slot-offer UI afterAll cleanup:", err);
    }
  });

  test("standby → cancel → accept in the console", async ({
    browser,
    request,
  }) => {
    const base = apiBase();
    const ownerApi = await authAs(request, ACCOUNTS.owner);
    priorPolicy = await ensureOfferPolicyForE2e(request, ownerApi.headers);

    const plane = await findBookablePlane(request, ownerApi.headers);
    const renterId = await orgUserIdForEmail(
      request,
      ownerApi.headers,
      ACCOUNTS.renter,
    );
    const { start, end } = await findFreeHourSlot(
      request,
      ownerApi.headers,
      plane.id,
    );

    const created = await request.post(`${base}/reservations/`, {
      headers: ownerApi.headers,
      data: {
        title: "E2E Slot UI Source",
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

    const adminPage = await pageAs(browser, "admin");
    const ownerPage = await pageAs(browser, "owner");
    await dismissCookieBanner(adminPage);
    await dismissCookieBanner(ownerPage);

    // 1) Admin joins standby from the reservation detail.
    await openReservation(adminPage, reservationId);
    await expect(
      adminPage.getByRole("button", { name: /Stand by for this booking/i }),
    ).toBeVisible({ timeout: 20_000 });
    await adminPage
      .getByRole("button", { name: /Stand by for this booking/i })
      .click();
    await expect(adminPage.getByText(/You are standing by/i)).toBeVisible({
      timeout: 15_000,
    });

    // 2) Owner cancels from the same detail sheet.
    await openReservation(ownerPage, reservationId);
    await ownerPage
      .getByRole("button", { name: /Cancel reservation/i })
      .click();
    await fillCancelDialog(ownerPage);

    // Cancel fires recovery async. Prefer the auto offer; if quiet/caps deferred,
    // desk can still start recovery from the canceled sheet.
    let offerAppeared = await waitForPendingOffer(request, ownerApi.headers, 8_000);
    if (!offerAppeared) {
      await openReservation(ownerPage, reservationId);
      const offerBtn = ownerPage.getByRole("button", {
        name: /Offer this slot/i,
      });
      if (await offerBtn.isVisible().catch(() => false)) {
        await offerBtn.click();
        await expect(
          ownerPage.getByText(/Offered to|Offer sent|No eligible/i).first(),
        ).toBeVisible({ timeout: 15_000 });
      }
      offerAppeared = await waitForPendingOffer(request, ownerApi.headers, 10_000);
    }
    expect(offerAppeared, "expected a pending cancel_recovery offer").toBeTruthy();

    // 3) Owner sees it under Pending offers (desk UI).
    await ownerPage.goto("/schedule");
    await ownerPage.getByRole("button", { name: /Pending offers/i }).click();
    await expect(ownerPage.getByText(/Cancel|Test Admin|admin/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // 4) Admin accepts from My Schedule → Offers.
    await adminPage.goto("/me/schedule?tab=offers");
    await expect(
      adminPage.getByRole("button", { name: /^Accept$/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await adminPage.getByRole("button", { name: /^Accept$/i }).first().click();
    await expect(
      adminPage.getByText(/Slot accepted|reservation is booked|No pending offers/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    // API: resulting booking exists and is not cancelled.
    const pending = await request.get(`${base}/slot-offers`, {
      headers: ownerApi.headers,
    });
    const pendingBody = await pending.json();
    const pendingItems = Array.isArray(pendingBody)
      ? pendingBody
      : (pendingBody.data ?? []);
    expect(
      pendingItems.filter((o: any) => o.status === "pending").length,
    ).toBe(0);

    await adminPage.context().close();
    await ownerPage.context().close();
  });

  test("desk withdraws pending offer from Pending offers sheet", async ({
    browser,
    request,
  }) => {
    const base = apiBase();
    const ownerApi = await authAs(request, ACCOUNTS.owner);
    if (!priorPolicy) {
      priorPolicy = await ensureOfferPolicyForE2e(request, ownerApi.headers);
    }

    const plane = await findBookablePlane(request, ownerApi.headers);
    const renterId = await orgUserIdForEmail(
      request,
      ownerApi.headers,
      ACCOUNTS.renter,
    );
    const adminId = await orgUserIdForEmail(
      request,
      ownerApi.headers,
      ACCOUNTS.admin,
    );
    const { start, end } = await findFreeHourSlot(
      request,
      ownerApi.headers,
      plane.id,
    );

    const created = await request.post(`${base}/reservations/`, {
      headers: ownerApi.headers,
      data: {
        title: "E2E Slot UI Withdraw Source",
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
      headers: ownerApi.headers,
      data: {
        kind: "on_reservation",
        orgUserId: adminId,
        watchedReservationId: reservationId,
      },
    });
    await request.delete(`${base}/reservations/${reservationId}`, {
      headers: ownerApi.headers,
      data: { reason: "E2E UI withdraw setup", category: "booked_in_error" },
    });

    const ready = await waitForPendingOffer(request, ownerApi.headers, 12_000);
    expect(ready, "pending offer before withdraw UI").toBeTruthy();

    const ownerPage = await pageAs(browser, "owner");
    await ownerPage.goto("/schedule");
    await ownerPage.getByRole("button", { name: /Pending offers/i }).click();
    await expect(
      ownerPage.getByRole("button", { name: /^Withdraw$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await ownerPage.getByRole("button", { name: /^Withdraw$/i }).first().click();
    await expect(ownerPage.getByText(/Offer withdrawn|No pending offers/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const after = await request.get(`${base}/slot-offers`, {
      headers: ownerApi.headers,
    });
    const afterBody = await after.json();
    const afterItems = Array.isArray(afterBody) ? afterBody : (afterBody.data ?? []);
    expect(afterItems.filter((o: any) => o.status === "pending").length).toBe(0);

    await ownerPage.context().close();
  });
});

async function pageAs(browser: Browser, role: "owner" | "admin"): Promise<Page> {
  const context = await browser.newContext({
    storageState: path.join(process.cwd(), ".auth", `${role}.json`),
  });
  return context.newPage();
}

async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole("dialog", { name: /Cookie preferences/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: /^Accept$/i }).click();
    await expect(banner).toBeHidden({ timeout: 5_000 });
  }
}

async function openReservation(page: Page, reservationId: number) {
  await page.goto(`/schedule?reservation=${reservationId}`);
  await expect(page).not.toHaveURL(/\/login/);
  await dismissCookieBanner(page);
  // Detail panel / sheet should show cancel or standby affordances.
  await expect(
    page
      .getByRole("button", {
        name: /Cancel reservation|Stand by for this booking|Offer this slot|Withdraw/i,
      })
      .first(),
  ).toBeVisible({ timeout: 25_000 });
}

async function fillCancelDialog(page: Page) {
  await dismissCookieBanner(page);
  const dialog = page.locator('[data-doc-shot="cancel-reservation-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.locator("#cancel-category").click();
  const booked = page.getByRole("option", { name: /Booked in error/i });
  if (await booked.isVisible().catch(() => false)) {
    await booked.click();
  } else {
    await page.getByRole("option").first().click();
  }

  await dialog.locator("#cancel-reason").fill("E2E UI cancel recovery");
  await dialog
    .getByRole("button", { name: /^Cancel reservation$/i })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function waitForPendingOffer(
  request: Parameters<typeof authAs>[0],
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<boolean> {
  const base = apiBase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await request.get(`${base}/slot-offers`, { headers });
    if (list.ok()) {
      const body = await list.json();
      const items = Array.isArray(body) ? body : (body.data ?? []);
      if (
        items.some(
          (o: any) =>
            o.status === "pending" &&
            (o.trigger === "cancel_recovery" || o.trigger === "desk"),
        )
      ) {
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}
