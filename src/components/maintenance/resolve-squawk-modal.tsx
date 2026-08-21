import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useResolveSquawk } from "@/features/queries";
import { resourceLabel, type Squawk } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { DatePickerField } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Mirrors the Flutter resolve sheet's 600-character cap on the notes field. */
const NOTES_MAX = 600;

/**
 * Sign off a squawk. The server REQUIRES `completedAt`: when the work was
 * actually finished, and separately stamps `resolvedAt` itself, so this can't
 * be a bare confirm dialog. Fields match the Flutter resolve sheet (completed
 * date + notes) so a mechanic sees the same form on either surface.
 */
export function ResolveSquawkModal({
  squawk,
  open,
  onOpenChange,
}: {
  squawk: Squawk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const resolve = useResolveSquawk();

  const [completedAt, setCompletedAt] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Re-seed each time it opens: the work is usually being signed off the day
  // it was finished, so today is the right default, but it stays editable for
  // a job that got written up late.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setCompletedAt(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
      setShowErrors(false);
      setFormError(null);
    }
    wasOpen.current = open;
  }, [open]);

  const errors = {
    completedAt: !completedAt ? "Pick the date the work was completed." : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!squawk || resolve.isPending) return;
    if (invalid) {
      setShowErrors(true);
      document.getElementById("resolve-completed-at")?.focus();
      return;
    }
    setFormError(null);

    try {
      await resolve.mutateAsync({
        id: squawk.id,
        action: "resolve",
        // Date-only input; send an instant the server can store.
        completedAt: new Date(`${completedAt}T12:00:00`).toISOString(),
        notes,
      });
      toast.success("Squawk resolved.");
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Couldn't resolve that squawk.";
      setFormError(msg);
      toast.error(msg);
    }
  }

  const resource = squawk?.resource ? resourceLabel(squawk.resource).name : null;

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit"
                form="modal-resolve-squawk-modal" disabled={resolve.isPending}>
              {resolve.isPending ? "Resolving…" : "Resolve squawk"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="Resolve squawk"
      description="Sign off the write-up and record what was done."
    >
      <form id="modal-resolve-squawk-modal" data-doc-shot="resolve-squawk-modal" onSubmit={submit} className="space-y-4">
        {squawk && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{squawk.title || "Untitled squawk"}</p>
            {resource && <p className="text-muted-foreground">{resource}</p>}
            {squawk.grounding && (
              <p className="mt-1 text-xs text-muted-foreground">
                This squawk grounded the aircraft, resolving it doesn&rsquo;t return it to
                service on its own.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="resolve-completed-at">Completed</Label>
          <DatePickerField
            id="resolve-completed-at"
            value={completedAt}
            onChange={setCompletedAt}
            invalid={showErrors && !!errors.completedAt}
          />
          {showErrors && errors.completedAt && (
            <p className="text-xs text-destructive">{errors.completedAt}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="resolve-notes">Notes</Label>
          <Textarea
            id="resolve-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            placeholder="What was done to clear it…"
            rows={5}
          />
          <p className="text-right text-xs text-muted-foreground tnum">
            {notes.length}/{NOTES_MAX}
          </p>
        </div>

        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

      </form>
    </ResponsiveModal>
  );
}
