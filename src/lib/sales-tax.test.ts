import { describe, expect, it } from "vitest";
import { parseRatePpm, percentLabel } from "./sales-tax";

describe("reading a rate typed by a person", () => {
  it("takes up to four decimal places, in parts per million", () => {
    expect(parseRatePpm("6")).toBe(60000);
    expect(parseRatePpm("7.375")).toBe(73750);
    expect(parseRatePpm("8.875%")).toBe(88750);
    // Santa Fe, New Mexico: 4.875% state plus 3.3125% city.
    expect(parseRatePpm("8.1875")).toBe(81875);
  });

  it("means what somebody means mid-typing: .5 is half a percent, 6. is six", () => {
    expect(parseRatePpm(".5")).toBe(5000);
    expect(parseRatePpm("6.")).toBe(60000);
  });

  it("refuses nothing, too much, and too precise", () => {
    expect(parseRatePpm("0")).toBeNull();
    expect(parseRatePpm("30.0001")).toBeNull();
    expect(parseRatePpm("0.00001")).toBeNull();
    expect(parseRatePpm("8.18751")).toBeNull();
    expect(parseRatePpm("")).toBeNull();
    expect(parseRatePpm("abc")).toBeNull();
  });

  it("prints rates without trailing zeros", () => {
    expect(percentLabel(60000)).toBe("6%");
    expect(percentLabel(73750)).toBe("7.375%");
    expect(percentLabel(81875)).toBe("8.1875%");
    expect(percentLabel(56000)).toBe("5.6%");
  });
});
