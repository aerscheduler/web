// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Review round 2 (2026-10-12): the floor and the charge were number inputs, where a browser
 * turns "25,00" into an empty value, so a euro member's floor saved as none with nothing on
 * screen to say so. They are text now, read by parseMoneyInput, and Save waits on unreadable text.
 */

const saved = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => ({})) }));
// One object for every render: the card re-seeds its fields whenever the row changes identity.
const row = vi.hoisted(() => ({
  enabled: true,
  mode: "under_threshold",
  thresholdCents: 20_000,
  chargeCents: 15_000,
  cadence: "daily",
  monthlyDay: 1,
  pausedReason: null,
}));
vi.mock("@/features/queries", () => ({
  useLedgerAutoRefill: () => ({ isPending: false, data: row }),
  useUpdateLedgerAutoRefill: () => ({ mutateAsync: saved.mutateAsync, isPending: false }),
}));
vi.mock("@/components/docs-hint", () => ({ DocsHint: () => null }));

// Radix Switch measures its thumb on mount; jsdom ships no ResizeObserver.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof globalThis.ResizeObserver;
}

const { AutoRefillCard } = await import("./auto-refill-card");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const saveButton = () => screen.getByRole("button", { name: /Save auto-refill/ }) as HTMLButtonElement;
const floor = () => screen.getByLabelText("When balance is under") as HTMLInputElement;
const charge = () => screen.getByLabelText("Charge") as HTMLInputElement;

describe("AutoRefillCard amounts", () => {
  it("reads a decimal comma: 25,00 saves 2500, not none", () => {
    render(<AutoRefillCard orgUserId={7} />);
    expect(floor().type).toBe("text");
    fireEvent.change(floor(), { target: { value: "25,00" } });
    fireEvent.click(saveButton());
    expect(saved.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ thresholdCents: 2_500, chargeCents: 15_000 }));
  });

  it("disables Save while an amount is unreadable, and explains on the field", () => {
    render(<AutoRefillCard orgUserId={7} />);
    fireEvent.change(charge(), { target: { value: "1.250" } });
    expect(charge().getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Enter an amount like/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(saved.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps an emptied field meaning none", () => {
    render(<AutoRefillCard orgUserId={7} />);
    fireEvent.change(floor(), { target: { value: "" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    expect(saved.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ thresholdCents: null }));
  });
});
