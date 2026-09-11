/**
 * Reading the training record: hours, grades, and how far along somebody is.
 *
 * Everything the server stores is in DECI-HOURS (tenths). This is the only place that
 * turns them into something a human reads, for the same reason `report-format.ts` exists:
 * a school looking at "26" and a school looking at "2.6 hours" are looking at the same
 * number, and only one of them is right.
 */

import type { LessonKind, Standing, EnrollmentStatus, RegulatoryPart } from "@/types/api";

/** 26 → "2.6". The bare number, for a table cell that already has an ", hrs" header. */
export const deciHours = (v: number | null | undefined): string =>
  v == null ? "–" : (v / 10).toFixed(1);

/** 26 → "2.6 hrs". For prose and for anywhere the unit isn't already on screen. */
export const deciHoursLabel = (v: number | null | undefined): string =>
  v == null ? "–" : `${(v / 10).toFixed(1)} hrs`;

/** What a requirement asks for, whichever way it is measured. */
export function requiredLabel(s: Standing): string {
  if (s.requiredDeciHours != null) return deciHoursLabel(s.requiredDeciHours);
  if (s.requiredCount != null) return `${s.requiredCount}`;
  return "–";
}

/** What the student has, whichever way it is measured. */
export function creditedLabel(s: Standing): string {
  if (s.requiredDeciHours != null) return deciHoursLabel(s.creditedDeciHours);
  if (s.requiredCount != null) return `${s.creditedCount}`;
  return "–";
}

/**
 * How far through a requirement, 0–1.
 *
 * Capped at 1 so a student with 60 hours against a 40-hour minimum shows a full bar
 * rather than an overflowing one, being ahead is not a rendering problem.
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
 * A handful of requirements go stale, the three hours of test preparation must be within
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

/**
 * Same rule as the server's `needsSignoff`. Off means the grade (and the
 * instructor's signature, if they gave one) finishes the lesson; the student
 * is not asked to countersign a self-study module or a written quiz.
 */
export function lessonNeedsSignoff(requiresSignoff: boolean | null | undefined): boolean {
  return requiresSignoff !== false;
}

/** Where a record is in its lifecycle, in the words a school uses. */
export function recordState(r: {
  instructorSignedAt: string | null;
  studentSignedAt: string | null;
  supersedesId: number | null;
  requiresSignoff?: boolean | null;
}): { label: string; tone: "draft" | "signed" | "complete" | "amended" } {
  if (!r.instructorSignedAt) {
    return r.supersedesId != null
      ? { label: "Correction, not signed", tone: "amended" }
      : { label: "Grading", tone: "draft" };
  }
  if (lessonNeedsSignoff(r.requiresSignoff) && !r.studentSignedAt) {
    return { label: "Awaiting student", tone: "signed" };
  }
  return { label: "Signed", tone: "complete" };
}

/**
 * Records the student is actually asked to countersign.
 *
 * Instructor-signed and not yet student-signed is not enough: a lesson the
 * syllabus marked sign-off optional is already complete, and prompting for a
 * signature on it is a lie.
 */
export function awaitingStudentSignature<
  R extends { id: number; lessonId: number; instructorSignedAt: string | null; studentSignedAt: string | null },
>(
  records: R[],
  lessons: { id: number; requiresSignoff: boolean }[],
  superseded: Set<number>
): R[] {
  const byId = new Map(lessons.map((l) => [l.id, l]));
  return records.filter((r) => {
    if (!r.instructorSignedAt || r.studentSignedAt || superseded.has(r.id)) return false;
    return lessonNeedsSignoff(byId.get(r.lessonId)?.requiresSignoff);
  });
}

/**
 * Which records are superseded by a later correction.
 *
 * The client is told `completedLessonIds` outright, so this exists only to strike through
 * the ones the amendment replaced, not to re-derive completion, which is the server's job
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

/**
 * The day a ledger row is about.
 *
 * Hand-posted transfers store UTC midnight of the logbook date; those have to render
 * in UTC or a US school sees the previous calendar day. Lesson credits are real
 * instants (booking start, captured grade). A 5pm Pacific dual serializes as
 * `T00:00:00.000Z` and must stay on the local flying day, not jump to tomorrow.
 */
/** Prefill the grade date picker from a stored instant. */
export function logbookDayFromIso(iso: string | null | undefined, fallback: string): string {
  if (!iso || iso.length < 10) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const utcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  if (utcMidnight) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Persist a picker calendar day as noon UTC so US local ledger labels stay on that day. */
export function logbookDayToOccurredAt(day: string): string {
  return `${day}T12:00:00.000Z`;
}

export function ledgerDateLabel(iso: string, fromLesson: boolean): string {
  const d = new Date(iso);
  if (fromLesson) return d.toLocaleDateString();
  const dateOnly =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  return d.toLocaleDateString(undefined, dateOnly ? { timeZone: "UTC" } : undefined);
}

/**
 * Does the caller hold a training grant?
 *
 * `implied` is what their ROLE already gives them (an admin holds all four without a row),
 * sent by the server rather than re-derived here so the bypass cannot drift between the
 * two. `grants` is what has been granted explicitly.
 *
 * FAILS CLOSED. While the query is loading, or if it failed, this is false, an action
 * button that appears optimistically and then 403s is worse than one that appears a
 * moment late, and this is the exact shape of the most common bug in this codebase:
 * the client offering something the server will refuse.
 */
export function holdsTrainingGrant(
  mine: { grants: { grant: string; courseId: number | null }[]; implied: string[] } | undefined,
  grant: string,
  courseId?: number
): boolean {
  if (!mine) return false;
  if (mine.implied.includes(grant)) return true;
  return mine.grants.some((g) => {
    if (g.grant !== grant) return false;
    return g.courseId == null || courseId == null || g.courseId === courseId;
  });
}
