/**
 * Reading the training record: hours, grades, and how far along somebody is.
 *
 * Everything the server stores is in DECI-HOURS (tenths). This is the only place that
 * turns them into something a human reads, for the same reason `report-format.ts` exists:
 * a school looking at "26" and a school looking at "2.6 hours" are looking at the same
 * number, and only one of them is right.
 */

import type { LessonKind, Standing, EnrollmentStatus, RegulatoryPart } from "@/types/api";

/** 26 → "2.6". The bare number, for a table cell that already has an "hrs" header. */
export const deciHours = (v: number | null | undefined): string =>
  v == null ? "—" : (v / 10).toFixed(1);

/** 26 → "2.6 hrs". For prose and for anywhere the unit isn't already on screen. */
export const deciHoursLabel = (v: number | null | undefined): string =>
  v == null ? "—" : `${(v / 10).toFixed(1)} hrs`;

/** What a requirement asks for, whichever way it is measured. */
export function requiredLabel(s: Standing): string {
  if (s.requiredDeciHours != null) return deciHoursLabel(s.requiredDeciHours);
  if (s.requiredCount != null) return `${s.requiredCount}`;
  return "—";
}

/** What the student has, whichever way it is measured. */
export function creditedLabel(s: Standing): string {
  if (s.requiredDeciHours != null) return deciHoursLabel(s.creditedDeciHours);
  if (s.requiredCount != null) return `${s.creditedCount}`;
  return "—";
}

/**
 * How far through a requirement, 0–1.
 *
 * Capped at 1 so a student with 60 hours against a 40-hour minimum shows a full bar
 * rather than an overflowing one — being ahead is not a rendering problem.
 */
export function standingFraction(s: Standing): number {
  const required = s.requiredDeciHours ?? s.requiredCount;
  if (!required) return 1;
  const have = s.requiredDeciHours != null ? s.creditedDeciHours : s.creditedCount;
  return Math.max(0, Math.min(1, have / required));
}

/**
 * Why a number is smaller than the hours actually flown.
 *
 * Only ever set when a ceiling threw credit away, and worth saying out loud: a student
 * looking at "10.0 of 40.0" who flew 20 hours in a simulator will otherwise assume the
 * software lost them.
 */
export function cappedExplanation(s: Standing): string | null {
  if (!s.cappedBy || s.disallowedDeciHours <= 0) return null;
  const lost = deciHoursLabel(s.disallowedDeciHours);
  return s.cappedBy === "simulator"
    ? `${lost} of simulator time is above what this course allows toward this requirement.`
    : `${lost} of transferred credit is above the limit for previous training.`;
}

/**
 * Why hours a student definitely flew are not counting toward this requirement.
 *
 * A handful of requirements go stale — the three hours of test preparation must be within
 * two calendar months of the checkride. Showing the reduced number alone would read as the
 * software losing somebody's flying, and an instructor would ring the school about it.
 * Saying "3.0 flown, 1.0 still current" is a different sentence entirely, and it is the one
 * that tells them to go and fly again.
 */
export function staleExplanation(s: Standing): string | null {
  if (!s.staleDeciHours || s.staleDeciHours <= 0) return null;
  const months = s.recencyCalendarMonths;
  //deciHoursLabel already carries the unit. Appending another produced "5.0 hrs hrs",
  //which shipped because the string was only ever read in a test that asserted on the
  //number and the word "calendar".
  const stale = deciHoursLabel(s.staleDeciHours);
  return `${stale} no longer count: this has to be flown within ${months} calendar month${months === 1 ? "" : "s"} of the test.`;
}

export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  ground: "Ground",
  flight: "Flight",
  sim: "Simulator",
};

export const PART_LABEL: Record<RegulatoryPart, string> = {
  part61: "Part 61",
  part141: "Part 141",
};

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  enrolled: "In training",
  graduated: "Graduated",
  terminated: "Terminated",
  transferred: "Transferred",
};

/** Where a record is in its lifecycle, in the words a school uses. */
export function recordState(r: {
  instructorSignedAt: string | null;
  studentSignedAt: string | null;
  supersedesId: number | null;
}): { label: string; tone: "draft" | "signed" | "complete" | "amended" } {
  if (!r.instructorSignedAt) {
    return r.supersedesId != null
      ? { label: "Correction — not signed", tone: "amended" }
      : { label: "Grading", tone: "draft" };
  }
  if (!r.studentSignedAt) return { label: "Awaiting student", tone: "signed" };
  return { label: "Signed", tone: "complete" };
}

/**
 * Which records are superseded by a later correction.
 *
 * The client is told `completedLessonIds` outright, so this exists only to strike through
 * the ones the amendment replaced — not to re-derive completion, which is the server's job
 * and easy to get subtly wrong.
 */
export function supersededIds(records: { supersedesId: number | null }[]): Set<number> {
  return new Set(records.map((r) => r.supersedesId).filter((v): v is number => v != null));
}

/**
 * The obvious next lesson: the first one nobody has finished, in syllabus order.
 *
 * Used to put the cursor somewhere sensible when an instructor opens a student to grade,
 * because the answer is right almost every time and wrong harmlessly.
 */
export function nextLessonId(
  stages: { lessons: { id: number }[] }[],
  completedLessonIds: number[]
): number | null {
  const done = new Set(completedLessonIds);
  for (const stage of stages) {
    for (const lesson of stage.lessons) if (!done.has(lesson.id)) return lesson.id;
  }
  return null;
}
