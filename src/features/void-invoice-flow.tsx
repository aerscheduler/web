import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useUpdateInvoice } from "@/features/queries";
import type { Invoice } from "@/types/api";
import { ApiError } from "@/lib/api";

/**
 * Shared "void this invoice" flow for billing.tsx, dashboard.tsx, and report-view.tsx,
 * all three used to carry their own copy of the same confirm-then-PATCH.
 *
 * A plain void asks once and is done. But voiding the LAST invoice on a past,
 * uncancelled reservation leaves that flight billed to nobody, so those get a
 * three-way choice instead: leave it unbilled on purpose, jump to the reservation to
 * bill it a different way, or back out. `atRisk` below is a client-side guess at which
 * case this is; the server has the real answer and reports it back as `leavesUnbilled`
 * either way, so a wrong guess only costs an extra choice, never a wrong outcome.
 */
export function useVoidInvoiceFlow() {
  const update = useUpdateInvoice();
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<Invoice | null>(null);

  async function commit(inv: Invoice, openCloseOut: boolean) {
    try {
      const res = await update.mutateAsync({ id: inv.id, patch: { markVoided: true } });
      if (res.leavesUnbilled) {
        toast.warning(
          "Voided. This flight is now unbilled. Find it under Billing → Unbilled to bill it another way.",
          { duration: 10_000 }
        );
      } else {
        toast.success(`Invoice #${inv.id} voided`);
      }
      if (openCloseOut && res.reservationId != null) {
        void navigate({ to: "/schedule", search: { reservation: res.reservationId } });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't void invoice");
    } finally {
      setPending(null);
    }
  }

  return {
    /** Open the void dialog for this invoice. */
    voidInvoice: (inv: Invoice) => setPending(inv),
    isPending: update.isPending,
    /** Props for <VoidInvoiceDialog>, spread by whichever view renders it. */
    voidDialog: {
      invoice: pending,
      open: pending != null,
      busy: update.isPending,
      onOpenChange: (open: boolean) => {
        if (!open) setPending(null);
      },
      onLeaveUnbilled: () => pending && void commit(pending, false),
      onOpenCloseOut: () => pending && void commit(pending, true),
      onVoid: () => pending && void commit(pending, false),
    },
  };
}

/** True when voiding this invoice's LAST word on a booking would leave it uncovered. */
export function atRiskOfLeavingUnbilled(inv: Invoice): boolean {
  const r = inv.reservation;
  if (!r || r.cancelledAt) return false;
  return new Date(r.end).getTime() <= Date.now();
}
