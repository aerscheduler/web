import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { flyingDayFrameFromPolicy, hourWindow, isOpenHour } from "./hours";

const ZONE = "America/Denver"; // UTC-6 on the dates below

/** A booking, given as the airport's wall clock on 2026-08-31 (MDT). */
function booking(startHour: number, endHour: number): Reservation {
  const iso = (h: number) =>
    new Date(Date.UTC(2026, 7, 31, h + 6, 0, 0)).toISOString();
  return { start: iso(startHour), end: iso(endHour) } as Reservation;
}

const DAY_KEY = "2026-08-31";

describe("hourWindow", () => {
  it("buffers the default flying day on both sides", () => {
    const win = hourWindow([], ZONE, DAY_KEY);
    expect(win).toMatchObject({
      frameStartHour: 6,
      frameEndHour: 22,
      startHour: 4,
      endHour: 24,
    });
  });

  it("draws past closing for a booking that runs late, and still buffers it", () => {
    const frame = flyingDayFrameFromPolicy({
      flyingDayStartMinute: 7 * 60,
      flyingDayEndMinute: 19 * 60,
    });
    const win = hourWindow([booking(19, 20)], ZONE, DAY_KEY, [], frame);
    // The flying day is unchanged: it is what gets shaded, not what gets drawn.
    expect(win.frameStartHour).toBe(7);
    expect(win.frameEndHour).toBe(19);
    // 8p is covered, and there are two hours of slack past it to scroll into.
    expect(win.startHour).toBe(5);
    expect(win.endHour).toBe(22);
  });

  it("clamps the buffer at midnight for a school that flies around the clock", () => {
    const frame = flyingDayFrameFromPolicy({
      flyingDayStartMinute: 0,
      flyingDayEndMinute: 0,
    });
    const win = hourWindow([], ZONE, DAY_KEY, [], frame);
    expect(win).toMatchObject({ startHour: 0, endHour: 24 });
  });

  it("only calls an hour open when a booking placed in it fits the flying day", () => {
    const frame = flyingDayFrameFromPolicy({
      flyingDayStartMinute: 7 * 60,
      flyingDayEndMinute: 19 * 60,
    });
    const win = hourWindow([booking(19, 20)], ZONE, DAY_KEY, [], frame);
    expect(isOpenHour(win, 6)).toBe(false); // buffer, before opening
    expect(isOpenHour(win, 7)).toBe(true);
    expect(isOpenHour(win, 18)).toBe(true); // last hour that ends by closing
    expect(isOpenHour(win, 19)).toBe(false); // drawn for the late booking, not bookable
  });
});
