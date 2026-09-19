import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useNavigate } from "@tanstack/react-router";
import { Check, MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { usePaging } from "@/lib/paging";
import { formatMoney } from "@/lib/utils";
import { DataTable } from "@/components/data-table";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  pageRows,
  useMarkQuickBooksHandled,
  useQuickBooksNeedsAttentionPage,
  useRetryBlockedQuickBooks,
  useSyncInvoiceToQuickBooks,
  type QuickBooksBlockedInvoice,
} from "@/features/queries";
import { blockReasonLabel, PERSON_ONLY_REASONS } from "./labels";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

const paidOn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–";

/**
 * Invoices that can't post (or be removed) until a person does something. Paged by
 * the server like every other table; each row says what is wrong and offers the two
 * ways out: Retry once it's fixed, or Handled once it's been dealt with in QuickBooks.
 */
export function QuickBooksNeedsAttentionPane() {
  const paging = usePaging();
  const q = useQuickBooksNeedsAttentionPage(paging);
  const { rows, total } = pageRows(q);
  const retryAll = useRetryBlockedQuickBooks();
  const retryOne = useSyncInvoiceToQuickBooks();
  const handled = useMarkQuickBooksHandled();
  const confirm = useConfirm();
  const navigate = useNavigate();

  async function onRetry(row: QuickBooksBlockedInvoice) {
    try {
      const r = await retryOne.mutateAsync(row.invoiceId);
      toast.success(r.qboSalesReceiptId ? "Posted to QuickBooks" : (r.message ?? "Retrying"));
    } catch (err) {
      toast.error(errMessage(err, "Still can't post it"));
    }
  }

  async function onHandled(row: QuickBooksBlockedInvoice) {
    const description = !row.lostPost
      ? "Use this once you've recorded (or removed) it in QuickBooks yourself. AerScheduler leaves it alone from then on."
      : row.handledSearches
        ? "AerScheduler first checks QuickBooks for a receipt from an earlier attempt. If one matches the amount, it's kept and the invoice counts as posted. Any other copy is deleted."
        : row.lostPostElsewhere
          ? `An earlier attempt went to the QuickBooks company you were connected to before. Search that company for "AerScheduler #${row.invoiceId}" and delete the receipt if it shouldn't be there.`
          : `An earlier attempt may have created a receipt, and QuickBooks can't be checked right now. Search QuickBooks for "AerScheduler #${row.invoiceId}" and delete it if it shouldn't be there.`;
    const ok = await confirm({
      title: `Mark invoice ${row.invoiceNumber} handled?`,
      description,
      confirmLabel: row.lostPost && row.handledSearches ? "Check and mark handled" : "Mark handled",
    });
    if (!ok) return;
    try {
      const r = await handled.mutateAsync(row.invoiceId);
      toast.success(r.searching ? "Checking QuickBooks for the earlier receipt first" : "Marked handled");
    } catch (err) {
      toast.error(errMessage(err, "Could not update it"));
    }
  }

  async function onRetryAll() {
    try {
      const r = await retryAll.mutateAsync(undefined);
      toast.success(`Retrying ${r.requeued} invoice${r.requeued === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(errMessage(err, "Could not retry"));
    }
  }

  const columns = useMemo<ColumnDef<QuickBooksBlockedInvoice, unknown>[]>(
    () => [
      {
        id: "invoice",
        header: "Invoice",
        meta: { width: "13rem" },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.invoiceNumber}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.original.payerName ?? "No member or guest"}
            </div>
          </div>
        ),
      },
      {
        id: "problem",
        header: "Problem",
        cell: ({ row }) => (
          <div className="min-w-0 space-y-1 py-0.5">
            <Badge variant={row.original.isRemoval ? "secondary" : "outline"}>
              {blockReasonLabel(row.original.reason)}
            </Badge>
            {row.original.message ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{row.original.message}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: "paid",
        header: "Paid",
        meta: { width: "8rem" },
        cell: ({ row }) => <span className="text-muted-foreground">{paidOn(row.original.paidAt)}</span>,
      },
      {
        id: "amount",
        header: "Amount",
        meta: { numeric: true, width: "7rem" },
        cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.totalCents)}</span>,
      },
      {
        id: "actions",
        header: "",
        meta: { width: "3rem" },
        cell: ({ row }) => <RowActions row={row.original} onRetry={onRetry} onHandled={onHandled} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers close over stable mutations
    [],
  );

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  if (!q.isPending && total === 0) {
    return (
      <Card>
        <EmptyState
          icon={Check}
          title="Nothing needs attention"
          body="When an invoice can't be posted, it shows up here with what to fix."
          docs="quickbooks-needs-attention"
        />
      </Card>
    );
  }

  return (
    <DataTable
      fill
      columns={columns}
      data={rows}
      paging={paging}
      total={total}
      loading={q.isFetching}
      onRowClick={(r) => void navigate({ to: "/billing", search: { invoice: r.invoiceId } as never })}
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Invoices that can't be posted or removed until something is fixed.
          </p>
          <Button variant="outline" size="sm" onClick={() => void onRetryAll()} disabled={retryAll.isPending}>
            <RefreshCw className="size-3.5" /> Retry all
          </Button>
        </div>
      }
      mobileCard={(r) => (
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium">
              {r.invoiceNumber} · {formatMoney(r.totalCents)}
            </div>
            <Badge variant="outline">{blockReasonLabel(r.reason)}</Badge>
            {r.message ? <p className="text-xs text-muted-foreground">{r.message}</p> : null}
          </div>
          <RowActions row={r} onRetry={onRetry} onHandled={onHandled} />
        </div>
      )}
    />
  );
}

function RowActions({
  row,
  onRetry,
  onHandled,
}: {
  row: QuickBooksBlockedInvoice;
  onRetry: (r: QuickBooksBlockedInvoice) => void;
  onHandled: (r: QuickBooksBlockedInvoice) => void;
}) {
  const personOnly = PERSON_ONLY_REASONS.includes(row.reason ?? "");
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for invoice ${row.invoiceNumber}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {!personOnly ? (
            <DropdownMenuItem onSelect={() => void onRetry(row)}>
              <RefreshCw /> {row.isRemoval ? "Try removing again" : "Retry"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void onHandled(row)}>
            <Check /> Mark handled
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
