// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerBlock } from "@/types/api";

/**
 * Add funds with prepaid blocks on sale. Choosing a block sends `{ blockId }` and lets the
 * server price it; Custom amount is the flow that was there before.
 */

const create = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const settings = vi.hoisted(() => ({
  data: {
    enabled: true,
    topUpCardFeePercent: null as number | null,
    topUpCardFeeFlatCents: null as number | null,
    lateFeePercent: null,
    lateFeeFlatCents: null,
    lateFeeGraceDays: null,
  },
}));
const blocks = vi.hoisted(() => ({ data: [] as LedgerBlock[] }));
vi.mock("@/features/queries", () => ({
  invalidateLedgerMoney: vi.fn(),
  useCreateLedgerTopUp: () => ({ mutateAsync: create.mutateAsync, isPending: false, reset: vi.fn() }),
  useConfirmLedgerTopUp: () => ({ mutateAsync: vi.fn() }),
  useLedgerBlocks: () => ({ data: blocks.data }),
  useOrgLedgerSettings: () => ({ data: settings.data }),
  usePaymentMethods: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/lib/stripe", () => ({ getStripeForAccount: () => null }));
vi.mock("@/components/billing/stripe-appearance", () => ({ useIsDark: () => false, stripeAppearance: () => ({}) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({ children, footer }: { children?: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

const { AddFundsDialog } = await import("./add-funds-dialog");

function render(ui: React.ReactElement) {
  return rtlRender(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

const tenHour: LedgerBlock = {
  id: 7,
  name: "10-hour block",
  description: null,
  priceCents: 170_000,
  creditCents: 180_000,
  bonusCents: 10_000,
  active: true,
  archivedAt: null,
  sortOrder: 0,
  purchaseCount: 0,
};

beforeEach(() => {
  create.mutateAsync.mockReset();
  create.mutateAsync.mockResolvedValue({
    clientSecret: "pi_secret",
    paymentIntentId: "pi_1",
    orgStripeAccountId: "acct_1",
    customerId: "cus_1",
    ephemeralKey: null,
    confirmed: false,
    creditCents: 170_000,
    feeCents: 0,
    chargeCents: 170_000,
  });
  blocks.data = [tenHour];
  settings.data.topUpCardFeePercent = null;
  settings.data.topUpCardFeeFlatCents = null;
});
afterEach(cleanup);

describe("Add funds with prepaid blocks", () => {
  it("offers the active blocks above the custom amount", () => {
    render(<AddFundsDialog orgUserId={42} open onOpenChange={() => {}} />);
    const option = screen.getByTestId("add-funds-block-7");
    expect(option.textContent).toContain("10-hour block");
    expect(option.textContent).toContain("Pay $1,700.00");
    expect(option.textContent).toContain("Get $1,800.00");
    expect(option.textContent).toContain("+$100.00 bonus");
    expect(screen.getByRole("radio", { name: "Custom amount" }).getAttribute("aria-checked")).toBe("true");
  });

  it("sends { blockId } when a block is chosen, never an amount", async () => {
    render(<AddFundsDialog orgUserId={42} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId("add-funds-block-7"));
    expect(screen.getByTestId("add-funds-summary").textContent).toBe(
      "Pay $1,700.00 for $1,800.00 of credit"
    );
    // The custom amount box goes away while a block is chosen.
    expect(screen.queryByLabelText(/Credit amount/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await vi.waitFor(() => expect(create.mutateAsync).toHaveBeenCalled());
    expect(create.mutateAsync.mock.calls[0][0]).toEqual({ blockId: 7, expectedPriceCents: 170_000, expectedCreditCents: 180_000 });
  });

  it("says the card fee is included when there is one", () => {
    settings.data.topUpCardFeePercent = 300; // 3%
    render(<AddFundsDialog orgUserId={42} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId("add-funds-block-7"));
    expect(screen.getByTestId("add-funds-summary").textContent).toContain(
      "Pay $1,751.00 for $1,800.00 of credit"
    );
  });

  it("goes back to the custom amount flow", async () => {
    render(<AddFundsDialog orgUserId={42} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByTestId("add-funds-block-7"));
    fireEvent.click(screen.getByRole("radio", { name: "Custom amount" }));
    fireEvent.change(screen.getByLabelText(/Credit amount/), { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
    await vi.waitFor(() => expect(create.mutateAsync).toHaveBeenCalled());
    expect(create.mutateAsync.mock.calls[0][0]).toEqual({ amountCents: 25_000 });
  });

  it("shows no block choice when none are on sale", () => {
    blocks.data = [];
    render(<AddFundsDialog orgUserId={42} open onOpenChange={() => {}} />);
    expect(screen.queryByRole("radio", { name: "Custom amount" })).toBeNull();
    expect(screen.getByLabelText(/Credit amount/)).toBeTruthy();
  });
});
