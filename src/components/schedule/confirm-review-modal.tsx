import * as React from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { useConfirmReview } from "@/features/queries";
import type { Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";

const PIN_LENGTH = 4;

/**
 * Sign off a flight review with the caller's PIN. When the last required pilot confirms,
 * the server finalizes the review and auto-generates the invoice.
 *
 * Typing a PIN is itself the deliberate act, so there is no second confirm dialog on top
 * of this one, chaining them made signing off a three-click sequence through two buttons
 * reading "Confirm review". The consequence is stated inline instead.
 */
export function ConfirmReviewModal({
  open,
  onOpenChange,
  reservation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
}) {
  const confirmReview = useConfirmReview(reservation?.id ?? 0);
  const [pin, setPin] = React.useState("");

  React.useEffect(() => {
    if (open) setPin("");
  }, [open]);

  const valid = pin.length === PIN_LENGTH;

  async function submit() {
    if (!reservation || !valid) return;
    try {
      await confirmReview.mutateAsync({ pin });
      toast.success("Review confirmed");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't confirm the review");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm review"
      description="Enter your confirmation PIN to sign off this flight."
    >
      <form
        data-doc-shot="confirm-review-pin-modal"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-2">
          {/* `block` matters: the PIN input is only w-28, so an inline <label> would
              let it sit on the same line, jammed against the label text. */}
          <Label htmlFor="review-pin" className="flex items-center gap-1.5">
            Confirmation PIN
            <DocsHint topic="confirmation-pin" />
          </Label>
          <Input
            id="review-pin"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.slice(0, PIN_LENGTH))}
            inputMode="text"
            maxLength={PIN_LENGTH}
            autoComplete="off"
            placeholder="1234"
            aria-invalid={pin.length > 0 && !valid}
            className="w-28 font-mono tracking-[0.4em]"
          />
          {pin.length > 0 && !valid && (
            <p className="text-xs text-destructive">
              PIN must be exactly {PIN_LENGTH} characters.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Set your {PIN_LENGTH}-character PIN under Account → Security.
          </p>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Signing off can&rsquo;t be undone. Once every assigned pilot has signed off, the
            invoice is generated automatically.
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirmReview.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || confirmReview.isPending}>
            {confirmReview.isPending ? "Confirming…" : "Confirm review"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
