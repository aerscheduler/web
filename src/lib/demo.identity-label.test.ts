import { describe, expect, it } from "vitest";
import { identityLabel } from "./demo";

/**
 * The banner's switcher names each identity. The outside aircraft owner has no roles, so the
 * role list read as a blank line; it is named for what it is.
 */
describe("identityLabel", () => {
  it("names the outside owner", () => {
    expect(identityLabel({ roles: [], external: true })).toBe("Aircraft owner");
  });

  it("names staff and pilots by their roles", () => {
    expect(identityLabel({ roles: ["owner"] })).toBe("Owner");
    expect(identityLabel({ roles: ["instructor", "dispatcher"] })).toBe("Instructor + Dispatcher");
  });

  it("never calls a member with roles an aircraft owner", () => {
    expect(identityLabel({ roles: ["technician"], external: false })).toBe("Technician");
  });
});
