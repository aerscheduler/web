/**
 * The fleet, by aircraft, with what each tail owes.
 *
 * The mechanic's own words: "on the maintenance page, airplane, and then you can click to
 * each one and see what inspections are needed and when they are due." So the entry point
 * is the AIRCRAFT, not a flat list of every reminder in the school — which is what this
 * page led with, and which is unreadable the moment you have eight tails and seven
 * inspections apiece.
 *
 * Cards are sorted worst-first and carry the single most urgent item, because the useful
 * shape of this screen is a triage list: the tails needing attention rise to the top and
 * the rest read as a wall of green you can skip past.
 */

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, PlaneTakeoff, Wrench } from "lucide-react";
import type { MaintenanceReminder, Resource } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useMaintenanceReminders, usePlanes } from "@/features/queries";
import { dueAmount, dueDetail, dueTone, fleetSummary, fromDeciHours } from "@/lib/maintenance";
import { cn } from "@/lib/utils";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const ACCENT: Record<string, string> = {
  danger: "bg-destructive",
  warning: "bg-[var(--warning)]",
  success: "bg-[var(--success)]",
  muted: "bg-border",
};

export function FleetStatus({ q: search, resourceId }: { q?: string; resourceId?: number[] }) {
  const planesQ = usePlanes();
  // Unresolved only: a signed-off item is history, and counting it here would leave a card
  // reading "3 tracked" forever while the shop closed all three out.
  const remindersQ = useMaintenanceReminders({ resolved: false });

  const cards = useMemo(() => {
    const planes = planesQ.data ?? [];
    const reminders = remindersQ.data ?? [];

    const byResource = new Map<number, MaintenanceReminder[]>();
    for (const r of reminders) {
      const id = r.resource?.id;
      if (id == null) continue;
      const list = byResource.get(id);
      if (list) list.push(r);
      else byResource.set(id, [r]);
    }

    const needle = search?.trim().toLowerCase();
    return planes
      .filter((p) => {
        if (resourceId?.length && !resourceId.includes(p.id)) return false;
        if (!needle) return true;
        const { name } = resourceLabel(p);
        const plane = p.type?.plane;
        return [name, plane?.make, plane?.model].some((v) => v?.toLowerCase().includes(needle));
      })
      .map((plane) => ({ plane, summary: fleetSummary(byResource.get(plane.id) ?? []) }))
      .sort((a, b) => {
        // Grounded first regardless of what's due — an aircraft that isn't flying is the
        // top of anyone's list, and its reminders may all be green precisely because a
        // squawk is what took it off the line.
        const groundedA = a.plane.type?.plane?.grounded ? 0 : 1;
        const groundedB = b.plane.type?.plane?.grounded ? 0 : 1;
        if (groundedA !== groundedB) return groundedA - groundedB;
        const urgencyA = a.summary.next?.due?.urgency ?? 99;
        const urgencyB = b.summary.next?.due?.urgency ?? 99;
        if (urgencyA !== urgencyB) return urgencyA - urgencyB;
        return resourceLabel(a.plane).name.localeCompare(resourceLabel(b.plane).name);
      });
  }, [planesQ.data, remindersQ.data, search, resourceId]);

  if (planesQ.isLoading || remindersQ.isLoading) return <CardGridSkeleton count={6} />;

  if (planesQ.error || remindersQ.error) {
    return (
      <Card className="min-h-0 flex-1 p-0">
        <ErrorState
          error={planesQ.error ?? remindersQ.error}
          onRetry={() => {
            void planesQ.refetch();
            void remindersQ.refetch();
          }}
        />
      </Card>
    );
  }

  if (cards.length === 0) {
    return (
      <Card className="min-h-0 flex-1 p-0">
        <EmptyState
          icon={PlaneTakeoff}
          title={search ? "No matches" : "No aircraft yet"}
          body={
            search
              ? "Nothing in the fleet matches that."
              : "Add a tail and its inspections will have something to hang off."
          }
        />
      </Card>
    );
  }

  return (
    // Sized by a MINIMUM CARD WIDTH rather than a column count. Fixed breakpoints assumed
    // the full page width, and once the nav rail took ~15rem of it three columns squeezed
    // every card until the inspection name and its "was due" line both ellipsed — which
    // removes exactly the two facts the card exists to show. `auto-fill` drops to fewer
    // columns instead of shrinking past what the content needs.
    <div
      data-doc-shot="maintenance-by-aircraft"
      className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]"
    >
      {cards.map(({ plane, summary }) => (
        <AircraftCard key={plane.id} plane={plane} summary={summary} />
      ))}
    </div>
  );
}

function AircraftCard({
  plane,
  summary,
}: {
  plane: Resource;
  summary: ReturnType<typeof fleetSummary>;
}) {
  const meta = plane.type?.plane;
  const grounded = meta?.grounded ?? false;
  const next = summary.next;
  const tone = grounded ? "danger" : summary.total === 0 ? "muted" : summary.tone;

  return (
    <Link
      to="/aircraft/$resourceId"
      params={{ resourceId: String(plane.id) }}
      className="group relative flex overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-accent/30"
    >
      {/* The status rail carries the whole verdict at a glance, so a wall of these reads as
          a colour scan before a single word is read. */}
      <span className={cn("w-1 shrink-0", ACCENT[tone])} aria-hidden />

      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-mono text-sm font-semibold">
                {resourceLabel(plane).name}
              </span>
              {grounded && <Badge variant="danger">Grounded</Badge>}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[meta?.make, meta?.model].filter(Boolean).join(" ") || "Aircraft"}
              {meta && (
                <>
                  {" · "}
                  <span className="tabular-nums">{fromDeciHours(meta.tachTime)}</span> tach
                </>
              )}
            </p>
          </div>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {summary.overdue > 0 && <Badge variant="danger">{summary.overdue} overdue</Badge>}
          {summary.dueSoon > 0 && <Badge variant="warning">{summary.dueSoon} due soon</Badge>}
          {summary.total === 0 ? (
            <span className="text-xs text-muted-foreground">Nothing tracked yet</span>
          ) : (
            summary.overdue === 0 &&
            summary.dueSoon === 0 && <Badge variant="success">All current</Badge>
          )}
        </div>

        {/* Naming the next item is the difference between "something's wrong here" and
            "the annual is 9 days out" — one of those you can act on without clicking. */}
        {next && (
          <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Wrench className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs font-medium">
                  {next.due?.name ?? next.template?.name ?? "Next inspection"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {dueDetail(next.due)}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                dueTone(next.due) === "danger"
                  ? "text-destructive"
                  : dueTone(next.due) === "warning"
                    ? "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]"
                    : "text-foreground"
              )}
            >
              {dueAmount(next.due)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
