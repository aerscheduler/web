import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { shopJobLine, shopJobOf } from "./shop-job";
import { matchesQuery } from "./board-filters";

/**
 * A hangar booking's job on the schedule (Murray spec section 8). The server decides what each
 * viewer is sent; these pin that the board shows exactly that and invents nothing, and that the
 * board's search finds a booking by its customer (it dims the rest, never hides them).
 */

const booking = (over: Partial<Reservation>): Reservation =>
  ({ id: 7, type: "maintenance", title: "N4417T annual", start: "2026-10-05T15:00:00Z", end: "2026-10-05T23:00:00Z", notes: null, ...over }) as Reservation;

describe("the shop's line on a hangar booking", () => {
  it("names the customer and the request, when both were sent", () => {
    expect(shopJobLine({ customerName: "Dale Whitcomb", grounded: false, request: "Annual inspection" })).toBe("Dale Whitcomb · Annual inspection");
  });

  it("names only the customer for a dispatcher, who is sent no request", () => {
    expect(shopJobLine({ customerName: "Dale Whitcomb", grounded: true })).toBe("Dale Whitcomb");
  });

  it("says nothing when there is nothing to say", () => {
    expect(shopJobLine({ customerName: null, grounded: false, request: "  " })).toBeNull();
  });

  it("reads the summary only off a maintenance booking", () => {
    const shopJob = { customerName: "Dale Whitcomb", grounded: false };
    expect(shopJobOf(booking({ shopJob }))).toEqual(shopJob);
    expect(shopJobOf(booking({ type: "dual", shopJob }))).toBeNull();
    expect(shopJobOf(booking({}))).toBeNull();
  });

  it("lets the board's search find a booking by its customer", () => {
    const r = booking({ shopJob: { customerName: "Dale Whitcomb", grounded: false, request: "Annual inspection" } });
    expect(matchesQuery(r, "whitcomb")).toBe(true);
    expect(matchesQuery(r, "annual inspection")).toBe(true);
    expect(matchesQuery(booking({}), "whitcomb")).toBe(false);
  });
});
