import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICE_FEE_LABEL,
  priceWithServiceFee,
  serviceFeeItemFor,
  type FeeItem,
} from "./service-fee";

/**
 * Parity guard for the fee the DESK is shown against the fee the SERVER raises.
 *
 * The numbers below are not invented. They are read off the live dev org (AERTEST01,
 * `serviceFeePercent = 300`, label "Club service fee") and its existing invoices, every
 * one of which is exactly x1.03. If this file and `server/src/utils/serviceFee.ts` ever
 * disagree, the dialog goes back to lying about the total.
 */

const THREE_PERCENT = { serviceFeePercent: 300, serviceFeeLabel: "Club service fee" };

const line = (unitPrice: number, qty = 1): FeeItem => ({ name: "Labor", qty, unitPrice });

describe("serviceFeeItemFor", () => {
  it("matches the totals on real AERTEST01 invoices", () => {
    // $199.00 -> $204.97 and $49.00 -> $50.47, both straight off the invoice list.
    expect(priceWithServiceFee([line(19_900)], THREE_PERCENT).total).toBe(20_497);
    expect(priceWithServiceFee([line(4_900)], THREE_PERCENT).total).toBe(5_047);
  });

  it("matches the case that proved the bug: 12 hours at $95", () => {
    const { subtotal, fee, total } = priceWithServiceFee([line(9_500, 12)], THREE_PERCENT);
    expect(subtotal).toBe(114_000); // what the dialog used to show on its own
    expect(fee?.unitPrice).toBe(3_420);
    expect(fee?.name).toBe("Club service fee");
    expect(total).toBe(117_420); // what the server actually raised
  });

  it("charges nothing when the school has no fee configured", () => {
    for (const settings of [null, undefined, {}, { serviceFeePercent: null }, { serviceFeePercent: 0 }]) {
      expect(serviceFeeItemFor([line(10_000)], settings)).toBeNull();
      expect(priceWithServiceFee([line(10_000)], settings).total).toBe(10_000);
    }
  });

  it("floors, never rounds up: the server uses Math.floor", () => {
    // 0.5% of $1.99 is 0.995 cents. Flooring gives 0, so there is no fee line at all.
    expect(serviceFeeItemFor([line(199)], { serviceFeePercent: 50 })).toBeNull();
    // 3% of $3.33 is 9.99 cents, which floors to 9.
    expect(serviceFeeItemFor([line(333)], THREE_PERCENT)?.unitPrice).toBe(9);
  });

  it("fees the whole set of items once, not each line", () => {
    const items = [line(10_000), line(5_000), line(2_500, 2)];
    // subtotal 200.00, fee 6.00
    expect(priceWithServiceFee(items, THREE_PERCENT)).toEqual({
      subtotal: 20_000,
      fee: { name: "Club service fee", qty: 1, unitPrice: 600 },
      total: 20_600,
    });
  });

  it("falls back to the default label when the school left it blank", () => {
    for (const label of ["", "   ", null, undefined]) {
      const fee = serviceFeeItemFor([line(10_000)], { serviceFeePercent: 300, serviceFeeLabel: label });
      expect(fee?.name).toBe(DEFAULT_SERVICE_FEE_LABEL);
    }
  });

  it("charges nothing on an empty or zero-value bill", () => {
    expect(serviceFeeItemFor([], THREE_PERCENT)).toBeNull();
    expect(serviceFeeItemFor([line(0)], THREE_PERCENT)).toBeNull();
    expect(serviceFeeItemFor([line(10_000, 0)], THREE_PERCENT)).toBeNull();
  });

  it("ignores a nonsense percent rather than billing a nonsense fee", () => {
    for (const percent of [NaN, Infinity, -100]) {
      expect(serviceFeeItemFor([line(10_000)], { serviceFeePercent: percent })).toBeNull();
    }
  });

  it("never mutates the items it was given", () => {
    const items = [line(10_000)];
    const before = JSON.stringify(items);
    priceWithServiceFee(items, THREE_PERCENT);
    expect(JSON.stringify(items)).toBe(before);
  });
});
