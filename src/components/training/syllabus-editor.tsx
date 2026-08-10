import { useState } from "react";
import {
  BookOpen,
  ClipboardList,
  GripVertical,
  Pencil,
  Plane,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import type { CourseRequirement, CourseStage, CourseVersion, GradeOption, SyllabusLesson } from "@/types/api";
import { gradeCodesOf } from "@/types/api";
import {
  useDeleteLesson,
  useDeleteRequirement,
  useDeleteStage,
  useSetGradingScale,
  useSetLessonTasks,
  useUpsertLesson,
  useUpsertRequirement,
  useUpsertStage,
} from "@/features/queries";
import { LESSON_KIND_LABEL, PART_LABEL, deciHours } from "@/lib/training";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/states";

/**
 * Editing a syllabus.
 *
 * Only ever mounted on a DRAFT, the parent decides, because a published version is
 * immutable and offering a disabled pencil on every row of a locked syllabus is worse than
 * offering none: it reads as broken rather than as finished.
 *
 * Everything here is a plain form in a dialog rather than inline editing. A syllabus is
 * edited rarely and read constantly, so the reading view is the one that should stay
 * uncluttered; and each save is a whole-object PUT, which an inline field would have to
 * fake anyway.
 */
export function SyllabusEditor({ version }: { version: CourseVersion }) {
  const [stageDialog, setStageDialog] = useState<{ stage?: CourseStage } | null>(null);
  const [lessonDialog, setLessonDialog] = useState<{ stageId: number; lesson?: SyllabusLesson } | null>(null);
  const [taskDialog, setTaskDialog] = useState<SyllabusLesson | null>(null);

  const deleteStage = useDeleteStage();
  const deleteLesson = useDeleteLesson();

  return (
    <div className="space-y-4" data-doc-shot="syllabus-stages-lessons">
      {version.stages.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No stages yet"
          body="A syllabus is stages of lessons. Add the first stage to start building."
          action={
            <Button onClick={() => setStageDialog({})}>
              <Plus className="size-4" /> Add stage
            </Button>
          }
        />
      ) : (
        version.stages.map((stage) => (
          <Card key={stage.id} className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <GripVertical className="size-4 text-muted-foreground" />
              <h2 className="font-medium">{stage.name}</h2>
              {stage.requiresStageCheck ? (
                <Badge variant="outline">Stage check</Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">{stage.lessons.length} lessons</span>
              <span className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setStageDialog({ stage })}>
                <Pencil className="size-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={deleteStage.isPending}
                onClick={() => {
                  if (
                    stage.lessons.length > 0 &&
                    !confirm(`Delete "${stage.name}" and its ${stage.lessons.length} lessons?`)
                  ) {
                    return;
                  }
                  deleteStage.mutate({ versionId: version.id, stageId: stage.id });
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            {stage.objective ? (
              <p className="mb-3 text-sm text-muted-foreground">{stage.objective}</p>
            ) : null}

            <div className="divide-y rounded-md border">
              {stage.lessons.map((lesson) => (
                <EditableLessonRow
                  key={lesson.id}
                  lesson={lesson}
                  requirements={version.requirements}
                  onEdit={() => setLessonDialog({ stageId: stage.id, lesson })}
                  onTasks={() => setTaskDialog(lesson)}
                  onDelete={() => deleteLesson.mutate({ versionId: version.id, lessonId: lesson.id })}
                />
              ))}
              <button
                type="button"
                onClick={() => setLessonDialog({ stageId: stage.id })}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent/40"
              >
                <Plus className="size-4" /> Add lesson
              </button>
            </div>
          </Card>
        ))
      )}

      {version.stages.length > 0 ? (
        <Button variant="outline" onClick={() => setStageDialog({})}>
          <Plus className="size-4" /> Add stage
        </Button>
      ) : null}

      <StageDialog
        versionId={version.id}
        state={stageDialog}
        nextPosition={version.stages.length + 1}
        onClose={() => setStageDialog(null)}
      />
      <LessonDialog
        version={version}
        state={lessonDialog}
        onClose={() => setLessonDialog(null)}
      />
      <TasksDialog versionId={version.id} lesson={taskDialog} onClose={() => setTaskDialog(null)} />
    </div>
  );
}

const KIND_ICON = { flight: Plane, ground: BookOpen, sim: ClipboardList } as const;

function EditableLessonRow({
  lesson,
  requirements,
  onEdit,
  onTasks,
  onDelete,
}: {
  lesson: SyllabusLesson;
  requirements: CourseRequirement[];
  onEdit: () => void;
  onTasks: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[lesson.kind] ?? BookOpen;
  const byId = new Map(requirements.map((r) => [r.id, r]));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{lesson.name}</span>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {LESSON_KIND_LABEL[lesson.kind]}
          </Badge>
          {lesson.minFlightDeciHours ? (
            <span className="hidden text-xs text-muted-foreground md:inline">
              {deciHours(lesson.minFlightDeciHours)} hr
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">{lesson.tasks.length} tasks</span>
        </CollapsibleTrigger>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <CollapsibleContent className="space-y-3 border-t bg-muted/30 px-3 py-3">
        {lesson.objectives ? <p className="text-sm">{lesson.objectives}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          {lesson.creditsWhat.map((c) => {
            const r = byId.get(c.requirementId);
            return r ? (
              <Badge key={c.id} variant="secondary" className="gap-1">
                {r.label}
                <span className="text-[10px] opacity-70">
                  {c.creditFrom === "count" ? "per lesson" : `${c.creditFrom} time`}
                </span>
              </Badge>
            ) : null;
          })}
          {lesson.creditsWhat.length === 0 ? (
            // Worth saying: a lesson crediting nothing is flyable and invisible to the ledger,
            // which is the one way to build a syllabus that silently never fills up.
            <span className="text-xs text-amber-600">
              Credits nothing, hours flown on this lesson will not count toward any requirement.
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {lesson.requiresSignoff ? <span>Requires sign-off</span> : <span>Sign-off optional</span>}
          {lesson.requiresNotes ? <span>· Notes required</span> : null}
          <span className="flex-1" />
          <Button size="sm" variant="outline" className="h-7" onClick={onTasks}>
            <Target className="size-3.5" /> {lesson.tasks.length ? "Edit tasks" : "Add tasks"}
          </Button>
        </div>
        {lesson.tasks.length ? (
          <ul className="space-y-1">
            {lesson.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <Target className="size-3 shrink-0 text-muted-foreground" />
                {t.name}
                {t.acsCode ? (
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {t.acsCode}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function StageDialog({
  versionId,
  state,
  nextPosition,
  onClose,
}: {
  versionId: number;
  state: { stage?: CourseStage } | null;
  nextPosition: number;
  onClose: () => void;
}) {
  const stage = state?.stage;
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [check, setCheck] = useState(false);
  const [seeded, setSeeded] = useState<number | null>(null);
  const save = useUpsertStage();

  //Seed from the row being edited exactly once per open, so typing isn't clobbered by a
  //refetch landing underneath the dialog.
  const key = stage?.id ?? -1;
  if (state && seeded !== key) {
    setSeeded(key);
    setName(stage?.name ?? "");
    setObjective(stage?.objective ?? "");
    setCheck(stage?.requiresStageCheck ?? false);
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && (setSeeded(null), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage ? "Edit stage" : "Add stage"}</DialogTitle>
          <DialogDescription>
            A stage is a block of lessons, presolo, cross-country, test preparation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="stage-name">Name</Label>
            <Input id="stage-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Stage 1. Presolo" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stage-obj">Objective</Label>
            <Textarea id="stage-obj" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={check} onCheckedChange={(v) => setCheck(!!v)} />
            Ends in a stage check
          </label>
        </div>

        {save.error ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}

        <DialogFooter>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={async () => {
              await save.mutateAsync({
                versionId,
                stageId: stage?.id,
                name: name.trim(),
                objective: objective.trim() || null,
                position: stage?.position ?? nextPosition,
                requiresStageCheck: check,
              });
              setSeeded(null);
              onClose();
            }}
          >
            {stage ? "Save" : "Add stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LessonDialog({
  version,
  state,
  onClose,
}: {
  version: CourseVersion;
  state: { stageId: number; lesson?: SyllabusLesson } | null;
  onClose: () => void;
}) {
  const lesson = state?.lesson;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"ground" | "flight" | "sim">("flight");
  const [objectives, setObjectives] = useState("");
  const [standards, setStandards] = useState("");
  const [flight, setFlight] = useState("");
  const [ground, setGround] = useState("");
  const [signoff, setSignoff] = useState(true);
  const [notes, setNotes] = useState(false);
  const [credits, setCredits] = useState<{ requirementId: number; creditFrom: string }[]>([]);
  const [seeded, setSeeded] = useState<number | null>(null);
  const save = useUpsertLesson();

  const key = lesson?.id ?? -1;
  if (state && seeded !== key) {
    setSeeded(key);
    setName(lesson?.name ?? "");
    setKind((lesson?.kind as "ground" | "flight" | "sim") ?? "flight");
    setObjectives(lesson?.objectives ?? "");
    setStandards(lesson?.completionStandards ?? "");
    setFlight(lesson?.minFlightDeciHours ? deciHours(lesson.minFlightDeciHours) : "");
    setGround(lesson?.minGroundDeciHours ? deciHours(lesson.minGroundDeciHours) : "");
    setSignoff(lesson?.requiresSignoff ?? true);
    setNotes(lesson?.requiresNotes ?? false);
    setCredits(
      (lesson?.creditsWhat ?? []).map((c) => ({ requirementId: c.requirementId, creditFrom: c.creditFrom }))
    );
  }

  const stage = version.stages.find((s) => s.id === state?.stageId);
  const toDeci = (v: string) => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 10);
  };

  const toggleCredit = (requirementId: number, creditFrom: string) => {
    setCredits((cur) => {
      const existing = cur.find((c) => c.requirementId === requirementId);
      if (!existing) return [...cur, { requirementId, creditFrom }];
      if (existing.creditFrom === creditFrom) return cur.filter((c) => c.requirementId !== requirementId);
      return cur.map((c) => (c.requirementId === requirementId ? { ...c, creditFrom } : c));
    });
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && (setSeeded(null), onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit lesson" : "Add lesson"}</DialogTitle>
          <DialogDescription>{stage?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lesson-name">Name</Label>
            <Input id="lesson-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Flight 3. Takeoffs and landings" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="lesson-kind">Type</Label>
              <select
                id="lesson-kind"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as "ground" | "flight" | "sim")}
              >
                <option value="flight">Flight</option>
                <option value="ground">Ground</option>
                <option value="sim">Simulator</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lesson-flight">Flight hrs</Label>
              <Input id="lesson-flight" inputMode="decimal" value={flight} onChange={(e) => setFlight(e.target.value)} placeholder="1.5" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lesson-ground">Ground hrs</Label>
              <Input id="lesson-ground" inputMode="decimal" value={ground} onChange={(e) => setGround(e.target.value)} placeholder="0.5" />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="lesson-obj">Objectives</Label>
            <Textarea id="lesson-obj" rows={2} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lesson-std">Completion standards</Label>
            <Textarea id="lesson-std" rows={2} value={standards} onChange={(e) => setStandards(e.target.value)} placeholder="What the student must demonstrate." />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={signoff} onCheckedChange={(v) => setSignoff(!!v)} />
              Requires sign-off
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={notes} onCheckedChange={(v) => setNotes(!!v)} />
              Notes required
            </label>
          </div>

          {/* The fan-out, chosen here. This is the single most consequential thing on the
              form and the least obvious, so it says what it does rather than assuming. */}
          <div className="space-y-1.5 rounded-md border p-3" data-doc-shot="syllabus-lesson-dialog-credits">
            <div className="flex items-center gap-1.5">
              <div className="text-sm font-medium">Credits toward</div>
              <DocsHint topic="credits-toward" />
            </div>
            <p className="text-xs text-muted-foreground">
              Signing this lesson posts its hours to everything ticked here, one flight can credit
              several requirements at once.
            </p>
            {version.requirements.length === 0 ? (
              <p className="text-xs text-amber-600">
                This syllabus has no requirements yet, so nothing will accumulate. Add them on the
                Requirements tab.
              </p>
            ) : (
              <div className="space-y-1.5 pt-1">
                {version.requirements.map((r) => {
                  const chosen = credits.find((c) => c.requirementId === r.id);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      {(r.minCount != null
                        ? ([["count", "per lesson"]] as const)
                        : ([
                            ["flight", "flight time"],
                            ["instruction", "ground time"],
                          ] as const)
                      ).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={chosen?.creditFrom === value ? "default" : "outline"}
                          className="h-7 text-xs"
                          onClick={() => toggleCredit(r.id, value)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {save.error ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}

        <DialogFooter>
          <Button
            disabled={!name.trim() || save.isPending || !state}
            onClick={async () => {
              await save.mutateAsync({
                versionId: version.id,
                lessonId: lesson?.id,
                stageId: state!.stageId,
                name: name.trim(),
                position: lesson?.position ?? (stage?.lessons.length ?? 0) + 1,
                kind,
                objectives: objectives.trim() || null,
                completionStandards: standards.trim() || null,
                minFlightDeciHours: toDeci(flight),
                minGroundDeciHours: toDeci(ground),
                requiresSignoff: signoff,
                requiresNotes: notes,
                credits,
              });
              setSeeded(null);
              onClose();
            }}
          >
            {lesson ? "Save lesson" : "Add lesson"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TasksDialog({
  versionId,
  lesson,
  onClose,
}: {
  versionId: number;
  lesson: SyllabusLesson | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ name: string; acsCode: string; standard: string }[]>([]);
  const [seeded, setSeeded] = useState<number | null>(null);
  const save = useSetLessonTasks();

  if (lesson && seeded !== lesson.id) {
    setSeeded(lesson.id);
    setRows(
      lesson.tasks.length
        ? lesson.tasks.map((t) => ({ name: t.name, acsCode: t.acsCode ?? "", standard: t.standard ?? "" }))
        : [{ name: "", acsCode: "", standard: "" }]
    );
  }

  return (
    <Dialog open={!!lesson} onOpenChange={(o) => !o && (setSeeded(null), onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tasks, {lesson?.name}</DialogTitle>
          <DialogDescription>
            What gets graded individually. An ACS code ties the task to the practical test, which is
            what makes "which ACS areas is this student weak in?" answerable later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="Power-off stalls"
                value={row.name}
                onChange={(e) =>
                  setRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
              />
              <Input
                className="w-32 font-mono text-xs"
                placeholder="PA.VII.B"
                value={row.acsCode}
                onChange={(e) =>
                  setRows((r) => r.map((x, j) => (j === i ? { ...x, acsCode: e.target.value } : x)))
                }
              />
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRows((r) => [...r, { name: "", acsCode: "", standard: "" }])}
          >
            <Plus className="size-4" /> Add task
          </Button>
        </div>

        {save.error ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}

        <DialogFooter>
          <Button
            disabled={save.isPending || !lesson}
            onClick={async () => {
              await save.mutateAsync({
                versionId,
                lessonId: lesson!.id,
                //Blank rows are the natural result of adding one row too many; dropping them
                //quietly is kinder than refusing the save over an empty box.
                tasks: rows
                  .filter((r) => r.name.trim())
                  .map((r, i) => ({
                    name: r.name.trim(),
                    position: i + 1,
                    acsCode: r.acsCode.trim() || null,
                    standard: r.standard.trim() || null,
                  })),
              });
              setSeeded(null);
              onClose();
            }}
          >
            Save tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Requirements and the grading scale, the two things that are per-version, not per-lesson. */
export function RequirementsEditor({ version }: { version: CourseVersion }) {
  const [dialog, setDialog] = useState<{ requirement?: CourseRequirement } | null>(null);
  const remove = useDeleteRequirement();

  return (
    <div className="space-y-4">
      <GradingScaleCard version={version} />

      <Card className="p-0" data-doc-shot="syllabus-requirements-tab">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <div>
            <h2 className="text-sm font-medium">Requirements</h2>
            <p className="text-xs text-muted-foreground">
              What a student has to accumulate. Lessons credit these as they're signed.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialog({})}>
            <Plus className="size-4" /> Add
          </Button>
        </div>

        {version.requirements.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No requirements, nothing will accumulate as lessons are signed.
          </div>
        ) : (
          <div className="divide-y">
            {version.requirements.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.code}</div>
                </div>
                <div className="text-sm tabular-nums">
                  {r.minDeciHours != null ? `${deciHours(r.minDeciHours)} hrs` : `${r.minCount ?? "–"}`}
                </div>
                <Badge variant={r.source === "school" ? "outline" : "secondary"}>
                  {r.source === "school" ? "School" : PART_LABEL[r.source as "part61" | "part141"]}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setDialog({ requirement: r })}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remove.mutate({ versionId: version.id, requirementId: r.id })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <RequirementDialog versionId={version.id} state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function GradingScaleCard({ version }: { version: CourseVersion }) {
  //`gradeOptions` is the shape this card edits, so it reads that rather than guessing the
  //pass column back out of the codes. The old guess was `code === "S"`, which quietly
  //un-ticked every pass on a school marking 1 to 4 the moment they re-opened the card.
  const initial: GradeOption[] =
    version.gradeOptions && version.gradeOptions.length
      ? version.gradeOptions.map((g) => ({ code: g.code, passing: !!g.passing }))
      : gradeCodesOf(version).map((code) => ({ code, passing: code.toUpperCase() === "S" }));
  const [rows, setRows] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const save = useSetGradingScale();

  return (
    <Card className="p-3" data-doc-shot="syllabus-grading-scale">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-sm font-medium">Grading scale</span>
        <DocsHint topic="grading-scale" />
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        {/* The pass column is the point. "3" passes at a school marking 1–4 and fails at one
            marking 1–3, and getting it wrong marches students through lessons they failed. */}
        Which marks this course uses, and which of them mean the lesson is complete.
      </p>
      <div className="space-y-1.5">
        {rows.map((g, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="w-28"
              value={g.code}
              onChange={(e) => {
                setDirty(true);
                setRows((r) => r.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)));
              }}
            />
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={g.passing}
                onCheckedChange={(v) => {
                  setDirty(true);
                  setRows((r) => r.map((x, j) => (j === i ? { ...x, passing: !!v } : x)));
                }}
              />
              Completes the lesson
            </label>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setDirty(true);
                setRows((r) => r.filter((_, j) => j !== i));
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDirty(true);
            setRows((r) => [...r, { code: "", passing: false }]);
          }}
        >
          <Plus className="size-4" /> Add grade
        </Button>
        {dirty ? (
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={async () => {
              await save.mutateAsync({
                versionId: version.id,
                scale: rows.filter((g) => g.code.trim()).map((g) => ({ code: g.code.trim(), passing: g.passing })),
              });
              setDirty(false);
            }}
          >
            Save scale
          </Button>
        ) : null}
      </div>
      {save.error ? <p className="mt-2 text-sm text-destructive">{(save.error as Error).message}</p> : null}
    </Card>
  );
}

function RequirementDialog({
  versionId,
  state,
  onClose,
}: {
  versionId: number;
  state: { requirement?: CourseRequirement } | null;
  onClose: () => void;
}) {
  const req = state?.requirement;
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [measure, setMeasure] = useState<"hours" | "count">("hours");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("part61");
  const [simCap, setSimCap] = useState("");
  const [transferCap, setTransferCap] = useState("");
  const [recency, setRecency] = useState("");
  const [seeded, setSeeded] = useState<number | null>(null);
  const save = useUpsertRequirement();

  const key = req?.id ?? -1;
  if (state && seeded !== key) {
    setSeeded(key);
    setCode(req?.code ?? "");
    setLabel(req?.label ?? "");
    setMeasure(req?.minCount != null ? "count" : "hours");
    setAmount(
      req?.minCount != null ? String(req.minCount) : req?.minDeciHours ? deciHours(req.minDeciHours) : ""
    );
    setSource(req?.source ?? "part61");
    setSimCap(req?.maxSimulatorBps != null ? String(req.maxSimulatorBps / 100) : "");
    setTransferCap(req?.maxTransferBps != null ? String(req.maxTransferBps / 100) : "");
    setRecency(req?.recencyCalendarMonths != null ? String(req.recencyCalendarMonths) : "");
  }

  const pct = (v: string) => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 100);
  };

  /** Whole months, or null for a requirement with no window. */
  const whole = (v: string) => {
    const n = Number(v);
    return v.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);
  };

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && (setSeeded(null), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{req ? "Edit requirement" : "Add requirement"}</DialogTitle>
          <DialogDescription>
            Something the student has to build up: 40 hours total, 3 hours night, 10 towered landings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="req-code">Code</Label>
              <Input id="req-code" className="font-mono" value={code} onChange={(e) => setCode(e.target.value)} placeholder="night" />
              <p className="text-[11px] text-muted-foreground">
                Stable key, so reports can line this up across courses.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="req-source">Comes from</Label>
                <DocsHint topic="requirement-source" />
              </div>
              <select
                id="req-source"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="part61">Part 61</option>
                <option value="part141">Part 141</option>
                <option value="school">Our own</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                Only an FAA one can block a Part 141 graduation.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="req-label">Label</Label>
            <Input id="req-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Night flight training" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="req-measure">Measured in</Label>
              <select
                id="req-measure"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={measure}
                onChange={(e) => setMeasure(e.target.value as "hours" | "count")}
              >
                <option value="hours">Hours</option>
                <option value="count">Events</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-amount">{measure === "hours" ? "Hours needed" : "How many"}</Label>
              <Input id="req-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          {measure === "hours" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="req-sim">Simulator limit %</Label>
                <Input id="req-sim" inputMode="decimal" value={simCap} onChange={(e) => setSimCap(e.target.value)} placeholder="20" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="req-transfer">Transfer limit %</Label>
                <Input id="req-transfer" inputMode="decimal" value={transferCap} onChange={(e) => setTransferCap(e.target.value)} placeholder="25" />
              </div>
            </div>
          ) : null}

          {/* Outside the hours-only block above: a recency window applies just as much to
              a count. §61.109(a)(4) is hours, but "three landings in the last 90 days" is
              the same idea measured the other way. */}
          <div className="space-y-1">
            <Label htmlFor="req-recency">Only count training from the last … months</Label>
            <Input
              id="req-recency"
              inputMode="numeric"
              value={recency}
              onChange={(e) => setRecency(e.target.value)}
              placeholder="Leave blank, most requirements never go stale"
            />
            <p className="text-xs text-muted-foreground">
              Calendar months, not days: §61.109(a)(4) wants the three hours of test
              preparation within 2 calendar months of the test, so on 5 August that window
              opens on 1 June. Older training stays on the record and stops counting toward
              this row.
            </p>
          </div>
        </div>

        {save.error ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}

        <DialogFooter>
          <Button
            disabled={!code.trim() || !label.trim() || save.isPending}
            onClick={async () => {
              const n = Number(amount);
              await save.mutateAsync({
                versionId,
                requirementId: req?.id,
                code: code.trim(),
                label: label.trim(),
                minDeciHours: measure === "hours" && amount.trim() ? Math.round(n * 10) : null,
                minCount: measure === "count" && amount.trim() ? Math.round(n) : null,
                source,
                maxSimulatorBps: measure === "hours" ? pct(simCap) : null,
                maxTransferBps: measure === "hours" ? pct(transferCap) : null,
                //Sent unconditionally. The server writes this field whether or not it
                //arrives, so leaving it out of the body does not mean "leave it alone".
                //it means "clear it". Editing a requirement's label used to silently
                //delete its recency window, and nothing said the value had ever existed.
                recencyCalendarMonths: whole(recency),
              });
              setSeeded(null);
              onClose();
            }}
          >
            {req ? "Save" : "Add requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
