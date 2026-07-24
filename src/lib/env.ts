/**
 * API base URL.
 * - Dev: leave unset; Vite proxies `/api` -> https://api.aerscheduler.com
 *   (see vite.config.ts) so the browser talks same-origin.
 * - Prod: set VITE_API_URL to the API origin (e.g. https://api.aerscheduler.com).
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export const APP_NAME = "AerScheduler";
export const APP_TAGLINE = "Flight operations, scheduled.";

/**
 * Stripe *publishable* key (safe to ship in client code). The console talks to the production
 * API, which is configured with the live secret key, so we default to the live publishable key.
 * Override with VITE_STRIPE_PUBLISHABLE_KEY when pointing the console at a test-mode API.
 * Payment Element runs scoped to each org's connected account (see lib/stripe.ts).
 */
export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ??
  "pk_live_51MM3mIIUzdONzR0DMKfcHC6fTBnGFQLr5cI5s19hU1rzRsO9wW3uUjR67uV4f0L1Rue5dMH5wuRnXJVyCe9oOGrG00DpBTNo2x";
