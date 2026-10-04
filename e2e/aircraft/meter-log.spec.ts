import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";

/**
 * An aircraft's meter log (Murray spec section 4). A customer's aircraft flies elsewhere, so
 * its due dates are only as current as its last reading: the card says when it was never read,
 * a reading moves the aircraft's own times, and a lower one is asked about and kept as a
 * correction. A technician records; a dispatcher reads but cannot.
 */

const base = () => apiProxyTarget().replace(/\/$/, "");
type Ctx = { token: string };
const headers = (c: Ctx) => ({ Authorization: `Bearer ${c.token}` });

async function tokenFor(request: APIRequestContext, account: (typeof ACCOUNTS)[keyof typeof ACCOUNTS]): Promise<Ctx> {
  const auth = await apiLogin(request, account);
  return { token: auth.auth.accessToken as string };
}

test.describe("an aircraft's Hobbs and tach", () => {
  const TAIL = `E2E-M${Math.floor(Math.random() * 9000 + 1000)}`;
  let owner: Ctx;
  let id: number;

  test.beforeAll(async ({ request }) => {
    owner = await tokenFor(request, ACCOUNTS.owner);
    const locs = await request.get(`${base()}/locations`, { headers: headers(owner) });
    const rows = (await locs.json()).data;
    const res = await request.post(`${base()}/resources`, {
      headers: headers(owner),
      data: {
        location: { id: rows[0].id },
        use: "shop",
        type: { plane: { tailNumber: TAIL, make: "Cessna", model: "182P", category: "airplane", aircraftClass: "single_engine_land", meterMode: "hobbs_and_tach", hobbsTime: 24500, tachTime: 22000, fuelCapacity: 8800, fuelMeasurement: "gallons", cost: { billByHobbsTime: true, wetRate: 0 } } },
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    id = (await res.json()).data.id;
  });

  test.afterAll(async ({ request }) => {
    if (id) await request.delete(`${base()}/resources/${id}`, { headers: headers(owner) }).catch(() => undefined);
  });

  test.describe("as a technician", () => {
    test.use({ storageState: ".auth/technician.json" });

    test("records a reading, and a lower one is asked about and kept as a correction", async ({ page, request }) => {
      await page.goto(`/aircraft/${id}`);
      const card = page.locator('[data-doc-shot="aircraft-meter-log"]');
      await expect(card.getByText("Nobody has recorded this aircraft's times yet.")).toBeVisible({ timeout: 30_000 });

      await card.getByRole("button", { name: "Record a reading" }).first().click();
      const dialog = page.getByRole("dialog", { name: "Record a reading" });
      await dialog.getByLabel("Hobbs").fill("2461.2");
      await dialog.getByLabel("Note").fill("E2E read at drop-off");
      const saved = page.waitForResponse((r) => r.url().endsWith(`/resources/${id}/meters`) && r.request().method() === "POST");
      await dialog.getByRole("button", { name: "Record", exact: true }).click();
      expect((await saved).status()).toBe(201);
      await expect(card.getByText("E2E read at drop-off")).toBeVisible();
      await expect(card.getByText("Nobody has recorded")).toHaveCount(0);

      await card.getByRole("button", { name: "Record a reading" }).first().click();
      await dialog.getByLabel("Hobbs").fill("2455.0");
      await dialog.getByRole("button", { name: "Record", exact: true }).click();
      // Asked in the form: a mistyped reading put right (the default) or a replaced meter.
      const ask = dialog.getByRole("alert");
      await expect(ask).toContainText("lower than the 2461.2 on record");
      await expect(ask.getByRole("radio", { name: /mistyped/ })).toBeChecked();
      await dialog.getByRole("button", { name: "Save correction" }).click();
      await expect(card.getByText("Correction")).toBeVisible();

      const log = await (await request.get(`${base()}/resources/${id}/meters`, { headers: headers(owner) })).json();
      expect(log.data.current).toEqual({ hobbsTime: 24550, tachTime: 22000 });
      expect(log.data.entries.map((e: { hobbsTime: number; correction: boolean }) => [e.hobbsTime, e.correction])).toEqual([
        [24550, true],
        [24612, false],
      ]);
    });
  });

  test.describe("as a dispatcher", () => {
    test.use({ storageState: ".auth/dispatcher.json" });

    test("reads the readings but cannot record one", async ({ page, request }) => {
      await page.goto(`/aircraft/${id}`);
      const card = page.locator('[data-doc-shot="aircraft-meter-log"]');
      await expect(card.getByRole("heading", { name: "Hobbs and tach" }).or(card.getByText("Hobbs and tach").first())).toBeVisible({ timeout: 30_000 });
      await expect(card.getByRole("button", { name: "Record a reading" })).toHaveCount(0);
      const disp = await tokenFor(request, ACCOUNTS.dispatcher);
      const res = await request.post(`${base()}/resources/${id}/meters`, { headers: headers(disp), data: { hobbsTime: 30000 } });
      expect(res.status()).toBe(403);
    });
  });
});
