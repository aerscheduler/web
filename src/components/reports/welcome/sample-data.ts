/**
 * Sample numbers for the Reports welcome previews.
 *
 * These are rendered through the SAME viz components the real dashboard uses, not
 * through screenshots or bespoke mark-up. That's the point: a preview drawn by hand
 * starts lying the day someone changes an axis, whereas this one can only ever look
 * like what the school will actually get.
 *
 * The figures are a plausible four-aircraft school over a month. Deliberately not
 * round — a preview full of 100s and 250s reads as a mock-up.
 */

import type { ReportColumn } from "@/types/reports";

export const REVENUE_COLUMNS: ReportColumn[] = [
  { key: "revenue", label: "Revenue", type: "money", description: "Invoiced in the period" },
  { key: "collected", label: "Collected", type: "money" },
  { key: "outstanding", label: "Outstanding", type: "money" },
  { key: "date", label: "Week", type: "date" },
];

export const REVENUE_TOTALS = { revenue: 4_284_500, collected: 3_910_000, outstanding: 374_500 };
export const REVENUE_PREVIOUS = { revenue: 3_766_000, collected: 3_512_000, outstanding: 254_000 };

/** The `date` dimension is a real time axis in `VizLine` — it parses these — so they
 *  have to be ISO dates, not "Wk 1". Fixed rather than computed: the previews must
 *  render the same thing every time, and the card says plainly that it's sample data. */
export const REVENUE_BY_WEEK = [
  { date: "2026-07-06", revenue: 892_000, collected: 815_000 },
  { date: "2026-07-13", revenue: 1_146_500, collected: 1_074_000 },
  { date: "2026-07-20", revenue: 981_000, collected: 934_000 },
  { date: "2026-07-27", revenue: 1_265_000, collected: 1_087_000 },
];

export const UTILIZATION_COLUMNS: ReportColumn[] = [
  { key: "tail", label: "Aircraft", type: "string" },
  { key: "hours", label: "Hours flown", type: "hours" },
  { key: "utilization", label: "Utilization", type: "percent" },
];

export const UTILIZATION_TOTALS = { hours: 2_374, utilization: 0.61 };
export const UTILIZATION_PREVIOUS = { hours: 2_038, utilization: 0.54 };

export const UTILIZATION_BY_TAIL = [
  { tail: "N734QP", hours: 812, utilization: 0.74 },
  { tail: "N5218G", hours: 693, utilization: 0.63 },
  { tail: "N91XA", hours: 517, utilization: 0.49 },
  { tail: "N2280V", hours: 352, utilization: 0.34 },
];

export const MAINTENANCE_COLUMNS: ReportColumn[] = [
  { key: "tail", label: "Aircraft", type: "string" },
  { key: "dueIn", label: "Hours to next inspection", type: "hours" },
  { key: "openSquawks", label: "Open squawks", type: "number" },
];

// Deci-hours, per the "hours" column type: 420 renders as 42.0 h. A 100-hour
// inspection interval is the scale these should read at.
export const MAINTENANCE_TOTALS = { openSquawks: 7, dueIn: 1_180 };
export const MAINTENANCE_PREVIOUS = { openSquawks: 4, dueIn: 2_260 };

export const MAINTENANCE_BY_TAIL = [
  { tail: "N2280V", dueIn: 420, openSquawks: 3 },
  { tail: "N91XA", dueIn: 960, openSquawks: 2 },
  { tail: "N5218G", dueIn: 1_540, openSquawks: 1 },
  { tail: "N734QP", dueIn: 1_810, openSquawks: 1 },
];
