/**
 * The organization's billing currency: what every price, invoice and balance is in.
 *
 * Every amount in this product is an integer in the currency's minor unit (cents). Until
 * `Organization.billingCurrency` existed the console assumed USD everywhere; this module is
 * the one place that knows which currency the signed-in organization bills in.
 *
 * Naming: "currency" already means PILOT recency in this codebase (currency types, me/currency).
 * Everything here says "billing currency" so the two never meet.
 *
 * The active value is module-level on purpose: `formatMoney` has ~175 callers, most of them in
 * plain functions with no React context, and threading a currency through each would be a
 * rewrite. AuthProvider sets it from the session organization (see lib/auth.tsx), so it
 * follows sign-in, org switch, rehydrate and sign-out.
 */

/** Two-decimal currencies the server accepts. Lowercase ISO 4217, like Stripe. */
export const BILLING_CURRENCIES = [
  { code: "usd", name: "US dollar", minimumChargeMinor: 50 },
  { code: "cad", name: "Canadian dollar", minimumChargeMinor: 50 },
  { code: "aud", name: "Australian dollar", minimumChargeMinor: 50 },
  { code: "nzd", name: "New Zealand dollar", minimumChargeMinor: 50 },
  { code: "gbp", name: "British pound", minimumChargeMinor: 30 },
  { code: "eur", name: "Euro", minimumChargeMinor: 50 },
] as const;

export type BillingCurrencyCode = (typeof BILLING_CURRENCIES)[number]["code"];

export const DEFAULT_BILLING_CURRENCY: BillingCurrencyCode = "usd";

const CODES = new Set<string>(BILLING_CURRENCIES.map((c) => c.code));

/** Lowercase and validate; anything missing or unknown reads as "usd". */
export function normalizeBillingCurrency(code: string | null | undefined): BillingCurrencyCode {
  const lower = typeof code === "string" ? code.trim().toLowerCase() : "";
  return CODES.has(lower) ? (lower as BillingCurrencyCode) : DEFAULT_BILLING_CURRENCY;
}

let active: BillingCurrencyCode = DEFAULT_BILLING_CURRENCY;

/** Set the signed-in organization's billing currency. Idempotent; unknown means usd. */
export function setActiveBillingCurrency(code: string | null | undefined): void {
  active = normalizeBillingCurrency(code);
}

/** The signed-in organization's billing currency ("usd" when signed out). */
export function activeBillingCurrency(): BillingCurrencyCode {
  return active;
}

/**
 * Format an amount already in MAJOR units (dollars, pounds) in a billing currency. The one
 * formatter every money string goes through, so it matches the server's byte for byte:
 * en-US grouping, narrow symbol ("$", "£", "€"), so a USD org reads exactly as it always has.
 */
export function formatMajor(
  amount: number,
  opts?: { currency?: string | null; minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const code = opts?.currency ? normalizeBillingCurrency(opts.currency) : active;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: code.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    ...(opts?.minimumFractionDigits != null ? { minimumFractionDigits: opts.minimumFractionDigits } : {}),
    ...(opts?.maximumFractionDigits != null ? { maximumFractionDigits: opts.maximumFractionDigits } : {}),
  });
}

/** The bare symbol for an input adornment: "$", "£" or "€". */
export function moneySymbol(code?: string | null): string {
  const c = code ? normalizeBillingCurrency(code) : active;
  const part = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: c.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  })
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? "$";
}

/** Uppercase code for a field label: "Amount (AUD)". */
export function billingCurrencyLabel(code?: string | null): string {
  return (code ? normalizeBillingCurrency(code) : active).toUpperCase();
}

/** Stripe's smallest charge in this currency, in minor units (gbp 30, the rest 50). */
export function minimumChargeMinor(code?: string | null): number {
  const c = code ? normalizeBillingCurrency(code) : active;
  return BILLING_CURRENCIES.find((x) => x.code === c)?.minimumChargeMinor ?? 50;
}

/** "Australian dollar (AUD)", for a picker. */
export function billingCurrencyOptionLabel(code: string, name?: string): string {
  const c = normalizeBillingCurrency(code);
  const n = name ?? BILLING_CURRENCIES.find((x) => x.code === c)?.name ?? c.toUpperCase();
  return `${n} (${c.toUpperCase()})`;
}

/**
 * The server's floor for "charge when booked" (a package price), in minor units. It is 50 in
 * EVERY currency, deliberately not `minimumChargeMinor()`: Stripe takes 30 pence, but the
 * booking endpoint refuses anything under 50 regardless, so a 40p package would pass here and
 * fail there.
 */
export const PACKAGE_PRICE_MINIMUM_MINOR = 50;

const CODE_ALTERNATION = BILLING_CURRENCIES.map((c) => c.code).join("|");
const LEADING_CODE = new RegExp(`^(-?)(?:${CODE_ALTERNATION})`, "i");
const TRAILING_CODE = new RegExp(`(?:${CODE_ALTERNATION})$`, "i");

/**
 * Parse an amount a person typed into minor units (cents), or null when it is not an amount.
 *
 * The one money parser every field goes through. A euro school types "12,50"; stripping the
 * comma (what the console used to do) read that as 1250.00, a hundred times the price, with
 * nothing on screen to say so. So:
 *   - currency symbols, a currency code and spaces are ignored ("£12.50", "A$40", "12 EUR");
 *   - one comma followed by one or two digits is a decimal comma ("12,50" is 12.50);
 *   - en-US grouping is accepted ("1,234.56", "1,234");
 *   - a plain number with up to two decimals is accepted ("12", "12.5", ".5", "12.");
 *   - anything else ("1,2,3", "12.345", "1.234,56") is null, so the field shows its error
 *     instead of guessing which separator meant what.
 * Negative amounts are returned as negative; callers that forbid them check the sign.
 */
export function parseMoneyInput(text: string | null | undefined): number | null {
  if (typeof text !== "string") return null;
  let s = text.replace(/\s/g, "");
  // Prefixed dollar symbols first, so "A$" / "NZ$" / "US$" do not leave their letters behind.
  s = s.replace(/(?:US|CA|AU|NZ|A|C)?\$/gi, "").replace(/\p{Sc}/gu, "");
  s = s.replace(LEADING_CODE, "$1").replace(TRAILING_CODE, "");
  // An explicit plus ("+25" on a signed adjustment) is just a positive amount.
  s = s.replace(/^\+/, "");
  if (s === "" || s === "-") return null;

  let normalized: string;
  if (/^-?\d+,\d{1,2}$/.test(s)) {
    normalized = s.replace(",", ".");
  } else if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d{0,2})?$/.test(s)) {
    normalized = s.replace(/,/g, "");
  } else if (/^-?(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(s)) {
    normalized = s;
  } else {
    return null;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  if (!Number.isSafeInteger(cents)) return null;
  // `+ 0` turns -0 ("-0.00") into 0.
  return cents + 0;
}
