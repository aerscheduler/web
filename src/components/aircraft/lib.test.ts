import { describe, expect, it } from "vitest";
import { fuelToDisplay, fuelToStored } from "./lib";

/**
 * FUEL SCALE, pinned against production.
 *
 * Checked 2026-08-18: 158 planes across 111 orgs store fuel x100, against 45 in plain
 * units. The x100 rows are the paying customer's entire fleet, and the Flutter app has
 * read and written that scale since before this console existed. This console used the
 * columns raw and rendered a 42-gallon Cessna 172 as "4200 gallons".
 */
describe("fuel scale", () => {
  it("shows a stored 42-gallon Cessna 172 as 42, not 4200", () => {
    expect(fuelToDisplay(4200)).toBe(42);
  });

  it("handles the twin's per-engine halves, which are not whole numbers", () => {
    expect(fuelToDisplay(8850)).toBe(88.5);
    expect(fuelToDisplay(17700)).toBe(177);
  });

  it("keeps zero as zero: plenty of real aircraft have no capacity recorded", () => {
    expect(fuelToDisplay(0)).toBe(0);
  });

  it("passes null through rather than rendering 0", () => {
    expect(fuelToDisplay(null)).toBeNull();
    expect(fuelToDisplay(undefined)).toBeNull();
  });

  it("round-trips what the edit form reads and writes back unchanged", () => {
    for (const stored of [4200, 5000, 2600, 17700, 8850, 0]) {
      expect(fuelToStored(fuelToDisplay(stored)!)).toBe(stored);
    }
  });

  it("rounds like the app's decimalToInt, so float error never loses a hundredth", () => {
    // 4.35 * 100 and 0.29 * 100 land just under the whole number; truncating stored 434 and 28.
    expect(4.35 * 100).toBeLessThan(435);
    expect(fuelToStored(4.35)).toBe(435);
    expect(fuelToStored(0.29)).toBe(29);
    expect(fuelToStored(42.999)).toBe(4300);
    expect(fuelToStored(42.994)).toBe(4299);
  });
});
