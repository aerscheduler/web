import { formatDistanceToNowStrict } from "date-fns";
import type { Reservation } from "@/types/api";
import { Separator } from "@/components/ui/separator";
import { useTimeZone } from "@/lib/use-timezone";
import { cn } from "@/lib/utils";

/**
 * One thing that happened to this reservation.
 *
 * `at` is an ISO instant and every entry must have one — an event with no time is not an
 * audit entry, it's a status, and it belongs in the close-out section instead. That rule is
 * why the guest review and the `updatedAt` roll-up are handled the way they are below.
 */
type AuditEvent = {
  at: string;
  label: string;
  /** "Dana Whitfield" — omitted when the API can't tell us who. */
  who?: string | null;
  /** Second line: a cancellation reason, a meter reading, a sign-off count. */
  detail?: string | null;
  /** Cancellations and voids read as red; everything else is neutral. */
  tone?: "default" | "destructive";
};

function personName(
  ou: { user?: { name?: string | null; email?: string | null } | null } | null | undefined
): string | null {
  return ou?.user?.name ?? ou?.user?.email ?? null;
}

/** Meter readings alongside a ramp event, when there are any: "Hobbs 1204.8 · Tach 1102.3". */
function meters(hobbs: number | null | undefined, tach: number | null | undefined): string | null {
  const parts: string[] = [];
  if (hobbs != null) parts.push(`Hobbs ${hobbs}`);
  if (tach != null) parts.push(`Tach ${tach}`);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Everything that has happened to this reservation, oldest first.
 *
 * Exported for its own sake: the same list drives the "needs attention" reasoning, and it is
 * far easier to test as a pure function than through the sheet.
 */
export function auditEvents(r: Reservation): AuditEvent[] {
  const events: AuditEvent[] = [];
  const rev = r.review;

  events.push({
    at: r.createdAt,
    label: r.series ? "Booked (repeating)" : "Booked",
    who: personName(r.createdBy),
    detail: r.series?.label ?? null,
  });

  if (rev?.rampedOutAt) {
    events.push({
      at: rev.rampedOutAt,
      label: "Ramped out",
      detail: meters(rev.hobbsTimeOut, rev.tachTimeOut),
    });
  }

  if (rev?.rampedInAt) {
    events.push({
      at: rev.rampedInAt,
      label: "Ramped in",
      detail: meters(rev.hobbsTimeIn, rev.tachTimeIn),
    });
  }

  for (const c of rev?.reviewConfirmations ?? []) {
    // Confirmations made before the timestamp was selected have no `createdAt`. They still
    // count toward close-out, and the close-out section shows them — but an audit line
    // reading "signed off at —" is worse than no line, so they're left out here.
    if (!c.createdAt) continue;
    events.push({ at: c.createdAt, label: "Signed off", who: personName(c.reviewedBy) });
  }

  if (r.invoice?.createdAt) events.push({ at: r.invoice.createdAt, label: "Invoiced" });
  if (r.invoice?.paidAt) events.push({ at: r.invoice.paidAt, label: "Paid" });
  if (r.invoice?.voidedAt)
    events.push({ at: r.invoice.voidedAt, label: "Invoice voided", tone: "destructive" });

  if (r.cancelledAt) {
    events.push({
      at: r.cancelledAt,
      label: "Cancelled",
      who: personName(r.cancelledBy),
      detail: [r.cancellationCategory, r.cancellationReason].filter(Boolean).join(" — ") || null,
      tone: "destructive",
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  // `updatedAt` is a roll-up, not an event: it moves on every edit and we can't say what
  // changed or who changed it. So it only earns a line when it is genuinely newer than
  // everything above — otherwise it's just restating the last real event with a vaguer label.
  const newest = events[events.length - 1]?.at;
  if (r.updatedAt && (!newest || r.updatedAt.localeCompare(newest) > 0)) {
    // Creation writes `updatedAt` too, so ignore the a-few-seconds-later case.
    if (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime() > 60_000) {
      events.push({ at: r.updatedAt, label: "Last edited" });
    }
  }

  return events;
}

/**
 * "2h ago" — only for the recent past, where it genuinely helps a dispatcher ("it went out
 * 3h ago" is the answer to a question someone is asking). Beyond a week it's noise, and for
 * anything in the future (a booking made for next Tuesday) it would read as nonsense.
 */
function relative(iso: string): string | null {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000 || ms > 7 * 24 * 60 * 60 * 1000) return null;
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/**
 * The dispatcher's audit trail — who booked it, when it left, when it came back, who signed
 * it off, when it was billed. Mirrors the invoice sheet's trail so the two read the same.
 *
 * Times render on the AIRPORT's clock like everything else on the board, not the reader's:
 * a dispatcher covering two fields from a third city needs "left at 9:12 local to the
 * aircraft", which is the only version of that time anyone at the field would recognise.
 */
export function ReservationAudit({ reservation }: { reservation: Reservation }) {
  const tz = useTimeZone(reservation.location);
  const events = auditEvents(reservation);
  if (events.length === 0) return null;

  return (
    <>
      <Separator />
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </h3>
        <ol className="space-y-3">
          {events.map((e, i) => {
            const rel = relative(e.at);
            return (
              <li key={`${e.at}-${i}`} className="flex gap-3 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    e.tone === "destructive" ? "bg-destructive" : "bg-primary"
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {e.label}
                    {e.who && (
                      <span className="font-normal text-muted-foreground"> by {e.who}</span>
                    )}
                  </div>
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {tz.date(e.at, "short")} at {tz.time(e.at)}
                    {rel && <span className="ml-1.5">· {rel}</span>}
                  </div>
                  {e.detail && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{e.detail}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
