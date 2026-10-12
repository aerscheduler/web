import { describe, expect, it } from "vitest";
import { PACKAGE_PRICE_MINIMUM_MINOR, parseMoneyInput } from "./billing-currency";

/**
 * parseMoneyInput: what a person typed, to minor units. The bug it exists for: a euro school
 * typing "12,50" used to be charged 1,250.00, because every money field stripped commas.
 */
describe("parseMoneyInput", () => {
  it("reads a decimal comma as the decimal point", () => {
    expect(parseMoneyInput("12,50")).toBe(1250);
    expect(parseMoneyInput("0,5")).toBe(50);
    expect(parseMoneyInput("1,2")).toBe(120);
    expect(parseMoneyInput("1,23")).toBe(123);
    expect(parseMoneyInput("€12,50")).toBe(1250);
    expect(parseMoneyInput("12,50 €")).toBe(1250);
    expect(parseMoneyInput("-3,25")).toBe(-325);
  });

  it("keeps en-US grouping working exactly as before", () => {
    expect(parseMoneyInput("1,234.56")).toBe(123456);
    expect(parseMoneyInput("1,234")).toBe(123400);
    expect(parseMoneyInput("12,345,678.90")).toBe(1234567890);
    expect(parseMoneyInput("$1,250.00")).toBe(125000);
    expect(parseMoneyInput("1,234.5")).toBe(123450);
  });

  it("reads plain amounts", () => {
    expect(parseMoneyInput("12")).toBe(1200);
    expect(parseMoneyInput("12.5")).toBe(1250);
    expect(parseMoneyInput("12.50")).toBe(1250);
    expect(parseMoneyInput("12.")).toBe(1200);
    expect(parseMoneyInput(".5")).toBe(50);
    expect(parseMoneyInput("0")).toBe(0);
    expect(parseMoneyInput("0.00")).toBe(0);
    expect(parseMoneyInput("  40  ")).toBe(4000);
  });

  it("rounds rather than truncates (IEEE 754)", () => {
    expect(parseMoneyInput("499.99")).toBe(49999);
    expect(parseMoneyInput("1.15")).toBe(115);
    expect(parseMoneyInput("0.29")).toBe(29);
    expect(parseMoneyInput("4.35")).toBe(435);
  });

  it("ignores currency symbols, codes and spaces", () => {
    expect(parseMoneyInput("£12.50")).toBe(1250);
    expect(parseMoneyInput("$40")).toBe(4000);
    expect(parseMoneyInput("A$40")).toBe(4000);
    expect(parseMoneyInput("NZ$40.10")).toBe(4010);
    expect(parseMoneyInput("US$ 1,000")).toBe(100000);
    expect(parseMoneyInput("12.50 EUR")).toBe(1250);
    expect(parseMoneyInput("gbp 7")).toBe(700);
    expect(parseMoneyInput("1 234.00")).toBe(123400);
  });

  it("handles negatives", () => {
    expect(parseMoneyInput("-10.00")).toBe(-1000);
    expect(parseMoneyInput("-$10")).toBe(-1000);
    expect(parseMoneyInput("$-10")).toBe(-1000);
    expect(parseMoneyInput("-1,234.56")).toBe(-123456);
    expect(Object.is(parseMoneyInput("-0.00"), 0)).toBe(true);
  });

  it("refuses ambiguous or malformed input instead of guessing", () => {
    expect(parseMoneyInput("€1.234,56")).toBeNull();
    expect(parseMoneyInput("1.234,56")).toBeNull();
    expect(parseMoneyInput("12.345")).toBeNull();
    expect(parseMoneyInput("1,2,3")).toBeNull();
    expect(parseMoneyInput("12,5,0")).toBeNull();
    expect(parseMoneyInput("12,345,67")).toBeNull();
    expect(parseMoneyInput("1234,567")).toBeNull();
    expect(parseMoneyInput("12,")).toBeNull();
    expect(parseMoneyInput("95.000.00")).toBeNull();
    expect(parseMoneyInput("0.0095")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("12abc")).toBeNull();
    expect(parseMoneyInput("1e5")).toBeNull();
    expect(parseMoneyInput("--5")).toBeNull();
    expect(parseMoneyInput(".")).toBeNull();
    expect(parseMoneyInput(",")).toBeNull();
    expect(parseMoneyInput("-")).toBeNull();
    expect(parseMoneyInput("$")).toBeNull();
  });

  it("treats empty as null", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
    expect(parseMoneyInput(null)).toBeNull();
    expect(parseMoneyInput(undefined)).toBeNull();
  });

  it("refuses amounts too large to be whole cents", () => {
    expect(parseMoneyInput("99999999999999999999")).toBeNull();
  });
});

describe("package price minimum", () => {
  it("is 50 minor units in every currency, matching the server", () => {
    expect(PACKAGE_PRICE_MINIMUM_MINOR).toBe(50);
  });
});

describe("a signed amount", () => {
  it("reads an explicit plus as a positive amount", () => {
    expect(parseMoneyInput("+25")).toBe(2500);
    expect(parseMoneyInput("+12,50")).toBe(1250);
    expect(parseMoneyInput("+")).toBeNull();
  });
});
