import type { Reservation } from "@/types/api";
import { dateKeyInZone, minutesFromMidnightInZone } from "@/lib/timezone";

/**
 * The frame a normal flying day gets drawn in, shared by the day lane board and the week
 * time-grid. Not a hard limit — see hourWindow().
 */
export const DEFAULT_START_HOUR = 6;
export const DEFAULT_END_HOUR = 22;

export function hourLabel(h: number) {
  const period = h < 12 || h === 24 ? "a" : "p";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

/**
 * The hours to actually draw: the default 6a–10p frame, widened to whole hours so that every
 * reservation handed to the grid is fully visible.
 *
 * Both grids clamp block geometry to the window, so anything outside it used to collapse onto
 * the top or bottom edge — a 1am booking drew as a sliver stacked under the 6a label, which
 * reads as a rendering bug rather than as a real flight. Growing the frame instead leaves a
 * normal day looking exactly as it did and only pays for the extra rows when something is
 * actually out there.
 *
 * Measured on the AIRPORT's clock, like every other time on these boards.
 */
export function hourWindow(reservations: Reservation[], zone: string, dayKey?: string) {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const r of reservations) {
    // `dayKey` is passed by the single-day board. Without it, an endpoint belonging to
    // ANOTHER day widens this day's ruler off a clock reading that has nothing to do with it:
    // an aeroplane that left at 05:00 on Friday would pull Saturday's ruler back to 5am. The
    // week grid deliberately passes no key, because its ruler is shared across seven days.
    const startsHere = !dayKey || dateKeyInZone(r.start, zone) === dayKey;
    const endsHere = !dayKey || dateKeyInZone(r.end, zone) === dayKey;
    const s = minutesFromMidnightInZone(r.start, zone);
    const e = minutesFromMidnightInZone(r.end, zone);

    if (startsHere) startHour = Math.min(startHour, Math.floor(s / 60));

    if (endsHere) {
      // e <= s with both endpoints on this day means the booking runs past midnight, so its
      // end is a reading off the NEXT day's clock and can't widen this one.
      endHour = Math.max(endHour, e > s || !startsHere ? Math.ceil(e / 60) : 24);
    } else if (startsHere) {
      // Starts today and comes back on a later day: the part of it we can show runs to the
      // end of the day, so the ruler has to reach midnight.
      endHour = 24;
    }
    // Neither endpoint here means the resource is away for the whole of this day. That draws
    // as a bar clamped across the full ruler, which already says "unavailable", so the frame
    // is deliberately left at its normal size rather than stretched to 0–24 on every lane.
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}
