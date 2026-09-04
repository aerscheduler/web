import { test, expect } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  dismissCookieBanner,
  pickByPlaceholder,
  pickNextBookableSlot,
} from "../helpers/reservation-form";

async function authToken(request: import("@playwright/test").APIRequestContext, email: string) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  return (await auth.json()).auth.accessToken as string;
}

test.describe("booking request approval flow", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
    const base = apiProxyTarget().replace(/\/$/, "");
    const token = await authToken(request, ACCOUNTS.owner);
    await request.patch(`${base}/organizations/`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { bookingPolicy: { bookingApprovalRequiredRoles: [] } },
    });
  });

  test("student submits request and owner approves", async ({ browser, request }) => {
    const ownerToken = await authToken(request, ACCOUNTS.owner);
    const base = apiProxyTarget().replace(/\/$/, "");
    await request.patch(`${base}/organizations/`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { bookingPolicy: { bookingApprovalRequiredRoles: ["student"] } },
    });

    const marker = `E2E-request-${Date.now()}`;
    const studentContext = await browser.newContext({ storageState: ".auth/student.json" });
    const studentPage = await studentContext.newPage();
    await studentPage.goto("/me/book");
    await dismissCookieBanner(studentPage);
    await expect(studentPage.getByRole("button", { name: /^Submit request$/i })).toBeVisible({
      timeout: 25_000,
    });
    await pickByPlaceholder(studentPage, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(studentPage);
    await studentPage.locator("#res-notes").fill(marker);
    await studentPage.getByRole("button", { name: /^Submit request$/i }).click();
    await expect(studentPage).toHaveURL(/tab=requests/, { timeout: 20_000 });
    await studentContext.close();

    const ownerContext = await browser.newContext({ storageState: ".auth/owner.json" });
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/schedule");
    await dismissCookieBanner(ownerPage);
    await ownerPage.getByRole("button", { name: /Booking requests/i }).click();
    await ownerPage.getByRole("button", { name: /^Approve$/i }).first().click();
    await expect(ownerPage.getByText(/approved and booked/i)).toBeVisible({ timeout: 20_000 });
    await ownerContext.close();

    const studentToken = await authToken(request, ACCOUNTS.student);
    const start = new Date(Date.now() - 2 * 864e5).toISOString();
    const end = new Date(Date.now() + 45 * 864e5).toISOString();
    const list = await request.get(
      `${base}/reservations?startDate=${start}&endDate=${end}&includeCanceled=true`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const items = Array.isArray(body) ? body : (body.data ?? []);
    expect(
      items.some((r: { notes?: string }) => String(r.notes ?? "").includes(marker))
    ).toBeTruthy();
  });
});
