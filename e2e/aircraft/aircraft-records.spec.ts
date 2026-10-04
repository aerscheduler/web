import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin, uiLogin } from "../helpers/api";
import { ACCOUNTS, AIRCRAFT_OWNER_EMAIL, apiProxyTarget } from "../helpers/env";

/**
 * An aircraft's maintenance history and invoices, a customer's account files, papers shown to an
 * aircraft's owner, and a hangar booking's job on the schedule (Murray spec sections 3, 8, 16).
 *
 * Every refusal is compared with the same request for an id nobody has, never hardcoded: a
 * distinct answer is an oracle (see the refusal-oracle note). The database-backed half of the
 * same rules is server/test/integration/aircraft-records.itest.ts.
 */

const base = () => apiProxyTarget().replace(/\/$/, "");
const ABSENT = 999_999_993;
type H = { Authorization: string };

async function headersFor(request: APIRequestContext, email: string): Promise<H & { orgUserId: number }> {
  const token = (await apiLogin(request, email)).auth.accessToken as string;
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return { Authorization: `Bearer ${token}`, orgUserId: payload.orgUserId };
}
const auth = (h: H) => ({ Authorization: h.Authorization });
const body = async (res: { status(): number; text(): Promise<string> }) => ({ status: res.status(), text: await res.text() });

/** The console remounts a moment after a full page load; wait for the node to stop changing. */
async function settled(page: Page, selector: string) {
  await page.locator(selector).first().waitFor();
  await expect
    .poll(
      async () => {
        await page.evaluate((sel) => ((window as unknown as { __settle: Element | null }).__settle = document.querySelector(sel)), selector);
        await page.waitForTimeout(1200);
        return page.evaluate((sel) => (window as unknown as { __settle: Element | null }).__settle === document.querySelector(sel), selector);
      },
      { timeout: 20_000 }
    )
    .toBe(true);
}

/** A second signed-in person beside the test's own page, at the same console. */
const contextFor = (browser: import("@playwright/test").Browser, storageState: string | { cookies: []; origins: [] }) =>
  browser.newContext({ baseURL: test.info().project.use.baseURL, storageState });

const PDF = { name: "E2E-authorization.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%E2E\n") };

test.describe.serial("an aircraft's records", () => {
  const TAIL = `E2E-N${Math.floor(Math.random() * 900 + 100)}AR`;
  let desk: H & { orgUserId: number };
  let owner: H & { orgUserId: number };
  let shopId: number;
  let fleetId: number;
  let jobId: number;
  let bookingId: number;
  const fileIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    desk = await headersFor(request, ACCOUNTS.owner);
    owner = await headersFor(request, AIRCRAFT_OWNER_EMAIL);
    const locs = (await (await request.get(`${base()}/locations`, { headers: auth(desk) })).json()).data;
    const plane = await request.post(`${base()}/resources`, {
      headers: auth(desk),
      data: {
        location: { id: locs[0].id },
        use: "shop",
        type: { plane: { tailNumber: TAIL, make: "Cessna", model: "182P Skylane", category: "airplane", aircraftClass: "single_engine_land", meterMode: "hobbs_and_tach", hobbsTime: 30420, tachTime: 29010, fuelCapacity: 7500, fuelMeasurement: "gallons", cost: { billByHobbsTime: true, wetRate: 0 } } },
      },
    });
    expect(plane.status(), await plane.text()).toBe(201);
    shopId = (await plane.json()).data.id;
    const owned = await request.post(`${base()}/resources/${shopId}/owners`, { headers: auth(desk), data: { orgUserId: owner.orgUserId, isPrimary: true } });
    expect(owned.status(), await owned.text()).toBe(201);

    const fleet = (await (await request.get(`${base()}/resources/aircraft?scope=fleet`, { headers: auth(desk) })).json()).data;
    fleetId = fleet[0].id;

    // A hangar booking a week out, its job, finished.
    const start = new Date(Date.now() + 7 * 864e5);
    start.setUTCMinutes(0, 0, 0);
    const made = await request.post(`${base()}/reservations`, {
      headers: auth(desk),
      data: { type: "maintenance", resource: { id: shopId }, start: start.toISOString(), end: new Date(start.getTime() + 4 * 36e5).toISOString(), title: "E2E-Annual drop-off" },
    });
    expect(made.status(), await made.text()).toBe(201);
    bookingId = (await made.json()).data.id;
    const job = await request.post(`${base()}/work-orders`, { headers: auth(desk), data: { resourceId: shopId, reservationId: bookingId, status: "in_progress", complaint: "E2E-Annual inspection and the right nav light." } });
    expect(job.status(), await job.text()).toBe(201);
    jobId = (await job.json()).data.id;
  });

  test.afterAll(async ({ request }) => {
    const h = auth(desk);
    for (const id of fileIds) await request.delete(`${base()}/orgUsers/${owner.orgUserId}/files/${id}`, { headers: h }).catch(() => undefined);
    if (jobId) await request.delete(`${base()}/work-orders/${jobId}`, { headers: h }).catch(() => undefined);
    if (bookingId) await request.delete(`${base()}/reservations/${bookingId}`, { headers: h, data: { reason: "E2E test cleanup", category: "booked_in_error" } }).catch(() => undefined);
    if (shopId) await request.delete(`${base()}/resources/${shopId}`, { headers: h }).catch(() => undefined);
  });

  test("the schedule says whose aircraft and what for, to the shop roles only", async ({ request }) => {
    const range = `startDate=${new Date(Date.now() + 6 * 864e5).toISOString()}&endDate=${new Date(Date.now() + 9 * 864e5).toISOString()}&limit=1000`;
    const shopJobFor = async (email: string) => {
      const h = await headersFor(request, email);
      const rows = (await (await request.get(`${base()}/reservations?${range}`, { headers: auth(h) })).json()).data as Array<{ id: number; shopJob?: Record<string, unknown> }>;
      return rows.find((r) => r.id === bookingId);
    };
    expect((await shopJobFor(ACCOUNTS.technician))?.shopJob).toMatchObject({ workOrderId: jobId, request: "E2E-Annual inspection and the right nav light.", grounded: false });
    const atDesk = (await shopJobFor(ACCOUNTS.dispatcher))?.shopJob;
    expect(atDesk).toBeDefined();
    expect(atDesk).not.toHaveProperty("request");
    expect(atDesk).not.toHaveProperty("workOrderId");
    // A pilot does not see the hangar booking at all, let alone its job.
    expect(await shopJobFor(ACCOUNTS.instructor)).toBeUndefined();
  });

  test("the history lists the finished job; pilots are answered alike for every id", async ({ page, request }) => {
    const done = await request.patch(`${base()}/work-orders/${jobId}`, { headers: auth(desk), data: { status: "completed" } });
    expect(done.ok(), await done.text()).toBeTruthy();

    const instructor = await headersFor(request, ACCOUNTS.instructor);
    const pilot = await Promise.all([shopId, fleetId, ABSENT].map(async (id) => body(await request.get(`${base()}/resources/${id}/history`, { headers: auth(instructor) }))));
    expect(pilot[0].status).toBe(403);
    expect(pilot[1]).toEqual(pilot[0]);
    expect(pilot[2]).toEqual(pilot[0]);

    const tech = await headersFor(request, ACCOUNTS.technician);
    const bills = await Promise.all([shopId, fleetId, ABSENT].map(async (id) => body(await request.get(`${base()}/resources/${id}/invoices`, { headers: auth(tech) }))));
    expect(bills[0].status).toBe(403);
    expect(bills[1]).toEqual(bills[0]);
    expect(bills[2]).toEqual(bills[0]);

    const dispatcher = await headersFor(request, ACCOUNTS.dispatcher);
    const kinds = ((await (await request.get(`${base()}/resources/${shopId}/history`, { headers: auth(dispatcher) })).json()).data as Array<{ kind: string }>).map((r) => r.kind);
    expect(kinds).not.toContain("work_order");

    // The owner: their own aircraft's history; somebody else's reads as one that does not exist.
    const theirs = await request.get(`${base()}/owner/aircraft/${shopId}/history`, { headers: auth(owner) });
    expect(((await theirs.json()).data as Array<{ kind: string; by: unknown }>)[0]).toMatchObject({ kind: "work_order", by: null });
    const [notTheirs, absent] = await Promise.all([fleetId, ABSENT].map(async (id) => body(await request.get(`${base()}/owner/aircraft/${id}/history`, { headers: auth(owner) }))));
    expect(notTheirs.status).toBe(404);
    expect(notTheirs).toEqual(absent);

    await page.goto(`/aircraft/${shopId}?tab=history`);
    await settled(page, '[data-testid="aircraft-history"]');
    const row = page.locator('[data-doc-shot="aircraft-history"]').getByText("E2E-Annual inspection and the right nav light.");
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/maintenance/work-orders/${jobId}`));

    // The invoices tab is the admin's, and answers for this aircraft.
    await page.goto(`/aircraft/${shopId}?tab=invoices`);
    await settled(page, '[data-testid="aircraft-invoices"]');
    await expect(page.getByText("No invoices yet")).toBeVisible();
  });

  test("a paper shown to the owner reaches their page, and stops when kept to the shop", async ({ page, request, browser }) => {
    const made = await request.post(`${base()}/resources/${shopId}/files`, { headers: auth(desk), data: { category: "insurance", label: "E2E-Insurance certificate", fileNames: ["E2E-insurance.pdf"], ownerVisible: true } });
    expect(made.status(), await made.text()).toBe(201);
    // The fleet has no owners to show a paper to.
    const fleetPaper = await request.post(`${base()}/resources/${fleetId}/files`, { headers: auth(desk), data: { category: "other", fileNames: ["E2E-x.pdf"], ownerVisible: true } });
    expect(fleetPaper.status()).toBe(400);

    const ownerContext = await contextFor(browser, { cookies: [], origins: [] });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, AIRCRAFT_OWNER_EMAIL);
    await ownerPage.goto(`/me/aircraft/${shopId}`);
    await expect(ownerPage.getByText("E2E-Insurance certificate")).toBeVisible({ timeout: 20_000 });

    await page.goto(`/aircraft/${shopId}?tab=papers`);
    await settled(page, '[data-doc-shot="aircraft-papers"]');
    await page.getByRole("button", { name: "Keep to the shop" }).click();
    await expect(page.getByText("Shop only")).toBeVisible();
    await expect.poll(async () => ((await (await request.get(`${base()}/owner/aircraft/${shopId}`, { headers: auth(owner) })).json()).data.papers ?? []).length).toBe(0);
    await ownerContext.close();
    const id = (await made.json()).data[0].id;
    await request.delete(`${base()}/resources/${shopId}/files/${id}`, { headers: auth(desk) });
  });

  test("files on the owner's account: the shop shows one, the owner adds one, the shop sees it", async ({ page, request, browser }) => {
    await page.goto(`/people/${owner.orgUserId}?tab=files`);
    await settled(page, '[data-doc-shot="customer-files"]');
    await page.getByRole("button", { name: "Add files" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "Show to the owner" }).click();
    await (await chooser).setFiles(PDF);
    await expect(page.getByText(/added$/)).toBeVisible();
    const listed = (await (await request.get(`${base()}/orgUsers/${owner.orgUserId}/files`, { headers: auth(desk) })).json()).data as Array<{ id: number; fileName: string; visibility: string }>;
    const shown = listed.find((f) => f.fileName === "E2E-authorization.pdf");
    expect(shown?.visibility).toBe("owner");
    fileIds.push(shown!.id);

    // Pilots and dispatchers are refused the same for the customer and for nobody.
    for (const email of [ACCOUNTS.instructor, ACCOUNTS.dispatcher]) {
      const h = await headersFor(request, email);
      const [real, absent] = await Promise.all([owner.orgUserId, ABSENT].map(async (id) => body(await request.get(`${base()}/orgUsers/${id}/files`, { headers: auth(h) }))));
      expect(real.status).toBe(403);
      expect(real).toEqual(absent);
    }

    const ownerContext = await contextFor(browser, { cookies: [], origins: [] });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, AIRCRAFT_OWNER_EMAIL);
    await ownerPage.goto("/me");
    await settled(ownerPage, '[data-doc-shot="owner-documents"]');
    const card = ownerPage.locator('[data-doc-shot="owner-documents"]');
    await expect(card.getByText("E2E-authorization.pdf")).toBeVisible();
    const ownChooser = ownerPage.waitForEvent("filechooser");
    await card.getByRole("button", { name: "Add" }).click();
    await (await ownChooser).setFiles({ ...PDF, name: "E2E-my-insurance.pdf" });
    await expect(card.getByText("E2E-my-insurance.pdf")).toBeVisible();
    await ownerContext.close();

    const tech = await headersFor(request, ACCOUNTS.technician);
    const seen = (await (await request.get(`${base()}/orgUsers/${owner.orgUserId}/files`, { headers: auth(tech) })).json()).data as Array<{ id: number; fileName: string; fromCustomer: boolean }>;
    const theirs = seen.find((f) => f.fileName === "E2E-my-insurance.pdf");
    expect(theirs?.fromCustomer).toBe(true);
    fileIds.push(theirs!.id);
    // What the owner added stays theirs to see.
    const hide = await request.patch(`${base()}/orgUsers/${owner.orgUserId}/files/${theirs!.id}`, { headers: auth(desk), data: { visibility: "shop" } });
    expect(hide.status()).toBe(400);
  });

  test("a pilot's aircraft page has no history tab", async ({ browser }) => {
    const context = await contextFor(browser, ".auth/instructor.json");
    const page = await context.newPage();
    await page.goto(`/aircraft/${fleetId}?tab=history`);
    await settled(page, "h1");
    await expect(page.getByRole("button", { name: /^History/ })).toHaveCount(0);
    await expect(page.locator('[data-testid="aircraft-history"]')).toHaveCount(0);
    await context.close();
  });
});
