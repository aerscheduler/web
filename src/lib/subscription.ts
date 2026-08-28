import type { SubscriptionStatus, SubState } from "@/types/api";

/**
 * How the console reads a school's billing.
 *
 * THIS FILE NO LONGER DECIDES ANYTHING. It used to: it carried its own copy of the
 * pricing rules, deriving trial-vs-grace-vs-expired from `org.createdAt` against a
 * PRICING_LAUNCH_DATE constant, plus an exempt-codes set, plus a grandfathering rule
 * keyed on Stripe Connect. The server had one copy of that logic and the Flutter app had
 * a third, compiled into the binary. They drifted, and the drift was expensive: moving
 * the launch constant to give two schools more runway also silently re-cohorted anyone
 * who had signed up in between onto the legacy Connect fee.
 *
 * The server now returns a verdict (`state`, `blocked`, `monthlyCents`) computed from
 * organization_billing_terms. Everything below is presentation: naming the state,
 * formatting money, and choosing words. If you find yourself adding a date comparison
 * here, it belongs in the server's billing-terms service instead.
 */

/** List price per aircraft per month, in cents. Display fallback only, for copy written
 *  before the server has answered; a school's real price comes back on the status. */
export const PRICE_PER_AIRCRAFT_CENTS = 2000;
export const TRIAL_DAYS = 14;

export type { SubState };

export type SubStatus = {
  state: SubState;
  /** What they pay on: per_aircraft | legacy_fee | free. */
  model: string;
  /** When free access ends, if a window is open. */
  freeUntil: Date | null;
  /** Why that window exists, so the banner can use the right words. */
  freeUntilReason: "trial" | "grace" | "courtesy" | null;
  /** Whole days until freeUntil (0 once past). */
  daysLeft: number;
  /** Aircraft they have. */
  planeCount: number;
  /** Aircraft actually charged for, after the allowance. */
  billableCount: number;
  /** Aircraft comped. */
  freeUnits: number;
  discountPercent: number;
  unitPriceCents: number;
  /** What they owe per month, after allowance and discount. */
  monthlyCents: number;
  /** A real Stripe subscription is in place. */
  subscribed: boolean;
  /**
   * Stripe has a subscription for them that it cannot collect on: `past_due` or
   * `unpaid`.
   *
   * Kept separate from `subscribed` because the two used to collapse into "not
   * subscribed", and the school that has ALREADY been through checkout then gets
   * offered checkout again. Pressing it starts a SECOND subscription beside the
   * unpaid one. What they need is the billing portal, so the console has to be able
   * to tell the two apart.
   */
  paymentProblem: boolean;
  /** Stop them using the console. Straight from the server. */
  blocked: boolean;
  /** Anything is being given away or discounted. */
  sponsored: boolean;
};

/**
 * Adapt the server's answer into what the components render.
 *
 * `planeCount` is passed in as a fallback only: the server reports `unitCount`, and the
 * local plane query is used just so the page can show a number before the subscription
 * request lands. When the two disagree the server wins, because it is the one whose
 * count the invoice is built from.
 */
export function subscriptionStatus(sub: SubscriptionStatus | undefined, planeCount: number): SubStatus | null {
  if (!sub) return null;

  const state: SubState = sub.state ?? "trial";
  const freeUntil = sub.freeUntil ? new Date(sub.freeUntil) : null;
  const units = sub.unitCount ?? planeCount;
  const billableCount = sub.billableUnits ?? units;
  const freeUnits = sub.freeUnits ?? 0;
  const discountPercent = sub.discountPercent ?? 0;

  return {
    state,
    model: sub.model ?? "per_aircraft",
    freeUntil,
    // A console newer than its server gets `grantedUntil` and no reason; treat that the
    // way the old code did, as a courtesy extension, so the banner does not silently
    // become an ordinary trial notice mid-rollout.
    freeUntilReason: sub.freeUntilReason ?? (sub.grantedUntil ? "courtesy" : null),
    daysLeft: sub.daysLeft ?? 0,
    planeCount: units,
    billableCount,
    freeUnits,
    discountPercent,
    unitPriceCents: sub.unitPriceCents ?? PRICE_PER_AIRCRAFT_CENTS,
    monthlyCents: sub.monthlyCents ?? billableCount * PRICE_PER_AIRCRAFT_CENTS,
    subscribed: state === "active",
    paymentProblem: Boolean(sub.hasSubscription && (sub.status === "past_due" || sub.status === "unpaid")),
    blocked: sub.blocked ?? false,
    sponsored: freeUnits > 0 || discountPercent > 0 || state === "free",
  };
}

/** States where the school is not on the per-aircraft plan at all, so per-aircraft
 *  pricing must not be shown to them. A grandfathered school should not learn about a
 *  price change from their settings page, and a sponsored one has no price to see. */
export function isOffPlan(status: SubStatus): boolean {
  return status.state === "legacy" || status.state === "free";
}

/**
 * A free-until instant as the CALENDAR DATE it was set to.
 *
 * `freeUntil` is a timestamp, but it is written by somebody picking a date, and the
 * server anchors it to the end of that day UTC. Formatting it in the reader's local zone
 * would print the following day for anyone east of Greenwich and, before the server
 * anchored it, printed the PREVIOUS day for everyone in the Americas. Reading it back in
 * UTC returns exactly the date that was entered, everywhere.
 */
export function formatFreeUntil(d: Date | null, opts: { year?: boolean } = {}): string {
  if (!d) return "soon";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(opts.year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** "$40/mo", "$0/mo", dollars from cents, no trailing .00 clutter. */
export function formatMonthly(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}/mo`;
}

/** "$20", for per-unit copy. */
export function formatUnitPrice(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
