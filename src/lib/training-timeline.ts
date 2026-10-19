/**
 * A student's course laid out in time: each stage as a span across the months, how far
 * through it they are, where its stage check falls, and when they will finish at the pace
 * they have kept so far.
 *
 * Pure, so it is tested without a browser. The component in
 * `components/training/training-timeline.tsx` only draws what this returns.
 *
 * ## What is a fact and what is a forecast
 *
 * Everything to the left of today is the record: a lesson's date is the day its signed
 * record says it was flown. Everything to the right is a projection, and is marked as one
 * wherever it is drawn. The projection is deliberately simple, the remaining lessons in
 * syllabus order at the student's own average so far, because a chief instructor has to
 * be able to say how it was worked out. A student with no lessons yet has no pace, so the
 * forecast assumes a lesson a week and says so.
 *
 * Completion is the server's call (`completedLessonIds`), never re-derived here: a lesson
 * graded "U" and signed is not complete, and only the server knows the course's scale.
 */

import type { EnrollmentStatus } from "@/types/api";

export const DAY_MS = 86_400_000;
/** The assumption when there is no pace yet. Said out loud wherever it is used. */
export const DEFAULT_DAYS_PER_LESSON = 7;

export type TimelineLessonInput = { id: number; name: string; isStageCheck: boolean };
export type TimelineStageInput = {
  id: number;
  name: string;
  position: number;
  requiresStageCheck: boolean;
  lessons: TimelineLessonInput[];
};
export type TimelineRecordInput = {
  id: number;
  lessonId: number;
  occurredAt?: string | null;
  instructorSignedAt: string | null;
  createdAt: string;
  supersedesId: number | null;
};

export type TimelineInput = {
  status: EnrollmentStatus;
  enrolledAt: string;
  /** When the enrollment closed, for a graduated, ended or transferred student. */
  closedAt: string | null;
  stages: TimelineStageInput[];
  records: TimelineRecordInput[];
  completedLessonIds: number[];
  today?: Date;
};

export type TimelineCheck = {
  lessonName: string | null;
  date: Date;
  passed: boolean;
  /** The date is a forecast, not the day it was flown. */
  projected: boolean;
};

export type TimelineStage = {
  id: number;
  name: string;
  lessonsTotal: number;
  lessonsDone: number;
  state: "done" | "current" | "upcoming";
  start: Date;
  end: Date;
  /** The last day the record covers in this stage; after it, the span is a forecast. */
  actualUntil: Date | null;
  /** True when any part of the span is a forecast. */
  projected: boolean;
  check: TimelineCheck | null;
};

export type Timeline = {
  start: Date;
  end: Date;
  today: Date;
  stages: TimelineStage[];
  /** Graduation day, or the projected finish. Null for an enrollment that ended without finishing. */
  finish: Date | null;
  finishProjected: boolean;
  /** The pace the forecast uses, in days per lesson. Null once the enrollment is closed. */
  daysPerLesson: number | null;
  basis: "pace" | "assumed" | "closed";
  lessonsDone: number;
  lessonsTotal: number;
};

const at = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The day a signed record says the lesson was flown. */
const recordDay = (r: TimelineRecordInput): Date | null => at(r.occurredAt) ?? at(r.instructorSignedAt) ?? at(r.createdAt);

export function buildTimeline(input: TimelineInput): Timeline | null {
  const today = input.today ?? new Date();
  const stages = [...input.stages].filter((s) => s.lessons.length > 0).sort((a, b) => a.position - b.position);
  if (!stages.length) return null;

  const enrolled = at(input.enrolledAt) ?? today;
  const closed = input.status !== "enrolled" ? at(input.closedAt) ?? today : null;
  const done = new Set(input.completedLessonIds);

  // The day each completed lesson was flown: its latest signed record that no correction
  // replaced. A lesson the server calls complete always has one; the enrollment date is only
  // a floor for data that predates `occurredAt`.
  const superseded = new Set(input.records.map((r) => r.supersedesId).filter((v): v is number => v != null));
  const flown = new Map<number, Date>();
  for (const r of input.records) {
    if (!r.instructorSignedAt || superseded.has(r.id) || !done.has(r.lessonId)) continue;
    const day = recordDay(r);
    if (!day) continue;
    const prev = flown.get(r.lessonId);
    if (!prev || day > prev) flown.set(r.lessonId, day);
  }

  const allLessons = stages.flatMap((s) => s.lessons);
  const lessonsTotal = allLessons.length;
  const lessonsDone = allLessons.filter((l) => done.has(l.id)).length;
  for (const l of allLessons) if (done.has(l.id) && !flown.has(l.id)) flown.set(l.id, enrolled);

  const actualDates = [...flown.values()];
  const firstFlown = actualDates.length ? new Date(Math.min(...actualDates.map((d) => d.getTime()))) : null;
  const lastFlown = actualDates.length ? new Date(Math.max(...actualDates.map((d) => d.getTime()))) : null;
  // Transfer students can carry records from before they enrolled here.
  const start = firstFlown && firstFlown < enrolled ? firstFlown : enrolled;

  // The pace: the student's own average from enrollment to now (not to the last lesson, so
  // a student who has stopped flying slows the forecast, which is the honest answer).
  let daysPerLesson: number | null = null;
  let basis: Timeline["basis"] = "closed";
  if (!closed) {
    if (lessonsDone > 0) {
      const until = lastFlown && lastFlown > today ? lastFlown : today;
      daysPerLesson = Math.max(1, (until.getTime() - start.getTime()) / DAY_MS / lessonsDone);
      basis = "pace";
    } else {
      daysPerLesson = DEFAULT_DAYS_PER_LESSON;
      basis = "assumed";
    }
  }

  // Forecast every unfinished lesson, in syllabus order, from today.
  const forecast = new Map<number, Date>();
  if (daysPerLesson != null) {
    let cursor = today.getTime();
    for (const l of allLessons) {
      if (done.has(l.id)) continue;
      cursor += daysPerLesson * DAY_MS;
      forecast.set(l.id, new Date(cursor));
    }
  }

  const out: TimelineStage[] = [];
  let previousEnd = start;
  let currentClaimed = false;
  for (const stage of stages) {
    const stageDone = stage.lessons.filter((l) => done.has(l.id));
    const actual = stageDone.map((l) => flown.get(l.id)!).sort((a, b) => a.getTime() - b.getTime());
    const planned = stage.lessons
      .filter((l) => !done.has(l.id))
      .map((l) => forecast.get(l.id))
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime());

    const allDone = stageDone.length === stage.lessons.length;
    const state: TimelineStage["state"] = allDone ? "done" : !currentClaimed ? "current" : "upcoming";
    if (state === "current") currentClaimed = true;

    // A stage begins at its first lesson; one not begun begins where the last one ended.
    // The first stage begins at enrollment, so a slow start reads as part of the course
    // rather than as empty space before it.
    const begin =
      out.length === 0
        ? start
        : actual[0] ?? (planned[0] && daysPerLesson ? new Date(planned[0].getTime() - daysPerLesson * DAY_MS) : previousEnd);
    const startDay = begin < previousEnd && !actual.length ? previousEnd : begin;
    const endDay = planned.length ? planned[planned.length - 1] : actual.length ? actual[actual.length - 1] : startDay;
    const actualUntil = actual.length ? actual[actual.length - 1] : null;

    const checkLesson = stage.lessons.find((l) => l.isStageCheck) ?? null;
    let check: TimelineCheck | null = null;
    if (checkLesson) {
      const passed = done.has(checkLesson.id);
      const date = passed ? flown.get(checkLesson.id)! : forecast.get(checkLesson.id) ?? endDay;
      check = { lessonName: checkLesson.name, date, passed, projected: !passed };
    } else if (stage.requiresStageCheck) {
      // The syllabus says the stage needs one but has not said which lesson it is, so the
      // check is the stage's end: done when the stage is.
      check = { lessonName: null, date: endDay, passed: allDone, projected: !allDone };
    }

    out.push({
      id: stage.id,
      name: stage.name,
      lessonsTotal: stage.lessons.length,
      lessonsDone: stageDone.length,
      state: closed && !allDone ? "upcoming" : state,
      start: startDay,
      end: endDay < startDay ? startDay : endDay,
      actualUntil,
      projected: planned.length > 0,
      check,
    });
    previousEnd = endDay > previousEnd ? endDay : previousEnd;
  }

  const finishForecast = forecast.size ? new Date(Math.max(...[...forecast.values()].map((d) => d.getTime()))) : null;
  const finish = closed ? (input.status === "graduated" ? closed : null) : finishForecast ?? lastFlown ?? today;
  const lastPoint = Math.max(today.getTime(), previousEnd.getTime(), finish?.getTime() ?? 0, closed?.getTime() ?? 0);
  // A little room after the last point so a diamond or the finish is not on the edge.
  const span = Math.max(lastPoint - start.getTime(), 30 * DAY_MS);
  const end = new Date(lastPoint + span * 0.04);

  return {
    start,
    end,
    today,
    stages: out,
    finish,
    finishProjected: !closed,
    daysPerLesson,
    basis,
    lessonsDone,
    lessonsTotal,
  };
}

/** Where a date falls along the axis, 0 to 100. */
export function position(t: Timeline, d: Date): number {
  const total = t.end.getTime() - t.start.getTime();
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, ((d.getTime() - t.start.getTime()) / total) * 100));
}

/** Month ticks for the axis, thinned so they never crowd: at most about eight labels. */
export function monthTicks(t: Timeline): { date: Date; label: string }[] {
  const ticks: { date: Date; label: string }[] = [];
  const first = new Date(t.start.getFullYear(), t.start.getMonth() + 1, 1);
  for (let d = first; d <= t.end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) ticks.push({ date: d, label: "" });
  const step = Math.max(1, Math.ceil(ticks.length / 8));
  return ticks
    .filter((_, i) => i % step === 0)
    .map((tick) => ({
      date: tick.date,
      // The year only where it changes, so a course across New Year reads without a legend.
      label:
        tick.date.getMonth() === 0 || tick === ticks[0]
          ? tick.date.toLocaleDateString(undefined, { month: "short", year: "numeric" })
          : tick.date.toLocaleDateString(undefined, { month: "short" }),
    }));
}

/** "a lesson every 9 days", "about two lessons a week". */
export function paceWords(daysPerLesson: number): string {
  const perWeek = 7 / daysPerLesson;
  if (perWeek >= 1.5) return `about ${Math.round(perWeek)} lessons a week`;
  if (daysPerLesson <= 8) return "about a lesson a week";
  return `a lesson every ${Math.round(daysPerLesson)} days`;
}
