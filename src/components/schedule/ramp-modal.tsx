import * as React from "react";
import { toast } from "sonner";
import { useRampIn, useRampOut } from "@/features/queries";
import type { Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type RampMode = "out" | "in";

/** Keep only digits + a single decimal point. */
function sanitizeDecimal(v: string): string {
  const cleaned = v.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
}

function toNumber(v: string): number | null {
  if (v.trim() === "" || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Hobbs/tach/briefing are stored server-side as integer **deci-hours** (the server
// divides by 10 for billing). The UI works in decimal hours: display = stored / 10,
// submit = round(hours * 10).
const toHours = (deci: number | null | undefined): number | null =>
  deci == null ? null : deci / 10;
const toDeci = (hours: number): number => Math.round(hours * 10);
const fmtHours = (deci: number | null | undefined): string =>
  deci == null ? "—" : (deci / 10).toFixed(1);

/**
 * Records the Hobbs/tach readings for a ramp-out (starting) or ramp-in (ending).
 * Inputs are decimal-hour meter values prefilled from the aircraft's current readings
 * (out) or the recorded out readings (in); converted to deci-hours on submit.
 */
export function RampModal({
  open,
  onOpenChange,
  reservation,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: Reservation | null;
  mode: RampMode;
}) {
  const plane = reservation?.resource?.type?.plane ?? null;
  const review = reservation?.review ?? null;

  const rampOut = useRampOut(reservation?.id ?? 0);
  const rampIn = useRampIn(reservation?.id ?? 0);
  const busy = rampOut.isPending || rampIn.isPending;

  const showBriefing = reservation?.type === "dual" || reservation?.type === "instructor";

  const [hobbs, setHobbs] = React.useState("");
  const [tach, setTach] = React.useState("");
  const [briefing, setBriefing] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    const planeHobbs = plane ? (plane.hobbsTime / 10).toFixed(1) : "";
    const planeTach = plane ? (plane.tachTime / 10).toFixed(1) : "";
    if (mode === "out") {
      setHobbs(planeHobbs);
      setTach(planeTach);
    } else {
      // Seed the ending readings from the recorded out readings; the pilot bumps them up.
      setHobbs(review?.hobbsTimeOut != null ? (review.hobbsTimeOut / 10).toFixed(1) : planeHobbs);
      setTach(review?.tachTimeOut != null ? (review.tachTimeOut / 10).toFixed(1) : planeTach);
    }
    setBriefing("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, reservation?.id]);

  const hobbsNum = toNumber(hobbs); // decimal hours
  const tachNum = toNumber(tach);
  const briefingNum = toNumber(briefing);

  const outHobbsHrs = toHours(review?.hobbsTimeOut); // decimal hours
  const outTachHrs = toHours(review?.tachTimeOut);

  // Ramp-in readings can't go backwards past the recorded out readings.
  const hobbsBackwards =
    mode === "in" && hobbsNum != null && outHobbsHrs != null && hobbsNum < outHobbsHrs;
  const tachBackwards =
    mode === "in" && tachNum != null && outTachHrs != null && tachNum < outTachHrs;

  const valid =
    hobbsNum != null &&
    tachNum != null &&
    !hobbsBackwards &&
    !tachBackwards &&
    (briefing.trim() === "" || briefingNum != null);

  const hoursFlown =
    mode === "in" && hobbsNum != null && outHobbsHrs != null ? hobbsNum - outHobbsHrs : null;

  async function submit() {
    if (!reservation || !valid || hobbsNum == null || tachNum == null) return;
    try {
      if (mode === "out") {
        await rampOut.mutateAsync({ hobbsTimeOut: toDeci(hobbsNum), tachTimeOut: toDeci(tachNum) });
        toast.success("Aircraft ramped out");
      } else {
        await rampIn.mutateAsync({
          hobbsTimeIn: toDeci(hobbsNum),
          tachTimeIn: toDeci(tachNum),
          ...(briefingNum != null ? { briefing: toDeci(briefingNum) } : {}),
        });
        toast.success("Aircraft ramped in");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : mode === "out"
            ? "Couldn't ramp out the flight"
            : "Couldn't ramp in the flight"
      );
    }
  }

  const title = mode === "out" ? "Ramp out" : "Ramp in";
  const description =
    mode === "out"
      ? "Record the starting Hobbs and tach readings before the flight departs."
      : "Record the ending Hobbs and tach readings to close out the flight.";

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="space-y-4">
        {mode === "in" && (review?.hobbsTimeOut != null || review?.tachTimeOut != null) && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Hobbs out
              </div>
              <div className="tnum mt-0.5 font-medium">{fmtHours(review?.hobbsTimeOut)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tach out
              </div>
              <div className="tnum mt-0.5 font-medium">{fmtHours(review?.tachTimeOut)}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ramp-hobbs">{mode === "out" ? "Hobbs out" : "Hobbs in"}</Label>
            <Input
              id="ramp-hobbs"
              inputMode="decimal"
              autoFocus
              placeholder="0.0"
              value={hobbs}
              onChange={(e) => setHobbs(sanitizeDecimal(e.target.value))}
              aria-invalid={hobbsBackwards}
              className="tnum"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ramp-tach">{mode === "out" ? "Tach out" : "Tach in"}</Label>
            <Input
              id="ramp-tach"
              inputMode="decimal"
              placeholder="0.0"
              value={tach}
              onChange={(e) => setTach(sanitizeDecimal(e.target.value))}
              aria-invalid={tachBackwards}
              className="tnum"
            />
          </div>
        </div>

        {(hobbsBackwards || tachBackwards) && (
          <p className="text-xs text-destructive">
            Ending readings can't be lower than the recorded out readings.
          </p>
        )}

        {mode === "in" && showBriefing && (
          <div className="space-y-1.5">
            <Label htmlFor="ramp-briefing">Instruction time (hrs)</Label>
            <Input
              id="ramp-briefing"
              inputMode="decimal"
              placeholder="0.0"
              value={briefing}
              onChange={(e) => setBriefing(sanitizeDecimal(e.target.value))}
              className="tnum"
            />
            <p className="text-xs text-muted-foreground">Optional — billed at the instructor rate.</p>
          </div>
        )}

        {hoursFlown != null && hoursFlown >= 0 && (
          <p className="text-sm text-muted-foreground">
            Hours flown:{" "}
            <span className="tnum font-medium text-foreground">{hoursFlown.toFixed(1)}</span>
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!valid || busy}>
            {busy ? "Saving…" : title}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
