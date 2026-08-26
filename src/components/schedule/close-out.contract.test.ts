import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { billsOnHobbs, hasInstruction, isRampedIn, isRampedOut, readsMeters, usesBriefingNotMeters } from "./close-out";

/**
 * THE CLOSE-OUT CONTRACT, console side.
 *
 * The same table is asserted on the server (`server/test/unit/closeOutContract.test.ts`,
 * which is the authority) and in the app (`app/test/close_out_contract_test.dart`).
 *
 * Three codebases derive where a flight is, and they disagreed on a real booking: a ground
 * lesson in a room with students and NO instructor read "Ready to complete" on the phone
 * while this console waited for an instruction time that was never coming. The server settles
 * it, because `reviewIsComplete` counts sign-offs and never looks at `briefing`.
 *
 * These are the console's first unit tests. The rules in `close-out.ts` decide what the whole
 * dispatch board shows and had no coverage at all, which is the other half of how this drifted.
 */
const person = (id: number) => ({ id }) as never;

function booking(over: {
  type?: string;
  resource?: "plane" | "room" | null;
  instructors?: number;
  students?: number;
  briefing?: number | null;
  hobbsOut?: number | null;
  hobbsIn?: number | null;
  /** `none` is a glider or a balloon: it flies, and it has nothing to read. */
  meterMode?: string;
  rampedOutAt?: string | null;
  rampedInAt?: string | null;
}): Reservation {
  const resource =
    over.resource === "plane"
      ? {
          id: 1,
          type: {
            plane: {
              id: 1,
              tailNumber: "N172TS",
              meterMode: over.meterMode ?? "hobbs_and_tach",
            },
          },
        }
      : over.resource === "room"
        ? { id: 2, type: { room: { id: 2, roomNumber: "101" } } }
        : null;

  return {
    id: 1,
    type: over.type ?? "dual",
    resource,
    personnel: {
      id: 1,
      instructors: Array.from({ length: over.instructors ?? 0 }, (_, i) => person(10 + i)),
      students: Array.from({ length: over.students ?? 0 }, (_, i) => person(20 + i)),
    },
    review: {
      briefing: over.briefing ?? null,
      hobbsTimeOut: over.hobbsOut ?? null,
      hobbsTimeIn: over.hobbsIn ?? null,
      rampedOutAt: over.rampedOutAt ?? null,
      rampedInAt: over.rampedInAt ?? null,
    },
  } as unknown as Reservation;
}

describe("hasInstruction mirrors the server's payment.ts rule", () => {
  it("an instructor with a student is instruction", () => {
    expect(hasInstruction(booking({ type: "ground", resource: "room", instructors: 1, students: 1 }))).toBe(true);
  });

  it("students with NO instructor are not", () => {
    expect(hasInstruction(booking({ type: "ground", resource: "room", students: 2 }))).toBe(false);
  });

  it("two instructors and no student are not", () => {
    expect(hasInstruction(booking({ type: "ground", resource: "room", instructors: 2 }))).toBe(false);
  });

  it("a guest flight with an instructor is instruction", () => {
    expect(hasInstruction(booking({ type: "guest", resource: "plane", instructors: 1 }))).toBe(true);
  });

  it("an instructor alone is renting, not teaching", () => {
    expect(hasInstruction(booking({ type: "solo", resource: "plane", instructors: 1 }))).toBe(false);
  });
});

describe("usesBriefingNotMeters: nothing to read", () => {
  it("a ground always briefs, whoever is on it", () => {
    expect(usesBriefingNotMeters(booking({ type: "ground", resource: "room", students: 1 }))).toBe(true);
  });

  it("no resource means nothing to read", () => {
    expect(usesBriefingNotMeters(booking({ type: "dual", resource: null, instructors: 1, students: 1 }))).toBe(true);
  });

  it("an aircraft has meters", () => {
    expect(usesBriefingNotMeters(booking({ type: "dual", resource: "plane", instructors: 1, students: 1 }))).toBe(
      false,
    );
  });
});

describe("a glider flies without meters", () => {
  /**
   * THE DISTINCTION THIS WHOLE GROUP EXISTS TO HOLD.
   *
   * A glider is not a classroom. It leaves the ground, it is away, and it comes back, so
   * it keeps every dispatch step; what it does not have is a Hobbs or a tach. Folding it
   * into `usesBriefingNotMeters` would have been one line and would have deleted the
   * ramp-out state, the "in flight" badge and the two timestamps that are the only record
   * of how long it was actually up.
   */
  const glider = (over: Parameters<typeof booking>[0] = {}) =>
    booking({ type: "solo", resource: "plane", students: 1, meterMode: "none", ...over });

  it("still departs, so it is not a briefing-only booking", () => {
    expect(usesBriefingNotMeters(glider())).toBe(false);
  });

  it("has no meters to read", () => {
    expect(readsMeters(glider())).toBe(false);
  });

  it("an ordinary aeroplane still reads meters", () => {
    expect(readsMeters(booking({ type: "solo", resource: "plane", students: 1 }))).toBe(true);
  });

  it("a classroom reads no meters either, by the other route", () => {
    expect(readsMeters(booking({ type: "ground", resource: "room", students: 1 }))).toBe(false);
  });

  it("is not ramped out until it actually leaves", () => {
    expect(isRampedOut(glider())).toBe(false);
  });

  it("is ramped out on the TIMESTAMP, with no reading anywhere", () => {
    const out = glider({ rampedOutAt: "2026-08-26T19:00:00.000Z" });
    expect(isRampedOut(out)).toBe(true);
    expect(isRampedIn(out)).toBe(false);
  });

  it("is ramped in on its timestamp, and never needs a Hobbs", () => {
    const back = glider({
      rampedOutAt: "2026-08-26T19:00:00.000Z",
      rampedInAt: "2026-08-26T19:42:00.000Z",
    });
    expect(isRampedIn(back)).toBe(true);
  });

  it("a glider DUAL is measured the same way, instruction time is extra detail", () => {
    const dual = glider({ type: "dual", instructors: 1, students: 1, briefing: 7 });
    expect(hasInstruction(dual)).toBe(true);
    // No timestamps yet: instruction time alone must not make it look departed, which is
    // what would happen if a glider were treated as briefing-only.
    expect(isRampedOut(dual)).toBe(false);
  });

  it("a metered aeroplane is unaffected: readings still decide", () => {
    const flown = booking({ type: "solo", resource: "plane", students: 1, hobbsOut: 1000, hobbsIn: 1012 });
    expect(isRampedOut(flown)).toBe(true);
    expect(isRampedIn(flown)).toBe(true);
  });
});

describe("the booking the two clients disagreed on", () => {
  const groundNoInstructor = booking({ type: "ground", resource: "room", students: 2, briefing: null });

  it("is ready to sign with no briefing, because there is no instruction to record", () => {
    // THE REGRESSION. This returned false on both, so the console asked for an
    // instruction time on a booking that bills none, and no figure was ever coming.
    expect(hasInstruction(groundNoInstructor)).toBe(false);
    expect(isRampedOut(groundNoInstructor)).toBe(true);
    expect(isRampedIn(groundNoInstructor)).toBe(true);
  });

  it("still waits for the briefing when an instructor IS on it", () => {
    const withInstructor = booking({ type: "ground", resource: "room", instructors: 1, students: 1 });

    expect(isRampedOut(withInstructor)).toBe(false);
    expect(isRampedIn(withInstructor)).toBe(false);
  });

  it("is done once that briefing is recorded", () => {
    const briefed = booking({ type: "ground", resource: "room", instructors: 1, students: 1, briefing: 10 });

    expect(isRampedOut(briefed)).toBe(true);
    expect(isRampedIn(briefed)).toBe(true);
  });
});

describe("a booking with meters is unaffected", () => {
  it("is not ramped out until a reading exists", () => {
    expect(isRampedOut(booking({ type: "dual", resource: "plane", instructors: 1, students: 1 }))).toBe(false);
  });

  it("is ramped out on a Hobbs reading", () => {
    expect(
      isRampedOut(booking({ type: "dual", resource: "plane", instructors: 1, students: 1, hobbsOut: 25000 })),
    ).toBe(true);
  });

  it("is ramped in only once it is back", () => {
    const out = booking({ type: "dual", resource: "plane", instructors: 1, students: 1, hobbsOut: 25000 });
    const back = booking({
      type: "dual",
      resource: "plane",
      instructors: 1,
      students: 1,
      hobbsOut: 25000,
      hobbsIn: 25015,
    });

    expect(isRampedIn(out)).toBe(false);
    expect(isRampedIn(back)).toBe(true);
  });
});

/**
 * WHICH METER THE BOOKING BILLS ON.
 *
 * The server prices a booking off the resource's own `billByHobbsTime` (payment.ts), and a
 * `measured` split then reconciles each pilot's leg against that figure. The console has to
 * agree, or the panel that collects those legs asks for readings off the other meter and the
 * close-out is refused for a mismatch the software invented. Server side:
 * `server/test/unit/pricingResourceKind.test.ts` and `splitInvoicing.test.ts`.
 */
describe("billsOnHobbs mirrors the resource's own setting", () => {
  const withCost = (kind: "plane" | "simulator", billByHobbsTime?: boolean) =>
    ({
      id: 1,
      type: "solo",
      resource: {
        id: 1,
        type:
          kind === "plane"
            ? { plane: { id: 1, tailNumber: "N172TS", ...(billByHobbsTime == null ? {} : { cost: { billByHobbsTime } }) } }
            : { simulator: { id: 1, name: "Redbird", ...(billByHobbsTime == null ? {} : { cost: { billByHobbsTime } }) } },
      },
      personnel: { id: 1, instructors: [], students: [] },
      review: {},
    }) as unknown as Reservation;

  it("reads Hobbs when the aircraft says Hobbs", () => {
    expect(billsOnHobbs(withCost("plane", true))).toBe(true);
  });

  it("reads tach when the aircraft says tach", () => {
    expect(billsOnHobbs(withCost("plane", false))).toBe(false);
  });

  it("reads the simulator's own setting too", () => {
    expect(billsOnHobbs(withCost("simulator", false))).toBe(false);
    expect(billsOnHobbs(withCost("simulator", true))).toBe(true);
  });

  it("defaults to Hobbs, which is the column default", () => {
    // No cost row loaded, or a resource with no rate at all. Never guess tach: a wrong
    // guess here changes which reading the desk is asked for.
    expect(billsOnHobbs(withCost("plane"))).toBe(true);
    expect(billsOnHobbs({ id: 1, type: "ground", resource: null, personnel: {}, review: {} } as unknown as Reservation)).toBe(true);
  });
});
