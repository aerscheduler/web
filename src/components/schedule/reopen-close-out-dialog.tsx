import { useEffect, useState } from "react";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Matches the server's cap in `reopenCloseOut`, and `cancellationReason` beside it. */
const REASON_MAX_LENGTH = 200;

/**
 * Reopening a close-out, with the reason the server requires.
 *
 * A PROMPT RATHER THAN A PLAIN CONFIRM, because this is the only record that a signature
 * was taken off a flight. "Somebody reopened it" answers none of the questions a school
 * asks a year later, so the reason is required here exactly as it is on a cancellation, and
 * it lands on the booking's audit line.
 *
 * The description says how many sign-offs go, because the person doing this is usually not
 * the person whose PIN is about to be cleared, and a guest booking is worded separately: it
 * has no sign-offs to count, so the pilot wording would read "All 0 sign-offs".
 */
export function ReopenCloseOutDialog({
  open,
  onOpenChange,
  onConfirm,
  signOffCount,
  isGuest,
  isBusy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  signOffCount: number;
  isGuest: boolean;
  isBusy?: boolean;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const trimmed = reason.trim();

  const what = isGuest
    ? "This guest flight will go back to needing a close-out, and you will need to close it out again once you’ve made your changes."
    : signOffCount === 1
      ? "The one sign-off on this flight will be cleared, and it will need confirming again once you’ve made your changes."
      : `All ${signOffCount} sign-offs on this flight will be cleared, and every pilot will need to confirm again once you’ve made your changes.`;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Reopen this close-out?"
      description={`${what} Nothing else about the booking changes.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(trimmed)}
            disabled={isBusy || trimmed.length === 0}
          >
            Reopen
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="reopen-reason">Why are you reopening it?</Label>
        <Textarea
          id="reopen-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX_LENGTH))}
          placeholder="Hobbs was typed 2812.5 instead of 2812.0"
          rows={3}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Kept on this flight&rsquo;s record, with your name against it.
        </p>
      </div>
    </ResponsiveModal>
  );
}
