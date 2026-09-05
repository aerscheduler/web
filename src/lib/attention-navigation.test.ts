import { describe, expect, it, vi } from "vitest";
import { navigateFromAttention } from "./attention-navigation";

describe("attention-navigation", () => {
  it("routes booking requests to the schedule desk panel", () => {
    const navigate = vi.fn();
    navigateFromAttention(navigate, "booking-requests", [{ key: "status", operator: "eq", value: "pending" }]);
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/schedule",
        search: { panel: "booking-requests" },
      })
    );
  });

  it("passes report filters for non-queue attention items", () => {
    const navigate = vi.fn();
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-30T00:00:00.000Z");
    navigateFromAttention(
      navigate,
      "flights",
      [{ key: "closedOut", operator: "eq", value: false }],
      { from, to }
    );
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/reports",
        search: expect.objectContaining({
          report: "flights",
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      })
    );
  });
});
