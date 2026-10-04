import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Receipt } from "lucide-react";
import type { AircraftInvoice } from "@/types/api";
import { pageRows, useAircraftInvoicesPage } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { formatDate, formatMoney } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { DocsHint } from "@/components/docs-hint";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * Every invoice tied to one aircraft (Murray spec section 3, "Invoice history"; Tony,
 * 2026-10-05): the bills for bookings that flew it, and the shop's bills for jobs on it. Admins
 * only, like every organization-wide invoice list. A row opens the invoice on Billing.
 */

const STATUS: Record<AircraftInvoice["status"], { label: string; variant: NonNullable<BadgeProps["variant"]> }> = {
  paid: { label: "Paid", variant: "success" },
  open: { label: "Outstanding", variant: "outline" },
  // Amber, never red: a late bill is a nudge, not an error.
  overdue: { label: "Overdue", variant: "warning" },
  void: { label: "Void", variant: "outline" },
  refunded: { label: "Refunded", variant: "secondary" },
};

/** What the bill is for: the job's number, or the booking's title and day. */
function ForCell({ inv }: { inv: AircraftInvoice }) {
  const f = inv.for;
  if (!f) return <span className="text-muted-foreground">A custom charge</span>;
  if (f.kind === "work_order") {
    return (
      <Link
        to="/maintenance/work-orders/$workOrderId"
        params={{ workOrderId: String(f.id) }}
        onClick={(e) => e.stopPropagation()}
        className="font-mono text-[12px] underline-offset-2 hover:underline"
      >
        {f.label}
      </Link>
    );
  }
  return (
    <Link
      to="/schedule/reservations/$reservationId"
      params={{ reservationId: String(f.id) }}
      onClick={(e) => e.stopPropagation()}
      className="truncate underline-offset-2 hover:underline"
    >
      {f.title || "Booking"}
      {f.start ? <span className="text-muted-foreground"> on {formatDate(f.start, "MMM d")}</span> : null}
    </Link>
  );
}

function columns(): ColumnDef<AircraftInvoice, unknown>[] {
  return [
    {
      // The number Billing shows for the same invoice, so the two read alike.
      id: "number",
      meta: { sortKey: "id" },
      header: "Invoice #",
      cell: ({ row }) => <span className="font-mono text-[12px] whitespace-nowrap">#{row.original.id}</span>,
    },
    {
      id: "date",
      meta: { sortKey: "createdAt" },
      header: "Date",
      cell: ({ row }) => <span className="tnum whitespace-nowrap text-[13px] text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "billedTo",
      meta: { sortKey: "billedTo.name" },
      header: "Billed to",
      cell: ({ row }) => {
        const b = row.original.billedTo;
        return b.orgUserId != null ? (
          <span onClick={(e) => e.stopPropagation()}>
            <WorkspaceUserAvatar person={{ id: b.orgUserId, name: b.name }} showName />
          </span>
        ) : (
          <span className="text-[13px]">{b.name ?? "A guest"}</span>
        );
      },
    },
    {
      id: "for",
      header: "For",
      cell: ({ row }) => (
        <div className="min-w-0 text-[13px]">
          <ForCell inv={row.original} />
        </div>
      ),
    },
    {
      id: "total",
      meta: { sortKey: "totalCents", numeric: true },
      header: "Amount",
      cell: ({ row }) => <div className="tnum text-right text-[13px] font-medium">{formatMoney(row.original.totalCents)}</div>,
    },
    {
      id: "status",
      meta: { sortKey: "status" },
      header: "Status",
      cell: ({ row }) => {
        const s = STATUS[row.original.status];
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
  ];
}

export function ResourceInvoices({ resourceId, isShop }: { resourceId: number; isShop: boolean }) {
  const navigate = useNavigate();
  const paging = usePaging({ defaultSort: { key: "createdAt", dir: "desc" } });
  const q = useAircraftInvoicesPage(resourceId, paging);
  const { rows, total } = pageRows(q);
  const cols = useMemo(columns, []);
  const open = (inv: AircraftInvoice) => void navigate({ to: "/billing", search: { invoice: inv.id } as never });

  const body = q.isPending ? (
    <Card className="min-h-0 flex-1 overflow-hidden">
      <TableSkeleton rows={8} cols={6} />
    </Card>
  ) : q.isError ? (
    <Card className="min-h-0 flex-1">
      <ErrorState error={q.error} onRetry={() => q.refetch()} />
    </Card>
  ) : total === 0 ? (
    <Card className="min-h-0 flex-1">
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        body={isShop ? "The shop's bills for jobs on this aircraft appear here." : "Bills for the bookings that flew this aircraft, and for any shop work on it, appear here."}
        docs="aircraft-invoices"
      />
    </Card>
  ) : (
    <DataTable
      fill
      columns={cols}
      data={rows}
      paging={paging}
      total={total}
      loading={q.isFetching}
      onRowClick={open}
      emptyMessage="No invoices."
      docShot="aircraft-invoices"
      mobileCard={(inv) => (
        <Card className="cursor-pointer p-3" onClick={() => open(inv)}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-[12px]">#{inv.id}</div>
              <div className="truncate text-[13px]">{inv.billedTo.name ?? "A guest"}</div>
            </div>
            <Badge variant={STATUS[inv.status].variant}>{STATUS[inv.status].label}</Badge>
          </div>
          <div className="tnum mt-1 text-[15px] font-semibold">{formatMoney(inv.totalCents)}</div>
        </Card>
      )}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden" data-testid="aircraft-invoices">
      <p className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground">
        {isShop ? "The shop's bills for work on this aircraft." : "Every bill for a booking on this aircraft, and for shop work on it."} Open one to see it on Billing.
        <DocsHint topic="aircraft-invoices" />
      </p>
      {body}
    </div>
  );
}
