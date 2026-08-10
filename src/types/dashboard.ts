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

export const VIZ_TYPES = ["metric", "line", "bar", "table"] as const;
export type VizType = (typeof VIZ_TYPES)[number];

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
  error?: string;
}

/** Minimum grid size per type, a line chart at 1×1 is unreadable. */
export const VIZ_MIN_SIZE: Record<VizType, { w: number; h: number }> = {
  metric: { w: 2, h: 1 },
  line: { w: 4, h: 2 },
  bar: { w: 3, h: 2 },
  table: { w: 4, h: 2 },
};

export const VIZ_DEFAULT_SIZE: Record<VizType, { w: number; h: number }> = {
  metric: { w: 3, h: 1 },
  line: { w: 6, h: 3 },
  bar: { w: 6, h: 3 },
  table: { w: 12, h: 3 },
};

export const VIZ_LABEL: Record<VizType, string> = {
  metric: "Number",
  line: "Line chart",
  bar: "Bar chart",
  table: "Table",
};

/** What each type needs, said in the builder so the choice explains itself. */
export const VIZ_HINT: Record<VizType, string> = {
  metric: "One headline figure, with a change against the comparison period.",
  line: "A metric over time. Pick up to three to overlay.",
  bar: "Ranks one metric by a dimension, which aircraft, which instructor.",
  table: "The rows themselves, for detail you want on the dashboard.",
};
