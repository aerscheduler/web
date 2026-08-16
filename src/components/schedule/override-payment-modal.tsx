import * as React from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { useOverrideReservationPayment } from "@/features/queries";
import type { Reservation, ReservationPaymentOverridesInput } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import { confirmationCount, reviewerCount, hasInstruction } from "./close-out";

/**
 * Price one booking by hand.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * TWO FIELDS, AND THE SERVER STORES FIVE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * `POST /reservations/:id/paymentOverrides` accepts `resourcePriceOverride` and
 * `totalPriceOverride` as well, writes them to the row, and then never looks at either
 * when it prices the invoice (`services/payment.ts` reads the two rates and
 * `instructorPriceOverride`, and nothing else). A dispatcher typing a total would watch it
 * save, watch the sheet close, and get an invoice for a different number. So the console
 * offers the rates the engine actually reads, and the flat instruction price is left to
 * the phone, which is where the one existing user of it lives.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * IT COSTS THE SIGN-OFFS, AND SAYS SO BEFORE YOU PRESS IT
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Saving a rate deletes every review confirmation collected on this booking, because the
 * pilots signed off a different price. That is the server's behaviour and it is correct,
 * but discovering it afterwards means telling two people to go and re-enter their PIN. The
 * count is stated in the sheet before the button is pressed.
 *
 * And once the last pilot HAS signed off, the endpoint refuses the whole thing. That case
 * never reaches this component: `canOverrideReservationPayment` hides the action, and the
 * close-out section says why in its place.
 *
 * Rates are entered in dollars and sent as CENTS PER HOUR. Blank means "use the school's
 * rate card for that side"which is exactly what a null column means to the pricing code.
 */

/** Keep only digits and a single decimal point. */
function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
}

/** Dollars as typed to whole cents. Null for blank, undefined for unparseable. */
function toCents(v: string): number | null | undefined {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

const centsToDollars = (cents: number | null | undefined): string =>
  cents == null ? "" : (cents / 100).toFixed(2);

/** Stripe will not charge above a million dollars, so a rate above it is always a typo. */
const MAX_CENTS = 100_000_000;

export function OverridePaymentModal({
  open,
  onOpenChange,
  reservation,
  /** The school's default instruction rate, in cents. Shown as the figure being replaced. */
  defaultInstructorRateCents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  defaultInstructorRateCents?: number | null;
}) {
  const r = reservation;
  const save = useOverrideReservationPayment(r?.id ?? 0);

  const plane = r?.resource?.type?.plane ?? null;
  const simulator = r?.resource?.type?.simulator ?? null;
  const isRoom = r?.resource?.type?.room != null;

  // A room has no rate at all, and "resource not listed" is a booking the school is not
  // billing an aircraft for. Neither has a resource rate to replace.
  const hasResourceRate = r?.resource != null && !isRoom && (plane != null || simulator != null);

  const instruction = r != null && hasInstruction(r);

  const billByHobbs = plane?.cost?.billByHobbsTime ?? simulator?.cost?.billByHobbsTime ?? true;
  const rateUnit = billByHobbs ? "per Hobbs hour" : "per tach hour";

  // What the booking would otherwise be billed at, so the number being replaced is on
  // screen next to the box replacing it. Wet then dry, the same order payment.ts falls
  // through. A membership tier can beat both, and cannot be read from here (the rules are
  // admin-only), so this is labelled as the aircraft's published rate rather than as the
  // price.
  const publishedResourceRate =
    plane?.cost?.wetRate ?? plane?.cost?.dryRate ?? simulator?.cost?.rate ?? null;

  const stored = r?.paymentOverrides ?? null;

  const [resourceRate, setResourceRate] = React.useState("");
  const [instructorRate, setInstructorRate] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setResourceRate(centsToDollars(stored?.resourceRateOverride));
    setInstructorRate(centsToDollars(stored?.instructorRateOverride));
    setShowErrors(false);
    // Re-seed when the stored overrides arrive from the detail refetch.
  }, [open, r?.id, stored?.resourceRateOverride, stored?.instructorRateOverride]);

  const resourceCents = toCents(resourceRate);
  const instructorCents = toCents(instructorRate);

  const rateError = (
    value: number | null | undefined,
    shown: boolean
  ): string | null => {
    if (!shown) return null;
    if (value === undefined) return "Enter a rate as a number, or leave it blank.";
    if (value != null && value >= MAX_CENTS) return "That rate is too high.";
    return null;
  };

  const resourceErr = rateError(resourceCents, hasResourceRate);
  const instructorErr = rateError(instructorCents, instruction);

  // The endpoint refuses a body with nothing in it ("No overrides provided"), so an empty
  // sheet is caught here rather than as a toast after a round trip.
  const nothingEntered =
    (!hasResourceRate || resourceCents == null) && (!instruction || instructorCents == null);
  const emptyErr = nothingEntered ? "Enter at least one rate to override." : null;

  const confirmed = r ? confirmationCount(r) : 0;
  const needed = r ? reviewerCount(r) : 0;

  async function submit() {
    if (!r) return;
    if (resourceErr || instructorErr || emptyErr) {
      setShowErrors(true);
      const firstInvalid = resourceErr
        ? "override-resource-rate"
        : instructorErr
          ? "override-instructor-rate"
          : hasResourceRate
            ? "override-resource-rate"
            : "override-instructor-rate";
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    // Only ever send a side this booking HAS. A ground lesson with a stale resource rate
    // left on it would otherwise have that figure rewritten on every save.
    const body: ReservationPaymentOverridesInput = {
      ...(hasResourceRate ? { resourceRateOverride: resourceCents ?? null } : {}),
      ...(instruction ? { instructorRateOverride: instructorCents ?? null } : {}),
    };

    try {
      await save.mutateAsync(body);
      toast.success(
        confirmed > 0
          ? "Rates overridden. The pilots will need to sign off again."
          : "Rates overridden for this booking."
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the override");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Override payment"
      description="Bill this one booking at a rate of your own, in place of the school's rate card."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {hasResourceRate && (
          <RateField
            id="override-resource-rate"
            label={simulator ? "Simulator rate" : "Aircraft rate"}
            unit={rateUnit}
            value={resourceRate}
            onChange={setResourceRate}
            autoFocus
            error={showErrors ? resourceErr : null}
            hint={
              publishedResourceRate != null
                ? `Normally ${formatMoney(publishedResourceRate)} ${rateUnit}. Leave blank to use that.`
                : "Leave blank to use the aircraft's own rate."
            }
          />
        )}

        {instruction && (
          <RateField
            id="override-instructor-rate"
            label="Instruction rate"
            unit="per hour"
            value={instructorRate}
            onChange={setInstructorRate}
            autoFocus={!hasResourceRate}
            error={showErrors ? instructorErr : null}
            hint={
              defaultInstructorRateCents
                ? `Normally ${formatMoney(defaultInstructorRateCents)} per hour, or the rating's own rate. Leave blank to use that.`
                : "Leave blank to use the instructor's rating rate."
            }
          />
        )}

        {showErrors && emptyErr && <p className="text-xs text-destructive">{emptyErr}</p>}

        {/* Said before the button, not discovered after it. The server deletes every
            confirmation on this booking when the price changes, and a dispatcher who
            learns that from a suddenly empty sign-off count has to go and ask two people
            to redo something they already did. */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {confirmed > 0 ? (
              <>
                <span className="text-foreground">
                  {confirmed} of {needed}
                </span>{" "}
                {confirmed === 1 ? "pilot has" : "pilots have"} already signed this flight
                off. Changing what it costs clears{" "}
                {confirmed === 1 ? "that sign-off" : "those sign-offs"}, and each of them
                will have to enter their PIN again.
              </>
            ) : (
              <>
                Changing what a flight costs clears any sign-offs already collected, so the
                pilots confirm the new figure. Once everyone has signed off, the rates are
                fixed and this is refused.
              </>
            )}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save rates"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

/** A dollars-per-hour box. Blank is a real value here, so the text is the state. */
function RateField({
  id,
  label,
  unit,
  value,
  onChange,
  hint,
  error,
  autoFocus,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
  error: string | null;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoFocus={autoFocus}
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(sanitizeDecimal(e.target.value))}
          aria-invalid={!!error}
          className="tnum pl-7 pr-28"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
