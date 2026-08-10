/**
 * Approximate visitor country for consent UX.
 *
 * Written by `middleware.ts` from Vercel's `x-vercel-ip-country` header onto the
 * first-party `aer_country` cookie. Failures and unknowns return null so callers
 * fall back to "ask for consent" rather than silently tracking.
 */

export const COUNTRY_COOKIE = "aer_country";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** ISO 3166-1 alpha-2, or null when unknown. */
export function getVisitorCountry(): string | null {
  const raw = readCookie(COUNTRY_COOKIE);
  return raw && /^[A-Z]{2}$/.test(raw) ? raw : null;
}

/** Regions where the console skips the cookie prompt and treats analytics as granted. */
export function isConsentImpliedRegion(country: string | null): boolean {
  return country === "US";
}
