/**
 * The rules behind the reminders, what the mechanic called the "templates" page.
 *
 * His complaint was that it is "cluttered and hard to read with all the planes and
 * inspection reminders"and the cause is that the old screen mixed two different things
 * into one flat list: the RULE ("100-hour, every 100 tach hours") and its INSTANCES (where
 * every tail stands against it). Those answer different questions and belong on different
 * screens.
 *
 * So this is only the rules. One row per rule, grouped by how it's counted, with its
 * interval, its warning lead and which tails it covers. Where each tail actually stands is
 * one click away (on that tail's own page) which is where somebody is already looking
 * when they ask.
 *
 * A ListTable since 2026-09-30: the tails a rule covers fold beneath it as rows of their
 * own, closed until asked for, which is the "eleven chips on every row" problem solved by
 * the list itself rather than by a hand-built expander.
 */

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Gauge, MoreHorizontal, Pencil, PlaneTakeoff, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { MaintenanceReminderTemplate } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useDeleteMaintenanceReminderTemplate, useMaintenanceReminderTemplates } from "@/features/queries";
import { SOURCE_TYPE_LABELS, sourceBadge, sourceLabel, ruleDueLabel, warningLabel } from "@/lib/maintenance";
import { useConfirm } from "@/components/confirm-dialog";
import { EditCoverageModal } from "@/components/maintenance/edit-coverage-modal";
import { EditInspectionModal } from "@/components/maintenance/edit-inspection-modal";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableRow } from "@/components/list-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type GroupKey = "hours" | "days" | "both" | "date" | "none";

const GROUPS: { key: GroupKey; title: string; blurb: string; icon: typeof Gauge }[] = [
  { key: "hours", title: "On the meter", blurb: "Repeats every so many flying hours.", icon: Gauge },
  { key: "both", title: "Whichever comes first", blurb: "Repeats on the meter and the calendar.", icon: Gauge },
  { key: "days", title: "On the calendar", blurb: "Repeats every so many days or months.", icon: CalendarClock },
  { key: "date", title: "One-off", blurb: "Comes due once and doesn't come back.", icon: Wrench },
  // Only reachable through the API (a PATCH can clear the interval); said plainly, since a
  // rule with nothing to count never comes due and otherwise looks like any other.
  { key: "none", title: "No interval", blurb: "Never comes due until an interval is set.", icon: Wrench },
];

// Combined first: a template counting both clocks is neither a meter one nor a calendar
// one, and filing it under "On the meter" hides the half more likely to come due.
// A one-off meter deadline files under "One-off" with the dated ones: what makes it that
// group is that it happens once, not which clock it counts.
const groupOf = (t: MaintenanceReminderTemplate): GroupKey => {
  //A month interval is a CALENDAR interval. It carries a derived `remindDays` beside it today,
  //so reading only that would still land in the right group, but relying on the derived field
  //is how a template quietly falls into "One-off" the day that stops being true.
  const calendar = Boolean(t.remindDays || t.remindMonths);
  const interval = Boolean(t.remindHours) || calendar;
  if (t.remindAtHours != null || t.remindDate) return "date";
  if (!interval) return "none";
  // An interval rule that does not repeat (the API allows it) fires once and never rolls
  // forward: it is a one-off, whatever clock it counts on, not a recurring rule.
  if (!t.repeat) return "date";
  return t.remindHours && calendar ? "both" : t.remindHours ? "hours" : "days";
};


export function InspectionTemplates({
  q: search,
  canManage,
  onAdd,
}: {
  q?: string;
  canManage: boolean;
  onAdd: () => void;
}) {
  const q = useMaintenanceReminderTemplates();
  const [editing, setEditing] = useState<MaintenanceReminderTemplate | null>(null);
  const [editingDetails, setEditingDetails] = useState<MaintenanceReminderTemplate | null>(null);
  const confirm = useConfirm();
  const del = useDeleteMaintenanceReminderTemplate();

  async function remove(template: MaintenanceReminderTemplate) {
    const tails = template.resources ?? [];
    const ok = await confirm({
      title: `Delete "${template.name ?? "this inspection"}"?`,
      // Says exactly what is lost and what is kept. Deleting a template drops the OPEN
      // reminders on every tail it covers, a much bigger action than "delete a row" reads
      // as when it spans eleven aircraft.
      description:
        tails.length > 0
          ? `This stops tracking it on ${tails.length} aircraft. Work already signed off stays on the record.`
          : "Work already signed off stays on the record.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(template.id);
      toast.success("Inspection deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that.");
    }
  }
  const navigate = useNavigate();
  const rowActions: RowActions = {
    onOpenAircraft: (id) => void navigate({ to: "/aircraft/$resourceId", params: { resourceId: String(id) } }),
    onCoverage: setEditing,
    onDetails: setEditingDetails,
    onDelete: (t) => void remove(t),
    deleting: del.isPending,
  };

  const grouped = useMemo(() => {
    const needle = search?.trim().toLowerCase();
    // Name, notes, the rule it comes from, and the tails it covers: the placeholder promises
    // "aircraft or inspections", and the tails are rows on this view.
    const all = (q.data ?? []).filter((t) =>
      needle
        ? [t.name, t.notes, sourceLabel(t), ...(t.resources ?? []).map((r) => resourceLabel(r).name)].some((v) =>
            v?.toLowerCase().includes(needle)
          )
        : true
    );
    return GROUPS.map((g) => ({
      ...g,
      items: all.filter((t) => groupOf(t) === g.key).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    })).filter((g) => g.items.length > 0);
  }, [q.data, search]);

  if (q.isLoading) {
    return <ListTableSkeleton fill columns={TEMPLATE_COLUMNS} narrowAt={760} toolbar={false} groups={3} rows={3} className="mb-4 min-h-0 flex-1" />;
  }

  if (q.error) {
    return (
      <Card className="flex flex-col min-h-0 flex-1 p-0">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }

  if (grouped.length === 0) {
    return (
      <Card className="flex flex-col min-h-0 flex-1 p-0">
        <EmptyState
          icon={Wrench}
          graphic={search ? undefined : "inspections"}
          title={search ? "No matches" : "No inspections set up"}
          body={
            search
              ? "Nothing matches that."
              : "Add the AVIATES set and every aircraft you pick starts tracking its annual, 100-hour and the rest."
          }
          docs={search ? undefined : "track-inspections"}
          action={
            canManage && !search ? (
              <Button onClick={onAdd}>
                <Plus className="size-4" /> Add inspections
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-4">
      <ListTable
        fill
        label="Inspection rules"
        docShot="maintenance-set-up"
        className="min-h-0"
        columns={TEMPLATE_COLUMNS}
        groups={grouped.map((g) => ({
          id: g.key,
          label: (
            <span className="inline-flex items-center gap-2">
              <span>{g.title}</span>
              <span className="font-normal text-muted-foreground">{g.blurb}</span>
            </span>
          ),
          marker: <g.icon className="size-3.5 text-muted-foreground" aria-hidden />,
          count: g.items.length,
          rows: g.items.map((t) => templateRow(t, canManage, rowActions)),
        }))}
        showHeader
        titleHeader="Inspection"
        narrowAt={760}
        childNoun="aircraft"
      />
      {canManage && editing && (
        <EditCoverageModal template={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
      {canManage && editingDetails && (
        <EditInspectionModal template={editingDetails} open onOpenChange={(o) => !o && setEditingDetails(null)} />
      )}
    </div>
  );
}

const TEMPLATE_COLUMNS: ListTableColumn[] = [
  // "Comes due", not "Interval": a one-off says "Once, Mar 3, 2027", a deadline, not an interval.
  { id: "interval", header: "Comes due", width: "12rem" },
  { id: "warns", header: "Warning", width: "11rem" },
  { id: "aircraft", header: "Aircraft", width: "6.5rem", align: "end", narrow: "keep" },
];

type RowActions = {
  onOpenAircraft: (resourceId: number) => void;
  onCoverage: (t: MaintenanceReminderTemplate) => void;
  onDetails: (t: MaintenanceReminderTemplate) => void;
  onDelete: (t: MaintenanceReminderTemplate) => void;
  deleting: boolean;
};

function templateRow(t: MaintenanceReminderTemplate, canManage: boolean, act: RowActions): ListTableRow {
  const tails = t.resources ?? [];
  const name = t.name ?? "Untitled inspection";
  const source = sourceLabel(t);
  return {
    id: `template-${t.id}`,
    testId: `template-row-${t.id}`,
    label: name,
    title: name,
    // The rule's own facts. Whether it repeats is the group's to say: every non-repeating rule
    // files under One-off.
    tags:
      t.ground || sourceBadge(t) || tails.length === 0 ? (
        <>
          {t.ground && (
            <span title="Takes the aircraft off the line when it comes due.">
              <ListTag className="text-warning">Grounds</ListTag>
            </span>
          )}
          {sourceBadge(t) && (
            <span title={SOURCE_TYPE_LABELS[t.sourceType ?? ""]}>
              <ListTag>{sourceBadge(t)}</ListTag>
            </span>
          )}
          {/* An inert rule looks identical to a working one until somebody notices it never
              fires, so it says so on the row, not only when unfolded. */}
          {tails.length === 0 && (
            <span title="Not on any aircraft, so it never comes due.">
              <ListTag className="text-warning">On no aircraft</ListTag>
            </span>
          )}
        </>
      ) : undefined,
    subtitle:
      source || t.notes ? (
        <span title={t.notes ?? undefined}>
          {source &&
            (t.sourceUrl ? (
              // Somebody else's website, which will rot. Linked, never presented as though
              // we checked it.
              <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-foreground hover:underline">
                {source}
              </a>
            ) : (
              source
            ))}
          {source && t.notes && " · "}
          {t.notes}
        </span>
      ) : undefined,
    // The tails it covers, folded until asked for. A rule on none has nothing to unfold, so a
    // click on it goes straight to choosing them.
    defaultFolded: true,
    onOpen: tails.length === 0 && canManage ? () => act.onCoverage(t) : undefined,
    actions: canManage ? <TemplateMenu template={t} {...act} /> : undefined,
    cells: {
      interval: ruleDueLabel(t),
      warns: <span className="text-muted-foreground">{warningLabel(t)}</span>,
      aircraft:
        tails.length === 0 && canManage ? (
          // The fix for an inert rule, visible on its row rather than behind the menu.
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => act.onCoverage(t)}>
            <PlaneTakeoff className="size-3.5" /> Choose
          </Button>
        ) : (
          <span className={tails.length ? "tnum" : "text-muted-foreground"}>{tails.length}</span>
        ),
    },
    children: tails.map(
      (r): ListTableRow => ({
        id: `template-${t.id}-tail-${r.id}`,
        label: resourceLabel(r).name,
        onOpen: () => act.onOpenAircraft(r.id),
        title: (
          <Link to="/aircraft/$resourceId" params={{ resourceId: String(r.id) }} className="font-mono underline-offset-2 hover:underline">
            {resourceLabel(r).name}
          </Link>
        ),
      })
    ),
  };
}

function TemplateMenu({
  template,
  onOpenAircraft: _openAircraft,
  onCoverage,
  onDetails,
  onDelete,
  deleting,
}: { template: MaintenanceReminderTemplate } & RowActions) {
  const name = template.name ?? "this inspection";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`More for ${name}`}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* A component's life limit belongs to its aircraft and goes when the part comes off:
            the Components card moves or retires it, and the server refuses both here. */}
        {!template.componentClock && (
          <DropdownMenuItem onSelect={() => onCoverage(template)}>
            <PlaneTakeoff className="size-4" /> Choose aircraft
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onDetails(template)}>
          <Pencil className="size-4" /> Edit name, source and reminders
        </DropdownMenuItem>
        {!template.componentClock && (
          <DropdownMenuItem disabled={deleting} onSelect={() => onDelete(template)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
