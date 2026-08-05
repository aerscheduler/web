import { GraduationCap } from "lucide-react";
import { useCandidateLessons } from "@/features/queries";
import { Badge } from "@/components/ui/badge";

/**
 * Which lesson this booking is probably for, shown while it is still being booked.
 *
 * Both Flight Circle and Flight Schedule Pro put the student's current lesson on the
 * booking screen, and they are right to: the person choosing an aeroplane and a slot is
 * usually deciding what the lesson IS, and making them open the student's record to find
 * out is the reason schools keep a paper wall chart next to the desk.
 *
 * Read-only on purpose. Nothing is committed here — the lesson is chosen at close-out,
 * when what actually happened is known, and picking it up front would only mean recording
 * a plan as a fact.
 *
 * Renders nothing for a student on no course, which is most bookings.
 */
export function NextLessonHint({
  orgUserId,
  type,
}: {
  orgUserId: number | null;
  type: string;
}) {
  const q = useCandidateLessons(
    { orgUserId: orgUserId ?? undefined, type },
    { enabled: orgUserId != null }
  );

  const withLessons = (q.data ?? []).filter((e) => e.lessons.length > 0);
  if (q.isPending || withLessons.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/40 p-2.5">
      {withLessons.map((e) => {
        const next = e.lessons.find((l) => !l.complete) ?? e.lessons[0];
        const done = e.lessons.filter((l) => l.complete).length;
        return (
          <div key={e.enrollmentId} className="flex flex-wrap items-center gap-2 text-sm">
            <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              <span className="text-muted-foreground">Next up · </span>
              <span className="font-medium">{next?.name}</span>
            </span>
            <Badge variant="outline" className="text-[11px]">
              {done} of {e.lessons.length} done
            </Badge>
          </div>
        );
      })}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        You'll pick and grade the lesson at close-out, once you know how it went.
      </p>
    </div>
  );
}
