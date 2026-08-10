import { useState } from "react";
import { toast } from "sonner";
import { useCancelReservation } from "@/features/queries";
import type { Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";
import type { CancelSubmission } from "./cancel-reservation-dialog";

/**
 * Shared cancel handler for a reservation. Used by the grid, agenda, week view and
 * detail sheet.
 *
 * Cancelling now opens a real dialog rather than a yes/no confirm, because it has to
 * collect *why*. Until this, every cancellation the console made was recorded with the
 * literal reason "Cancelled from dispatch board", the school asked for a cancellation
 * report and there was nothing in the data to report on.
 *
 * The dialog itself is rendered by the caller (see CancelReservationDialog); this hook
 * owns which reservation is pending and what to do when it's confirmed, so all four
 * views share one behaviour.
 */
export function useReservationActions() {
  const cancel = useCancelReservation();

  const [pending, setPending] = useState<Reservation | null>(null);
  const [resolver, setResolver] = useState<((cancelled: boolean) => void) | null>(null);

  /**
   * Opens the dialog and resolves once the user has either cancelled the booking or
   * backed out, the same `Promise<boolean>` the callers already awaited, so nothing
   * upstream had to change when this stopped being a plain confirm.
   */
  function cancelReservation(r: Reservation): Promise<boolean> {
    setPending(r);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }

  function settle(cancelled: boolean) {
    resolver?.(cancelled);
    setResolver(null);
    setPending(null);
  }

  async function confirmCancel(submission: CancelSubmission) {
    if (!pending) return;

    try {
      await cancel.mutateAsync({ id: pending.id, ...submission });
      toast.success(
        submission.scope === "this" ? "Reservation cancelled" : "Repeating reservations cancelled"
      );
      settle(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't cancel the reservation");
      //Left open on failure: the reason the person typed is still in the dialog, so a
      //transient error costs a retry rather than retyping it.
    }
  }

  return {
    cancelReservation,
    isBusy: cancel.isPending,
    /** Props for <CancelReservationDialog>, spread by whichever view renders it. */
    cancelDialog: {
      reservation: pending,
      open: pending != null,
      onOpenChange: (open: boolean) => {
        if (!open) settle(false);
      },
      onConfirm: confirmCancel,
      isBusy: cancel.isPending,
    },
  };
}
