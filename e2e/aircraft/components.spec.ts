import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { apiLogin, uiLogin } from "../helpers/api";
import { ACCOUNTS, AIRCRAFT_OWNER_EMAIL, apiProxyTarget } from "../helpers/env";

/**
 * Life-limited components, the papers for the certificate and the registration, and the
 * registration renewal preset (Murray spec 5), on the organization's own aircraft and a
 * customer's.
 *
 * A component's limit is tracked by a linked inspection: these check, through the real UI and
 * the API, that adding a component creates it, editing moves it, recording that the part came
 * off retires it, and that deleting the inspection by itself is refused. Every refusal is
 * compared with the same request for an id nobody has, never hardcoded (refusal-oracle note).
 * The database-backed half is server/test/integration/aircraft-components.itest.ts.
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

const PDF = { name: "E2E-airworthiness.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%E2E\n") };
const CARD = '[data-doc-shot="aircraft-components"]';

type Component = {
  id: number;
  life: { status: string; timeNow: number | null; hours: { left: number | null; dueAtMeter: number | null } | null; calendar: { dueOn: string } | null };
  inspections: { id: number; clock: string; reminderId: number | null }[];
};

test.describe.serial("life-limited components", () => {
  const N = Math.floor(Math.random() * 900 + 100);
  let desk: H & { orgUserId: number };
  let owner: H & { orgUserId: number };
  let fleetId: number;
  let shopId: number;
  let magnetoId: number;
  let propId: number;

  const component = async (request: APIRequestContext, resourceId: number, id: number, h: H = desk) =>
    (await (await request.get(`${base()}/resources/${resourceId}/components/${id}`, { headers: auth(h) })).json()).data as Component;
  const linked = async (request: APIRequestContext, resourceId: number) =>
    ((await (await request.get(`${base()}/maintenance/reminders?resourceId=${resourceId}&resolved=false`, { headers: auth(desk) })).json()).data as Array<{
      id: number;
      template: { id: number; name: string; componentClock: string | null; remindAtHours: number | null };
      due: { hoursRemaining: number | null; status: string };
    }>).filter((r) => r.template.componentClock);

  test.beforeAll(async ({ request }) => {
    desk = await headersFor(request, ACCOUNTS.owner);
    owner = await headersFor(request, AIRCRAFT_OWNER_EMAIL);
    const locs = (await (await request.get(`${base()}/locations`, { headers: auth(desk) })).json()).data;
    const make = async (use: "fleet" | "shop", tail: string) => {
      const res = await request.post(`${base()}/resources`, {
        headers: auth(desk),
        data: {
          location: { id: locs[0].id },
          use,
          type: { plane: { tailNumber: tail, make: "Cessna", model: "172S", category: "airplane", aircraftClass: "single_engine_land", meterMode: "hobbs_and_tach", hobbsTime: 21000, tachTime: 20000, fuelCapacity: 5300, fuelMeasurement: "gallons", cost: { billByHobbsTime: true, wetRate: 0 } } },
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      return (await res.json()).data.id as number;
    };
    fleetId = await make("fleet", `E2E-N${N}LC`);
    shopId = await make("shop", `E2E-N${N}LS`);
    const owned = await request.post(`${base()}/resources/${shopId}/owners`, { headers: auth(desk), data: { orgUserId: owner.orgUserId, isPrimary: true } });
    expect(owned.status(), await owned.text()).toBe(201);
  });

  test.afterAll(async ({ request }) => {
    const h = auth(desk);
    for (const [rid, cid] of [
      [fleetId, magnetoId],
      [shopId, propId],
    ]) {
      if (rid && cid) await request.delete(`${base()}/resources/${rid}/components/${cid}`, { headers: h }).catch(() => undefined);
    }
    for (const id of [fleetId, shopId]) if (id) await request.delete(`${base()}/resources/${id}`, { headers: h }).catch(() => undefined);
  });

  test("an admin adds a component in the console, and its limit becomes an inspection", async ({ page, request }) => {
    await page.goto(`/aircraft/${fleetId}?tab=maintenance`);
    await settled(page, CARD);
    const card = page.locator(CARD);
    await expect(card.getByText("No life-limited components recorded.")).toBeVisible();

    await card.getByRole("button", { name: "Add", exact: true }).click();
    const form = page.getByRole("dialog");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Give it a name.")).toBeVisible();
    await form.getByLabel("Name", { exact: true }).fill("E2E-Left magneto");
    await form.getByLabel("Position").fill("Engine");
    await form.getByLabel("Part number").fill("4371");
    await form.getByLabel("Serial number").fill(`E2E-${N}`);
    // The reading defaults to the aircraft's tach now: 2000.0.
    await expect(form.getByLabel("Aircraft tach when installed")).toHaveValue("2000.0");
    await form.getByRole("button", { name: /Its time counts since/ }).click();
    await page.getByRole("menuitemradio", { name: "Since overhaul" }).click();
    await form.getByLabel("Its time when installed").fill("460.0");
    await form.getByLabel("Life limit, hours").fill("500");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("E2E-Left magneto added, its limit is tracked")).toBeVisible();

    const row = card.locator('[data-testid^="component-"]').filter({ hasText: "E2E-Left magneto" });
    await expect(row.getByTestId("component-life")).toHaveText("40.0 h left");
    await expect(card.getByText("1 near limit")).toBeVisible();
    await expect(row.getByText(`Engine · P/N 4371 · S/N E2E-${N}`)).toBeVisible();

    const list = (await (await request.get(`${base()}/resources/${fleetId}/components`, { headers: auth(desk) })).json()).data as Component[];
    expect(list).toHaveLength(1);
    magnetoId = list[0].id;
    expect(list[0].life).toMatchObject({ status: "dueSoon", timeNow: 4600, hours: { left: 400, dueAtMeter: 20400 } });
    const [inspection] = await linked(request, fleetId);
    expect(inspection.template).toMatchObject({ name: "Life limit: E2E-Left magneto", componentClock: "hours", remindAtHours: 20400 });
    expect(inspection.due).toMatchObject({ hoursRemaining: 400, status: "dueSoon" });
    expect(list[0].inspections).toEqual([{ id: inspection.template.id, clock: "hours", reminderId: inspection.id, signedOffAt: null }]);

    // The row links to the inspection that tracks it.
    await row.getByRole("link", { name: "Inspection" }).click();
    await expect(page).toHaveURL(new RegExp(`/maintenance/inspections/${inspection.id}`));
    await expect(page.getByText("Due at 2040.0 tach, now 2000.0.")).toBeVisible();
  });

  test("editing the limit moves the same inspection, and deleting the inspection by itself is refused", async ({ page, request }) => {
    const before = await linked(request, fleetId);
    await page.goto(`/aircraft/${fleetId}?tab=maintenance`);
    await settled(page, CARD);
    const card = page.locator(CARD);
    await card.getByText("E2E-Left magneto").click();
    const form = page.getByRole("dialog");
    await form.getByLabel("Life limit, hours").fill("600.0");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("E2E-Left magneto saved")).toBeVisible();
    await expect(card.getByTestId("component-life")).toHaveText("140.0 h left");

    const after = await linked(request, fleetId);
    expect(after).toHaveLength(1);
    expect(after[0].template.id).toBe(before[0].template.id);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].template.remindAtHours).toBe(21400);

    const refused = await request.delete(`${base()}/maintenance/reminders/templates/${after[0].template.id}`, { headers: auth(desk) });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).message).toContain("Components card");
    const moved = await request.patch(`${base()}/maintenance/reminders/templates/${after[0].template.id}`, { headers: auth(desk), data: { templateResources: [] } });
    expect(moved.status()).toBe(400);
    expect(await linked(request, fleetId)).toHaveLength(1);
  });

  test("recording that it came off retires its inspection and keeps it as history", async ({ page, request }) => {
    await page.goto(`/aircraft/${fleetId}?tab=maintenance`);
    await settled(page, CARD);
    const card = page.locator(CARD);
    await card.getByRole("button", { name: "More for E2E-Left magneto" }).click();
    await page.getByRole("menuitem", { name: "Record it came off" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Record it" }).click();
    await expect(page.getByText("E2E-Left magneto recorded as off. Its limit is no longer tracked.")).toBeVisible();
    await expect(card.getByText("No life-limited components recorded.")).toBeVisible();
    expect(await linked(request, fleetId)).toEqual([]);

    await card.getByRole("button", { name: "Show components that came off" }).click();
    await expect(card.getByTestId("component-life")).toHaveText("Came off");
    const c = await component(request, fleetId, magnetoId);
    expect(c.life.status).toBe("removed");
    expect(c.inspections).toEqual([]);
  });

  test("a customer aircraft: the technician adds one, the owner reads it on their aircraft's page", async ({ browser, request }) => {
    const tech = await headersFor(request, ACCOUNTS.technician);
    const made = await request.post(`${base()}/resources/${shopId}/components`, {
      headers: auth(tech),
      data: { name: "E2E-Propeller", position: "Propeller", partNumber: "2A34C203", timeSince: "overhaul", sinceOn: "2021-01-15", installedOn: "2021-02-01", installedAtMeter: 19000, limitHours: 20000, limitMonths: 72, notes: "E2E-shop only: quote before overhaul." },
    });
    expect(made.status(), await made.text()).toBe(201);
    propId = (await made.json()).data.id;
    expect((await made.json()).data.inspections.map((i: { clock: string }) => i.clock).sort()).toEqual(["date", "hours"]);

    // The owner's portal: the part and its life, never the shop's notes.
    const detail = (await (await request.get(`${base()}/owner/aircraft/${shopId}`, { headers: auth(owner) })).json()).data;
    expect(detail.components).toHaveLength(1);
    expect(detail.components[0]).toMatchObject({ name: "E2E-Propeller", limitMonths: 72 });
    expect(detail.components[0]).not.toHaveProperty("notes");
    expect(JSON.stringify(detail)).not.toContain("quote before overhaul");
    expect(detail.due.map((d: { name: string }) => d.name)).toEqual(expect.arrayContaining(["Life limit: E2E-Propeller, calendar", "Life limit: E2E-Propeller, hours"]));

    const ownerContext = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } });
    const ownerPage = await ownerContext.newPage();
    await uiLogin(ownerPage, AIRCRAFT_OWNER_EMAIL);
    await ownerPage.goto(`/me/aircraft/${shopId}`);
    const card = ownerPage.getByRole("list", { name: "Components" });
    await expect(card.getByText("E2E-Propeller")).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/since overhaul of 2,000\.0, on the tach, limit Jan 15, 2027/)).toBeVisible();
    await ownerContext.close();

    // The outside owner never reaches the shop's door, whatever the id.
    const doors = await Promise.all([shopId, fleetId, ABSENT].map(async (id) => body(await request.get(`${base()}/resources/${id}/components`, { headers: auth(owner) }))));
    expect(doors[0].status).toBe(403);
    expect(doors[1]).toEqual(doors[0]);
    expect(doors[2]).toEqual(doors[0]);
  });

  test("pilots are refused alike for every id; a stray component reads as an absent one", async ({ request }) => {
    for (const email of [ACCOUNTS.instructor, ACCOUNTS.student]) {
      const h = await headersFor(request, email);
      for (const [method, path, data] of [
        ["GET", (id: number) => `/resources/${id}/components`, undefined],
        ["GET", (id: number) => `/resources/${id}/components/${propId}`, undefined],
        ["POST", (id: number) => `/resources/${id}/components`, { name: "E2E-x" }],
        ["PATCH", (id: number) => `/resources/${id}/components/${propId}`, { name: "E2E-x" }],
        ["DELETE", (id: number) => `/resources/${id}/components/${propId}`, undefined],
      ] as const) {
        const answers = await Promise.all(
          [shopId, fleetId, ABSENT].map(async (id) => body(await request.fetch(`${base()}${path(id)}`, { method, headers: auth(h), data })))
        );
        expect(answers[0].status).toBe(403);
        expect(answers[1]).toEqual(answers[0]);
        expect(answers[2]).toEqual(answers[0]);
      }
    }

    // A dispatcher reads them and changes nothing, the same way for every id.
    const dispatcher = await headersFor(request, ACCOUNTS.dispatcher);
    expect((await request.get(`${base()}/resources/${shopId}/components`, { headers: auth(dispatcher) })).status()).toBe(200);
    const writes = await Promise.all([shopId, ABSENT].map(async (id) => body(await request.patch(`${base()}/resources/${id}/components/${propId}`, { headers: auth(dispatcher), data: { name: "E2E-x" } }))));
    expect(writes[0].status).toBe(403);
    expect(writes[1]).toEqual(writes[0]);

    // The shop's own component, asked for under the wrong aircraft: exactly an absent one.
    const tech = await headersFor(request, ACCOUNTS.technician);
    const [stray, absent] = await Promise.all(
      [propId, ABSENT].map(async (cid) => body(await request.patch(`${base()}/resources/${fleetId}/components/${cid}`, { headers: auth(tech), data: { name: "E2E-x" } })))
    );
    expect(stray.status).toBe(404);
    expect(stray).toEqual(absent);
    expect((await component(request, shopId, propId)).inspections).toHaveLength(2);
  });

  test.describe("as a dispatcher", () => {
    test.use({ storageState: ".auth/dispatcher.json" });

    test("the card reads, and offers nothing to change", async ({ page }) => {
      await page.goto(`/aircraft/${shopId}?tab=maintenance`);
      await settled(page, CARD);
      const card = page.locator(CARD);
      await expect(card.getByText("E2E-Propeller")).toBeVisible();
      await expect(card.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
      await expect(card.getByRole("button", { name: /^More for/ })).toHaveCount(0);
    });
  });

  test.describe("as an instructor", () => {
    test.use({ storageState: ".auth/instructor.json" });

    test("the organization's own aircraft has no maintenance tab, and a customer's is not found", async ({ page }) => {
      await page.goto(`/aircraft/${fleetId}?tab=maintenance`);
      await expect(page.getByRole("heading", { name: `E2E-N${N}LC` })).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(CARD)).toHaveCount(0);
      await page.goto(`/aircraft/${shopId}`);
      await expect(page.getByText("Aircraft not found")).toBeVisible({ timeout: 20_000 });
    });
  });

  test("the papers card says which required paper is missing, and stops once it is on file", async ({ page, request }) => {
    await page.goto(`/aircraft/${fleetId}?tab=papers`);
    await settled(page, '[data-doc-shot="aircraft-papers"]');
    const missing = page.getByTestId("papers-missing");
    await expect(missing).toHaveText(/No airworthiness certificate or registration on file\./);

    await page.locator('[data-doc-shot="aircraft-papers"]').getByRole("button", { name: "Add" }).click();
    await expect(page.locator("#paper-category")).toHaveValue("airworthiness_certificate");
    await page.locator('[data-doc-shot="aircraft-papers-add"] input[type="file"]').setInputFiles(PDF);
    await page.locator('[data-doc-shot="aircraft-papers-add"]').getByRole("button", { name: "Save" }).click();
    // Saved whether or not the local object store took the bytes; the row is what counts here.
    await expect(page.getByText(/Paper added\.|Saved, but/)).toBeVisible();
    await expect(missing).toHaveText(/No registration certificate on file\./);

    const files = (await (await request.get(`${base()}/resources/${fleetId}/files`, { headers: auth(desk) })).json()).data as Array<{ id: number; category: string; visibility: string }>;
    const cert = files.find((f) => f.category === "airworthiness_certificate");
    expect(cert?.visibility).toBe("staff");
    const reg = await request.post(`${base()}/resources/${fleetId}/files`, { headers: auth(desk), data: { category: "registration", fileNames: ["E2E-registration.pdf"] } });
    expect(reg.status(), await reg.text()).toBe(201);
    await page.reload();
    await settled(page, '[data-doc-shot="aircraft-papers"]');
    await expect(page.getByText("Registration certificate").first()).toBeVisible();
    await expect(page.getByTestId("papers-missing")).toHaveCount(0);
  });

  test("the registration renewal is a preset, 84 calendar months, warned to the shop and the owners, never grounding", async ({ page, request }) => {
    const presets = (await (await request.get(`${base()}/maintenance/reminders/presets`, { headers: auth(desk) })).json()).data as Array<{ id: string; ground: boolean; payload: Record<string, unknown> }>;
    const reg = presets.find((p) => p.id === "registration");
    expect(reg).toMatchObject({ ground: false, payload: { remindMonths: 84, repeat: true, ground: false, reminderSteps: { shopDays: [180, 60, 30], ownerDays: [180, 60, 30] } } });

    await page.goto(`/aircraft/${shopId}?tab=maintenance`);
    await settled(page, CARD);
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Registration renewal")).toBeVisible();
    await expect(dialog.getByText("§47.40")).toBeVisible();
  });
});
