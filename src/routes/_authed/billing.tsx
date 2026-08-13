import { useEffect, useMemo, useState } from "react";
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
  useOrgLedgerSettings,
  useRemindInvoice,
  useReservationsPage,
  useUpdateInvoice,
} from "@/features/queries";
import { useBillReservation } from "@/features/billing-mutations";
import { useVoidInvoiceFlow } from "@/features/void-invoice-flow";
import { usePaging } from "@/lib/paging";
import { guardRoute } from "@/lib/permissions";
import type { Invoice, Reservation } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { DocsHint } from "@/components/docs-hint";
import { StatCard, StatGrid } from "@/components/stat-card";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { DateRangePicker, lastNDays } from "@/components/billing/date-range-picker";
import { hasLiveBill } from "@/components/schedule/close-out";
import { CreateInvoiceDialog } from "@/components/billing/create-invoice-dialog";
import { InvoiceDetailSheet } from "@/components/billing/invoice-detail-sheet";
import { VoidInvoiceDialog } from "@/components/billing/void-invoice-dialog";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { LedgerAccountsTable } from "@/components/billing/ledger-accounts-table";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
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

const LEDGER_BILLING_RAIL = [
  {
    items: [
      { value: "accounts", label: "Accounts", icon: Wallet },
      { value: "invoices", label: "Invoices", icon: Receipt },
    ],
  },
];

export const Route = createFileRoute("/_authed/billing")({
  beforeLoad: guardRoute("/billing"),
  /**
   * `invoice` is which record the detail panel is showing. It rides in the URL
   * rather than in component state so the panel survives a refresh and can be
   * linked to, and it is kept OUT of the facet list on purpose. Facets are
   * remembered in localStorage and restored on the next visit, which would
   * reopen a stale invoice days later.
   */
  validateSearch: (s) => {
    const list = validateListSearch(s, [...FACET_KEYS]);
    // Kept as a NUMBER, not a string: the router JSON-encodes string values, so
    // a string id serializes as `?invoice=%225978%22`: unreadable, and not what
    // anyone would type by hand.
    const invoice = Number.parseInt(String(s.invoice ?? ""), 10);
    const pane = s.pane === "invoices" || s.pane === "accounts" ? s.pane : undefined;
    return {
      ...list,
      ...(Number.isFinite(invoice) ? { invoice } : {}),
      ...(pane ? { pane } : {}),
    };
  },
  component: BillingPage,
});

type StatusKey = "outstanding" | "paid" | "unbilled";

type InvoiceActions = {
  onView: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
  busy: boolean;
};

const EMPTY_COPY = "No invoices in this range. They draft automatically when a reservation ramps in.";

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
      { value: "unbilled", label: "Unbilled reservations" },
    ],
  },
];

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "–";
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
            <div className="truncate text-sm font-medium">{c?.name ?? "–"}</div>
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
          <div className="truncate text-sm text-muted-foreground">{c?.name ?? c?.email ?? "–"}</div>
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

function unbilledColumns(
  onBill: (r: Reservation) => void,
  billing: boolean
): ColumnDef<Reservation, unknown>[] {
  return [
    {
      id: "reservation",
      meta: { sortKey: "title" },
      header: "Reservation",
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
            {r ? resourceLabel(r).name : "–"}
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
          <Button
            variant="outline"
            size="sm"
            disabled={billing}
            onClick={() => onBill(row.original)}
          >
            <Receipt className="size-4" /> Bill
          </Button>
        </div>
      ),
    },
  ];
}

function UnbilledCard({
  r,
  onBill,
  billing,
}: {
  r: Reservation;
  onBill: (r: Reservation) => void;
  billing: boolean;
}) {
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
        <Button variant="outline" size="sm" disabled={billing} onClick={() => onBill(r)}>
          <Receipt className="size-4" /> Bill
        </Button>
      </div>
    </Card>
  );
}

function BillingPage() {
  const confirm = useConfirm();
  const ledgerQ = useOrgLedgerSettings();
  const ledgerOn = ledgerQ.data?.enabled === true;
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const accountsPane = ledgerOn && routeSearch.pane !== "invoices";
  // One loosely-typed navigate for every search-param update on this page, the
  // same cast `useListQueryState` already needs for its own reducers.
  const navigateSearch = navigate as Parameters<typeof useListQueryState>[0]["navigate"];
  // `invoice` is which record is open, not a list filter, it is split off here so
  // it never reaches the facet machinery (which is string-valued, and which would
  // also persist it to localStorage and reopen it on a later visit).
  const { invoice: _openInvoice, ...listSearch } = routeSearch;
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "billing",
    search: listSearch,
    navigate: navigateSearch,
    facetKeys: [...FACET_KEYS],
  });

  /** Which invoice the detail panel is showing, read straight off the URL. */
  const viewId = useMemo(() => {
    const n = Number.parseInt(String(routeSearch.invoice ?? ""), 10);
    return Number.isFinite(n) ? n : null;
  }, [routeSearch.invoice]);

  // `replace`, always: stepping through invoices with ↑/↓ would otherwise stack a
  // history entry per record, and Back would then walk the panel backwards one
  // invoice at a time instead of leaving Billing.
  function setViewId(id: number | null) {
    navigateSearch({
      search: ({ invoice: _drop, ...rest }: Record<string, unknown>) =>
        id == null ? rest : { ...rest, invoice: id },
      replace: true,
    });
  }

  function setPane(next: "accounts" | "invoices") {
    navigateSearch({
      search: ({ pane: _drop, invoice: _inv, ...rest }: Record<string, unknown>) =>
        next === "accounts" ? rest : { ...rest, pane: "invoices" },
      replace: true,
    });
  }

  const [createOpen, setCreateOpen] = useState(false);

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
  // 1,000, a school with more invoices than that in the range would have been
  // shown the sum of an arbitrary thousand of them.
  // A single instant for "has already flown", so the unbilled query key is
  // stable across a render instead of changing on every millisecond.
  const nowISO = useMemo(() => new Date().toISOString(), [startISO, endISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const statsQ = useInvoiceSummary(
    { startDate: startISO, endDate: endISO },
    { enabled: !accountsPane }
  );

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
  const invoicesQ = useInvoicesPage(invoiceFilter, invoicePaging, {
    enabled: showInvoices && !accountsPane,
  });

  // "Unbilled" is a server filter now. Fetching the window and keeping the rows
  // with no invoice worked only while the whole window arrived at once; against
  // a page it would answer "the unbilled reservations on this page".
  const unbilledPaging = usePaging({
    resetKey: [startISO, endISO],
    defaultSort: { key: "end", dir: "desc" },
  });
  const reservationsQ = useReservationsPage(
    startISO ?? "",
    endISO ?? "",
    { uninvoiced: true, endedBefore: nowISO },
    unbilledPaging,
    { enabled: !!startISO && !!endISO && showUnbilled && !accountsPane }
  );

  const update = useUpdateInvoice();
  const remind = useRemindInvoice();
  const bill = useBillReservation();
  const voidFlow = useVoidInvoiceFlow();

  const { rows: invoices, total: invoiceTotal } = pageRows(invoicesQ);
  // Defense: even if an older API still returns ledger-staked rows under
  // `uninvoiced`, do not list flights that already have a live flight_charge.
  const { rows: unbilledRaw, total: unbilledTotalRaw } = pageRows(reservationsQ);
  const unbilled = useMemo(
    () => unbilledRaw.filter((r) => !hasLiveBill(r)),
    [unbilledRaw]
  );
  const unbilledTotal =
    unbilled.length === unbilledRaw.length
      ? unbilledTotalRaw
      : Math.max(0, unbilledTotalRaw - (unbilledRaw.length - unbilled.length));

  const stats = statsQ.data ?? { revenue: 0, outstanding: 0, paidCount: 0, outstandingCount: 0 };

  const rows = useMemo(() => {
    if (wantsOutstanding && !wantsPaid) return invoices.filter((i) => i.voidedAt == null);
    return invoices;
  }, [invoices, wantsOutstanding, wantsPaid]);

  // Only the page in hand can be resolved locally now, so the panel falls back
  // to fetching the one it was asked for.
  const viewInvoice = useMemo(
    () => invoices.find((i) => i.id === viewId) ?? null,
    [invoices, viewId]
  );

  /**
   * ↑/↓ to the neighbouring invoice, over `rows`: what is actually drawn, not
   * the unfiltered page, so the panel never lands on a row that isn't there.
   * Stops at the ends rather than wrapping or paging: silently jumping to
   * another page would move the list out from under the highlight.
   */
  function stepInvoice(delta: -1 | 1) {
    const i = rows.findIndex((r) => r.id === viewId);
    if (i < 0) return;
    const next = rows[i + delta];
    if (next) setViewId(next.id);
  }

  // Keep the highlighted row on screen when the keyboard moved it. `nearest`
  // scrolls only when the row has actually left the viewport, so clicking a row
  // that is already visible doesn't jolt the table.
  useEffect(() => {
    if (viewId == null) return;
    const row = document.querySelector<HTMLElement>("tr[data-selected]");
    row?.scrollIntoView({ block: "nearest" });
  }, [viewId]);

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

  function remindInvoice(inv: Invoice) {
    remind.mutate(inv.id, {
      onSuccess: () => toast.success(`Reminder sent for invoice #${inv.id}`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't send reminder"),
    });
  }

  /**
   * Invoice the reservation from its own figures.
   *
   * This used to open the manual New invoice dialog prefilled with a customer and the
   * booking's title as a memo: no line items, no hours, no reservation link. Pressing Bill
   * and saving produced a $0 invoice attached to nothing, the flight stayed unbilled and
   * still sat in this list, and the money never reached resource revenue. It now calls the
   * endpoint that actually prices the booking.
   *
   * Confirmed first, because it charges people: on a shared booking this raises one Stripe
   * invoice per payer, and there is no undo beyond voiding each one.
   */
  async function billReservation(r: Reservation) {
    const ok = await confirm({
      title: `Bill "${r.title}"?`,
      description:
        "This prices the booking from its recorded times and rates, and raises an invoice for everyone who owes a share.",
      confirmLabel: "Bill reservation",
    });
    if (!ok) return;

    bill.mutate(r.id, {
      onSuccess: ({ invoices, warnings }) => {
        //Warnings are the half-billed cases (a share under 50c, one payer's Stripe call
        //failing while the rest went through), so they must not be hidden behind a success
        //toast that says the flight is done.
        if (warnings.length) {
          toast.warning(warnings.join(" "), { duration: 10000 });
          return;
        }
        toast.success(
          invoices.length > 1 ? `${invoices.length} invoices raised` : "Invoice raised"
        );
      },
      //The server's own message is the useful one here: "Reservation has not been
      //reviewed." tells the operator to close the flight out first, which a generic
      //failure toast would not.
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't bill this reservation"),
    });
  }

  const actions: InvoiceActions = {
    onView: (inv) => setViewId(inv.id),
    onMarkPaid: markPaid,
    onVoid: voidFlow.voidInvoice,
    busy: update.isPending || remind.isPending,
  };

  const columns = useMemo(() => invoiceColumns(actions), [update.isPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const unbilledCols = useMemo(() => unbilledColumns(billReservation, bill.isPending), [bill.isPending]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeSubtitle =
    range?.from && range.to
      ? `${format(range.from, "MMM d")}, ${format(range.to, "MMM d, yyyy")}`
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
        // The whole row opens the panel now. The ⋯ menu keeps its "View invoice"
        // item: it is the only way in on a phone, where rows render as cards.
        onRowClick={(inv) => setViewId(inv.id)}
        isRowSelected={(inv) => inv.id === viewId}
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
            title="Everything billed"
            body="Every past reservation in this range already has an invoice."
          />
        </Card>
      );
    return (
      <div className="flex flex-1 flex-col gap-3" data-doc-shot="billing-unbilled-reservations">
        <p className="shrink-0 text-sm text-muted-foreground">
          {unbilledTotal.toLocaleString()} past{" "}
          {unbilledTotal === 1 ? "reservation hasn't" : "reservations haven't"} been billed yet.
        </p>
        <DataTable
          fill
          columns={unbilledCols}
          data={unbilled}
          paging={unbilledPaging}
          total={unbilledTotal}
          loading={reservationsQ.isFetching}
          mobileCard={(r) => <UnbilledCard r={r} onBill={billReservation} billing={bill.isPending} />}
          emptyMessage="No unbilled reservations."
        />
      </div>
    );
  }

  const emptyByStatus =
    wantsOutstanding && !wantsPaid
      ? "Nothing outstanding, you're all paid up."
      : wantsPaid && !wantsOutstanding
        ? "No paid invoices in this range yet."
        : "No invoices match your filters.";

  const invoiceTables =
    showInvoices && showUnbilled ? (
      // No `min-h-0`/`overflow-hidden` on the halves: each table keeps its own
      // floor (see <TableView>), and clipping here would hide exactly the rows
      // the floor exists to protect. Two tables that don't both fit push the
      // page into scrolling, which beats two slivers.
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col">{renderInvoiceTable(emptyByStatus)}</div>
        <div className="flex flex-1 flex-col">{renderUnbilled()}</div>
      </div>
    ) : showUnbilled ? (
      renderUnbilled()
    ) : (
      renderInvoiceTable(emptyByStatus)
    );

  const invoicePane = (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden"
      data-doc-shot="billing-invoice-list"
    >
      {statsQ.isPending ? (
        <StatSkeleton count={4} />
      ) : (
        <StatGrid>
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
            label="Unbilled"
            value={unbilled.length}
            icon={Plane}
            accent="warning"
            loading={reservationsQ.isLoading}
            hint={
              ledgerOn
                ? "Past reservations, no invoice or ledger charge"
                : "Past reservations, no invoice"
            }
          />
        </StatGrid>
      )}
      <div className="shrink-0">{toolbar}</div>
      {invoiceTables}
    </div>
  );

  return (
    <TableView className={ledgerOn ? "gap-5" : undefined}>
      <TableView.Header>
        <PageHeader
          title={
            <span className="inline-flex items-center gap-1.5">
              Billing
              {ledgerOn ? (
                <DocsHint topic={accountsPane ? "ledger-accounts" : "post-to-ledger"} />
              ) : (
                <DocsHint topic="how-members-pay" />
              )}
            </span>
          }
          subtitle={
            accountsPane
              ? "Who has credit and who owes. Guest invoices stay under Invoices."
              : ledgerOn
                ? `Invoices and unbilled flights · ${rangeSubtitle}. Member flights post to the account ledger.`
                : `Invoices · ${rangeSubtitle}`
          }
          actions={
            accountsPane ? undefined : (
              <div className="flex items-center gap-2">
                <DateRangePicker value={range} onChange={setRange} />
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" /> New invoice
                </Button>
              </div>
            )
          }
        />
      </TableView.Header>

      {ledgerOn ? (
        <div className={RAIL_ROW}>
          <SectionRail
            label="Billing"
            sections={LEDGER_BILLING_RAIL}
            value={accountsPane ? "accounts" : "invoices"}
            onChange={(v) => setPane(v === "invoices" ? "invoices" : "accounts")}
          />
          {accountsPane ? <LedgerAccountsTable /> : invoicePane}
        </div>
      ) : (
        invoicePane
      )}

      <InvoiceDetailSheet
        invoice={viewInvoice}
        invoiceId={viewId}
        open={viewId != null}
        onOpenChange={(o) => !o && setViewId(null)}
        onMarkPaid={markPaid}
        onVoid={voidFlow.voidInvoice}
        onRemind={remindInvoice}
        onStep={stepInvoice}
        busy={update.isPending || remind.isPending}
      />

      <VoidInvoiceDialog {...voidFlow.voidDialog} />

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </TableView>
  );
}
