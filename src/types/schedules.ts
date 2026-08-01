/**
 * Scheduled report delivery, mirroring `server/src/routes/reports/schedules.routes.ts`.
 *
 * Times are wall-clock values in the SCHOOL's zone, never the browser's. A
 * schedule set to 7 means 7am at the field, and the console must not helpfully
 * convert it to the reader's clock — the whole point is that the report lands
 * at the start of the school's day wherever the person reading it happens to be.
 */

export const CADENCES = ["daily", "weekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export interface ReportSchedule {
  id: number;
  cadence: Cadence;
  /** 0–23, at the school. */
  hour: number;
  /** 0 = Sunday. Weekly only. */
  weekday: number | null;
  /** 1–28. Monthly only — see the server schema for why it stops at 28. */
  dayOfMonth: number | null;
  isEnabled: boolean;
  recipientOrgUserIds: number[];
  /** Addresses outside the school. Owner/admin only, and only delivered to while
   *  the schedule's creator still has access to the report. */
  recipientEmails: string[];
  lastRunAt: string | null;
  /** Why the last send failed. Shown rather than swallowed: a schedule that has
   *  stopped arriving is otherwise invisible. */
  lastError: string | null;
  createdAt: string;
  reportView: { id: number; name: string; reportId: string } | null;
  reportName: string | null;
  createdByName: string | null;
  /** Whether this caller may edit or delete it (its creator, or an admin). */
  isMine: boolean;
}

export interface ScheduleInput {
  reportViewId: number;
  cadence: Cadence;
  hour: number;
  weekday?: number | null;
  dayOfMonth?: number | null;
  recipientOrgUserIds: number[];
  recipientEmails?: string[];
  isEnabled?: boolean;
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "7am", "12pm", "6pm" — a schedule picker doesn't need minutes. */
export function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/** "Every Monday at 7am", "On the 1st at 7am" — one line, no jargon. */
export function describeSchedule(schedule: {
  cadence: Cadence;
  hour: number;
  weekday: number | null;
  dayOfMonth: number | null;
}): string {
  const at = ` at ${formatHour(schedule.hour)}`;
  if (schedule.cadence === "daily") return `Every day${at}`;
  if (schedule.cadence === "weekly") {
    return `Every ${WEEKDAYS[schedule.weekday ?? 1]}${at}`;
  }
  return `On the ${ordinal(schedule.dayOfMonth ?? 1)}${at}`;
}

/** What a cadence actually covers — stated in the UI so nobody has to guess. */
export function describeCoverage(cadence: Cadence): string {
  if (cadence === "daily") return "Covers the previous day";
  if (cadence === "weekly") return "Covers the previous 7 days";
  return "Covers the previous calendar month";
}

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}
