import type { InvoiceLineCategory, TaxExemptReason } from "@/types/api";

/**
 * Words for the sales tax vocabulary. The rules themselves live on the server
 * (utils/salesTax.ts) and reach the console priced, through POST /invoices/preview; nothing
 * here decides whether a line is taxed.
 */

export const LINE_CATEGORY_OPTIONS: { value: InvoiceLineCategory; label: string; hint: string }[] = [
  { value: "labor", label: "Labor", hint: "Hours of work. Not taxed in most states when listed separately." },
  { value: "part", label: "Parts and goods", hint: "Anything sold: parts, oil, headsets." },
  { value: "supply", label: "Shop supplies", hint: "Rags, solvent, sandpaper used on the job." },
  { value: "outside_service", label: "Outside service", hint: "Work sent to another shop, like a prop overhaul." },
  { value: "freight", label: "Freight and shipping", hint: "Shipping a part to you or to the customer." },
  { value: "fee", label: "Fees", hint: "Fees, including your own service fee line." },
  { value: "rental", label: "Aircraft rental", hint: "Aircraft or simulator time billed by hand. Close-out bills are never taxed." },
  { value: "instruction", label: "Instruction", hint: "Lessons and ground school billed by hand." },
  { value: "other", label: "Other", hint: "Anything else." },
];

export const LINE_CATEGORY_LABEL: Record<InvoiceLineCategory, string> = Object.fromEntries(
  LINE_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
) as Record<InvoiceLineCategory, string>;

export const EXEMPT_REASON_OPTIONS: { value: TaxExemptReason; label: string }[] = [
  { value: "resale", label: "Resale" },
  { value: "government", label: "Government" },
  { value: "carrier", label: "Air carrier or charter operator" },
  { value: "nonresident", label: "Nonresident aircraft" },
  { value: "agricultural", label: "Agricultural aircraft" },
  { value: "nonprofit", label: "Exempt nonprofit" },
  { value: "tribal", label: "Tribal" },
  { value: "other", label: "Other" },
];

export const EXEMPT_REASON_LABEL: Record<TaxExemptReason, string> = Object.fromEntries(
  EXEMPT_REASON_OPTIONS.map((o) => [o.value, o.label])
) as Record<TaxExemptReason, string>;

/**
 * Rates travel in parts per million of the amount taxed: 60000 is 6%, 81875 is 8.1875%.
 * Four decimal places of a percent, the most Stripe takes, because New Mexico's local rates
 * move in sixteenths (Santa Fe is 8.1875%) and anything coarser would charge a different tax.
 */
const PPM_PER_PERCENT = 10_000;
const RATE_PPM_MAX = 300_000;

/** 60000 to "6%", 81875 to "8.1875%". */
export function percentLabel(ratePpm: number): string {
  return `${ratePpm / PPM_PER_PERCENT}%`;
}

/** "8.1875" or "8.1875%" to 81875, or null when it is not a rate. */
export function parseRatePpm(text: string): number | null {
  let cleaned = text.trim().replace(/%$/, "").trim();
  // ".5" is half a percent and "6." is six: both are what somebody means mid-typing.
  if (/^\.\d/.test(cleaned)) cleaned = `0${cleaned}`;
  cleaned = cleaned.replace(/\.$/, "");
  if (!/^\d{1,2}(\.\d{1,4})?$/.test(cleaned)) return null;
  const ppm = Math.round(Number(cleaned) * PPM_PER_PERCENT);
  return ppm > 0 && ppm <= RATE_PPM_MAX ? ppm : null;
}

export function percentText(ratePpm: number): string {
  return String(ratePpm / PPM_PER_PERCENT);
}
