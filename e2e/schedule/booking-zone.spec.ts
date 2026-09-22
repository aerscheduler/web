/**
 * A school with no time zone, end to end.
 *
 * A member is refused in words they can act on, the owners are told once, the owner fixes it
 * in one click from the dashboard, members can book again, and a null PATCH (every shipped app
 * build sends one on each settings save) cannot undo it.
 *
 * The school is built fresh through the API, the way a shipped app build can still create one:
 * POST /organizations with a home airport typed by hand, so no ident and no zone. The shared
 * test org cannot stand in for it: it has a zone, and a school's zone can no longer be cleared.
 * Holmes Aviation and S&S Aircraft were exactly this shape in September 2026.
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { TEST_PASSWORD, apiProxyTarget } from "../helpers/env";
import { TERMS_VERSION } from "../../src/lib/legal";

const MEMBER_MESSAGE =
  "Your school hasn't set its time zone yet, so members can't book online. We've let your school's admins know. Until it's set, an instructor or the front desk can book this for you.";
const ALERT_TITLE = "Set your school's time zone";

const base = () => apiProxyTarget().replace(/\/$/, "");
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

type AuthEnvelope = {
  auth: { accessToken: string };
  data: {
    user: { id: number; name: string };
    organization: { id: number; name: string; code: string; timeZone: string | null } | null;
    organizations?: unknown[];
  };
};

/** The claims inside our own JWT: which org user this token speaks for. */
function orgUserIdOf(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  expect(payload.orgUserId, "token has no org user yet").toBeTruthy();
  return Number(payload.orgUserId);
}

async function signup(request: APIRequestContext, name: string, email: string): Promise<AuthEnvelope> {
  const res = await request.post(`${base()}/users`, {
    data: { name, email, password: TEST_PASSWORD, termsVersion: TERMS_VERSION },
  });
  expect(res.ok(), `POST /users ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** What a shipped app build sends for an airport typed by hand: a name, no ident, no zone. */
async function createSchool(
  request: APIRequestContext,
  ownerToken: string,
  name: string,
  airport: string
): Promise<AuthEnvelope> {
  const empty = { streetAddress1: "", streetAddress2: "", city: "", state: "", zipCode: "", country: "" };
  const res = await request.post(`${base()}/organizations/`, {
    headers: bearer(ownerToken),
    data: {
      name,
      organizationType: "flight_school",
      details: { email: "", phone: "", address: empty },
      location: { name: airport, address: { ...empty, city: "Cushing", state: "OK", country: "US" } },
    },
  });
  expect(res.status(), `POST /organizations ${await res.text()}`).toBe(201);
  return res.json();
}

async function addPlane(request: APIRequestContext, token: string): Promise<number> {
  const locations = await request.get(`${base()}/locations`, { headers: bearer(token) });
  const locBody = await locations.json();
  const locationId = (Array.isArray(locBody) ? locBody : locBody.data)[0].id as number;
  const res = await request.post(`${base()}/resources`, {
    headers: bearer(token),
    data: {
      location: { id: locationId },
      type: {
        plane: {
          tailNumber: `N${String(Date.now()).slice(-5)}Z`,
          make: "Cessna",
          model: "172S",
          year: "2012",
          category: "airplane",
          aircraftClass: "single_engine_land",
          tachTime: 0,
          hobbsTime: 0,
          meterMode: "hobbs_and_tach",
          fuelCapacity: 0,
          fuelMeasurement: "gallons",
          cost: { billByHobbsTime: true, wetRate: 15000 },
        },
      },
    },
  });
  expect(res.ok(), `POST /resources ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return (body.data ?? body).id as number;
}

/** Owner invites the member as student + renter; the member joins with the school's code. */
async function addMember(
  request: APIRequestContext,
  ownerToken: string,
  code: string,
  name: string
): Promise<{ token: string; orgUserId: number }> {
  const email = `e2e-zone-member-${Date.now()}@example.com`;
  const member = await signup(request, name, email);
  const invite = await request.post(`${base()}/organizations/invite`, {
    headers: bearer(ownerToken),
    data: { email, student: true, renter: true },
  });
  expect(invite.ok(), `POST /organizations/invite ${invite.status()} ${await invite.text()}`).toBeTruthy();
  const join = await request.post(`${base()}/organizations/join/${encodeURIComponent(code)}`, {
    headers: bearer(member.auth.accessToken),
  });
  expect(join.ok(), `POST /organizations/join ${join.status()} ${await join.text()}`).toBeTruthy();
  const joined = (await join.json()) as Partial<AuthEnvelope>;
  const token = joined.auth?.accessToken;
  expect(token, "joining did not hand back a token for the school").toBeTruthy();
  return { token: token!, orgUserId: orgUserIdOf(token!) };
}

/** A rental two days out at 10:00 AM Central: inside the default 6 AM to 10 PM flying day. */
function rentalBody(resourceId: number, renterOrgUserId: number) {
  const day = new Date(Date.now() + 2 * 86_400_000);
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 15, 0));
  return {
    title: "E2E zone rental",
    notes: "E2E booking-zone",
    type: "rental",
    start: start.toISOString(),
    end: new Date(start.getTime() + 3_600_000).toISOString(),
    timeZoneName: "America/Chicago",
    resource: { id: resourceId },
    personnel: { renters: [{ id: renterOrgUserId }] },
  };
}

async function alertsFor(request: APIRequestContext, token: string) {
  const res = await request.get(`${base()}/notifications`, { headers: bearer(token) });
  expect(res.ok(), `GET /notifications ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const rows = (Array.isArray(body) ? body : body.data ?? []) as { title: string; subtitle: string; link: string }[];
  return rows.filter((n) => n.title === ALERT_TITLE);
}

async function schoolZone(request: APIRequestContext, token: string): Promise<string | null> {
  const res = await request.get(`${base()}/auth/`, { headers: bearer(token) });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.organization.timeZone ?? null;
}

/** Sign the page in as this token's account, the same session the login form stores. */
async function signInAs(page: Page, request: APIRequestContext, token: string) {
  const res = await request.get(`${base()}/auth/`, { headers: bearer(token) });
  const env = (await res.json()) as AuthEnvelope;
  const orgs = env.data.organizations ?? (env.data.organization ? [env.data.organization] : []);
  const session = JSON.stringify({
    user: env.data.user,
    organization: env.data.organization ?? orgs[0] ?? null,
    organizations: orgs,
  });
  await page.addInitScript(
    ([t, s]) => {
      localStorage.setItem("aer.token", t);
      localStorage.setItem("aer.session", s);
    },
    [token, session] as const
  );
}

async function declineCookies(page: Page) {
  const decline = page.getByRole("button", { name: /^Decline$/i });
  if (await decline.isVisible().catch(() => false)) await decline.click();
}

test.describe("A school with no time zone", () => {
  test.use({ storageState: { cookies: [], origins: [] }, timezoneId: "America/Chicago" });

  test("members are told why, owners are told once, one click fixes it, and null can't undo it", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const owner = await signup(request, "E2E Zone Owner", `e2e-zone-owner-${stamp}@example.com`);
    const school = await createSchool(request, owner.auth.accessToken, `E2E Zoneless ${stamp}`, "Pasture Strip");
    const ownerToken = school.auth.accessToken;
    expect(school.data.organization?.timeZone ?? null, "a hand-typed airport gives no zone").toBeNull();

    const planeId = await addPlane(request, ownerToken);
    const member = await addMember(request, ownerToken, school.data.organization!.code, "Sam Zone");

    // 1. The member is refused, in words they can act on.
    const refused = await request.post(`${base()}/reservations/`, {
      headers: bearer(member.token),
      data: rentalBody(planeId, member.orgUserId),
    });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).message).toBe(MEMBER_MESSAGE);

    // 2. The owner is told, once, however many times the member tries.
    await expect.poll(async () => (await alertsFor(request, ownerToken)).length).toBe(1);
    await request.post(`${base()}/reservations/`, {
      headers: bearer(member.token),
      data: rentalBody(planeId, member.orgUserId),
    });
    const alerts = await alertsFor(request, ownerToken);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].subtitle).toContain("Sam Zone couldn't book a flight");
    expect(alerts[0].subtitle).toContain(`E2E Zoneless ${stamp} has no time zone yet`);
    expect(alerts[0].link).toBe("/organization-settings");
    // The member is not an admin, so nothing lands in their inbox.
    expect(await alertsFor(request, member.token)).toHaveLength(0);

    // 3. The owner sees why on the dashboard and fixes it in one click. "Pasture Strip" is not
    //    an airport we can place, so the offer is this browser's zone (Chicago, via timezoneId).
    await signInAs(page, request, ownerToken);
    await page.goto("/dashboard");
    await declineCookies(page);
    const banner = page.getByRole("status").filter({ hasText: "Members can't book online until your school has a time zone." });
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner.getByText("This computer's time zone")).toBeVisible();
    await banner.getByRole("button", { name: /Use Central \(Chicago\)/ }).click();
    await expect(page.getByText(/Members can book online again/)).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(await schoolZone(request, ownerToken)).toBe("America/Chicago");

    // 4. The member can book again.
    const booked = await request.post(`${base()}/reservations/`, {
      headers: bearer(member.token),
      data: rentalBody(planeId, member.orgUserId),
    });
    expect(booked.status(), await booked.text()).toBe(201);
    const bookingId = ((await booked.json()).data ?? {}).id as number;
    await request.delete(`${base()}/reservations/${bookingId}`, {
      headers: bearer(ownerToken),
      data: { reason: "E2E test cleanup", category: "booked_in_error" },
    });

    // 5. A null cannot clear it: not alone, and not the shape every shipped app build sends.
    const bareNull = await request.patch(`${base()}/organizations/`, {
      headers: bearer(ownerToken),
      data: { timeZone: null },
    });
    expect(bareNull.ok(), await bareNull.text()).toBeTruthy();
    const appShaped = await request.patch(`${base()}/organizations/`, {
      headers: bearer(ownerToken),
      data: { id: null, name: null, timeZone: null, preferences: { updateResourceLocationOnRampIn: true } },
    });
    expect(appShaped.ok(), await appShaped.text()).toBeTruthy();
    expect(await schoolZone(request, ownerToken)).toBe("America/Chicago");
  });

});

// The browser sits in Los Angeles here, so an offer of Central can only have come from KCUH.
test.describe("A school whose airport we can place", () => {
  test.use({ storageState: { cookies: [], origins: [] }, timezoneId: "America/Los_Angeles" });

  test("an airport typed as its identifier is offered by its own zone, not the browser's", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const owner = await signup(request, "E2E Zone Owner", `e2e-zone-owner-kcuh-${stamp}@example.com`);
    // S&S Aircraft's shape: the location's name IS the identifier, and nothing else is set.
    const school = await createSchool(request, owner.auth.accessToken, `E2E Zoneless KCUH ${stamp}`, "KCUH");
    const ownerToken = school.auth.accessToken;
    expect(school.data.organization?.timeZone ?? null).toBeNull();

    const readiness = await request.get(`${base()}/organizations/multiDayReadiness`, {
      headers: bearer(ownerToken),
    });
    const offer = (await readiness.json()).data;
    expect(offer.ready).toBe(false);
    expect(offer.suggestedTimeZone).toBe("America/Chicago");
    expect(offer.suggestedFrom).toBe("KCUH");

    await signInAs(page, request, ownerToken);
    await page.goto("/schedule");
    await declineCookies(page);
    const banner = page.getByRole("status").filter({ hasText: "Members can't book online until your school has a time zone." });
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner.getByText("The time zone at KCUH")).toBeVisible();
    await expect(banner.getByRole("button", { name: /Use Central \(Chicago\)/ })).toBeVisible();
    await expect(banner.getByRole("link", { name: "Choose a different one" })).toHaveAttribute(
      "href",
      "/settings?tab=organization"
    );
  });
});

test.describe("The shared test school", () => {
  test.use({ storageState: ".auth/owner.json" });

  test("a school with a zone shows no banner, and the Settings card says where it flies", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Members can't book online until your school has a time zone.")).toHaveCount(0);
    await page.goto("/settings?tab=organization");
    const card = page.locator('[data-doc-shot="settings-org-timezone"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText(/Not set, so members can't book online/)).toHaveCount(0);
  });
});
