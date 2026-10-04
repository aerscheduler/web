// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Update times in the public demo. The demo refuses uploads, so a photo picked there would be
 * lost after the reading saved. No photo picker in the demo, and no file name sent.
 */

let isDemo = false;
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ isDemo, roles: [] }) }));

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/features/queries", () => ({
  useMeterLog: () => ({ isPending: false, data: [] }),
  useRecordMeterReading: () => ({ mutateAsync, isPending: false }),
  useOwnerRecordTimes: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => async () => false }));
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

const { RecordMeterReadingModal } = await import("./aircraft-meters-card");

function open() {
  render(
    <RecordMeterReadingModal
      open
      onOpenChange={() => {}}
      resourceId={9}
      current={{ hobbsTime: 41200, tachTime: 39010 }}
      asOwner
      title="Update N4521J's times"
    />
  );
}

afterEach(() => {
  cleanup();
  isDemo = false;
  mutateAsync.mockReset();
});

describe("the owner's Update times sheet", () => {
  it("offers a photo of the meter outside the demo", () => {
    open();
    expect(screen.getByRole("button", { name: "Add a photo of the meter" })).toBeTruthy();
    expect(screen.getByTestId("meter-photo-input")).toBeTruthy();
  });

  it("has no photo picker in the demo, and records the times without one", async () => {
    isDemo = true;
    mutateAsync.mockResolvedValue({ uploadError: null, appliedToAircraft: true });
    open();
    expect(screen.queryByRole("button", { name: "Add a photo of the meter" })).toBeNull();
    expect(screen.queryByTestId("meter-photo-input")).toBeNull();
    fireEvent.change(screen.getByLabelText("Hobbs"), { target: { value: "4125.0" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ hobbsTime: 41250, photo: null });
  });
});
