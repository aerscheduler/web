import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { STRIPE_PUBLISHABLE_KEY } from "./env";

/**
 * Invoices are Connect *direct charges* on each org's connected account, so the PaymentIntent
 * (and SetupIntent) live on that account — the browser's Stripe.js must be initialized with
 * `{ stripeAccount }` to confirm them. We memoize one Stripe instance per connected account so
 * repeat opens of the pay/add-card dialogs don't reload the SDK.
 */
const cache = new Map<string, Promise<Stripe | null>>();

export function getStripeForAccount(connectedAccountId: string): Promise<Stripe | null> {
  let p = cache.get(connectedAccountId);
  if (!p) {
    p = loadStripe(STRIPE_PUBLISHABLE_KEY, { stripeAccount: connectedAccountId });
    cache.set(connectedAccountId, p);
  }
  return p;
}
