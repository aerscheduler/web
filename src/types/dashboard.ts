/**
 * The dashboard wire types, mirroring `server/src/reports/dashboard/schema.ts`.
 *
 * The server is the authority, it validates every config on the way in AND on
 * the way out, so nothing here is load-bearing for safety. These exist so the
 * builder can be written against a real shape, and there is a matching Zod
 * schema in `lib/dashboard-schema.ts` used to check a config before it is sent,
 * which turns a server 400 into an inline message.
 *
 * Vocabulary is CJA's: a PANEL carries a range, a comparison and a segment; the
 * VISUALIZATIONS inside inherit those or override their own. METRICS are the
 * numbers, DIMENSIONS are what you cut them by.
 */

import type { ReportColumn, ReportDefaultRange, ReportFilterInput } from "./reports";

export const VIZ_TYPES = ["metric", "line", "bar", "list", "table", "widget"] as const;
export type VizType = (typeof VIZ_TYPES)[number];

/**
 * The built-in widgets: tiles that are not a report aggregation.
 *
 * Mirrors `WIDGET_KEYS` on the server. Each one draws itself from its own
 * endpoint rather than from the dashboard run, so adding one is a renderer here
 * plus a key there, and nothing in the engine changes.
 */
export const WIDGET_KEYS = ["attention", "upcoming"] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const WIDGET_LABEL: Record<WidgetKey, string> = {
  upcoming: "Up next",
  attention: "Needs attention",
};

export const WIDGET_HINT: Record<WidgetKey, string> = {
  upcoming: "The next bookings on the schedule, with today's first.",
  attention: "Everything overdue or unfinished, each opening the rows behind it.",
};

export type RangeSpec = ReportDefaultRange | { startDate: string; endDate: string };
export type CompareSpec = "previous" | "lastYear" | "none";

export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Visualization {
  id: string;
  title?: string;
  viz: VizType;
  reportId: string;
  metrics: string[];
  dimension?: string;
  /** Set only on a `widget` tile, which has no report behind it. */
  widget?: WidgetKey;
  filters: ReportFilterInput[];
  /** "inherit" takes the panel's window, the default. */
  range: "inherit" | RangeSpec;
  compare: "inherit" | CompareSpec;
  layout: GridPosition;
}

export interface Panel {
  id: string;
  name?: string;
  range: RangeSpec;
  compare: CompareSpec;
  /** Applied to every visualization in the panel. No UI yet; the shape is ready. */
  segment: ReportFilterInput[];
  visualizations: Visualization[];
}

export interface DashboardConfig {
  version: 1;
  panels: Panel[];
}

export interface DashboardDocument {
  id: number | null;
  name: string;
  isShared: boolean;
  /** True when nothing has been saved yet and this is the built-in layout. */
  isDefault: boolean;
  config: DashboardConfig;
  /**
   * Visualizations the server refused to serve, a report that was removed, a
   * metric that no longer exists, or one this user may not see. Shown rather
   * than swallowed, so a shorter dashboard is never a silent surprise.
   */
  dropped: string[];
  updatedAt: string | null;
}

export interface VisualizationResult {
  id: string;
  viz: VizType;
  reportId: string;
  /** The window actually used, each card states its own, since they can differ. */
  window: { startDate: string; endDate: string };
  comparison: { startDate: string; endDate: string } | null;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals: Record<string, unknown>;
  previousTotals: Record<string, unknown> | null;
  /**
   * The comparison window's rows, so a time chart can draw the previous period
   * behind the current one. Null on every other visualization: it is a second
   * full read of the report, and the server only pays for it where it is drawn.
   */
  previousRows: Record<string, unknown>[] | null;
  error?: string;
}

/** Minimum grid size per type, a line chart at 1×1 is unreadable. */
export const VIZ_MIN_SIZE: Record<VizType, { w: number; h: number }> = {
  metric: { w: 2, h: 1 },
  line: { w: 4, h: 2 },
  bar: { w: 3, h: 2 },
  list: { w: 3, h: 2 },
  table: { w: 4, h: 2 },
  widget: { w: 3, h: 2 },
};

export const VIZ_DEFAULT_SIZE: Record<VizType, { w: number; h: number }> = {
  metric: { w: 3, h: 1 },
  line: { w: 6, h: 3 },
  bar: { w: 6, h: 3 },
  list: { w: 4, h: 3 },
  table: { w: 12, h: 3 },
  widget: { w: 4, h: 3 },
};

export const VIZ_LABEL: Record<VizType, string> = {
  metric: "Number",
  line: "Line chart",
  bar: "Bar chart",
  list: "Breakdown",
  table: "Table",
  widget: "Widget",
};

/** What each type needs, said in the builder so the choice explains itself. */
export const VIZ_HINT: Record<VizType, string> = {
  metric: "One headline figure, with a change against the comparison period.",
  line: "A metric over time. Pick up to three to overlay.",
  bar: "Ranks one metric by a dimension, which aircraft, which instructor.",
  list: "One metric split into rows, each with its figure and its share of the total.",
  table: "The rows themselves, for detail you want on the dashboard.",
  widget: "A built-in panel: what's on today, or what needs attention.",
};
