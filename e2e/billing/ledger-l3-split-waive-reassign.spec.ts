/**
 * Ledger L3 C1–C5: real console UI for equal split, waive, reassign, refuses, rebill.
 * Setup uses the API (book / ramp / PIN); assertions drive Schedule + People.
 */
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  authAs,
  apiBase,
  findBookablePlane,
  orgUserIdForEmail,
} from "../helpers/slot-offers";

type AuthHeaders = { Authorization: string };

async function dismissCookieBanner(page: Page) {
  const accept = page.getByRole("button", { name: /^Accept$/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
  const banner = page.getByRole("dialog", { name: /Cookie preferences/i });
  if (await banner.isVisible().catch(() => false)) {
    await banner.getByRole("button", { name: /^Accept$/i }).click();
    await expect(banner).toBeHidden({ timeout: 5_000 });
  }
}

async function openReservationSheet(page: Page, reservationId: number) {
  await page.goto(`/schedule?reservation=${reservationId}`);
  await expect(page).not.toHaveURL(/\/login/);
  await dismissCookieBanner(page);
  await expect(page.getByRole("button", { name: /Close details/i })).toBeVisible({
    timeout: 25_000,
  });
  await dismissCookieBanner(page);
}

async function postToLedgerFromSheet(page: Page) {
  await dismissCookieBanner(page);
  // Auto-bill may already have landed; only click when the retry affordance is up.
  const charged = page.getByText(/Charged to account ledger/i);
  if (await charged.isVisible().catch(() => false)) return;

  const postBtn = page.getByRole("button", { name: /^Post to ledger$/i });
  await expect(postBtn).toBeVisible({ timeout: 15_000 });
  const responsePromise = page.waitForResponse(
    (res) =>
      /\/reservations\/\d+\/invoices\/?$/.test(res.url()) &&
      res.request().method() === "POST",
    { timeout: 30_000 },
  );
  await postBtn.click();
  const res = await responsePromise;
  expect(res.ok(), await res.text()).toBeTruthy();
  await expect(charged).toBeVisible({ timeout: 20_000 });
}

async function ensurePin(
  request: APIRequestContext,
  email: string,
  pin: string,
): Promise<{ headers: AuthHeaders; pin: string }> {
  const base = apiBase();
  const auth = await authAs(request, email);
  const current = await request.get(`${base}/users/pin`, { headers: auth.headers });
  expect(current.ok(), await current.text()).toBeTruthy();
  const body = await current.json();
  const have = (body.data ?? body) as string | null;
  if (!have) {
    const set = await request.patch(`${base}/users/pin`, {
      headers: auth.headers,
      data: { pin },
    });
    expect(set.ok(), await set.text()).toBeTruthy();
    return { headers: auth.headers, pin };
  }
  return { headers: auth.headers, pin: have };
}

async function setBillingEnabled(
  request: APIRequestContext,
  ownerHeaders: AuthHeaders,
  enabled: boolean,
) {
  const base = apiBase();
  const patch = await request.patch(`${base}/organizations/billing`, {
    headers: ownerHeaders,
    data: { enabled },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();
}

/** Shared student+renter booking, ramped in. Optionally confirm only the student. */
async function seedSharedCloseOut(args: {
  request: APIRequestContext;
  ownerHeaders: AuthHeaders;
  studentId: number;
  renterId: number;
  title: string;
  /** When true, only student signs; leaves Who pays / Post to ledger reachable. */
  confirmStudentOnly?: boolean;
  /** When true (and not student-only), both sign with billing briefly off so auto-bill skips. */
  deferAutoBill?: boolean;
}): Promise<{ reservationId: number }> {
  const {
    request,
    ownerHeaders,
    studentId,
    renterId,
    title,
    confirmStudentOnly = false,
    deferAutoBill = false,
  } = args;
  const base = apiBase();
  const plane = await findBookablePlane(request, ownerHeaders);
  await request.patch(`${base}/resources/${plane.id}`, {
    headers: ownerHeaders,
    data: { type: { plane: { rampedIn: true, grounded: false } } },
  });

  const hobbs = Math.trunc(Number(plane.type?.plane?.hobbsTime ?? 1000));
  const tach = Math.trunc(Number(plane.type?.plane?.tachTime ?? 1000));
  const locationId = plane.location?.id ?? plane.FK_locationId;

  let reservationId = 0;
  for (let dayOffset = 5; dayOffset <= 18; dayOffset++) {
    const probe = new Date(Date.now() + dayOffset * 864e5);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const start = new Date(`${ymd}T16:00:00-06:00`);
    const end = new Date(start.getTime() + 2 * 3600_000);
    const attempt = await request.post(`${base}/reservations/`, {
      headers: ownerHeaders,
      data: {
        title,
        type: "shared",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZoneName: "America/Denver",
        notes: `E2E-UI-ledger-l3-${Date.now()}`,
        resource: { id: plane.id },
        ...(locationId ? { location: { id: locationId } } : {}),
        personnel: {
          students: [{ id: studentId }],
          renters: [{ id: renterId }],
        },
      },
    });
    if (attempt.status() < 300) {
      const body = await attempt.json();
      reservationId = (body.data ?? body).id as number;
      break;
    }
  }
  expect(reservationId, "need a free shared slot").toBeTruthy();

  const rampOut = await request.post(`${base}/reservations/${reservationId}/rampOut`, {
    headers: ownerHeaders,
    data: { hobbsTimeOut: hobbs, tachTimeOut: tach },
  });
  expect(rampOut.ok(), await rampOut.text()).toBeTruthy();

  const rampIn = await request.post(`${base}/reservations/${reservationId}/rampIn`, {
    headers: ownerHeaders,
    data: {
      hobbsTimeIn: hobbs + 20,
      tachTimeIn: tach + 18,
      ...(locationId ? { locationId } : {}),
    },
  });
  expect(rampIn.ok(), await rampIn.text()).toBeTruthy();

  const student = await ensurePin(request, ACCOUNTS.student, "1234");
  const confirmStudent = await request.post(
    `${base}/reservations/${reservationId}/confirmReview`,
    { headers: student.headers, data: { pin: student.pin } },
  );
  expect(confirmStudent.ok(), await confirmStudent.text()).toBeTruthy();

  if (confirmStudentOnly) {
    return { reservationId };
  }

  const renter = await ensurePin(request, ACCOUNTS.renter, "1234");
  if (deferAutoBill) {
    await setBillingEnabled(request, ownerHeaders, false);
  }
  try {
    const confirmRenter = await request.post(
      `${base}/reservations/${reservationId}/confirmReview`,
      { headers: renter.headers, data: { pin: renter.pin } },
    );
    expect(confirmRenter.ok(), await confirmRenter.text()).toBeTruthy();
  } finally {
    if (deferAutoBill) {
      await setBillingEnabled(request, ownerHeaders, true);
    }
  }

  return { reservationId };
}

async function liveFlightCharges(
  request: APIRequestContext,
  ownerHeaders: AuthHeaders,
  orgUserId: number,
  reservationId: number,
) {
  const base = apiBase();
  const ledger = await request.get(`${base}/orgUsers/${orgUserId}/ledger`, {
    headers: ownerHeaders,
  });
  expect(ledger.ok(), await ledger.text()).toBeTruthy();
  const entries = ((await ledger.json()).data?.entries ?? []) as Array<{
    id: number;
    type: string;
    amountCents: number;
    reservationId?: number | null;
    reversesId?: number | null;
    reversedBy?: { id: number } | null;
  }>;
  return entries.filter(
    (e) =>
      e.type === "flight_charge" &&
      !e.reversesId &&
      !e.reversedBy &&
      e.reservationId === reservationId,
  );
}

test.describe("Ledger L3 C1–C5 UI (owner)", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("C1 equal split: Post to ledger from close-out (2 shares)", async ({
    page,
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    if ((await ledgerSettings.json()).data?.enabled !== true) {
      test.skip(true, "ledger mode off — skip C1 UI");
      return;
    }

    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );
    const renterId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.renter);

    const { reservationId } = await seedSharedCloseOut({
      request,
      ownerHeaders: owner.headers,
      studentId,
      renterId,
      title: "E2E L3-C1 Equal split",
      deferAutoBill: true,
    });

    await openReservationSheet(page, reservationId);
    await expect(page.getByRole("heading", { name: /E2E L3-C1 Equal split/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Review complete/i)).toBeVisible({ timeout: 15_000 });
    await postToLedgerFromSheet(page);
    await expect(page.getByText(/2 shares/i)).toBeVisible();
    await expect(page.getByText(/Who pays what is locked/i)).toBeVisible();

    const studentCharges = await liveFlightCharges(
      request,
      owner.headers,
      studentId,
      reservationId,
    );
    const renterCharges = await liveFlightCharges(
      request,
      owner.headers,
      renterId,
      reservationId,
    );
    expect(studentCharges).toHaveLength(1);
    expect(renterCharges).toHaveLength(1);
    expect(Math.abs(studentCharges[0]!.amountCents)).toBe(
      Math.abs(renterCharges[0]!.amountCents),
    );

    await page.goto(`/people/${studentId}?tab=billing`);
    await expect(page.getByText("Account ledger")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Flight$/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("C2 waive one: Who pays Not billed, then Post to ledger", async ({
    page,
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    if ((await ledgerSettings.json()).data?.enabled !== true) {
      test.skip(true, "ledger mode off — skip C2 UI");
      return;
    }

    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );
    const renterId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.renter);

    const { reservationId } = await seedSharedCloseOut({
      request,
      ownerHeaders: owner.headers,
      studentId,
      renterId,
      title: "E2E L3-C2 Waive one",
      confirmStudentOnly: true,
    });

    await openReservationSheet(page, reservationId);
    await expect(page.getByRole("heading", { name: /E2E L3-C2 Waive one/i })).toBeVisible({
      timeout: 15_000,
    });

    const whoPays = page.locator('[data-doc-shot="who-pays-what-panel"]');
    await expect(whoPays).toBeVisible({ timeout: 15_000 });
    // Collapsed by default — open before touching Not billed.
    await page.getByRole("button", { name: /Who pays what/i }).click();
    const renterRow = whoPays
      .locator("div.space-y-2")
      .filter({ hasText: /Test Renter/ })
      .first();
    await expect(renterRow).toBeVisible({ timeout: 10_000 });
    await renterRow.locator('input[type="checkbox"]').check();
    await renterRow.getByPlaceholder(/Why/i).fill("E2E safety pilot");
    await whoPays.getByRole("button", { name: /^Save$/i }).click();
    await expect(page.getByText(/Saved who pays what/i)).toBeVisible({ timeout: 10_000 });

    const renter = await ensurePin(request, ACCOUNTS.renter, "1234");
    await setBillingEnabled(request, owner.headers, false);
    try {
      const confirmRenter = await request.post(
        `${base}/reservations/${reservationId}/confirmReview`,
        { headers: renter.headers, data: { pin: renter.pin } },
      );
      expect(confirmRenter.ok(), await confirmRenter.text()).toBeTruthy();
    } finally {
      await setBillingEnabled(request, owner.headers, true);
    }

    await openReservationSheet(page, reservationId);
    await postToLedgerFromSheet(page);
    // Single payer — no "(2 shares)"
    await expect(page.getByText(/2 shares/i)).toHaveCount(0);

    const studentCharges = await liveFlightCharges(
      request,
      owner.headers,
      studentId,
      reservationId,
    );
    const renterCharges = await liveFlightCharges(
      request,
      owner.headers,
      renterId,
      reservationId,
    );
    expect(studentCharges).toHaveLength(1);
    expect(renterCharges).toHaveLength(0);
  });

  test("C3–C5 reassign in People UI; refuse already-staked; no rebill Post", async ({
    page,
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    if ((await ledgerSettings.json()).data?.enabled !== true) {
      test.skip(true, "ledger mode off — skip C3–C5 UI");
      return;
    }

    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );
    const renterId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.renter);
    const adminId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.admin);

    const { reservationId } = await seedSharedCloseOut({
      request,
      ownerHeaders: owner.headers,
      studentId,
      renterId,
      title: "E2E L3-C3 Reassign source",
      deferAutoBill: true,
    });

    await openReservationSheet(page, reservationId);
    await postToLedgerFromSheet(page);
    await expect(page.getByText(/2 shares/i)).toBeVisible();

    const beforeStudent = await liveFlightCharges(
      request,
      owner.headers,
      studentId,
      reservationId,
    );
    expect(beforeStudent).toHaveLength(1);
    const entryId = beforeStudent[0]!.id;

    // C3 — full Reassign dialog submit to admin
    await page.goto(`/people/${studentId}?tab=billing`);
    await expect(page.getByText("Account ledger")).toBeVisible({ timeout: 30_000 });

    const flightRow = page
      .getByRole("row")
      .filter({ has: page.getByText(/^Flight$/) })
      .filter({ has: page.getByRole("button", { name: /^Reassign$/i }) })
      .first();
    await expect(flightRow).toBeVisible({ timeout: 15_000 });
    await flightRow.getByRole("button", { name: /^Reassign$/i }).click();

    const dialog = page.getByRole("dialog", { name: /reassign flight charge/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/new payer/i)).toBeVisible();

    // C4 — self never listed
    await dialog.getByLabel(/find member/i).fill("Test Student");
    await dialog.getByRole("combobox").click();
    await expect(
      page.getByRole("option", { name: new RegExp(`Member #${studentId}\\b`) }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // C4 — already-staked renter refused (toast)
    await dialog.getByLabel(/find member/i).fill("Test Renter");
    await dialog.getByRole("combobox").click();
    const renterOption = page.getByRole("option").filter({ hasText: /Test Renter/i }).first();
    await expect(renterOption).toBeVisible({ timeout: 10_000 });
    await renterOption.click();
    await dialog.getByRole("button", { name: /^Reassign$/i }).click();
    await expect(page.getByText(/already has a bill on this reservation/i)).toBeVisible({
      timeout: 10_000,
    });

    // C3 — reassign to admin
    await dialog.getByLabel(/find member/i).fill("Test Admin");
    await dialog.getByRole("combobox").click();
    const adminOption = page.getByRole("option").filter({ hasText: /Test Admin/i }).first();
    await expect(adminOption).toBeVisible({ timeout: 10_000 });
    await adminOption.click();
    await dialog.getByRole("button", { name: /^Reassign$/i }).click();
    await expect(page.getByText(/Flight charge reassigned/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(/^Reversal$/).first()).toBeVisible({ timeout: 15_000 });

    const adminCharges = await liveFlightCharges(
      request,
      owner.headers,
      adminId,
      reservationId,
    );
    expect(adminCharges).toHaveLength(1);
    const studentLive = await liveFlightCharges(
      request,
      owner.headers,
      studentId,
      reservationId,
    );
    expect(studentLive).toHaveLength(0);

    // C4 API — self / already reversed
    const selfRefuse = await request.post(
      `${base}/orgUsers/${adminId}/ledger/entries/${adminCharges[0]!.id}/reassign`,
      { headers: owner.headers, data: { toOrgUserId: adminId } },
    );
    expect(selfRefuse.status()).toBe(400);

    const again = await request.post(
      `${base}/orgUsers/${studentId}/ledger/entries/${entryId}/reassign`,
      { headers: owner.headers, data: { toOrgUserId: adminId } },
    );
    expect(again.status()).toBe(400);

    // C5 — close-out no longer offers Post to ledger; API refuses double bill
    await openReservationSheet(page, reservationId);
    await expect(page.getByText(/Charged to account ledger/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^Post to ledger$/i })).toHaveCount(0);

    const rebill = await request.post(`${base}/reservations/${reservationId}/invoices`, {
      headers: owner.headers,
    });
    expect(rebill.status()).toBe(400);
    expect(await rebill.text()).toMatch(/already created/i);
  });
});
