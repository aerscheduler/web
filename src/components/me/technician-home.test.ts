import { describe, expect, it } from "vitest";
import { maintenanceQueue } from "@/components/me/technician-home";
import type { MaintenanceDue, MaintenanceReminder, Squawk } from "@/types/api";

/**
 * The technician Home's queue reads in the phone's order (overdue inspections, grounding squawks,
 * new squawks, inspections coming due, verified squawks) and breaks ties the way the Inspections
 * board does, so the two never list the same items in a different order.
 */
const inspection = (id: number, status: MaintenanceDue["status"], name: string, urgency = 0) =>
  ({ id, createdAt: "2026-08-01T00:00:00.000Z", resolvedAt: null, startedAt: null, startHours: null, completedAt: null, completedHours: null, notes: null, due: { status, name, urgency } as MaintenanceDue }) as MaintenanceReminder;

const squawk = (id: number, title: string, extra: Partial<Squawk> = {}) =>
  ({ id, title, createdAt: `2026-10-0${id % 9}T12:00:00.000Z`, resolvedAt: null, verifiedAt: null, description: null, ...extra }) as Squawk;

const order = (q: ReturnType<typeof maintenanceQueue>) => q.map((e) => (e.kind === "squawk" ? `s${e.s.id}` : `r${e.r.id}`));

describe("technician Home maintenance queue", () => {
  it("puts overdue inspections, then grounding squawks, then new squawks, then due soon, then verified", () => {
    const q = maintenanceQueue(
      [squawk(1, "Verified", { verifiedAt: "2026-10-02T00:00:00.000Z" }), squawk(2, "New"), squawk(3, "Grounding", { grounding: true })],
      [inspection(10, "dueSoon", "Annual", 0.8), inspection(11, "overdue", "VOR check")]
    );
    expect(order(q)).toEqual(["r11", "s3", "s2", "r10", "s1"]);
  });

  it("orders inspections by urgency, then by name like the board", () => {
    const q = maintenanceQueue(
      [],
      [inspection(1, "overdue", "VOR check"), inspection(2, "overdue", "Prop back from the shop"), inspection(3, "overdue", "ELT inspection", 0.38)]
    );
    expect(order(q)).toEqual(["r2", "r1", "r3"]);
  });

  it("lists the newest squawk first within a rank", () => {
    const q = maintenanceQueue([squawk(1, "Older"), squawk(4, "Newer")], []);
    expect(order(q)).toEqual(["s4", "s1"]);
  });
});
