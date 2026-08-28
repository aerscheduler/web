import { describe, expect, it } from "vitest";
import {
  outstandingHolds,
  outstandingSentence,
  returnToServiceDescription,
} from "@/lib/outstanding-holds";
import type { MaintenanceReminder, Squawk } from "@/types/api";

const squawk = (over: Partial<Squawk>): Squawk =>
  ({
    id: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    resolvedAt: null,
    verifiedAt: null,
    title: "Nosewheel shimmy",
    description: null,
    grounding: false,
    ...over,
  }) as Squawk;

const reminder = (status: string | null): MaintenanceReminder =>
  ({
    id: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    resolvedAt: null,
    startedAt: null,
    startHours: null,
    completedAt: null,
    notes: null,
    due: status ? ({ status } as MaintenanceReminder["due"]) : undefined,
  }) as MaintenanceReminder;

describe("outstandingHolds", () => {
  it("is empty when nothing is holding the aircraft", () => {
    expect(outstandingHolds({ reminders: [], squawks: [] })).toEqual([]);
    expect(outstandingHolds({})).toEqual([]);
  });

  it("counts only overdue inspections, not upcoming or current ones", () => {
    const reminders = [reminder("overdue"), reminder("due"), reminder("ok"), reminder(null)];
    expect(outstandingHolds({ reminders })).toEqual(["1 inspection overdue"]);
  });

  // The distinction the whole feature turns on: a discrepancy is not a reason the
  // aeroplane is on the ground, and counting one here tells a mechanic the tail is held by
  // something that was never holding it.
  it("counts only grounding squawks, and only unresolved ones", () => {
    const squawks = [
      squawk({ id: 1, grounding: true }),
      squawk({ id: 2, grounding: false }),
      squawk({ id: 3, grounding: undefined }),
      squawk({ id: 4, grounding: true, resolvedAt: "2026-08-02T00:00:00.000Z" }),
    ];
    expect(outstandingHolds({ squawks })).toEqual(["1 grounding squawk open"]);
  });

  it("pluralises each side independently", () => {
    expect(
      outstandingHolds({
        reminders: [reminder("overdue"), reminder("overdue")],
        squawks: [squawk({ grounding: true })],
      })
    ).toEqual(["2 inspections overdue", "1 grounding squawk open"]);
  });
});

describe("the sentences the two surfaces show", () => {
  it("says nothing at all when nothing is open", () => {
    expect(outstandingSentence([])).toBe("");
  });

  it("joins both holds into one sentence for the banner", () => {
    expect(outstandingSentence(["2 inspections overdue", "1 grounding squawk open"])).toBe(
      "2 inspections overdue and 1 grounding squawk open on this aircraft."
    );
  });

  // Releasing over the top of an open hold is allowed; doing it unknowingly is not.
  it("tells the confirm what is being overridden", () => {
    expect(returnToServiceDescription(["1 inspection overdue"])).toBe(
      "1 inspection overdue on this aircraft. It will be schedulable again anyway."
    );
  });

  it("gives a plain all-clear when nothing is open", () => {
    expect(returnToServiceDescription([])).toBe(
      "Nothing is outstanding on this aircraft. It will be schedulable again."
    );
  });
});
