import type { MaintenanceReminderTemplate, ReminderSteps } from "@/types/api";

/**
 * Reminder steps on the console (Murray spec 6), mirroring the server's utils/reminderSteps.ts:
 * the rule's own steps, else the defaults (the shop's single old warning; owners 30 and 7 days,
 * 10 hours). Hours are TENTHS.
 */
export const OWNER_DAY_STEPS = [30, 7];
export const OWNER_HOUR_STEPS = [100];
export const MAX_STEPS = 6;

export type StepKey = keyof ReminderSteps;

/** The defaults a rule falls back to when it does not set a list. */
export function ruleDefaults(t: Pick<MaintenanceReminderTemplate, "remindDaysBefore" | "remindHoursBefore">): Required<ReminderSteps> {
  return {
    shopDays: t.remindDaysBefore ? [t.remindDaysBefore] : [],
    shopHours: t.remindHoursBefore ? [t.remindHoursBefore] : [],
    ownerDays: OWNER_DAY_STEPS,
    ownerHours: OWNER_HOUR_STEPS,
  };
}

/** What applies on a rule: its own lists, else the defaults. */
export function ruleSteps(t: Pick<MaintenanceReminderTemplate, "remindDaysBefore" | "remindHoursBefore" | "reminderSteps">): Required<ReminderSteps> {
  const d = ruleDefaults(t);
  const own = t.reminderSteps ?? {};
  return {
    shopDays: own.shopDays ?? d.shopDays,
    shopHours: own.shopHours ?? d.shopHours,
    ownerDays: own.ownerDays ?? d.ownerDays,
    ownerHours: own.ownerHours ?? d.ownerHours,
  };
}

/** "90, 30 and 7 days" / "25 and 10 hours" / "" for none. */
export function stepsText(steps: readonly number[], unit: "days" | "hours"): string {
  if (!steps.length) return "";
  const words = [...steps].sort((a, b) => b - a).map((s) => (unit === "hours" ? (s / 10).toFixed(s % 10 ? 1 : 0) : String(s)));
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  const one = steps.length === 1 && (unit === "hours" ? steps[0] === 10 : steps[0] === 1);
  return `${list} ${unit === "hours" ? (one ? "hour" : "hours") : one ? "day" : "days"}`;
}

/** The shop's warnings in a few words, for a rule's row: "Warns 90, 30 and 7 days out". */
export function shopWarnText(steps: Required<ReminderSteps>, clocks: { days: boolean; hours: boolean }): string {
  const days = clocks.days ? stepsText(steps.shopDays, "days") : "";
  const hours = clocks.hours ? stepsText(steps.shopHours, "hours") : "";
  if (days && hours) return `Warns ${hours} or ${days} out`;
  if (days || hours) return `Warns ${days || hours} out`;
  return "No advance warning";
}
