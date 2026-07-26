import * as React from "react";
import type { Reservation } from "@/types/api";
import { useReservationActions } from "./use-reservation-actions";

/**
 * Detail-sheet state for any surface that lists reservations — the dispatch
 * board and the member pages both open the same `ReservationDetailSheet`, so
 * they share the wiring rather than each growing their own copy.
 *
 * `detail` re-reads the reservation out of the live list on every render so the
 * open sheet advances with the close-out flow (ramp out → ramp in → confirm)
 * as those mutations invalidate and refetch behind it; it falls back to the
 * clicked copy while the list is refetching.
 */
export function useReservationDetail(reservations: Reservation[]) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Reservation | null>(null);
  const [editing, setEditing] = React.useState<Reservation | null>(null);
  const actions = useReservationActions();

  const detail = React.useMemo(
    () => reservations.find((x) => x.id === selected?.id) ?? selected,
    [reservations, selected]
  );

  const openDetail = (r: Reservation) => {
    setSelected(r);
    setOpen(true);
  };

  /**
   * Hand off to the edit form. The sheet closes first — stacking a modal on top
   * of an open sheet traps focus between the two.
   */
  const startEdit = (r: Reservation) => {
    setOpen(false);
    setEditing(r);
  };

  /** Cancel + close the sheet, so it can't linger on a reservation that's gone. */
  const cancelReservation = async (r: Reservation) => {
    if (await actions.cancelReservation(r)) setOpen(false);
  };

  return { detail, open, setOpen, openDetail, cancelReservation, editing, setEditing, startEdit };
}
