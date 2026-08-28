import { describe, expect, it } from "vitest";
import { parseListSearch, serializeListSearch } from "@/lib/list-query-state";

const KEYS = ["view", "open", "grounded", "fleetStatus"];

describe("list query state, record ids", () => {
  // The router JSON-encodes search values. A record id kept as the STRING "2251" has to go
  // into the URL as open=%222251%22 to come back a string, which is what every shared link
  // to an open record would look like. As a number it round-trips bare.
  it("keeps a numeric id a number in both directions", () => {
    expect(serializeListSearch({ open: 2251 })).toEqual({ open: 2251 });
    expect(parseListSearch({ open: 2251 }, KEYS)).toEqual({ open: 2251 });
  });

  it("survives the full round trip unchanged", () => {
    const state = { view: "open", open: 2251 };
    expect(parseListSearch(serializeListSearch(state), KEYS)).toEqual(state);
  });

  it("drops the id when nothing is open, so it leaves the URL", () => {
    expect(serializeListSearch({ view: "open", open: undefined })).toEqual({ view: "open" });
  });

  // Zero is a legitimate id in nobody's database, but NaN and Infinity reach here from a
  // hand-edited URL, and neither should be written back out as a filter.
  it("refuses a non-finite id rather than writing NaN to the URL", () => {
    expect(serializeListSearch({ open: Number.NaN })).toEqual({});
    expect(serializeListSearch({ open: Number.POSITIVE_INFINITY })).toEqual({});
  });

  it("still handles the string, boolean and multi-value facets it always did", () => {
    expect(serializeListSearch({ view: "open", grounded: true, fleetStatus: ["overdue", "dueSoon"] })).toEqual({
      view: "open",
      grounded: true,
      fleetStatus: "overdue,dueSoon",
    });
    expect(parseListSearch({ grounded: "true", fleetStatus: "overdue,dueSoon" }, KEYS)).toEqual({
      grounded: true,
      fleetStatus: ["overdue", "dueSoon"],
    });
  });

  it("leaves unknown keys out entirely", () => {
    expect(parseListSearch({ open: 1, sneaky: "x" }, KEYS)).toEqual({ open: 1 });
  });
});
