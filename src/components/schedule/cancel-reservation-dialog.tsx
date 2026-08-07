import { useEffect, useState } from "react";
import { useCancellationCategories } from "@/features/queries";
import type { CancelScope, Reservation } from "@/types/api";
import { describeSeries } from "@/types/api";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Cancelling a booking, with a reason worth recording.
 *
 * This replaces a plain "are you sure?" that sent the literal string "Cancelled from
 * dispatch board" as the reason for every cancellation the console ever made. Nobody
 * could report on that, which is exactly the complaint this answers.
 *
 * Two fields, deliberately, and BOTH required:
 *  - the **type** is a fixed list, because it is the only thing you can count. "wx",
 *    "weather" and "Weather" are three answers to the same question.
 *  - the **note** is free text, because the type never carries the detail a person
 *    actually needs later ("ceiling 600 overcast", "student called, car trouble").
 *
 * The server enforces both as of the same change, so this is no longer the only thing
 * standing between an empty note and the report.
 *
 * For a booking in a repeating series it also asks Google Calendar's question: this one,
 * this and all later, or the whole series.
 */

/** Matches CANCELLATION_REASON_MAX_LENGTH server-side, and the column behind it. */
const REASON_MAX_LENGTH = 200;

export type CancelSubmission = {
  reason: string;
  category: string;
  scope: CancelScope;
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
  const { data: categories } = useCancellationCategories();

  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<CancelScope>("this");
  const [touched, setTouched] = useState(false);

  //Reset every time it opens on a different booking, so a reason typed for one
  //cancellation can never be submitted against another.
  useEffect(() => {
    if (open) {
      setCategory("");
      setReason("");
      setScope("this");
      setTouched(false);
    }
  }, [open, reservation?.id]);

  if (!reservation) return null;

  const missingCategory = category === "";
  const missingReason = reason.trim() === "";

  const submit = () => {
    setTouched(true);
    if (missingCategory || missingReason) return;
    onConfirm({ reason: reason.trim(), category, scope });
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

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cancel-category">Reason type</Label>
            <Select value={category} onValueChange={setCategory}>
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
            {touched && missingCategory && (
              <p className="text-xs text-destructive">Pick what kind of cancellation this is.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">What happened?</Label>
            {/* A textarea rather than a single line: the field takes 200 characters now,
                and an input that scrolls sideways past what you typed reads as a much
                shorter field than it is. */}
            <Textarea
              id="cancel-reason"
              value={reason}
              rows={2}
              maxLength={REASON_MAX_LENGTH}
              placeholder="Ceiling 600 overcast at the field, forecast to lift after 1400"
              aria-invalid={touched && missingReason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                //Enter submits, Shift+Enter breaks the line — the textarea would
                //otherwise swallow the key that used to send this dialog.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div className="flex items-start justify-between gap-2">
              {touched && missingReason ? (
                <p className="text-xs text-destructive">Say briefly what happened.</p>
              ) : (
                <span />
              )}
              {/* Only once it's close enough to matter, so the dialog isn't nagging
                  somebody who typed four words. */}
              {reason.length > REASON_MAX_LENGTH - 40 && (
                <p className="shrink-0 text-xs text-muted-foreground">
                  {REASON_MAX_LENGTH - reason.length} left
                </p>
              )}
            </div>
          </div>

          {reservation.series && (
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
              {/* Said plainly, because "all" reaching backwards would be a nasty
                  surprise — it doesn't, and nobody should learn that by trying it. */}
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
          <Button variant="destructive" onClick={submit} disabled={isBusy}>
            {isBusy ? "Cancelling…" : "Cancel reservation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
