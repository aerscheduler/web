import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { CheckCircle2, ChevronRight, Receipt, Wallet } from "lucide-react";
import {
  pageRows,
  useMemberInvoicesPage,
  useMemberInvoiceSummary,
  useOrgLedgerSettings,
} from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Invoice } from "@/types/api";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef, type ListFilterValues } from "@/components/list-filters";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { MemberInvoiceSheet } from "@/components/me-money/member-invoice-sheet";
import { PayInvoiceDialog } from "@/components/me-money/pay-invoice-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatMoney } from "@/lib/utils";

const EMPTY_INVOICES =
  "No invoices yet. They'll appear here after your reservations are billed.";

const INVOICE_FACETS: FacetDef[] = [
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
          <div className="tnum mt-0.5 text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</div>
        </div>
        <InvoiceStatusBadge invoice={inv} />
      </div>
      <div className="mt-3 tnum text-2xl font-semibold tracking-tight">{formatMoney(inv.total)}</div>
    </Card>
  );
}

/**
 * Searchable, paged invoice list for one member. /me Billing and People → Invoices.
 */
export function MemberInvoicesTable({
  orgUserId,
  isSelf,
  fill = false,
  showTitle = false,
  hideWhenEmpty = false,
  openInvoiceId,
}: {
  orgUserId: number;
  isSelf?: boolean;
  fill?: boolean;
  showTitle?: boolean;
  /** Skip rendering when this member has no invoices (ledger leftover case). */
  hideWhenEmpty?: boolean;
  /** Deep-link from `/me/invoices?invoice=`. */
  openInvoiceId?: number;
}) {
  const [search, setSearch] = useState("");
  const debouncedQ = useDebouncedValue(search);
  const [facets, setFacets] = useState<ListFilterValues>({});
  const [viewId, setViewId] = useState<number | null>(openInvoiceId ?? null);
  const [payId, setPayId] = useState<number | null>(null);

  const startDate = typeof facets.startDate === "string" ? facets.startDate : undefined;
  const endDate = typeof facets.endDate === "string" ? facets.endDate : undefined;
  const filter = {
    q: debouncedQ,
    paid: typeof facets.paid === "boolean" ? facets.paid : undefined,
    startDate,
    endDate,
  };
  const paging = usePaging({
    resetKey: filter,
    defaultSort: { key: "createdAt", dir: "desc" },
  });
  const invoicesQ = useMemberInvoicesPage(orgUserId, filter, paging);
  const summaryQ = useMemberInvoiceSummary(orgUserId);
  const ledgerOn = useOrgLedgerSettings().data?.enabled === true;
  const emptyBody = ledgerOn
    ? "No leftover invoices. Member flights and fees post to the account ledger."
    : EMPTY_INVOICES;
  const { rows: invoices, total } = pageRows(invoicesQ);
  const filtersActive =
    !!debouncedQ || facets.paid !== undefined || !!startDate || !!endDate;
  const stats = {
    outstanding: summaryQ.data?.outstanding ?? 0,
    paid: summaryQ.data?.revenue ?? 0,
  };

  const viewInvoice = useMemo(
    () => invoices.find((i) => i.id === viewId) ?? null,
    [invoices, viewId]
  );
  const payInvoice = useMemo(
    () => invoices.find((i) => i.id === payId) ?? null,
    [invoices, payId]
  );
  const stepInvoice = useCallback(
    (delta: -1 | 1) => {
      if (viewId == null) return;
      const i = invoices.findIndex((x) => x.id === viewId);
      if (i === -1) return;
      const next = invoices[Math.min(invoices.length - 1, Math.max(0, i + delta))];
      if (next && next.id !== viewId) setViewId(next.id);
    },
    [invoices, viewId]
  );
  const columns = useMemo(() => invoiceColumns((inv) => setViewId(inv.id)), []);

  if (
    hideWhenEmpty &&
    !invoicesQ.isPending &&
    !invoicesQ.isError &&
    total === 0 &&
    !filtersActive
  ) {
    return null;
  }

  const table = invoicesQ.isPending ? (
    <Card className={cn(fill && "min-h-0 flex-1 overflow-hidden")}>
      <TableSkeleton rows={fill ? 8 : 6} cols={5} />
    </Card>
  ) : invoicesQ.isError ? (
    <Card className={cn(fill && "min-h-0 flex-1")}>
      <ErrorState error={invoicesQ.error} onRetry={() => invoicesQ.refetch()} />
    </Card>
  ) : total === 0 && !filtersActive ? (
    <Card className={cn(fill && "min-h-0 flex-1")}>
      <EmptyState icon={Receipt} title="No invoices yet" body={emptyBody} />
    </Card>
  ) : (
    <DataTable
      fill={fill}
      columns={columns}
      data={invoices}
      paging={paging}
      total={total}
      loading={invoicesQ.isFetching}
      mobileCard={(inv) => <InvoiceCard inv={inv} onView={(i) => setViewId(i.id)} />}
      onRowClick={(inv) => setViewId(inv.id)}
      isRowSelected={(inv) => inv.id === viewId}
      emptyMessage="No invoices match your search."
    />
  );

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col gap-3", fill && "min-w-0 flex-1 overflow-hidden")}>
      {showTitle && (
        <div className="shrink-0">
          <h2 className="text-sm font-semibold">Invoices</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            What this member has been invoiced.
          </p>
        </div>
      )}

      {summaryQ.isPending ? (
        <div className="shrink-0">
          <StatSkeleton count={2} />
        </div>
      ) : (
        <div className="grid shrink-0 grid-cols-2 gap-4">
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

      <div className="shrink-0">
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder={isSelf ? "Search your invoices…" : "Search invoices…"}
          aria-label={isSelf ? "Search your invoices" : "Search invoices"}
          facets={INVOICE_FACETS}
          filterValues={facets}
          onFilterChange={setFacets}
        />
      </div>

      {table}

      <MemberInvoiceSheet
        invoice={viewInvoice}
        open={viewId != null}
        onOpenChange={(o) => !o && setViewId(null)}
        onStep={stepInvoice}
        onPay={
          isSelf
            ? (inv) => {
                setViewId(null);
                setPayId(inv.id);
              }
            : undefined
        }
      />
      <PayInvoiceDialog
        invoice={payInvoice}
        open={payId != null}
        onOpenChange={(o) => !o && setPayId(null)}
      />
    </div>
  );
}
