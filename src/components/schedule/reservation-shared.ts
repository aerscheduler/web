import type {
  CreateReservationInput,
  Location,
  Resource,
  ReservationType,
} from "@/types/api";

/**
 * Shared reservation-composition logic used by BOTH booking surfaces — the staff
 * dispatch board (`reservation-form.tsx`) and the member self-serve page
 * (`book/booking-form.tsx`). The two forms collect inputs differently (staff pick
 * any resource + personnel; members pick from their approved fleet by role), but
 * the payload shape, location resolution, and time validation are identical and
 * live here so there's a single place to maintain the scheduling contract. The
 * smart time picker itself is likewise shared (`smart-time-range.tsx`).
 */

/** The device timezone; the server stores it on the reservation. */
export const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Resolve a booking's location: the chosen resource's own location, else the
 * org's first. Reads the nested `location` relation — `FK_locationId` is stripped
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
