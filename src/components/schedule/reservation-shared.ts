import { resourceLabel } from "@/types/api";
import type {
  CreateReservationInput,
  Location,
  Reservation,
  Resource,
  ReservationType,
} from "@/types/api";

/**
 * Shared reservation-composition logic used by BOTH booking surfaces, the staff
 * dispatch board (`reservation-form.tsx`) and the member self-serve page
 * (`book/booking-form.tsx`). The two forms collect inputs differently (staff pick
 * any resource + personnel; members pick from their approved fleet by role), but
 * the payload shape, location resolution, and time validation are identical and
 * live here so there's a single place to maintain the scheduling contract. The
 * smart time picker itself is likewise shared (`smart-time-range.tsx`).
 */

/** The device timezone; the server stores it on the reservation. */
export const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

// ── What each reservation type requires ──────────────────────────────────────
/**
 * The server's `validateReservationType` is the authority on which combinations
 * of resource + personnel it will accept, and it returns a single generic error
 * for every violation. This table mirrors those rules so both forms can ask for
 * the right fields up front and explain a rejection in the field the user can
 * actually fix, rather than surfacing a blanket 400.
 *
 * `resource` is the kind of resource the type is booked against; `personnel`
 * lists which sides the server permits, and `requires` which are mandatory.
 * A type with an empty `personnel` list forbids personnel entirely.
 */
export type PersonnelSide = "instructors" | "students" | "renters" | "guests";
export type ResourceKind = "Aircraft" | "Simulator" | "Room";

export interface TypeRequirement {
  /** Which resource kind this type books. */
  resource: ResourceKind;
  /** Is a resource mandatory? (`dual` is the one type the server allows without one.) */
  resourceRequired: boolean;
  /** Personnel sides the server permits on this type. */
  allows: PersonnelSide[];
  /** Sides that must ALL be present. */
  requiresAll: PersonnelSide[];
  /** At least one of these must be present (empty = no such rule). */
  requiresAny: PersonnelSide[];
  /** At most ONE of these may be present (empty = no such rule). */
  exclusive: PersonnelSide[];
  /**
   * Maximum people per side. Mirrors the server's
   * `utils/reservationPersonnelLimits.ts` PERSONNEL_LIMITS, for the same reason the rest
   * of this table mirrors `validateReservationType`: the form has to offer exactly what
   * the server accepts, and a limit the client doesn't know about is either a feature
   * nobody can reach or a 400 the user can't act on.
   *
   * An omitted side means 1, which is what every side was before groups existed.
   */
  maxPerSide?: Partial<Record<PersonnelSide, number>>;
}

/** How many people this type will take on a side. Defaults to 1. */
export function maxForSide(type: ReservationType, side: PersonnelSide): number {
  return TYPE_REQUIREMENTS[type].maxPerSide?.[side] ?? 1;
}

/** Does this type take more than one person anywhere? Drives the "add another" affordance. */
export function typeTakesGroup(type: ReservationType): boolean {
  const max = TYPE_REQUIREMENTS[type].maxPerSide;
  return !!max && Object.values(max).some((n) => (n ?? 1) > 1);
}

export const TYPE_REQUIREMENTS: Record<ReservationType, TypeRequirement> = {
  // solo: an instructor alone, or a student with an aircraft.
  solo: {
    resource: "Aircraft",
    resourceRequired: true,
    allows: ["instructors", "students"],
    requiresAll: [],
    requiresAny: ["instructors", "students"],
    // A solo has ONE pilot. An instructor flying with a student is a `dual`; several pilots
    // with no instructor is a `shared`.
    exclusive: ["instructors", "students"],
    // ONE OCCUPANT, and this is regulatory rather than a product choice. 14 CFR 61.87
    // defines solo flight as the time "during which a student pilot is the sole occupant of
    // the aircraft"so a solo with two people on it is a false record.
    maxPerSide: { instructors: 1, students: 1 },
  },
  /**
   * Several pilots, no instructor: two pilots splitting a cross-country, or a safety-pilot
   * arrangement for instrument practice under 91.109.
   *
   * Students and renters are BOTH allowed because the real world mixes them, a club member
   * renting and a student building time can share a flight, and which roster each sits on is
   * an artefact of how the school files people rather than of who was in the aircraft.
   */
  shared: {
    resource: "Aircraft",
    resourceRequired: true,
    allows: ["students", "renters"],
    requiresAll: [],
    requiresAny: ["students", "renters"],
    exclusive: [],
    maxPerSide: { students: 4, renters: 4 },
  },
  dual: {
    resource: "Aircraft",
    resourceRequired: false,
    allows: ["instructors", "students"],
    requiresAll: ["instructors", "students"],
    requiresAny: [],
    exclusive: [],
    // Several students in one aircraft with an instructor: a safety pilot for instrument
    // work, or an observer in the back.
    maxPerSide: { students: 4 },
  },
  ground: {
    resource: "Room",
    resourceRequired: true,
    allows: ["instructors", "students"],
    requiresAll: [],
    requiresAny: ["instructors", "students"],
    exclusive: [],
    // A classroom ground school. 12 is a room, not a limit anyone will hit.
    maxPerSide: { instructors: 2, students: 12 },
  },
  sim: {
    resource: "Simulator",
    resourceRequired: true,
    allows: ["instructors", "students"],
    requiresAll: [],
    requiresAny: ["instructors", "students"],
    exclusive: [],
    maxPerSide: { instructors: 2, students: 6 },
  },
  rental: {
    resource: "Aircraft",
    resourceRequired: true,
    allows: ["renters"],
    requiresAll: ["renters"],
    requiresAny: [],
    exclusive: [],
    // Two or more renters sharing one aircraft on a cross-country.
    maxPerSide: { renters: 4 },
  },
  guest: {
    resource: "Aircraft",
    resourceRequired: true,
    allows: ["guests", "instructors"],
    requiresAll: ["guests"],
    requiresAny: [],
    exclusive: [],
  },
  // Taking an aircraft off the line. The server rejects a maintenance booking
  // that carries ANY personnel, it's the aircraft that's busy, not a person.
  maintenance: {
    resource: "Aircraft",
    resourceRequired: true,
    allows: [],
    requiresAll: [],
    requiresAny: [],
    exclusive: [],
  },
  // Not a real server type; present only so the Record is total. Never offered.
  instructor: {
    resource: "Aircraft",
    resourceRequired: true,
    allows: ["instructors"],
    requiresAll: ["instructors"],
    requiresAny: [],
    exclusive: [],
  },
};

/** Does this resource match the kind the given type books against? */
export function resourceMatchesType(resource: Resource, type: ReservationType): boolean {
  return resourceLabel(resource).kind === TYPE_REQUIREMENTS[type].resource;
}

/**
 * The type implied by booking THIS resource, for the calendar, where clicking a lane says
 * what you want before any type has been chosen.
 *
 * Rooms and simulators each have exactly one type that books them, so the lane settles the
 * question: opening on the role's default instead (usually `solo`, which wants an aircraft)
 * silently threw the clicked room straight back out of the picker.
 *
 * Aircraft returns null on purpose. Every remaining type books an aircraft, solo, dual,
 * shared, rental, guest, maintenance, so the tail says nothing about which one is meant,
 * and the role default is the better guess.
 */
export function typeForResource(resource: Resource): ReservationType | null {
  switch (resourceLabel(resource).kind) {
    case "Room":
      return "ground";
    case "Simulator":
      return "sim";
    default:
      return null;
  }
}

const SIDE_LABEL: Record<PersonnelSide, string> = {
  instructors: "an instructor",
  students: "a student",
  renters: "a renter",
  guests: "a guest",
};

/**
 * Check a composed personnel object against the type's rules. Returns a
 * human-readable message naming the offending field, or null when it's valid.
 * Mirrors the server's `validateReservationType` so a submit that passes here
 * isn't rejected there for a reason we could have explained inline.
 */
export function validatePersonnelForType(
  type: ReservationType,
  personnel: CreateReservationInput["personnel"] | undefined
): string | null {
  const req = TYPE_REQUIREMENTS[type];
  const has = (side: PersonnelSide) => (personnel?.[side]?.length ?? 0) > 0;

  for (const side of ["instructors", "students", "renters", "guests"] as PersonnelSide[]) {
    if (has(side) && !req.allows.includes(side)) {
      return type === "maintenance"
        ? "A maintenance booking can't have anyone assigned to it, it takes the aircraft off the line."
        : `A ${type} reservation can't include ${SIDE_LABEL[side]}.`;
    }
  }
  for (const side of req.requiresAll) {
    if (!has(side)) return `Pick ${SIDE_LABEL[side]} for this ${type} reservation.`;
  }
  if (req.requiresAny.length > 0 && !req.requiresAny.some(has)) {
    const names = req.requiresAny.map((s) => SIDE_LABEL[s]).join(" or ");
    return `Pick ${names} for this ${type} reservation.`;
  }
  // Count limits, mirroring the server's personnelLimitError. Checked before the
  // exclusivity rule so "you've added 5 students" beats ", only one of a student or an
  // instructor" when both are true, the count is the thing they just did.
  for (const side of ["instructors", "students", "renters", "guests"] as PersonnelSide[]) {
    const count = personnel?.[side]?.length ?? 0;
    const max = maxForSide(type, side);
    if (count > max && max > 0) {
      return `A ${type} reservation can have at most ${max} ${SIDE_LABEL[side].replace(/^an? /, "")}${
        max === 1 ? "" : "s"
      }, you've added ${count}.`;
    }
  }

  if (req.exclusive.filter(has).length > 1) {
    return type === "solo"
      ? "A solo has one pilot. Book a dual if an instructor is flying with a student."
      : `A ${type} reservation can only have one of ${req.exclusive
          .map((s) => SIDE_LABEL[s])
          .join(" or ")}.`;
  }
  return null;
}

/**
 * Resolve a booking's location: the chosen resource's own location, else the
 * org's first. Reads the nested `location` relation. `FK_locationId` is stripped
 * from API responses server-side. Returns null when no location exists.
 */
export function resolveLocationId(
  resource: Resource | undefined,
  locations: Location[] | undefined
): number | null {
  return resource?.location?.id ?? locations?.[0]?.id ?? null;
}

/** Validate a start/end pair; returns an error message, or null if it's fine. */
export function validateTimeRange(startAt: Date | null, endAt: Date | null): string | null {
  if (!startAt || !endAt || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return "Pick a start and end time.";
  }
  if (endAt <= startAt) return "The end time must be after the start time.";
  return null;
}

/**
 * Assemble the `POST /reservations` payload from the fields both forms collect.
 * Optional bits are only included when present, matching the server's contract.
 */
export function buildReservationInput(fields: {
  title: string;
  type: ReservationType;
  startAt: Date;
  endAt: Date;
  resourceId?: number | null;
  locationId?: number | null;
  ratingId?: number | null;
  personnel?: CreateReservationInput["personnel"];
  notes?: string;
}): CreateReservationInput {
  const input: CreateReservationInput = {
    title: fields.title,
    type: fields.type,
    start: fields.startAt.toISOString(),
    end: fields.endAt.toISOString(),
    timeZoneName: DEVICE_TZ,
  };
  const notes = fields.notes?.trim();
  if (notes) input.notes = notes;
  if (fields.locationId != null) input.location = { id: fields.locationId };
  if (fields.resourceId != null) input.resource = { id: fields.resourceId };
  if (fields.ratingId != null) input.rating = { id: fields.ratingId };
  if (fields.personnel && Object.keys(fields.personnel).length > 0) {
    input.personnel = fields.personnel;
  }
  return input;
}

/**
 * Re-express an existing reservation as a complete `PATCH /reservations/:id` body, with a
 * new slot (and optionally a new resource) written over it. This is what a drag on the
 * dispatch board sends.
 *
 * **The personnel echo is not optional.** `ReservationService.update` diffs the personnel
 * it receives against the ones on the row and *disconnects the difference*, so a PATCH
 * that omits `personnel` doesn't mean "leave the crew alone", it means "there is no crew",
 * and the instructor and student are silently unassigned. Every side has to be sent back
 * verbatim for a change that has nothing to do with people.
 *
 * The guest side carries its `id` on purpose: with one, the server updates that guest in
 * place; without one it tries to CREATE a second guest and rejects the whole update with
 * "A guest already exists on this reservation".
 *
 * `rating` is deliberately absent, the API doesn't return it on a list row, and Prisma
 * reads an absent relation as "leave it alone", so omitting it preserves whatever is
 * stored. Sending a guess would be the only way to lose it.
 */
export function reservationToInput(
  r: Reservation,
  next: { start: Date; end: Date; resourceId?: number | null }
): CreateReservationInput {
  const p = r.personnel;
  const personnel: NonNullable<CreateReservationInput["personnel"]> = {};

  if (p?.instructors?.length) personnel.instructors = p.instructors.map((ou) => ({ id: ou.id }));
  if (p?.students?.length) personnel.students = p.students.map((ou) => ({ id: ou.id }));
  if (p?.renters?.length) personnel.renters = p.renters.map((ou) => ({ id: ou.id }));
  if (p?.guests?.length) {
    personnel.guests = p.guests.map((g) => ({
      id: g.id,
      name: g.name,
      email: g.email,
      ...(g.phone ? { phone: g.phone } : {}),
    }));
  }

  const input: CreateReservationInput = {
    title: r.title,
    type: r.type,
    start: next.start.toISOString(),
    end: next.end.toISOString(),
    //Keep the zone the booking was made in. Overwriting it with the dragger's device zone
    //would rewrite what the booking claims about itself every time someone tidies the board.
    timeZoneName: r.timeZoneName || DEVICE_TZ,
  };

  if (r.notes) input.notes = r.notes;
  if (r.location?.id != null) input.location = { id: r.location.id };

  const resourceId = next.resourceId !== undefined ? next.resourceId : r.resource?.id ?? null;
  if (resourceId != null) input.resource = { id: resourceId };

  if (Object.keys(personnel).length > 0) input.personnel = personnel;

  return input;
}
