import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { History } from "lucide-react";
import { usePaging } from "@/lib/paging";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { pageRows, useQuickBooksActivityPage, type QuickBooksSyncEvent } from "@/features/queries";
import { blockReasonLabel } from "./labels";

/** What set each row off, in words. The stored values are internal names. */
const STARTED_BY: Record<string, string> = {
  drain: "Background sync",
  auto: "Payment received",
  retry: "Retry button",
  owner: "Handled button",
  remove: "Receipt removal",
  refund: "Refund in Stripe",
  connect: "Connecting QuickBooks",
  backfill: "Start date change",
};

function startedBy(e: QuickBooksSyncEvent): string {
  return STARTED_BY[e.triggeredBy] ?? "AerScheduler";
}

/** Older rows logged a post as a bare "Sales Receipt #218". */
function describe(e: QuickBooksSyncEvent): string {
  const m = e.message ?? "";
  if (e.status === "success" && /^Sales Receipt #\S+$/.test(m)) return `Posted as ${m}`;
  return m || "–";
}

/**
 * One row in words. A problem says what went wrong, the message says why and what to
 * do, and the last line says where that invoice stands now, because a problem from last
 * week may have been sorted out since.
 */
function WhatHappened({ e }: { e: QuickBooksSyncEvent }) {
  if (e.status !== "error") {
    return <span className={e.status === "skipped" ? "text-muted-foreground" : undefined}>{describe(e)}</span>;
  }
  return (
    <div className="min-w-0 space-y-1 py-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="danger">Problem</Badge>
        {e.reason ? <span className="font-medium">{blockReasonLabel(e.reason)}</span> : null}
      </div>
      <p>{describe(e)}</p>
      {e.followUp === "waiting" ? (
        <Link
          to="/settings/integrations/quickbooks"
          search={{ tab: "attention" }}
          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Still waiting on you in Needs attention
        </Link>
      ) : e.followUp === "resolved" ? (
        <p className="text-xs text-muted-foreground">Sorted out since</p>
      ) : e.followUp === "retrying" ? (
        <p className="text-xs text-muted-foreground">Being tried again automatically</p>
      ) : null}
    </div>
  );
}

function InvoiceCell({ e }: { e: QuickBooksSyncEvent }) {
  if (e.invoiceId == null) return <span className="text-muted-foreground">–</span>;
  return (
    <Link
      to="/billing"
      search={{ invoice: e.invoiceId } as never}
      className="block min-w-0 underline-offset-2 hover:underline"
    >
      <div className="truncate font-medium">{e.invoiceNumber ?? `Invoice ${e.invoiceId}`}</div>
      {e.payerName ? <div className="truncate text-xs text-muted-foreground">{e.payerName}</div> : null}
    </Link>
  );
}

export function QuickBooksActivityPane() {
  const [show, setShow] = useState<"all" | "problems">("all");
  const paging = usePaging({ resetKey: show });
  const q = useQuickBooksActivityPage(paging, { problems: show === "problems" });
  const { rows, total } = pageRows(q);

  const columns = useMemo<ColumnDef<QuickBooksSyncEvent, unknown>[]>(
    () => [
      {
        id: "when",
        header: "When",
        meta: { width: "9rem" },
        cell: ({ row }) => {
          const at = parseISO(row.original.createdAt);
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default whitespace-nowrap text-muted-foreground">
                  {formatDistanceToNow(at, { addSuffix: true })}
                </span>
              </TooltipTrigger>
              <TooltipContent>{format(at, "MMM d, yyyy h:mm a")}</TooltipContent>
            </Tooltip>
          );
        },
      },
      {
        id: "invoice",
        header: "Invoice",
        meta: { width: "12rem" },
        cell: ({ row }) => <InvoiceCell e={row.original} />,
      },
      {
        id: "what",
        header: "What happened",
        cell: ({ row }) => <WhatHappened e={row.original} />,
      },
      {
        id: "startedBy",
        header: "Started by",
        meta: { width: "11rem" },
        cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{startedBy(row.original)}</span>,
      },
    ],
    [],
  );

  const filter = (
    <Select value={show} onValueChange={(v) => setShow(v as "all" | "problems")}>
      <SelectTrigger className="w-40" aria-label="Show">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All activity</SelectItem>
        <SelectItem value="problems">Problems only</SelectItem>
      </SelectContent>
    </Select>
  );

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  if (!q.isPending && total === 0 && show === "all") {
    return (
      <Card>
        <EmptyState
          icon={History}
          title="No activity yet"
          body="Receipts posted and removed, and any problems, show up here once sync starts."
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
      emptyMessage="No problems. Everything recent went through."
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Receipts posted and removed, and every problem, newest first.</p>
          {filter}
        </div>
      }
      mobileCard={(e) => (
        <div className="space-y-1.5 p-4 text-sm">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatDistanceToNow(parseISO(e.createdAt), { addSuffix: true })}</span>
            <span>{startedBy(e)}</span>
          </div>
          {e.invoiceId != null ? <InvoiceCell e={e} /> : null}
          <WhatHappened e={e} />
        </div>
      )}
    />
  );
}
