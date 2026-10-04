import type { Reservation } from "@/types/api";
import type { WorkStatus } from "@/components/maintenance/work-status-icon";
import { closeOutStep, confirmationCount, isGuestReservation, reviewerCount, usesBriefingNotMeters } from "./close-out";

/**
 * Where a booking stands, one answer per booking, in the order a dispatcher works them.
 *
 * Read off `closeOutStep`, the same step the detail panel draws (Dispatch, In flight, Review,
 * Billed), so the list and the panel can't disagree, plus the clock: a booking nobody ramped
 * out is "Upcoming" before its start, "Due out" during it and "Never ramped out" after it.
 * Reading ramp state alone called a flight from last week "Not out yet", and called a flight
 * waiting on one pilot's PIN "Back, not closed out" while the panel said "1 of 2 confirmed".
 */
export type Status =
  | "overdue"
  | "inFlight"
  | "dueOut"
  | "signoff"
  | "upcoming"
  | "neverOut"
  | "neverRecorded"
  | "closed"
  | "cancelled";

export const STATUSES: { id: Status; label: string; icon: WorkStatus }[] = [
  { id: "overdue", label: "Overdue back", icon: "progress" },
  { id: "inFlight", label: "Out now", icon: "approved" },
  { id: "dueOut", label: "Due out", icon: "todo" },
  { id: "signoff", label: "Needs sign-off", icon: "deferred" },
  { id: "upcoming", label: "Upcoming", icon: "todo" },
  { id: "neverOut", label: "Never ramped out", icon: "notAsked" },
  // A ground lesson or briefing never ramps out; what never happened is its record. Its own
  // group, so a group called "Never ramped out" never holds rows that could not have.
  { id: "neverRecorded", label: "Never recorded", icon: "notAsked" },
  { id: "closed", label: "Closed out", icon: "done" },
  { id: "cancelled", label: "Cancelled", icon: "declined" },
];
export const STATUS_RANK = new Map(STATUSES.map((s, i) => [s.id, i]));
export const STATUS_BY_ID = new Map(STATUSES.map((s) => [s.id, s]));

export function statusOf(r: Reservation, now: Date): Status {
  if (r.cancelledAt) return "cancelled";
  const step = closeOutStep(r);
  if (step === "reviewed" || step === "invoiced") return "closed";
  const t = now.getTime();
  const start = Date.parse(r.start);
  const end = Date.parse(r.end);
  if (step === "rampOut") {
    if (t < start) return "upcoming";
    if (t < end) return "dueOut";
    return usesBriefingNotMeters(r) ? "neverRecorded" : "neverOut";
  }
  if (step === "rampIn") return t > end ? "overdue" : "inFlight";
  // Sign-offs. A ground lesson with no instruction to record reaches this step the moment it
  // is booked; nobody can sign for a lesson that hasn't happened, so before its start it is
  // still upcoming.
  return t < start ? "upcoming" : "signoff";
}

/** The status as a row says it: with the sign-offs still owed, or what was never recorded. */
export function statusText(r: Reservation, status: Status): string {
  if (status === "signoff") {
    if (isGuestReservation(r)) return "Needs close-out";
    return `Needs sign-off, ${confirmationCount(r)} of ${reviewerCount(r)}`;
  }
  return STATUS_BY_ID.get(status)!.label;
}
