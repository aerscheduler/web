import { test, expect, type Page } from "@playwright/test";
import { ACCOUNTS, type AccountRole } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import { apiBase, authAs } from "../helpers/slot-offers";
import { dismissCookieBanner } from "../helpers/reservation-form";
import {
  OFFERING_SLUG,
  ORG_SLUG,
  TAIL_RE,
  audienceSelect,
  approveGuestFromCalendar,
  bookablePlanes,
  collectPageErrors,
  ensurePublicOffering,
  expectNoBootCrash,
  fetchOfferingSlots,
  fetchPublicSlots,
  openBookingOfferingsSettings,
  openGuestPage,
  openOfferingEdit,
  rejectE2ePublicGuests,
  restoreCalendarVisibility,
  saveOfferingEdit,
  seedConfirmedGuest,
  setAudienceVisibility,
  slotLabels,
  waitForSlots,
} from "../helpers/public-booking";

const SETTINGS_ROLES: AccountRole[] = ["owner", "admin"];
const SETTINGS_DENIED: AccountRole[] = [
  "dispatcher",
  "instructor",
  "student",
  "renter",
  "technician",
];
const STAFF_ROLES: AccountRole[] = ["owner", "admin", "dispatcher"];
const FLYING_ROLES: AccountRole[] = ["instructor", "student", "renter"];
const MEMBER_ROLES: AccountRole[] = ["instructor", "student", "renter", "technician"];

const VISIBILITY_AUDIENCES = [
  "Guests (public booking)",
  "Students",
  "Renters",
  "Instructors",
  "Other members",
] as const;

async function assertNoOfferingsOnMeBook(page: Page) {
  await expect(page.getByText("E2E Discovery")).toHaveCount(0);
  await expect(page.getByText(/pick a time and submit a request/i)).toHaveCount(0);
}

for (const role of SETTINGS_ROLES) {
  test.describe(`settings surface (${role})`, () => {
    test.use({ storageState: `.auth/${role}.json` });

    test(`${role} can open Booking offerings and see every settings card`, async ({
      page,
      request,
    }) => {
      await ensurePublicOffering(request);
      const errors = await openBookingOfferingsSettings(page);
      await dismissCookieBanner(page);
      await expect(page.getByRole("switch", { name: /allow public requests/i })).toBeVisible();
      await expect(page.getByLabel(/link slug/i)).toBeVisible();
      await expect(page.getByText("Calendar visibility")).toBeVisible();
      for (const label of VISIBILITY_AUDIENCES) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
        await expect(audienceSelect(page, label)).toBeVisible();
      }
      await expect(page.getByRole("button", { name: /add offering/i })).toBeVisible();
      await expect(page.getByText("E2E Discovery")).toBeVisible();
      await expect(page.getByText("Active").first()).toBeVisible();
      await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
      await expect(page.getByRole("menuitem", { name: /^Edit$/i })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /copy public link/i })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /copy embed code/i })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: /pause offering/i })).toBeVisible();
      await page.keyboard.press("Escape");
      expectNoBootCrash(errors);
    });
  });
}

test.describe("admin can write offering settings", () => {
  test.use({ storageState: ".auth/admin.json" });

  test.afterAll(async ({ request }) => {
    await ensurePublicOffering(request);
  });

  test("admin can save offering copy that guests see", async ({ page, browser, request }) => {
    await ensurePublicOffering(request);
    const marker = `E2E-admin-desc-${Date.now()}`;
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    await page.getByLabel(/^Description$/i).fill(marker);
    await saveOfferingEdit(page);

    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await openGuestPage(guestPage);
      await expect(guestPage.getByText(marker)).toBeVisible();
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await ensurePublicOffering(request);
    }
  });
});

for (const role of SETTINGS_DENIED) {
  test.describe(`settings denied (${role})`, () => {
    test.use({ storageState: `.auth/${role}.json` });

    test(`${role} cannot open /settings`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto("/settings?tab=booking-offerings");
      await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
      await expect(page.getByText("Public booking links")).toHaveCount(0);
      await expect(page.getByText("Calendar visibility")).toHaveCount(0);
      expectNoBootCrash(errors);
    });
  });
}

for (const role of STAFF_ROLES) {
  test.describe(`staff /me/book (${role})`, () => {
    test.use({ storageState: `.auth/${role}.json` });

    test(`${role} /me/book is the staff empty state, not offerings`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto("/me/book");
      await expect(page.getByText(/add a flying role to book yourself/i)).toBeVisible({
        timeout: 20_000,
      });
      await assertNoOfferingsOnMeBook(page);
      expectNoBootCrash(errors);
    });
  });
}

for (const role of FLYING_ROLES) {
  test.describe(`flying member /me/book (${role})`, () => {
    test.use({ storageState: `.auth/${role}.json` });

    test(`${role} /me/book still uses reservation types, not offerings`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto("/me/book");
      await dismissCookieBanner(page);
      await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
        timeout: 25_000,
      });
      await assertNoOfferingsOnMeBook(page);
      expectNoBootCrash(errors);
    });
  });
}

test.describe("technician /me/book", () => {
  test.use({ storageState: ".auth/technician.json" });

  test("technician books maintenance, not a guest offering", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/me/book");
    await dismissCookieBanner(page);
    await expect(page.getByText(/schedule maintenance and take an aircraft off the line/i)).toBeVisible({
      timeout: 20_000,
    });
    await assertNoOfferingsOnMeBook(page);
    expectNoBootCrash(errors);
  });
});

test.describe.serial("desk queue by role", () => {
  let guest: { name: string; notes: string };

  test.beforeAll(async ({ request }) => {
    guest = await seedConfirmedGuest(request);
  });

  test.afterAll(async ({ request }) => {
    await rejectE2ePublicGuests(request);
    await cleanupE2eReservations(request);
  });

  for (const role of MEMBER_ROLES) {
    test.describe(`${role} schedule`, () => {
      test.use({ storageState: `.auth/${role}.json` });

      test(`${role} does not see Booking requests even with a pending guest`, async ({
        page,
      }) => {
        const errors = collectPageErrors(page);
        await page.goto("/schedule");
        await dismissCookieBanner(page);
        await expect(page.getByRole("heading", { name: /the ramp/i })).toBeVisible({
          timeout: 20_000,
        });
        await expect(page.getByRole("button", { name: /Booking requests/i })).toHaveCount(0);
        expectNoBootCrash(errors);
      });
    });
  }

  test.describe("dispatcher desk", () => {
    test.use({ storageState: ".auth/dispatcher.json" });

    test("dispatcher can open the queue and decline a guest request", async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.goto("/schedule");
      await dismissCookieBanner(page);
      await page.getByRole("button", { name: /Booking requests/i }).click();
      const row = page.locator("li").filter({ hasText: guest.name });
      await expect(row.getByText(guest.notes)).toBeVisible({ timeout: 20_000 });
      await row.getByRole("button", { name: /Decline/i }).click();
      await expect(page.getByText(/request declined/i)).toBeVisible({ timeout: 20_000 });
      expectNoBootCrash(errors);
    });

    test("dispatcher can approve a guest request from the calendar", async ({ page, request }) => {
      const next = await seedConfirmedGuest(request, {
        name: `E2E-ROLE-DISPATCH-${Date.now()}`,
        notes: `E2E-public-role-dispatch-${Date.now()}`,
      });
      const errors = collectPageErrors(page);
      await approveGuestFromCalendar(page, next.name);
      expectNoBootCrash(errors);
    });
  });

  test.describe("admin desk", () => {
    test.use({ storageState: ".auth/admin.json" });

    test("admin can approve a guest request from the calendar", async ({ page, request }) => {
      const next = await seedConfirmedGuest(request, {
        name: `E2E-ROLE-ADMIN-${Date.now()}`,
        notes: `E2E-public-role-admin-${Date.now()}`,
      });
      const errors = collectPageErrors(page);
      await approveGuestFromCalendar(page, next.name);
      expectNoBootCrash(errors);
    });
  });

  test.describe("owner desk", () => {
    test.use({ storageState: ".auth/owner.json" });

    test("owner can approve a guest request from the calendar", async ({ page, request }) => {
      const next = await seedConfirmedGuest(request, {
        name: `E2E-ROLE-OWNER-${Date.now()}`,
        notes: `E2E-public-role-owner-${Date.now()}`,
      });
      const errors = collectPageErrors(page);
      await approveGuestFromCalendar(page, next.name);
      expectNoBootCrash(errors);
    });
  });
});

test.describe("calendar visibility settings", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await restoreCalendarVisibility(request);
    await ensurePublicOffering(request);
  });

  test("guest tails follow pick-aircraft, and Students visibility does not leak onto the guest page", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    const pickAircraft = page.getByRole("switch", { name: /let requester pick aircraft/i });
    if (!(await pickAircraft.isChecked())) await pickAircraft.click();
    await saveOfferingEdit(page);

    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await setAudienceVisibility(page, "Guests (public booking)", "Open slots only");
      await openGuestPage(guestPage);
      const labeled = await slotLabels(guestPage);
      expect(labeled.some((label) => TAIL_RE.test(label))).toBeTruthy();

      await setAudienceVisibility(page, "Students", "Full schedule");
      await guestPage.reload();
      await expect(guestPage.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
        timeout: 20_000,
      });
      const stillLabeled = await slotLabels(guestPage);
      expect(stillLabeled.some((label) => TAIL_RE.test(label))).toBeTruthy();

      await openOfferingEdit(page);
      const pickAgain = page.getByRole("switch", { name: /let requester pick aircraft/i });
      if (await pickAgain.isChecked()) await pickAgain.click();
      await saveOfferingEdit(page);
      await guestPage.reload();
      await expect(guestPage.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
        timeout: 20_000,
      });
      const unlabeled = await slotLabels(guestPage);
      expect(unlabeled.some((label) => TAIL_RE.test(label))).toBeFalsy();
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await restoreCalendarVisibility(request);
      await ensurePublicOffering(request);
    }
  });
});

test.describe("offering settings from the UI", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await ensurePublicOffering(request);
  });

  test("edit form exposes duration, notice, horizon, assignment, and requester choices", async ({
    page,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    await expect(page.getByLabel(/^Name$/i)).toHaveValue("E2E Discovery");
    await expect(page.getByLabel(/public slug/i)).toHaveValue(OFFERING_SLUG);
    await expect(page.getByRole("switch", { name: /^Active$/i })).toBeChecked();
    await expect(page.getByText("Reservation type")).toBeVisible();
    await expect(page.getByText("Assignment")).toBeVisible();
    await expect(page.getByText("Fixed duration")).toBeVisible();
    await expect(page.getByText("Minimum notice")).toBeVisible();
    await expect(page.getByText("Booking horizon")).toBeVisible();
    await expect(page.getByText("Eligible aircraft", { exact: true })).toBeVisible();
    await expect(page.getByText("Eligible instructors", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch", { name: /let requester pick aircraft/i })).toBeVisible();
    await expect(page.getByRole("switch", { name: /let requester pick instructor/i })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: /let requester pick location/i })).toHaveCount(0);
    await expect(page.getByLabel(/how this offering is billed/i)).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();
    expectNoBootCrash(errors);
  });

  test("pausing from the offering menu hides the guest page until it is activated", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
      await page.getByRole("menuitem", { name: /pause offering/i }).click();
      await expect(page.getByText(/"E2E Discovery" paused/i)).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
      await expect(page.getByRole("menuitem", { name: /copy public link/i })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: /activate offering/i })).toBeVisible();
      await page.keyboard.press("Escape");

      await guestPage.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
      await expect(guestPage.getByRole("heading", { name: /this page is not available/i })).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
      await page.getByRole("menuitem", { name: /activate offering/i }).click();
      await expect(page.getByText(/"E2E Discovery" activated/i)).toBeVisible({ timeout: 15_000 });

      await openGuestPage(guestPage);
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await ensurePublicOffering(request);
    }
  });

  test("a 7-day booking horizon leaves later weeks empty for guests", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    await page.getByRole("combobox", { name: "Booking horizon" }).click();
    await page.getByRole("option", { name: "7 days", exact: true }).click();
    await saveOfferingEdit(page);

    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await openGuestPage(guestPage);
      await guestPage.getByRole("button", { name: "Week times" }).click();
      await waitForSlots(guestPage);
      await guestPage.getByRole("button", { name: /later/i }).click();
      await waitForSlots(guestPage);
      await guestPage.getByRole("button", { name: /later/i }).click();
      await waitForSlots(guestPage);
      await expect(guestPage.getByText("No open times this week")).toBeVisible();
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await ensurePublicOffering(request);
    }
  });

  test("a 48-hour minimum notice hides near-term slots for guests", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    await page.getByRole("combobox", { name: "Minimum notice" }).click();
    await page.getByRole("option", { name: "48 hours", exact: true }).click();
    await saveOfferingEdit(page);

    const soonStart = new Date().toISOString();
    const soonEnd = new Date(Date.now() + 36 * 3600e3).toISOString();
    const near = await request.get(
      `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/slots?startDate=${encodeURIComponent(soonStart)}&endDate=${encodeURIComponent(soonEnd)}&limit=50`,
    );
    expect(near.ok(), await near.text()).toBeTruthy();
    expect((((await near.json()).data ?? []) as unknown[]).length).toBe(0);

    const laterStart = new Date(Date.now() + 3 * 864e5).toISOString();
    const laterEnd = new Date(Date.now() + 10 * 864e5).toISOString();
    const later = await request.get(
      `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/slots?startDate=${encodeURIComponent(laterStart)}&endDate=${encodeURIComponent(laterEnd)}&limit=50`,
    );
    expect(later.ok(), await later.text()).toBeTruthy();
    expect((((await later.json()).data ?? []) as unknown[]).length).toBeGreaterThan(0);

    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await openGuestPage(guestPage);
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await ensurePublicOffering(request);
    }
  });

  test("let requester pick aircraft labels tails even on open slots only", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    await restoreCalendarVisibility(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await setAudienceVisibility(page, "Guests (public booking)", "Open slots only");

    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await openGuestPage(guestPage);
      const unlabeled = await slotLabels(guestPage);
      expect(unlabeled.some((label) => TAIL_RE.test(label))).toBeFalsy();

      await openOfferingEdit(page);
      const pickAircraft = page.getByRole("switch", { name: /let requester pick aircraft/i });
      await expect(pickAircraft).not.toBeChecked();
      await pickAircraft.click();
      await saveOfferingEdit(page);
      await guestPage.reload();
      await expect(guestPage.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
        timeout: 20_000,
      });
      const labeled = await slotLabels(guestPage);
      expect(labeled.some((label) => TAIL_RE.test(label))).toBeTruthy();
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await restoreCalendarVisibility(request);
      await ensurePublicOffering(request);
    }
  });

  test("turning Allow public requests off from settings hides the guest page", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    const allowPublic = page.getByRole("switch", { name: /allow public requests/i });
    await expect(allowPublic).toBeChecked();
    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await allowPublic.click();
      await expect(page.getByText(/public booking updated/i)).toBeVisible({ timeout: 15_000 });
      await expect(allowPublic).not.toBeChecked();
      await guestPage.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
      await expect(guestPage.getByRole("heading", { name: /this page is not available/i })).toBeVisible({
        timeout: 20_000,
      });
      await allowPublic.click();
      await expect(page.getByText(/public booking updated/i)).toBeVisible({ timeout: 15_000 });
      await expect(allowPublic).toBeChecked();
      await openGuestPage(guestPage);
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await ensurePublicOffering(request);
    }
  });
});

test.describe("settings API by role", () => {
  test("owner and admin can list offerings and change visibility; everyone else is 403", async ({
    request,
  }) => {
    const offeringId = await ensurePublicOffering(request);

    for (const role of SETTINGS_ROLES) {
      const session = await authAs(request, ACCOUNTS[role]);
      const listed = await request.get(`${apiBase()}/booking-offerings?limit=50`, {
        headers: session.headers,
      });
      expect(listed.status(), `${role} list offerings: ${await listed.text()}`).toBe(200);
      const visibility = await request.patch(`${apiBase()}/booking-offerings/visibility`, {
        headers: session.headers,
        data: { guestLevel: "slots_only" },
      });
      expect(visibility.status(), `${role} patch visibility: ${await visibility.text()}`).toBe(200);
      const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
        headers: session.headers,
        data: { description: `E2E-${role}-ok` },
      });
      expect(patched.status(), `${role} patch offering: ${await patched.text()}`).toBe(200);
    }

    for (const role of SETTINGS_DENIED) {
      const session = await authAs(request, ACCOUNTS[role]);
      const listed = await request.get(`${apiBase()}/booking-offerings?limit=50`, {
        headers: session.headers,
      });
      expect(listed.status(), `${role} list offerings`).toBe(403);
      const visibility = await request.patch(`${apiBase()}/booking-offerings/visibility`, {
        headers: session.headers,
        data: { guestLevel: "full" },
      });
      expect(visibility.status(), `${role} patch visibility`).toBe(403);
      const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
        headers: session.headers,
        data: { active: false },
      });
      expect(patched.status(), `${role} patch offering`).toBe(403);
    }

    await ensurePublicOffering(request);
    await restoreCalendarVisibility(request);
  });

  test("only desk roles can list pending booking requests", async ({ request }) => {
    await ensurePublicOffering(request);
    for (const role of STAFF_ROLES) {
      const session = await authAs(request, ACCOUNTS[role]);
      const res = await request.get(`${apiBase()}/booking-requests`, { headers: session.headers });
      expect(res.status(), `${role} list booking-requests: ${await res.text()}`).toBe(200);
    }
    for (const role of MEMBER_ROLES) {
      const session = await authAs(request, ACCOUNTS[role]);
      const res = await request.get(`${apiBase()}/booking-requests`, { headers: session.headers });
      expect(res.status(), `${role} list booking-requests`).toBe(403);
      const approve = await request.post(`${apiBase()}/booking-requests/1/approve`, {
        headers: session.headers,
        data: {},
      });
      expect(approve.status(), `${role} approve`).toBe(403);
      const convert = await request.post(`${apiBase()}/booking-requests/1/convert`, {
        headers: session.headers,
        data: { role: "student" },
      });
      expect(convert.status(), `${role} convert`).toBe(403);
    }
  });
});

test.describe("offering setting effects", () => {
  test.use({ storageState: ".auth/owner.json" });

  test.afterAll(async ({ request }) => {
    await restoreCalendarVisibility(request);
    await ensurePublicOffering(request);
  });

  test("a 90-minute fixed duration makes guest slots 90 minutes long", async ({
    page,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    await page.getByRole("combobox", { name: "Fixed duration" }).click();
    await page.getByRole("option", { name: "1 hour 30 minutes", exact: true }).click();
    await saveOfferingEdit(page);

    const slots = await fetchPublicSlots(request);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(
        new Date(slot.end).getTime() - new Date(slot.start).getTime(),
        `${slot.start} → ${slot.end}`,
      ).toBe(90 * 60 * 1000);
    }
    expectNoBootCrash(errors);
  });

  test("eligible aircraft limits labeled guest slots to that tail", async ({ request }) => {
    const offeringId = await ensurePublicOffering(request);
    const owner = await authAs(request, ACCOUNTS.owner);
    const planes = await bookablePlanes(request, owner.headers);
    expect(planes.length, "need two bookable planes").toBeGreaterThan(1);
    const kept = planes[0]!;
    const dropped = planes[1]!;

    const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
      headers: owner.headers,
      data: { resourceIds: [kept.id], allowResourceChoice: true },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();
    const vis = await request.patch(`${apiBase()}/booking-offerings/visibility`, {
      headers: owner.headers,
      data: { guestLevel: "slots_only" },
    });
    expect(vis.ok(), await vis.text()).toBeTruthy();

    const slots = await fetchPublicSlots(request);
    expect(slots.length).toBeGreaterThan(0);
    const labels = slots.map((slot) => slot.resourceLabel ?? "");
    expect(labels.some((label) => label.includes(kept.tail))).toBeTruthy();
    expect(labels.some((label) => label.includes(dropped.tail))).toBeFalsy();
  });

  test("requester instructor and location toggles do not appear on the guest page", async ({
    page,
    browser,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = await openBookingOfferingsSettings(page);
    await dismissCookieBanner(page);
    await openOfferingEdit(page);
    await expect(page.getByRole("switch", { name: /let requester pick instructor/i })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: /let requester pick location/i })).toHaveCount(0);
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    const guestCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guestPage = await guestCtx.newPage();
    try {
      await openGuestPage(guestPage);
      await expect(guestPage.getByRole("heading", { name: "E2E Discovery" })).toBeVisible();
      await expect(guestPage.getByText(/pick instructor/i)).toHaveCount(0);
      await expect(guestPage.getByLabel(/instructor/i)).toHaveCount(0);
      await expect(guestPage.getByText(/pick location/i)).toHaveCount(0);
      await expect(guestPage.getByLabel(/^Location$/i)).toHaveCount(0);
      expectNoBootCrash(errors);
    } finally {
      await guestCtx.close();
      await ensurePublicOffering(request);
    }
  });

  test("assignment mode member-picks still lets guests request without choosing a tail", async ({
    request,
  }) => {
    const offeringId = await ensurePublicOffering(request);
    const owner = await authAs(request, ACCOUNTS.owner);
    const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
      headers: owner.headers,
      data: { assignmentMode: "member_picks_resource", allowResourceChoice: false },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();

    const slots = await fetchPublicSlots(request);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => !slot.resourceLabel)).toBeTruthy();

    const slot = slots[0]!;
    const submit = await request.post(
      `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/requests`,
      {
        data: {
          name: `E2E-ASSIGN-${Date.now()}`,
          email: `e2e-assign-${Date.now()}@example.com`,
          notes: `E2E-public-assign-${Date.now()}`,
          start: slot.start,
          end: slot.end,
          timeZoneName: slot.timeZone,
          consent: true,
        },
      },
    );
    expect(submit.ok(), await submit.text()).toBeTruthy();
  });
});

test.describe("calendar visibility by member role", () => {
  test.afterAll(async ({ request }) => {
    await restoreCalendarVisibility(request);
    await ensurePublicOffering(request);
  });

  test("slot labels follow that role's audience, not Guests or Students", async ({ request }) => {
    const offeringId = await ensurePublicOffering(request);
    const owner = await authAs(request, ACCOUNTS.owner);
    const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
      headers: owner.headers,
      data: { allowResourceChoice: true },
    });
    expect(patched.ok(), await patched.text()).toBeTruthy();
    const vis = await request.patch(`${apiBase()}/booking-offerings/visibility`, {
      headers: owner.headers,
      data: {
        guestLevel: "full",
        studentLevel: "slots_only",
        renterLevel: "blocked_anonymous",
        instructorLevel: "full",
        memberLevel: "slots_only",
      },
    });
    expect(vis.ok(), await vis.text()).toBeTruthy();

    async function labelsFor(role: AccountRole) {
      const session = await authAs(request, ACCOUNTS[role]);
      const res = await fetchOfferingSlots(request, session.headers, offeringId);
      expect(res.ok(), `${role} offering slots: ${await res.text()}`).toBeTruthy();
      const slots = ((await res.json()).data ?? []) as Array<{ resourceLabel?: string | null }>;
      expect(slots.length, `${role} should still see times`).toBeGreaterThan(0);
      return slots.map((slot) => slot.resourceLabel ?? "");
    }

    const student = await labelsFor("student");
    const renter = await labelsFor("renter");
    const instructor = await labelsFor("instructor");
    const technician = await labelsFor("technician");
    const dispatcher = await labelsFor("dispatcher");

    expect(student.some((label) => TAIL_RE.test(label))).toBeTruthy();
    expect(renter.some((label) => TAIL_RE.test(label))).toBeTruthy();
    expect(technician.some((label) => TAIL_RE.test(label))).toBeTruthy();
    expect(instructor.some((label) => TAIL_RE.test(label))).toBeTruthy();
    expect(dispatcher.some((label) => TAIL_RE.test(label))).toBeTruthy();

    const deskAssigns = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
      headers: owner.headers,
      data: { allowResourceChoice: false },
    });
    expect(deskAssigns.ok(), await deskAssigns.text()).toBeTruthy();
    const studentHidden = await labelsFor("student");
    expect(studentHidden.some((label) => TAIL_RE.test(label))).toBeFalsy();
  });
});
