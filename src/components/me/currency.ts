import type { Currency } from "@/types/api";

export interface CurrencyAttention {
  /** Currencies whose expiry is already in the past. */
  expired: number;
  /** Currencies expiring within the next `withinDays` (but not yet expired). */
  expiring: number;
  /** expired + expiring — the count that "needs attention". */
  attention: number;
}

/**
 * Summarize the caller's currencies into an attention count. Archived rows and
 * rows without an expiry (non-expiring) are ignored.
 */
export function currencyAttention(
  currencies: Currency[] | undefined,
  now: Date = new Date(),
  withinDays = 30
): CurrencyAttention {
  const soon = now.getTime() + withinDays * 24 * 60 * 60 * 1000;
  let expired = 0;
  let expiring = 0;
  for (const c of currencies ?? []) {
    if (c.archivedAt || !c.expiresAt) continue;
    const t = new Date(c.expiresAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t < now.getTime()) expired += 1;
    else if (t <= soon) expiring += 1;
  }
  return { expired, expiring, attention: expired + expiring };
}
