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

/**
 * A ruler tick: "7 AM", "10 PM", "12 AM" at both ends of the day.
 *
 * Spelled out rather than the old "7a"/"10p": the hour columns are wide enough for it, and a
 * board that a dispatcher reads at a glance shouldn't ask them to decode a one-letter suffix.
 * Matches the labels the mobile board already used.
 */
export function hourLabel(h: number) {
  const period = h < 12 || h === 24 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
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
 * Slack drawn on each side of the hours that actually matter, so the board never ends flush
 * against its first and last booking. Two hours is enough to read as breathing room, and
 * enough to see that a late flight has nothing after it.
 *
 * Clamped at midnight either way: there is no 25th hour to scroll into.
 */
export const BUFFER_HOURS = 2;

export type HourWindow = {
  /** First hour drawn, buffer included. */
  startHour: number;
  /** One past the last hour drawn, buffer included. */
  endHour: number;
  /**
   * The school's flying day on its own. Everything outside it is still drawn, but shaded, so
   * a booking after closing reads as after closing instead of as a normal hour.
   */
  frameStartHour: number;
  frameEndHour: number;
};

/**
 * The hours to actually draw: the school flying-day frame, widened to whole hours so that
 * every reservation handed to the grid is fully visible, then buffered on both sides.
 *
 * Measured on the AIRPORT's clock, like every other time on these boards.
 */
export function hourWindow(
  reservations: Reservation[],
  zone: string,
  dayKey?: string,
  extraWindows: Array<{ start: string; end: string }> = [],
  frame?: FlyingDayFrame
): HourWindow {
  const frameStartHour = frame?.startHour ?? DEFAULT_START_HOUR;
  const frameEndHour = frame?.endHour ?? DEFAULT_END_HOUR;
  let startHour = frameStartHour;
  let endHour = frameEndHour;
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
  return {
    startHour: Math.max(0, startHour - BUFFER_HOURS),
    endHour: Math.min(24, endHour + BUFFER_HOURS),
    frameStartHour: Math.max(0, Math.min(24, frameStartHour)),
    frameEndHour: Math.max(0, Math.min(24, frameEndHour)),
  };
}

/** "6:00 AM", for a whole hour of the flying day. */
function clockLabel(h: number) {
  const period = h < 12 || h === 24 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

/**
 * Why a click in a shaded band didn't open the booking form.
 *
 * The buffer and the hours a late booking pushed the window into are drawn but not open: the
 * server refuses a same-day booking outside the flying day, so offering the form there would
 * only fail on save. Saying so at the click is the honest version.
 */
export function closedHourMessage(win: HourWindow) {
  return `Outside the flying day (${clockLabel(win.frameStartHour)} to ${clockLabel(
    win.frameEndHour
  )}). Use New reservation for a trip or shop time.`;
}

/** Whether a one-hour booking starting at `hour` fits inside the school's flying day. */
export function isOpenHour(win: HourWindow, hour: number) {
  return hour >= win.frameStartHour && hour + 1 <= win.frameEndHour;
}
