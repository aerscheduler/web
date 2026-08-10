/**
 * The shapes `/reports/orgUser/*` and `/reports/resource/*` answer with, and how
 * to turn them into one number.
 *
 * These endpoints are not uniform, and assuming they are is how a card ends up
 * rendering `[object Object]`, which has happened here before. Three shapes:
 *
 *   countFlightTime, countScheduledReservations, countCompletedReservations
 *       → `{ date, count }[]`, one row per day in the window.
 *         For flight time `count` is DECI-HOURS; for the other two it's a count.
 *   countInstructionTimeGiven, countInstructionTimeReceived, countUnresolvedSquawks
 *       → a bare number (deci-hours, deci-hours, and a count).
 *   countPendingAndProcessedPayments
 *       → `{ pending, processed }` in integer cents.
 */

export type DailyCount = { date: string; count: number };

export type PaymentTotals = { pending: number; processed: number };

/**
 * Total a daily series.
 *
 * Returns null (not 0) when there is no series, because "the request hasn't
 * landed / failed" and "this person flew nothing" have to look different on a
 * tile. Rows with a non-numeric count are skipped rather than poisoning the sum
 * with NaN, which renders as a blank tile and reads as a bug in the data.
 */
export function sumSeries(series: DailyCount[] | undefined | null): number | null {
  if (!Array.isArray(series)) return null;
  let total = 0;
  for (const row of series) {
    if (typeof row?.count === "number" && Number.isFinite(row.count)) total += row.count;
  }
  return total;
}

/**
 * The series as points a sparkline can draw, oldest first.
 *
 * The server builds one row per day in the window whether or not anything
 * happened, so the gaps are real zeroes here and the line is safe to draw
 * continuously.
 */
export function seriesPoints(series: DailyCount[] | undefined | null): DailyCount[] {
  if (!Array.isArray(series)) return [];
  return [...series]
    .filter((row) => typeof row?.count === "number" && Number.isFinite(row.count))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
