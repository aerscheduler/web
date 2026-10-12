import { formatMoney } from "@/lib/utils";

/**
 * Prepaid blocks (block time with a bonus): pay `priceCents`, get `creditCents` on the
 * account. The bonus is the difference. Shared by the Billing settings editor, Add funds and
 * the desk's Sell a block, so all three say the same thing about the same block.
 */

/** The smallest price a block may have (the server refuses less). */
export const BLOCK_MIN_PRICE_CENTS = 100;
/** The largest credit a block may add (the server refuses more). */
export const BLOCK_MAX_CREDIT_CENTS = 100_000_000;
export const BLOCK_NAME_MAX = 60;
export const BLOCK_DESCRIPTION_MAX = 300;

export function blockBonusCents(priceCents: number, creditCents: number): number {
  return Math.max(0, creditCents - priceCents);
}

/** Bonus as a percent of the price, one decimal: 1,700 to 1,800 is "5.9". */
export function blockBonusPercent(priceCents: number, creditCents: number): string {
  if (priceCents <= 0) return "0";
  const pct = (blockBonusCents(priceCents, creditCents) / priceCents) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** "+$100.00 (5.9%)", or "No bonus". */
export function formatBlockBonus(priceCents: number, creditCents: number): string {
  const bonus = blockBonusCents(priceCents, creditCents);
  if (bonus <= 0) return "No bonus";
  return `+${formatMoney(bonus)} (${blockBonusPercent(priceCents, creditCents)}%)`;
}

/**
 * Why a block cannot be saved, or null when it can. Mirrors the server's rules so Save is
 * disabled with the reason on screen instead of pressed into a 400.
 */
export function blockEditorError(input: {
  name: string;
  priceCents: number | undefined;
  creditCents: number | undefined;
}): { field: "name" | "price" | "credit"; message: string } | null {
  if (!input.name.trim()) return { field: "name", message: "Give the block a name." };
  if (input.name.trim().length > BLOCK_NAME_MAX) {
    return { field: "name", message: `Keep the name to ${BLOCK_NAME_MAX} characters.` };
  }
  const price = input.priceCents ?? 0;
  const credit = input.creditCents ?? 0;
  if (price < BLOCK_MIN_PRICE_CENTS) {
    return {
      field: "price",
      message: `The member pays at least ${formatMoney(BLOCK_MIN_PRICE_CENTS)}.`,
    };
  }
  if (credit < price) {
    return {
      field: "credit",
      message: "Credit added has to be at least what the member pays.",
    };
  }
  if (credit > BLOCK_MAX_CREDIT_CENTS) {
    return {
      field: "credit",
      message: `Credit added is at most ${formatMoney(BLOCK_MAX_CREDIT_CENTS)}.`,
    };
  }
  return null;
}
