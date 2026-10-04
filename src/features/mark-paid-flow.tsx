import * as React from "react";
import { toast } from "sonner";
import { useUpdateInvoice } from "@/features/queries";
import type { DeskPayment, Invoice } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useTimeZone } from "@/lib/use-timezone";
import { todayKeyIn } from "@/lib/payment-methods";

/**
 * Shared "mark this invoice paid" flow for Billing and the report views, the same way
 * `useVoidInvoiceFlow` shares the void: open the form for an invoice, PATCH with how it was paid,
 * and say what happened (a Stripe half that failed is a warning, not a lie).
 */
export function useMarkPaidFlow() {
  const update = useUpdateInvoice();
  const { orgZone, zone } = useTimeZone();
  const [pending, setPending] = React.useState<Invoice | null>(null);
  // The organization's calendar, not the browser's: a check taken at 7pm in Idaho was taken today
  // there, whatever the laptop's clock says.
  const todayKey = todayKeyIn(orgZone ?? zone);

  async function submit(payment: DeskPayment): Promise<boolean> {
    const inv = pending;
    if (!inv) return false;
    try {
      const res = await update.mutateAsync({ id: inv.id, patch: { markPaid: true, ...payment } });
      if (res.warning) toast.warning(res.warning, { duration: 8000 });
      else toast.success(`Invoice #${inv.id} marked paid`);
      setPending(null);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't mark the invoice paid");
      return false;
    }
  }

  return {
    /** Open the Mark paid form for this invoice. */
    markPaid: (inv: Invoice) => setPending(inv),
    isPending: update.isPending,
    /** Props for <MarkPaidDialog>, spread by whichever view renders it. */
    dialog: {
      invoice: pending,
      open: pending != null,
      busy: update.isPending,
      todayKey,
      onOpenChange: (open: boolean) => {
        if (!open) setPending(null);
      },
      onSubmit: submit,
    },
  };
}
