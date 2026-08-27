/**
 * Change which aircraft an inspection covers, and where each new tail starts counting from.
 *
 * TWO THINGS THIS HAS TO GET RIGHT, both of which are silent when they go wrong.
 *
 * 1. The endpoint is a REPLACE, not a merge. `PATCH /maintenance/reminders/templates/:id`
 *    takes the complete list of tails the rule should end up on; anything left off is
 *    disconnected AND its unresolved reminder is deleted outright. Nothing in the request
 *    or the response says so. A picker that just showed ticks would let somebody untick a
 *    tail to "tidy up" and quietly bin its open annual, so removals are named on screen
 *    before the button is pressed and confirmed again after.
 *
 * 2. A newly attached tail starts its interval TODAY at TODAY'S METER unless the caller
 *    says otherwise. That default is right for an aircraft that just had the work done and
 *    wrong for every aircraft a school already operates: attach a 100-hour to a tail that
 *    is 60 hours in and, left blank, the first reminder lands 60 hours late. The console
 *    offered this at creation time only, so an inspection that already existed could never
 *    be attached correctly from a desk. The phone has had it under Maintenance since the
 *    beginning (`edit_resources_for_reminder_template_bottom_sheet.dart`).
 *
 * The start fields are offered for NEWLY ADDED tails only, and that is not an oversight:
 * the server reads `startHour` / `startDate` when it CONNECTS a resource and ignores them
 * for one already on the template. Rendering an editable box that silently discards what
 * you type would be worse than not having one, so an attached tail shows what it is
 * actually counting from, read-only, and says how to change it.
 */

import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import {
  useMaintenanceReminderTemplate,
  usePlanes,
  useUpdateMaintenanceReminderTemplate,
} from "@/features/queries";
import { fromDeciHours, intervalLabel } from "@/lib/maintenance";
import { cn, formatDate } from "@/lib/utils";
import { resourceLabel, type MaintenanceReminderTemplate, type Resource } from "@/types/api";
import { useConfirm } from "@/components/confirm-dialog";
import { DatePickerField } from "@/components/date-picker";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the interval is counted in, which decides which start field is meaningful.
 *
 * "both" is a combined interval, and it needs BOTH: a meter reading to start the hour clock
 * and a date to start the calendar one. Collecting only one leaves the other clock with
 * nothing to count from, and it silently never comes due.
 */
type Basis = "hours" | "days" | "both" | "date";

const basisOf = (t: MaintenanceReminderTemplate): Basis =>
  t.remindHours && t.remindDays ? "both" : t.remindHours ? "hours" : t.remindDays ? "days" : "date";

type StartDraft = { date: string; hours: string };

const EMPTY: StartDraft = { date: "", hours: "" };

export function EditCoverageModal({
  template,
  open,
  onOpenChange,
}: {
  template: MaintenanceReminderTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirm = useConfirm();
  const update = useUpdateMaintenanceReminderTemplate();
  const planesQ = usePlanes({}, { enabled: open });
  // The row handed in comes off the templates LIST, which carries `resources` but not the
  // reminders. Re-read the template so an already-attached tail can show what it is really
  // counting from rather than a blank.
  const detailQ = useMaintenanceReminderTemplate(open ? (template?.id ?? null) : null);

  const detail = detailQ.data ?? null;
  const basis = template ? basisOf(template) : "date";

  // The tails on the template when this opened. Read off the fresh copy when it lands, so
  // a second agent's change in another tab can't make this send a stale replace list.
  const attached = React.useMemo(
    () => (detail?.resources ?? template?.resources ?? []).map((r) => r.id),
    [detail?.resources, template?.resources]
  );

  const [selected, setSelected] = React.useState<number[]>([]);
  const [starts, setStarts] = React.useState<Record<number, StartDraft>>({});
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Seeding follows the reads until the user touches something, then stops dead.
  //
  // Two reads land here: the list row this was opened from, and the authoritative re-read.
  // Following the second one matters, or a tail another agent attached a moment ago is
  // missing from the list this sends back and gets silently detached. Freezing on first
  // touch matters just as much: React Query refetches on window focus, and an earlier
  // version of this re-seeded whenever the selection was empty, so unticking every
  // aircraft and glancing at another window put them all back. Emptying the list is a
  // supported action here (it has its own confirm), so it must survive a refetch.
  const wasOpen = React.useRef(false);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      touched.current = false;
      setStarts({});
      setFormError(null);
    }
    wasOpen.current = open;
  }, [open]);

  React.useEffect(() => {
    if (open && !touched.current) setSelected(attached);
  }, [open, attached]);

  const fleet = planesQ.data ?? [];
  const added = selected.filter((id) => !attached.includes(id));
  const removed = attached.filter((id) => !selected.includes(id));

  const nameOf = React.useCallback(
    (id: number) => {
      const fromFleet = fleet.find((r) => r.id === id);
      const fromTemplate = (detail?.resources ?? template?.resources ?? []).find(
        (r) => r.id === id
      );
      const r = fromFleet ?? fromTemplate;
      return r ? resourceLabel(r).name : `Aircraft ${id}`;
    },
    [fleet, detail?.resources, template?.resources]
  );

  function toggle(id: number) {
    touched.current = true;
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function setStart(id: number, patch: Partial<StartDraft>) {
    touched.current = true;
    setStarts((s) => ({ ...s, [id]: { ...(s[id] ?? EMPTY), ...patch } }));
  }

  /** The starting point an attached tail is actually counting from, for the read-only line. */
  function currentStart(resourceId: number): string | null {
    const reminder = (detail?.reminders ?? []).find(
      (r) => r.resolvedAt == null && r.resource?.id === resourceId
    );
    if (!reminder) return null;
    const meter =
      reminder.startHours == null
        ? null
        : `${fromDeciHours(reminder.startHours)} ${template?.hourBasedOn === "hobbs" ? "Hobbs" : "tach"}`;
    const when = reminder.startedAt ? formatDate(reminder.startedAt) : null;

    if (basis === "both") {
      const parts = [meter, when].filter(Boolean);
      return parts.length ? `from ${parts.join(", ")}` : null;
    }
    if (basis === "hours") return meter ? `from ${meter}` : null;
    return when ? `from ${when}` : null;
  }

  const errors = React.useMemo(() => {
    const out: Record<number, string> = {};
    for (const id of added) {
      const draft = starts[id];
      if (!draft) continue;
      if (draft.hours !== "" && !Number.isFinite(Number(draft.hours))) {
        out[id] = "That isn't a number.";
      } else if (draft.hours !== "" && Number(draft.hours) < 0) {
        out[id] = "A meter reading can't be negative.";
      }
    }
    return out;
  }, [added, starts]);

  const firstInvalid = added.find((id) => errors[id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!template || busy) return;

    if (firstInvalid != null) {
      document.getElementById(`coverage-hours-${firstInvalid}`)?.focus();
      return;
    }

    if (selected.length === 0 && attached.length > 0) {
      // Legal, and almost never meant: the rule survives with nothing on it and stops
      // coming due entirely. Say that, rather than letting it read as "deleted".
      const ok = await confirm({
        title: "Take this inspection off every aircraft?",
        description:
          "The rule stays set up but tracks nothing, so it never comes due again. Every open inspection it created is deleted.",
        confirmLabel: "Remove all",
        destructive: true,
      });
      if (!ok) return;
    } else if (removed.length > 0) {
      const ok = await confirm({
        title:
          removed.length === 1
            ? `Stop tracking ${nameOf(removed[0]!)}?`
            : `Stop tracking ${removed.length} aircraft?`,
        description:
          removed.length === 1
            ? `Its open inspection is deleted. Work already signed off stays on the record.`
            : `${removed.map(nameOf).join(", ")} will be detached and the open inspection on each is deleted. Work already signed off stays on the record.`,
        confirmLabel: "Remove and save",
        destructive: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    setFormError(null);
    try {
      await update.mutateAsync({
        id: template.id,
        templateResources: selected.map((id) => {
          // Start values only mean anything on a CONNECT, so only send them there. An
          // already-attached tail goes over as a bare id, which is what keeps it attached.
          if (!added.includes(id)) return { id };
          const draft = starts[id] ?? EMPTY;
          return {
            id,
            ...(draft.date ? { startDate: new Date(`${draft.date}T12:00:00`).toISOString() } : {}),
            ...(draft.hours !== "" ? { startHour: Math.round(Number(draft.hours) * 10) } : {}),
          };
        }),
      });
      toast.success("Coverage updated.");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't update that inspection.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit"
                form="modal-edit-coverage-modal" disabled={busy}>
              {busy ? "Saving…" : "Save coverage"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Which aircraft this covers"
      description={template?.name ?? "Attach or detach tails, and set where a new one starts."}
    >
      <form id="modal-edit-coverage-modal" onSubmit={submit} className="space-y-4">
        {template && (
          <p className="text-[13px] text-muted-foreground">{intervalLabel(template)}</p>
        )}

        {planesQ.isPending || detailQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : fleet.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No aircraft yet. Add a tail first and this will have something to hang off.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Aircraft</Label>
              <div className="flex flex-wrap gap-1.5">
                {fleet.map((p) => (
                  <TailChip
                    key={p.id}
                    resource={p}
                    on={selected.includes(p.id)}
                    wasOn={attached.includes(p.id)}
                    onClick={() => toggle(p.id)}
                  />
                ))}
              </div>
            </div>

            {/* Naming the tails, not counting them. "2 aircraft will be removed" is a
                number somebody has to go and reconstruct; the tail numbers are the thing
                they can actually check against what they meant to do. */}
            {removed.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {removed.map(nameOf).join(", ")} will stop being tracked.
                  </p>
                  <p>
                    The open inspection on {removed.length === 1 ? "it" : "each"} is deleted,
                    not archived. Anything already signed off stays on the record.
                  </p>
                </div>
              </div>
            )}

            {added.length > 0 && basis !== "date" && (
              <div className="space-y-2.5 rounded-lg border border-border p-3">
                <div>
                  <Label className="text-xs">When was it last done?</Label>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Per aircraft, for the {added.length === 1 ? "tail" : "tails"} you just
                    added. Leave blank and the countdown starts today at{" "}
                    {basis === "days" ? "today's date" : basis === "hours" ? "that aircraft's current meter" : "today's date and that aircraft's current meter"},
                    which is right if the work was just done and wrong on a tail already
                    partway through its interval.
                  </p>
                </div>

                {added.map((id) => (
                  <div key={id} className="space-y-1.5">
                    <Label
                      htmlFor={basis === "days" ? `coverage-date-${id}` : `coverage-hours-${id}`}
                      className="font-mono text-[11px] text-muted-foreground"
                    >
                      {nameOf(id)}
                    </Label>
                    {/* A combined interval gets both boxes: one clock each. */}
                    <div className={cn(basis === "both" && "grid gap-1.5 sm:grid-cols-2")}>
                      {basis !== "days" && (
                        <Input
                          id={`coverage-hours-${id}`}
                          inputMode="decimal"
                          value={starts[id]?.hours ?? ""}
                          onChange={(e) => setStart(id, { hours: e.target.value.replace(/[^0-9.]/g, "") })}
                          className="tnum"
                          placeholder={meterPlaceholder(fleet, id, template)}
                          aria-invalid={errors[id] ? true : undefined}
                        />
                      )}
                      {basis !== "hours" && (
                        <DatePickerField
                          id={`coverage-date-${id}`}
                          value={starts[id]?.date ?? ""}
                          onChange={(v) => setStart(id, { date: v })}
                          max={format(new Date(), "yyyy-MM-dd")}
                          placeholder="Starts today"
                        />
                      )}
                    </div>
                    {errors[id] && <p className="text-xs text-destructive">{errors[id]}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* What the tails already on the rule are counting from. Read-only for the
                reason in the file header: the server ignores start values for a resource
                it is not connecting, so an editable box here would eat what you typed. */}
            {attached.filter((id) => selected.includes(id)).length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground">
                    Already tracking. To correct where one of these starts counting, remove
                    it here and add it back with the right reading. That deletes its open
                    inspection and starts a fresh one.
                  </p>
                </div>
                <ul className="space-y-1">
                  {attached
                    .filter((id) => selected.includes(id))
                    .map((id) => (
                      <li key={id} className="flex items-baseline justify-between gap-3 text-[12px]">
                        <span className="font-mono text-muted-foreground">{nameOf(id)}</span>
                        <span className="tnum text-muted-foreground">
                          {currentStart(id) ?? "start not recorded"}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}

        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

      </form>
    </ResponsiveModal>
  );
}

/** The tail's current reading, so the placeholder shows what blank actually means. */
function meterPlaceholder(
  fleet: Resource[],
  id: number,
  template: MaintenanceReminderTemplate | null
): string {
  const plane = fleet.find((r) => r.id === id)?.type?.plane;
  if (!plane) return "Current reading";
  const deci = template?.hourBasedOn === "hobbs" ? plane.hobbsTime : plane.tachTime;
  return deci == null ? "Current reading" : `Now ${fromDeciHours(deci)}`;
}

function TailChip({
  resource,
  on,
  wasOn,
  onClick,
}: {
  resource: Resource;
  on: boolean;
  /** On the template when the modal opened, so an untick reads as a removal. */
  wasOn: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-xs font-medium transition-colors",
        on && "border-primary bg-primary/10 text-primary",
        !on && wasOn && "border-destructive/40 text-destructive line-through",
        !on && !wasOn && "text-muted-foreground hover:bg-accent"
      )}
    >
      {resourceLabel(resource).name}
    </button>
  );
}
