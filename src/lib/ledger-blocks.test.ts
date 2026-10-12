import { describe, expect, it } from "vitest";
import {
  blockBonusCents,
  blockBonusPercent,
  blockEditorError,
  formatBlockBonus,
} from "@/lib/ledger-blocks";
import { LEDGER_TYPE_FACET_OPTIONS, ledgerEntryLabel } from "@/lib/ledger-labels";

describe("prepaid block math", () => {
  it("pay 1,700, get 1,800 is a 100.00 bonus, 5.9% extra", () => {
    expect(blockBonusCents(170_000, 180_000)).toBe(10_000);
    expect(blockBonusPercent(170_000, 180_000)).toBe("5.9");
    expect(formatBlockBonus(170_000, 180_000)).toBe("+$100.00 (5.9%)");
  });

  it("drops a trailing .0 and says so when there is no bonus", () => {
    expect(blockBonusPercent(100_000, 110_000)).toBe("10");
    expect(formatBlockBonus(100_000, 100_000)).toBe("No bonus");
  });

  it("never reports a negative bonus", () => {
    expect(blockBonusCents(180_000, 170_000)).toBe(0);
  });
});

describe("the block editor's rules", () => {
  const ok = { name: "10-hour block", priceCents: 170_000, creditCents: 180_000 };

  it("takes a named block that adds at least what it costs", () => {
    expect(blockEditorError(ok)).toBeNull();
    expect(blockEditorError({ ...ok, creditCents: 170_000 })).toBeNull();
  });

  it("refuses credit below the price", () => {
    expect(blockEditorError({ ...ok, creditCents: 160_000 })).toEqual({
      field: "credit",
      message: "Credit added has to be at least what the member pays.",
    });
  });

  it("refuses a price under 1.00, a missing name, and too much credit", () => {
    expect(blockEditorError({ ...ok, priceCents: 99 })?.field).toBe("price");
    expect(blockEditorError({ ...ok, priceCents: undefined })?.field).toBe("price");
    expect(blockEditorError({ ...ok, name: "   " })?.field).toBe("name");
    expect(blockEditorError({ ...ok, creditCents: 100_000_001 })?.field).toBe("credit");
  });
});

describe("block bonus on the ledger", () => {
  it("has a label and a type filter option", () => {
    expect(ledgerEntryLabel("block_bonus")).toBe("Block bonus");
    expect(LEDGER_TYPE_FACET_OPTIONS.some((o) => o.value === "block_bonus" && o.label === "Block bonus")).toBe(true);
  });
});
