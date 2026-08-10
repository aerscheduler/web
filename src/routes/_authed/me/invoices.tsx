import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Receipt,
  Wallet,
} from "lucide-react";
import {
  pageRows,
  useMemberInvoicesPage,
  useMemberInvoiceSummary,
} from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { useAuth } from "@/lib/auth";
import type { Invoice } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { MemberInvoiceSheet } from "@/components/me-money/member-invoice-sheet";
import { PayInvoiceDialog } from "@/components/me-money/pay-invoice-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { formatMoney } from "@/lib/utils";

const FACET_KEYS = ["paid", "startDate", "endDate"] as const;

export const Route = createFileRoute("/_authed/me/invoices")({
  /** `invoice` = which record the detail panel shows. Outside the facet list so it
   *  is never persisted and reopened later; a number so the router doesn't
   *  JSON-quote it into `?invoice=%22412%22`. */
  validateSearch: (s) => {
    const list = validateListSearch(s, [...FACET_KEYS]);
    const invoice = Number.parseInt(String(s.invoice ?? ""), 10);
    return {
      ...list,
      ...(Number.isFinite(invoice) ? { invoice } : {}),
    };
  },
  component: MyInvoicesPage,
});

const EMPTY_COPY =
  "No invoices yet. They'll appear here after your reservations are billed.";

const FACETS: FacetDef[] = [
  {
    kind: "boolean",
    key: "paid",
    label: "Status",
    trueLabel: "Paid",
    falseLabel: "Outstanding",
  },
  { kind: "dateRange", key: "dateRange", label: "Date range" },
];

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "–";
}

function invoiceColumns(onView: (inv: Invoice) => void): ColumnDef<Invoice, unknown>[] {
  return [
    {
      id: "id",
      meta: { sortKey: "id" },
      header: "Invoice #",
      accessorFn: (r) => r.id,
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => onView(row.original)}
          className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          #{row.original.id}
        </button>
      ),
    },
    {
      id: "created",
      meta: { sortKey: "createdAt" },
      header: "Date",
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
      cell: ({ row }) => (
        <div className="text-right">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`View invoice #${row.original.id}`}
                className="text-muted-foreground"
                onClick={() => onView(row.original)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View invoice</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
  ];
}

function InvoiceCard({ inv, onView }: { inv: Invoice; onView: (inv: Invoice) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onView(inv)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(inv);
        }
      }}
      className="cursor-pointer p-4 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-sm font-medium">#{inv.id}</div>
          <div className="tnum mt-0.5 text-xs text-muted-foreground">
            {fmtDate(inv.createdAt)}
          </div>
        </div>
        <InvoiceStatusBadge invoice={inv} />
      </div>
      <div className="mt-3 tnum text-2xl font-semibold tracking-tight">
        {formatMoney(inv.total)}
      </div>
    </Card>
  );
}

function MyInvoicesPage() {
  const { organization, orgUserId } = useAuth();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const navigateSearch = navigate as Parameters<typeof useListQueryState>[0]["navigate"];
  const { invoice: openInvoiceId, ...listSearch } = routeSearch;
  const { search, setSearch, debouncedQ, facets, setFacets } = useListQueryState({
    storageKey: "me-invoices",
    search: listSearch,
    navigate: navigateSearch,
    facetKeys: [...FACET_KEYS],
  });
  const viewId = openInvoiceId ?? null;
  // `replace`, so ↑/↓ doesn't stack one history entry per invoice.
  const setViewId = useCallback(
    (id: number | null) => {
      navigateSearch({
        search: ({ invoice: _drop, ...rest }: Record<string, unknown>) =>
          id == null ? rest : { ...rest, invoice: id },
        replace: true,
      });
    },
    [navigateSearch]
  );
  const [payId, setPayId] = useState<number | null>(null);

  const filtersActive =
    !!debouncedQ ||
    facets.paid !== undefined ||
    !!facets.startDate ||
    !!facets.endDate;

  // KPIs stay unfiltered so paid/date facets don't zero out the cards, and they
  // are aggregated by the database rather than summed from the rows on screen.
  // one page of invoices is not this member's balance.
  const summaryQ = useMemberInvoiceSummary(orgUserId);

  const invoiceFilter = {
    q: debouncedQ,
    paid: typeof facets.paid === "boolean" ? facets.paid : undefined,
    startDate: typeof facets.startDate === "string" ? facets.startDate : undefined,
    endDate: typeof facets.endDate === "string" ? facets.endDate : undefined,
  };
  const paging = usePaging({
    resetKey: invoiceFilter,
    defaultSort: { key: "createdAt", dir: "desc" },
  });
  const invoicesQ = useMemberInvoicesPage(orgUserId, invoiceFilter, paging);
  const { rows: invoices, total } = pageRows(invoicesQ);

  const stats = {
    outstanding: summaryQ.data?.outstanding ?? 0,
    paid: summaryQ.data?.revenue ?? 0,
  };

  const viewInvoice = useMemo(
    () => invoices.find((i) => i.id === viewId) ?? null,
    [invoices, viewId]
  );

  /** ↑/↓ to the neighbouring invoice. Clamped at the page edges, paging under the
   *  panel would move the list out from under the highlight. */
  const stepInvoice = useCallback(
    (delta: -1 | 1) => {
      if (viewId == null) return;
      const i = invoices.findIndex((x) => x.id === viewId);
      if (i === -1) return;
      const next = invoices[Math.min(invoices.length - 1, Math.max(0, i + delta))];
      if (next && next.id !== viewId) setViewId(next.id);
    },
    [invoices, viewId, setViewId]
  );
  const payInvoice = useMemo(
    () => invoices.find((i) => i.id === payId) ?? null,
    [invoices, payId]
  );

  // `setViewId` used to be a useState setter (stable, so `[]` was right); it now
  // closes over the router's navigate, so it has to be a real dependency or the
  // column's View action keeps calling yesterday's setter.
  const columns = useMemo(() => invoiceColumns((inv) => setViewId(inv.id)), [setViewId]);

  const searchToolbar = (
    <ListSearchBar
      value={search}
      onChange={setSearch}
      placeholder="Search invoices…"
      aria-label="Search invoices"
      facets={FACETS}
      filterValues={facets}
      onFilterChange={setFacets}
    />
  );

  if (!organization) {
    return (
      <TableView>
        <TableView.Header>
          <PageHeader title="Invoices" subtitle="What your school has charged you." />
        </TableView.Header>
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Join or pick a flight school and your invoices will show up here."
          />
        </Card>
      </TableView>
    );
  }

  return (
    <TableView data-doc-shot="my-invoices">
      <TableView.Header>
        <PageHeader
          title="Invoices"
          subtitle="What your school has charged you, what you owe and what's settled."
        />

        {summaryQ.isPending ? (
          <StatSkeleton count={2} />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Outstanding"
              value={formatMoney(stats.outstanding, { cents: false })}
              icon={Wallet}
              accent="warning"
              hint="Unpaid, not voided"
            />
            <StatCard
              label="Paid"
              value={formatMoney(stats.paid, { cents: false })}
              icon={CheckCircle2}
              accent="success"
              hint="Settled to date"
            />
          </div>
        )}
      </TableView.Header>

      {invoicesQ.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={6} cols={5} />
        </Card>
      ) : invoicesQ.isError ? (
        <Card className="min-h-0 flex-1">
          <ErrorState error={invoicesQ.error} onRetry={() => invoicesQ.refetch()} />
        </Card>
      ) : total === 0 && !filtersActive ? (
        <Card className="min-h-0 flex-1">
          <EmptyState icon={Receipt} title="No invoices yet" body={EMPTY_COPY} />
        </Card>
      ) : (
        <DataTable
          fill
          columns={columns}
          data={invoices}
          paging={paging}
          total={total}
          loading={invoicesQ.isFetching}
          toolbar={searchToolbar}
          mobileCard={(inv) => <InvoiceCard inv={inv} onView={(i) => setViewId(i.id)} />}
          onRowClick={(inv) => setViewId(inv.id)}
          isRowSelected={(inv) => inv.id === viewId}
          emptyMessage="No invoices match your search."
        />
      )}

      <MemberInvoiceSheet
        invoice={viewInvoice}
        open={viewId != null}
        onOpenChange={(o) => !o && setViewId(null)}
        onStep={stepInvoice}
        onPay={(inv) => {
          setViewId(null);
          setPayId(inv.id);
        }}
      />

      <PayInvoiceDialog
        invoice={payInvoice}
        open={payId != null}
        onOpenChange={(o) => !o && setPayId(null)}
      />
    </TableView>
  );
}
