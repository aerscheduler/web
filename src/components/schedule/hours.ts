import type { Reservation } from "@/types/api";
import { dateKeyInZone, minutesFromMidnightInZone } from "@/lib/timezone";

/**
 * The frame a normal flying day gets drawn in, shared by the day lane board and the week
 * time-grid. Defaults match the school booking-policy flying day (6a-10p until configured).
 * Not a hard limit by itself, booking validation and availability clipping enforce hours;
 * see hourWindow().
 */
export const DEFAULT_START_HOUR = 6;
export const DEFAULT_END_HOUR = 22;

export function hourLabel(h: number) {
  const period = h < 12 || h === 24 ? "a" : "p";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

export type FlyingDayFrame = {
  startHour: number;
  endHour: number;
};

/** Resolve the board frame from org booking policy (minutes → hours). */
export function flyingDayFrameFromPolicy(policy?: {
  flyingDayStartMinute?: number | null;
  flyingDayEndMinute?: number | null;
} | null): FlyingDayFrame {
  const startMin = policy?.flyingDayStartMinute;
  const endMin = policy?.flyingDayEndMinute;
  if (startMin == null || endMin == null) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }
  if (startMin === endMin) {
    return { startHour: 0, endHour: 24 };
  }
  if (!(startMin < endMin)) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }
  return {
    startHour: Math.floor(startMin / 60),
    endHour: Math.ceil(endMin / 60),
  };
}

/**
 * The hours to actually draw: the school flying-day frame, widened to whole hours so that
 * every reservation handed to the grid is fully visible.
 *
 * Measured on the AIRPORT's clock, like every other time on these boards.
 */
export function hourWindow(
  reservations: Reservation[],
  zone: string,
  dayKey?: string,
  extraWindows: Array<{ start: string; end: string }> = [],
  frame?: FlyingDayFrame
) {
  let startHour = frame?.startHour ?? DEFAULT_START_HOUR;
  let endHour = frame?.endHour ?? DEFAULT_END_HOUR;
  const spans: Array<{ start: string; end: string }> = [
    ...reservations.map((r) => ({ start: r.start, end: r.end })),
    ...extraWindows,
  ];
  for (const r of spans) {
    const startsHere = !dayKey || dateKeyInZone(r.start, zone) === dayKey;
    const endsHere = !dayKey || dateKeyInZone(r.end, zone) === dayKey;
    const s = minutesFromMidnightInZone(r.start, zone);
    const e = minutesFromMidnightInZone(r.end, zone);

    if (startsHere) startHour = Math.min(startHour, Math.floor(s / 60));

    if (endsHere) {
      endHour = Math.max(endHour, e > s || !startsHere ? Math.ceil(e / 60) : 24);
    } else if (startsHere) {
      endHour = 24;
    }
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}
