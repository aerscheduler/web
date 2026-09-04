import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  dismissCookieBanner,
  pickByPlaceholder,
  pickNextBookableSlot,
  submitBookReservation,
} from "../helpers/reservation-form";

test.describe("/me/book UI create", () => {
  test.use({ storageState: ".auth/student.json" });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("student books a solo flight for themselves", async ({ page, request }) => {
    const marker = `E2E-UI-me-book-${Date.now()}`;
    await page.goto("/me/book");
    await expect(page).not.toHaveURL(/\/login/);
    await dismissCookieBanner(page);
    await expect(page.getByText(/Your free trial has ended/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
      timeout: 25_000,
    });

    await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(page);
    await page.locator("#res-notes").fill(marker);

    await submitBookReservation(page);

    const base = apiProxyTarget().replace(/\/$/, "");
    const auth = await request.post(`${base}/auth/`, {
      data: { email: ACCOUNTS.student, password: TEST_PASSWORD },
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
    const found = items.some((r: { notes?: string }) =>
      String(r.notes ?? "").includes(marker),
    );
    expect(found, `Student booked but not listed for marker=${marker}`).toBeTruthy();
  });
});
