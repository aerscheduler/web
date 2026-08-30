/**
 * How a calendar interval is entered, and what it becomes on the wire.
 *
 * THREE UNITS, TWO WIRE FIELDS. Days and weeks are the same thing to the server: a week is
 * exactly seven days, always, so entering "every 2 weeks" and "every 14 days" produce an
 * identical row and neither loses information. Months are not: a calendar month runs to the
 * END of the month, so 14 CFR 91.409(a)'s "within the preceding 12 calendar months" makes an
 * annual signed on any day in February good through the end of February the following year.
 * Storing that as 365 days brought it due up to a month early.
 *
 * So months get their own field, `remindMonths`, and the server derives a day approximation
 * beside it for builds already in the field. Weeks stay presentation.
 */

export const CALENDAR_UNITS = ["days", "weeks", "months"] as const;
export type CalendarUnit = (typeof CALENDAR_UNITS)[number];

export const CALENDAR_UNIT_LABEL: Record<CalendarUnit, string> = {
  days: "days",
  weeks: "weeks",
  months: "months",
};

/** What the server is sent for one calendar clock. The warning window is always in days. */
export function calendarPayload(
  unit: CalendarUnit,
  every: number,
  warnDays: number
): { remindDays?: number; remindMonths?: number; remindDaysBefore: number } {
  const n = Math.max(1, Math.round(every || 0));
  const warn = Math.max(1, Math.round(warnDays || 1));

  if (unit === "months") return { remindMonths: n, remindDaysBefore: warn };
  if (unit === "weeks") return { remindDays: n * 7, remindDaysBefore: warn };
  return { remindDays: n, remindDaysBefore: warn };
}

/**
 * Read a stored template back into the pair a form shows.
 *
 * A day count that divides evenly into whole weeks reads back as weeks, from two weeks up:
 * 14 days IS a fortnight, nothing is lost saying so, and it is how somebody who typed weeks
 * expects to find it again. Seven days stays "7 days" because "1 week" is not an improvement
 * on it and a single-unit interval reads oddly.
 */
export function calendarFromTemplate(template: {
  remindDays?: number | null;
  remindMonths?: number | null;
}): { unit: CalendarUnit; every: number } | null {
  if (template.remindMonths) return { unit: "months", every: template.remindMonths };
  const days = template.remindDays;
  if (!days) return null;
  if (days >= 14 && days % 7 === 0) return { unit: "weeks", every: days / 7 };
  return { unit: "days", every: days };
}

/** "Every 12 calendar months", "Every 2 weeks", "Every 50 days". */
export function calendarIntervalLabel(template: {
  remindDays?: number | null;
  remindMonths?: number | null;
}): string | null {
  const parsed = calendarFromTemplate(template);
  if (!parsed) return null;
  const { unit, every } = parsed;
  if (unit === "months") {
    return `Every ${every} calendar ${every === 1 ? "month" : "months"}`;
  }
  const noun = unit === "weeks" ? "week" : "day";
  return `Every ${every} ${every === 1 ? noun : `${noun}s`}`;
}
