import { describe, expect, it } from "vitest";
import { dueBand, inspectionSentence } from "@/components/maintenance/inspection-list";
import { dueAmount, fleetSummary } from "@/lib/maintenance";
import type { MaintenanceDue, MaintenanceReminder } from "@/types/api";

/**
 * Murray spec 5's Not applicable, as the lists read it: its own band whatever the clocks say, the
 * reason in place of the countdown, and never the inspection a tail's row names as next.
 */
const due = (status: MaintenanceDue["status"], extra: Partial<MaintenanceDue> = {}) =>
  ({ status, kind: "days", daysRemaining: -15, dueAt: "2026-09-20T00:00:00.000Z", urgency: status === "notApplicable" ? 4 : 0, ...extra }) as MaintenanceDue;

const reminder = (d: MaintenanceDue, extra: Partial<MaintenanceReminder> = {}) =>
  ({ id: 1, createdAt: "2026-08-01T00:00:00.000Z", resolvedAt: null, startedAt: null, startHours: null, completedAt: null, completedHours: null, notes: null, due: d, ...extra }) as MaintenanceReminder;

describe("not applicable in the lists", () => {
  it("has its own band and figure, not overdue", () => {
    expect(dueBand(due("notApplicable"))).toBe("notApplicable");
    expect(dueAmount(due("notApplicable"))).toBe("Not applicable");
    expect(dueBand(due("overdue"))).toBe("overdue");
  });

  it("says the shop's reason instead of the countdown", () => {
    expect(inspectionSentence(reminder(due("notApplicable"), { notApplicableReason: " VFR only " }))).toBe("VFR only");
    expect(inspectionSentence(reminder(due("notApplicable")))).toMatch(/^Not applicable to this aircraft\./);
  });

  it("is never the tail's next inspection, and counts as neither overdue nor due soon", () => {
    const s = fleetSummary([reminder(due("notApplicable")), reminder(due("ok", { daysRemaining: 40, urgency: 2.5 }), { id: 2 })]);
    expect(s.next?.id).toBe(2);
    expect(s.overdue).toBe(0);
    expect(fleetSummary([reminder(due("notApplicable"))]).next).toBeNull();
  });
});
