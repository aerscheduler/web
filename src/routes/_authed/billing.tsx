import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import { Receipt, TrendingUp, Wallet } from "lucide-react";
import { useInvoices } from "@/features/queries";
import type { Invoice } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/billing")({
  component: BillingPage,
});

const TABS = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Outstanding" },
  { key: "paid", label: "Paid" },
] as const;

const columns: ColumnDef<Invoice, unknown>[] = [
  {
    id: "invoice",
    header: "Invoice",
    accessorFn: (r) => r.id,
    cell: ({ row }) => {
      const i = row.original;
      return (
        <div className="min-w-0">
          <div className="font-mono text-sm font-medium">#{i.id}</div>
          {i.memo && <div className="truncate text-xs text-muted-foreground">{i.memo}</div>}
        </div>
      );
    },
  },
  {
    id: "customer",
    header: "Customer",
    accessorFn: (r) => r.customer?.user?.name ?? "",
    cell: ({ getValue }) => (
      <span className="text-sm">{(getValue() as string) || "—"}</span>
    ),
  },
  {
    id: "date",
    header: "Date",
    accessorFn: (r) => r.createdAt,
    cell: ({ getValue }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {format(parseISO(getValue() as string), "MMM d, yyyy")}
      </span>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    accessorFn: (r) => r.total,
    cell: ({ getValue }) => (
      <span className="font-medium tabular-nums">{formatMoney(getValue() as number)}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => {
      const i = row.original;
      return i.voidedAt ? (
        <Badge variant="outline">Void</Badge>
      ) : i.paidAt ? (
        <Badge variant="success">Paid</Badge>
      ) : (
        <Badge variant="warning">Due</Badge>
      );
    },
  },
];

function BillingPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const since = startOfDay(addDays(new Date(), -30)).toISOString();
  const q = useInvoices({ startDate: since });

  const all = q.data ?? [];
  const active = all.filter((i) => i.voidedAt == null);
  const billed = active.reduce((s, i) => s + i.total, 0);
  const outstanding = active.filter((i) => !i.paidAt).reduce((s, i) => s + i.total, 0);
  const rows = all.filter((i) =>
    tab === "paid" ? i.paidAt != null : tab === "unpaid" ? i.paidAt == null && i.voidedAt == null : true
  );

  return (
    <div>
      <PageHeader title="Billing" subtitle="Invoices from the last 30 days" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Billed · 30 days" value={formatMoney(billed, { cents: false })} icon={TrendingUp} loading={q.isLoading} />
        <StatCard label="Outstanding" value={formatMoney(outstanding, { cents: false })} icon={Wallet} loading={q.isLoading} accent="warning" hint={`${active.filter((i) => !i.paidAt).length} unpaid`} />
        <StatCard label="Invoices" value={active.length} icon={Receipt} loading={q.isLoading} />
      </div>

      <div className="mt-6 mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices" body="Nothing matches this filter in the last 30 days." />
        ) : (
          <DataTable columns={columns} data={rows} />
        )}
      </Card>
    </div>
  );
}
