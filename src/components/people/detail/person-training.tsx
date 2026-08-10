import { Link } from "@tanstack/react-router";
import type { OrganizationUser } from "@/types/api";
import { useEnrollments } from "@/features/queries";
import { PART_LABEL, STATUS_LABEL } from "@/lib/training";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

/**
 * What this person is training toward.
 *
 * Sits beside currencies and documents on purpose: all three answer "is this
 * person ready to fly, and on what". A student's page without their course is a
 * page that cannot answer the question the front desk is actually asking when
 * they open it.
 *
 * Reads through `GET /training/enrollments`, which the server already scopes: a
 * student asking sees only their own whatever they pass, and staff see anyone's.
 * So the SAME call is correct for both the self and the staff view, and there is
 * no second endpoint to pick wrongly between, unlike currencies, where choosing
 * the wrong one 403s a member on their own page.
 *
 * Renders nothing at all when the person has no enrollments. Most members of most
 * schools are not on a syllabus, and an empty "Training" card on every renter's
 * page is clutter that makes the ones that matter easier to miss.
 */
export function PersonTraining({ ou, isSelf }: { ou: OrganizationUser; isSelf: boolean }) {
  const q = useEnrollments(isSelf ? undefined : { orgUserId: ou.id });
  const rows = q.data ?? [];

  if (q.isPending) return <CardSkeleton />;
  //A failure here is not worth a red card on somebody's profile, training is one
  //section of many, and the rest of the page is still useful.
  if (q.isError || rows.length === 0) return null;

  //In training first, then most recently enrolled. A graduated Private above an
  //in-progress Instrument buries the thing somebody opened this page to check.
  const sorted = [...rows].sort((a, b) => {
    const rank = (s: string) => (s === "enrolled" ? 0 : 1);
    return (
      rank(a.status) - rank(b.status) ||
      new Date(b.enrolledAt).getTime() - new Date(a.enrolledAt).getTime()
    );
  });

  return (
    <DetailCard
      title="Training"
      description={isSelf ? "The courses you're enrolled on." : "Courses this member is enrolled on."}
    >
      {sorted.length === 0 ? (
        <CardEmpty>Not enrolled on a course.</CardEmpty>
      ) : (
        <ul className="space-y-2">
          {sorted.map((e) => {
            const course = e.courseVersion?.course;
            const body = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {course?.name ?? "Course"}
                  </span>
                  <Badge variant={e.status === "enrolled" ? "outline" : "secondary"}>
                    {STATUS_LABEL[e.status]}
                  </Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {course ? <span>{PART_LABEL[course.regulatoryPart]}</span> : null}
                  {e.courseVersion?.label ? <span>· {e.courseVersion.label}</span> : null}
                  <span>· {e._count?.lessonRecords ?? 0} lessons recorded</span>
                  <span>· since {formatDate(e.enrolledAt, "MMM d, yyyy")}</span>
                </div>
              </>
            );

            //A student's own row goes to their record; staff go to the gradebook. Two
            //different pages, and offering a student the staff one would only 403 them.
            return (
              <li key={e.id}>
                <Link
                  to={isSelf ? "/me/training" : "/training/enrollments/$enrollmentId"}
                  params={isSelf ? undefined : { enrollmentId: String(e.id) }}
                  className="block rounded-md border px-3 py-2 transition hover:bg-accent/40"
                >
                  {body}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DetailCard>
  );
}
