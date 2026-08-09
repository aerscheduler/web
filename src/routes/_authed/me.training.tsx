import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileSignature, GraduationCap, Info, ScrollText } from "lucide-react";
import {
  useCountersignLessonRecord,
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
  deciHours,
  deciHoursLabel,
  requiredLabel,
  standingFraction,
  supersededIds,
} from "@/lib/training";
import type { EnrollmentProgress } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { MY_TRAINING_RAIL } from "@/lib/my-training-sections";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail } from "@/components/section-rail";
import { EmptyState, ErrorState } from "@/components/states";
import { EndorsementsCard } from "@/components/training/endorsements-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 * No route guard: the server already returns only this caller's own enrollments, and a
 * guard would be a second place for the rule to drift from.
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
  const enrollments = useEnrollments();

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
                icon={GraduationCap}
                title="You're not on a course"
                body="When your school enrolls you on a syllabus, your lessons and hours appear here."
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
  const q = useEndorsements();

  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (orgUserId == null || q.isError || ((q.data ?? []).length === 0 && !canSign)) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No endorsements yet"
        body="Anything an instructor signs for you, your solo, a cross-country, a knowledge test, shows up here with its expiry."
      />
    );
  }

  return <EndorsementsCard orgUserId={orgUserId} isSelf />;
}

function EnrollmentCard({ enrollmentId }: { enrollmentId: number }) {
  const progress = useEnrollmentProgress(enrollmentId);
  if (progress.isLoading) return <Skeleton className="h-48 w-full" />;
  if (!progress.data) return null;

  const p = progress.data;
  const course = p.enrollment.courseVersion.course;

  return (
    <Card data-doc-shot="me-training-progress" className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{course.name}</h2>
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

/**
 * The student's one write.
 *
 * Only records the instructor has signed and the student has not, and never a superseded
 * one, countersigning a record that has already been replaced would be signing something
 * that no longer counts.
 */
function ToCountersign({ progress }: { progress: EnrollmentProgress }) {
  const countersign = useCountersignLessonRecord();
  const superseded = supersededIds(progress.enrollment.lessonRecords);

  const lessonName = (lessonId: number) =>
    progress.enrollment.courseVersion.stages
      .flatMap((s) => s.lessons)
      .find((l) => l.id === lessonId)?.name ?? "Lesson";

  const waiting = progress.enrollment.lessonRecords.filter(
    (r) => r.instructorSignedAt && !r.studentSignedAt && !superseded.has(r.id)
  );

  if (waiting.length === 0) return null;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <FileSignature className="size-4" />
        {waiting.length === 1 ? "A lesson needs your signature" : `${waiting.length} lessons need your signature`}
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
