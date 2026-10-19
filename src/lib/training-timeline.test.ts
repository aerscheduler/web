import { describe, expect, it } from "vitest";
import { DEFAULT_DAYS_PER_LESSON, buildTimeline, monthTicks, paceWords, position, type TimelineInput } from "./training-timeline";

const day = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

/** Two stages: three lessons with a stage check last, then two. */
const stages: TimelineInput["stages"] = [
  {
    id: 1,
    name: "Stage 1: Presolo",
    position: 1,
    requiresStageCheck: true,
    lessons: [
      { id: 11, name: "Flight 1", isStageCheck: false },
      { id: 12, name: "Flight 2", isStageCheck: false },
      { id: 13, name: "Stage 1 check", isStageCheck: true },
    ],
  },
  {
    id: 2,
    name: "Stage 2: Cross-country",
    position: 2,
    requiresStageCheck: false,
    lessons: [
      { id: 21, name: "Flight 3", isStageCheck: false },
      { id: 22, name: "Flight 4", isStageCheck: false },
    ],
  },
];

const signed = (id: number, lessonId: number, iso: string, supersedesId: number | null = null) => ({
  id,
  lessonId,
  occurredAt: `${iso}T12:00:00.000Z`,
  instructorSignedAt: `${iso}T15:00:00.000Z`,
  createdAt: `${iso}T15:00:00.000Z`,
  supersedesId,
});

const base: TimelineInput = {
  status: "enrolled",
  enrolledAt: "2026-01-01T12:00:00.000Z",
  closedAt: null,
  stages,
  records: [],
  completedLessonIds: [],
  today: day("2026-02-01"),
};

describe("buildTimeline", () => {
  it("dates finished lessons from the record and forecasts the rest at the student's own pace", () => {
    const t = buildTimeline({
      ...base,
      records: [signed(1, 11, "2026-01-11"), signed(2, 12, "2026-01-21")],
      completedLessonIds: [11, 12],
    })!;
    // 31 days since enrollment over 2 lessons.
    expect(t.basis).toBe("pace");
    expect(t.daysPerLesson).toBeCloseTo(15.5, 1);
    expect(t.stages[0].state).toBe("current");
    expect(t.stages[0].actualUntil).toEqual(day("2026-01-21"));
    // The stage check is the next lesson: one pace step after today.
    expect(t.stages[0].check).toMatchObject({ passed: false, projected: true, lessonName: "Stage 1 check" });
    expect(t.stages[0].check!.date.getTime()).toBeCloseTo(day("2026-02-01").getTime() + 15.5 * 86_400_000, -5);
    expect(t.stages[1].state).toBe("upcoming");
    expect(t.finishProjected).toBe(true);
    // Three lessons left at 15.5 days each.
    expect(t.finish!.getTime()).toBeCloseTo(day("2026-02-01").getTime() + 3 * 15.5 * 86_400_000, -5);
  });

  it("marks a passed stage check on the day it was flown", () => {
    const t = buildTimeline({
      ...base,
      records: [signed(1, 11, "2026-01-05"), signed(2, 12, "2026-01-10"), signed(3, 13, "2026-01-20")],
      completedLessonIds: [11, 12, 13],
    })!;
    expect(t.stages[0].state).toBe("done");
    expect(t.stages[0].check).toMatchObject({ passed: true, projected: false });
    expect(t.stages[0].check!.date).toEqual(day("2026-01-20"));
    expect(t.stages[1].state).toBe("current");
  });

  it("assumes a lesson a week, and says so, when there is no pace yet", () => {
    const t = buildTimeline(base)!;
    expect(t.basis).toBe("assumed");
    expect(t.daysPerLesson).toBe(DEFAULT_DAYS_PER_LESSON);
    expect(t.stages[0].state).toBe("current");
  });

  it("uses a correction's date, not the record it replaced", () => {
    const t = buildTimeline({
      ...base,
      records: [signed(1, 11, "2026-01-05"), signed(2, 11, "2026-01-08", 1)],
      completedLessonIds: [11],
    })!;
    expect(t.stages[0].actualUntil).toEqual(day("2026-01-08"));
  });

  it("does not forecast a closed enrollment, and finishes a graduate on graduation day", () => {
    const t = buildTimeline({
      ...base,
      status: "graduated",
      closedAt: "2026-03-01T12:00:00.000Z",
      records: [11, 12, 13, 21, 22].map((l, i) => signed(i + 1, l, `2026-01-${String(5 + i * 5).padStart(2, "0")}`)),
      completedLessonIds: [11, 12, 13, 21, 22],
    })!;
    expect(t.basis).toBe("closed");
    expect(t.daysPerLesson).toBeNull();
    expect(t.finish).toEqual(new Date("2026-03-01T12:00:00.000Z"));
    expect(t.finishProjected).toBe(false);
    expect(t.stages.every((s) => !s.projected)).toBe(true);
  });

  it("slows the forecast for a student who stopped flying", () => {
    const records = [signed(1, 11, "2026-01-02"), signed(2, 12, "2026-01-03")];
    const fresh = buildTimeline({ ...base, records, completedLessonIds: [11, 12], today: day("2026-01-04") })!;
    const stalled = buildTimeline({ ...base, records, completedLessonIds: [11, 12], today: day("2026-04-01") })!;
    expect(stalled.daysPerLesson!).toBeGreaterThan(fresh.daysPerLesson!);
  });

  it("puts a stage check the syllabus requires but never named at the stage's end", () => {
    const t = buildTimeline({
      ...base,
      stages: [{ ...stages[0], lessons: stages[0].lessons.map((l) => ({ ...l, isStageCheck: false })) }],
    })!;
    expect(t.stages[0].check).toMatchObject({ lessonName: null, passed: false });
    expect(t.stages[0].check!.date).toEqual(t.stages[0].end);
  });

  it("counts an unnamed stage check as passed once its stage is done", () => {
    const t = buildTimeline({
      ...base,
      stages: [{ ...stages[0], lessons: stages[0].lessons.map((l) => ({ ...l, isStageCheck: false })) }],
      records: [signed(1, 11, "2026-01-05"), signed(2, 12, "2026-01-10"), signed(3, 13, "2026-01-20")],
      completedLessonIds: [11, 12, 13],
    })!;
    expect(t.stages[0].check).toMatchObject({ passed: true, projected: false });
  });

  it("starts the first stage at enrollment, so a slow start is part of the course", () => {
    const t = buildTimeline({ ...base, records: [signed(1, 11, "2026-01-25")], completedLessonIds: [11] })!;
    expect(t.stages[0].start).toEqual(new Date(base.enrolledAt));
  });

  it("returns nothing for a syllabus with no lessons", () => {
    expect(buildTimeline({ ...base, stages: [{ ...stages[0], lessons: [] }] })).toBeNull();
  });
});

describe("axis helpers", () => {
  it("places dates along the axis and keeps month labels sparse", () => {
    const t = buildTimeline({ ...base, today: day("2027-06-01") })!;
    expect(position(t, t.start)).toBe(0);
    expect(position(t, t.end)).toBe(100);
    expect(monthTicks(t).length).toBeLessThanOrEqual(9);
  });

  it("says the pace in words", () => {
    expect(paceWords(3)).toBe("about 2 lessons a week");
    expect(paceWords(7)).toBe("about a lesson a week");
    expect(paceWords(12.4)).toBe("a lesson every 12 days");
  });
});
