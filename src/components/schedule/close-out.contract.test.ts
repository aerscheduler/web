import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { hasInstruction, isRampedIn, isRampedOut, usesBriefingNotMeters } from "./close-out";

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
}): Reservation {
  const resource =
    over.resource === "plane"
      ? { id: 1, type: { plane: { id: 1, tailNumber: "N172TS" } } }
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
