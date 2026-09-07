import { describe, expect, it } from "vitest";
import { contrastAgainstWhite, publicBookingAccentFeedback } from "./public-booking-brand";

describe("publicBookingAccentFeedback", () => {
  it("allows a dark hex and rejects a light one", () => {
    expect(publicBookingAccentFeedback("#1967D2")).toBeNull();
    expect(contrastAgainstWhite("#1967D2")).toBeGreaterThanOrEqual(3);
    expect(publicBookingAccentFeedback("#EEEEEE")).toMatch(/too light/i);
    expect(publicBookingAccentFeedback("blue")).toMatch(/hex value/i);
    expect(publicBookingAccentFeedback("")).toBeNull();
  });
});
