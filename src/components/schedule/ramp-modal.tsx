import * as React from "react";
import { toast } from "sonner";
import { useBilling, useLocations, useRampIn, useRampOut, useUpdateResourceLocation } from "@/features/queries";
import type { Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usesBriefingNotMeters } from "@/components/schedule/close-out";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";
import { Moon } from "lucide-react";
import { overnightBilling } from "@/lib/overnight-minimum";
import { useTimeZone } from "@/lib/use-timezone";

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
  deci == null ? "–" : (deci / 10).toFixed(1);

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
  const tz = useTimeZone();
  //Only while the modal is open: this is the school's org-wide minimum, and there is no
  //reason to hold it for every closed modal on the board.
  const billingQ = useBilling({ enabled: open });
  const plane = reservation?.resource?.type?.plane ?? null;
  const review = reservation?.review ?? null;

  const { organization } = useAuth();
  const updateHomeBaseOnRampIn = Boolean(
    organization?.preferences?.updateResourceLocationOnRampIn
  );
  const resourceId = reservation?.resource?.id ?? 0;
  const showLocationPicker =
    mode === "in" &&
    updateHomeBaseOnRampIn &&
    resourceId > 0 &&
    reservation != null &&
    !usesBriefingNotMeters(reservation);

  const locationsQ = useLocations({ enabled: open && showLocationPicker });
  const updateLocation = useUpdateResourceLocation(resourceId);

  const rampOut = useRampOut(reservation?.id ?? 0);
  const rampIn = useRampIn(reservation?.id ?? 0);
  const busy = rampOut.isPending || rampIn.isPending || updateLocation.isPending;

  //Instruction time is optional extra detail on a dual flight, and the ONLY figure a booking
  //with no meters has, so a ground has to be offered it too, or its close-out has no field
  //to fill in at all. `noMeters` is defined below, where the reservation is in scope.
  const showBriefing =
    reservation?.type === "dual" ||
    reservation?.type === "instructor" ||
    (reservation != null && usesBriefingNotMeters(reservation));

  const [hobbs, setHobbs] = React.useState("");
  const [tach, setTach] = React.useState("");
  const [briefing, setBriefing] = React.useState("");
  const [locationId, setLocationId] = React.useState<string>("");
  // Surfaced only after a submit attempt, so we don't nag on a freshly opened modal.
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    // List payloads omit meters; full GET /reservations/:id includes them. Guard
    // null so we never seed the string "NaN" while the detail fetch is in flight.
    const planeHobbs = plane?.hobbsTime != null ? (plane.hobbsTime / 10).toFixed(1) : "";
    const planeTach = plane?.tachTime != null ? (plane.tachTime / 10).toFixed(1) : "";
    if (mode === "out") {
      setHobbs(planeHobbs);
      setTach(planeTach);
    } else {
      // Seed the ending readings from the recorded out readings; the pilot bumps them up.
      setHobbs(review?.hobbsTimeOut != null ? (review.hobbsTimeOut / 10).toFixed(1) : planeHobbs);
      setTach(review?.tachTimeOut != null ? (review.tachTimeOut / 10).toFixed(1) : planeTach);
    }
    setBriefing("");
    // Prefer the booking's field, then the aircraft's current home base.
    const seedLoc =
      reservation?.location?.id ?? reservation?.resource?.location?.id ?? null;
    setLocationId(seedLoc != null ? String(seedLoc) : "");
    setShowErrors(false);
    // Re-seed when meters arrive from the detail refetch (same reservation id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, reservation?.id, plane?.hobbsTime, plane?.tachTime, review?.hobbsTimeOut, review?.tachTimeOut, reservation?.location?.id, reservation?.resource?.location?.id]);

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

  //A ground lesson has no meters, so demanding a Hobbs reading made its close-out impossible
  //to submit, the reported bug. Instruction time takes over as the required figure, which is
  //what the schema says `briefing` is for. See `usesBriefingNotMeters` for why it keys on the
  //reservation TYPE and not only on the resource.
  const noMeters = reservation != null && usesBriefingNotMeters(reservation);

  // Per-field validity, derived every render so inline messages clear as you type.
  const backwardsMsg = "Ending readings can't be lower than the recorded out readings.";
  const hobbsErr = noMeters
    ? null
    : hobbsNum == null
      ? "Enter the Hobbs reading"
      : hobbsBackwards
        ? backwardsMsg
        : null;
  const tachErr = noMeters
    ? null
    : tachNum == null
      ? "Enter the tach reading"
      : tachBackwards
        ? backwardsMsg
        : null;
  const briefingErr = noMeters
    ? briefingNum == null
      ? "Enter the instruction time"
      : null
    : briefing.trim() !== "" && briefingNum == null
      ? "Enter a valid number"
      : null;

  const locationErr = showLocationPicker && !locationId ? "Pick the home base" : null;

  const locationOptions: ComboOption[] = React.useMemo(
    () =>
      (locationsQ.data ?? [])
        .map((loc) => ({
          value: String(loc.id),
          label: loc.name ?? `Location #${loc.id}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [locationsQ.data]
  );

  const hoursFlown =
    mode === "in" && hobbsNum != null && outHobbsHrs != null ? hobbsNum - outHobbsHrs : null;

  //Recomputed as the reading is typed, from the same inputs and the same rules the server
  //will price with (lib/overnight-minimum.ts mirrors utils/bookingMinimums.ts). Null unless
  //the booking actually crossed a local midnight and the school actually sets a minimum.
  const billing = overnightBilling({
    start: reservation?.start ?? null,
    end: reservation?.end ?? null,
    timeZone: tz.zone,
    flownTenths: hoursFlown == null ? null : Math.round(hoursFlown * 10),
    aircraftMinimumTenths: plane?.cost?.overnightMinimumTenths ?? null,
    orgMinimumTenths: billingQ.data?.overnightMinimumTenths ?? null,
  });

  async function submit() {
    if (!reservation) return;
    if (hobbsErr || tachErr || briefingErr || locationErr) {
      setShowErrors(true);
      const firstInvalid = hobbsErr
        ? "ramp-hobbs"
        : tachErr
          ? "ramp-tach"
          : briefingErr
            ? "ramp-briefing"
            : "ramp-location";
      if (firstInvalid === "ramp-location") {
        document.getElementById("ramp-location")?.querySelector("button")?.focus();
      } else {
        document.getElementById(firstInvalid)?.focus();
      }
      return;
    }
    // A BOOKING WITH NO METERS SUBMITS ITS BRIEFING, AND NOTHING ELSE.
    //
    // This is handled before the guard below rather than inside the mode branch, because
    // that guard (`hobbsNum == null || tachNum == null`) is exactly what made the web
    // console unable to close out a ground lesson AT ALL: the fields don't exist, so both
    // readings are null, so the guard returned, silently, with the form valid and the
    // button enabled. Nothing happened and nothing said why.
    //
    // It calls rampIn regardless of which mode opened it. `briefing` is a ramp-IN field on
    // the server, and one briefing figure covers the whole lesson (see `isRampedIn` in
    // close-out.ts), so the lesson goes from "not started" straight to awaiting sign-off.
    // That is the same single step the Flutter app takes, which reaches this sheet from a
    // button labelled "Review" for the same bookings.
    if (noMeters) {
      if (briefingNum == null) return;
      try {
        await rampIn.mutateAsync({ briefing: toDeci(briefingNum) });
        toast.success("Times saved");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't save the times");
      }
      return;
    }

    if (hobbsNum == null || tachNum == null) return;
    try {
      if (mode === "out") {
        await rampOut.mutateAsync({ hobbsTimeOut: toDeci(hobbsNum), tachTimeOut: toDeci(tachNum) });
        toast.success("Aircraft ramped out");
      } else {
        // Same order as the iPhone sheet: move the home base first, then record meters.
        // A failed location update must not leave meters written against the wrong field.
        if (showLocationPicker && locationId) {
          await updateLocation.mutateAsync(Number(locationId));
        }
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

  //Nothing ramps anywhere in a classroom, so don't head the sheet with it. Matches the
  //Flutter sheet, which titles the same booking "Review Times".
  const title = noMeters ? "Review times" : mode === "out" ? "Ramp out" : "Ramp in";
  const description = noMeters
    ? "Record the instruction time to close out this lesson. There are no meter readings to take."
    : mode === "out"
      ? "Record the starting Hobbs and tach readings before the flight departs."
      : "Record the ending Hobbs and tach readings to close out the flight.";

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div
        data-doc-shot={
          noMeters
            ? "review-times-modal-ground"
            : mode === "out"
              ? "ramp-out-modal"
              : "ramp-in-modal-hours-flown"
        }
        className="space-y-4"
      >
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

        {/* No aircraft, no meters to read, showing two boxes nobody can fill in is what made
            the ground close-out look broken rather than merely blocked. */}
        {!noMeters && (
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
              aria-invalid={showErrors && !!hobbsErr}
              className="tnum"
            />
            {showErrors && hobbsErr && <p className="text-xs text-destructive">{hobbsErr}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ramp-tach">{mode === "out" ? "Tach out" : "Tach in"}</Label>
            <Input
              id="ramp-tach"
              inputMode="decimal"
              placeholder="0.0"
              value={tach}
              onChange={(e) => setTach(sanitizeDecimal(e.target.value))}
              aria-invalid={showErrors && !!tachErr}
              className="tnum"
            />
            {showErrors && tachErr && <p className="text-xs text-destructive">{tachErr}</p>}
          </div>
        </div>
        )}

        {(noMeters || mode === "in") && showBriefing && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="ramp-briefing">Instruction time (hrs)</Label>
              <DocsHint topic="instruction-time" />
            </div>
            <Input
              id="ramp-briefing"
              inputMode="decimal"
              placeholder="0.0"
              value={briefing}
              onChange={(e) => setBriefing(sanitizeDecimal(e.target.value))}
              aria-invalid={showErrors && !!briefingErr}
              className="tnum"
            />
            {showErrors && briefingErr && <p className="text-xs text-destructive">{briefingErr}</p>}
            {/* On a flight this is extra detail alongside the meters. On a lesson with no
                meters it is the ONLY figure, and `briefingErr` already refuses an empty one,
                so calling it optional there contradicts the validation the reader is about
                to hit. */}
            <p className="text-xs text-muted-foreground">
              {noMeters
                ? "Billed at the instructor rate."
                : "Optional. Billed at the instructor rate."}
            </p>
          </div>
        )}

        {showLocationPicker && (
          <div className="space-y-1.5" data-doc-shot="ramp-in-home-base">
            <Label htmlFor="ramp-location">Home base</Label>
            <div id="ramp-location">
              <Combobox
                options={locationOptions}
                value={locationId}
                onChange={setLocationId}
                placeholder={
                  locationsQ.isLoading ? "Loading locations…" : "Select home base"
                }
                searchPlaceholder="Search locations…"
                emptyText="No locations found."
              />
            </div>
            {showErrors && locationErr && (
              <p className="text-xs text-destructive">{locationErr}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Moves this aircraft&rsquo;s home base when you ramp in. Your school turned this on
              under Settings → School.
            </p>
          </div>
        )}

        {hoursFlown != null && hoursFlown >= 0 && (
          <p className="text-sm text-muted-foreground">
            Hours flown:{" "}
            <span className="tnum font-medium text-foreground">{hoursFlown.toFixed(1)}</span>
          </p>
        )}

        {/* What the minimum DOES to the number just typed, at the moment it is typed. The
            notice on the booking form says what the floor is; this is the point where the
            surprise would otherwise land, as an invoice for 4.0 hours on a 1.5-hour flight
            with nothing on screen having mentioned it. */}
        {billing?.applied && (
          <p
            data-doc-shot="ramp-in-overnight-notice"
            className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
          >
            <Moon className="mt-0.5 size-4 shrink-0" />
            <span>
              Away {billing.nights === 1 ? "one night" : `${billing.nights} nights`}, and your
              school&rsquo;s minimum is {(billing.minimumTenthsPerNight / 10).toFixed(1)} hours a
              night. This will bill{" "}
              <span className="tnum font-medium text-foreground">
                {(billing.billedTenths / 10).toFixed(1)}
              </span>{" "}
              hours rather than the {(billing.flownTenths / 10).toFixed(1)} flown.
            </span>
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : title}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
