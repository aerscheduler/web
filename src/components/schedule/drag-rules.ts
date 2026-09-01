/**
 * The rules behind dragging a booking on the dispatch board.
 *
 * Everything in here is pure (no React, no fetching) because the interesting part of
 * drag-and-drop isn't the pointer maths, it's the answer to two questions:
 *
 *   1. **Can this booking be dragged at all, and if not, why not?** A block that simply
 *      refuses to move reads as a broken board. Every refusal below carries a sentence a
 *      dispatcher can act on, and the grids surface it in the block's tooltip *before*
 *      anyone tries, then again as a toast if they try anyway.
 *
 *   2. **Is where they dropped it legal?** The server is the authority, it re-runs the
 *      whole type/personnel/availability matrix on PATCH, but a 400 that arrives after
 *      the block has already snapped somewhere is a bad way to learn you double-booked
 *      N123. These checks mirror the server's so the answer shows up live, under the
 *      cursor, while the block is still moving.
 *
 * Where the two can disagree, the server wins and the block snaps back with the server's
 * own message. This module only ever tries to be *earlier*, never more permissive.
 */
import type { Reservation, Resource, Role } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { isStaff } from "@/lib/permissions";
import {
  dateKeyInZone,
  formatTimeInZone,
  formatTimeRangeInZone,
  minutesFromMidnightInZone,
  zonedWallClockToUtc,
} from "@/lib/timezone";
import type { SlotOfferHold } from "@/lib/slot-offer-holds";
import { holdOverlaps } from "@/lib/slot-offer-holds";
import { MIN_DURATION_MIN, SLOT_MIN } from "@/lib/scheduling";
import { hasLiveBill, hasStarted, isRampedIn, isReservationPersonnel } from "./close-out";
import { TYPE_REQUIREMENTS } from "./reservation-shared";
import { personnelIds } from "./board-filters";
import { typeLabel } from "./meta";

/** Which edge (or the whole block) the pointer took hold of. */
export type DragMode = "move" | "resize-start" | "resize-end";

/**
 * What a given viewer may do to a given booking by dragging it.
 *
 * `reason` is always populated when anything is denied, and is written to be read by a
 * person mid-shift: it says what state the booking is in and what they can do instead.
 */
export interface DragAbility {
  /** Drag the whole block, change the time, and on the day board the resource. */
  move: boolean;
  /** Drag the leading edge, change the start, leaving the end where it is. */
  resizeStart: boolean;
  /** Drag the trailing edge, change the end, leaving the start where it is. */
  resizeEnd: boolean;
  /** Why something is denied, in a sentence. Null only when everything is allowed. */
  reason: string | null;
}

const FREE: DragAbility = { move: true, resizeStart: true, resizeEnd: true, reason: null };

function locked(reason: string): DragAbility {
  return { move: false, resizeStart: false, resizeEnd: false, reason };
}

/** The name a person would call this resource ("N172TS"), or a neutral fallback. */
function nameOf(r: Resource | null | undefined): string {
  return r ? resourceLabel(r).name : "This resource";
}

/** A rostered person the org has grounded, as the board's roster reports them. */
export interface GroundedPerson {
  name: string;
  reason: string | null;
}

/**
 * Ask whether an org user is grounded. Supplied by the board, which already holds the
 * roster for its Personnel filter, the reservation payload itself carries only ids and
 * names for personnel, so this is the only place the flag is available client-side.
 */
export type GroundedLookup = (orgUserId: number) => GroundedPerson | null;

/** Is this a resource the "grounded pilot" rule applies to? */
function isAircraft(r: Resource | null | undefined): boolean {
  return r != null && resourceLabel(r).kind === "Aircraft";
}

/**
 * Whether anyone rostered on this booking is grounded, and how to say so.
 *
 * Mirrors step 2 of the server's `verifyOrgUserForReservationParams`, including its scope:
 * being grounded only blocks an AIRCRAFT. A grounded instructor can still be moved around
 * a ground-school room or a simulator, and the server agrees, it looks up whether the
 * resource is a plane before rejecting.
 */
function groundedCrewReason(
  r: Reservation,
  targetIsAircraft: boolean,
  lookup: GroundedLookup | undefined
): string | null {
  if (!targetIsAircraft || !lookup) return null;
  for (const id of personnelIds(r)) {
    const grounded = lookup(id);
    if (grounded) {
      const why = grounded.reason?.trim() ? ` (${grounded.reason.trim()})` : "";
      return `${grounded.name} is grounded${why}, they can't be scheduled on an aircraft.`;
    }
  }
  return null;
}

/** Grounding for a resource. Planes and simulators carry it; rooms can't be grounded. */
function groundingOf(r: Resource | null | undefined): { grounded: boolean; reason: string | null } {
  const unit = r?.type?.plane ?? r?.type?.simulator ?? null;
  if (!unit) return { grounded: false, reason: null };
  return { grounded: unit.grounded, reason: unit.groundedReason ?? null };
}

/**
 * Can this viewer change this booking's times at all?
 *
 * Mirrors the server's `orgUserCanUpdateReservation` (creator ∪ personnel ∪ admin ∪
 * dispatcher) minus the creator, which the API strips from responses, so the board is
 * strictly more restrictive than the server, which only ever hides an action rather than
 * offering one that 403s.
 */
function mayChange(r: Reservation, roles: Role[], orgUserId: number | null): boolean {
  return isStaff(roles) || isReservationPersonnel(r, orgUserId);
}

/**
 * Whether (and how) a booking can be dragged, and the sentence explaining any refusal.
 *
 * The order of these tests is the design. A flight that is *out* is the case people
 * actually hit at 3pm on a Tuesday, and it must be answered before the "already in the
 * past" rule swallows it: an overdue aircraft is both out and past its booked end, and the
 * useful thing to offer is exactly the one the server still permits, pushing the return
 * time back. (`ReservationService.update` writes only `end` and `notes` once
 * `review.hobbsTimeOut` is set, so an end-only drag is the whole of what a ramped-out
 * booking can accept.)
 *
 * `now` is injectable so this stays pure and testable.
 */
export function dragAbility(
  r: Reservation,
  roles: Role[],
  orgUserId: number | null,
  now: Date = new Date(),
  groundedCrew?: GroundedLookup
): DragAbility {
  if (r.cancelledAt) {
    return locked("This booking was cancelled, book a new one instead of moving it.");
  }

  // Money has been taken off the schedule and put on a bill. The times on that bill are
  // what the customer was charged against, so they stop being a scheduling question.
  // Any live invoice OR ledger flight_charge locks the slot: line items describe hours
  // this booking claims to have flown, and moving it would leave them describing a flight
  // that didn't happen.
  if (hasLiveBill(r)) {
    return locked("This flight is billed, its times are part of the charge and can't be dragged.");
  }

  // Back on the ramp: the readings are in and the close-out (or its invoice) is derived
  // from them. Nothing about the booked window is still a plan.
  if (isRampedIn(r)) {
    return locked("The aircraft is back. This flight's times are part of its close-out now.");
  }

  //`hasStarted` rather than `isRampedOut`, which called a ground lesson with no instructor
  //"already out" from the moment it was booked and refused to let anyone move it.
  if (hasStarted(r)) {
    const name = nameOf(r.resource);
    if (!mayChange(r, roles, orgUserId)) {
      return locked(`${name} is already out. Only dispatch or someone on this flight can change it.`);
    }
    return {
      move: false,
      resizeStart: false,
      resizeEnd: true,
      reason: `${name} is already out. The only thing you can still change is when it's due back. Drag the trailing edge.`,
    };
  }

  // Never left, and the window has closed. Rescheduling it would be rewriting history;
  // the honest options are cancelling it or booking a new one.
  if (new Date(r.end).getTime() < now.getTime()) {
    return locked("This booking's window has already passed, and it never ramped out.");
  }

  if (!mayChange(r, roles, orgUserId)) {
    return locked("Only dispatch or someone rostered on this flight can move it.");
  }

  //Last, because it is the only lock that is about the CREW rather than the booking: the
  //server refuses every update that would put a grounded pilot on an aircraft, so this one
  //can't be dragged anywhere at all until the grounding is lifted. Saying that up front
  //beats letting someone carry it round the board and be refused at each drop.
  const crew = groundedCrewReason(r, isAircraft(r.resource), groundedCrew);
  if (crew) return locked(crew);

  return FREE;
}

/** Is any part of this booking draggable? */
export function isDraggable(a: DragAbility): boolean {
  return a.move || a.resizeStart || a.resizeEnd;
}

// ── Geometry → time ──────────────────────────────────────────────────────────

/** Round a minute delta onto the same 15-minute grid the booking form offers. */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SLOT_MIN) * SLOT_MIN;
}

/**
 * The instant that reads as `minutes` past midnight on `dayKey`, **in the airport's zone**.
 *
 * `minutes` may fall outside 0–1439; it rolls into the neighbouring day, which is what
 * makes dragging a block off the right-hand edge of the ruler (or a 23:00 booking's end)
 * land on the following morning rather than wrapping back to the same dawn.
 *
 * Going through `zonedWallClockToUtc` rather than adding milliseconds is what keeps a drag
 * correct across a DST boundary: the pixel the block was dropped on IS a wall-clock time,
 * and only the zone knows which instant that is.
 */
export function instantAtDayMinutes(dayKey: string, minutes: number, zone: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dayShift = Math.floor(minutes / 1440);
  const withinDay = ((minutes % 1440) + 1440) % 1440;

  //UTC arithmetic purely to roll the calendar date; the result is re-anchored in `zone`.
  const cursor = new Date(Date.UTC(y, m - 1, d));
  cursor.setUTCDate(cursor.getUTCDate() + dayShift);

  return zonedWallClockToUtc(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    cursor.getUTCDate(),
    Math.floor(withinDay / 60),
    withinDay % 60,
    zone
  );
}

export interface ProposedTimes {
  start: Date;
  end: Date;
}

/**
 * Where a drag currently puts the booking.
 *
 * A **move** anchors on the start: the dropped pixel is the new start's wall clock, and the
 * end follows at the same real duration. Preserving elapsed time rather than wall-clock
 * span is deliberate, a two-hour block dragged across a spring-forward boundary is still a
 * two-hour flight, and the aircraft doesn't care what the clock did.
 *
 * A **resize** moves one edge and clamps against the other so a block can never be dragged
 * shorter than the 15-minute minimum the booking form enforces.
 */
export function proposeTimes(args: {
  r: Reservation;
  mode: DragMode;
  /** Snapped minutes the pointer has travelled along the time axis. */
  deltaMin: number;
  zone: string;
  /** The calendar day the pointer is over, week board only; defaults to the block's own. */
  targetDayKey?: string | null;
}): ProposedTimes {
  const { r, mode, deltaMin, zone, targetDayKey } = args;
  const startMs = new Date(r.start).getTime();
  const endMs = new Date(r.end).getTime();

  if (mode === "move") {
    const dayKey = targetDayKey ?? dateKeyInZone(r.start, zone);
    const startMin = minutesFromMidnightInZone(r.start, zone) + deltaMin;
    const start = instantAtDayMinutes(dayKey, startMin, zone);
    return { start, end: new Date(start.getTime() + (endMs - startMs)) };
  }

  if (mode === "resize-start") {
    const dayKey = targetDayKey ?? dateKeyInZone(r.start, zone);
    const startMin = minutesFromMidnightInZone(r.start, zone) + deltaMin;
    const raw = instantAtDayMinutes(dayKey, startMin, zone);
    const latest = endMs - MIN_DURATION_MIN * 60_000;
    return { start: new Date(Math.min(raw.getTime(), latest)), end: new Date(endMs) };
  }

  const dayKey = targetDayKey ?? dateKeyInZone(r.end, zone);
  const endMin = minutesFromMidnightInZone(r.end, zone) + deltaMin;
  const raw = instantAtDayMinutes(dayKey, endMin, zone);
  const earliest = startMs + MIN_DURATION_MIN * 60_000;
  return { start: new Date(startMs), end: new Date(Math.max(raw.getTime(), earliest)) };
}

/** Did a drag actually change anything? A no-op drop must not fire a PATCH. */
export function isUnchanged(
  r: Reservation,
  next: ProposedTimes,
  targetResourceId: number | null
): boolean {
  return (
    next.start.getTime() === new Date(r.start).getTime() &&
    next.end.getTime() === new Date(r.end).getTime() &&
    targetResourceId === (r.resource?.id ?? null)
  );
}

// ── Drop validation ──────────────────────────────────────────────────────────

export type DropCheck = { ok: true } | { ok: false; reason: string };

const OK: DropCheck = { ok: true };

/** The strict overlap the server counts with: adjacency (back-to-back) is legal. */
function overlaps(aStart: number, aEnd: number, bStart: string, bEnd: string): boolean {
  const s = new Date(bStart).getTime();
  const e = new Date(bEnd).getTime();
  return s < aEnd && e > aStart;
}

/** The display name of a person on a booking, for naming a clash. */
function personLabel(r: Reservation, orgUserId: number): string {
  const p = r.personnel;
  const all = [...(p?.instructors ?? []), ...(p?.students ?? []), ...(p?.renters ?? [])];
  return all.find((ou) => ou.id === orgUserId)?.user?.name ?? "Someone on this flight";
}

/**
 * Is this drop legal? Mirrors, in order, the checks `ReservationService.update` runs.
 *
 * `others` is the board's own reservation list, the same rows the dispatcher is looking
 * at. That's a deliberate choice over re-fetching the availability endpoints mid-drag: the
 * conflict it reports is one they can *see*, named, in the same instant they see the
 * block move. It has one honest gap, when a resource or location filter is narrowing the
 * fetch, a clash with a booking that filter removed is invisible here. The server still
 * catches it and the block snaps back with the server's message.
 */
export function validateDrop(args: {
  r: Reservation;
  next: ProposedTimes;
  /** The resource the block would land on, already resolved from the lane under the pointer. */
  targetResource: Resource | null;
  targetResourceId: number | null;
  /** True when the pointer is over the board's catch-all row rather than a real lane. */
  overLeftoverRow?: boolean;
  others: Reservation[];
  /** Pending slot-offer soft holds (same busy windows the server counts). */
  slotOfferHolds?: SlotOfferHold[];
  zone: string;
  groundedCrew?: GroundedLookup;
}): DropCheck {
  const {
    r,
    next,
    targetResource,
    targetResourceId,
    overLeftoverRow,
    others,
    slotOfferHolds,
    zone,
    groundedCrew,
  } = args;
  const startMs = next.start.getTime();
  const endMs = next.end.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, reason: "That's not a time we can book." };
  }
  if (endMs - startMs < MIN_DURATION_MIN * 60_000) {
    return { ok: false, reason: `A booking has to be at least ${MIN_DURATION_MIN} minutes long.` };
  }

  // A flight that has begun accepts an end time and nothing else, see dragAbility.
  if (hasStarted(r)) {
    if (startMs !== new Date(r.start).getTime() || targetResourceId !== (r.resource?.id ?? null)) {
      return {
        ok: false,
        reason: `${nameOf(r.resource)} is already out, only its return time can change.`,
      };
    }
  }

  const currentResourceId = r.resource?.id ?? null;
  const requirement = TYPE_REQUIREMENTS[r.type];

  if (targetResourceId !== currentResourceId) {
    // Dropping on the catch-all row would have to *remove* the aircraft, which a PATCH
    // can't express (an absent `resource` means "leave it alone" server-side), so say so
    // rather than appearing to work and silently leaving the booking where it was.
    if (overLeftoverRow || targetResourceId == null) {
      return {
        ok: false,
        reason: "Drop this on a resource lane, dragging can't take a booking off its aircraft.",
      };
    }
    if (!targetResource) {
      return { ok: false, reason: "That lane isn't a resource this booking can move to." };
    }

    const targetKind = resourceLabel(targetResource).kind;
    if (targetKind !== requirement.resource) {
      return {
        ok: false,
        reason: `A ${typeLabel(r.type).toLowerCase()} booking needs ${
          requirement.resource === "Aircraft" ? "an aircraft" : `a ${requirement.resource.toLowerCase()}`
        }: ${nameOf(targetResource)} is a ${targetKind.toLowerCase()}.`,
      };
    }

    // Mirrors the grounded guard in `ReservationService.update`. Maintenance is the same
    // exception there: taking a grounded aircraft off the line is the point of it.
    const { grounded, reason } = groundingOf(targetResource);
    if (grounded && r.type !== "maintenance") {
      const why = reason?.trim() ? ` (${reason.trim()})` : "";
      return {
        ok: false,
        reason: `${nameOf(targetResource)} is grounded${why}. Only maintenance can be booked on it.`,
      };
    }
  }

  //Also checked against the TARGET, not just the booking's current aircraft: a booking with
  //no aircraft yet has no crew lock, but dropping it onto one is exactly what the server
  //would refuse.
  const crewGrounded = groundedCrewReason(
    r,
    isAircraft(targetResource ?? r.resource),
    groundedCrew
  );
  if (crewGrounded) return { ok: false, reason: crewGrounded };

  const effectiveResourceId = targetResourceId ?? currentResourceId;
  const crew = new Set(personnelIds(r));

  for (const other of others) {
    if (other.id === r.id) continue;
    if (other.cancelledAt) continue;
    if (!overlaps(startMs, endMs, other.start, other.end)) continue;

    if (effectiveResourceId != null && other.resource?.id === effectiveResourceId) {
      return {
        ok: false,
        reason: `${nameOf(other.resource)} is already booked ${formatTimeRangeInZone(
          other.start,
          other.end,
          zone
        )}: ${other.title}.`,
      };
    }

    if (crew.size > 0) {
      const clash = personnelIds(other).find((id) => crew.has(id));
      if (clash != null) {
        return {
          ok: false,
          reason: `${personLabel(r, clash)} is on ${other.title} ${formatTimeRangeInZone(
            other.start,
            other.end,
            zone
          )}.`,
        };
      }
    }
  }

  const effectiveHoldResourceId = targetResourceId ?? currentResourceId;
  if (effectiveHoldResourceId != null && slotOfferHolds?.length) {
    for (const hold of slotOfferHolds) {
      if (hold.resourceId !== effectiveHoldResourceId) continue;
      if (!holdOverlaps(hold, startMs, endMs)) continue;
      const who =
        hold.purpose === "instructor_confirm"
          ? `${hold.offeredToName} (instructor confirm)`
          : hold.offeredToName;
      const window = formatTimeRangeInZone(hold.start, hold.end, zone);
      const until = formatTimeInZone(hold.holdUntil, zone);
      return {
        ok: false,
        reason: `${nameOf(targetResource ?? r.resource)} is offered to ${who} (${window}). Offer ends ${until}.`,
      };
    }
  }

  return OK;
}
