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

/**
 * Where prior opt-in is legally required before analytics or ad cookies load.
 *
 * The EU27 plus the rest of the EEA (Iceland, Liechtenstein, Norway), the UK under UK
 * GDPR, and Switzerland under the revised FADP.
 */
const OPT_IN_REQUIRED = new Set([
  // EU27
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // Rest of the EEA
  "IS", "LI", "NO",
  // UK GDPR, and Switzerland's revFADP
  "GB", "CH",
]);

/**
 * True when we may treat analytics as consented without a blocking prompt.
 *
 * Widened on 2026-08-25 from "US only" to "any known country outside the opt-in list".
 * US-only was leaving real non-EEA traffic behind a prompt no law required: 19% of
 * marketing-site sessions in the week to 2026-08-25 were Argentinian, against 9% EEA/UK.
 *
 * Deliberately requires a KNOWN country. An unknown one (no cookie, header missing, a
 * proxy Vercel cannot place) falls through to asking, because guessing wrong in the
 * permissive direction is the expensive mistake.
 *
 * **Mirrored in `website/src/lib/geo.ts`.** The two cannot import from each other, so
 * change both in the same commit. A visitor prompted on one surface and silently tracked
 * on the other is worse than either policy applied consistently.
 */
export function isConsentImpliedRegion(country: string | null): boolean {
  if (!country) return false;
  return !OPT_IN_REQUIRED.has(country);
}
