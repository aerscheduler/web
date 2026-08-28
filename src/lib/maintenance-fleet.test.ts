import { describe, expect, it } from "vitest";
import { fleetSummary, fleetTotals } from "@/lib/maintenance";
import type { MaintenanceReminder } from "@/types/api";

const reminder = (status: string, resolvedAt: string | null = null): MaintenanceReminder =>
  ({
    id: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    resolvedAt,
    startedAt: null,
    startHours: null,
    completedAt: null,
    notes: null,
    due: { status } as MaintenanceReminder["due"],
  }) as MaintenanceReminder;

const entry = (reminders: MaintenanceReminder[], grounded = false) => ({
  grounded,
  summary: fleetSummary(reminders),
});

describe("fleetTotals", () => {
  it("an empty fleet is all zeroes, not a crash", () => {
    const t = fleetTotals([]);
    expect(t.tails).toBe(0);
    expect(t.allClear).toBe(true);
  });

  // The distinction the summary line exists to draw: nobody checked this aircraft, which
  // is not the same as checking it and finding nothing wrong.
  it("a tail with no reminders counts as not tracked, never as current", () => {
    const t = fleetTotals([entry([])]);
    expect(t.untracked).toBe(1);
    expect(t.current).toBe(0);
    expect(t.allClear).toBe(false);
  });

  it("the four states are worst-first and mutually exclusive", () => {
    const t = fleetTotals([
      entry([reminder("overdue"), reminder("dueSoon")]),
      entry([reminder("dueSoon"), reminder("ok")]),
      entry([reminder("ok")]),
      entry([]),
    ]);
    expect(t).toMatchObject({ overdue: 1, dueSoon: 1, current: 1, untracked: 1 });
    // Every tail lands in exactly one bucket, so the breakdown adds up to the fleet.
    expect(t.overdue + t.dueSoon + t.current + t.untracked).toBe(t.tails);
  });

  // Grounded is orthogonal: a tail is off the line for reasons that have nothing to do
  // with an inspection, so it is counted alongside, not instead of.
  it("grounded counts on top of whatever the tail owes", () => {
    const t = fleetTotals([
      entry([reminder("overdue")], true),
      entry([reminder("ok")], true),
    ]);
    expect(t).toMatchObject({ grounded: 2, overdue: 1, current: 1 });
    expect(t.allClear).toBe(false);
  });

  it("resolved reminders do not keep a tail looking tracked", () => {
    const t = fleetTotals([entry([reminder("overdue", "2026-01-01T00:00:00.000Z")])]);
    expect(t).toMatchObject({ untracked: 1, overdue: 0 });
  });

  it("a clean, fully tracked fleet reads as all clear", () => {
    const t = fleetTotals([entry([reminder("ok")]), entry([reminder("ok")])]);
    expect(t).toMatchObject({ current: 2, allClear: true });
  });
});
