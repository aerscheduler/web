import fs from "node:fs";
import path from "node:path";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * A work order's bill against REAL test-mode Stripe, end to end, as each person who touches it:
 * the desk raises it from the job page (with a due date picked on the calendar), Stripe holds the
 * invoice the preview promised, the card pays it, the webhook marks the job paid; a technician
 * adds work but cannot raise it; a dispatcher cannot read it; a member billed for a job sees it
 * with their own invoices and pays it; voiding a bill frees the job's lines again.
 *
 * Off unless STRIPE_E2E=1, because it needs what the ordinary stack does not have:
 *   1. the test org connected to a test-mode Stripe account with charges enabled
 *      (`organization_billing_settings`: enabled, stripeEnabled, stripeAccountId; see the
 *      stripe-local skill), and
 *   2. `server/bin/stripe-listen.sh` forwarding webhooks to the API, or nothing is ever paid.
 * It reads the test secret key from server/.env and refuses a live one.
 */
test.describe.configure({ mode: "serial" });
test.skip(process.env.STRIPE_E2E !== "1", "Set STRIPE_E2E=1 with a connected test Stripe account and stripe-listen running");

const base = () => apiProxyTarget().replace(/\/$/, "");
const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}S`;
const OWNER_NAME = `E2E-Ruth Calder ${TAIL.slice(-5, -1)}`;
const OWNER_EMAIL = `e2e.stripe.${TAIL.toLowerCase()}@example.com`;

function stripeKey(): string {
  const env = fs.readFileSync(path.resolve(process.cwd(), "../server/.env"), "utf8");
  const key = /^STRIPE_SECRET_KEY=(.+)$/m.exec(env)?.[1]?.trim() ?? "";
  if (!key.startsWith("sk_test_")) throw new Error("Not a test-mode Stripe key: refusing to run.");
  return key;
}

async function stripe(method: "GET" | "POST", url: string, account: string, form?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${url}`, {
    method,
    headers: { Authorization: `Bearer ${stripeKey()}`, "Stripe-Account": account, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${url}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

async function tokenFor(request: APIRequestContext, email: string) {
  const res = await request.post(`${base()}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `auth ${email}`).toBeTruthy();
  return { Authorization: `Bearer ${(await res.json()).auth.accessToken as string}` };
}

const unwrap = async (res: import("@playwright/test").APIResponse) => {
  const body = await res.json();
  return body?.data ?? body;
};

/** See work-orders.spec.ts: the console remounts once after a full load. */
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

let owner: Record<string, string>;
let account: string;
let resourceId: number;
let ownerOrgUserId: number;
const jobIds: number[] = [];

type Job = { id: number; label: string; billing: "none" | "invoiced" | "paid"; invoice: { id: number; total: number; paidAt: string | null; dueAt: string | null } | null };
const job = async (request: APIRequestContext, id: number) => (await unwrap(await request.get(`${base()}/work-orders/${id}`, { headers: owner }))) as Job;

/** The customer pays it by card, as the hosted invoice page would: a test Visa on file, then paid. */
async function payByCard(inv: { id: string; customer: string }) {
  const card = await stripe("POST", "/payment_methods/pm_card_visa/attach", account, { customer: inv.customer });
  await stripe("POST", `/invoices/${inv.id}/pay`, account, { payment_method: card.id });
}

/** The Stripe invoice this job raised: on the connected account, for this customer, this total. */
async function stripeInvoiceFor(email: string, total: number) {
  const list = await stripe("GET", "/invoices?limit=20", account);
  const found = (list.data as { id: string; customer: string; customer_email: string | null; total: number; status: string; due_date: number | null; lines: { data: { description: string; amount: number }[] } }[]).find(
    (i) => i.customer_email === email && i.total === total
  );
  expect(found, `a Stripe invoice to ${email} for ${total}`).toBeTruthy();
  return found!;
}

test.beforeAll(async ({ request }) => {
  owner = await tokenFor(request, ACCOUNTS.owner);
  const billing = await unwrap(await request.get(`${base()}/organizations/billing`, { headers: owner }));
  account = billing.stripeAccountId;
  expect(billing.stripeEnabled && account, "the test org must be connected to a test Stripe account").toBeTruthy();

  const locations = await unwrap(await request.get(`${base()}/locations`, { headers: owner }));
  const created = await request.post(`${base()}/resources`, {
    headers: owner,
    data: {
      location: { id: locations[0].id },
      use: "shop",
      type: {
        plane: {
          tailNumber: TAIL,
          make: "Beechcraft",
          model: "A36 Bonanza",
          category: "airplane",
          aircraftClass: "single_engine_land",
          meterMode: "hobbs_and_tach",
          hobbsTime: 21040,
          tachTime: 19870,
          fuelCapacity: 7400,
          fuelMeasurement: "gallons",
          cost: { billByHobbsTime: true, wetRate: 0 },
        },
      },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  resourceId = (await created.json()).data.id;
  const added = await request.post(`${base()}/resources/${resourceId}/owners`, {
    headers: owner,
    data: { name: OWNER_NAME, email: OWNER_EMAIL, isPrimary: true },
  });
  expect(added.status(), await added.text()).toBe(201);
  ownerOrgUserId = (await unwrap(await request.get(`${base()}/resources/${resourceId}/owners`, { headers: owner })))[0].orgUser.id;
});

test.afterAll(async ({ request }) => {
  const h = owner ?? (await tokenFor(request, ACCOUNTS.owner));
  // A paid job keeps its bill; the rest are deleted. The aircraft goes when nothing holds it.
  for (const id of jobIds) await request.delete(`${base()}/work-orders/${id}`, { headers: h });
  await request.delete(`${base()}/resources/${resourceId}`, { headers: h });
});

test("the desk raises a job's bill in Stripe, the card pays it, and the job says paid", async ({ page, request }) => {
  const made = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, status: "received", complaint: "E2E-Annual and a squeaky door" } });
  expect(made.status(), await made.text()).toBe(201);
  const w = (await made.json()).data as Job;
  jobIds.push(w.id);

  const line = async (data: Record<string, unknown>, headers = owner) => {
    const res = await request.post(`${base()}/work-orders/${w.id}/lines`, { headers, data });
    expect(res.status(), await res.text()).toBe(201);
  };
  await line({ category: "labor", description: "E2E-Annual inspection", minutes: 600, rateCents: 9500 });
  await line({ category: "part", description: "E2E-Door hinge pin", qty: 2, costCents: 1800, markupBps: 1500 });
  await line({ category: "fee", description: "E2E-Ferry flight", unitPriceCents: 20000, discountBps: 1000 });
  await line({ category: "labor", description: "E2E-Rework on us", minutes: 60, rateCents: 9500, billable: false });

  // The technician enters work, and cannot raise the bill.
  const tech = await tokenFor(request, ACCOUNTS.technician);
  await line({ category: "labor", description: "E2E-Lubricated the door hinge", minutes: 30 }, tech);
  const techRaise = await request.post(`${base()}/work-orders/${w.id}/invoice`, { headers: tech, data: { expectedTotal: 1, dueIn: 0 } });
  expect(techRaise.status()).toBe(403);
  // The dispatcher cannot even read what it will bill.
  const disp = await tokenFor(request, ACCOUNTS.dispatcher);
  expect((await request.post(`${base()}/work-orders/${w.id}/invoice/preview`, { headers: disp, data: {} })).status()).toBe(403);

  // The bill before it is raised: 10 h at $95, 2 x ($18 + 15%), $200 less 10%, 0.5 h at the shop rate; the free hour is not billed.
  const preview = await unwrap(await request.post(`${base()}/work-orders/${w.id}/invoice/preview`, { headers: owner, data: {} }));
  const subtotal = 95000 + 2 * 2070 + 18000;
  expect(preview.subtotal ?? preview.total).toBeGreaterThanOrEqual(subtotal);

  // Raised from the job page, due on a day picked on the calendar.
  await page.goto(`/maintenance/work-orders/${w.id}`);
  await settled(page, '[data-doc-shot="work-order-work"]');
  await page.getByRole("button", { name: "Raise invoice" }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: `Invoice ${OWNER_NAME}` });
  await expect(dlg.getByRole("button", { name: /Raise .* invoice/ })).toBeEnabled({ timeout: 15_000 });
  await dlg.getByRole("combobox", { name: "Due" }).click();
  await page.getByRole("option", { name: "On a date…" }).click();
  // Nothing raised until the day is picked.
  await expect(dlg.getByRole("button", { name: /Raise .* invoice/ })).toBeDisabled();
  await dlg.locator("#wo-invoice-due-on").click();
  const in10 = new Date(Date.now() + 10 * 86_400_000);
  if (in10.getMonth() !== new Date().getMonth()) await page.getByRole("button", { name: /next month/i }).click();
  const month = in10.toLocaleString("en-US", { month: "long" });
  await page.getByRole("button", { name: new RegExp(`${month} ${in10.getDate()}(st|nd|rd|th)?,? ${in10.getFullYear()}`) }).click();
  await expect(dlg.getByText("Due in 10 days, at the end of that day.")).toBeVisible();
  await dlg.getByRole("button", { name: /Raise .* invoice/ }).click();
  await expect(dlg).toBeHidden({ timeout: 30_000 });

  const raised = await job(request, w.id);
  expect(raised.billing).toBe("invoiced");
  expect(raised.invoice?.total).toBe(preview.total);
  // Lines are frozen: the Add menu offers work, never another charge.
  const card = page.locator('[data-doc-shot="work-order-work"]');
  await card.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("option", { name: /^Labor/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Stripe holds exactly that bill, due in ten days, with a line for each charge billed.
  const inv = await stripeInvoiceFor(OWNER_EMAIL, preview.total);
  expect(inv.status).toBe("open");
  const dueDays = Math.round(((inv.due_date ?? 0) * 1000 - Date.now()) / 86_400_000);
  expect(dueDays).toBeGreaterThanOrEqual(9);
  expect(dueDays).toBeLessThanOrEqual(11);
  const described = inv.lines.data.map((l) => l.description).join("\n");
  expect(described).toContain("E2E-Annual inspection");
  expect(described).toContain("E2E-Door hinge pin");
  expect(described).toContain("10% off");
  expect(described).not.toContain("E2E-Rework on us");

  // The owner pays by card; the webhook marks the job paid.
  await payByCard(inv);
  await expect.poll(async () => (await job(request, w.id)).billing, { timeout: 60_000, intervals: [1000] }).toBe("paid");
  await page.reload();
  await settled(page, '[data-doc-shot="work-order-work"]');
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
});

test("a member billed for a job finds it with their own invoices and pays it", async ({ browser, request }) => {
  const student = await tokenFor(request, ACCOUNTS.student);
  const orgUsers = (await unwrap(await request.get(`${base()}/orgUsers`, { headers: owner }))) as { id: number; user?: { email?: string } }[];
  const memberId = orgUsers.find((m) => m.user?.email?.toLowerCase() === ACCOUNTS.student.toLowerCase())!.id;
  const made = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, status: "received", billToOrgUserId: memberId, complaint: "E2E-Member's oil change" } });
  expect(made.status(), await made.text()).toBe(201);
  const w = (await made.json()).data as Job;
  jobIds.push(w.id);
  expect((await request.post(`${base()}/work-orders/${w.id}/lines`, { headers: owner, data: { category: "fee", description: "E2E-Oil change", unitPriceCents: 12500 } })).status()).toBe(201);
  const preview = await unwrap(await request.post(`${base()}/work-orders/${w.id}/invoice/preview`, { headers: owner, data: {} }));
  const raise = await request.post(`${base()}/work-orders/${w.id}/invoice`, { headers: owner, data: { expectedTotal: preview.total, expectedDetails: preview.details?.hash, dueIn: 0 } });
  expect(raise.status(), await raise.text()).toBe(201);
  const invoiceId = (await job(request, w.id)).invoice!.id;

  // The member's own unpaid bills include it, and their invoices page lists it.
  const mine = (await unwrap(await request.get(`${base()}/invoices/orgUsers/${memberId}?paid=false&voided=false&limit=200`, { headers: student }))) as { id: number }[];
  expect(mine.map((r) => r.id)).toContain(invoiceId);
  const ctx = await browser.newContext({ storageState: ".auth/student.json" });
  const page = await ctx.newPage();
  await page.goto("/me/invoices");
  await expect(page.getByText("$125.00").first()).toBeVisible({ timeout: 20_000 });
  await ctx.close();

  // Paid by card in Stripe; the job and the member's bill both say so.
  const memberEmail = ACCOUNTS.student;
  const inv = await stripeInvoiceFor(memberEmail, preview.total);
  await payByCard(inv);
  await expect.poll(async () => (await job(request, w.id)).billing, { timeout: 60_000, intervals: [1000] }).toBe("paid");
});

test("voiding a job's bill frees its lines to change and raise again", async ({ request }) => {
  const made = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, status: "received", complaint: "E2E-Raised in error" } });
  const w = (await made.json()).data as Job;
  jobIds.push(w.id);
  await request.post(`${base()}/work-orders/${w.id}/lines`, { headers: owner, data: { category: "fee", description: "E2E-Wrong fee", unitPriceCents: 5000 } });
  const preview = await unwrap(await request.post(`${base()}/work-orders/${w.id}/invoice/preview`, { headers: owner, data: {} }));
  expect((await request.post(`${base()}/work-orders/${w.id}/invoice`, { headers: owner, data: { expectedTotal: preview.total, expectedDetails: preview.details?.hash, dueIn: 15 } })).status()).toBe(201);
  const invoiceId = (await job(request, w.id)).invoice!.id;
  // Frozen while it is live.
  const frozen = await request.post(`${base()}/work-orders/${w.id}/lines`, { headers: owner, data: { category: "fee", description: "E2E-More", unitPriceCents: 100 } });
  expect(frozen.status()).toBeGreaterThanOrEqual(400);

  const voided = await request.patch(`${base()}/invoices/${invoiceId}`, { headers: owner, data: { markVoided: true } });
  expect(voided.status(), await voided.text()).toBe(200);
  const inv = await stripeInvoiceFor(OWNER_EMAIL, preview.total).catch(() => null);
  if (inv) expect(["void", "uncollectible"]).toContain(inv.status);
  await expect.poll(async () => (await job(request, w.id)).billing, { timeout: 30_000 }).toBe("none");
  const again = await request.post(`${base()}/work-orders/${w.id}/lines`, { headers: owner, data: { category: "fee", description: "E2E-Right fee", unitPriceCents: 4000 } });
  expect(again.status(), await again.text()).toBe(201);
});
