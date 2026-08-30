/**
 * Turning a computed `due` block into something a mechanic reads.
 *
 * The arithmetic is the server's (see `server/src/utils/maintenanceDue.ts`); this is only
 * the wording, and it lives in one file so the fleet card, the aircraft panel and the
 * reminders list can't drift into saying the same state three different ways.
 *
 * The phrasing rule throughout: lead with the NUMBER, because that is what somebody is
 * scanning for. "12.4 hrs" not "Due in 12.4 hours on the tach"the basis and the noun go
 * in the secondary line where there's room for them.
 */

import { format } from "date-fns";
import type { MaintenanceDue, MaintenanceReminder } from "@/types/api";

/** Meters are stored in tenths. 1204 is 120.4 on the clock. */
export const fromDeciHours = (deci: number): string => (deci / 10).toFixed(1);

export type DueTone = "danger" | "warning" | "muted" | "success";

/** One colour per band, used for badges, rails and the fleet card's dot alike. */
export function dueTone(due: MaintenanceDue | undefined): DueTone {
  switch (due?.status) {
    case "overdue":
      return "danger";
    case "dueSoon":
      return "warning";
    case "resolved":
      return "success";
    default:
      return "muted";
  }
}

/**
 * The headline figure: how much is left, in the unit the interval is counted in.
 *
 * Hours and days are deliberately NOT converted into each other. An hour-based 100-hour
 * has no due date (it depends entirely on how much the aircraft flies) and inventing one
 * from an average would be a guess presented as a fact.
 */
export function dueAmount(due: MaintenanceDue | undefined): string {
  if (!due) return "–";
  if (due.status === "resolved") return "Signed off";

  if (due.kind === "hours") {
    if (due.hoursRemaining == null) {
      return due.dueAtHours == null ? "Not set up" : `at ${fromDeciHours(due.dueAtHours)}`;
    }
    const hrs = fromDeciHours(Math.abs(due.hoursRemaining));
    if (due.hoursRemaining <= 0) return `${hrs} hrs over`;
    return `${hrs} hrs`;
  }

  if (due.daysRemaining == null) return "Not set up";
  const days = Math.abs(due.daysRemaining);
  if (due.daysRemaining < 0) return `${days} ${days === 1 ? "day" : "days"} over`;
  if (due.daysRemaining === 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The full sentence, for a detail row or a tooltip.
 *
 * Says which meter an hour-based item counts, because a school billing on Hobbs and
 * inspecting on tach is the normal case and "12.4 hrs" alone is ambiguous there.
 */
export function dueDetail(due: MaintenanceDue | undefined): string {
  if (!due) return "No interval set.";
  if (due.status === "resolved") return "Signed off. The next interval has started.";

  if (due.kind === "hours") {
    const meter = due.basis === "hobbs" ? "Hobbs" : "tach";
    if (due.dueAtHours == null) return "No starting meter reading, sign it off once to start the clock.";
    const at = `Due at ${fromDeciHours(due.dueAtHours)} ${meter}`;
    if (due.currentHours == null) return `${at}.`;
    return `${at}, now ${fromDeciHours(due.currentHours)}.`;
  }

  if (!due.dueAt) return "No due date set.";
  const on = format(new Date(due.dueAt), "MMM d, yyyy");
  if (due.daysRemaining == null) return `Due ${on}.`;
  if (due.daysRemaining < 0) return `Was due ${on}.`;
  if (due.daysRemaining === 0) return `Due today, ${on}.`;
  return `Due ${on}.`;
}

/**
 * The clock that is NOT the one binding, on a combined interval.
 *
 * Empty string on everything else, so a caller can render it unconditionally. Kept to one
 * short clause: the binding side is the answer, this is the reason the answer might change
 * before it arrives.
 */
export function alsoLabel(due: MaintenanceDue | undefined): string {
  const also = due?.also;
  if (!also || due?.status === "resolved") return "";

  if (also.kind === "hours") {
    if (also.dueAtHours == null) return "";
    const meter = also.basis === "hobbs" ? "Hobbs" : "tach";
    if (also.hoursRemaining == null) return `also due at ${fromDeciHours(also.dueAtHours)} ${meter}`;
    if (also.hoursRemaining <= 0) return `also ${fromDeciHours(Math.abs(also.hoursRemaining))} hrs over on ${meter}`;
    return `also ${fromDeciHours(also.hoursRemaining)} hrs on ${meter}`;
  }

  if (!also.dueAt || also.daysRemaining == null) return "";
  const on = format(new Date(also.dueAt), "MMM d");
  if (also.daysRemaining < 0) return `also ${Math.abs(also.daysRemaining)} days over, ${on}`;
  return `also ${also.daysRemaining} ${also.daysRemaining === 1 ? "day" : "days"}, ${on}`;
}

/** Short badge text. Empty string means "don't badge this one", an ok item needs none. */
export function dueBadge(due: MaintenanceDue | undefined): string {
  if (due?.status === "overdue") return "Overdue";
  if (due?.status === "dueSoon") return "Due soon";
  return "";
}

/**
 * How full the interval is, 0–100, for a progress rail.
 *
 * Clamped at 100 rather than overflowing: past due, the bar is full and the number beside
 * it carries "how far past". A 140% bar just looks broken.
 */
export function duePercent(due: MaintenanceDue | undefined): number {
  if (due?.progress == null) return 0;
  return Math.max(0, Math.min(100, Math.round(due.progress * 100)));
}

/** "100.0 hours tach", the meter half of an interval. */
function hoursPhrase(deci: number, hourBasedOn?: string | null): string {
  return `${fromDeciHours(deci)} hours ${hourBasedOn === "hobbs" ? "Hobbs" : "tach"}`;
}

/**
 * "12 months", or "30 days" where months would misstate the rule.
 *
 * Two months is the floor, and the VOR check is why: it is 30 days by regulation, not one
 * calendar month, and rounding it to "1 month" states a different rule than §91.171 sets.
 * Anything shorter keeps its own unit.
 */
/**
 * A calendar interval, said as it is actually stored.
 *
 * THIS USED TO GUESS. A 365-day interval was rendered "12 months" because the number was
 * close to twelve of something, which was the most misleading thing on the page: the school
 * read "12 months", the engine counted 365 days, and a calendar month runs to the end of the
 * month, so the aeroplane came off the line up to a month before it had to.
 *
 * Now a month interval is a real thing (`remindMonths`) and says "calendar months", and a day
 * interval says days. Whole weeks read as weeks from two up, because 14 days IS a fortnight
 * and nothing is lost saying so, but nothing is ever rounded into a unit it is not stored in.
 */
function calendarPhrase(t: { remindDays?: number | null; remindMonths?: number | null }): string {
  if (t.remindMonths) {
    return `${t.remindMonths} calendar ${t.remindMonths === 1 ? "month" : "months"}`;
  }
  const days = t.remindDays ?? 0;
  if (days >= 14 && days % 7 === 0) {
    const weeks = days / 7;
    return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** What a template's interval says, in words, for the templates list. */
export function intervalLabel(t: {
  remindDays?: number | null;
  remindMonths?: number | null;
  remindHours?: number | null;
  remindDate?: string | null;
  remindAtHours?: number | null;
  hourBasedOn?: string | null;
}): string {
  // A one-off METER deadline, checked first because it is exclusive with everything below.
  // Without this it fell through to "No interval set", which is the same string a genuinely
  // half-configured template shows: the correctly-set AD that WILL ground the aircraft read
  // exactly like the broken one that will never fire, and the reading it comes due at, the
  // only number that matters, appeared nowhere on the page.
  if (t.remindAtHours != null) {
    return `Once, at ${hoursPhrase(t.remindAtHours, t.hourBasedOn)}`;
  }
  // Both clocks: say so explicitly. "Every 100.0 hours tach" on a template that is also
  // counting an annual is a true statement that leaves out the half more likely to bite.
  if (t.remindHours && (t.remindDays || t.remindMonths)) {
    return `Every ${hoursPhrase(t.remindHours, t.hourBasedOn)} or ${calendarPhrase(t)}, whichever comes first`;
  }
  if (t.remindHours) return `Every ${hoursPhrase(t.remindHours, t.hourBasedOn)}`;
  if (t.remindDays || t.remindMonths) return `Every ${calendarPhrase(t)}`;
  if (t.remindDate) return `Once, ${format(new Date(t.remindDate), "MMM d, yyyy")}`;
  return "No interval set";
}

/**
 * What kind of rule this is, said the way a mechanic would say it.
 *
 * `sourceBadge` is the two letters that fit on a list row. `sourceLabel` is the full
 * identification for a record page. Both live here, beside `intervalLabel`, so the four
 * surfaces that show a source cannot word it four different ways.
 */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  ad: "Airworthiness Directive",
  sb: "Service Bulletin",
  manufacturer: "Manufacturer",
  shop: "Shop",
  other: "Other",
};

/** "AD" / "SB" for a row, null for the sources that need no flag. */
export function sourceBadge(t: { sourceType?: string | null }): string | null {
  if (t.sourceType === "ad") return "AD";
  if (t.sourceType === "sb") return "SB";
  return null;
}

/** "AD 2015-19-07 Rev 2", or just the number when the type is unremarkable. */
export function sourceLabel(t: {
  sourceType?: string | null;
  sourceRef?: string | null;
  revision?: string | null;
}): string | null {
  const badge = sourceBadge(t);
  const parts = [badge, t.sourceRef, t.revision ? `Rev ${t.revision}` : null].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** The warning lead time, in words. Both leads on a combined interval, they differ. */
export function warningLabel(t: { remindDaysBefore?: number | null; remindHoursBefore?: number | null }): string {
  const days = t.remindDaysBefore ? `${t.remindDaysBefore} ${t.remindDaysBefore === 1 ? "day" : "days"}` : null;
  const hours = t.remindHoursBefore ? `${fromDeciHours(t.remindHoursBefore)} hours` : null;
  if (hours && days) return `Warns ${hours} or ${days} out`;
  if (hours) return `Warns ${hours} out`;
  if (days) return `Warns ${days} out`;
  return "No advance warning";
}

/**
 * Roll a tail's reminders up into the one line a fleet card shows.
 *
 * The rule is "worst first, then soonest", which the server's `urgency` already encodes.
 * so this trusts the order it arrived in rather than re-deriving it and risking a
 * different answer than the list on the next page.
 */
/**
 * How the whole fleet stands, in the numbers a shop manager scans for.
 *
 * The by-aircraft grid answers "what does THIS tail owe" well and "how are we doing" not at
 * all: on a fleet of eleven you read eleven cards to learn that two need attention. These
 * are the counts that belong above the grid.
 *
 * Counted in TAILS, not items, and the four states are mutually exclusive worst-first so
 * they add up to the fleet. `grounded` sits outside that: an aircraft is off the line for
 * reasons that have nothing to do with an inspection (an open squawk, a prop strike), and
 * folding it into the same run of numbers would double-count it or hide it.
 */
export type TailBucket = "overdue" | "dueSoon" | "current" | "untracked";

/**
 * Which single state a tail is in, worst first.
 *
 * One definition, used by both the summary line and the Status filter beside it, so a
 * fleet that reads "2 overdue" cannot filter to a different two. Grounded is deliberately
 * NOT a bucket here: it is a separate axis, and it has its own filter.
 */
export function tailBucket(summary: ReturnType<typeof fleetSummary>): TailBucket {
  if (summary.total === 0) return "untracked";
  if (summary.overdue > 0) return "overdue";
  if (summary.dueSoon > 0) return "dueSoon";
  return "current";
}

export function fleetTotals(
  entries: { grounded: boolean; summary: ReturnType<typeof fleetSummary> }[]
) {
  let grounded = 0;
  let overdue = 0;
  let dueSoon = 0;
  let current = 0;
  let untracked = 0;

  for (const { grounded: isGrounded, summary } of entries) {
    if (isGrounded) grounded += 1;
    switch (tailBucket(summary)) {
      case "untracked":
        untracked += 1;
        break;
      case "overdue":
        overdue += 1;
        break;
      case "dueSoon":
        dueSoon += 1;
        break;
      default:
        current += 1;
    }
  }

  return {
    tails: entries.length,
    grounded,
    overdue,
    dueSoon,
    current,
    untracked,
    /** Nothing needs a human today. Untracked is NOT fine, so it does not count as clear. */
    allClear: overdue === 0 && dueSoon === 0 && untracked === 0 && grounded === 0,
  };
}

export function fleetSummary(reminders: MaintenanceReminder[]) {
  const live = reminders.filter((r) => r.resolvedAt == null);
  const overdue = live.filter((r) => r.due?.status === "overdue");
  const dueSoon = live.filter((r) => r.due?.status === "dueSoon");
  const sorted = [...live].sort((a, b) => (a.due?.urgency ?? 99) - (b.due?.urgency ?? 99));

  return {
    total: live.length,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    /** The item to name on the card, the one that needs attention first. */
    next: sorted[0] ?? null,
    tone: overdue.length ? ("danger" as const) : dueSoon.length ? ("warning" as const) : ("success" as const),
  };
}

/**
 * The FAA certificate ratings a mechanic can be recorded under.
 *
 * ONE LIST, because the value is snapshotted onto a permanent compliance record verbatim
 * and the report groups by it. Two copies drifted once already, into "Repair Station" on
 * the phone and "Repair station" here, which split one mechanic's history into two buckets
 * on the document handed to an inspector. Mirrors `_certTypes` in the Flutter sign-off
 * sheet; change both together.
 */
export const MECHANIC_CERTIFICATE_TYPES = ["A&P", "IA", "Repair station"] as const;
