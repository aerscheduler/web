/**
 * Screenshot capture for public-booking phase progress doc.
 * Run via: scripts/capture-booking-phases.sh (starts isolated E2E stack).
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { ownerAuthToken, patchBookingPolicy } from "../helpers/booking-adversarial";
import { dismissCookieBanner, pickByPlaceholder, pickNextBookableSlot } from "../helpers/reservation-form";

const OUT =
  process.env.SCREENSHOT_DIR ??
  path.resolve(__dirname, "../../../_local/insights/public-booking-phases/screenshots");

function shot(page: import("@playwright/test").Page, name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  return page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: false,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("booking phases screenshots", () => {
  test("capture web console flows", async ({ browser, request }) => {
    fs.mkdirSync(OUT, { recursive: true });

    const ownerToken = await ownerAuthToken(request);
    await patchBookingPolicy(request, ownerToken, { bookingApprovalRequiredRoles: ["student"] });

    const ownerCtx = await browser.newContext({
      storageState: ".auth/owner.json",
      viewport: { width: 1440, height: 900 },
    });
    const owner = await ownerCtx.newPage();

    await owner.goto("/settings?tab=booking-preferences");
    await dismissCookieBanner(owner);
    await owner.getByText(/Booking and cancellation rules/i).waitFor({ timeout: 20_000 });
    await owner.getByText(/Booking and cancellation rules/i).scrollIntoViewIfNeeded();
    await owner.getByText(/Minimum notice/i).scrollIntoViewIfNeeded();
    await shot(owner, "01-settings-booking-rules");

    await owner.getByText(/Booking approval required/i).scrollIntoViewIfNeeded();
    await shot(owner, "02-settings-booking-approval");

    await owner.goto("/schedule");
    await dismissCookieBanner(owner);
    const directNewRes = owner.getByRole("button", { name: /\+?\s*New reservation/i }).first();
    if (await directNewRes.isVisible().catch(() => false)) {
      await directNewRes.click();
    } else {
      await owner.getByRole("button", { name: /^Create$/i }).click();
      await owner.getByRole("menuitem", { name: /New reservation/i }).click();
    }
    await expect(owner.getByText(/New reservation/i).first()).toBeVisible({ timeout: 15_000 });
    await shot(owner, "03-owner-new-reservation-form");
    await owner.keyboard.press("Escape");

    await ownerCtx.close();

    const studentCtx = await browser.newContext({
      storageState: ".auth/student.json",
      viewport: { width: 1440, height: 900 },
    });
    const student = await studentCtx.newPage();

    await student.goto("/me/book");
    await dismissCookieBanner(student);
    await expect(student.getByRole("button", { name: /^Submit request$/i })).toBeVisible({
      timeout: 25_000,
    });
    await shot(student, "04-student-me-book-submit-button");

    await pickByPlaceholder(student, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(student);
    const marker = `E2E-doc-${Date.now()}`;
    await student.locator("#res-notes").fill(marker);
    await shot(student, "05-student-booking-request-form");

    await student.getByRole("button", { name: /^Submit request$/i }).click();
    await expect(student).toHaveURL(/tab=requests/, { timeout: 20_000 });
    await shot(student, "06-student-my-booking-requests");

    await studentCtx.close();

    const ownerCtx2 = await browser.newContext({
      storageState: ".auth/owner.json",
      viewport: { width: 1440, height: 900 },
    });
    const owner2 = await ownerCtx2.newPage();
    await owner2.goto("/schedule?panel=booking-requests");
    await dismissCookieBanner(owner2);
    await expect(owner2.getByRole("heading", { name: /Booking requests/i })).toBeVisible({
      timeout: 20_000,
    });
    await shot(owner2, "07-owner-booking-requests-panel");

    await owner2.getByRole("button", { name: /^Approve$/i }).first().click();
    await expect(owner2.getByText(/approved and booked/i)).toBeVisible({ timeout: 20_000 });
    await shot(owner2, "08-owner-approve-success");

    await owner2.goto("/me/notifications");
    await dismissCookieBanner(owner2);
    await expect(owner2.getByText(/Notification settings/i)).toBeVisible({ timeout: 15_000 });
    const bookingRequestsRow = owner2.getByText(/^Booking requests$/i).first();
    await expect(bookingRequestsRow).toBeVisible({ timeout: 15_000 });
    await shot(owner2, "09-notification-preferences-booking-requests");

    await ownerCtx2.close();

    await patchBookingPolicy(request, ownerToken, { bookingApprovalRequiredRoles: [] }).catch(() => {});
  });
});
