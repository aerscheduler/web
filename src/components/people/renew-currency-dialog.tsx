import { useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import type { Currency, Role } from "@/types/api";
import { useRenewCurrency } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { DatePickerField } from "@/components/date-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

function todayYmd() {
  return format(new Date(), "yyyy-MM-dd");
}

/** Local calendar day → ISO at noon UTC (stable across DST for a date-only sign-off). */
function ymdToIso(ymd: string): string {
  return parseISO(`${ymd}T12:00:00`).toISOString();
}

/**
 * Who may press Sign off / Renew for this currency type. Mirrors
 * `CurrencyService.canRenewCurrency` intent for UI gating; the server is the source of truth.
 * `isOwningMember` must be true for `canRenewSelf` to apply.
 */
export function canOfferRenew(
  currency: Currency,
  roles: Role[],
  isAdmin: boolean,
  isOwningMember: boolean
): boolean {
  if (isAdmin) return true;
  const t = currency.currencyType;
  if (!t) return false;
  if (roles.includes("dispatcher") && t.dispatcherCanRenew) return true;
  if (roles.includes("instructor") && t.instructorCanRenew) return true;
  if (isOwningMember && t.canRenewSelf) return true;
  return false;
}

/** Document-gated types renew via upload on mobile — don't fake a bare sign-off. */
export function isDocumentGated(currency: Currency): boolean {
  return (currency.currencyType?.documentTypes?.length ?? 0) > 0;
}

export function RenewCurrencyDialog({
  currency,
  open,
  onOpenChange,
}: {
  currency: Currency | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const renew = useRenewCurrency();
  const [startedYmd, setStartedYmd] = useState(todayYmd);

  const needsReview = currency?.renewedBy == null;
  const title = needsReview ? "Sign off currency" : "Renew currency";
  const name = currency?.currencyType?.name ?? "Currency";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setStartedYmd(todayYmd());
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {needsReview
              ? `Record the first sign-off for ${name}. Booking treats a currency without a signer as not current.`
              : `Reset the clock on ${name} from the start date you choose.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-1">
          <Label htmlFor="currency-started">Start date</Label>
          <DatePickerField
            id="currency-started"
            value={startedYmd}
            onChange={setStartedYmd}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!currency || !startedYmd || renew.isPending}
            onClick={async () => {
              if (!currency) return;
              try {
                await renew.mutateAsync({
                  currencyId: currency.id,
                  startedAt: ymdToIso(startedYmd),
                });
                toast.success(needsReview ? "Currency signed off." : "Currency renewed.");
                onOpenChange(false);
              } catch (e) {
                toast.error(
                  e instanceof ApiError ? e.message : "Couldn't update this currency."
                );
              }
            }}
          >
            {renew.isPending ? "Saving…" : needsReview ? "Sign off" : "Renew"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
