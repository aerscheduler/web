/**
 * Set up a training course, in two answers: what do you train for, and publish it.
 *
 * The checklist item used to link to /training, an empty page with two buttons, and the
 * only training-setup signup we had (2026-10-19) left from there. A school picking the
 * training setup wants a syllabus it can enroll a student on, so this copies one of the
 * FAA-checked templates and offers to publish it in the same breath.
 *
 * Publishing stays a deliberate step on its own screen, as it is everywhere else: a
 * published version is fixed, because students are enrolled against exactly those
 * lessons. "Review it first" is always offered beside it.
 */

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCourses, useCreateCourseFromTemplate, useCurriculumTemplates, usePublishCourseVersion } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FlowChoice, FlowClose, FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";

/** The template a school most often starts with, chosen up front. */
const DEFAULT_TEMPLATE = "ppl-asel-part61";

export function TrainingFlow({ onClose }: FlowProps) {
  const templates = useCurriculumTemplates();
  const courses = useCourses();
  const create = useCreateCourseFromTemplate();
  const publish = usePublishCourseVersion();

  // A draft left from an earlier visit is picked up rather than copied again.
  const existingDraft = React.useMemo(() => {
    for (const c of courses.data ?? []) {
      if (c.archivedAt || c.versions.some((v) => v.publishedAt)) continue;
      const draft = c.versions.find((v) => !v.publishedAt && !v.retiredAt);
      if (draft) return { courseId: c.id, versionId: draft.id, name: c.name };
    }
    return null;
  }, [courses.data]);

  const [pick, setPick] = React.useState<string | null>(null);
  const [made, setMade] = React.useState<{ courseId: number; versionId: number; name: string; lessons?: number } | null>(null);
  const [published, setPublished] = React.useState(false);

  const list = templates.data ?? [];
  const chosen = pick ?? (list.some((t) => t.key === DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : list[0]?.key ?? null);
  const draft = made ?? existingDraft;
  const step = published ? 2 : draft ? 1 : 0;

  async function copy() {
    if (!chosen) return;
    const template = list.find((t) => t.key === chosen);
    try {
      const r = await create.mutateAsync({ key: chosen });
      setMade({ courseId: r.id, versionId: r.versionId, name: template?.name ?? "Your course", lessons: r.lessons });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't copy that syllabus");
    }
  }

  async function doPublish() {
    if (!draft) return;
    try {
      await publish.mutateAsync({ versionId: draft.versionId });
      setPublished(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't publish the syllabus");
    }
  }

  const footer =
    step === 2 ? (
      <FlowClose onClose={onClose} />
    ) : step === 1 ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="ghost">
          <Link to="/training/$courseId" params={{ courseId: String(draft!.courseId) }} onClick={onClose}>
            Review it first
          </Link>
        </Button>
        <Button onClick={doPublish} disabled={publish.isPending}>
          Publish
        </Button>
      </div>
    ) : (
      <FlowNav onNext={copy} nextLabel="Copy this syllabus" nextDisabled={!chosen} busy={create.isPending} onSkip={onClose} skipLabel="Cancel" />
    );

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Set up a training course"
      description="Start from a syllabus checked against the regulations, then make it yours."
      step={step}
      stepCount={3}
      footer={footer}
    >
      {step === 0 &&
        (templates.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium">What do you train pilots for?</p>
            <FlowChoice
              options={list.map((t) => ({
                value: t.key,
                label: t.name,
                hint: `${t.stages} stages, ${t.lessons} lessons, ${t.requirements} hour requirements`,
              }))}
              value={chosen}
              onChange={setPick}
            />
            <p className="text-xs text-muted-foreground">
              Each one is a Part 61 syllabus with the hour requirements of the regulation it names. You can rename lessons,
              change hours and add your own before you publish.
            </p>
          </div>
        ))}

      {step === 1 && draft && (
        <div className="space-y-3 text-sm">
          <p>
            <span className="font-medium">{draft.name}</span> is ready as a draft
            {made?.lessons ? `, ${made.lessons} lessons` : ""}.
          </p>
          <p className="text-muted-foreground">
            Publish it to enroll students. A published syllabus is fixed, because students are enrolled against exactly those
            lessons; to change it later you revise it into a new version. Review it first if you want to change anything.
          </p>
        </div>
      )}

      {step === 2 && draft && (
        <FlowDone headline={`${draft.name} is published.`} body="Next, enroll a student on it. Their record starts with the first lesson you grade." />
      )}
    </FlowModal>
  );
}
