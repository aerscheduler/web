import type { LessonTask, LessonTaskGrade } from "@/types/api";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Grade each task in a lesson, not just the lesson.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS ON THE WEB AT ALL
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The schema has carried `LessonTask` (with its ACS code) and `LessonTaskGrade` since the
 * curriculum module shipped, the endpoint has always accepted `taskGrades`, and the iPhone
 * app has always written them. The console never offered the field, so the help docs told
 * customers in as many words to go and use the phone, and a chief instructor grading at a
 * desk lost the per-task detail on every lesson they touched.
 *
 * That detail is the point of building a syllabus around ACS codes: it is what eventually
 * answers "which areas is this student weak in", which is the report schools ask for. A
 * record graded without it is not recoverable later, because nobody re-flies a lesson to
 * fill in the boxes.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * ONE ROW PER TASK, AND NO GRADE IS A REAL ANSWER
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * A lesson runs to a dozen or more tasks. Rendering a dropdown each would bury the two
 * fields that decide what the student is credited, so each task is one line: its name, its
 * ACS code, and the course's own marks as chips.
 *
 * Every task starts UNSET rather than defaulted to a pass. A syllabus lesson routinely
 * covers tasks that were not attempted (weather, a diversion, an examiner's aircraft), and
 * a screen that pre-ticks every one of them produces a record asserting a student was
 * assessed on manoeuvres they never flew. Only the tasks actually marked are sent.
 */
export function TaskGradeList({
  tasks,
  scale,
  value,
  onChange,
  className,
}: {
  /** The lesson's tasks, in syllabus order. */
  tasks: LessonTask[];
  /** This course's own marks, in display order. Never empty. */
  scale: string[];
  /** taskId to mark. A task missing from the map has not been graded. */
  value: Record<number, string>;
  onChange: (next: Record<number, string>) => void;
  className?: string;
}) {
  if (tasks.length === 0) return null;

  const graded = Object.keys(value).length;

  const toggle = (taskId: number, mark: string) => {
    const next = { ...value };
    //Pressing the mark a task already carries clears it. Without that, a mis-tap is
    //permanent for the life of the form: there is no "unset" chip to press instead, and
    //saving a grade nobody meant is worse than saving none.
    if (next[taskId] === mark) delete next[taskId];
    else next[taskId] = mark;
    onChange(next);
  };

  return (
    <div className={cn("space-y-1.5", className)} data-doc-shot="task-grades">
      <div className="flex items-baseline justify-between gap-2">
        <Label>Tasks</Label>
        <span className="text-xs text-muted-foreground">
          {graded} of {tasks.length} marked
        </span>
      </div>
      <ul className="divide-y rounded-md border">
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="break-words">{t.name}</span>
              {t.acsCode && (
                <span className="tnum ml-1.5 text-xs text-muted-foreground">{t.acsCode}</span>
              )}
            </span>
            <span className="flex shrink-0 gap-1">
              {scale.map((mark) => {
                const on = value[t.id] === mark;
                return (
                  <button
                    key={mark}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${t.name}: ${mark}`}
                    onClick={() => toggle(t.id, mark)}
                    className={cn(
                      "min-w-7 rounded border px-1.5 py-0.5 text-xs font-medium transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {mark}
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Optional. Leave a task unmarked if it was not covered.
      </p>
    </div>
  );
}

/** Seed the editor from a record that already has task grades on it. */
export function taskGradeMap(existing: LessonTaskGrade[] | undefined | null): Record<number, string> {
  const out: Record<number, string> = {};
  for (const g of existing ?? []) out[g.lessonTaskId] = g.grade;
  return out;
}

/** The wire shape: only the tasks somebody actually marked. */
export function taskGradePayload(
  value: Record<number, string>
): { lessonTaskId: number; grade: string }[] {
  return Object.entries(value).map(([id, grade]) => ({ lessonTaskId: Number(id), grade }));
}
