import { describe, expect, it } from "vitest";
import {
  closeOutCardCounts,
  closeOutDraftForBooking,
  closeOutSummary,
  lessonHeldOnOtherBooking,
  seedCloseOutGrader,
  signedOnReservation,
  suggestedCloseableLesson,
  syllabusHasWorkLeft,
  type CloseOutEnrollment,
} from "./lesson-section.state";

function enrollment(
  partial: Partial<CloseOutEnrollment> & Pick<CloseOutEnrollment, "enrollmentId">
): CloseOutEnrollment {
  return {
    lessons: [{ complete: false }],
    gradedReservationIds: [],
    ...partial,
  };
}

describe("signedOnReservation", () => {
  it("counts a Sign that has not been refetched yet", () => {
    expect(signedOnReservation(enrollment({ enrollmentId: 1 }), 9, true)).toBe(true);
  });

  it("counts a signed record already linked to this booking", () => {
    expect(
      signedOnReservation(
        enrollment({ enrollmentId: 1, gradedReservationIds: [9, 12] }),
        9
      )
    ).toBe(true);
  });

  it("does not treat a different booking's signature as this one", () => {
    expect(
      signedOnReservation(enrollment({ enrollmentId: 1, gradedReservationIds: [12] }), 9)
    ).toBe(false);
  });
});

describe("syllabusHasWorkLeft", () => {
  it("is false when every matching lesson is already complete", () => {
    expect(
      syllabusHasWorkLeft([{ complete: true }, { complete: true }])
    ).toBe(false);
  });

  it("is true when a U or an unflown lesson is still outstanding", () => {
    expect(
      syllabusHasWorkLeft([{ complete: true }, { complete: false }])
    ).toBe(true);
  });
});

describe("close-out Training header", () => {
  const rows = [
    {
      studentId: 4,
      enrollments: [
        enrollment({
          enrollmentId: 10,
          gradedReservationIds: [50],
          lessons: [{ complete: true }, { complete: false }],
        }),
      ],
    },
  ];

  it("survives a reload: signed on this booking even with empty grader state", () => {
    const counts = closeOutCardCounts(rows, 50, {});
    expect(counts).toEqual({ total: 1, signed: 1, remaining: 0 });
    expect(closeOutSummary(counts)).toBe("signed");
  });

  it("says 0 of 1 when this booking has not been graded yet", () => {
    const counts = closeOutCardCounts(rows, 99, {});
    expect(counts).toEqual({ total: 1, signed: 0, remaining: 1 });
    expect(closeOutSummary(counts)).toBe("0 of 1 graded");
  });

  it("does not offer work when the matching syllabus is already finished", () => {
    const done = [
      {
        studentId: 4,
        enrollments: [
          enrollment({
            enrollmentId: 10,
            lessons: [{ complete: true }, { complete: true }],
          }),
        ],
      },
    ];
    const counts = closeOutCardCounts(done, 99, {});
    expect(counts).toEqual({ total: 1, signed: 0, remaining: 0 });
    expect(closeOutSummary(counts)).toBe("syllabus complete");
  });

  it("counts an in-session Sign before candidates refetch", () => {
    const counts = closeOutCardCounts(rows, 99, { "4:10": true });
    expect(counts.signed).toBe(1);
    expect(closeOutSummary(counts)).toBe("signed");
  });
});

describe("seedCloseOutGrader", () => {
  it("prefills from an unsigned draft instead of the billed meters", () => {
    const seeded = seedCloseOutGrader({
      draft: {
        grade: "U",
        notes: "steep turns next",
        flightDeciHours: 13,
        instructionDeciHours: 5,
        simulatorDeciHours: 2,
        taskGrades: [{ lessonTaskId: 41, grade: "S" }],
      },
      scale: ["S", "U"],
      flightSeed: 15,
      groundSeed: 10,
    });
    expect(seeded).toEqual({
      grade: "U",
      notes: "steep turns next",
      flight: "1.3",
      ground: "0.5",
      sim: "0.2",
      taskMarks: { 41: "S" },
    });
  });

  it("falls back to the billed meters when there is no draft", () => {
    const seeded = seedCloseOutGrader({
      draft: null,
      scale: ["S", "U"],
      flightSeed: 15,
      groundSeed: 10,
    });
    expect(seeded.grade).toBe("S");
    expect(seeded.notes).toBe("");
    expect(seeded.flight).toBe("1.5");
    expect(seeded.ground).toBe("1.0");
    expect(seeded.sim).toBe("");
    expect(seeded.taskMarks).toEqual({});
  });
});

describe("a draft already linked to another booking", () => {
  const held = {
    complete: false,
    draft: { notes: "from the other flight", reservationId: 50 },
  };

  it("does not hydrate that draft onto this close-out", () => {
    expect(closeOutDraftForBooking(held.draft, 99)).toBeNull();
    expect(closeOutDraftForBooking(held.draft, 50)).toEqual(held.draft);
    expect(closeOutDraftForBooking({ notes: "phone" }, 99)).toEqual({ notes: "phone" });
  });

  it("is still next-up; Sign takes the draft over for this booking", () => {
    const next = { complete: false, draft: null };
    expect(suggestedCloseableLesson([held, next], 99)).toBe(held);
    expect(suggestedCloseableLesson([held], 99)).toBe(held);
    expect(lessonHeldOnOtherBooking(held, 99)).toBe(true);
    expect(lessonHeldOnOtherBooking(held, 50)).toBe(false);
  });
});
