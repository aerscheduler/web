import { Link } from "@tanstack/react-router";
import { useWorkOrders } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { isOpenWorkOrder, workOrderAircraftName, workOrderStatusVariant } from "@/lib/work-orders";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** How many finished jobs the card lists before it stops; the aircraft's tab has the rest. */
const PAST_SHOWN = 5;

/**
 * The jobs billed to this person, open first, so the desk answering "where is my aeroplane?"
 * finds it on the customer's own record, including a job on an aircraft they do not own.
 * Only for somebody who may open work orders. On a member who has never been billed for shop
 * work (`onlyIfAny`) it draws nothing at all.
 */
export function PersonWorkOrders({ orgUserId, onlyIfAny = false }: { orgUserId: number; onlyIfAny?: boolean }) {
  const { roles } = useAuth();
  const allowed = canOpenWorkOrders(roles);
  const q = useWorkOrders({ state: "all", billToOrgUserId: orgUserId }, { enabled: allowed });
  if (!allowed) return null;
  const rows = q.data ?? [];
  if (onlyIfAny && (q.isPending || rows.length === 0)) return null;

  const open = rows.filter(isOpenWorkOrder).sort((a, b) => a.number - b.number);
  const finishedOn = (w: (typeof rows)[number]) => w.closedAt ?? w.completedAt ?? w.openedAt;
  const finished = rows.filter((w) => !isOpenWorkOrder(w));
  const past = finished.sort((a, b) => finishedOn(b).localeCompare(finishedOn(a)) || b.number - a.number).slice(0, PAST_SHOWN);
  // The rest are one click away, never silently missing: the finished board, searched by name.
  const hidden = finished.length - past.length;
  const name = rows.find((w) => w.billTo?.name)?.billTo?.name ?? null;

  return (
    <DetailCard title="Work orders" description="Jobs billed to them, open first." docShot="person-work-orders">
      {q.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <CardEmpty>No work orders billed to them yet.</CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {[...open, ...past].map((w) => (
            <li key={w.id}>
              <Link
                to="/maintenance/work-orders/$workOrderId"
                params={{ workOrderId: String(w.id) }}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-accent/30"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm font-medium">
                    {w.label} <span className="font-sans font-normal text-muted-foreground">{workOrderAircraftName(w)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{w.complaint || "No request written"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tnum text-xs text-muted-foreground">{formatDate(finishedOn(w), "MMM d, yyyy", "")}</span>
                  <Badge variant={workOrderStatusVariant(w.status)}>{w.statusLabel}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <Link
          to="/maintenance"
          search={{ view: "work-orders-closed", ...(name ? { q: name } : {}) } as never}
          className="mt-2 inline-block text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {hidden} more finished {hidden === 1 ? "job" : "jobs"}
        </Link>
      )}
    </DetailCard>
  );
}
