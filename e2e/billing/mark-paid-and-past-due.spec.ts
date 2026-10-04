import { test, expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { uiLogin } from "../helpers/api";

/**
 * Murray spec sections 13, 14 and 16 on one bill, end to end against the local API and the
 * organization's TEST-mode Stripe account:
 *
 * - an unpaid bill past its due date reads Past due, to the desk and to the person billed;
 * - the desk's Mark paid records a check, its number and the day it came; the bill then says
 *   "Paid by check #1234 on ..." on both sides, and the desk's note never reaches the payer;
 * - the bill-to block carries the billing address the shop keeps;
 * - files on the bill: shown to the owner or kept to the shop, and every refusal reads the same
 *   for a real invoice and an absent id.
 *
 * The bill is raised to the test aircraft owner (an outside party, so a `work_order` kind) by
 * POST /invoices with a due date in the past, which needs the test organization connected to a
 * test Stripe account. Without one the suite skips and says so.
 */

const AIRCRAFT_OWNER = "test-aircraft-owner@aerscheduler.com";
const STAMP = Date.now();
const MEMO = `E2E-PAID-${STAMP}`;
const NOTE = `E2E desk note ${STAMP}`;
const ADDRESS = "E2E Aviation LLC\n12 Taxiway B\nIdaho Falls, ID 83402";
const ABSENT = 999_999_993;

type Session = { headers: Record<string, string>; orgUserId: number };

const base = () => apiProxyTarget().replace(/\/$/, "");
const unwrap = async (res: APIResponse) => {
  const body = await res.json();
  return body?.data ?? body;
};

async function session(request: APIRequestContext, email: string): Promise<Session> {
  const res = await request.post(`${base()}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `auth failed for ${email}`).toBeTruthy();
  const body = await res.json();
  return {
    headers: { Authorization: `Bearer ${body.auth.accessToken as string}` },
    orgUserId: body.data?.user?.orgUsers?.[0]?.id as number,
  };
}

/** The console remounts a moment after a full load; wait for the node to stop being replaced. */
async function settled(page: Page, selector: string) {
  await page.locator(selector).first().waitFor();
  await expect
    .poll(
      async () => {
        await page.evaluate((sel) => ((window as unknown as { __settle: Element | null }).__settle = document.querySelector(sel)), selector);
        await page.waitForTimeout(1500);
        return page.evaluate((sel) => (window as unknown as { __settle: Element | null }).__settle === document.querySelector(sel), selector);
      },
      { timeout: 20_000 }
    )
    .toBe(true);
}

async function uploadPresigned(request: APIRequestContext, signed: { url: string; fields: Record<string, string> }, fileName: string) {
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = { ...signed.fields };
  multipart.file = { name: fileName, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") };
  const res = await request.post(signed.url, { multipart });
  expect(res.status(), await res.text()).toBeLessThan(300);
}

let owner: Session;
let aircraftOwner: Session;
let student: Session;
let invoiceId: number;
let previousAddress: string | null = null;

test.describe.serial("Mark paid by check, and past due", () => {
  test.beforeAll(async ({ request }) => {
    owner = await session(request, ACCOUNTS.owner);
    aircraftOwner = await session(request, AIRCRAFT_OWNER);
    student = await session(request, ACCOUNTS.student);
    expect(aircraftOwner.orgUserId, "the test aircraft owner has a membership").toBeTruthy();

    // The billing address the shop keeps for them (put back afterwards).
    const profile = await request.get(`${base()}/orgUsers/${aircraftOwner.orgUserId}/customer`, { headers: owner.headers });
    previousAddress = profile.ok() ? ((await unwrap(profile))?.billingAddress ?? null) : null;
    const saved = await request.patch(`${base()}/orgUsers/${aircraftOwner.orgUserId}/customer`, {
      headers: owner.headers,
      data: { billingAddress: ADDRESS },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    // A bill due two days ago: past due the moment it exists.
    const raised = await request.post(`${base()}/invoices`, {
      headers: owner.headers,
      data: {
        customer: { id: aircraftOwner.orgUserId },
        items: [{ name: `${MEMO} labor`, qty: 1, unitPrice: 4500, category: "labor" }],
        memo: MEMO,
        dueAt: new Date(Date.now() - 2 * 864e5).toISOString(),
        dueIn: 0,
      },
    });
    test.skip(!raised.ok(), `Raising a bill needs the test organization connected to a test Stripe account: ${raised.status()} ${await raised.text()}`);
    invoiceId = (await unwrap(raised)).id;
  });

  test.afterAll(async ({ request }) => {
    if (!owner || !aircraftOwner) return;
    await request
      .patch(`${base()}/orgUsers/${aircraftOwner.orgUserId}/customer`, { headers: owner.headers, data: { billingAddress: previousAddress } })
      .catch(() => undefined);
  });

  test("a bill past its due date reads Past due, and the filter finds it", async ({ page, request }) => {
    const overdue = await request.get(`${base()}/invoices?overdue=true&q=${encodeURIComponent(MEMO)}`, { headers: owner.headers });
    expect(overdue.ok()).toBeTruthy();
    expect(((await unwrap(overdue)) as { id: number }[]).map((r) => r.id)).toContain(invoiceId);

    await page.goto(`/billing?invoice=${invoiceId}`);
    const panel = page.locator('[data-doc-shot="invoice-detail-panel"]');
    await settled(page, '[data-doc-shot="invoice-detail-panel"]');
    await expect(page.locator('[data-status="past_due"]').first()).toHaveText("Past due");
    // Who the bill is to, with the billing address the shop keeps.
    await expect(panel.getByTestId("invoice-bill-to")).toContainText("12 Taxiway B");
    await expect(panel.getByTestId("invoice-bill-to")).toContainText("Idaho Falls, ID 83402");

    // The Past due status filter lists it.
    await page.goto(`/billing?status=past_due&q=${encodeURIComponent(MEMO)}`);
    await expect(page.getByRole("cell", { name: `#${invoiceId}`, exact: true })).toBeVisible();
  });

  test("the API refuses what a desk could get wrong, before anything is written", async ({ request }) => {
    const patch = (data: Record<string, unknown>) => request.patch(`${base()}/invoices/${invoiceId}`, { headers: owner.headers, data });

    const checkOnCash = await patch({ markPaid: true, paymentMethod: "cash", checkNumber: "1234" });
    expect(checkOnCash.status()).toBe(400);
    expect((await checkOnCash.json()).message).toMatch(/goes with a payment by check/);

    const future = await patch({ markPaid: true, paymentMethod: "cash", paymentReceivedOn: "2099-01-01" });
    expect(future.status()).toBe(400);
    expect((await future.json()).message).toBe("The date received cannot be in the future.");

    const onAVoid = await patch({ markVoided: true, checkNumber: "1234" });
    expect(onAVoid.status()).toBe(400);

    const stillOpen = await unwrap(await request.get(`${base()}/invoices/${invoiceId}`, { headers: owner.headers }));
    expect(stillOpen.paidAt).toBeNull();
    expect(stillOpen.voidedAt).toBeNull();
  });

  test("the desk marks it paid by check, with the number, the day and a note", async ({ page }) => {
    await page.goto(`/billing?invoice=${invoiceId}`);
    await settled(page, '[data-doc-shot="invoice-detail-panel"]');
    await page.getByRole("button", { name: "Mark paid" }).click();

    const dialog = page.getByRole("dialog", { name: `Mark invoice #${invoiceId} paid` });
    await expect(dialog).toBeVisible();
    // No method chosen: refused in the form, nothing sent.
    await dialog.getByRole("button", { name: "Mark paid" }).click();
    await expect(dialog.getByText("Choose how it was paid.")).toBeVisible();

    await dialog.locator("#mark-paid-method").click();
    await page.getByRole("option", { name: "Check" }).click();
    await dialog.getByLabel("Check number").pressSequentially("1234");
    await dialog.getByLabel("Note").pressSequentially(NOTE);

    const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/invoices/${invoiceId}`));
    await dialog.getByRole("button", { name: "Mark paid" }).click();
    const res = await saved;
    expect(res.status(), await res.text()).toBe(200);
    const paid = (await res.json()).data;
    expect(paid.paymentMethod).toBe("check");
    expect(paid.checkNumber).toBe("1234");
    expect(paid.paymentNote).toBe(NOTE);
    // A calendar day, today in the organization's calendar: never in the future.
    const day = String(paid.paymentReceivedOn).slice(0, 10);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${day}T00:00:00Z`).getTime()).toBeLessThanOrEqual(Date.now() + 864e5);

    await expect(dialog).toBeHidden();
    const summary = page.getByTestId("invoice-payment-summary");
    await expect(summary).toContainText("Paid by check #1234 on");
    await expect(summary).toContainText(NOTE);
    await expect(page.locator('[data-status="paid"]').first()).toBeVisible();
  });

  test("the owner reads how they paid and who the bill is to, never the desk's note", async ({ browser, request }) => {
    const bill = await unwrap(await request.get(`${base()}/invoices/${invoiceId}`, { headers: aircraftOwner.headers }));
    expect(bill.paymentMethod).toBe("check");
    expect(bill.checkNumber).toBe("1234");
    expect(bill).not.toHaveProperty("paymentNote");
    expect(bill.billTo?.billingAddress).toContain("12 Taxiway B");

    // Their own browser, signed in as them.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await uiLogin(page, AIRCRAFT_OWNER);
    await page.goto(`/me/invoices?invoice=${invoiceId}`);
    const summary = page.getByTestId("invoice-payment-summary");
    await expect(summary).toContainText("Paid by check #1234 on");
    await expect(page.getByText(NOTE)).toHaveCount(0);
    await expect(page.getByTestId("invoice-bill-to")).toContainText("12 Taxiway B");
    await context.close();
  });

  test("files: shown to the owner or kept to the shop, and refusals equal for real and absent ids", async ({ browser, request }) => {
    const attach = async (fileName: string, visibility: "owner" | "shop") => {
      const res = await request.post(`${base()}/invoices/${invoiceId}/files`, {
        headers: owner.headers,
        data: { fileNames: [fileName], visibility },
      });
      expect(res.status(), await res.text()).toBe(201);
      const body = await res.json();
      await uploadPresigned(request, body.signedUrlData[0], fileName);
      return body.data[0] as { id: number };
    };
    await attach(`E2E-vendor-${STAMP}.pdf`, "owner");
    await attach(`E2E-shop-${STAMP}.pdf`, "shop");

    // The person billed: only what was shown to them, in their shape.
    const theirs = (await unwrap(await request.get(`${base()}/invoices/${invoiceId}/files`, { headers: aircraftOwner.headers }))) as Record<string, unknown>[];
    expect(theirs.map((f) => f.fileName)).toEqual([`E2E-vendor-${STAMP}.pdf`]);
    expect(theirs[0]).not.toHaveProperty("uploadedBy");

    // The admin: both.
    const all = (await unwrap(await request.get(`${base()}/invoices/${invoiceId}/files`, { headers: owner.headers }))) as unknown[];
    expect(all.length).toBeGreaterThanOrEqual(2);

    // A member who is not billed reads a real invoice exactly like an absent one.
    const real = await request.get(`${base()}/invoices/${invoiceId}/files`, { headers: student.headers });
    const absent = await request.get(`${base()}/invoices/${ABSENT}/files`, { headers: student.headers });
    expect(real.status()).toBe(absent.status());
    expect(await real.text()).toBe(await absent.text());

    // The person billed may read, not attach; an absent id answers the same.
    const ownerAttach = await request.post(`${base()}/invoices/${invoiceId}/files`, { headers: aircraftOwner.headers, data: { fileNames: ["x.pdf"] } });
    const ownerAttachAbsent = await request.post(`${base()}/invoices/${ABSENT}/files`, { headers: aircraftOwner.headers, data: { fileNames: ["x.pdf"] } });
    expect(ownerAttach.status()).toBe(403);
    expect(await ownerAttach.text()).toBe(await ownerAttachAbsent.text());

    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await uiLogin(page, AIRCRAFT_OWNER);
    await page.goto(`/me/invoices?invoice=${invoiceId}`);
    const files = page.getByTestId("invoice-files");
    await expect(files).toContainText(`E2E-vendor-${STAMP}.pdf`);
    await expect(files).not.toContainText(`E2E-shop-${STAMP}.pdf`);
    await context.close();
  });
});
