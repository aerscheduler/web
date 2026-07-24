import * as React from "react";
import { toast } from "sonner";
import { useConfirmReview } from "@/features/queries";
import type { Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PIN_LENGTH = 4;

/**
 * Sign off a flight review with the caller's PIN. When the last required pilot confirms,
 * the server finalizes the review and auto-generates the invoice — so the submit is gated
 * behind a destructive confirm.
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
  const confirm = useConfirm();
  const confirmReview = useConfirmReview(reservation?.id ?? 0);
  const [pin, setPin] = React.useState("");

  React.useEffect(() => {
    if (open) setPin("");
  }, [open]);

  const valid = pin.length === PIN_LENGTH;

  async function submit() {
    if (!reservation || !valid) return;
    const ok = await confirm({
      title: "Confirm this flight review?",
      description:
        "This signs off the review with your PIN. Once every assigned pilot has signed off, the invoice is generated automatically — this can't be undone.",
      confirmLabel: "Confirm review",
      cancelLabel: "Back",
      destructive: true,
    });
    if (!ok) return;
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
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="review-pin">Confirmation PIN</Label>
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
          <p className="text-xs text-muted-foreground">
            Set your {PIN_LENGTH}-character PIN under Account → Security.
          </p>
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
