import { describe, expect, it } from "vitest";
import { youNav } from "./nav-items";

// Tony, 2026-10-01: an aircraft owner's page is their HOME, not "My aircraft". An owner from
// outside the organization gets Home and Invoices and nothing else; a member who owns an
// aircraft keeps their usual menu, with the aircraft on their home rather than a page of its own.
describe("the personal menu", () => {
  it("gives an outside owner Home and their bills, nothing about flying", () => {
    const items = youNav([], { outsideOwner: true });
    expect(items.map((i) => [i.to, i.label])).toEqual([
      ["/me", "Home"],
      ["/me/invoices", "Invoices"],
    ]);
  });

  it("never offers a separate My aircraft page, to anybody", () => {
    for (const roles of [[], ["student"], ["instructor"], ["technician"], ["admin"], ["renter"]]) {
      for (const outsideOwner of [false, true]) {
        const items = youNav(roles, { outsideOwner });
        expect(items.some((i) => i.to.startsWith("/me/aircraft"))).toBe(false);
        expect(items.some((i) => /my aircraft/i.test(i.label))).toBe(false);
      }
    }
  });

  it("keeps a member's usual menu, starting at Home", () => {
    const items = youNav(["student"]);
    expect(items[0]).toMatchObject({ to: "/me", label: "Home" });
    expect(items.map((i) => i.to)).toContain("/me/schedule");
  });
});
