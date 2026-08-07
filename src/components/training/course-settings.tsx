import { useState } from "react";
import { Archive, ArchiveRestore, CalendarClock } from "lucide-react";
import type { Course } from "@/types/api";
import { useUpdateCourse } from "@/features/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The two course-level settings that are not part of the syllabus: how long the school
 * plans it to take, and whether it is still being taught.
 *
 * Both existed everywhere except here. `targetDays` had a column, a validated service
 * argument and a pace calculation reading it, and the two course routes dropped the field,
 * so the "Behind" state on a student's record was unreachable by construction. `archived`
 * had a column, a service argument, an API flag and an `includeArchived` list option, and
 * no control anywhere, so a course a school stopped teaching stayed on the Training page
 * for good.
 *
 * Deliberately sits with the enrollment fee rather than with the syllabus: neither of these
 * is part of the document a Part 141 school files, and both stay editable after the
 * syllabus is published and locked.
 */
export function CourseSettings({ course }: { course: Course }) {
  const update = useUpdateCourse();
  const [days, setDays] = useState(course.targetDays != null ? String(course.targetDays) : "");

  const trimmed = days.trim();
  const parsed = trimmed === "" ? null : Number(trimmed);
  const invalid = parsed != null && (!Number.isInteger(parsed) || parsed <= 0);
  const dirty = parsed !== (course.targetDays ?? null);
  const archived = course.archivedAt != null;

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Course settings</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        How long you plan this course to take, and whether you are still teaching it.
        Neither is part of the syllabus, so both stay editable after it is published.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="target-days">Planned duration</Label>
          <div className="flex items-center gap-2">
            <Input
              id="target-days"
              className="w-28"
              inputMode="numeric"
              placeholder="180"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>

        <Button
          variant="outline"
          disabled={!dirty || invalid || update.isPending}
          onClick={() => update.mutate({ courseId: course.id, targetDays: parsed })}
        >
          Save
        </Button>
      </div>

      {invalid ? (
        <p className="mt-2 text-sm text-destructive">
          Give the plan as a whole number of days, or leave it empty.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {/* Said plainly, because "Behind" on a student's record is a claim about them and
              a school should know exactly what produced it. */}
          {parsed == null
            ? "With no plan, a student is never marked behind. Their record still flags anyone who has stopped flying."
            : `A student's record reads "Behind" once they are well short of ${parsed} days' worth of progress. Advisory only: it never blocks anything.`}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {archived ? "Archived" : "Teaching this course"}
          </div>
          <p className="text-xs text-muted-foreground">
            {archived
              ? "Hidden from the Training page. Students already on it keep their records and finish normally."
              : "Archiving hides it from the Training page and stops it being offered. Nobody's record changes, and you can bring it back."}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={update.isPending}
          onClick={() => {
            if (
              !archived &&
              !confirm(
                `Archive ${course.name}? It stops appearing on the Training page. Students already on it keep their records and finish normally, and you can restore it at any time.`
              )
            ) {
              return;
            }
            update.mutate({ courseId: course.id, archived: !archived });
          }}
        >
          {archived ? (
            <>
              <ArchiveRestore className="size-4" /> Restore
            </>
          ) : (
            <>
              <Archive className="size-4" /> Archive course
            </>
          )}
        </Button>
      </div>

      {update.error ? (
        <p className="mt-2 text-sm text-destructive">{(update.error as Error).message}</p>
      ) : null}
    </Card>
  );
}
