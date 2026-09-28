import { test, expect, type APIRequestContext } from "@playwright/test";
import { apiLogin } from "../helpers/api";
import { ACCOUNTS, apiProxyTarget } from "../helpers/env";

/**
 * WHO CAN SEE A MAINTENANCE SHOP'S CUSTOMERS, through every door that returns a person.
 *
 * The shop's customers are the school's business, not its pilots'. An aircraft owner the
 * shop writes down is visible to the people who run the shop (owner, admin, dispatcher,
 * technician) and to nobody else, and that has to hold on EVERY route that can return a
 * person, not just the one somebody remembered. When this was first audited two of five
 * doors were closed: `GET /users` handed every pilot the shop's whole customer book.
 *
 * A refusal must also be indistinguishable from "no such person", byte for byte. A
 * different answer for "exists but hidden" is itself the leak: it confirms the record.
 *
 * The seven roles run the SAME checks. The only thing that changes is the expectation,
 * and it comes from one line (`SHOP_ROLES`), so a role moved from one side to the other is
 * one edit here and a failing run everywhere it matters.
 */

const base = () => apiProxyTarget().replace(/\/$/, "");
const ROLES = ["owner", "admin", "dispatcher", "technician", "instructor", "student", "renter"] as const;
type Role = (typeof ROLES)[number];
const SHOP_ROLES: ReadonlySet<Role> = new Set(["owner", "admin", "dispatcher", "technician"]);

/** Nobody has these ids; the refusal for a hidden record must read exactly like theirs. */
const NO_SUCH_USER = 999_999_991;
const NO_SUCH_MEMBER = 999_999_992;

const rowsOf = async (res: import("@playwright/test").APIResponse) => {
  const body = await res.json();
  return (body.data ?? body) as Array<Record<string, unknown>>;
};

async function tokenFor(request: APIRequestContext, role: Role) {
  const auth = await apiLogin(request, ACCOUNTS[role]);
  return { auth, headers: { Authorization: `Bearer ${auth.auth.accessToken as string}` } };
}

test.describe("the shop's customers, as each role sees them", () => {
  const TAIL = `E2E-N${Math.floor(Math.random() * 9000 + 1000)}`;
  const OWNER = `E2E Harriet Okonjo ${Date.now()}`;
  const OWNER_EMAIL = `e2e-harriet.okonjo+${Date.now()}@example.com`;
  let ownerHeaders: Record<string, string>;
  let shopAircraftId: number;
  let shopMemberId: number;
  let standInUserId: number;

  test.beforeAll(async ({ request }) => {
    ownerHeaders = (await tokenFor(request, "owner")).headers;

    const locations = await rowsOf(await request.get(`${base()}/locations`, { headers: ownerHeaders }));
    expect(locations.length, "the test org needs a location").toBeGreaterThan(0);

    const created = await request.post(`${base()}/resources`, {
      headers: ownerHeaders,
      data: {
        location: { id: locations[0].id },
        use: "shop",
        type: {
          plane: {
            tailNumber: TAIL,
            make: "Cessna",
            model: "182",
            categoryClass: "single-engine land",
            hobbsTime: 21000,
            tachTime: 20000,
            fuelCapacity: 8700,
            fuelMeasurement: "gallons",
            cost: { billByHobbsTime: true, wetRate: 0 },
          },
        },
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    shopAircraftId = (await created.json()).data.id;

    const added = await request.post(`${base()}/resources/${shopAircraftId}/owners`, {
      headers: ownerHeaders,
      data: { name: OWNER, email: OWNER_EMAIL, phone: "555-0177", title: "Owner", isPrimary: true },
    });
    expect(added.status(), await added.text()).toBe(201);

    const owners = await rowsOf(await request.get(`${base()}/resources/${shopAircraftId}/owners`, { headers: ownerHeaders }));
    const orgUser = owners[0]?.orgUser as { id: number; user: { id: number } } | undefined;
    expect(orgUser, "the owner the shop just added").toBeTruthy();
    shopMemberId = orgUser!.id;
    standInUserId = orgUser!.user.id;
  });

  test.afterAll(async ({ request }) => {
    if (shopAircraftId) {
      await request.delete(`${base()}/resources/${shopAircraftId}`, { headers: ownerHeaders }).catch(() => undefined);
    }
    if (standInUserId) {
      await request
        .patch(`${base()}/users/${standInUserId}/orgUser/archive`, { headers: ownerHeaders, data: { archived: true } })
        .catch(() => undefined);
    }
  });

  for (const role of ROLES) {
    const sees = SHOP_ROLES.has(role);

    test(`${role} ${sees ? "sees" : "cannot see"} the shop's customer and aircraft through every door`, async ({ request }) => {
      const { auth, headers } = await tokenFor(request, role);

      // 1. The roster.
      const roster = await rowsOf(await request.get(`${base()}/orgUsers?limit=500`, { headers }));
      expect(roster.some((m) => m.id === shopMemberId), "GET /orgUsers").toBe(sees);

      // 2. The member record by id, and 3. the person under it.
      for (const [door, hidden, missing] of [
        ["GET /orgUsers/:id", `/orgUsers/${shopMemberId}`, `/orgUsers/${NO_SUCH_MEMBER}`],
        ["GET /orgUsers/:id/users", `/orgUsers/${shopMemberId}/users`, `/orgUsers/${NO_SUCH_MEMBER}/users`],
      ] as const) {
        const res = await request.get(`${base()}${hidden}`, { headers });
        if (sees) {
          expect(res.status(), door).toBe(200);
        } else {
          // Hidden reads exactly like an id nobody has, status and body alike. These doors
          // once answered 404 for a hidden customer and 403 for every other id, which
          // marked precisely the ids that are this school's shop customers.
          const nobody = await request.get(`${base()}${missing}`, { headers });
          expect(res.status(), door).toBe(nobody.status());
          expect(await res.text(), door).toBe(await nobody.text());
        }
      }

      // 4. The org-wide people list the app's People tab reads.
      const users = await rowsOf(await request.get(`${base()}/users?limit=500`, { headers }));
      expect(users.some((u) => u.id === standInUserId), "GET /users").toBe(sees);

      // 5. The person by user id: hidden must read exactly like a user nobody has.
      const person = await request.get(`${base()}/users/${standInUserId}`, { headers });
      if (sees) {
        expect(person.status(), "GET /users/:id").toBe(200);
      } else {
        const nobody = await request.get(`${base()}/users/${NO_SUCH_USER}`, { headers });
        expect(person.status(), "GET /users/:id").toBe(nobody.status());
        expect(await person.text(), "GET /users/:id").toBe(await nobody.text());
      }

      // 6. What the app signs in with. The whole organization rides along, so the shop's
      //    customer must not be in it for a pilot, under any field.
      const signIn = JSON.stringify(auth.data?.organization ?? {});
      if (!sees) {
        expect(signIn.includes(OWNER), "sign-in payload: name").toBe(false);
        expect(signIn.includes(`"id":${standInUserId},`), "sign-in payload: user id").toBe(false);
      }

      // 7. The customer's aircraft: the record, and the shop list.
      const aircraft = await request.get(`${base()}/resources/${shopAircraftId}`, { headers });
      expect(aircraft.status() === 200, "GET /resources/:id").toBe(sees);
      const shopList = await request.get(`${base()}/resources/planes?scope=shop&limit=200`, { headers });
      const listed = shopList.ok() ? (await rowsOf(shopList)).some((r) => r.id === shopAircraftId) : false;
      expect(listed, "GET /resources/planes?scope=shop").toBe(sees);

      // 8. And never in the fleet list, whoever is asking.
      const fleet = await rowsOf(await request.get(`${base()}/resources/planes?limit=200`, { headers }));
      expect(fleet.some((r) => r.id === shopAircraftId), "GET /resources/planes").toBe(false);
    });
  }
});
