/**
 * Close-out Training card: what the folded header should say, and whether a grader
 * still has work on this booking.
 *
 * Sign lives inside `CollapsibleContent`, which unmounts while the card is shut, so the
 * header cannot ask the children. Counting only in-memory Sign clicks also forgot the
 * answer on reload. These helpers read the candidate payload instead.
 */

export type CloseOutLesson = { complete: boolean };

export type CloseOutEnrollment = {
  enrollmentId: number;
  lessons: CloseOutLesson[];
  gradedReservationIds?: number[] | null;
};

export function signedOnReservation(
  enrollment: CloseOutEnrollment,
  reservationId: number,
  graderSigned = false
): boolean {
  if (graderSigned) return true;
  return (enrollment.gradedReservationIds ?? []).includes(reservationId);
}

export function syllabusHasWorkLeft(lessons: CloseOutLesson[]): boolean {
  return lessons.some((l) => !l.complete);
}

export function closeOutCardCounts(
  rows: { studentId: number; enrollments: CloseOutEnrollment[] }[],
  reservationId: number,
  graders: Record<string, boolean>
): { total: number; signed: number; remaining: number } {
  let total = 0;
  let signed = 0;
  let remaining = 0;
  for (const row of rows) {
    for (const enrollment of row.enrollments) {
      total += 1;
      const key = `${row.studentId}:${enrollment.enrollmentId}`;
      if (signedOnReservation(enrollment, reservationId, !!graders[key])) {
        signed += 1;
      } else if (syllabusHasWorkLeft(enrollment.lessons)) {
        remaining += 1;
      }
    }
  }
  return { total, signed, remaining };
}

export function closeOutSummary(counts: {
  total: number;
  signed: number;
  remaining: number;
}): string {
  const { total, signed, remaining } = counts;
  if (remaining === 0 && signed === 0) {
    return total === 1 ? "syllabus complete" : "all syllabi complete";
  }
  if (signed === total) {
    return total === 1 ? "signed" : `all ${total} signed`;
  }
  return `${signed} of ${total} graded`;
}

/** Tenths of an hour into the box the instructor types. */
function tenths(v: number): string {
  return (v / 10).toFixed(1);
}

export type CloseOutDraft = {
  grade?: string | null;
  notes?: string | null;
  flightDeciHours?: number | null;
  instructionDeciHours?: number | null;
  simulatorDeciHours?: number | null;
  reservationId?: number | null;
  taskGrades?: { lessonTaskId: number; grade: string }[];
};

/** True when this lesson's unsigned draft is already tied to a different booking. */
export function lessonHeldOnOtherBooking(
  lesson: { draft?: CloseOutDraft | null } | null | undefined,
  reservationId: number
): boolean {
  const held = lesson?.draft?.reservationId;
  return held != null && held !== reservationId;
}

/**
 * Draft body this booking may hydrate. A draft linked to another flight keeps
 * that flight's notes and hours; this close-out takes the row over but seeds
 * from THIS booking's meters.
 */
export function closeOutDraftForBooking(
  draft: CloseOutDraft | null | undefined,
  reservationId: number
): CloseOutDraft | null {
  if (!draft) return null;
  if (draft.reservationId != null && draft.reservationId !== reservationId) return null;
  return draft;
}

/** First unfinished lesson. A draft on another flight is still next-up: Sign takes it over. */
export function suggestedCloseableLesson<T extends { complete: boolean; draft?: CloseOutDraft | null }>(
  lessons: T[],
  _reservationId?: number
): T | null {
  return lessons.find((l) => !l.complete) ?? null;
}

/**
 * Prefill the close-out grader from an unsigned draft when one exists, otherwise from
 * the billed meters. Draft hours and notes win: overwriting a phone draft with Hobbs
 * and an empty Notes box is how a required-notes Sign got stuck, and how hours already
 * typed at the aircraft disappeared.
 */
export function seedCloseOutGrader(params: {
  draft?: CloseOutDraft | null;
  scale: string[];
  flightSeed: number | null;
  groundSeed: number | null;
}): {
  grade: string;
  notes: string;
  flight: string;
  ground: string;
  sim: string;
  taskMarks: Record<number, string>;
} {
  const d = params.draft ?? null;
  const hours = (draftVal: number | null | undefined, seed: number | null) => {
    if (draftVal != null) return tenths(draftVal);
    return seed ? tenths(seed) : "";
  };
  const taskMarks: Record<number, string> = {};
  for (const t of d?.taskGrades ?? []) {
    if (t.grade) taskMarks[t.lessonTaskId] = t.grade;
  }
  return {
    grade: d?.grade?.trim() || params.scale[0] || "S",
    notes: d?.notes ?? "",
    flight: hours(d?.flightDeciHours, params.flightSeed),
    ground: hours(d?.instructionDeciHours, params.groundSeed),
    sim: d?.simulatorDeciHours != null ? tenths(d.simulatorDeciHours) : "",
    taskMarks,
  };
}
