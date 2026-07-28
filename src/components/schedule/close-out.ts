import type { Reservation, Role } from "@/types/api";
import { isStaff, isTechnician } from "@/lib/permissions";

/**
 * Where a reservation sits in the ramp-out → ramp-in → review → invoice pipeline.
 * Driven off the review readings + confirmations + invoice (all unambiguous), NOT the
 * `Plane.rampedIn` flag — whose "in flight vs on the ramp" meaning is inverted between the
 * server contract and the existing web `planeStatus` helper.
 */
export type CloseOutStep = "rampOut" | "rampIn" | "confirm" | "confirmGuest" | "reviewed" | "invoiced";

/** Guest reservations close out via `confirmReviewGuest` (no PIN) instead of pilot sign-offs. */
export function isGuestReservation(r: Reservation): boolean {
  return r.type === "guest";
}

/** Has a guest reservation been reviewed? (Server sets `completedByForGuest` on review.) */
export function guestIsReviewed(r: Reservation): boolean {
  return r.completedByForGuest != null;
}

/**
 * Who may close out a guest reservation: an admin/owner, or the instructor on the reservation.
 * (The server also allows the reservation's creator; we can't see that field on the web, so we
 * let the attempt through for staff/instructors and surface any 403 gracefully.)
 */
export function canReviewGuest(
  r: Reservation,
  orgUserId: number | null,
  isAdmin: boolean
): boolean {
  if (orgUserId == null) return false;
  if (isAdmin) return true;
  return (r.personnel?.instructors ?? []).some((i) => i.id === orgUserId);
}

/**
 * Pilots who must sign off the review — instructors + students + renters (guests excluded),
 * counted as DISTINCT people rather than as seats.
 *
 * The server used to accept the same org user in two seats (booked as both the instructor
 * and the student). A confirmation is keyed on the person, so they can only ever sign off
 * once; summing the sides would ask for two and strand the close-out at "1 of 2 confirmed"
 * forever. New bookings are rejected server-side now, so this only has to read the ones
 * already in the database correctly — and it matches the server's own completion check
 * (server/src/utils/reservationPersonnel.ts).
 */
export function reviewerCount(r: Reservation): number {
  const p = r.personnel;
  const ids = [...(p?.instructors ?? []), ...(p?.students ?? []), ...(p?.renters ?? [])].map(
    (ou) => ou.id
  );
  return new Set(ids).size;
}

/** How many of the required pilots have already confirmed. */
export function confirmationCount(r: Reservation): number {
  return r.review?.reviewConfirmations?.length ?? 0;
}

/**
 * Has `orgUserId` already signed off this review? The server rejects a second confirmation
 * from the same person, so once they have, the button has to go — otherwise a pilot waiting
 * on their counterpart still sees "Confirm review" and gets a 400 for pressing it.
 *
 * Reads the nested relation id, never a `FK_*` scalar: the server strips every FK_* field
 * from API responses, so `FK_reviewedByOrgUserId` is never actually present.
 */
export function hasConfirmedReview(r: Reservation, orgUserId: number | null): boolean {
  if (orgUserId == null) return false;
  return (r.review?.reviewConfirmations ?? []).some((c) => c.reviewedBy?.id === orgUserId);
}

/** Is `orgUserId` one of the pilots on this reservation (i.e. eligible to confirm)? */
export function isReservationPersonnel(r: Reservation, orgUserId: number | null): boolean {
  if (orgUserId == null) return false;
  const p = r.personnel;
  return [...(p?.instructors ?? []), ...(p?.students ?? []), ...(p?.renters ?? [])].some(
    (ou) => ou.id === orgUserId
  );
}

export function isRampedOut(r: Reservation): boolean {
  const rev = r.review;
  return rev?.hobbsTimeOut != null || rev?.tachTimeOut != null;
}

export function isRampedIn(r: Reservation): boolean {
  const rev = r.review;
  return rev?.hobbsTimeIn != null || rev?.tachTimeIn != null;
}

export function closeOutStep(r: Reservation): CloseOutStep {
  if (r.invoice) return "invoiced";
  if (!isRampedOut(r)) return "rampOut";
  if (!isRampedIn(r)) return "rampIn";
  // Guest reservations don't collect pilot PINs — they're closed out by staff/instructor.
  if (isGuestReservation(r)) {
    return guestIsReviewed(r) ? "reviewed" : "confirmGuest";
  }
  const needed = reviewerCount(r);
  // Nobody to sign off (e.g. maintenance / solo with no personnel) — treat as complete.
  if (needed === 0) return "reviewed";
  if (confirmationCount(r) >= needed) return "reviewed";
  return "confirm";
}

// ── Per-reservation action capabilities (mirror the Flutter model getters) ────
// Flutter gates each reservation action with three actor concepts: STAFF
// (admin/dispatcher, +technician for cancel), the PERSONNEL assigned to *this*
// reservation, and the CREATOR. The API strips FK_* scalars (so we can't see
// `createdBy` on the web) — where Flutter also allows the creator we stay
// strictly more-restrictive, which only ever hides actions, never leaks them.

/** Is `orgUserId` listed as an INSTRUCTOR on this reservation specifically? */
export function isReservationInstructor(r: Reservation, orgUserId: number | null): boolean {
  if (orgUserId == null) return false;
  return (r.personnel?.instructors ?? []).some((i) => i.id === orgUserId);
}

/**
 * Who may CANCEL a reservation — mirrors Flutter's `canCancel` getter: the flight
 * hasn't been ramped out, isn't already cancelled, AND the viewer is staff
 * (owner/admin/dispatcher), a technician, or the instructor assigned to it.
 * Students/renters can't cancel someone else's flight (Flutter also allows the
 * creator, but that field isn't exposed to the web — see note above).
 */
export function canCancelReservation(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  if (isRampedOut(r)) return false;
  return isStaff(roles) || isTechnician(roles) || isReservationInstructor(r, orgUserId);
}

/**
 * Who may RAMP OUT / RAMP IN a reservation — mirrors Flutter's `!viewOnly`:
 * staff or any pilot assigned to the flight. (Creator branch omitted, as above.)
 */
export function canRampReservation(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  return isStaff(roles) || isReservationPersonnel(r, orgUserId);
}

/**
 * Who may EDIT / reschedule a reservation — mirrors Flutter's `canEdit`: not
 * cancelled, not yet departed, not already past, and the viewer is staff or a
 * pilot on it. The server's `PATCH /reservations/:id` allows creator ∪ personnel
 * ∪ admin ∪ dispatcher; as elsewhere we can't see the creator, so we stay
 * strictly more-restrictive.
 *
 * Once the aircraft has ramped out, editing stops. Flutter keeps the END time
 * editable in that state; the web's availability-driven time picker can't offer
 * slots around a start that's already in the past, so rather than ship a
 * half-working picker this returns false and a later "extend return time"
 * action can cover it properly.
 *
 * `now` is injectable so this stays a pure function for testing.
 */
export function canEditReservation(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null,
  now: Date = new Date()
): boolean {
  if (r.cancelledAt) return false;
  if (isRampedOut(r)) return false;
  if (new Date(r.end).getTime() < now.getTime()) return false;
  return isStaff(roles) || isReservationPersonnel(r, orgUserId);
}
