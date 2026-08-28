/**
 * The fleet, by aircraft, with what each tail owes.
 *
 * The mechanic's own words: "on the maintenance page, airplane, and then you can click to
 * each one and see what inspections are needed and when they are due." So the entry point
 * is the AIRCRAFT, not a flat list of every reminder in the school, which is what this
 * page led with, and which is unreadable the moment you have eight tails and seven
 * inspections apiece.
 *
 * Cards are sorted worst-first and carry the single most urgent item, because the useful
 * shape of this screen is a triage list: the tails needing attention rise to the top and
 * the rest read as a wall of green you can skip past.
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, PlaneTakeoff, Plus, Wrench } from "lucide-react";
import type { MaintenanceReminder, Resource } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useMaintenanceReminders, usePlanes } from "@/features/queries";
import {
  dueAmount,
  dueDetail,
  dueTone,
  fleetSummary,
  fleetTotals,
  fromDeciHours,
  tailBucket,
} from "@/lib/maintenance";
import { cn } from "@/lib/utils";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";

const ACCENT: Record<string, string> = {
  danger: "bg-destructive",
  warning: "bg-[var(--warning)]",
  success: "bg-[var(--success)]",
  muted: "bg-border",
};

export function FleetStatus({
  q: search,
  resourceId,
  fleetStatus,
  grounded,
  canManage = false,
}: {
  q?: string;
  resourceId?: number[];
  /** Tail states to keep, from `tailBucket`. Empty or absent means all of them. */
  fleetStatus?: string[];
  /** Off the line, on it, or (undefined) either. Its own axis, see `tailBucket`. */
  grounded?: boolean;
  /** May set inspections up. Same gate as the page's own "Add inspections" button. */
  canManage?: boolean;
}) {
  // The tail whose empty card was clicked. The modal takes a `fixedResource`, so opening it
  // from a card answers "which aircraft" before it is asked.
  const [addingFor, setAddingFor] = useState<Resource | null>(null);
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
      // Filtered BEFORE the summary is derived, on purpose: the line above the grid counts
      // what is on screen, so filtering to "overdue" says "2 tails, 2 overdue" rather than
      // restating the whole fleet over a grid showing two cards.
      .filter(({ plane, summary }) => {
        if (grounded !== undefined && (plane.type?.plane?.grounded ?? false) !== grounded) {
          return false;
        }
        if (fleetStatus?.length && !fleetStatus.includes(tailBucket(summary))) return false;
        return true;
      })
      .sort((a, b) => {
        // Grounded first regardless of what's due, an aircraft that isn't flying is the
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
  }, [planesQ.data, remindersQ.data, search, resourceId, fleetStatus, grounded]);

  const totals = useMemo(
    () =>
      fleetTotals(
        cards.map(({ plane, summary }) => ({
          grounded: plane.type?.plane?.grounded ?? false,
          summary,
        }))
      ),
    [cards]
  );

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

  // A filter that hides everything must not read as an empty fleet, or somebody filters to
  // "Overdue", sees "No aircraft yet", and concludes the school has no aeroplanes.
  const filtered = !!search || !!fleetStatus?.length || grounded !== undefined || !!resourceId?.length;
  // The state-specific line is only TRUE when the state is the only thing narrowing the
  // grid. Grounded plus Not tracked would otherwise claim nothing in the fleet is
  // untracked, on a fleet where seven tails are, because none of the grounded ones are.
  const onlyStatusNarrows =
    !!fleetStatus?.length && !search && grounded === undefined && !resourceId?.length;

  if (cards.length === 0) {
    return (
      <Card className="min-h-0 flex-1 p-0">
        <EmptyState
          icon={PlaneTakeoff}
          title={filtered ? "No matches" : "No aircraft yet"}
          body={
            onlyStatusNarrows
              ? "No aircraft in the fleet is in that state right now."
              : filtered
                ? "No aircraft matches those filters."
                : "Add a tail and its inspections will have something to hang off."
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <FleetSummaryLine totals={totals} />

      {/* Sized by a MINIMUM CARD WIDTH rather than a column count. Fixed breakpoints assumed
          the full page width, and once the nav rail took ~15rem of it three columns squeezed
          every card until the inspection name and its "was due" line both ellipsed, which
          removes exactly the two facts the card exists to show. `auto-fill` drops to fewer
          columns instead of shrinking past what the content needs. */}
      <div
        data-doc-shot="maintenance-by-aircraft"
        className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]"
      >
        {cards.map(({ plane, summary }) => (
          <AircraftCard
            key={plane.id}
            plane={plane}
            summary={summary}
            onTrack={canManage ? () => setAddingFor(plane) : undefined}
          />
        ))}
      </div>

      {canManage && (
        <AddInspectionsModal
          open={!!addingFor}
          onOpenChange={(o) => !o && setAddingFor(null)}
          fixedResource={addingFor}
        />
      )}
    </div>
  );
}

/**
 * How the fleet stands, above the grid that details it.
 *
 * Only the states that are actually present are drawn. A line reading "0 overdue, 0 due
 * soon" every day is a line people stop reading, and then it is not there on the day it
 * says 3.
 */
function FleetSummaryLine({ totals }: { totals: ReturnType<typeof fleetTotals> }) {
  const tails = `${totals.tails} ${totals.tails === 1 ? "tail" : "tails"}`;

  if (totals.allClear) {
    return (
      <p
        data-doc-shot="maintenance-fleet-summary"
        className="text-xs text-muted-foreground"
      >
        <span className="font-medium text-foreground">{tails}</span>, everything current.
      </p>
    );
  }

  const parts: { key: string; label: string; className: string }[] = [];
  if (totals.grounded) {
    parts.push({
      key: "grounded",
      label: `${totals.grounded} grounded`,
      className: "text-destructive",
    });
  }
  if (totals.overdue) {
    parts.push({
      key: "overdue",
      label: `${totals.overdue} overdue`,
      className: "text-destructive",
    });
  }
  if (totals.dueSoon) {
    parts.push({
      key: "dueSoon",
      label: `${totals.dueSoon} due soon`,
      className: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
    });
  }
  if (totals.current) {
    parts.push({ key: "current", label: `${totals.current} current`, className: "" });
  }
  // Deliberately last and deliberately named. Seven untracked tails is the single biggest
  // number on a fleet nobody has set up yet, and it reads as "fine" everywhere else.
  if (totals.untracked) {
    parts.push({
      key: "untracked",
      label: `${totals.untracked} not tracked`,
      className: "",
    });
  }

  return (
    <p
      data-doc-shot="maintenance-fleet-summary"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground"
    >
      <span className="font-medium text-foreground">{tails}</span>
      {parts.map((part) => (
        <span key={part.key} className="flex items-center gap-1.5">
          <span aria-hidden className="text-muted-foreground/40">
            ·
          </span>
          <span className={cn("tabular-nums", part.className)}>{part.label}</span>
        </span>
      ))}
    </p>
  );
}

function AircraftCard({
  plane,
  summary,
  onTrack,
}: {
  plane: Resource;
  summary: ReturnType<typeof fleetSummary>;
  /** Set this tail's inspections up. Absent when the viewer may not. */
  onTrack?: () => void;
}) {
  const meta = plane.type?.plane;
  const grounded = meta?.grounded ?? false;
  const next = summary.next;
  const tone = grounded ? "danger" : summary.total === 0 ? "muted" : summary.tone;

  return (
    <div className="group relative flex overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-accent/30 focus-within:ring-2 focus-within:ring-ring">
      {/* The status rail carries the whole verdict at a glance, so a wall of these reads as
          a colour scan before a single word is read. */}
      <span className={cn("w-1 shrink-0", ACCENT[tone])} aria-hidden />

      {/* The whole card opens the aircraft, but the card also carries its own button now,
          and a button inside an anchor is invalid HTML that swallows the keyboard. So the
          anchor is a full-card overlay, the content ignores pointer events, and anything
          genuinely clickable lifts itself back above it. */}
      <Link
        to="/aircraft/$resourceId"
        params={{ resourceId: String(plane.id) }}
        className="absolute inset-0 z-0 rounded-xl"
        aria-label={`${resourceLabel(plane).name}, maintenance detail`}
      />

      <div className="pointer-events-none min-w-0 flex-1 p-3.5">
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
            // Was a grey sentence and a dead end. It is the commonest state on a fleet
            // nobody has set up yet (seven of eleven tails on the school this was built
            // against), and it named the problem while offering no way out of it. The
            // AVIATES set is two taps from here, so put it here.
            onTrack ? (
              <Button
                size="sm"
                variant="outline"
                className="pointer-events-auto relative z-10 h-7 px-2 text-xs"
                onClick={onTrack}
              >
                <Plus className="size-3.5" /> Track inspections
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Nothing tracked yet</span>
            )
          ) : (
            summary.overdue === 0 &&
            summary.dueSoon === 0 && <Badge variant="success">All current</Badge>
          )}
        </div>

        {/* Naming the next item is the difference between "something's wrong here" and
            "the annual is 9 days out", one of those you can act on without clicking. */}
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
    </div>
  );
}
