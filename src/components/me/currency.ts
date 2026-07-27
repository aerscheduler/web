import type { Currency } from "@/types/api";

export type CurrencyStanding = "current" | "expiring" | "expired" | "notSignedOff";

export interface CurrencyAttention {
  /** Lapsed — the server has stamped `expiredAt`. */
  expired: number;
  /** Inside the warning period, not yet lapsed. */
  expiring: number;
  /** Never signed off: no `renewedBy`, so it has never counted as current. */
  notSignedOff: number;
  /** Everything that needs a human to do something. */
  attention: number;
}

/**
 * Where a single currency stands.
 *
 * Mirrors the server's `checkIfCurrencyIsCurrent`, which is the authority —
 * `orgUserIsCurrentForResource` gates booking with it. Current means not
 * expired, not archived, AND carrying a `renewedBy`, which the server stamps on
 * a manual renewal or a document upload. A row that has never been signed off
 * is NOT current even though nothing about it has expired yet.
 *
 * ⚠️ This previously read a `Currency.expiresAt` that does not exist on the
 * server model, so every row was skipped and the dashboard reported "All
 * current" regardless of reality. Don't reintroduce a client-side expiry
 * calculation: expiry is the server's call, surfaced via `warnedAt`/`expiredAt`.
 */
export function currencyStanding(c: Currency): CurrencyStanding | null {
  if (c.archivedAt) return null;
  if (c.expiredAt) return "expired";
  if (!c.renewedBy) return "notSignedOff";
  if (c.warnedAt) return "expiring";
  return "current";
}

/** Summarize the caller's currencies into an attention count. */
export function currencyAttention(currencies: Currency[] | undefined): CurrencyAttention {
  let expired = 0;
  let expiring = 0;
  let notSignedOff = 0;

  for (const c of currencies ?? []) {
    switch (currencyStanding(c)) {
      case "expired":
        expired += 1;
        break;
      case "expiring":
        expiring += 1;
        break;
      case "notSignedOff":
        notSignedOff += 1;
        break;
      default:
        break;
    }
  }

  return { expired, expiring, notSignedOff, attention: expired + expiring + notSignedOff };
}
