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

/** Local midnights crossed between out and back. 0 for a booking home the same day. */
export function nightsAway(start: Date, end: Date, timeZone: string): number {
  const from = dateKeyInZone(start, timeZone);
  const to = dateKeyInZone(end, timeZone);
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * The minimum in force: the aircraft's own, else the organization's, else none.
 *
 * `null` on the aircraft means inherit and `0` means explicitly exempt, so this tests for
 * null rather than falsiness — same as the server's `minimumForBooking`.
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
  if (!args.start || !args.end) return null;

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
