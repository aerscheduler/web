import * as React from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { useCorrectReviewTimes } from "@/features/queries";
import type { CorrectReviewTimesInput, Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { meterAnomalyMessages } from "@/lib/meter-anomaly";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmationCount, reviewerCount } from "./close-out";

/**
 * Fix a reading somebody typed wrong, after the aircraft is back.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * ONLY THE FIGURES THE BOOKING ALREADY HAS
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * `makeReviewTimeCorrections` refuses to write a Hobbs figure onto a review whose Hobbs
 * pair is not already filled in ("You cannot update hobbs values for this reservation"),
 * and says the same about tach and about instruction time. It is a correction endpoint,
 * not a back door for recording a flight nobody ramped. So a field appears here only when
 * the booking has a value in it, and a ground lesson gets its briefing box and nothing
 * else.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * PAIRS TRAVEL TOGETHER
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Sending one Hobbs field makes the server demand its partner. Both go or neither does,
 * which is also why both boxes are required once the pair is shown.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * TENTHS, AT THE EDGE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Every meter is stored in tenths of an hour. The dispatcher reads "1014.2" off the panel
 * and 10142 goes over the wire, converted here and nowhere else, the same way the ramp
 * modal does it.
 */

/** Keep only digits and a single decimal point. */
function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
}

/** Hours as typed to whole tenths. Null when blank or unusable. */
function toTenths(v: string): number | null {
  const t = v.trim();
  if (t === "" || t === ".") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 10);
}

const tenthsToHours = (v: number | null | undefined): string =>
  v == null ? "" : (v / 10).toFixed(1);

export function CorrectTimesModal({
  open,
  onOpenChange,
  reservation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
}) {
  const r = reservation;
  const review = r?.review ?? null;
  const correct = useCorrectReviewTimes(r?.id ?? 0);
  const confirm = useConfirm();

  // A pair is correctable only when the booking already holds both halves of it.
  const hasHobbs = review?.hobbsTimeOut != null && review?.hobbsTimeIn != null;
  const hasTach = review?.tachTimeOut != null && review?.tachTimeIn != null;
  const hasBriefing = review?.briefing != null;

  const [hobbsOut, setHobbsOut] = React.useState("");
  const [hobbsIn, setHobbsIn] = React.useState("");
  const [tachOut, setTachOut] = React.useState("");
  const [tachIn, setTachIn] = React.useState("");
  const [briefing, setBriefing] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setHobbsOut(tenthsToHours(review?.hobbsTimeOut));
    setHobbsIn(tenthsToHours(review?.hobbsTimeIn));
    setTachOut(tenthsToHours(review?.tachTimeOut));
    setTachIn(tenthsToHours(review?.tachTimeIn));
    setBriefing(tenthsToHours(review?.briefing));
    setShowErrors(false);
  }, [
    open,
    r?.id,
    review?.hobbsTimeOut,
    review?.hobbsTimeIn,
    review?.tachTimeOut,
    review?.tachTimeIn,
    review?.briefing,
  ]);

  const hobbsOutTenths = toTenths(hobbsOut);
  const hobbsInTenths = toTenths(hobbsIn);
  const tachOutTenths = toTenths(tachOut);
  const tachInTenths = toTenths(tachIn);
  const briefingTenths = toTenths(briefing);

  const backwards = "The ending reading can't be lower than the starting one.";

  const hobbsOutErr = !hasHobbs
    ? null
    : hobbsOutTenths == null
      ? "Enter the Hobbs out reading"
      : hobbsInTenths != null && hobbsOutTenths > hobbsInTenths
        ? backwards
        : null;
  const hobbsInErr = !hasHobbs
    ? null
    : hobbsInTenths == null
      ? "Enter the Hobbs in reading"
      : hobbsOutTenths != null && hobbsInTenths < hobbsOutTenths
        ? backwards
        : null;
  const tachOutErr = !hasTach
    ? null
    : tachOutTenths == null
      ? "Enter the tach out reading"
      : tachInTenths != null && tachOutTenths > tachInTenths
        ? backwards
        : null;
  const tachInErr = !hasTach
    ? null
    : tachInTenths == null
      ? "Enter the tach in reading"
      : tachOutTenths != null && tachInTenths < tachOutTenths
        ? backwards
        : null;
  const briefingErr = !hasBriefing
    ? null
    : briefingTenths == null
      ? "Enter the instruction time"
      : null;

  const flownTenths =
    hasHobbs && hobbsOutTenths != null && hobbsInTenths != null
      ? hobbsInTenths - hobbsOutTenths
      : hasTach && tachOutTenths != null && tachInTenths != null
        ? tachInTenths - tachOutTenths
        : null;

  const confirmed = r ? confirmationCount(r) : 0;
  const needed = r ? reviewerCount(r) : 0;

  async function submit() {
    if (!r) return;
    const firstInvalid = hobbsOutErr
      ? "correct-hobbs-out"
      : hobbsInErr
        ? "correct-hobbs-in"
        : tachOutErr
          ? "correct-tach-out"
          : tachInErr
            ? "correct-tach-in"
            : briefingErr
              ? "correct-briefing"
              : null;
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    // A pair goes together or not at all. See the header.
    const body: CorrectReviewTimesInput = {
      ...(hasHobbs && hobbsOutTenths != null && hobbsInTenths != null
        ? { hobbsTimeOut: hobbsOutTenths, hobbsTimeIn: hobbsInTenths }
        : {}),
      ...(hasTach && tachOutTenths != null && tachInTenths != null
        ? { tachTimeOut: tachOutTenths, tachTimeIn: tachInTenths }
        : {}),
      ...(hasBriefing && briefingTenths != null ? { briefing: briefingTenths } : {}),
    };

    try {
      const done = await submitCorrection(body);
      if (!done) return;
      toast.success(
        confirmed > 0
          ? "Times corrected. The pilots will need to sign off again."
          : "Times corrected."
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't correct the times");
    }
  }

  /**
   * Save the correction, and if the server refuses with 409 `METER_ANOMALY`, ask the desk
   * to confirm the reading before resubmitting with `confirmMeterAnomaly: true`.
   */
  async function submitCorrection(body: CorrectReviewTimesInput): Promise<boolean> {
    try {
      await correct.mutateAsync(body);
      return true;
    } catch (e) {
      const anomalies = meterAnomalyMessages(e);
      if (!anomalies || anomalies.length === 0) throw e;
      const ok = await confirm({
        title: "Check these readings",
        description: (
          <div className="space-y-1.5">
            {anomalies.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        ),
        confirmLabel: "Confirm and continue",
      });
      if (!ok) return false;
      await correct.mutateAsync({ ...body, confirmMeterAnomaly: true });
      return true;
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Correct recorded times"
      description="Fix a reading that was entered wrong. This is what the flight is billed on."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {hasHobbs && (
          <div className="grid grid-cols-2 gap-3">
            <MeterField
              id="correct-hobbs-out"
              label="Hobbs out"
              value={hobbsOut}
              onChange={setHobbsOut}
              error={showErrors ? hobbsOutErr : null}
              autoFocus
            />
            <MeterField
              id="correct-hobbs-in"
              label="Hobbs in"
              value={hobbsIn}
              onChange={setHobbsIn}
              error={showErrors ? hobbsInErr : null}
            />
          </div>
        )}

        {hasTach && (
          <div className="grid grid-cols-2 gap-3">
            <MeterField
              id="correct-tach-out"
              label="Tach out"
              value={tachOut}
              onChange={setTachOut}
              error={showErrors ? tachOutErr : null}
              autoFocus={!hasHobbs}
            />
            <MeterField
              id="correct-tach-in"
              label="Tach in"
              value={tachIn}
              onChange={setTachIn}
              error={showErrors ? tachInErr : null}
            />
          </div>
        )}

        {hasBriefing && (
          <MeterField
            id="correct-briefing"
            label="Instruction time (hrs)"
            value={briefing}
            onChange={setBriefing}
            error={showErrors ? briefingErr : null}
            autoFocus={!hasHobbs && !hasTach}
            hint="Billed at the instructor rate."
          />
        )}

        {flownTenths != null && flownTenths >= 0 && (
          <p className="text-sm text-muted-foreground">
            Hours flown:{" "}
            <span className="tnum font-medium text-foreground">
              {(flownTenths / 10).toFixed(1)}
            </span>
          </p>
        )}

        {/* The same warning the override sheet carries, for the same reason: a correction
            changes what the flight costs, so every PIN already entered is discarded. */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {confirmed > 0 ? (
              <>
                <span className="text-foreground">
                  {confirmed} of {needed}
                </span>{" "}
                {confirmed === 1 ? "pilot has" : "pilots have"} already signed this flight
                off. Correcting the times clears{" "}
                {confirmed === 1 ? "that sign-off" : "those sign-offs"}, and each of them
                will have to enter their PIN again.
              </>
            ) : (
              <>
                A correction clears any sign-offs already collected, so the pilots confirm
                the new figures. Once everyone has signed off, or the flight has been
                invoiced, the readings are fixed and this is refused.
              </>
            )}
            {" "}
            If this was the aircraft&rsquo;s most recent flight, its own Hobbs and tach move
            with the correction.
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={correct.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={correct.isPending}>
            {correct.isPending ? "Saving…" : "Save corrections"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

function MeterField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder="0.0"
        value={value}
        onChange={(e) => onChange(sanitizeDecimal(e.target.value))}
        aria-invalid={!!error}
        className="tnum"
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
