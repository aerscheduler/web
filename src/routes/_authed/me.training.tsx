import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Info } from "lucide-react";
import {
  useCourses,
  useEndorsements,
  useEnrollmentProgress,
  useEnrollments,
} from "@/features/queries";
import { canAccess } from "@/lib/permissions";
import { nextLessonId } from "@/lib/training";
import { TrainingTimeline } from "@/components/training/training-timeline";
import { Button } from "@/components/ui/button";
import {
  PART_LABEL,
  STATUS_LABEL,
  cappedExplanation,
  staleExplanation,
  creditedLabel,
  deciHoursLabel,
  requiredLabel,
  standingFraction,
} from "@/lib/training";
import { useAuth } from "@/lib/auth";
import { MY_TRAINING_RAIL } from "@/lib/my-training-sections";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
import { EmptyState, ErrorState } from "@/components/states";
import { EndorsementsCard } from "@/components/training/endorsements-card";
import { ToCountersign } from "@/components/training/to-countersign";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A student's own training record.
 *
 * §141.101 makes the school hand over a copy of this on request, so it is not a courtesy
 * screen, it is the student's record, and it deliberately shows the same numbers the
 * school sees rather than a simplified version. The one thing they can DO here is
 * countersign, which is their signature on what their instructor recorded.
 *
 * Staff can list every enrollment. This page always asks for THIS caller's orgUserId so
 * an instructor who is also a student does not see classmates under My training.
 */
export const Route = createFileRoute("/_authed/me/training")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: MyTrainingPage,
});

/**
 * Two things, and only one of them is a course.
 *
 * Endorsements used to sit under the last progress card, which put the one thing with an
 * expiry date on it (the 90-day solo) at the bottom of a scroll, and hid it entirely
 * from a pilot who is not currently enrolled on anything. They are a section of their own
 * for the same reason the school's copy of this page splits: progress is read weekly,
 * endorsements are checked the morning of a flight.
 *
 * The rail list lives in `lib/my-training-sections.ts` so the command palette can offer
 * each as a destination.
 */

function MyTrainingPage() {
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  const { orgUserId, roles } = useAuth();
  // Someone who runs training here (an owner, admin or instructor) and lands on their
  // OWN record, empty because they are not a student, is almost always looking for where
  // training is set up. A new owner on 2026-10-19 found only "you're not on a course"
  // and a students' help article, and canceled soon after. Point them at Training.
  const runsTraining = canAccess("/training", roles);
  const courses = useCourses(undefined, { enabled: runsTraining });
  const enrollments = useEnrollments(
    orgUserId != null ? { orgUserId } : undefined,
    { enabled: orgUserId != null },
  );

  const active = tab === "endorsements" ? "endorsements" : "progress";
  const pick = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true });
  };

  if (enrollments.error) return <ErrorState error={enrollments.error} />;

  const rows = enrollments.data ?? [];

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="My training"
          subtitle="Where you are on each course, and what you still need."
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="My training" sections={MY_TRAINING_RAIL} value={active} onChange={pick} />

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto">
          {active === "progress" ? (
            enrollments.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : rows.length === 0 && runsTraining ? (
              <EmptyState
                graphic="my-training"
                title="You're not on a course"
                body={
                  (courses.data?.length ?? 0) === 0
                    ? "This page is your own record as a pilot. To train students, set up a course under Training: start from the built-in Private Pilot syllabus, then enroll your students on it."
                    : "This page is your own record as a pilot. Your organization's courses, students and their progress are under Training."
                }
                action={
                  <Button asChild>
                    <Link to="/training">{(courses.data?.length ?? 0) === 0 ? "Set up a course" : "Go to Training"}</Link>
                  </Button>
                }
                docs="what-a-course-is"
              />
            ) : rows.length === 0 ? (
              <EmptyState
                graphic="my-training"
                title="You're not on a course"
                body="When your organization enrolls you on a syllabus, your lessons and hours appear here."
                docs="my-training"
              />
            ) : (
              rows.map((e) => <EnrollmentCard key={e.id} enrollmentId={e.id} />)
            )
          ) : (
            /* Their own endorsements. A student wanting to know whether their solo is
               still current should not have to ask the front desk. Keyed off the session
               rather than an enrollment, so they are here before a course is. */
            <MyEndorsements orgUserId={orgUserId} />
          )}
        </div>
      </div>
    </TableView>
  );
}

/**
 * `EndorsementsCard` renders nothing when a pilot has none and nobody here could sign one , 
 * right when it sat under the progress cards, wrong as a whole section, where it leaves a
 * blank pane that reads as a page that failed to load. So that exact case is stated here
 * instead; an instructor with none still gets the card, because they can sign.
 */
function MyEndorsements({ orgUserId }: { orgUserId: number | null }) {
  const { isStaff, roles } = useAuth();
  const canSign = isStaff || roles.includes("instructor");
  const q = useEndorsements(
    orgUserId != null ? { orgUserId } : undefined,
    { enabled: orgUserId != null },
  );

  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <ErrorState error={q.error} />;
  if (orgUserId == null || ((q.data ?? []).length === 0 && !canSign)) {
    return (
      <EmptyState
        graphic="endorsements"
        title="No endorsements yet"
        body="Anything an instructor signs for you, your solo, a cross-country, a knowledge test, shows up here with its expiry."
        docs="endorsement-blanks"
      />
    );
  }

  return <EndorsementsCard orgUserId={orgUserId} isSelf />;
}

function EnrollmentCard({ enrollmentId }: { enrollmentId: number }) {
  const progress = useEnrollmentProgress(enrollmentId);
  const { roles } = useAuth();
  if (progress.isLoading) return <Skeleton className="h-48 w-full" />;
  if (progress.error) {
    return (
      <Card className="p-4">
        <p className="text-sm text-destructive">
          {(progress.error as Error).message || "Could not load this course."}
        </p>
      </Card>
    );
  }
  if (!progress.data) return null;

  const p = progress.data;
  const course = p.enrollment.courseVersion.course;
  const active = p.enrollment.status === "enrolled";
  const stages = p.enrollment.courseVersion.stages;
  const nextId = active ? nextLessonId(stages, p.completedLessonIds) : null;
  const nextStage = stages.find((st) => st.lessons.some((l) => l.id === nextId));
  const next = nextStage?.lessons.find((l) => l.id === nextId);
  // Unmet first, and a finished course's requirements folded away: a graduate's fifteen
  // green rows used to fill the screen above the course they are on now.
  const standings = [...p.standings].sort((a, b) => Number(a.met) - Number(b.met));

  return (
    <Card data-doc-shot="me-training-progress" className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">
            <Link
              to="/training/enrollments/$enrollmentId"
              params={{ enrollmentId: String(enrollmentId) }}
              className="hover:underline"
            >
              {course.name}
            </Link>
          </h2>
          <p className="text-sm text-muted-foreground">
            {p.enrollment.courseVersion.label} · enrolled{" "}
            {new Date(p.enrollment.enrolledAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{PART_LABEL[course.regulatoryPart]}</Badge>
          <Badge variant={p.enrollment.status === "graduated" ? "secondary" : "outline"}>
            {STATUS_LABEL[p.enrollment.status]}
          </Badge>
        </div>
      </div>

      {next ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Next up{next.isStageCheck ? ", your stage check" : ""}</p>
            <p className="truncate text-sm font-medium">{next.name}</p>
          </div>
          {canAccess("/me/book", roles) ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/me/book" search={{ lesson: next.name, kind: next.kind }}>
                Book a lesson
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-3 flex items-baseline justify-between text-sm">
          <span>Lessons</span>
          <span className="tabular-nums text-muted-foreground">
            {p.lessonsComplete} of {p.lessonsTotal}
          </span>
        </div>
        {active ? (
          <TrainingTimeline progress={p} />
        ) : (
          <Progress value={p.lessonsTotal ? (p.lessonsComplete / p.lessonsTotal) * 100 : 0} />
        )}
      </div>

      <details className="group space-y-2.5" open={active}>
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground group-open:mb-2.5">
          {active ? "Hour requirements" : "Show hour requirements"}
        </summary>
        {standings.map((s) => {
          const capped = cappedExplanation(s);
          const stale = staleExplanation(s);
          return (
            <div key={s.requirementId}>
              <div className="flex items-baseline justify-between text-sm">
                <span>{s.label}</span>
                <span className="tabular-nums">
                  <span className={s.met ? "text-emerald-600" : undefined}>{creditedLabel(s)}</span>
                  <span className="text-muted-foreground"> / {requiredLabel(s)}</span>
                  {s.met ? <CheckCircle2 className="ml-1 inline size-3.5 text-emerald-600" /> : null}
                </span>
              </div>
              <Progress className="mt-1 h-1.5" value={standingFraction(s) * 100} />
              {capped ? (
                <p className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {capped} You flew {deciHoursLabel(s.rawDeciHours)}.
                </p>
              ) : null}
              {stale ? (
                <p className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {/* Worth telling a student directly: these hours were valid when they
                      flew them, and the fix is to go and fly again, not to argue. */}
                  {stale}
                </p>
              ) : null}
            </div>
          );
        })}
      </details>

      <ToCountersign progress={p} />
    </Card>
  );
}
