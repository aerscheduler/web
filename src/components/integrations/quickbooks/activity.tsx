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

/** Who or what caused an event, in words. The raw values are internal names. */
const SOURCE_LABELS: Record<string, string> = {
  drain: "Automatic",
  auto: "Payment",
  retry: "Retry",
  owner: "You",
  remove: "Removal",
  refund: "Refund",
  connect: "Connection",
  backfill: "History",
};

/**
 * Everything the sync did, newest first. Paged by the server: a school posting its
 * history writes thousands of these.
 */
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
        id: "what",
        header: "What happened",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-start gap-2">
            {row.original.status === "error" ? (
              <Badge variant="danger" className="shrink-0">
                Problem
              </Badge>
            ) : null}
            <span className="min-w-0">{row.original.message || "–"}</span>
          </div>
        ),
      },
      {
        id: "invoice",
        header: "Invoice",
        meta: { width: "7rem" },
        cell: ({ row }) =>
          row.original.invoiceId != null ? (
            <Link
              to="/billing"
              search={{ invoice: row.original.invoiceId } as never}
              className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              #{row.original.invoiceId}
            </Link>
          ) : (
            <span className="text-muted-foreground">–</span>
          ),
      },
      {
        id: "source",
        header: "From",
        meta: { width: "7rem" },
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {SOURCE_LABELS[row.original.triggeredBy] ?? row.original.triggeredBy}
          </span>
        ),
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
          body="Every post, removal and problem shows up here once sync starts."
        />
      </Card>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={rows}
      paging={paging}
      total={total}
      loading={q.isFetching}
      emptyMessage="No problems. Everything recent went through."
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Every post, removal and problem, newest first.</p>
          {filter}
        </div>
      }
      mobileCard={(e) => (
        <div className="space-y-1 p-4">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatDistanceToNow(parseISO(e.createdAt), { addSuffix: true })}</span>
            <span>{SOURCE_LABELS[e.triggeredBy] ?? e.triggeredBy}</span>
          </div>
          <div className="flex items-start gap-2 text-sm">
            {e.status === "error" ? <Badge variant="danger">Problem</Badge> : null}
            <span>{e.message || "–"}</span>
          </div>
        </div>
      )}
    />
  );
}
