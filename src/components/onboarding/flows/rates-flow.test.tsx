// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Review round 2 (2026-10-12): the instruction-rate flow saved an unreadable rate ("12.345",
 * "1.250") as $0.00 an hour, because the money field reported 0 for text it could not read.
 * The field now reports nothing and says it is unreadable; Save rate waits until it reads.
 */

const created = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => ({})) }));
vi.mock("@/features/queries", () => ({
  useCreateRating: () => ({ mutateAsync: created.mutateAsync, isPending: false }),
}));
// A dialog behind a media query, and jsdom has no matchMedia.
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({ children, footer }: { children?: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

const { RatesFlow } = await import("./rates-flow");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const saveButton = () => screen.getByRole("button", { name: /Save rate/ }) as HTMLButtonElement;
const rateBox = () => screen.getByLabelText("Instructor rate, per hour") as HTMLInputElement;

describe("RatesFlow with an unreadable rate", () => {
  it("disables Save rate while the rate is unreadable and saves nothing", () => {
    render(<RatesFlow onClose={() => {}} />);
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(rateBox(), { target: { value: "12.345" } });
    expect(rateBox().getAttribute("aria-invalid")).toBe("true");
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(saveButton());
    expect(created.mutateAsync).not.toHaveBeenCalled();
  });

  it("saves the amount once it reads, never a fake 0", () => {
    render(<RatesFlow onClose={() => {}} />);
    fireEvent.change(rateBox(), { target: { value: "1.250" } });
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(rateBox(), { target: { value: "72,50" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    expect(created.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ defaultInstructorRate: 7_250 }));
  });

  it("keeps an emptied rate meaning $0.00, as before", () => {
    render(<RatesFlow onClose={() => {}} />);
    fireEvent.change(rateBox(), { target: { value: "" } });
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    expect(created.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ defaultInstructorRate: 0 }));
  });
});
