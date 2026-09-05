/**
 * Adversarial UI matrix for booking approval + ledger booking gates.
 * Every case drives the real console; API is only for setup/teardown.
 */
import { test, expect } from "@playwright/test";
import { cleanupE2eReservations } from "../helpers/api";
import {
  cancelPendingBookingRequests,
  orgUserIdForEmail,
  ownerAuthToken,
  patchBookingPolicy,
  patchLedger,
  postLedgerAdjustment,
  setLedgerBalance,
  readOrgBookingSnapshot,
  restoreOrgBookingSnapshot,
  type OrgBookingSnapshot,
} from "../helpers/booking-adversarial";
import { ACCOUNTS } from "../helpers/env";
import {
  attemptBookOrRequest,
  dismissCookieBanner,
  pickByPlaceholder,
  pickNextBookableSlot,
  submitBookingRequest,
} from "../helpers/reservation-form";

let snapshot: OrgBookingSnapshot;

test.describe("booking approval adversarial UI", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async ({ request }) => {
    const token = await ownerAuthToken(request);
    snapshot = await readOrgBookingSnapshot(request, token);
    await cancelPendingBookingRequests(request);
    await patchBookingPolicy(request, token, { bookingApprovalRequiredRoles: [] });
  });

  test.afterAll(async ({ request }) => {
    await cancelPendingBookingRequests(request);
    await cleanupE2eReservations(request);
    const token = await ownerAuthToken(request);
    await restoreOrgBookingSnapshot(request, token, snapshot);
  });

  test("owner settings: roles multi-select saves student-only approval", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await ctx.newPage();
    await page.goto("/settings?tab=booking-preferences");
    await dismissCookieBanner(page);
    const rolesTrigger = page.getByRole("combobox", { name: /Roles requiring approval/i });
    await expect(rolesTrigger).toBeVisible({ timeout: 20_000 });
    await rolesTrigger.click();
    const studentBox = page.getByRole("checkbox", { name: /^Student$/ });
    if (await studentBox.isChecked()) {
      await studentBox.click();
      await expect(page.getByText(/Approval rules updated/i)).toBeVisible({ timeout: 15_000 });
    }
    await studentBox.click();
    await expect(page.getByText(/Approval rules updated/i)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await ctx.close();
  });

  test("student sees Submit request when student role requires approval", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/student.json" });
    const page = await ctx.newPage();
    await page.goto("/me/book");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /^Submit request$/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toHaveCount(0);
    await ctx.close();
  });

  test("renter still sees Book when only student requires approval", async ({ browser, request }) => {
    const token = await ownerAuthToken(request);
    await patchBookingPolicy(request, token, { bookingApprovalRequiredRoles: ["student"] });
    const ctx = await browser.newContext({ storageState: ".auth/renter.json" });
    const page = await ctx.newPage();
    await page.goto("/me/book");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole("button", { name: /^Submit request$/i })).toHaveCount(0);
    await ctx.close();
  });

  test("owner desk create is not gated by member approval policy", async ({ browser, request }) => {
    const token = await ownerAuthToken(request);
    await patchBookingPolicy(request, token, { bookingApprovalRequiredRoles: ["student"] });
    const ctx = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await ctx.newPage();
    await page.goto("/schedule");
    await dismissCookieBanner(page);
    await page.getByRole("button", { name: /^Create$/i }).click();
    await page.getByRole("menuitem", { name: /New reservation/i }).click();
    await expect(page.getByText(/New reservation/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^Submit request$/i })).toHaveCount(0);
    await ctx.close();
  });

  test("student can reject path: submit then owner declines", async ({ browser }) => {
    const marker = `E2E-adv-decline-${Date.now()}`;
    const studentCtx = await browser.newContext({ storageState: ".auth/student.json" });
    const studentPage = await studentCtx.newPage();
    await studentPage.goto("/me/book");
    await dismissCookieBanner(studentPage);
    await expect(studentPage.getByRole("button", { name: /^Submit request$/i })).toBeVisible({
      timeout: 25_000,
    });
    await pickByPlaceholder(studentPage, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(studentPage);
    await studentPage.locator("#res-notes").fill(marker);
    await submitBookingRequest(studentPage);
    await expect(studentPage).toHaveURL(/tab=requests/, { timeout: 20_000 });
    await studentCtx.close();

    const ownerCtx = await browser.newContext({ storageState: ".auth/owner.json" });
    const ownerPage = await ownerCtx.newPage();
    await ownerPage.goto("/schedule");
    await dismissCookieBanner(ownerPage);
    await ownerPage.getByRole("button", { name: /Booking requests/i }).click();
    await ownerPage.getByRole("button", { name: /^Decline$/i }).first().click();
    await expect(ownerPage.getByText(/declined/i)).toBeVisible({ timeout: 15_000 });
    await ownerCtx.close();

    const studentCtx2 = await browser.newContext({ storageState: ".auth/student.json" });
    const studentPage2 = await studentCtx2.newPage();
    await studentPage2.goto("/me/schedule?tab=requests");
    await dismissCookieBanner(studentPage2);
    await expect(studentPage2.getByText(/declined|rejected/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await studentCtx2.close();
  });

  test("student can cancel a pending request from Requests tab", async ({ browser }) => {
    const studentCtx = await browser.newContext({ storageState: ".auth/student.json" });
    const studentPage = await studentCtx.newPage();
    await studentPage.goto("/me/book");
    await dismissCookieBanner(studentPage);
    await expect(studentPage.getByRole("button", { name: /^Submit request$/i })).toBeVisible({
      timeout: 25_000,
    });
    await pickByPlaceholder(studentPage, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(studentPage);
    await studentPage.locator("#res-notes").fill(`E2E-adv-cancel-${Date.now()}`);
    await submitBookingRequest(studentPage);
    await studentPage.getByRole("button", { name: /^Cancel request$/i }).first().click();
    await expect(studentPage.getByText(/cancelled|canceled/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await studentCtx.close();
  });
});

test.describe("ledger booking gate adversarial UI", () => {
  test.describe.configure({ mode: "serial" });
  let snapshot: OrgBookingSnapshot;
  let studentOrgUserId: number;

  test.beforeAll(async ({ request }) => {
    const token = await ownerAuthToken(request);
    snapshot = await readOrgBookingSnapshot(request, token);
    studentOrgUserId = await orgUserIdForEmail(request, token, ACCOUNTS.student);
    await patchLedger(request, token, true);
    await patchBookingPolicy(request, token, {
      bookingApprovalRequiredRoles: [],
      minimumBalanceCents: null,
      balanceMaximumCents: null,
      dispatchMinimumBalanceCents: null,
      dispatchBalanceMaximumCents: null,
    });
    await setLedgerBalance(request, token, studentOrgUserId, 0, "E2E ledger baseline");
  });

  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
    const token = await ownerAuthToken(request);
    await restoreOrgBookingSnapshot(request, token, snapshot);
  });

  test("owner sees ledger gate fields when ledger mode is on", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await ctx.newPage();
    await page.goto("/settings?tab=booking-preferences");
    await dismissCookieBanner(page);
    await expect(page.getByText(/Minimum credit to self-book/i)).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/Maximum owing to self-book/i)).toBeVisible();
    await expect(page.getByText(/Minimum credit to dispatch/i)).toBeVisible();
    await expect(page.getByText(/Maximum owing to dispatch/i)).toBeVisible();
    await ctx.close();
  });

  test("minimum credit blocks student self-book in UI", async ({ browser, request }) => {
    const token = await ownerAuthToken(request);
    await patchBookingPolicy(request, token, {
      minimumBalanceCents: 20_000,
      balanceMaximumCents: null,
    });
    await postLedgerAdjustment(request, token, studentOrgUserId, -20_000, "E2E below min credit");

    const ctx = await browser.newContext({ storageState: ".auth/student.json" });
    const page = await ctx.newPage();
    await page.goto("/me/book");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
      timeout: 25_000,
    });
    await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(page);
    const result = await attemptBookOrRequest(page, "book");
    expect(result.ok).toBeFalsy();
    expect(result.text).toMatch(/needs at least \$200 credit/i);
    await ctx.close();

    await postLedgerAdjustment(request, token, studentOrgUserId, 20_000, "E2E restore credit");
    await patchBookingPolicy(request, token, {
      minimumBalanceCents: null,
      balanceMaximumCents: null,
    });
  });

  test("maximum owing blocks student self-book in UI", async ({ browser, request }) => {
    const token = await ownerAuthToken(request);
    await patchBookingPolicy(request, token, {
      minimumBalanceCents: null,
      balanceMaximumCents: 5_000,
    });
    await postLedgerAdjustment(request, token, studentOrgUserId, -6_000, "E2E over max owing");

    const ctx = await browser.newContext({ storageState: ".auth/student.json" });
    const page = await ctx.newPage();
    await page.goto("/me/book");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
      timeout: 25_000,
    });
    await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(page);
    const result = await attemptBookOrRequest(page, "book");
    expect(result.ok).toBeFalsy();
    expect(result.text).toMatch(/\$50 owing/i);
    await ctx.close();

    await postLedgerAdjustment(request, token, studentOrgUserId, 6_000, "E2E restore owing");
    await patchBookingPolicy(request, token, {
      minimumBalanceCents: null,
      balanceMaximumCents: null,
    });
  });

  test("$0 minimum credit blocks booking while account is owing", async ({
    browser,
    request,
  }) => {
    const token = await ownerAuthToken(request);
    await patchBookingPolicy(request, token, {
      minimumBalanceCents: 0,
      balanceMaximumCents: null,
    });
    await setLedgerBalance(request, token, studentOrgUserId, -100, "E2E owing with $0 floor");

    const ctx = await browser.newContext({ storageState: ".auth/student.json" });
    const page = await ctx.newPage();
    await page.goto("/me/book");
    await dismissCookieBanner(page);
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
      timeout: 25_000,
    });
    await pickByPlaceholder(page, /Select resource/i, /N172TS/, /Search fleet/i);
    await pickNextBookableSlot(page);
    const result = await attemptBookOrRequest(page, "book");
    expect(result.ok).toBeFalsy();
    expect(result.text).toMatch(/needs at least \$0 credit/i);
    await ctx.close();

    await setLedgerBalance(request, token, studentOrgUserId, 0, "E2E restore after owing test");
    await patchBookingPolicy(request, token, {
      minimumBalanceCents: null,
      balanceMaximumCents: null,
    });
  });

  test("student URL tampering does not open desk booking-requests panel", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/student.json" });
    const page = await ctx.newPage();
    await page.goto("/schedule?panel=booking-requests");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { name: /Booking requests/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Approve$/i })).toHaveCount(0);
    await ctx.close();
  });

  test("owner deep link opens booking-requests desk panel", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await ctx.newPage();
    await page.goto("/schedule?panel=booking-requests");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { name: /Booking requests/i })).toBeVisible({
      timeout: 20_000,
    });
    await ctx.close();
  });

  test("owner deep link reopens booking-requests panel after dismiss", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ".auth/owner.json" });
    const page = await ctx.newPage();
    await page.goto("/schedule?panel=booking-requests");
    await dismissCookieBanner(page);
    await expect(page.getByRole("heading", { name: /Booking requests/i })).toBeVisible({
      timeout: 20_000,
    });
    const close = page.getByRole("button", { name: /Close details/i });
    if (await close.count()) {
      await close.first().click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(page).not.toHaveURL(/panel=booking-requests/);
    await expect(page.getByRole("heading", { name: /Booking requests/i })).toHaveCount(0);
    await page.goto("/schedule?panel=booking-requests");
    await expect(page.getByRole("heading", { name: /Booking requests/i })).toBeVisible({
      timeout: 20_000,
    });
    await ctx.close();
  });
});
