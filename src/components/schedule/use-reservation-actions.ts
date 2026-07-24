import { toast } from "sonner";
import { useCancelReservation } from "@/features/queries";
import { useConfirm } from "@/components/confirm-dialog";
import type { Reservation } from "@/types/api";
import { ApiError } from "@/lib/api";

/**
 * Shared cancel / no-show handlers for a reservation, wired to the destructive
 * confirm dialog + toasts. Used by the grid, agenda, week view and detail sheet.
 */
export function useReservationActions() {
  const confirm = useConfirm();
  const cancel = useCancelReservation();

  async function cancelReservation(r: Reservation): Promise<boolean> {
    const ok = await confirm({
      title: "Cancel this reservation?",
      description: `“${r.title}” will be removed from the board. This can't be undone.`,
      confirmLabel: "Cancel reservation",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return false;
    try {
      await cancel.mutateAsync({ id: r.id, reason: "Cancelled from dispatch board" });
      toast.success("Reservation cancelled");
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't cancel the reservation");
      return false;
    }
  }

  async function markNoShow(r: Reservation): Promise<boolean> {
    const ok = await confirm({
      title: "Mark as no-show?",
      description: `“${r.title}” will be closed out as a no-show and removed from the board.`,
      confirmLabel: "Mark no-show",
      cancelLabel: "Back",
      destructive: true,
    });
    if (!ok) return false;
    try {
      await cancel.mutateAsync({ id: r.id, reason: "no-show" });
      toast.success("Marked as no-show");
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the reservation");
      return false;
    }
  }

  return { cancelReservation, markNoShow, isBusy: cancel.isPending };
}
