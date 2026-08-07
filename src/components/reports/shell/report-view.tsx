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

import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "@/components/billing/date-range-picker";
import { DocsHint } from "@/components/docs-hint";
import { downloadReport, useReportRun, useReportTimeZone } from "@/features/reports";
import { rangeToIso, resolveRange } from "@/lib/report-format";
import { reportDocShot } from "@/lib/docs-shots";
import { formatMoney } from "@/lib/utils";
import type {
  ReportConfig,
  ReportFilterInput,
  ReportMeta,
  ReportRow,
  ReportRunRequest,
  SavedReportView,
} from "@/types/reports";
import type { Invoice, Reservation } from "@/types/api";
import { useRemindInvoice, useUpdateInvoice } from "@/features/queries";
import { useConfirm } from "@/components/confirm-dialog";
import { InvoiceDetailSheet } from "@/components/billing/invoice-detail-sheet";
import { ReservationDetailSheet } from "@/components/schedule/reservation-detail-sheet";
import { CancelReservationDialog } from "@/components/schedule/cancel-reservation-dialog";
import { ReservationForm } from "@/components/schedule/reservation-form";
import { useReservationDetail } from "@/components/schedule/use-reservation-detail";
import { isCompleteFilter } from "./filter-builder";
import { ReportTable } from "./report-table";
import { SavedViews } from "./saved-views";
import { ActiveFilterChips, ReportViewMenu } from "./view-menu";

const PAGE_SIZE = 100;

function defaultConfig(report: ReportMeta, filters?: ReportFilterInput[]): ReportConfig {
  return {
    columns: report.columns.filter((c) => c.default !== false).map((c) => c.key),
    filters: filters ?? [],
    // A deep link arrives with the question already asked ("which flights were
    // never invoiced"), so it lands on the rows rather than on a grouped summary
    // the reader then has to expand.
    groupBy: filters?.length ? null : report.defaultGroupBy,
    sort: report.defaultSort,
    range: report.defaultRange,
  };
}

export function ReportView({
  report,
  initialFilters,
  initialRange,
  onPinned,
}: {
  report: ReportMeta;
  /** Seeded by an Overview tile or attention item. */
  initialFilters?: ReportFilterInput[];
  /** The window the Overview was showing, so the number carries across. */
  initialRange?: DateRange;
  /** Show the dashboard a pinned tile just landed on. */
  onPinned?: () => void;
}) {
  // Every window on this page is measured on the school's clock, not the
  // browser's — see `lib/report-format.ts`.
  const timeZone = useReportTimeZone();

  const [config, setConfig] = useState<ReportConfig>(() => defaultConfig(report, initialFilters));
  const [range, setRange] = useState<DateRange | undefined>(
    () => initialRange ?? resolveRange(report.defaultRange, timeZone)
  );
  const [page, setPage] = useState(1);
  const [activeViewId, setActiveViewId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [reservationId, setReservationId] = useState<number | null>(null);

  const confirm = useConfirm();
  const updateInvoice = useUpdateInvoice();
  const remindInvoiceMut = useRemindInvoice();

  // No reset effect: the caller keys this component on the report (and on the
  // deep link), so switching reports remounts it and the initial state above IS
  // the reset. An effect here would additionally have to avoid clobbering a
  // seeded deep link on its first run — a reset that only exists because the
  // component was kept alive unnecessarily.

  const iso = rangeToIso(range, timeZone);

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

  // Stub list so ↑/↓ can walk the page's bookings without a second fetch.
  const reservationList = useMemo(
    () =>
      rows
        .map((r) => r.reservationId)
        .filter((id): id is number => typeof id === "number")
        .map((id) => ({ id }) as Reservation),
    [rows]
  );

  const {
    detail: reservation,
    open: reservationOpen,
    setOpen: setReservationOpen,
    step: stepReservation,
    cancelReservation,
    editing,
    setEditing,
    startEdit,
    cancelDialog,
  } = useReservationDetail(reservationList, {
    selectedId: reservationId,
    setSelectedId: setReservationId,
  });

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
    if (typeof saved === "string") setRange(resolveRange(saved, timeZone));
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

  const openRow = (row: ReportRow) => {
    if (typeof row.invoiceId === "number") {
      setReservationId(null);
      setInvoiceId(row.invoiceId);
      return;
    }
    if (typeof row.reservationId === "number") {
      setInvoiceId(null);
      setReservationId(row.reservationId);
    }
  };

  const invoiceIds = useMemo(
    () =>
      rows
        .map((r) => r.invoiceId)
        .filter((id): id is number => typeof id === "number"),
    [rows]
  );

  function stepInvoice(delta: -1 | 1) {
    if (invoiceId == null || invoiceIds.length === 0) return;
    const i = invoiceIds.indexOf(invoiceId);
    if (i === -1) return;
    const next = invoiceIds[Math.min(invoiceIds.length - 1, Math.max(0, i + delta))];
    if (next != null) setInvoiceId(next);
  }

  function markPaid(inv: Invoice) {
    updateInvoice.mutate(
      { id: inv.id, patch: { markPaid: true } },
      {
        onSuccess: (res) =>
          res.warning
            ? toast.warning(res.warning, { duration: 8000 })
            : toast.success(`Invoice #${inv.id} marked paid`),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Couldn't update invoice"),
      }
    );
  }

  async function voidInvoice(inv: Invoice) {
    const ok = await confirm({
      title: `Void invoice #${inv.id}?`,
      description: `This marks the ${formatMoney(inv.total)} invoice as void. This can't be undone.`,
      confirmLabel: "Void invoice",
      destructive: true,
    });
    if (!ok) return;
    updateInvoice.mutate(
      { id: inv.id, patch: { markVoided: true } },
      {
        onSuccess: (res) =>
          res.warning
            ? toast.warning(res.warning, { duration: 8000 })
            : toast.success(`Invoice #${inv.id} voided`),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Couldn't void invoice"),
      }
    );
  }

  function sendReminder(inv: Invoice) {
    remindInvoiceMut.mutate(inv.id, {
      onSuccess: () => toast.success(`Reminder sent for invoice #${inv.id}`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't send reminder"),
    });
  }

  return (
    // A column bounded by the page: title, toolbar and pager are fixed, and the
    // rows are the only thing that scrolls — see `components/table-view.tsx`.
    //
    // `min-w-0` on every box between here and the table matters as much as
    // `min-h-0`: a flex item's automatic minimum size is its CONTENT's, so a
    // wide report would otherwise push this column past the viewport and scroll
    // the whole page sideways instead of scrolling inside the card.
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      data-doc-shot={reportDocShot(report.id, "frame")}
    >
      <div className="shrink-0 space-y-3" data-doc-shot="report-toolbar-export">
        {/* On a phone the rail is a select showing this report's name, so
            repeating it here costs a line of the little height there is — and
            the description is clamped for the same reason. */}
        <div>
          <h2 className="hidden text-lg font-semibold lg:block">{report.name}</h2>
          <p className="line-clamp-2 text-sm text-muted-foreground lg:line-clamp-none">
            {report.description}
          </p>
        </div>

        {/* One row of controls: the window and how it's narrowed on the left, what you do
            with the answer on the right. Every control is a direct child of that row so they
            all align on it.

            The date basis caption is NOT in this row. It used to sit in a wrapper with the
            picker, which made that wrapper as wide as the LONGER of the two — so a lengthy
            basis ("by close-out date") widened the box and shoved the Filters button away
            from the picker. How far it moved depended on the report, which is why the
            toolbar looked subtly different on each one. It gets its own line below instead,
            where it can say anything without moving a control. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <ReportViewMenu report={report} config={config} onChange={update} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SavedViews
              report={report}
              config={{ ...config, range: range ? rangeToIso(range, timeZone) ?? undefined : undefined }}
              activeViewId={activeViewId}
              onApply={applyView}
              onPinned={onPinned}
            />
            <DocsHint topic="saved-view-dates" />

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

        {/* Still a caption for the picker above it — just on a line of its own. */}
        <p className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
          by {report.dateBasis}
          <DocsHint topic="report-date-basis" />
        </p>

        <ActiveFilterChips
          report={report}
          filters={config.filters ?? []}
          onChange={(filters) => update({ filters })}
        />
      </div>

      <Card
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
        data-doc-shot={reportDocShot(report.id, "results")}
      >
        {run.isError ? (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
            {(run.error as Error)?.message ?? "Could not run this report."}
          </div>
        ) : run.isLoading && !result ? (
          // Explicit height too — a contentless flex-1 box measures zero once the
          // page stops being bounded (below md), and the skeleton disappears.
          <div className="m-6 min-h-48 flex-1 animate-pulse rounded-md bg-muted md:min-h-0" />
        ) : rows.length === 0 ? (
          <div className="grid flex-1 place-items-center px-6 text-center text-sm text-muted-foreground">
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
            onRowClick={result?.groupBy ? undefined : openRow}
            loading={run.isFetching}
          />
        )}
      </Card>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
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

      <InvoiceDetailSheet
        invoice={null}
        invoiceId={invoiceId}
        open={invoiceId != null}
        onOpenChange={(o) => !o && setInvoiceId(null)}
        onMarkPaid={markPaid}
        onVoid={voidInvoice}
        onRemind={sendReminder}
        onStep={stepInvoice}
        busy={updateInvoice.isPending || remindInvoiceMut.isPending}
      />

      <CancelReservationDialog {...cancelDialog} />

      <ReservationDetailSheet
        reservation={reservation}
        open={reservationOpen}
        onOpenChange={setReservationOpen}
        onCancel={cancelReservation}
        onEdit={startEdit}
        onStep={stepReservation}
      />

      {editing && (
        <ReservationForm
          open
          onOpenChange={(o) => !o && setEditing(null)}
          draft={{ date: new Date(editing.start) }}
          editing={editing}
        />
      )}
    </div>
  );
}
