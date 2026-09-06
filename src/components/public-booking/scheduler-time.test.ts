import { describe, expect, it } from "vitest";
import {
  addDaysInZone,
  cappedSlotRangeEnd,
  dateKey,
  daysWithSlots,
  formatStart,
  heatmapChipHint,
  heatmapOccupancy,
  heatmapRowMinutes,
  heatmapSlotOffset,
  heatmapNowTop,
  heatmapPastCover,
  HEAT_HOUR_PX,
  HEAT_SLOT_PX,
  isFutureSlot,
  rangeCovers,
  reanchorCivilDay,
  slotFetchRange,
  slotsInWeek,
  slotsOnDay,
  startOfMonth,
  startOfWeekMonday,
  unionLoadedRanges,
} from "./scheduler-time";
import { zonedWallClockToUtc } from "@/lib/timezone";
import type { PublicBookableSlot } from "@/types/public-booking";

const ZONE = "America/New_York";

function slot(iso: string, extra?: Partial<PublicBookableSlot>): PublicBookableSlot {
  return {
    start: iso,
    end: new Date(new Date(iso).getTime() + 60 * 60 * 1000).toISOString(),
    timeZone: ZONE,
    ...extra,
  };
}

describe("scheduler-time", () => {
  it("starts the week on Monday in the offering zone", () => {
    // 2026-09-09 is a Wednesday in America/New_York.
    const wed = new Date("2026-09-09T16:00:00.000Z");
    const monday = startOfWeekMonday(wed, ZONE);
    expect(dateKey(monday, ZONE)).toBe("2026-09-07");
  });

  it("keeps addDaysInZone on the civil calendar across US DST spring-forward", () => {
    const before = new Date("2026-03-07T05:00:00.000Z");
    expect(dateKey(before, ZONE)).toBe("2026-03-07");
    const after = addDaysInZone(before, 1, ZONE);
    expect(dateKey(after, ZONE)).toBe("2026-03-08");
  });

  it("starts the month on day 1 in zone", () => {
    const mid = new Date("2026-09-15T12:00:00.000Z");
    expect(dateKey(startOfMonth(mid, ZONE), ZONE)).toBe("2026-09-01");
  });

  it("groups slots onto the civil day in zone, not UTC", () => {
    const evening = slot("2026-09-08T23:30:00.000Z");
    const nextMorning = slot("2026-09-09T12:00:00.000Z");
    const day = new Date("2026-09-08T16:00:00.000Z");
    const onDay = slotsOnDay([evening, nextMorning], day, ZONE);
    expect(onDay).toEqual([evening]);
    expect(daysWithSlots([evening, nextMorning], ZONE)).toEqual(
      new Set(["2026-09-08", "2026-09-09"]),
    );
  });

  it("caps a 31-day request so DST fall-back cannot exceed 32 * 24h", () => {
    const start = startOfMonth(new Date("2026-10-15T12:00:00.000Z"), ZONE);
    const end = cappedSlotRangeEnd(start, 31, ZONE);
    expect(end.getTime() - start.getTime()).toBeLessThanOrEqual(32 * 24 * 60 * 60 * 1000);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("keeps the last hour of a 31-day fall-back month in Europe/Paris", () => {
    const paris = "Europe/Paris";
    const start = startOfMonth(zonedWallClockToUtc(2026, 10, 15, 12, 0, paris), paris);
    const range = slotFetchRange("column", start, start, paris);
    const lastHour = zonedWallClockToUtc(2026, 10, 31, 23, 0, paris);
    expect(lastHour.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
    expect(lastHour.getTime()).toBeLessThan(range.end.getTime());
  });

  it("week fetch covers Sunday in the guest zone when that zone is east of the field", () => {
    const viewer = "America/New_York";
    const field = "America/Denver";
    const monday = startOfWeekMonday(zonedWallClockToUtc(2026, 9, 14, 12, 0, viewer), viewer);
    const range = slotFetchRange("week", monday, monday, viewer);
    const weekEnd = addDaysInZone(monday, 7, viewer);
    expect(range.end.getTime()).toBe(weekEnd.getTime());
    const sundayEvening = zonedWallClockToUtc(2026, 9, 20, 20, 0, viewer);
    expect(sundayEvening.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
    expect(sundayEvening.getTime()).toBeLessThan(range.end.getTime());
    const clippedByField = addDaysInZone(monday, 7, field);
    expect(sundayEvening.getTime()).toBeGreaterThanOrEqual(clippedByField.getTime());
  });

  it("keeps a 31-day month window in the zone the cursor was built in", () => {
    const nyMidnight = zonedWallClockToUtc(2026, 9, 1, 0, 0, ZONE);
    const viewerShifted = startOfMonth(nyMidnight, "America/Los_Angeles");
    expect(dateKey(viewerShifted, "America/Los_Angeles")).toBe("2026-08-01");
    const range = slotFetchRange("column", nyMidnight, nyMidnight, ZONE);
    expect(dateKey(range.start, ZONE)).toBe("2026-09-01");
    expect(range.end.getTime() - range.start.getTime()).toBeLessThanOrEqual(
      32 * 24 * 60 * 60 * 1000,
    );
  });

  it("keeps the civil date when the display zone changes", () => {
    const ny = zonedWallClockToUtc(2026, 9, 5, 0, 0, ZONE);
    const la = reanchorCivilDay(ny, ZONE, "America/Los_Angeles");
    expect(dateKey(la, "America/Los_Angeles")).toBe("2026-09-05");
  });

  it("treats a week window as covered by a loaded month window", () => {
    const monthStart = startOfMonth(new Date("2026-09-15T12:00:00.000Z"), ZONE);
    const loaded = { start: monthStart, end: cappedSlotRangeEnd(monthStart, 31, ZONE) };
    const monday = startOfWeekMonday(new Date("2026-09-09T16:00:00.000Z"), ZONE);
    const needed = { start: monday, end: addDaysInZone(monday, 7, ZONE) };
    expect(rangeCovers(loaded, needed)).toBe(true);
    expect(rangeCovers(null, needed)).toBe(false);
  });

  it("indexes occupied heatmap cells without empty buckets", () => {
    const weekStart = zonedWallClockToUtc(2026, 9, 7, 0, 0, ZONE);
    const morning = slot(zonedWallClockToUtc(2026, 9, 7, 9, 15, ZONE).toISOString());
    const map = heatmapOccupancy([morning], weekStart, ZONE);
    expect(map.size).toBe(1);
    expect(map.get(`2026-09-07-${9 * 60 + 15}`)).toEqual([morning]);
  });

  it("keeps two tails in the same 15-minute heatmap cell", () => {
    const weekStart = zonedWallClockToUtc(2026, 9, 7, 0, 0, ZONE);
    const start = zonedWallClockToUtc(2026, 9, 7, 9, 0, ZONE).toISOString();
    const a = slot(start, { resourceId: 3, resourceLabel: "N12345" });
    const b = slot(start, { resourceId: 4, resourceLabel: "N67890" });
    const map = heatmapOccupancy([a, b], weekStart, ZONE);
    const hits = map.get(`2026-09-07-${9 * 60}`) ?? [];
    expect(hits).toHaveLength(2);
    expect(heatmapChipHint(hits)).toBe("2 aircraft");
    expect(heatmapChipHint([a])).toBe("N12345");
  });

  it("builds hour heatmap rows from real starts, not 15-minute rows", () => {
    const weekStart = zonedWallClockToUtc(2026, 9, 7, 0, 0, ZONE);
    const rows = heatmapRowMinutes(
      [
        slot(zonedWallClockToUtc(2026, 9, 7, 5, 15, ZONE).toISOString()),
        slot(zonedWallClockToUtc(2026, 9, 7, 21, 0, ZONE).toISOString()),
      ],
      weekStart,
      ZONE,
    );
    expect(rows[0]).toBe(5 * 60);
    expect(rows.at(-1)).toBe(21 * 60);
    expect(rows).toContain(6 * 60);
    expect(rows.every((m) => m % 60 === 0)).toBe(true);
    expect(rows).not.toContain(5 * 60 + 15);
  });

  it("formats start times without a range", () => {
    const s = slot("2026-09-08T16:00:00.000Z");
    expect(formatStart(s, true, ZONE)).not.toMatch(/ to /);
    expect(formatStart(s, false, ZONE)).not.toMatch(/ to /);
    expect(formatStart(s, false, ZONE)).toMatch(/\d/);
  });

  it("places a 60-minute slot on the hour row as a start chip", () => {
    const start = zonedWallClockToUtc(2026, 9, 7, 16, 0, ZONE);
    const layout = heatmapSlotOffset(start, 15 * 60, ZONE);
    expect(layout.top).toBe(HEAT_HOUR_PX);
    expect(layout.height).toBe(HEAT_SLOT_PX - 2);
  });

  it("does not stack 15-minute starts on top of a 60-minute duration bar", () => {
    const first = 15 * 60;
    const a = heatmapSlotOffset(zonedWallClockToUtc(2026, 9, 7, 16, 0, ZONE), first, ZONE);
    const b = heatmapSlotOffset(zonedWallClockToUtc(2026, 9, 7, 16, 15, ZONE), first, ZONE);
    const c = heatmapSlotOffset(zonedWallClockToUtc(2026, 9, 7, 16, 30, ZONE), first, ZONE);
    expect(a.top + a.height).toBeLessThanOrEqual(b.top);
    expect(b.top + b.height).toBeLessThanOrEqual(c.top);
    expect(a.height).toBeGreaterThanOrEqual(24);
  });

  it("parks off-grid starts on the 15-minute occupancy bucket so they do not cover the next start", () => {
    const first = 10 * 60;
    const a = heatmapSlotOffset(zonedWallClockToUtc(2026, 9, 7, 10, 14, ZONE), first, ZONE);
    const b = heatmapSlotOffset(zonedWallClockToUtc(2026, 9, 7, 10, 15, ZONE), first, ZONE);
    expect(a.top + a.height).toBeLessThanOrEqual(b.top);
  });

  it("hides the now line outside the visible hours", () => {
    const now = zonedWallClockToUtc(2026, 9, 7, 3, 0, ZONE);
    expect(heatmapNowTop(now, 6 * 60, 21 * 60, ZONE)).toBeNull();
  });

  it("does not treat a disjoint window as already loaded", () => {
    const jan = { start: new Date("2026-01-01T00:00:00.000Z"), end: new Date("2026-02-01T00:00:00.000Z") };
    const mar = { start: new Date("2026-03-01T00:00:00.000Z"), end: new Date("2026-04-01T00:00:00.000Z") };
    const united = unionLoadedRanges(jan, mar);
    expect(united.start.toISOString()).toBe(mar.start.toISOString());
    expect(rangeCovers(united, jan)).toBe(false);
  });

  it("hides a slot whose start has passed", () => {
    const past = slot("2026-09-07T12:00:00.000Z");
    const future = slot("2026-09-07T20:00:00.000Z");
    const now = new Date("2026-09-07T16:00:00.000Z");
    expect(isFutureSlot(past, now)).toBe(false);
    expect(isFutureSlot(future, now)).toBe(true);
  });

  it("selects only slots that start in the visible week", () => {
    const weekStart = zonedWallClockToUtc(2026, 9, 7, 0, 0, ZONE);
    const inWeek = slot(zonedWallClockToUtc(2026, 9, 8, 10, 0, ZONE).toISOString());
    const nextWeek = slot(zonedWallClockToUtc(2026, 9, 14, 10, 0, ZONE).toISOString());
    expect(slotsInWeek([inWeek, nextWeek], weekStart, ZONE)).toEqual([inWeek]);
  });

  it("covers past days fully and today up to now", () => {
    const now = zonedWallClockToUtc(2026, 9, 7, 10, 0, ZONE);
    const yesterday = zonedWallClockToUtc(2026, 9, 6, 10, 0, ZONE);
    const today = zonedWallClockToUtc(2026, 9, 7, 0, 0, ZONE);
    const tomorrow = zonedWallClockToUtc(2026, 9, 8, 0, 0, ZONE);
    expect(heatmapPastCover(yesterday, now, 6 * 60, 10, ZONE)).toBe(10 * HEAT_HOUR_PX);
    expect(heatmapPastCover(tomorrow, now, 6 * 60, 10, ZONE)).toBe(0);
    expect(heatmapPastCover(today, now, 6 * 60, 10, ZONE)).toBe(4 * HEAT_HOUR_PX);
  });
});
