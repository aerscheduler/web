/**
 * One component renders every report.
 *
 * It knows about columns, filters, dimensions and totals in the abstract, and
 * about no particular report at all. That is what makes the registry pay off: a
 * report added on the server arrives here with a working column picker, filter
 * builder, grouping, sorting, paging, saved views and CSV export, and nobody
 * touches this file.
 *
 * Configuration lives in one `ReportConfig` object because that is exactly what
 * a saved view stores and what `/run` accepts — so "save this" is `setConfig`'s
 * current value, with no translation layer to get out of step.
 */

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Download, Group, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePicker } from "@/components/billing/date-range-picker";
import { downloadReport, useReportRun } from "@/features/reports";
import { rangeToIso, resolveRange } from "@/lib/report-format";
import type {
  ReportConfig,
  ReportMeta,
  ReportRunRequest,
  SavedReportView,
} from "@/types/reports";
import { ColumnPicker } from "./column-picker";
import { FilterBuilder, isCompleteFilter } from "./filter-builder";
import { ReportTable } from "./report-table";
import { SavedViews } from "./saved-views";

const PAGE_SIZE = 100;
/** The sentinel for "no grouping" — a Radix Select item cannot have an empty value. */
const NO_GROUP = "__none__";

function defaultConfig(report: ReportMeta): ReportConfig {
  return {
    columns: report.columns.filter((c) => c.default !== false).map((c) => c.key),
    filters: [],
    groupBy: report.defaultGroupBy,
    sort: report.defaultSort,
    range: report.defaultRange,
  };
}

export function ReportView({ report }: { report: ReportMeta }) {
  const [config, setConfig] = useState<ReportConfig>(() => defaultConfig(report));
  const [range, setRange] = useState<DateRange | undefined>(() => resolveRange(report.defaultRange));
  const [page, setPage] = useState(1);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  // Switching reports resets everything — carrying a filter or a sort key across
  // reports would silently drop it (the keys don't exist on the new report) and
  // look like the console had forgotten what you asked for.
  useEffect(() => {
    setConfig(defaultConfig(report));
    setRange(resolveRange(report.defaultRange));
    setPage(1);
    setActiveViewId(null);
  }, [report.id]);

  const iso = rangeToIso(range);

  // A filter you have added but not yet filled in must not narrow anything —
  // see `isCompleteFilter`. The row stays on screen; it just isn't sent yet.
  const activeFilters = useMemo(
    () => (config.filters ?? []).filter(isCompleteFilter),
    [config.filters]
  );

  const request: ReportRunRequest | null = useMemo(
    () =>
      iso
        ? {
            reportId: report.id,
            startDate: iso.startDate,
            endDate: iso.endDate,
            columns: config.columns,
            filters: activeFilters,
            groupBy: config.groupBy ?? null,
            sort: config.sort,
            page,
            pageSize: PAGE_SIZE,
          }
        : null,
    [report.id, iso?.startDate, iso?.endDate, config.columns, config.groupBy, config.sort, activeFilters, page]
  );

  const run = useReportRun(request);
  const result = run.data;

  const sort = config.sort ?? report.defaultSort;
  const rows = result?.rows ?? [];
  const totalRows = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const update = (patch: Partial<ReportConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    // Any change to what's being asked invalidates the page you were on.
    setPage(1);
  };

  const toggleSort = (key: string) => {
    update({
      sort:
        sort.key === key
          ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
          : // A new column starts descending for measures and ascending for
            // labels, which is what people mean by "sort by this" in each case.
            { key, dir: report.columns.find((c) => c.key === key)?.aggregate ? "desc" : "asc" },
    });
  };

  const applyView = (view: SavedReportView | null) => {
    if (!view) {
      setActiveViewId(null);
      return;
    }
    setActiveViewId(view.id);
    setConfig({ ...defaultConfig(report), ...view.config });
    // A saved relative range ("month to date") is re-resolved rather than
    // restored as fixed dates, so the view still means something next month.
    const saved = view.config.range;
    if (typeof saved === "string") setRange(resolveRange(saved));
    else if (saved) setRange({ from: new Date(saved.startDate), to: new Date(saved.endDate) });
    setPage(1);
  };

  const exportCsv = async () => {
    if (!request) return;
    setExporting(true);
    try {
      await downloadReport(request);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not export the report");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{report.name}</h2>
        <p className="text-sm text-muted-foreground">{report.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <span className="text-xs text-muted-foreground">by {report.dateBasis}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {report.dimensions.length > 0 && (
            <Select
              value={config.groupBy ?? NO_GROUP}
              onValueChange={(v) => update({ groupBy: v === NO_GROUP ? null : v })}
            >
              <SelectTrigger className="h-8 w-auto min-w-[10rem] gap-2 text-sm">
                <Group className="size-4 shrink-0 opacity-70" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GROUP}>No grouping</SelectItem>
                {report.dimensions.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    Group by {d.label.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <ColumnPicker
            columns={report.columns}
            selected={config.columns ?? []}
            onChange={(columns) => update({ columns })}
          />

          <SavedViews
            reportId={report.id}
            filterDefs={report.filters}
            config={{ ...config, range: range ? rangeToIso(range) ?? undefined : undefined }}
            activeViewId={activeViewId}
            onApply={applyView}
          />

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={exportCsv}
            disabled={exporting || !request || totalRows === 0}
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export
          </Button>
        </div>
      </div>

      <FilterBuilder
        definitions={report.filters}
        filters={config.filters ?? []}
        onChange={(filters) => update({ filters })}
      />

      <Card className="overflow-hidden p-0">
        <CardContent className="p-0">
          {run.isError ? (
            <div className="grid h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
              {(run.error as Error)?.message ?? "Could not run this report."}
            </div>
          ) : run.isLoading && !result ? (
            <div className="m-6 h-48 animate-pulse rounded-md bg-muted" />
          ) : rows.length === 0 ? (
            <div className="grid h-48 place-items-center px-6 text-center text-sm text-muted-foreground">
              Nothing matched. Try a wider date range
              {activeFilters.length > 0 ? " or fewer filters." : "."}
            </div>
          ) : (
            <ReportTable
              columns={result?.columns ?? []}
              rows={rows}
              totals={result?.totals}
              grouped={!!result?.groupBy}
              sort={sort}
              onSort={toggleSort}
              loading={run.isFetching}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {totalRows > 0 && (
            <>
              {result?.groupBy ? `${totalRows} groups` : `${totalRows} rows`}
              {pages > 1 && ` · page ${page} of ${pages}`}
              {" · "}
            </>
          )}
          {report.footnote}
        </p>

        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || run.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages || run.isFetching}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
