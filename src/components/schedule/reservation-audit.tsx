import { formatDistanceToNowStrict } from "date-fns";
import type { AuditEvent, Reservation } from "@/types/api";
import { useReservationAudit } from "@/features/queries";
import { Separator } from "@/components/ui/separator";
import { useTimeZone } from "@/lib/use-timezone";
import { cn } from "@/lib/utils";

/**
 * One thing that happened to this reservation.
 *
 * `at` is an ISO instant and every entry must have one, an event with no time is not an
 * audit entry, it's a status, and it belongs in the close-out section instead. That rule is
 * why the guest review and the `updatedAt` roll-up are handled the way they are below.
 */
type TimelineEntry = {
  at: string;
  label: string;
  /** "Dana Whitfield", omitted when the API can't tell us who. */
  who?: string | null;
  /** Second line: a cancellation reason, a meter reading, a sign-off count. */
  detail?: string | null;
  /** Cancellations and voids read as red; everything else is neutral. */
  tone?: "default" | "destructive";
  /** "from the app", only set on entries that came from a recorded audit event. */
  via?: string | null;
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
export function auditEvents(r: Reservation): TimelineEntry[] {
  const events: TimelineEntry[] = [];
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
    // count toward close-out, and the close-out section shows them, but an audit line
    // reading "signed off at , " is worse than no line, so they're left out here.
    if (!c.createdAt) continue;
    events.push({ at: c.createdAt, label: "Signed off", who: personName(c.reviewedBy) });
  }

  //A line per invoice, because a split booking has one per payer and collapsing them
  //would hide that three of four students have paid. Named by the customer once there is
  //more than one, so the timeline says WHOSE share settled rather than just "Paid" twice.
  const invoices = r.invoices ?? [];
  const named = invoices.length > 1;
  for (const inv of invoices) {
    const who = named ? personName(inv.customer) : undefined;
    if (inv.createdAt) events.push({ at: inv.createdAt, label: "Invoiced", who });
    if (inv.paidAt) events.push({ at: inv.paidAt, label: "Paid", who });
    if (inv.voidedAt)
      events.push({ at: inv.voidedAt, label: "Invoice voided", tone: "destructive", who });
  }

  if (r.cancelledAt) {
    events.push({
      at: r.cancelledAt,
      label: "Cancelled",
      who: personName(r.cancelledBy),
      detail: [r.cancellationCategory, r.cancellationReason].filter(Boolean).join(": ") || null,
      tone: "destructive",
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  // `updatedAt` is a roll-up, not an event: it moves on every edit and we can't say what
  // changed or who changed it. So it only earns a line when it is genuinely newer than
  // everything above, otherwise it's just restating the last real event with a vaguer label.
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
 * Which milestones the recorded audit trail supersedes.
 *
 * The derived timeline above is built from timestamps that happen to sit on the row, so it
 * works for every booking ever made. The audit table only knows what has happened since it
 * shipped. Merging them naively would double every event on a new booking and show nothing
 * extra on an old one, so the two are partitioned by ACTION instead of by time:
 *
 *   - Anything in this set, the audit trail owns when it has rows, it knows who did it and
 *     what changed, which the derived version cannot.
 *   - Everything else (signed off, invoiced, paid, voided) stays derived; those aren't
 *     instrumented yet.
 *   - A booking with no audit rows at all (every booking from before this shipped) falls
 *     back to the derived timeline entirely and looks exactly as it did.
 */
const AUDITABLE_LABELS = new Set(["Booked", "Ramped out", "Ramped in", "Cancelled"]);

/** How an action reads in the timeline when the server didn't write a summary. */
const ACTION_LABEL: Record<string, string> = {
  "reservation.created": "Booked",
  "reservation.rescheduled": "Rescheduled",
  "reservation.updated": "Edited",
  "reservation.cancelled": "Cancelled",
  "reservation.rampedOut": "Ramped out",
  "reservation.rampedIn": "Ramped in",
  "reservation.reviewConfirmed": "Signed off",
  "reservation.invoiced": "Invoiced",
};

/** "from the app" / ", from the console"only worth saying when we actually know. */
function sourceLabel(source: string | null): string | null {
  switch (source) {
    case "web":
      return "from the console";
    case "ios":
      return "from the app";
    case "api":
      return "via the API";
    default:
      return null;
  }
}

function toEntry(e: AuditEvent): TimelineEntry {
  const label = ACTION_LABEL[e.action] ?? e.action;
  const destructive = e.action.endsWith(".cancelled") || e.action.endsWith(".voided");
  return {
    at: e.createdAt,
    label,
    //An automated event has no actor, and "by nobody" is worse than saying so plainly.
    who: e.actor ? (e.actor.user?.name ?? e.actor.user?.email ?? null) : "AerScheduler",
    //`summary` restates the label for the plain milestones ("Booked"); only show it when it
    //carries something the label doesn't.
    detail: e.summary && e.summary !== label ? e.summary : null,
    tone: destructive ? "destructive" : "default",
    via: sourceLabel(e.source),
  };
}

/**
 * The timeline as rendered: derived milestones, with recorded events taking over the ones
 * they cover. Oldest first.
 */
export function mergeTimeline(r: Reservation, recorded: AuditEvent[] | undefined): TimelineEntry[] {
  const derived = auditEvents(r);
  if (!recorded || recorded.length === 0) return derived;

  const entries = recorded.map(toEntry);

  //Drop a derived milestone only when the recorded trail ACTUALLY supplies that milestone.
  //not merely because some other event was recorded. A booking made before this shipped and
  //edited after it has an audit row for the edit and none for the booking, and "Booked"
  //still has to appear; keying off the static list instead silently ate it.
  const supplied = new Set(entries.map((e) => e.label));
  const kept = derived.filter((e) => {
    //`Last edited` is the `updatedAt` roll-up, the placeholder that exists precisely
    //because the row alone can't say what changed or who changed it. Any recorded event
    //answers both, so the roll-up is strictly worse and goes.
    if (e.label === "Last edited") return false;
    return !(AUDITABLE_LABELS.has(e.label) && supplied.has(e.label));
  });

  const merged = [...kept, ...entries];
  merged.sort((a, b) => a.at.localeCompare(b.at));
  return merged;
}

/**
 * "2h ago", only for the recent past, where it genuinely helps a dispatcher ("it went out
 * 3h ago" is the answer to a question someone is asking). Beyond a week it's noise, and for
 * anything in the future (a booking made for next Tuesday) it would read as nonsense.
 */
function relative(iso: string): string | null {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000 || ms > 7 * 24 * 60 * 60 * 1000) return null;
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/**
 * The dispatcher's audit trail, who booked it, when it left, when it came back, who signed
 * it off, when it was billed. Mirrors the invoice sheet's trail so the two read the same.
 *
 * Times render on the AIRPORT's clock like everything else on the board, not the reader's:
 * a dispatcher covering two fields from a third city needs "left at 9:12 local to the
 * aircraft"which is the only version of that time anyone at the field would recognise.
 */
export function ReservationAudit({ reservation }: { reservation: Reservation }) {
  const tz = useTimeZone(reservation.location);
  //The trail is fetched, not derived, wherever the server has it. A failure here is not
  //worth an error state: the derived timeline below is a complete fallback on its own.
  const recorded = useReservationAudit(reservation.id);
  const events = mergeTimeline(reservation, recorded.data);
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
                    {e.via && (
                      <span className="font-normal text-muted-foreground"> {e.via}</span>
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
