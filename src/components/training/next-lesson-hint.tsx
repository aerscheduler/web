import * as React from "react";
import { GraduationCap } from "lucide-react";
import { useCandidateLessons } from "@/features/queries";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Which lesson this booking is probably for, shown while it is still being booked.
 *
 * Both Flight Circle and Flight Schedule Pro put the student's current lesson on the
 * booking screen, and they are right to: the person choosing an aircraft and a slot is
 * usually deciding what the lesson IS, and making them open the student's record to find
 * out is the reason schools keep a paper wall chart next to the desk.
 *
 * Read-only on purpose. Nothing is committed here. The lesson is chosen at close-out,
 * when what actually happened is known, and picking it up front would only mean recording
 * a plan as a fact.
 *
 * One line by default so the booking form stays readable when a student is on several
 * courses; expand to see the rest.
 *
 * Renders nothing for a student on no course, which is most bookings.
 */
function LessonRow({
  name,
  done,
  total,
}: {
  name: string;
  done: number;
  total: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted-foreground">Next up · </span>
        <span className="font-medium">{name}</span>
      </span>
      <Badge variant="outline" className="shrink-0 text-[11px]">
        {done} of {total} done
      </Badge>
    </div>
  );
}

export function NextLessonHint({
  orgUserId,
  type,
  className,
}: {
  orgUserId: number | null;
  type: string;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => {
    setExpanded(false);
  }, [orgUserId, type]);

  const q = useCandidateLessons(
    { orgUserId: orgUserId ?? undefined, type },
    { enabled: orgUserId != null }
  );

  const withLessons = (q.data ?? []).filter((e) => e.lessons.length > 0);
  if (q.isPending || withLessons.length === 0) return null;

  const primary = withLessons[0]!;
  const primaryNext = primary.lessons.find((l) => !l.complete) ?? primary.lessons[0];
  const primaryDone = primary.lessons.filter((l) => l.complete).length;
  const moreCount = withLessons.length - 1;

  return (
    <div
      data-doc-shot="booking-next-up-hint"
      className={cn("space-y-1.5 rounded-md border bg-muted/40 px-3 py-2.5", className)}
    >
      <LessonRow
        name={primaryNext?.name ?? ""}
        done={primaryDone}
        total={primary.lessons.length}
      />
      {expanded &&
        withLessons.slice(1).map((e) => {
          const next = e.lessons.find((l) => !l.complete) ?? e.lessons[0];
          const done = e.lessons.filter((l) => l.complete).length;
          return (
            <LessonRow
              key={e.enrollmentId}
              name={next?.name ?? ""}
              done={done}
              total={e.lessons.length}
            />
          );
        })}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[11px] text-muted-foreground">
          You&rsquo;ll pick and grade the lesson at close-out, once you know how it went.
        </p>
        {moreCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            {expanded ? "Show less" : `${moreCount} more course${moreCount === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </div>
  );
}
