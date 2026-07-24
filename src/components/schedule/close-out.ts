import type { Reservation } from "@/types/api";

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

/** Pilots who must sign off the review — instructors + students + renters (guests excluded). */
export function reviewerCount(r: Reservation): number {
  const p = r.personnel;
  return (p?.instructors?.length ?? 0) + (p?.students?.length ?? 0) + (p?.renters?.length ?? 0);
}

/** How many of the required pilots have already confirmed. */
export function confirmationCount(r: Reservation): number {
  return r.review?.reviewConfirmations?.length ?? 0;
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
