import { describe, expect, it } from "vitest";
import { civilDateInZone, dateKeyInZone, isCivilToday } from "./timezone";

describe("civilDateInZone", () => {
  // 08:00 UTC on 11 Sep is still 10pm on the 10th in Honolulu, and already
  // 5pm on the 11th in Tokyo. The ramp stores a picked calendar date as a
  // Date whose local Y-M-D *is* that date.
  const split = new Date("2026-09-11T08:00:00.000Z");

  it("uses the field's calendar, not the instant's UTC date", () => {
    const honolulu = civilDateInZone(split, "Pacific/Honolulu");
    expect(honolulu.getFullYear()).toBe(2026);
    expect(honolulu.getMonth()).toBe(8);
    expect(honolulu.getDate()).toBe(10);
    expect(dateKeyInZone(split, "Pacific/Honolulu")).toBe("2026-09-10");

    const tokyo = civilDateInZone(split, "Asia/Tokyo");
    expect(tokyo.getFullYear()).toBe(2026);
    expect(tokyo.getMonth()).toBe(8);
    expect(tokyo.getDate()).toBe(11);
  });

  it("marks today on the field's calendar, not the browser's", () => {
    // A picked calendar date carries local Y-M-D; the field's today is the
    // date key the same instant reads as in the zone.
    const honoluluToday = civilDateInZone(new Date(), "Pacific/Honolulu");
    expect(isCivilToday(honoluluToday, "Pacific/Honolulu")).toBe(true);
    const offByOne = new Date(
      honoluluToday.getFullYear(),
      honoluluToday.getMonth(),
      honoluluToday.getDate() + 1
    );
    expect(isCivilToday(offByOne, "Pacific/Honolulu")).toBe(false);
  });
});
