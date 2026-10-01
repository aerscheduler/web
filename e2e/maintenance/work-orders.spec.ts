import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * WORK ORDERS: the job itself (open one on a customer's aircraft through the form, move it
 * through its stages, watch the aircraft's chip follow it, check that nobody outside the shop
 * can tell a job exists), its items and the owner's answer, and its labor and parts priced from
 * the shop's rates into the invoice preview. Raising the invoice needs Stripe, so it stops there. Design: _local/maintenance-shop/WORK-ORDER-DESIGN.md.
 *
 * Self-contained: it makes its own customer aircraft and owner (E2E- prefixed), and deletes
 * the jobs, the owner and the aircraft at the end. Jobs go first: a job holds its aircraft.
 */
test.describe.configure({ mode: "serial" });

const base = () => apiProxyTarget().replace(/\/$/, "");
const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}`;
const OWNER_NAME = `E2E-Hannah Voss ${TAIL.slice(-4)}`;
const NO_SUCH_JOB = 999_999_971;

async function tokenFor(request: APIRequestContext, email: string) {
  const res = await request.post(`${base()}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `auth ${email}`).toBeTruthy();
  const token = (await res.json()).auth.accessToken as string;
  return { Authorization: `Bearer ${token}` };
}

/**
 * The console remounts once shortly after a full page load, and anything typed before that is
 * dropped. Wait until `selector` is the element that stays: the same node 1.5 s later.
 */
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

const unwrap = async (res: import("@playwright/test").APIResponse) => {
  const body = await res.json();
  return body?.data ?? body;
};

let owner: Record<string, string>;
let resourceId: number;
let ownerOrgUserId: number;
let ownerUserId: number;
const jobIds: number[] = [];
const bookingIds: number[] = [];
let savedRates: { laborRateCents: number | null; partsMarkupBps: number | null; outsideWorkMarkupBps: number | null } | null = null;

test.beforeAll(async ({ request }) => {
  owner = await tokenFor(request, ACCOUNTS.owner);
  const locations = await unwrap(await request.get(`${base()}/locations`, { headers: owner }));
  const created = await request.post(`${base()}/resources`, {
    headers: owner,
    data: {
      location: { id: locations[0].id },
      use: "shop",
      type: {
        plane: {
          tailNumber: TAIL,
          make: "Piper",
          model: "PA-28-181 Archer",
          year: "1979",
          category: "airplane",
          aircraftClass: "single_engine_land",
          meterMode: "hobbs_and_tach",
          hobbsTime: 51330,
          tachTime: 48210,
          fuelCapacity: 4800,
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
    data: { name: OWNER_NAME, email: `e2e.wo.${TAIL.toLowerCase()}@example.com`, isPrimary: true },
  });
  expect(added.status(), await added.text()).toBe(201);
  const owners = await unwrap(await request.get(`${base()}/resources/${resourceId}/owners`, { headers: owner }));
  ownerOrgUserId = owners[0].orgUser.id;
  ownerUserId = owners[0].orgUser.user.id;
});

test.afterAll(async ({ request }) => {
  const h = owner ?? (await tokenFor(request, ACCOUNTS.owner));
  for (const id of jobIds) await request.delete(`${base()}/work-orders/${id}`, { headers: h });
  // A cancellation needs its kind, or the server refuses it and the booking lingers to block the next run.
  for (const id of bookingIds) await request.delete(`${base()}/reservations/${id}`, { headers: h, data: { reason: "E2E test cleanup", category: "booked_in_error" } });
  // The shop's rates are the whole test school's: put back what was there.
  if (savedRates) await request.put(`${base()}/work-orders/settings`, { headers: h, data: savedRates });
  if (ownerUserId) {
    const archived = await request.patch(`${base()}/users/${ownerUserId}/orgUser/archive`, { headers: h, data: { archived: true } });
    expect(archived.ok(), await archived.text()).toBe(true);
  }
  // Refused while the aircraft still has an open job, so the jobs go first.
  if (resourceId) {
    const gone = await request.delete(`${base()}/resources/${resourceId}`, { headers: h });
    expect(gone.ok(), await gone.text()).toBe(true);
  }
});

test("the desk opens a work order from the board, billed to the aircraft's owner", async ({ page, request }) => {
  await page.goto("/maintenance?view=work-orders");
  await settled(page, "h1");
  await page.getByRole("button", { name: "Open a work order" }).first().click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Open a work order" });
  await expect(dlg).toBeVisible();

  await dlg.locator("#wo-aircraft").click();
  await page.getByPlaceholder("Search…").last().fill(TAIL);
  await page.getByRole("option", { name: new RegExp(TAIL) }).click();
  // Billed to follows the aircraft: its primary owner, the Billed badge on its Owners panel.
  await expect(dlg.locator("#wo-bill-to")).toContainText(OWNER_NAME);

  await dlg.locator("#wo-status").click();
  await page.getByRole("option", { name: "Aircraft received" }).click();
  // Here, so the meters in come off the aircraft, the way close-out prefills them.
  await expect(dlg.locator("#wo-hobbs-in")).toHaveValue("5133.0");
  await expect(dlg.locator("#wo-tach-in")).toHaveValue("4821.0");
  await dlg.locator("#wo-complaint").fill("E2E-Annual inspection. Left brake feels soft.");
  await dlg.getByRole("button", { name: "Open work order" }).click();

  // Lands on the job's own page.
  await expect(page).toHaveURL(/\/maintenance\/work-orders\/\d+/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: new RegExp(`WO-\\d+ · ${TAIL}`) })).toBeVisible();

  const jobs = await unwrap(await request.get(`${base()}/work-orders?resourceId=${resourceId}&state=all`, { headers: owner }));
  expect(jobs).toHaveLength(1);
  jobIds.push(jobs[0].id);
  expect(jobs[0]).toMatchObject({
    status: "received",
    complaint: "E2E-Annual inspection. Left brake feels soft.",
    billTo: { id: ownerOrgUserId, name: OWNER_NAME },
    billing: "none",
  });
  expect(jobs[0].number).toBeGreaterThanOrEqual(1001);
  const one = await unwrap(await request.get(`${base()}/work-orders/${jobs[0].id}`, { headers: owner }));
  expect(one).toMatchObject({ hobbsIn: 51330, tachIn: 48210 });
  expect(one.receivedAt, "received stamps the arrival").toBeTruthy();
});

test("the desk adds what the owner asked for and what was found, and records the owner's answer", async ({ page, request }) => {
  const id = jobIds[0];
  await page.goto(`/maintenance/work-orders/${id}`);
  await settled(page, '[data-doc-shot="work-order-work"]');
  const work = page.locator('[data-doc-shot="work-order-work"]');

  const addItem = async (which: RegExp, text: string) => {
    await work.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("option", { name: which }).click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Add an item" });
    await dlg.locator("#wo-item-description").fill(text);
    await dlg.getByRole("button", { name: "Add item" }).click();
    await expect(dlg).toBeHidden();
    await expect(work.getByText(text)).toBeVisible();
  };
  await addItem(/owner asked for/, "E2E-Adjust left brake");
  await addItem(/shop found/, "E2E-Cracked exhaust stack");
  await addItem(/shop found/, "E2E-Faded paint on the cowling");
  await expect(work.getByText("Owner not asked yet")).toHaveCount(2);

  // The call: approve the exhaust, defer the paint.
  await work.getByRole("button", { name: "Record owner's answer" }).click();
  const call = page.getByRole("dialog").filter({ hasText: "Record the owner's answer" });
  await expect(call.locator("#wo-answer-name")).toHaveValue(OWNER_NAME);
  await call.getByRole("radiogroup", { name: /Cracked exhaust/ }).getByRole("radio", { name: "Approve" }).click();
  await call.getByRole("radiogroup", { name: /Faded paint/ }).getByRole("radio", { name: "Defer" }).click();
  await call.locator("#wo-answer-notes").fill("E2E-Exhaust now, paint in spring.");
  await call.getByRole("button", { name: "Record answer" }).click();
  await expect(call).toBeHidden();
  await expect(work.getByText("Approved")).toBeVisible();
  await expect(work.getByText("Deferred")).toBeVisible();
  await expect(page.locator('[data-doc-shot="work-order-answers"]').getByText("1 approved, 1 deferred")).toBeVisible();

  // A plain item is ticked done on the job.
  await work.getByRole("button", { name: 'Mark "E2E-Adjust left brake" done' }).click();
  await expect(work.getByText(/Done .* by /)).toBeVisible();
  // The tick is optimistic: the screen says done before the save lands, so wait for the save.
  await expect
    .poll(async () => ((await unwrap(await request.get(`${base()}/work-orders/${id}/items`, { headers: owner }))) as { done: boolean }[]).some((i) => i.done))
    .toBe(true);

  const items = await unwrap(await request.get(`${base()}/work-orders/${id}/items`, { headers: owner }));
  expect((items as { description: string; decision: string | null; done: boolean }[]).map((i) => [i.description, i.decision, i.done])).toEqual([
    ["E2E-Adjust left brake", null, true],
    ["E2E-Cracked exhaust stack", "approved", false],
    ["E2E-Faded paint on the cowling", "deferred", false],
  ]);
  const calls = await unwrap(await request.get(`${base()}/work-orders/${id}/approvals`, { headers: owner }));
  expect(calls[0]).toMatchObject({ contactName: OWNER_NAME, notes: "E2E-Exhaust now, paint in spring." });

  // Nobody outside the shop can read a job's work or its calls, and cannot tell a real job from none.
  const student = await tokenFor(request, ACCOUNTS.student);
  for (const path of ["items", "approvals"]) {
    const real = await request.get(`${base()}/work-orders/${id}/${path}`, { headers: student });
    const none = await request.get(`${base()}/work-orders/${NO_SUCH_JOB}/${path}`, { headers: student });
    expect(real.status()).toBe(403);
    expect(await real.text()).toBe(await none.text());
  }
});

test("the stage moves on the job page, and the aircraft's chip follows the job", async ({ page, request }) => {
  const id = jobIds[0];
  await page.goto(`/maintenance/work-orders/${id}`);
  await settled(page, "h1");
  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name: "Waiting for parts" }).click();
  await expect(page.getByText("Waiting for parts").first()).toBeVisible();
  await expect.poll(async () => (await unwrap(await request.get(`${base()}/work-orders/${id}`, { headers: owner }))).status).toBe("waiting_parts");

  // In the shop while the job is open with the aircraft here...
  await page.goto(`/aircraft/${resourceId}`);
  await expect(page.getByText("In the shop").first()).toBeVisible();

  // ...and not once it is finished. It used to say "In the shop" forever.
  const done = await request.patch(`${base()}/work-orders/${id}`, { headers: owner, data: { status: "completed" } });
  expect(done.ok(), await done.text()).toBeTruthy();
  expect((await done.json()).data.completedAt).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Not in the shop").first()).toBeVisible();

  // The job is on the aircraft's own Work orders tab, under past jobs.
  await page.goto(`/aircraft/${resourceId}?tab=work-orders`);
  await expect(page.getByText("Past jobs")).toBeVisible();
  await expect(page.locator('[data-doc-shot="aircraft-work-orders"]').getByText(/WO-\d+/).first()).toBeVisible();
});

test("the audit trail records the job's life, naming it and the aircraft", async ({ request }) => {
  const trail = await unwrap(await request.get(`${base()}/audit/workOrder/${jobIds[0]}`, { headers: owner }));
  const summaries = (trail as { summary: string }[]).map((e) => e.summary);
  expect(summaries.some((s) => /opened, aircraft received/.test(s))).toBe(true);
  expect(summaries.some((s) => /Aircraft received to waiting for parts/.test(s))).toBe(true);
  expect(summaries.some((s) => /Waiting for parts to completed/.test(s))).toBe(true);
});

test("owners, admins and technicians read jobs; everyone else, dispatchers included, gets the same answer for a real job and none", async ({ request }) => {
  const id = jobIds[0];
  for (const role of ["admin", "technician"] as const) {
    const h = await tokenFor(request, ACCOUNTS[role]);
    const res = await request.get(`${base()}/work-orders/${id}`, { headers: h });
    expect(res.status(), `${role} reads the job`).toBe(200);
  }
  for (const role of ["dispatcher", "instructor", "student", "renter"] as const) {
    const h = await tokenFor(request, ACCOUNTS[role]);
    const real = await request.get(`${base()}/work-orders/${id}`, { headers: h });
    const none = await request.get(`${base()}/work-orders/${NO_SUCH_JOB}`, { headers: h });
    // The refusal is decided before the id is looked at, so it cannot tell the two apart.
    expect(real.status(), role).toBe(none.status());
    expect(await real.text(), role).toBe(await none.text());
    expect(real.status(), role).toBe(403);
    const list = await request.get(`${base()}/work-orders`, { headers: h });
    expect(list.status(), `${role} cannot list jobs`).toBe(403);
    const trail = await request.get(`${base()}/audit/workOrder/${id}`, { headers: h });
    expect(trail.status(), `${role} cannot read a job's trail`).toBe(403);
  }
});

test("search finds a job by its number for the shop, and never for a pilot", async ({ request }) => {
  const job = await unwrap(await request.get(`${base()}/work-orders/${jobIds[0]}`, { headers: owner }));
  const hits = await unwrap(await request.get(`${base()}/search?q=${encodeURIComponent(job.label)}`, { headers: owner }));
  expect((hits.results as { type: string; id: number }[]).some((r) => r.type === "workorder" && r.id === job.id)).toBe(true);

  const student = await tokenFor(request, ACCOUNTS.student);
  const theirs = await unwrap(await request.get(`${base()}/search?q=${encodeURIComponent(job.label)}`, { headers: student }));
  expect(theirs.types).not.toContain("workorder");
  expect((theirs.results as { type: string }[]).some((r) => r.type === "workorder")).toBe(false);
});

test("refuses an aircraft from elsewhere, an owner as a technician, and a meter that is not whole tenths", async ({ request }) => {
  const bad = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId: 999_999_990 } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).message).toBe("That aircraft is not in this organization.");

  const badTech = await request.post(`${base()}/work-orders`, {
    headers: owner,
    data: { resourceId, technicianOrgUserIds: [ownerOrgUserId] },
  });
  expect(badTech.status(), "an aircraft owner is not a technician").toBe(400);

  const badMeter = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, hobbsIn: 12.5 } });
  expect(badMeter.status(), "meters are whole tenths").toBe(400);
});

test("only an admin deletes a job, and a technician's attempt is refused", async ({ request }) => {
  const opened = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, complaint: "E2E-opened by mistake" } });
  expect(opened.status(), await opened.text()).toBe(201);
  const id = (await opened.json()).data.id as number;
  jobIds.push(id);

  const tech = await tokenFor(request, ACCOUNTS.technician);
  expect((await request.delete(`${base()}/work-orders/${id}`, { headers: tech })).status()).toBe(403);
  expect((await request.delete(`${base()}/work-orders/${id}`, { headers: owner })).status()).toBe(204);
  expect((await request.get(`${base()}/work-orders/${id}`, { headers: owner })).status()).toBe(404);
});

// ── Slice C: labor, parts, the shop's rates, and the invoice they become ─────────────────────

test("an admin sets the shop's rates in Settings, and a technician cannot", async ({ page, request }) => {
  savedRates = await unwrap(await request.get(`${base()}/work-orders/settings`, { headers: owner }));
  await page.goto("/settings?tab=shop-rates");
  await settled(page, "#shop-labor-rate");
  const card = page.locator('[data-doc-shot="shop-rates"]');
  await card.locator("#shop-labor-rate").fill("95.00");
  await card.locator("#shop-parts-markup").fill("15");
  await card.locator("#shop-outside-markup").fill("10");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Shop rates saved")).toBeVisible();
  const saved = await unwrap(await request.get(`${base()}/work-orders/settings`, { headers: owner }));
  expect(saved).toEqual({ laborRateCents: 9500, partsMarkupBps: 1500, outsideWorkMarkupBps: 1000 });

  const tech = await tokenFor(request, ACCOUNTS.technician);
  const read = await request.get(`${base()}/work-orders/settings`, { headers: tech });
  expect(read.status(), "a technician reads the rates their entries are priced at").toBe(200);
  const write = await request.put(`${base()}/work-orders/settings`, { headers: tech, data: { laborRateCents: 1 } });
  expect(write.status(), "only an admin changes them").toBe(403);
});

test("the desk adds labor and a part priced from the shop's rates, and sees the invoice priced before raising it", async ({ page, request }) => {
  const created = await request.post(`${base()}/work-orders`, {
    headers: owner,
    data: { resourceId, status: "in_progress", complaint: "E2E-Replace the exhaust gasket" },
  });
  expect(created.status(), await created.text()).toBe(201);
  const job = (await created.json()).data;
  jobIds.push(job.id);

  await page.goto(`/maintenance/work-orders/${job.id}`);
  await settled(page, '[data-doc-shot="work-order-work"]');
  const card = page.locator('[data-doc-shot="work-order-work"]');
  await expect(card.getByText("Nothing on the job yet")).toBeVisible();

  const addLine = async (kind: string) => {
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByPlaceholder("Add a finding, labor, a part…").fill(kind);
    await page.getByRole("option", { name: new RegExp(`^${kind}`) }).first().click();
    return page.getByRole("dialog").filter({ hasText: `Add ${kind.toLowerCase()}` });
  };

  // Labor: hours at the shop rate, which the form fills in.
  const labor = await addLine("Labor");
  await labor.locator("#wo-line-description").fill("E2E-Replaced exhaust gasket");
  await labor.locator("#wo-line-hours").fill("1.5");
  await expect(labor.locator("#wo-line-rate")).toHaveValue("95.00");
  await labor.getByRole("button", { name: "Add line" }).click();
  await expect(labor).toBeHidden();
  await expect(card.getByText("E2E-Replaced exhaust gasket")).toBeVisible();

  // A part: two at cost plus the shop's parts markup.
  const part = await addLine("Part");
  await part.locator("#wo-line-description").fill("E2E-Exhaust gasket");
  await part.locator("#wo-line-qty").fill("2");
  await part.locator("#wo-line-cost").fill("40.00");
  // Left empty, the price is the cost plus the shop's markup, shown greyed in the price field.
  await expect(part.locator("#wo-line-price")).toHaveValue("");
  await expect(part.locator("#wo-line-price")).toHaveAttribute("placeholder", "46.00");
  await expect(part.getByText("Cost plus 15%.")).toBeVisible();
  await part.locator("#wo-line-pn").fill("E2E-77-1234");
  await part.getByRole("button", { name: "Add line" }).click();
  await expect(part).toBeHidden();

  // 1.5 h x $95 = $142.50; 2 x ($40 + 15%) = 2 x $46 = $92; $234.50 before tax and fees.
  await expect(card.locator('[data-slot="list-table-footer"]')).toContainText("$234.50");
  const lines = await unwrap(await request.get(`${base()}/work-orders/${job.id}/lines`, { headers: owner }));
  expect((lines as { category: string; qty: number; unitPriceCents: number; minutes: number | null; rateCents: number | null; costCents: number | null; markupBps: number | null }[]).map((l) => [l.category, l.qty, l.unitPriceCents, l.minutes, l.rateCents, l.costCents, l.markupBps])).toEqual([
    ["labor", 1, 14250, 90, 9500, null, null],
    ["part", 2, 4600, null, null, 4000, 1500],
  ]);

  // The admin's preview, priced by the server exactly as it will be raised. Raising itself needs
  // Stripe, which this stack does not have, so the test stops at the priced bill.
  await card.getByRole("button", { name: "Raise invoice" }).click();
  const raise = page.getByRole("dialog").filter({ hasText: `Invoice ${OWNER_NAME}` });
  await expect(raise.getByText("Labor: 1.5 h at $95.00/h, E2E-Replaced exhaust gasket")).toBeVisible();
  await expect(raise.getByText("E2E-Exhaust gasket, P/N E2E-77-1234 (2 x $46.00)")).toBeVisible();
  const preview = await unwrap(await request.post(`${base()}/work-orders/${job.id}/invoice/preview`, { headers: owner }));
  expect(preview.subtotal).toBeGreaterThanOrEqual(23450);
  await expect(raise.getByRole("button", { name: new RegExp(`Raise .*${(preview.total / 100).toFixed(2)} invoice`) })).toBeVisible();
  // Murray §13: the work order and the aircraft are printed on the bill too, and shown here first.
  const details = raise.getByTestId("invoice-details");
  await expect(details.getByText("Work order", { exact: true })).toBeVisible();
  await expect(details.locator("dd").filter({ hasText: `WO-${job.number}` })).toBeVisible();
  await expect(details.locator("dd").filter({ hasText: TAIL })).toBeVisible();
  await raise.getByRole("button", { name: "Cancel" }).click();

  // The shop's cost and markup never leave the shop: the bill carries prices only.
  expect(JSON.stringify(preview)).not.toMatch(/costCents|markupBps|4000/);

  // A technician adds lines but never prices or raises the bill.
  const tech = await tokenFor(request, ACCOUNTS.technician);
  const techPreview = await request.post(`${base()}/work-orders/${job.id}/invoice/preview`, { headers: tech });
  expect(techPreview.status()).toBe(403);
  const techRaise = await request.post(`${base()}/work-orders/${job.id}/invoice`, { headers: tech, data: {} });
  expect(techRaise.status()).toBe(403);
});

test("the job links the maintenance booking holding its hangar slot", async ({ page, request }) => {
  const start = new Date(Date.now() + 6 * 864e5);
  start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 4 * 36e5);
  const made = await request.post(`${base()}/reservations`, {
    headers: owner,
    data: { type: "maintenance", resource: { id: resourceId }, start: start.toISOString(), end: end.toISOString(), title: "E2E-Hangar slot" },
  });
  expect(made.status(), await made.text()).toBe(201);
  const booking = (await made.json()).data;
  bookingIds.push(booking.id);

  const id = jobIds[jobIds.length - 1];
  await page.goto(`/maintenance/work-orders/${id}`);
  await settled(page, '[data-doc-shot="work-order-details"]');
  // The hangar slot is changed where it is shown, and saved as it is picked.
  await page.getByRole("button", { name: "Change the hangar slot" }).click();
  await page.getByRole("option").filter({ hasNotText: "None" }).first().click();
  await expect.poll(async () => (await unwrap(await request.get(`${base()}/work-orders/${id}`, { headers: owner }))).booking?.id).toBe(booking.id);
  await expect(page.getByRole("button", { name: "Change the hangar slot" })).not.toContainText("None");
});


test.describe("as a technician", () => {
  test.use({ storageState: ".auth/technician.json" });

  test("enters work at the shop's rates, changes only their own lines, and cannot move the bill", async ({ page, request }) => {
    const id = jobIds[jobIds.length - 1];
    const tech = await tokenFor(request, ACCOUNTS.technician);
    const mine = await request.post(`${base()}/work-orders/${id}/lines`, {
      headers: tech,
      data: { category: "labor", description: "E2E-Safety-wired the exhaust clamps", minutes: 30 },
    });
    expect(mine.status(), await mine.text()).toBe(201);
    const refused = await request.post(`${base()}/work-orders/${id}/lines`, {
      headers: tech,
      data: { category: "labor", description: "E2E-Cheap hour", minutes: 60, rateCents: 100 },
    });
    expect(refused.status(), "only an admin sets a rate").toBe(403);

    await page.goto(`/maintenance/work-orders/${id}`);
    await settled(page, '[data-doc-shot="work-order-work"]');
    const card = page.locator('[data-doc-shot="work-order-work"]');
    // Their own line has its menu; the admin's lines do not.
    await expect(card.getByRole("button", { name: 'More for "E2E-Safety-wired the exhaust clamps"' })).toBeVisible();
    await expect(card.getByRole("button", { name: 'More for "E2E-Replaced exhaust gasket"' })).toHaveCount(0);
    // No Raise invoice for a technician.
    await expect(card.getByRole("button", { name: "Raise invoice" })).toHaveCount(0);

    await card.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("option", { name: /^Part/ }).click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Add part" });
    await expect(dlg.locator("#wo-line-price")).toBeDisabled();
    await expect(dlg.getByRole("button", { name: /^Billing:/ })).toBeDisabled();
    await expect(dlg.getByText("Only an admin changes a line's rate, markup or price.")).toBeVisible();
    await dlg.getByRole("button", { name: "Cancel" }).click();

    // Who pays is shown, not offered: an admin chooses it.
    const details = page.locator('[data-doc-shot="work-order-details"]');
    await expect(details.getByRole("button", { name: "Change who pays" })).toHaveCount(0);
    await expect(details.locator('[title="An admin chooses who pays."]')).toBeVisible();
    // The rest of the job is theirs to change, field by field.
    await expect(details.getByRole("button", { name: "Change when it is promised back" })).toBeVisible();
  });
});

test.describe("as a dispatcher", () => {
  test.use({ storageState: ".auth/dispatcher.json" });

  test("sees the customer aircraft but not the jobs behind them", async ({ page }) => {
    await page.goto("/maintenance");
    await settled(page, "h1");
    await expect(page.getByRole("button", { name: "Open jobs" })).toHaveCount(0);
    // A link to a job lands back on Maintenance, not on a page of refusals.
    await page.goto(`/maintenance/work-orders/${jobIds[0]}`);
    await expect(page).toHaveURL(/\/maintenance(\?|$)/);
    await page.goto(`/aircraft/${resourceId}`);
    await settled(page, "h1");
    await expect(page.getByRole("heading", { name: new RegExp(TAIL) })).toBeVisible();
    await expect(page.getByRole("button", { name: "Work orders" })).toHaveCount(0);
  });
});

test("moving a job to Aircraft received asks for the meters in, filled in from the aircraft", async ({ page, request }) => {
  const made = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, complaint: "E2E-Pitot-static check" } });
  expect(made.status(), await made.text()).toBe(201);
  const job = (await made.json()).data;
  jobIds.push(job.id);
  await page.goto(`/maintenance/work-orders/${job.id}`);
  await settled(page, "h1");
  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name: "Aircraft received" }).click();
  // The meters editor in Details opens by itself, filled in from the aircraft.
  const dlg = page.getByTestId("meters-editor");
  await expect(dlg).toContainText("The aircraft is here");
  await expect(dlg.locator("#wo-meter-hobbs-in")).toHaveValue("5133.0");
  await expect(dlg.locator("#wo-meter-tach-in")).toHaveValue("4821.0");
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(async () => (await unwrap(await request.get(`${base()}/work-orders/${job.id}`, { headers: owner }))).hobbsIn).toBe(51330);
});

test("each detail is changed where it is shown: the meters, the promised day, and the notes", async ({ page, request }) => {
  const made = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, complaint: "E2E-Transponder check" } });
  expect(made.status(), await made.text()).toBe(201);
  const job = (await made.json()).data;
  jobIds.push(job.id);
  await page.goto(`/maintenance/work-orders/${job.id}`);
  await settled(page, '[data-doc-shot="work-order-details"]');
  const details = page.locator('[data-doc-shot="work-order-details"]');
  // There is no Edit dialog any more.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  // Before it arrives there is nothing to read.
  await expect(details.getByText("Recorded when it arrives")).toBeVisible();

  await page.getByRole("combobox", { name: "Stage" }).click();
  await page.getByRole("option", { name: /Aircraft received/ }).click();
  const meters = page.getByTestId("meters-editor");
  // Filled in from the aircraft first; typing before that lands, the prefill can overwrite it.
  await expect(meters.locator("#wo-meter-hobbs-in")).toHaveValue("5133.0");
  await expect(meters.locator("#wo-meter-hobbs-in")).toBeFocused();
  // A reading lower than the aircraft's is asked about before it is saved.
  await meters.locator("#wo-meter-hobbs-in").fill("");
  await meters.locator("#wo-meter-hobbs-in").pressSequentially("5033.0", { delay: 40 });
  await meters.getByRole("button", { name: "Save" }).click();
  const check = page.getByRole("alertdialog");
  await expect(check).toContainText("Hobbs in 5033.0 is lower than the 5133.0 recorded");
  await check.getByRole("button", { name: "Fix them" }).click();
  await expect(meters).toBeVisible();
  await meters.locator("#wo-meter-hobbs-in").fill("");
  await meters.locator("#wo-meter-hobbs-in").pressSequentially("5133.0", { delay: 40 });
  await meters.getByRole("button", { name: "Save" }).click();
  await expect(meters).toBeHidden();
  await expect(details.getByRole("button", { name: "Change the meter readings" })).toContainText("5133.0");

  // Notes for the owner: typed in place, saved with Save.
  await page.getByRole("button", { name: "Edit notes for the owner" }).first().click();
  const box = page.locator("textarea").first();
  await box.fill("E2E-Ready by Friday.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await unwrap(await request.get(`${base()}/work-orders/${job.id}`, { headers: owner }))).customerNotes).toBe("E2E-Ready by Friday.");
  // Escape leaves without saving.
  await page.getByRole("button", { name: "Edit notes for the owner" }).first().click();
  await page.locator("textarea").first().fill("E2E-Not this");
  await page.keyboard.press("Escape");
  expect((await unwrap(await request.get(`${base()}/work-orders/${job.id}`, { headers: owner }))).customerNotes).toBe("E2E-Ready by Friday.");
  const after = await unwrap(await request.get(`${base()}/work-orders/${job.id}`, { headers: owner }));
  expect(after).toMatchObject({ hobbsIn: 51330, tachIn: 48210 });
});

test("the customer's own record lists the jobs billed to them", async ({ page }) => {
  await page.goto(`/people/${ownerOrgUserId}`);
  await settled(page, "h1");
  const card = page.locator('[data-doc-shot="person-work-orders"]');
  await expect(card.getByText("E2E-Pitot-static check")).toBeVisible();
});

test("an admin takes 10% off a line, and the line and the total say so", async ({ page, request }) => {
  const id = jobIds[jobIds.length - 1];
  const line = await request.post(`${base()}/work-orders/${id}/lines`, { headers: owner, data: { category: "fee", description: "E2E-Ferry flight", unitPriceCents: 20000 } });
  expect(line.status(), await line.text()).toBe(201);
  await page.goto(`/maintenance/work-orders/${id}`);
  await settled(page, '[data-doc-shot="work-order-work"]');
  const card = page.locator('[data-doc-shot="work-order-work"]');
  await card.getByRole("button", { name: 'More for "E2E-Ferry flight"' }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dlg = page.getByRole("dialog").filter({ hasText: "Edit line" });
  await dlg.getByRole("button", { name: /^Discount:/ }).click();
  await page.locator("#wo-line-discount").pressSequentially("10", { delay: 80 });
  await page.keyboard.press("Enter");
  await expect(dlg.getByRole("button", { name: "Discount: 10% off" })).toBeVisible();
  await expect(dlg.getByText("$180.00")).toBeVisible();
  await dlg.getByRole("button", { name: "Save" }).click();
  await expect(dlg).toBeHidden();
  await expect(card.getByText("10% off")).toBeVisible();
  // The row reads as the invoice will: $200.00 each, 10% off, $180.00 for the line.
  const row = card.getByRole("row").filter({ hasText: "E2E-Ferry flight" });
  await expect(row.locator('[data-col="each"]')).toHaveText("$200.00");
  await expect(row.locator('[data-col="total"]')).toHaveText("$180.00");
  const lines = await unwrap(await request.get(`${base()}/work-orders/${id}/lines`, { headers: owner }));
  expect((lines as { description: string; discountBps: number | null; totalCents: number }[]).find((l) => l.description === "E2E-Ferry flight")).toMatchObject({ discountBps: 1000, totalCents: 18000 });
});


test("the job's work and charges read as one list: each line under its item, folded and walked by keyboard", async ({ page, request }) => {
  const made = await request.post(`${base()}/work-orders`, { headers: owner, data: { resourceId, status: "received", complaint: "E2E-Mag check" } });
  expect(made.status(), await made.text()).toBe(201);
  const job = (await made.json()).data;
  jobIds.push(job.id);
  const item = await unwrap(await request.post(`${base()}/work-orders/${job.id}/items`, { headers: owner, data: { source: "requested", description: "E2E-Left mag drop" } }));
  await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: owner, data: { category: "part", description: "E2E-Mag points", unitPriceCents: 4000, qty: 2, itemId: item.id } });
  await request.post(`${base()}/work-orders/${job.id}/lines`, { headers: owner, data: { category: "fee", description: "E2E-Loose fee", unitPriceCents: 1500 } });

  await page.goto(`/maintenance/work-orders/${job.id}`);
  await settled(page, '[data-doc-shot="work-order-work"]');
  const list = page.getByRole("treegrid", { name: /Work and charges/ });
  const itemRow = list.getByRole("row", { name: "E2E-Left mag drop" });
  const lineRow = list.getByRole("row", { name: "E2E-Mag points" });
  await expect(itemRow).toHaveAttribute("aria-level", "2");
  await expect(lineRow).toHaveAttribute("aria-level", "3");
  // The item carries what its lines charge; a line for no item sits in its own group.
  await expect(itemRow.locator('[data-col="total"]')).toHaveText("$80.00");
  await expect(list.getByRole("row", { name: /Not for a specific item/ })).toContainText("$15.00");

  // Keyboard: down from the item reaches its line; Left folds the item; Right opens it again.
  await itemRow.click({ position: { x: 300, y: 10 } });
  await expect(lineRow).toBeHidden();
  await itemRow.press("ArrowRight");
  await expect(lineRow).toBeVisible();
  await itemRow.press("ArrowDown");
  await expect(lineRow).toBeFocused();
  await lineRow.press("ArrowLeft");
  await expect(itemRow).toBeFocused();
  // Enter on a line opens it for editing.
  await itemRow.press("ArrowDown");
  await lineRow.press("Enter");
  await expect(page.getByRole("dialog").filter({ hasText: "Edit line" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The item's own menu adds a line already pointed at it.
  await itemRow.getByRole("button", { name: 'More for "E2E-Left mag drop"' }).click();
  await page.getByRole("menuitem", { name: /Add labor or a part for it/ }).click();
  const add = page.getByRole("dialog").filter({ hasText: "Add labor" });
  await expect(add).toContainText("E2E-Left mag drop");
  await add.getByRole("button", { name: "Cancel" }).click();
});

test("Open jobs groups the board by where each aircraft is, and a row opens the job beside it", async ({ page }) => {
  const id = jobIds[jobIds.length - 1];
  await page.goto("/maintenance?view=work-orders");
  await settled(page, '[data-doc-shot="maintenance-work-orders"]');
  const board = page.getByRole("treegrid", { name: "Open jobs" });
  const hangar = board.getByRole("row", { name: /In the hangar/ });
  await expect(hangar).toBeVisible();
  const row = board.getByTestId(`job-row-${id}`);
  await expect(row).toContainText("E2E-Mag check");
  await expect(row.locator('[data-col="charges"]')).toHaveText("$95.00");
  // On the request, not the middle of the row: the owner's name there is a link to them.
  await row.click({ position: { x: 120, y: 12 } });
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-doc-shot="work-order-panel"]')).toBeVisible();
  // Folding a group hides its jobs.
  await page.keyboard.press("Escape");
  await hangar.click();
  await expect(row).toBeHidden();
  await hangar.click();

  // A double click goes straight to the job's page, though the first click opened the panel.
  await row.dblclick({ position: { x: 120, y: 12 } });
  await expect(page).toHaveURL(new RegExp(`/maintenance/work-orders/${id}$`));
});

test("a person's avatar shows who they are on hover and opens their profile on click", async ({ page }) => {
  await page.goto("/maintenance?view=work-orders");
  await settled(page, '[data-doc-shot="maintenance-work-orders"]');
  const owner = page.getByRole("treegrid", { name: "Open jobs" }).getByRole("link", { name: OWNER_NAME }).first();
  await owner.hover();
  await expect(page.getByText("Aircraft owner, not a member")).toBeVisible();
  await owner.click();
  await expect(page).toHaveURL(new RegExp(`/people/${ownerOrgUserId}`));
});
