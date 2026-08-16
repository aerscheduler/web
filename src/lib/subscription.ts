import type { Organization } from "@/types/api";

/**
 * Per-aircraft subscription model. UI-ENFORCED FOR NOW.
 *
 * Pricing: $20/mo per aircraft. Simulators and ground-school rooms are FREE.
 * New orgs get a 14-day free trial from signup. Existing orgs (created before
 * launch) are NOT charged immediately, they get a 14-day grace window measured
 * from launch (the "$20/aircraft starts in 2 weeks" notice), so no current
 * customer is locked out the moment this ships.
 *
 * Everything here is derived on the client from `org.createdAt` (real, server-
 * backed) plus a local "subscribed" flag. When we're happy with the UX we replace
 * `isLocallySubscribed` with the server's real subscription status (the
 * SubscriptionSettings.active field, exposed on the org) and add server-side
 * enforcement. Until then this is the single source of truth for gating.
 */

/** $20.00/mo per aircraft, in cents. */
export const PRICE_PER_AIRCRAFT_CENTS = 2000;
export const TRIAL_DAYS = 14;

/**
 * Go-live date for per-aircraft pricing. Orgs created before this are treated as
 * existing customers (grace window from launch, not a signup trial). Set this to
 * the actual ship date before deploying.
 *
 * Reset to 2026-08-16 on 2026-08-15: this banner is admin-only, so schools whose admins
 * are light users got no warning at all and were 4 days from lockout. Restarting the 14
 * days puts the deadline at 2026-08-30. Previous 2026-08-05, before that 2026-07-25.
 * MUST match the server constant and the mobile app's _launchDate.
 */
export const PRICING_LAUNCH_DATE = new Date("2026-08-16T00:00:00Z");

/**
 * Org join-codes that never see the per-aircraft paywall or reminder banner.
 * `test` is Demo School: the App Store review account (test@test.com) lives there
 * and must never be blocked mid-review.
 */
export const SUBSCRIPTION_EXEMPT_ORG_CODES = new Set(["test"]);

/**
 * Stripe hosted subscription link ($20/mo per aircraft, 14-day trial, adjustable
 * quantity). Set VITE_SUBSCRIBE_URL to the Stripe Payment Link once it exists
 * (no code change / redeploy of source needed). Empty → the subscribe CTA renders
 * in a "not configured yet" state instead of linking nowhere.
 */
export const SUBSCRIBE_URL: string = import.meta.env.VITE_SUBSCRIBE_URL ?? "";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SubState = "trial" | "grace" | "active" | "expired" | "exempt";

export type SubStatus = {
  state: SubState;
  /** Created before launch → existing customer on a grace window. */
  isExisting: boolean;
  /** When free access ends (trial or grace). */
  freeUntil: Date;
  /** Whole days until freeUntil (0 once past). */
  daysLeft: number;
  planeCount: number;
  /** planeCount × $20, in cents. */
  monthlyCents: number;
  subscribed: boolean;
  /** UI gate: is the org currently blocked from using the app? */
  blocked: boolean;
  /** TEMPORARY. True when the free window comes from a server-side courtesy grant
   *  rather than the launch-date maths, so the banner can say so. */
  granted?: boolean;
};

export function subscriptionStatus(
  org: Organization,
  planeCount: number,
  opts: { connectEnabled?: boolean; subscribed?: boolean; grantedUntil?: string } = {}
): SubStatus {
  const created = new Date(org.createdAt);
  const isExisting = created.getTime() < PRICING_LAUNCH_DATE.getTime();
  // Existing customers already billing through Stripe Connect are grandfathered on
  // their legacy plan (0.5% fee), they never see the per-aircraft model. New orgs
  // pay per aircraft even if they later use Connect for their own rental billing.
  // App Store review / internal orgs are hard-exempt by join code regardless.
  const exemptByCode = SUBSCRIPTION_EXEMPT_ORG_CODES.has(org.code);
  const exempt = exemptByCode || (isExisting && (opts.connectEnabled ?? false));
  // The launch date is a calendar date we print back to the reader, so the grace window
  // has to run from LOCAL midnight on that day. Adding 14 days to the UTC instant put the
  // deadline at 00:00Z, which renders as the previous day everywhere west of Greenwich:
  // prod showed "Billing starts Aug 29" for an Aug 30 deadline. A new org's base is a real
  // signup timestamp, so it is left alone.
  const launchLocal = new Date(
    PRICING_LAUNCH_DATE.getUTCFullYear(),
    PRICING_LAUNCH_DATE.getUTCMonth(),
    PRICING_LAUNCH_DATE.getUTCDate()
  );
  const base = isExisting ? launchLocal : created;
  // A courtesy grant REPLACES the computed deadline and is deliberately not treated as
  // a subscription: the org keeps working, and keeps being told it has to subscribe.
  // Without the override the server reports these orgs as `trialing`, which reads as
  // "active" here and hides the banner entirely, exactly the silent lockout the grant
  // was meant to prevent. See docs/subscription-grants.reference.md.
  const granted = Boolean(opts.grantedUntil);
  // LOCAL midnight, not UTC. The grant is a plain calendar date and the banner prints it
  // back to the reader, so parsing it as UTC renders "Aug 29" for a 2026-08-30 grant to
  // anyone west of Greenwich, which is every school we have.
  const freeUntil = granted
    ? new Date(`${opts.grantedUntil}T00:00:00`)
    : new Date(base.getTime() + TRIAL_DAYS * DAY_MS);
  const now = Date.now();
  // "Subscribed" is now the server's truth (a trialing/active Stripe subscription).
  const subscribed = granted ? false : (opts.subscribed ?? false);
  const withinFree = now < freeUntil.getTime();
  const daysLeft = Math.max(0, Math.ceil((freeUntil.getTime() - now) / DAY_MS));

  let state: SubState;
  if (exempt) state = "exempt";
  else if (subscribed) state = "active";
  else if (withinFree) state = isExisting ? "grace" : "trial";
  else state = "expired";

  return {
    state,
    isExisting,
    freeUntil,
    daysLeft,
    planeCount,
    monthlyCents: planeCount * PRICE_PER_AIRCRAFT_CENTS,
    subscribed,
    // Don't paywall an org with no aircraft (it owes $0 and has nothing to bill).
    // otherwise a 0-plane org whose trial lapsed is stuck with no way to add a plane.
    // They add aircraft freely; once they have one and the trial is over, the paywall applies.
    blocked: state === "expired" && planeCount > 0,
    granted,
  };
}

/** "$40/mo", "$0/mo", dollars from cents, no trailing .00 clutter. */
export function formatMonthly(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}/mo`;
}
