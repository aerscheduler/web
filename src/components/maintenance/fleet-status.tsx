/**
 * The fleet, by aircraft, with what each tail owes.
 *
 * The mechanic's own words: "on the maintenance page, airplane, and then you can click to
 * each one and see what inspections are needed and when they are due." So the entry point
 * is the AIRCRAFT, not a flat list of every reminder in the school, which is what this
 * page led with, and which is unreadable the moment you have eight tails and seven
 * inspections apiece.
 *
 * A grouped list since 2026-09-30 (it was a grid of cards): one row per tail, its open
 * inspections folded beneath it, grouped by the tail's state worst-first. Grounded leads,
 * then Overdue, Due soon, Current and Not tracked. The useful shape of this screen is a
 * triage list, so the tails needing attention open themselves and the current ones start
 * folded, a wall of green you can skip past.
 *
 * Grounded is a group of its own although it is a separate axis from the inspection bands
 * (an aircraft is off the line for reasons that have nothing to do with an inspection): a
 * tail sits in exactly one group, and an aircraft that is not flying is the top of anyone's
 * list. Its inspection counts still show as tags on its row.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, PlaneTakeoff, Plus } from "lucide-react";
import type { MaintenanceReminder, Resource } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useMaintenanceReminder, useMaintenanceReminders, usePlanes } from "@/features/queries";
import { InspectionDetailSheet } from "@/components/maintenance/inspection-detail";
import { fleetSummary, fromDeciHours } from "@/lib/maintenance";
import { EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { AddInspectionsModal } from "@/components/maintenance/add-inspections-modal";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { ReminderFilesSheet } from "@/components/maintenance/reminder-files-sheet";
import {
  BandDot,
  DueFigure,
  DueRail,
  FilesIconButton,
  InspectionTags,
  SignOffButton,
  dueBand,
  dueSentence,
  inspectionName,
} from "@/components/maintenance/inspection-list";

/**
 * Where a tail stands on its inspections, worst first. `tailBucket` in lib/maintenance has
 * four of these; this list adds "unstarted" between Due soon and Current, because a tail
 * carrying an item nobody can count down is not known to be current, and filing it there
 * would fold a problem away under a green dot. The page's Status filter offers the same five.
 */
export type TailState = "overdue" | "dueSoon" | "unstarted" | "current" | "untracked";

export function tailState(items: MaintenanceReminder[]): TailState {
  if (items.length === 0) return "untracked";
  const bands = items.map((r) => dueBand(r.due));
  if (bands.includes("overdue")) return "overdue";
  if (bands.includes("dueSoon")) return "dueSoon";
  if (bands.includes("unstarted")) return "unstarted";
  return "current";
}

/** A tail's group: grounded first, whatever its inspections say, then its state. */
type TailGroup = "grounded" | TailState;

const TAIL_GROUPS: { id: TailGroup; label: string; marker: React.ReactNode }[] = [
  // Amber with a sign rather than red: grounded is a state, and red is kept for errors.
  { id: "grounded", label: "Grounded", marker: <AlertTriangle className="size-3.5 text-warning" aria-hidden /> },
  { id: "overdue", label: "Overdue", marker: <BandDot color="var(--warning)" /> },
  { id: "dueSoon", label: "Due soon", marker: <BandDot color="color-mix(in oklch, var(--warning) 45%, var(--muted-foreground))" /> },
  { id: "unstarted", label: "Needs a reading or date", marker: <BandDot color="var(--muted-foreground)" /> },
  { id: "current", label: "Current", marker: <BandDot color="var(--success)" /> },
  { id: "untracked", label: "Not tracked", marker: <BandDot color="var(--border)" /> },
];

const COLUMNS: ListTableColumn[] = [
  // On a tail's row, which inspection comes due first; on an inspection's, when it is due.
  { id: "detail", width: "12rem" },
  { id: "rail", width: "3.5rem", narrow: "hide" },
  { id: "due", width: "6.5rem", align: "end", narrow: "keep" },
  { id: "action", width: "9rem", align: "end" },
];
/** Below this the columns would squeeze the names out: they fold under the title instead. */
const NARROW_AT = 800;

export function FleetStatus({
  q: search,
  resourceId,
  fleetStatus,
  grounded,
  canManage = false,
  toolbar,
  openId = null,
  onOpenId,
}: {
  q?: string;
  resourceId?: number[];
  /** Tail states to keep, from `tailState`. Empty or absent means all of them. */
  fleetStatus?: string[];
  /** Off the line, on it, or (undefined) either. Its own axis, see `tailBucket`. */
  grounded?: boolean;
  /** May set inspections up and sign them off. Same gate as the page's own buttons. */
  canManage?: boolean;
  /** The list's toolbar: the page's Group by. */
  toolbar?: React.ReactNode;
  /** The inspection in the side panel, held in the URL (`open`). */
  openId?: number | null;
  onOpenId?: (id: number | null) => void;
}) {
  const navigate = useNavigate();
  // The tail whose "Track inspections" was pressed. The modal takes a `fixedResource`, so
  // opening it from a row answers "which aircraft" before it is asked.
  const [addingFor, setAddingFor] = useState<Resource | null>(null);
  const [resolving, setResolving] = useState<MaintenanceReminder | null>(null);
  const [filesFor, setFilesFor] = useState<MaintenanceReminder | null>(null);
  //Customer aircraft included: what is due on them is the shop's actual workload.
  const planesQ = usePlanes({ scope: "all" });
  // Unresolved only: a signed-off item is history, and counting it here would leave a row
  // reading "3 tracked" forever while the shop closed all three out.
  const remindersQ = useMaintenanceReminders({ resolved: false });

  const tails = useMemo(() => {
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
      .map((plane) => {
        const live = (byResource.get(plane.id) ?? []).filter((r) => r.resolvedAt == null);
        return {
          plane,
          summary: fleetSummary(live),
          items: [...live].sort((a, b) => (a.due?.urgency ?? 99) - (b.due?.urgency ?? 99)),
        };
      })
      // Filtered BEFORE the counts are derived, on purpose: the group counts say what is on
      // screen, so filtering to "overdue" says 2 rather than restating the whole fleet.
      .filter(({ plane, items }) => {
        if (grounded !== undefined && (plane.type?.plane?.grounded ?? false) !== grounded) {
          return false;
        }
        if (fleetStatus?.length && !fleetStatus.includes(tailState(items))) return false;
        return true;
      })
      .sort((a, b) => {
        const urgencyA = a.summary.next?.due?.urgency ?? 99;
        const urgencyB = b.summary.next?.due?.urgency ?? 99;
        if (urgencyA !== urgencyB) return urgencyA - urgencyB;
        return resourceLabel(a.plane).name.localeCompare(resourceLabel(b.plane).name, undefined, { numeric: true });
      });
  }, [planesQ.data, remindersQ.data, search, resourceId, fleetStatus, grounded]);

  const groups = useMemo<ListTableGroup[]>(() => {
    const groupOf = (t: (typeof tails)[number]): TailGroup =>
      t.plane.type?.plane?.grounded ? "grounded" : tailState(t.items);
    return TAIL_GROUPS.map((g) => {
      const members = tails.filter((t) => groupOf(t) === g.id);
      return {
        id: g.id,
        label: g.label,
        marker: g.marker,
        count: members.length,
        rows: members.map(({ plane, summary, items }): ListTableRow => {
          const meta = plane.type?.plane;
          const name = resourceLabel(plane).name;
          const next = summary.next;
          return {
            id: `tail-${plane.id}`,
            testId: `fleet-tail-${plane.id}`,
            label: `${name}, ${g.label}`,
            emphasis: true,
            // A real link, so a middle or cmd click opens the aircraft in a new tab.
            title: (
              <Link
                to="/aircraft/$resourceId"
                params={{ resourceId: String(plane.id) }}
                className="font-mono underline-offset-2 hover:underline"
              >
                {name}
              </Link>
            ),
            subtitle: (
              <>
                {[meta?.make, meta?.model].filter(Boolean).join(" ") || "Aircraft"}
                {meta && <> · <span className="tnum">{fromDeciHours(meta.tachTime)}</span> tach</>}
              </>
            ),
            // The counts the group name leaves out: a grounded tail may also be overdue, an
            // overdue one may have more coming due behind it.
            tags:
              summary.overdue || summary.dueSoon ? (
                <>
                  {summary.overdue > 0 && <ListTag dot="var(--warning)">{summary.overdue} overdue</ListTag>}
                  {summary.dueSoon > 0 && <ListTag>{summary.dueSoon} due soon</ListTag>}
                </>
              ) : undefined,
            // A tail that is fine starts folded; one that needs a look starts open.
            defaultFolded: g.id === "current",
            onOpen: () => void navigate({ to: "/aircraft/$resourceId", params: { resourceId: String(plane.id) } }),
            cells: {
              detail: next ? (
                <span className="text-muted-foreground">
                  Next: <span className="text-foreground">{inspectionName(next)}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Nothing tracked yet</span>
              ),
              rail: next ? <DueRail due={next.due} /> : null,
              due: next ? <DueFigure due={next.due} /> : null,
              // The commonest state on a fleet nobody has set up yet, and the AVIATES set is
              // two taps from here, so the way out sits on the row that names the problem.
              action:
                summary.total === 0 && canManage ? (
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAddingFor(plane)}>
                    <Plus className="size-3.5" /> Track inspections
                  </Button>
                ) : null,
            },
            children: items.map(
              (r): ListTableRow => ({
                id: `reminder-${r.id}`,
                testId: `fleet-reminder-${r.id}`,
                label: `${inspectionName(r)}, ${name}`,
                // A click peeks in the side panel; a double click opens the inspection's page.
                selected: r.id === openId,
                onOpen: onOpenId ? () => onOpenId(r.id) : undefined,
                onOpenPage: () =>
                  void navigate({ to: "/maintenance/inspections/$inspectionId", params: { inspectionId: String(r.id) } }),
                title: inspectionName(r),
                tags: <InspectionTags reminder={r} filesShown={canManage} />,
                cells: {
                  detail: (
                    <span className="text-muted-foreground" title={dueSentence(r.due)}>
                      {dueSentence(r.due)}
                    </span>
                  ),
                  rail: <DueRail due={r.due} />,
                  due: <DueFigure due={r.due} />,
                  // Both visible, not in the hover-only slot: the front desk runs this on an iPad.
                  action: canManage ? (
                    <span className="inline-flex items-center gap-0.5">
                      <FilesIconButton reminder={r} onFiles={setFilesFor} />
                      <SignOffButton reminder={r} onSignOff={setResolving} />
                    </span>
                  ) : null,
                },
              })
            ),
          };
        }),
      };
    });
  }, [tails, canManage, navigate, openId, onOpenId]);

  // The panel's up and down walk the inspections in the order they are drawn.
  const ordered = useMemo(() => {
    const ids: number[] = [];
    for (const g of groups) for (const row of g.rows) for (const c of row.children ?? []) ids.push(Number(c.id.replace("reminder-", "")));
    return ids;
  }, [groups]);
  const viewing = useMemo(
    () => (remindersQ.data ?? []).find((r) => r.id === openId) ?? null,
    [remindersQ.data, openId]
  );
  const recordQ = useMaintenanceReminder(openId != null && !viewing ? openId : null);
  const step = (delta: -1 | 1) => {
    const i = ordered.indexOf(openId ?? -1);
    if (i === -1) return;
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + delta))];
    if (next != null) onOpenId?.(next);
  };

  if (planesQ.isLoading || remindersQ.isLoading) {
    return <ListTableSkeleton fill columns={COLUMNS} narrowAt={NARROW_AT} toolbar={false} showHeader={false} groups={3} rows={3} className="min-h-0 flex-1" />;
  }

  if (planesQ.error || remindersQ.error) {
    return (
      <Card className="flex flex-col min-h-0 flex-1 p-0">
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
  // list. Grounded plus Not tracked would otherwise claim nothing in the fleet is
  // untracked, on a fleet where seven tails are, because none of the grounded ones are.
  const onlyStatusNarrows =
    !!fleetStatus?.length && !search && grounded === undefined && !resourceId?.length;

  if (tails.length === 0) {
    return (
      <Card className="flex flex-col min-h-0 flex-1 p-0">
        <EmptyState
          icon={PlaneTakeoff}
          graphic={filtered ? undefined : "aircraft"}
          title={filtered ? "No matches" : "No aircraft yet"}
          body={
            onlyStatusNarrows
              ? "No aircraft in the fleet is in that state right now."
              : filtered
                ? "No aircraft matches those filters."
                : "Add a tail and its inspections will have something to hang off."
          }
          docs={filtered ? undefined : "add-an-aircraft"}
        />
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4">
      {/* No summary line above the list any more: it counted a grounded tail as overdue too,
          so it disagreed with the groups below, which put each tail in exactly one. */}
      <ListTable
        fill
        label="Aircraft and their inspections"
        docShot="maintenance-by-aircraft"
        className="min-h-0"
        columns={COLUMNS}
        groups={groups}
        narrowAt={NARROW_AT}
        childNoun="inspections"
        toolbar={toolbar}
      />

      {canManage && (
        <AddInspectionsModal
          open={!!addingFor}
          onOpenChange={(o) => !o && setAddingFor(null)}
          fixedResource={addingFor}
        />
      )}
      {onOpenId && (
        <InspectionDetailSheet
          reminder={viewing ?? recordQ.data ?? null}
          open={openId != null}
          onOpenChange={(o) => !o && onOpenId(null)}
          onSignOff={
            canManage
              ? (r) => {
                  onOpenId(null);
                  setResolving(r);
                }
              : undefined
          }
          onFiles={canManage ? setFilesFor : undefined}
          onStep={step}
        />
      )}
      <ResolveReminderModal reminder={resolving} open={resolving != null} onOpenChange={(o) => !o && setResolving(null)} />
      <ReminderFilesSheet reminder={filesFor} open={filesFor != null} onOpenChange={(o) => !o && setFilesFor(null)} />
    </div>
  );
}
