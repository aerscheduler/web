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
 * Whether a school wants us involved in Airworthiness Directives at all.
 *
 * The reason this is worth an end-to-end test rather than a unit test: the default is the whole
 * feature. A school using AerScheduler for oil changes and annuals must not be able to end up
 * receiving candidate directives it never asked for, and "must not be able to" is a property of
 * the whole stack, not of one function. So these tests assert the DEFAULT as hard as they assert
 * the behaviour.
 */
test.describe("AD tracking mode", () => {
  test.afterEach(async ({ request }) => {
    // Back to the default, or the next test in this file inherits a mode it did not set.
    const { base, headers } = await ownerHeaders(request);
    await request.patch(`${base}/organizations/adTracking`, { headers, data: { mode: "off" } });
  });

  test("is off unless somebody turns it on", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const res = await request.get(`${base}/organizations/adTracking`, { headers });
    expect(res.ok()).toBeTruthy();
    const { data } = await res.json();
    expect(data.mode, "a school must not be opted in to AD proposals by default").toBe("off");
  });

  test("reports what could be matched for each aeroplane, honestly", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const { data } = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();

    expect(data.aircraft.length).toBeGreaterThan(0);
    expect(data.counts.total).toBe(data.aircraft.length);
    // Every aeroplane lands in exactly one bucket, so the three counts add up to the fleet.
    expect(data.counts.serial + data.counts.model + data.counts.none).toBe(data.counts.total);

    for (const a of data.aircraft) {
      expect(["serial", "model", "none"]).toContain(a.quality);
      // An aeroplane we cannot narrow must say what would fix it, or the panel is just a
      // complaint.
      if (a.quality !== "serial") expect(a.missing.length).toBeGreaterThan(0);
    }
  });

  test("a serial number moves an aeroplane from model-only to serial", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const plane = await firstPlane(request, base, headers);

    const before = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
    const rowBefore = before.data.aircraft.find((a: { resourceId: number }) => a.resourceId === plane.id);
    expect(rowBefore).toBeTruthy();

    // THE SHAPE THE CONSOLE ACTUALLY SENDS. An earlier version of this test invented
    // `PATCH /resources/planes/:id`, never asserted the response, and read the resulting 404
    // as a server bug. Every write here is asserted for that reason.
    const write = await request.patch(`${base}/resources/${plane.id}`, {
      headers,
      data: { type: { plane: { tailNumber: plane.type.plane.tailNumber, serialNumber: "17271234" } } },
    });
    expect(write.ok(), `PATCH /resources/${plane.id} failed: ${await write.text()}`).toBeTruthy();

    const after = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
    const rowAfter = after.data.aircraft.find((a: { resourceId: number }) => a.resourceId === plane.id);
    expect(rowAfter.serialNumber, "the serial number must survive the round trip").toBe("17271234");
    expect(rowAfter.quality, "a serial number is the thing that improves matching").toBe("serial");
    expect(rowAfter.missing).toEqual([]);

    // Back to whatever it was, or the fleet-wide counts test above sees a fleet this test moved.
    const restore = await request.patch(`${base}/resources/${plane.id}`, {
      headers,
      data: {
        type: { plane: { tailNumber: plane.type.plane.tailNumber, serialNumber: rowBefore.serialNumber ?? "" } },
      },
    });
    expect(restore.ok()).toBeTruthy();
  });

  test("a serial number can be typed on the aircraft form and comes back", async ({ page, request }) => {
    // The readiness panel tells a school to "add serial number". For six weeks there was
    // nowhere to add one: the column existed, the panel asked for it, and no form on any
    // surface offered the field. This is the test that would have caught that.
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
        const r = await request.get(`${base}/organizations/adTracking`, { headers });
        const row = (await r.json()).data.aircraft.find(
          (a: { resourceId: number }) => a.resourceId === plane.id
        );
        return row?.serialNumber;
      })
      .toBe("E2E-SN-4471");

    await request.patch(`${base}/resources/${plane.id}`, {
      headers,
      data: { type: { plane: { tailNumber: plane.type.plane.tailNumber, serialNumber: "" } } },
    });
  });

  test("external must name the system, because the report prints it", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);

    const bare = await request.patch(`${base}/organizations/adTracking`, {
      headers,
      data: { mode: "external" },
    });
    expect(bare.status()).toBe(400);
    expect((await bare.json()).message).toMatch(/which system/i);

    const named = await request.patch(`${base}/organizations/adTracking`, {
      headers,
      data: { mode: "external", externalSystem: "ADlog" },
    });
    expect(named.ok()).toBeTruthy();
    expect((await named.json()).data.externalSystem).toBe("ADlog");

    // Leaving external clears the name, or a document keeps citing a system nobody uses.
    const moved = await request.patch(`${base}/organizations/adTracking`, {
      headers,
      data: { mode: "manual" },
    });
    expect((await moved.json()).data.externalSystem).toBeNull();
  });

  test("an unknown mode is refused rather than stored", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    const res = await request.patch(`${base}/organizations/adTracking`, {
      headers,
      data: { mode: "everything" },
    });
    expect(res.status()).toBe(400);

    const after = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
    expect(after.data.mode).toBe("off");
  });

  test("the four choices are on screen, and off is the one selected", async ({ page }) => {
    await page.goto("/settings?tab=ad-tracking");
    await dismissCookieBanner(page);

    await expect(page.getByRole("button", { name: /Not here/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /I track them here/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Watch for new ones/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Somewhere else/ })).toBeVisible();

    await expect(page.getByRole("button", { name: /Not here/ })).toHaveAttribute("aria-pressed", "true");

    // The sentence that must survive every mode.
    await expect(
      page.getByText(/never decides that an Airworthiness Directive does not apply/i)
    ).toBeVisible();
  });

  test("choosing Somewhere else blocks Save until the system is named", async ({ page }) => {
    await page.goto("/settings?tab=ad-tracking");
    await dismissCookieBanner(page);

    await page.getByRole("button", { name: /Somewhere else/ }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

    await page.getByLabel("Which system?").fill("AVTRAK");
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  });
});
