import type { OrganizationPreferences, Reservation, Role } from "@/types/api";
import { isAdmin, isInstructor, isStaff, isTechnician } from "@/lib/permissions";

/**
 * Where a reservation sits in the ramp-out → ramp-in → review → invoice pipeline.
 * Driven off the review readings + confirmations + invoice (all unambiguous), NOT the
 * `Plane.rampedIn` flag, whose "in flight vs on the ramp" meaning is inverted between the
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
 * Pilots who must sign off the review, instructors + students + renters (guests excluded),
 * counted as DISTINCT people rather than as seats.
 *
 * The server used to accept the same org user in two seats (booked as both the instructor
 * and the student). A confirmation is keyed on the person, so they can only ever sign off
 * once; summing the sides would ask for two and strand the close-out at "1 of 2 confirmed"
 * forever. New bookings are rejected server-side now, so this only has to read the ones
 * already in the database correctly, and it matches the server's own completion check
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
 * from the same person, so once they have, the button has to go, otherwise a pilot waiting
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

/**
 * Whether to even ask the server for this reservation's invoice.
 *
 * The server releases an invoice to staff (owner/admin/dispatcher), to the person billed
 * for it, and to the instructor on a guest booking. The reservation payload carries only a
 * slim invoice (id/total/paidAt/voidedAt, no customer), so the closest the web can get is
 * "staff, or someone rostered on this flight". That is enough to stop the common case: a
 * member with no billing role opening someone else's reservation and firing a request that
 * can only ever 403.
 */
export function canViewReservationInvoice(
  r: Reservation,
  orgUserId: number | null,
  isStaff: boolean
): boolean {
  if (isStaff) return true;
  return isReservationPersonnel(r, orgUserId);
}

/**
 * Is this a booking with no meters to read?
 *
 * A ground lesson has no aircraft, so no Hobbs or tach reading can ever exist for it. Both
 * `isRampedOut` and `isRampedIn` used to be defined purely in terms of those readings, which
 * made them permanently false here: `closeOutStep` sat at "rampOut" forever, asking the desk
 * for a number nobody can produce, and the ramp modal refused to submit without it. Reported
 * from the field against GROUP grounds, which is the shape a ground school actually books.
 *
 * `ReservationReview.briefing` is what ground time is measured with: the schema says so in
 * as many words, so that is the reading that stands in.
 *
 * Keyed on the TYPE first rather than only on the resource, because schools run a ground
 * lesson sitting in the aeroplane and that still has nothing to read at ramp-out. The
 * resource checks then cover a classroom booking and a booking with nothing booked at all.
 *
 * The app reaches the same conclusion via `Reservation.briefingOnlyNoRampIn`, which is
 * narrower, it requires an instructor, so a group ground with none still asks for Hobbs
 * there. Worth aligning; this is the surface the bug was reported on.
 */
export function usesBriefingNotMeters(r: Reservation): boolean {
  if (r.type === "ground") return true;
  if (r.resource == null) return true;
  return r.resource.type?.room != null;
}

export function isRampedOut(r: Reservation): boolean {
  const rev = r.review;
  if (usesBriefingNotMeters(r)) return rev?.briefing != null;
  return rev?.hobbsTimeOut != null || rev?.tachTimeOut != null;
}

export function isRampedIn(r: Reservation): boolean {
  const rev = r.review;
  //One briefing figure covers the whole lesson, there is no out-and-back to tell apart, so
  //recording it satisfies both steps and the flow moves straight to the sign-offs.
  if (usesBriefingNotMeters(r)) return rev?.briefing != null;
  return rev?.hobbsTimeIn != null || rev?.tachTimeIn != null;
}

/**
 * Live ledger flight_charge stakes (not reversed). Same notion of "already billed" as
 * `invoiceCoverage` / `alreadyBilledRefs` on the server.
 *
 * Do NOT require `FK_ledgerEntryId`: every `FK_*` field is stripped from API responses
 * (`stripForeignKeys`), so the wire payload only carries the nested `ledgerEntry`.
 * Requiring the scalar left ledger-billed flights looking unbilled — Create invoice
 * stayed live and meter corrections unlocked after money had already moved.
 */
export function liveLedgerStakes(r: Reservation) {
  return (r.payers ?? []).filter(
    (p) => !p.waived && p.ledgerEntry != null && !p.ledgerEntry.reversedBy
  );
}

/**
 * Has this booking been billed already — Stripe invoice and/or ledger flight_charge?
 *
 * Ledger mode posts no Invoice rows for members; treating those flights as unbilled would
 * keep "Create invoice" live and unlock meter corrections after money had moved.
 */
export function hasLiveBill(r: Reservation): boolean {
  return hasLiveInvoice(r) || liveLedgerStakes(r).length > 0;
}

export function closeOutStep(r: Reservation): CloseOutStep {
  //ANY live bill means the money side has started. A partial fan-out (invoice 2 of 3
  //failed) is still "invoiced" as far as the close-out FLOW is concerned, the pilots have
  //signed off and the readings are locked, and the retry lives on the billing side, which
  //knows which payers are still owed one. Ledger stakes count the same way.
  if (hasLiveBill(r)) return "invoiced";
  if (!isRampedOut(r)) return "rampOut";
  if (!isRampedIn(r)) return "rampIn";
  // Guest reservations don't collect pilot PINs, they're closed out by staff/instructor.
  if (isGuestReservation(r)) {
    return guestIsReviewed(r) ? "reviewed" : "confirmGuest";
  }
  const needed = reviewerCount(r);
  // Nobody to sign off (e.g. maintenance / solo with no personnel), treat as complete.
  if (needed === 0) return "reviewed";
  if (confirmationCount(r) >= needed) return "reviewed";
  return "confirm";
}

// ── Per-reservation action capabilities (mirror the Flutter model getters) ────
// Flutter gates each reservation action with three actor concepts: STAFF
// (admin/dispatcher, +technician for cancel), the PERSONNEL assigned to *this*
// reservation, and the CREATOR. The API strips FK_* scalars (so we can't see
// `createdBy` on the web), where Flutter also allows the creator we stay
// strictly more-restrictive, which only ever hides actions, never leaks them.

/** Is `orgUserId` listed as an INSTRUCTOR on this reservation specifically? */
export function isReservationInstructor(r: Reservation, orgUserId: number | null): boolean {
  if (orgUserId == null) return false;
  return (r.personnel?.instructors ?? []).some((i) => i.id === orgUserId);
}

/**
 * Who may CANCEL a reservation, mirrors Flutter's `canCancel` getter: the flight
 * hasn't been ramped out, isn't already cancelled, AND the viewer is staff
 * (owner/admin/dispatcher), a technician, or the instructor assigned to it.
 * Students/renters can't cancel someone else's flight (Flutter also allows the
 * creator, but that field isn't exposed to the web, see note above).
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
 * Who may RAMP OUT / RAMP IN a reservation, mirrors Flutter's `!viewOnly`:
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
 * Who may EDIT / reschedule a reservation, mirrors Flutter's `canEdit`: not
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

// ── Money and meters after the fact ──────────────────────────────────────────
// Three things a dispatcher could do on the phone and not in the console: retype a
// rate, fix a Hobbs reading somebody fat-fingered, and bill a flight that closed out
// while Stripe was unreachable. Each is gated here so the button and the server agree.

/**
 * Has EVERY required pilot signed off?
 *
 * The pivot both corrections and overrides turn on, and the server's own test
 * (`reviewIsComplete`, server/src/utils/reservationPersonnel.ts). Before it, changing the
 * money is allowed and costs the sign-offs collected so far. After it, both endpoints
 * refuse outright.
 *
 * Note what a booking with NOBODY to sign off does here: zero needed, zero collected, so
 * it reads as complete, exactly as the server's `>=` does. That is why the callers below
 * check it rather than reading `closeOutStep`, which reports the same booking as
 * "reviewed" only after inferring it.
 */
export function reviewIsComplete(r: Reservation): boolean {
  return confirmationCount(r) >= reviewerCount(r);
}

/** Does this booking have a live (non-void) Stripe invoice against it? */
export function hasLiveInvoice(r: Reservation): boolean {
  return (r.invoices ?? []).some((i) => !i.voidedAt);
}

/**
 * Is the school actually billing through this product?
 *
 * Both flags, the same pair Flutter's `isBillingEnabledAndStripeEnabled` reads. A school
 * that invoices on paper has no rate to override and no invoice to raise, so every action
 * below stays hidden rather than offering a button whose result nobody would ever see.
 */
export function billingIsLive(
  billing: { enabled?: boolean; stripeEnabled?: boolean } | null | undefined
): boolean {
  return billing?.enabled === true && billing?.stripeEnabled === true;
}

/**
 * Who may retype the rates on a booking. Mirrors the guard on
 * `POST /reservations/:id/paymentOverrides` exactly: admin or dispatcher always, and an
 * instructor only where the school has switched
 * "Instructors can override reservation prices" on.
 *
 * Roles only. Whether the BOOKING is still open to it is `canOverrideReservationPayment`.
 */
export function canOverridePricesInOrg(
  roles: Role[],
  preferences: OrganizationPreferences | null | undefined
): boolean {
  if (isStaff(roles)) return true;
  return preferences?.instructorsCanOverrideReservationPrices === true && isInstructor(roles);
}

/**
 * May this viewer override the price on THIS booking right now?
 *
 * Maintenance is excluded because pricing refuses it outright ("disabled"), and a
 * cancelled booking bills nobody. The rest is the server's own refusal, stated up front:
 * once every reviewer has confirmed, the endpoint answers "You can't override payment for
 * a reservation that has already been completed"and on a guest booking `completedByForGuest`
 * says the same thing. Offering the action there would be an invitation to a 400.
 */
export function canOverrideReservationPayment(
  r: Reservation,
  roles: Role[],
  preferences: OrganizationPreferences | null | undefined,
  billing: { enabled?: boolean; stripeEnabled?: boolean } | null | undefined
): boolean {
  if (r.cancelledAt) return false;
  if (r.type === "maintenance") return false;
  if (!billingIsLive(billing)) return false;
  if (!canOverridePricesInOrg(roles, preferences)) return false;
  if (isGuestReservation(r)) return !guestIsReviewed(r);
  return !reviewIsComplete(r);
}

/**
 * May this viewer correct the readings already recorded on THIS booking?
 *
 * Three server rules, in order:
 *  1. The permission is the ramp permission. `updateReviewTimes` requires the caller to be
 *     able to ramp the flight both out and in, which is staff or somebody on it.
 *  2. There has to be something to correct. The service refuses to write a Hobbs figure
 *     onto a booking whose Hobbs pair is not already filled in, so this only opens once the
 *     aircraft is back. Before that, ramp in rather than correct.
 *  3. It is refused after the sign-offs are complete, and refused again once ANY invoice
 *     exists, because an invoice describes hours the booking would no longer claim.
 *
 * A booking with no meters (a ground lesson) is measured by its instruction time alone, so
 * `isRampedIn` covers it through `usesBriefingNotMeters` and its briefing figure is the one
 * correctable field. `reviewerCount` guards the corner where there is nobody to sign off at
 * all: the server reads that as already reviewed and refuses.
 */
export function canCorrectReviewTimes(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  if (!isRampedIn(r)) return false;
  if (hasLiveBill(r)) return false;
  if (reviewerCount(r) === 0) return false;
  if (reviewIsComplete(r)) return false;
  return canRampReservation(r, roles, orgUserId);
}

/**
 * May this viewer raise the invoice for a flight that closed out without one?
 *
 * ADMIN ONLY, because `POST /reservations/:id/invoices` is `isOrgAdmin`. A dispatcher can
 * close a flight out and cannot bill it, which looks inconsistent and is the server's
 * settled position on org-wide money.
 *
 * The booking has to be fully signed off (the server refuses "Reservation has not been
 * reviewed") and carry no live invoice yet. A guest booking is billed by its own close-out
 * and is excluded: `confirmReviewGuest` mints the invoice, so there is no gap to fill.
 */
export function canCreateReservationInvoice(
  r: Reservation,
  roles: Role[],
  billing: { enabled?: boolean; stripeEnabled?: boolean } | null | undefined
): boolean {
  if (r.cancelledAt) return false;
  if (r.type === "maintenance") return false;
  if (!billingIsLive(billing)) return false;
  if (!isAdmin(roles)) return false;
  if (hasLiveBill(r)) return false;
  if (isGuestReservation(r)) return false;
  if (reviewerCount(r) === 0) return false;
  return reviewIsComplete(r);
}
