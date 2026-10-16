import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  dismissCookieBanner,
  pickByPlaceholder,
  pickNextBookableSlot,
  submitBookReservation,
} from "../helpers/reservation-form";

test.describe("Schedule UI create", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("owner books via New reservation form", async ({ page, request }) => {
    const marker = `E2E-UI-web-${Date.now()}`;
    await page.goto("/schedule");
    await expect(page).not.toHaveURL(/\/login/);
    await dismissCookieBanner(page);
    await expect(page.getByText(/Your free trial has ended/i)).toHaveCount(0);

    const newRes = page.getByRole("button", { name: /\+?\s*New reservation/i }).first();
    await expect(newRes).toBeVisible({ timeout: 25_000 });
    await newRes.click();
    await expect(page.getByText("New reservation").first()).toBeVisible({
      timeout: 15_000,
    });

    // Type first: since the "Not listed" aircraft option (Sep 28), a Dual opens with
    // the aircraft already reading "Not listed", so there is no "Select resource" until
    // the type changes. Solo + student: the seeded renter is often grounded locally.
    await page.locator("#res-type").click();
    await page.getByRole("option", { name: /^Solo$/i }).click();
    await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickByPlaceholder(page, /Assign student/i, /Test Student/, /Search students/i);

    await pickNextBookableSlot(page);

    // Title left blank on purpose: it is optional for staff and names itself.
    await expect(page.locator("#res-title")).toHaveAttribute("placeholder", "N172TS · Solo");
    await page.locator("#res-notes").fill(marker);

    await submitBookReservation(page);
    await expect(page.locator("#res-notes")).toBeHidden({ timeout: 15_000 });

    const base = apiProxyTarget().replace(/\/$/, "");
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
    });
    const token = (await auth.json()).auth.accessToken as string;
    const start = new Date(Date.now() - 2 * 864e5).toISOString();
    const end = new Date(Date.now() + 45 * 864e5).toISOString();
    const list = await request.get(
      `${base}/reservations?startDate=${start}&endDate=${end}&includeCanceled=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const items = Array.isArray(body) ? body : (body.data ?? []);
    const found = items.find((r: { notes?: string }) => String(r.notes ?? "").includes(marker));
    expect(found, `Booked but not listed for marker=${marker}`).toBeTruthy();
    expect(found.title).toBe("N172TS · Solo");
  });
});
