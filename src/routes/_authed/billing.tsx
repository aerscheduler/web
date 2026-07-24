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
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useInvoices, useReservations, useUpdateInvoice } from "@/features/queries";
import type { Invoice, Reservation } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState, StatSkeleton, TableSkeleton } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { DateRangePicker, lastNDays } from "@/components/billing/date-range-picker";
import { CreateInvoiceDialog, type InvoiceDraft } from "@/components/billing/create-invoice-dialog";
import { InvoiceDetailSheet } from "@/components/billing/invoice-detail-sheet";
import { InvoiceStatusBadge, invoiceStatus } from "@/components/billing/invoice-status";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney } from "@/lib/utils";

export const Route = createFileRoute("/_authed/billing")({
  component: BillingPage,
});

type TabKey = "all" | "outstanding" | "paid" | "unbilled";

type InvoiceActions = {
  onView: (inv: Invoice) => void;
  onMarkPaid: (inv: Invoice) => void;
  onVoid: (inv: Invoice) => void;
  busy: boolean;
};

const EMPTY_COPY = "No invoices in this range. They draft automatically when a flight ramps in.";

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : "—";
}

// ------------------------------------------------------------ invoice columns

function invoiceColumns(actions: InvoiceActions): ColumnDef<Invoice, unknown>[] {
  return [
    {
      id: "id",
      header: "Invoice #",
      accessorFn: (r) => r.id,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">#{row.original.id}</span>,
    },
    {
      id: "customer",
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

// ------------------------------------------------------------ unbilled flights

function unbilledColumns(onBill: (r: Reservation) => void): ColumnDef<Reservation, unknown>[] {
  return [
    {
      id: "flight",
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
      header: "Flown",
      accessorFn: (r) => r.end,
      cell: ({ getValue }) => (
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground">
          {format(parseISO(getValue() as string), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      id: "action",
      header: "",
      enableSorting: false,
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

// ------------------------------------------------------------ page

function BillingPage() {
  const confirm = useConfirm();
  const [range, setRange] = useState<DateRange | undefined>(() => lastNDays(30));
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<InvoiceDraft | undefined>(undefined);

  const startISO = range?.from ? startOfDay(range.from).toISOString() : undefined;
  const endISO = range?.to
    ? endOfDay(range.to).toISOString()
    : range?.from
      ? endOfDay(range.from).toISOString()
      : undefined;

  const invoicesQ = useInvoices({ startDate: startISO, endDate: endISO });
  const reservationsQ = useReservations(startISO ?? "", endISO ?? "", {
    enabled: !!startISO && !!endISO,
  });

  const update = useUpdateInvoice();

  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  const unbilled = useMemo(() => {
    const now = Date.now();
    return (reservationsQ.data ?? []).filter(
      (r) => r.invoice == null && !r.cancelledAt && parseISO(r.end).getTime() < now
    );
  }, [reservationsQ.data]);

  const stats = useMemo(() => {
    let revenue = 0;
    let outstanding = 0;
    let paidCount = 0;
    for (const i of invoices) {
      if (i.paidAt) {
        revenue += i.total;
        paidCount += 1;
      } else if (!i.voidedAt) {
        outstanding += i.total;
      }
    }
    return { revenue, outstanding, paidCount };
  }, [invoices]);

  const rows = useMemo(() => {
    if (tab === "paid") return invoices.filter((i) => i.paidAt != null);
    if (tab === "outstanding")
      return invoices.filter((i) => i.paidAt == null && i.voidedAt == null);
    return invoices;
  }, [invoices, tab]);

  const viewInvoice = useMemo(
    () => invoices.find((i) => i.id === viewId) ?? null,
    [invoices, viewId]
  );

  function markPaid(inv: Invoice) {
    update.mutate(
      { id: inv.id, patch: { paidAt: new Date().toISOString() } },
      {
        onSuccess: () => toast.success(`Invoice #${inv.id} marked paid`),
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
      { id: inv.id, patch: { voidedAt: new Date().toISOString() } },
      {
        onSuccess: () => toast.success(`Invoice #${inv.id} voided`),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Couldn't void invoice"),
      }
    );
  }

  function billReservation(r: Reservation) {
    setDraft(reservationDraft(r));
    setCreateOpen(true);
  }

  const actions: InvoiceActions = {
    onView: (inv) => setViewId(inv.id),
    onMarkPaid: markPaid,
    onVoid: voidInvoice,
    busy: update.isPending,
  };

  const columns = useMemo(() => invoiceColumns(actions), [update.isPending]); // eslint-disable-line react-hooks/exhaustive-deps
  const unbilledCols = useMemo(() => unbilledColumns(billReservation), []); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeSubtitle =
    range?.from && range.to
      ? `${format(range.from, "MMM d")} – ${format(range.to, "MMM d, yyyy")}`
      : "Pick a date range";

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

  function renderInvoiceTable(tabRows: Invoice[], emptyMessage: string) {
    if (invoicesQ.isLoading) return <TableSkeleton rows={8} cols={6} />;
    if (invoicesQ.isError)
      return <ErrorState error={invoicesQ.error} onRetry={() => invoicesQ.refetch()} />;
    if (invoices.length === 0)
      return <EmptyState icon={Receipt} title="No invoices yet" body={EMPTY_COPY} />;
    return (
      <DataTable
        columns={columns}
        data={tabRows}
        toolbar={searchToolbar}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        mobileCard={(inv) => <InvoiceCard inv={inv} actions={actions} />}
        emptyMessage={emptyMessage}
      />
    );
  }

  return (
    <div>
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

      {invoicesQ.isLoading ? (
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
          <StatCard label="Paid" value={stats.paidCount} icon={CheckCircle2} hint="Invoices settled" />
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="unbilled">
            Unbilled flights
            {unbilled.length > 0 && (
              <Badge variant="warning" className="ml-1.5">
                {unbilled.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="mt-4 overflow-hidden p-4">
            {renderInvoiceTable(rows, "No invoices match your search.")}
          </Card>
        </TabsContent>

        <TabsContent value="outstanding">
          <Card className="mt-4 overflow-hidden p-4">
            {renderInvoiceTable(rows, "Nothing outstanding — you're all paid up.")}
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card className="mt-4 overflow-hidden p-4">
            {renderInvoiceTable(rows, "No paid invoices in this range yet.")}
          </Card>
        </TabsContent>

        <TabsContent value="unbilled">
          <Card className="mt-4 overflow-hidden p-4">
            {reservationsQ.isLoading ? (
              <TableSkeleton rows={6} cols={4} />
            ) : reservationsQ.isError ? (
              <ErrorState error={reservationsQ.error} onRetry={() => reservationsQ.refetch()} />
            ) : unbilled.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All flights billed"
                body="Every past flight in this range already has an invoice."
              />
            ) : (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {unbilled.length} past{" "}
                  {unbilled.length === 1 ? "flight hasn't" : "flights haven't"} been billed yet.
                </p>
                <DataTable
                  columns={unbilledCols}
                  data={unbilled}
                  mobileCard={(r) => <UnbilledCard r={r} onBill={billReservation} />}
                  emptyMessage="No unbilled flights."
                />
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <InvoiceDetailSheet
        invoice={viewInvoice}
        open={viewId != null}
        onOpenChange={(o) => !o && setViewId(null)}
        onMarkPaid={markPaid}
        onVoid={voidInvoice}
        busy={update.isPending}
      />

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} draft={draft} />
    </div>
  );
}
