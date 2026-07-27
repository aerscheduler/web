import * as React from "react";
import type { Reservation } from "@/types/api";
import { useReservation } from "@/features/queries";
import { useReservationActions } from "./use-reservation-actions";

/**
 * Detail-sheet state for any surface that lists reservations — the dispatch
 * board and the member pages both open the same `ReservationDetailSheet`, so
 * they share the wiring rather than each growing their own copy.
 *
 * Opens with the list row, then hydrates from `GET /reservations/:id` (same as
 * Flutter's detail sheet) so plane Hobbs/tach are available for ramp-out. While
 * that fetch is in flight — and after close-out mutations invalidate the list —
 * `detail` still tracks the live list row so the sheet advances through
 * ramp out → ramp in → confirm.
 */
export function useReservationDetail(reservations: Reservation[]) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Reservation | null>(null);
  const [editing, setEditing] = React.useState<Reservation | null>(null);
  const actions = useReservationActions();

  const fullQ = useReservation(open ? (selected?.id ?? null) : null);

  const detail = React.useMemo(() => {
    const fromList = reservations.find((x) => x.id === selected?.id) ?? selected;
    if (!fromList) return null;
    // List drives close-out progress after mutations invalidate it. Overlay the
    // full resource (Hobbs/tach) from GET /:id — those fields are omitted on the list.
    if (fullQ.data?.id === fromList.id && fullQ.data.resource) {
      return { ...fromList, resource: fullQ.data.resource };
    }
    return fromList;
  }, [reservations, selected, fullQ.data]);

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
