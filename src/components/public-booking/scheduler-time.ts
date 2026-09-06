import { DEVICE_TIME_ZONE, isValidTimeZone, wallClockInZone, zonedWallClockToUtc } from "@/lib/timezone";
import type { PublicBookableSlot } from "@/types/public-booking";

export const GUEST_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
] as const;

export function dateKey(instant: Date, zone: string) {
  const { year, month, day } = wallClockInZone(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function startOfDayInZone(instant: Date, zone: string): Date {
  const { year, month, day } = wallClockInZone(instant, zone);
  return zonedWallClockToUtc(year, month, day, 0, 0, zone);
}

export function addDaysInZone(instant: Date, days: number, zone: string): Date {
  const { year, month, day } = wallClockInZone(instant, zone);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return zonedWallClockToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    0,
    0,
    zone
  );
}

/** Public slots reject windows longer than 32 * 24h so a 31-day month with DST fall-back still fits. */
export const MAX_PUBLIC_SLOT_RANGE_MS = 32 * 24 * 60 * 60 * 1000;

export function cappedSlotRangeEnd(start: Date, days: number, zone: string) {
  const raw = addDaysInZone(start, days, zone);
  const max = new Date(start.getTime() + MAX_PUBLIC_SLOT_RANGE_MS);
  return raw.getTime() <= max.getTime() ? raw : max;
}

/** Slot GET window in the zone the month/week cursors were built in (the display zone). */
export function slotFetchRange(
  view: "column" | "heatmap" | "week",
  monthCursor: Date,
  weekStart: Date,
  rangeZone: string,
) {
  if (view === "column") {
    const start = startOfMonth(monthCursor, rangeZone);
    return { start, end: cappedSlotRangeEnd(start, 31, rangeZone) };
  }
  return { start: weekStart, end: addDaysInZone(weekStart, 7, rangeZone) };
}

export function startOfWeekMonday(instant: Date, zone: string): Date {
  const { year, month, day } = wallClockInZone(instant, zone);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return addDaysInZone(startOfDayInZone(instant, zone), mondayOffset, zone);
}

export function startOfMonth(instant: Date, zone: string): Date {
  const { year, month } = wallClockInZone(instant, zone);
  return zonedWallClockToUtc(year, month, 1, 0, 0, zone);
}

/** Keep the civil Y-M-D when the guest switches the display zone. */
export function reanchorCivilDay(instant: Date, fromZone: string, toZone: string): Date {
  const { year, month, day } = wallClockInZone(instant, fromZone);
  return zonedWallClockToUtc(year, month, day, 0, 0, toZone);
}

export const HEAT_STEP_MIN = 15;

export function rangeCovers(
  loaded: { start: Date; end: Date } | null | undefined,
  needed: { start: Date; end: Date },
) {
  if (!loaded) return false;
  return loaded.start.getTime() <= needed.start.getTime() && loaded.end.getTime() >= needed.end.getTime();
}

export function heatmapCellKey(dayKey: string, minute: number) {
  return `${dayKey}-${minute}`;
}

/** Occupied heatmap cells only. Empty 15-minute buckets stay out of the DOM. */
export function heatmapOccupancy(
  slots: PublicBookableSlot[],
  weekStart: Date,
  zone: string,
): Map<string, PublicBookableSlot[]> {
  const map = new Map<string, PublicBookableSlot[]>();
  const from = weekStart.getTime();
  const to = addDaysInZone(weekStart, 7, zone).getTime();
  for (const slot of slots) {
    const start = new Date(slot.start);
    const t = start.getTime();
    if (t < from || t >= to) continue;
    const minute = Math.floor(minuteOfDay(start, zone) / HEAT_STEP_MIN) * HEAT_STEP_MIN;
    const key = heatmapCellKey(dateKey(start, zone), minute);
    const list = map.get(key);
    if (list) list.push(slot);
    else map.set(key, [slot]);
  }
  return map;
}

/** Hour rows covering occupied starts in the visible week. Quarters stay in occupancy, not as extra rows. */
export function heatmapRowMinutes(
  slots: PublicBookableSlot[],
  weekStart: Date,
  zone: string,
): number[] {
  const weekEnd = addDaysInZone(weekStart, 7, zone);
  const from = weekStart.getTime();
  const to = weekEnd.getTime();
  const inWeek = slots.filter((slot) => {
    const t = new Date(slot.start).getTime();
    return t >= from && t < to;
  });
  if (!inWeek.length) return [];
  let min = 24 * 60;
  let max = 0;
  for (const slot of inWeek) {
    const m = minuteOfDay(new Date(slot.start), zone);
    min = Math.min(min, m);
    max = Math.max(max, m);
  }
  const start = Math.floor(min / 60) * 60;
  const end = Math.floor(max / 60) * 60;
  const rows: number[] = [];
  for (let m = start; m <= end; m += 60) rows.push(m);
  return rows;
}

export function formatStart(slot: PublicBookableSlot, hour12: boolean, zone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12,
    timeZone: zone,
  }).format(new Date(slot.start));
}

export function formatDayHeading(instant: Date, zone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: zone,
  }).format(instant);
}

export function formatWeekdayHeader(instant: Date, zone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    timeZone: zone,
  }).format(instant);
}

export function slotDayKey(slot: PublicBookableSlot, zone: string) {
  return dateKey(new Date(slot.start), zone);
}

export function isFutureSlot(slot: PublicBookableSlot, now = new Date()) {
  return new Date(slot.start).getTime() > now.getTime();
}

export function slotsOnDay(slots: PublicBookableSlot[], day: Date, zone: string) {
  const key = dateKey(day, zone);
  return slots.filter((slot) => slotDayKey(slot, zone) === key);
}

export function slotsInWeek(slots: PublicBookableSlot[], weekStart: Date, zone: string) {
  const from = weekStart.getTime();
  const to = addDaysInZone(weekStart, 7, zone).getTime();
  return slots.filter((slot) => {
    const t = new Date(slot.start).getTime();
    return t >= from && t < to;
  });
}

/** Union overlapping/adjacent windows. A gap is not covered: keep the new range only. */
export function unionLoadedRanges(
  loaded: { start: Date; end: Date } | null,
  next: { start: Date; end: Date },
) {
  if (!loaded) return { start: next.start, end: next.end };
  if (next.start.getTime() > loaded.end.getTime() || next.end.getTime() < loaded.start.getTime()) {
    return { start: next.start, end: next.end };
  }
  return {
    start: new Date(Math.min(loaded.start.getTime(), next.start.getTime())),
    end: new Date(Math.max(loaded.end.getTime(), next.end.getTime())),
  };
}

export function daysWithSlots(slots: PublicBookableSlot[], zone: string): Set<string> {
  return new Set(slots.map((slot) => slotDayKey(slot, zone)));
}

export function zoneChoices(offeringZone: string): string[] {
  const out = new Set<string>([offeringZone, DEVICE_TIME_ZONE, ...GUEST_ZONES]);
  return [...out].filter((z) => isValidTimeZone(z));
}

export function minuteOfDay(instant: Date, zone: string) {
  const { hour, minute } = wallClockInZone(instant, zone);
  return hour * 60 + minute;
}

export const HEAT_HOUR_PX = 104;
export const HEAT_SLOT_PX = (HEAT_STEP_MIN / 60) * HEAT_HOUR_PX;

/** Start-time chip. Duration is on the rail; drawing the full hour stacks 15-minute starts on top of each other. */
export function heatmapSlotOffset(start: Date, firstHourMin: number, zone: string) {
  const startMin = Math.floor(minuteOfDay(start, zone) / HEAT_STEP_MIN) * HEAT_STEP_MIN;
  const top = ((startMin - firstHourMin) / 60) * HEAT_HOUR_PX;
  const height = Math.max(24, HEAT_SLOT_PX - 2);
  return { top, height, startMin };
}

export function heatmapNowTop(now: Date, firstHourMin: number, lastHourMin: number, zone: string) {
  const nowMin = minuteOfDay(now, zone);
  if (nowMin < firstHourMin || nowMin > lastHourMin + 60) return null;
  return ((nowMin - firstHourMin) / 60) * HEAT_HOUR_PX;
}

export function heatmapPastCover(
  day: Date,
  now: Date,
  firstHourMin: number,
  hourCount: number,
  zone: string,
) {
  const total = hourCount * HEAT_HOUR_PX;
  const dayK = dateKey(day, zone);
  const todayK = dateKey(now, zone);
  if (dayK < todayK) return total;
  if (dayK > todayK) return 0;
  return Math.min(total, Math.max(0, ((minuteOfDay(now, zone) - firstHourMin) / 60) * HEAT_HOUR_PX));
}
