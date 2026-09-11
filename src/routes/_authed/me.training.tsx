import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Info } from "lucide-react";
import {
  useEndorsements,
  useEnrollmentProgress,
  useEnrollments,
} from "@/features/queries";
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
  const { orgUserId } = useAuth();
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
            ) : rows.length === 0 ? (
              <EmptyState
                graphic="my-training"
                title="You're not on a course"
                body="When your school enrolls you on a syllabus, your lessons and hours appear here."
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

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span>Lessons</span>
          <span className="tabular-nums text-muted-foreground">
            {p.lessonsComplete} of {p.lessonsTotal}
          </span>
        </div>
        <Progress value={p.lessonsTotal ? (p.lessonsComplete / p.lessonsTotal) * 100 : 0} />
      </div>

      <div className="space-y-2.5">
        {p.standings.map((s) => {
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
      </div>

      <ToCountersign progress={p} />
    </Card>
  );
}
