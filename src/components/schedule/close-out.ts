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
 * Does this booking's resource have meters to read?
 *
 * DELIBERATELY NOT THE SAME QUESTION as `usesBriefingNotMeters`, and the difference is the
 * whole point. That helper asks whether anything DEPARTS: a ground lesson, a classroom and
 * a booking with no resource never leave, so they have no out-and-back at all and are
 * measured by instruction time instead.
 *
 * A GLIDER DEPARTS. It has no Hobbs and no tach (`meterMode: "none"`, which is also a
 * balloon), so there is no reading to collect, but it still ramps out, is away, and comes
 * back, and the desk still needs to know which. Folding it into the helper above would have
 * been the quick fix and it would have deleted the dispatch state for the one operation
 * that most depends on it, along with the `rampedOutAt`/`rampedInAt` timestamps, which are
 * the only record of how long a glider was actually up.
 *
 * So: no meters, still ramps. The close-out below keys its readings on this and its STEPS
 * on the timestamps.
 *
 * A simulator answers true. It meters its own time, which is why the squawk gate elsewhere
 * keys on `plane != null` rather than on this.
 */
export function readsMeters(r: Reservation): boolean {
  if (usesBriefingNotMeters(r)) return false;
  const plane = r.resource?.type?.plane;
  //Anything we cannot see the kind of is assumed to have meters, which is the behaviour
  //every booking had before this existed. A list payload that omits `meterMode` therefore
  //degrades to asking for readings rather than silently skipping them.
  if (plane) return plane.meterMode !== "none";
  return true;
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
  //A METERLESS AIRCRAFT IS TRACKED BY THE CLOCK, NOT BY A READING. `rampedOutAt` is
  //stamped unconditionally by the server on every ramp-out, so it is the one fact that is
  //always true of a glider that has left, and it is the same fact for every other aircraft
  //too. Only the READING is missing here, never the event.
  if (!readsMeters(r)) return rev?.rampedOutAt != null;
  return rev?.hobbsTimeOut != null || rev?.tachTimeOut != null;
}

/**
 * Has this booking actually happened yet?
 *
 * NOT the same question as `isRampedOut`, and using that one to answer this was a bug that
 * took a booking away from the people who owned it.
 *
 * `isRampedOut` answers "is there anything left to collect at ramp-out", which is what
 * `closeOutStep` needs. For a briefing-measured booking it therefore short-circuits on
 * `!hasInstruction(r)`: no instructor and student means no instruction time to record, so
 * there is nothing to ask for and the step is already behind you. True, and useless as a
 * permission gate, because it is true from the moment the booking is CREATED.
 *
 * So a classroom booking, a resourceless booking, and a group ground lesson with no
 * instructor on it were all "ramped out" the instant they existed, and the console hid
 * Edit and Cancel on them for their whole lives. A ground school could book a room and
 * then had no way to call it off. The seed fixture is literally called
 * "Ground: airspace (no instructor)".
 *
 * This asks the narrow question instead: is there evidence it has begun. A briefing for
 * anything measured that way, the ramp stamp for a glider that carries no readings, and
 * the meters (or the stamp) for everything else. It matches what the SERVER enforces on
 * both acts: `ReservationService.update` narrows a write once `hobbsTimeOut` is set, and
 * `cancel` refuses on the same evidence, deliberately not on `hasInstruction`.
 */
export function hasStarted(r: Reservation): boolean {
  const rev = r.review;
  if (usesBriefingNotMeters(r)) return rev?.briefing != null;
  if (!readsMeters(r)) return rev?.rampedOutAt != null;
  return rev?.hobbsTimeOut != null || rev?.tachTimeOut != null || rev?.rampedOutAt != null;
}

export function isRampedIn(r: Reservation): boolean {
  const rev = r.review;
  //One briefing figure covers the whole lesson, there is no out-and-back to tell apart, so
  //recording it satisfies both steps and the flow moves straight to the sign-offs.
  if (usesBriefingNotMeters(r)) return !hasInstruction(r) || rev?.briefing != null;
  if (!readsMeters(r)) return rev?.rampedInAt != null;
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
  //WAIVED PAYERS COUNT, and this must stay identical to the server's
  //`utils/reservationBilling.ts`. The flag says who SHOULD have paid; it does not un-debit
  //an account that already was. `MemberCharges.reassignFlightCharge` repoints an existing
  //stake at a new flight_charge and leaves `waived` untouched, so waiving a safety pilot at
  //close-out and reassigning the charge onto them later produces exactly that pair.
  //
  //Excluding them here while the server counted them is the bug this whole change exists to
  //remove: the console offered Correct times and Reopen on a booking the server would
  //refuse with "already been charged to the account ledger".
  return (r.payers ?? []).filter((p) => p.ledgerEntry != null && !p.ledgerEntry.reversedBy);
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
  //`hasStarted`, not `isRampedOut`: see that helper for the group ground lesson that could
  //never be cancelled because it had no instructor on it.
  if (hasStarted(r)) return false;
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
  if (hasStarted(r)) return false;
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
  // ADMIN, not staff. `isStaff` includes dispatchers, and POST
  // /reservations/:id/paymentOverrides admits an admin, or an instructor when the school
  // has turned the preference on, and nobody else. The desk was shown "Override payment"
  // on the close-out modal, retyped the aircraft or instruction rate, hit Save and got
  // "You are not authorized to make this request" with the corrected pricing discarded.
  //
  // The same clause was live in the app's reservation model and is fixed there too. Two
  // surfaces, one wrong rule, which is what a shared vocabulary is meant to stop.
  if (isAdmin(roles)) return true;
  return preferences?.instructorsCanOverrideReservationPrices === true && isInstructor(roles);
}

/**
 * May this viewer override the price on THIS booking right now?
 *
 * Maintenance is excluded because pricing refuses it outright ("disabled"), and a
 * cancelled booking bills nobody. The rest is the server's own refusal, stated up front.
 *
 * LIVE MONEY is that refusal now, on both sides. It used to be the sign-offs, which meant a
 * rate typo spotted one tap too late could only be fixed by scrapping the booking, and on a
 * GUEST flight at a school that invoices on paper it could never be fixed at all: nothing
 * ever cleared `completedByForGuest`, and there was no invoice to void. Retyping a rate has
 * always discarded every PIN and asked the crew to re-approve the new price, so the sign-offs
 * were never what the lock was protecting.
 */
export function canOverrideReservationPayment(
  r: Reservation,
  roles: Role[],
  preferences: OrganizationPreferences | null | undefined,
  billing: { enabled?: boolean; stripeEnabled?: boolean } | null | undefined,
  orgUserId: number | null = null
): boolean {
  if (r.cancelledAt) return false;
  if (r.type === "maintenance") return false;
  //LEDGER-ONLY SCHOOLS SET RATES TOO. `billingIsLive` requires Stripe, and this function's own
  //docstring above talks about a school that invoices on paper being able to fix a rate,
  //which this line made unreachable for exactly those schools.
  if (!(billingIsLive(billing) || billing?.enabled === true)) return false;
  if (!canOverridePricesInOrg(roles, preferences)) return false;
  if (hasLiveBill(r)) return false;

  //RETYPING A RATE CLEARS EVERY SIGN-OFF, so it owes the same rule as correcting a reading.
  //The server applies `signOffErasureRefusal` to all three doors into that delete; both
  //clients mirrored it on the correction door and neither did here. With
  //`instructorsCanOverrideReservationPrices` on, an instructor with no connection to a flight
  //was shown Override payment on a signed-off booking and answered 403 on save, which is the
  //offered-then-refused symptom this file exists to prevent.
  if (erasesAnotherSignOff(r, orgUserId)) return canReopenInOrg(r, roles, orgUserId);
  return true;
}

/**
 * May this viewer correct the readings already recorded on THIS booking?
 *
 * Two server rules, in order:
 *  1. The permission is the ramp permission. `updateReviewTimes` requires the caller to be
 *     able to ramp the flight both out and in, which is staff or somebody on it.
 *  2. There has to be something to correct. The service refuses to write a Hobbs figure
 *     onto a booking whose Hobbs pair is not already filled in, so this only opens once the
 *     aircraft is back. Before that, ramp in rather than correct.
 *  3. LIVE money closes it, because an invoice describes hours the booking would no longer
 *     claim to have flown. Void the invoice (or reverse the ledger charge) and it reopens.
 *
 * SIGN-OFFS NO LONGER CLOSE IT, and that is the change. They used to, on both surfaces and
 * on the server, which made this unusable exactly where it was needed most: a SOLO booking
 * has one reviewer, and that reviewer is the person typing the readings in, so the window
 * shut on the same tap that opened it. A school reported the only move left, which was to
 * abandon the booking and re-create it carrying the right hours. The correction has always
 * deleted every sign-off as it writes and asked the crew to re-confirm; that was the
 * mechanism, and it was simply out of reach.
 *
 * A booking with no meters (a ground lesson) is measured by its instruction time alone, so
 * `isRampedIn` covers it through `usesBriefingNotMeters` and its briefing figure is the one
 * correctable field. A booking with NOBODY to sign off (a maintenance slot) is correctable
 * too, and by whoever can ramp it: the server asks about signatures that exist, not about a
 * reviewer count of zero.
 *
 * 4. AND SOMEBODY ELSE'S SIGN-OFF NEEDS THE REOPEN PERMISSION, because clearing one is an
 *    erasure rather than a correction. This is the one rule the button was missing, and the
 *    symptom is the one `reservationBilling.ts` names: a button offered and then refused. A
 *    dispatcher, or the student on a dual their instructor had signed, saw Correct times on
 *    a signed-off flight and got a 403 on Save.
 *
 *    Not a blanket "is it signed off" test, which was the server's first attempt at this and
 *    was wrong in both directions. Re-doing YOUR OWN signature is ordinary work: a renter
 *    fixing the Hobbs on their own solo clears one PIN, their own.
 */
export function canCorrectReviewTimes(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  if (!isRampedIn(r)) return false;
  if (!hasCorrectableReadings(r)) return false;
  if (hasLiveBill(r)) return false;
  if (!canRampReservation(r, roles, orgUserId)) return false;
  if (erasesAnotherSignOff(r, orgUserId)) return canReopenInOrg(r, roles, orgUserId);
  return true;
}

/**
 * Would correcting this booking clear a signature that is not the viewer's own?
 *
 * A correction deletes every sign-off as it writes. Whose they are is the whole question:
 * re-entering your own PIN afterwards is the workflow, and clearing somebody else's without
 * telling them is not. Mirrors `signOffErasureRefusal` on the server, field for field.
 *
 * A guest booking keeps its close-out in `completedByForGuest` rather than in confirmation
 * rows, so that counts as the staff member's signature on it.
 */
export function erasesAnotherSignOff(r: Reservation, orgUserId: number | null): boolean {
  const confirmations = r.review?.reviewConfirmations ?? [];
  if (confirmations.some((c) => c.reviewedBy?.id !== orgUserId)) return true;

  const guestCloseOutBy = isGuestReservation(r) ? (r.completedByForGuest?.id ?? null) : null;
  return guestCloseOutBy != null && guestCloseOutBy !== orgUserId;
}

/**
 * Does this booking hold any figure a correction could actually change?
 *
 * The server only lets you rewrite a value that is already there, so a booking with nothing
 * recorded has nothing to correct. Without this the modal opens with NO INPUTS (it renders
 * a field only for a value the booking already holds) and a live "Save corrections" that
 * posts an empty body. Every server refusal is per-field, so an empty body passes them all
 * and falls through to the unconditional sign-off delete: a reopen wearing a correction's
 * clothes, announced as "Times corrected", and without the confirm dialog the actual Reopen
 * button carries.
 *
 * Reachable on two ordinary bookings rather than on bad data, which is why `isRampedIn`
 * alone was not enough. A GLIDER (`meterMode: "none"`) is ramped in on its `rampedInAt`
 * timestamp with no readings at all. A GROUP GROUND with students and no instructor is
 * ramped in on `!hasInstruction` with no briefing figure. Both hold nothing.
 */
export function hasCorrectableReadings(r: Reservation): boolean {
  const rev = r.review;
  if (rev?.hobbsTimeIn != null && rev?.hobbsTimeOut != null) return true;
  if (rev?.tachTimeIn != null && rev?.tachTimeOut != null) return true;
  return rev?.briefing != null;
}

/**
 * May this viewer REOPEN a closed-out booking, taking the sign-offs back off it?
 *
 * Mirrors `POST /reservations/:id/reopen`: the ramp permission, nothing cancelled, nothing
 * billed, and something to actually undo.
 *
 * WHY THIS IS A SEPARATE BUTTON rather than a side effect of correcting. A correction
 * silently discarding four pilots' PINs is a consequence nobody reads about in a tooltip.
 * It is also the only route to the case where the NUMBERS are right and the SIGN-OFF is
 * not: the wrong person confirmed, or somebody confirmed without looking. There is nothing
 * to correct there, so a correction cannot be the way through.
 *
 * "Something to undo" is `reviewed`: a guest booking that has been closed out, or a crewed
 * booking every pilot has confirmed. Offering it at the `confirm` step would be offering to
 * undo a signature that has not been given.
 */
export function canReopenCloseOut(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (r.cancelledAt) return false;
  if (hasLiveBill(r)) return false;
  if (!canReopenInOrg(r, roles, orgUserId)) return false;
  if (isGuestReservation(r)) return guestIsReviewed(r);
  //ANY signature is enough to have something to take back, not a complete set.
  //
  //Requiring `reviewIsComplete` hid this in the exact case the feature's own rationale
  //names: on a two-pilot dual the student signs off by mistake at 1 of 2, and the wrong PIN
  //could not be removed until the instructor ALSO signed off. The server has always
  //accepted it (`reopenCloseOut` refuses only when there is nothing signed at all), so this
  //was the client being narrower than the rule for no reason.
  //
  //A booking with nobody to sign off (maintenance) still holds no signature, and
  //`confirmationCount` is 0 there, so it stays out.
  return confirmationCount(r) > 0;
}

/**
 * Who may take a signature back off a flight record.
 *
 * NARROWER THAN THE RAMP PERMISSION, which is what governs correcting a reading. That
 * asymmetry is deliberate: fixing a Hobbs entry before anybody has signed is ordinary work
 * and belongs to whoever is standing at the aeroplane, but a close-out PIN is a SIGNATURE,
 * the same credential a training record is signed with. A student clearing their
 * instructor's confirmation on a month-old flight is an erasure, not a correction.
 *
 * The school's STAFF, or the instructor on THIS booking. Mirrors the server's
 * `orgUserCanReopenCloseOut` exactly.
 *
 * Dispatchers were left out at first, on the reasoning that they close flights out and do
 * not sign them. Measured against production that was a regression rather than a principle:
 * before the lock moved off completion the front desk could already fix a reading on a
 * partly signed booking, 578 bookings sit in exactly that state, and 55% of all bookings
 * carry two or more reviewers, so every one of them passes through a window where the desk
 * used to be able to help. Owner's call, with those numbers in hand, and it extends to a
 * fully signed flight rather than only to the window the desk already had: the front desk
 * is who a school expects to fix a mistyped Hobbs, and sending them to find an admin is the
 * dead end this whole feature exists to remove.
 *
 * What it costs, stated plainly: a dispatcher never signs a flight and can now clear a
 * complete set of pilot signatures. The required reason and the audit line are what keep
 * that accountable. A PILOT still cannot clear another pilot's PIN, which is the case the
 * rule was written for.
 *
 * A named grant is the eventual home, so a school can nominate specific senior instructors
 * rather than the whole role; this is the baseline it will fall back to.
 */
export function canReopenInOrg(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null
): boolean {
  if (isStaff(roles)) return true;
  return isReservationInstructor(r, orgUserId);
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
  //LEDGER MODE COUNTS AS BILLING. `billingIsLive` requires Stripe, and `payment.ts` supports
  //ledger-on / Stripe-off deliberately: the cheque-driven club is a target customer. At one
  //of those schools every failed close-out showed "the ledger charge will appear here" with
  //no button on any surface, for ever.
  if (!(billingIsLive(billing) || billing?.enabled === true)) return false;
  if (!isAdmin(roles)) return false;
  //PARTLY BILLED IS EXACTLY WHEN THE RETRY IS NEEDED. `hasLiveBill` is true the moment ONE
  //share is raised, so a split fan-out that failed on invoice 2 of 3 hid the button on the
  //booking whose pilot had not been billed, which is the case the endpoint exists for and
  //what the comment above already claimed. The server refuses only on the anomaly it cannot
  //see past (money on a WAIVED payer), so the client asks the same narrower question.
  if (waivedPayerHoldsLiveMoney(r)) return false;
  if (isFullyBilled(r)) return false;

  //A GUEST BOOKING IS NOT EXEMPT FROM NEEDING A RETRY. This excluded them outright on the
  //reasoning that `confirmReviewGuest` mints the invoice, so there is no gap to fill. There
  //is: that door writes the close-out and then hands off to the same fan-out as everything
  //else, and if the fan-out fails the door does not reopen (a second attempt is refused as
  //already reviewed). The console then showed "the invoice will appear here once it's
  //generated" for ever, on the highest-margin thing a school sells.
  //
  //It closes out by a FLAG rather than by PINs, so the reviewer-count test below is the wrong
  //question for it: it has no reviewers by design and would fail that check for ever.
  //
  //EITHER DOOR, though. `PERSONNEL_LIMITS.guest` allows an instructor, and that CFI's PIN
  //closes the flight out without ever setting the guest flag. Asking only for the flag made
  //the console the odd one out: the server (`closeOutIsFinished`) and the phone
  //(`completed`) both accept the instructor branch, so the button was hidden on a flight both
  //of them would have billed.
  if (isGuestReservation(r)) return guestIsReviewed(r) || reviewIsComplete(r);

  if (reviewerCount(r) === 0) return false;
  return reviewIsComplete(r);
}

/**
 * Is every share of this flight billed, so there is nothing left to raise?
 *
 * READ FROM THE SERVER, NOT RE-DERIVED. This used to compute the answer from the payer rows
 * ("is every payer holding money"), which is inside out: `ReservationPayer` rows are written
 * only AFTER a bill succeeds, so a flight whose fan-out failed carries NO payer rows at all
 * and "every payer holds money" is vacuously true of an empty list. The console therefore
 * hid Create-invoice on every never-billed flight and on every partial fan-out, which are
 * precisely the two cases the button exists for, while the new daily alert was telling
 * schools to go and fix them.
 *
 * `coverage` is `ReservationService.invoiceCoverage` computed on the server and sent with the
 * booking. It counts CREW, not payers, which is the only way to know a share is missing when
 * nothing was written for it. Three surfaces asking one another's question by re-implementing
 * it is what produced this bug twice; now there is one answer.
 *
 * Falls back to "not fully billed" when `coverage` is absent, so an older payload offers the
 * button and lets the server refuse rather than hiding a remedy that may be needed.
 */
export function isFullyBilled(r: Reservation): boolean {
  const coverage = r.coverage;
  if (!coverage) return false;
  return coverage.expected === 0 || coverage.complete === true;
}

/**
 * Money sitting on a payer the booking is NOT waiting to bill.
 *
 * Mirrors `waivedPayerHoldsLiveMoney` on the server, field for field. This is the one state
 * the retry must refuse, because `invoiceCoverage` cannot see it: `reassignFlightCharge` will
 * move a charge onto a waived payer and leave `waived` set, and billing again then charges
 * one flight to two people.
 */
export function waivedPayerHoldsLiveMoney(r: Reservation): boolean {
  return (r.payers ?? []).some((p) => {
    if (p?.waived !== true) return false;
    const liveLedger = p.ledgerEntry != null && !p.ledgerEntry.reversedBy;
    const liveInvoice = p.invoice != null && p.invoice.voidedAt == null;
    return liveLedger || liveInvoice;
  });
}
