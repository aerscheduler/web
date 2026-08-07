import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, BookOpen, GraduationCap, Lock, PlusCircle, ShieldCheck, Sparkles } from "lucide-react";
import {
  useCourses,
  useCurriculumTemplates,
  useCreateCourseFromTemplate,
  useCreateCourse,
  useEnrollments,
} from "@/features/queries";
import { guardRoute, isAdmin } from "@/lib/permissions";
import { rolesFromSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PART_LABEL, STATUS_LABEL } from "@/lib/training";
import type { Course, CourseVersionSummary } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { DocsHint, DocsLink } from "@/components/docs-hint";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { TrainingPermissions } from "@/components/training/training-permissions";
import { StatCard } from "@/components/stat-card";
import { EmptyState, ErrorState, CardGridSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authed/training")({
  beforeLoad: guardRoute("/training"),
  validateSearch: (s: Record<string, unknown>): { tab?: string } => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: TrainingPage,
});

/**
 * Which version a course card should talk about.
 *
 * The published one, if there is a live one — that is what students are actually being
 * trained against. Otherwise the newest draft, because a course with only a draft is a
 * course somebody is still writing and the draft is the thing they want to open.
 */
function headlineVersion(course: Course): CourseVersionSummary | undefined {
  return (
    course.versions.find((v) => v.publishedAt && !v.retiredAt) ??
    course.versions.find((v) => !v.publishedAt) ??
    course.versions[0]
  );
}

function VersionBadge({ version }: { version?: CourseVersionSummary }) {
  if (!version) return null;
  if (version.retiredAt) return <Badge variant="outline">{version.label} · retired</Badge>;
  if (version.publishedAt) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="size-3" /> {version.label} · published
      </Badge>
    );
  }
  return <Badge variant="outline">{version.label} · draft</Badge>;
}

/**
 * Training is three separate jobs sharing a page: writing the syllabus, running the
 * students on it, and deciding who is allowed to do either. They are a rail rather than
 * one long scroll because they belong to different people — a chief instructor lives in
 * Courses, the front desk in Students, and an owner visits Permissions twice a year.
 *
 * Which sections exist is a permission answer, not a layout one: `configureTraining`
 * grants Courses and admin grants Permissions, so a front-desk account simply gets a
 * one-item rail rather than tabs that 403.
 */
type TrainingTab = "courses" | "students" | "permissions";

function TrainingPage() {
  const roles = rolesFromSession();
  const navigate = Route.useNavigate();
  const { tab } = Route.useSearch();
  //Archived courses are off the page by default, which is what archiving is for. The
  //toggle is how you get back to one you archived: without it, archiving would be a
  //one-way door and a school would rather leave a dead course in the list than risk it.
  const [showArchived, setShowArchived] = useState(false);
  const courses = useCourses({ includeArchived: showArchived });
  const enrollments = useEnrollments({ status: "enrolled" });

  const rows = courses.data ?? [];
  //The tiles count what the school is actually teaching, whether or not the archived ones
  //are on screen.
  const teaching = rows.filter((c) => !c.archivedAt);
  const active = enrollments.data ?? [];

  //The course LIBRARY needs `configureTraining`; the roster below needs nothing beyond
  //membership. Somebody holding only `manageEnrollment` — the front desk who enrolls and
  //graduates people — is entitled to one and not the other, so a 403 on courses hides
  //that section instead of replacing the whole page with an error card. Any other failure
  //is a real failure and still says so.
  const forbiddenCourses = (courses.error as ApiError | null)?.status === 403;

  const sections = useMemo<RailSection[]>(
    () => [
      {
        items: [
          ...(forbiddenCourses
            ? []
            : [{ value: "courses", label: "Courses", icon: BookOpen }]),
          { value: "students", label: "Students", icon: GraduationCap },
          // GET /training/grants is isOrgAdmin. Handing out power stays an admin's job,
          // so somebody here on a grant sees the roster and not the grant table.
          ...(isAdmin(roles) ? [{ value: "permissions", label: "Permissions", icon: ShieldCheck }] : []),
        ],
      },
    ],
    [forbiddenCourses, roles]
  );

  const available = sections[0]!.items.map((i) => i.value);
  const activeTab = (available.includes(tab ?? "") ? tab : available[0]) as TrainingTab;

  const pick = (next: string) => {
    void navigate({ search: (prev) => ({ ...prev, tab: next }), replace: true });
  };

  if (courses.error && !forbiddenCourses) return <ErrorState error={courses.error} />;

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <PageHeader
          title="Training"
          subtitle="Courses, syllabi and student progress. Hours credit themselves as lessons are signed."
          actions={
            activeTab === "courses" ? <NewCourseActions hasCourses={rows.length > 0} /> : null
          }
        />
      </TableView.Header>

      <div className={RAIL_ROW}>
        <SectionRail label="Training" sections={sections} value={activeTab} onChange={pick} />

        <div
          className="min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto"
          data-doc-shot={activeTab === "courses" ? "training-courses-list" : undefined}
        >
          {activeTab === "courses" && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Courses" value={teaching.length} icon={BookOpen} />
                <StatCard
                  label="Published syllabi"
                  value={
                    teaching.filter((c) => c.versions.some((v) => v.publishedAt && !v.retiredAt)).length
                  }
                  icon={Lock}
                />
                <StatCard label="Students in training" value={active.length} icon={GraduationCap} />
                <StatCard
                  label="Part 141 courses"
                  value={teaching.filter((c) => c.regulatoryPart === "part141").length}
                  icon={Sparkles}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowArchived((v) => !v)}
                  className="text-muted-foreground"
                >
                  <Archive className="size-4" />
                  {showArchived ? "Hide archived courses" : "Show archived courses"}
                </Button>
              </div>

              {courses.isLoading ? (
                <CardGridSkeleton />
              ) : rows.length === 0 ? (
                <EmptyCourses />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {rows.map((course) => {
                    const version = headlineVersion(course);
                    const enrolled = active.filter(
                      (e) => e.courseVersion?.course.id === course.id
                    ).length;
                    return (
                      <Card key={course.id} className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              to="/training/$courseId"
                              params={{ courseId: String(course.id) }}
                              className="font-medium hover:underline"
                            >
                              {course.name}
                            </Link>
                            {course.description ? (
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {course.description}
                              </p>
                            ) : null}
                          </div>
                          <Badge variant={course.regulatoryPart === "part141" ? "default" : "outline"}>
                            {PART_LABEL[course.regulatoryPart]}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {course.archivedAt ? (
                            <Badge variant="outline" className="gap-1">
                              <Archive className="size-3" /> Archived
                            </Badge>
                          ) : null}
                          <VersionBadge version={version} />
                          {enrolled > 0 ? (
                            <Badge variant="outline" className="gap-1">
                              <GraduationCap className="size-3" /> {enrolled} in training
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-auto flex gap-2 pt-1">
                          <Button asChild size="sm" variant="outline" className="flex-1">
                            <Link to="/training/$courseId" params={{ courseId: String(course.id) }}>
                              Open syllabus
                            </Link>
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "students" && <ActiveStudents loading={enrollments.isLoading} />}
          {activeTab === "permissions" && <TrainingPermissions />}
        </div>
      </div>
    </TableView>
  );
}

/**
 * The empty state IS the onboarding for this module.
 *
 * A syllabus builder as the first screen is thirty lessons of typing before the software
 * does anything, which is how "we'll set up training later" becomes the outcome. So the
 * primary action here is forking a working Private Pilot course, and writing one from
 * scratch is the quieter option beside it.
 */
function EmptyCourses() {
  return (
    <EmptyState
      icon={BookOpen}
      title="No courses yet"
      body="Start from a ready-made Private Pilot syllabus — stages, lessons, ACS tasks and the §61.109 hour requirements, already wired up — then change whatever your school does differently."
      action={
        <div className="flex flex-col items-center gap-3">
          <NewCourseActions hasCourses={false} />
          <DocsLink topic="what-a-course-is" />
        </div>
      }
    />
  );
}

function NewCourseActions({ hasCourses }: { hasCourses: boolean }) {
  return (
    <div className="flex gap-2">
      <TemplateDialog primary={!hasCourses} />
      <BlankCourseDialog />
    </div>
  );
}

function TemplateDialog({ primary }: { primary: boolean }) {
  const [open, setOpen] = useState(false);
  const templates = useCurriculumTemplates({ enabled: open });
  const create = useCreateCourseFromTemplate();
  const navigate = Route.useNavigate();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={primary ? "default" : "outline"}>
          <Sparkles className="size-4" /> Start from a template
        </Button>
      </DialogTrigger>
      <DialogContent data-doc-shot="training-template-picker">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            A complete syllabus you can edit. It arrives as a draft — nothing is published until you say so.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {templates.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {(templates.data ?? []).map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={create.isPending}
              onClick={async () => {
                const made = await create.mutateAsync({ key: t.key });
                setOpen(false);
                void navigate({ to: "/training/$courseId", params: { courseId: String(made.id) } });
              }}
              className="w-full rounded-md border p-3 text-left transition hover:bg-accent disabled:opacity-60"
            >
              <div className="font-medium">{t.name}</div>
              <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                <span>{t.stages} stages</span>·<span>{t.lessons} lessons</span>·
                <span>{t.requirements} requirements</span>
              </div>
            </button>
          ))}
        </div>

        {create.error ? (
          <p className="text-sm text-destructive">{(create.error as Error).message}</p>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Templates are Part 61. An approved Part 141 course has to be approved for your school by your
          FSDO — build it from this one and file it.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function BlankCourseDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [part, setPart] = useState<"part61" | "part141">("part61");
  const create = useCreateCourse();
  const navigate = Route.useNavigate();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusCircle className="size-4" /> New course
        </Button>
      </DialogTrigger>
      <DialogContent data-doc-shot="training-new-course-dialog">
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
          <DialogDescription>An empty syllabus you build yourself.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="course-name">Name</Label>
            <Input
              id="course-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Instrument Rating"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label>Trained under</Label>
              <DocsHint topic="course-regulatory-part" />
            </div>
            <div className="flex gap-2">
              {(["part61", "part141"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={part === p ? "default" : "outline"}
                  onClick={() => setPart(p)}
                >
                  {PART_LABEL[p]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {/* Only ONE of the three things this used to promise is actually enforced.
                  `blockGraduationOnMinimums` is real — `graduate` refuses on
                  `graduationBlocker`. `enforceLessonOrder` and `enforceStageChecks` are
                  declared in the enforcement profile and read by nothing, and stage-check
                  records do not exist to enforce against. Say the one that is true. */}
              {part === "part141"
                ? "A student cannot graduate until every requirement of the approved course is met, and a published syllabus can never be edited. This cannot be changed later."
                : "A real syllabus and a real record, with nothing in the way. This cannot be changed later."}
            </p>
          </div>
        </div>

        {create.error ? <p className="text-sm text-destructive">{(create.error as Error).message}</p> : null}

        <DialogFooter>
          <Button
            disabled={!name.trim() || create.isPending}
            onClick={async () => {
              const made = await create.mutateAsync({ name: name.trim(), regulatoryPart: part });
              setOpen(false);
              setName("");
              void navigate({ to: "/training/$courseId", params: { courseId: String(made.id) } });
            }}
          >
            Create course
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Everyone currently in training, so the page answers "who is where" without a click. */
function ActiveStudents({ loading }: { loading: boolean }) {
  const enrollments = useEnrollments({ status: "enrolled" });
  const rows = enrollments.data ?? [];
  if (loading || enrollments.isLoading) return <CardGridSkeleton count={1} />;

  // Its own section now, so "nobody is on a course" has to be stated rather than
  // rendering nothing — an empty pane reads as a page that failed to load.
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Nobody is in training"
        body="Enroll a student on a course from their syllabus and their progress appears here."
        action={<DocsLink topic="enrolling-a-student" />}
      />
    );
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="size-4 text-muted-foreground" />
        <h2 className="font-medium">Students in training</h2>
      </div>
      <div className="divide-y">
        {rows.map((e) => (
          <Link
            key={e.id}
            to="/training/enrollments/$enrollmentId"
            params={{ enrollmentId: String(e.id) }}
            className="flex items-center justify-between gap-3 py-2 text-sm transition hover:bg-accent/40"
          >
            <span className="min-w-0 truncate font-medium">{e.student?.user?.name ?? "Unknown"}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {e.courseVersion?.course.name}
              <span className="ml-2 text-xs">{e.courseVersion?.label}</span>
            </span>
            <Badge variant="outline">{STATUS_LABEL[e.status]}</Badge>
            <span className="text-xs text-muted-foreground">{e._count?.lessonRecords ?? 0} lessons</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
