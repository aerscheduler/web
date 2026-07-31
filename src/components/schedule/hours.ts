import type { Reservation } from "@/types/api";
import { minutesFromMidnightInZone } from "@/lib/timezone";

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
export function hourWindow(reservations: Reservation[], zone: string) {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const r of reservations) {
    const s = minutesFromMidnightInZone(r.start, zone);
    const e = minutesFromMidnightInZone(r.end, zone);
    startHour = Math.min(startHour, Math.floor(s / 60));
    // e <= s means the booking runs past midnight, so its end is a reading off the NEXT day's
    // clock and can't widen this one. The part of it we can show just runs to the day's end.
    endHour = Math.max(endHour, e > s ? Math.ceil(e / 60) : 24);
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}
