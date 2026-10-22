import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBilling } from "@/features/queries";

/**
 * Where Stripe returns a school owner after Connect onboarding.
 *
 * Stripe needs a single stable return_url, and the server hands it
 * `${host}/billing-register-redirect` for BOTH surfaces. Because that host is a
 * universal link, iOS opens the Flutter app (which has its own equivalent of this
 * screen) and everything else lands here. Same URL, right destination per device.
 * so this file must keep the path in sync with the Flutter route of the same name.
 *
 * Why an interstitial rather than sending Stripe straight to /settings: the org is
 * only marked `stripeEnabled` when Stripe's `account.updated` webhook reaches our
 * server, which routinely lands a beat after the browser redirect. Dropping the user
 * on Settings immediately shows a stale "Not connected" for someone who just finished
 *, so we poll briefly, then report what actually happened.
 *
 * The three outcomes mirror the Flutter triage: never started, started but
 * incomplete, and done. The incomplete case is the one that matters, an owner who
 * abandoned onboarding half way needs to be told to finish, not silently left with
 * payouts switched off.
 */
export const Route = createFileRoute("/_authed/billing-register-redirect")({
  // `stripe` is set when the owner came back from connecting an EXISTING Stripe account
  // (server services/stripeConnectExisting.ts): "connected", or why nothing was connected.
  validateSearch: (s: Record<string, unknown>) => (typeof s.stripe === "string" ? { stripe: s.stripe } : {}),
  component: BillingRegisterRedirectPage,
});

/** Why connecting an existing account attached nothing, in the owner's terms. */
const EXISTING_REFUSALS: Record<string, string> = {
  denied: "Stripe connection cancelled. Nothing was changed.",
  expired: "That Stripe sign-in expired. Choose Use an existing Stripe account again.",
  browser: "Finish connecting Stripe in the same browser you started in. Nothing was changed.",
  not_owner: "Only the organization owner can connect Stripe.",
  already: "A Stripe account is already connected. Disconnect it first, then connect the other one.",
  taken: "That Stripe account is already connected to another AerScheduler organization.",
  unavailable: "Connecting an existing Stripe account isn't available right now.",
  failed: "Stripe didn't confirm the connection. Try again, or contact support@aerscheduler.com.",
};

/** Give the webhook a moment to land before we believe a "not connected" answer. */
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1500;

function BillingRegisterRedirectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { stripe } = Route.useSearch() as { stripe?: string };
  const refusal = stripe && stripe !== "connected" ? EXISTING_REFUSALS[stripe] ?? EXISTING_REFUSALS.failed : null;
  const [attempt, setAttempt] = useState(0);

  // No cache to worry about: Stripe sends the browser here as a full page load, so
  // the app has just booted and React Query starts empty. This is always a live read.
  const billing = useBilling();

  // Strict Mode double-invokes effects, and this one navigates + toasts. Without
  // the latch the owner gets two toasts and a redirect race.
  const settled = useRef(false);

  useEffect(() => {
    if (settled.current) return;
    // Nothing was connected, so there is nothing to wait for: say why and go back.
    if (refusal) {
      settled.current = true;
      toast.error(refusal);
      void navigate({ to: "/settings", replace: true });
      return;
    }
    if (billing.isPending || billing.isFetching) return;

    const connected = billing.data?.stripeEnabled === true;

    // Not connected yet and we still have retries: the webhook may be in flight.
    if (!connected && !billing.isError && attempt < MAX_ATTEMPTS) {
      const t = setTimeout(() => {
        setAttempt((n) => n + 1);
        void billing.refetch();
      }, RETRY_DELAY_MS);
      return () => clearTimeout(t);
    }

    settled.current = true;

    // Settings reads the same ["billing"] key, make sure it renders what we just saw.
    void queryClient.invalidateQueries({ queryKey: ["billing"] });

    if (billing.isError) {
      toast.error("We couldn't confirm your payout setup. Check Settings → Billing.");
    } else if (connected) {
      toast.success("Payouts connected. You can accept card payments now.");
    } else if (!billing.data) {
      toast.info("Payout setup hasn't started yet. Connect Stripe to accept payments.");
    } else {
      toast.warning("Your payout setup isn't finished, reconnect to complete it.");
    }

    void navigate({ to: "/settings", replace: true });
  }, [billing, attempt, navigate, queryClient, refusal]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">Confirming your payout setup</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Stripe is letting us know your account is ready. This only takes a moment.
        </p>
      </div>
    </div>
  );
}
