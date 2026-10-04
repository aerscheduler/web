import { describe, expect, it } from "vitest";
import { CHECKLIST, type ChecklistFacts, type OrgType } from "@/lib/onboarding-checklist";
import { orderForTrack } from "@/lib/onboarding-tracks";
import { resolveSetupSource, sourceFromLandingPath } from "@/lib/onboarding-intent";

const applicable = (orgType: OrgType, source: string | null = null) =>
  CHECKLIST.filter((i) => i.appliesTo?.(orgType, { source }) ?? true).map((i) => i.id);

const SHOP_ITEMS = ["customer-aircraft", "work-order", "shop-rates", "technicians", "job-invoice"];
const FLIGHT_ITEMS = ["aircraft", "reservation", "instructors", "students", "rates", "rules", "training", "facilities", "invoice", "groups", "cost-splitting"];

const facts = (overrides: Partial<ChecklistFacts> = {}): ChecklistFacts => ({
  organization: null,
  planes: 0,
  reservations: 0,
  invoices: 0,
  members: [],
  ratings: 0,
  facilities: 0,
  reminders: 0,
  groups: 0,
  courses: 0,
  stripeConnected: false,
  quickBooksConnected: false,
  splitRulesConfigured: false,
  shopPlanes: 0,
  workOrders: 0,
  billedWorkOrders: 0,
  shopRatesSet: false,
  ...overrides,
});

describe("the maintenance shop's checklist", () => {
  it("gives a shop the shop items and none of the flight ones", () => {
    const ids = applicable("maintenance_shop");
    for (const id of SHOP_ITEMS) expect(ids).toContain(id);
    for (const id of FLIGHT_ITEMS) expect(ids).not.toContain(id);
    // What every operation still needs.
    for (const id of ["billing", "maintenance", "quickbooks", "profile"]) expect(ids).toContain(id);
  });

  it("keeps the shop items off a flight school unless it came for the shop", () => {
    for (const id of SHOP_ITEMS) expect(applicable("flight_school")).not.toContain(id);
    // Murray: a school with a hangar that told us it wants the shop working.
    const withShop = applicable("flight_school", "shop");
    for (const id of SHOP_ITEMS) expect(withShop).toContain(id);
    expect(withShop).toContain("reservation");
  });

  it("answers each shop item from the data, never from a flag", () => {
    const byId = new Map(CHECKLIST.map((i) => [i.id, i]));
    const done = (id: string, f: ChecklistFacts) => byId.get(id)!.isDone(f);
    expect(done("customer-aircraft", facts())).toBe(false);
    expect(done("customer-aircraft", facts({ shopPlanes: 1 }))).toBe(true);
    // A fleet aircraft is not a customer's.
    expect(done("customer-aircraft", facts({ planes: 3 }))).toBe(false);
    expect(done("work-order", facts({ workOrders: 1 }))).toBe(true);
    expect(done("job-invoice", facts({ workOrders: 1 }))).toBe(false);
    expect(done("job-invoice", facts({ workOrders: 1, billedWorkOrders: 1 }))).toBe(true);
    expect(done("shop-rates", facts({ shopRatesSet: true }))).toBe(true);
  });

  it("leads the shop track with the job", () => {
    const ids = applicable("maintenance_shop", "shop");
    expect(orderForTrack(ids, "shop").slice(0, 3)).toEqual(["customer-aircraft", "work-order", "shop-rates"]);
  });
});

describe("shop attribution", () => {
  it("reads the shop's pages as the shop, before the general maintenance rule", () => {
    expect(sourceFromLandingPath("/features/work-orders")).toBe("shop");
    expect(sourceFromLandingPath("/docs/maintenance/run-a-work-order")).toBe("shop");
    expect(sourceFromLandingPath("/docs/maintenance/work-on-a-customers-aircraft")).toBe("shop");
    expect(sourceFromLandingPath("/features/maintenance")).toBe("maintenance");
  });

  it("takes ?src=shop as the shop track", () => {
    expect(resolveSetupSource({ src: "shop" })).toBe("shop");
  });
});
