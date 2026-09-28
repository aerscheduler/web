import { describe, expect, it } from "vitest";
import { memberEmail } from "./util";

const login = "owner.1dff8c9e-6b2d-4b1d-9e6c-65a8cf96600b@unclaimed.aerscheduler.internal";

describe("the address shown for somebody on the roster", () => {
  it("is never an aircraft owner's placeholder login", () => {
    const owner = { external: true, claimedAt: null, contactEmail: "walter@brenner.example", user: { email: login } };
    expect(memberEmail(owner as never)).toBe("walter@brenner.example");
  });

  it("is nothing, rather than the placeholder, when the shop recorded no address", () => {
    const owner = { external: true, claimedAt: null, contactEmail: null, user: { email: login } };
    expect(memberEmail(owner as never)).toBeNull();
  });

  it("is a member's own login address", () => {
    const member = { external: false, claimedAt: "2026-09-01T00:00:00Z", contactEmail: null, user: { email: "dale@example.com" } };
    expect(memberEmail(member as never)).toBe("dale@example.com");
  });

  it("is an owner's own login once they have signed up and claimed the record", () => {
    const claimed = { external: false, claimedAt: "2026-09-27T00:00:00Z", contactEmail: null, user: { email: "walter@brenner.example" } };
    expect(memberEmail(claimed as never)).toBe("walter@brenner.example");
  });
});
