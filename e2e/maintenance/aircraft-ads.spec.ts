import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";
import { dismissCookieBanner } from "../helpers/reservation-form";

/**
 * The ADs tab on an aircraft: the library ADs that name N172TS, grouped by decision and part,
 * read in the panel as the Federal Register laid them out, and decided from the row menu and
 * the panel. As the technician, who reviews ADs, and as a student, who never sees the tab.
 *
 * Needs seed-test-ad-library.sql (four real ADs, "Find them for me" on AERTEST01, the
 * LYCOMING IO-360-L2A on N172TS). Every decision is undone first, so a run that died midway
 * starts clean.
 */

const api = () => apiProxyTarget().replace(/\/$/, "");
const auth = async (request: APIRequestContext, email: string) => ({ Authorization: `Bearer ${(await apiLogin(request, email)).auth.accessToken as string}` });
const SEEDED = ["2013-11-11", "2012-02-02", "2008-03-02", "2015-19-07"];

/** The detail panel: docked beside the list on a wide screen, a sheet on a narrow one. */
const panelOf = (page: import("@playwright/test").Page, adNumber: string) =>
  page.getByRole("region", { name: `AD ${adNumber}`, exact: true }).or(page.getByRole("dialog", { name: `AD ${adNumber}`, exact: true }));

type Item = { ad: { adNumber: string }; state: string; match: { on: string } | null; review: { reason?: string | null; note?: string | null } | null };

async function n172ts(request: APIRequestContext, headers: Record<string, string>): Promise<number> {
  const planes = await (await request.get(`${api()}/resources/planes?scope=all`, { headers })).json();
  const plane = (planes.data ?? planes).find((p: { type?: { plane?: { tailNumber?: string } } }) => p.type?.plane?.tailNumber === "N172TS");
  expect(plane, "the test org has N172TS (seed-test-fleet.sql)").toBeTruthy();
  return plane.id as number;
}

test.describe("ADs tab", () => {
  test.use({ storageState: ".auth/technician.json" });

  test("lists the ADs that name the aircraft, reads one, and decides it three ways", async ({ page, request }) => {
    const tech = await auth(request, ACCOUNTS.technician);
    const resourceId = await n172ts(request, tech);
    const base = `${api()}/maintenance/resources/${resourceId}/airworthiness-directives`;
    for (const n of SEEDED) await request.delete(`${base}/${n}`, { headers: tech }).catch(() => undefined);

    const listed = await request.get(base, { headers: tech });
    expect(listed.status()).toBe(200);
    const items = ((await listed.json()).data.items ?? []) as Item[];
    const byNumber = new Map(items.map((i) => [i.ad.adNumber, i]));
    expect(byNumber.get("2013-11-11")?.match?.on, "the 172S names the airframe AD (seed-test-ad-library.sql)").toBe("airframe");
    expect(byNumber.get("2015-19-07")?.match?.on, "the IO-360 names the engine AD").toBe("engine");
    // Superseded by 2012-02-02, which also names the 172S: folded away.
    expect(byNumber.has("2008-03-02")).toBe(false);

    await page.goto(`/aircraft/${resourceId}?tab=ads`);
    await dismissCookieBanner(page);
    const tab = page.locator('[data-doc-shot="aircraft-ads"]');
    await expect(tab.getByText("To review", { exact: true }).first()).toBeVisible();
    await expect(tab.getByText("Airframe", { exact: true }).first()).toBeVisible();
    await expect(tab.getByText("Engine", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("ad-2013-11-11")).toBeVisible();
    await expect(page.getByTestId("ad-2008-03-02")).toHaveCount(0);

    // ---- The panel reads as the AD does: applicability, the summary, the required actions ----
    await page.getByTestId("ad-2013-11-11").click();
    const panel = page.locator('[data-doc-shot="aircraft-ad-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Applies to" })).toBeVisible();
    await expect(panel).toContainText("172S");
    await expect(panel.getByRole("heading", { name: "What it requires" })).toBeVisible();
    await expect(panel.getByRole("link", { name: /Read the full AD in the Federal Register/ })).toHaveAttribute("href", /federalregister\.gov/);
    // The engine AD with tables renders real tables, not dot leaders.
    await page.keyboard.press("Escape");
    await page.getByTestId("ad-2015-19-07").click();
    await expect(panel.locator("table").first()).toBeVisible();

    // ---- Not applicable, with a reason, from the panel's footer ----
    await page.keyboard.press("Escape");
    await page.getByTestId("ad-2013-11-11").click();
    await panelOf(page, "2013-11-11").getByRole("button", { name: "Decide" }).click();
    await page.getByRole("menuitem", { name: "Not applicable" }).click();
    const modal = page.getByRole("dialog", { name: "AD 2013-11-11 does not apply" });
    await modal.getByText("Serial number outside the range").click();
    await modal.getByLabel(/^Note/).fill("E2E-AD serial checked");
    const put = page.waitForResponse((r) => r.url().endsWith("/airworthiness-directives/2013-11-11") && r.request().method() === "PUT");
    await modal.getByRole("button", { name: "Save" }).click();
    const saved = await put;
    expect(saved.status()).toBe(200);
    expect(saved.request().postDataJSON()).toEqual({ status: "not_applicable", reason: "serial_outside", note: "E2E-AD serial checked" });
    await expect(panel).toContainText("Not applicable: serial number outside the range");

    // ---- Back to review ----
    await panelOf(page, "2013-11-11").getByRole("button", { name: "Change the decision on AD 2013-11-11" }).click();
    const undo = page.waitForResponse((r) => r.url().endsWith("/airworthiness-directives/2013-11-11") && r.request().method() === "DELETE");
    await page.getByRole("menuitem", { name: "Back to review" }).click();
    expect((await undo).status()).toBe(200);
    await page.keyboard.press("Escape");

    // ---- Applies, nothing to track, from the row's own menu ----
    await page.getByTestId("ad-2015-19-07").getByRole("button", { name: "Decide" }).click();
    const applies = page.waitForResponse((r) => r.url().endsWith("/airworthiness-directives/2015-19-07") && r.request().method() === "PUT");
    await page.getByRole("menuitem", { name: "Applies: nothing to track" }).click();
    const appliesRes = await applies;
    expect(appliesRes.status()).toBe(200);
    expect(appliesRes.request().postDataJSON()).toEqual({ status: "applies", reason: null, note: null });
    const after = ((await (await request.get(base, { headers: tech })).json()).data.items ?? []) as Item[];
    expect(after.find((i) => i.ad.adNumber === "2015-19-07")?.state).toBe("applies");
    expect(after.find((i) => i.ad.adNumber === "2013-11-11")?.state).toBe("to_review");
    await expect(page.getByTestId("ad-2015-19-07").getByRole("button", { name: "Change the decision on AD 2015-19-07" })).toBeVisible();

    for (const n of SEEDED) await request.delete(`${base}/${n}`, { headers: tech }).catch(() => undefined);
  });
});

test.describe("ADs tab, for a student", () => {
  test.use({ storageState: ".auth/student.json" });

  test("has no tab, and the API refuses", async ({ page, request }) => {
    const student = await auth(request, ACCOUNTS.student);
    const owner = await auth(request, ACCOUNTS.owner);
    const resourceId = await n172ts(request, owner);
    const refused = await request.get(`${api()}/maintenance/resources/${resourceId}/airworthiness-directives`, { headers: student });
    expect(refused.status()).toBe(403);

    await page.goto(`/aircraft/${resourceId}?tab=ads`);
    await dismissCookieBanner(page);
    await expect(page.getByText("N172TS").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "ADs" })).toHaveCount(0);
    await expect(page.locator('[data-doc-shot="aircraft-ads"]')).toHaveCount(0);
  });
});
