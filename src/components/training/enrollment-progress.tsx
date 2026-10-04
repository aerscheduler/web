import type { EnrollmentSummary } from "@/types/api";

/** Distinct lessons complete, the training record's own count. */
export const lessonsDone = (e: EnrollmentSummary) => e.lessonsComplete ?? e._count?.lessonRecords ?? 0;

/** How far through the syllabus, 0 to 1; 0 when the version has no lessons. */
export const lessonsFraction = (e: EnrollmentSummary) => (e.lessonsTotal ? lessonsDone(e) / e.lessonsTotal : 0);

/** A bar and "3 of 12 lessons": a roster cell. The bar only when there is a total to fill. */
export function EnrollmentProgress({ enrollment: e }: { enrollment: EnrollmentSummary }) {
  const total = e.lessonsTotal;
  return (
    <span className="flex items-center gap-2">
      {total ? (
        <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(lessonsFraction(e) * 100)}%` }} />
        </span>
      ) : null}
      <span className="truncate text-muted-foreground">
        {lessonsDone(e)}
        {total != null ? ` of ${total}` : ""} {(total ?? lessonsDone(e)) === 1 ? "lesson" : "lessons"}
      </span>
    </span>
  );
}
