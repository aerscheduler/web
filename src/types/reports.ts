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
  dimensions: ReportDimension[];
  filters: ReportFilterDef[];
}

export interface ReportCatalog {
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
