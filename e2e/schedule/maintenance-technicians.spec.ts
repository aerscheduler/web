import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { cleanupE2eReservations } from "../helpers/api";
import { dismissCookieBanner, pickByPlaceholder, pickNextBookableSlot, submitBookReservation } from "../helpers/reservation-form";

/**
 * TECHNICIANS ON A MAINTENANCE BOOKING (2026-10-15). Tony: "if work order is added, the default
 * assigned mechanic is the work order mechanic". Picking a job in the booking form fills the
 * booking's technicians from it; the booking saves them; the technician then has it on their own
 * schedule (GET /reservations/user/:id), which is what "Only mine" reads.
 *
 * Self-contained: its own shop aircraft and job (E2E- prefixed), removed at the end.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: ".auth/owner.json" });

const base = () => apiProxyTarget().replace(/\/$/, "");
const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}M`;

async function login(request: APIRequestContext, email: string) {
  const res = await request.post(`${base()}/auth/`, { data: { email, password: TEST_PASSWORD } });
  expect(res.ok(), `auth ${email}`).toBeTruthy();
  const body = await res.json();
  return { headers: { Authorization: `Bearer ${body.auth.accessToken as string}` }, userId: body.data.user.id as number };
}
const unwrap = async (res: import("@playwright/test").APIResponse) => {
  const body = await res.json();
  return body?.data ?? body;
};

let owner: Record<string, string>;
let resourceId: number;
let jobId: number;
let jobLabel: string;
let technicianOrgUserId: number;

test.beforeAll(async ({ request }) => {
  owner = (await login(request, ACCOUNTS.owner)).headers;
  const locations = await unwrap(await request.get(`${base()}/locations`, { headers: owner }));
  const created = await request.post(`${base()}/resources`, {
    headers: owner,
    data: {
      location: { id: locations[0].id },
      use: "shop",
      type: { plane: { tailNumber: TAIL, make: "Cessna", model: "172N", year: "1978", category: "airplane", aircraftClass: "single_engine_land", meterMode: "tach_only", tachTime: 4210, fuelCapacity: 0, fuelMeasurement: "gallons" } },
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  resourceId = (await created.json()).data.id;

  const members = await unwrap(await request.get(`${base()}/orgUsers`, { headers: owner }));
  const tech = (members as { id: number; user?: { email?: string; name?: string } }[]).find(
    (m) => m.user?.email === ACCOUNTS.technician || m.user?.name === "Test Technician"
  );
  expect(tech, "the seeded technician").toBeTruthy();
  technicianOrgUserId = tech!.id;

  const job = await request.post(`${base()}/work-orders`, {
    headers: owner,
    data: { resourceId, status: "scheduled", complaint: "E2E-100 hour", billToOrgUserId: null, technicianOrgUserIds: [technicianOrgUserId], holdOwnerNotices: true },
  });
  expect(job.status(), await job.text()).toBe(201);
  const record = await unwrap(job);
  jobId = record.id;
  jobLabel = record.label;
});

test.afterAll(async ({ request }) => {
  const h = owner ?? (await login(request, ACCOUNTS.owner)).headers;
  await cleanupE2eReservations(request);
  if (jobId) await request.delete(`${base()}/work-orders/${jobId}`, { headers: h });
  if (resourceId) await request.delete(`${base()}/resources/${resourceId}`, { headers: h });
});

test("picking a job fills the booking's technicians, and the technician has it on their schedule", async ({ page, request }) => {
  const marker = `E2E-UI-mech-${Date.now()}`;
  await page.goto("/schedule");
  await dismissCookieBanner(page);
  const newRes = page.getByRole("button", { name: /\+?\s*New reservation/i }).first();
  await expect(newRes).toBeVisible({ timeout: 25_000 });
  // The console remounts once shortly after a full load, which can swallow the first click.
  await expect(async () => {
    if (!(await page.locator("#res-type").isVisible())) await newRes.click();
    await expect(page.locator("#res-type")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await page.locator("#res-type").click();
  await page.getByRole("option", { name: /^Maintenance$/i }).click();
  await pickByPlaceholder(page, /Select resource/i, new RegExp(TAIL), /Search fleet/i);
  await pickNextBookableSlot(page);

  // Nobody chosen yet; picking the job brings its technician over.
  const technicians = page.locator('button[role="combobox"]', { hasText: /Who is doing the work|Test Technician/ });
  await expect(technicians).toHaveText(/Who is doing the work/);
  await page.locator("#res-work-order").click();
  await page.getByRole("option", { name: new RegExp(jobLabel) }).click();
  await expect(technicians).toHaveText(/Test Technician/);

  await page.locator("#res-notes").fill(marker);
  await submitBookReservation(page);
  await expect(page.locator("#res-notes")).toBeHidden({ timeout: 15_000 });

  const start = new Date(Date.now() - 2 * 864e5).toISOString();
  const end = new Date(Date.now() + 45 * 864e5).toISOString();
  const list = await unwrap(await request.get(`${base()}/reservations?startDate=${start}&endDate=${end}`, { headers: owner }));
  const booking = (list as { id: number; notes?: string; technicians?: { id: number }[] }[]).find((r) => String(r.notes ?? "").includes(marker));
  expect(booking, `booked but not listed for ${marker}`).toBeTruthy();
  expect(booking!.technicians?.map((t) => t.id)).toEqual([technicianOrgUserId]);

  const job = await unwrap(await request.get(`${base()}/work-orders/${jobId}`, { headers: owner }));
  expect(job.booking?.id).toBe(booking!.id);

  const tech = await login(request, ACCOUNTS.technician);
  const mine = await unwrap(await request.get(`${base()}/reservations/user/${tech.userId}?startDate=${start}&endDate=${end}`, { headers: tech.headers }));
  const rows = Array.isArray(mine) ? mine : (mine.reservations ?? []);
  expect(rows.some((r: { id: number }) => r.id === booking!.id), "on the technician's own schedule").toBe(true);
});
