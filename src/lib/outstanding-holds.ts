import type { MaintenanceReminder, Squawk } from "@/types/api";

/**
 * What is still holding an aircraft off the line, in the mechanic's own terms.
 *
 * Empty when nothing is. A grounding REASON is a sentence somebody typed and it goes
 * stale: the tail that started this work read "Annual inspection overdue" while the annual
 * was 225 days out and every inspection on it was current. The reason alone is not enough
 * to decide whether to release an aeroplane, so the grounded banner says what is actually
 * outstanding beside it, and the confirm repeats it before anyone overrides.
 *
 * A pure function rather than logic inlined in a page so the aircraft record and the fleet
 * list cannot drift into counting differently. `outstanding_holds.dart` derives the same
 * two numbers the same way on the phone.
 */
export function outstandingHolds({
  reminders,
  squawks,
}: {
  reminders?: MaintenanceReminder[];
  squawks?: Squawk[];
}): string[] {
  const overdue = (reminders ?? []).filter((r) => r.due?.status === "overdue").length;
  //Only GROUNDING squawks. A flickering nav light is a discrepancy, not a reason the
  //aeroplane is on the ground, and counting it here would tell a mechanic the tail is held
  //by something that was never holding it.
  const grounding = (squawks ?? []).filter((sq) => sq.grounding && sq.resolvedAt === null).length;

  return [
    overdue > 0 ? `${overdue} inspection${overdue === 1 ? "" : "s"} overdue` : null,
    grounding > 0 ? `${grounding} grounding squawk${grounding === 1 ? "" : "s"} open` : null,
  ].filter((s): s is string => s !== null);
}

/** The same list as one sentence, for the grounded banner. Empty when nothing is open. */
export const outstandingSentence = (holds: string[]): string =>
  holds.length ? `${holds.join(" and ")} on this aircraft.` : "";

/**
 * The description for the "return to service" confirm, whether or not anything is open.
 *
 * Returning a tail to service over the top of an overdue inspection is a decision somebody
 * is allowed to make, and it should not be one they make without being told what they are
 * overriding.
 */
export const returnToServiceDescription = (holds: string[]): string =>
  holds.length
    ? `${outstandingSentence(holds)} It will be schedulable again anyway.`
    : "Nothing is outstanding on this aircraft. It will be schedulable again.";
