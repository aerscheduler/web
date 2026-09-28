/**
 * The SCHOOL's own service fee, mirrored from the server's `utils/serviceFee.ts`.
 *
 * The server appends this line to every custom charge (`memberCharges.ts` withOrgServiceFee),
 * which means the desk was being shown one total and the customer was billed another: a
 * 3% school raising a $1,140.00 bill created $1,174.20, with a "Club service fee" line
 * nobody typed. On a $6,000 annual that is $180 never quoted.
 *
 * This file exists because server and web are separate git repos, so the real util cannot
 * be imported. `service-fee.test.ts` pins the arithmetic against the server's worked
 * examples so the two cannot drift; if you change the rule, change it in BOTH places.
 */

export type ServiceFeeSettings = {
  /** Hundredths of a percent, so 300 is 3%. Null / 0 = no fee. */
  serviceFeePercent?: number | null;
  serviceFeeLabel?: string | null;
};

export type FeeItem = { name: string; qty: number; unitPrice: number };

export const DEFAULT_SERVICE_FEE_LABEL = "Service Fee";

/**
 * The fee line for a set of items, or null when the school charges none.
 *
 * `Math.floor` matches the server exactly. Anything else and the preview disagrees with
 * the bill by a cent, which is worse than not previewing it at all.
 */
export function serviceFeeItemFor(
  items: readonly FeeItem[],
  settings: ServiceFeeSettings | null | undefined
): FeeItem | null {
  const percent = settings?.serviceFeePercent;
  if (percent == null || !Number.isFinite(percent) || percent <= 0) return null;

  const subtotal = items.reduce((total, item) => total + item.qty * item.unitPrice, 0);
  if (subtotal <= 0) return null;

  const unitPrice = Math.floor((subtotal * percent) / 10_000);
  if (unitPrice <= 0) return null;

  return {
    name: settings?.serviceFeeLabel?.trim() || DEFAULT_SERVICE_FEE_LABEL,
    qty: 1,
    unitPrice,
  };
}

/**
 * What the customer will actually be billed for these items: subtotal, the fee line if
 * there is one, and the total the server will raise.
 */
export function priceWithServiceFee(
  items: readonly FeeItem[],
  settings: ServiceFeeSettings | null | undefined
): { subtotal: number; fee: FeeItem | null; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const fee = serviceFeeItemFor(items, settings);
  return { subtotal, fee, total: subtotal + (fee?.unitPrice ?? 0) };
}
