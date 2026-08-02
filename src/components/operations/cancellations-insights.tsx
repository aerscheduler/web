import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, CalendarX2, Clock, Download, Percent } from "lucide-react";
import { useCancellationCategories, useCancellationReport } from "@/features/queries";
import {
  cancelledForLabel,
  cancelledResourceLabel,
  type CancelledReservation,
} from "@/types/api";
import { downloadCsv, reportFilename } from "@/lib/csv";
import { asFacetStrings } from "@/lib/list-query-state";
import { useClientPage, usePaging } from "@/lib/paging";
import type { ListFilterValues } from "@/components/list-filters";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { type FacetDef } from "@/components/list-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function rowSearchText(row: CancelledReservation): string {
  return [
    row.title,
    row.cancellationReason,
    row.categoryLabel,
    cancelledResourceLabel(row.resource),
    cancelledForLabel(row),
    row.cancelledBy?.user?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFilters(
  row: CancelledReservation,
  q: string,
  categoryValues: string[],
  notice: string
): boolean {
  if (categoryValues.length) {
    const key = row.cancellationCategory ?? "__none__";
    if (!categoryValues.includes(key)) return false;
  }
  if (notice === "late" && !row.isLate) return false;
  if (notice === "on_time" && row.isLate) return false;
  if (q && !rowSearchText(row).includes(q.toLowerCase())) return false;
  return true;
}

function summaryFromRows(
  rows: CancelledReservation[],
  totalInWindow: number,
  lateWithinHours: number
) {
  const byCategory: Record<string, { value: string; label: string; count: number; late: number }> =
    {};
  let lateTotal = 0;

  for (const row of rows) {
    const key = row.cancellationCategory ?? "__none__";
    if (!byCategory[key]) {
      byCategory[key] = {
        value: key,
        label: row.categoryLabel,
        count: 0,
        late: 0,
      };
    }
    byCategory[key].count += 1;
    if (row.isLate) {
      byCategory[key].late += 1;
      lateTotal += 1;
    }
  }

  return {
    total: rows.length,
    totalInWindow,
    rate: totalInWindow > 0 ? rows.length / totalInWindow : 0,
    late: lateTotal,
    lateWithinHours,
    byCategory: Object.values(byCategory),
  };
}

export const CANCELLATION_TABLE_COLUMNS: ColumnDef<CancelledReservation, unknown>[] = [
  {
    id: "start",
    header: "When",
    accessorFn: (r) => r.start,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {format(parseISO(row.original.start), "MMM d, yyyy · HH:mm")}
      </span>
    ),
  },
  {
    id: "resource",
    header: "Resource",
    accessorFn: (r) => cancelledResourceLabel(r.resource),
    cell: ({ row }) => (
      <span className="whitespace-nowrap">{cancelledResourceLabel(row.original.resource)}</span>
    ),
  },
  {
    id: "for",
    header: "For",
    accessorFn: (r) => cancelledForLabel(r),
    cell: ({ row }) => (
      <span className="max-w-[10rem] truncate">{cancelledForLabel(row.original)}</span>
    ),
  },
  {
    id: "category",
    header: "Reason type",
    accessorFn: (r) => r.categoryLabel,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="truncate">{row.original.categoryLabel}</span>
        {row.original.isLate && (
          <Badge variant="outline" className="shrink-0 text-amber-600 dark:text-amber-500">
            Short notice
          </Badge>
        )}
      </div>
    ),
  },
  {
    id: "note",
    header: "Note",
    accessorFn: (r) => r.cancellationReason ?? "",
    cell: ({ row }) => {
      const note = row.original.cancellationReason?.trim();
      if (!note) return <span className="text-muted-foreground">—</span>;
      return (
        <span className="block max-w-[9rem] truncate text-muted-foreground" title={note}>
          {note}
        </span>
      );
    },
  },
  {
    id: "cancelledBy",
    header: "Cancelled by",
    accessorFn: (r) => r.cancelledBy?.user?.name ?? "",
    cell: ({ row }) => (
      <span className="max-w-[8rem] truncate">{row.original.cancelledBy?.user?.name ?? "—"}</span>
    ),
  },
];

export function useFilteredCancellationReport(
  startDate: string | undefined,
  endDate: string | undefined,
  listQuery?: {
    q: string;
    facets: ListFilterValues;
  }
) {
  const report = useCancellationReport(startDate ?? "", endDate ?? "");
  const allRows = report.data?.cancellations ?? [];
  const baseSummary = report.data?.summary;

  const categoryFilter = listQuery ? asFacetStrings(listQuery.facets.category) : [];
  const noticeFilter =
    listQuery && listQuery.facets.notice === "late"
      ? "late"
      : listQuery && listQuery.facets.notice === "on_time"
        ? "on_time"
        : "";

  const filteredRows = useMemo(() => {
    if (!listQuery) return allRows;
    const q = listQuery.q.trim();
    return allRows.filter((row) => matchesFilters(row, q, categoryFilter, noticeFilter));
  }, [allRows, listQuery, categoryFilter, noticeFilter]);

  const summary = useMemo(() => {
    if (!baseSummary) return undefined;
    if (!listQuery || (!listQuery.q.trim() && !categoryFilter.length && !noticeFilter)) {
      return baseSummary;
    }
    return summaryFromRows(
      filteredRows,
      baseSummary.totalInWindow,
      baseSummary.lateWithinHours
    );
  }, [baseSummary, filteredRows, listQuery, categoryFilter.length, noticeFilter]);

  return { report, allRows, filteredRows, summary };
}

export function CancellationsSummarySection({
  startDate,
  endDate,
  listQuery,
  showExport,
}: {
  startDate: string | undefined;
  endDate: string | undefined;
  listQuery?: { q: string; facets: ListFilterValues };
  showExport?: boolean;
}) {
  const { report, filteredRows, summary } = useFilteredCancellationReport(
    startDate,
    endDate,
    listQuery
  );

  const bars = (summary?.byCategory ?? [])
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...bars.map((b) => b.count));

  const exportCsv = () => {
    downloadCsv(
      reportFilename("cancellations", startDate, endDate),
      [
        { header: "Start", value: (r) => r.start },
        { header: "Resource", value: (r) => cancelledResourceLabel(r.resource) },
        { header: "For", value: (r) => cancelledForLabel(r) },
        { header: "Reason type", value: (r) => r.categoryLabel },
        { header: "Note", value: (r) => r.cancellationReason ?? "" },
        { header: "Short notice", value: (r) => (r.isLate ? "Yes" : "No") },
        { header: "Cancelled by", value: (r) => r.cancelledBy?.user?.name ?? "" },
      ],
      filteredRows
    );
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Cancelled"
          value={String(summary?.total ?? 0)}
          icon={CalendarX2}
          accent={summary?.total ? "warning" : "primary"}
          hint="In selected window"
          loading={report.isLoading}
        />
        <StatCard
          label="Cancellation rate"
          value={`${Math.round((summary?.rate ?? 0) * 100)}%`}
          icon={Percent}
          hint={`of ${summary?.totalInWindow ?? 0} booked`}
          loading={report.isLoading}
        />
        <StatCard
          label="Short notice"
          value={String(summary?.late ?? 0)}
          icon={Clock}
          accent={summary?.late ? "warning" : "primary"}
          hint={`Under ${summary?.lateWithinHours ?? 24}h notice`}
          loading={report.isLoading}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm">By reason type</CardTitle>
          {showExport && filteredRows.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" />
              Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {report.isLoading ? (
            <div className="h-24 animate-pulse rounded-md bg-muted" />
          ) : bars.length === 0 ? (
            <div className="grid h-24 place-items-center text-sm text-muted-foreground">
              Nothing was cancelled in this window.
            </div>
          ) : (
            <div className="space-y-2">
              {bars.map((bar) => (
                <div key={bar.value} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
                  <span className="truncate text-sm" title={bar.label}>
                    {bar.label}
                  </span>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max((bar.count / max) * 100, 4)}%` }}
                    />
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {bar.count}
                    {bar.late > 0 && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-500">
                        {bar.late} late
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Reports overview: stats, chart, link to the full operations page. */
export function CancellationsInsights({
  startDate,
  endDate,
}: {
  startDate: string | undefined;
  endDate: string | undefined;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Cancellations
      </h2>
      <CancellationsSummarySection startDate={startDate} endDate={endDate} />
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link to="/operations/cancellations">
            Open full report
            <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function CancellationsDataTable({
  startDate,
  endDate,
  listQuery,
  onRowClick,
}: {
  startDate: string | undefined;
  endDate: string | undefined;
  listQuery: { q: string; facets: ListFilterValues };
  onRowClick: (row: CancelledReservation) => void;
}) {
  const { report, allRows, filteredRows } = useFilteredCancellationReport(
    startDate,
    endDate,
    listQuery
  );

  // Paged in the browser, unlike every other table here, because this is a
  // report endpoint: it answers one object — the cancellations plus the summary
  // charted above them — rather than a list, so it is not capped at 1,000 rows
  // and the array really is the whole window. See `useClientPage`.
  const paging = usePaging({ resetKey: [startDate, endDate, listQuery] });
  const { rows: pageOfRows, total } = useClientPage(filteredRows, paging);

  return (
    <DataTable
      fill
      columns={CANCELLATION_TABLE_COLUMNS}
      data={pageOfRows}
      paging={paging}
      total={total}
      loading={report.isFetching}
      onRowClick={onRowClick}
      emptyMessage={
        report.isLoading
          ? "Loading…"
          : allRows.length === 0
            ? "Nothing was cancelled in this window."
            : "No cancellations match your filters."
      }
      mobileCard={(row) => (
        <button
          type="button"
          onClick={() => onRowClick(row)}
          className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
        >
          <p className="font-medium">{cancelledResourceLabel(row.resource)}</p>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(row.start), "MMM d · HH:mm")} · {row.categoryLabel}
          </p>
          {row.cancellationReason?.trim() && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.cancellationReason}</p>
          )}
        </button>
      )}
    />
  );
}

/** Facet definitions for the cancellations list (category + short-notice). */
export function useCancellationFacetDefs(): FacetDef[] {
  const categoriesQ = useCancellationCategories();
  return useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "category",
        label: "Reason type",
        allLabel: "All types",
        multiple: true,
        options: [
          ...(categoriesQ.data ?? []).map((c) => ({ value: c.value, label: c.label })),
          { value: "__none__", label: "Not recorded" },
        ],
      },
      {
        kind: "select",
        key: "notice",
        label: "Notice",
        options: [
          { value: "late", label: "Short notice only" },
          { value: "on_time", label: "Adequate notice" },
        ],
      },
    ],
    [categoriesQ.data]
  );
}
