import * as React from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import type { Invoice } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useInvoicePaymentIntent } from "@/features/queries";
import { getStripeForAccount } from "@/lib/stripe";
import { stripeAppearance, useIsDark } from "@/components/billing/stripe-appearance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "We couldn't start the payment. Please try again.";
}

/**
 * Pay a single outstanding invoice by card. Uses the Stripe Payment Element scoped to the org's
 * connected account (card data stays in Stripe's iframe — PCI-safe). The Stripe `invoice.paid`
 * webhook is what marks our invoice paid; we optimistically refetch so the list catches up.
 */
export function PayInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dark = useIsDark();
  const [busy, setBusy] = React.useState(false);

  const intentQ = useInvoicePaymentIntent(invoice?.id ?? null, {
    enabled: open && invoice != null,
  });

  const stripePromise = React.useMemo(
    () => (intentQ.data ? getStripeForAccount(intentQ.data.orgStripeAccountId) : null),
    [intentQ.data]
  );

  const appearance = React.useMemo(() => stripeAppearance(dark), [dark]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return; // don't let the user bail mid-charge
        onOpenChange(o);
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        // Stripe's iframe manages its own focus — let it, and don't dismiss on stray outside events.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-mono">Pay invoice #{invoice?.id}</DialogTitle>
          <DialogDescription>
            {invoice ? (
              <>
                Paying <span className="tnum font-medium">{formatMoney(invoice.total)}</span> by
                card.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {intentQ.isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Setting up secure payment…
          </div>
        )}

        {intentQ.isError && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]" />
            <div className="space-y-1">
              <p className="text-foreground">{errMessage(intentQ.error)}</p>
              <p className="text-muted-foreground">
                If this keeps happening, your school may not have online payments enabled yet —
                reach out to them to settle up.
              </p>
            </div>
          </div>
        )}

        {invoice && intentQ.data && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: intentQ.data.paymentIntentClientSecret, appearance }}
          >
            <PayForm
              invoice={invoice}
              onBusyChange={setBusy}
              onDone={() => onOpenChange(false)}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  invoice,
  onBusyChange,
  onDone,
}: {
  invoice: Invoice;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    onBusyChange(submitting);
  }, [submitting, onBusyChange]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/me/invoices` },
      // Complete in-place for cards that don't need a redirect (the common case).
      redirect: "if_required",
    });

    if (error) {
      setMessage(error.message ?? "That payment didn't go through. Your card was not charged.");
      setSubmitting(false);
      return;
    }

    // No error and no redirect ⇒ the PaymentIntent succeeded here.
    toast.success("Payment received — thank you!");
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    void qc.invalidateQueries({ queryKey: ["reservations"] });
    void qc.invalidateQueries({ queryKey: ["stripe"] });
    setSubmitting(false);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />

      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={!stripe || submitting}>
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Processing…
          </>
        ) : (
          <>
            <Lock className="size-4" /> Pay {formatMoney(invoice.total)}
          </>
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3" /> Secured by Stripe. Your card details never touch our servers.
      </p>
    </form>
  );
}
