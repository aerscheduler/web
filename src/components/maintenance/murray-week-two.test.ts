// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { OrganizationUser, WorkOrder, WorkOrderLine } from "@/types/api";
import { linesToReprice, rateText } from "@/components/maintenance/work-order-rates";
import { needsBillingBeforeCompleting } from "@/components/maintenance/finish-unbilled-dialog";
import { rosterMatch } from "@/components/aircraft/aircraft-owner-field";

/**
 * Murray's second week of work orders (2026-10-09): a staff member's annual priced by hand on 17
 * lines, a completed job with $850 on it never billed, and every owner added typed as a new person.
 */

const line = (over: Partial<WorkOrderLine>): WorkOrderLine =>
  ({
    id: 1,
    createdAt: "2026-10-08T00:00:00Z",
    category: "labor",
    description: "Inspection",
    position: 0,
    qty: 1,
    costCents: null,
    markupBps: null,
    unitPriceCents: 0,
    totalCents: 0,
    taxable: null,
    billable: true,
    minutes: null,
    hours: null,
    rateCents: null,
    workedOn: null,
    ...over,
  }) as WorkOrderLine;

describe("re-pricing a job's lines at its new rates", () => {
  const staff = { laborRateCents: 4500, partsMarkupBps: 0, outsideWorkMarkupBps: 1000 };

  it("re-prices labor at a rate, and parts at a markup, that are not the job's", () => {
    const todo = linesToReprice(
      [
        line({ id: 1, minutes: 450, rateCents: 11000, unitPriceCents: 82500 }),
        line({ id: 2, category: "part", costCents: 1256, markupBps: 1500, unitPriceCents: 1444 }),
      ],
      staff
    );
    expect(todo.map((t) => [t.line.id, t.patch])).toEqual([
      [1, { rateCents: 4500 }],
      [2, { markupBps: 0 }],
    ]);
  });

  it("leaves a flat-priced labor line, a hand-priced part and lines already at the rate alone", () => {
    const todo = linesToReprice(
      [
        // A flat-rate annual: $900 for 7.5 h is not 7.5 h at any rate on the line.
        line({ id: 1, minutes: 450, rateCents: 11000, unitPriceCents: 90000 }),
        // Priced by hand: a cost with no markup beside it.
        line({ id: 2, category: "part", costCents: 1256, markupBps: null, unitPriceCents: 2000 }),
        line({ id: 3, minutes: 60, rateCents: 4500, unitPriceCents: 4500 }),
        line({ id: 4, category: "supply", unitPriceCents: 1500 }),
      ],
      staff
    );
    expect(todo).toEqual([]);
  });

  it("does nothing for a rate nobody sets", () => {
    expect(linesToReprice([line({ minutes: 60, rateCents: 11000, unitPriceCents: 11000 })], { laborRateCents: null, partsMarkupBps: null, outsideWorkMarkupBps: null })).toEqual([]);
  });

  it("says rates the way the shop does", () => {
    expect(rateText("laborRateCents", 4500)).toBe("$45.00/h");
    expect(rateText("partsMarkupBps", 0)).toBe("At cost");
    expect(rateText("partsMarkupBps", 1500)).toBe("+15%");
    expect(rateText("outsideWorkMarkupBps", null)).toBeNull();
  });
});

describe("completing a job that was never billed", () => {
  const job = (over: Partial<WorkOrder>): WorkOrder =>
    ({
      id: 333,
      label: "WO-1003",
      status: "ready",
      chargesCents: 85027,
      billing: "none",
      invoice: null,
      noInvoiceAt: null,
      billTo: { id: 124, name: "Dylan Freiberg", external: false, contactEmail: null },
      aircraft: { id: 1, use: "shop" },
      ...over,
    }) as WorkOrder;

  it("asks for a customer's job with charges and no invoice (WO-1003)", () => expect(needsBillingBeforeCompleting(job({}))).toBe(true));
  it("not once it is invoiced", () =>
    expect(needsBillingBeforeCompleting(job({ billing: "invoiced", invoice: { id: 1, total: 1, tax: null, paidAt: null, dueAt: null, number: null } }))).toBe(false));
  it("not when it charges nothing", () => expect(needsBillingBeforeCompleting(job({ chargesCents: 0 }))).toBe(false));
  it("not when the shop already said it is not billing it", () => expect(needsBillingBeforeCompleting(job({ noInvoiceAt: "2026-10-07T00:00:00Z" }))).toBe(false));
  it("not on the organization's own aircraft with nobody billed", () =>
    expect(needsBillingBeforeCompleting(job({ billTo: null, aircraft: { use: "fleet" } as WorkOrder["aircraft"] }))).toBe(false));
});

describe("a new owner who is somebody on the roster already", () => {
  const member = (id: number, name: string, email: string, over: Partial<OrganizationUser> = {}) =>
    ({ id, user: { name, email }, external: false, claimedAt: "2026-09-28T00:00:00Z", archivedAt: null, contactEmail: null, ...over }) as unknown as OrganizationUser;
  const roster = [
    member(124, "Dylan Freiberg", "dylan@murrayaviation.com"),
    member(415, "Nathan Asay", "nathan@murrayaviation.com"),
    member(9, "Dale Whitcomb", "unclaimed+9@unclaimed.aerscheduler.internal", { external: true, claimedAt: null, contactEmail: "dale@example.com" } as never),
  ];

  it("finds them by their address, whatever name was typed (Dylan, 2026-10-07)", () => {
    expect(rosterMatch(roster, { name: "Dylan", email: "Dylan@MurrayAviation.com " })).toMatchObject({ member: { id: 124 }, by: "email" });
  });
  it("finds an owner the shop wrote down by the address on their record, not the placeholder login", () => {
    expect(rosterMatch(roster, { name: "", email: "dale@example.com" })).toMatchObject({ member: { id: 9 }, by: "email" });
  });
  it("falls back to an exact name", () => {
    expect(rosterMatch(roster, { name: "nathan  asay", email: "" })).toMatchObject({ member: { id: 415 }, by: "name" });
  });
  it("never matches a half-typed address or two people with one name", () => {
    expect(rosterMatch(roster, { name: "", email: "dylan@murray" })).toBeNull();
    expect(rosterMatch([...roster, member(500, "Nathan Asay", "other@example.com")], { name: "Nathan Asay", email: "" })).toBeNull();
  });
});
