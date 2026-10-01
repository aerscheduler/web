import { useMaintenanceReminders, useSquawk, useWorkOrderApprovals } from "@/features/queries";
import type { WorkOrder, WorkOrderItem } from "@/types/api";
import { formatDate, formatMoney } from "@/lib/utils";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Signing off an item's inspection, or resolving its squawk, through the SAME forms the rest of
 * the console uses: those are the only paths that write a compliance record, roll the next due
 * forward and unground the aircraft. The item then reads done from them.
 */
export function SignOffLinked({ workOrder, item, onDone }: { workOrder: WorkOrder; item: WorkOrderItem | null; onDone: () => void }) {
  const remindersQ = useMaintenanceReminders({ resourceId: workOrder.aircraft.id, resolved: false }, { enabled: !!item?.inspection });
  const squawkQ = useSquawk(item?.squawk?.id ?? null);
  const reminder = item?.inspection ? ((remindersQ.data ?? []).find((r) => r.id === item.inspection!.id) ?? null) : null;
  const squawk = item?.squawk ? (squawkQ.data ?? null) : null;
  return (
    <>
      <ResolveReminderModal reminder={reminder} open={!!item?.inspection && reminder != null} onOpenChange={(o) => !o && onDone()} />
      <ResolveSquawkModal squawk={squawk} open={!!item?.squawk && squawk != null} onOpenChange={(o) => !o && onDone()} />
    </>
  );
}

/** The phone calls with the owner, newest first: who, when, the limit, and what was decided. */
export function WorkOrderAnswersCard({ workOrder }: { workOrder: WorkOrder }) {
  const q = useWorkOrderApprovals(workOrder.id);
  const calls = q.data ?? [];
  return (
    <DetailCard title="Owner's answers" description="Calls recorded on this job." docShot="work-order-answers">
      {q.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : calls.length === 0 ? (
        <CardEmpty>No calls recorded yet.</CardEmpty>
      ) : (
        <ul className="space-y-3">
          {calls.map((c) => {
            const counts = c.items.reduce<Record<string, number>>((acc, i) => (i.decision ? { ...acc, [i.decision]: (acc[i.decision] ?? 0) + 1 } : acc), {});
            return (
              <li key={c.id} className="text-[13px]">
                <p className="font-medium">{c.contactName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(c.contactedAt, "MMM d, yyyy 'at' h:mm a", "")}
                  {c.recordedBy?.name ? `, recorded by ${c.recordedBy.name}` : ""}
                </p>
                <p className="mt-1 text-[12px]">
                  {(["approved", "declined", "deferred"] as const)
                    .filter((d) => counts[d])
                    .map((d) => `${counts[d]} ${d}`)
                    .join(", ") || "Nothing decided"}
                  {c.spendLimitCents != null ? `. Limit ${formatMoney(c.spendLimitCents)}` : ""}
                </p>
                {c.notes && <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{c.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </DetailCard>
  );
}
