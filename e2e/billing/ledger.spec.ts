import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import {
  authAs,
  apiBase,
  findBookablePlane,
  orgUserIdForEmail,
} from "../helpers/slot-offers";

type AuthHeaders = { Authorization: string };

/** Book solo → ramp → student confirm → ensure flight_charge (auto or manual invoices). */
async function postLedgerFlightCharge(args: {
  request: APIRequestContext;
  ownerHeaders: AuthHeaders;
  studentId: number;
  notesMarker: string;
}): Promise<{ reservationId: number; entryId: number; studentId: number }> {
  const { request, ownerHeaders, studentId, notesMarker } = args;
  const base = apiBase();

  const plane = await findBookablePlane(request, ownerHeaders);
  await request.patch(`${base}/resources/${plane.id}`, {
    headers: ownerHeaders,
    data: { type: { plane: { rampedIn: true, grounded: false } } },
  });

  const hobbs = Math.trunc(Number(plane.type?.plane?.hobbsTime ?? 1000));
  const tach = Math.trunc(Number(plane.type?.plane?.tachTime ?? 1000));

  let created: Awaited<ReturnType<typeof request.post>> | null = null;
  let reservationId = 0;
  for (let dayOffset = 4; dayOffset <= 12; dayOffset++) {
    const probe = new Date(Date.now() + dayOffset * 864e5);
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const start = new Date(`${ymd}T15:00:00-06:00`);
    const end = new Date(start.getTime() + 3600_000);
    const attempt = await request.post(`${base}/reservations/`, {
      headers: ownerHeaders,
      data: {
        title: "E2E Ledger Flight",
        type: "solo",
        start: start.toISOString(),
        end: end.toISOString(),
        timeZoneName: "America/Denver",
        notes: notesMarker,
        resource: { id: plane.id },
        personnel: { students: [{ id: studentId }] },
      },
    });
    if (attempt.status() < 300) {
      created = attempt;
      const body = await attempt.json();
      reservationId = (body.data ?? body).id as number;
      break;
    }
  }
  expect(created, "need a free slot for ledger flight_charge").toBeTruthy();
  expect(reservationId).toBeTruthy();

  const rampOut = await request.post(`${base}/reservations/${reservationId}/rampOut`, {
    headers: ownerHeaders,
    data: { hobbsTimeOut: hobbs, tachTimeOut: tach },
  });
  expect(rampOut.ok(), await rampOut.text()).toBeTruthy();

  const rampIn = await request.post(`${base}/reservations/${reservationId}/rampIn`, {
    headers: ownerHeaders,
    data: {
      hobbsTimeIn: hobbs + 10,
      tachTimeIn: tach + 10,
      locationId: plane.location?.id ?? plane.FK_locationId,
    },
  });
  expect(rampIn.ok(), await rampIn.text()).toBeTruthy();

  const studentAuth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.student, password: TEST_PASSWORD },
  });
  expect(studentAuth.ok()).toBeTruthy();
  const studentToken = (await studentAuth.json()).auth.accessToken as string;
  const studentHeaders = { Authorization: `Bearer ${studentToken}` };

  await request.patch(`${base}/users/pin`, {
    headers: studentHeaders,
    data: { pin: "1234" },
  });

  const confirm = await request.post(`${base}/reservations/${reservationId}/confirmReview`, {
    headers: studentHeaders,
    data: { pin: "1234" },
  });
  expect(confirm.ok(), await confirm.text()).toBeTruthy();

  // Auto-post may already have landed; otherwise this is the admin retry path.
  let entryId: number | null = null;
  const ledgerAfterConfirm = await request.get(`${base}/orgUsers/${studentId}/ledger`, {
    headers: ownerHeaders,
  });
  expect(ledgerAfterConfirm.ok(), await ledgerAfterConfirm.text()).toBeTruthy();
  const entriesAfter = ((await ledgerAfterConfirm.json()).data?.entries ?? []) as Array<{
    id: number;
    type: string;
    reservationId?: number | null;
    reversesId?: number | null;
  }>;
  const existing = entriesAfter.find(
    (e) =>
      e.type === "flight_charge" &&
      !e.reversesId &&
      e.reservationId === reservationId,
  );
  if (existing) {
    entryId = existing.id;
  } else {
    const bill = await request.post(`${base}/reservations/${reservationId}/invoices`, {
      headers: ownerHeaders,
    });
    expect(bill.ok(), await bill.text()).toBeTruthy();
    const billBody = await bill.json();
    const rows = (billBody.data ?? []) as Array<{
      id?: number;
      ledgerEntryId?: number;
      isLedgerCharge?: boolean;
    }>;
    const row = rows[0];
    entryId = (row?.ledgerEntryId ?? row?.id) as number;
    expect(entryId, "manual invoices should return ledger entry id").toBeTruthy();
  }

  // Wire shape: payers expose nested ledgerEntry (FK_* stripped).
  const detail = await request.get(`${base}/reservations/${reservationId}`, {
    headers: ownerHeaders,
  });
  expect(detail.ok(), await detail.text()).toBeTruthy();
  const reservation = ((await detail.json()).data ?? {}) as {
    payers?: Array<{
      FK_ledgerEntryId?: number | null;
      ledgerEntry?: { id: number; reversedBy?: { id: number } | null } | null;
    }>;
    invoices?: Array<{ voidedAt?: string | null }>;
  };
  const liveStake = (reservation.payers ?? []).find(
    (p) => p.ledgerEntry != null && !p.ledgerEntry.reversedBy,
  );
  expect(liveStake?.ledgerEntry?.id).toBe(entryId);
  // FK may be stripped on the wire — do not require it for client billing state.
  expect((reservation.invoices ?? []).filter((i) => !i.voidedAt)).toHaveLength(0);

  return { reservationId, entryId: entryId!, studentId };
}

test.describe("Ledger API (owner / student)", () => {
  test("GET ledger is readable; writes are admin-only and require ledger mode", async ({
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const student = await authAs(request, ACCOUNTS.student);
    const studentId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.student);

    const self = await request.get(`${base}/orgUsers/${owner.orgUserId}/ledger`, {
      headers: owner.headers,
    });
    expect(self.ok(), await self.text()).toBeTruthy();
    const selfBody = await self.json();
    expect(selfBody.data).toMatchObject({
      balanceCents: expect.any(Number),
      ledgerEnabled: expect.any(Boolean),
      entries: expect.any(Array),
    });
    const ledgerOn = selfBody.data.ledgerEnabled === true;

    const studentOwn = await request.get(`${base}/orgUsers/${student.orgUserId}/ledger`, {
      headers: student.headers,
    });
    expect(studentOwn.ok(), await studentOwn.text()).toBeTruthy();

    const studentOther = await request.get(`${base}/orgUsers/${owner.orgUserId}/ledger`, {
      headers: student.headers,
    });
    expect(studentOther.status()).toBe(400);

    const adminRead = await request.get(`${base}/orgUsers/${studentId}/ledger`, {
      headers: owner.headers,
    });
    expect(adminRead.ok(), await adminRead.text()).toBeTruthy();

    const refundable = await request.get(
      `${base}/orgUsers/${owner.orgUserId}/ledger/refundable`,
      { headers: owner.headers },
    );
    expect(refundable.ok(), await refundable.text()).toBeTruthy();
    const refundableBody = await refundable.json();
    expect(refundableBody.data).toMatchObject({
      balanceCents: expect.any(Number),
      ledgerEnabled: ledgerOn,
      topups: expect.any(Array),
    });

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    expect((await ledgerSettings.json()).data).toMatchObject({
      enabled: ledgerOn,
    });

    const studentCredit = await request.post(
      `${base}/orgUsers/${student.orgUserId}/ledger/entries`,
      {
        headers: student.headers,
        data: { amountCents: 1000, type: "cash", memo: "E2E student credit" },
      },
    );
    expect(studentCredit.status()).toBe(400);

    const studentRefund = await request.post(
      `${base}/orgUsers/${student.orgUserId}/ledger/refunds`,
      {
        headers: student.headers,
        data: { amountCents: 100, method: "check_cash", memo: "E2E student refund" },
      },
    );
    expect(studentRefund.status()).toBe(400);

    const tinyTopup = await request.post(
      `${base}/orgUsers/${owner.orgUserId}/ledger/topups`,
      {
        headers: owner.headers,
        data: { amountCents: 50 },
      },
    );
    expect(tinyTopup.status()).toBe(400);

    const adminCredit = await request.post(`${base}/orgUsers/${studentId}/ledger/entries`, {
      headers: owner.headers,
      data: { amountCents: 1000, type: "cash", memo: "E2E desk credit" },
    });
    if (!ledgerOn) {
      expect(adminCredit.status()).toBe(400);
      const msg = ((await adminCredit.json()) as { message?: string }).message ?? "";
      expect(msg).toMatch(/not enabled/i);
    } else {
      expect(adminCredit.status(), await adminCredit.text()).toBe(201);
      const posted = await adminCredit.json();
      expect(posted.data.entry.type).toBe("cash");
      expect(posted.data.entry.amountCents).toBe(1000);

      // Refunds require a non-negative balance. Prior flight charges can leave the
      // member underwater; only assert the refund path when the credit brought them up.
      const balanceAfter = Number(posted.data.balanceCents ?? 0);
      if (balanceAfter >= 1000) {
        const refund = await request.post(`${base}/orgUsers/${studentId}/ledger/refunds`, {
          headers: owner.headers,
          data: {
            amountCents: 1000,
            method: "check_cash",
            memo: "E2E reverse desk credit",
          },
        });
        expect(refund.status(), await refund.text()).toBe(201);
      }
    }
  });
});

test.describe("Ledger UI (owner)", () => {
  test("Settings → Billing shows billing enabled and how-members-pay cards", async ({
    page,
  }) => {
    await page.goto("/settings?tab=billing");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByLabel("Billing enabled")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("How members pay", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /invoice each booking/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /account ledger/i })).toBeVisible();
  });

  test("/me Add funds is offered when ledger mode is on", async ({ page }) => {
    await page.goto("/me");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(/account balance|outstanding|invoices/i, {
      timeout: 30_000,
    });

    const addFunds = page.getByRole("button", { name: /^Add funds$/i });
    if (await addFunds.isVisible().catch(() => false)) {
      await addFunds.click();
      await expect(page.getByRole("dialog", { name: /add funds/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByText(/minimum \$1/i)).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByRole("link", { name: /invoices/i }).first()).toBeVisible();
    }
  });

  test("People billing tab: desk credit / refund / adjustment when ledger is on", async ({
    page,
    request,
  }) => {
    const owner = await authAs(request, ACCOUNTS.owner);
    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );

    await page.goto(`/people/${studentId}?tab=billing`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Billing", exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const ledgerCard = page.getByText("Account ledger", { exact: true });
    if (!(await ledgerCard.isVisible().catch(() => false))) {
      await expect(page.getByText(/invoice/i).first()).toBeVisible();
      return;
    }

    await expect(page.getByRole("button", { name: /^Add credit$/i })).toBeVisible();
    await page.getByRole("button", { name: /^Add credit$/i }).click();
    await expect(page.getByRole("dialog", { name: /add credit/i })).toBeVisible();
    await expect(page.getByText(/cash, check, or other/i)).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    await page.getByRole("button", { name: /^Adjustment$/i }).click();
    await expect(page.getByRole("dialog", { name: /adjustment/i })).toBeVisible();
    await expect(page.getByText(/not a substitute for refunds|true corrections/i)).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    const refund = page.getByRole("button", { name: /^Refund$/i });
    if (await refund.isVisible().catch(() => false)) {
      await refund.click();
      await expect(page.getByRole("dialog", { name: /^Refund$/i })).toBeVisible();
      await expect(page.getByText(/check \/ cash|original card/i).first()).toBeVisible();
      await page.getByRole("button", { name: /^Cancel$/i }).click();
    }
  });
});

test.describe("Ledger L3 receipt / reassign API", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("GET receipt for item_charge; student can read own, cannot reassign", async ({
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const student = await authAs(request, ACCOUNTS.student);
    const studentId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.student);

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    const ledgerOn = (await ledgerSettings.json()).data?.enabled === true;
    test.skip(!ledgerOn, "ledger mode off — skip L3 receipt/reassign API");

    const memo = `E2E L3 receipt ${Date.now()}`;
    const created = await request.post(`${base}/invoices`, {
      headers: owner.headers,
      data: {
        customer: { id: studentId },
        items: [{ name: "E2E desk charge", qty: 1, unitPrice: 2500 }],
        memo,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data.isLedgerCharge).toBe(true);
    const entryId = (createdBody.data.ledgerEntryId ?? createdBody.data.id) as number;
    expect(entryId).toBeTruthy();

    const ownerReceipt = await request.get(
      `${base}/orgUsers/${studentId}/ledger/entries/${entryId}/receipt`,
      { headers: owner.headers },
    );
    expect(ownerReceipt.ok(), await ownerReceipt.text()).toBeTruthy();
    const ownerReceiptBody = await ownerReceipt.json();
    expect(ownerReceiptBody.data.entry).toMatchObject({
      id: entryId,
      type: "item_charge",
    });

    const studentReceipt = await request.get(
      `${base}/orgUsers/${student.orgUserId}/ledger/entries/${entryId}/receipt`,
      { headers: student.headers },
    );
    expect(studentReceipt.ok(), await studentReceipt.text()).toBeTruthy();

    const studentReassign = await request.post(
      `${base}/orgUsers/${student.orgUserId}/ledger/entries/${entryId}/reassign`,
      {
        headers: student.headers,
        data: { toOrgUserId: owner.orgUserId },
      },
    );
    expect(studentReassign.status()).toBe(400);

    const cash = await request.post(`${base}/orgUsers/${studentId}/ledger/entries`, {
      headers: owner.headers,
      data: { amountCents: 500, type: "cash", memo: `E2E no-receipt ${Date.now()}` },
    });
    expect(cash.status(), await cash.text()).toBe(201);
    const cashBody = await cash.json();
    const cashId = cashBody.data.entry.id as number;
    const cashReceipt = await request.get(
      `${base}/orgUsers/${studentId}/ledger/entries/${cashId}/receipt`,
      { headers: owner.headers },
    );
    expect(cashReceipt.status()).toBe(400);
  });

  test("flight_charge via reservation invoices; reassign API moves money", async ({
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const studentId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.student);
    const renterId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.renter);

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    const ledgerOn = (await ledgerSettings.json()).data?.enabled === true;
    test.skip(!ledgerOn, "ledger mode off — skip L3 flight_charge reassign API");

    const notes = `E2E-UI-ledger-flight-${Date.now()}`;
    const { entryId, reservationId } = await postLedgerFlightCharge({
      request,
      ownerHeaders: owner.headers,
      studentId,
      notesMarker: notes,
    });

    const receipt = await request.get(
      `${base}/orgUsers/${studentId}/ledger/entries/${entryId}/receipt`,
      { headers: owner.headers },
    );
    expect(receipt.ok(), await receipt.text()).toBeTruthy();
    expect((await receipt.json()).data.entry.type).toBe("flight_charge");

    const missing = await request.get(
      `${base}/orgUsers/${studentId}/ledger/entries/999999999/receipt`,
      { headers: owner.headers },
    );
    expect(missing.status()).toBe(404);

    const selfReassign = await request.post(
      `${base}/orgUsers/${studentId}/ledger/entries/${entryId}/reassign`,
      {
        headers: owner.headers,
        data: { toOrgUserId: studentId },
      },
    );
    expect(selfReassign.status()).toBe(400);

    // Unbilled list must not include a ledger-staked reservation.
    const nowISO = new Date().toISOString();
    const startISO = new Date(Date.now() - 30 * 864e5).toISOString();
    const unbilled = await request.get(`${base}/reservations/`, {
      headers: owner.headers,
      params: {
        startDate: startISO,
        endDate: nowISO,
        uninvoiced: "true",
        endedBefore: nowISO,
      },
    });
    expect(unbilled.ok(), await unbilled.text()).toBeTruthy();
    const unbilledBody = await unbilled.json();
    const unbilledRows = (unbilledBody.data ?? unbilledBody) as Array<{ id: number }>;
    expect(Array.isArray(unbilledRows)).toBeTruthy();
    expect(unbilledRows.some((r) => r.id === reservationId)).toBeFalsy();

    const reassign = await request.post(
      `${base}/orgUsers/${studentId}/ledger/entries/${entryId}/reassign`,
      {
        headers: owner.headers,
        data: { toOrgUserId: renterId, memo: `E2E reassign ${Date.now()}` },
      },
    );
    expect(reassign.ok(), await reassign.text()).toBeTruthy();
    const reassignBody = await reassign.json();
    expect(reassignBody.data.reversal.type).toBe("reversal");
    expect(reassignBody.data.entry.type).toBe("flight_charge");
    expect(reassignBody.data.entry.orgUserId).toBe(renterId);

    const again = await request.post(
      `${base}/orgUsers/${studentId}/ledger/entries/${entryId}/reassign`,
      {
        headers: owner.headers,
        data: { toOrgUserId: renterId },
      },
    );
    expect(again.status()).toBe(400);
  });
});

test.describe("Ledger L3 receipt / reassign UI (owner)", () => {
  test.afterAll(async ({ request }) => {
    await cleanupE2eReservations(request);
  });

  test("Receipt on charge rows; Reassign only for flight_charge", async ({
    page,
    request,
  }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );
    const renterId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.renter);

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    const ledgerOn = (await ledgerSettings.json()).data?.enabled === true;
    if (!ledgerOn) {
      test.skip(true, "ledger mode off — skip L3 receipt/reassign UI");
      return;
    }

    const memo = `E2E L3 UI charge ${Date.now()}`;
    const created = await request.post(`${base}/invoices`, {
      headers: owner.headers,
      data: {
        customer: { id: studentId },
        items: [{ name: "E2E UI desk charge", qty: 1, unitPrice: 1800 }],
        memo,
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.data.isLedgerCharge).toBe(true);

    const notes = `E2E-UI-ledger-ui-flight-${Date.now()}`;
    const { entryId: flightEntryId } = await postLedgerFlightCharge({
      request,
      ownerHeaders: owner.headers,
      studentId,
      notesMarker: notes,
    });

    const renterRes = await request.get(`${base}/orgUsers/${renterId}`, {
      headers: owner.headers,
    });
    expect(renterRes.ok(), await renterRes.text()).toBeTruthy();
    const renterBody = await renterRes.json();
    const renterName =
      (renterBody.data?.user?.name as string | undefined) ??
      (renterBody.data?.identifier as string | undefined) ??
      "";

    await page.goto(`/people/${studentId}?tab=billing`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Account ledger", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // You-nav → /me/invoices is labeled Billing in ledger mode.
    await expect(page.locator('a[href="/me/invoices"]').filter({ hasText: /^Billing$/i })).toBeVisible();

    const chargeRow = page.getByRole("row").filter({ hasText: memo });
    await expect(chargeRow).toBeVisible({ timeout: 15_000 });
    await expect(chargeRow.getByText(/^Charge$/)).toBeVisible();
    await expect(chargeRow.getByRole("button", { name: /^Receipt$/i })).toBeVisible();
    await expect(chargeRow.getByRole("button", { name: /^Reassign$/i })).toHaveCount(0);

    await chargeRow.getByRole("button", { name: /^Receipt$/i }).click();
    await expect(page.getByRole("dialog").filter({ hasText: /^Receipt/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^Print$/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog").filter({ hasText: /^Receipt/i })).toBeHidden();

    const flightRow = page
      .getByRole("row")
      .filter({ has: page.getByText(/^Flight$/) })
      .filter({ has: page.getByRole("button", { name: /^Reassign$/i }) })
      .first();
    await expect(flightRow.getByRole("button", { name: /^Receipt$/i })).toBeVisible({
      timeout: 15_000,
    });
    await flightRow.getByRole("button", { name: /^Reassign$/i }).click();
    await expect(
      page.getByRole("dialog", { name: /reassign flight charge/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/new payer/i)).toBeVisible();
    await expect(page.getByLabel(/find member/i)).toBeVisible();

    if (renterName) {
      await page.getByLabel(/find member/i).fill(renterName.slice(0, Math.min(6, renterName.length)));
      await page.getByRole("combobox").click();
      await expect(page.getByRole("option").first()).toBeVisible({ timeout: 10_000 });
      // Self is never an option — dialog filters orgUserId out.
      await expect(
        page.getByRole("option", { name: new RegExp(`Member #${studentId}\\b`) }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: /reassign flight charge/i }),
    ).toBeHidden();

    // Reassign via API (no schedule UI), then confirm People tab drops Reassign.
    const reassign = await request.post(
      `${base}/orgUsers/${studentId}/ledger/entries/${flightEntryId}/reassign`,
      {
        headers: owner.headers,
        data: { toOrgUserId: renterId, memo: `E2E UI reassign ${Date.now()}` },
      },
    );
    expect(reassign.ok(), await reassign.text()).toBeTruthy();

    await page.reload();
    await expect(page.getByText("Account ledger", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Reversal appears for the moved flight_charge; original no longer offers Reassign
    // (other historic flights may still show Reassign — don't assert a global count of 0).
    await expect(page.getByText(/^Reversal$/).first()).toBeVisible({ timeout: 15_000 });

    const ledger = await request.get(`${base}/orgUsers/${studentId}/ledger`, {
      headers: owner.headers,
    });
    expect(ledger.ok(), await ledger.text()).toBeTruthy();
    const entries = ((await ledger.json()).data?.entries ?? []) as Array<{
      id: number;
      type: string;
      reversesId?: number | null;
      reversedBy?: { id: number } | null;
    }>;
    expect(entries.some((e) => e.id === flightEntryId)).toBeTruthy();
    expect(
      entries.some((e) => e.type === "reversal" && e.reversesId === flightEntryId),
    ).toBeTruthy();
    const original = entries.find((e) => e.id === flightEntryId);
    expect(original?.reversedBy != null || entries.some((e) => e.reversesId === flightEntryId)).toBeTruthy();
  });
});

test.describe("Ledger L3 /me receipt (student)", () => {
  test.use({ storageState: ".auth/student.json" });

  test("Account ledger Receipt without Reassign", async ({ page, request }) => {
    const base = apiBase();
    const owner = await authAs(request, ACCOUNTS.owner);
    const studentId = await orgUserIdForEmail(request, owner.headers, ACCOUNTS.student);

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    const ledgerOn = (await ledgerSettings.json()).data?.enabled === true;
    if (!ledgerOn) {
      test.skip(true, "ledger mode off — skip /me ledger receipt UI");
      return;
    }

    const memo = `E2E L3 me receipt ${Date.now()}`;
    const created = await request.post(`${base}/invoices`, {
      headers: owner.headers,
      data: {
        customer: { id: studentId },
        items: [{ name: "E2E me desk charge", qty: 1, unitPrice: 1200 }],
        memo,
      },
    });
    expect(created.status(), await created.text()).toBe(201);

    await page.goto("/me/invoices");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Billing/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("textbox", { name: /search your ledger/i })).toBeVisible();
    const chargeRow = page.getByRole("row").filter({ hasText: memo });
    await expect(chargeRow).toBeVisible({ timeout: 15_000 });
    await expect(chargeRow.getByRole("button", { name: /^Receipt$/i })).toBeVisible();
    await expect(chargeRow.getByRole("button", { name: /^Reassign$/i })).toHaveCount(0);

    await chargeRow.getByRole("button", { name: /^Receipt$/i }).click();
    await expect(page.getByRole("dialog").filter({ hasText: /^Receipt/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^Print$/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
