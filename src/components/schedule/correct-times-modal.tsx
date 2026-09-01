import * as React from "react";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { useCorrectReviewTimes } from "@/features/queries";
import type { CorrectReviewTimesInput, Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { maintenanceTriggerMessage, meterAnomalyMessages } from "@/lib/meter-anomaly";
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

      //DO NOT ANNOUNCE A CORRECTION THAT DID NOT HAPPEN. This sheet is prefilled from the
      //stored review, so pressing Save without editing sends a complete echo of what is
      //already there. The server now answers that with `noChanges` and writes nothing, and
      //this went on saying "Times corrected. The pilots will need to sign off again."
      //to somebody whose pilots had not been touched, which is worse than useless: it tells
      //the desk to go and chase signatures that are still perfectly valid.
      //`reportMeter` has already said what actually happened.
      if (done === "noChanges") {
        reportMeter(lastResult);
        onOpenChange(false);
        return;
      }

      //Success FIRST, warnings on top of it. See the note in `submitCorrection`.
      toast.success(
        confirmed > 0
          ? "Times corrected. The pilots will need to sign off again."
          : "Times corrected."
      );
      reportMeter(lastResult);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't correct the times");
    }
  }

  /**
   * Save the correction, asking about anything the server refuses on but will accept once
   * confirmed.
   *
   * A LOOP rather than a single catch, because there are two such refusals now and one
   * reading can raise both: a Hobbs entry that looks like a typo AND passes the 100-hour.
   * Confirming the first used to resubmit straight into the second and surface it as a flat
   * error. Each pass adds one flag and retries; the bound is the number of flags, so it
   * cannot spin.
   */
  //Set by `submitCorrection` so the caller can report on it after its own success line.
  let lastResult: unknown = null;

  async function submitCorrection(
    body: CorrectReviewTimesInput
    //`false` is "the person backed out of a confirm"; `"noChanges"` is "the server wrote
    //nothing because the figures already matched". The caller has to tell those apart from
    //a real correction before it claims one.
  ): Promise<boolean | "noChanges"> {
    let attempt: CorrectReviewTimesInput = body;

    for (let round = 0; round < 3; round++) {
      try {
        const result = await correct.mutateAsync(attempt);
        //REPORTED BY THE CALLER, AFTER ITS SUCCESS LINE, not from in here.
        //
        //Toasts stack newest-on-top, and the success line was fired after this returned, so
        //every warning it raised was pushed underneath it and left as a two-pixel sliver.
        //That silently hid the three messages that actually require somebody to DO
        //something: the aircraft's meter was left alone, an inspection stays flagged, the
        //split has to be re-entered. The one the desk least needed to read was the only one
        //it could.
        lastResult = result;
        return (result as { noChanges?: boolean } | null)?.noChanges === true ? "noChanges" : true;
      } catch (e) {
        const anomalies = meterAnomalyMessages(e);
        if (anomalies && anomalies.length > 0 && !attempt.confirmMeterAnomaly) {
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
          attempt = { ...attempt, confirmMeterAnomaly: true };
          continue;
        }

        const grounding = maintenanceTriggerMessage(e);
        if (grounding && !attempt.confirmMaintenanceTrigger) {
          const ok = await confirm({
            title: "This will ground the aircraft",
            description: (
              <div className="space-y-1.5">
                <p>{grounding}</p>
                <p>
                  The school is emailed, and the aircraft stays off the line until somebody
                  returns it to service.
                </p>
              </div>
            ),
            confirmLabel: "Save and ground",
            destructive: true,
          });
          if (!ok) return false;
          attempt = { ...attempt, confirmMaintenanceTrigger: true };
          continue;
        }

        throw e;
      }
    }

    return false;
  }

  /**
   * Say what happened to the AIRCRAFT, which is the half the person has to act on.
   *
   * The aircraft's own Hobbs and tach follow a correction only when this flight is still
   * what they read. Correct an older booking and they are deliberately left alone rather
   * than rolled backwards, and nothing else in the response says so, which would leave the
   * desk believing the fleet had been updated when it had not.
   */
  /**
   * A warning nobody has to act on can time out. One that names a job cannot.
   *
   * Every message below asks the reader to go somewhere else and finish something: correct
   * the aircraft's meter by hand, return a grounded aeroplane to service, clear an
   * inspection that stays flagged, re-enter a cost split before the invoice will generate.
   * A timed toast is the wrong shape for all four. They were also being stacked underneath
   * the success line, which made them a two-pixel sliver, so in practice the desk read the
   * one message that needed no action and none of the ones that did.
   */
  /**
   * ONE MESSAGE, LISTING EVERYTHING, RATHER THAN ONE TOAST EACH.
   *
   * Every item below asks the reader to go somewhere else and finish something: correct the
   * aircraft's meter by hand, return a grounded aeroplane to service, clear an inspection
   * that stays flagged, re-enter a cost split before the invoice will generate. A timed
   * toast is the wrong shape for any of them.
   *
   * IT TOOK TWO GOES TO GET THIS RIGHT, and the second attempt is worth recording because it
   * looked like a fix. Originally the success line fired LAST, so it stacked on top and every
   * warning underneath was a two-pixel sliver. Reordering it to fire first, and pinning the
   * warnings with `duration: Infinity`, moved the burial rather than removing it: sonner
   * renders only `VISIBLE_TOASTS_AMOUNT = 3` and prepends new ones, so a correction that
   * raises four or five warnings hides the OLDEST behind the newest three, and because
   * nothing pinned ever expires they also accumulate across corrections until the corner is
   * a stack of anonymous warnings, none of which names the booking it came from.
   *
   * So they are collected and rendered as ONE toast. It cannot be capped out, it cannot be
   * buried by its own siblings, it says which flight it is about, and it stays until
   * dismissed because every line in it names a job.
   */
  function reportMeter(result: unknown) {
    const envelope = result as
      | {
          meter?: {
            changed?: boolean;
            followed?: boolean;
            aircraftHobbs?: number | null;
            unlatched?: { name?: string }[];
            notUnlatched?: { name?: string }[];
            writeFailed?: string | null;
          };
          guestCloseOutCleared?: boolean;
          splitLegsStale?: boolean;
          noChanges?: boolean;
        }
      | null;
    const meter = envelope?.meter;

    //NOTHING WAS WRITTEN, so nothing is owed except saying so. The server answers this when
    //the submitted figures already match what is stored, which is what an unedited form
    //sends: this sheet is prefilled, so Save on an untouched form is a full echo.
    if (envelope?.noChanges) {
      toast.info("Those readings already match what is saved, so nothing changed.");
      return;
    }

    const names = (rows: { name?: string }[] | undefined) =>
      (rows ?? []).map((r) => r.name).filter(Boolean).join(", ");

    //ORDERED BY WHAT IT COSTS TO MISS. An aeroplane off the line is today's revenue and
    //today's schedule; an invoice that has to be re-keyed can be done at any time.
    const todo: string[] = [];

    const cleared = names(meter?.unlatched);
    if (cleared) {
      todo.push(
        `${cleared} is no longer due, but the aircraft stays grounded until somebody returns it to service on the aircraft page.`
      );
    }

    //Inspections this reading no longer earns but that were LEFT flagged, because their
    //template also runs on a calendar clock ("every 100 hours or 12 months", which is most
    //ADs and every annual). One latch serves all three clocks and nothing records which one
    //fired, so an hour reading has no standing to clear it. Saying nothing read as "there was
    //nothing to clear" and left a school with a grounded aeroplane and no idea why.
    const stuck = names(meter?.notUnlatched);
    if (stuck) {
      todo.push(`${stuck} stays flagged, because it also runs on a calendar. Clear it on the Maintenance page if the correction settled it.`);
    }

    //A guest booking keeps its close-out in a flag rather than in sign-offs, so correcting
    //one drops it back to "needs closing out" with nothing on screen saying so.
    if (envelope?.guestCloseOutCleared) {
      todo.push("This guest flight needs closing out again before it can be billed.");
    }

    //The per-person legs of a `measured` split are never rescaled here, deliberately, but
    //the invoice fan-out refuses on the mismatch LATER and silently: the crew re-confirm, the
    //pilot sees a clean "confirmed", and no invoice ever appears.
    if (envelope?.splitLegsStale) {
      todo.push("The per-person split still uses the old hours. Re-enter it before invoicing, or the invoice will not generate.");
    }

    //Distinct from `followed: false`, which is the ordinary "this is not the flight that set
    //the aircraft's meter" case and needs no apology.
    if (meter?.writeFailed) {
      todo.push("The aircraft's own Hobbs and tach could not be updated. Set them on the aircraft page.");
    } else if (meter && meter.changed === true && meter.followed === false) {
      //ONLY WHEN A METER WAS ACTUALLY IN PLAY. `followed` is false for a correction that
      //touched no meter at all, which is every briefing-only fix on a ground lesson, and
      //those bookings have no aircraft and no aircraft page to be sent to.
      todo.push(
        meter.aircraftHobbs != null
          ? `The aircraft's own Hobbs is unchanged at ${(meter.aircraftHobbs / 10).toFixed(1)}. Correct it on the aircraft page if it needs it.`
          : "The aircraft's own Hobbs and tach are unchanged. Correct them on the aircraft page if they need it."
      );
    }

    if (!todo.length) return;

    //NAMES THE BOOKING. Several of these can be on screen at once across a session, and a
    //warning that does not say which flight it belongs to cannot be acted on.
    toast.warning(`Still to do on ${r?.title ?? "this flight"}`, {
      description: (
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {todo.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ),
      duration: Infinity,
      closeButton: true,
    });
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={correct.isPending}
            >
              Cancel
            </Button>
            <Button type="submit"
                form="modal-correct-times-modal" disabled={correct.isPending}>
              {correct.isPending ? "Saving…" : "Save corrections"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="Correct recorded times"
      description="Fix a reading that was entered wrong. This is what the flight is billed on."
    >
      <form id="modal-correct-times-modal"
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
                the new figures. Once the flight has been billed the readings are fixed, and
                this is refused until the invoice is voided.
              </>
            )}
            {/* ONLY WHEN THERE IS AN AIRCRAFT. This sentence was unconditional, so a GROUND
                lesson, whose only correctable figure is its instruction time and which has
                no resource at all, was told about Hobbs and tach meters and pointed at an
                aircraft page that does not exist for it. The server's own report is gated on
                exactly this for exactly this reason ("sent the desk looking for an aircraft
                page on a booking that has no aircraft"); the copy beside it was not. */}
            {hasHobbs || hasTach ? (
              <>
                {" "}
                The aircraft&rsquo;s own Hobbs and tach move with the correction only while
                they still read what this flight left them at. If anything has moved them
                since, another flight or a correction on the aircraft page, they are left
                alone and you&rsquo;ll be told.
              </>
            ) : null}
          </span>
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
