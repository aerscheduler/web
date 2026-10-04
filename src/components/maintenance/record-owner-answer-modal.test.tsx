// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordOwnerAnswerResult, WorkOrder, WorkOrderItem } from "@/types/api";

/**
 * Recording a call (C7, Tony 2026-10-01). The When box shows the minute, and sending that minute
 * put the call BEFORE an answer the owner gave in AerScheduler seconds earlier: the server kept
 * theirs and the desk's answer silently did not land. Left alone, When is not sent and the server
 * stamps the call as it is recorded; whatever a later call already answered is said, not hidden.
 */

const record = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/features/queries", () => ({
  useRecordOwnerAnswer: () => ({ mutateAsync: record.mutateAsync, isPending: false }),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
// A dialog behind a media query, and jsdom has no matchMedia: the fields are what is under test.
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({ children, footer, title, description }: { children?: React.ReactNode; footer?: React.ReactNode; title?: React.ReactNode; description?: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      {footer}
    </div>
  ),
}));

const { RecordOwnerAnswerModal } = await import("./record-owner-answer-modal");

const job = { id: 7, label: "WO-1525", billTo: { id: 3, name: "Karen Lindqvist", external: true, contactEmail: null } } as unknown as WorkOrder;
const item = (id: number, description: string): WorkOrderItem =>
  ({ id, description, source: "found", decision: null, position: id, done: false, sentToOwnerAt: "2026-10-01T10:00:00Z" }) as unknown as WorkOrderItem;
const items = [item(11, "Cracked exhaust stack"), item(12, "Worn brake pads")];

function open() {
  render(<RecordOwnerAnswerModal workOrder={job} items={items} open onOpenChange={() => undefined} />);
  fireEvent.click(screen.getByRole("radiogroup", { name: "Answer for Cracked exhaust stack" }).querySelector('[role="radio"]')!);
}

beforeEach(() => {
  record.mutateAsync.mockReset();
  toast.success.mockReset();
  toast.warning.mockReset();
});
afterEach(cleanup);

describe("recording the owner's answer", () => {
  it("sends no time when nobody changed When, so the server stamps the call as it is recorded", async () => {
    record.mutateAsync.mockResolvedValue({ id: 1, applied: [11], kept: [] } satisfies RecordOwnerAnswerResult);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Record answer" }));
    await vi.waitFor(() => expect(record.mutateAsync).toHaveBeenCalled());
    expect(record.mutateAsync.mock.calls[0][0]).toMatchObject({ workOrderId: 7, contactName: "Karen Lindqvist", contactedAt: undefined, decisions: [{ itemId: 11, decision: "approved" }] });
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith("Owner's answer recorded"));
  });

  it("sends the time the desk typed, as an instant", async () => {
    record.mutateAsync.mockResolvedValue({ id: 1, applied: [11], kept: [] } satisfies RecordOwnerAnswerResult);
    open();
    fireEvent.change(screen.getByLabelText("When"), { target: { value: "2026-09-30T09:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Record answer" }));
    await vi.waitFor(() => expect(record.mutateAsync).toHaveBeenCalled());
    expect(record.mutateAsync.mock.calls[0][0].contactedAt).toBe(new Date("2026-09-30T09:15").toISOString());
  });

  it("says which answer a later call kept, instead of reporting it recorded", async () => {
    record.mutateAsync.mockResolvedValue({ id: 1, applied: [], kept: [{ itemId: 11, description: "Cracked exhaust stack" }] } satisfies RecordOwnerAnswerResult);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Record answer" }));
    await vi.waitFor(() => expect(toast.warning).toHaveBeenCalledWith("Recorded the call; kept the later answer for Cracked exhaust stack"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("no longer tells the desk the owner never logs in: an owner who signed in answers on their own", () => {
    render(<RecordOwnerAnswerModal workOrder={job} items={items} open onOpenChange={() => undefined} />);
    expect(screen.queryByText(/does not log in/)).toBeNull();
    expect(screen.getByText(/your record of the call/)).toBeTruthy();
  });
});
