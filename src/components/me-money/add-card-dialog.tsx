import * as React from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Lock } from "lucide-react";
import type { SetupIntentResponse } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useCreateSetupIntent } from "@/features/queries";
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

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "We couldn't start the card setup. Please try again.";
}

/**
 * Save a card for future use / autopay via a Stripe SetupIntent + Payment Element (card data
 * stays in Stripe's iframe — PCI-safe). Scoped to the org's connected account.
 */
export function AddCardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dark = useIsDark();
  const create = useCreateSetupIntent();
  const [data, setData] = React.useState<SetupIntentResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const startedRef = React.useRef(false);

  // Mint a fresh SetupIntent when the dialog opens; tear it down when it closes.
  React.useEffect(() => {
    if (open && !startedRef.current) {
      startedRef.current = true;
      create
        .mutateAsync()
        .then(setData)
        .catch((e) => setError(errMessage(e)));
    }
    if (!open) {
      startedRef.current = false;
      setData(null);
      setError(null);
      setBusy(false);
    }
    // create is a stable mutation object; we intentionally key only on `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stripePromise = React.useMemo(
    () => (data ? getStripeForAccount(data.orgStripeAccountId) : null),
    [data]
  );
  const appearance = React.useMemo(() => stripeAppearance(dark), [dark]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        onOpenChange(o);
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add a card</DialogTitle>
          <DialogDescription>
            Save a card for faster checkout and to enable autopay.
          </DialogDescription>
        </DialogHeader>

        {!data && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Preparing secure form…
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]" />
            <p className="text-foreground">{error}</p>
          </div>
        )}

        {data && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: data.clientSecret, appearance }}
          >
            <AddCardForm onBusyChange={setBusy} onDone={() => onOpenChange(false)} />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddCardForm({
  onBusyChange,
  onDone,
}: {
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

    const { error } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: `${window.location.origin}/me/payment-methods` },
      redirect: "if_required",
    });

    if (error) {
      setMessage(error.message ?? "We couldn't save that card. It was not charged.");
      setSubmitting(false);
      return;
    }

    toast.success("Card saved");
    void qc.invalidateQueries({ queryKey: ["stripe", "paymentMethods"] });
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
            <Loader2 className="size-4 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Lock className="size-4" /> Save card
          </>
        )}
      </Button>
    </form>
  );
}
