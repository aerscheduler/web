import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Hammer, Plus } from "lucide-react";
import type { Resource } from "@/types/api";
import { useWorkOrders } from "@/features/queries";
import { formatDate } from "@/lib/utils";
import { isOpenWorkOrder, workOrderStatusVariant } from "@/lib/work-orders";
import { WorkOrderFormModal } from "@/components/maintenance/work-order-form-modal";
import { DocsHint } from "@/components/docs-hint";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * An aircraft's jobs, open and past (P3.6: the history lives on the aeroplane, not only on a
 * board reached from the other side of the app). The shop roles only, like the jobs themselves.
 */
export function ResourceWorkOrders({ resource }: { resource: Resource }) {
  const [opening, setOpening] = useState(false);
  const q = useWorkOrders({ state: "all", resourceId: resource.id });
  const rows = q.data ?? [];
  const open = rows.filter(isOpenWorkOrder).sort((a, b) => a.number - b.number);
  // Newest finish first, by the date the row shows, not by job number: a long annual opened in
  // August and finished today belongs above an oil change finished last week.
  const finishedOn = (w: (typeof rows)[number]) => w.closedAt ?? w.completedAt ?? w.openedAt;
  const past = rows.filter((w) => !isOpenWorkOrder(w)).sort((a, b) => finishedOn(b).localeCompare(finishedOn(a)) || b.number - a.number);

  const list = (items: typeof rows, empty: string) =>
    items.length === 0 ? (
      <CardEmpty>{empty}</CardEmpty>
    ) : (
      <ul className="divide-y divide-border">
        {items.map((w) => (
          <li key={w.id}>
            <Link
              to="/maintenance/work-orders/$workOrderId"
              params={{ workOrderId: String(w.id) }}
              className="flex items-center justify-between gap-3 py-2.5 hover:bg-accent/30"
            >
              <span className="min-w-0">
                <span className="block font-mono text-sm font-medium">{w.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[w.complaint, w.billTo?.name ? `Billed to ${w.billTo.name}` : null].filter(Boolean).join(" · ") || "No request written"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tnum text-xs text-muted-foreground">{formatDate(w.closedAt ?? w.completedAt ?? w.openedAt, "MMM d, yyyy", "")}</span>
                <Badge variant={workOrderStatusVariant(w.status)}>{w.statusLabel}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-4" data-doc-shot="aircraft-work-orders">
      <DetailCard
        title={
          <span className="inline-flex items-center gap-1">
            Open jobs
            <DocsHint topic="run-a-work-order" />
          </span>
        }
        description="What the shop is doing on this aircraft now."
        action={
          <Button size="sm" onClick={() => setOpening(true)}>
            <Plus className="size-4" /> Open a work order
          </Button>
        }
      >
        {q.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : (
          list(open, "No open jobs on this aircraft.")
        )}
      </DetailCard>
      <DetailCard title="Past jobs" description="Completed and cancelled, newest first.">
        {q.isLoading ? <Skeleton className="h-16 w-full" /> : q.isError ? null : list(past, "No finished jobs yet.")}
      </DetailCard>
      <WorkOrderFormModal open={opening} onOpenChange={setOpening} fixedResource={resource} />
    </div>
  );
}

export const WorkOrdersIcon = Hammer;
