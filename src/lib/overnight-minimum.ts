/**
 * Telling somebody, BEFORE they book, that keeping the aircraft overnight will cost them.
 *
 * The charge itself is the server's (utils/bookingMinimums.ts). This is the disclosure, and
 * it exists because the failure mode of a minimum is not a wrong number, it is a surprise:
 * a member books a weekend away, flies 1.5 hours, and gets an invoice for 4. That is the
 * kind of thing that gets argued about at the front desk rather than reported as a bug.
 *
 * Mirrors the server's rules deliberately, and the mirror is the point of the comments:
 *
 *  - the unit is NIGHTS, not days, so a same-day booking is never affected;
 *  - nights are counted in the AIRPORT's zone, so an evening flight west of Greenwich does
 *    not read as a night away;
 *  - the aircraft's own figure wins, where null means inherit and 0 means exempt;
 *  - it is a FLOOR, so it only bites when the booking would otherwise bill less.
 *
 * If any of those drift from `server/src/utils/bookingMinimums.ts`, this screen starts
 * promising something the invoice does not do, which is worse than saying nothing.
 */

import { dateKeyInZone } from "./timezone";

/**
 * Is this a Date that can actually be formatted?
 *
 * `new Date("nonsense")` is an OBJECT, so it is truthy, and a `!start` guard sails straight
 * past it, but its time value is NaN and `Intl.DateTimeFormat.formatToParts` throws
 * `RangeError: Invalid time value` on it rather than returning something useless. Inside a
 * React render that throw reaches the error boundary and takes the whole booking form down,
 * which is what it did: the form has a legitimate half-built state where the end instant is
 * momentarily invalid (see `isoValue`/`valid` in smart-time-range.tsx, which exist for the
 * same reason), and the notice rendered during it.
 */
const usable = (d: Date | null | undefined): d is Date =>
  d instanceof Date && Number.isFinite(d.getTime());

/**
 * Local midnights crossed between out and back. 0 for a booking home the same day.
 *
 * Measured to the last instant the booking OCCUPIES (its end minus a millisecond) because
 * a booking is `[start, end)` and its end is a boundary, not a moment the aircraft is out.
 * Only visible at midnight, and there it is the whole answer: 10 pm → midnight is an evening
 * flight the picker offers as the last slot of every day, and reading the boundary's own
 * date called it a night away. Mirrors `lastOccupiedInstant` in server/src/utils/
 * multiDayBooking.ts, which the server's night count and its multi-day gate both use.
 */
export function nightsAway(start: Date, end: Date, timeZone: string): number {
  //Checked here as well as at the entry points, because this is exported and the throw it
  //prevents is not local to it.
  if (!usable(start) || !usable(end)) return 0;
  const from = dateKeyInZone(start, timeZone);
  const to = dateKeyInZone(new Date(end.getTime() - 1), timeZone);
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * The minimum in force: the aircraft's own, else the organization's, else none.
 *
 * `null` on the aircraft means inherit and `0` means explicitly exempt, so this tests for
 * null rather than falsiness, same as the server's `minimumForBooking`.
 */
export function effectiveOvernightMinimumTenths(args: {
  aircraftMinimumTenths?: number | null;
  orgMinimumTenths?: number | null;
}): number {
  if (args.aircraftMinimumTenths != null) return Math.max(0, Math.trunc(args.aircraftMinimumTenths));
  if (args.orgMinimumTenths != null) return Math.max(0, Math.trunc(args.orgMinimumTenths));
  return 0;
}

export type OvernightDisclosure = {
  nights: number;
  minimumTenthsPerNight: number;
  /** Tenths this booking will bill at the very least. */
  floorTenths: number;
  /** One sentence for the booking form. */
  message: string;
};

/**
 * What to warn about, or null when there is nothing to say.
 *
 * Returns null for a same-day booking and for a school with no minimum, so the caller can
 * render it unconditionally without deciding anything itself.
 */
export function overnightDisclosure(args: {
  start: Date | null;
  end: Date | null;
  timeZone: string;
  aircraftMinimumTenths?: number | null;
  orgMinimumTenths?: number | null;
  /** For "keeps N172TS out two nights". Falls back to a neutral noun. */
  resourceName?: string | null;
}): OvernightDisclosure | null {
  //`usable`, not a truthiness check: an Invalid Date is truthy and throws when formatted.
  if (!usable(args.start) || !usable(args.end)) return null;

  const minimumTenthsPerNight = effectiveOvernightMinimumTenths(args);
  if (minimumTenthsPerNight <= 0) return null;

  const nights = nightsAway(args.start, args.end, args.timeZone);
  if (nights <= 0) return null;

  const floorTenths = minimumTenthsPerNight * nights;
  const hours = (t: number) => (t / 10).toFixed(1);
  const what = args.resourceName?.trim() || "the aircraft";

  return {
    nights,
    minimumTenthsPerNight,
    floorTenths,
    message:
      `This keeps ${what} out ${nights === 1 ? "overnight" : `for ${nights} nights`}. ` +
      `Your school bills at least ${hours(minimumTenthsPerNight)} hours per night away, ` +
      `so this booking will bill a minimum of ${hours(floorTenths)} hours even if you fly less.`,
  };
}

export type OvernightBilling = {
  nights: number;
  minimumTenthsPerNight: number;
  flownTenths: number;
  /** What will actually be billed: the greater of flown and the floor. */
  billedTenths: number;
  /** True only when the minimum actually RAISED the bill. */
  applied: boolean;
};

/**
 * What the aircraft charge will come to once the meters are in, given the minimum.
 *
 * The disclosure before booking says what the floor IS. This says what it DOES to the
 * numbers the person is typing at ramp-in, which is the moment the surprise would otherwise
 * land: a member reads 1.5 off the Hobbs, ramps in, and an invoice for 4.0 appears with
 * nothing on screen having mentioned it.
 *
 * Mirrors the server's `applyOvernightMinimum`: a FLOOR, so `applied` is false when the
 * booking flew more than the minimum, and a booking home the same day can never reach it.
 * Returns null when there is nothing to say.
 */
export function overnightBilling(args: {
  start: Date | string | null;
  end: Date | string | null;
  timeZone: string;
  flownTenths: number | null;
  aircraftMinimumTenths?: number | null;
  orgMinimumTenths?: number | null;
}): OvernightBilling | null {
  const start = typeof args.start === "string" ? new Date(args.start) : args.start;
  const end = typeof args.end === "string" ? new Date(args.end) : args.end;
  //Same reasoning as overnightDisclosure: this runs while somebody is typing a Hobbs reading,
  //so a momentarily unusable date must produce silence rather than a thrown render.
  if (!usable(start) || !usable(end) || args.flownTenths == null) return null;

  const minimumTenthsPerNight = effectiveOvernightMinimumTenths(args);
  if (minimumTenthsPerNight <= 0) return null;

  const nights = nightsAway(start, end, args.timeZone);
  if (nights <= 0) return null;

  const flownTenths = Math.max(0, Math.round(args.flownTenths));
  const floorTenths = minimumTenthsPerNight * nights;
  const billedTenths = Math.max(flownTenths, floorTenths);

  return {
    nights,
    minimumTenthsPerNight,
    flownTenths,
    billedTenths,
    applied: billedTenths > flownTenths,
  };
}
