/**
 * The report engine's wire types, mirroring `server/src/reports/engine/types.ts`.
 *
 * These describe the SHAPE of a report, not any particular report. The console
 * never hardcodes a column, filter or dimension — it renders whatever
 * `/reports/catalog` describes, which is what lets a report added on the server
 * appear here with no client change at all.
 */

export type ReportColumnType =
  | "string"
  | "number"
  /** Integer cents. */
  | "money"
  /** Integer deci-hours (12.3h => 123). */
  | "hours"
  | "date"
  | "datetime"
  | "boolean"
  /** 0..1. */
  | "percent";

export type ReportAggregate = "sum" | "avg" | "min" | "max" | "count" | "countDistinct";

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
  default?: boolean;
  aggregate?: ReportAggregate;
  ratio?: { numerator: string; denominator: string };
  sortable?: boolean;
  description?: string;
}

export type ReportFilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "in"
  | "notIn"
  | "isNull"
  | "isNotNull"
  | "between";

export interface ReportFilterDef {
  key: string;
  label: string;
  type: ReportColumnType;
  operators: ReportFilterOperator[];
  /** Already resolved server-side, including the org's own aircraft and people. */
  options?: { value: string; label: string }[];
  description?: string;
}

export interface ReportDimension {
  key: string;
  label: string;
}

export type ReportCategoryKey = "financial" | "operations" | "fleet" | "people" | "compliance";

export type ReportDefaultRange =
  | "past7"
  | "past30"
  | "past90"
  | "monthToDate"
  | "yearToDate"
  | "next30"
  | "next90";

export interface ReportMeta {
  id: string;
  name: string;
  description: string;
  category: ReportCategoryKey;
  /** Which date the window applies to, in plain words. Shown beside the picker. */
  dateBasis: string;
  defaultRange: ReportDefaultRange;
  defaultSort: { key: string; dir: "asc" | "desc" };
  defaultGroupBy: string | null;
  footnote: string | null;
  columns: ReportColumn[];
  /**
   * Column keys that can be a dashboard METRIC — aggregatable, or a ratio the
   * engine re-derives. Sent by the server so the tile builder can only offer a
   * choice that renders; a label column on a number card is an empty box.
   */
  metrics: string[];
  dimensions: ReportDimension[];
  filters: ReportFilterDef[];
}

export interface ReportCatalog {
  /**
   * The IANA zone every report window is measured in —
   * `organization.timeZone → the viewer's browser → UTC`, resolved server-side.
   * Read it through `useReportTimeZone()` rather than picking a zone locally.
   */
  timeZone: string;
  categories: { key: ReportCategoryKey; label: string }[];
  reports: ReportMeta[];
}

export interface ReportFilterInput {
  key: string;
  operator: ReportFilterOperator;
  value?: unknown;
}

/** Everything a saved view stores, and everything `/run` needs besides the id. */
export interface ReportConfig {
  columns?: string[];
  filters?: ReportFilterInput[];
  groupBy?: string | null;
  sort?: { key: string; dir: "asc" | "desc" };
  /** A relative window, so a saved view stays useful next month. */
  range?: ReportDefaultRange | { startDate: string; endDate: string };
}

export interface ReportRunRequest extends ReportConfig {
  reportId: string;
  startDate: string;
  endDate: string;
  page?: number;
  pageSize?: number;
}

export type ReportRow = Record<string, unknown> & {
  /** How many records a grouped row stands for. */
  __count?: number;
};

export interface ReportRunResult {
  reportId: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow;
  groupBy: string | null;
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------- overview

export type CompareMode = "previous" | "lastYear" | "none";

/**
 * A KPI tile.
 *
 * It carries the report and filters it was computed from, so clicking it opens
 * the report showing the same number — the tile and the table are one execution
 * path on the server, not two that have to be kept in agreement.
 */
export interface OverviewTile {
  key: string;
  label: string;
  hint: string;
  reportId: string;
  column: string;
  icon: string;
  betterWhen?: "higher" | "lower";
  filters?: ReportFilterInput[];
  /** In the column's own unit — cents, deci-hours, 0..1. */
  value: number | null;
  previous: number | null;
  /** Fractional change; null when there was no baseline worth comparing to. */
  delta: number | null;
}

export interface OverviewAttention {
  key: string;
  label: string;
  hint: string;
  reportId: string;
  filters: ReportFilterInput[];
  tone: "danger" | "warning" | "info";
  count: number;
}

export interface OverviewTrend {
  key: string;
  label: string;
  reportId: string;
  unit: "hours" | "money";
  series: { key: string; label: string }[];
  /**
   * One entry per day that had activity; quiet days are absent, not zero.
   * `date` is an ISO day; every other key is a series value in the unit above.
   */
  points: Record<string, string | number | null>[];
}

export interface ReportOverview {
  range: { startDate: string; endDate: string };
  comparison: { startDate: string; endDate: string; mode: CompareMode } | null;
  tiles: OverviewTile[];
  attention: OverviewAttention[];
  trends: OverviewTrend[];
}

export interface SavedReportView {
  id: number;
  name: string;
  reportId: string;
  config: ReportConfig;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  /** Whether this caller may rename, re-save or delete it. */
  isMine: boolean;
}
