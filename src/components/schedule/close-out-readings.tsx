import type { Reservation } from "@/types/api";
import { usesBriefingNotMeters } from "./close-out";
import { useTimeZone } from "@/lib/use-timezone";

/**
 * What has actually been recorded on this flight so far.
 *
 * The close-out asked for readings and then never showed them back. Once a booking was
 * ramped out, the two numbers somebody had just typed lived only in the audit trail at the
 * bottom of the sheet and in the ramp-in modal's own header, so the ordinary question
 * "what did we send it out on?" meant opening a modal or reading a log.
 *
 * It is also the check on a mistyped digit. A Hobbs out of 114.2 against a tach of 1014.2
 * is obvious side by side and invisible one modal apart.
 *
 * Renders nothing before anything is recorded, which is every booking that has not flown.
 */
export function CloseOutReadings({ r }: { r: Reservation }) {
  const tz = useTimeZone(r.location);
  const rev = r.review;
  if (!rev) return null;

  const noMeters = usesBriefingNotMeters(r);
  const hrs = (v: number | null | undefined) => (v == null ? null : (v / 10).toFixed(1));

  const flown =
    rev.hobbsTimeIn != null && rev.hobbsTimeOut != null
      ? (Math.max(0, rev.hobbsTimeIn - rev.hobbsTimeOut) / 10).toFixed(1)
      : null;

  //Only the figures this booking can have. A classroom has one, an aeroplane has up to five.
  const cells: { label: string; value: string }[] = [];
  if (!noMeters) {
    if (hrs(rev.hobbsTimeOut)) cells.push({ label: "Hobbs out", value: hrs(rev.hobbsTimeOut)! });
    if (hrs(rev.hobbsTimeIn)) cells.push({ label: "Hobbs in", value: hrs(rev.hobbsTimeIn)! });
    if (hrs(rev.tachTimeOut)) cells.push({ label: "Tach out", value: hrs(rev.tachTimeOut)! });
    if (hrs(rev.tachTimeIn)) cells.push({ label: "Tach in", value: hrs(rev.tachTimeIn)! });
    if (flown) cells.push({ label: "Hours flown", value: flown });
  }
  if (hrs(rev.briefing)) cells.push({ label: "Instruction", value: hrs(rev.briefing)! });

  if (cells.length === 0) return null;

  //When it left and when it came back, as opposed to what the meters read. Null on anything
  //ramped before those columns shipped, so the line simply does not appear.
  const outAt = rev.rampedOutAt ? tz.time(rev.rampedOutAt) : null;
  const inAt = rev.rampedInAt ? tz.time(rev.rampedInAt) : null;

  return (
    <div
      data-doc-shot="close-out-readings"
      className="rounded-lg border border-border bg-muted/40 p-3"
    >
      <dl className="flex flex-wrap gap-x-5 gap-y-2">
        {cells.map((c) => (
          <div key={c.label} className="min-w-14">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </dt>
            <dd className="tnum mt-0.5 text-sm font-medium">{c.value}</dd>
          </div>
        ))}
      </dl>
      {(outAt || inAt) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {outAt && <>Out {outAt}</>}
          {outAt && inAt && <> · </>}
          {inAt && <>Back {inAt}</>}
          {tz.differs(r.start) && <> {tz.label(r.start)}</>}
        </p>
      )}
    </div>
  );
}
