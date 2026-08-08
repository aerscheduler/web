import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  GraduationCap,
  History,
  Info,
  LayoutDashboard,
  PenLine,
  Plane,
  RotateCcw,
  Target,
} from "lucide-react";
import {
  useAmendLessonRecord,
  useEnrollmentProgress,
  useGraduateStudent,
  useSaveLessonRecord,
  useSignLessonRecord,
  useCertifyEnrollment,
  useEndEnrollment,
  useMyTrainingGrants,
  useReverseRequirementCredit,
} from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { holdsTrainingGrant } from "@/lib/training";
import { AddCreditDialog } from "@/components/training/credit-dialog";
import { TaskGradeList, taskGradeMap, taskGradePayload } from "@/components/training/task-grades";
import {
  LESSON_KIND_LABEL,
  PART_LABEL,
  STATUS_LABEL,
  cappedExplanation,
  staleExplanation,
  creditedLabel,
  deciHours,
  deciHoursLabel,
  nextLessonId,
  recordState,
  requiredLabel,
  standingFraction,
  supersededIds,
} from "@/lib/training";
import type { EnrollmentProgress, LessonRecord, Standing, SyllabusLesson } from "@/types/api";
import { gradeCodesOf } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { DocsHint } from "@/components/docs-hint";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { EmptyState, ErrorState } from "@/components/states";
import { EndorsementsCard } from "@/components/training/endorsements-card";
import { EnrollmentFeeCard } from "@/components/training/enrollment-fee-card";
import { PaceBadge } from "@/components/training/pace-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * One student's enrollment — progress, lessons, ledger, fee and endorsements.
 *
 * A rail rather than tabs, like every other sectioned page in the console. The
 * summary (how far along, fee, solo sign-offs) sits on Overview so you can see
 * it without first choosing Requirements or Lessons.
 */
export const Route = createFileRoute("/_authed/training_/enrollments/$enrollmentId")({
  //A student's own record, their instructor's view of it, and an admin's are the same
  //page; the SERVER decides which of them may open which record (`canReadEnrollment`).
  //Guarded on /training this was admin-only, so the link the person detail page renders
  //for an instructor went nowhere.
  beforeLoad: guardRoute("/training/enrollments"),
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: EnrollmentPage,
});

const SECTIONS: RailSection[] = [
  {
    items: [
      { value: "overview", label: "Overview", icon: LayoutDashboard },
      { value: "requirements", label: "Requirements", icon: Target },
      { value: "lessons", label: "Lessons", icon: BookOpen },
      { value: "ledger", label: "Ledger", icon: History },
    ],
  },
];

function EnrollmentPage() {
  const { enrollmentId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const progress = useEnrollmentProgress(Number(enrollmentId));

  const active = SECTIONS[0]!.items.some((i) => i.value === tab) ? tab! : "overview";
  const pick = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true });
  };

  if (progress.error) return <ErrorState error={progress.error} />;
  if (progress.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!progress.data) return <ErrorState error={new Error("That enrollment does not exist.")} />;

  const p = progress.data;
  const e = p.enrollment;
  const course = e.courseVersion.course;

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/training">
            <ArrowLeft className="size-4" /> Training
          </Link>
        </Button>

        <PageHeader
          title={e.student?.user?.name ?? "Student"}
          subtitle={`${course.name} · ${e.courseVersion.label}`}
          actions={<EnrollmentActions progress={p} />}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={course.regulatoryPart === "part141" ? "default" : "outline"}>
            {PART_LABEL[course.regulatoryPart]}
          </Badge>
          <Badge variant={e.status === "graduated" ? "secondary" : "outline"}>
            {STATUS_LABEL[e.status]}
          </Badge>
          {e.certifiedAt ? (
            <Badge variant="secondary" className="gap-1">
              <FileSignature className="size-3" /> Record certified
            </Badge>
          ) : null}
          <PaceBadge pace={p.pace} />
        </div>
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="Enrollment" sections={SECTIONS} value={active} onChange={pick} />

        <div
          className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto"
          data-doc-shot={active === "overview" ? "enrollment-overview" : undefined}
        >
          {active === "overview" && (
            <>
              <Card className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    Lessons complete
                    <DocsHint topic="lessons-vs-hours" />
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {p.lessonsComplete} of {p.lessonsTotal}
                  </span>
                </div>
                <Progress
                  value={p.lessonsTotal ? (p.lessonsComplete / p.lessonsTotal) * 100 : 0}
                />
                {/* Two different numbers on purpose. "12 of 30 lessons" and "18.4 of 40.0 hours"
                    are different axes, and a student can be a long way along one and short on the
                    other — which is exactly the question a chief instructor is asking. */}
                <p className="mt-2 text-xs text-muted-foreground">
                  Lessons and hours move independently — one flight can credit several
                  requirements at once.
                </p>
              </Card>

              {p.graduationBlocker ? (
                <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-4">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div>
                    <div className="text-sm font-medium">Not ready to graduate</div>
                    <p className="text-sm text-muted-foreground">{p.graduationBlocker}</p>
                  </div>
                </Card>
              ) : null}

              {/* Fee and endorsements live on Overview rather than inside Requirements or
                  Lessons: an endorsement is not a lesson, a requirement or a ledger entry,
                  and a student's solo sign-off is something you want without first choosing
                  a section. */}
              <EnrollmentFeeCard
                enrollmentId={e.id}
                feeCents={e.feeCents ?? null}
                feeStatus={e.feeStatus}
                feeInvoiceId={e.feeInvoiceId ?? null}
              />

              <EndorsementsCard
                orgUserId={e.studentOrgUserId}
                isSelf={false}
                enrollmentId={e.id}
              />
            </>
          )}

          {active === "requirements" && (
            <>
              {/* Recording prior training is the first thing a switching school needs to do
                  and there was no way to do it in this console at all. */}
              <div className="flex justify-end">
                <AddCreditDialog enrollmentId={p.enrollment.id} standings={p.standings} />
              </div>
              <RequirementsProgress standings={p.standings} />
            </>
          )}

          {active === "lessons" && <LessonsTab progress={p} />}

          {active === "ledger" && <LedgerTab progress={p} />}
        </div>
      </div>
    </TableView>
  );
}

function RequirementsProgress({ standings }: { standings: Standing[] }) {
  if (standings.length === 0) {
    return <EmptyState icon={ClipboardList} title="No requirements" body="This syllabus tracks no hour requirements." />;
  }

  return (
    <Card className="divide-y p-0" data-doc-shot="enrollment-requirements">
      {standings.map((s) => {
        const capped = cappedExplanation(s);
        const stale = staleExplanation(s);
        return (
          <div key={s.requirementId} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {s.label}
                {!s.faaSourced ? (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    School
                  </Badge>
                ) : null}
              </span>
              <span className="text-sm tabular-nums">
                <span className={s.met ? "text-emerald-600" : undefined}>{creditedLabel(s)}</span>
                <span className="text-muted-foreground"> of {requiredLabel(s)}</span>
                {s.met ? <CheckCircle2 className="ml-1.5 inline size-3.5 text-emerald-600" /> : null}
              </span>
            </div>
            <Progress className="mt-2" value={standingFraction(s) * 100} />
            {capped ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600">
                <Info className="mt-0.5 size-3 shrink-0" />
                {/* Without this, a student who flew 20 hours in a sim sees "10.0 of 40.0"
                    and assumes the software lost their time. */}
                {capped} Flown: {deciHoursLabel(s.rawDeciHours)}.
              </p>
            ) : null}
            {stale ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600">
                <Info className="mt-0.5 size-3 shrink-0" />
                {/* Same reasoning as the cap above: the reduced number on its own reads
                    as lost flying, and this one is worse because the hours were valid
                    when they were flown. */}
                {stale}
              </p>
            ) : null}
          </div>
        );
      })}
    </Card>
  );
}

const KIND_ICON = { flight: Plane, ground: BookOpen, sim: ClipboardList } as const;

function LessonsTab({ progress }: { progress: EnrollmentProgress }) {
  const p = progress;
  const done = new Set(p.completedLessonIds);
  const superseded = supersededIds(p.enrollment.lessonRecords);
  const recordsByLesson = new Map<number, LessonRecord[]>();
  for (const r of p.enrollment.lessonRecords) {
    const list = recordsByLesson.get(r.lessonId) ?? [];
    list.push(r);
    recordsByLesson.set(r.lessonId, list);
  }

  const suggested = useMemo(
    () => nextLessonId(p.enrollment.courseVersion.stages, p.completedLessonIds),
    [p.enrollment.courseVersion.stages, p.completedLessonIds]
  );

  //"Enrolled" says the RECORD is open. It does not say the viewer may write to it, and
  //conflating the two put a Grade button on a student's own lessons the moment this page
  //stopped being admin-only — the classic client-offers-what-the-server-refuses failure.
  //
  //`canGrade` comes from the server on /training/grants/mine rather than being re-derived
  //here, for the same reason the admin bypass is sent rather than reimplemented: two
  //copies of a permission rule drift the first time either changes. Fails closed while
  //the query is in flight.
  const mine = useMyTrainingGrants();
  const editable = p.enrollment.status === "enrolled" && mine.data?.canGrade === true;

  return (
    <div className="space-y-4" data-doc-shot="enrollment-lessons">
      {p.enrollment.courseVersion.stages.map((stage) => (
        <Card key={stage.id} className="p-4">
          <h2 className="mb-3 font-medium">{stage.name}</h2>
          <div className="divide-y rounded-md border">
            {stage.lessons.map((lesson) => {
              const Icon = KIND_ICON[lesson.kind] ?? BookOpen;
              const records = (recordsByLesson.get(lesson.id) ?? []).sort((a, b) => b.id - a.id);
              const complete = done.has(lesson.id);
              return (
                <div
                  key={lesson.id}
                  className={`px-3 py-2.5 ${lesson.id === suggested ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.name}</span>
                    {complete ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="size-3" /> Complete
                      </Badge>
                    ) : lesson.id === suggested ? (
                      <Badge variant="outline">Next up</Badge>
                    ) : null}
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {LESSON_KIND_LABEL[lesson.kind]}
                    </Badge>
                    {editable ? (
                      <GradeDialog
                        progress={p}
                        lesson={lesson}
                        existing={records.find((r) => !r.instructorSignedAt) ?? null}
                      />
                    ) : null}
                  </div>

                  {records.length ? (
                    <div className="mt-2 space-y-1.5 pl-7">
                      {records.map((r) => (
                        <RecordRow
                          key={r.id}
                          record={r}
                          superseded={superseded.has(r.id)}
                          editable={editable}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RecordRow({
  record,
  superseded,
  editable,
}: {
  record: LessonRecord;
  superseded: boolean;
  editable: boolean;
}) {
  const state = recordState(record);
  const sign = useSignLessonRecord();

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-xs ${
        superseded ? "opacity-50" : ""
      }`}
    >
      {record.grade ? (
        <Badge variant={record.grade.toUpperCase() === "S" ? "secondary" : "outline"}>{record.grade}</Badge>
      ) : null}
      <span className={superseded ? "line-through" : undefined}>{state.label}</span>
      {superseded ? <Badge variant="outline">Superseded</Badge> : null}
      {record.flightDeciHours ? <span className="text-muted-foreground">{deciHours(record.flightDeciHours)} flight</span> : null}
      {record.instructionDeciHours ? (
        <span className="text-muted-foreground">{deciHours(record.instructionDeciHours)} ground</span>
      ) : null}
      {record.instructor?.user?.name ? (
        <span className="text-muted-foreground">· {record.instructor.user.name}</span>
      ) : null}

      <span className="flex-1" />

      {editable && !record.instructorSignedAt ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          disabled={!record.grade || sign.isPending}
          onClick={() => sign.mutate({ recordId: record.id })}
        >
          <FileSignature className="size-3" /> Sign
        </Button>
      ) : null}

      {editable && record.instructorSignedAt && !superseded ? (
        <AmendDialog recordId={record.id} />
      ) : null}
    </div>
  );
}

/**
 * Grading, as one dialog.
 *
 * The times default to whatever the syllabus says the lesson should take, so the common
 * case is: open, confirm, sign. An instructor typing 1.5 into a box that already says 1.5
 * is the kind of friction that makes people go back to paper.
 */
function GradeDialog({
  progress,
  lesson,
  existing,
}: {
  progress: EnrollmentProgress;
  lesson: SyllabusLesson;
  existing: LessonRecord | null;
}) {
  const [open, setOpen] = useState(false);
  //The course's own marks, as codes, whatever shape the payload carries. Reading
  //`gradingScale` straight used to render `[object Object]` in this dropdown for any
  //school that had saved a custom scale, which is every school that used the feature.
  const scale = gradeCodesOf(progress.enrollment.courseVersion);

  const [grade, setGrade] = useState(existing?.grade ?? scale[0] ?? "S");
  const [flight, setFlight] = useState(
    deciHours(existing?.flightDeciHours ?? lesson.minFlightDeciHours ?? null).replace("—", "")
  );
  const [ground, setGround] = useState(
    deciHours(existing?.instructionDeciHours ?? lesson.minGroundDeciHours ?? null).replace("—", "")
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [warning, setWarning] = useState<string | null>(null);
  //Of the flight hours above, how many were flown in a device. Offered on a simulator
  //lesson, and on any record that already carries the figure: a record that HAS sim hours
  //must not lose them silently because this dialog decided not to ask.
  const [sim, setSim] = useState(
    existing?.simulatorDeciHours != null ? (existing.simulatorDeciHours / 10).toFixed(1) : ""
  );
  const showSim = lesson.kind === "sim" || existing?.simulatorDeciHours != null;
  const needsNotes = lesson.requiresNotes === true;
  const tasks = lesson.tasks ?? [];
  const [taskMarks, setTaskMarks] = useState(() => taskGradeMap(existing?.taskGrades));

  const save = useSaveLessonRecord();
  const sign = useSignLessonRecord();

  const toDeci = (v: string): number | null => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 10);
  };

  const submit = async (thenSign: boolean) => {
    const saved = await save.mutateAsync({
      enrollmentId: progress.enrollment.id,
      lessonId: lesson.id,
      recordId: existing?.id,
      grade,
      notes: notes.trim() || null,
      flightDeciHours: toDeci(flight),
      instructionDeciHours: toDeci(ground),
      simulatorDeciHours: showSim ? toDeci(sim) : undefined,
      //Absent when the lesson has no tasks, because an empty array MEANS "clear them all"
      //server-side. Sending one from a form that never showed a task list would wipe grades
      //the phone had written.
      ...(tasks.length ? { taskGrades: taskGradePayload(taskMarks) } : {}),
    });
    if (saved.warning && !thenSign) {
      setWarning(saved.warning);
      return;
    }
    if (thenSign) await sign.mutateAsync({ recordId: saved.id });
    setOpen(false);
    setWarning(null);
  };

  const busy = save.isPending || sign.isPending;
  const error = (save.error ?? sign.error) as Error | null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2">
          <PenLine className="size-3.5" /> {existing ? "Continue" : "Grade"}
        </Button>
      </DialogTrigger>
      <DialogContent data-doc-shot="grade-lesson-dialog">
        <DialogHeader>
          <DialogTitle>{lesson.name}</DialogTitle>
          <DialogDescription>
            {lesson.completionStandards ?? "Record what happened and sign it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Grade</Label>
            <Select value={grade} onValueChange={setGrade}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scale.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="flight-hrs">Flight hours</Label>
              <Input
                id="flight-hrs"
                inputMode="decimal"
                value={flight}
                onChange={(e) => setFlight(e.target.value)}
                placeholder="1.5"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ground-hrs">Ground / instruction hours</Label>
              <Input
                id="ground-hrs"
                inputMode="decimal"
                value={ground}
                onChange={(e) => setGround(e.target.value)}
                placeholder="0.8"
              />
            </div>
          </div>

          {/* Device time, on the lessons that have any. It is a SUBSET of the flight hours
              above rather than a figure beside them, which is what makes the course's
              simulator ceiling apply to it: hours typed only into Flight are credited as
              aircraft time and the ceiling never sees them. Saying so here is the
              difference between a Part 141 course that stays inside Appendix B and one
              that quietly does not. */}
          {showSim && (
            <div className="space-y-1">
              <Label htmlFor="sim-hrs">Of which, simulator hours</Label>
              <Input
                id="sim-hrs"
                inputMode="decimal"
                value={sim}
                onChange={(e) => setSim(e.target.value)}
                placeholder="1.0"
              />
              <p className="text-xs text-muted-foreground">
                Part of the flight hours above, not extra. Counted against the course&rsquo;s
                simulator allowance.
              </p>
            </div>
          )}

          <TaskGradeList tasks={tasks} scale={scale} value={taskMarks} onChange={setTaskMarks} />

          <div className="space-y-1">
            {/* A lesson can be marked "Notes required" in the syllabus. The server refuses
                to sign one without them, so a Save and sign that could only fail is worth
                disabling rather than leaving to be discovered. Save draft stays open: a
                half-written record is exactly what a draft is for. */}
            <Label htmlFor="record-notes">
              Notes{needsNotes && <span className="ml-1 text-muted-foreground">(required)</span>}
            </Label>
            <Textarea
              id="record-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What the student did well, and what to work on."
            />
            {needsNotes && !notes.trim() && (
              <p className="text-xs text-muted-foreground">
                This lesson needs notes before it can be signed.
              </p>
            )}
          </div>

          {/* What this lesson will post if signed — shown BEFORE signing, because the
              signature is what freezes it. */}
          {lesson.creditsWhat.length ? (
            <p className="text-xs text-muted-foreground">
              Signing credits{" "}
              {lesson.creditsWhat
                .map(
                  (c) =>
                    progress.enrollment.courseVersion.requirements.find((r) => r.id === c.requirementId)
                      ?.label
                )
                .filter(Boolean)
                .join(", ")}
              .
            </p>
          ) : null}
        </div>

        {warning ? (
          <p className="flex items-start gap-1.5 text-sm text-amber-600">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {warning}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => submit(false)}>
            Save draft
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled={busy || (needsNotes && !notes.trim())}
                onClick={() => submit(true)}
              >
                <FileSignature className="size-4" /> Save and sign
              </Button>
            </TooltipTrigger>
            <TooltipContent>Signing locks this record. Corrections are added alongside it.</TooltipContent>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AmendDialog({ recordId }: { recordId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const amend = useAmendLessonRecord();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
          <RotateCcw className="size-3" /> Amend
        </Button>
      </DialogTrigger>
      <DialogContent data-doc-shot="amend-record-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            Amend this record
            <DocsHint topic="amend-signed-lesson" />
          </DialogTitle>
          <DialogDescription>
            A signed record is never edited. This adds a correction beside it and takes back the hours the
            original credited — both stay on the record. The correction has to be signed before it counts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="amend-reason">Why</Label>
          <Textarea
            id="amend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Landed 12 minutes before official night."
          />
        </div>

        {amend.error ? <p className="text-sm text-destructive">{(amend.error as Error).message}</p> : null}

        <DialogFooter>
          <Button
            disabled={reason.trim().length < 3 || amend.isPending}
            onClick={async () => {
              await amend.mutateAsync({ recordId, reason: reason.trim() });
              setOpen(false);
              setReason("");
            }}
          >
            Amend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The ledger, shown as a ledger.
 *
 * Reversals are not hidden and the arithmetic is visible, because that is the whole point:
 * "why does this read 41.2 hours?" has to stay answerable a year later.
 */
function LedgerTab({ progress }: { progress: EnrollmentProgress }) {
  const requirements = new Map(progress.enrollment.courseVersion.requirements.map((r) => [r.id, r]));
  const rows = [...progress.enrollment.credits].sort((a, b) => b.id - a.id);

  //Every entry that some other entry already takes back. The server refuses a second
  //reversal, so showing the button on one would be offering a 409.
  const alreadyReversed = new Set(
    progress.enrollment.credits.map((c) => c.reversesId).filter((v): v is number => v != null)
  );

  //`POST /training/credits/{id}/reverse` is hasTrainingGrant("manageEnrollment"), same as
  //posting one. Fails closed while the grants are in flight.
  const mine = useMyTrainingGrants();
  const canReverse = holdsTrainingGrant(mine.data, "manageEnrollment");

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nothing credited yet"
        body="Hours appear here the moment a lesson is signed — one flight can post to several requirements at once."
      />
    );
  }

  return (
    <Card className="divide-y p-0" data-doc-shot="enrollment-ledger">
      {rows.map((c) => {
        const requirement = requirements.get(c.requirementId);
        const isReversal = c.source === "reversal";
        const amount = c.deciHours != null ? `${c.deciHours > 0 ? "+" : ""}${deciHours(c.deciHours)}` : `${c.count! > 0 ? "+" : ""}${c.count}`;
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className={`w-16 shrink-0 text-right tabular-nums ${isReversal ? "text-destructive" : ""}`}>
              {amount}
            </span>
            <span className="min-w-0 flex-1 truncate">{requirement?.label ?? "Unknown requirement"}</span>
            <Badge variant={isReversal ? "danger" : "outline"} className="text-[10px]">
              {c.source.replace("_", " ")}
            </Badge>
            {c.notes ? (
              <span className="w-full truncate text-xs text-muted-foreground sm:w-auto sm:max-w-[40%]">
                {c.notes}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {new Date(c.createdAt).toLocaleDateString()}
            </span>
            {/* Only entries posted BY HAND get the button. A credit that came from a signed
                lesson is taken back by amending the lesson, which reverses it for you and
                keeps the record and the ledger telling the same story; reversing it here
                would leave a signed lesson whose hours had silently gone. */}
            {canReverse && !isReversal && c.lessonRecordId == null && !alreadyReversed.has(c.id) ? (
              <ReverseCreditDialog creditId={c.id} amount={amount} label={requirement?.label ?? "this requirement"} />
            ) : null}
          </div>
        );
      })}
    </Card>
  );
}

/**
 * Take back a credit somebody posted by hand.
 *
 * The endpoint has existed since the module shipped and nothing in the console called it,
 * so a school that typed 40.0 instead of 4.0 into "credit prior training" had a wrong
 * number on a student's record and no way to correct it. The ledger is append-only by
 * design, so this does not delete anything: it writes the negative beside the original and
 * both stay visible, which is the point of a ledger.
 */
function ReverseCreditDialog({
  creditId,
  amount,
  label,
}: {
  creditId: number;
  amount: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reverse = useReverseRequirementCredit();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
          <RotateCcw className="size-3" /> Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this credit</DialogTitle>
          <DialogDescription>
            Takes back {amount} against {label}. Nothing is deleted: the reversal is written
            beside the original and both stay on the record, because a student's hours have
            to stay answerable a year later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="reverse-reason">Why</Label>
          <Textarea
            id="reverse-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Logged 40.0 by mistake; their logbook shows 4.0."
          />
        </div>

        {reverse.error ? (
          <p className="text-sm text-destructive">{(reverse.error as Error).message}</p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button
            disabled={reason.trim().length < 3 || reverse.isPending}
            onClick={async () => {
              await reverse.mutateAsync({ creditId, reason: reason.trim() });
              setOpen(false);
              setReason("");
            }}
          >
            Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GraduateButton({ progress }: { progress: EnrollmentProgress }) {
  const [open, setOpen] = useState(false);
  const [certificate, setCertificate] = useState("");
  const graduate = useGraduateStudent();

  if (progress.enrollment.status !== "enrolled") return null;

  const blocked = !!progress.graduationBlocker;
  const is141 = progress.enrollment.courseVersion.course.regulatoryPart === "part141";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={blocked} variant={blocked ? "outline" : "default"}>
          <GraduationCap className="size-4" /> Graduate
        </Button>
      </DialogTrigger>
      <DialogContent data-doc-shot="graduate-dialog">
        <DialogHeader>
          <DialogTitle>Graduate this student</DialogTitle>
          <DialogDescription>
            {/* "Issues" promised a document. Nothing is generated — the number below is
                typed in and stored against the record, which is what a school needs for the
                audit trail and is not the same as producing the certificate. */}
            {is141
              ? "Records the §141.95 graduation certificate number against this student and closes the enrollment. Their record stays exactly as it is."
              : "Closes the enrollment. Their record stays exactly as it is."}
          </DialogDescription>
        </DialogHeader>

        {is141 ? (
          <div className="space-y-1">
            <Label htmlFor="grad-cert">Graduation certificate number</Label>
            <Input
              id="grad-cert"
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
            />
          </div>
        ) : null}

        {graduate.error ? (
          <p className="text-sm text-destructive">{(graduate.error as Error).message}</p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={graduate.isPending}
            onClick={async () => {
              await graduate.mutateAsync({
                enrollmentId: progress.enrollment.id,
                graduationCertificateNumber: certificate.trim() || undefined,
              });
              setOpen(false);
            }}
          >
            Graduate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Graduate, certify, terminate, transfer.
 *
 * All four together, because they are the same decision seen from different angles — this
 * enrollment is ending, and how it ends is what §141.101 asks the school to record. Splitting
 * them across the page would make "they moved to another school" a hunt.
 */
function EnrollmentActions({ progress }: { progress: EnrollmentProgress }) {
  const [ending, setEnding] = useState<"terminated" | "transferred" | null>(null);
  const [reason, setReason] = useState("");
  const end = useEndEnrollment();
  const certify = useCertifyEnrollment();
  const mine = useMyTrainingGrants();

  const e = progress.enrollment;
  if (e.status !== "enrolled") return null;

  //Every action below is `hasTrainingGrant("manageEnrollment")` on the server. This page
  //is open to any member — a student reads their own record here, and their instructor
  //reads it too — so offering these unconditionally put a "Graduate" button in front of
  //the student it would graduate. Fails closed while the grants load.
  if (!holdsTrainingGrant(mine.data, "manageEnrollment")) return null;

  const is141 = e.courseVersion.course.regulatoryPart === "part141";

  return (
    <div className="flex flex-wrap gap-2">
      {/* §141.85 — the chief instructor certifying the record. Only shown for Part 141,
          because under Part 61 nobody is asking for it and a button that means nothing is
          a button somebody will press anyway. */}
      {is141 && !e.certifiedAt ? (
        <Button variant="outline" disabled={certify.isPending} onClick={() => certify.mutate(e.id)}>
          <FileSignature className="size-4" /> Certify record
        </Button>
      ) : null}

      <GraduateButton progress={progress} />

      <Dialog open={!!ending} onOpenChange={(o) => !o && setEnding(null)}>
        <Button variant="outline" onClick={() => setEnding("terminated")}>
          End enrollment
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this enrollment</DialogTitle>
            <DialogDescription>
              Their record stays exactly as it is — §141.101 keeps it either way. This only records
              that they stopped, and why.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={ending === "terminated" ? "default" : "outline"}
                onClick={() => setEnding("terminated")}
              >
                Terminated
              </Button>
              <Button
                type="button"
                size="sm"
                variant={ending === "transferred" ? "default" : "outline"}
                onClick={() => setEnding("transferred")}
              >
                Transferred out
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="end-reason">Reason</Label>
              <Textarea
                id="end-reason"
                rows={2}
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                placeholder="Moved away; transferring to another school."
              />
            </div>
          </div>

          {end.error ? <p className="text-sm text-destructive">{(end.error as Error).message}</p> : null}

          <DialogFooter>
            <Button
              disabled={end.isPending || !ending}
              onClick={async () => {
                await end.mutateAsync({ enrollmentId: e.id, status: ending!, reason: reason.trim() || undefined });
                setEnding(null);
                setReason("");
              }}
            >
              Record it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
