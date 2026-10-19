import * as React from "react";
import type { ReservationType } from "@/types/api";
import { ReservationForm } from "@/components/schedule/reservation-form";

/**
 * A member booking themselves (/me/book).
 *
 * This used to be a second, parallel implementation of the booking form: ~700 lines
 * that duplicated the dispatch form's fields, validation and submission. They drifted
 * in both directions: dispatch grew Repeat, Duplicate, Edit and a Title field this one
 * never got, and this one had the seat toggle, the renter-approved fleet, role-gated
 * types and error focus that dispatch never got.
 *
 * There is now ONE form. Booking yourself is the same reservation with one personnel
 * side already filled in with you, so it is a variant of the dispatch form rather than
 * a different thing, see `ReservationForm`'s `variant` prop, where every genuine
 * difference between the two is a single branch.
 *
 * This file stays as a named entry point so the route reads clearly and so nothing
 * outside has to know the two are the same component.
 */
export function BookingForm({
  orgUserId,
  userId,
  lesson,
}: {
  /** The caller's OrganizationUser.id: goes onto the reservation as the personnel. */
  orgUserId: number;
  /** The caller's User.id: loads their approved fleet and instruction partners. */
  userId: number;
  /** The lesson this booking is for, from My training's "Book a lesson". */
  lesson?: { name: string; type?: ReservationType };
}) {
  //Stable across renders, or the form would treat every render as a new draft.
  const draft = React.useMemo(
    () => ({
      date: new Date(),
      ...(lesson?.type ? { type: lesson.type } : {}),
      // The lesson's own name: syllabi already name them "Flight 3: Takeoffs and landings".
      ...(lesson?.name ? { notes: lesson.name } : {}),
    }),
    [lesson?.name, lesson?.type]
  );
  //A member starts from today; the board passes a slot.
  return <ReservationForm variant="self" self={{ orgUserId, userId }} draft={draft} />;
}
