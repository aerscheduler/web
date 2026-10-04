import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin, uiLogin } from "../helpers/api";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

/**
 * An aircraft owner signed in from outside the organization (Tony, 2026-10-01). The shop records
 * them as an aircraft's owner; they sign up with that address and the same name and join; the
 * record becomes theirs and they stay an outside party. They see their aircraft and the job on
 * it, answer what the shop found, and ask for work. The school's pages send them home and the
 * school's API refuses them.
 *
 * The owner's login is a fixed test account, created on the first run and reused after.
 */

const base = () => apiProxyTarget().replace(/\/$/, "");
const OWNER_EMAIL = "e2e-portal-owner@example.com";
const OWNER_NAME = "E2E Portal Owner";
type Ctx = { Authorization: string };

async function desk(request: APIRequestContext): Promise<Ctx> {
  return { Authorization: `Bearer ${(await apiLogin(request, ACCOUNTS.owner)).auth.accessToken}` };
}

/** The owner's session: signs in, or signs up and joins the first time. */
async function ownerSession(request: APIRequestContext): Promise<Ctx> {
  const tried = await request.post(`${base()}/auth/`, { data: { email: OWNER_EMAIL, password: TEST_PASSWORD } });
  if (tried.ok()) {
    const body = await tried.json();
    if (body.auth?.accessToken && body.data?.organization) return { Authorization: `Bearer ${body.auth.accessToken}` };
  }
  const made = await request.post(`${base()}/users`, { data: { name: OWNER_NAME, email: OWNER_EMAIL, password: TEST_PASSWORD, termsVersion: "2026-01-01" } });
  const token = made.ok() ? (await made.json()).auth.accessToken : (await (await request.post(`${base()}/auth/`, { data: { email: OWNER_EMAIL, password: TEST_PASSWORD } })).json()).auth.accessToken;
  const joined = await request.post(`${base()}/organizations/join/AERTEST01`, { headers: { Authorization: `Bearer ${token}` } });
  expect([200, 400], await joined.text()).toContain(joined.status());
  return { Authorization: `Bearer ${(await apiLogin(request, OWNER_EMAIL)).auth.accessToken}` };
}

test.describe("an aircraft owner's own page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const TAIL = `E2E-N${Math.floor(Math.random() * 900 + 100)}PO`;
  let shop: Ctx;
  let aircraftId: number;
  let jobId: number;
  let foundId: number;

  test.beforeAll(async ({ request }) => {
    shop = await desk(request);
    const locs = (await (await request.get(`${base()}/locations`, { headers: shop })).json()).data;
    const plane = await request.post(`${base()}/resources`, {
      headers: shop,
      data: {
        location: { id: locs[0].id },
        use: "shop",
        type: { plane: { tailNumber: TAIL, make: "Piper", model: "PA-28-181 Archer", category: "airplane", aircraftClass: "single_engine_land", meterMode: "hobbs_and_tach", hobbsTime: 41200, tachTime: 39010, fuelCapacity: 4800, fuelMeasurement: "gallons", cost: { billByHobbsTime: true, wetRate: 0 } } },
      },
    });
    expect(plane.status(), await plane.text()).toBe(201);
    aircraftId = (await plane.json()).data.id;
    // Recorded by the shop first: the owner's sign-up claims this record.
    const owner = await request.post(`${base()}/resources/${aircraftId}/owners`, { headers: shop, data: { name: OWNER_NAME, email: OWNER_EMAIL, isPrimary: true } });
    expect(owner.status(), await owner.text()).toBe(201);
    await ownerSession(request);
    const job = await request.post(`${base()}/work-orders`, { headers: shop, data: { resourceId: aircraftId, status: "in_progress", complaint: "E2E-Annual, and the nav light is out." } });
    expect(job.status(), await job.text()).toBe(201);
    jobId = (await job.json()).data.id;
    const found = await request.post(`${base()}/work-orders/${jobId}/items`, { headers: shop, data: { description: "E2E-Cracked exhaust shroud", source: "found" } });
    foundId = (await found.json()).data.id;
    await request.post(`${base()}/work-orders/${jobId}/lines`, { headers: shop, data: { category: "part", description: "E2E-Exhaust shroud", qty: 1, unitPriceCents: 28500, itemId: foundId } });
    // Owners see a finding only once the shop sends it.
    const sent = await request.post(`${base()}/work-orders/${jobId}/send-to-owner`, { headers: shop });
    expect(sent.status(), await sent.text()).toBe(201);
    expect((await sent.json()).data).toMatchObject({ sent: 1 });
  });

  test.afterAll(async ({ request }) => {
    const jobs = (await (await request.get(`${base()}/work-orders?state=all&resourceId=${aircraftId}`, { headers: shop })).json()).data ?? [];
    for (const j of jobs) await request.delete(`${base()}/work-orders/${j.id}`, { headers: shop }).catch(() => undefined);
    await request.delete(`${base()}/resources/${aircraftId}`, { headers: shop }).catch(() => undefined);
  });

  test("the school's API refuses the owner, and another owner's job answers as none", async ({ request }) => {
    const me = await ownerSession(request);
    for (const path of ["/reservations", "/orgUsers", "/resources", `/work-orders/${jobId}`]) {
      expect((await request.get(`${base()}${path}`, { headers: me })).status(), path).toBe(403);
    }
    const mine = await request.get(`${base()}/owner/work-orders/${jobId}`, { headers: me });
    expect(mine.status()).toBe(200);
    const body = (await mine.json()).data;
    // The shroud waits on an answer: its price is an estimate on the finding, not yet a charge.
    expect(body).toMatchObject({ billedToYou: true, chargesCents: 0 });
    expect(body.items.find((i: { id: number }) => i.id === foundId)).toMatchObject({ needsAnswer: true, estimateCents: 28500 });
    expect(JSON.stringify(body)).not.toContain("costCents");
    expect((await request.get(`${base()}/owner/work-orders/2000000000`, { headers: me })).status()).toBe(404);
  });

  test("signs in to their aircraft, answers what the shop found, and asks for work", async ({ page, request }) => {
    await uiLogin(page, OWNER_EMAIL, TEST_PASSWORD);
    const card = page.getByTestId(`owner-aircraft-${aircraftId}`);
    await expect(card).toContainText(TAIL, { timeout: 30_000 });
    // Their home is Home, like anybody's (Tony, 2026-10-01): never a "My aircraft" page.
    await expect(page.getByRole("link", { name: "Home", exact: true })).toBeVisible();
    await expect(page.getByText(/my aircraft/i)).toHaveCount(0);
    // Only their things in the rail, and the school's pages send them home.
    await expect(page.getByRole("link", { name: "Calendar" })).toHaveCount(0);
    await page.goto("/schedule");
    await expect(page).toHaveURL(/\/me$/);
    await page.goto("/me/aircraft");
    await expect(page).toHaveURL(/\/me$/);
    // Quick actions name the aircraft the modal is for. Opened and cancelled, nothing sent.
    await page.getByRole("button", { name: "Request work" }).click();
    await expect(page.getByRole("dialog", { name: `Request work on ${TAIL}` })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Update times" }).first().click();
    await expect(page.getByRole("dialog", { name: `Update ${TAIL}'s times` })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`/me/jobs/${jobId}`);
    const waiting = page.locator('[data-doc-shot="owner-waiting-on-you"]');
    await expect(waiting).toContainText("E2E-Cracked exhaust shroud");
    await expect(waiting).toContainText("$285.00");
    await waiting.getByRole("button", { name: "Approve: E2E-Cracked exhaust shroud" }).click();
    await expect(waiting).toBeHidden();
    // Approved, it is a charge.
    await expect(page.getByRole("table", { name: "Charges" })).toContainText("$285.00");
    const items = (await (await request.get(`${base()}/work-orders/${jobId}/items`, { headers: shop })).json()).data;
    expect(items.find((i: { id: number }) => i.id === foundId)).toMatchObject({ decision: "approved" });

    await page.goto(`/me/aircraft/${aircraftId}`);
    await page.getByRole("button", { name: "Request work" }).first().click();
    await page.getByLabel("What would you like done?").fill("E2E-Oil change, and the left brake pulls.");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText(/sent to the shop/)).toBeVisible();
    const jobs = (await (await request.get(`${base()}/work-orders?state=open&resourceId=${aircraftId}`, { headers: shop })).json()).data;
    expect(jobs.some((j: { status: string; complaint: string }) => j.status === "requested" && j.complaint.startsWith("E2E-Oil change"))).toBe(true);
  });
});
