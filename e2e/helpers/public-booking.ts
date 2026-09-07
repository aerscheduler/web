import { expect, type APIRequestContext, type Page } from "@playwright/test";
import http from "node:http";
import { publicBookingIframeSnippet } from "../../src/components/public-booking/embed-snippets";
import { ACCOUNTS } from "./env";
import { dismissCookieBanner } from "./reservation-form";
import { apiBase, authAs, findBookablePlane } from "./slot-offers";
import { readConfirmUrlForEmail } from "./public-booking-token";

export const OFFERING_SLUG = "e2e-discovery";
export const PAUSED_SLUG = "e2e-paused";
export const ORG_SLUG = "aertest01";
export const TAIL_RE = /N172TS|N44TS/;

/** Page, Frame, or FrameLocator: enough to drive the guest picker. */
export type GuestUi = Pick<Page, "getByRole" | "getByText" | "getByTestId" | "locator">;

export const DEFAULT_VISIBILITY = {
  guestLevel: "slots_only",
  studentLevel: "blocked_anonymous",
  renterLevel: "blocked_anonymous",
  instructorLevel: "own_bookings_named",
  memberLevel: "blocked_anonymous",
} as const;

export async function bookablePlanes(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const listed = await request.get(`${apiBase()}/resources`, { headers });
  expect(listed.ok()).toBeTruthy();
  const items = ((await listed.json()).data ?? []) as Array<{
    id: number;
    type?: { plane?: { grounded?: boolean; tailNumber?: string | null } };
  }>;
  return items
    .filter((row) => row.type?.plane && !row.type.plane.grounded && typeof row.id === "number")
    .map((row) => ({ id: row.id, tail: row.type?.plane?.tailNumber ?? `id-${row.id}` }));
}

async function bookablePlaneIds(request: APIRequestContext, headers: Record<string, string>) {
  return (await bookablePlanes(request, headers)).map((row) => row.id);
}

export function futureSlotWindow(daysFrom = 2, daysTo = 12) {
  return {
    start: new Date(Date.now() + daysFrom * 864e5).toISOString(),
    end: new Date(Date.now() + daysTo * 864e5).toISOString(),
  };
}

export async function fetchPublicSlots(request: APIRequestContext, daysFrom = 2, daysTo = 12) {
  const { start, end } = futureSlotWindow(daysFrom, daysTo);
  const res = await request.get(
    `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/slots?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&limit=50`,
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()).data ?? []) as Array<{
    start: string;
    end: string;
    timeZone?: string;
    resourceId?: number | null;
    resourceLabel?: string | null;
  }>;
}

export async function fetchOfferingSlots(
  request: APIRequestContext,
  headers: Record<string, string>,
  offeringId: number,
  daysFrom = 2,
  daysTo = 12,
) {
  const { start, end } = futureSlotWindow(daysFrom, daysTo);
  return request.get(
    `${apiBase()}/booking-offerings/${offeringId}/slots?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&limit=50`,
    { headers },
  );
}

export async function restoreCalendarVisibility(request: APIRequestContext) {
  const owner = await authAs(request, ACCOUNTS.owner);
  const res = await request.patch(`${apiBase()}/booking-offerings/visibility`, {
    headers: owner.headers,
    data: DEFAULT_VISIBILITY,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

export async function setPublicBookingEmbedHosts(
  request: APIRequestContext,
  hosts: string[],
) {
  const owner = await authAs(request, ACCOUNTS.owner);
  const res = await request.patch(`${apiBase()}/organizations`, {
    headers: owner.headers,
    data: { publicBookingEmbedHosts: hosts },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
}

export async function serveEmbedParent(html: string): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(html);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("embed parent server has no port");
  }
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function embedParentDocument(bookPageUrl: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>School site</title></head><body>
${publicBookingIframeSnippet(bookPageUrl)}
</body></html>`;
}

export async function expectGuestFrameBlocked(page: Page) {
  const deadline = Date.now() + 10_000;
  let quietSince: number | null = null;
  while (Date.now() < deadline) {
    const guest = page.frames().find((frame) => /\/book\//.test(frame.url()));
    if (guest) {
      const blocked = await guest.getByRole("heading", { name: /cannot be shown here/i }).count();
      const picker = await guest.getByText(/pick a time and submit a request/i).count();
      const offering = await guest.getByRole("heading", { name: "E2E Discovery" }).count();
      if (blocked > 0) {
        expect(picker, "blocked embed must not show the picker").toBe(0);
        return;
      }
      if (picker > 0 || offering > 0) {
        throw new Error("Guest picker rendered inside a foreign iframe");
      }
      if (quietSince == null) quietSince = Date.now();
      if (Date.now() - quietSince >= 1_500) return;
    }
    await page.waitForTimeout(200);
  }
  if (quietSince != null) return;
  const iframeCount = await page.locator("iframe").count();
  if (iframeCount > 0) return;
  throw new Error("Guest iframe never loaded, so framing denial could not be checked");
}

export async function ensurePublicOffering(request: APIRequestContext) {
  const base = apiBase();
  const owner = await authAs(request, ACCOUNTS.owner);
  const headers = owner.headers;

  const patch = await request.patch(`${base}/organizations`, {
    headers,
    data: { publicBookingEnabled: true, publicBookingSlug: ORG_SLUG },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();
  await restoreCalendarVisibility(request);

  const listed = await request.get(`${base}/booking-offerings?limit=50`, { headers });
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const rows = ((await listed.json()).data ?? []) as Array<{
    id: number;
    slug: string;
    active: boolean;
    name: string;
  }>;
  const planeIds = await bookablePlaneIds(request, headers);
  expect(planeIds.length, "need a bookable plane").toBeGreaterThan(0);
  const resourceIds = planeIds.slice(0, Math.min(2, planeIds.length));
  const body = {
    slug: OFFERING_SLUG,
    name: "E2E Discovery",
    reservationType: "guest",
    assignmentMode: "desk_assigns",
    active: true,
    description: "Playwright public booking offering.",
    resourceIds,
    allowResourceChoice: false,
    allowInstructorChoice: false,
    allowLocationChoice: false,
    fixedReservationMinutes: 60,
    minimumNoticeMinutes: null,
    bookingHorizonDays: null,
  };

  const existing = rows.find((row) => row.slug === OFFERING_SLUG);
  if (existing) {
    const on = await request.patch(`${base}/booking-offerings/${existing.id}`, {
      headers,
      data: body,
    });
    expect(on.ok(), await on.text()).toBeTruthy();
    return existing.id;
  }

  const plane = await findBookablePlane(request, headers);
  const created = await request.post(`${base}/booking-offerings`, {
    headers,
    data: { ...body, locationId: plane.location?.id },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()).data ?? (await created.json())).id as number;
}

export async function ensurePausedOffering(request: APIRequestContext) {
  const base = apiBase();
  const owner = await authAs(request, ACCOUNTS.owner);
  const headers = owner.headers;
  const listed = await request.get(`${base}/booking-offerings?limit=50`, { headers });
  const rows = ((await listed.json()).data ?? []) as Array<{ id: number; slug: string }>;
  const existing = rows.find((row) => row.slug === PAUSED_SLUG);
  if (existing) {
    const paused = await request.patch(`${base}/booking-offerings/${existing.id}`, {
      headers,
      data: { active: false },
    });
    expect(paused.ok(), await paused.text()).toBeTruthy();
    return;
  }
  const plane = await findBookablePlane(request, headers);
  const created = await request.post(`${base}/booking-offerings`, {
    headers,
    data: {
      slug: PAUSED_SLUG,
      name: "E2E Paused",
      reservationType: "guest",
      assignmentMode: "desk_assigns",
      active: false,
      resourceIds: [plane.id],
      fixedReservationMinutes: 60,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
}

export function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

export function expectNoBootCrash(errors: string[]) {
  expect(
    errors.filter((m) => m.includes("FACET_KEYS") || m.includes("does not provide an export")),
  ).toEqual([]);
}

export async function waitForSlots(page: GuestUi) {
  await expect(page.getByText(/Loading times/i)).toHaveCount(0, { timeout: 25_000 });
}

export function slotStartButtons(page: GuestUi) {
  return page.getByTestId("slot-start");
}

function monthNavNext(page: GuestUi) {
  return page.getByRole("button", { name: /go to the next month/i });
}

export async function pickAFutureSlot(page: GuestUi) {
  const dayView = page.getByRole("button", { name: "Day view" });
  if (await dayView.isVisible().catch(() => false)) await dayView.click();
  for (let month = 0; month < 6; month++) {
    await waitForSlots(page);
    let times = slotStartButtons(page);
    if ((await times.count()) === 0) {
      const availableDay = page
        .locator('[data-slot="calendar"] button[data-available="true"]')
        .first();
      if (await availableDay.isVisible().catch(() => false)) {
        await availableDay.click();
        await waitForSlots(page);
        times = slotStartButtons(page);
      }
    }
    if ((await times.count()) > 0) {
      const first = times.first();
      const start = await first.getAttribute("data-start");
      const label = (await first.innerText()).trim();
      await first.click();
      await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible({ timeout: 10_000 });
      return start ?? label;
    }
    const nextMonth = monthNavNext(page);
    if (month < 5 && (await nextMonth.isEnabled())) {
      await nextMonth.click();
      continue;
    }
    throw new Error(`No public booking slots in the next ${month + 1} month(s)`);
  }
  throw new Error("No public booking slots");
}

export async function pickSlotWithLabel(page: Page, needle: RegExp) {
  const dayView = page.getByRole("button", { name: "Day view" });
  if (await dayView.isVisible().catch(() => false)) await dayView.click();
  for (let month = 0; month < 6; month++) {
    await waitForSlots(page);
    const days = page.locator('[data-slot="calendar"] button[data-available="true"]');
    const dayCount = await days.count();
    const scan = async () => {
      const match = slotStartButtons(page).filter({ hasText: needle });
      if ((await match.count()) > 0) {
        await match.first().click();
        await expect(page.getByRole("textbox", { name: "Name" })).toBeVisible({ timeout: 10_000 });
        return true;
      }
      return false;
    };
    if (await scan()) return;
    for (let i = 0; i < dayCount; i++) {
      await days.nth(i).click();
      await waitForSlots(page);
      if (await scan()) return;
    }
    const nextMonth = monthNavNext(page);
    if (month < 5 && (await nextMonth.isEnabled())) {
      await nextMonth.click();
      continue;
    }
    throw new Error(`No public slot matching ${needle} in the next ${month + 1} month(s)`);
  }
  throw new Error(`No public slot matching ${needle}`);
}

export async function openGuestPage(page: Page) {
  const errors = collectPageErrors(page);
  const response = await page.goto(`/book/${ORG_SLUG}/${OFFERING_SLUG}`);
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp, "guest HTML must stamp frame-ancestors").toMatch(/frame-ancestors/i);
  await expect(page.getByRole("heading", { name: "E2E Discovery" })).toBeVisible({
    timeout: 20_000,
  });
  return errors;
}

export async function fillGuestForm(
  page: GuestUi,
  args: { name: string; email: string; notes: string; consent?: boolean },
) {
  await page.getByRole("textbox", { name: "Name" }).fill(args.name);
  await page.getByRole("textbox", { name: "Email" }).fill(args.email);
  await page.getByRole("textbox", { name: /notes/i }).fill(args.notes);
  if (args.consent !== false) await page.getByRole("checkbox").check();
}

export async function waitForConfirmUrl(email: string) {
  let confirmUrl: string | null = null;
  await expect
    .poll(
      () => {
        confirmUrl = readConfirmUrlForEmail(email);
        return confirmUrl;
      },
      {
        timeout: 15_000,
        message:
          "API did not log the verify-email confirm URL (E2E_API_LOG / development email log)",
      },
    )
    .toBeTruthy();
  return confirmUrl!;
}

export async function seedConfirmedGuest(
  request: APIRequestContext,
  args?: { name?: string; notes?: string },
) {
  await ensurePublicOffering(request);
  const start = new Date(Date.now() + 2 * 864e5).toISOString();
  const end = new Date(Date.now() + 12 * 864e5).toISOString();
  const slotsRes = await request.get(
    `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/slots?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&limit=50`,
  );
  expect(slotsRes.ok(), await slotsRes.text()).toBeTruthy();
  const slots = ((await slotsRes.json()).data ?? []) as Array<{
    start: string;
    end: string;
    timeZone?: string;
  }>;
  expect(slots.length, "need a public slot to seed a guest").toBeGreaterThan(0);
  const slot = slots[0]!;
  const stamp = Date.now();
  const email = `e2e-role-${stamp}@example.com`;
  const name = args?.name ?? `E2E-ROLE-GUEST-${stamp}`;
  const notes = args?.notes ?? `E2E-public-role-${stamp}`;
  const submit = await request.post(
    `${apiBase()}/public/book/${ORG_SLUG}/offerings/${OFFERING_SLUG}/requests`,
    {
      data: {
        name,
        email,
        notes,
        start: slot.start,
        end: slot.end,
        timeZoneName: slot.timeZone,
        consent: true,
      },
    },
  );
  expect(submit.ok(), await submit.text()).toBeTruthy();
  const confirmUrl = await waitForConfirmUrl(email);
  const token = new URL(confirmUrl).searchParams.get("token");
  expect(token).toBeTruthy();
  const confirm = await request.post(`${apiBase()}/public/book/confirm`, { data: { token } });
  expect(confirm.ok(), await confirm.text()).toBeTruthy();
  const owner = await authAs(request, ACCOUNTS.owner);
  const pending = await request.get(`${apiBase()}/booking-requests`, {
    headers: owner.headers,
  });
  expect(pending.ok(), await pending.text()).toBeTruthy();
  const rows = ((await pending.json()).data ?? []) as Array<{
    notes?: string | null;
    guestEmail?: string | null;
    resource?: { id?: number } | null;
  }>;
  const created = rows.find((row) => row.guestEmail === email || row.notes === notes);
  expect(created, `confirmed guest should appear in the desk queue: ${JSON.stringify(rows)}`).toBeTruthy();
  return { name, email, notes };
}

export async function rejectE2ePublicGuests(request: APIRequestContext) {
  const owner = await authAs(request, ACCOUNTS.owner);
  const pending = await request.get(`${apiBase()}/booking-requests`, {
    headers: owner.headers,
  });
  if (!pending.ok()) return;
  const rows = ((await pending.json()).data ?? []) as Array<{
    id: number;
    notes?: string | null;
    guestName?: string | null;
  }>;
  for (const row of rows) {
    const notes = String(row.notes ?? "");
    const guestName = String(row.guestName ?? "");
    if (!notes.startsWith("E2E-public-role") && !guestName.startsWith("E2E-ROLE")) continue;
    await request.post(`${apiBase()}/booking-requests/${row.id}/reject`, {
      headers: owner.headers,
    });
  }
}

export async function openBookingOfferingsSettings(page: Page) {
  const errors = collectPageErrors(page);
  await page.goto("/settings?tab=booking-offerings");
  await dismissCookieBanner(page);
  await expect(page.getByText("Public booking links")).toBeVisible({ timeout: 20_000 });
  return errors;
}

export async function openOfferingsPage(page: Page) {
  const errors = collectPageErrors(page);
  await page.goto("/offerings");
  await dismissCookieBanner(page);
  await expect(page.getByRole("heading", { level: 1, name: "Offerings" })).toBeVisible({
    timeout: 20_000,
  });
  return errors;
}

export function audienceSelect(page: Page, label: string) {
  return page
    .locator("div.space-y-2", { has: page.getByText(label, { exact: true }) })
    .getByRole("combobox");
}

export async function setAudienceVisibility(page: Page, audienceLabel: string, optionLabel: string) {
  const trigger = audienceSelect(page, audienceLabel);
  await expect(trigger).toBeVisible({ timeout: 20_000 });
  const current = (await trigger.innerText()).trim();
  if (current === optionLabel) return;
  await trigger.click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
  await expect(page.getByText("Calendar visibility updated.").first()).toBeVisible({
    timeout: 15_000,
  });
}

export async function goToWeekTimesWithSlots(page: Page) {
  const weekTimes = page.getByRole("button", { name: "Week times" });
  await weekTimes.click();
  for (let week = 0; week < 6; week++) {
    await waitForSlots(page);
    if ((await slotStartButtons(page).count()) > 0) return;
    const later = page.getByRole("button", { name: /later/i });
    if (week < 5 && (await later.isEnabled())) {
      await later.click();
      continue;
    }
    throw new Error("No public booking slots in week times view");
  }
}

export async function goToWeekCalendarWithSlots(page: Page) {
  await page.getByRole("button", { name: "Week calendar" }).click();
  for (let week = 0; week < 6; week++) {
    await waitForSlots(page);
    if ((await page.getByTestId("heatmap-slot").count()) > 0) return;
    const later = page.getByRole("button", { name: /later/i });
    if (week < 5 && (await later.isEnabled())) {
      await later.click();
      continue;
    }
    throw new Error("No public booking slots in week calendar view");
  }
}

export async function pickHeatmapSlot(page: Page) {
  await goToWeekCalendarWithSlots(page);
  await page.getByTestId("heatmap-slot").first().click();
  const name = page.getByRole("textbox", { name: "Name" });
  const choose = page.getByText(/Pick an aircraft|More than one opening/i);
  if (await choose.isVisible().catch(() => false)) {
    await slotStartButtons(page).first().click();
  }
  await expect(name).toBeVisible({ timeout: 10_000 });
}

export async function openHeatmapAircraftPicker(page: Page) {
  await goToWeekCalendarWithSlots(page);
  const pills = page.getByTestId("heatmap-slot");
  const n = await pills.count();
  for (let i = 0; i < n; i++) {
    const aria = await pills.nth(i).getAttribute("aria-label");
    if (aria && /\d+ options/.test(aria)) {
      await pills.nth(i).click();
      await expect(page.getByText(/pick an aircraft/i)).toBeVisible();
      return;
    }
  }
  throw new Error("No heatmap cell with multiple aircraft");
}

/** Overflowing ancestors of a node, excluding the document/body/html page scroller. */
export async function nestedOverflowScrollers(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const start = document.querySelector(sel);
    if (!start) return [] as string[];
    const found: string[] = [];
    let el: HTMLElement | null = start instanceof HTMLElement ? start : start.parentElement;
    while (el && el !== document.documentElement && el !== document.body) {
      const style = getComputedStyle(el);
      const oy = style.overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        el.scrollHeight > el.clientHeight + 4
      ) {
        found.push(
          (el.getAttribute("data-testid") || el.className || el.tagName)
            .toString()
            .slice(0, 80),
        );
      }
      el = el.parentElement;
    }
    return found;
  }, selector);
}

export async function slotLabels(page: Page) {
  const dayView = page.getByRole("button", { name: "Day view" });
  if (await dayView.isVisible().catch(() => false)) await dayView.click();
  await waitForSlots(page);
  let times = slotStartButtons(page);
  if ((await times.count()) === 0) {
    const availableDay = page.locator('[data-slot="calendar"] button[data-available="true"]').first();
    if (await availableDay.isVisible().catch(() => false)) await availableDay.click();
    times = slotStartButtons(page);
  }
  await expect(times.first()).toBeVisible({ timeout: 25_000 });
  return times.allTextContents();
}

export async function openOfferingEdit(page: Page, offeringName = "E2E Discovery") {
  await page.getByRole("button", { name: new RegExp(`actions for ${offeringName}`, "i") }).click();
  await page.getByRole("menuitem", { name: /^Edit$/i }).click();
  await expect(page.getByRole("heading", { name: new RegExp(`edit ${offeringName}`, "i") })).toBeVisible({
    timeout: 15_000,
  });
}

export async function saveOfferingEdit(page: Page, offeringName = "E2E Discovery") {
  await page.getByRole("button", { name: /^Save changes$/i }).click();
  await expect(page.getByText(new RegExp(`"${offeringName}" updated`, "i"))).toBeVisible({
    timeout: 15_000,
  });
}

export async function approveGuestFromCalendar(page: Page, guestName: string) {
  await page.goto("/schedule");
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: /Booking requests/i }).click();
  await dismissCookieBanner(page);
  const row = page.locator("li").filter({ hasText: guestName });
  await expect(row).toBeVisible({ timeout: 20_000 });
  const [approveRes] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" && /\/booking-requests\/\d+\/approve/.test(res.url()),
    ),
    row.getByRole("button", { name: /^Approve$/i }).click(),
  ]);
  expect(approveRes.ok(), await approveRes.text()).toBeTruthy();
  await expect(page.getByText(/approved and booked/i).first()).toBeVisible({ timeout: 20_000 });
}
