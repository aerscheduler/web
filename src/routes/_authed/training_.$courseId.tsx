import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
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
} from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { LESSON_KIND_LABEL, PART_LABEL, deciHoursLabel } from "@/lib/training";
import { rolesOf } from "@/types/api";
import type { CourseRequirement, CourseVersion, SyllabusLesson } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/states";
import { RequirementsEditor, SyllabusEditor } from "@/components/training/syllabus-editor";
import { CourseFeeEditor } from "@/components/training/course-fee-editor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

//A top-level route (`training_.` breaks the nesting) rather than a child of /training,
//so Back from here goes to wherever the user came from and never materialises a list
//underneath. See the add-page-or-notification checklist.
export const Route = createFileRoute("/_authed/training_/$courseId")({
  beforeLoad: guardRoute("/training"),
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const { courseId } = Route.useParams();
  const course = useCourse(Number(courseId));
  const [versionId, setVersionId] = useState<number | null>(null);

  const versions = course.data?.versions ?? [];
  //Default to what students are actually being trained against; fall back to the newest
  //draft when nothing is published yet.
  const selected =
    versionId ??
    versions.find((v) => v.publishedAt && !v.retiredAt)?.id ??
    versions[0]?.id ??
    null;

  const version = useCourseVersion(selected ?? undefined);

  if (course.error) return <ErrorState error={course.error} />;
  if (course.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!course.data) return <ErrorState error={new Error("That course does not exist.")} />;

  const c = course.data;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/training">
          <ArrowLeft className="size-4" /> Training
        </Link>
      </Button>

      <PageHeader
        title={c.name}
        subtitle={c.description ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {selected ? <EnrollDialog versionId={selected} courseName={c.name} /> : null}
            {selected && version.data && !version.data.publishedAt ? (
              <PublishDialog version={version.data} />
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

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={c.regulatoryPart === "part141" ? "default" : "outline"}>
          {PART_LABEL[c.regulatoryPart]}
        </Badge>
        {versions.length > 1 ? (
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
        ) : null}
        {version.data?.publishedAt ? (
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" /> Locked — students are enrolled against these lessons
          </Badge>
        ) : (
          <Badge variant="outline">Draft — safe to edit</Badge>
        )}
      </div>

      {version.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : version.data ? (
        <Tabs defaultValue="syllabus">
          <TabsList>
            <TabsTrigger value="syllabus">Syllabus</TabsTrigger>
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
          </TabsList>

          {/* A draft gets the editor; a published version gets the read-only view. Not a
              disabled editor: offering a greyed-out pencil on every row of a locked syllabus
              reads as broken, where showing the syllabus plainly reads as finished. */}
          <TabsContent value="syllabus" className="mt-4">
            {version.data.publishedAt ? (
              <SyllabusView version={version.data} />
            ) : (
              <SyllabusEditor version={version.data} />
            )}
          </TabsContent>
          <TabsContent value="requirements" className="mt-4">
            {version.data.publishedAt ? (
              <RequirementsView version={version.data} />
            ) : (
              <RequirementsEditor version={version.data} />
            )}
          </TabsContent>
          <TabsContent value="students" className="mt-4">
            {/* Above the roster: what a student pays is the first thing you set before
                enrolling anybody, and hunting for it under a published syllabus you
                cannot edit is the wrong shape. */}
            <div className="mb-4">
              <CourseFeeEditor course={c} />
            </div>
            <StudentsView courseId={c.id} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

const KIND_ICON = { flight: Plane, ground: BookOpen, sim: ClipboardList } as const;

function SyllabusView({ version }: { version: CourseVersion }) {
  const requirementsById = new Map(version.requirements.map((r) => [r.id, r]));

  if (version.stages.length === 0) {
    return <EmptyState icon={BookOpen} title="No stages yet" body="This syllabus has no lessons in it." />;
  }

  return (
    <div className="space-y-4">
      {version.stages.map((stage) => (
        <Card key={stage.id} className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{stage.name}</h2>
            {stage.requiresStageCheck ? (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="size-3" /> Stage check
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">{stage.lessons.length} lessons</span>
          </div>
          {stage.objective ? (
            <p className="mb-3 text-sm text-muted-foreground">{stage.objective}</p>
          ) : null}

          <div className="divide-y rounded-md border">
            {stage.lessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} requirementsById={requirementsById} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function LessonRow({
  lesson,
  requirementsById,
}: {
  lesson: SyllabusLesson;
  requirementsById: Map<number, CourseRequirement>;
}) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[lesson.kind] ?? BookOpen;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-accent/40">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.name}</span>
        <Badge variant="outline" className="hidden sm:inline-flex">
          {LESSON_KIND_LABEL[lesson.kind]}
        </Badge>
        {lesson.minFlightDeciHours ? (
          <span className="hidden text-xs text-muted-foreground md:inline">
            {deciHoursLabel(lesson.minFlightDeciHours)}
          </span>
        ) : null}
        {lesson.tasks.length ? (
          <span className="text-xs text-muted-foreground">{lesson.tasks.length} tasks</span>
        ) : null}
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 border-t bg-muted/30 px-3 py-3">
        {lesson.objectives ? (
          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground">Objectives</div>
            <p className="mt-1 text-sm">{lesson.objectives}</p>
          </div>
        ) : null}
        {lesson.completionStandards ? (
          <div>
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Completion standards
            </div>
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
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Credits toward
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {lesson.creditsWhat.map((c) => {
                const requirement = requirementsById.get(c.requirementId);
                if (!requirement) return null;
                return (
                  <Badge key={c.id} variant="secondary" className="gap-1">
                    {requirement.label}
                    <span className="text-[10px] opacity-70">
                      {c.creditFrom === "count" ? "per lesson" : `${c.creditFrom} time`}
                    </span>
                  </Badge>
                );
              })}
            </div>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function RequirementsView({ version }: { version: CourseVersion }) {
  if (version.requirements.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No requirements"
        body="Nothing will accumulate as lessons are signed until this syllabus says what a student has to build up."
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
            {r.minDeciHours != null ? deciHoursLabel(r.minDeciHours) : `${r.minCount ?? "—"}`}
          </div>
          <Badge variant={r.source === "school" ? "outline" : "secondary"}>
            {r.source === "school" ? "School" : PART_LABEL[r.source]}
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

function StudentsView({ courseId }: { courseId: number }) {
  const enrollments = useEnrollments({ courseId });
  const rows = enrollments.data ?? [];

  if (enrollments.isLoading) return <Skeleton className="h-32 w-full" />;
  if (rows.length === 0) {
    return <EmptyState icon={GraduationCap} title="Nobody enrolled yet" body="Enroll a student to start recording their training." />;
  }

  return (
    <Card className="divide-y p-0">
      {rows.map((e) => (
        <Link
          key={e.id}
          to="/training/enrollments/$enrollmentId"
          params={{ enrollmentId: String(e.id) }}
          className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-accent/40"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{e.student?.user?.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{e.courseVersion?.label}</span>
          <Badge variant={e.status === "graduated" ? "secondary" : "outline"}>{e.status}</Badge>
          <span className="text-xs text-muted-foreground">{e._count?.lessonRecords ?? 0} lessons</span>
        </Link>
      ))}
    </Card>
  );
}

function PublishDialog({ version }: { version: CourseVersion }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const publish = usePublishCourseVersion();
  const is141 = version.course.regulatoryPart === "part141";
  const lessons = version.stages.reduce((n, s) => n + s.lessons.length, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Lock className="size-4" /> Publish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish {version.label}?</DialogTitle>
          <DialogDescription>
            {/* Said plainly, because it is the one irreversible act in this module and the
                consequence is invisible until somebody tries to fix a typo. */}
            Publishing locks this version permanently. Its {lessons} lessons, tasks and requirements can
            never be changed again — students will be enrolled against exactly these. To revise it later you
            make a new version from this one, and anyone already enrolled finishes on the old.
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
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
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewVersionDialog({ courseId, fromVersionId }: { courseId: number; fromVersionId: number }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const create = useCreateCourseVersion();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Copy className="size-4" /> New version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revise this syllabus</DialogTitle>
          <DialogDescription>
            Copies every stage, lesson, task and requirement into a new editable draft. The published version
            and everyone enrolled on it are untouched.
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button
            disabled={!label.trim() || create.isPending}
            onClick={async () => {
              await create.mutateAsync({ courseId, label: label.trim(), copyFromVersionId: fromVersionId });
              setOpen(false);
              setLabel("");
            }}
          >
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnrollDialog({ versionId, courseName }: { versionId: number; courseName: string }) {
  const [open, setOpen] = useState(false);
  const [orgUserId, setOrgUserId] = useState<string>("");
  const members = useMembers(undefined, { enabled: open });
  const enroll = useEnrollStudent();

  //Students first — they are who gets enrolled — but not students ONLY: schools put
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="size-4" /> Enroll a student
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enroll on {courseName}</DialogTitle>
          <DialogDescription>
            The student is pinned to this version of the syllabus. Revising the course later will not change
            what they are being trained against.
          </DialogDescription>
        </DialogHeader>

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

        <DialogFooter>
          <Button
            disabled={!orgUserId || enroll.isPending}
            onClick={async () => {
              await enroll.mutateAsync({ versionId, orgUserId: Number(orgUserId) });
              setOpen(false);
              setOrgUserId("");
            }}
          >
            Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        retire.mutate({ versionId: version.id, retired: !retired });
      }}
    >
      <Archive className="size-4" /> {retired ? "Un-retire" : "Retire"}
    </Button>
  );
}
