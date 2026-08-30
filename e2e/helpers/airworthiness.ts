import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget, type AccountRole } from "./env";

/**
 * Fixtures for the Airworthiness Directive journeys.
 *
 * Shared rather than copied because three specs now drive the same feature from three
 * different chairs, and the one thing that must not happen is the owner's spec and the
 * technician's spec disagreeing about what an AD fixture looks like. When they disagree,
 * both pass and neither is testing the product.
 */

/** Everything this file creates is named with this, so cleanup can find it. */
export const AD_PREFIX = "E2E-ROLE-";

export type Auth = { base: string; headers: Record<string, string> };

export async function authAs(request: APIRequestContext, role: AccountRole): Promise<Auth> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS[role], password: TEST_PASSWORD },
  });
  expect(auth.ok(), `could not sign in as ${role}: ${await auth.text()}`).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

/**
 * The consent banner sits over the bottom-left of the page and swallows clicks near it.
 * Declining rather than accepting, which is what the product itself recommends.
 */
export async function dismissCookieBanner(page: Page) {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.count()) await decline.first().click().catch(() => undefined);
}

export async function firstPlane(request: APIRequestContext, auth: Auth) {
  const res = await request.get(`${auth.base}/resources`, { headers: auth.headers });
  const list = (await res.json()).data ?? [];
  const plane = list.find((r: { type?: { plane?: unknown } }) => r.type?.plane);
  expect(plane, "no aircraft seeded").toBeTruthy();
  return plane as { id: number; type: { plane: { tailNumber: string; tachTime: number } } };
}

export type AdFixture = {
  templateId: number;
  name: string;
  /** The AD number, e.g. "E2E-2026-04-11". Unique per run so searches do not collide. */
  ref: string;
  resourceId: number;
  tailNumber: string;
};

/**
 * An Airworthiness Directive on one aeroplane, already due.
 *
 * `remindHoursBefore` is deliberately enormous so the reminder reads as due the moment it
 * exists. A test that had to fly the aircraft first would be testing the meter, not the
 * directive.
 */
export async function givenDueAd(
  request: APIRequestContext,
  auth: Auth,
  opts: { label: string; revision?: string; revisionDate?: string; grounds?: boolean } = {
    label: "AD",
  }
): Promise<AdFixture> {
  const plane = await firstPlane(request, auth);
  const stamp = Date.now();
  const name = `${AD_PREFIX}${opts.label}-${stamp}`;
  const ref = `E2E-${stamp}`;

  const created = await request.post(`${auth.base}/maintenance/reminders/templates`, {
    headers: auth.headers,
    data: {
      name,
      repeat: true,
      ground: opts.grounds ?? false,
      remindHours: 1000,
      remindHoursBefore: 100_000,
      hourBasedOn: "tach",
      sourceType: "ad",
      sourceRef: ref,
      revision: opts.revision ?? "39-23424",
      revisionDate: opts.revisionDate ?? "2026-03-15T00:00:00.000Z",
      templateResources: [
        { id: plane.id, startHour: 10_000, startDate: "2025-01-01T00:00:00.000Z" },
      ],
    },
  });
  expect(created.ok(), `could not create the AD fixture: ${await created.text()}`).toBeTruthy();

  return {
    templateId: (await created.json()).data.id as number,
    name,
    ref,
    resourceId: plane.id,
    tailNumber: plane.type.plane.tailNumber,
  };
}

/**
 * Remove this run's fixtures.
 *
 * A template whose reminder has been signed off CANNOT be deleted: the compliance record's
 * foreign key is RESTRICT, on purpose, because the record has to outlive the rule. A refused
 * delete here is the feature working, so it is swallowed rather than thrown.
 */
export async function cleanupAdFixtures(request: APIRequestContext) {
  const auth = await authAs(request, "owner");
  const list = await request.get(`${auth.base}/maintenance/reminders/templates`, {
    headers: auth.headers,
  });
  if (!list.ok()) return;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  for (const item of items) {
    if (!String(item.name ?? "").startsWith(AD_PREFIX) || item.id == null) continue;
    await request
      .delete(`${auth.base}/maintenance/reminders/templates/${item.id}`, {
        headers: auth.headers,
        data: {},
      })
      .catch(() => undefined);
  }
}

/**
 * Sign one inspection off through the console, the way a person does it.
 *
 * Through the UI on purpose. Every regression this feature has had lived between the form
 * and the request: a prefilled meter whose value was never read back, a certificate type
 * that was submitted but never shown, a compliance section that did not open on the one
 * kind of inspection that requires it.
 */
export async function signOffThroughUi(
  page: Page,
  opts: {
    templateName: string;
    method: string;
    mechanic: string;
    certificateNumber?: string;
    certificateType?: "A&P" | "IA" | "Repair station";
  }
) {
  await page.goto(`/maintenance?view=reminders&q=${encodeURIComponent(opts.templateName)}`);
  await dismissCookieBanner(page);
  await page.getByRole("button", { name: "Sign off" }).first().click();

  // On an AD the compliance half opens already switched on, because for those the record
  // IS the point rather than an optional extra.
  await expect(page.getByText(/Once signed, this record can/)).toBeVisible();

  await page.getByLabel("What was done").fill(opts.method);
  await page.getByLabel("Certified by").fill(opts.mechanic);

  if (opts.certificateNumber !== undefined) {
    await page.getByLabel("Certificate", { exact: true }).fill(opts.certificateNumber);
  }
  if (opts.certificateType) {
    await page.getByLabel("Type", { exact: true }).click();
    await page.getByRole("option", { name: opts.certificateType, exact: true }).click();
  }

  await page.getByRole("button", { name: "Sign off", exact: true }).last().click();
  await expect(page.getByText("Signed off.")).toBeVisible({ timeout: 20_000 });
}

/** The compliance records for one AD number, straight from the API. */
export async function recordsFor(request: APIRequestContext, auth: Auth, ref: string) {
  const res = await request.get(`${auth.base}/maintenance/compliance?q=${ref}&limit=50`, {
    headers: auth.headers,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()).data ?? []) as Record<string, any>[];
}
