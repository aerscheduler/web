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

/**
 * Is there a billable INSTRUCTION line on this booking?
 *
 * The server's rule, verbatim (`payment.ts`, `isStudentWithInstructorReservation` /
 * `isGuestWithInstructorReservation`): an instructor AND a student, or a guest flight with
 * an instructor. An instructor flying alone is renting, not teaching.
 *
 * Lives here rather than in the two components that had a copy each, because the ramp
 * checks below need it too: without it the console asked for a briefing figure on a booking
 * that has no instruction to bill, and no figure would ever arrive.
 */
export function hasInstruction(r: Reservation): boolean {
  if ((r.personnel?.instructors?.length ?? 0) === 0) return false;
  return (r.personnel?.students?.length ?? 0) > 0 || r.type === "guest";
}

/**
 * Which meter does this booking's aircraft bill on?
 *
 * `PlaneCost.billByHobbsTime` / `SimulatorCost.billByHobbsTime`, defaulting to Hobbs, which
 * is the column default and what every resource has unless somebody changed it.
 *
 * This is not a display preference. The server prices the booking off exactly this meter
 * (`payment.ts`), and a `measured` split then reconciles each pilot's own leg against that
 * number. So the panel that collects those legs has to ask for the SAME meter: collecting
 * Hobbs legs for a tach-billed aircraft produced a sum that could not match the total, and
 * the close-out was refused with a message blaming the crew's readings.
 *
 * Hobbs and tach do not run at the same rate, so this is not a rounding difference.
 */
export function billsOnHobbs(r: Reservation): boolean {
  const t = r.resource?.type as
    | { plane?: { cost?: { billByHobbsTime?: boolean } | null } | null; simulator?: { cost?: { billByHobbsTime?: boolean } | null } | null }
    | undefined;
  const cost = t?.plane?.cost ?? t?.simulator?.cost ?? null;
  return cost?.billByHobbsTime !== false;
}

/**
 * A briefing-only booking is "ramped out" once the briefing is recorded, OR immediately
 * when there is no instruction to record.
 *
 * The second half was missing, and it is the disagreement a customer would have hit: a
 * ground lesson in a room with students and NO instructor has no instruction line, so no
 * briefing figure is ever coming. The console waited for one forever while the phone moved
 * straight to the sign-offs. The server settles it: `reviewIsComplete` counts sign-offs and
 * never looks at `briefing`, so the phone was right.
 */
export function isRampedOut(r: Reservation): boolean {
  const rev = r.review;
  if (usesBriefingNotMeters(r)) return !hasInstruction(r) || rev?.briefing != null;
  return rev?.hobbsTimeOut != null || rev?.tachTimeOut != null;
}

export function isRampedIn(r: Reservation): boolean {
  const rev = r.review;
  //One briefing figure covers the whole lesson, there is no out-and-back to tell apart, so
  //recording it satisfies both steps and the flow moves straight to the sign-offs.
  if (usesBriefingNotMeters(r)) return !hasInstruction(r) || rev?.briefing != null;
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
// reservation, and the CREATOR.
//
// The creator branch used to be dropped here on the grounds that the response strip hid
// `createdBy`. That was wrong: the strip removes FK_* SCALARS, and `createdBy` is a nested
// RELATION the server selects on every reservation read, so it survives (see the type in
// types/api.ts). Dropping it was not merely conservative either, it silently removed the
// only route a TECHNICIAN has to their own work: a maintenance booking carries no personnel
// by design and a technician is not staff, so `canRamp` was false for the very person who
// books the job. The server has always allowed it (`orgUserCanRampOut` checks the creator
// first), so the console was hiding a button for an action the API grants.

/**
 * Did `orgUserId` book this reservation?
 *
 * `createdBy` is a nested relation, not an `FK_*` scalar, so it survives the response strip.
 */
export function isReservationCreator(r: Reservation, orgUserId: number | null): boolean {
  if (orgUserId == null) return false;
  return r.createdBy?.id === orgUserId;
}

/** Is `orgUserId` listed as an INSTRUCTOR on this reservation specifically? */
export function isReservationInstructor(r: Reservation, orgUserId: number | null): boolean {
  if (orgUserId == null) return false;
  return (r.personnel?.instructors ?? []).some((i) => i.id === orgUserId);
}

/**
 * Who may CANCEL a reservation, mirrors Flutter's `canCancel` getter: the flight
 * hasn't been ramped out, isn't already cancelled, AND the viewer is staff
 * (owner/admin/dispatcher), a technician, the instructor assigned to it, or whoever
 * booked it. Students/renters can't cancel someone else's flight.
 */
export function canCancelReservation(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  if (isRampedOut(r)) return false;
  return (
    isStaff(roles) ||
    isTechnician(roles) ||
    isReservationInstructor(r, orgUserId) ||
    isReservationCreator(r, orgUserId)
  );
}

/**
 * Who may RAMP OUT / RAMP IN a reservation. Mirrors the server's `orgUserCanRampOut` /
 * `orgUserCanRampIn`: whoever booked it, anyone assigned to it, or staff.
 *
 * The creator is what makes MAINTENANCE work. That booking type never carries personnel, so
 * without it a technician could book an aircraft off the line and then had no way to ramp it
 * out or back in from the console.
 */
export function canRampReservation(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  return (
    isStaff(roles) || isReservationPersonnel(r, orgUserId) || isReservationCreator(r, orgUserId)
  );
}

/**
 * Who may EDIT / reschedule a reservation, mirrors Flutter's `canEdit`: not
 * cancelled, not yet departed, not already past, and the viewer is staff or a
 * pilot on it, or whoever booked it. This is the server's own rule for
 * `PATCH /reservations/:id`: creator ∪ personnel ∪ admin ∪ dispatcher.
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
  return (
    isStaff(roles) || isReservationPersonnel(r, orgUserId) || isReservationCreator(r, orgUserId)
  );
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
