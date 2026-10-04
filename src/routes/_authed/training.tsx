import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, BookOpen, GraduationCap, Lock, PlusCircle, Sparkles } from "lucide-react";
import {
  useCourses,
  useCurriculumTemplates,
  useCreateCourseFromTemplate,
  useCreateCourse,
  useEnrollments,
} from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { rolesFromSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { PART_LABEL } from "@/lib/training";
import { TRAINING_TABS } from "@/lib/training-sections";
import type { Course, CourseVersionSummary, EnrollmentSummary } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { DocsHint } from "@/components/docs-hint";
import { TableView } from "@/components/table-view";
import { RAIL_ROW, SectionRail, type RailSection } from "@/components/section-rail";
import { TrainingPermissions } from "@/components/training/training-permissions";
import { StatCard, StatGrid } from "@/components/stat-card";
import { EmptyState, ErrorState, CardGridSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableSort } from "@/components/list-table";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { EnrollmentProgress, lessonsFraction } from "@/components/training/enrollment-progress";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
 * The published one, if there is a live one, that is what students are actually being
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
 * one long scroll because they belong to different people, a chief instructor lives in
 * Courses, the front desk in Students, and an owner visits Permissions twice a year.
 *
 * Which sections exist is a permission answer, not a layout one: `configureTraining`
 * grants Courses and admin grants Permissions, so a front-desk account simply gets a
 * one-item rail rather than tabs that 403.
 */
type TrainingTab = (typeof TRAINING_TABS)[number]["value"];

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
  //membership. Somebody holding only `manageEnrollment` (the front desk who enrolls and
  //graduates people) is entitled to one and not the other, so a 403 on courses hides
  //that section instead of replacing the whole page with an error card. Any other failure
  //is a real failure and still says so.
  const forbiddenCourses = (courses.error as ApiError | null)?.status === 403;

  // The tab list lives in `lib/training-sections.ts` so the command palette offers the
  // same destinations. Courses also drop out at runtime on a 403 (no configureTraining).
  const sections = useMemo<RailSection[]>(
    () => [
      {
        items: TRAINING_TABS.filter((t) => {
          if (t.value === "courses" && forbiddenCourses) return false;
          return !t.canShow || t.canShow(roles);
        }),
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
          className={cn(
            "min-h-0 min-w-0 flex-1",
            // The roster is a list that fills the pane and scrolls inside; the others scroll whole.
            activeTab === "students" ? "flex flex-col pb-4" : "space-y-5 overflow-y-auto"
          )}
          data-doc-shot={activeTab === "courses" ? "training-courses-list" : undefined}
        >
          {activeTab === "courses" && (
            <>
              <StatGrid>
                <StatCard label="Courses" value={teaching.length} icon={BookOpen} />
                <StatCard
                  label="Published syllabi"
                  value={
                    teaching.filter((c) => c.versions.some((v) => v.publishedAt && !v.retiredAt)).length
                  }
                  icon={Lock}
                />
                <StatCard
                  label="Students in training"
                  value={enrollments.isError ? "-" : active.length}
                  icon={GraduationCap}
                />
                <StatCard
                  label="Part 141 courses"
                  value={teaching.filter((c) => c.regulatoryPart === "part141").length}
                  icon={Sparkles}
                />
              </StatGrid>

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
      graphic="courses"
      title="No courses yet"
      body="Start from a ready-made Private Pilot syllabus: stages, lessons, ACS tasks and the §61.109 hour requirements, already wired up. Change whatever your organization does differently."
      docs="what-a-course-is"
      action={<NewCourseActions hasCourses={false} />}
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
    <>
      <Button onClick={() => setOpen(true)} variant={primary ? "default" : "outline"}>
          <Sparkles className="size-4" /> Start from a template
        </Button>
      <ResponsiveModal
      open={open} onOpenChange={setOpen}
      title="Start from a template"
      description="A complete syllabus you can edit. It arrives as a draft, nothing is published until you say so."
      dataDocShot="training-template-picker"
    >

        

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
          Templates are Part 61. An approved Part 141 course has to be approved for your organization by your
          FSDO, build it from this one and file it.
        </p>
    </ResponsiveModal>
    </>
  );
}

function BlankCourseDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [part, setPart] = useState<"part61" | "part141">("part61");
  const create = useCreateCourse();
  const navigate = Route.useNavigate();

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
          <PlusCircle className="size-4" /> New course
        </Button>
      <ResponsiveModal
      open={open} onOpenChange={setOpen}
      title="New course"
      description="An empty syllabus you build yourself."
      footer={<><Button
            disabled={!name.trim() || create.isPending}
            onClick={async () => {
              const made = await create.mutateAsync({ name: name.trim(), regulatoryPart: part });
              setOpen(false);
              setName("");
              void navigate({ to: "/training/$courseId", params: { courseId: String(made.id) } });
            }}
          >
            Create course
          </Button></>}
      dataDocShot="training-new-course-dialog"
    >

        

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
                  `blockGraduationOnMinimums` is real, `graduate` refuses on
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
    </ResponsiveModal>
    </>
  );
}

const STUDENT_COLUMNS: ListTableColumn[] = [
  { id: "progress", header: "Progress", width: "10rem", sortable: true, narrow: "keep" },
  { id: "enrolled", header: "Enrolled", width: "7.5rem", sortable: true },
  { id: "fee", header: "Fee", width: "5.5rem", align: "end" },
];


const STUDENT_SORT: Record<string, (e: EnrollmentSummary) => string | number> = {
  title: (e) => (e.student?.user?.name ?? "").toLowerCase(),
  progress: lessonsFraction,
  enrolled: (e) => e.enrolledAt,
};

/**
 * Everyone currently in training, grouped by the course they are on, so the page answers
 * "who is where" without a click. A row opens the student's training record.
 */
function ActiveStudents({ loading }: { loading: boolean }) {
  const enrollments = useEnrollments({ status: "enrolled" });
  const navigate = useNavigate();
  const [sort, setSort] = useState<ListTableSort | null>(null);
  const rows = useMemo(() => enrollments.data ?? [], [enrollments.data]);

  const groups = useMemo<ListTableGroup[]>(() => {
    const byCourse = new Map<number, { name: string; part?: string; items: EnrollmentSummary[] }>();
    for (const e of rows) {
      const course = e.courseVersion?.course;
      const id = course?.id ?? 0;
      const g = byCourse.get(id) ?? { name: course?.name ?? "Unknown course", part: course ? PART_LABEL[course.regulatoryPart] : undefined, items: [] };
      g.items.push(e);
      byCourse.set(id, g);
    }
    const key = sort ? STUDENT_SORT[sort.id] : null;
    const order = (list: EnrollmentSummary[]) =>
      [...list].sort((a, b) => {
        // Unsorted, the list reads by name.
        if (!sort || !key) return STUDENT_SORT.title!(a).toString().localeCompare(STUDENT_SORT.title!(b).toString());
        const x = key(a);
        const y = key(b);
        const c = x < y ? -1 : x > y ? 1 : a.id - b.id;
        return sort.desc ? -c : c;
      });
    return [...byCourse.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([id, g]) => ({
        id: `course-${id}`,
        label: (
          <span className="inline-flex items-center gap-2">
            {g.name}
            {g.part && <ListTag>{g.part}</ListTag>}
          </span>
        ),
        count: g.items.length,
        rows: order(g.items).map((e) => {
          const name = e.student?.user?.name ?? "Unknown";
          return {
            id: `enrollment-${e.id}`,
            testId: `enrollment-row-${e.id}`,
            label: `${name}, ${g.name}`,
            leading: e.student ? <WorkspaceUserAvatar person={{ id: e.student.id, name }} /> : undefined,
            title: name,
            tags: e.courseVersion?.label ? <ListTag>{e.courseVersion.label}</ListTag> : undefined,
            onOpen: () =>
              void navigate({ to: "/training/enrollments/$enrollmentId", params: { enrollmentId: String(e.id) } }),
            cells: {
              progress: <EnrollmentProgress enrollment={e} />,
              enrolled: <span className="text-muted-foreground">{formatDate(e.enrolledAt, "MMM d, yyyy", "")}</span>,
              // Billed or not, nothing more: "invoiced" also covers a ledger charge, and the
              // server does not say whether a bill was paid or voided, so "Invoiced" or "Paid"
              // would claim more than is known. The fee card on the record has the detail.
              fee:
                e.feeStatus === "owed" ? (
                  <span className="font-medium text-warning">Not billed</span>
                ) : e.feeStatus === "invoiced" ? (
                  <span className="text-muted-foreground">Billed</span>
                ) : null,
            },
          };
        }),
      }));
  }, [rows, sort, navigate]);

  if (loading || enrollments.isLoading) {
    return <ListTableSkeleton fill columns={STUDENT_COLUMNS} groups={2} rows={3} toolbar={false} className="min-h-0 flex-1" />;
  }
  if (enrollments.isError) return <ErrorState error={enrollments.error} />;

  // Its own section now, so "nobody is on a course" has to be stated rather than
  // rendering nothing, an empty pane reads as a page that failed to load.
  if (rows.length === 0) {
    return (
      <EmptyState
        graphic="in-training"
        title="Nobody is in training"
        body="Enroll a student on a course from their syllabus and their progress appears here."
        docs="enrolling-a-student"
      />
    );
  }

  return (
    <ListTable
      fill
      label="Students in training"
      docShot="training-students"
      className="min-h-0 flex-1"
      columns={STUDENT_COLUMNS}
      groups={groups}
      titleHeader="Student"
      titleSortable
      showHeader
      sort={sort}
      onSortChange={setSort}
    />
  );
}
