import { afterEach, describe, expect, it } from "vitest";
import {
  activeBillingCurrency,
  billingCurrencyLabel,
  billingCurrencyOptionLabel,
  formatMajor,
  minimumChargeMinor,
  moneySymbol,
  normalizeBillingCurrency,
  setActiveBillingCurrency,
} from "./billing-currency";
import { formatMoney } from "./utils";
import { formatMonthly, formatUnitPrice } from "./subscription";
import { formatReportValue } from "./report-format";
import { moneyValue } from "@/components/detail/metric-tile";

/**
 * Billing currency formatting. The USD cases are the contract: a USD organization (every
 * organization before this shipped) must read EXACTLY as it always has, character for
 * character. The other currencies must match the server's formatter, which is the same
 * `toLocaleString("en-US", { currencyDisplay: "narrowSymbol" })` call.
 */

afterEach(() => setActiveBillingCurrency(null));

describe("USD reads exactly as it did before billing currency existed", () => {
  it("formatMoney", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
    expect(formatMoney(-1200)).toBe("-$12.00");
    expect(formatMoney(5000, { cents: false })).toBe("$50");
    expect(formatMoney(99_999_999)).toBe("$999,999.99");
  });

  it("the tile, report and symbol helpers", () => {
    expect(moneyValue(123456)).toBe("$1,235");
    expect(formatReportValue(123456, "money")).toBe("$1,235");
    expect(formatReportValue(1250, "money")).toBe("$12.50");
    expect(formatMajor(1234, { maximumFractionDigits: 0 })).toBe("$1,234");
    expect(moneySymbol()).toBe("$");
    expect(billingCurrencyLabel()).toBe("USD");
    expect(minimumChargeMinor()).toBe(50);
    expect(formatMoney(minimumChargeMinor())).toBe("$0.50");
  });
});

describe("other currencies", () => {
  it("aud, cad and nzd use a bare $", () => {
    for (const code of ["aud", "cad", "nzd"]) {
      expect(formatMoney(123456, { currency: code })).toBe("$1,234.56");
      expect(moneySymbol(code)).toBe("$");
    }
  });

  it("gbp uses £ and eur uses €", () => {
    expect(formatMoney(123456, { currency: "gbp" })).toBe("£1,234.56");
    expect(formatMoney(-1200, { currency: "gbp" })).toBe("-£12.00");
    expect(formatMoney(123456, { currency: "eur" })).toBe("€1,234.56");
    expect(moneySymbol("gbp")).toBe("£");
    expect(moneySymbol("eur")).toBe("€");
  });

  it("gbp's Stripe minimum is 30 pence", () => {
    expect(minimumChargeMinor("gbp")).toBe(30);
    expect(formatMoney(minimumChargeMinor("gbp"), { currency: "gbp" })).toBe("£0.30");
  });

  it("option labels", () => {
    expect(billingCurrencyOptionLabel("aud")).toBe("Australian dollar (AUD)");
    expect(billingCurrencyOptionLabel("gbp", "Pound sterling")).toBe("Pound sterling (GBP)");
  });
});

describe("normalizeBillingCurrency", () => {
  it("lowercases and accepts the supported set", () => {
    expect(normalizeBillingCurrency("AUD")).toBe("aud");
    expect(normalizeBillingCurrency(" gbp ")).toBe("gbp");
  });

  it("reads missing or unknown as usd", () => {
    expect(normalizeBillingCurrency(undefined)).toBe("usd");
    expect(normalizeBillingCurrency(null)).toBe("usd");
    expect(normalizeBillingCurrency("")).toBe("usd");
    expect(normalizeBillingCurrency("jpy")).toBe("usd");
    expect(normalizeBillingCurrency("dollars")).toBe("usd");
    expect(formatMoney(100, { currency: "xyz" })).toBe("$1.00");
  });
});

describe("the active billing currency", () => {
  it("defaults to usd", () => {
    expect(activeBillingCurrency()).toBe("usd");
  });

  it("set and reset", () => {
    setActiveBillingCurrency("gbp");
    expect(activeBillingCurrency()).toBe("gbp");
    expect(formatMoney(123456)).toBe("£1,234.56");
    expect(moneyValue(123456)).toBe("£1,235");
    expect(formatReportValue(1250, "money")).toBe("£12.50");
    expect(moneySymbol()).toBe("£");
    expect(billingCurrencyLabel()).toBe("GBP");
    expect(minimumChargeMinor()).toBe(30);

    setActiveBillingCurrency("nonsense");
    expect(activeBillingCurrency()).toBe("usd");

    setActiveBillingCurrency("eur");
    setActiveBillingCurrency(undefined);
    expect(activeBillingCurrency()).toBe("usd");
    expect(formatMoney(123456)).toBe("$1,234.56");
  });

  it("an explicit currency beats the active one", () => {
    setActiveBillingCurrency("gbp");
    expect(formatMoney(123456, { currency: "usd" })).toBe("$1,234.56");
    expect(formatMoney(123456, { currency: "eur" })).toBe("€1,234.56");
    expect(moneySymbol("usd")).toBe("$");
  });

  it("AerScheduler's own plan price stays in USD under an active gbp", () => {
    setActiveBillingCurrency("gbp");
    expect(formatMonthly(4000)).toBe("$40/mo");
    expect(formatMonthly(2050)).toBe("$20.50/mo");
    expect(formatUnitPrice(2000)).toBe("$20");
  });
});
