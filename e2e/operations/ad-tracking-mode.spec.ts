import { test, expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "../helpers/env";

async function ownerHeaders(request: APIRequestContext) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

async function firstPlane(request: APIRequestContext, base: string, headers: Record<string, string>) {
  const res = await request.get(`${base}/resources/planes`, { headers });
  expect(res.ok()).toBeTruthy();
  const planes = (await res.json()).data ?? [];
  expect(planes.length, "the test org needs at least one aeroplane").toBeGreaterThan(0);
  return planes[0];
}

async function dismissCookieBanner(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Decline" }).click({ timeout: 3000 }).catch(() => {});
}

/**
 * Whether an organization has AerScheduler find the ADs for its aircraft: one switch since
 * 2026-10-17 (it was four choices and a "What we could match" panel; only one choice did
 * anything). Off by default is the column default and the service's reading of a missing row,
 * covered on the server.
 *
 * The test organization is seeded with it ON (seed-test-ad-library.sql) for the AD specs, so
 * this file puts back whatever it found.
 */
let found: { enabled: boolean } | null = null;

test.beforeAll(async ({ request }) => {
  const { base, headers } = await ownerHeaders(request);
  const { data } = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
  found = { enabled: !!data.enabled };
});

test.afterAll(async ({ request }) => {
  if (!found) return;
  const { base, headers } = await ownerHeaders(request);
  const back = await request.patch(`${base}/organizations/adTracking`, { headers, data: found });
  expect(back.ok(), `restoring the AD setting failed: ${await back.text()}`).toBeTruthy();
});

test.describe("Find the ADs for our aircraft", () => {
  test("turns on and off by enabled, and still takes the older mode", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const set = (data: unknown) => request.patch(`${base}/organizations/adTracking`, { headers, data });

    expect((await (await set({ enabled: true })).json()).data).toEqual({ mode: "catalogue", enabled: true });
    expect((await (await set({ enabled: false })).json()).data).toEqual({ mode: "off", enabled: false });
    expect((await (await set({ mode: "catalogue" })).json()).data.enabled).toBe(true);

    // Members read the same setting.
    const member = await (await request.get(`${base}/maintenance/ad-tracking-mode`, { headers })).json();
    expect(member.data).toEqual({ mode: "catalogue", enabled: true });
  });

  test("refuses the retired modes and anything else, and stores nothing", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    await request.patch(`${base}/organizations/adTracking`, { headers, data: { enabled: false } });
    for (const data of [{ mode: "manual" }, { mode: "external", externalSystem: "ADlog" }, { mode: "everything" }, {}]) {
      const res = await request.patch(`${base}/organizations/adTracking`, { headers, data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
    const after = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
    expect(after.data).toEqual({ mode: "off", enabled: false });
  });

  test("the console shows one switch that saves when flipped", async ({ page, request }) => {
    const { base, headers } = await ownerHeaders(request);
    await request.patch(`${base}/organizations/adTracking`, { headers, data: { enabled: false } });

    await page.goto("/settings?tab=ad-tracking");
    await dismissCookieBanner(page);
    const toggle = page.getByRole("switch", { name: "Find the ADs for our aircraft" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    for (const gone of [/Not here/, /I track them here/, /Somewhere else/]) {
      await expect(page.getByRole("button", { name: gone })).toHaveCount(0);
    }
    await expect(page.getByText("What we could match")).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await (await request.get(`${base}/organizations/adTracking`, { headers })).json()).data.enabled).toBe(true);
  });

  test("an admin can turn it on from the empty Fleet ADs page", async ({ page, request }) => {
    const { base, headers } = await ownerHeaders(request);
    await request.patch(`${base}/organizations/adTracking`, { headers, data: { enabled: false } });

    await page.goto("/maintenance?view=ads");
    await dismissCookieBanner(page);
    await expect(page.getByText("AerScheduler is not finding ADs for you")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Find the ADs for our aircraft" }).click();
    await expect.poll(async () => (await (await request.get(`${base}/organizations/adTracking`, { headers })).json()).data.enabled).toBe(true);
    await expect(page.getByText("AerScheduler is not finding ADs for you")).toHaveCount(0);
  });

  test("a serial number can be typed on the aircraft form and comes back", async ({ page, request }) => {
    // An AD's serial range is checked by a person against the aircraft's serial number, so the
    // aircraft form has to offer somewhere to put one. For six weeks it did not.
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);

    await page.goto(`/aircraft/${plane.id}`);
    await dismissCookieBanner(page);

    await page.getByRole("button", { name: /^Edit/ }).first().click();
    // By id, not by label: the DocsHint button beside the label carries "About Serial number"
    // as its own accessible name, so getByLabel matches two elements.
    const field = page.locator("#ac-serial");
    await expect(field, "the aircraft form must offer somewhere to put a serial number").toBeVisible();

    await field.fill("E2E-SN-4471");
    await page.getByRole("button", { name: /^Save/ }).click();

    await expect
      .poll(async () => {
        const r = await request.get(`${base}/resources/${plane.id}`, { headers });
        return (await r.json()).data?.type?.plane?.serialNumber;
      })
      .toBe("E2E-SN-4471");

    await request.patch(`${base}/resources/${plane.id}`, {
      headers,
      data: { type: { plane: { tailNumber: plane.type.plane.tailNumber, serialNumber: "" } } },
    });
  });
});
