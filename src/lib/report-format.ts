/**
 * Rendering a report cell, and resolving a report's window.
 *
 * The engine sends money as cents, hours as deci-hours and rates as 0..1. Every
 * report goes through this one formatter so two reports can never disagree about
 * how 123 deci-hours reads.
 *
 * Null is rendered as an em dash, never as zero. "We have no reading for this
 * flight" and "this flight logged nothing" are different facts, and a report
 * that shows them identically is one a school will stop trusting.
 */

import { addDays, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { ReportColumn, ReportColumnType, ReportDefaultRange } from "@/types/reports";
import { wallClockInZone, zonedWallClockToUtc } from "@/lib/timezone";

export const EMPTY_CELL = "—";

export function formatReportValue(value: unknown, type: ReportColumnType): string {
  if (value == null || value === "") return EMPTY_CELL;

  switch (type) {
    case "money": {
      if (typeof value !== "number") return EMPTY_CELL;
      const dollars = value / 100;
      return dollars.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        // Whole dollars for anything four figures and up — a revenue table is
        // read as a ranking, and trailing cents just add noise to scan past.
        minimumFractionDigits: Math.abs(dollars) >= 1000 ? 0 : 2,
        maximumFractionDigits: Math.abs(dollars) >= 1000 ? 0 : 2,
      });
    }
    case "hours":
      return typeof value === "number" ? `${(value / 10).toFixed(1)} h` : EMPTY_CELL;
    case "percent":
      return typeof value === "number" ? `${(value * 100).toFixed(0)}%` : EMPTY_CELL;
    case "number":
      return typeof value === "number"
        ? value.toLocaleString("en-US", { maximumFractionDigits: 1 })
        : String(value);
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      try {
        return format(parseISO(String(value)), "MMM d, yyyy");
      } catch {
        return String(value);
      }
    case "datetime":
      try {
        return format(parseISO(String(value)), "MMM d, yyyy h:mm a");
      } catch {
        return String(value);
      }
    default:
      return String(value);
  }
}

/** Numeric columns are right-aligned and tabular so a column of figures lines up. */
export function isNumericColumn(column: ReportColumn): boolean {
  return (
    column.type === "money" ||
    column.type === "hours" ||
    column.type === "number" ||
    column.type === "percent"
  );
}

/**
 * A subset of columns worth drawing as a bar, and the one to draw.
 *
 * The first summable money column, else the first summable hours column — which
 * is the measure the report is ranked on in practice, and the one a school reads
 * the chart for.
 */
export function primaryMeasure(columns: ReportColumn[]): ReportColumn | null {
  return (
    columns.find((c) => c.type === "money" && c.aggregate === "sum") ??
    columns.find((c) => c.type === "hours" && c.aggregate === "sum") ??
    columns.find((c) => c.type === "number" && c.aggregate === "sum") ??
    null
  );
}

// ---------------------------------------------------------------- date ranges

export const RANGE_LABELS: Record<ReportDefaultRange, string> = {
  past7: "Last 7 days",
  past30: "Last 30 days",
  past90: "Last 90 days",
  monthToDate: "Month to date",
  yearToDate: "Year to date",
  next30: "Next 30 days",
  next90: "Next 90 days",
};

/**
 * Every window here is measured on the SCHOOL's clock, not the browser's.
 *
 * This used to use the device's midnight while the server used UTC's, so at
 * UTC-6 the same words meant windows six hours apart at both ends and a
 * dashboard tile disagreed with the report it opened — $84,956 against $86,015
 * for one "Last 30 days". `timeZone` is a required argument for that reason:
 * the zone comes from `/reports/catalog` (`organization.timeZone → this
 * browser's → UTC`), so both sides resolve the same names the same way.
 *
 * The maths deliberately mirrors `server/src/reports/engine/window.ts`. If one
 * changes, the other has to.
 */

/** The calendar date it is in `timeZone` right now, as a LOCAL Date carrying those parts. */
function todayIn(timeZone: string): Date {
  const { year, month, day } = wallClockInZone(new Date(), timeZone);
  // A local Date whose y/m/d ARE the school's date: the picker and `format`
  // read local components, so this is what makes them show the school's day.
  return new Date(year, month - 1, day);
}

/** Midnight in the zone, for the calendar date this Date's local parts name. */
function dayStartIn(day: Date, timeZone: string): Date {
  return zonedWallClockToUtc(day.getFullYear(), day.getMonth() + 1, day.getDate(), 0, 0, timeZone);
}

/**
 * The last millisecond of that date in the zone.
 *
 * Next midnight minus 1ms rather than "23:59:59.999", so the two days a year a
 * zone shifts — and the handful of zones that shift AT midnight — are still
 * covered to their real end. The server computes it the same way.
 */
function dayEndIn(day: Date, timeZone: string): Date {
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return new Date(dayStartIn(next, timeZone).getTime() - 1);
}

/**
 * A named window → the calendar dates the picker shows.
 *
 * Reports that look forwards (expirations, maintenance due) declare a forward
 * range, so opening one shows what is about to happen rather than what already
 * lapsed.
 */
export function resolveRange(name: ReportDefaultRange, timeZone: string): DateRange {
  const today = todayIn(timeZone);
  switch (name) {
    case "past7":
      return { from: addDays(today, -6), to: today };
    case "past90":
      return { from: addDays(today, -89), to: today };
    case "monthToDate":
      return { from: startOfMonth(today), to: today };
    case "yearToDate":
      return { from: startOfYear(today), to: today };
    case "next30":
      return { from: today, to: addDays(today, 30) };
    case "next90":
      return { from: today, to: addDays(today, 90) };
    case "past30":
    default:
      return { from: addDays(today, -29), to: today };
  }
}

/**
 * Picked dates → the ISO window the API expects, or null if incomplete.
 *
 * The dates are what the user pointed at on a calendar, so they are anchored in
 * the school's zone rather than converted as instants — converting would slide
 * the whole window by the offset between the two clocks.
 */
export function rangeToIso(
  range: DateRange | undefined,
  timeZone: string
): { startDate: string; endDate: string } | null {
  if (!range?.from) return null;
  return {
    startDate: dayStartIn(range.from, timeZone).toISOString(),
    endDate: dayEndIn(range.to ?? range.from, timeZone).toISOString(),
  };
}

/**
 * "Jul 2 – Jul 31" for a window that came back from the server.
 *
 * Formatted in the zone it was MEASURED in. Printing a server-computed window
 * with the browser's clock is how a `past30` window computed over the school's
 * days came out labelled "Jul 1 – Jul 31" while its own report said "Jul 2".
 */
export function formatWindow(
  window: { startDate: string; endDate: string } | undefined,
  timeZone: string
): string {
  if (!window) return "";
  try {
    const from = wallClockInZone(window.startDate, timeZone);
    const to = wallClockInZone(window.endDate, timeZone);
    const sameYear = from.year === wallClockInZone(new Date(), timeZone).year;
    const asDate = (p: { year: number; month: number; day: number }) =>
      new Date(p.year, p.month - 1, p.day);
    return `${format(asDate(from), "MMM d")} – ${format(asDate(to), sameYear ? "MMM d" : "MMM d, yyyy")}`;
  } catch {
    return "";
  }
}
