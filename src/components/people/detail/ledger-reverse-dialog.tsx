import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReverseLedgerFlightCharge } from "@/features/queries";
import { ApiError } from "@/lib/api";
import type { LedgerEntry } from "@/types/api";

/**
 * Reverse a flight charge, which is what makes the flight behind it correctable again.
 *
 * WHY THIS EXISTS. Correcting a recorded reading is refused while live money stands against
 * the booking. For a school billing through Stripe the way through has always existed and is
 * what the product tells you to do: void the invoice, correct, re-confirm, re-bill. For a
 * school on the account LEDGER there was no way through at all, because the charge posts by
 * itself the moment the last pilot enters their PIN, so the booking locks on the same tap
 * that finishes it. The product still said "reverse the ledger charge on the member's
 * billing tab", and no such action existed anywhere: not here, not in the app, not as a
 * route. The reopen feature therefore did nothing whatsoever for a ledger school, which is
 * the kind of school that reported the bug in the first place.
 *
 * WORDED AROUND THE CONSEQUENCE, not the mechanism. Somebody reaching for this is not
 * thinking "post an opposing entry", they are thinking "I need to fix the Hobbs on that
 * flight", so the dialog says what it gives back and what it costs the member's balance.
 */
export function LedgerReverseDialog({
  orgUserId,
  entry,
  open,
  onOpenChange,
}: {
  orgUserId: number | null;
  entry: LedgerEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [memo, setMemo] = useState("");
  const reverse = useReverseLedgerFlightCharge(orgUserId);

  useEffect(() => {
    if (open) setMemo("");
  }, [open, entry?.id]);

  if (!entry) return null;

  //A charge is stored negative (it draws the balance down), so the credit going back is its
  //absolute value. Showing the signed figure here read as taking money away again.
  const amount = Math.abs(entry.amountCents ?? 0) / 100;

  async function submit() {
    if (!entry) return;
    try {
      await reverse.mutateAsync({ entryId: entry.id, memo: memo.trim() || undefined });
      //DO NOT PROMISE THE CORRECTION. Reversing this charge removes ONE reason the flight was
      //locked, and there can be others: another payer on the same booking still holding a
      //live charge or invoice (each lives on a different person's ledger page, and nothing
      //here can see them), or a booking that was cancelled after it flew, which both new
      //endpoints refuse outright. Saying "the flight can be corrected now" sent an admin off
      //having given real money back on a promise this dialog cannot keep.
      toast.success("Charge reversed.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reverse the charge");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this charge?</DialogTitle>
          <DialogDescription>
            {`$${amount.toFixed(2)} goes back on the member's balance.`}
          </DialogDescription>
        </DialogHeader>

        {/* WHICH CHARGE. The dialog used to identify it by dollar amount alone, and a member's
            ledger can hold several identical rows in a row: three consecutive flight charges
            of exactly the same figure is an ordinary week at a school with a standard rate.
            This moves real money and is deliberately irreversible in the other direction, so
            the confirm step has to give somebody something to notice a misclick with. */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <div className="font-medium text-foreground">{entry.memo ?? "Flight charge"}</div>
          <div className="mt-0.5 text-muted-foreground">
            {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : "Date unknown"}
            {entry.reservationId ? ` · Booking #${entry.reservationId}` : ""}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ledger-reverse-memo">Why (optional)</Label>
          <Input
            id="ledger-reverse-memo"
            value={memo}
            maxLength={200}
            placeholder="Hobbs was typed wrong"
            onChange={(e) => setMemo(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {/* The ledger never rewrites money, and saying so here stops somebody
                expecting the original line to disappear and then reversing it twice. */}
            The original charge stays on the statement with the reversal beside it. If this was
            the only money against the flight, it becomes correctable; where several people
            share a booking, each of their charges has to come off before it does.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reverse.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={reverse.isPending}>
            {reverse.isPending ? "Reversing…" : "Reverse charge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
