// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LedgerBlock } from "@/types/api";

/**
 * The prepaid block editor (Settings, Billing). Save stays disabled until the block is one the
 * server would take, and the bonus line does the arithmetic live.
 */

const create = vi.hoisted(() => ({ mutate: vi.fn() }));
const update = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/features/queries", () => ({
  useCreateLedgerBlock: () => ({ mutate: create.mutate, isPending: false }),
  useUpdateLedgerBlock: () => ({ mutate: update.mutate, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// A dialog behind a media query, and jsdom has no matchMedia: the fields are what is under test.
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({ children, footer, title }: { children?: React.ReactNode; footer?: React.ReactNode; title?: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  ),
}));

const { BlockEditor } = await import("./prepaid-blocks-card");

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
/** Said under the field (the same words are also read with the disabled Save). */
const fieldError = (text: string) =>
  screen.getAllByText(text).some((el) => el.tagName === "P" && el.className.includes("text-destructive"));
const save = () => screen.getByRole("button", { name: /Add block|Save block/ });

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
});
afterEach(cleanup);

describe("the block editor", () => {
  it("refuses credit below the price, with the reason under the field", () => {
    render(<BlockEditor block={null} onClose={() => {}} />);
    type("Name", "10-hour block");
    type("Member pays", "1800");
    type("Credit added", "1700");
    expect(save().hasAttribute("disabled")).toBe(true);
    expect(fieldError("Credit added has to be at least what the member pays.")).toBe(true);
    expect(screen.queryByTestId("block-bonus-line")).toBeNull();
    fireEvent.click(save());
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it("refuses a price under 1.00", () => {
    render(<BlockEditor block={null} onClose={() => {}} />);
    type("Name", "Tiny");
    type("Member pays", "0.50");
    type("Credit added", "1");
    expect(save().hasAttribute("disabled")).toBe(true);
    expect(fieldError("The member pays at least $1.00.")).toBe(true);
    expect(screen.queryByTestId("block-bonus-line")).toBeNull();
  });

  it("shows the bonus live and saves the block in cents", () => {
    render(<BlockEditor block={null} onClose={() => {}} />);
    type("Name", " 10-hour block ");
    type("Member pays", "1700");
    type("Credit added", "1800");
    const line = screen.getByTestId("block-bonus-line").textContent;
    expect(line).toContain("+$100.00");
    expect(line).toContain("(5.9% extra)");
    expect(save().hasAttribute("disabled")).toBe(false);
    fireEvent.click(save());
    expect(create.mutate).toHaveBeenCalledWith(
      { name: "10-hour block", description: null, priceCents: 170_000, creditCents: 180_000 },
      expect.anything()
    );
  });

  it("edits an existing block through PATCH", () => {
    const block: LedgerBlock = {
      id: 9,
      name: "5-hour block",
      description: "Five hours",
      priceCents: 90_000,
      creditCents: 95_000,
      bonusCents: 5_000,
      active: true,
      archivedAt: null,
      sortOrder: 0,
      purchaseCount: 2,
    };
    render(<BlockEditor block={block} onClose={() => {}} />);
    expect(screen.getByTestId("block-bonus-line").textContent).toContain("+$50.00");
    type("Credit added", "1000");
    fireEvent.click(save());
    expect(update.mutate).toHaveBeenCalledWith(
      { id: 9, name: "5-hour block", description: "Five hours", priceCents: 90_000, creditCents: 100_000 },
      expect.anything()
    );
  });
});
