import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "../helpers/env";
import { ownerAuth } from "../helpers/booking-policy";
import { apiBase, authAs, orgUserIdForEmail } from "../helpers/slot-offers";

async function ledgerOn(request: Parameters<typeof ownerAuth>[0]): Promise<boolean> {
  const owner = await ownerAuth(request);
  const res = await request.get(`${apiBase()}/organizations/ledger`, {
    headers: owner.headers,
  });
  if (!res.ok()) return false;
  return (await res.json()).data?.enabled === true;
}

test.describe("Ledger L6 auto-refill, late fees, dispatch fields", () => {
  test("API: auto-refill round-trip, late-fee settings, dispatch policy fields", async ({
    request,
  }) => {
    const owner = await ownerAuth(request);
    const student = await authAs(request, ACCOUNTS.student);
    const base = apiBase();
    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );

    const ledgerSettings = await request.get(`${base}/organizations/ledger`, {
      headers: owner.headers,
    });
    expect(ledgerSettings.ok(), await ledgerSettings.text()).toBeTruthy();
    if ((await ledgerSettings.json()).data?.enabled !== true) {
      test.skip(true, "ledger mode off — skip L6 API");
      return;
    }

    const autoGet = await request.get(`${base}/orgUsers/${studentId}/ledger/auto-refill`, {
      headers: student.headers,
    });
    expect(autoGet.ok(), await autoGet.text()).toBeTruthy();
    expect((await autoGet.json()).data.enabled).toBe(false);

    const autoSave = await request.patch(`${base}/orgUsers/${studentId}/ledger/auto-refill`, {
      headers: student.headers,
      data: {
        enabled: false,
        mode: "under_threshold",
        thresholdCents: 20000,
        chargeCents: 15000,
        cadence: "daily",
      },
    });
    expect(autoSave.ok(), await autoSave.text()).toBeTruthy();
    expect((await autoSave.json()).data).toMatchObject({
      mode: "under_threshold",
      thresholdCents: 20000,
      chargeCents: 15000,
      cadence: "daily",
    });

    const late = await request.patch(`${base}/organizations/ledger`, {
      headers: owner.headers,
      data: { lateFeePercent: 5, lateFeeFlatCents: 1000, lateFeeGraceDays: 14 },
    });
    expect(late.ok(), await late.text()).toBeTruthy();
    expect((await late.json()).data).toMatchObject({
      lateFeePercent: 5,
      lateFeeFlatCents: 1000,
      lateFeeGraceDays: 14,
    });

    const restoreLate = await request.patch(`${base}/organizations/ledger`, {
      headers: owner.headers,
      data: { lateFeePercent: null, lateFeeFlatCents: null, lateFeeGraceDays: null },
    });
    expect(restoreLate.ok(), await restoreLate.text()).toBeTruthy();

    const dispatch = await request.patch(`${base}/organizations`, {
      headers: owner.headers,
      data: {
        bookingPolicy: {
          dispatchMinimumBalanceCents: 10000,
          dispatchBalanceMaximumCents: null,
        },
      },
    });
    expect(dispatch.ok(), await dispatch.text()).toBeTruthy();

    const clearDispatch = await request.patch(`${base}/organizations`, {
      headers: owner.headers,
      data: {
        bookingPolicy: {
          dispatchMinimumBalanceCents: null,
          dispatchBalanceMaximumCents: null,
        },
      },
    });
    expect(clearDispatch.ok(), await clearDispatch.text()).toBeTruthy();
  });

  test("owner settings: late fees + dispatch gates", async ({ page, request }) => {
    if (!(await ledgerOn(request))) {
      test.skip(true, "ledger mode off — skip L6 owner UI");
      return;
    }

    await page.goto("/settings?tab=billing");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Late fees", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("#ledger-late-fee-pct")).toBeVisible();
    await expect(page.getByText(/email a receipt when it posts/i)).toBeVisible();

    await page.goto("/settings?tab=booking-preferences");
    await expect(
      page.getByText("Minimum credit to dispatch", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("Maximum owing to dispatch", { exact: true }),
    ).toBeVisible();
  });

  test("owner people ledger shows auto-refill for the student", async ({
    page,
    request,
  }) => {
    const owner = await ownerAuth(request);
    if (!(await ledgerOn(request))) {
      test.skip(true, "ledger mode off — skip L6 people UI");
      return;
    }
    const studentId = await orgUserIdForEmail(
      request,
      owner.headers,
      ACCOUNTS.student,
    );

    await page.goto(`/people/${studentId}?tab=ledger`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Auto-refill", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByLabel(/Toggle auto-refill/i)).toBeVisible();
  });
});

test.describe("Ledger L6 auto-refill (student)", () => {
  test.use({ storageState: ".auth/student.json" });

  test("student payment methods shows auto-refill", async ({ page, request }) => {
    if (!(await ledgerOn(request))) {
      test.skip(true, "ledger mode off — skip L6 student UI");
      return;
    }

    await page.goto("/me/profile?tab=payments");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Auto-refill", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText(/Charge the default card to add credit/i),
    ).toBeVisible();
    await expect(page.getByLabel(/Toggle auto-refill/i)).toBeVisible();
  });

  test("student statement sends school-local date-only range", async ({
    page,
    request,
  }) => {
    if (!(await ledgerOn(request))) {
      test.skip(true, "ledger mode off — skip L6 student statement");
      return;
    }

    const stmtReq = page.waitForRequest(
      (req) =>
        req.url().includes("/ledger/statement") &&
        req.method() === "GET" &&
        /start=\d{4}-\d{2}-\d{2}/.test(req.url()) &&
        /end=\d{4}-\d{2}-\d{2}/.test(req.url()) &&
        !req.url().includes("T"),
    );
    await page.goto("/me/invoices?tab=ledger");
    await expect(page.getByRole("button", { name: /^Statement$/i })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /^Statement$/i }).click();
    await stmtReq;
    await expect(page.getByLabel(/^From$/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Opening/i).first()).toBeVisible();
  });
});

test.describe("Ledger L6 admin settings", () => {
  test.use({ storageState: ".auth/admin.json" });

  test("admin sees late fees and dispatch gates", async ({ page, request }) => {
    if (!(await ledgerOn(request))) {
      test.skip(true, "ledger mode off — skip L6 admin UI");
      return;
    }
    await page.goto("/settings?tab=billing");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Late fees", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.goto("/settings?tab=booking-preferences");
    await expect(
      page.getByText("Minimum credit to dispatch", { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Ledger L6 dispatcher cannot open settings", () => {
  test.use({ storageState: ".auth/dispatcher.json" });

  test("dispatcher is sent home from settings and ops billing", async ({ page }) => {
    await page.goto("/settings?tab=billing");
    await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
  });
});

test.describe("Ledger L6 instructor cannot open settings", () => {
  test.use({ storageState: ".auth/instructor.json" });

  test("instructor is sent home from settings", async ({ page }) => {
    await page.goto("/settings?tab=booking-preferences");
    await expect(page).toHaveURL(/\/me($|\/|\?)/, { timeout: 20_000 });
  });
});

test.describe("Ledger L6 renter auto-refill", () => {
  test.use({ storageState: ".auth/renter.json" });

  test("renter payment methods shows auto-refill", async ({ page, request }) => {
    if (!(await ledgerOn(request))) {
      test.skip(true, "ledger mode off — skip L6 renter UI");
      return;
    }
    await page.goto("/me/profile?tab=payments");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Auto-refill", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });
});
