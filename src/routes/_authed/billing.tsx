import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import {
  Ban,
  Check,
  CheckCircle2,
  Eye,
  MoreHorizontal,
  Plane,
  Plus,
  Receipt,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  pageRows,
  useInvoicesPage,
  useInvoiceSummary,
  useRemindInvoice,
  useReservationsPage,
  useUpdateInvoice,
} from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { guardRoute } from "@/lib/permissions";
import type { Invoice, Reservation } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { DateRangePicker, lastNDays } from "@/components/billing/date-range-picker";
import { CreateInvoiceDialog, type InvoiceDraft } from "@/components/billing/create-invoice-dialog";
import { InvoiceDetailSheet } from "@/components/billing/invoice-detail-sheet";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { asFacetStrings, useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { formatDate, formatMoney } from "@/lib/utils";

const FACET_KEYS = ["status", "startDate", "endDate"] as const;

export const Route = createFileRoute("/_authed/billing")({
  beforeLoad: guardRoute("/billing"),
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: BillingPage,
});

type StatusKey = "outstanding" | "paid" | "unbilled";

type InvoiceActions = {
  onView: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
  busy: boolean;
};

const EMPTY_COPY = "No invoices in this range. They draft automatically when a flight ramps in.";

const STATUS_FACETS: FacetDef[] = [
  {
    kind: "select",
    key: "status",
    label: "Status",
    allLabel: "All invoices",
    multiple: true,
    options: [
      { value: "outstanding", label: "Outstanding" },
      { value: "paid", label: "Paid" },
      { value: "unbilled", label: "Unbilled flights" },
    ],
  },
];

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "—";
}

function invoiceColumns(actions: InvoiceActions): ColumnDef<Invoice, unknown>[] {
  return [
    {
      id: "id",
      meta: { sortKey: "id" },
      header: "Invoice #",
      accessorFn: (r) => r.id,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">#{row.original.id}</span>,
    },
    {
      id: "customer",
      meta: { sortKey: "customer.user.name" },
      header: "Customer",
      accessorFn: (r) => r.customer?.user?.name ?? r.customer?.user?.email ?? "",
      cell: ({ row }) => {
        const c = row.original.customer?.user;
        return (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{c?.name ?? "—"}</div>
            {c?.email && <div className="truncate text-xs text-muted-foreground">{c.email}</div>}
          </div>
        );
      },
    },
    {
      id: "created",
      meta: { sortKey: "createdAt" },
      header: "Created",
      accessorFn: (r) => r.createdAt,
      cell: ({ getValue }) => (
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {fmtDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: "due",
      meta: { sortKey: "dueAt" },
      header: "Due",
      accessorFn: (r) => r.dueAt ?? "",
      cell: ({ row }) => (
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {fmtDate(row.original.dueAt)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => invoiceStatus(r).label,
      cell: ({ row }) => <InvoiceStatusBadge invoice={row.original} />,
    },
    {
      id: "total",
      meta: { sortKey: "total", numeric: true },
      header: "Total",
      accessorFn: (r) => r.total,
      cell: ({ getValue }) => (
        <div className="tnum text-right font-medium">{formatMoney(getValue() as number)}</div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => <RowActions inv={row.original} actions={actions} />,
    },
  ];
}

function RowActions({ inv, actions }: { inv: Invoice; actions: InvoiceActions }) {
  const status = invoiceStatus(inv);
  return (
    <div className="text-right">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for invoice #${inv.id}`}
                className="text-muted-foreground"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => actions.onView(inv)}>
            <Eye className="size-4" /> View invoice
          </DropdownMenuItem>
          {status.key === "outstanding" && (
            <>
              <DropdownMenuItem disabled={actions.busy} onClick={() => actions.onMarkPaid(inv)}>
                <Check className="size-4" /> Mark paid
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={actions.busy}
                onClick={() => actions.onVoid(inv)}
              >
                <Ban className="size-4" /> Void
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function InvoiceCard({ inv, actions }: { inv: Invoice; actions: InvoiceActions }) {
  const c = inv.customer?.user;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-sm font-medium">#{inv.id}</div>
          <div className="truncate text-sm text-muted-foreground">{c?.name ?? c?.email ?? "—"}</div>
        </div>
        <InvoiceStatusBadge invoice={inv} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="tnum text-2xl font-semibold tracking-tight">{formatMoney(inv.total)}</div>
          <div className="tnum mt-0.5 text-xs text-muted-foreground">
            Created {fmtDate(inv.createdAt)}
          </div>
        </div>
        <RowActions inv={inv} actions={actions} />
      </div>
    </Card>
  );
}

function unbilledColumns(onBill: (r: Reservation) => void): ColumnDef<Reservation, unknown>[] {
  return [
    {
      id: "flight",
      meta: { sortKey: "title" },
      header: "Flight",
      accessorFn: (r) => r.title,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.original.title}</div>
          <Badge variant="secondary" className="mt-0.5 capitalize">
            {row.original.type}
          </Badge>
        </div>
      ),
    },
    {
      id: "aircraft",
      meta: { sortKey: "resource.type.plane.tailNumber" },
      header: "Aircraft",
      accessorFn: (r) => (r.resource ? resourceLabel(r.resource).name : ""),
      cell: ({ row }) => {
        const r = row.original.resource;
        return (
          <span className="text-sm text-muted-foreground">
            {r ? resourceLabel(r).name : "—"}
          </span>
        );
      },
    },
    {
      id: "flown",
      meta: { sortKey: "end" },
      header: "Flown",
      accessorFn: (r) => r.end,
      cell: ({ getValue }) => (
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(getValue() as string | undefined)}
        </span>
      ),
    },
    {
      id: "action",
      header: "",
      cell: ({ row }) => (
        <div className="text-right">
          <Button variant="outline" size="sm" onClick={() => onBill(row.original)}>
            <Receipt className="size-4" /> Bill
          </Button>
        </div>
      ),
    },
  ];
}

function reservationDraft(r: Reservation): InvoiceDraft {
  const p = r.personnel;
  const payer = p?.renters?.[0] ?? p?.students?.[0];
  return {
    customerId: payer ? String(payer.id) : undefined,
    memo: r.title,
  };
}

function UnbilledCard({ r, onBill }: { r: Reservation; onBill: (r: Reservation) => void }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{r.title}</div>
          <div className="tnum mt-0.5 text-xs text-muted-foreground">
            {format(parseISO(r.end), "MMM d, yyyy")}
            {r.resource ? ` · ${resourceLabel(r.resource).name}` : ""}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => onBill(r)}>
          <Receipt className="size-4" /> Bill
        </Button>
      </div>
    </Card>
  );
}

function BillingPage() {
  const confirm = useConfirm();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "billing",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
  });
  const [viewId, setViewId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<InvoiceDraft | undefined>(undefined);

  const statuses = asFacetStrings(facets.status).filter(
    (s): s is StatusKey => s === "outstanding" || s === "paid" || s === "unbilled"
  );
  const wantsOutstanding = statuses.includes("outstanding");
  const wantsPaid = statuses.includes("paid");
  const wantsUnbilled = statuses.includes("unbilled");
  const showUnbilled = wantsUnbilled;
  const showInvoices = statuses.length === 0 || wantsOutstanding || wantsPaid;

  const paidFilter =
    wantsOutstanding && wantsPaid
      ? undefined
      : wantsOutstanding
        ? false
        : wantsPaid
          ? true
          : undefined;

  const range: DateRange | undefined = useMemo(() => {
    if (typeof facets.startDate === "string" || typeof facets.endDate === "string") {
      return {
        from: typeof facets.startDate === "string" ? parseISO(facets.startDate) : undefined,
        to: typeof facets.endDate === "string" ? parseISO(facets.endDate) : undefined,
      };
    }
    return lastNDays(30);
  }, [facets.startDate, facets.endDate]);

  function setRange(next: DateRange | undefined) {
    setFacets({
      ...facets,
      startDate: next?.from ? startOfDay(next.from).toISOString() : undefined,
      endDate: next?.to
        ? endOfDay(next.to).toISOString()
        : next?.from
          ? endOfDay(next.from).toISOString()
          : undefined,
    });
  }

  const startISO = range?.from ? startOfDay(range.from).toISOString() : undefined;
  const endISO = range?.to
    ? endOfDay(range.to).toISOString()
    : range?.from
      ? endOfDay(range.from).toISOString()
      : undefined;

  // Totals come from the database, not from adding up the rows on screen: the
  // list is one page of at most a few dozen, and even unpaged the API caps at
  // 1,000 — a school with more invoices than that in the range would have been
  // shown the sum of an arbitrary thousand of them.
  // A single instant for "has already flown", so the unbilled query key is
  // stable across a render instead of changing on every millisecond.
  const nowISO = useMemo(() => new Date().toISOString(), [startISO, endISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const statsQ = useInvoiceSummary({ startDate: startISO, endDate: endISO });

  const invoiceFilter = {
    startDate: startISO,
    endDate: endISO,
    q: debouncedQ,
    ...(paidFilter !== undefined ? { paid: paidFilter } : {}),
  };
  const invoicePaging = usePaging({
    resetKey: invoiceFilter,
    defaultSort: { key: "createdAt", dir: "desc" },
  });
  const invoicesQ = useInvoicesPage(invoiceFilter, invoicePaging, { enabled: showInvoices });

  // "Unbilled" is a server filter now. Fetching the window and keeping the rows
  // with no invoice worked only while the whole window arrived at once; against
  // a page it would answer "the unbilled flights on this page".
  const unbilledPaging = usePaging({
    resetKey: [startISO, endISO],
    defaultSort: { key: "end", dir: "desc" },
  });
  const reservationsQ = useReservationsPage(
    startISO ?? "",
    endISO ?? "",
    { uninvoiced: true, endedBefore: nowISO },
    unbilledPaging,
    { enabled: !!startISO && !!endISO && showUnbilled }
  );

  const update = useUpdateInvoice();
  const remind = useRemindInvoice();

  const { rows: invoices, total: invoiceTotal } = pageRows(invoicesQ);
  const { rows: unbilled, total: unbilledTotal } = pageRows(reservationsQ);

  const stats = statsQ.data ?? { revenue: 0, outstanding: 0, paidCount: 0, outstandingCount: 0 };

  const rows = useMemo(() => {
    if (wantsOutstanding && !wantsPaid) return invoices.filter((i) => i.voidedAt == null);
    return invoices;
  }, [invoices, wantsOutstanding, wantsPaid]);

  // Only the page in hand can be resolved locally now, so the sheet falls back
  // to fetching the one it was asked for.
  const viewInvoice = useMemo(
    () => invoices.find((i) => i.id === viewId) ?? null,
    [invoices, viewId]
  );

  function markPaid(inv: Invoice) {
    update.mutate(
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
    update.mutate(
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

  function remindInvoice(inv: Invoice) {
    remind.mutate(inv.id, {
      onSuccess: () => toast.success(`Reminder sent for invoice #${inv.id}`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't send reminder"),
    });
  }

  function billReservation(r: Reservation) {
    setDraft(reservationDraft(r));
    setCreateOpen(true);
  }

  const actions: InvoiceActions = {
    onView: (inv) => setViewId(inv.id),
    onMarkPaid: markPaid,
    onVoid: voidInvoice,
    busy: update.isPending || remind.isPending,
  };

  const columns = useMemo(() => invoiceColumns(actions), [update.isPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const unbilledCols = useMemo(() => unbilledColumns(billReservation), []); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeSubtitle =
    range?.from && range.to
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
      : "Pick a date range";

  const toolbar = (
    <ListSearchBar
      value={search}
      onChange={setSearch}
      placeholder="Search invoices…"
      aria-label="Search invoices"
      facets={STATUS_FACETS}
      filterValues={facets}
      onFilterChange={setFacets}
      showSearch={showInvoices}
    />
  );

  function renderInvoiceTable(emptyMessage: string) {
    if (invoicesQ.isLoading)
      return (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={6} />
        </Card>
      );
    if (invoicesQ.isError)
      return (
        <Card className="min-h-0 flex-1">
          <ErrorState error={invoicesQ.error} onRetry={() => invoicesQ.refetch()} />
        </Card>
      );
    if (invoiceTotal === 0 && !debouncedQ && statuses.length === 0)
      return (
        <Card className="min-h-0 flex-1">
          <EmptyState icon={Receipt} title="No invoices yet" body={EMPTY_COPY} />
        </Card>
      );
    return (
      <DataTable
        fill
        columns={columns}
        data={rows}
        paging={invoicePaging}
        total={invoiceTotal}
        loading={invoicesQ.isFetching}
        mobileCard={(inv) => <InvoiceCard inv={inv} actions={actions} />}
        emptyMessage={emptyMessage}
      />
    );
  }

  function renderUnbilled() {
    if (reservationsQ.isPending)
      return (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={6} cols={4} />
        </Card>
      );
    if (reservationsQ.isError)
      return (
        <Card className="min-h-0 flex-1">
          <ErrorState error={reservationsQ.error} onRetry={() => reservationsQ.refetch()} />
        </Card>
      );
    if (unbilledTotal === 0)
      return (
        <Card className="min-h-0 flex-1">
          <EmptyState
            icon={CheckCircle2}
            title="All flights billed"
            body="Every past flight in this range already has an invoice."
          />
        </Card>
      );
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="shrink-0 text-sm text-muted-foreground">
          {unbilledTotal.toLocaleString()} past{" "}
          {unbilledTotal === 1 ? "flight hasn't" : "flights haven't"} been billed yet.
        </p>
        <DataTable
          fill
          columns={unbilledCols}
          data={unbilled}
          paging={unbilledPaging}
          total={unbilledTotal}
          loading={reservationsQ.isFetching}
          mobileCard={(r) => <UnbilledCard r={r} onBill={billReservation} />}
          emptyMessage="No unbilled flights."
        />
      </div>
    );
  }

  const emptyByStatus =
    wantsOutstanding && !wantsPaid
      ? "Nothing outstanding — you're all paid up."
      : wantsPaid && !wantsOutstanding
        ? "No paid invoices in this range yet."
        : "No invoices match your filters.";

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Billing"
          subtitle={`Invoices · ${rangeSubtitle}`}
          actions={
            <div className="flex items-center gap-2">
              <DateRangePicker value={range} onChange={setRange} />
              <Button
                onClick={() => {
                  setDraft(undefined);
                  setCreateOpen(true);
                }}
              >
                <Plus className="size-4" /> New invoice
              </Button>
            </div>
          }
        />

        {statsQ.isPending ? (
          <StatSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Revenue"
              value={formatMoney(stats.revenue, { cents: false })}
              icon={TrendingUp}
              accent="success"
              hint="Paid invoices in range"
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(stats.outstanding, { cents: false })}
              icon={Wallet}
              accent="warning"
              hint="Unpaid, not voided"
            />
            <StatCard
              label="Paid"
              value={stats.paidCount}
              icon={CheckCircle2}
              hint="Invoices settled"
            />
            <StatCard
              label="Unbilled flights"
              value={unbilled.length}
              icon={Plane}
              accent="warning"
              loading={reservationsQ.isLoading}
              hint="Past flights, no invoice"
            />
          </div>
        )}

        {toolbar}
      </TableView.Header>

      {showInvoices && showUnbilled ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderInvoiceTable(emptyByStatus)}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderUnbilled()}
          </div>
        </div>
      ) : showUnbilled ? (
        renderUnbilled()
      ) : (
        renderInvoiceTable(emptyByStatus)
      )}

      <InvoiceDetailSheet
        invoice={viewInvoice}
        open={viewId != null}
        onOpenChange={(o) => !o && setViewId(null)}
        onMarkPaid={markPaid}
        onVoid={voidInvoice}
        onRemind={remindInvoice}
        busy={update.isPending || remind.isPending}
      />

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} draft={draft} />
    </TableView>
  );
}
