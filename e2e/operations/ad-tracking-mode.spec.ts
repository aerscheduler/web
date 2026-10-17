import zlib from "node:zlib";
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
/**
 * The test organization is seeded with "Find them for me" on (seed-test-ad-library.sql), because
 * the AD specs under e2e/maintenance need it. These tests start each case from "Not here" and
 * put back whatever mode they found, so running this file never switches the ADs tab off for the
 * next spec. That "off" is the default for a new organization is the column default
 * (`adTrackingMode @default("off")`) and test/unit/adTrackingMode.test.ts on the server.
 */
let found: { mode: string; externalSystem: string | null } | null = null;

test.beforeAll(async ({ request }) => {
  const { base, headers } = await ownerHeaders(request);
  const { data } = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
  found = { mode: data.mode, externalSystem: data.externalSystem ?? null };
});

test.afterAll(async ({ request }) => {
  if (!found) return;
  const { base, headers } = await ownerHeaders(request);
  const back = await request.patch(`${base}/organizations/adTracking`, { headers, data: found });
  expect(back.ok(), `restoring the AD mode failed: ${await back.text()}`).toBeTruthy();
});

test.describe("AD tracking mode", () => {
  test.beforeEach(async ({ request }) => {
    // Each case starts from "Not here", whatever the last one (or the seed) left.
    const { base, headers } = await ownerHeaders(request);
    await request.patch(`${base}/organizations/adTracking`, { headers, data: { mode: "off" } });
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

  /**
   * "Find them for me" was held shut until the AD library existed (it promised a catalogue that
   * was not built). Since 2026-10-16 the library is behind it, so it is chosen like any mode,
   * stored, and offered in the console. If a mode is ever held back again, the refusal lives in
   * AD_TRACKING_MODES_NOT_YET_AVAILABLE on the server and NOT_YET in the settings tab.
   */
  test("Find them for me can be chosen now that the AD library is behind it", async ({
    page,
    request,
  }) => {
    const { base, headers } = await ownerHeaders(request);

    const res = await request.patch(`${base}/organizations/adTracking`, {
      headers,
      data: { mode: "catalogue" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const after = await (await request.get(`${base}/organizations/adTracking`, { headers })).json();
    expect(after.data.mode).toBe("catalogue");

    await page.goto("/settings?tab=ad-tracking");
    await dismissCookieBanner(page);
    const card = page.getByRole("button", { name: /Find them for me/ });
    await expect(card).toBeEnabled();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/Not available yet/i)).toHaveCount(0);
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
    await expect(page.getByRole("button", { name: /Find them for me/ })).toBeVisible();
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

/**
 * "Somewhere else" has to DO something, or it is the same choice as "Not here".
 *
 * The mode stored a system name and the settings card promised it would be "printed on the
 * Airworthiness compliance report". Nothing printed it, so two of the four postures were
 * identical in behaviour and the choice was theatre. The PDF is the copy handed to an IA or a
 * buyer's mechanic, and the failure this prevents is somebody reading a list of sign-offs as a
 * complete AD status.
 */
test.describe("Somewhere else names the system on the document", () => {
  test.beforeEach(async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);
    await request.patch(`${base}/organizations/adTracking`, { headers, data: { mode: "off" } });
  });

  /** The PDF stores its text as hex-encoded runs, so a plain byte search never matches. */
  function pdfText(bytes: Buffer): string {
    let streams = Buffer.alloc(0);
    for (const m of bytes.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
      try {
        streams = Buffer.concat([streams, zlib.inflateSync(Buffer.from(m[1], "latin1"))]);
      } catch {
        // Not every stream is Flate. Fonts are not, and they carry no report text.
      }
    }
    return [...streams.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>/g)]
      .map((m) => Buffer.from(m[1], "hex").toString("latin1"))
      .join("");
  }

  async function airworthinessPdf(request: APIRequestContext, base: string, headers: Record<string, string>) {
    const res = await request.post(`${base}/reports/export`, {
      headers,
      data: {
        reportId: "airworthiness",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T23:59:59.000Z",
        format: "pdf",
      },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    return pdfText(Buffer.from(await res.body()));
  }

  test("the named system is printed, and only when that mode is chosen", async ({ request }) => {
    const { base, headers } = await ownerHeaders(request);

    await request.patch(`${base}/organizations/adTracking`, { headers, data: { mode: "off" } });
    const off = await airworthinessPdf(request, base, headers);
    expect(off, "the footnote should still be there").toContain("time in service");
    expect(off, "nothing to name when the school tracks ADs nowhere").not.toContain("AVTRAK");

    await request.patch(`${base}/organizations/adTracking`, {
      headers,
      data: { mode: "external", externalSystem: "AVTRAK" },
    });
    const external = await airworthinessPdf(request, base, headers);
    expect(external).toContain("AVTRAK");
    expect(external, "and say what that means, not just the name").toContain("authoritative list");
  });
});
