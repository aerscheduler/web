import * as React from "react";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
import { useConfirmReviewGuest } from "@/features/queries";
import type { ConfirmReviewGuestInput, Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Close out a guest reservation. Guests never confirm with a PIN, an admin, the instructor,
 * or the creator reviews the flight, which generates the invoice and emails it to the guest.
 * The guest's contact details are editable here so the invoice reaches the right inbox.
 */
export function ConfirmGuestReviewModal({
  open,
  onOpenChange,
  reservation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
}) {
  const confirm = useConfirm();
  const reviewGuest = useConfirmReviewGuest(reservation?.id ?? 0);
  const guest = reservation?.personnel?.guests?.[0] ?? null;

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(guest?.name ?? "");
      setEmail(guest?.email ?? "");
      setPhone(guest?.phone ?? "");
    }
    // Only reset when the drawer opens or the guest identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guest?.id]);

  const emailValid = email.trim().length === 0 || /.+@.+\..+/.test(email.trim());

  async function submit() {
    if (!reservation || !emailValid) return;
    const ok = await confirm({
      title: "Close out this guest flight?",
      description:
        "This finalizes the review and generates the invoice. The guest is emailed a link to pay. This can't be undone.",
      confirmLabel: "Close out & bill",
      cancelLabel: "Back",
      destructive: true,
    });
    if (!ok) return;

    const body: ConfirmReviewGuestInput = {};
    // Only send overrides when we have a guest row to update and something actually changed.
    if (
      guest?.id != null &&
      (name.trim() !== (guest.name ?? "") ||
        email.trim() !== (guest.email ?? "") ||
        phone.trim() !== (guest.phone ?? ""))
    ) {
      body.guestOverrides = {
        id: guest.id,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      };
    }

    try {
      await reviewGuest.mutateAsync(body);
      toast.success("Guest flight closed out, invoice sent");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't close out this flight");
    }
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={reviewGuest.isPending}
            >
              Cancel
            </Button>
            <Button type="submit"
                form="modal-confirm-guest-review-modal" disabled={!emailValid || reviewGuest.isPending}>
              {reviewGuest.isPending ? "Closing out…" : "Close out & bill"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="Close out guest flight"
      description="Review the flight and bill the guest. Confirm their details so the invoice reaches them."
    >
      <form id="modal-confirm-guest-review-modal"
        data-doc-shot="guest-close-out-modal"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="guest-name">Guest name</Label>
          <Input
            id="guest-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Guest name"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-email">Email for the invoice</Label>
          <Input
            id="guest-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="guest@example.com"
            aria-invalid={!emailValid}
            autoComplete="off"
          />
          {!emailValid && (
            <p className="text-xs text-destructive">Enter a valid email address.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-phone">Phone (optional)</Label>
          <Input
            id="guest-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
            autoComplete="off"
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Receipt className="mt-0.5 size-4 shrink-0" />
          <span>The guest gets an emailed invoice with a secure link to pay by card.</span>
        </div>

      </form>
    </ResponsiveModal>
  );
}
