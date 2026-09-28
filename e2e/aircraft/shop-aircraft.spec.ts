import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";

/**
 * A maintenance shop's customer aircraft, and the people who own them.
 *
 * Three promises are made to a school here, and each one costs real money or real trust if
 * it breaks:
 *
 *   1. A customer's aeroplane can never be booked to fly. Hiding it from the picker is not
 *      enough; a stale tab or the public API can still name its id.
 *   2. A customer's aeroplane is not billed. The plan is priced per aircraft, and a shop
 *      that sees eighty transient tails a year must not be charged for eighty aeroplanes.
 *   3. An owner the shop types in is never contacted and can never sign in. They were
 *      written down by somebody else; they never asked us for anything.
 *
 * The fixtures are named as a real shop would name them. Everything is cleaned up at the
 * end, including the person, because an owner left behind is a stranger on somebody's
 * roster.
 */

const base = () => apiProxyTarget().replace(/\/$/, "");

type Ctx = { token: string; orgId: number };

async function authed(request: APIRequestContext): Promise<Ctx> {
  const auth = await apiLogin(request, ACCOUNTS.owner);
  return { token: auth.auth.accessToken as string, orgId: auth.data.organization.id as number };
}

const headers = (c: Ctx) => ({ Authorization: `Bearer ${c.token}` });

async function firstLocationId(request: APIRequestContext, c: Ctx): Promise<number> {
  const res = await request.get(`${base()}/locations`, { headers: headers(c) });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const rows = body.data ?? body;
  expect(rows.length, "the test org needs a location").toBeGreaterThan(0);
  return rows[0].id;
}

async function createShopAircraft(request: APIRequestContext, c: Ctx, tail: string) {
  const res = await request.post(`${base()}/resources`, {
    headers: headers(c),
    data: {
      location: { id: await firstLocationId(request, c) },
      use: "shop",
      type: {
        plane: {
          tailNumber: tail,
          make: "Piper",
          model: "PA-28-180 Cherokee",
          year: "1968",
          category: "airplane",
          aircraftClass: "single_engine_land",
          meterMode: "hobbs_and_tach",
          hobbsTime: 51330,
          tachTime: 48210,
          fuelCapacity: 5000,
          fuelMeasurement: "gallons",
          cost: { billByHobbsTime: true, wetRate: 0 },
        },
      },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).data;
}

async function deleteResource(request: APIRequestContext, c: Ctx, id: number) {
  await request.delete(`${base()}/resources/${id}`, { headers: headers(c) }).catch(() => undefined);
}

test.describe("a customer's aircraft in the shop", () => {
  const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}`;
  let ctx: Ctx;
  let shopId: number;

  test.beforeAll(async ({ request }) => {
    ctx = await authed(request);
    const created = await createShopAircraft(request, ctx, TAIL);
    shopId = created.id;
  });

  test.afterAll(async ({ request }) => {
    if (shopId) await deleteResource(request, ctx, shopId);
  });

  test("is kept out of the fleet list and only appears in the shop list", async ({ request }) => {
    const fleet = await request.get(`${base()}/resources/planes?limit=200`, { headers: headers(ctx) });
    const fleetTails = ((await fleet.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);
    expect(fleetTails).not.toContain(TAIL);

    const shop = await request.get(`${base()}/resources/planes?scope=shop&limit=200`, { headers: headers(ctx) });
    const shopTails = ((await shop.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);
    expect(shopTails).toContain(TAIL);
  });

  // THE DEFAULT IS THE PROMISE. Mobile builds already in people's pockets call this
  // endpoint with no scope at all, and they know nothing about customer aircraft.
  test("is absent when a client asks for aircraft without saying which kind", async ({ request }) => {
    const res = await request.get(`${base()}/resources/planes?limit=200`, { headers: headers(ctx) });
    const tails = ((await res.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);
    expect(tails).not.toContain(TAIL);
  });

  // THE HOLE A PATROL RUN FOUND. The phone's aircraft list does not read
  // /resources/planes at all, it reads /resources, and that list had no scope filter, so a
  // customer's aeroplane was on the phone while every check written against
  // /resources/planes passed. Both lists default to the fleet now.
  test("is absent from the plain resources list the app reads", async ({ request }) => {
    const res = await request.get(`${base()}/resources`, { headers: headers(ctx) });
    const tails = ((await res.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);

    expect(tails).not.toContain(TAIL);
    expect(tails.length, "the fleet list should still have the school's own aircraft").toBeGreaterThan(0);
  });

  test("is in the plain resources list only when the caller asks for the shop", async ({ request }) => {
    const res = await request.get(`${base()}/resources?scope=shop`, { headers: headers(ctx) });
    const tails = ((await res.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);

    expect(tails).toContain(TAIL);
  });

  // THE THIRD DOOR. The organization payload returned at sign-in carries the school's
  // resources, and the phone builds its lists from that rather than from either endpoint
  // above. This is what actually put a customer's aeroplane on the phone.
  test("is absent from the organization payload the app signs in with", async ({ request }) => {
    const auth = await request.post(`${base()}/auth/`, {
      data: { email: ACCOUNTS.owner, password: "AerTest2026!" },
    });
    const org = (await auth.json()).data.organization;
    const tails = (org.resources ?? []).map((r: any) => r.type?.plane?.tailNumber);

    expect(tails).not.toContain(TAIL);
    expect(tails.length, "the payload should still carry the fleet").toBeGreaterThan(0);
  });

  test("an unrecognised scope falls back to the fleet rather than widening it", async ({ request }) => {
    const res = await request.get(`${base()}/resources/planes?scope=everything&limit=200`, { headers: headers(ctx) });
    const tails = ((await res.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);
    expect(tails).not.toContain(TAIL);
  });

  test.describe("cannot be booked to fly", () => {
    const start = new Date(Date.now() + 7 * 864e5).toISOString();
    const end = new Date(Date.now() + 7 * 864e5 + 2 * 36e5).toISOString();

    //Only the types this role is allowed to create at all. A checkride is refused one step
    //earlier by the role-to-type matrix, which is a different rule with a different message,
    //and asserting our message on it would pass for the wrong reason the day this one breaks.
    for (const type of ["rental", "solo", "shared"]) {
      test(`the server refuses a ${type} booking`, async ({ request }) => {
        const res = await request.post(`${base()}/reservations`, {
          headers: headers(ctx),
          data: { type, resource: { id: shopId }, start, end },
        });

        expect(res.ok(), `a ${type} booking on a customer's aircraft was accepted`).toBeFalsy();
        expect(await res.text()).toContain("maintenance");
      });
    }

    // A WELL-FORMED booking, with a renter attached, which is what a dispatcher with a
    // stale tab actually sends. The bare payloads above are refused on their own terms as
    // well (no personnel), so on their own they never proved the shop rule fires first.
    test("refuses a complete, otherwise-valid rental", async ({ request }) => {
      const people = await request.get(`${base()}/orgUsers?renter=true&limit=5`, { headers: headers(ctx) });
      const renter = ((await people.json()).data ?? [])[0];
      expect(renter, "the test org needs a renter").toBeTruthy();

      const res = await request.post(`${base()}/reservations`, {
        headers: headers(ctx),
        data: {
          type: "rental",
          resource: { id: shopId },
          start,
          end,
          personnel: { renters: [{ id: renter.id }] },
        },
      });

      expect(res.ok()).toBeFalsy();
      expect(await res.text()).toContain("maintenance");
    });

    // AT THREE IN THE MORNING, outside any school's flying day. This is the ordering the
    // rule needs: the flying-day window used to answer first, so a dispatcher trying to
    // book a customer's aeroplane for a flight was told to come back at nine, for an
    // aircraft that can never be flown at all. It also made the tests above pass or fail
    // depending on what time of day the suite ran.
    test("refuses outside the flying day with the shop's reason, not the hour's", async ({ request }) => {
      const night = new Date(Date.now() + 7 * 864e5);
      night.setUTCHours(10, 0, 0, 0); // 03:00 or 04:00 in America/Denver, which is the test org's zone.
      const nightEnd = new Date(night.getTime() + 36e5);

      const res = await request.post(`${base()}/reservations`, {
        headers: headers(ctx),
        data: { type: "rental", resource: { id: shopId }, start: night.toISOString(), end: nightEnd.toISOString() },
      });

      expect(res.ok()).toBeFalsy();
      const body = await res.text();
      expect(body).toContain("maintenance");
      expect(body).not.toContain("only bookable from");
    });

    //The other half of the rule, and the reason the aircraft is on the calendar at all.
    test("but maintenance is allowed, which is the whole point", async ({ request }) => {
      const res = await request.post(`${base()}/reservations`, {
        headers: headers(ctx),
        data: { type: "maintenance", resource: { id: shopId }, start, end, title: "E2E annual" },
      });

      expect(res.status(), await res.text()).toBe(201);
      const created = (await res.json()).data;
      await request
        .delete(`${base()}/reservations/${created.id}`, { headers: headers(ctx) })
        .catch(() => undefined);
    });
  });

  // THE BYPASS. A PATCH need not resend the aircraft, so this is the shape that turned a
  // maintenance booking on a customer's aeroplane into a training flight on it.
  test("refuses a PATCH that turns a maintenance booking into a flight", async ({ request }) => {
    const start = new Date(Date.now() + 9 * 864e5).toISOString();
    const end = new Date(Date.now() + 9 * 864e5 + 2 * 36e5).toISOString();

    const created = await request.post(`${base()}/reservations`, {
      headers: headers(ctx),
      data: { type: "maintenance", resource: { id: shopId }, start, end, title: "E2E annual" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const booking = (await created.json()).data;

    try {
      const patched = await request.patch(`${base()}/reservations/${booking.id}`, {
        headers: headers(ctx),
        data: { type: "dual" },
      });

      expect(patched.ok(), "a customer's aircraft was turned into a training flight").toBeFalsy();
      expect(await patched.text()).toContain("maintenance");
    } finally {
      await request
        .delete(`${base()}/reservations/${booking.id}`, {
          headers: headers(ctx),
          data: { cancellationType: "other", reason: "E2E cleanup" },
        })
        .catch(() => undefined);
    }
  });

  // THE MONEY PROMISE.
  test("does not change what the school is billed for", async ({ request }) => {
    const before = await request.get(`${base()}/subscription`, { headers: headers(ctx) });
    const count = ((await before.json()).data ?? (await before.json())).unitCount;

    const extra = await createShopAircraft(request, ctx, `${TAIL}X`);
    try {
      const after = await request.get(`${base()}/subscription`, { headers: headers(ctx) });
      const body = await after.json();
      expect((body.data ?? body).unitCount, "a customer's aircraft was counted on the plan").toBe(count);
    } finally {
      await deleteResource(request, ctx, extra.id);
    }
  });

  test("shows up under Customer aircraft in the console, and not under Fleet", async ({ page }) => {
    await page.goto("/aircraft");
    await expect(page.getByRole("tab", { name: "Fleet" })).toBeVisible();
    await expect(page.getByText(TAIL)).toHaveCount(0);

    await page.getByRole("tab", { name: "Customer aircraft" }).click();
    await expect(page.getByText(TAIL).first()).toBeVisible();
  });
});

test.describe("an owner the shop writes down", () => {
  const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}`;
  const OWNER = `E2E Dale Whitcomb ${Date.now()}`;
  // UNIQUE PER RUN, like the tail. The service now reuses an existing owner when the
  // contact address matches, which is correct for a shop with one customer and two
  // aeroplanes, and would silently hand this test the person a previous run left behind.
  const OWNER_EMAIL = `e2e-dale.whitcomb+${Date.now()}@example.com`;
  let ctx: Ctx;
  let shopId: number;
  let ownerUserId: number | undefined;
  let ownerMemberId: number | undefined;
  //A real maintenance booking, because the board leak is only provable with something
  //actually on the board. This is the row a student used to read the registration off.
  let maintenanceBookingId: number | undefined;
  //The control: a booking on one of the school's OWN aeroplanes, which every member sees
  //and which the filter must leave alone.
  let fleetBookingId: number | undefined;
  let fleetTail: string | undefined;

  test.beforeAll(async ({ request }) => {
    ctx = await authed(request);
    shopId = (await createShopAircraft(request, ctx, TAIL)).id;

    const res = await request.post(`${base()}/resources/${shopId}/owners`, {
      headers: headers(ctx),
      data: { name: OWNER, email: OWNER_EMAIL, phone: "555-0142", title: "Owner", isPrimary: true },
    });
    expect(res.status(), await res.text()).toBe(201);

    const listed = await request.get(`${base()}/resources/${shopId}/owners`, { headers: headers(ctx) });
    const ownerRow = ((await listed.json()).data ?? [])[0]?.orgUser;
    ownerUserId = ownerRow?.user?.id;
    ownerMemberId = ownerRow?.id;

    const bookedIn = await request.post(`${base()}/reservations`, {
      headers: headers(ctx),
      data: {
        type: "maintenance",
        resource: { id: shopId },
        start: new Date(Date.now() + 2 * 864e5).toISOString(),
        end: new Date(Date.now() + 2 * 864e5 + 2 * 36e5).toISOString(),
        title: "E2E annual",
      },
    });
    expect(bookedIn.status(), await bookedIn.text()).toBe(201);
    maintenanceBookingId = (await bookedIn.json()).data?.id;

    // AND ONE ON THE SCHOOL'S OWN AEROPLANE, at the same hour, which is the control. A
    // filter that returns nothing passes every "not.toContain" below, so the leak tests
    // are only worth running when there is something on the board that MUST survive them.
    const fleetPlanes = await request.get(`${base()}/resources/planes?limit=1`, { headers: headers(ctx) });
    const ownAircraft = ((await fleetPlanes.json()).data ?? [])[0];
    expect(ownAircraft, "the test org needs a fleet aircraft").toBeTruthy();
    fleetTail = ownAircraft.type?.plane?.tailNumber;

    const ownBooking = await request.post(`${base()}/reservations`, {
      headers: headers(ctx),
      data: {
        type: "maintenance",
        resource: { id: ownAircraft.id },
        start: new Date(Date.now() + 3 * 864e5).toISOString(),
        end: new Date(Date.now() + 3 * 864e5 + 36e5).toISOString(),
        title: "E2E oil change",
      },
    });
    expect(ownBooking.status(), await ownBooking.text()).toBe(201);
    fleetBookingId = (await ownBooking.json()).data?.id;
  });

  test.afterAll(async ({ request }) => {
    for (const id of [maintenanceBookingId, fleetBookingId]) {
      if (id) await request.delete(`${base()}/reservations/${id}`, { headers: headers(ctx) }).catch(() => undefined);
    }
    if (shopId) await deleteResource(request, ctx, shopId);
    //ARCHIVED, not deleted: there is no hard delete for a member and there should not be,
    //because a membership carries invoices and history. Archiving is the product's own
    //answer to "take this person off every list", so it is the honest cleanup here too.
    if (ownerUserId) {
      await request
        .patch(`${base()}/users/${ownerUserId}/orgUser/archive`, {
          headers: headers(ctx),
          data: { archived: true },
        })
        .catch(() => undefined);
    }
  });

  test("is listed as the owner, and as the one who gets the bill", async ({ request }) => {
    const res = await request.get(`${base()}/resources/${shopId}/owners`, { headers: headers(ctx) });
    const rows = (await res.json()).data ?? [];

    expect(rows).toHaveLength(1);
    expect(rows[0].orgUser.user.name).toBe(OWNER);
    expect(rows[0].isPrimary).toBe(true);
    expect(rows[0].title).toBe("Owner");
  });

  test("is an outside party who never confirmed anything", async ({ request }) => {
    const res = await request.get(`${base()}/resources/${shopId}/owners`, { headers: headers(ctx) });
    const owner = ((await res.json()).data ?? [])[0];

    expect(owner.orgUser.external, "an outside owner must be marked external").toBe(true);
    expect(owner.orgUser.claimedAt, "nobody confirmed this membership").toBeNull();
  });

  // Their real address must NOT be the one on the login, or the day they sign up for
  // AerScheduler themselves their own email is already taken by a row they have never seen.
  test("keeps their real address off the login record", async ({ request }) => {
    const res = await request.get(`${base()}/resources/${shopId}/owners`, { headers: headers(ctx) });
    const owner = ((await res.json()).data ?? [])[0];

    expect(owner.orgUser.contactEmail).toBe(OWNER_EMAIL);
    expect(owner.orgUser.user.email).not.toBe(OWNER_EMAIL);
    expect(owner.orgUser.user.email).toContain("@unclaimed.aerscheduler.internal");
  });

  // Their REAL login address, read back from the API rather than guessed. The first
  // version of this test tried two addresses that belonged to no row at all, so it proved
  // only that made-up credentials fail, and it would have passed with the whole unclaimed
  // scheme deleted.
  test("cannot sign in with the address their login actually carries", async ({ request }) => {
    const listed = await request.get(`${base()}/resources/${shopId}/owners`, { headers: headers(ctx) });
    const owner = ((await listed.json()).data ?? [])[0];
    const loginEmail = owner.orgUser.user.email as string;

    expect(loginEmail).toContain("@unclaimed.aerscheduler.internal");

    for (const email of [loginEmail, OWNER_EMAIL]) {
      const res = await request.post(`${base()}/auth/`, { data: { email, password: "AerTest2026!" } });
      expect(res.ok(), `${email} was able to sign in`).toBeFalsy();
    }
  });

  test("is on the roster but never in a booking picker", async ({ request }) => {
    const roster = await request.get(`${base()}/orgUsers?limit=200`, { headers: headers(ctx) });
    const names = ((await roster.json()).data ?? []).map((m: any) => m.user?.name);
    expect(names, "the school should be able to see who owns the aircraft").toContain(OWNER);

    for (const role of ["renter", "student", "instructor"]) {
      const picker = await request.get(`${base()}/orgUsers?${role}=true&limit=200`, { headers: headers(ctx) });
      const pickable = ((await picker.json()).data ?? []).map((m: any) => m.user?.name);
      expect(pickable, `an outside owner turned up in the ${role} picker`).not.toContain(OWNER);
    }
  });

  // THE GATES THAT KEEP A CUSTOMER'S PRIVATE DETAILS OFF A STUDENT'S SCREEN. Pinned by
  // nothing until an adversarial review opened the Owners tab as a student and read the
  // address straight off the page.
  test.describe("who can see any of this", () => {
    for (const role of ["student", "renter", "instructor"] as const) {
      test(`a ${role} cannot read the owners, the shop list, or the aircraft itself`, async ({ request }) => {
        const auth = await apiLogin(request, ACCOUNTS[role]);
        const as = { Authorization: `Bearer ${auth.auth.accessToken}` };

        const owners = await request.get(`${base()}/resources/${shopId}/owners`, { headers: as });
        expect(owners.status(), "owners carry a private phone number and email").toBe(403);

        //The record page is the other way to read the tail. Refused exactly like an id
        //nobody has: a distinct status here is how a student would map the shop fleet.
        const record = await request.get(`${base()}/resources/${shopId}`, { headers: as });
        const nobody = await request.get(`${base()}/resources/999999993`, { headers: as });
        expect(record.status(), "the record page is the other way to read the tail").toBe(nobody.status());
        expect(await record.text(), "the record page is the other way to read the tail").toBe(await nobody.text());

        const listed = await request.get(`${base()}/resources/planes?scope=shop&limit=200`, { headers: as });
        const tails = ((await listed.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);
        expect(tails, "asking for the shop must hand back the fleet, not a refusal").not.toContain(TAIL);
      });
    }

    // THE THREE DOORS THREE SEPARATE REVIEWS FOUND, EACH AFTER THE LAST WAS CALLED FIXED.
    // The aircraft list was scoped, the record 404s, and search grew a filter whose own
    // comment names this exact vector. Meanwhile the endpoints BEHIND those surfaces kept
    // serving the same rows: the dispatch board handed a student the registration, the make
    // and model and the shop's notes; the roster search box listed every customer by name;
    // and the booking refusal read the tail number back out one aircraft id at a time.
    for (const role of ["student", "renter", "instructor"] as const) {
      test(`a ${role} cannot read the tail off the board, the roster, or a refusal`, async ({ request }) => {
        const auth = await apiLogin(request, ACCOUNTS[role]);
        const as = { Authorization: `Bearer ${auth.auth.accessToken}` };

        // 1. The dispatch board. The maintenance booking is real and the admin can see it.
        const from = new Date(Date.now() - 864e5).toISOString();
        const to = new Date(Date.now() + 30 * 864e5).toISOString();
        const board = await request.get(`${base()}/reservations?startDate=${from}&endDate=${to}&ongoing=false`, { headers: as });
        expect(board.ok()).toBeTruthy();
        const rows = (await board.json()).data ?? [];
        // A FILTER THAT RETURNS NOTHING PASSES EVERY "not.toContain" BELOW. The board is a
        // view-only mirror of the whole school and every member still sees all of it, so an
        // empty board is a broken filter, not a working one.
        const tails = rows.map((r: any) => r.resource?.type?.plane?.tailNumber);
        // The control first. The school's own maintenance booking is on this board for
        // every member and always was; if the filter took that with it, every check below
        // passes for the wrong reason.
        expect(tails, "the filter took the school's own bookings with it").toContain(fleetTail);
        expect(tails, "the board handed over a customer's registration").not.toContain(TAIL);
        expect(rows.map((r: any) => r.resource?.use)).not.toContain("shop");

        // 2. The booking the board would have carried, read directly by id.
        if (maintenanceBookingId) {
          const detail = await request.get(`${base()}/reservations/${maintenanceBookingId}`, { headers: as });
          const nobody = await request.get(`${base()}/reservations/999999994`, { headers: as });
          expect(detail.status() < 300, "the id in a stale tab is the same door").toBe(false);
          //And refused exactly like a booking nobody has, or the refusal names the id.
          expect(detail.status(), "a hidden booking answered differently from an absent one").toBe(nobody.status());
          expect(await detail.text(), "a hidden booking answered differently from an absent one").toBe(await nobody.text());
        }

        // 3. The roster. Every unclaimed owner's login ends in the same fixed domain, so
        // one search string used to list the whole of a shop's customer book.
        const roster = await request.get(`${base()}/orgUsers?q=unclaimed.aerscheduler.internal&limit=200`, { headers: as });
        const names = ((await roster.json()).data ?? []).map((m: any) => m.user?.name);
        expect(names, "one search string listed the shop's customers").not.toContain(OWNER);
        // Same trap as the board: prove the roster still answers at all for this role,
        // otherwise the check above passes on an endpoint that broke.
        const wholeRoster = await request.get(`${base()}/orgUsers?limit=200`, { headers: as });
        const everyone = ((await wholeRoster.json()).data ?? []).map((m: any) => m.user?.name);
        //Same control. The school's own people are on this roster for every member.
        expect(everyone.length, "the roster came back empty for this role").toBeGreaterThan(1);
        expect(everyone, "the owner is on the roster, just not this person's").not.toContain(OWNER);

        // 4. The refusal itself, which is otherwise a lookup service: ids are small
        // integers, so a pilot walks the customer list one booking attempt at a time.
        const start = new Date(Date.now() + 8 * 864e5).toISOString();
        const end = new Date(Date.now() + 8 * 864e5 + 36e5).toISOString();
        const refused = await request.post(`${base()}/reservations`, {
          headers: as,
          data: { type: "rental", resource: { id: shopId }, start, end },
        });
        expect(refused.ok(), "the booking must still be refused").toBeFalsy();
        expect(await refused.text(), "the refusal named the aircraft").not.toContain(TAIL);
      });
    }

    // THE 404 ON THE RECORD IS ONLY THE FRONT DOOR. Nine sibling routes under the same id
    // had no gate: a student could read a customer aeroplane's papers (registration,
    // airworthiness, insurance), read its ramp state, and WRITE its fuel on hand. The worst
    // was favouriting it, because a favourite comes back inside that pilot's own sign-in
    // payload from then on, so one request put a stranger's registration permanently into
    // their session on the console and the phone.
    for (const role of ["student", "renter", "instructor"] as const) {
      test(`a ${role} cannot reach the side doors under the aircraft's id`, async ({ request }) => {
        const auth = await apiLogin(request, ACCOUNTS[role]);
        const as = { Authorization: `Bearer ${auth.auth.accessToken}` };

        type Call = (id: number) => Promise<{ status: () => number; text: () => Promise<string> }>;
        const doors: Array<[string, Call]> = [
          ["the papers", (id) => request.get(`${base()}/resources/${id}/files`, { headers: as })],
          ["the ramp state", (id) => request.post(`${base()}/resources/${id}/isRampedIn`, { headers: as, data: {} })],
          ["who is approved on it", (id) => request.get(`${base()}/resources/${id}/approvedUsers`, { headers: as })],
          // A WRITE. This one changed a customer's fuel on hand from 50 gallons to 10.
          ["the fuel on hand", (id) => request.post(`${base()}/resources/${id}/fuel`, { headers: as, data: { fuelEngine1: 10 } })],
          ["favouriting it", (id) => request.post(`${base()}/resources/${id}/favorite`, { headers: as, data: {} })],
          ["unfavouriting it", (id) => request.post(`${base()}/resources/${id}/unfavorite`, { headers: as, data: {} })],
          // WRITES, with bodies valid enough to get past validation to the ownership check.
          ["moving it", (id) => request.post(`${base()}/resources/${id}/location`, { headers: as, data: { locationId: 1 } })],
          ["grounding it", (id) => request.patch(`${base()}/resources/${id}/grounding`, { headers: as, data: { grounded: true } })],
        ];

        //Answered exactly like an aircraft id nobody has. That is the whole property: an
        //absent id can reveal nothing and no write to it can succeed, and matching it byte
        //for byte means the answer cannot tell anybody which ids are the shop's customers.
        //(Not "is an error": the approved-users list answers an absent id with an empty
        //page, so an error there would itself mark the id.)
        for (const [what, call] of doors) {
          const res = await call(shopId);
          const nobody = await call(999999993);
          expect.soft(res.status(), `${what} answered differently from an id nobody has`).toBe(nobody.status());
          expect.soft(await res.text(), `${what} answered differently from an id nobody has`).toBe(await nobody.text());
        }
      });
    }

    // EVERY REFUSAL, COMPARED WITH AN ID NOBODY HAS. Each of these once answered a hidden
    // customer's record with a status of its own (a 404 among 403s, a 400 among 403s), each
    // chosen by careful reasoning, and each one therefore listed exactly the records it
    // existed to hide. Equality with an absent id is the only test that cannot be argued with.
    for (const role of ["student", "renter", "instructor"] as const) {
      test(`a ${role}'s refusals cannot be told apart from an id nobody has`, async ({ request }) => {
        const auth = await apiLogin(request, ACCOUNTS[role]);
        const as = { Authorization: `Bearer ${auth.auth.accessToken}` };
        const squawk = (resourceId: number, title: string) =>
          request.post(`${base()}/maintenance/squawks`, {
            headers: as,
            data: { title, description: "E2E soft brake, left side", resourceId },
          });

        const from = new Date(Date.now() + 9 * 864e5).toISOString();
        const to = new Date(Date.now() + 10 * 864e5).toISOString();
        const pairs: Array<[string, () => Promise<import("@playwright/test").APIResponse>, () => Promise<import("@playwright/test").APIResponse>]> = [
          ["the booking", () => request.get(`${base()}/reservations/${maintenanceBookingId}`, { headers: as }), () => request.get(`${base()}/reservations/999999994`, { headers: as })],
          ["the booking's history", () => request.get(`${base()}/audit/reservation/${maintenanceBookingId}`, { headers: as }), () => request.get(`${base()}/audit/reservation/999999994`, { headers: as })],
          ["a squawk on it", () => squawk(shopId, "E2E squawk"), () => squawk(999999993, "E2E squawk")],
          // The subtle one: refused BEFORE validation, a body with no title answered
          // "not yours" for the shop's aircraft and "Title is required" for anybody else's.
          ["a squawk with no title", () => squawk(shopId, ""), () => squawk(999999993, "")],
          // Found by the second adversarial round, each answering a hidden record in words
          // of its own. Booking ids first, then the aircraft, then the owner by person id.
          ...bookingDoors(maintenanceBookingId!, 999999994),
          ...aircraftDoors(shopId, 999999993),
          ...personDoors(ownerUserId!, 999999991, ownerMemberId!, 999999992),
        ];

        for (const [what, hidden, absent] of pairs) {
          const a = await hidden();
          const b = await absent();
          expect.soft(a.status() < 300, `${what} was reachable`).toBe(false);
          expect.soft(a.status(), `${what}: status differs from an id nobody has`).toBe(b.status());
          expect.soft(await a.text(), `${what}: body differs from an id nobody has`).toBe(await b.text());
        }

        // Doors that rightly answer 200 either way: the answer itself must not differ.
        const sameAnswer: Array<[string, () => Promise<import("@playwright/test").APIResponse>, () => Promise<import("@playwright/test").APIResponse>]> = [
          [
            "my free windows, 'editing' a customer's booking",
            () => request.get(`${base()}/availability/me?startDate=${from}&endDate=${to}&reservationId=${maintenanceBookingId}`, { headers: as }),
            () => request.get(`${base()}/availability/me?startDate=${from}&endDate=${to}&reservationId=999999994`, { headers: as }),
          ],
        ];
        for (const [what, hidden, absent] of sameAnswer) {
          const a = await hidden();
          const b = await absent();
          expect.soft(a.status(), `${what}: status differs from an id nobody has`).toBe(b.status());
          expect.soft(await a.text(), `${what}: body differs from an id nobody has`).toBe(await b.text());
        }

        function bookingDoors(hiddenId: number, absentId: number) {
          const door = (label: string, call: (id: number) => Promise<import("@playwright/test").APIResponse>) =>
            [label, () => call(hiddenId), () => call(absentId)] as [string, () => Promise<import("@playwright/test").APIResponse>, () => Promise<import("@playwright/test").APIResponse>];
          return [
            door("reopening its close-out", (id) => request.post(`${base()}/reservations/${id}/reopen`, { headers: as, data: {} })),
            door("signing it off with no PIN", (id) => request.post(`${base()}/reservations/${id}/confirmReview`, { headers: as, data: {} })),
            door("overriding its prices", (id) => request.post(`${base()}/reservations/${id}/paymentOverrides`, { headers: as, data: {} })),
            door("collecting its package", (id) => request.post(`${base()}/reservations/${id}/prepaid/ensure`, { headers: as, data: {} })),
            door("recording cash for it", (id) => request.post(`${base()}/reservations/${id}/prepaid/record-offline`, { headers: as, data: { method: "cash" } })),
            door("reviewing it as a guest flight", (id) => request.post(`${base()}/reservations/${id}/confirmReviewGuest`, { headers: as, data: {} })),
            door("its invoice", (id) => request.get(`${base()}/invoices/reservation/${id}`, { headers: as })),
            door("its invoice totals", (id) => request.get(`${base()}/invoices/reservation/${id}/invoiceTotals`, { headers: as })),
          ];
        }

        function aircraftDoors(hiddenId: number, absentId: number) {
          const door = (label: string, call: (id: number) => Promise<import("@playwright/test").APIResponse>) =>
            [label, () => call(hiddenId), () => call(absentId)] as [string, () => Promise<import("@playwright/test").APIResponse>, () => Promise<import("@playwright/test").APIResponse>];
          const start = new Date(Date.now() + 12 * 864e5).toISOString();
          const end = new Date(Date.now() + 12 * 864e5 + 2 * 36e5).toISOString();
          return [
            door("its bookings", (id) => request.get(`${base()}/reservations/resource/${id}?startDate=${from}&endDate=${to}`, { headers: as })),
            door("booking it", (id) => request.post(`${base()}/reservations`, { headers: as, data: { type: "solo", resource: { id }, start, end, title: "E2E probe" } })),
            door("requesting it", (id) => request.post(`${base()}/booking-requests`, { headers: as, data: { type: "solo", resource: { id }, start, end } })),
            door("moving it, with no location", (id) => request.post(`${base()}/resources/${id}/location`, { headers: as, data: {} })),
            door("grounding it, with no answer", (id) => request.patch(`${base()}/resources/${id}/grounding`, { headers: as, data: {} })),
          ];
        }

        function personDoors(hiddenUser: number, absentUser: number, hiddenMember: number, absentMember: number) {
          type Call = () => Promise<import("@playwright/test").APIResponse>;
          const byUser = (label: string, call: (id: number) => Promise<import("@playwright/test").APIResponse>) =>
            [label, () => call(hiddenUser), () => call(absentUser)] as [string, Call, Call];
          const start = new Date(Date.now() + 14 * 864e5).toISOString();
          const end = new Date(Date.now() + 14 * 864e5 + 36e5).toISOString();
          return [
            byUser("the owner's approved aircraft", (id) => request.get(`${base()}/users/${id}/approvedResources`, { headers: as })),
            byUser("the owner's contact details", (id) => request.get(`${base()}/users/${id}/details`, { headers: as })),
            byUser("changing the owner's membership", (id) => request.patch(`${base()}/users/${id}/orgUser`, { headers: as, data: {} })),
            byUser("archiving the owner", (id) => request.patch(`${base()}/users/${id}/orgUser/archive`, { headers: as, data: { archived: true } })),
            byUser("the owner's bookings", (id) => request.get(`${base()}/reservations/user/${id}?startDate=${from}&endDate=${to}`, { headers: as })),
            byUser("the owner's availability", (id) => request.get(`${base()}/availability/user/${id}?startDate=${from}&endDate=${to}`, { headers: as })),
            byUser("the owner's weekly hours", (id) => request.get(`${base()}/availability/recurring/user/${id}`, { headers: as })),
            [
              "standing by with the owner as instructor",
              () => request.post(`${base()}/standby`, { headers: as, data: { kind: "open_window", start, end, instructorOrgUserId: hiddenMember } }),
              () => request.post(`${base()}/standby`, { headers: as, data: { kind: "open_window", start, end, instructorOrgUserId: absentMember } }),
            ] as [string, Call, Call],
          ];
        }
      });
    }

    // And the gate must not have closed the fleet with it, which is the failure mode of
    // every check like this and the reason the tests above would otherwise prove nothing.
    test("the school's own aircraft are untouched by the gate", async ({ request }) => {
      const auth = await apiLogin(request, ACCOUNTS.student);
      const as = { Authorization: `Bearer ${auth.auth.accessToken}` };

      const fleet = await request.get(`${base()}/resources/planes?limit=5`, { headers: as });
      const first = ((await fleet.json()).data ?? [])[0];
      expect(first, "the test org needs a fleet aircraft").toBeTruthy();

      expect((await request.get(`${base()}/resources/${first.id}`, { headers: as })).status()).toBe(200);
      expect((await request.get(`${base()}/resources/${first.id}/files`, { headers: as })).status()).toBe(200);
    });

    test("a technician can, because ringing the owner is the job", async ({ request }) => {
      const auth = await apiLogin(request, ACCOUNTS.technician);
      const as = { Authorization: `Bearer ${auth.auth.accessToken}` };

      const owners = await request.get(`${base()}/resources/${shopId}/owners`, { headers: as });
      expect(owners.status()).toBe(200);
      expect(((await owners.json()).data ?? []).length).toBeGreaterThan(0);

      const listed = await request.get(`${base()}/resources/planes?scope=shop&limit=200`, { headers: as });
      const tails = ((await listed.json()).data ?? []).map((r: any) => r.type?.plane?.tailNumber);
      expect(tails).toContain(TAIL);
    });
  });

  // AND ON THE ROSTER, which is where an admin meets them without any context. They hold no
  // role on purpose, so the Roles cell was empty and they sat in the "No role yet" facet
  // looking exactly like a member waiting to be given one; giving one is refused, and the
  // refusal was unexplainable from that screen.
  test("is marked on the People page as an owner who never signed up", async ({ page }) => {
    await page.goto(`/people?q=${encodeURIComponent(OWNER)}`);

    const row = page.getByRole("row").filter({ hasText: OWNER });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText("Aircraft owner")).toBeVisible();
    await expect(row.getByText("Not signed up")).toBeVisible();
    await expect(row.getByText("Active")).toHaveCount(0);
    // The address the shop recorded, never the placeholder login behind the record, which
    // the roster printed under every owner's name until 2026-09-27.
    await expect(row.getByText(OWNER_EMAIL)).toBeVisible();
    await expect(row).not.toContainText("unclaimed.aerscheduler.internal");
  });

  test("is offered on the invoice form under the address the invoice will go to", async ({ page }) => {
    await page.goto("/billing");
    await page.getByRole("button", { name: "New invoice" }).click();
    await page.getByLabel("Customer").click();
    await page.getByPlaceholder("Search members…").fill(OWNER);
    const option = page.getByRole("option").filter({ hasText: OWNER });
    await expect(option).toBeVisible();
    await expect(option).toContainText(OWNER_EMAIL);
    await expect(option).not.toContainText("unclaimed.aerscheduler.internal");
  });

  test("appears on the aircraft's Owners panel, marked as not signed up", async ({ page }) => {
    await page.goto(`/aircraft/${shopId}?tab=owners`);

    await expect(page.getByText(OWNER)).toBeVisible();
    await expect(page.getByText("Not signed up")).toBeVisible();
    await expect(page.getByText("Billed")).toBeVisible();
    // The real address, never the placeholder login.
    await expect(page.getByText(OWNER_EMAIL)).toBeVisible();
    await expect(page.getByText(/unclaimed\.aerscheduler\.internal/)).toHaveCount(0);
  });

  test("opens the owner's own page from their name on the Owners panel", async ({ page }) => {
    await page.goto(`/aircraft/${shopId}?tab=owners`);
    await page.getByRole("link", { name: OWNER }).click();

    await expect(page).toHaveURL(/\/people\/\d+/);
    await expect(page.getByText("Aircraft owner").first()).toBeVisible();
    // The aircraft they own here, which is the reason the page exists.
    await expect(page.getByText(TAIL).first()).toBeVisible();
    await expect(page.getByText(OWNER_EMAIL).first()).toBeVisible();
  });
});
