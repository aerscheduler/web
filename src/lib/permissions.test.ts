// Migrating a route guard from roles to grants is only safe if the two give the SAME
// answer, and "same" has to mean same for the people who actually exist, not for the
// tidy cases. Production on 19 August 2026: 534 of 962 active members hold more than one
// role and 204 hold all seven, so single-role fixtures would prove almost nothing.
//
// Every combination below is one that real members hold. For each, every migrated route
// must answer identically whether asked of roles or of grants. A mapping that narrows
// access for even one shape fails here rather than in front of a school.
//
// The two routes NOT migrated are asserted too, from the other side: they are absent
// because no grant expression is equivalent, and that has to stay true.

import { describe, expect, it } from "vitest";
import {
  canAccess,
  canGroundResources,
  canManageResources,
  canSelfBook,
  isStaff,
  reservationTypesForRoles,
  resourceViewAccess,
  selfBookableTypes,
} from "./permissions";
import type { GrantName, Role } from "@/types/api";

// Mirrors BASELINE_GRANTS in server/src/utils/grants.ts. Duplicated here only so the
// equivalence can be checked without a server; the server remains the source of truth.
const BASELINE: Record<Role, GrantName[]> = {
  owner: ["manageBillingSetup"],
  admin: [
    "assignInstructors", "assignRoles", "cancelAnyBooking", "configureCompliance",
    "configureTraining", "createInvoice", "editMemberContacts", "groundMembers",
    "groundResource", "manageAnyBooking", "manageApiKeys", "manageCheckouts",
    "manageEnrollment", "manageFleet", "manageInvoices", "manageMaintenance",
    "manageMemberDocs", "manageMemberLedger", "manageMembers", "manageMemberships",
    "manageOrgSettings", "manageStandbyOffers", "manageSubscription", "overrideBookingLocks",
    "overrideBookingRules", "postAnnouncements", "renewCurrencies", "sendReportsOutside",
    "setFlightPricing", "uploadMemberDocs", "viewAuditLog", "viewFleetReports",
    "viewInvoices", "viewMaintenance", "viewMemberRecords", "viewOperationsReports",
    "viewPeopleReports", "viewRevenueReports",
  ],
  dispatcher: [
    "cancelAnyBooking", "editMemberContacts", "groundMembers", "manageAnyBooking",
    "manageStandbyOffers", "overrideBookingLocks", "overrideBookingRules",
    "uploadMemberDocs", "viewFleetReports", "viewMaintenance", "viewMemberRecords",
    "viewOperationsReports", "viewPeopleReports", "viewRevenueReports",
  ],
  instructor: ["overrideBookingLocks"],
  technician: [
    "cancelAnyBooking", "manageMaintenance", "overrideBookingLocks", "viewFleetReports",
    "viewMaintenance",
  ],
  student: [],
  renter: [],
};

const grantsFor = (roles: Role[]) => new Set(roles.flatMap((r) => BASELINE[r]));

/** Role combinations held by real members, most common first. */
const PRODUCTION_SHAPES: Role[][] = [
  ["student", "renter"],
  ["owner", "admin", "dispatcher", "instructor", "technician", "student", "renter"],
  ["student"],
  ["renter"],
  ["instructor"],
  ["admin"],
  ["instructor", "renter"],
  ["owner", "admin"],
  ["technician"],
  ["dispatcher"],
  ["admin", "dispatcher", "instructor", "technician", "student", "renter"],
  ["owner", "admin", "dispatcher", "technician", "student", "renter"],
  ["owner", "admin", "dispatcher", "instructor", "technician", "renter"],
  ["owner", "admin", "renter"],
  ["admin", "dispatcher", "technician", "student", "renter"],
  ["dispatcher", "instructor", "student", "renter"],
  ["admin", "student", "renter"],
  ["admin", "renter"],
  ["admin", "dispatcher", "technician"],
  ["admin", "instructor", "renter"],
  ["admin", "dispatcher"],
  ["owner", "admin", "instructor"],
  ["dispatcher", "instructor", "renter"],
  ["owner", "admin", "dispatcher", "instructor", "renter"],
  ["admin", "instructor"],
  ["dispatcher", "student"],
  ["admin", "dispatcher", "instructor", "student", "renter"],
  ["owner", "admin", "dispatcher", "student", "renter"],
  ["admin", "dispatcher", "renter"],
];

const MIGRATED = [
  "/dashboard", "/facilities", "/billing", "/reports",
  "/operations/cancellations", "/compliance", "/maintenance", "/audit-logs", "/settings",
];

describe("grants answer every migrated route exactly as roles did", () => {
  it.each(PRODUCTION_SHAPES.map((r) => [r] as [Role[]]))("%j", (roles) => {
    const grants = grantsFor(roles);
    for (const path of MIGRATED) {
      expect({ path, allowed: canAccess(path, roles, grants) }).toEqual({
        path,
        allowed: canAccess(path, roles, null),
      });
    }
  });

  it("agrees on nested pages that inherit a parent rule", () => {
    for (const roles of PRODUCTION_SHAPES) {
      const grants = grantsFor(roles);
      for (const path of ["/settings/integrations/quickbooks", "/billing/invoices"]) {
        expect(canAccess(path, roles, grants)).toBe(canAccess(path, roles, null));
      }
    }
  });
});

describe("the fallback", () => {
  it("answers from roles when permissions are unknown", () => {
    // A session saved before this shipped, or a failed fetch. Denying everything here
    // would lock every administrator out of their own console.
    expect(canAccess("/settings", ["admin"], null)).toBe(true);
    expect(canAccess("/settings", ["student"], null)).toBe(false);
  });

  it("does not treat an empty grant set as unknown", () => {
    // A student really does hold nothing, and that is a different statement from "we have
    // not asked yet". Conflating them would hand students every staff page.
    expect(canAccess("/dashboard", ["student"], new Set())).toBe(false);
  });
});

describe("routes deliberately left on roles", () => {
  it("keeps /training open to instructors, whom no grant identifies", () => {
    // Instructing is identity, not authority: an instructor's whole baseline is a
    // lock-window override that admins, dispatchers and technicians hold too. A grant
    // rule here could only narrow the page.
    expect(canAccess("/training", ["instructor"], grantsFor(["instructor"]))).toBe(true);
  });

  it("keeps /training open to a dispatcher holding no training grant", () => {
    const roles: Role[] = ["dispatcher"];
    expect(isStaff(roles)).toBe(true);
    expect(grantsFor(roles).has("configureTraining")).toBe(false);
    expect(canAccess("/training", roles, grantsFor(roles))).toBe(true);
  });

  it("leaves the open pages open to everybody", () => {
    for (const path of ["/schedule", "/people", "/aircraft", "/training/enrollments"]) {
      expect(canAccess(path, ["student"], grantsFor(["student"]))).toBe(true);
    }
  });
});

// ── /me/book: who the self-serve page is for ─────────────────────────────────
// Reported from the live demo: signed in as Owner + Admin, /me/book said the
// account had no role that could book. The page is deliberately NOT for staff:
// SELF_BOOKABLE names the roles that put a person IN A SEAT, and everything
// downstream, billing, currency, approved aircraft, training, keys off the seated
// person, not off who had the authority to make the booking. An owner who flies
// carries a pilot role; an owner who only runs the school books from the board.
//
// The server disagrees and always has (RESERVATION_TYPES_BY_ROLE gives staff every
// type, MAY_SEAT_OTHERS lets them seat themselves), so this boundary lives in the
// console alone. These pin it down so a later change to either side is deliberate.
describe("self-serve booking", () => {
  it("keeps /me/book to the roles that seat a person on a flight", () => {
    expect(canSelfBook(["owner", "admin"])).toBe(false);
    expect(selfBookableTypes(["owner", "admin"])).toEqual([]);
    expect(canSelfBook(["dispatcher"])).toBe(false);
  });

  it("books an admin+instructor as an instructor, not as staff", () => {
    // Precedence: the pilot role wins, so the admin grant keeps belonging to the
    // dispatch board rather than widening what the self-serve page offers.
    expect(selfBookableTypes(["admin", "instructor"])).toEqual(
      reservationTypesForRoles(["instructor"])
    );
  });

  it("leaves a technician's maintenance-only booking alone", () => {
    expect(selfBookableTypes(["technician"])).toEqual(["maintenance"]);
  });

  it("gives a member with no role at all nothing to book", () => {
    expect(canSelfBook([])).toBe(false);
    expect(selfBookableTypes([])).toEqual([]);
  });
});

// Grounding is deliberately WIDER than managing an aircraft, the same way grounding a
// member is wider than managing the roster. It used to be folded into `manage: admin`, so
// the console hid the control from a technician and a mechanic who had just signed off the
// last overdue inspection had to find an owner to make the aeroplane bookable again.
describe("grounding an aircraft is not the same permission as managing one", () => {
  it("lets a technician ground and return to service", () => {
    expect(canGroundResources(["technician"])).toBe(true);
    expect(resourceViewAccess(["technician"]).ground).toBe(true);
  });

  it("still keeps editing and approving away from a technician", () => {
    expect(canManageResources(["technician"])).toBe(false);
    expect(resourceViewAccess(["technician"]).manage).toBe(false);
  });

  it("leaves admins with both", () => {
    for (const role of ["owner", "admin"] as Role[]) {
      expect(canGroundResources([role])).toBe(true);
      expect(canManageResources([role])).toBe(true);
    }
  });

  it("gives it to nobody else, including a dispatcher who runs the board", () => {
    for (const role of ["dispatcher", "instructor", "student", "renter"] as Role[]) {
      expect(canGroundResources([role])).toBe(false);
      expect(resourceViewAccess([role]).ground).toBe(false);
    }
  });

  it("holds for the multi-role members who actually exist", () => {
    // An instructor who is also the shop's technician gets it; one who is not, does not.
    expect(canGroundResources(["instructor", "technician"])).toBe(true);
    expect(canGroundResources(["instructor", "dispatcher"])).toBe(false);
  });
});
