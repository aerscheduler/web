// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "@/types/api";

/**
 * Reversing a prepaid block sold at the desk. The dialog has to say that money comes OFF the
 * balance (payment and bonus), not back on it as it does for a flight charge.
 */

const reverse = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => ({})) }));
vi.mock("@/features/queries", () => ({
  useReverseLedgerFlightCharge: () => ({
    mutateAsync: reverse.mutateAsync,
    isPending: false,
  }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/use-timezone", () => ({ useTimeZone: () => ({ date: () => "Tue, Oct 13" }) }));
vi.mock("sonner", () => ({ toast }));

const { LedgerReverseDialog } = await import("./ledger-reverse-dialog");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function entry(over: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: 41,
    createdAt: "2026-10-12T10:00:00.000Z",
    amountCents: 170_000,
    type: "check",
    memo: "Block purchase: 10-hour block · Check #1042",
    orgUserId: 9,
    organizationId: 1,
    createdByOrgUserId: 2,
    invoiceId: null,
    reservationId: null,
    reversesId: null,
    reversedBy: null,
    items: [],
    ...over,
  } as LedgerEntry;
}

describe("LedgerReverseDialog for a desk block sale", () => {
  it("says the payment and its bonus come off, and reverses the payment row", async () => {
    render(
      <LedgerReverseDialog
        orgUserId={9}
        entry={entry({ blockSale: { method: "check", bonusCents: 10_000, bonusLeftCents: 10_000 } })}
        open
        onOpenChange={() => {}}
      />
    );
    expect(screen.getByText("Reverse this block sale?")).toBeTruthy();
    expect(screen.getByText(/payment and .*100\.00 of block bonus still on the account come off/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reverse sale" }));
    await vi.waitFor(() =>
      expect(reverse.mutateAsync).toHaveBeenCalledWith({
        entryId: 41,
        memo: undefined,
      })
    );
    expect(toast.success).toHaveBeenCalledWith("Block sale reversed.");
  });

  it("removes a block bonus on its own with its own wording", async () => {
    render(
      <LedgerReverseDialog
        orgUserId={9}
        entry={entry({
          type: "block_bonus",
          amountCents: 10_000,
          bonusLeftCents: 4_000,
          memo: "Block bonus: 10-hour block",
        })}
        open
        onOpenChange={() => {}}
      />
    );
    expect(screen.getByText("Remove this block bonus?")).toBeTruthy();
    // Only the 40.00 still held, not the 100.00 first posted.
    expect(document.body.textContent).toMatch(/40\.00 of bonus comes off/);
    fireEvent.click(screen.getByRole("button", { name: "Remove bonus" }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Bonus removed."));
  });

  it("keeps the flight charge wording for a flight charge", () => {
    render(
      <LedgerReverseDialog
        orgUserId={9}
        entry={entry({
          type: "flight_charge",
          amountCents: -24_000,
          memo: "Flight",
          reservationId: 5,
        })}
        open
        onOpenChange={() => {}}
      />
    );
    expect(screen.getByText("Reverse this charge?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reverse charge" })).toBeTruthy();
  });
});
