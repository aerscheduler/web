import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { statusOf, statusText } from "./reservation-list-status";

/**
 * The schedule list's status column. Both cases Tony caught in production on 2026-09-30: a
 * flight from last week reading "Not out yet", and a dual flight waiting on the student's PIN
 * reading "Back, not closed out" while the panel beside it said "1 of 2 confirmed".
 */

const START = "2026-09-27T15:00:00.000Z";
const END = "2026-09-27T17:00:00.000Z";
const BEFORE = new Date("2026-09-27T14:00:00.000Z");
const DURING = new Date("2026-09-27T16:00:00.000Z");
const AFTER = new Date("2026-09-28T12:00:00.000Z");

function dual(review: Record<string, unknown> | null = null, extra: Record<string, unknown> = {}): Reservation {
  return {
    id: 1,
    type: "dual",
    cancelledAt: null,
    start: START,
    end: END,
    personnel: { instructors: [{ id: 10 }], students: [{ id: 20 }], renters: [] },
    resource: { id: 1, type: { plane: { id: 1, tailNumber: "N1906V" } } },
    review,
    invoices: [],
    payers: [],
    ...extra,
  } as unknown as Reservation;
}

const OUT = { hobbsTimeOut: 2591, tachTimeOut: 35874 };
const BACK = { ...OUT, hobbsTimeIn: 2605, tachTimeIn: 35885 };

describe("a booking nobody ramped out", () => {
  it("is upcoming before its start, due out during it, never ramped out after it", () => {
    expect(statusOf(dual(), BEFORE)).toBe("upcoming");
    expect(statusOf(dual(), DURING)).toBe("dueOut");
    expect(statusOf(dual(), AFTER)).toBe("neverOut");
    expect(statusText(dual(), "neverOut")).toBe("Never ramped out");
  });

  it("is never recorded, not never ramped out, when it is a ground lesson", () => {
    const ground = dual(null, { type: "ground", resource: { id: 2, type: { room: { id: 2, roomNumber: "Briefing Room" } } } });
    expect(statusOf(ground, AFTER)).toBe("neverRecorded");
    expect(statusText(ground, "neverRecorded")).toBe("Never recorded");
  });
});

describe("out and back", () => {
  it("is out now until its end, overdue after", () => {
    expect(statusOf(dual(OUT), DURING)).toBe("inFlight");
    expect(statusOf(dual(OUT), AFTER)).toBe("overdue");
  });

  it("waits on the pilot who has not signed, and says how many have", () => {
    const r = dual({ ...BACK, reviewConfirmations: [{ id: 1, reviewedBy: { id: 10 } }] });
    expect(statusOf(r, AFTER)).toBe("signoff");
    expect(statusText(r, "signoff")).toBe("Needs sign-off, 1 of 2");
  });

  it("is closed out once everyone has signed", () => {
    const r = dual({
      ...BACK,
      reviewConfirmations: [
        { id: 1, reviewedBy: { id: 10 } },
        { id: 2, reviewedBy: { id: 20 } },
      ],
    });
    expect(statusOf(r, AFTER)).toBe("closed");
  });
});

it("a cancelled booking is cancelled whatever the clock says", () => {
  expect(statusOf(dual(null, { cancelledAt: "2026-09-26T00:00:00.000Z" }), AFTER)).toBe("cancelled");
});
