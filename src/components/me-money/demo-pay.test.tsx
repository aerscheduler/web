// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Invoice } from "@/types/api";

/**
 * Paying in the public demo. The demo runs against live Stripe, so the server refuses /stripe
 * there; the console has to say so before the visitor reaches a payment form that can only fail,
 * and it must not ask /stripe for a payment at all.
 */

let isDemo = false;
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isDemo }) }));

const intentCalls: { id: number | null; enabled: boolean | undefined }[] = [];
let intentState: { isLoading: boolean; isError: boolean; error: unknown; data: unknown } = {
  isLoading: false,
  isError: false,
  error: null,
  data: undefined,
};
vi.mock("@/features/queries", () => ({
  useInvoice: () => ({ isPending: false, data: undefined }),
  // The files the organization shared on the bill (none here).
  useInvoiceFiles: () => ({ isPending: false, data: [] }),
  useInvoicePaymentIntent: (id: number | null, opts?: { enabled?: boolean }) => {
    intentCalls.push({ id, enabled: opts?.enabled });
    return intentState;
  },
}));
vi.mock("@/lib/stripe", () => ({ getStripeForAccount: () => null }));
vi.mock("@/components/billing/stripe-appearance", () => ({ useIsDark: () => false, stripeAppearance: () => ({}) }));
// The panel's portal and docking are not what is under test.
vi.mock("@/components/detail-panel", () => ({
  DetailPanel: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

const { MemberInvoiceSheet } = await import("./member-invoice-sheet");
const { PayInvoiceDialog } = await import("./pay-invoice-dialog");
const { ApiError } = await import("@/lib/api");

const unpaid = { id: 501, total: 14330, createdAt: "2026-09-20T12:00:00.000Z", paidAt: null, voidedAt: null, items: [] } as unknown as Invoice;

afterEach(() => {
  cleanup();
  isDemo = false;
  intentCalls.length = 0;
  intentState = { isLoading: false, isError: false, error: null, data: undefined };
});

describe("the invoice sheet's Pay", () => {
  it("pays normally outside the demo", () => {
    render(<MemberInvoiceSheet invoice={unpaid} open onOpenChange={() => {}} onPay={() => {}} />);
    expect(screen.getByRole("button", { name: /Pay \$143\.30/ }).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText("Paying is turned off in the demo.")).toBeNull();
  });

  it("is off in the demo, with one line saying so", () => {
    isDemo = true;
    const onPay = vi.fn();
    render(<MemberInvoiceSheet invoice={unpaid} open onOpenChange={() => {}} onPay={onPay} />);
    const pay = screen.getByRole("button", { name: /Pay \$143\.30/ });
    expect(pay.hasAttribute("disabled")).toBe(true);
    pay.click();
    expect(onPay).not.toHaveBeenCalled();
    expect(screen.getByTestId("invoice-pay-note").textContent).toBe("Paying is turned off in the demo.");
  });
});

describe("the pay dialog", () => {
  it("asks /stripe for a payment outside the demo", () => {
    render(<PayInvoiceDialog invoice={unpaid} open onOpenChange={() => {}} />);
    expect(intentCalls.at(-1)).toEqual({ id: 501, enabled: true });
  });

  it("never asks /stripe in the demo, and says why", () => {
    isDemo = true;
    render(<PayInvoiceDialog invoice={unpaid} open onOpenChange={() => {}} />);
    expect(intentCalls.every((c) => c.enabled === false)).toBe(true);
    expect(screen.getByText("Paying is turned off in the demo.")).toBeTruthy();
    expect(screen.queryByText(/may not have online payments/)).toBeNull();
  });

  it("drops the online-payments advice when the demo guard refuses", () => {
    intentState = {
      isLoading: false,
      isError: true,
      error: new ApiError(403, "Payments are turned off in the demo.", { code: "DEMO_BLOCKED" }),
      data: undefined,
    };
    render(<PayInvoiceDialog invoice={unpaid} open onOpenChange={() => {}} />);
    expect(screen.getByText("Payments are turned off in the demo.")).toBeTruthy();
    expect(screen.queryByText(/may not have online payments/)).toBeNull();
  });

  it("keeps the advice for an organization that cannot take payments", () => {
    intentState = {
      isLoading: false,
      isError: true,
      error: new ApiError(400, "Online payments are not set up.", { message: "Online payments are not set up." }),
      data: undefined,
    };
    render(<PayInvoiceDialog invoice={unpaid} open onOpenChange={() => {}} />);
    expect(screen.getByText(/may not have online payments enabled yet\. Reach out/)).toBeTruthy();
  });
});
