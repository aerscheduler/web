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

import { addDays, endOfDay, format, parseISO, startOfDay, startOfMonth, startOfYear } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { ReportColumn, ReportColumnType, ReportDefaultRange } from "@/types/reports";

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
 * A named window → real dates.
 *
 * Reports that look forwards (expirations, maintenance due) declare a forward
 * range, so opening one shows what is about to happen rather than what already
 * lapsed. Storing the NAME in a saved view rather than the dates is what keeps
 * "Month-end revenue" meaningful next month.
 */
export function resolveRange(name: ReportDefaultRange): DateRange {
  const today = startOfDay(new Date());
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

/** A picked range → the ISO window the API expects, or null if incomplete. */
export function rangeToIso(range: DateRange | undefined): { startDate: string; endDate: string } | null {
  if (!range?.from) return null;
  return {
    startDate: startOfDay(range.from).toISOString(),
    endDate: endOfDay(range.to ?? range.from).toISOString(),
  };
}
