import * as React from "react";
import type { Reservation } from "@/types/api";
import { useReservation } from "@/features/queries";
import { useReservationActions } from "./use-reservation-actions";

/**
 * Detail-panel state for any surface that lists reservations, the dispatch
 * board and the member pages both open the same `ReservationDetailSheet`, so
 * they share the wiring rather than each growing their own copy.
 *
 * Opens with the list row, then hydrates from `GET /reservations/:id` (same as
 * Flutter's detail sheet) so plane Hobbs/tach are available for ramp-out. While
 * that fetch is in flight (and after close-out mutations invalidate the list)
 * `detail` still tracks the live list row so the panel advances through
 * ramp out → ramp in → confirm.
 *
 * `selectedId`/`url` opt a surface into URL-backed selection: pass the id from
 * the route's search params and a setter, and the open record survives a
 * refresh and is linkable. Surfaces that don't (My day) fall back to local
 * state and behave exactly as before.
 */
export function useReservationDetail(
  reservations: Reservation[],
  url?: {
    selectedId: number | null;
    setSelectedId: (id: number | null) => void;
  }
) {
  const [localId, setLocalId] = React.useState<number | null>(null);
  const selectedId = url ? url.selectedId : localId;
  const setSelectedId = url ? url.setSelectedId : setLocalId;
  // The list row we opened with. Kept so the panel can still render a booking
  // that has since been filtered off the board (dimmed by a facet, or paged
  // away) instead of blanking out under the reader.
  const [opened, setOpened] = React.useState<Reservation | null>(null);
  const [editing, setEditing] = React.useState<Reservation | null>(null);
  const actions = useReservationActions();

  const open = selectedId != null;
  const fullQ = useReservation(open ? selectedId : null);

  const detail = React.useMemo(() => {
    if (selectedId == null) return null;
    // List drives close-out progress after mutations invalidate it; the opened
    // row covers a booking no longer in `reservations`; the single-record fetch
    // is the only source when neither has it (a deep link, or a record on
    // another page).
    const fromList =
      reservations.find((x) => x.id === selectedId) ??
      (opened?.id === selectedId ? opened : null);
    if (!fromList) return fullQ.data?.id === selectedId ? fullQ.data : null;
    // Overlay what only `GET /reservations/:id` carries. The list select omits the full
    // resource (so no Hobbs/tach to ramp out against) and omits `paymentOverrides`
    // entirely, which is why a booking priced by hand looked unpriced on the board.
    //
    // The resource is overlaid only when the detail actually has one: a ground lesson has
    // none, and blanking the row's copy would lose the classroom.
    //
    // `payers` likewise. The list ships a DELIBERATELY slim stake, enough to tell a
    // ledger-billed flight from an unbilled one and nothing more: no `orgUser`, so no way
    // to tell whose stake it is, and no meters. Everything on this panel that reads a stake
    // matches on `orgUser.id`, so against a list row it matched nothing and silently
    // rendered as "none recorded": Who pays what reopened blank over stakes that were saved,
    // and the lesson grader fell back to the airframe's hours for every student. The detail
    // stake is a superset of the slim one, so the board's billing helpers keep working.
    if (fullQ.data?.id === fromList.id) {
      return {
        ...fromList,
        ...(fullQ.data.resource ? { resource: fullQ.data.resource } : {}),
        ...(fullQ.data.payers ? { payers: fullQ.data.payers } : {}),
        paymentOverrides: fullQ.data.paymentOverrides ?? null,
      };
    }
    return fromList;
  }, [reservations, selectedId, opened, fullQ.data]);

  const openDetail = React.useCallback(
    (r: Reservation) => {
      setOpened(r);
      setSelectedId(r.id);
    },
    [setSelectedId]
  );

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!next) setSelectedId(null);
    },
    [setSelectedId]
  );

  /**
   * ↑/↓ to the neighbouring booking. Clamped rather than wrapping, running off
   * the end of a day's board and landing back at 6am reads as a glitch.
   */
  const step = React.useCallback(
    (delta: -1 | 1) => {
      if (selectedId == null || reservations.length === 0) return;
      const i = reservations.findIndex((x) => x.id === selectedId);
      if (i === -1) return;
      const next = reservations[Math.min(reservations.length - 1, Math.max(0, i + delta))];
      if (!next || next.id === selectedId) return;
      setOpened(next);
      setSelectedId(next.id);
    },
    [reservations, selectedId, setSelectedId]
  );

  /**
   * Hand off to the edit form. The panel closes first, the edit form is a
   * modal, and leaving the panel open behind it means two things claiming
   * Escape at once.
   */
  const startEdit = (r: Reservation) => {
    setSelectedId(null);
    setEditing(r);
  };

  /** Cancel + close, so the panel can't linger on a reservation that's gone. */
  const cancelReservation = async (r: Reservation) => {
    if (await actions.cancelReservation(r)) setSelectedId(null);
  };

  return {
    detail,
    open,
    setOpen,
    openDetail,
    selectedId,
    step,
    cancelReservation,
    editing,
    setEditing,
    startEdit,
    //Passed straight through: the dialog has to be rendered by the page, but every
    //page shares this hook's single cancel behaviour.
    cancelDialog: actions.cancelDialog,
  };
}
