// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerBlock, LedgerRefundable } from "@/types/api";

/**
 * The desk side of prepaid blocks: Sell a block posts the block, how they paid and the memo;
 * Refund caps at what is refundable, because block bonus never leaves the organization.
 */

const sell = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const refund = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const refundable = vi.hoisted(() => ({ data: undefined as LedgerRefundable | undefined }));
const blocks = vi.hoisted(() => ({ data: [] as LedgerBlock[] }));
vi.mock("@/features/queries", () => ({
  useLedgerBlocks: () => ({ data: blocks.data, isPending: false }),
  useSellBlock: () => ({ mutateAsync: sell.mutateAsync, isPending: false, reset: vi.fn() }),
  useLedgerRefundable: () => ({ data: refundable.data, isPending: false }),
  usePostLedgerRefund: () => ({ mutateAsync: refund.mutateAsync, isPending: false, reset: vi.fn() }),
  usePostLedgerEntry: () => ({ mutateAsync: vi.fn(), isPending: false, reset: vi.fn() }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({ children, footer }: { children?: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));
// The chip's dropdown is Radix; a native select stands in so the wiring is what is tested.
vi.mock("@/components/property-chips", () => ({
  ChipMenu: ({ name, value, onChange, options }: { name: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const { LedgerSellBlockDialog, LedgerRefundDialog } = await import("./ledger-desk-dialogs");

const block = (id: number, name: string, priceCents: number, creditCents: number): LedgerBlock => ({
  id,
  name,
  description: null,
  priceCents,
  creditCents,
  bonusCents: creditCents - priceCents,
  active: true,
  archivedAt: null,
  sortOrder: id,
  purchaseCount: 0,
});

beforeEach(() => {
  sell.mutateAsync.mockReset();
  refund.mutateAsync.mockReset();
  toast.success.mockReset();
  blocks.data = [block(7, "10-hour block", 170_000, 180_000), block(8, "5-hour block", 90_000, 92_500)];
});
afterEach(cleanup);

describe("Sell a block", () => {
  it("posts the chosen block, how they paid, and the memo", async () => {
    sell.mutateAsync.mockResolvedValue({ balanceCents: 185_000, purchase: {} });
    render(<LedgerSellBlockDialog orgUserId={42} open onOpenChange={() => {}} />);
    expect(screen.getByTestId("sell-block-8").textContent).toContain("+$25.00 bonus");
    fireEvent.click(screen.getByTestId("sell-block-8"));
    fireEvent.click(screen.getByTestId("sell-block-7"));
    fireEvent.change(screen.getByLabelText("How they paid"), { target: { value: "check" } });
    fireEvent.change(screen.getByLabelText("Memo"), { target: { value: " Check #1042 " } });
    fireEvent.click(screen.getByRole("button", { name: "Sell 10-hour block" }));
    await vi.waitFor(() => expect(sell.mutateAsync).toHaveBeenCalled());
    expect(sell.mutateAsync.mock.calls[0][0]).toEqual({
      blockId: 7,
      expectedPriceCents: 170_000,
      expectedCreditCents: 180_000,
      method: "check",
      memo: "Check #1042",
    });
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Sold 10-hour block. Balance $1,850.00.")
    );
  });

  it("defaults to the first block and cash, and leaves an empty memo out", async () => {
    sell.mutateAsync.mockResolvedValue({ balanceCents: 0, purchase: {} });
    render(<LedgerSellBlockDialog orgUserId={42} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Sell 10-hour block" }));
    await vi.waitFor(() => expect(sell.mutateAsync).toHaveBeenCalled());
    expect(sell.mutateAsync.mock.calls[0][0]).toEqual({
      blockId: 7,
      expectedPriceCents: 170_000,
      expectedCreditCents: 180_000,
      method: "cash",
    });
  });
});

describe("Refund with block bonus on the account", () => {
  it("says what is refundable and caps the amount there", async () => {
    refundable.data = {
      balanceCents: 15_000,
      ledgerEnabled: true,
      topups: [],
      unspentBonusCents: 10_000,
      refundableCents: 5_000,
    };
    render(<LedgerRefundDialog orgUserId={42} open onOpenChange={() => {}} />);
    expect(screen.getByTestId("refund-bonus-note").textContent).toBe(
      "Refundable: $50.00. $100.00 of block bonus is not refundable."
    );
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    await vi.waitFor(() => expect(amount.value).toBe("50.00"));
    fireEvent.change(amount, { target: { value: "60" } });
    expect(screen.getByText("Only $50.00 is refundable. Block bonus is not.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Memo"), { target: { value: "Leaving" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm refund" }));
    expect(refund.mutateAsync).not.toHaveBeenCalled();
  });

  it("cannot refund when only bonus is left", () => {
    refundable.data = {
      balanceCents: 10_000,
      ledgerEnabled: true,
      topups: [],
      unspentBonusCents: 10_000,
      refundableCents: 0,
    };
    render(<LedgerRefundDialog orgUserId={42} open onOpenChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Confirm refund" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps the old behaviour when the server sends no bonus figures", async () => {
    refundable.data = { balanceCents: 12_000, ledgerEnabled: true, topups: [] };
    render(<LedgerRefundDialog orgUserId={42} open onOpenChange={() => {}} />);
    expect(screen.queryByTestId("refund-bonus-note")).toBeNull();
    const amount = screen.getByLabelText("Amount") as HTMLInputElement;
    await vi.waitFor(() => expect(amount.value).toBe("120.00"));
  });
});
