import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useCancellationCategories } from "@/features/queries";
import type { CancelScope, Reservation } from "@/types/api";
import { describeSeries } from "@/types/api";
import { formatFeeCents, memberCancelLockInfo } from "@/lib/booking-policy";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Matches CANCELLATION_REASON_MAX_LENGTH server-side, and the column behind it. */
const REASON_MAX_LENGTH = 200;

export type CancelSubmission = {
  reason: string;
  category: string;
  scope: CancelScope;
  acceptLateCancelFee?: boolean;
};

export function CancelReservationDialog({
  reservation,
  open,
  onOpenChange,
  onConfirm,
  isBusy,
}: {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (submission: CancelSubmission) => void;
  isBusy?: boolean;
}) {
  const { organization, roles } = useAuth();
  const { data: categories } = useCancellationCategories();

  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<CancelScope>("this");
  const [acceptFee, setAcceptFee] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setCategory("");
      setReason("");
      setScope("this");
      setAcceptFee(false);
      setTouched(false);
    }
  }, [open, reservation?.id]);

  if (!reservation) return null;

  const staffOverride = roles.some(
    (r) =>
      r === "owner" ||
      r === "admin" ||
      r === "dispatcher" ||
      r === "technician" ||
      r === "instructor"
  );
  const lock = memberCancelLockInfo({
    start: reservation.start,
    cancelEditLockHours: organization?.bookingPolicy?.cancelEditLockHours,
    lateCancelFeeCents: organization?.bookingPolicy?.lateCancelFeeCents,
    staffOverride,
  });
  const memberLocked = lock.locked && !lock.staffOverride;
  const feeRequired =
    memberLocked && lock.feeCents != null && lock.feeCents > 0;
  const blockedWithoutFee = memberLocked && !feeRequired;

  const missingCategory = category === "";
  const missingReason = reason.trim() === "";
  const missingFeeAgree = feeRequired && !acceptFee;

  const submit = () => {
    setTouched(true);
    if (missingCategory || missingReason || missingFeeAgree || blockedWithoutFee) return;
    onConfirm({
      reason: reason.trim(),
      category,
      scope,
      ...(feeRequired ? { acceptLateCancelFee: true } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-doc-shot="cancel-reservation-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel this reservation?</DialogTitle>
          <DialogDescription>
            “{reservation.title}” will come off the board. Recording why is what makes the
            cancellation report worth reading.
          </DialogDescription>
        </DialogHeader>

        {blockedWithoutFee && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
            This booking starts in less than {lock.lockHours} hours, so you can&apos;t cancel
            it yourself. Call or message the front desk and they can take it off the board.
          </div>
        )}

        {feeRequired && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-sm">
              This booking starts in less than {lock.lockHours} hours. You can still cancel,
              but a {formatFeeCents(lock.feeCents!)} late-cancel fee will be charged.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={acceptFee}
                onCheckedChange={(v) => setAcceptFee(v === true)}
                className="mt-0.5"
              />
              <span>
                I agree to the {formatFeeCents(lock.feeCents!)} late-cancel fee
              </span>
            </label>
            {touched && missingFeeAgree && (
              <p className="text-xs text-destructive">
                Confirm the fee to cancel, or ask the front desk.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4">
          <div className="grid gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="cancel-category">Reason type</Label>
              <DocsHint topic="cancellation-reason" />
            </div>
            <Select
              value={category}
              onValueChange={setCategory}
              disabled={blockedWithoutFee}
            >
              <SelectTrigger id="cancel-category" aria-invalid={touched && missingCategory}>
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && missingCategory && !blockedWithoutFee && (
              <p className="text-xs text-destructive">Pick what kind of cancellation this is.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">What happened?</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              rows={2}
              maxLength={REASON_MAX_LENGTH}
              placeholder="Ceiling 600 overcast at the field, forecast to lift after 1400"
              aria-invalid={touched && missingReason}
              disabled={blockedWithoutFee}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="flex items-start justify-between gap-2">
              {touched && missingReason && !blockedWithoutFee ? (
                <p className="text-xs text-destructive">Say briefly what happened.</p>
              ) : (
                <span />
              )}
              {reason.length > REASON_MAX_LENGTH - 40 && (
                <p className="shrink-0 text-xs text-muted-foreground">
                  {REASON_MAX_LENGTH - reason.length} left
                </p>
              )}
            </div>
          </div>

          {reservation.series && !blockedWithoutFee && (
            <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                This is a repeating booking · {describeSeries(reservation.series)}
              </p>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as CancelScope)}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="this" id="scope-this" />
                  <Label htmlFor="scope-this" className="font-normal">
                    This booking only
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="following" id="scope-following" />
                  <Label htmlFor="scope-following" className="font-normal">
                    This and all later bookings
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="all" id="scope-all" />
                  <Label htmlFor="scope-all" className="font-normal">
                    All bookings in the series
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                Bookings that have already started are never cancelled.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
            Keep it
          </Button>
          {!blockedWithoutFee && (
            <Button variant="destructive" onClick={submit} disabled={isBusy}>
              {isBusy
                ? "Cancelling…"
                : feeRequired
                  ? `Cancel and pay ${formatFeeCents(lock.feeCents!)}`
                  : "Cancel reservation"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
