import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * Maintenance > Fleet ADs and AD library, as the technician: every aircraft's ADs in one list,
 * grouped by aircraft and by status, decided in place; the library searched on the server and
 * an AD opened with where it stands on the fleet. A student sees neither view, and the fleet
 * roll-up answers 403.
 *
 * Needs seed-test-ad-library.sql (the e2e stack runs it): four real ADs, "Find them for me" on
 * AERTEST01, and the LYCOMING IO-360-L2A on N172TS.
 */

const api = () => apiProxyTarget().replace(/\/$/, "");
const auth = async (request: APIRequestContext, email: string) => ({ Authorization: `Bearer ${(await apiLogin(request, email)).auth.accessToken as string}` });
const SEEDED = ["2013-11-11", "2012-02-02", "2008-03-02", "2015-19-07"];

async function n172ts(request: APIRequestContext, headers: Record<string, string>): Promise<number> {
  const planes = await (await request.get(`${api()}/resources/planes?scope=all`, { headers })).json();
  const plane = (planes.data ?? planes).find((p: { type?: { plane?: { tailNumber?: string } } }) => p.type?.plane?.tailNumber === "N172TS");
  expect(plane, "the test org has N172TS (seed-test-fleet.sql)").toBeTruthy();
  return plane.id as number;
}

test.describe("Fleet ADs and the AD library", () => {
  test.use({ storageState: ".auth/technician.json" });

  test("the fleet list both ways, a decision from it, and the library", async ({ page, request }) => {
    const tech = await auth(request, ACCOUNTS.technician);
    const id = await n172ts(request, tech);
    const base = `${api()}/maintenance/resources/${id}/airworthiness-directives`;
    for (const n of SEEDED) await request.delete(`${base}/${n}`, { headers: tech }).catch(() => undefined);

    const fleet = await request.get(`${api()}/maintenance/airworthiness-directives/fleet`, { headers: tech });
    expect(fleet.status()).toBe(200);
    const body = (await fleet.json()).data;
    const mine = body.items.filter((i: { resourceId: number }) => i.resourceId === id);
    expect(mine.map((i: { ad: { adNumber: string } }) => i.ad.adNumber)).toEqual(expect.arrayContaining(["2013-11-11", "2015-19-07"]));
    // The fleet list carries no AD text: the panel reads it from the library.
    expect(mine[0].ad.details).toBeNull();

    // ---- Grouped by aircraft ----
    await page.goto("/maintenance?view=ads");
    await dismissCookieBanner(page);
    const row = page.getByTestId(`fleet-ad-${id}-2015-19-07`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId(`fleet-ad-${id}-2008-03-02`)).toHaveCount(0);

    // ---- Decide from the row: the PUT goes to that aircraft ----
    await row.getByRole("button", { name: "Decide on AD 2015-19-07" }).click();
    const put = page.waitForResponse((r) => r.url().endsWith(`/resources/${id}/airworthiness-directives/2015-19-07`) && r.request().method() === "PUT");
    await page.getByRole("menuitem", { name: "Applies: nothing to track" }).click();
    expect((await put).status()).toBe(200);
    await expect(row.getByRole("button", { name: "Change the decision on AD 2015-19-07" })).toBeVisible();

    // ---- Grouped by status: each AD once, its aircraft beneath ----
    await page.getByRole("button", { name: /Group by/ }).click();
    await page.getByRole("menuitemradio", { name: "Status" }).click();
    const parent = page.getByTestId("fleet-ad-2013-11-11");
    await expect(parent).toBeVisible();
    await parent.click();
    const panel = page.locator('[data-doc-shot="maintenance-fleet-ad-panel"]');
    await expect(panel.getByText("On your aircraft")).toBeVisible();
    await expect(panel.getByText("N172TS")).toBeVisible();
    // The text comes from the library look-up.
    await expect(panel.getByRole("heading", { name: "Applies to" })).toBeVisible();
    await page.keyboard.press("Escape");

    // ---- The library: searched on the server, opened with where it stands ----
    await page.goto("/maintenance?view=ad-library");
    // The page restores its search state on load; type once the first page is in.
    await expect(page.getByRole("cell", { name: "2013-11-11" })).toBeVisible({ timeout: 20_000 });
    const search = page.waitForResponse((r) => r.url().includes("/maintenance/airworthiness-directives?") && r.url().includes("q=2015-19"));
    await page.getByRole("textbox", { name: "Search maintenance" }).fill("2015-19");
    expect((await search).status()).toBe(200);
    await page.getByRole("cell", { name: "2015-19-07" }).click();
    const libPanel = page.locator('[data-doc-shot="maintenance-ad-library-panel"]');
    await expect(libPanel.getByText("On your aircraft")).toBeVisible();
    await expect(libPanel.getByRole("link", { name: "N172TS" })).toBeVisible();
    await expect(libPanel.getByRole("listitem").filter({ hasText: "N172TS" })).toContainText("Applies");

    for (const n of SEEDED) await request.delete(`${base}/${n}`, { headers: tech }).catch(() => undefined);
  });
});

test.describe("ADs to review on a work order", () => {
  test.use({ storageState: ".auth/technician.json" });

  test("Add puts the undecided ADs on the job, the owner is never asked, and deciding completes the item", async ({ page, request }) => {
    const owner = await auth(request, ACCOUNTS.owner);
    const tech = await auth(request, ACCOUNTS.technician);
    const id = await n172ts(request, tech);
    const base = `${api()}/maintenance/resources/${id}/airworthiness-directives`;
    for (const n of SEEDED) await request.delete(`${base}/${n}`, { headers: tech }).catch(() => undefined);
    const made = await request.post(`${api()}/work-orders`, { headers: owner, data: { resourceId: id, status: "in_progress", complaint: "E2E-AD annual" } });
    expect(made.ok()).toBeTruthy();
    const jobId = (await made.json()).data.id as number;
    try {
      await page.goto(`/maintenance/work-orders/${jobId}`);
      await dismissCookieBanner(page);
      await page.getByRole("button", { name: /^Add$/ }).click();
      const added = page.waitForResponse((r) => r.url().endsWith(`/work-orders/${jobId}/items/ads`) && r.request().method() === "POST");
      await page.getByRole("option", { name: /ADs to review/ }).click();
      const body = (await (await added).json()).data;
      expect(body.added).toBe(3);
      const adItems = body.items.filter((i: { ad: { adNumber: string } | null }) => i.ad).map((i: { ad: { adNumber: string } }) => i.ad.adNumber);
      // The three seeded ADs that name N172TS; 2008-03-02 is superseded by 2012-02-02.
      expect(adItems.sort()).toEqual(["2012-02-02", "2013-11-11", "2015-19-07"]);

      // A second press adds nothing.
      const again = await request.post(`${api()}/work-orders/${jobId}/items/ads`, { headers: tech });
      expect((await again.json()).data.added).toBe(0);
      // The owner is never asked about AD research: nothing to send.
      const send = await request.post(`${api()}/work-orders/${jobId}/send-to-owner`, { headers: owner });
      expect(send.ok()).toBeFalsy();

      // Decide from the item: the link opens that AD on the aircraft.
      await page.getByRole("link", { name: "Decide AD 2013-11-11" }).click();
      await expect(page).toHaveURL(/tab=ads.*ad=2013-11-11/);
      const panel = page.getByRole("region", { name: "AD 2013-11-11", exact: true }).or(page.getByRole("dialog", { name: "AD 2013-11-11", exact: true }));
      await panel.getByRole("button", { name: "Decide" }).click();
      await page.getByRole("menuitem", { name: "Applies: nothing to track" }).click();
      await expect(page.locator("[data-sonner-toast]").first()).toContainText("marked as applying");

      const items = (await (await request.get(`${api()}/work-orders/${jobId}/items`, { headers: tech })).json()).data;
      expect(items.find((i: { ad: { adNumber: string } | null }) => i.ad?.adNumber === "2013-11-11")).toMatchObject({ done: true, doneVia: "ad" });
      expect(items.find((i: { ad: { adNumber: string } | null }) => i.ad?.adNumber === "2015-19-07")).toMatchObject({ done: false });
    } finally {
      await request.delete(`${api()}/work-orders/${jobId}`, { headers: owner }).catch(() => undefined);
      for (const n of SEEDED) await request.delete(`${base}/${n}`, { headers: tech }).catch(() => undefined);
    }
  });
});

test.describe("Fleet ADs, for a student", () => {
  test.use({ storageState: ".auth/student.json" });

  test("no AD views on the rail, and the roll-up refuses", async ({ page, request }) => {
    const student = await auth(request, ACCOUNTS.student);
    expect((await request.get(`${api()}/maintenance/airworthiness-directives/fleet`, { headers: student })).status()).toBe(403);
    await page.goto("/maintenance?view=ads");
    await dismissCookieBanner(page);
    await expect(page.getByRole("link", { name: "Fleet ADs" }).or(page.getByRole("button", { name: "Fleet ADs" }))).toHaveCount(0);
    await expect(page.locator('[data-doc-shot="maintenance-fleet-ads"]')).toHaveCount(0);
  });
});
