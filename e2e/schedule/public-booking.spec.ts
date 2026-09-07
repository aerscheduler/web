import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { apiBase, authAs } from "../helpers/slot-offers";
import { cleanupE2eReservations } from "../helpers/api";
import { dismissCookieBanner } from "../helpers/reservation-form";
import {
  OFFERING_SLUG,
  ORG_SLUG,
  PAUSED_SLUG,
  TAIL_RE,
  collectPageErrors,
  ensurePausedOffering,
  ensurePublicOffering,
  expectNoBootCrash,
  fillGuestForm,
  openGuestPage,
  pickAFutureSlot,
  pickSlotWithLabel,
  slotStartButtons,
  waitForConfirmUrl,
  waitForSlots,
  goToWeekTimesWithSlots,
  goToWeekCalendarWithSlots,
  pickHeatmapSlot,
  openHeatmapAircraftPicker,
  nestedOverflowScrollers,
  setPublicBookingEmbedHosts,
  serveEmbedParent,
  embedParentDocument,
  expectGuestFrameBlocked,
  bookablePlanes,
  fetchPublicSlots,
  restoreCalendarVisibility,
} from "../helpers/public-booking";

test.describe("public guest booking page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async ({ request }) => {
    await ensurePublicOffering(request);
    await ensurePausedOffering(request);
  });

  test("unknown offering is unavailable, not a blank shell", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/book/no-such-school/no-such-offering");
    await expect(page.getByRole("heading", { name: /this page is not available/i })).toBeVisible();
    expectNoBootCrash(errors);
  });

  test("paused offering is unavailable", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(`/book/${ORG_SLUG}/${PAUSED_SLUG}`);
    await expect(page.getByRole("heading", { name: /this page is not available/i })).toBeVisible();
    expectNoBootCrash(errors);
  });

  test("turning public booking off hides the guest page", async ({ page, request }) => {
    const owner = await authAs(request, ACCOUNTS.owner);
    const errors = collectPageErrors(page);
    try {
      const off = await request.patch(`${apiBase()}/organizations`, {
        headers: owner.headers,
        data: { publicBookingEnabled: false },
      });
      expect(off.ok(), await off.text()).toBeTruthy();
      await page.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
      await expect(page.getByRole("heading", { name: /this page is not available/i })).toBeVisible();
      expectNoBootCrash(errors);
    } finally {
      const on = await request.patch(`${apiBase()}/organizations`, {
        headers: owner.headers,
        data: { publicBookingEnabled: true, publicBookingSlug: ORG_SLUG },
      });
      expect(on.ok(), await on.text()).toBeTruthy();
    }
  });

  test("guest can open an enabled offering without signing in", async ({ page }) => {
    const errors = await openGuestPage(page);
    await expect(page.getByText(/pick a time and submit a request/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Day view" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Week calendar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Week times" })).toBeVisible();
    await expect(page.getByRole("button", { name: /submit request/i })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Schedule$/i })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /cookie preferences/i })).toHaveCount(0);
    expectNoBootCrash(errors);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("form stays hidden until a start time is picked, and consent is required", async ({
    page,
  }) => {
    const errors = await openGuestPage(page);
    await expect(page.getByRole("button", { name: /submit request/i })).toHaveCount(0);
    await pickAFutureSlot(page);
    const submit = page.getByRole("button", { name: /submit request/i });
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
    await fillGuestForm(page, {
      name: "E2E Guest",
      email: `e2e-consent-${Date.now()}@example.com`,
      notes: `E2E-public-consent-${Date.now()}`,
      consent: false,
    });
    await submit.click();
    await expect(page.getByRole("alert")).toContainText(/please confirm/i);
    await expect(page.getByRole("heading", { name: /check your email/i })).toHaveCount(0);
    expectNoBootCrash(errors);
  });

  test("guest can submit a request for a future slot", async ({ page, request }) => {
    const errors = await openGuestPage(page);
    await pickAFutureSlot(page);

    const marker = `E2E-public-${Date.now()}`;
    await fillGuestForm(page, {
      name: "E2E Guest",
      email: `e2e-guest-${Date.now()}@example.com`,
      notes: marker,
    });
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({
      timeout: 20_000,
    });
    expectNoBootCrash(errors);

    const owner = await authAs(request, ACCOUNTS.owner);
    const pending = await request.get(`${apiBase()}/booking-requests`, {
      headers: owner.headers,
    });
    expect(pending.ok(), await pending.text()).toBeTruthy();
    const rows = ((await pending.json()).data ?? []) as Array<{
      notes?: string | null;
    }>;
    expect(rows.some((row) => row.notes === marker)).toBeFalsy();
  });

  test("resubmitting the same email and time is refused without leaking why", async ({ page }) => {
    const errors = await openGuestPage(page);
    const slotStart = await pickAFutureSlot(page);
    const email = `e2e-dup-${Date.now()}@example.com`;
    await fillGuestForm(page, {
      name: "E2E Dup Guest",
      email,
      notes: `E2E-public-dup-${Date.now()}`,
    });
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({
      timeout: 20_000,
    });

    await page.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
    await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
      timeout: 20_000,
    });
    const sameSlot = page.locator(`[data-testid="slot-start"][data-start="${slotStart}"]`).first();
    if (await sameSlot.isVisible().catch(() => false)) {
      await sameSlot.click();
    } else {
      await pickAFutureSlot(page);
    }
    await fillGuestForm(page, {
      name: "E2E Dup Guest",
      email,
      notes: `E2E-public-dup2-${Date.now()}`,
    });
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByRole("alert")).toContainText(/no longer available/i);
    await expect(page.getByText(email)).toHaveCount(0);
    expectNoBootCrash(errors);
  });

  test("guest picker uses start times, hides overnight hours, and does not duplicate unlabeled times", async ({
    page,
  }) => {
    const errors = await openGuestPage(page);
    await goToWeekTimesWithSlots(page);
    await expect(page.getByRole("grid", { name: /week availability/i })).toHaveCount(0);
    const cols = page.getByTestId("slot-day-col");
    expect(await cols.count()).toBeGreaterThan(0);
    let anyTimes = 0;
    for (const col of await cols.all()) {
      const labels = (await col.getByTestId("slot-start").allTextContents()).map((t) => t.trim());
      anyTimes += labels.length;
      expect(labels.some((label) => / to /.test(label))).toBeFalsy();
      expect(labels.some((label) => /^(1|2|3|4|5):00 AM/.test(label))).toBeFalsy();
      expect(labels.some((label) => /^10:00 PM/.test(label))).toBeFalsy();
      expect(labels.some((label) => /^11:00 PM/.test(label))).toBeFalsy();
      expect(labels.some((label) => /^12:00 AM/.test(label))).toBeFalsy();
      expect(labels, "day column has duplicate start times").toEqual([...new Set(labels)]);
      expect(labels.some((label) => TAIL_RE.test(label))).toBeFalsy();
    }
    expect(anyTimes, "week times should list start buttons").toBeGreaterThan(0);
    expectNoBootCrash(errors);
  });

  test("Day, week calendar, and week times views are available", async ({ page }) => {
    const errors = await openGuestPage(page);
    await waitForSlots(page);
    await expect(page.getByRole("button", { name: "Day view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
    await page.getByRole("button", { name: "Week calendar" }).click();
    await waitForSlots(page);
    if (await page.getByText("No open times this week").isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /later/i }).click();
      await waitForSlots(page);
    }
    await expect(page.getByRole("grid", { name: /week availability/i })).toBeVisible();
    await goToWeekTimesWithSlots(page);
    await expect(page.getByTestId("slot-start").first()).toBeVisible({ timeout: 25_000 });
    expectNoBootCrash(errors);
  });

  test("day view keeps the month calendar in the rail and AerScheduler under the card", async ({
    page,
  }) => {
    const errors = await openGuestPage(page);
    await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible();
    const brand = page.getByRole("link", { name: "AerScheduler", exact: true });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute("href", "https://www.aerscheduler.com");
    const card = page.locator("div.max-w-5xl.rounded-xl.border.bg-card");
    await expect(card).toBeVisible();
    expectNoBootCrash(errors);
  });

  test("week calendar is full-bleed with the left rail, inner scroll, and bookable pills", async ({
    page,
  }) => {
    const errors = await openGuestPage(page);
    await goToWeekCalendarWithSlots(page);
    await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible();
    await expect(page.locator('[data-slot="calendar"]')).toBeVisible();
    await expect(page.locator("div.max-w-5xl.rounded-xl.border.bg-card")).toHaveCount(0);
    const grid = page.getByRole("grid", { name: /week availability/i });
    await expect(grid).toBeVisible();
    const box = await grid.boundingBox();
    expect(box?.width, "week calendar should use most of the window").toBeGreaterThan(700);
    const pill = page.getByTestId("heatmap-slot").first();
    await expect(pill).toBeVisible();
    await expect(pill).toHaveClass(/rounded-md/);
    const scroll = await page.evaluate(() => {
      const g = document.querySelector('[aria-label="Week availability"]');
      const scroller = g?.parentElement;
      if (!scroller) return null;
      return {
        overflowY: getComputedStyle(scroller).overflowY,
        pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 8,
      };
    });
    expect(scroll?.overflowY).toMatch(/auto|scroll/);
    expect(scroll?.pageScrolls).toBe(false);
    await pickHeatmapSlot(page);
    await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible();
    expectNoBootCrash(errors);
  });

  test("Earlier is locked on this week and Later unlocks it", async ({ page }) => {
    const errors = await openGuestPage(page);
    await page.getByRole("button", { name: "Week times" }).click();
    await waitForSlots(page);
    const earlier = page.getByRole("button", { name: /earlier/i });
    await expect(earlier).toBeDisabled();
    await page.getByRole("button", { name: /later/i }).click();
    await waitForSlots(page);
    await expect(earlier).toBeEnabled();
    await earlier.click();
    await waitForSlots(page);
    await expect(earlier).toBeDisabled();
    expectNoBootCrash(errors);
  });

  test("confirming email puts the guest in the desk queue, is idempotent, then desk can approve", async ({
    page,
    request,
    browser,
  }) => {
    const errors = await openGuestPage(page);
    await pickAFutureSlot(page);

    const marker = `E2E-public-confirm-${Date.now()}`;
    const email = `e2e-confirm-${Date.now()}@example.com`;
    await fillGuestForm(page, {
      name: "E2E Confirm Guest",
      email,
      notes: marker,
    });
    await page.getByRole("button", { name: /submit request/i }).click();
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({
      timeout: 20_000,
    });

    const confirmUrl = await waitForConfirmUrl(email);
    await page.goto(confirmUrl);
    await expect(page.getByRole("heading", { name: /request confirmed/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/front desk will review/i)).toBeVisible();

    await page.goto(confirmUrl);
    await expect(page.getByRole("heading", { name: /request confirmed/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/already confirmed/i)).toBeVisible();
    expectNoBootCrash(errors);

    const owner = await authAs(request, ACCOUNTS.owner);
    const pending = await request.get(`${apiBase()}/booking-requests`, {
      headers: owner.headers,
    });
    expect(pending.ok(), await pending.text()).toBeTruthy();
    const rows = ((await pending.json()).data ?? []) as Array<{
      notes?: string | null;
      guestName?: string | null;
      status?: string;
    }>;
    expect(rows.some((row) => row.notes === marker && row.status === "pending")).toBeTruthy();

    const ownerContext = await browser.newContext({ storageState: ".auth/owner.json" });
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto("/schedule");
    await dismissCookieBanner(ownerPage);
    await ownerPage.getByRole("button", { name: /Booking requests/i }).click();
    await dismissCookieBanner(ownerPage);
    await expect(ownerPage.getByText("E2E Confirm Guest")).toBeVisible({ timeout: 20_000 });
    await expect(ownerPage.getByText(marker)).toBeVisible();
    const [approveRes] = await Promise.all([
      ownerPage.waitForResponse(
        (res) =>
          res.request().method() === "POST" && /\/booking-requests\/\d+\/approve/.test(res.url()),
      ),
      ownerPage.getByRole("button", { name: /^Approve$/i }).first().click(),
    ]);
    expect(approveRes.ok(), await approveRes.text()).toBeTruthy();
    await expect(ownerPage.getByText(/approved and booked/i).first()).toBeVisible({ timeout: 20_000 });
    await ownerContext.close();

    await page.goto(confirmUrl);
    await expect(page.getByRole("heading", { name: /could not confirm/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/no longer be confirmed/i)).toBeVisible();

    await cleanupE2eReservations(request);
  });

  test("confirm page rejects a junk token", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/book/confirm?token=not-a-real-token");
    await expect(page.getByRole("heading", { name: /could not confirm/i })).toBeVisible();
    expectNoBootCrash(errors);
  });

  test("confirm page rejects a missing token", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/book/confirm");
    await expect(page.getByRole("heading", { name: /could not confirm/i })).toBeVisible();
    await expect(page.getByText(/missing its token/i)).toBeVisible();
    expectNoBootCrash(errors);
  });

  test("embed mode loads the picker without a cookie banner", async ({ page }) => {
    const errors = collectPageErrors(page);
    for (const query of ["embed=1", "embed=true"]) {
      await page.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}?${query}`);
      await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("dialog", { name: /cookie preferences/i })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Day view" })).toBeVisible();
    }
    expectNoBootCrash(errors);
  });

  test("cross-origin iframe is blocked when no websites are listed", async ({ page, request }) => {
    await setPublicBookingEmbedHosts(request, []);
    const hosted = await page.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
    expect(hosted?.headers()["content-security-policy"] ?? "").toMatch(/frame-ancestors 'self'/i);
    const bookUrl = `${page.url().split("?")[0]}?embed=1`;
    await page.goto(
      `data:text/html,<!doctype html><iframe id="aer" src="${bookUrl}" title="book" style="width:100%;height:900px;border:0"></iframe>`,
    );
    await expectGuestFrameBlocked(page);
  });

  test("same-origin iframe still loads with an empty allowlist", async ({ page, request }) => {
    await setPublicBookingEmbedHosts(request, []);
    await page.goto("/");
    const origin = new URL(page.url()).origin;
    const bookUrl = `${origin}/book/${ORG_SLUG}/${OFFERING_SLUG}?embed=1`;
    await page.setContent(
      `<!doctype html><iframe id="aer" src="${bookUrl}" title="book" style="width:100%;height:900px;border:0"></iframe>`,
    );
    const frame = page.frameLocator("iframe#aer");
    await expect(frame.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(frame.getByRole("dialog", { name: /cookie preferences/i })).toHaveCount(0);
  });

  test("allowlisted 127.0.0.1 parent can complete a request in the iframe", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const bookOrigin = new URL(page.url()).origin;
    const bookPageUrl = `${bookOrigin}/book/${ORG_SLUG}/${OFFERING_SLUG}`;
    const parent = await serveEmbedParent(embedParentDocument(bookPageUrl));
    try {
      await setPublicBookingEmbedHosts(request, [parent.origin]);
      await expect
        .poll(
          async () => {
            const hosted = await page.request.get(bookPageUrl);
            return hosted.headers()["content-security-policy"] ?? "";
          },
          { timeout: 20_000 },
        )
        .toContain(parent.origin);

      await page.goto(parent.origin);
      const submitted = page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            window.addEventListener("message", (event) => {
              const data = event.data as { source?: string; type?: string } | null;
              if (data?.source === "aerscheduler-book" && data.type === "request-submitted") {
                resolve(true);
              }
            });
          }),
      );
      const frame = page.frameLocator("iframe.aer-book-frame");
      await expect(frame.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(frame.getByRole("dialog", { name: /cookie preferences/i })).toHaveCount(0);
      await expect.poll(async () => page.locator("iframe.aer-book-frame").getAttribute("src")).toMatch(
        /parentOrigin=/,
      );
      await expect(page.locator("iframe.aer-book-frame")).toHaveAttribute(
        "sandbox",
        /allow-scripts.*allow-same-origin.*allow-forms/,
      );
      await pickAFutureSlot(frame);
      const marker = `E2E-public-embed-${Date.now()}`;
      await fillGuestForm(frame, {
        name: "E2E Embed Guest",
        email: `e2e-embed-${Date.now()}@example.com`,
        notes: marker,
      });
      await frame.getByRole("button", { name: /submit request/i }).click();
      await expect(frame.getByRole("heading", { name: /check your email/i })).toBeVisible({
        timeout: 20_000,
      });
      await expect(submitted).resolves.toBe(true);
      const minHeight = await page.locator("iframe.aer-book-frame").evaluate((el) => {
        return getComputedStyle(el).minHeight;
      });
      expect(parseFloat(minHeight) || 0, "resize should drop the 720px floor").toBeLessThan(300);
    } finally {
      await setPublicBookingEmbedHosts(request, []);
      await parent.close();
    }
  });

  test("unlisted 127.0.0.1 parent is blocked even with a spoofed parentOrigin", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    const bookOrigin = new URL(page.url()).origin;
    const bookPageUrl = `${bookOrigin}/book/${ORG_SLUG}/${OFFERING_SLUG}`;
    const parent = await serveEmbedParent(
      `<!doctype html><iframe id="aer" src="${bookPageUrl}?embed=1&parentOrigin=${encodeURIComponent(bookOrigin)}" title="book" style="width:100%;height:900px;border:0"></iframe>`,
    );
    try {
      await setPublicBookingEmbedHosts(request, ["https://www.example.com"]);
      await expect
        .poll(
          async () => {
            const hosted = await page.request.get(bookPageUrl);
            return hosted.headers()["content-security-policy"] ?? "";
          },
          { timeout: 20_000 },
        )
        .toContain("https://www.example.com");
      await page.goto(parent.origin);
      await expectGuestFrameBlocked(page);
    } finally {
      await setPublicBookingEmbedHosts(request, []);
      await parent.close();
    }
  });

  test("public offering JSON includes embedHosts and rejects wildcards", async ({ request }) => {
    await setPublicBookingEmbedHosts(request, []);
    const empty = await request.get(
      `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}`,
    );
    expect(empty.ok(), await empty.text()).toBeTruthy();
    expect((await empty.json()).data.organization.embedHosts).toEqual([]);

    const owner = await authAs(request, ACCOUNTS.owner);
    const bad = await request.patch(`${apiBase()}/organizations`, {
      headers: owner.headers,
      data: { publicBookingEmbedHosts: ["*.example.com"] },
    });
    expect(bad.status()).toBe(400);

    await setPublicBookingEmbedHosts(request, ["https://www.example.com"]);
    try {
      const listed = await request.get(
        `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}`,
      );
      expect(listed.ok(), await listed.text()).toBeTruthy();
      expect((await listed.json()).data.organization.embedHosts).toEqual([
        "https://www.example.com",
      ]);
    } finally {
      await setPublicBookingEmbedHosts(request, []);
    }
  });

  test("guest can pick an aircraft on open-slots visibility", async ({ page, request }) => {
    const offeringId = await ensurePublicOffering(request);
    const owner = await authAs(request, ACCOUNTS.owner);
    const planes = await bookablePlanes(request, owner.headers);
    expect(planes.length, "need two bookable planes").toBeGreaterThan(1);
    const first = planes[0]!;
    const second = planes[1]!;
    try {
      const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
        headers: owner.headers,
        data: {
          resourceIds: [first.id, second.id],
          allowResourceChoice: true,
        },
      });
      expect(patched.ok(), await patched.text()).toBeTruthy();
      await restoreCalendarVisibility(request);

      const slots = await request.get(
        `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/slots?startDate=${encodeURIComponent(new Date(Date.now() + 2 * 864e5).toISOString())}&endDate=${encodeURIComponent(new Date(Date.now() + 12 * 864e5).toISOString())}&limit=50`,
      );
      expect(slots.ok(), await slots.text()).toBeTruthy();
      const rows = ((await slots.json()).data ?? []) as Array<{
        resourceLabel?: string | null;
      }>;
      const labels = rows.map((row) => row.resourceLabel ?? "");
      expect(labels.some((label) => label.includes(first.tail))).toBeTruthy();
      expect(labels.some((label) => label.includes(second.tail))).toBeTruthy();

      const errors = await openGuestPage(page);
      await pickSlotWithLabel(page, new RegExp(second.tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      await expect(page.getByText(second.tail)).toBeVisible();
      const [posted] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === "POST" && /\/public\/book\/.+\/requests$/.test(req.url()),
        ),
        (async () => {
          await fillGuestForm(page, {
            name: "E2E Pick Tail",
            email: `e2e-pick-${Date.now()}@example.com`,
            notes: `E2E-public-pick-${Date.now()}`,
          });
          await page.getByRole("button", { name: /submit request/i }).click();
        })(),
      ]);
      expect(posted.postDataJSON().resourceId).toBe(second.id);
      await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible({
        timeout: 20_000,
      });
      expectNoBootCrash(errors);
    } finally {
      await ensurePublicOffering(request);
    }
  });

  test("pick-aircraft request holds that tail for a second guest", async ({ request }) => {
    const offeringId = await ensurePublicOffering(request);
    const owner = await authAs(request, ACCOUNTS.owner);
    const planes = await bookablePlanes(request, owner.headers);
    expect(planes.length, "need a bookable plane").toBeGreaterThan(0);
    const tail = planes[0]!;
    try {
      const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
        headers: owner.headers,
        data: { resourceIds: [tail.id], allowResourceChoice: true },
      });
      expect(patched.ok(), await patched.text()).toBeTruthy();
      const slots = await fetchPublicSlots(request);
      const slot = slots.find((row) => row.resourceId === tail.id);
      expect(slot, "expected a slot on the held tail").toBeTruthy();
      const stamp = Date.now();
      const first = await request.post(
        `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/requests`,
        {
          data: {
            name: `E2E-HOLD-A-${stamp}`,
            email: `e2e-hold-a-${stamp}@example.com`,
            notes: `E2E-public-hold-${stamp}`,
            start: slot!.start,
            end: slot!.end,
            timeZoneName: slot!.timeZone,
            resourceId: tail.id,
            consent: true,
          },
        },
      );
      expect(first.ok(), await first.text()).toBeTruthy();
      const second = await request.post(
        `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/requests`,
        {
          data: {
            name: `E2E-HOLD-B-${stamp}`,
            email: `e2e-hold-b-${stamp}@example.com`,
            notes: `E2E-public-hold-b-${stamp}`,
            start: slot!.start,
            end: slot!.end,
            timeZoneName: slot!.timeZone,
            resourceId: tail.id,
            consent: true,
          },
        },
      );
      expect(second.status(), await second.text()).toBe(409);
    } finally {
      await ensurePublicOffering(request);
    }
  });

  test("week calendar pick-aircraft stays open after the clock ticks", async ({ page, request }) => {
    const offeringId = await ensurePublicOffering(request);
    const owner = await authAs(request, ACCOUNTS.owner);
    const planes = await bookablePlanes(request, owner.headers);
    expect(planes.length, "need two bookable planes").toBeGreaterThan(1);
    const first = planes[0]!;
    const second = planes[1]!;
    try {
      const patched = await request.patch(`${apiBase()}/booking-offerings/${offeringId}`, {
        headers: owner.headers,
        data: {
          resourceIds: [first.id, second.id],
          allowResourceChoice: true,
        },
      });
      expect(patched.ok(), await patched.text()).toBeTruthy();
      await restoreCalendarVisibility(request);
      await page.clock.install();
      const errors = await openGuestPage(page);
      await openHeatmapAircraftPicker(page);
      await page.clock.fastForward(35_000);
      await expect(page.getByText(/pick an aircraft/i)).toBeVisible();
      const tailRe = new RegExp(second.tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      await slotStartButtons(page).filter({ hasText: tailRe }).first().click();
      await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible({ timeout: 10_000 });
      const [posted] = await Promise.all([
        page.waitForRequest(
          (req) => req.method() === "POST" && /\/public\/book\/.+\/requests$/.test(req.url()),
        ),
        (async () => {
          await fillGuestForm(page, {
            name: "E2E Heatmap Tail",
            email: `e2e-heat-${Date.now()}@example.com`,
            notes: `E2E-public-heat-${Date.now()}`,
          });
          await page.getByRole("button", { name: /submit request/i }).click();
        })(),
      ]);
      expect(posted.postDataJSON().resourceId).toBe(second.id);
      expectNoBootCrash(errors);
    } finally {
      await ensurePublicOffering(request);
    }
  });
});

test.describe("public guest booking on a phone", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });

  test("phone only shows the day picker, stacked calendar then times", async ({ page }) => {
    const errors = await openGuestPage(page);
    await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Day view" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Week calendar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Week times" })).toHaveCount(0);
    const calendar = page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();
    const calBox = await calendar.boundingBox();
    expect(calBox?.width, "calendar should use the phone width").toBeGreaterThan(300);
    await waitForSlots(page);
    if ((await page.getByTestId("slot-start").count()) === 0) {
      const availableDay = page.locator('[data-slot="calendar"] button[data-available="true"]').first();
      if (await availableDay.isVisible().catch(() => false)) await availableDay.click();
      await waitForSlots(page);
    }
    await expect(page.getByTestId("slot-start").first()).toBeVisible();
    const nested = await nestedOverflowScrollers(page, '[data-testid="slot-start"]');
    expect(nested, `phone should not nest a scroller: ${nested.join(", ")}`).toEqual([]);
    await pickAFutureSlot(page);
    const name = page.getByRole("textbox", { name: "Name" });
    await expect(name).toBeVisible();
    const nameBox = await name.boundingBox();
    expect(nameBox?.height, "name field should be thumb-sized").toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: /submit request/i })).toBeVisible();
    await expect(page.locator("div.max-w-5xl.rounded-xl.border.bg-card")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "AerScheduler", exact: true })).toBeVisible();
    expectNoBootCrash(errors);
  });
});

test.describe("public guest booking with an owner cookie", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("owner cookie does not 401 or crash the public guest page", async ({ page, request }) => {
    await ensurePublicOffering(request);
    const errors = collectPageErrors(page);
    await page.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
    await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: /^Schedule$/i })).toHaveCount(0);
    await expect(page.getByText("E2E Discovery")).toBeVisible();
    expectNoBootCrash(errors);
    expect(
      errors.filter((m) => /401|unauthorized|does not provide an export/i.test(m)),
    ).toEqual([]);
  });
});

test.describe("public booking settings", () => {
  test("owner sees the public-link controls and can copy the guest URL", async ({
    page,
    request,
  }) => {
    await ensurePublicOffering(request);
    const errors = collectPageErrors(page);
    const settingsRes = await page.goto("/settings?tab=booking-offerings");
    expect(settingsRes?.headers()["content-security-policy"] ?? "").toMatch(/frame-ancestors 'self'/i);
    await dismissCookieBanner(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await expect(page.getByText("Public booking links")).toBeVisible({ timeout: 20_000 });
    await dismissCookieBanner(page);
    await expect(
      page.getByText(/share a page for guests who do not have an account/i),
    ).toBeVisible();
    const allowPublic = page.getByRole("switch", { name: /allow public requests/i });
    await expect(allowPublic).toBeVisible();
    try {
      await expect(allowPublic).toBeChecked({ timeout: 8_000 });
    } catch {
      if (!(await allowPublic.isChecked())) await allowPublic.click();
      await expect(allowPublic).toBeChecked({ timeout: 20_000 });
    }
    await expect(page.getByLabel(/link slug/i)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /websites that may embed/i })).toBeVisible();
    const hosts = page.getByRole("textbox", { name: /websites that may embed/i });
    try {
      await hosts.click();
      await hosts.fill("www.example.com");
      await page.getByLabel(/link slug/i).click();
      await expect(page.getByText(/embed websites updated/i)).toBeVisible({ timeout: 10_000 });
      await expect(hosts).toHaveValue("https://www.example.com");
      await hosts.click();
      await hosts.fill("");
      await page.getByLabel(/link slug/i).click();
      await expect(page.getByText(/embed websites updated/i).last()).toBeVisible({ timeout: 10_000 });
    } finally {
      await setPublicBookingEmbedHosts(request, []);
    }
    await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
    await expect(page.getByRole("menuitem", { name: /copy public link/i })).toBeVisible();
    await page.getByRole("menuitem", { name: /copy public link/i }).click();
    await expect(page.getByText(/public link copied/i)).toBeVisible({ timeout: 10_000 });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(new RegExp(`/book/${ORG_SLUG}/${OFFERING_SLUG}$`));
    await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
    await page.getByRole("menuitem", { name: /copy embed code/i }).click();
    await expect(page.getByText(/embed code copied/i)).toBeVisible({ timeout: 10_000 });
    const embed = await page.evaluate(() => navigator.clipboard.readText());
    expect(embed).toContain(`?embed=1`);
    expect(embed).toContain("aerscheduler-book");
    expect(embed).toContain("parentOrigin=");
    expect(embed).toContain("sandbox=");
    expect(embed).not.toContain("min-height:720px");
    await page.getByRole("button", { name: /actions for e2e discovery/i }).click();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("menuitem", { name: /open public link/i }).click();
    const guestPage = await popupPromise;
    await expect(guestPage).toHaveURL(new RegExp(`/book/${ORG_SLUG}/${OFFERING_SLUG}`));
    await expect(guestPage.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
      timeout: 20_000,
    });
    await guestPage.close();
    expectNoBootCrash(errors);
  });
});

test.describe("member book is unchanged", () => {
  test.use({ storageState: ".auth/student.json" });

  test("student /me/book still uses reservation types, not offerings", async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto("/me/book");
    await expect(page.getByRole("button", { name: /^Book reservation$/i })).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("E2E Discovery")).toHaveCount(0);
    await expect(page.getByText(/pick a time and submit a request/i)).toHaveCount(0);
    expectNoBootCrash(errors);
  });
});
