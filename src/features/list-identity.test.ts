// WHEN A TABLE MAY HOLD ITS ROWS WHILE THE NEXT ANSWER LOADS.
//
// Two bugs, in opposite directions, on the same three lines.
//
// First: clicking "In the shop" on the aircraft page left the school's own twelve
// aeroplanes on screen under the new tab, with the subtitle already reading "12 customer
// aircraft in the shop". It settles a few hundred milliseconds later, which is exactly long
// enough for somebody to believe it.
//
// Then the fix for that treated ANY non-paging parameter as a different list, so every
// paged table in the console dropped to its loading state on a facet click or a search
// keystroke. That is a worse product than the bug, and it was a bug of its own, because
// every table hangs off this one helper.
import { describe, it, expect } from "vitest";

import { sameList } from "./queries";

describe("holding rows while the next page loads", () => {
  it("is the same list when only the page moved", () => {
    expect(sameList({ limit: 50, offset: 0 }, { limit: 50, offset: 50 })).toBe(true);
  });

  it("is the same list when only the sort moved", () => {
    expect(sameList({ sort: "name", order: "asc" }, { sort: "name", order: "desc" })).toBe(true);
  });

  it("is the same list while somebody types in the search box", () => {
    expect(sameList({ q: "cess" }, { q: "cessn" })).toBe(true);
  });

  it.each([
    ["a facet", { grounded: true }, { grounded: false }],
    ["the archived tab", { archived: true }, {}],
    ["a group", { groupId: 4 }, { groupId: 9 }],
  ] as const)("is the same list when %s changes, because narrowing is not switching", (_what, a, b) => {
    expect(sameList(a, b)).toBe(true);
  });
});

describe("blanking the table because it is a different list", () => {
  // `scope` is the only parameter that swaps one population for another: the school's own
  // aeroplanes for a customer's. These are not the same twelve rows filtered differently,
  // they are somebody else's aircraft.
  it("the fleet and the shop are different lists", () => {
    expect(sameList({ scope: "fleet" }, { scope: "shop" })).toBe(false);
  });

  it("no scope and the shop are different lists, because no scope means the fleet", () => {
    expect(sameList({}, { scope: "shop" })).toBe(false);
  });

  it("the shop and everything are different lists", () => {
    expect(sameList({ scope: "shop" }, { scope: "all" })).toBe(false);
  });

  it("does not care what else moved at the same time", () => {
    expect(sameList({ scope: "fleet", q: "n12", offset: 50 }, { scope: "shop", q: "n12", offset: 50 })).toBe(false);
  });
});

describe("the shapes that reach it in practice", () => {
  it("survives undefined on either side", () => {
    expect(sameList(undefined, undefined)).toBe(true);
    expect(sameList(undefined, { scope: "shop" })).toBe(false);
  });

  it("treats an explicitly undefined scope as no scope", () => {
    expect(sameList({ scope: undefined }, {})).toBe(true);
  });
});
