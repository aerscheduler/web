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
 */

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronDown, Gauge, PlaneTakeoff, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import type { MaintenanceReminderTemplate } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useDeleteMaintenanceReminderTemplate, useMaintenanceReminderTemplates } from "@/features/queries";
import { intervalLabel, warningLabel } from "@/lib/maintenance";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { EditCoverageModal } from "@/components/maintenance/edit-coverage-modal";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type GroupKey = "hours" | "days" | "both" | "date";

const GROUPS: { key: GroupKey; title: string; blurb: string; icon: typeof Gauge }[] = [
  { key: "hours", title: "On the meter", blurb: "Counted in flying hours.", icon: Gauge },
  { key: "both", title: "Whichever comes first", blurb: "Counted on the meter and the calendar.", icon: Gauge },
  { key: "days", title: "On the calendar", blurb: "Recurring every so many days.", icon: CalendarClock },
  { key: "date", title: "One-off", blurb: "A single date that doesn't come back.", icon: Wrench },
];

// Combined first: a template counting both clocks is neither a meter one nor a calendar
// one, and filing it under "On the meter" hides the half more likely to come due.
const groupOf = (t: MaintenanceReminderTemplate): GroupKey =>
  t.remindHours && t.remindDays ? "both" : t.remindHours ? "hours" : t.remindDays ? "days" : "date";

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

  const grouped = useMemo(() => {
    const needle = search?.trim().toLowerCase();
    const all = (q.data ?? []).filter((t) =>
      needle ? [t.name, t.notes].some((v) => v?.toLowerCase().includes(needle)) : true
    );
    return GROUPS.map((g) => ({
      ...g,
      items: all.filter((t) => groupOf(t) === g.key).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    })).filter((g) => g.items.length > 0);
  }, [q.data, search]);

  if (q.isLoading) return <CardGridSkeleton count={4} />;

  if (q.error) {
    return (
      <Card className="min-h-0 flex-1 p-0">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }

  if (grouped.length === 0) {
    return (
      <Card className="min-h-0 flex-1 p-0">
        <EmptyState
          icon={Wrench}
          title={search ? "No matches" : "No inspections set up"}
          body={
            search
              ? "Nothing matches that."
              : "Add the AVIATES set and every aircraft you pick starts tracking its annual, 100-hour and the rest."
          }
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
    <div data-doc-shot="maintenance-set-up" className="space-y-5">
      {grouped.map((group) => (
        <section key={group.key}>
          <div className="mb-2 flex items-center gap-2">
            <group.icon className="size-3.5 text-muted-foreground" />
            <h3 className="text-[13px] font-semibold">{group.title}</h3>
            <span className="text-xs text-muted-foreground">{group.blurb}</span>
          </div>
          <Card className="divide-y divide-border p-0">
            {group.items.map((t) => (
              <TemplateRow key={t.id} template={t} canManage={canManage} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function TemplateRow({
  template,
  canManage,
}: {
  template: MaintenanceReminderTemplate;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const del = useDeleteMaintenanceReminderTemplate();

  const tails = template.resources ?? [];

  async function remove() {
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

  return (
    <div className="px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium">
              {template.name ?? "Untitled inspection"}
            </span>
            {template.ground && (
              <Badge variant="danger" title="Takes the aircraft off the line when it comes due.">
                Grounds
              </Badge>
            )}
            {!template.repeat && <Badge variant="warning">One-off</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {intervalLabel(template)} · {warningLabel(template)}
          </p>
          {template.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.notes}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* The tail count is the number that made the old page unreadable when it was
              eleven chips on every row. Collapsed to a count, expanded on demand. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="gap-1 text-muted-foreground"
          >
            {tails.length} aircraft
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </Button>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`Choose which aircraft ${template.name ?? "this inspection"} covers`}
              title="Which aircraft this covers"
            >
              <PlaneTakeoff className="size-3.5" />
            </Button>
          )}
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={del.isPending}
              aria-label={`Delete ${template.name ?? "inspection"}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
          {tails.length === 0 ? (
            // An inert template looks identical to a working one until you notice it never
            // fires. Say it plainly, and offer the fix here rather than sending somebody to
            // a different page to apply it one tail at a time.
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Not on any aircraft, so it never comes due.
              </p>
              {canManage && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <PlaneTakeoff className="size-3.5" /> Choose aircraft
                </Button>
              )}
            </div>
          ) : (
            tails.map((r) => (
              <Link
                key={r.id}
                to="/aircraft/$resourceId"
                params={{ resourceId: String(r.id) }}
                className="rounded-full border px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent"
              >
                {resourceLabel(r).name}
              </Link>
            ))
          )}
        </div>
      )}

      {canManage && (
        <EditCoverageModal template={template} open={editing} onOpenChange={setEditing} />
      )}
    </div>
  );
}
