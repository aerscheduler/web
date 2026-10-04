// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkOrder, WorkOrderItem } from "@/types/api";

/**
 * What adding or rewording an item tells the desk (Tony, 2026-10-01): "Notify owner" only where
 * the job's own Send to owner is offered (a customer's aircraft, an open job, no live invoice);
 * "these" when it would send more than the one just added; and a reworded finding the owner was
 * asked about is asked again, so the desk is told to send it again.
 */

const add = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const update = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
const cached = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/features/queries", () => ({
  useAddWorkOrderItem: () => ({ mutateAsync: add.mutateAsync, isPending: false }),
  useUpdateWorkOrderItem: () => ({ mutateAsync: update.mutateAsync, isPending: false }),
  useMaintenanceReminders: () => ({ data: [] }),
  useSquawks: () => ({ data: [] }),
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ getQueryData: () => cached.items }),
}));
vi.mock("@/features/send-to-owner", () => ({ sendFindingsToOwner: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/components/combobox", () => ({ Combobox: () => null }));
// Who raised it: a plain select, so a test can pick "found" without driving Radix.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <select aria-label="Who raised it" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="requested">requested</option>
      <option value="found">found</option>
      {children ? null : null}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}));
vi.mock("@/components/responsive-modal", () => ({
  ResponsiveModal: ({ children, footer }: { children?: React.ReactNode; footer?: React.ReactNode }) => (
    <div>
      {children}
      {footer}
    </div>
  ),
}));

const { WorkOrderItemModal } = await import("./work-order-item-modal");

const job = (over: Partial<WorkOrder> = {}) =>
  ({ id: 7, label: "WO-1525", closedAt: null, invoice: null, aircraft: { id: 1, use: "shop" }, ...over }) as unknown as WorkOrder;
const finding = (over: Partial<WorkOrderItem> = {}) =>
  ({ id: 21, source: "found", description: "Cracked exhaust", decision: null, done: false, sentToOwnerAt: null, ...over }) as unknown as WorkOrderItem;

async function addFinding(w: WorkOrder) {
  render(<WorkOrderItemModal workOrder={w} open onOpenChange={() => undefined} defaultSource="found" />);
  fireEvent.change(screen.getByLabelText("The work"), { target: { value: "Chafed wire" } });
  fireEvent.click(screen.getByRole("button", { name: "Add item" }));
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
  return toast.success.mock.calls[0] as [string, { description?: string; action?: { label: string } }?];
}

beforeEach(() => {
  add.mutateAsync.mockReset().mockResolvedValue({});
  update.mutateAsync.mockReset().mockResolvedValue({});
  toast.success.mockReset();
  cached.items = [];
});
afterEach(cleanup);

describe("adding a finding", () => {
  it("offers Notify owner on an open customer job, saying 'it' for the one finding", async () => {
    const [title, opts] = await addFinding(job());
    expect(title).toBe("Finding added");
    expect(opts?.action?.label).toBe("Notify owner");
    expect(opts?.description).toBe("The owner won't see it until you send it.");
  });

  it("says 'these' when Notify owner would send others not sent yet as well", async () => {
    cached.items = [finding()];
    const [, opts] = await addFinding(job());
    expect(opts?.description).toBe("The owner won't see these until you send them.");
  });

  it("offers nothing to send on an invoiced job, the organization's own aircraft, or a closed job", async () => {
    for (const w of [job({ invoice: { id: 1 } as WorkOrder["invoice"] }), job({ aircraft: { id: 1, use: "fleet" } as WorkOrder["aircraft"] }), job({ closedAt: "2026-10-01T00:00:00Z" })]) {
      toast.success.mockReset();
      const [title, opts] = await addFinding(w);
      expect(title).toBe("Found item added");
      expect(opts).toBeUndefined();
      cleanup();
    }
  });
});

describe("rewording", () => {
  async function reword(item: WorkOrderItem, text: string, w: WorkOrder = job()) {
    render(<WorkOrderItemModal workOrder={w} open onOpenChange={() => undefined} editing={item} />);
    fireEvent.change(screen.getByLabelText("The work"), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    return toast.success.mock.calls[0][0] as string;
  }

  it("tells the desk to send a finding the owner was asked about again", async () => {
    expect(await reword(finding({ sentToOwnerAt: "2026-10-01T10:00:00Z" }), "Cracked exhaust stack")).toBe(
      "Reworded. Send it to the owner again: their answer was for the old wording."
    );
  });

  it("just saves a finding not sent yet, the same words, or one already done", async () => {
    expect(await reword(finding(), "Cracked exhaust stack")).toBe("Item saved");
    cleanup();
    toast.success.mockReset();
    expect(await reword(finding({ decision: "approved" }), "Cracked exhaust")).toBe("Item saved");
    cleanup();
    toast.success.mockReset();
    expect(await reword(finding({ decision: "approved", done: true }), "Cracked exhaust stack")).toBe("Item saved");
  });

  it("just saves on an invoiced or closed job, where the owner's answer stands (C3)", async () => {
    for (const w of [job({ invoice: { id: 1 } as WorkOrder["invoice"] }), job({ closedAt: "2026-10-01T00:00:00Z" })]) {
      toast.success.mockReset();
      expect(await reword(finding({ decision: "approved", sentToOwnerAt: "2026-10-01T10:00:00Z" }), "Replaced left brake disc", w)).toBe("Item saved");
      cleanup();
    }
  });
});
