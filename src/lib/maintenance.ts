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

/** What a template's interval says, in words, for the templates list. */
export function intervalLabel(t: {
  remindDays?: number | null;
  remindHours?: number | null;
  remindDate?: string | null;
  hourBasedOn?: string | null;
}): string {
  if (t.remindHours) {
    return `Every ${fromDeciHours(t.remindHours)} hours ${t.hourBasedOn === "hobbs" ? "Hobbs" : "tach"}`;
  }
  if (t.remindDays) {
    // Say "12 months" rather than "365 days" where it lands on a round figure, that is how
    // the reg is written and how a mechanic says it out loud.
    //
    // Two months is the floor, and the VOR check is why: it is 30 days by regulation, not
    // one calendar month, and rounding it to "1 month" states a different rule than the one
    // §91.171 sets. Anything shorter keeps its own unit.
    const months = t.remindDays / 30.44;
    const rounded = Math.round(months);
    const clean = rounded >= 2 && Math.abs(months - rounded) < 0.2;
    if (clean) return `Every ${rounded} months`;
    return `Every ${t.remindDays} days`;
  }
  if (t.remindDate) return `Once, ${format(new Date(t.remindDate), "MMM d, yyyy")}`;
  return "No interval set";
}

/** The warning lead time, in words. */
export function warningLabel(t: { remindDaysBefore?: number | null; remindHoursBefore?: number | null }): string {
  if (t.remindHoursBefore) return `Warns ${fromDeciHours(t.remindHoursBefore)} hours out`;
  if (t.remindDaysBefore) return `Warns ${t.remindDaysBefore} ${t.remindDaysBefore === 1 ? "day" : "days"} out`;
  return "No advance warning";
}

/**
 * Roll a tail's reminders up into the one line a fleet card shows.
 *
 * The rule is "worst first, then soonest", which the server's `urgency` already encodes.
 * so this trusts the order it arrived in rather than re-deriving it and risking a
 * different answer than the list on the next page.
 */
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
