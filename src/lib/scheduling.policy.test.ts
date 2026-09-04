import { describe, expect, it } from "vitest";

import {
  filterToStartIncrement,
  fixedEndAcrossDays,
  fixedEndInWindow,
  startOptions,
  windowsForDay,
  type Window,
} from "./scheduling";

/**
 * The two shared calendar rules the time picker enforces itself.
 *
 * These are not decoration. The server refuses an off-grid start and a wrong-length
 * booking outright, so anything these functions let through and the picker then offers is
 * a form whose only feedback is a rejection at Save. The cases below are the ones that
 * were reasoned about while writing them: the grid measured in a ZONE rather than in UTC,
 * a fixed length that does not fit the tail of a free window, and a fixed length longer
 * than the day it starts in.
 */

/** A UTC instant, for readability in the fixtures below. */
const at = (iso: string) => new Date(iso);

/** Minutes past midnight in a fixed-offset zone, the shape the picker injects. */
const minuteOfDayAtOffset = (offsetHours: number) => (instant: Date) => {
  const shifted = new Date(instant.getTime() + offsetHours * 3_600_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};

describe("filterToStartIncrement", () => {
  const marks = [
    at("2026-09-10T14:00:00Z"),
    at("2026-09-10T14:15:00Z"),
    at("2026-09-10T14:30:00Z"),
    at("2026-09-10T14:45:00Z"),
    at("2026-09-10T15:00:00Z"),
  ];
  const utcMinuteOfDay = minuteOfDayAtOffset(0);

  it("keeps every mark when the rule is off", () => {
    expect(filterToStartIncrement(marks, null, utcMinuteOfDay)).toHaveLength(5);
    expect(filterToStartIncrement(marks, undefined, utcMinuteOfDay)).toHaveLength(5);
  });

  it("treats a non-positive increment as off rather than dividing by it", () => {
    expect(filterToStartIncrement(marks, 0, utcMinuteOfDay)).toHaveLength(5);
    expect(filterToStartIncrement(marks, -30, utcMinuteOfDay)).toHaveLength(5);
  });

  it("keeps the half hours on a 30 minute grid", () => {
    const kept = filterToStartIncrement(marks, 30, utcMinuteOfDay);
    expect(kept.map((d) => d.toISOString())).toEqual([
      "2026-09-10T14:00:00.000Z",
      "2026-09-10T14:30:00.000Z",
      "2026-09-10T15:00:00.000Z",
    ]);
  });

  it("keeps only the hour on a 60 minute grid", () => {
    const kept = filterToStartIncrement(marks, 60, utcMinuteOfDay);
    expect(kept.map((d) => d.toISOString())).toEqual([
      "2026-09-10T14:00:00.000Z",
      "2026-09-10T15:00:00.000Z",
    ]);
  });

  /**
   * The grid is measured from midnight AT THE FIELD, not from midnight UTC. A whole-hour
   * zone shifts which instants are on the hour but not how many, and reading the clock in
   * the wrong zone is exactly the class of bug `lib/timezone.ts` exists to prevent.
   */
  it("measures the grid in the zone it is given", () => {
    const kept = filterToStartIncrement(marks, 60, minuteOfDayAtOffset(-6));
    expect(kept.map((d) => d.toISOString())).toEqual([
      "2026-09-10T14:00:00.000Z",
      "2026-09-10T15:00:00.000Z",
    ]);
  });

  /**
   * A half-hour zone genuinely disagrees with UTC about what "on the hour" is, which is
   * the case that makes injecting the zone load-bearing rather than tidy.
   */
  it("shifts the grid in a half-hour zone", () => {
    const kept = filterToStartIncrement(marks, 60, minuteOfDayAtOffset(5.5));
    expect(kept.map((d) => d.toISOString())).toEqual([
      "2026-09-10T14:30:00.000Z",
    ]);
  });
});

describe("fixedEndInWindow", () => {
  const dayWindows: Window[] = [
    { start: at("2026-09-10T14:00:00Z"), end: at("2026-09-10T16:00:00Z") },
  ];

  it("returns start plus the fixed length when it fits", () => {
    const end = fixedEndInWindow(dayWindows, at("2026-09-10T14:00:00Z"), 90);
    expect(end?.toISOString()).toBe("2026-09-10T15:30:00.000Z");
  });

  it("allows a booking that ends exactly on the window's close", () => {
    const end = fixedEndInWindow(dayWindows, at("2026-09-10T14:30:00Z"), 90);
    expect(end?.toISOString()).toBe("2026-09-10T16:00:00.000Z");
  });

  /**
   * The null is what keeps the start out of the dropdown. Offering 15:00 to a school whose
   * bookings are 90 minutes long, when the aircraft is taken at 16:00, is the refusal this
   * whole change exists to move off the Save button.
   */
  it("refuses a start with no room for the fixed length", () => {
    expect(fixedEndInWindow(dayWindows, at("2026-09-10T15:00:00Z"), 90)).toBeNull();
  });

  it("refuses a start that is not in any free window", () => {
    expect(fixedEndInWindow(dayWindows, at("2026-09-10T18:00:00Z"), 60)).toBeNull();
  });
});

describe("fixedEndAcrossDays", () => {
  const windows: Window[] | null = [
    { start: at("2026-09-10T14:00:00Z"), end: at("2026-09-12T14:00:00Z") },
  ];
  const now = at("2026-09-10T12:00:00Z");

  /**
   * A fixed length may be up to 24 hours, which is longer than the tail of any evening. A
   * multi-day school judging it against the day-clipped windows would find no offerable
   * start at all, so this is the path that keeps booking alive for them.
   */
  it("lets a fixed length run past midnight", () => {
    const end = fixedEndAcrossDays(windows, at("2026-09-10T20:00:00Z"), 1440, now);
    expect(end?.toISOString()).toBe("2026-09-11T20:00:00.000Z");
  });

  it("still refuses a length that runs past the free window", () => {
    expect(
      fixedEndAcrossDays(windows, at("2026-09-12T00:00:00Z"), 1440, now)
    ).toBeNull();
  });

  /** Null windows mean nothing constrains, which must not become "nothing is bookable". */
  it("treats an unconstrained day as open", () => {
    const end = fixedEndAcrossDays(null, at("2026-09-10T20:00:00Z"), 120, now);
    expect(end?.toISOString()).toBe("2026-09-10T22:00:00.000Z");
  });
});

describe("the picker's own composition of the two rules", () => {
  /**
   * What `offerableStarts` in smart-time-range.tsx does, on one ragged window: take the
   * day's marks, drop the off-grid ones, then drop the ones with no room for the fixed
   * length. Pinned here because the ORDER is invisible in the component and getting it
   * wrong offers a start whose end the server refuses.
   */
  it("offers only on-grid starts that can host the fixed length", () => {
    const day = at("2026-09-10T12:00:00Z");
    const now = at("2026-09-10T00:00:00Z");
    const windows: Window[] = [
      { start: at("2026-09-10T14:07:00Z"), end: at("2026-09-10T17:00:00Z") },
    ];

    const dayWindows = windowsForDay(windows, day, now);
    const onGrid = filterToStartIncrement(
      startOptions(dayWindows),
      60,
      minuteOfDayAtOffset(0)
    );
    const offerable = onGrid.filter((s) => fixedEndInWindow(dayWindows, s, 120) != null);

    // 14:07 is not a mark, so the hours on offer are 15:00 and 16:00 (17:00 is the
    // window's close and leaves no room for a booking at all). Only 15:00 then leaves
    // room for two hours before the aircraft is taken.
    expect(onGrid.map((d) => d.toISOString())).toEqual([
      "2026-09-10T15:00:00.000Z",
      "2026-09-10T16:00:00.000Z",
    ]);
    expect(offerable.map((d) => d.toISOString())).toEqual([
      "2026-09-10T15:00:00.000Z",
    ]);
  });
});
