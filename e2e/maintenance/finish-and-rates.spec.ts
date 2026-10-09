import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * MURRAY'S SECOND WEEK OF WORK ORDERS (2026-10-09), each kept fixed:
 *  - a customer's job completed with charges and no invoice is asked about first, and once it is
 *    finished unbilled the Finished list says Not invoiced (WO-1003 went that way with $850 on it);
 *  - a customer's own rates price the next line, from the console and from a technician alike,
 *    and a job can set its own (a staff annual was typed in at $45/h on every line);
 *  - adding an owner who is already on the roster finds them before anything is saved (every
 *    owner Murray's staff added came back "already a member with that email").
 *
 * Self-contained: its own customer aircraft and owner (E2E- prefixed), removed at the end.
 */
test.describe.configure({ mode: "serial" });

const base = () => apiProxyTarget().replace(/\/$/, "");
const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}F`;
const OWNER_NAME = `E2E-Bryan Staffer ${TAIL.slice(-5)}`;

async function tokenFor(request: APIRequestContext, email: string) {
  const res = await request.post(`${base()}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `auth ${email}`).toBeTruthy();
  return { Authorization: `Bearer ${(await res.json()).auth.accessToken as string}` };
}
const unwrap = async (res: import("@playwright/test").APIResponse) => {
  const body = await res.json();
  return body?.data ?? body;
};

/** The console remounts once shortly after a full load: wait for the node that stays. */
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
let resourceId: number;
let customerId: number;
let customerUserId: number;
const jobIds: number[] = [];

async function openJob(request: APIRequestContext, status = "ready") {
  const res = await request.post(`${base()}/work-orders`, {
    headers: owner,
    data: { resourceId, status, complaint: "E2E-Annual inspection", billToOrgUserId: customerId, holdOwnerNotices: true },
  });
  expect(res.status(), await res.text()).toBe(201);
  const job = await unwrap(res);
  jobIds.push(job.id);
  return job as { id: number; label: string };
}

test.beforeAll(async ({ request }) => {
  owner = await tokenFor(request, ACCOUNTS.owner);
  const locations = await unwrap(await request.get(`${base()}/locations`, { headers: owner }));
  const created = await request.post(`${base()}/resources`, {
    headers: owner,
    data: {
      location: { id: locations[0].id },
      use: "shop",
      type: { plane: { tailNumber: TAIL, make: "Piper", model: "PA-28-180", year: "1963", category: "airplane", aircraftClass: "single_engine_land", meterMode: "tach_only", tachTime: 6147, fuelCapacity: 0, fuelMeasurement: "gallons" } },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  resourceId = (await created.json()).data.id;
  const added = await request.post(`${base()}/resources/${resourceId}/owners`, {
    headers: owner,
    data: { name: OWNER_NAME, email: `e2e.staff.${TAIL.toLowerCase()}@example.com`, isPrimary: true },
  });
  expect(added.status(), await added.text()).toBe(201);
  const owners = await unwrap(await request.get(`${base()}/resources/${resourceId}/owners`, { headers: owner }));
  customerId = owners[0].orgUser.id;
  customerUserId = owners[0].orgUser.user.id;
});

test.afterAll(async ({ request }) => {
  const h = owner ?? (await tokenFor(request, ACCOUNTS.owner));
  for (const id of jobIds) await request.delete(`${base()}/work-orders/${id}`, { headers: h });
  if (customerUserId) await request.patch(`${base()}/users/${customerUserId}/orgUser/archive`, { headers: h, data: { archived: true } });
  if (resourceId) await request.delete(`${base()}/resources/${resourceId}`, { headers: h });
});

test("a customer's rates price the next line, from the console and from a technician; a job can set its own", async ({ request }) => {
  const set = await request.patch(`${base()}/orgUsers/${customerId}/customer`, { headers: owner, data: { laborRateCents: 4500, partsMarkupBps: 0 } });
  expect(set.status(), await set.text()).toBe(200);
  const job = await openJob(request, "in_progress");
  const record = await unwrap(await request.get(`${base()}/work-orders/${job.id}`, { headers: owner }));
  expect(record.rates).toMatchObject({ laborRateCents: 4500, partsMarkupBps: 0, from: { laborRateCents: "customer", partsMarkupBps: "customer" } });

  const labor = await unwrap(await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: owner, data: { category: "labor", description: "E2E-Inspection", minutes: 450 } }));
  expect(labor.unitPriceCents).toBe(33750);
  const part = await unwrap(await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: owner, data: { category: "part", description: "E2E-Gasket", qty: 4, costCents: 1256 } }));
  expect(part.unitPriceCents, "parts at cost for this customer").toBe(1256);

  // A technician enters work at the job's rates, never their own.
  const tech = await tokenFor(request, ACCOUNTS.technician);
  const techLine = await unwrap(await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: tech, data: { category: "labor", description: "E2E-Tech hour", minutes: 60 } }));
  expect(techLine.unitPriceCents).toBe(4500);
  expect((await request.patch(`${base()}/work-orders/${job.id}`, { headers: tech, data: { laborRateCents: 1 } })).status()).toBe(403);

  // The job's own rate wins over the customer's.
  const own = await unwrap(await request.patch(`${base()}/work-orders/${job.id}`, { headers: owner, data: { laborRateCents: 9000 } }));
  expect(own.rates.from.laborRateCents).toBe("job");
  const after = await unwrap(await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: owner, data: { category: "labor", description: "E2E-Quoted hour", minutes: 60 } }));
  expect(after.unitPriceCents).toBe(9000);
});

test("completing a customer's unbilled job asks first; completed without an invoice it reads Not billed, and Bill it after all puts it back", async ({ page, request }) => {
  const job = await openJob(request, "ready");
  await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: owner, data: { category: "labor", description: "E2E-Oil change", minutes: 120 } });

  await page.goto(`/maintenance/work-orders/${job.id}`);
  await settled(page, '[aria-label="Stage"]');
  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name: /^Completed/ }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask.getByText(`${job.label} isn't invoiced yet`)).toBeVisible();
  await expect(ask.getByRole("button", { name: "Raise the invoice" })).toBeVisible();

  const saved = page.waitForResponse((r) => r.url().includes(`/work-orders/${job.id}`) && r.request().method() === "PATCH");
  await ask.getByRole("button", { name: "Complete without an invoice" }).click();
  const body = await (await saved).json();
  expect(body.data.status).toBe("completed");
  expect(body.data.noInvoiceAt).not.toBeNull();
  expect(body.data.notInvoiced).toBe(false);
  await expect(page.getByText("Not billed", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Bill it after all" }).click();
  await expect(page.getByTestId("job-not-invoiced")).toBeVisible();
  await expect(page.getByText("Not invoiced", { exact: true }).first()).toBeVisible();

  await page.goto("/maintenance?view=work-orders-closed");
  const row = page.getByRole("row").filter({ hasText: job.label });
  await expect(row.getByText("Not invoiced")).toBeVisible();
});

test("Add owner finds somebody already on the roster before anything is saved", async ({ page }) => {
  await page.goto(`/aircraft/${resourceId}?tab=owners`);
  await settled(page, "main");
  await page.getByRole("button", { name: "Add owner" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Who" }).click();
  await page.getByPlaceholder("Search by name or email…").fill("test-admin@");
  await page.getByText("Add a new person").click();
  await dialog.getByLabel("Email").fill(ACCOUNTS.admin);
  await expect(dialog.getByTestId("roster-match")).toContainText("already on your roster with this email");
  await expect(dialog.getByRole("button", { name: "Add owner" })).toBeDisabled();
});
