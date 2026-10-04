import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Copy,
  GraduationCap,
  Lock,
  Plane,
  Target,
  UserPlus,
} from "lucide-react";
import {
  useCourse,
  useCourseVersion,
  useCreateCourseVersion,
  useEnrollStudent,
  useEnrollments,
  useMembers,
  usePublishCourseVersion,
  useRetireCourseVersion,
  useMyTrainingGrants,
} from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { LESSON_KIND_LABEL, PART_LABEL, STATUS_LABEL, deciHoursLabel, holdsTrainingGrant } from "@/lib/training";
import { formatDate } from "@/lib/utils";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { EnrollmentProgress } from "@/components/training/enrollment-progress";
import { rolesOf } from "@/types/api";
import type { CourseRequirement, CourseVersion, EnrollmentStatus, EnrollmentSummary, SyllabusLesson } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { DetailBack, useDetailTitle } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { EmptyState, ErrorState } from "@/components/states";
import { RequirementsEditor, SyllabusEditor } from "@/components/training/syllabus-editor";
import { CourseFeeEditor } from "@/components/training/course-fee-editor";
import { CourseSettings } from "@/components/training/course-settings";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

//A top-level route (`training_.` breaks the nesting) rather than a child of /training,
//so Back from here goes to wherever the user came from and never materialises a list
//underneath. See the add-page-or-notification checklist.
export const Route = createFileRoute("/_authed/training_/$courseId")({
  beforeLoad: guardRoute("/training"),
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: CourseDetailPage,
});

/**
 * The three things a course is: what gets taught, what has to add up, and who is on it.
 *
 * A rail rather than tabs, like every other sectioned page in the console, and here it
 * also buys the syllabus its own scroll, so the version selector and the published/draft
 * badge stay on screen instead of scrolling away above thirty lessons.
 */
const SECTIONS: RailSection[] = [
  {
    items: [
      { value: "syllabus", label: "Syllabus", icon: BookOpen },
      { value: "requirements", label: "Requirements", icon: Target },
      { value: "students", label: "Students", icon: GraduationCap },
    ],
  },
];

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const course = useCourse(Number(courseId));
  const [versionId, setVersionId] = useState<number | null>(null);

  const active = SECTIONS[0]!.items.some((i) => i.value === tab) ? tab! : "syllabus";
  const pick = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true });
  };

  const versions = course.data?.versions ?? [];
  //Default to what students are actually being trained against; fall back to the newest
  //draft when nothing is published yet.
  const selected =
    versionId ??
    versions.find((v) => v.publishedAt && !v.retiredAt)?.id ??
    versions[0]?.id ??
    null;

  const version = useCourseVersion(selected ?? undefined);
  useDetailTitle(course.data?.name);

  if (course.error) return <ErrorState error={course.error} />;
  if (course.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!course.data) return <ErrorState error={new Error("That course does not exist.")} />;

  const c = course.data;

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <DetailBack to="/training" label="Training" />

        <PageHeader
          title={c.name}
          subtitle={c.description ?? undefined}
          actions={
            <div className="flex flex-wrap gap-2">
              {selected && !c.archivedAt ? <EnrollDialog versionId={selected} courseName={c.name} /> : null}
              {selected && version.data && !version.data.publishedAt ? (
                <>
                  <PublishDialog version={version.data} />
                  <DocsHint topic="publish-syllabus" className="self-center" />
                </>
              ) : null}
              {selected && version.data?.publishedAt ? (
                <>
                  <NewVersionDialog courseId={c.id} fromVersionId={selected} />
                  <RetireButton version={version.data} />
                </>
              ) : null}
            </div>
          }
        />

        {/* Which version you are looking at governs all three sections, so it stays with
            the page rather than sitting inside one of them. */}
        <div className="flex flex-wrap items-center gap-2" data-doc-shot="syllabus-published-locked">
          <Badge variant={c.regulatoryPart === "part141" ? "default" : "outline"}>
            {PART_LABEL[c.regulatoryPart]}
          </Badge>
          {/* An archived course is still reachable by link and still holds live records, so
              the page has to say so rather than looking like any other course. */}
          {c.archivedAt ? (
            <Badge variant="outline" className="gap-1">
              <Archive className="size-3" /> Archived
            </Badge>
          ) : null}
          {versions.length > 1 ? (
            <>
              <DocsHint topic="syllabus-version" />
              <Select value={String(selected ?? "")} onValueChange={(v) => setVersionId(Number(v))}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.label}
                      {v.publishedAt ? " · published" : " · draft"}
                      {v.retiredAt ? " · retired" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
          {version.data?.publishedAt ? (
            <Badge variant="secondary" className="gap-1">
              <Lock className="size-3" /> Locked: students are enrolled against these lessons
            </Badge>
          ) : (
            <Badge variant="outline">Draft. Safe to edit</Badge>
          )}
        </div>
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="Course" sections={SECTIONS} value={active} onChange={pick} />

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto">
          {version.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : version.data ? (
            <>
              {/* A draft gets the editor; a published version gets the read-only view. Not a
                  disabled editor: offering a greyed-out pencil on every row of a locked syllabus
                  reads as broken, where showing the syllabus plainly reads as finished. */}
              {active === "syllabus" &&
                (version.data.publishedAt ? (
                  <SyllabusView version={version.data} />
                ) : (
                  <SyllabusEditor key={version.data.id} version={version.data} />
                ))}

              {active === "requirements" &&
                (version.data.publishedAt ? (
                  <RequirementsView version={version.data} />
                ) : (
                  <RequirementsEditor key={version.data.id} version={version.data} />
                ))}

              {active === "students" && (
                <>
                  {/* Above the roster: what a student pays is the first thing you set before
                      enrolling anybody, and hunting for it under a published syllabus you
                      cannot edit is the wrong shape. */}
                  <CourseFeeEditor course={c} />
                  <CourseSettings course={c} />
                  <StudentsView courseId={c.id} />
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </TableView>
  );
}

const KIND_ICON = { flight: Plane, ground: BookOpen, sim: ClipboardList } as const;

const LESSON_COLUMNS: ListTableColumn[] = [
  { id: "kind", header: "Kind", width: "5.5rem" },
  // The lesson's own minimum, flight and ground; blank when it sets none.
  { id: "minimum", header: "Minimum", width: "12.5rem" },
  { id: "tasks", header: "Tasks", width: "5rem", align: "end", narrow: "keep" },
];

/** "1.5 hrs flight · 1.0 hrs ground", or "" when the lesson sets no minimum. */
function minimumText(lesson: SyllabusLesson): string {
  return [
    // `minFlightDeciHours` is aircraft OR sim time: on a simulator lesson it is sim time.
    lesson.minFlightDeciHours ? `${deciHoursLabel(lesson.minFlightDeciHours)} ${lesson.kind === "sim" ? "sim" : "flight"}` : null,
    lesson.minGroundDeciHours ? `${deciHoursLabel(lesson.minGroundDeciHours)} ground` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A published syllabus, read-only: its stages as groups, their lessons as rows, each lesson's
 * tasks folded beneath it. A ListTable since 2026-09-30 (it was a card per stage of
 * expanding rows). A lesson's prose, its objectives, completion standards and what it credits,
 * opens in a dialog from the row, so the list stays a list and nothing the old rows showed is lost.
 */
function SyllabusView({ version }: { version: CourseVersion }) {
  const requirementsById = new Map(version.requirements.map((r) => [r.id, r]));
  const [reading, setReading] = useState<SyllabusLesson | null>(null);

  if (version.stages.length === 0) {
    return (
      <EmptyState
        graphic="stages"
        title="No stages yet"
        body="A syllabus is stages of lessons. Add the first stage from the syllabus editor to start building."
        docs="build-a-syllabus"
      />
    );
  }

  const groups: ListTableGroup[] = version.stages.map((stage) => ({
    id: `stage-${stage.id}`,
    label: (
      <span className="inline-flex min-w-0 items-center gap-2" title={stage.objective ?? undefined}>
        <span className="truncate">{stage.name}</span>
        {stage.objective ? <span className="truncate font-normal text-muted-foreground">{stage.objective}</span> : null}
      </span>
    ),
    // Marked when the stage requires a check or any lesson in it is one, so the marker and a
    // lesson's "Stage check" tag can't disagree.
    marker:
      stage.requiresStageCheck || stage.lessons.some((l) => l.isStageCheck) ? (
        <span title="Has a stage check" className="inline-flex">
          <CheckCircle2 className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">Has a stage check</span>
        </span>
      ) : undefined,
    count: `${stage.lessons.length} ${stage.lessons.length === 1 ? "lesson" : "lessons"}`,
    rows: stage.lessons.map((lesson): ListTableRow => {
      const Icon = KIND_ICON[lesson.kind] ?? BookOpen;
      return {
        id: `lesson-${lesson.id}`,
        testId: `syllabus-lesson-${lesson.id}`,
        label: lesson.name,
        leading: <Icon className="size-4 text-muted-foreground" aria-hidden />,
        title: lesson.name,
        tags: lesson.isStageCheck ? <ListTag>Stage check</ListTag> : undefined,
        subtitle: lesson.objectives ?? undefined,
        defaultFolded: true,
        onOpen: () => setReading(lesson),
        cells: {
          kind: <span className="text-muted-foreground">{LESSON_KIND_LABEL[lesson.kind]}</span>,
          minimum: <span className="text-muted-foreground">{minimumText(lesson)}</span>,
          tasks: lesson.tasks.length ? <span className="tnum">{lesson.tasks.length}</span> : <span className="text-muted-foreground">None</span>,
        },
        children: lesson.tasks.map((t) => ({
          id: `task-${t.id}`,
          label: t.name,
          title: t.name,
          tags: t.acsCode ? <ListTag className="font-mono">{t.acsCode}</ListTag> : undefined,
        })),
      };
    }),
  }));

  return (
    <>
      <ListTable
        label="Syllabus"
        docShot="course-syllabus"
        columns={LESSON_COLUMNS}
        groups={groups}
        titleHeader="Lesson"
        showHeader
        childNoun="tasks"
      />
      <LessonDialog lesson={reading} requirementsById={requirementsById} onClose={() => setReading(null)} />
    </>
  );
}

/** One lesson in full: what the old expanding row showed, from a click on its row. */
function LessonDialog({
  lesson,
  requirementsById,
  onClose,
}: {
  lesson: SyllabusLesson | null;
  requirementsById: Map<number, CourseRequirement>;
  onClose: () => void;
}) {
  return (
    <ResponsiveModal
      open={lesson != null}
      onOpenChange={(o) => !o && onClose()}
      title={lesson?.name ?? ""}
      description={
        lesson ? [LESSON_KIND_LABEL[lesson.kind], minimumText(lesson), lesson.isStageCheck ? "Stage check" : null].filter(Boolean).join(" · ") : undefined
      }
    >
      {lesson ? (
        <div className="space-y-4">
          {lesson.objectives ? (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Objectives</div>
              <p className="mt-1 text-sm">{lesson.objectives}</p>
            </div>
          ) : null}
          {lesson.completionStandards ? (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Completion standards</div>
              <p className="mt-1 text-sm">{lesson.completionStandards}</p>
            </div>
          ) : null}
          {lesson.tasks.length ? (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Tasks</div>
              <ul className="mt-1 space-y-1">
                {lesson.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <Target className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span>{t.name}</span>
                    {t.acsCode ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t.acsCode}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* This is the fan-out, made visible: one signed lesson posts to all of these at
              once, which is the thing a ticked-checkbox gradebook cannot do. */}
          {lesson.creditsWhat.length ? (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground">Credits toward</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lesson.creditsWhat.map((c) => {
                  const requirement = requirementsById.get(c.requirementId);
                  if (!requirement) return null;
                  return (
                    <Badge key={c.id} variant="secondary" className="gap-1">
                      {requirement.label}
                      <span className="text-[10px] opacity-70">{c.creditFrom === "count" ? "per lesson" : `${c.creditFrom} time`}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>
          ) : null}
          {!lesson.objectives && !lesson.completionStandards && !lesson.tasks.length && !lesson.creditsWhat.length ? (
            <p className="text-sm text-muted-foreground">Nothing more is written for this lesson.</p>
          ) : null}
        </div>
      ) : null}
    </ResponsiveModal>
  );
}

function RequirementsView({ version }: { version: CourseVersion }) {
  if (version.requirements.length === 0) {
    return (
      <EmptyState
        graphic="requirements"
        title="No requirements"
        body="Nothing will accumulate as lessons are signed until this syllabus says what a student has to build up."
        docs="requirement-source"
      />
    );
  }

  return (
    <Card className="divide-y p-0">
      {version.requirements.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{r.label}</div>
            <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
          </div>
          <div className="text-sm tabular-nums">
            {r.minDeciHours != null ? deciHoursLabel(r.minDeciHours) : `${r.minCount ?? "–"}`}
          </div>
          <Badge variant={r.source === "school" ? "outline" : "secondary"}>
            {r.source === "school" ? "Organization" : PART_LABEL[r.source]}
          </Badge>
          {r.maxSimulatorBps ? (
            <Badge variant="outline" className="text-xs">
              sim ≤ {r.maxSimulatorBps / 100}%
            </Badge>
          ) : null}
          {r.maxTransferBps ? (
            <Badge variant="outline" className="text-xs">
              transfer ≤ {r.maxTransferBps / 100}%
            </Badge>
          ) : null}
        </div>
      ))}
    </Card>
  );
}

const STUDENT_COLUMNS: ListTableColumn[] = [
  { id: "version", header: "Version", width: "6rem" },
  { id: "progress", header: "Progress", width: "10rem", narrow: "keep" },
  // Says which date it is, by where the student stands.
  { id: "date", header: "Date", width: "10rem" },
];

/** The roster's groups, in the order a chief instructor reads it: who is training now first. */
const STATUS_ORDER: EnrollmentStatus[] = ["enrolled", "graduated", "transferred", "terminated"];

function statusDate(e: EnrollmentSummary): string {
  const at =
    e.status === "graduated" ? e.graduatedAt : e.status === "terminated" ? e.terminatedAt : e.status === "transferred" ? e.transferredAt : e.enrolledAt;
  const verb = e.status === "enrolled" ? "Enrolled" : STATUS_LABEL[e.status];
  // The status stamp should always be there; when an old row lacks it, say only the status.
  return at ? `${verb} ${formatDate(at, "MMM d, yyyy", "")}` : verb;
}

/**
 * Everyone ever enrolled on this course, by where they stand. A ListTable since 2026-09-30.
 * A row opens the student's training record.
 */
function StudentsView({ courseId }: { courseId: number }) {
  const enrollments = useEnrollments({ courseId });
  const navigate = useNavigate();
  const rows = enrollments.data ?? [];

  if (enrollments.isLoading) return <ListTableSkeleton columns={STUDENT_COLUMNS} groups={2} rows={3} toolbar={false} />;
  if (enrollments.isError) return <ErrorState error={enrollments.error} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        graphic="enrolled"
        title="Nobody enrolled yet"
        body="Enroll a student to start recording their training."
        docs="enrolling-a-student"
      />
    );
  }

  const groups: ListTableGroup[] = STATUS_ORDER.map((status) => {
    const members = rows
      .filter((e) => e.status === status)
      .sort((a, b) => (a.student?.user?.name ?? "").localeCompare(b.student?.user?.name ?? ""));
    return {
      id: status,
      label: STATUS_LABEL[status],
      count: members.length,
      rows: members.map((e): ListTableRow => {
        const name = e.student?.user?.name ?? "Unknown";
        return {
          id: `enrollment-${e.id}`,
          testId: `course-enrollment-${e.id}`,
          label: name,
          leading: e.student ? <WorkspaceUserAvatar person={{ id: e.student.id, name }} /> : undefined,
          title: name,
          dim: status === "terminated",
          onOpen: () => void navigate({ to: "/training/enrollments/$enrollmentId", params: { enrollmentId: String(e.id) } }),
          cells: {
            version: <span className="text-muted-foreground">{e.courseVersion?.label}</span>,
            progress: <EnrollmentProgress enrollment={e} />,
            date: <span className="text-muted-foreground">{statusDate(e)}</span>,
          },
        };
      }),
    };
  });

  return <ListTable label="Students on this course" docShot="course-students" columns={STUDENT_COLUMNS} groups={groups} titleHeader="Student" showHeader />;
}

function PublishDialog({ version }: { version: CourseVersion }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const publish = usePublishCourseVersion();
  const is141 = version.course.regulatoryPart === "part141";
  const lessons = version.stages.reduce((n, s) => n + s.lessons.length, 0);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
          <Lock className="size-4" /> Publish
        </Button>
      <ResponsiveModal
      open={open} onOpenChange={setOpen}
      title={<>Publish {version.label}?</>}
      description={<>{/* Said plainly, because it is the one irreversible act in this module and the
                consequence is invisible until somebody tries to fix a typo. */}
            Publishing locks this version permanently. Its {lessons} lessons, tasks and requirements can
            never be changed again, students will be enrolled against exactly these. To revise it later you
            make a new version from this one, and anyone already enrolled finishes on the old.</>}
      footer={<><Button variant="outline" onClick={() => setOpen(false)}>
            Keep editing
          </Button>
          <Button
            disabled={publish.isPending}
            onClick={async () => {
              await publish.mutateAsync({
                versionId: version.id,
                approvalReference: reference.trim() || undefined,
              });
              setOpen(false);
            }}
          >
            Publish and lock
          </Button></>}
      data-doc-shot="syllabus-publish-dialog"
    >

        

        {is141 ? (
          <div className="space-y-1">
            <Label htmlFor="approval-ref">FSDO approval reference (optional)</Label>
            <Input
              id="approval-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="As filed with your POI"
            />
          </div>
        ) : null}

        {publish.error ? (
          <p className="text-sm text-destructive">{(publish.error as Error).message}</p>
        ) : null}
    </ResponsiveModal>
    </>
  );
}

function NewVersionDialog({ courseId, fromVersionId }: { courseId: number; fromVersionId: number }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const create = useCreateCourseVersion();

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
          <Copy className="size-4" /> New version
        </Button>
      <ResponsiveModal
      open={open} onOpenChange={setOpen}
      title="Revise this syllabus"
      description={<>Copies every stage, lesson, task and requirement into a new editable draft. The published version
            and everyone enrolled on it are untouched.</>}
      footer={<><Button
            disabled={!label.trim() || create.isPending}
            onClick={async () => {
              await create.mutateAsync({ courseId, label: label.trim(), copyFromVersionId: fromVersionId });
              setOpen(false);
              setLabel("");
            }}
          >
            Create draft
          </Button></>}
    >

        

        <div className="space-y-1">
          <Label htmlFor="version-label">Version name</Label>
          <Input
            id="version-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Rev B"
          />
        </div>

        {create.error ? <p className="text-sm text-destructive">{(create.error as Error).message}</p> : null}
    </ResponsiveModal>
    </>
  );
}

function EnrollDialog({ versionId, courseName }: { versionId: number; courseName: string }) {
  const [open, setOpen] = useState(false);
  const [orgUserId, setOrgUserId] = useState<string>("");
  const members = useMembers(undefined, { enabled: open });
  const enroll = useEnrollStudent();
  //POST /training/enrollments is manageEnrollment. Fail closed while grants load so a
  //syllabus editor is not offered a button the API will 403.
  const mine = useMyTrainingGrants();
  if (!holdsTrainingGrant(mine.data, "manageEnrollment")) return null;

  //Students first (they are who gets enrolled) but not students ONLY: schools put
  //instructors through their own courses (a CFI adding an instrument rating), and a roster
  //that hides them makes that impossible without a role change.
  const candidates = (members.data ?? [])
    .filter((m) => !m.archivedAt)
    .sort((a, b) => {
      const aStudent = rolesOf(a).includes("student") ? 0 : 1;
      const bStudent = rolesOf(b).includes("student") ? 0 : 1;
      return aStudent - bStudent || (a.user?.name ?? "").localeCompare(b.user?.name ?? "");
    });

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
          <UserPlus className="size-4" /> Enroll a student
        </Button>
      <ResponsiveModal
      open={open} onOpenChange={setOpen}
      title={<>Enroll on {courseName}</>}
      description={<>The student is pinned to this version of the syllabus. Revising the course later will not change
            what they are being trained against.</>}
      footer={<><Button
            disabled={!orgUserId || enroll.isPending}
            onClick={async () => {
              await enroll.mutateAsync({ versionId, orgUserId: Number(orgUserId) });
              setOpen(false);
              setOrgUserId("");
            }}
          >
            Enroll
          </Button></>}
      data-doc-shot="training-enroll-dialog"
    >

        

        <div className="space-y-1">
          <Label>Student</Label>
          <Select value={orgUserId} onValueChange={setOrgUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a member" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.user?.name ?? m.user?.email ?? `Member ${m.id}`}
                  {rolesOf(m).includes("student") ? "" : " (staff)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {enroll.error ? <p className="text-sm text-destructive">{(enroll.error as Error).message}</p> : null}
    </ResponsiveModal>
    </>
  );
}

/**
 * Retire, and un-retire.
 *
 * Additive and reversible on purpose: it only stops NEW enrollments, and everyone already on
 * the version finishes on it. That is the whole reason an enrollment pins a version, so the
 * copy says it rather than leaving an admin to guess whether this strands anyone.
 */
function RetireButton({ version }: { version: CourseVersion }) {
  const retire = useRetireCourseVersion();
  const retired = !!version.retiredAt;

  return (
    <Button
      variant="outline"
      disabled={retire.isPending}
      onClick={() => {
        if (
          !retired &&
          !confirm(
            `Retire ${version.label}? No new students can be enrolled on it. Anyone already on it finishes on it.`
          )
        ) {
          return;
        }
        retire.mutate(
          { versionId: version.id, retired: !retired },
          {
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : "Couldn't update that version"),
          }
        );
      }}
    >
      <Archive className="size-4" /> {retired ? "Un-retire" : "Retire"}
    </Button>
  );
}
