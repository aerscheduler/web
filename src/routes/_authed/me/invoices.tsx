import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Receipt,
  Search,
  Wallet,
} from "lucide-react";
import { useMemberInvoices } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { Invoice } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { MemberInvoiceSheet } from "@/components/me-money/member-invoice-sheet";
import { PayInvoiceDialog } from "@/components/me-money/pay-invoice-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/me/invoices")({
  component: MyInvoicesPage,
});

const EMPTY_COPY =
  "No invoices yet. They'll appear here after your flights are billed.";

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "—";
}

function invoiceColumns(onView: (inv: Invoice) => void): ColumnDef<Invoice, unknown>[] {
  return [
    {
      id: "id",
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
      enableSorting: false,
      accessorFn: (r) => invoiceStatus(r).label,
      cell: ({ row }) => <InvoiceStatusBadge invoice={row.original} />,
    },
    {
      id: "total",
      header: "Total",
      accessorFn: (r) => r.total,
      cell: ({ getValue }) => (
        <div className="tnum text-right font-medium">{formatMoney(getValue() as number)}</div>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
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
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<number | null>(null);
  const [payId, setPayId] = useState<number | null>(null);

  const invoicesQ = useMemberInvoices(orgUserId);
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  const stats = useMemo(() => {
    let outstanding = 0;
    let paid = 0;
    for (const i of invoices) {
      if (i.paidAt) paid += i.total;
      else if (!i.voidedAt) outstanding += i.total;
    }
    return { outstanding, paid };
  }, [invoices]);

  const viewInvoice = useMemo(
    () => invoices.find((i) => i.id === viewId) ?? null,
    [invoices, viewId]
  );
  const payInvoice = useMemo(
    () => invoices.find((i) => i.id === payId) ?? null,
    [invoices, payId]
  );

  const columns = useMemo(() => invoiceColumns((inv) => setViewId(inv.id)), []);

  const searchToolbar = (
    <div className="relative max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Search invoices…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pl-9"
      />
    </div>
  );

  if (!organization) {
    return (
      <div>
        <PageHeader title="My invoices" subtitle="Your flight-training charges." />
        <Card className="p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Join or pick a flight school and your invoices will show up here."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My invoices"
        subtitle="Your flight-training charges — what you owe and what's settled."
      />

      {invoicesQ.isLoading ? (
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

      <Card className="mt-5 overflow-hidden p-4">
        {invoicesQ.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : invoicesQ.isError ? (
          <ErrorState error={invoicesQ.error} onRetry={() => invoicesQ.refetch()} />
        ) : invoices.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" body={EMPTY_COPY} />
        ) : (
          <DataTable
            columns={columns}
            data={invoices}
            toolbar={searchToolbar}
            globalFilter={search}
            onGlobalFilterChange={setSearch}
            mobileCard={(inv) => <InvoiceCard inv={inv} onView={(i) => setViewId(i.id)} />}
            emptyMessage="No invoices match your search."
          />
        )}
      </Card>

      <MemberInvoiceSheet
        invoice={viewInvoice}
        open={viewId != null}
        onOpenChange={(o) => !o && setViewId(null)}
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
    </div>
  );
}
