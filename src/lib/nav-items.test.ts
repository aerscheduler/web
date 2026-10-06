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

// Tony, 2026-10-05: a technician who never flies here has no flight bills and no medical, so the
// two pages were empty in their menu. They come back when there is something on them.
describe("the personal menu for somebody who only fixes aircraft", () => {
  const paths = (items: ReturnType<typeof youNav>) => items.map((i) => i.to);

  it("drops Invoices and Currencies, keeps Documents", () => {
    const items = paths(youNav(["technician"]));
    expect(items).not.toContain("/me/invoices");
    expect(items).not.toContain("/me/currencies");
    expect(items).toContain("/me/documents");
  });

  it("keeps each one when there is something on it", () => {
    expect(paths(youNav(["technician"], { hasBills: true }))).toContain("/me/invoices");
    expect(paths(youNav(["technician"], { hasCurrencies: true }))).toContain("/me/currencies");
  });

  it("leaves a technician who also flies with both", () => {
    for (const flying of ["instructor", "student", "renter"]) {
      const items = paths(youNav(["technician", flying]));
      expect(items).toContain("/me/invoices");
      expect(items).toContain("/me/currencies");
    }
  });
});
