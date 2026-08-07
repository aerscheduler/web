import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { MaintenanceReminder, Resource, Squawk } from "@/types/api";
import { useMaintenanceReminders, useSquawks } from "@/features/queries";
import { fleetSummary } from "@/lib/maintenance";
import { formatDate } from "@/lib/utils";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { InspectionRow } from "@/components/maintenance/inspection-row";
import { LogSquawkModal } from "@/components/maintenance/log-squawk-modal";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { SquawkDetailSheet } from "@/components/maintenance/squawk-detail-sheet";
import { VerifySquawkModal } from "@/components/maintenance/verify-squawk-modal";
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
  const [verifying, setVerifying] = useState<Squawk | null>(null);
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
        //Same viewers as resolve: the server lets admin or technician write either stamp,
        //and deliberately not a dispatcher.
        onVerify={
          canResolve
            ? (s) => {
                setViewing(null);
                setVerifying(s);
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
      <VerifySquawkModal
        squawk={verifying}
        open={verifying != null}
        onOpenChange={(o) => !o && setVerifying(null)}
      />
    </>
  );
}

/**
 * What's due on this tail, and how much is left on each.
 *
 * This is the panel a mechanic opens the page for. It answers, in order: is anything
 * overdue, what's next, and how much room is left before it is. The counts across the top
 * exist so that question is answered before you read a single row — on a fleet where most
 * tails are fine, the useful signal is "nothing here", and it should take no reading.
 *
 * Ordering is the server's `urgency`, not date order: an hour-based 100-hour has no due
 * date at all, so sorting on `dueAt` — which is what this panel used to do — silently
 * pushed every meter-based inspection to the bottom regardless of how close it was.
 */
export function ResourceReminders({
  resourceId,
  resource,
  canManage,
}: {
  resourceId: number;
  /** Passed so "Add" can fix the tail rather than asking which one you meant. */
  resource?: Resource;
  /** Admin or technician: can add inspections and sign them off. */
  canManage: boolean;
}) {
  const q = useMaintenanceReminders({ resourceId, resolved: false });
  const [adding, setAdding] = useState(false);
  const [resolving, setResolving] = useState<MaintenanceReminder | null>(null);

  // Already worst-first from the server. Re-deriving the order here is how this panel and
  // the Maintenance list end up disagreeing about which item matters most.
  const reminders = q.data ?? [];
  const summary = useMemo(() => fleetSummary(reminders), [reminders]);
  const shown = reminders.slice(0, SHOWN);

  return (
    <>
      <DetailCard
        title="Inspections"
        description="What's tracked on this aircraft and how much is left."
        action={
          canManage ? (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add
            </Button>
          ) : undefined
        }
      >
        {q.isPending ? (
          <CardSkeleton rows={3} />
        ) : q.isError ? (
          <CardEmpty>Couldn&apos;t load inspections.</CardEmpty>
        ) : reminders.length === 0 ? (
          <CardEmpty>
            Nothing tracked on this tail yet.
            {canManage && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="underline underline-offset-2"
                >
                  Add the standard AVIATES set
                </button>{" "}
                to get its annual, 100-hour and the rest on the clock.
              </>
            )}
          </CardEmpty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {summary.overdue > 0 && (
                <Badge variant="danger">
                  {summary.overdue} overdue
                </Badge>
              )}
              {summary.dueSoon > 0 && (
                <Badge variant="warning">{summary.dueSoon} due soon</Badge>
              )}
              {summary.overdue === 0 && summary.dueSoon === 0 && (
                <Badge variant="success">All current</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {summary.total} tracked
              </span>
            </div>

            <ul className="divide-y divide-border">
              {shown.map((m) => (
                <InspectionRow
                  key={m.id}
                  reminder={m}
                  action={
                    canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => setResolving(m)}>
                        Sign off
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </ul>

            {reminders.length > SHOWN && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                {reminders.length - SHOWN} more —{" "}
                <Link
                  to="/maintenance"
                  search={{ view: "reminders", resourceId: String(resourceId) }}
                  className="underline underline-offset-2"
                >
                  see all for this tail
                </Link>
                .
              </p>
            )}
          </>
        )}
      </DetailCard>

      {canManage && (
        <>
          <AddInspectionsModal
            open={adding}
            onOpenChange={setAdding}
            fixedResource={resource ?? null}
          />
          <ResolveReminderModal
            reminder={resolving}
            open={resolving != null}
            onOpenChange={(o) => !o && setResolving(null)}
          />
        </>
      )}
    </>
  );
}
