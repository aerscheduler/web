import { useMutation, useQueryClient } from "@tanstack/react-query";
import { raw } from "@/lib/api";
import type { Invoice } from "@/types/api";

/**
 * Bill a closed-out flight from its own figures: `POST /reservations/:id/invoices`.
 *
 * This is what Billing's per-row Bill button calls. The button used to open the manual
 * New invoice dialog instead, prefilled with a customer and the booking's title as a memo:
 * no line items, no hours, no reservation link. Saving that produced a stray invoice
 * attached to nothing, the flight stayed unbilled and still sat in the list, and the money
 * never reached resource revenue.
 *
 * The endpoint prices the booking exactly as close-out does (the aircraft's rate against
 * the meters, the instruction rate against the briefing, the overnight minimum, the
 * membership tier, then the split), so a booking shared between several people mints one
 * invoice each. Hence `Invoice[]`, not `Invoice`. Admin only server-side (`isOrgAdmin`),
 * which matches Billing's own route guard.
 *
 * `raw` rather than `api`, for the same reason `useUpdateInvoice` uses it: a partial
 * outcome is normal on this endpoint and lives in a sibling field. A payer whose share came
 * to less than 50c is never invoiced, and one payer's Stripe call can fail while the rest
 * succeed. `api` unwraps to `data` and drops `warnings`, which would report a clean success
 * over a half-billed flight.
 *
 * Kept out of features/queries.ts on purpose: the booking is chosen at MUTATE time, not at
 * hook time, because one table shares a single mutation across every row and cannot bind an
 * id when the hook runs. A sibling `useCreateReservationInvoice(id)` for the close-out
 * sheet is being written in queries.ts by another change in flight; once that lands the two
 * should share one request helper.
 */
export function useBillReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reservationId: number) => {
      const { body } = await raw(`/reservations/${reservationId}/invoices`, { method: "POST" });
      const envelope = (body ?? {}) as { data?: Invoice[]; warnings?: string[] };
      return { invoices: envelope.data ?? [], warnings: envelope.warnings ?? [] };
    },
    onSuccess: () => {
      //The booking leaves the unbilled list, and its detail sheet now has invoices on it.
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      //Covers Billing's own summary tiles, which key off ["invoices", "summary", …].
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      //Reports and the dashboard both read invoice money.
      void qc.invalidateQueries({ queryKey: ["revenue-report"] });
      void qc.invalidateQueries({ queryKey: ["orgReport"] });
    },
  });
}
