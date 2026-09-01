import { describe, expect, it } from "vitest";
import { personnelProblemForType, validatePersonnelForType } from "./reservation-shared";

/**
 * The SIDE matters as much as the message.
 *
 * The booking form marks that side's picker `aria-invalid`, which is what scrolls the
 * user to it. An earlier version guessed the side as "the first required side that is
 * empty", which is right only for the missing-somebody cases and wrong for every
 * count-limit one: a "you've added 5 students" message reddened the empty, optional
 * Renter picker and took focus there. These lock the mapping down.
 */

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe("personnelProblemForType", () => {
  it("passes a well-formed booking", () => {
    expect(
      personnelProblemForType("dual", { instructors: people(1), students: people(1) })
    ).toBeNull();
  });

  describe("a missing required side names that side", () => {
    it("dual with no instructor", () => {
      expect(personnelProblemForType("dual", { students: people(1) })).toMatchObject({
        side: "instructors",
      });
    });
    it("dual with no student", () => {
      expect(personnelProblemForType("dual", { instructors: people(1) })).toMatchObject({
        side: "students",
      });
    });
    it("rental with nobody", () => {
      expect(personnelProblemForType("rental", {})).toMatchObject({ side: "renters" });
    });
  });

  describe("a count limit names the side that is OVER, never an empty one", () => {
    it("shared with 5 students points at students, not the empty renters", () => {
      const problem = personnelProblemForType("shared", { students: people(5) });
      expect(problem?.message).toContain("at most 4 students");
      // The regression: renters is empty and listed in requiresAny, so a
      // first-empty-required-side guess picked it and reddened the wrong control.
      expect(problem?.side).toBe("students");
    });

    it("solo with 3 students points at students, not the absent instructor picker", () => {
      const problem = personnelProblemForType("solo", { students: people(3) });
      expect(problem?.side).toBe("students");
    });

    it("dual over the student limit still points at students when both sides are filled", () => {
      // Both required sides are non-empty here, so the old guess produced null and
      // nothing was marked at all.
      const problem = personnelProblemForType("dual", {
        instructors: people(1),
        students: people(5),
      });
      expect(problem?.message).toContain("at most 4");
      expect(problem?.side).toBe("students");
    });
  });

  it("an exclusivity error names no side, because two of them are the problem", () => {
    const problem = personnelProblemForType("solo", {
      instructors: people(1),
      students: people(1),
    });
    expect(problem?.message).toContain("one pilot");
    // Nothing to point at: the fix is to remove somebody or change the type, and the
    // form must not redden an arbitrary picker instead.
    expect(problem?.side).toBeNull();
  });

  it("a disallowed side names that side", () => {
    const problem = personnelProblemForType("maintenance", { students: people(1) });
    expect(problem?.side).toBe("students");
  });

  it("requiresAny with nobody assigned points at the first offered side", () => {
    const problem = personnelProblemForType("shared", {});
    expect(problem?.side).toBe("students");
  });

  it("the message-only wrapper still agrees with the detailed form", () => {
    const personnel = { students: people(5) };
    expect(validatePersonnelForType("shared", personnel)).toBe(
      personnelProblemForType("shared", personnel)?.message
    );
    expect(validatePersonnelForType("dual", { instructors: people(1), students: people(1) })).toBeNull();
  });
});
