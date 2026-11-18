import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { billingStatus, matchesBoardFilters } from "./board-filters";

/** A closed-out solo on an aircraft with meters, readings as given, no bill. */
const solo = (hobbsIn: number, extra: Partial<Reservation> = {}) =>
  ({
    id: 1,
    type: "solo",
    resource: { id: 1, type: { plane: { id: 1, tailNumber: "N1", meterMode: "hobbs_and_tach" } } },
    review: { hobbsTimeOut: 1000, hobbsTimeIn: hobbsIn, tachTimeOut: 900, tachTimeIn: 900 + (hobbsIn - 1000) },
    personnel: { instructors: [], students: [{ id: 5 }], renters: [], guests: [] },
    invoices: [],
    payers: [],
    ...extra,
  }) as unknown as Reservation;

describe("billing status of a flight that logged no time", () => {
  it("is nothing to bill, not Not billed", () => {
    expect(billingStatus(solo(1000))).toBe("nothingToBill");
  });

  it("a flight that moved the meters with no bill is still Not billed", () => {
    expect(billingStatus(solo(1012))).toBe("notInvoiced");
  });

  it("drops out of the board's Not billed filter", () => {
    expect(matchesBoardFilters(solo(1000), { billing: ["notInvoiced"] } as any, "")).toBe(false);
    expect(matchesBoardFilters(solo(1012), { billing: ["notInvoiced"] } as any, "")).toBe(true);
  });
});
