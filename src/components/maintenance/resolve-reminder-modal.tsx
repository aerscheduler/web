/**
 * Sign an inspection off.
 *
 * The field that matters here is the METER READING, and it is not a formality: signing off
 * an hour-based inspection starts the next interval counting from the number entered. Put
 * today's reading on a 100-hour that was actually done 6 hours ago and the next one comes
 * due 6 hours late, silently, and stays wrong for the life of the aircraft.
 *
 * So it defaults to the current meter (the common case, the work just happened) but is
 * editable, and the helper text says what the number is for rather than what it is.
 */

import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useResolveMaintenanceReminder } from "@/features/queries";
import type { MaintenanceReminder } from "@/types/api";
import { fromDeciHours } from "@/lib/maintenance";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ResolveReminderModal({
  reminder,
  open,
  onOpenChange,
}: {
  reminder: MaintenanceReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolve = useResolveMaintenanceReminder();
  const due = reminder?.due;
  const hourBased = due?.kind === "hours";

  const [completedAt, setCompletedAt] = React.useState(format(new Date(), "yyyy-MM-dd"));
  const [hours, setHours] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Re-seed each time a different reminder is opened, not once on mount: this modal is
  // reused across every row in the list, so mount-time state would carry one row's meter
  // reading onto the next one you open.
  React.useEffect(() => {
    if (!open || !reminder) return;
    setCompletedAt(format(new Date(), "yyyy-MM-dd"));
    setHours(due?.currentHours != null ? fromDeciHours(due.currentHours) : "");
    setNotes("");
  }, [open, reminder?.id, due?.currentHours]);

  if (!reminder) return null;

  const name = due?.name ?? reminder.template?.name ?? "this inspection";
  // "Tach", not "tach", it opens a label, and the Hobbs case reads capitalised either way.
  const meter = due?.basis === "hobbs" ? "Hobbs" : "Tach";
  const parsedHours = Number(hours);
  const hoursValid = !hourBased || (hours !== "" && Number.isFinite(parsedHours) && parsedHours >= 0);

  async function submit() {
    if (!reminder) return;
    try {
      await resolve.mutateAsync({
        id: reminder.id,
        // Midday, so a date-only answer can't land on the previous day once it is read back
        // in a timezone west of the server.
        completedAt: new Date(`${completedAt}T12:00:00`).toISOString(),
        completedHours: hourBased && hours !== "" ? Math.round(parsedHours * 10) : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Signed off.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't sign that off.");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Sign off"
      description={`Record ${name} as done.`}
    >
      <div data-doc-shot="sign-off-inspection-modal" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="resolve-date">Completed on</Label>
          <DatePickerField
            id="resolve-date"
            value={completedAt}
            onChange={setCompletedAt}
            max={format(new Date(), "yyyy-MM-dd")}
          />
        </div>

        {hourBased && (
          <div className="space-y-1.5">
            <Label htmlFor="resolve-hours">{meter} reading when the work was done</Label>
            <Input
              id="resolve-hours"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))}
              className="tnum"
              placeholder={due?.currentHours != null ? fromDeciHours(due.currentHours) : "0.0"}
            />
            <p className="text-xs text-muted-foreground">
              The next interval counts from this number, enter what the meter read at the
              work, not today&rsquo;s reading, or the next one comes due early.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="resolve-notes">Notes</Label>
          <Textarea
            id="resolve-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Work order number, who signed it, anything worth keeping."
          />
        </div>

        {due?.grounds && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            This one grounds the aircraft. Signing it off returns the tail to service, unless
            something else is still holding it.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!hoursValid || resolve.isPending}>
            {resolve.isPending ? "Signing off…" : "Sign off"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
