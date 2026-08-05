import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { isPast } from "date-fns";
import { Plus } from "lucide-react";
import type { Resource, Squawk } from "@/types/api";
import { useMaintenanceReminders, useSquawks } from "@/features/queries";
import { formatDate } from "@/lib/utils";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { SquawkDetailSheet } from "@/components/maintenance/squawk-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SHOWN = 6;

/**
 * Open discrepancies on this tail.
 *
 * Grounding squawks sort first because they're the ones that took the aircraft
 * off the line — the rest are a to-do list, those are the reason it isn't flying.
 * Resolving stays behind the same modal the Maintenance page uses so the
 * completed-at / notes contract is written once.
 */
export function ResourceSquawks({
  resource,
  canResolve,
  canReport,
}: {
  resource: Resource;
  canResolve: boolean;
  canReport: boolean;
}) {
  const q = useSquawks({ resourceId: resource.id, resolved: false });
  const [logOpen, setLogOpen] = useState(false);
  const [resolving, setResolving] = useState<Squawk | null>(null);
  const [viewing, setViewing] = useState<Squawk | null>(null);

  const squawks = useMemo(() => {
    return [...(q.data ?? [])].sort((a, b) => {
      if (!!a.grounding !== !!b.grounding) return a.grounding ? -1 : 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
  }, [q.data]);

  const shown = squawks.slice(0, SHOWN);

  const step = (delta: -1 | 1) => {
    if (!viewing || shown.length === 0) return;
    const i = shown.findIndex((s) => s.id === viewing.id);
    if (i === -1) return;
    const next = shown[Math.min(shown.length - 1, Math.max(0, i + delta))];
    if (next) setViewing(next);
  };

  return (
    <>
      <DetailCard
        title="Open squawks"
        description="Discrepancies still outstanding on this aircraft."
        action={
          canReport ? (
            <Button variant="outline" size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="size-4" /> Log
            </Button>
          ) : undefined
        }
      >
        {q.isPending ? (
          <CardSkeleton rows={2} />
        ) : q.isError ? (
          <CardEmpty>Couldn&apos;t load squawks.</CardEmpty>
        ) : squawks.length === 0 ? (
          <CardEmpty>Nothing outstanding — this aircraft is clean.</CardEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0 transition-colors",
                  viewing?.id === s.id && "bg-muted/60"
                )}
              >
                <button
                  type="button"
                  onClick={() => setViewing(s)}
                  className="min-w-0 flex-1 text-left hover:opacity-80"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {s.title || "Untitled squawk"}
                    </span>
                    {s.grounding && <Badge variant="danger">Grounding</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Reported {formatDate(s.createdAt)}
                    {s.reportedBy?.user?.name ? ` by ${s.reportedBy.user.name}` : ""}
                  </div>
                </button>
                {canResolve && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setResolving(s)}
                  >
                    Resolve
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {squawks.length > SHOWN && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            {squawks.length - SHOWN} more open —{" "}
            <Link to="/maintenance" className="underline underline-offset-2">
              see Maintenance
            </Link>
            .
          </p>
        )}
      </DetailCard>

      <LogSquawkModal open={logOpen} onOpenChange={setLogOpen} fixedResource={resource} />
      <SquawkDetailSheet
        squawk={viewing}
        open={viewing != null}
        onOpenChange={(o) => !o && setViewing(null)}
        onResolve={
          canResolve
            ? (s) => {
                setViewing(null);
                setResolving(s);
              }
            : undefined
        }
        onStep={step}
      />
      <ResolveSquawkModal
        squawk={resolving}
        open={resolving != null}
        onOpenChange={(o) => !o && setResolving(null)}
      />
    </>
  );
}

/**
 * What's coming due on this tail. Overdue first — a 100-hour that lapsed last
 * week matters more than an annual three months out, and date order alone
 * wouldn't say so.
 */
export function ResourceReminders({ resourceId }: { resourceId: number }) {
  const q = useMaintenanceReminders({ resourceId, resolved: false });

  const reminders = useMemo(() => {
    return [...(q.data ?? [])].sort((a, b) => {
      // Nulls last: a reminder with no due date can't be overdue and can't be next.
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    });
  }, [q.data]);

  return (
    <DetailCard title="Maintenance due" description="Open reminders on this aircraft.">
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : q.isError ? (
        <CardEmpty>Couldn&apos;t load reminders.</CardEmpty>
      ) : reminders.length === 0 ? (
        <CardEmpty>Nothing scheduled.</CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {reminders.slice(0, SHOWN).map((m) => {
            const due = m.dueAt ? new Date(m.dueAt) : null;
            const overdue = due != null && isPast(due);
            return (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium">
                      {m.name || "Maintenance reminder"}
                    </span>
                    {overdue && <Badge variant="danger">Overdue</Badge>}
                  </div>
                  {m.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {m.description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {m.dueAt ? formatDate(m.dueAt) : "No due date"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DetailCard>
  );
}
