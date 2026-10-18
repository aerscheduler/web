import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, RENTER2_EMAIL } from "../helpers/env";
import { cleanupE2eReservations, uiLogin } from "../helpers/api";
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
 * a renter stands by → owner cancels in the sheet → offer lands → the renter accepts
 * on /me/schedule?tab=offers; plus desk withdraw from Pending offers.
 *
 * A recovery offer holds nothing since 2026-10-14, so it never reaches the desk's Pending
 * offers sheet (that lists holds); it is checked where the member sees it, `/slot-offers/me`.
 * The withdraw test uses a desk offer, which still holds its slot and so is on the sheet.
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

    const standbyPage = await pageAsRenter2(browser);
    const ownerPage = await pageAs(browser, "owner");
    await dismissCookieBanner(standbyPage);
    await dismissCookieBanner(ownerPage);

    // 1) The second renter joins standby from the reservation detail. Not the admin: a
    // desk role cannot be seated, so `canHoldStandby` refuses it and the console hides the card.
    await openReservation(standbyPage, reservationId);
    await expect(
      standbyPage.getByRole("button", { name: /Stand by for this booking/i }),
    ).toBeVisible({ timeout: 20_000 });
    await standbyPage
      .getByRole("button", { name: /Stand by for this booking/i })
      .click();
    await expect(standbyPage.getByText(/You are standing by/i)).toBeVisible({
      timeout: 15_000,
    });

    // 2) Owner cancels from the same detail sheet.
    await openReservation(ownerPage, reservationId);
    await openCancelFromPanel(ownerPage);
    await fillCancelDialog(ownerPage);

    // Cancel fires recovery async. Prefer the auto offer; if quiet/caps deferred,
    // desk can still start recovery from the canceled sheet.
    const candidateApi = await authAs(request, RENTER2_EMAIL);
    let offerAppeared = await waitForPendingOffer(request, candidateApi.headers, 8_000);
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
      offerAppeared = await waitForPendingOffer(request, candidateApi.headers, 10_000);
    }
    expect(offerAppeared, "expected a pending cancel_recovery offer").toBeTruthy();

    // 3) The standby member books it from My Schedule -> Offers. The offer's button says
    // "Book it" since the 2026-10-14 redesign (offers are suggestions you book, not holds you
    // accept); the cookie banner is dismissed anyway so nothing sits over the card.
    await standbyPage.goto("/me/schedule?tab=offers");
    await dismissCookieBanner(standbyPage);
    const acceptBtn = standbyPage.getByRole("button", { name: /^Book it$/i });
    await expect(acceptBtn.first()).toBeVisible({ timeout: 20_000 });
    await acceptBtn.first().click();

    // Prefer API confirmation: toast copy is easy to miss under cookie/banner races.
    //`/slot-offers/me` is per-caller, so it has to be asked as the member holding the offer.
    await expect
      .poll(
        async () => {
          const mine = await request.get(`${base}/slot-offers/me`, {
            headers: candidateApi.headers,
          });
          if (!mine.ok()) return -1;
          const body = await mine.json();
          const items = Array.isArray(body) ? body : (body.data ?? []);
          return items.filter((o: { status?: string }) => o.status === "pending").length;
        },
        { timeout: 20_000 },
      )
      .toBe(0);
    await expect(
      standbyPage.getByText(/Booked\. It's on your schedule|No pending offers/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await standbyPage.context().close();
    await ownerPage.context().close();
  });

  test("desk withdraws pending offer from Pending offers sheet", async () => {
    // LEGACY SURFACE. The sheet lists offers that HOLD a slot, and since 2026-10-14 no new offer
    // does, desk offers included (services/slot-offer.service.ts: `holdsSlot: false`). It only
    // ever shows offers made before then, which nothing here can create, so there is nothing to
    // arrange. Delete this test with the sheet once those offers have all run out.
    test.skip(true, "No new offer holds a slot since 2026-10-14; the Pending offers sheet only lists legacy holds.");
  });
});

/**
 * A browser session for the second renter, logged in here rather than in `auth.setup.ts`.
 *
 * The setup does one UI login per entry in ACCOUNTS, serially, and it is the slowest thing
 * in the suite. This account exists for this one spec, so this one spec pays for it.
 */
async function pageAsRenter2(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await uiLogin(page, RENTER2_EMAIL);
  return page;
}

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
  // THE PANEL ITSELF, not an action inside it. This waited for one of Cancel reservation /
  // Stand by / Offer this slot / Withdraw, and none is reliably there any more: "Make the
  // detail panels a peek, and give a booking its own page" put Edit and Cancel behind the
  // "Reservation actions" menu, and the standby card only renders for a member who can be
  // seated. It was asserting a role-dependent action to prove a role-independent thing.
  await expect(page.locator('[data-doc-shot="reservation-detail-panel"]')).toBeVisible({
    timeout: 25_000,
  });
}

/**
 * Cancel moved into the panel's "Reservation actions" menu in the peek redesign.
 *
 * Waits for each step rather than firing two clicks blind: the panel's header renders a
 * moment after the panel itself, and a menu click that lands early opens nothing and leaves
 * the failure to surface later as "the cancel dialog never appeared".
 */
async function openCancelFromPanel(page: Page) {
  await dismissCookieBanner(page);
  const actions = page.getByRole("button", { name: "Reservation actions" });
  await expect(actions).toBeVisible({ timeout: 20_000 });
  await actions.click();
  const cancelItem = page.getByRole("menuitem", { name: /Cancel reservation/i });
  await expect(cancelItem).toBeVisible({ timeout: 10_000 });
  await cancelItem.click();
}

async function fillCancelDialog(page: Page) {
  await dismissCookieBanner(page);
  const dialog = page.locator('[data-doc-shot="cancel-reservation-dialog"]');
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  // A reason that frees the slot. "Booked in error" is a correction, which never starts a
  // recovery (server utils/slotOfferRecoverable.ts), so the offer this test waits for
  // would never come.
  await dialog.locator("#cancel-category").click();
  await page.getByRole("option", { name: /Student or renter unavailable/i }).click();

  await dialog.locator("#cancel-reason").fill("E2E UI cancel recovery");
  await dialog
    .getByRole("button", { name: /^Cancel reservation$/i })
    .click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** A pending offer on the member's own list; `headers` are the MEMBER's, not the desk's. */
async function waitForPendingOffer(
  request: Parameters<typeof authAs>[0],
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<boolean> {
  const base = apiBase();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await request.get(`${base}/slot-offers/me`, { headers });
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
