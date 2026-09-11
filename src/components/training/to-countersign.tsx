import { FileSignature } from "lucide-react";
import { useCountersignLessonRecord } from "@/features/queries";
import { awaitingStudentSignature, deciHours, supersededIds } from "@/lib/training";
import type { EnrollmentProgress } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The student's one write.
 *
 * Only records the instructor has signed and the student has not, on lessons
 * the syllabus actually requires a student signature for, and never a superseded
 * one.
 *
 * Lives on My training AND on the enrollment record, because the course name on My
 * training is a link into that record, and a student who followed it used to find no Sign
 * button at all.
 */
export function ToCountersign({ progress }: { progress: EnrollmentProgress }) {
  const countersign = useCountersignLessonRecord();
  const superseded = supersededIds(progress.enrollment.lessonRecords);
  if (progress.enrollment.status !== "enrolled") return null;

  const lessonName = (lessonId: number) =>
    progress.enrollment.courseVersion.stages
      .flatMap((s) => s.lessons)
      .find((l) => l.id === lessonId)?.name ?? "Lesson";

  const waiting = awaitingStudentSignature(
    progress.enrollment.lessonRecords,
    progress.enrollment.courseVersion.stages.flatMap((s) => s.lessons),
    superseded
  );

  if (waiting.length === 0) return null;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <FileSignature className="size-4" />
        {waiting.length === 1
          ? "A lesson needs your signature"
          : `${waiting.length} lessons need your signature`}
      </div>
      <div className="space-y-1.5">
        {waiting.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{lessonName(r.lessonId)}</span>
            {r.grade ? <Badge variant="outline">{r.grade}</Badge> : null}
            {r.flightDeciHours ? (
              <span className="text-xs text-muted-foreground">{deciHours(r.flightDeciHours)} hrs</span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={countersign.isPending}
              onClick={() => countersign.mutate(r.id)}
            >
              Sign
            </Button>
          </div>
        ))}
      </div>
      {countersign.error ? (
        <p className="mt-2 text-sm text-destructive">{(countersign.error as Error).message}</p>
      ) : null}
    </div>
  );
}
